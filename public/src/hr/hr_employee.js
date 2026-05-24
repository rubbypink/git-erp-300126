/**
 * HrEmployee — Employee CRUD Sub-module
 * Quản lý danh sách nhân viên: Thêm, Sửa, Xóa mềm, Tìm kiếm, Lọc
 *
 * @deps DBSchema.js (employees collection), DBManager (A.DB), HD (form helpers)
 */

import { DB_SCHEMA } from '../js/modules/db/DBSchema.js';

export class HrEmployee {
    // ─── CONFIG ──────────────────────────────────────────────────────
    static Config = {
        prefix: 'hr-emp-',
        tableId: 'hr-employee-table',
        formId: 'hr-employee-form',
        collection: 'employees',
        statusOptions: [
            { id: 'active', name: 'Đang Làm' },
            { id: 'inactive', name: 'Nghỉ Việc' },
            { id: 'suspended', name: 'Tạm Ngừng' },
            { id: 'probation', name: 'Thử Việc' },
        ],
        departmentOptions: ['Sales', 'Operations', 'Accounting', 'HR', 'Marketing', 'IT'],
        positionOptions: ['Quản Lý', 'Trưởng Phòng', 'Nhân Viên', 'Thực Tập', 'Cộng Tác Viên'],
        tableColumns: [
            { key: 'employee_code', label: 'Mã NV' },
            { key: 'full_name', label: 'Họ Tên' },
            { key: 'phone', label: 'SĐT' },
            { key: 'position', label: 'Chức Vụ' },
            { key: 'department', label: 'Phòng Ban' },
            { key: 'base_salary', label: 'Lương CB', format: 'money' },
            { key: 'status', label: 'Trạng Thái', format: 'badge' },
        ],
    };

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────
    constructor(controller) {
        this.controller = controller;
        this._employees = null;
        this._selectedId = null;
        this._searchQuery = '';
        this._filterDepartment = '';
        this._filterStatus = '';
    }

    // ─── INIT ────────────────────────────────────────────────────────
    init() {
        L._('HrEmployee: Initialized');
    }

    // ─── RENDER ──────────────────────────────────────────────────────
    async render() {
        const content = getE('hr-employee-content');
        if (!content) return;

        // Show loading state
        content.querySelector('#hr-employee-table-container').innerHTML = `
            <div class="text-center text-muted py-5 border rounded-4 bg-light">
                <i class="fa-solid fa-spinner fa-spin me-2"></i>Đang tải danh sách nhân viên...
            </div>
        `;

        await this.loadEmployees();
        this.renderFilterBar();
        this.renderTable();
        this.renderForm(null);
    }

    // ─── DATA ────────────────────────────────────────────────────────
    async loadEmployees() {
        try {
            // 1. Check APP_DATA first (keyed by id object)
            const appData = window.APP_DATA?.employees;
            if (appData && Object.keys(appData).length > 0) {
                this._employees = Object.values(appData);
                return;
            }

            // 2. Fallback to IndexedDB
            const obj = await A.DB.local.getAllAsObject(HrEmployee.Config.collection);
            if (obj && Object.keys(obj).length > 0) {
                this._employees = Object.values(obj);
                return;
            }

            // 3. Last resort: attempt Firestore
            try {
                const docs = await A.DB.getCollection(HrEmployee.Config.collection);
                if (Array.isArray(docs) && docs.length > 0) {
                    this._employees = docs;
                    return;
                }
            } catch (e) {
                L._('HrEmployee: Firestore load skipped — offline mode');
            }

            this._employees = [];
        } catch (e) {
            L._('HrEmployee: Error loading employees:', e);
            this._employees = [];
        }
    }

    getFiltered() {
        let list = this._employees || [];
        const q = this._searchQuery ? HD.stripVN(this._searchQuery).toLowerCase() : '';

        if (q) {
            list = list.filter((emp) => {
                const name = HD.stripVN(emp.full_name || '').toLowerCase();
                const phone = (emp.phone || '').replace(/[^0-9]/g, '');
                return name.includes(q) || phone.includes(q);
            });
        }

        if (this._filterDepartment) {
            list = list.filter((emp) => emp.department === this._filterDepartment);
        }

        if (this._filterStatus) {
            list = list.filter((emp) => emp.status === this._filterStatus);
        }

        return list;
    }

