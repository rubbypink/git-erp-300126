export class HrAttendance {
    // ─── CONFIG ────────────────────────────────────────────────
    static STATUS = {
        present: { id: 'present', label: 'Có Mặt', icon: 'fa-circle-check', color: 'success' },
        absent: { id: 'absent', label: 'Vắng', icon: 'fa-circle-xmark', color: 'danger' },
        late: { id: 'late', label: 'Đi Trễ', icon: 'fa-circle-exclamation', color: 'warning' },
        leave: { id: 'leave', label: 'Nghỉ Phép', icon: 'fa-circle-minus', color: 'info' },
    };

    static MONTHS = [
        'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
    ];

    static WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    // ─── CONSTRUCTOR ───────────────────────────────────────────
    constructor(controller) {
        this.controller = controller;
        this.employees = [];
        this.records = [];
        this.currentView = 'table'; // 'table' | 'calendar'
        this.currentDate = this.#today();
        this.currentMonth = new Date().getMonth(); // 0-based
        this.currentYear = new Date().getFullYear();
        this._calendarDelegated = false;
    }

    // ─── INIT ──────────────────────────────────────────────────
    async init() {
        console.log('[HR-Attendance] init()');
        try {
            await this.#loadData();
        } catch (e) {
            console.error('[HR-Attendance] init error:', e);
        }
    }

    async #loadData() {
        try {
            const [emps, atts] = await Promise.all([
                this.#loadCollection('employees'),
                this.#loadCollection('attendance'),
            ]);
            this.employees = emps || [];
            this.records = atts || [];
        } catch (e) {
            console.error('HrAttendance.#loadData error:', e);
            this.employees = [];
            this.records = [];
        }
    }

    async #loadCollection(name) {
        try {
            // 1. Check APP_DATA first (keyed-by-id object)
            const appData = window.APP_DATA?.[name];
            if (appData && Object.keys(appData).length > 0) {
                return Object.values(appData);
            }

            // 2. Fallback to IndexedDB
            if (window.A && window.A.DB && window.A.DB.local) {
                const obj = await window.A.DB.local.getAllAsObject(name);
                if (obj && Object.keys(obj).length > 0) {
                    return Object.values(obj);
                }
            }
        } catch (e) {
            console.warn(`[HR-Attendance] cannot load ${name}:`, e);
        }
        return [];
    }

    // ─── RENDER (MAIN) ─────────────────────────────────────────
    render() {
        console.log('[HR-Attendance] render()');
        const container = document.getElementById('hr-attendance-calendar-container');
        if (!container) return;
        this.#renderFilters();
        if (this.currentView === 'calendar') {
            this.renderCalendar(container, this.currentMonth, this.currentYear);
        } else {
            this.renderAttendanceTable(container, this.currentDate);
        }
    }

    // ─── FILTERS ───────────────────────────────────────────────
    #renderFilters() {
        const filterContainer = document.getElementById('hr-attendance-filter-container');
        if (!filterContainer) return;

        const today = this.#today();
        const monthOptions = HrAttendance.MONTHS.map((name, i) =>
            `<option value="${i}" ${i === this.currentMonth ? 'selected' : ''}>${name}</option>`
        ).join('');

        const viewOptions = `
            <option value="table" ${this.currentView === 'table' ? 'selected' : ''}>📋 Xem theo ngày</option>
            <option value="calendar" ${this.currentView === 'calendar' ? 'selected' : ''}>🗓️ Xem theo tháng</option>
        `;

        filterContainer.innerHTML = `
            <div class="col-12 col-md-4">
                <label class="form-label small fw-bold text-muted">Chế độ xem</label>
                <select class="form-select form-select-sm" id="hr-attendance-view-mode">
                    ${viewOptions}
                </select>
            </div>
            <div class="col-12 col-md-4" id="hr-attendance-date-filter-col">
                <label class="form-label small fw-bold text-muted">Ngày</label>
                <input type="date" class="form-control form-control-sm" id="hr-attendance-date-picker"
                    value="${today}">
            </div>
            <div class="col-12 col-md-4" id="hr-attendance-month-filter-col" style="display:none;">
                <label class="form-label small fw-bold text-muted">Tháng</label>
                <select class="form-select form-select-sm" id="hr-attendance-month-picker">
                    ${monthOptions}
                </select>
            </div>
            <div class="col-12 col-md-4">
                <label class="form-label small fw-bold text-muted">&nbsp;</label>
                <button class="btn btn-primary btn-sm w-100" id="hr-attendance-refresh-btn">
                    <i class="fa-solid fa-rotate me-1"></i>Làm Mới
                </button>
            </div>
        `;

        this.#bindFilterEvents();
    }

    #bindFilterEvents() {
        const viewMode = document.getElementById('hr-attendance-view-mode');
        const datePicker = document.getElementById('hr-attendance-date-picker');
        const monthPicker = document.getElementById('hr-attendance-month-picker');
        const refreshBtn = document.getElementById('hr-attendance-refresh-btn');
        const dateCol = document.getElementById('hr-attendance-date-filter-col');
        const monthCol = document.getElementById('hr-attendance-month-filter-col');

        const toggleView = () => {
            const val = viewMode?.value || 'table';
            this.currentView = val;
            if (dateCol) dateCol.style.display = val === 'calendar' ? 'none' : '';
            if (monthCol) monthCol.style.display = val === 'calendar' ? '' : 'none';
            this.render();
        };

        viewMode?.addEventListener('change', toggleView);
        datePicker?.addEventListener('change', () => {
            this.currentDate = datePicker.value;
            this.render();
        });
        monthPicker?.addEventListener('change', () => {
            this.currentMonth = parseInt(monthPicker.value, 10);
            this.render();
        });
        refreshBtn?.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tải...';
            await this.#loadData();
            this.render();
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate me-1"></i>Làm Mới';
        });
    }

    // ─── DAILY TABLE VIEW ──────────────────────────────────────
    renderAttendanceTable(container, date) {
        const records = this.#getRecordsForDate(date);
        const rows = records.length > 0
            ? records.map(r => this.#buildTableRow(r)).join('')
            : `<tr><td colspan="6" class="text-center text-muted py-4">Chưa có dữ liệu chấm công cho ngày này</td></tr>`;

        container.innerHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h6 class="fw-bold mb-0">
                        <i class="fa-solid fa-list-check me-1"></i>Chấm Công Ngày ${this.#formatDateDisplay(date)}
                    </h6>
                    <div class="d-flex gap-2" id="hr-attendance-quick-actions"></div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0" id="hr-attendance-daily-table">
                        <thead class="table-light">
                            <tr>
                                <th class="ps-3">Nhân Viên</th>
                                <th>Giờ Vào</th>
                                <th>Giờ Ra</th>
                                <th>Giờ Làm</th>
                                <th>Trạng Thái</th>
                                <th class="text-end pe-3">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        this.#renderQuickActions(date);
    }

    #buildTableRow(r) {
        const emp = this.#getEmployeeName(r.employee_id);
        const status = HrAttendance.STATUS[r.status] || HrAttendance.STATUS.present;
        const hours = r.hours_worked != null ? Number(r.hours_worked).toFixed(1) : '—';

        return `
            <tr data-id="${this.#esc(r.id)}">
                <td class="ps-3 fw-bold">${this.#esc(emp)}</td>
                <td><span class="badge bg-light text-dark">${r.check_in || '—'}</span></td>
                <td><span class="badge bg-light text-dark">${r.check_out || '—'}</span></td>
                <td><strong>${hours}h</strong></td>
                <td>
                    <span class="badge bg-${status.color} bg-opacity-10 text-${status.color} border border-${status.color}">
                        <i class="fa-solid ${status.icon} me-1"></i>${status.label}
                    </span>
                </td>
                <td class="text-end pe-3">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary hr-attn-checkin-btn"
                            data-employee="${this.#esc(r.employee_id)}"
                            ${r.check_in ? 'disabled' : ''}>
                            <i class="fa-solid fa-right-to-bracket"></i>
                        </button>
                        <button class="btn btn-outline-success hr-attn-checkout-btn"
                            data-employee="${this.#esc(r.employee_id)}"
                            data-record="${this.#esc(r.id)}"
                            ${!r.check_in || r.check_out ? 'disabled' : ''}>
                            <i class="fa-solid fa-right-from-bracket"></i>
                        </button>
                        <button class="btn btn-outline-danger hr-attn-delete-btn"
                            data-record="${this.#esc(r.id)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    #renderQuickActions(date) {
        const qa = document.getElementById('hr-attendance-quick-actions');
        if (!qa) return;

        const activeEmps = this.employees.filter(e => e.status !== 'inactive');
        const empOptions = activeEmps.map(e =>
            `<option value="${this.#esc(e.id)}">${this.#esc(e.full_name || e.name || e.id)}</option>`
        ).join('');

        qa.innerHTML = `
            <select class="form-select form-select-sm" id="hr-attn-quick-employee" style="width:200px;">
                <option value="">-- Chọn nhân viên --</option>
                ${empOptions}
            </select>
            <button class="btn btn-primary btn-sm" id="hr-attn-quick-checkin">
                <i class="fa-solid fa-right-to-bracket me-1"></i>Check-In
            </button>
            <button class="btn btn-success btn-sm" id="hr-attn-quick-checkout">
                <i class="fa-solid fa-right-from-bracket me-1"></i>Check-Out
            </button>
            <button class="btn btn-outline-warning btn-sm" id="hr-attn-quick-absent">
                <i class="fa-solid fa-circle-xmark me-1"></i>Vắng
            </button>
            <button class="btn btn-outline-info btn-sm" id="hr-attn-quick-leave">
                <i class="fa-solid fa-circle-minus me-1"></i>Nghỉ Phép
            </button>
        `;

        this.#bindQuickActionEvents(date);
        this.#bindTableRowEvents(date);
    }

    #bindQuickActionEvents(date) {
        const sel = document.getElementById('hr-attn-quick-employee');
        const empId = () => sel?.value || '';

        document.getElementById('hr-attn-quick-checkin')?.addEventListener('click', () => {
            const id = empId();
            if (!id) return alert('Vui lòng chọn nhân viên');
            this.checkIn(id, date);
        });
        document.getElementById('hr-attn-quick-checkout')?.addEventListener('click', () => {
            const id = empId();
            if (!id) return alert('Vui lòng chọn nhân viên');
            this.checkOut(id, date);
        });
        document.getElementById('hr-attn-quick-absent')?.addEventListener('click', async () => {
            const id = empId();
            if (!id) return alert('Vui lòng chọn nhân viên');
            await this.#markStatus(id, date, 'absent');
        });
        document.getElementById('hr-attn-quick-leave')?.addEventListener('click', async () => {
            const id = empId();
            if (!id) return alert('Vui lòng chọn nhân viên');
            await this.#markStatus(id, date, 'leave');
        });
    }

    #bindTableRowEvents(date) {
        document.querySelectorAll('.hr-attn-checkin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const empId = btn.dataset.employee;
                if (empId) this.checkIn(empId, date);
            });
        });
        document.querySelectorAll('.hr-attn-checkout-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const empId = btn.dataset.employee;
                const recordId = btn.dataset.record;
                if (empId) this.checkOut(empId, date, recordId);
            });
        });
        document.querySelectorAll('.hr-attn-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const recordId = btn.dataset.record;
                if (recordId && confirm('Xóa bản ghi chấm công này?')) {
                    await this.#deleteAttendance(recordId);
                }
            });
        });
    }

    // ─── MONTHLY CALENDAR VIEW ─────────────────────────────────
    renderCalendar(container, month, year) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
        const activeEmps = this.employees.filter(e => e.status !== 'inactive');

        // Build header row: day numbers
        let headerCells = '';
        for (let d = 1; d <= daysInMonth; d++) {
            const dow = new Date(year, month, d).getDay();
            const isWeekend = dow === 0 || dow === 6;
            headerCells += `<th class="text-center p-1 ${isWeekend ? 'bg-light' : ''}" style="min-width:36px;font-size:0.75rem;">
                <div>${HrAttendance.WEEKDAYS[dow]}</div>
                <div class="fw-bold">${d}</div>
            </th>`;
        }

        // Build employee rows with status cells
        let empRows = '';
        if (activeEmps.length === 0) {
            empRows = `<tr><td colspan="${daysInMonth + 1}" class="text-center text-muted py-4">Chưa có nhân viên nào</td></tr>`;
        } else {
            empRows = activeEmps.map(emp => {
                let cells = '';
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = this.#formatDate(year, month, d);
                    const record = this.#getRecordForEmployeeDate(emp.id, dateStr);
                    const status = record ? (HrAttendance.STATUS[record.status] || HrAttendance.STATUS.present) : null;
                    const dow = new Date(year, month, d).getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const title = status
                        ? `${status.label}${record.hours_worked ? ` (${Number(record.hours_worked).toFixed(1)}h)` : ''}`
                        : 'Chưa chấm công';

                    if (status) {
                        cells += `<td class="text-center p-0 ${isWeekend ? 'bg-light' : ''}" title="${title}">
                            <span class="badge bg-${status.color} bg-opacity-10 text-${status.color} m-1"
                                style="font-size:0.65rem;cursor:pointer;"
                                data-attn-action="editStatus"
                                data-attn-rec-id="${this.#esc(record.id)}">
                                ${status.label.charAt(0)}
                            </span>
                        </td>`;
                    } else {
                        cells += `<td class="text-center p-0 ${isWeekend ? 'bg-light' : ''}" title="${title}">
                            <button class="btn btn-sm btn-outline-secondary border-0 m-0 p-0"
                                style="font-size:0.6rem;width:22px;height:22px;"
                                title="Thêm chấm công ${dateStr}"
                                data-attn-action="quickAdd"
                                data-attn-emp-id="${this.#esc(emp.id)}"
                                data-attn-date="${dateStr}">
                                +
                            </button>
                        </td>`;
                    }
                }
                const empName = emp.full_name || emp.name || emp.id;
                return `<tr>
                    <td class="fw-bold text-nowrap ps-2" style="font-size:0.8rem;" title="${this.#esc(empName)}">${this.#esc(this.#truncate(empName, 16))}</td>
                    ${cells}
                </tr>`;
            }).join('');
        }

        container.__attendance = this;

        container.innerHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-bottom d-flex justify-content-between align-items-center">
                    <button class="btn btn-sm btn-outline-secondary" id="hr-cal-prev-month">
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <h6 class="fw-bold mb-0">${HrAttendance.MONTHS[month]} ${year}</h6>
                    <button class="btn btn-sm btn-outline-secondary" id="hr-cal-next-month">
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
                <div class="table-responsive" style="overflow-x:auto;">
                    <table class="table table-bordered table-sm mb-0" id="hr-attendance-calendar-table">
                        <thead class="table-light">
                            <tr>
                                <th class="ps-2" style="min-width:120px;">Nhân Viên</th>
                                ${headerCells}
                            </tr>
                        </thead>
                        <tbody>${empRows}</tbody>
                    </table>
                </div>
                <div class="card-footer bg-white border-top">
                    <div class="d-flex flex-wrap gap-3">
                        ${Object.values(HrAttendance.STATUS).map(s =>
                            `<span class="small">
                                <span class="badge bg-${s.color} bg-opacity-10 text-${s.color} border border-${s.color} me-1">
                                    <i class="fa-solid ${s.icon}"></i>
                                </span>${s.label}
                            </span>`
                        ).join('')}
                        <span class="text-muted small ms-auto">
                            <i class="fa-solid fa-circle-info me-1"></i>Bấm + để thêm, bấm chữ cái để sửa
                        </span>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('hr-cal-prev-month')?.addEventListener('click', () => {
            if (this.currentMonth === 0) {
                this.currentMonth = 11;
                this.currentYear--;
            } else {
                this.currentMonth--;
            }
            this.renderCalendar(container, this.currentMonth, this.currentYear);
        });
        document.getElementById('hr-cal-next-month')?.addEventListener('click', () => {
            if (this.currentMonth === 11) {
                this.currentMonth = 0;
                this.currentYear++;
            } else {
                this.currentMonth++;
            }
            this.renderCalendar(container, this.currentMonth, this.currentYear);
        });

        // Event delegation for calendar cell actions (replaces inline onclick)
        if (!this._calendarDelegated) {
            container.addEventListener('click', (e) => {
                const actionEl = e.target.closest('[data-attn-action]');
                if (!actionEl) return;
                const action = actionEl.dataset.attnAction;
                if (action === 'quickAdd') {
                    const empId = actionEl.dataset.attnEmpId;
                    const dateStr = actionEl.dataset.attnDate;
                    if (empId && dateStr) this.quickAdd(empId, dateStr);
                } else if (action === 'editStatus') {
                    const recordId = actionEl.dataset.attnRecId;
                    if (recordId) this.editStatus(recordId);
                }
            });
            this._calendarDelegated = true;
        }
    }

    quickAdd(employeeId, dateStr) {
        const emp = this.#getEmployeeName(employeeId);
        const note = prompt(`Thêm chấm công cho ${emp} ngày ${dateStr}\n\nTrạng thái: present/late/absent/leave`, 'present');
        if (!note) return;
        const validStatuses = ['present', 'late', 'absent', 'leave'];
        const status = validStatuses.includes(note.toLowerCase()) ? note.toLowerCase() : 'present';
        this.#markStatus(employeeId, dateStr, status);
    }

    editStatus(recordId) {
        const record = this.records.find(r => r.id === recordId);
        if (!record) return;
        const statuses = Object.keys(HrAttendance.STATUS).join('/');
        const emp = this.#getEmployeeName(record.employee_id);
        const newStatus = prompt(
            `Sửa trạng thái cho ${emp} ngày ${record.date}\n\nChọn: ${statuses}`,
            record.status
        );
        if (!newStatus) return;
        const validStatuses = ['present', 'late', 'absent', 'leave'];
        if (validStatuses.includes(newStatus.toLowerCase())) {
            this.#updateStatus(recordId, newStatus.toLowerCase());
        }
    }

    // ─── CHECK-IN / CHECK-OUT ──────────────────────────────────
    async checkIn(employeeId, dateOverride) {
        const date = dateOverride || this.#today();
        const time = this.#currentTime();

        // Check if already checked in today
        const existing = this.#getRecordForEmployeeDate(employeeId, date);
        if (existing?.check_in) {
            alert('Nhân viên này đã check-in hôm nay rồi.');
            return;
        }

        const record = {
            employee_id: employeeId,
            date: date,
            check_in: time,
            check_out: null,
            hours_worked: null,
            status: 'present',
            created_at: date,
        };

        try {
            if (window.A && window.A.DB) {
                const result = await window.A.DB.saveRecord('attendance', record);
                if (result && result.success !== false) {
                    await this.#loadData();
                    this.render();
                } else {
                    alert('Lỗi khi lưu check-in: ' + (result?.message || 'Không xác định'));
                }
            }
        } catch (e) {
            console.error('checkIn error:', e);
            alert('Lỗi khi check-in: ' + e.message);
        }
    }

    async checkOut(employeeId, dateOverride, recordId) {
        const date = dateOverride || this.#today();
        const time = this.#currentTime();

        // Find existing record
        let record = recordId
            ? this.records.find(r => r.id === recordId)
            : this.#getRecordForEmployeeDate(employeeId, date);

        if (!record) {
            // No check-in yet - create record with both
            const emp = this.#getEmployeeName(employeeId);
            if (!confirm(`Nhân viên ${emp} chưa check-in hôm nay. Tạo bản ghi với giờ ra hiện tại?`)) return;

            record = {
                employee_id: employeeId,
                date: date,
                check_in: null,
                check_out: time,
                hours_worked: null,
                status: 'present',
                created_at: date,
            };

            try {
                if (window.A && window.A.DB) {
                    const result = await window.A.DB.saveRecord('attendance', record);
                    if (result && result.success !== false) {
                        await this.#loadData();
                        this.render();
                    } else {
                        alert('Lỗi khi lưu check-out: ' + (result?.message || 'Không xác định'));
                    }
                }
            } catch (e) {
                console.error('checkOut error:', e);
                alert('Lỗi khi check-out: ' + e.message);
            }
            return;
        }

        if (record.check_out) {
            alert('Nhân viên này đã check-out hôm nay rồi.');
            return;
        }

        const checkInTime = record.check_in || '00:00';
        const hours = this.#calculateHours(checkInTime, time);

        try {
            if (window.A && window.A.DB) {
                await window.A.DB.updateSingle('attendance', record.id, {
                    check_out: time,
                    hours_worked: hours,
                });
                await this.#loadData();
                this.render();
            }
        } catch (e) {
            console.error('checkOut error:', e);
            alert('Lỗi khi check-out: ' + e.message);
        }
    }

    // ─── STATUS MANAGEMENT ─────────────────────────────────────
    async #markStatus(employeeId, date, status) {
        const existing = this.#getRecordForEmployeeDate(employeeId, date);
        if (existing) {
            await this.#updateStatus(existing.id, status);
        } else {
            const record = {
                employee_id: employeeId,
                date: date,
                check_in: null,
                check_out: null,
                hours_worked: null,
                status: status,
                created_at: date,
            };
            try {
                if (window.A && window.A.DB) {
                    await window.A.DB.saveRecord('attendance', record);
                    await this.#loadData();
                    this.render();
                }
            } catch (e) {
                console.error('markStatus error:', e);
                alert('Lỗi: ' + e.message);
            }
        }
    }

    async #updateStatus(recordId, status) {
        try {
            if (window.A && window.A.DB) {
                await window.A.DB.updateSingle('attendance', recordId, { status });
                await this.#loadData();
                this.render();
            }
        } catch (e) {
            console.error('updateStatus error:', e);
            alert('Lỗi: ' + e.message);
        }
    }

    async #deleteAttendance(recordId) {
        try {
            if (window.A && window.A.DB) {
                await window.A.DB.deleteRecord('attendance', recordId);
                await this.#loadData();
                this.render();
            }
        } catch (e) {
            console.error('deleteAttendance error:', e);
            alert('Lỗi: ' + e.message);
        }
    }

    // ─── DATA HELPERS ──────────────────────────────────────────
    #getRecordsForDate(date) {
        return this.records
            .filter(r => r.date === date)
            .sort((a, b) => {
                const nameA = this.#getEmployeeName(a.employee_id);
                const nameB = this.#getEmployeeName(b.employee_id);
                return nameA.localeCompare(nameB);
            });
    }

    #getRecordForEmployeeDate(employeeId, date) {
        return this.records.find(r => r.employee_id === employeeId && r.date === date);
    }

    #getEmployeeName(employeeId) {
        const emp = this.employees.find(e => e.id === employeeId);
        return emp ? (emp.full_name || emp.name || employeeId) : employeeId;
    }

    // ─── CALCULATION HELPERS ───────────────────────────────────
    #calculateHours(checkInTime, checkOutTime) {
        const [inH, inM] = (checkInTime || '00:00').split(':').map(Number);
        const [outH, outM] = (checkOutTime || '00:00').split(':').map(Number);
        const inMinutes = inH * 60 + inM;
        const outMinutes = outH * 60 + outM;
        if (outMinutes <= inMinutes) return 0;
        return parseFloat(((outMinutes - inMinutes) / 60).toFixed(1));
    }

    // ─── DATE HELPERS ──────────────────────────────────────────
    #today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    #currentTime() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    #formatDate(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    #formatDateDisplay(dateStr) {
        const [y, m, d] = (dateStr || '').split('-');
        if (!y || !m || !d) return dateStr;
        return `${d}/${m}/${y}`;
    }

    // ─── STRING HELPERS ────────────────────────────────────────
    #esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    #truncate(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
    }
}
