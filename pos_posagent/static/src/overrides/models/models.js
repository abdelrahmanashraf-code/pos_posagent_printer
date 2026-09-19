/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { PosPrinterService } from "@point_of_sale/app/printer/pos_printer_service";
import { HWPrinter } from "@point_of_sale/app/printer/hw_printer";
import { HardwareProxy } from "@point_of_sale/app/services/hardware_proxy_service";
import { toCanvas } from "@point_of_sale/app/utils/html-to-image";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ConnectionLostError, RPCError } from "@web/core/network/rpc";
import { handleRPCError } from "@point_of_sale/app/errors/error_handlers";
import { serializeDateTime } from "@web/core/l10n/dates";
import { patch } from "@web/core/utils/patch";

function posAgentConfig(printerService) {
    return printerService.hardware_proxy?.pos?.config;
}

function usesPOSAgentReceipt(printerService) {
    const config = posAgentConfig(printerService);
    return Boolean(config?.use_posagent && config?.posagent_enable_printer);
}

function usesPOSAgentProxy(printerService) {
    const config = posAgentConfig(printerService);
    return Boolean(
        config?.use_posagent &&
            (config?.posagent_enable_printer || config?.posagent_enable_preparation_printer)
    );
}

function receiptImageKey(source) {
    return `posagent:receipt-image:${new URL(source, window.location.origin).href}`;
}

function getCachedReceiptImage(source) {
    try {
        return window.localStorage.getItem(receiptImageKey(source));
    } catch {
        return null;
    }
}

async function cacheReceiptImage(source) {
    try {
        const response = await window.fetch(source, { credentials: "same-origin" });
        if (!response.ok) {
            return;
        }
        const blob = await response.blob();
        const dataURL = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        window.localStorage.setItem(receiptImageKey(source), dataURL);
    } catch {
        // A previous cached image remains usable when the server is offline.
    }
}

function preparePOSAgentReceipt(receipt) {
    const safeReceipt = receipt.cloneNode(true);
    safeReceipt.querySelectorAll("img").forEach((image) => {
        const source = image.getAttribute("src") || "";
        if (source.startsWith("data:") || source.startsWith("blob:")) {
            return;
        }
        const cachedSource = getCachedReceiptImage(source);
        if (cachedSource) {
            image.setAttribute("src", cachedSource);
        } else {
            image.remove();
        }
    });

    const localFontStyle = document.createElement("style");
    localFontStyle.textContent =
        "*,*::before,*::after{font-family:Arial,'Segoe UI',sans-serif!important;color:#000!important;}";
    safeReceipt.prepend(localFontStyle);
    return safeReceipt;
}

async function posAgentReceiptToCanvas(receipt) {
    const container = document.querySelector(".render-container");
    if (!container) {
        throw new Error("Odoo print render container is unavailable.");
    }

    const safeReceipt = preparePOSAgentReceipt(receipt);
    safeReceipt.classList.add("pos-receipt-print");
    container.replaceChildren(safeReceipt);
    try {
        return await toCanvas(safeReceipt, {
            backgroundColor: "#ffffff",
            height: Math.ceil(safeReceipt.clientHeight),
            width: Math.ceil(safeReceipt.clientWidth),
            pixelRatio: 2,
            includeQueryParams: true,
            skipFonts: true,
        });
    } finally {
        safeReceipt.remove();
    }
}

