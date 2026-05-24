
## Task 4: Employee CRUD Module (hr_employee.js)

- **Import**: Used `import { DB_SCHEMA } from '../js/modules/db/DBSchema.js'` to reference the employees collection schema for validation rules. Other globals (`getE`, `L._()`, `logA()`, `formatMoney`, `HD`, `A.DB`) are available at runtime without import.
- **Data flow**: `APP_DATA.employees` (object keyed by id) → `A.DB.local.getAllAsObject('employees')` (IndexedDB) → `A.DB.getCollection('employees')` (Firestore). The `saveRecord` API auto-generates IDs via `A.DB.saveRecord(collectionName, data)` and syncs to all three layers.
- **Soft delete**: Set `status='inactive'` and re-save via `saveRecord` rather than using `delete`. This preserves the employee record for historical references.
- **Form validation**: Manual validation loop matching `DB_SCHEMA.employees.fields[]` rules (`required`, `pattern`, `minLength`, `maxLength`, `min`). Used Bootstrap's `.is-invalid` class for error display.
- **Mobile rendering**: Used `d-none d-md-block` / `d-md-none` Bootstrap classes to switch between table (desktop) and card view (mobile). Cards show the same data with icon-labeled rows.
- **DBManager.saveRecord behavior**: Accepts `{ id, ...fields }`. If `id` is missing/falsy, it auto-generates a counter-based ID. Returns `{ success: boolean, id: string, data: object }`. On success it calls `_updateAppDataObj` to sync into APP_DATA.
- **Global utilities verified**: `logA(msg, level, 'toast')` for notifications, `formatMoney(num)` for currency formatting, `HD.stripVN(str)` for Vietnamese text search stripping diacritics.

## Task 3: HTML Template Structure
- **Template ID**: Mapped to `tmpl-human` to align with the lazyLoad convention (`tab-human`).
- **Bootstrap 5 Tabs**: Used standard `nav-tabs` and `tab-content` with `data-bs-toggle="tab"` to handle sub-navigation without extra JS logic.
- **Responsive Layout**: Used `.col-12` for mobile stacking and `.col-lg-8` / `.col-lg-4` for side-by-side layouts on desktop.
- **Naming Convention**: All interactive elements and containers use the `hr-` prefix to avoid global namespace collisions.
- **Placeholders**: Added specific container IDs (e.g., `hr-employee-table-container`) for JS modules to inject dynamic content safely.

## Task 7: Salary Calculation (hr_salary.js)

- **DBSchema salary_records**: fields include employee_id, month, year, base_salary, ot_hours, ot_pay, bonus_total, deduction_total, net_salary, paid, paid_date, note, created_at. Indexed on employee_id + month + year + paid.
- **OT formula**: OT hours calculated per-day from attendance records: if `hours_worked > 8`, excess is OT. OT pay = `ot_hours * (base_salary / 26 / 8 * 1.5)` — standard VN overtime rate.
- **Bonus lookup**: Filter `bonuses` collection by employee_id, then match `date` field month/year

---

## F3: Final QA Verification (May 24, 2026)

**Overall: PASS** ✅ — all 5 scenarios verified.

### Key Findings

- **File count**: 7 files (not 8 as planned). All required modules present; likely a planning discrepancy.
- **Build**: Succeeded in 6.51s. Output: `controller_hr-Bul7R9jv.js` (98.69 kB) + `controller_hr-C17xeuO2.css` (0.26 kB).
- **Role access**: Verified `roleMap.admin` and `roleMap.acc` both include `HumanModule`. `SECURITY_MANAGER.cleanDOM()` correctly removes `.acc-only` and `.admin-only` based on role.
- **CRUD**: Soft delete via `status='inactive'` confirmed. Create/update both use `A.DB.saveRecord()`.
- **Attendance**: `checkIn()` and `checkOut()` both save to `attendance` collection with duplicate detection.
- **Salary**: `calculateSalary()` returns object (unsaved) with OT from attendance + bonuses + deductions. Batch mode via `#calculateAllSalaries()`.
- **Bonus**: `approveBonus()` (pending→approved) and `markBonusPaid()` (approved→paid) with status transition validation.
- **Dashboard**: 4 stat cards (employees, attendance, salary, bonus) + quick action buttons + recent activity feed.
- **Controller**: Imports all 5 sub-modules + `./hr.css`. Registers `shown.bs.tab` listener for tab-aware rendering.
- **UI_Manager**: `case 'tab-human'` calls `HumanModule.init()` then `render()`.
- **Bootstrap events**: Both `show.bs.tab` and `shown.bs.tab` handled in `EventManager.js`, plus local handler in `controller_hr.js`.. Sum `amount` for total.
- **Deductions**: Manual input only (0 by default when auto-calculated). No automatic tax/insurance calculation per requirements.
- **Calculate flow**: `calculateSalary(employeeId, month, year)` → computes all fields → returns object ready for `saveSalaryRecord()`.
- **Batch calculation**: `#calculateAllSalaries()` iterates active employees, skips those with existing records, calculates and saves individually. Serial execution to avoid overwhelming DB.
- **Paid toggle**: `markAsPaid(recordId, newPaidStatus)` updates paid/paid_date fields via `A.DB.saveRecord`. No deletion — records persist.
- **Form editing**: `renderSalaryForm(container, record)` shows all salary fields. Editable: ot_hours, ot_pay, bonus_total, deduction_total, note, paid. Read-only: employee info, base_salary. Live net salary recalculation on input change. "Tính Lại" button re-runs `calculateSalary` from fresh data.
- **Responsive**: Desktop table (`d-none d-md-block`) + mobile cards (`d-md-none`) pattern matching hr_employee.js. Form appears in col-lg-4 side panel.
- **HTML template updated**: Added `hr-salary-form-container` (col-lg-4) alongside `hr-salary-table-container` (col-lg-8) in tpl_hr.html salary tab, matching the bonus tab layout pattern.
- **State management**: `_employees`, `_salaryRecords`, `_bonuses`, `_attendance` arrays loaded at init. `_selectedMonth` (1-based), `_selectedYear` drive filter queries.
- **Error handling**: All async operations wrapped in try/catch with `logA` toast notifications. Refresh button shows spinner during reload.
- **No external dependencies**: Uses only `A.DB` (global), `formatMoney` (global), `getE` (global), `L._()` (global), `logA` (global). Single import: `DB_SCHEMA` from DBSchema.js.