    // ─── FILTER BAR ──────────────────────────────────────────────────
    renderFilterBar() {
        const container = getE('hr-employee-filter-container');
        if (!container) return;

        const C = HrEmployee.Config;
        const deptOpts = C.departmentOptions.map((d) => `<option value="">Tất Cả Phòng Ban</option>` +
            C.departmentOptions.map((d) => `<option value="${d}">${d}</option>`).join('')).filter((v, i, a) => i === 0 || !v.startsWith('<option value="">'));

        // Deduplicated department options render
        const deptHTML = ['<option value="">Tất Cả Phòng Ban</option>']
            .concat(C.departmentOptions.map((d) => `<option value="${d}">${d}</option>`))
            .join('');

        const statusHTML = ['<option value="">Tất Cả Trạng Thái</option>']
            .concat(C.statusOptions.map((s) => `<option value="${s.id}">${s.name}</option>`))
            .join('');

        container.innerHTML = `
            <div class="col-12 col-md-4">
                <div class="input-group">
                    <span class="input-group-text bg-white"><i class="fa-solid fa-search"></i></span>
                    <input type="text" class="form-control" id="${C.prefix}search" placeholder="Tìm theo tên hoặc SĐT..."
                        value="${this._escapeHtml(this._searchQuery)}">
                </div>
            </div>
            <div class="col-6 col-md-2">
                <select class="form-select" id="${C.prefix}filter-dept">
                    ${deptHTML}
                </select>
            </div>
            <div class="col-6 col-md-2">
                <select class="form-select" id="${C.prefix}filter-status">
                    ${statusHTML}
                </select>
            </div>
            <div class="col-12 col-md-4 d-flex justify-content-md-end">
                <button class="btn btn-primary" id="${C.prefix}btn-add">
                    <i class="fa-solid fa-plus me-1"></i>Thêm Nhân Viên
                </button>
            </div>
        `;

        // Pre-set filter values
        if (this._filterDepartment) {
            getE(`${C.prefix}filter-dept`).value = this._filterDepartment;
        }
        if (this._filterStatus) {
            getE(`${C.prefix}filter-status`).value = this._filterStatus;
        }

        getE(`${C.prefix}search`).addEventListener('input', () => {
            this._searchQuery = getE(`${C.prefix}search`).value;
            this.renderTable();
        });

        getE(`${C.prefix}filter-dept`).addEventListener('change', () => {
            this._filterDepartment = getE(`${C.prefix}filter-dept`).value;
            this.renderTable();
        });

        getE(`${C.prefix}filter-status`).addEventListener('change', () => {
            this._filterStatus = getE(`${C.prefix}filter-status`).value;
            this.renderTable();
        });

        getE(`${C.prefix}btn-add`).addEventListener('click', () => {
            this.renderForm(null);
        });
    }