patch(PosStore.prototype, {
    async afterProcessServerData() {
        const result = await super.afterProcessServerData(...arguments);
        const useReceipt = this.config.use_posagent && this.config.posagent_enable_printer;
        const usePreparation =
            this.config.use_posagent && this.config.posagent_enable_preparation_printer;
        if (useReceipt || usePreparation) {
            this.config.is_posbox = true;
            this.config.iface_print_via_proxy = true;
            this.config.iface_cashdrawer = Boolean(this.config.posagent_enable_cashdrawer);
            this.config.iface_scan_via_proxy = false;
            this.config.iface_electronic_scale = false;
            this.config.iface_customer_facing_display_via_proxy = false;
            this.config.proxy_ip = `http://127.0.0.1:${this.config.pos_agent_port}`;
        }

        if (useReceipt) {
            const companyLogo = `/web/image?model=res.company&id=${this.company.id}&field=logo`;
            cacheReceiptImage(companyLogo);
            this.config.iface_print_auto = true;
            this.config.iface_print_skip_screen = true;
        }
        return result;
    },

    getDisplayDeviceIP() {
        if (this.config.use_posagent && !this.config.iface_customer_facing_display_via_proxy) {
            return false;
        }
        return super.getDisplayDeviceIP(...arguments);
    },

    _enqueuePOSAgentPrint(task) {
        const previous = this._posAgentPrintQueue || Promise.resolve();
        const current = previous.then(task, task);
        this._posAgentPrintQueue = current.catch((error) => {
            console.error("POSAgent print queue failed", error);
        });
        return current;
    },

    _enqueuePOSAgentOrderPrint(task) {
        const previous = this._posAgentOrderPrintQueue || Promise.resolve();
        const current = previous.then(task, task);
        this._posAgentOrderPrintQueue = current.catch((error) => {
            console.error("POSAgent order print queue failed", error);
        });
        return current;
    },

    _schedulePOSAgentOrderPrint(order) {
        if (!order || typeof order !== "object") {
            return false;
        }

        this._posAgentScheduledOrderPrints ||= new WeakSet();
        if (this._posAgentScheduledOrderPrints.has(order)) {
            return false;
        }
        this._posAgentScheduledOrderPrints.add(order);

        void this._enqueuePOSAgentOrderPrint(async () => {
            if (this.config.posagent_enable_printer) {
                try {
                    await this.printReceipt({ order });
                } catch (error) {
                    console.error("POSAgent customer receipt failed", error);
                }
            }

            if (this.config.posagent_enable_preparation_printer) {
                try {
                    await this.sendOrderInPreparation(order);
                } catch (error) {
                    console.error("POSAgent preparation printing failed", error);
                }
            }
        });
        return true;
    },

    async printReceipt() {
        if (!this.config.use_posagent || !this.config.posagent_enable_printer) {
            return super.printReceipt(...arguments);
        }
        const args = arguments;
        return this._enqueuePOSAgentPrint(() => super.printReceipt(...args));
    },
});

patch(PosPrinterService.prototype, {
    async print(component, props, options) {
        if (!usesPOSAgentReceipt(this)) {
            return super.print(...arguments);
        }

        if (this.hardware_proxy.printer) {
            this.hardware_proxy.printer._isPOSAgent = true;
        }
        this.state.isPrinting = true;
        try {
            const receipt = await this.renderer.toHtml(component, props);
            return await this.printHtml(receipt, {
                ...(options || {}),
                posagentPrinterName: posAgentConfig(this)?.posagent_receipt_printer_name || "",
            });
        } finally {
            this.state.isPrinting = false;
        }
    },

    async printHtml(receipt, options = {}) {
        const isPOSAgentJob =
            usesPOSAgentProxy(this) &&
            (Object.prototype.hasOwnProperty.call(options, "posagentPrinterName") ||
                Object.prototype.hasOwnProperty.call(options, "posagentPrinterCode") ||
                Object.prototype.hasOwnProperty.call(options, "posagentCut"));
        if (isPOSAgentJob && this.hardware_proxy.printer) {
            this.hardware_proxy.printer._isPOSAgent = true;
            const result = await this.hardware_proxy.printer.printPOSAgentReceipt(
                receipt,
                options.posagentPrinterCode || "",
                Boolean(options.posagentCut),
                options.posagentPrinterName || ""
            );
            return Boolean(result?.successful);
        }
        return super.printHtml(...arguments);
    },

    printWeb() {
        if (usesPOSAgentReceipt(this)) {
            console.error("POSAgent web print fallback suppressed");
            return false;
        }
        return super.printWeb(...arguments);
    },

    async printHtmlAlternative(error) {
        if (!usesPOSAgentReceipt(this)) {
            return super.printHtmlAlternative(...arguments);
        }
        console.error("POSAgent direct printing failed", error);
        return false;
    },
});

