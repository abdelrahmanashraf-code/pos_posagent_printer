# POSAgent Printer for Odoo 18

Free local USB/network printing bridge for Odoo 18 POS.

## Current status

- The existing `pos_posagent` addon was migrated in place to Odoo 18.
- Odoo core is not modified.
- The Windows agent is based on the DS POS Print Agent compatibility protocol.
- Customer receipts can print directly without the browser print dialog.
- Preparation printing is configurable per POS.
- Preparation departments use POS Categories and print as separate tickets.
- Supports one preparation printer for all departments or a direct Windows printer per department.
- Customer receipt printer can be configured independently per POS.
- Odoo can discover and test printers from the local DS POS Print Agent.
- Preparation jobs can request an ESC/POS paper cut after each department ticket.

## Architecture

```text
Odoo 18 server
    -> POS browser on the customer's Windows PC
    -> http://127.0.0.1:9069
    -> DS POS Print Agent
    -> Windows USB/network printer through the installed Windows driver
```

Because printing is sent through the local agent rather than `window.print()`, the browser print dialog is bypassed.

## Preparation printing

Each POS can independently configure:

- **Customer Receipt Printer**: exact Windows printer for the cashier receipt, or leave empty to use the agent default.
- **Single Preparation Printer**: every configured preparation department prints to one Windows printer.
- **Printer per Department**: each POS Category can select its own Windows printer.

Printer fields use the local agent to discover installed Windows printers and can send a test page from Odoo settings. USB, Ethernet, and Wi-Fi printers are treated the same once they are installed as Windows printers.

A department is a POS Category configured on the POS preparation routes. Parent POS Categories are supported, so a route on a parent category also covers products in its child categories. Route sequence is used as priority when a product matches more than one configured route.

Legacy `printer_code` values remain loaded for backward compatibility but are no longer the normal setup path.

## Repository layout

- `pos_posagent/`: Odoo 18 addon.
- `scripts/build_windows.ps1`: legacy Windows baseline build helper.
- `.github/workflows/build-windows.yml`: reproducible Windows x64 CI build for the legacy baseline.

## Required real-device test

1. Install the thermal printer using its Windows driver.
2. Confirm a Windows test page prints.
3. Run DS POS Print Agent and add the exact Odoo origin under Allowed Odoo URLs.
4. Enable POSAgent in the Odoo POS configuration using local port `9069`.
5. Use the printer dropdowns in Odoo to choose/test the cashier and preparation printers.
6. Enable Preparation Printing and configure departments.
7. Press **Order** and verify each department prints a separate ticket on the expected printer.
7. If Auto Cut is enabled, verify the printer cuts after every department ticket.

## Licensing

- Odoo addon: LGPL-3, preserving the original module licensing and attribution.
