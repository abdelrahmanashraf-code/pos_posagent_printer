# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models


class PosCategory(models.Model):
    _inherit = "pos.category"

    print_on_local_printer = fields.Boolean(string="Print on Local Printer")

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        return fields_list + ["print_on_local_printer"]
