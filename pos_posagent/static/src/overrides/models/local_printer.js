/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
import { changesToOrder } from "@point_of_sale/app/models/utils/order_change";
import { renderToElement } from "@web/core/utils/render";
import { _t } from "@web/core/l10n/translation";

function getPreparationHeaderLabel(order) {
    if (order.order_type === "dine_in") {
        return _t("Dine In");
    }
    if (order.order_type === "pickup") {
        return _t("Pickup");
    }
    if (order.order_type === "delivery") {
        return _t("Delivery");
    }
    return order.takeaway ? _t("Take Out") : _t("Dine In");
}

patch(PosStore.prototype, {
    async sendOrderInPreparation(order, cancelled = false) {
        if (!this.config.use_posagent || !this.config.posagent_enable_printer) {
            return super.sendOrderInPreparation(...arguments);
        }

        const args = arguments;
        return this._enqueuePOSAgentPrint(async () => {
            await this._printLocalPrinterChanges(order, cancelled);
            return super.sendOrderInPreparation(...args);
        });
    },

    async _printLocalPrinterChanges(order, cancelled) {
        const categoryIds = new Set(
            this.models["pos.category"]
                .getAll()
                .filter((category) => category.print_on_local_printer)
                .map((category) => category.id)
        );
        if (!categoryIds.size) {
            return;
        }

        const orderChange = changesToOrder(order, false, categoryIds, cancelled);
        const groupByCategory = (lines) => {
            const groups = new Map();
            for (const line of lines) {
                const product = this.models["product.product"].get(line.product_id);
                const category = product?.pos_categ_ids?.find((item) =>
                    categoryIds.has(item.id)
                );
                if (!category) {
                    continue;
                }
                if (!groups.has(category.id)) {
                    groups.set(category.id, []);
                }
                groups.get(category.id).push(line);
            }
            return groups;
        };

        for (const [categoryId, lines] of groupByCategory(orderChange.new)) {
            const category = this.models["pos.category"].get(categoryId);
            await this._printLocalReceipt(order, category?.name || _t("New"), lines);
        }
        for (const lines of groupByCategory(orderChange.cancelled).values()) {
            await this._printLocalReceipt(order, _t("Cancelled"), lines);
        }
    },

    async _printLocalReceipt(order, title, lines) {
        const changes = this.getPrintingChanges(order, false);
        changes.headerLabel = getPreparationHeaderLabel(order);
        const receipt = renderToElement("pos_posagent.LocalPreparationReceipt", {
            operational_title: title,
            changes,
            changedlines: lines,
            fullReceipt: false,
        });
        const printed = await this.printer.printHtml(receipt, { webPrintFallback: false });
        if (!printed) {
            throw new Error(`POSAgent preparation receipt failed: ${title}`);
        }
    },
});