patch(HardwareProxy.prototype, {
    async openCashbox(action = false) {
        const config = this.pos?.config;
        if (!config?.use_posagent || !config?.posagent_enable_cashdrawer) {
            return super.openCashbox(...arguments);
        }

        const isPrinterConnected = ["connected", "init"].includes(this.connectionInfo.status);
        if (config.iface_cashdrawer && this.printer && isPrinterConnected) {
            await this.printer.sendAction({
                action: "cashbox",
                printer_name: config.posagent_receipt_printer_name || "",
            });
            if (action) {
                this.pos.logEmployeeMessage(action, "CASH_DRAWER_ACTION");
            }
        }
    },
});

patch(HWPrinter.prototype, {
    async printPOSAgentReceipt(receipt, printerCode = "", cut = false, printerName = "") {
        if (receipt) {
            this.receiptQueue.push({ receipt, printerCode, cut, printerName });
        }
        while (this.receiptQueue.length) {
            const queued = this.receiptQueue.shift();
            const queuedReceipt = queued?.receipt || queued;
            const queuedCode = queued?.printerCode || "";
            const queuedCut = Boolean(queued?.cut);
            const queuedPrinterName = queued?.printerName || "";
            try {
                const canvas = await posAgentReceiptToCanvas(queuedReceipt);
                const result = await this.sendAction({
                    action: "print_receipt",
                    receipt: this.processCanvas(canvas),
                    printer_code: queuedCode,
                    printer_name: queuedPrinterName,
                    cut: queuedCut,
                });
                if (!result || result.result === false) {
                    this.receiptQueue.length = 0;
                    return this.getResultsError(result);
                }
            } catch (error) {
                this.receiptQueue.length = 0;
                console.error("POSAgent receipt failed", error);
                return this.getActionError();
            }
        }
        return { successful: true };
    },

    async printReceipt(receipt) {
        if (!this._isPOSAgent) {
            return super.printReceipt(...arguments);
        }
        return this.printPOSAgentReceipt(receipt);
    },
});

patch(PaymentScreen.prototype, {
    async _finalizeValidation() {
        if (!this.pos.config.use_posagent || !this.pos.config.posagent_enable_printer) {
            return super._finalizeValidation(...arguments);
        }

        if (this.currentOrder.is_paid_with_cash() || this.currentOrder.get_change()) {
            this.hardwareProxy.openCashbox();
        }

        this.currentOrder.date_order = serializeDateTime(luxon.DateTime.now());
        for (const line of this.paymentLines) {
            if (line.amount === 0) {
                this.currentOrder.remove_paymentline(line);
            }
        }

        this.pos.addPendingOrder([this.currentOrder.id]);
        this.currentOrder.state = "paid";
        this.pos._schedulePOSAgentOrderPrint(this.currentOrder);

        this.env.services.ui.block();
        let syncOrderResult;
        try {
            syncOrderResult = await this.pos.syncAllOrders({ throw: true });
            if (!syncOrderResult) {
                return;
            }

            if (this.shouldDownloadInvoice() && this.currentOrder.is_to_invoice()) {
                if (this.currentOrder.raw.account_move) {
                    await this.invoiceService.downloadPdf(this.currentOrder.raw.account_move);
                } else {
                    throw {
                        code: 401,
                        message: "Backend Invoice",
                        data: { order: this.currentOrder },
                    };
                }
            }
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                await this.afterOrderValidation();
                return;
            } else if (error instanceof RPCError) {
                this.currentOrder.state = "draft";
                handleRPCError(error, this.dialog);
            } else {
                throw error;
            }
            return error;
        } finally {
            this.env.services.ui.unblock();
        }

        const postPushOrders = syncOrderResult.filter((order) => order.wait_for_push_order());
        if (postPushOrders.length) {
            await this.postPushOrderResolve(postPushOrders.map((order) => order.id));
        }
        await this.afterOrderValidation();
    },

    async afterOrderValidation() {
        if (!this.pos.config.use_posagent || !this.pos.config.posagent_enable_printer) {
            return super.afterOrderValidation(...arguments);
        }

        const order = this.currentOrder;
        order.set_screen_data({ name: "" });
        this.pos._schedulePOSAgentOrderPrint(order);

        const switchScreen = order.uuid === this.pos.selectedOrderUuid;
        if (switchScreen) {
            this.selectNextOrder();
            this.pos.showScreen("ProductScreen");
        }
    },
});
