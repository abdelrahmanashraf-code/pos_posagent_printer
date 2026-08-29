# -*- coding: utf-8 -*-

{
    'name': 'POSAgent for Community Edition Direct Print Cash Drawer',
    'version': '18.0.2.6.0',
    'author': 'Diego A.',
    'support': 'diegoandino@gmail.com',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'POSAgent support for the Point of Sale',
    'description': """

This module enables the use of PosAgent as an alternative proxy service to interface with POS hardware.

Customer receipts and locally selected preparation categories are printed automatically
through a background POSAgent queue, without blocking cashier navigation or opening the
browser print dialog when the local agent is unavailable.
""",
    'depends': ['point_of_sale'],
    'data': [
        'views/pos_config_views.xml',
        'views/pos_category_views.xml',
    ],
    "images": ['static/images/thumbnail.png'],
    'installable': True,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_posagent/static/src/**/*',
        ],
    },
    'license': 'LGPL-3',
}
