---
name: Google Sheets integration — Report Tool
description: Spreadsheet column mapping for auto-filling ПЗМ/ПСМ/ПСТЛ/ВСТЛ/ДОЖ counters
---

# Google Sheets → Report Tool Counter Mapping

**Spreadsheet ID:** `1J4db2S0XJgEHLxQMpO2ey7GbhWFkySFDVj9ZCUXK4ko`  
**Sheet name:** `ВОРОНКА`  
**Data starts:** Row 3 (row 1 is empty, row 2 is headers)

## Column mapping (0-indexed within the row array)
| App counter | Column | Header in sheet |
|---|---|---|
| ПЗМ  | AC (28) | ДАТА совершенного ПЗМ |
| ПСТЛ | AD (29) | ДАТА совершенного ВЗМ |
| ПСМ  | AE (30) | ДАТА совершенного ПСМ |
| ВСТЛ | AF (31) | ДАТА совершенного ВСМ |
| ДОЖ  | AG (32) | ДАТА ПЕРВОГО ПЛАТЕЖА |

**Date format in cells:** DD.MM.YYYY (e.g. "03.08.2026")

**Logic:** Count rows where the date cell equals today's date in DD.MM.YYYY format.

## Integration
- Connector: `google-sheet` via `@replit/connectors-sdk`
- SDK init: `new ReplitConnectors()` then `.proxy("google-sheet", path)`
- Connection ID: `conn_google-sheet_01KZ3FSSFQSMNEXH5GJAD5TWXT`

**Why:** The sheet uses different acronyms from the app (ВЗМ vs ПСТЛ, ВСМ vs ВСТЛ). The mapping above reflects the agreed interpretation.
