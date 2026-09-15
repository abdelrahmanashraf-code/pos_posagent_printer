/** @odoo-module */

import { HWPrinter } from "@point_of_sale/app/printer/hw_printer";
import { patch } from "@web/core/utils/patch";

patch(HWPrinter.prototype, {
    processCanvas(canvas) {
        if (!this._isPOSAgent) {
            return super.processCanvas(...arguments);
        }
        return canvas
            .toDataURL("image/jpeg", 1.0)
            .replace("data:image/jpeg;base64,", "");
    },
});
