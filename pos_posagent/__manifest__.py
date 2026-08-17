# -*- coding: utf-8 -*-

{
    "name": "POSAgent for Community Edition Direct Print Cash Drawer",
    "version": "18.0.2.6.0",
    "author": "Diego A.",
    "support": "diegoandino@gmail.com",
    "category": "Sales/Point of Sale",
    "sequence": 6,
    "summary": "POSAgent support for the Point of Sale",
    "description": """
This module enables the use of POSAgent as an alternative proxy service to interface with POS hardware.
The Windows agent is built from the MIT-licensed source at https://github.com/dieg0-a/posagentpro-src.
Receipt and preparation printing run in a background queue and browser print fallback is disabled while POSAgent is enabled.
""",
    "depends": ["point_of_sale"],
    "data": [
        "views/pos_config_views.xml",
    ],
    "images": ["static/images/thumbnail.png"],
    "installable": True,
    "assets": {
        "point_of_sale._assets_pos": [
            "pos_posagent/static/src/**/*",
        ],
    },
    "license": "LGPL-3",
}
