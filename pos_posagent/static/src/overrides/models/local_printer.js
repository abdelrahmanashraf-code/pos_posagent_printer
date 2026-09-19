/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
import { changesToOrder } from "@point_of_sale/app/models/utils/order_change";
import { renderToElement } from "@web/core/utils/render";
import { _t } from "@web/core/l10n/translation";

function relationId(value) {
    if (!value) {
        return false;
    }
    return typeof value === "object" ? value.id : value;
}

function getPreparationHeaderLabel(order) {
    const serviceType = order.ds_service_type || order.order_type;
    if (serviceType === "dine_in") {
        return _t("Dine In");
    }
    if (serviceType === "takeaway" || serviceType === "pickup") {
        return _t("Takeaway");
    }
    if (serviceType === "delivery") {
        return _t("Delivery");
    }
    return order.takeaway ? _t("Takeaway") : _t("Dine In");
}

patch(PosStore.prototype, {
    async sendOrderInPreparation(order, opts = {}) {
        if (!this.config.use_posagent || !this.config.posagent_enable_preparation_printer) {
            return super.sendOrderInPreparation(...arguments);
        }

        const args = arguments;
        const cancelled =
            typeof opts === "boolean" ? opts : Boolean(opts && typeof opts === "object" && opts.cancelled);
        return this._enqueuePOSAgentPrint(async () => {
            const preparationPrinted = await this._printLocalPrinterChanges(order, cancelled);
            if (!preparationPrinted) {
                this.env?.services?.notification?.add(
                    _t("Preparation printer unavailable. Order continued without blocking."),
                    {
                        title: _t("Preparation Printing"),
                        type: "warning",
                    }
                );
            }
            return super.sendOrderInPreparation(...args);
        });
    },

    _getPOSAgentPreparationRoutes() {
        const routeModel = this.models["posagent.preparation.route"];
        if (!routeModel) {
            return [];
        }
        return routeModel
            .getAll()
            .filter((route) => relationId(route.pos_config_id) === this.config.id)
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    },

    async _printLocalPrinterChanges(order, cancelled) {
        const routes = this._getPOSAgentPreparationRoutes();
        if (!routes.length) {
            return true;
        }

        const categoryIds = new Set(
            routes.map((route) => relationId(route.category_id)).filter(Boolean)
        );
        if (!categoryIds.size) {
            return true;
        }

        const orderChange = changesToOrder(order, false, categoryIds, cancelled);
        const groupByRoute = (lines) => {
            const groups = new Map();
            for (const line of lines) {
                const product = this.models["product.product"].get(line.product_id);
                const productCategoryIds = new Set(
                    product?.parentPosCategIds ||
                        product?.pos_categ_ids?.map((category) => relationId(category)) ||
                        []
                );
                const route = routes.find((item) =>
                    productCategoryIds.has(relationId(item.category_id))
                );
                if (!route) {
                    continue;
                }
                if (!groups.has(route.id)) {
                    groups.set(route.id, { route, lines: [] });
                }
                groups.get(route.id).lines.push(line);
            }
            return groups;
        };

        const getPrinterTarget = (route) => {
            if (this.config.posagent_preparation_mode === "department") {
                const printerName = (route?.printer_name || "").trim();
                if (printerName) {
                    return { printerName, printerCode: "" };
                }
                const printerCode = (route?.printer_code || "").trim();
                if (printerCode) {
                    return { printerName: "", printerCode };
                }
                const department = route?.category_id?.name || _t("Preparation Department");
                throw new Error(`POSAgent printer is not configured for ${department}`);
            }

            const printerName = (this.config.posagent_preparation_printer_name || "").trim();
            if (printerName) {
                return { printerName, printerCode: "" };
            }
            return {
                printerName: "",
                printerCode: (this.config.posagent_preparation_printer_code || "").trim(),
            };
        };

        let allPrinted = true;
        for (const { route, lines } of groupByRoute(orderChange.new).values()) {
            const category = route?.category_id;
            const target = getPrinterTarget(route);
            const printed = await this._printLocalReceipt(
                order,
                category?.name || _t("New"),
                lines,
                target.printerCode,
                target.printerName
            );
            allPrinted = printed && allPrinted;
        }
        for (const { route, lines } of groupByRoute(orderChange.cancelled).values()) {
            const target = getPrinterTarget(route);
            const printed = await this._printLocalReceipt(
                order,
                _t("Cancelled"),
                lines,
                target.printerCode,
                target.printerName
            );
            allPrinted = printed && allPrinted;
        }
        return allPrinted;
    },

    async _printLocalReceipt(order, title, lines, printerCode = "", printerName = "") {
        const changes = this.getPrintingChanges(order, false);
        changes.headerLabel = getPreparationHeaderLabel(order);
        const receipt = renderToElement("pos_posagent.LocalPreparationReceipt", {
            operational_title: title,
            changes,
            changedlines: lines,
            fullReceipt: false,
        });
        try {
            const printed = await this.printer.printHtml(receipt, {
                webPrintFallback: false,
                posagentPrinterCode: printerCode,
                posagentPrinterName: printerName,
                posagentCut: Boolean(this.config.posagent_preparation_auto_cut),
            });
            if (!printed) {
                console.warn(`POSAgent preparation receipt was not printed: ${title}`);
            }
            return Boolean(printed);
        } catch (error) {
            console.warn(`POSAgent preparation receipt failed: ${title}`, error);
            return false;
        }
    },
});
