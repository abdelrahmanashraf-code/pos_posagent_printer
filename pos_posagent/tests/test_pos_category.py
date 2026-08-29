# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPosCategoryLocalPrinter(TransactionCase):
    def test_print_on_local_printer_persists(self):
        category = self.env["pos.category"].create(
            {"name": "Kitchen", "print_on_local_printer": True}
        )
        category.invalidate_recordset()
        self.assertTrue(category.print_on_local_printer)

    def test_print_on_local_printer_default_false(self):
        category = self.env["pos.category"].create({"name": "Drinks"})
        self.assertFalse(category.print_on_local_printer)
