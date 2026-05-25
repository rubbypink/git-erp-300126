/**
 * HrSalary — Salary Calculation Sub-module
 * Bảng lương hàng tháng: tính lương theo ngày công thực tế, theo dõi thanh toán, tích hợp chấm công
 *
 * @deps DBSchema.js (salary_records, bonuses, attendance, employees), A.DB, formatMoney, getE, L._, logA
 */

import { DB_SCHEMA } from '../js/modules/db/DBSchema.js';

export class HrSalary {
    // ─── CONFIG ──────────────────────────────────────────────────────
    static Config = {
        prefix: 'hr-salary-',
        tableId: 'hr-salary-table',
        formId: 'hr-salary-form',
        collection: 'salary_records',
        monthNames: [
            'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
            'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
        ],
        tableColumns: [
            { key: 'employee_code', label: 'Mã NV' },
            { key: 'full_name', label: 'Họ Tên' },
            { key: 'base_salary', label: 'Lương CB', format: 'money' },
            { key: 'work_day_count', label: 'Ngày Công', format: 'decimal' },
            { key: 'work_day_pay', label: 'Lương Ngày', format: 'money' },
            { key: 'bonus_total', label: 'Thưởng', format: 'money' },
            { key: 'ot_pay', label: 'Tăng Ca', format: 'money' },
            { key: 'deduction_total', label: 'Khấu Trừ', format: 'money' },
            { key: 'net_salary', label: 'Thực Nhận', format: 'money' },
            { key: 'paid', label: 'Trạng Thái', format: 'badge' },
        ],
        otRate: 1.5,
        standardDays: 26,
        standardHours: 8,
    };

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────
    constructor(controller) {
        this.controller = controller;
        this._employees = [];
        this._salaryRecords = [];
        this._bonuses = [];
        this._attendance = [];
        this._selectedMonth = new Date().getMonth() + 1;
        this._selectedYear = new Date().getFullYear();
    }

    // ─── INIT ────────────────────────────────────────────────────────
    async init() {
        try {
            await this.#loadData();
            L._('HrSalary: Initialized');
        } catch (e) {
            console.error('HrSalary.init error:', e);
        }
    }

    // ─── RENDER (MAIN) ───────────────────────────────────────────────
    async render() {
        console.log('[HR-Salary] render()');
        await this.#loadData();
        this.#renderFilters();
        this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
    }

