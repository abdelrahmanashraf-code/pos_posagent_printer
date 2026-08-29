/** @odoo-module */
// Temporary diagnostic instrumentation for the "Validate -> receipt printed"
// delay investigation. Only active under debug=assets (odoo.debug truthy).
// Safe to delete once the investigation is closed; touches no core files.

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { PrinterService } from "@point_of_sale/app/printer/printer_service";
import { HWPrinter } from "@point_of_sale/app/printer/hw_printer";
import { PosStore } from "@point_of_sale/app/store/pos_store";

const TAG = "[POSAgentTiming]";

function mark(label, extra = "") {
    if (!odoo.debug) {
        return;
    }
    // performance.now() is monotonic and matches the "steady clock" used on
    // the POSAgent side; wall-clock Date.now() is logged alongside so the
    // browser and agent logs can be correlated by epoch time.
    console.log(
        `${TAG} ${label} t=${performance.now().toFixed(1)}ms epoch=${Date.now()} ${extra}`
    );
}

patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        mark("1_validate_pressed");
        return super.validateOrder(...arguments);
    },
    async _finalizeValidation() {
        mark("2_payment_validation_finished");
        return super._finalizeValidation(...arguments);
    },
});

patch(PrinterService.prototype, {
    async print(component, props, options) {
        mark("4_receipt_render_started");
        const result = await super.print(component, props, options);
        mark("5_receipt_render_finished");
        return result;
    },
});

patch(HWPrinter.prototype, {
    sendAction(data) {
        mark("6_hw_proxy_request_start", `action=${data.action}`);
        const promise = super.sendAction(data);
        promise.then(
            () => mark("11_hw_proxy_response_received", `action=${data.action} ok`),
            () => mark("11_hw_proxy_response_received", `action=${data.action} error`)
        );
        return promise;
    },
});

patch(PosStore.prototype, {
    async syncAllOrders(options) {
        mark("3_order_sync_started");
        const result = await super.syncAllOrders(...arguments);
        mark("3_order_sync_finished");
        return result;
    },
    showScreen(name, props) {
        mark("12_navigation_started", `screen=${name}`);
        return super.showScreen(...arguments);
    },
});