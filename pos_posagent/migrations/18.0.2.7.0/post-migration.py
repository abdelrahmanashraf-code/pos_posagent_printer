# -*- coding: utf-8 -*-

from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    categories = env["pos.category"].search([("print_on_local_printer", "=", True)])
    if not categories:
        return

    route_model = env["posagent.preparation.route"]
    configs = env["pos.config"].search([("use_posagent", "=", True)])
    for config in configs:
        config.write({
            "posagent_enable_preparation_printer": True,
            "posagent_preparation_mode": "single",
            "posagent_preparation_auto_cut": False,
        })
        existing_category_ids = set(config.posagent_preparation_route_ids.mapped("category_id").ids)
        for category in categories.filtered(lambda item: item.id not in existing_category_ids):
            route_model.create({
                "pos_config_id": config.id,
                "category_id": category.id,
            })
