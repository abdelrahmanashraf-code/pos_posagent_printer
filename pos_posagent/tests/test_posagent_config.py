# -*- coding: utf-8 -*-

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
