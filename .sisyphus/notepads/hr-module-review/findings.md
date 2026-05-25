# HR Module Code Quality Review — F2

## Verdict: **APPROVE** (with noted issues)

8 files reviewed (7 source + 1 HTML template, ignoring .bak).

---

## Issues Found

### 1. Unused Import (REQUIRES FIX)
- **File**: `public/src/hr/hr_salary.js`, line 8
- **Issue**: `import { DB_SCHEMA } from '../js/modules/db/DBSchema.js';` — `DB_SCHEMA` is never referenced anywhere in the file.
- **Impact**: Dead code, unnecessary dependency. Could cause tree-shaking or bundling concerns.
- **Fix**: Remove the import line.

### 2. console.log in Production Code (14 instances across all files)
- **Files**: controller_hr.js (5), hr_attendance.js (2), hr_bonus.js (1), hr_dashboard.js (3), hr_employee.js (1), hr_salary.js (1)
- **Pattern**: All are lifecycle trace logs like `console.log('[HR-Employee] render()')`
- **Issue**: The existing codebase uses `L._()` for logging (the HR modules themselves use it for init/error). These should be converted to `L._()` or gated behind a debug flag.
- **Note**: Some other ERP modules also use console.log, so the codebase convention is not strict. But within the HR module itself there is inconsistency — init methods use `L._()` while render methods use `console.log`.

### 3. Private Method Convention Inconsistency (MINOR)
- **hr_employee.js** and **hr_bonus.js** use underscore-prefixed private methods (`_renderTableRow`, `_escapeHtml`)
- **hr_attendance.js**, **hr_salary.js**, and **hr_dashboard.js** use true JS private fields (`#buildTableRow`, `#esc`)
- **Impact**: No functional impact but creates confusion about which convention to follow.
- **Recommendation**: Standardize on `#` (true private) across all modules.

### 4. Global `confirm()` Instead of Swal (MINOR)
- **hr_employee.js** line 572: `const confirmed = confirm(...)`
- **hr_bonus.js** line 797: `const confirmed = confirm(...)`
- **hr_attendance.js** lines 296-311: `alert('Vui lòng chọn nhân viên')`
- **Issue**: `hr_dashboard.js` and form flows use Swal.fire for better UX. Delete confirmations and simple alerts should also use Swal or `logA` for consistency.

### 5. Missing JSDoc Header on HrDashboard (MINOR)
- **hr_dashboard.js**: Missing the file-level JSDoc block present on hr_employee.js (line 1-6), hr_salary.js (line 1-6), and hr_bonus.js (line 1-6).

### 6. Duplicated `_escapeHtml` Method (MINOR)
- Present in: hr_employee.js (line 316-319), hr_bonus.js (line 913-915), hr_salary.js (line 849-856)
- **Issue**: Slight DRY violation. Each module is independent so acceptable, but a shared utility (`HD.escHtml`?) would be cleaner.

### 7. Backup File Left in Source (MINOR)
- `public/src/hr/hr_salary.js.bak` — should be removed or moved outside src/ tree.

---

## What's Good

- **No empty catch blocks**: Every catch either logs via `console.error`, `L._()`, or `console.warn`, and resets state as needed.
- **No commented-out code**: All comments are documentation-style section markers.
- **No broken DOM references**: All 36 `getElementById` calls in JS match either static HTML template IDs or dynamically-created elements.
- **Consistent data loading pattern**: APP_DATA → IndexedDB → Firestore fallback chain is consistent across all modules.
- **Proper null safety**: `?.` optional chaining used throughout. Container existence checks before rendering.
- **Clean event cleanup**: `controller_hr.js` has `destroy()` method that removes listeners properly.
- **Consistent user notification**: `logA()` used uniformly for toast notifications, `L._()` for debug logging.
- **Form validation**: Swal preConfirm hooks validate inputs before submission.
- **No excessive AI slop**: Comments are purposeful, section markers are clear, no over-abstraction.
