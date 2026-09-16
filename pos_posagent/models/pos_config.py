# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models


class PosConfig(models.Model):
    _inherit = "pos.config"

    use_posagent = fields.Boolean(string="POS Agent")
    pos_agent_port = fields.Integer(string="Proxy Port", default=9069)
    posagent_enable_printer = fields.Boolean(string="Receipt Printer")
    posagent_enable_cashdrawer = fields.Boolean(string="Cash Drawer")

    posagent_enable_preparation_printer = fields.Boolean(
        string="Preparation Printing",
        default=False,
        help="Print preparation tickets when the Order button is used.",
    )
    posagent_preparation_mode = fields.Selection(
        [
            ("single", "Single Printer"),
            ("department", "Printer per Department"),
        ],
        string="Preparation Printer Mode",
        default="single",
        required=True,
    )
    posagent_preparation_printer_code = fields.Char(
        string="Preparation Printer Code",
        help=(
            "Printer route code used for all preparation departments in Single Printer mode. "
            "Leave empty to use the Print Agent default printer."
        ),
    )
    posagent_preparation_auto_cut = fields.Boolean(
        string="Auto Cut Preparation Tickets",
        default=True,
        help="Ask DS POS Print Agent to cut after every preparation department ticket.",
    )
    posagent_preparation_route_ids = fields.One2many(
        "posagent.preparation.route",
        "pos_config_id",
        string="Preparation Departments",
        copy=True,
    )
