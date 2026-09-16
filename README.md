# POSAgent Printer for Odoo 18

Free local USB/network printing bridge for Odoo 18 POS.

## Current status

- The existing `pos_posagent` addon was migrated in place to Odoo 18.
- Odoo core is not modified.
- The Windows agent is based on the DS POS Print Agent compatibility protocol.
- Customer receipts can print directly without the browser print dialog.
- Preparation printing is configurable per POS.
- Preparation departments use POS Categories and print as separate tickets.
- Supports one preparation printer for all departments or a printer route per department.
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

Each POS can independently enable Preparation Printing and choose:

- **Single Printer**: every configured department prints to one `printer_code`. If the code is empty, the agent default printer is used.
- **Printer per Department**: each configured department has its own `printer_code`.

A department is a POS Category configured on the POS preparation routes. Each department produces a separate preparation ticket when the order is sent to preparation.

Example Print Agent routes:

```text
kitchen=EPSON TM-T20III Kitchen
bar=XPrinter Bar
coffee=EPSON Coffee
```

Multiple codes may point to the same Windows printer for customers that only have one preparation printer.

## Repository layout

- `pos_posagent/`: Odoo 18 addon.
- `scripts/build_windows.ps1`: legacy Windows baseline build helper.
- `.github/workflows/build-windows.yml`: reproducible Windows x64 CI build for the legacy baseline.

## Required real-device test

1. Install the thermal printer using its Windows driver.
2. Confirm a Windows test page prints.
3. Run DS POS Print Agent and select the default printer / printer routes.
4. Enable POSAgent in the Odoo POS configuration using local port `9069`.
5. Enable Preparation Printing and configure departments.
6. Press **Order** and verify each department prints a separate ticket on the expected printer.
7. If Auto Cut is enabled, verify the printer cuts after every department ticket.

## Licensing

- Odoo addon: LGPL-3, preserving the original module licensing and attribution.