    // ─── TABLE ───────────────────────────────────────────────────────
    renderTable() {
        const container = getE('hr-employee-table-container');
        if (!container) return;

        const employees = this.getFiltered();
        const C = HrEmployee.Config;

        if (employees.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5 border rounded-4 bg-light">
                    <i class="fa-solid fa-user-slash fa-2x d-block mb-2"></i>
                    Không tìm thấy nhân viên nào
                </div>
            `;
            return;
        }

        // Desktop table
        const tableHTML = `
            <div class="d-none d-md-block hr-table-container">
                <table class="table table-hover align-middle mb-0" id="${C.tableId}">
                    <thead class="table-light">
                        <tr>
                            ${C.tableColumns.map((col) => `<th class="fw-bold small">${col.label}</th>`).join('')}
                            <th class="fw-bold small text-end">Thao Tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${employees.map((emp) => this._renderTableRow(emp)).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Mobile cards -->
            <div class="d-md-none">
                ${employees.map((emp) => this._renderMobileCard(emp)).join('')}
            </div>
        `;

        container.innerHTML = tableHTML;

        employees.forEach((emp) => this._bindRowEvents(emp.id));
    }

    _renderTableRow(emp) {
        const C = HrEmployee.Config;
        const cols = C.tableColumns.map((col) => {
            let value = emp[col.key] ?? '';
            if (col.format === 'money') {
                value = typeof formatMoney === 'function' ? formatMoney(value) : Number(value).toLocaleString('vi-VN');
            } else if (col.format === 'badge') {
                value = this._renderStatusBadge(value);
            }
            return `<td>${value}</td>`;
        }).join('');

        return `
            <tr id="${C.prefix}row-${emp.id}" class="hr-employee-row" style="cursor:pointer">
                ${cols}
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-1" id="${C.prefix}btn-edit-${emp.id}" title="Sửa">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" id="${C.prefix}btn-del-${emp.id}" title="Xóa">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    }

    _renderMobileCard(emp) {
        const C = HrEmployee.Config;
        return `
            <div class="card border-0 shadow-sm mb-2 hr-employee-card" id="${C.prefix}card-${emp.id}">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="fw-bold mb-0">${this._escapeHtml(emp.full_name || '—')}</h6>
                            <small class="text-muted">${this._escapeHtml(emp.employee_code || '—')}</small>
                        </div>
                        ${this._renderStatusBadge(emp.status)}
                    </div>
                    <div class="row g-1 small text-muted">
                        <div class="col-6"><i class="fa-solid fa-phone me-1"></i>${this._escapeHtml(emp.phone || '—')}</div>
                        <div class="col-6"><i class="fa-solid fa-briefcase me-1"></i>${this._escapeHtml(emp.position || '—')}</div>
                        <div class="col-6"><i class="fa-solid fa-building me-1"></i>${this._escapeHtml(emp.department || '—')}</div>
                        <div class="col-6"><i class="fa-solid fa-dollar-sign me-1"></i>${typeof formatMoney === 'function' ? formatMoney(emp.base_salary) : Number(emp.base_salary || 0).toLocaleString('vi-VN')}</div>
                    </div>
                    <div class="d-flex justify-content-end gap-1 mt-2">
                        <button class="btn btn-sm btn-outline-primary" id="${C.prefix}btn-edit-${emp.id}">
                            <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                        <button class="btn btn-sm btn-outline-danger" id="${C.prefix}btn-del-${emp.id}">
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                    </div>
                </div>
            </div>`;
    }

    _renderStatusBadge(status) {
        const map = {
            active: 'bg-success',
            inactive: 'bg-secondary',
            suspended: 'bg-warning text-dark',
            probation: 'bg-info text-dark',
        };
        const labels = {
            active: 'Đang Làm',
            inactive: 'Nghỉ Việc',
            suspended: 'Tạm Ngừng',
            probation: 'Thử Việc',
        };
        const cls = map[status] || 'bg-light text-dark';
        const label = labels[status] || (status || '—');
        return `<span class="badge hr-status-badge ${cls}">${label}</span>`;
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _bindRowEvents(empId) {
        const C = HrEmployee.Config;

        const row = getE(`${C.prefix}row-${empId}`);
        if (row) {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._selectEmployee(empId);
            });
        }

        const card = getE(`${C.prefix}card-${empId}`);
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._selectEmployee(empId);
            });
        }

        const editBtn = getE(`${C.prefix}btn-edit-${empId}`);
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._selectEmployee(empId);
            });
        }

        const delBtn = getE(`${C.prefix}btn-del-${empId}`);
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(empId);
            });
        }
    }

    _selectEmployee(empId) {
        this._selectedId = empId;
        const emp = (this._employees || []).find((e) => e.id === empId);
        if (emp) {
            this.renderForm(emp);
        }

        // Highlight selected row
        document.querySelectorAll('.hr-employee-row, .hr-employee-card')
            .forEach((el) => el.classList.remove('border-primary', 'bg-primary-subtle'));
        const row = getE(`${HrEmployee.Config.prefix}row-${empId}`);
        const card = getE(`${HrEmployee.Config.prefix}card-${empId}`);
        if (row) row.classList.add('bg-primary-subtle');
        if (card) card.classList.add('border-primary');
    }

    // ─── FORM ────────────────────────────────────────────────────────
    renderForm(employeeData = null) {
        const container = getE('hr-employee-form-container');
        if (!container) return;

        const C = HrEmployee.Config;
        const isEdit = !!employeeData;
        const title = isEdit ? 'Chỉnh Sửa Nhân Viên' : 'Thêm Nhân Viên Mới';
        const btnLabel = isEdit ? 'Cập Nhật' : 'Lưu Nhân Viên';
        const btnIcon = isEdit ? 'fa-floppy-disk' : 'fa-plus';

        const deptHTML = C.departmentOptions.map((d) => `<option value="${d}">${d}</option>`).join('');
        const posHTML = C.positionOptions.map((p) => `<option value="${p}">${p}</option>`).join('');
        const statusHTML = C.statusOptions.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

        const formHTML = `
            <form id="${C.formId}" class="card border-0 shadow-sm" novalidate>
                <div class="card-header bg-primary bg-gradient text-white">
                    <h6 class="mb-0 fw-bold"><i class="fa-solid fa-id-card me-2"></i>${title}</h6>
                </div>
                <div class="card-body p-3">
                    <input type="hidden" name="id" value="${isEdit ? this._escapeHtml(employeeData.id || '') : ''}">

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Mã NV <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" name="employee_code"
                            placeholder="NV001" required
                            value="${isEdit ? this._escapeHtml(employeeData.employee_code || '') : ''}">
                        <div class="invalid-feedback small">Vui lòng nhập mã nhân viên (2-20 ký tự)</div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Họ Tên <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" name="full_name"
                            placeholder="Họ và tên" required
                            value="${isEdit ? this._escapeHtml(employeeData.full_name || '') : ''}">
                        <div class="invalid-feedback small">Vui lòng nhập họ tên (2-100 ký tự)</div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Số Điện Thoại <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm phone" name="phone"
                            placeholder="0xxxxxxxxx" required
                            value="${isEdit ? this._escapeHtml(employeeData.phone || '') : ''}">
                        <div class="invalid-feedback small">SĐT không hợp lệ (bắt đầu bằng 0, 9-15 chữ số)</div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Email</label>
                        <input type="email" class="form-control form-control-sm" name="email"
                            placeholder="email@company.com"
                            value="${isEdit ? this._escapeHtml(employeeData.email || '') : ''}">
                        <div class="invalid-feedback small">Email không hợp lệ</div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Chức Vụ <span class="text-danger">*</span></label>
                            <select class="form-select form-select-sm" name="position" required>
                                <option value="">— Chọn —</option>
                                ${posHTML}
                            </select>
                            <div class="invalid-feedback small">Vui lòng chọn chức vụ</div>
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Phòng Ban <span class="text-danger">*</span></label>
                            <select class="form-select form-select-sm" name="department" required>
                                <option value="">— Chọn —</option>
                                ${deptHTML}
                            </select>
                            <div class="invalid-feedback small">Vui lòng chọn phòng ban</div>
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Ngày Vào Làm <span class="text-danger">*</span></label>
                            <input type="date" class="form-control form-control-sm" name="hire_date" required
                                value="${isEdit ? (employeeData.hire_date || '') : ''}">
                            <div class="invalid-feedback small">Vui lòng chọn ngày vào làm</div>
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold mb-1">Lương Cơ Bản <span class="text-danger">*</span></label>
                            <input type="number" class="form-control form-control-sm number" name="base_salary"
                                placeholder="0" min="0" required
                                value="${isEdit ? (employeeData.base_salary ?? '') : ''}">
                            <div class="invalid-feedback small">Vui lòng nhập lương cơ bản</div>
                        </div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Trạng Thái</label>
                        <select class="form-select form-select-sm" name="status">
                            ${statusHTML}
                        </select>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Tài Khoản Ngân Hàng</label>
                        <input type="text" class="form-control form-control-sm" name="bank_account"
                            placeholder="STK - Tên Ngân Hàng"
                            value="${isEdit ? this._escapeHtml(employeeData.bank_account || '') : ''}">
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Liên Hệ Khẩn Cấp</label>
                        <input type="text" class="form-control form-control-sm" name="emergency_contact"
                            placeholder="Tên - SĐT"
                            value="${isEdit ? this._escapeHtml(employeeData.emergency_contact || '') : ''}">
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Ghi Chú</label>
                        <textarea class="form-control form-control-sm" name="notes" rows="2"
                            placeholder="Ghi chú">${isEdit ? this._escapeHtml(employeeData.notes || '') : ''}</textarea>
                    </div>
                </div>
                <div class="card-footer bg-white d-flex gap-2 justify-content-end">
                    ${isEdit ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="${C.prefix}btn-cancel">
                        <i class="fa-solid fa-xmark me-1"></i>Hủy
                    </button>` : ''}
                    <button type="submit" class="btn btn-sm btn-primary">
                        <i class="fa-solid ${btnIcon} me-1"></i>${btnLabel}
                    </button>
                </div>
            </form>
        `;

        container.innerHTML = formHTML;

        // Pre-fill selects for edit mode
        if (isEdit) {
            const form = getE(C.formId);
            if (!form) return;
            const sel = (name, val) => {
                const el = form.querySelector(`[name="${name}"]`);
                if (el && val) el.value = val;
            };
            sel('position', employeeData.position);
            sel('department', employeeData.department);
            sel('status', employeeData.status || 'active');
        }

        // Cancel button
        const cancelBtn = getE(`${C.prefix}btn-cancel`);
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this._selectedId = null;
                this.renderForm(null);
            });
        }

        // Submit handler
        const form = getE(C.formId);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSave(isEdit);
            });
        }
    }

    // ─── VALIDATION ──────────────────────────────────────────────────
    _validateForm(form) {
        const fields = DB_SCHEMA.employees.fields;
        let isValid = true;

        fields.forEach((field) => {
            const el = form.querySelector(`[name="${field.name}"]`);
            if (!el || !field.validation) return;

            const val = el.value?.trim() || '';
            const rules = field.validation;

            // Required check
            if (rules.required && !val) {
                el.classList.add('is-invalid');
                isValid = false;
                return;
            }

            // Min/max length
            if (rules.minLength && val && val.length < rules.minLength) {
                el.classList.add('is-invalid');
                isValid = false;
                return;
            }
            if (rules.maxLength && val.length > rules.maxLength) {
                el.classList.add('is-invalid');
                isValid = false;
                return;
            }

            // Min value (number)
            if (rules.min !== undefined && el.type === 'number') {
                const num = Number(val);
                if (val !== '' && num < rules.min) {
                    el.classList.add('is-invalid');
                    isValid = false;
                    return;
                }
            }

            // Pattern
            if (rules.pattern && val) {
                const re = new RegExp(rules.pattern);
                if (!re.test(val)) {
                    el.classList.add('is-invalid');
                    isValid = false;
                    return;
                }
            }

            el.classList.remove('is-invalid');
        });

        return isValid;
    }

    // ─── SAVE ────────────────────────────────────────────────────────
    async _handleSave(isEdit) {
        const C = HrEmployee.Config;
        const form = getE(C.formId);
        if (!form) return;

        // Clear previous validation
        form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));

        // Validate
        if (!this._validateForm(form)) {
            logA('Vui lòng kiểm tra lại các trường bắt buộc.', 'warning', 'toast');
            return;
        }

        // Collect data
        const data = {
            employee_code: form.querySelector('[name="employee_code"]')?.value?.trim() || '',
            full_name: form.querySelector('[name="full_name"]')?.value?.trim() || '',
            phone: form.querySelector('[name="phone"]')?.value?.trim() || '',
            email: form.querySelector('[name="email"]')?.value?.trim() || '',
            position: form.querySelector('[name="position"]')?.value || '',
            department: form.querySelector('[name="department"]')?.value || '',
            hire_date: form.querySelector('[name="hire_date"]')?.value || '',
            base_salary: Number(form.querySelector('[name="base_salary"]')?.value) || 0,
            status: form.querySelector('[name="status"]')?.value || 'active',
            bank_account: form.querySelector('[name="bank_account"]')?.value?.trim() || '',
            emergency_contact: form.querySelector('[name="emergency_contact"]')?.value?.trim() || '',
            notes: form.querySelector('[name="notes"]')?.value?.trim() || '',
        };

        if (isEdit) {
            data.id = this._selectedId;
        }

        // Show loading state on submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalHTML = submitBtn?.innerHTML || '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang lưu...';
        }

        try {
            const result = await A.DB.saveRecord(C.collection, data);
            if (result.success) {
                logA(isEdit ? 'Cập nhật nhân viên thành công!' : 'Thêm nhân viên thành công!', 'success', 'toast');

                // Refresh local cache
                await this.loadEmployees();

                // Re-render
                this.renderTable();
                this.renderForm(null);
                this._selectedId = null;
            } else {
                logA(result.message || 'Lỗi khi lưu nhân viên', 'error', 'toast');
            }
        } catch (e) {
            L._('HrEmployee: Save error:', e);
            logA('Có lỗi xảy ra khi lưu nhân viên. Vui lòng thử lại.', 'error', 'toast');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
            }
        }
    }

    // ─── DELETE ──────────────────────────────────────────────────────
    _confirmDelete(empId) {
        const emp = (this._employees || []).find((e) => e.id === empId);
        if (!emp) return;

        const name = emp.full_name || emp.employee_code || empId;
        const confirmed = confirm(`Bạn có chắc muốn xóa nhân viên "${name}"?\n\nNhân viên sẽ được chuyển sang trạng thái "Nghỉ Việc".`);

        if (confirmed) {
            this._softDelete(empId, emp);
        }
    }

    async _softDelete(empId, empData) {
        try {
            const data = { ...empData, id: empId, status: 'inactive' };
            const result = await A.DB.saveRecord(HrEmployee.Config.collection, data);

            if (result.success) {
                logA(`Đã chuyển trạng thái nhân viên "${empData.full_name || empId}" sang Nghỉ Việc.`, 'success', 'toast');

                await this.loadEmployees();
                this.renderTable();

                if (this._selectedId === empId) {
                    this._selectedId = null;
                    this.renderForm(null);
                }
            } else {
                logA(result.message || 'Lỗi khi xóa nhân viên', 'error', 'toast');
            }
        } catch (e) {
            L._('HrEmployee: Delete error:', e);
            logA('Có lỗi xảy ra khi xóa nhân viên. Vui lòng thử lại.', 'error', 'toast');
        }
    }
}
