/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component, onWillStart, useState } from "@odoo/owl";

const printerCache = new Map();

async function fetchPrinters(port, force = false) {
    const key = String(port || 9069);
    if (!force && printerCache.has(key)) {
        return printerCache.get(key);
    }
    const request = (async () => {
        const response = await fetch(`http://127.0.0.1:${key}/api/v1/printers`, {
            method: "GET",
            mode: "cors",
            cache: "no-store",
        });
        if (!response.ok) {
            throw new Error(`Print Agent returned HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (Array.isArray(payload.details)) {
            return payload.details
                .filter((item) => item && item.name)
                .map((item) => ({ name: String(item.name), ready: item.ready !== false }));
        }
        return (payload.printers || []).map((name) => ({ name: String(name), ready: true }));
    })();
    printerCache.set(key, request);
    try {
        return await request;
    } catch (error) {
        printerCache.delete(key);
        throw error;
    }
}

export class POSAgentPrinterField extends Component {
    static template = "pos_posagent.POSAgentPrinterField";
    static props = {
        ...standardFieldProps,
        portField: { type: String, optional: true },
        allowDefault: { type: Boolean, optional: true },
    };

    setup() {
        this.state = useState({
            printers: [],
            loading: false,
            error: "",
            message: "",
        });
        onWillStart(() => this.loadPrinters());
    }

    get value() {
        return this.props.record.data[this.props.name] || "";
    }

    get port() {
        const fieldName = this.props.portField || "pos_agent_port";
        return this.props.record.data[fieldName] || 9069;
    }

    get printers() {
        const printers = [...this.state.printers];
        if (this.value && !printers.some((item) => item.name === this.value)) {
            printers.unshift({ name: this.value, ready: false });
        }
        return printers;
    }

    get emptyLabel() {
        return this.props.allowDefault ? _t("Agent default printer") : _t("Select a printer...");
    }

    async loadPrinters(force = false) {
        this.state.loading = true;
        this.state.error = "";
        this.state.message = "";
        try {
            this.state.printers = await fetchPrinters(this.port, force);
        } catch (error) {
            console.warn("POSAgent printer discovery failed", error);
            this.state.error = _t("Print Agent unavailable or this Odoo URL is not allowed.");
        } finally {
            this.state.loading = false;
        }
    }

    async refreshPrinters() {
        await this.loadPrinters(true);
    }

    async onChange(event) {
        const value = event.target.value || false;
        await this.props.record.update({ [this.props.name]: value });
        this.state.message = "";
    }

    async testPrinter() {
        if (!this.value) {
            return;
        }
        this.state.loading = true;
        this.state.error = "";
        this.state.message = "";
        try {
            const response = await fetch(
                `http://127.0.0.1:${this.port}/api/v1/test-print`,
                {
                    method: "POST",
                    mode: "cors",
                    cache: "no-store",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ printer_name: this.value }),
                }
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.queued !== true) {
                throw new Error(payload.error || `HTTP ${response.status}`);
            }
            this.state.message = _t("Test page queued.");
        } catch (error) {
            console.warn("POSAgent test print failed", error);
            this.state.error = _t("Test print failed. Check the Print Agent and printer.");
        } finally {
            this.state.loading = false;
        }
    }
}

export const posAgentPrinterField = {
    component: POSAgentPrinterField,
    supportedTypes: ["char"],
    extractProps: ({ options }) => ({
        portField: options.port_field || "pos_agent_port",
        allowDefault: Boolean(options.allow_default),
    }),
};

registry.category("fields").add("posagent_printer", posAgentPrinterField);
