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
        if (!this.config.use_posagent || !this.config.posagent_enable_preparation_printer) {
            return super.sendOrderInPreparation(...arguments);
        }

        const args = arguments;
        return this._enqueuePOSAgentPrint(async () => {
            await this._printLocalPrinterChanges(order, cancelled);
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
            return;
        }

        const routeByCategory = new Map();
        for (const route of routes) {
            const categoryId = relationId(route.category_id);
            if (categoryId) {
                routeByCategory.set(categoryId, route);
            }
        }
        const categoryIds = new Set(routeByCategory.keys());
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

        const getPrinterCode = (route) => {
            if (this.config.posagent_preparation_mode === "department") {
                const code = (route.printer_code || "").trim();
                if (!code) {
                    const department = route.category_id?.name || _t("Preparation Department");
                    throw new Error(`POSAgent printer code is not configured for ${department}`);
                }
                return code;
            }
            return (this.config.posagent_preparation_printer_code || "").trim();
        };

        for (const [categoryId, lines] of groupByCategory(orderChange.new)) {
            const route = routeByCategory.get(categoryId);
            const category = route?.category_id;
            await this._printLocalReceipt(
                order,
                category?.name || _t("New"),
                lines,
                getPrinterCode(route)
            );
        }
        for (const [categoryId, lines] of groupByCategory(orderChange.cancelled)) {
            const route = routeByCategory.get(categoryId);
            await this._printLocalReceipt(
                order,
                _t("Cancelled"),
                lines,
                getPrinterCode(route)
            );
        }
    },

    async _printLocalReceipt(order, title, lines, printerCode = "") {
        const changes = this.getPrintingChanges(order, false);
        changes.headerLabel = getPreparationHeaderLabel(order);
        const receipt = renderToElement("pos_posagent.LocalPreparationReceipt", {
            operational_title: title,
            changes,
            changedlines: lines,
            fullReceipt: false,
        });
        const printed = await this.printer.printHtml(receipt, {
            webPrintFallback: false,
            posagentPrinterCode: printerCode,
            posagentCut: Boolean(this.config.posagent_preparation_auto_cut),
        });
        if (!printed) {
            throw new Error(`POSAgent preparation receipt failed: ${title}`);
        }
    },
});

