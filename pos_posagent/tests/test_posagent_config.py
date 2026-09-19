# -*- coding: utf-8 -*-

from pathlib import Path

from odoo.tests.common import TransactionCase


class TestPOSAgentConfig(TransactionCase):
    def test_posagent_default_port(self):
        config = self.env["pos.config"].new()
        self.assertEqual(config.pos_agent_port, 9069)

    def test_posagent_feature_flags_default_disabled(self):
        config = self.env["pos.config"].new()
        self.assertFalse(config.use_posagent)
        self.assertFalse(config.posagent_enable_printer)
        self.assertFalse(config.posagent_receipt_printer_name)
        self.assertFalse(config.posagent_enable_cashdrawer)
        self.assertFalse(config.posagent_enable_preparation_printer)
        self.assertEqual(config.posagent_preparation_mode, "single")
        self.assertTrue(config.posagent_preparation_auto_cut)
        self.assertFalse(config.posagent_preparation_printer_name)

    def test_preparation_routes_are_per_pos(self):
        config_a = self.env["pos.config"].create({"name": "Preparation A"})
        config_b = self.env["pos.config"].create({"name": "Preparation B"})
        category = self.env["pos.category"].create({"name": "Kitchen"})

        route_a = self.env["posagent.preparation.route"].create({
            "pos_config_id": config_a.id,
            "category_id": category.id,
            "printer_name": "Kitchen A",
        })
        route_b = self.env["posagent.preparation.route"].create({
            "pos_config_id": config_b.id,
            "category_id": category.id,
            "printer_name": "Kitchen B",
        })

        self.assertEqual(config_a.posagent_preparation_route_ids, route_a)
        self.assertEqual(config_b.posagent_preparation_route_ids, route_b)
        self.assertNotEqual(route_a.printer_name, route_b.printer_name)

    def test_preparation_receipt_uses_ds_service_type(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "static"
            / "src"
            / "overrides"
            / "models"
            / "local_printer.js"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "const serviceType = order.ds_service_type || order.order_type;",
            source,
        )
        self.assertIn('serviceType === "dine_in"', source)
        self.assertIn('serviceType === "takeaway" || serviceType === "pickup"', source)
        self.assertIn('serviceType === "delivery"', source)
        self.assertIn('return _t("Dine In");', source)
        self.assertIn('return _t("Takeaway");', source)
        self.assertIn('return _t("Delivery");', source)

    def test_customer_receipt_printer_is_sent_by_name(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "static"
            / "src"
            / "overrides"
            / "models"
            / "models.js"
        ).read_text(encoding="utf-8")

        self.assertIn("posagent_receipt_printer_name", source)
        self.assertIn("posagentPrinterName", source)
        self.assertIn("printer_name: queuedPrinterName", source)

    def test_preparation_uses_direct_printer_name_and_parent_categories(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "static"
            / "src"
            / "overrides"
            / "models"
            / "local_printer.js"
        ).read_text(encoding="utf-8")

        self.assertIn("product?.parentPosCategIds", source)
        self.assertIn("route?.printer_name", source)
        self.assertIn("posagent_preparation_printer_name", source)
        self.assertIn("posagentPrinterName: printerName", source)

    def test_backend_printer_selector_uses_agent_discovery(self):
        module_root = Path(__file__).resolve().parents[1]
        widget = (
            module_root
            / "static"
            / "src_backend"
            / "printer_field.js"
        ).read_text(encoding="utf-8")
        view = (module_root / "views" / "pos_config_views.xml").read_text(encoding="utf-8")

        self.assertIn("/api/v1/printers", widget)
        self.assertIn("/api/v1/test-print", widget)
        self.assertIn('registry.category("fields").add("posagent_printer"', widget)
        self.assertIn('widget="posagent_printer"', view)

    def test_cashdrawer_uses_selected_receipt_printer(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "static"
            / "src"
            / "overrides"
            / "models"
            / "models.js"
        ).read_text(encoding="utf-8")

        self.assertIn("patch(HardwareProxy.prototype", source)
        self.assertIn('action: "cashbox"', source)
        self.assertIn('printer_name: config.posagent_receipt_printer_name || ""', source)
