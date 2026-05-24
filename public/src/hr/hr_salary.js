/**
 * HrSalary — Salary Calculation Sub-module
 * Bảng lương hàng tháng: tính lương, theo dõi thanh toán, tích hợp chấm công
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
            { key: 'bonus_total', label: 'Thưởng', format: 'money' },
            { key: 'ot_pay', label: 'Tăng Ca', format: 'money' },
            { key: 'deduction_total', label: 'Khấu Trừ', format: 'money' },
            { key: 'net_salary', label: 'Thực Nhận', format: 'money' },
            { key: 'paid', label: 'Trạng Thái', format: 'badge' },
        ],
        // Standard VN: 26 working days/month, 8 hours/day, OT rate 1.5x
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
        this._selectedMonth = new Date().getMonth() + 1; // 1-based
        this._selectedYear = new Date().getFullYear();
        this._editingRecord = null;
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
        await this.#loadData();
        this.#renderFilters();
        this.renderSalaryTable(null, this._selectedMonth, this._selectedYear);
        this.#renderFormContainer(null);
    }

    // ─── DATA LOADING ────────────────────────────────────────────────
    async #loadData() {
        try {
            const [emps, salaries, bonuses, attendance] = await Promise.all([
                this.#loadCollection('employees'),
                this.#loadCollection('salary_records'),
                this.#loadCollection('bonuses'),
                this.#loadCollection('attendance'),
            ]);
            this._employees = emps || [];
            this._salaryRecords = salaries || [];
            this._bonuses = bonuses || [];
            this._attendance = attendance || [];
        } catch (e) {
            console.error('HrSalary.#loadData error:', e);
        }
    }

    async #loadCollection(name) {
        try {
            // 1. APP_DATA
            const appData = window.APP_DATA?.[name];
            if (appData && Object.keys(appData).length > 0) {
                return Object.values(appData);
            }

            // 2. IndexedDB
            if (window.A?.DB?.local) {
                const obj = await A.DB.local.getAllAsObject(name);
                if (obj && Object.keys(obj).length > 0) {
                    return Object.values(obj);
                }
            }

            // 3. Firestore
            if (window.A?.DB?.getCollection) {
                const docs = await A.DB.getCollection(name);
                if (Array.isArray(docs) && docs.length > 0) {
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
            await this.#loadData();
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

        if (employees.length === 0) {
            cont.innerHTML = `
                <div class="text-center text-muted py-5 border rounded-4 bg-light">
                    <i class="fa-solid fa-user-slash fa-2x d-block mb-2"></i>
                    Không có nhân viên nào đang làm việc
                </div>
            `;
            return;
        }

        // Build combined display data
        const displayData = employees.map((emp) =>
            this.#buildDisplayRow(emp, month, year)
        );

        // Desktop table
        cont.innerHTML = `
            <div class="d-none d-md-block hr-table-container">
                <table class="table table-hover align-middle mb-0" id="${C.tableId}">
                    <thead class="table-light">
                        <tr>
                            ${C.tableColumns.map((col) => `<th class="fw-bold small">${col.label}</th>`).join('')}
                            <th class="fw-bold small text-end">Thao Tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${displayData.map((row) => this.#renderTableRow(row)).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Mobile cards -->
            <div class="d-md-none">
                ${displayData.map((row) => this.#renderMobileCard(row)).join('')}
            </div>
        `;

        // Bind events
        displayData.forEach((row) => this.#bindRowEvents(row));
    }

    #buildDisplayRow(emp, month, year) {
        const C = HrSalary.Config;
        const record = this.#findSalaryRecord(emp.id, month, year);

        if (record) {
            return {
                id: record.id,
                employee_id: emp.id,
                employee_code: emp.employee_code || '—',
                full_name: emp.full_name || '—',
                base_salary: record.base_salary || 0,
                bonus_total: record.bonus_total || 0,
                ot_hours: record.ot_hours || 0,
                ot_pay: record.ot_pay || 0,
                deduction_total: record.deduction_total || 0,
                net_salary: record.net_salary || 0,
                paid: record.paid || false,
                hasRecord: true,
            };
        }

        return {
            id: null,
            employee_id: emp.id,
            employee_code: emp.employee_code || '—',
            full_name: emp.full_name || '—',
            base_salary: emp.base_salary || 0,
            bonus_total: null,
            ot_hours: null,
            ot_pay: null,
            deduction_total: null,
            net_salary: null,
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

    #renderTableRow(row) {
        const C = HrSalary.Config;
        const prefix = C.prefix;

        if (!row.hasRecord) {
            // No salary record yet
            const cols = C.tableColumns.map((col) => {
                if (col.key === 'employee_code') return `<td>${this._escapeHtml(row.employee_code)}</td>`;
                if (col.key === 'full_name') return `<td>${this._escapeHtml(row.full_name)}</td>`;
                if (col.key === 'base_salary') return `<td>${this.#formatMoney(row.base_salary)}</td>`;
                return `<td class="text-muted fst-italic">—</td>`;
            }).join('');

            return `
                <tr id="${prefix}row-${row.employee_id}" class="hr-salary-row">
                    ${cols}
                    <td class="text-end text-nowrap">
                        <button class="btn btn-sm btn-outline-success" id="${prefix}btn-calc-${row.employee_id}" title="Tính Lương">
                            <i class="fa-solid fa-calculator me-1"></i>Tính Lương
                        </button>
                    </td>
                </tr>
            `;
        }

        // Has salary record
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
            // Bind "Tính Lương" button
            const calcBtn = document.getElementById(`${prefix}btn-calc-${empId}`);
            calcBtn?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.#handleCalculate(empId);
            });
            return;
        }

        // Edit button
        const editBtn = document.getElementById(`${prefix}btn-edit-${empId}`);
        editBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#openEditForm(row);
        });

        // Paid/Unpaid toggle
        const payBtnId = row.paid ? `btn-unpay-${empId}` : `btn-pay-${empId}`;
        const payBtn = document.getElementById(`${prefix}${payBtnId}`);
        payBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.markAsPaid(row.id, !row.paid);
        });
    }

    // ─── CALCULATION ─────────────────────────────────────────────────
    /**
     * Calculate salary for an employee for a given month/year.
     * Auto-computes: net_salary = base_salary + bonuses + ot_pay - deductions
     *
     * @param {string} employeeId
     * @param {number} month - 1-based month
     * @param {number} year
     * @returns {object} salary record data (unsaved)
     */
    calculateSalary(employeeId, month, year) {
        const C = HrSalary.Config;
        const employee = (this._employees || []).find((e) => e.id === employeeId);
        if (!employee) {
            L._('HrSalary: Employee not found:', employeeId);
            return null;
        }

        const baseSalary = Number(employee.base_salary) || 0;

        // ── Bonuses: sum amounts for this employee + month/year ──
        const bonusTotal = this.#calculateBonusTotal(employeeId, month, year);

        // ── OT: calculate from attendance records ──
        const otHours = this.#calculateOTHours(employeeId, month, year);
        const otPay = Math.round(otHours * (baseSalary / C.standardDays / C.standardHours) * C.otRate);

        // ── Deductions: default 0 (manual input) ──
        const deductionTotal = 0;

        // ── Net salary ──
        const netSalary = baseSalary + bonusTotal + otPay - deductionTotal;

        return {
            employee_id: employeeId,
            month,
            year,
            base_salary: baseSalary,
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

    #calculateOTHours(employeeId, month, year) {
        const records = (this._attendance || []).filter((a) => {
            if (a.employee_id !== employeeId) return false;
            if (!a.date) return false;
            const d = new Date(a.date);
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        });

        // OT = hours exceeding 8 per day, summed across the month
        let totalOT = 0;
        for (const r of records) {
            const hours = Number(r.hours_worked) || 0;
            if (hours > HrSalary.Config.standardHours) {
                totalOT += hours - HrSalary.Config.standardHours;
            }
        }
        return Math.round(totalOT * 10) / 10; // 1 decimal precision
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
                // Skip if already has a record for this month
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

    // ─── SALARY FORM (MANUAL ADJUSTMENT) ─────────────────────────────
    #renderFormContainer(record) {
        const container = document.getElementById('hr-salary-form-container');
        if (!container) return;

        if (!record) {
            container.innerHTML = '';
            return;
        }

        const C = HrSalary.Config;
        const employee = (this._employees || []).find((e) => e.id === record.employee_id);

        container.innerHTML = `
            <form id="${C.formId}" class="card border-0 shadow-sm" novalidate>
                <div class="card-header bg-primary bg-gradient text-white">
                    <h6 class="mb-0 fw-bold">
                        <i class="fa-solid fa-money-bill-wave me-2"></i>Điều Chỉnh Lương — ${this._escapeHtml(employee?.full_name || record.employee_id)}
                    </h6>
                </div>
                <div class="card-body p-3">
                    <input type="hidden" name="id" value="${this._escapeHtml(record.id || '')}">
                    <input type="hidden" name="employee_id" value="${this._escapeHtml(record.employee_id || '')}">
                    <input type="hidden" name="month" value="${record._rawMonth || this._selectedMonth}">
                    <input type="hidden" name="year" value="${record._rawYear || this._selectedYear}">

                    <!-- Read-only info -->
                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold text-muted mb-1">Mã NV</label>
                            <input type="text" class="form-control form-control-sm bg-light" readonly
                                value="${this._escapeHtml(employee?.employee_code || '—')}">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold text-muted mb-1">Họ Tên</label>
                            <input type="text" class="form-control form-control-sm bg-light" readonly
                                value="${this._escapeHtml(employee?.full_name || '—')}">
                        </div>
                    </div>

                    <!-- Calculated fields -->
                    <div class="row g-2 mb-2">
                        <div class="col-6 col-md-4">
                            <label class="form-label small fw-bold mb-1">Lương CB</label>
                            <input type="number" class="form-control form-control-sm bg-light" readonly
                                name="base_salary" value="${record.base_salary || 0}">
                        </div>
                        <div class="col-6 col-md-4">
                            <label class="form-label small fw-bold mb-1">Giờ Tăng Ca</label>
                            <input type="number" class="form-control form-control-sm" name="ot_hours"
                                value="${record.ot_hours || 0}" step="0.5" min="0">
                        </div>
                        <div class="col-6 col-md-4">
                            <label class="form-label small fw-bold mb-1">Tiền Tăng Ca</label>
                            <input type="number" class="form-control form-control-sm" name="ot_pay"
                                value="${record.ot_pay || 0}" min="0">
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Tổng Thưởng</label>
                            <input type="number" class="form-control form-control-sm" name="bonus_total"
                                value="${record.bonus_total || 0}" min="0">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Tổng Khấu Trừ</label>
                            <input type="number" class="form-control form-control-sm" name="deduction_total"
                                value="${record.deduction_total || 0}" min="0">
                        </div>
                    </div>

                    <!-- Net salary: auto-calculated display -->
                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Thực Nhận</label>
                            <input type="number" class="form-control form-control-sm bg-light fw-bold" readonly
                                id="${C.prefix}form-net-display" value="${record.net_salary || 0}">
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Đã Thanh Toán</label>
                            <div class="form-check form-switch mt-2">
                                <input class="form-check-input" type="checkbox" name="paid"
                                    id="${C.prefix}form-paid-toggle" ${record.paid ? 'checked' : ''}>
                                <label class="form-check-label small" for="${C.prefix}form-paid-toggle">
                                    ${record.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Note -->
                    <div class="mb-3">
                        <label class="form-label small fw-bold mb-1">Ghi Chú</label>
                        <textarea class="form-control form-control-sm" name="note" rows="2"
                            placeholder="Ghi chú lương">${this._escapeHtml(record.note || '')}</textarea>
                    </div>

                    <!-- Actions -->
                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-sm btn-light" id="${C.prefix}btn-cancel-form">
                            <i class="fa-solid fa-xmark me-1"></i>Hủy
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" id="${C.prefix}btn-recalc-form">
                            <i class="fa-solid fa-calculator me-1"></i>Tính Lại
                        </button>
                        <button type="submit" class="btn btn-sm btn-success">
                            <i class="fa-solid fa-floppy-disk me-1"></i>Lưu
                        </button>
                    </div>
                </div>
            </form>
        `;

        this.#bindFormEvents(record);
    }

    #bindFormEvents(record) {
        const C = HrSalary.Config;

        // Live net salary calculation when editing
        const form = document.getElementById(C.formId);
        if (!form) return;

        const numericFields = ['base_salary', 'bonus_total', 'ot_pay', 'deduction_total'];
        numericFields.forEach((name) => {
            const el = form.querySelector(`[name="${name}"]`);
            el?.addEventListener('input', () => this.#updateNetDisplay());
        });

        // Recalculate button
        const recalcBtn = document.getElementById(`${C.prefix}btn-recalc-form`);
        recalcBtn?.addEventListener('click', () => {
            const fresh = this.calculateSalary(record.employee_id, this._selectedMonth, this._selectedYear);
            if (fresh) {
                form.querySelector('[name="base_salary"]').value = fresh.base_salary;
                form.querySelector('[name="ot_hours"]').value = fresh.ot_hours;
                form.querySelector('[name="ot_pay"]').value = fresh.ot_pay;
                form.querySelector('[name="bonus_total"]').value = fresh.bonus_total;
                form.querySelector('[name="deduction_total"]').value = fresh.deduction_total;
                form.querySelector(`#${C.prefix}form-net-display`).value = fresh.net_salary;
                logA('Đã tính lại lương từ dữ liệu mới nhất.', 'info', 'toast');
            }
        });

        // Cancel button
        const cancelBtn = document.getElementById(`${C.prefix}btn-cancel-form`);
        cancelBtn?.addEventListener('click', () => {
            this.#renderFormContainer(null);
        });

        // Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.#handleFormSave(form, record);
        });

        // Paid toggle label update
        const paidToggle = document.getElementById(`${C.prefix}form-paid-toggle`);
        paidToggle?.addEventListener('change', () => {
            const label = paidToggle.nextElementSibling;
            if (label) {
                label.textContent = paidToggle.checked ? 'Đã thanh toán' : 'Chưa thanh toán';
            }
        });
    }

    #updateNetDisplay() {
        const C = HrSalary.Config;
        const form = document.getElementById(C.formId);
        if (!form) return;

        const base = Number(form.querySelector('[name="base_salary"]')?.value) || 0;
        const bonus = Number(form.querySelector('[name="bonus_total"]')?.value) || 0;
        const otPay = Number(form.querySelector('[name="ot_pay"]')?.value) || 0;
        const deduction = Number(form.querySelector('[name="deduction_total"]')?.value) || 0;
        const net = Math.max(0, base + bonus + otPay - deduction);

        const display = document.getElementById(`${C.prefix}form-net-display`);
        if (display) display.value = net;
    }

    async #handleFormSave(form, originalRecord) {
        const C = HrSalary.Config;
        const submitBtn = form.querySelector('button[type="submit"]');
        const origHTML = submitBtn?.innerHTML || '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang lưu...';
        }

        try {
            const data = {
                id: form.querySelector('[name="id"]')?.value || '',
                employee_id: form.querySelector('[name="employee_id"]')?.value || originalRecord.employee_id,
                month: parseInt(form.querySelector('[name="month"]')?.value, 10) || this._selectedMonth,
                year: parseInt(form.querySelector('[name="year"]')?.value, 10) || this._selectedYear,
                base_salary: Number(form.querySelector('[name="base_salary"]')?.value) || 0,
                ot_hours: Number(form.querySelector('[name="ot_hours"]')?.value) || 0,
                ot_pay: Number(form.querySelector('[name="ot_pay"]')?.value) || 0,
                bonus_total: Number(form.querySelector('[name="bonus_total"]')?.value) || 0,
                deduction_total: Number(form.querySelector('[name="deduction_total"]')?.value) || 0,
                net_salary: Number(document.getElementById(`${C.prefix}form-net-display`)?.value) || 0,
                paid: form.querySelector('[name="paid"]')?.checked || false,
                paid_date: form.querySelector('[name="paid"]')?.checked
                    ? (originalRecord.paid_date || new Date().toISOString().slice(0, 10))
                    : '',
                note: form.querySelector('[name="note"]')?.value?.trim() || '',
            };

            const result = await this.saveSalaryRecord(data);
            if (result?.success) {
                logA('Đã lưu bảng lương thành công!', 'success', 'toast');
                this.#renderFormContainer(null);
            }
        } catch (e) {
            L._('HrSalary: Form save error:', e);
            logA('Có lỗi khi lưu bảng lương. Vui lòng thử lại.', 'error', 'toast');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origHTML;
            }
        }
    }

    #openEditForm(row) {
        const record = this.#findSalaryRecord(row.employee_id, this._selectedMonth, this._selectedYear);
        if (!record) {
            logA('Không tìm thấy bảng lương để chỉnh sửa.', 'warning', 'toast');
            return;
        }

        // Pass the raw DB record to the form, augmented with month/year from state
        const augmented = {
            ...record,
            _rawMonth: this._selectedMonth,
            _rawYear: this._selectedYear,
        };
        this.#renderFormContainer(augmented);
    }

    // ─── PAID TOGGLE ─────────────────────────────────────────────────
    /**
     * Toggle paid status for a salary record.
     * @param {string} recordId
     * @param {boolean} newPaidStatus
     */
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
    /**
     * Create or update a salary record via A.DB.
     * @param {object} data - salary record fields
     * @returns {Promise<{success: boolean, id: string}>}
     */
    async saveSalaryRecord(data) {
        try {
            const result = await A.DB.saveRecord(HrSalary.Config.collection, data);
            if (result.success) {
                // Refresh local data so table reflects changes
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