    // ─── DATA LOADING ────────────────────────────────────────────────
    async #loadData(force = false) {
        try {
            const [emps, salaries, bonuses, attendance] = await Promise.all([
                this.#loadCollection('employees', force),
                this.#loadCollection('salary_records', force),
                this.#loadCollection('bonuses', force),
                this.#loadCollection('attendance', force),
            ]);
            this._employees = emps || [];
            this._salaryRecords = salaries || [];
            this._bonuses = bonuses || [];
            this._attendance = attendance || [];
        } catch (e) {
            console.error('HrSalary.#loadData error:', e);
        }
    }

    async #loadCollection(name, force = false) {
        try {
            if (!force) {
                const appData = window.APP_DATA?.[name];
                if (appData && Object.keys(appData).length > 0) {
                    return Object.values(appData);
                }

                if (window.A?.DB?.local) {
                    const obj = await A.DB.local.getAllAsObject(name);
                    if (obj && Object.keys(obj).length > 0) {
                        return Object.values(obj);
                    }
                }
            }

            if (window.A?.DB?.getCollection) {
                const docs = await A.DB.getCollection(name);
                if (Array.isArray(docs) && docs.length > 0) {
                    // Update cache
                    if (window.APP_DATA) {
                        window.APP_DATA[name] = window.APP_DATA[name] || {};
                        docs.forEach(d => window.APP_DATA[name][d.id] = d);
                    }
                    return docs;
                }
            }
        } catch (e) {
            console.warn(`HrSalary: cannot load ${name}:`, e);
        }
        return [];
    }

    // ─── FILTERS ─────────────────────────────────────────────────────
    #renderFilters() {
        const container = document.getElementById('hr-salary-filter-container');
        if (!container) return;

        const C = HrSalary.Config;
        const monthOptions = C.monthNames.map((name, i) =>
            `<option value="${i + 1}" ${(i + 1) === this._selectedMonth ? 'selected' : ''}>${name}</option>`
        ).join('');

        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i)
            .map((y) => `<option value="${y}" ${y === this._selectedYear ? 'selected' : ''}>Năm ${y}</option>`)
            .join('');

        container.innerHTML = `
            <div class="col-6 col-md-3">
                <label class="form-label small fw-bold text-muted">Tháng</label>
                <select class="form-select form-select-sm" id="${C.prefix}month-picker">
                    ${monthOptions}
                </select>
            </div>
            <div class="col-6 col-md-3">
                <label class="form-label small fw-bold text-muted">Năm</label>
                <select class="form-select form-select-sm" id="${C.prefix}year-picker">
                    ${yearOptions}
                </select>
            </div>
            <div class="col-12 col-md-6 d-flex align-items-end justify-content-md-end gap-2">
                <button class="btn btn-primary btn-sm" id="${C.prefix}btn-refresh">
                    <i class="fa-solid fa-rotate me-1"></i>Làm Mới
                </button>
                <button class="btn btn-success btn-sm" id="${C.prefix}btn-calc-all">
                    <i class="fa-solid fa-calculator me-1"></i>Tính Lương Hàng Loạt
                </button>
            </div>
        `;

        this.#bindFilterEvents();
    }

    #bindFilterEvents() {
        const C = HrSalary.Config;

        const monthPicker = document.getElementById(`${C.prefix}month-picker`);
        const yearPicker = document.getElementById(`${C.prefix}year-picker`);
        const refreshBtn = document.getElementById(`${C.prefix}btn-refresh`);
        const calcAllBtn = document.getElementById(`${C.prefix}btn-calc-all`);

        monthPicker?.addEventListener('change', () => {
            this._selectedMonth = parseInt(monthPicker.value, 10);
            this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
        });

        yearPicker?.addEventListener('change', () => {
            this._selectedYear = parseInt(yearPicker.value, 10);
            this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
        });

        refreshBtn?.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tải...';
            await this.#loadData(true);
            this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate me-1"></i>Làm Mới';
        });

        calcAllBtn?.addEventListener('click', () => {
            this.#calculateAllSalaries();
        });
    }

    // ─── ACTIVE EMPLOYEES ────────────────────────────────────────────
    getActiveEmployees() {
        return (this._employees || []).filter(
            (emp) => !emp.status || emp.status === 'active' || emp.status === 'probation'
        );
    }

    // ─── SALARY TABLE ────────────────────────────────────────────────
    renderSalaryTable(container, month, year) {
        const cont = container || document.getElementById('hr-salary-table-container');
        if (!cont) return;

        const C = HrSalary.Config;
        const employees = this.getActiveEmployees();

        const displayData = employees.map((emp) => this.#buildDisplayRow(emp, month, year));

        cont.innerHTML = `
            <div class="d-none d-md-block">
                <table class="table table-sm table-hover align-middle" id="${C.tableId}">
                    <thead class="table-light">
                        <tr>
                            ${C.tableColumns.map((col) => `<th class="text-nowrap">${col.label}</th>`).join('')}
                            <th class="text-end" style="width:140px;">Thao Tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map((row) => this.#renderTableRow(row)).join('')}
                    </tbody>
                </table>
            </div>

            <div class="d-md-none">
                ${displayData.map((row) => this.#renderMobileCard(row)).join('')}
            </div>
        `;

        displayData.forEach((row) => this.#bindRowEvents(row));
    }

    #buildDisplayRow(emp, month, year) {
        const C = HrSalary.Config;
        const record = this.#findSalaryRecord(emp.id, month, year);

        if (record) {
            const workDays = record.actual_work_days ?? this.#calcWorkDaysFromAttendance(emp.id, month, year);
            const workDayPay = record.work_day_pay ?? Math.round(workDays * ((record.base_salary || 0) / C.standardDays));

            return {
                id: record.id,
                employee_id: emp.id,
                employee_code: emp.employee_code || '—',
                full_name: emp.full_name || '—',
                base_salary: record.base_salary || 0,
                work_day_count: workDays,
                work_day_pay: workDayPay,
                bonus_total: record.bonus_total || 0,
                ot_hours: record.ot_hours || 0,
                ot_pay: record.ot_pay || 0,
                deduction_total: record.deduction_total || 0,
                net_salary: record.net_salary || 0,
                paid: record.paid || false,
                hasRecord: true,
            };
        }

        const baseSalary = emp.base_salary || 0;
        const calcResult = this.calculateSalary(emp.id, month, year);

        return {
            id: null,
            employee_id: emp.id,
            employee_code: emp.employee_code || '—',
            full_name: emp.full_name || '—',
            base_salary: baseSalary,
            work_day_count: calcResult ? calcResult.actual_work_days : 0,
            work_day_pay: calcResult ? calcResult.work_day_pay : 0,
            bonus_total: calcResult ? calcResult.bonus_total : 0,
            ot_hours: calcResult ? calcResult.ot_hours : 0,
            ot_pay: calcResult ? calcResult.ot_pay : 0,
            deduction_total: calcResult ? calcResult.deduction_total : 0,
            net_salary: calcResult ? calcResult.net_salary : 0,
            paid: false,
            hasRecord: false,
        };
    }

    #findSalaryRecord(employeeId, month, year) {
        return (this._salaryRecords || []).find(
            (r) =>
                r.employee_id === employeeId &&
                parseInt(r.month, 10) === month &&
                parseInt(r.year, 10) === year
        ) || null;
    }

    #calcWorkDaysFromAttendance(employeeId, month, year) {
        const C = HrSalary.Config;
        const records = (this._attendance || []).filter((a) => {
            if (a.employee_id !== employeeId) return false;
            if (!a.date) return false;
            const d = new Date(a.date);
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        });

        let workDays = 0;
        for (const r of records) {
            if (r.status === 'absent') continue;
            const hours = Number(r.hours_worked) || 0;
            workDays += Math.min(hours / C.standardHours, 1);
        }

        return Math.round(workDays * 10) / 10;
    }

    #renderTableRow(row) {
        const C = HrSalary.Config;
        const prefix = C.prefix;

        if (!row.hasRecord) {
            const cols = C.tableColumns.map((col) => {
                if (col.key === 'employee_code') return `<td>${this._escapeHtml(row.employee_code)}</td>`;
                if (col.key === 'full_name') return `<td>${this._escapeHtml(row.full_name)}</td>`;
                if (col.key === 'base_salary') return `<td>${this.#formatMoney(row.base_salary)}</td>`;
                if (col.key === 'work_day_count') return `<td>${row.work_day_count ?? '—'}</td>`;
                if (col.key === 'work_day_pay') return `<td>${this.#formatMoney(row.work_day_pay)}</td>`;
                return `<td class="text-muted fst-italic">—</td>`;
            }).join('');

            return `
                <tr id="${prefix}row-${row.employee_id}" class="hr-salary-row">
                    ${cols}
                    <td class="text-end text-nowrap">
                        <button class="btn btn-sm btn-outline-success" id="${prefix}btn-calc-${row.employee_id}">
                            <i class="fa-solid fa-calculator me-1"></i>Tính Lương
                        </button>
                    </td>
                </tr>
            `;
        }

        const cols = C.tableColumns.map((col) => {
            let value;
            switch (col.key) {
                case 'employee_code':
                    value = this._escapeHtml(row.employee_code);
                    break;
                case 'full_name':
                    value = this._escapeHtml(row.full_name);
                    break;
                case 'paid':
                    value = this.#renderPaidBadge(row.paid);
                    break;
                case 'work_day_count':
                    value = row.work_day_count ?? '—';
                    break;
                default:
                    if (col.format === 'money') {
                        value = this.#formatMoney(row[col.key] || 0);
                    } else {
                        value = row[col.key] ?? '—';
                    }
            }
            return `<td>${value}</td>`;
        }).join('');

        const paidBtn = row.paid
            ? `<button class="btn btn-sm btn-outline-secondary me-1" id="${prefix}btn-unpay-${row.employee_id}" title="Đánh dấu chưa thanh toán">
                <i class="fa-solid fa-rotate-left"></i>
               </button>`
            : `<button class="btn btn-sm btn-outline-warning me-1" id="${prefix}btn-pay-${row.employee_id}" title="Đánh dấu đã thanh toán">
                <i class="fa-solid fa-check"></i>
               </button>`;

        return `
            <tr id="${prefix}row-${row.employee_id}" class="hr-salary-row">
                ${cols}
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-1" id="${prefix}btn-edit-${row.employee_id}" title="Điều chỉnh">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    ${paidBtn}
                </td>
            </tr>
        `;
    }

    #renderMobileCard(row) {
        const C = HrSalary.Config;
        const prefix = C.prefix;

        if (!row.hasRecord) {
            return `
                <div class="card mb-2 border" id="${prefix}card-${row.employee_id}">
                    <div class="card-body p-2">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="fw-bold">${this._escapeHtml(row.employee_code)}</span>
                            <span>${this._escapeHtml(row.full_name)}</span>
                        </div>
                        <div class="d-flex justify-content-between small text-muted mb-2">
                            <span>Lương CB: ${this.#formatMoney(row.base_salary)}</span>
                            <span>Ngày Công: ${row.work_day_count ?? '—'}</span>
                        </div>
                        <div class="d-flex justify-content-between small text-muted mb-2">
                            <span>Lương Ngày: ${this.#formatMoney(row.work_day_pay)}</span>
                            <span class="fst-italic">Chưa tính</span>
                        </div>
                        <button class="btn btn-sm btn-outline-success w-100" id="${prefix}btn-calc-${row.employee_id}">
                            <i class="fa-solid fa-calculator me-1"></i>Tính Lương
                        </button>
                    </div>
                </div>
            `;
        }

        const paidBadge = this.#renderPaidBadge(row.paid);
        const paidBtn = row.paid
            ? `<button class="btn btn-sm btn-outline-secondary flex-shrink-0" id="${prefix}btn-unpay-${row.employee_id}">
                <i class="fa-solid fa-rotate-left"></i>
               </button>`
            : `<button class="btn btn-sm btn-outline-warning flex-shrink-0" id="${prefix}btn-pay-${row.employee_id}">
                <i class="fa-solid fa-check"></i>
               </button>`;

        return `
            <div class="card mb-2 border" id="${prefix}card-${row.employee_id}">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-bold">${this._escapeHtml(row.employee_code)}</span>
                        <span>${this._escapeHtml(row.full_name)}</span>
                    </div>
                    <div class="row small g-1 mb-2">
                        <div class="col-6"><i class="fa-solid fa-coins me-1 text-muted"></i>Lương CB: ${this.#formatMoney(row.base_salary)}</div>
                        <div class="col-6"><i class="fa-solid fa-calendar-day me-1 text-muted"></i>Ngày Công: ${row.work_day_count ?? '—'}</div>
                        <div class="col-6"><i class="fa-solid fa-money-bill-wave me-1 text-muted"></i>Lương Ngày: ${this.#formatMoney(row.work_day_pay)}</div>
                        <div class="col-6"><i class="fa-solid fa-gift me-1 text-muted"></i>Thưởng: ${this.#formatMoney(row.bonus_total)}</div>
                        <div class="col-6"><i class="fa-solid fa-clock me-1 text-muted"></i>Tăng Ca: ${this.#formatMoney(row.ot_pay)}</div>
                        <div class="col-6"><i class="fa-solid fa-minus-circle me-1 text-muted"></i>Khấu Trừ: ${this.#formatMoney(row.deduction_total)}</div>
                        <div class="col-12 fw-bold"><i class="fa-solid fa-wallet me-1 text-success"></i>Thực Nhận: ${this.#formatMoney(row.net_salary)}</div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span>${paidBadge}</span>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary" id="${prefix}btn-edit-${row.employee_id}">
                                <i class="fa-solid fa-pen-to-square me-1"></i>Sửa
                            </button>
                            ${paidBtn}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    #bindRowEvents(row) {
        const C = HrSalary.Config;
        const prefix = C.prefix;
        const empId = row.employee_id;

        if (!row.hasRecord) {
            const calcBtn = document.getElementById(`${prefix}btn-calc-${empId}`);
            calcBtn?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.#handleCalculate(empId);
            });
            return;
        }

        const editBtn = document.getElementById(`${prefix}btn-edit-${empId}`);
        editBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#openEditForm(row);
        });

        const payBtnId = row.paid ? `btn-unpay-${empId}` : `btn-pay-${empId}`;
        const payBtn = document.getElementById(`${prefix}${payBtnId}`);
        payBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.markAsPaid(row.id, !row.paid);
        });
    }

    // ─── CALCULATION ─────────────────────────────────────────────────
    calculateSalary(employeeId, month, year) {
        const C = HrSalary.Config;
        const employee = (this._employees || []).find((e) => e.id === employeeId);
        if (!employee) {
            L._('HrSalary: Employee not found:', employeeId);
            return null;
        }

        const baseSalary = Number(employee.base_salary) || 0;
        const dailyRate = baseSalary / C.standardDays;
        const hourlyRate = dailyRate / C.standardHours;

        const { actualWorkDays, otHours } = this.#calculateWorkDaysAndOT(employeeId, month, year);
        const workDayPay = Math.round(actualWorkDays * dailyRate);

        const otPay = Math.round(otHours * hourlyRate * C.otRate);

        const bonusTotal = this.#calculateBonusTotal(employeeId, month, year);

        const deductionTotal = 0;

        const netSalary = workDayPay + bonusTotal + otPay - deductionTotal;

        return {
            employee_id: employeeId,
            month,
            year,
            base_salary: baseSalary,
            actual_work_days: actualWorkDays,
            work_day_pay: workDayPay,
            ot_hours: otHours,
            ot_pay: otPay,
            bonus_total: bonusTotal,
            deduction_total: deductionTotal,
            net_salary: Math.max(0, netSalary),
            paid: false,
            paid_date: '',
            note: '',
            created_at: new Date().toISOString().slice(0, 10),
        };
    }

    #calculateBonusTotal(employeeId, month, year) {
        return (this._bonuses || [])
            .filter((b) => {
                if (b.employee_id !== employeeId) return false;
                if (!b.date) return false;
                const d = new Date(b.date);
                return d.getMonth() + 1 === month && d.getFullYear() === year;
            })
            .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    }

    #calculateWorkDaysAndOT(employeeId, month, year) {
        const C = HrSalary.Config;
        const records = (this._attendance || []).filter((a) => {
            if (a.employee_id !== employeeId) return false;
            if (!a.date) return false;
            const d = new Date(a.date);
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        });

        const baseHoursPerDay = C.standardHours;
        let actualWorkDays = 0;
        let totalOT = 0;

        for (const r of records) {
            const hours = Number(r.hours_worked) || 0;
            if (r.status === 'absent') continue;

            actualWorkDays += Math.min(hours / baseHoursPerDay, 1);

            if (hours > baseHoursPerDay) {
                totalOT += hours - baseHoursPerDay;
            }
        }

        return {
            actualWorkDays: Math.round(actualWorkDays * 10) / 10,
            otHours: Math.round(totalOT * 10) / 10,
        };
    }

    async #handleCalculate(employeeId) {
        const btn = document.getElementById(`${HrSalary.Config.prefix}btn-calc-${employeeId}`);
        const origHTML = btn?.innerHTML || '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tính...';
        }

        try {
            const data = this.calculateSalary(employeeId, this._selectedMonth, this._selectedYear);
            if (!data) {
                logA('Không tìm thấy nhân viên để tính lương.', 'warning', 'toast');
                return;
            }

            await this.saveSalaryRecord(data);
        } catch (e) {
            L._('HrSalary: Calculate error:', e);
            logA('Có lỗi khi tính lương. Vui lòng thử lại.', 'error', 'toast');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHTML;
            }
        }
    }

    async #calculateAllSalaries() {
        const C = HrSalary.Config;
        const btn = document.getElementById(`${C.prefix}btn-calc-all`);
        const origHTML = btn?.innerHTML || '';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tính hàng loạt...';
        }

        try {
            const employees = this.getActiveEmployees();
            const month = this._selectedMonth;
            const year = this._selectedYear;
            let successCount = 0;

            for (const emp of employees) {
                if (this.#findSalaryRecord(emp.id, month, year)) continue;

                const data = this.calculateSalary(emp.id, month, year);
                if (!data) continue;

                const result = await this.saveSalaryRecord(data);
                if (result?.success) successCount++;
            }

            logA(
                `Đã tính lương cho ${successCount}/${employees.length} nhân viên.`,
                'success',
                'toast'
            );
        } catch (e) {
            L._('HrSalary: Batch calculate error:', e);
            logA('Có lỗi khi tính lương hàng loạt.', 'error', 'toast');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHTML;
            }
        }
    }

    // ─── SALARY EDIT FORM (Swal2 Modal) ──────────────────────────────
    #openEditForm(row) {
        const record = this.#findSalaryRecord(row.employee_id, this._selectedMonth, this._selectedYear);
        if (!record) {
            logA('Không tìm thấy bảng lương để chỉnh sửa.', 'warning', 'toast');
            return;
        }
        this.#showSalaryEditSwal(record);
    }

    async #showSalaryEditSwal(originalRecord) {
        const C = HrSalary.Config;
        const employee = (this._employees || []).find((e) => e.id === originalRecord.employee_id);

        const baseSalary = Number(originalRecord.base_salary) || 0;
        const workDayPay = originalRecord.work_day_pay != null ? originalRecord.work_day_pay : 0;
        const bonusTotal = Number(originalRecord.bonus_total) || 0;
        const otPay = Number(originalRecord.ot_pay) || 0;
        const deductionTotal = Number(originalRecord.deduction_total) || 0;
        const note = originalRecord.note || '';
        const isPaid = originalRecord.paid || false;

        const pfx = C.prefix + 'swal-';

        const result = await Swal.fire({
            title: `Điều Chỉnh Lương — ${this._escapeHtml(employee?.full_name || originalRecord.employee_id)}`,
            html: `
                <div class="text-start">
                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Mã NV</label>
                            <input type="text" class="swal2-input form-control form-control-sm bg-light" readonly
                                value="${this._escapeHtml(employee?.employee_code || '—')}">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Họ Tên</label>
                            <input type="text" class="swal2-input form-control form-control-sm bg-light" readonly
                                value="${this._escapeHtml(employee?.full_name || '—')}">
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6 col-md-4">
                            <label class="form-label small fw-bold mb-1">Lương CB</label>
                            <input type="text" class="swal2-input form-control form-control-sm bg-light" readonly
                                value="${this.#formatMoney(baseSalary)}">
                        </div>
                        <div class="col-6 col-md-4">
                            <label class="form-label small fw-bold mb-1">Lương Ngày</label>
                            <input type="text" id="${pfx}workdaypay" class="swal2-input form-control form-control-sm bg-light" readonly
                                value="${this.#formatMoney(workDayPay)}">
                        </div>
                        <div class="col-6 col-md-4">
                            <label class="form-label small fw-bold mb-1">Thực Nhận</label>
                            <input type="text" id="${pfx}net-display" class="swal2-input form-control form-control-sm bg-light fw-bold" readonly
                                value="${this.#formatMoney(Math.max(0, workDayPay + bonusTotal + otPay - deductionTotal))}">
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Tổng Thưởng</label>
                            <input type="text" class="swal2-input form-control form-control-sm bg-light" readonly
                                value="${this.#formatMoney(bonusTotal)}">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Tiền Tăng Ca</label>
                            <input type="text" class="swal2-input form-control form-control-sm bg-light" readonly
                                value="${this.#formatMoney(otPay)}">
                        </div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Tổng Khấu Trừ</label>
                        <input type="number" id="${pfx}deduction" class="swal2-input form-control form-control-sm"
                            value="${deductionTotal}" min="0" step="1000">
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Ghi Chú</label>
                        <textarea id="${pfx}note" class="swal2-textarea form-control form-control-sm" rows="2"
                            placeholder="Ghi chú lương">${this._escapeHtml(note)}</textarea>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Trạng Thái Thanh Toán</label>
                        <div class="form-check form-switch mt-1">
                            <input class="form-check-input" type="checkbox" id="${pfx}paid" ${isPaid ? 'checked' : ''}>
                            <label class="form-check-label small" for="${pfx}paid">${isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}</label>
                        </div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-floppy-disk me-1"></i>Cập Nhật',
            cancelButtonText: 'Hủy',
            width: 600,
            didOpen: () => {
                const dedEl = document.getElementById(`${pfx}deduction`);
                const netEl = document.getElementById(`${pfx}net-display`);
                const paidEl = document.getElementById(`${pfx}paid`);

                if (dedEl && netEl) {
                    const fmt = (v) => typeof formatMoney === 'function' ? formatMoney(v) : v.toLocaleString('vi-VN');
                    dedEl.addEventListener('input', () => {
                        const d = Number(dedEl.value) || 0;
                        const net = Math.max(0, workDayPay + bonusTotal + otPay - d);
                        netEl.value = fmt(net);
                    });
                }

                if (paidEl) {
                    paidEl.addEventListener('change', () => {
                        const label = paidEl.nextElementSibling;
                        if (label) {
                            label.textContent = paidEl.checked ? 'Đã thanh toán' : 'Chưa thanh toán';
                        }
                    });
                }
            },
            preConfirm: () => {
                const deduction = Number(document.getElementById(`${pfx}deduction`)?.value) || 0;
                const noteVal = document.getElementById(`${pfx}note`)?.value?.trim() || '';
                const paid = document.getElementById(`${pfx}paid`)?.checked || false;
                const net = Math.max(0, workDayPay + bonusTotal + otPay - deduction);

                return {
                    deduction_total: deduction,
                    net_salary: net,
                    note: noteVal,
                    paid,
                };
            },
        });

        if (result.isConfirmed) {
            const formData = result.value;
            const data = {
                id: originalRecord.id || '',
                employee_id: originalRecord.employee_id,
                month: this._selectedMonth,
                year: this._selectedYear,
                base_salary: baseSalary,
                actual_work_days: originalRecord.actual_work_days || 0,
                work_day_pay: workDayPay,
                ot_hours: originalRecord.ot_hours || 0,
                ot_pay: otPay,
                bonus_total: bonusTotal,
                deduction_total: formData.deduction_total,
                net_salary: formData.net_salary,
                paid: formData.paid,
                paid_date: formData.paid
                    ? (originalRecord.paid_date || new Date().toISOString().slice(0, 10))
                    : '',
                note: formData.note,
            };

            const saveResult = await this.saveSalaryRecord(data);
            if (saveResult?.success) {
                logA('Đã lưu bảng lương thành công!', 'success', 'toast');
            }
        }
    }

    // ─── PAID TOGGLE ─────────────────────────────────────────────────
    async markAsPaid(recordId, newPaidStatus) {
        try {
            const allRecords = await this.#loadCollection('salary_records');
            const record = (allRecords || []).find((r) => r.id === recordId);

            if (!record) {
                logA('Không tìm thấy bảng lương.', 'error', 'toast');
                return;
            }

            const updated = {
                ...record,
                paid: newPaidStatus,
                paid_date: newPaidStatus ? new Date().toISOString().slice(0, 10) : '',
            };

            const result = await A.DB.saveRecord(HrSalary.Config.collection, updated);
            if (result.success) {
                logA(
                    newPaidStatus ? 'Đã đánh dấu đã thanh toán.' : 'Đã đánh dấu chưa thanh toán.',
                    'success',
                    'toast'
                );
                await this.#loadData();
                this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
            } else {
                logA(result.message || 'Lỗi khi cập nhật trạng thái thanh toán.', 'error', 'toast');
            }
        } catch (e) {
            L._('HrSalary: markAsPaid error:', e);
            logA('Có lỗi xảy ra khi cập nhật trạng thái thanh toán.', 'error', 'toast');
        }
    }

    // ─── SAVE ────────────────────────────────────────────────────────
    async saveSalaryRecord(data) {
        try {
            const result = await A.DB.saveRecord(HrSalary.Config.collection, data);
            if (result.success) {
                await this.#loadData();
                this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
            }
            return result;
        } catch (e) {
            L._('HrSalary: saveSalaryRecord error:', e);
            throw e;
        }
    }

    // ─── UTILITY ─────────────────────────────────────────────────────
    #renderPaidBadge(paid) {
        if (paid) {
            return '<span class="badge hr-status-badge bg-success">Đã TT</span>';
        }
        return '<span class="badge hr-status-badge bg-warning text-dark">Chưa TT</span>';
    }

    #formatMoney(value) {
        const num = Number(value) || 0;
        if (typeof formatMoney === 'function') {
            return formatMoney(num);
        }
        return num.toLocaleString('vi-VN');
    }

    _escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
