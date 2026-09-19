# -*- coding: utf-8 -*-

from odoo import fields, models


class PosAgentPreparationRoute(models.Model):
    _name = "posagent.preparation.route"
    _description = "POSAgent Preparation Printer Route"
    _inherit = ["pos.load.mixin"]
    _order = "sequence, id"

    sequence = fields.Integer(default=10)
    pos_config_id = fields.Many2one(
        "pos.config",
        string="Point of Sale",
        required=True,
        ondelete="cascade",
        index=True,
    )
    category_id = fields.Many2one(
        "pos.category",
        string="Department",
        required=True,
        ondelete="cascade",
    )
    printer_name = fields.Char(
        string="Printer",
        help="Exact Windows printer name used for this preparation department.",
    )
    printer_code = fields.Char(
        string="Legacy Printer Code",
        help="Legacy DS POS Print Agent route code kept for backward compatibility.",
    )

    _sql_constraints = [
        (
            "posagent_preparation_route_unique",
            "unique(pos_config_id, category_id)",
            "A preparation department can only be configured once per Point of Sale.",
        )
    ]

    def _load_pos_data_domain(self, data):
        config_data = data.get("pos.config", {}).get("data", [])
        config_id = config_data and config_data[0].get("id")
        return [("pos_config_id", "=", config_id)] if config_id else [("id", "=", 0)]

    def _load_pos_data_fields(self, config_id):
        return ["id", "sequence", "pos_config_id", "category_id", "printer_name", "printer_code"]
