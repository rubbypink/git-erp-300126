# Accountant Refactor — Learnings & Conventions

## Code Patterns
- Module registered via `A.addModule()` with `static autoInit = false`
- Use `logA()` for toast notifications, never `alert()`/`confirm()`/`Opps()`
- Use `A.DB.updateSingle()` / `A.DB.batchDelete()` for data operations
- Use `this.currentTransCol` / `this.currentFundCol` for entity switching
- ATable config uses `pageSize: 50`

## Architecture Decisions
- Phase 1 & 2 completed: Bug fixes + Architecture alignment (A.addModule, ATable, LogicBase, HD helpers)
- Phase 3 partially completed: 3.1-3.6, 3.8 done. 3.7 (Fund Transfer) pending.
- Phase 4 partially completed: 4.1-4.4, 4.6 done. 4.5 (Toast notifications — replace Opps) pending.

## Known Issues
- `Opps()` still used in 4 places in controller_accountant.js — violates guardrail #7
- Fund transfer feature (3.7) not yet implemented

## File Inventory
- `controller_accountant.js` — Main controller (1815 lines)
- `accountant_logic.js` — Logic layer (Firestore access replaced with DBManager)
- `acc_form_builder.js` — Schema-driven form generation
- `acc_pnl_report.js` — P&L Report
- `acc_supplier_debt.js` — Supplier Debt Dashboard
- `acc_charts.js` — Financial Charts
- `acc_export.js` — Export CSV/PDF
- `accountant.css` — 146 lines (under 150 target)
- `tpl_accountant.html` — Main template
- `tpl_accountant_report.html` — Report template
