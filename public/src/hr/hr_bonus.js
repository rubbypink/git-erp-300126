/**
 * HrBonus — Bonus/Commission Sub-module
 * Quản lý thưởng, hoa hồng, tăng ca: Thêm, Sửa, Xóa, Duyệt, Lọc
 *
 * @deps DBSchema.js (bonuses collection), DBManager (A.DB), employee data
 */

export class HrBonus {
    // ─── CONFIG ──────────────────────────────────────────────────────
    static Config = {
        prefix: 'hr-bonus-',
        tableId: 'hr-bonus-table',
        formId: 'hr-bonus-form',
        collection: 'bonuses',
        typeOptions: [
            { id: 'revenue_bonus', name: 'Thưởng Doanh Số' },
            { id: 'commission', name: 'Hoa Hồng' },
            { id: 'bonus', name: 'Thưởng' },
            { id: 'overtime', name: 'Tăng Ca' },
            { id: 'other', name: 'Khác' },
        ],
        statusOptions: [
            { id: 'pending', name: 'Chờ Duyệt' },
            { id: 'approved', name: 'Đã Duyệt' },
            { id: 'paid', name: 'Đã Thanh Toán' },
        ],
        tableColumns: [
            { key: 'employee_name', label: 'Nhân Viên' },
            { key: 'type', label: 'Loại', format: 'type' },
            { key: 'amount', label: 'Số Tiền', format: 'money' },
            { key: 'reason', label: 'Lý Do' },
            { key: 'date', label: 'Ngày', format: 'date' },
            { key: 'status', label: 'Trạng Thái', format: 'badge' },
        ],
    };

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────
    constructor(controller) {
        this.controller = controller;
        this._bonuses = null;
        this._employees = null;
        this._selectedId = null;
        this._filterType = '';
        this._filterEmployee = '';
        this._filterMonth = '';
        this._filterStatus = '';
    }

    // ─── INIT ────────────────────────────────────────────────────────
    init() {
        L._('HrBonus: Initialized');
    }

    // ─── RENDER ──────────────────────────────────────────────────────
    async render() {
        console.log('[HR-Bonus] render()');
        await Promise.all([this.loadBonuses(), this.loadEmployees()]);

        const filterContainer = getE('hr-bonus-filter-container');
        if (filterContainer) {
            this.renderFilterBar(filterContainer);
        }

        const tableContainer = getE('hr-bonus-table-container');
        if (tableContainer) {
            this.renderBonusTable(tableContainer);
        }
    }


    // ─── DATA ────────────────────────────────────────────────────────
    async loadBonuses() {
        try {
            const appData = window.APP_DATA?.bonuses;
            if (appData && Object.keys(appData).length > 0) {
                this._bonuses = Object.values(appData);
                return;
            }

            const obj = await A.DB.local.getAllAsObject(HrBonus.Config.collection);
            if (obj && Object.keys(obj).length > 0) {
                this._bonuses = Object.values(obj);
                return;
            }

            try {
                const docs = await A.DB.getCollection(HrBonus.Config.collection);
                if (Array.isArray(docs) && docs.length > 0) {
                    this._bonuses = docs;
                    return;
                }
            } catch (e) {
                L._('HrBonus: Firestore load skipped — offline mode');
            }

            this._bonuses = [];
        } catch (e) {
            L._('HrBonus: Error loading bonuses:', e);
            this._bonuses = [];
        }
    }

    async loadEmployees() {
        try {
            const appData = window.APP_DATA?.employees;
            if (appData && Object.keys(appData).length > 0) {
                this._employees = Object.values(appData);
                return;
            }

            const obj = await A.DB.local.getAllAsObject('employees');
            if (obj && Object.keys(obj).length > 0) {
                this._employees = Object.values(obj);
                return;
            }

            try {
                const docs = await A.DB.getCollection('employees');
                if (Array.isArray(docs) && docs.length > 0) {
                    this._employees = docs;
                    return;
                }
            } catch (e) {
                L._('HrBonus: Firestore employees load skipped');
            }

            this._employees = [];
        } catch (e) {
            L._('HrBonus: Error loading employees:', e);
            this._employees = [];
        }
    }

