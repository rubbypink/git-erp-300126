# HR Module Learnings

## Attendance Module (T4)

### Data Structure
- Records: `{employee_id, date, check_in, check_out, hours_worked, status, created_at}`
- `#calculateHours(checkInTime, checkOutTime)` returns float (1 decimal) - minutes-based calculation
- Status values: present, absent, late, leave

### Patterns
- All private methods use `#` prefix
- `#esc()` for HTML escaping in template strings
- `#truncate()` for name display in calendar cells
- Event delegation used for calendar cell actions (single listener on container)
- Render pattern: clear container → build HTML string → innerHTML → bind events
- `window.A.DB.saveRecord()`, `updateSingle()`, `deleteRecord()` for persistence
- After mutations: `await this.#loadData(); this.render();`

### T4 Changes Applied
- Added `STANDARD_HOURS_PER_DAY = 8` to Config
- Daily table: "Giờ Công" column (editable input, min=0, max=24, step=0.5) + "Công" column (hours/8, 2dp)
- Auto-calculate hours from check_in/check_out when both present and hours_worked null/0
- `#updateHoursWorked()` method updates hours_worked via updateSingle, reloads & re-renders
- Calendar cells: show hours (e.g. "8.0h") instead of status letter when hours exist
- Monthly summary tfoot row: total present/late days, total hours, total công
