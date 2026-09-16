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
        self.assertFalse(config.posagent_enable_cashdrawer)
        self.assertFalse(config.posagent_enable_preparation_printer)
        self.assertEqual(config.posagent_preparation_mode, "single")
        self.assertTrue(config.posagent_preparation_auto_cut)

    def test_preparation_routes_are_per_pos(self):
        config_a = self.env["pos.config"].create({"name": "Preparation A"})
        config_b = self.env["pos.config"].create({"name": "Preparation B"})
        category = self.env["pos.category"].create({"name": "Kitchen"})

        route_a = self.env["posagent.preparation.route"].create({
            "pos_config_id": config_a.id,
            "category_id": category.id,
            "printer_code": "kitchen-a",
        })
        route_b = self.env["posagent.preparation.route"].create({
            "pos_config_id": config_b.id,
            "category_id": category.id,
            "printer_code": "kitchen-b",
        })

        self.assertEqual(config_a.posagent_preparation_route_ids, route_a)
        self.assertEqual(config_b.posagent_preparation_route_ids, route_b)
        self.assertNotEqual(route_a.printer_code, route_b.printer_code)

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