    _getEmployeeName(employeeId) {
        if (!employeeId) return '—';
        // APP_DATA may already resolve FK to object, or it may just be an ID
        const emp = (this._employees || []).find((e) => {
            if (typeof employeeId === 'object' && employeeId !== null) {
                return e.id === employeeId.id;
            }
            return e.id === employeeId;
        });
        if (emp) return emp.full_name || emp.employee_code || employeeId;
        // If employee_id is already an object with full_name (FK resolved)
        if (typeof employeeId === 'object' && employeeId !== null && employeeId.full_name) {
            return employeeId.full_name;
        }
        return employeeId;
    }

    _getEmployeeId(bonus) {
        if (!bonus || !bonus.employee_id) return '';
        if (typeof bonus.employee_id === 'object' && bonus.employee_id !== null) {
            return bonus.employee_id.id || '';
        }
        return bonus.employee_id;
    }

    getFilteredBonuses() {
        let list = this._bonuses || [];

        if (this._filterType) {
            list = list.filter((b) => b.type === this._filterType);
        }

        if (this._filterStatus) {
            list = list.filter((b) => b.status === this._filterStatus);
        }

        if (this._filterEmployee) {
            list = list.filter((b) => {
                const empId = this._getEmployeeId(b);
                return empId === this._filterEmployee;
            });
        }

        if (this._filterMonth) {
            // _filterMonth format: YYYY-MM
            list = list.filter((b) => {
                const d = b.date || b.created_at || '';
                return String(d).startsWith(this._filterMonth);
            });
        }

        // Sort by date descending
        list.sort((a, b) => {
            const da = a.date || a.created_at || '';
            const db = b.date || b.created_at || '';
            return String(db).localeCompare(String(da));
        });

        return list;
    }

    _getTotalAmount() {
        return this.getFilteredBonuses().reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    }

    // ─── FILTER BAR ──────────────────────────────────────────────────
    renderFilterBar(container) {
        if (!container) return;

        const C = HrBonus.Config;
        const typeHTML = ['<option value="">Tất Cả Loại</option>']
            .concat(C.typeOptions.map((t) => `<option value="${t.id}">${t.name}</option>`))
            .join('');

        const statusHTML = ['<option value="">Tất Cả Trạng Thái</option>']
            .concat(C.statusOptions.map((s) => `<option value="${s.id}">${s.name}</option>`))
            .join('');

        const employees = this._employees || [];
        const empHTML = ['<option value="">Tất Cả Nhân Viên</option>']
            .concat(employees.map((e) => `<option value="${e.id}">${this._escapeHtml(e.full_name || e.employee_code || e.id)}</option>`))
            .join('');

        container.innerHTML = `
            <div class="col-12 col-md-3">
                <select class="form-select" id="${C.prefix}filter-type">
                    ${typeHTML}
                </select>
            </div>
            <div class="col-12 col-md-3">
                <select class="form-select" id="${C.prefix}filter-employee">
                    ${empHTML}
                </select>
            </div>
            <div class="col-6 col-md-2">
                <input type="month" class="form-control" id="${C.prefix}filter-month"
                    value="${this._filterMonth}">
            </div>
            <div class="col-6 col-md-2">
                <select class="form-select" id="${C.prefix}filter-status">
                    ${statusHTML}
                </select>
            </div>
            <div class="col-12 col-md-2 d-flex justify-content-md-end">
                <button class="btn btn-primary" id="${C.prefix}btn-add">
                    <i class="fa-solid fa-plus me-1"></i>Thêm Thưởng
                </button>
            </div>
        `;

        // Pre-set filter values
        if (this._filterType) {
            const el = getE(`${C.prefix}filter-type`);
            if (el) el.value = this._filterType;
        }
        if (this._filterEmployee) {
            const el = getE(`${C.prefix}filter-employee`);
            if (el) el.value = this._filterEmployee;
        }
        if (this._filterStatus) {
            const el = getE(`${C.prefix}filter-status`);
            if (el) el.value = this._filterStatus;
        }

        // Event listeners
        getE(`${C.prefix}filter-type`)?.addEventListener('change', () => {
            this._filterType = getE(`${C.prefix}filter-type`).value;
            this.renderBonusTable(getE('hr-bonus-table-container'));
        });

        getE(`${C.prefix}filter-employee`)?.addEventListener('change', () => {
            this._filterEmployee = getE(`${C.prefix}filter-employee`).value;
            this.renderBonusTable(getE('hr-bonus-table-container'));
        });

        getE(`${C.prefix}filter-month`)?.addEventListener('change', () => {
            this._filterMonth = getE(`${C.prefix}filter-month`).value;
            this.renderBonusTable(getE('hr-bonus-table-container'));
        });

        getE(`${C.prefix}filter-status`)?.addEventListener('change', () => {
            this._filterStatus = getE(`${C.prefix}filter-status`).value;
            this.renderBonusTable(getE('hr-bonus-table-container'));
        });

        getE(`${C.prefix}btn-add`)?.addEventListener('click', () => {
            this._selectedId = null;
            this.renderBonusForm(null);
        });
    }

