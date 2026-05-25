# HR Module Issues

## Known Issues
- LSP is unavailable in this environment (Deno dependency error: `@deno/linux-x64-glibc/package.json` not found)

## T4 - Completed
- No issues encountered during implementation
- Syntax check passed (`node --check` exit 0)
- All 17 key terms confirmed via grep (Giờ Công, Công, STANDARD_HOURS_PER_DAY, #updateHoursWorked, totalCong, totalHours, totalPresentDays, summaryRow, etc.)
- Implementation was already mostly in-place from prior work; added `STANDARD_HOURS_PER_DAY: 8` config constant

## T3: Dashboard Quick Actions → Real Functionality

### Implementation Notes (2026-05-25)

**Changes Made:**
- Replaced `bindEvents()` in `public/src/hr/hr_dashboard.js` (lines 217-324)
- Added `#getAvailableEmployees()` private method - filters active employees without today's attendance record
- Added `#renderSalaryDetail(employeeId)` private method - returns HTML salary breakdown table

**Button Behaviors:**
1. "Thêm Nhân Viên" → calls `this.controller.employee.renderForm(null)`
2. "Chấm Công" → Swal2 select of available employees, then `this.controller.attendance.checkIn(id)`
3. "Xem Bảng Lương" → Swal2 select of all active employees, then Swal2 detail modal

**Data Access Pattern:**
- Uses `this.controller.employee._employees` for employee list (loaded during `employee.init()`)
- Uses `this.controller.attendance.records` for attendance data (loaded during `attendance.init()`)
- Uses `this.controller.salary.calculateSalary(employeeId, month, year)` for salary computation
- Date format: `toLocaleDateString('en-CA')` → `YYYY-MM-DD` (consistent with hr_attendance's `#today()`)
- Active employee filter: `!emp.status || emp.status === 'active' || emp.status === 'probation'` (matches hr_salary.js pattern)

**Verification Results:**
- ✅ No `.click()` calls remain in the file
- ✅ 5 `Swal.fire` occurrences (2 attendance, 3 salary)
- ✅ Helpers defined and called (4 matches)
- ✅ No template/HTML changes made
- ✅ No new dependencies added

## T6: Bonus Form → Swal2 Modal + Revenue Bonus Type

### Implementation Notes (2026-05-25)

**Pre-existing Work:**
- The `renderBonusForm` method was already partially converted to Swal2 before T6 execution
- `badge-gold` CSS class already existed in `hr.css` (line 268-271: `background-color: #D4A017; color: #fff;`)
- `_renderTypeBadge` already had `revenue_bonus` entry with `badge-gold` class

**Changes Made (this session):**
- Added `{ id: 'revenue_bonus', name: 'Thưởng Doanh Số' }` as FIRST item in `typeOptions` config array
- Removed `formContainer` block from `render()` method (lines 67-71 equivalent)
- Updated "Thêm Thưởng" button handler to call `renderBonusForm(null)` (no container param)

**File State Verification:**
- ✅ `Swal.fire` found in `renderBonusForm` at line 528
- ✅ `revenue_bonus` in typeOptions at line 16 (first position)
- ✅ `revenue_bonus` in `_renderTypeBadge` at line 411 with `badge-gold` class
- ✅ Zero matches for `hr-bonus-form-container` — all 5 references removed
- ✅ `badge-gold` CSS: `background-color: #D4A017; color: #fff;` (gold)
- ✅ Form fields: employee (select), type (select w/ revenue_bonus first), amount (number), reason (text), date (date), status (select), reference_id (text)
- ✅ Edit mode pre-fills via `didOpen` callback
- ✅ Save uses `_handleSaveSwal` → `A.DB.saveRecord`
- ✅ `renderBonusForm` signature: `async renderBonusForm(bonusData = null)`
- ✅ Dead code retained: `_handleSave`, `_validateForm` (not called anywhere, but kept per "don't change save logic" directive)

**LSP Unavailable:** LSP timed out (Deno dependency issue) — pre-existing environment problem, not introduced by T6.