    // ─── TABLE ───────────────────────────────────────────────────────
    renderBonusTable(container) {
        if (!container) return;

        const bonuses = this.getFilteredBonuses();
        const C = HrBonus.Config;
        const total = this._getTotalAmount();

        if (bonuses.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5 border rounded-4 bg-light">
                    <i class="fa-solid fa-gift fa-2x d-block mb-2"></i>
                    Không tìm thấy khoản thưởng nào
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
                        ${bonuses.map((b) => this._renderTableRow(b)).join('')}
                    </tbody>
                    <tfoot class="table-light">
                        <tr>
                            <td colspan="2" class="fw-bold text-end">Tổng Cộng:</td>
                            <td class="fw-bold text-danger">${this._formatMoney(total)}</td>
                            <td colspan="4"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <!-- Mobile cards -->
            <div class="d-md-none">
                ${bonuses.map((b) => this._renderMobileCard(b)).join('')}
            </div>
        `;

        container.innerHTML = tableHTML;

        bonuses.forEach((b) => this._bindRowEvents(b.id));
    }

    _renderTableRow(bonus) {
        const C = HrBonus.Config;
        const cols = C.tableColumns.map((col) => {
            let value;
            if (col.key === 'employee_name') {
                value = this._escapeHtml(this._getEmployeeName(bonus.employee_id));
            } else if (col.key === 'type') {
                value = this._renderTypeBadge(bonus.type);
            } else if (col.key === 'status') {
                value = this._renderStatusBadge(bonus.status);
            } else if (col.format === 'money') {
                value = this._formatMoney(bonus.amount);
            } else if (col.format === 'date') {
                value = this._formatDate(bonus.date);
            } else {
                value = this._escapeHtml(bonus[col.key] ?? '');
            }
            return `<td>${value}</td>`;
        }).join('');

        const statusActions = this._renderStatusActions(bonus);

        return `
            <tr id="${C.prefix}row-${bonus.id}" class="hr-bonus-row" style="cursor:pointer">
                ${cols}
                <td class="text-end text-nowrap">
                    ${statusActions}
                    <button class="btn btn-sm btn-outline-primary me-1" id="${C.prefix}btn-edit-${bonus.id}" title="Sửa">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" id="${C.prefix}btn-del-${bonus.id}" title="Xóa">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    }

    _renderMobileCard(bonus) {
        const C = HrBonus.Config;
        return `
            <div class="card border-0 shadow-sm mb-2 hr-bonus-card" id="${C.prefix}card-${bonus.id}">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="fw-bold mb-0">${this._escapeHtml(this._getEmployeeName(bonus.employee_id))}</h6>
                            <small class="text-muted">${this._formatDate(bonus.date)}</small>
                        </div>
                        <div class="text-end">
                            <div class="fw-bold text-danger mb-1">${this._formatMoney(bonus.amount)}</div>
                            ${this._renderStatusBadge(bonus.status)}
                        </div>
                    </div>
                    <div class="row g-1 small text-muted mb-2">
                        <div class="col-6">${this._renderTypeBadge(bonus.type)}</div>
                        <div class="col-6">${this._escapeHtml(bonus.reason || '—')}</div>
                    </div>
                    ${bonus.reference_id ? `<div class="small text-muted mb-2"><i class="fa-solid fa-link me-1"></i>TK: ${this._escapeHtml(bonus.reference_id)}</div>` : ''}
                    <div class="d-flex justify-content-end gap-1">
                        ${this._renderStatusActions(bonus)}
                        <button class="btn btn-sm btn-outline-primary" id="${C.prefix}btn-edit-${bonus.id}">
                            <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                        <button class="btn btn-sm btn-outline-danger" id="${C.prefix}btn-del-${bonus.id}">
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                    </div>
                </div>
            </div>`;
    }

    _renderTypeBadge(type) {
        const map = {
            revenue_bonus: { cls: 'badge-gold', label: 'Thưởng Doanh Số' },
            commission: { cls: 'bg-info text-dark', label: 'Hoa Hồng' },
            bonus: { cls: 'bg-success', label: 'Thưởng' },
            overtime: { cls: 'bg-warning text-dark', label: 'Tăng Ca' },
            other: { cls: 'bg-secondary', label: 'Khác' },
        };
        const info = map[type] || { cls: 'bg-light text-dark', label: type || '—' };
        return `<span class="badge ${info.cls}">${info.label}</span>`;
    }

    _renderStatusBadge(status) {
        const map = {
            pending: { cls: 'bg-warning text-dark', label: 'Chờ Duyệt' },
            approved: { cls: 'bg-primary', label: 'Đã Duyệt' },
            paid: { cls: 'bg-success', label: 'Đã Thanh Toán' },
        };
        const info = map[status] || { cls: 'bg-light text-dark', label: status || '—' };
        return `<span class="badge ${info.cls}">${info.label}</span>`;
    }

    _renderStatusActions(bonus) {
        let btns = '';
        if (bonus.status === 'pending') {
            btns += `<button class="btn btn-sm btn-outline-success me-1" id="${HrBonus.Config.prefix}btn-approve-${bonus.id}" title="Duyệt">
                <i class="fa-solid fa-check"></i></button>`;
        }
        if (bonus.status === 'approved') {
            btns += `<button class="btn btn-sm btn-outline-info me-1" id="${HrBonus.Config.prefix}btn-pay-${bonus.id}" title="Đã Chi">
                <i class="fa-solid fa-money-bill"></i></button>`;
        }
        return btns;
    }

    // ─── EVENT BINDING ───────────────────────────────────────────────
    _bindRowEvents(bonusId) {
        const C = HrBonus.Config;

        const row = getE(`${C.prefix}row-${bonusId}`);
        if (row) {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._selectBonus(bonusId);
            });
        }

        const card = getE(`${C.prefix}card-${bonusId}`);
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._selectBonus(bonusId);
            });
        }

        const editBtn = getE(`${C.prefix}btn-edit-${bonusId}`);
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._selectBonus(bonusId);
            });
        }

        const delBtn = getE(`${C.prefix}btn-del-${bonusId}`);
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(bonusId);
            });
        }

        const approveBtn = getE(`${C.prefix}btn-approve-${bonusId}`);
        if (approveBtn) {
            approveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.approveBonus(bonusId);
            });
        }

        const payBtn = getE(`${C.prefix}btn-pay-${bonusId}`);
        if (payBtn) {
            payBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.markBonusPaid(bonusId);
            });
        }
    }

    _selectBonus(bonusId) {
        this._selectedId = bonusId;
        const bonus = (this._bonuses || []).find((b) => b.id === bonusId);
        this.renderBonusForm(bonus || null);

        // Highlight selected row
        document.querySelectorAll('.hr-bonus-row, .hr-bonus-card')
            .forEach((el) => el.classList.remove('border-primary', 'bg-primary-subtle'));
        const row = getE(`${HrBonus.Config.prefix}row-${bonusId}`);
        const card = getE(`${HrBonus.Config.prefix}card-${bonusId}`);
        if (row) row.classList.add('bg-primary-subtle');
        if (card) card.classList.add('border-primary');
    }

    // ─── FORM ────────────────────────────────────────────────────────
    async renderBonusForm(bonusData = null) {
        const C = HrBonus.Config;
        const isEdit = !!bonusData;
        const title = isEdit ? 'Chỉnh Sửa Thưởng' : 'Thêm Thưởng Mới';

        const typeHTML = C.typeOptions.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
        const statusHTML = C.statusOptions.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

        const employees = this._employees || [];
        const empHTML = employees
            .filter((e) => e.status !== 'inactive')
            .map((e) => `<option value="${e.id}">${this._escapeHtml(e.full_name || e.employee_code || e.id)}</option>`)
            .join('');

        const empId = isEdit ? this._getEmployeeId(bonusData) : '';

        const result = await Swal.fire({
            title: title,
            html: `
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Nhân Viên <span class="text-danger">*</span></label>
                    <select id="swal-bonus-employee" class="swal2-select form-select form-select-sm" required>
                        <option value="">Chọn nhân viên...</option>
                        ${empHTML}
                    </select>
                </div>
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Loại <span class="text-danger">*</span></label>
                    <select id="swal-bonus-type" class="swal2-select form-select form-select-sm" required>
                        <option value="">Chọn loại...</option>
                        ${typeHTML}
                    </select>
                </div>
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Số Tiền <span class="text-danger">*</span></label>
                    <input type="number" id="swal-bonus-amount" class="swal2-input form-control form-control-sm"
                        placeholder="0" min="0" required value="${isEdit ? (bonusData.amount || 0) : ''}">
                </div>
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Lý Do</label>
                    <input type="text" id="swal-bonus-reason" class="swal2-input form-control form-control-sm"
                        placeholder="Lý do thưởng" value="${isEdit ? this._escapeHtml(bonusData.reason || '') : ''}">
                </div>
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Mã Tham Chiếu</label>
                    <input type="text" id="swal-bonus-reference" class="swal2-input form-control form-control-sm"
                        placeholder="Mã booking/hóa đơn" value="${isEdit ? this._escapeHtml(bonusData.reference_id || '') : ''}">
                </div>
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Ngày <span class="text-danger">*</span></label>
                    <input type="date" id="swal-bonus-date" class="swal2-input form-control form-control-sm"
                        required value="${isEdit ? (bonusData.date || '') : ''}">
                </div>
                <div class="mb-2 text-start">
                    <label class="form-label small fw-bold mb-1">Trạng Thái</label>
                    <select id="swal-bonus-status" class="swal2-select form-select form-select-sm">
                        ${statusHTML}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: isEdit ? '<i class="fa-solid fa-floppy-disk me-1"></i>Cập Nhật' : '<i class="fa-solid fa-plus me-1"></i>Lưu Thưởng',
            cancelButtonText: 'Hủy',
            width: 600,
            didOpen: () => {
                if (isEdit) {
                    const sel = (id, val) => {
                        const el = document.getElementById(id);
                        if (el && val) el.value = val;
                    };
                    sel('swal-bonus-employee', empId);
                    sel('swal-bonus-type', bonusData.type);
                    sel('swal-bonus-status', bonusData.status || 'pending');
                }
            },
            preConfirm: () => {
                const data = {
                    employee_id: document.getElementById('swal-bonus-employee')?.value || '',
                    type: document.getElementById('swal-bonus-type')?.value || '',
                    amount: Number(document.getElementById('swal-bonus-amount')?.value) || 0,
                    reason: document.getElementById('swal-bonus-reason')?.value?.trim() || '',
                    reference_id: document.getElementById('swal-bonus-reference')?.value?.trim() || '',
                    date: document.getElementById('swal-bonus-date')?.value || '',
                    status: document.getElementById('swal-bonus-status')?.value || 'pending',
                };

                if (!data.employee_id) {
                    Swal.showValidationMessage('Vui lòng chọn nhân viên');
                    return false;
                }
                if (!data.type) {
                    Swal.showValidationMessage('Vui lòng chọn loại thưởng');
                    return false;
                }
                if (!data.amount || isNaN(data.amount) || data.amount < 0) {
                    Swal.showValidationMessage('Vui lòng nhập số tiền hợp lệ (>= 0)');
                    return false;
                }
                if (!data.date) {
                    Swal.showValidationMessage('Vui lòng chọn ngày');
                    return false;
                }

                return data;
            },
        });

        if (result.isConfirmed) {
            await this._handleSaveSwal(result.value, isEdit);
        }
    }

    async _handleSaveSwal(data, isEdit) {
        const C = HrBonus.Config;

        if (isEdit) {
            data.id = this._selectedId;
            const existing = (this._bonuses || []).find((b) => b.id === this._selectedId);
            if (existing) {
                if (existing.approved_by) data.approved_by = existing.approved_by;
                if (existing.created_at) data.created_at = existing.created_at;
            }
        } else {
            data.created_at = new Date().toISOString().split('T')[0];
        }

        Swal.showLoading();

        try {
            const result = await A.DB.saveRecord(C.collection, data);
            if (result.success) {
                Swal.close();
                logA(isEdit ? 'Cập nhật thưởng thành công!' : 'Thêm thưởng thành công!', 'success', 'toast');

                await this.loadBonuses();

                const tableContainer = getE('hr-bonus-table-container');
                if (tableContainer) this.renderBonusTable(tableContainer);

                this._selectedId = null;
            } else {
                Swal.showValidationMessage(result.message || 'Lỗi khi lưu thưởng');
                return false;
            }
        } catch (e) {
            L._('HrBonus: Save error:', e);
            Swal.showValidationMessage('Có lỗi xảy ra khi lưu thưởng. Vui lòng thử lại.');
            return false;
        }
    }

    // ─── VALIDATION ──────────────────────────────────────────────────
    _validateForm(form) {
        let isValid = true;

        const empEl = form.querySelector('[name="employee_id"]');
        if (empEl && !empEl.value) {
            empEl.classList.add('is-invalid');
            isValid = false;
        } else if (empEl) {
            empEl.classList.remove('is-invalid');
        }

        const typeEl = form.querySelector('[name="type"]');
        if (typeEl && !typeEl.value) {
            typeEl.classList.add('is-invalid');
            isValid = false;
        } else if (typeEl) {
            typeEl.classList.remove('is-invalid');
        }

        const amountEl = form.querySelector('[name="amount"]');
        if (amountEl) {
            const val = Number(amountEl.value);
            if (!amountEl.value || isNaN(val) || val < 0) {
                amountEl.classList.add('is-invalid');
                isValid = false;
            } else {
                amountEl.classList.remove('is-invalid');
            }
        }

        const dateEl = form.querySelector('[name="date"]');
        if (dateEl && !dateEl.value) {
            dateEl.classList.add('is-invalid');
            isValid = false;
        } else if (dateEl) {
            dateEl.classList.remove('is-invalid');
        }

        return isValid;
    }

    // ─── SAVE ────────────────────────────────────────────────────────
    async _handleSave(isEdit) {
        const C = HrBonus.Config;
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
            employee_id: form.querySelector('[name="employee_id"]')?.value || '',
            type: form.querySelector('[name="type"]')?.value || '',
            amount: Number(form.querySelector('[name="amount"]')?.value) || 0,
            reason: form.querySelector('[name="reason"]')?.value?.trim() || '',
            reference_id: form.querySelector('[name="reference_id"]')?.value?.trim() || '',
            date: form.querySelector('[name="date"]')?.value || '',
            status: form.querySelector('[name="status"]')?.value || 'pending',
        };

        if (isEdit) {
            data.id = this._selectedId;
            // Preserve approved_by and created_at from existing record
            const existing = (this._bonuses || []).find((b) => b.id === this._selectedId);
            if (existing) {
                if (existing.approved_by) data.approved_by = existing.approved_by;
                if (existing.created_at) data.created_at = existing.created_at;
            }
        } else {
            data.created_at = new Date().toISOString().split('T')[0];
        }

        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalHTML = submitBtn?.innerHTML || '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang lưu...';
        }

        try {
            const result = await A.DB.saveRecord(C.collection, data);
            if (result.success) {
                logA(isEdit ? 'Cập nhật thưởng thành công!' : 'Thêm thưởng thành công!', 'success', 'toast');

                await this.loadBonuses();

                const tableContainer = getE('hr-bonus-table-container');
                if (tableContainer) this.renderBonusTable(tableContainer);

                this._selectedId = null;
            } else {
                logA(result.message || 'Lỗi khi lưu thưởng', 'error', 'toast');
            }
        } catch (e) {
            L._('HrBonus: Save error:', e);
            logA('Có lỗi xảy ra khi lưu thưởng. Vui lòng thử lại.', 'error', 'toast');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
            }
        }
    }

    async saveBonus(data) {
        if (!data) return { success: false, message: 'No data provided' };
        try {
            const result = await A.DB.saveRecord(HrBonus.Config.collection, data);
            if (result.success) {
                await this.loadBonuses();
                const tableContainer = getE('hr-bonus-table-container');
                if (tableContainer) this.renderBonusTable(tableContainer);
            }
            return result;
        } catch (e) {
            L._('HrBonus: saveBonus error:', e);
            return { success: false, message: e.message };
        }
    }

    // ─── DELETE ──────────────────────────────────────────────────────
    _confirmDelete(bonusId) {
        const bonus = (this._bonuses || []).find((b) => b.id === bonusId);
        if (!bonus) return;

        const empName = this._getEmployeeName(bonus.employee_id);
        const amount = this._formatMoney(bonus.amount);
        const confirmed = confirm(`Bạn có chắc muốn xóa khoản thưởng của "${empName}"?\n\nSố tiền: ${amount}`);

        if (confirmed) {
            this.deleteBonus(bonusId);
        }
    }

    async deleteBonus(id) {
        if (!id) return { success: false, message: 'No ID provided' };
        try {
            const result = await A.DB.deleteRecord(HrBonus.Config.collection, id);
            if (result.success) {
                logA('Đã xóa khoản thưởng thành công!', 'success', 'toast');
                await this.loadBonuses();

                const tableContainer = getE('hr-bonus-table-container');
                if (tableContainer) this.renderBonusTable(tableContainer);

                if (this._selectedId === id) {
                    this._selectedId = null;
                }
            } else {
                logA(result.message || 'Lỗi khi xóa thưởng', 'error', 'toast');
            }
            return result;
        } catch (e) {
            L._('HrBonus: deleteBonus error:', e);
            logA('Có lỗi xảy ra khi xóa thưởng.', 'error', 'toast');
            return { success: false, message: e.message };
        }
    }

    // ─── STATUS WORKFLOW ─────────────────────────────────────────────
    async approveBonus(id) {
        if (!id) return { success: false, message: 'No ID provided' };
        try {
            const bonus = (this._bonuses || []).find((b) => b.id === id);
            if (!bonus) {
                logA('Không tìm thấy khoản thưởng.', 'error', 'toast');
                return { success: false, message: 'Bonus not found' };
            }
            if (bonus.status !== 'pending') {
                logA('Chỉ có thể duyệt khoản thưởng ở trạng thái Chờ Duyệt.', 'warning', 'toast');
                return { success: false, message: 'Invalid status transition' };
            }

            const data = {
                ...bonus,
                status: 'approved',
                approved_by: window.A?.user?.displayName || window.A?.user?.email || 'Admin',
            };

            const result = await A.DB.saveRecord(HrBonus.Config.collection, data);
            if (result.success) {
                logA('Đã duyệt khoản thưởng thành công!', 'success', 'toast');
                await this.loadBonuses();

                const tableContainer = getE('hr-bonus-table-container');
                if (tableContainer) this.renderBonusTable(tableContainer);
            } else {
                logA(result.message || 'Lỗi khi duyệt thưởng', 'error', 'toast');
            }
            return result;
        } catch (e) {
            L._('HrBonus: approveBonus error:', e);
            logA('Có lỗi xảy ra khi duyệt thưởng.', 'error', 'toast');
            return { success: false, message: e.message };
        }
    }

    async markBonusPaid(id) {
        if (!id) return { success: false, message: 'No ID provided' };
        try {
            const bonus = (this._bonuses || []).find((b) => b.id === id);
            if (!bonus) {
                logA('Không tìm thấy khoản thưởng.', 'error', 'toast');
                return { success: false, message: 'Bonus not found' };
            }
            if (bonus.status !== 'approved') {
                logA('Chỉ có thể đánh dấu đã chi cho khoản thưởng ở trạng thái Đã Duyệt.', 'warning', 'toast');
                return { success: false, message: 'Invalid status transition' };
            }

            const data = {
                ...bonus,
                status: 'paid',
            };

            const result = await A.DB.saveRecord(HrBonus.Config.collection, data);
            if (result.success) {
                logA('Đã đánh dấu khoản thưởng là Đã Chi!', 'success', 'toast');
                await this.loadBonuses();

                const tableContainer = getE('hr-bonus-table-container');
                if (tableContainer) this.renderBonusTable(tableContainer);
            } else {
                logA(result.message || 'Lỗi khi cập nhật trạng thái', 'error', 'toast');
            }
            return result;
        } catch (e) {
            L._('HrBonus: markBonusPaid error:', e);
            logA('Có lỗi xảy ra khi cập nhật trạng thái.', 'error', 'toast');
            return { success: false, message: e.message };
        }
    }

    // ─── COMMISSION CALCULATOR (static helper) ───────────────────────
    static calculateCommission(saleAmount, rate) {
        if (!saleAmount || !rate) return 0;
        const amount = Number(saleAmount);
        const pct = Number(rate);
        if (isNaN(amount) || isNaN(pct) || amount <= 0 || pct <= 0) return 0;
        return Math.round(amount * pct / 100);
    }

    // ─── HELPERS ─────────────────────────────────────────────────────
    _escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _formatMoney(amount) {
        const num = Number(amount);
        if (isNaN(num)) return '0';
        if (typeof formatMoney === 'function') {
            return formatMoney(num);
        }
        return num.toLocaleString('vi-VN');
    }

    _formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('vi-VN');
        } catch (e) {
            return dateStr;
        }
    }
}
