// ===================================================================
// IMPORTS (v9 Modular ES6)
// ===================================================================
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { logA, showConfirm, showAlert } from '/src/js/modules/core/UI_Manager.js';
import ATable from '/src/js/modules/core/ATable.js';
import LogicBase from '/src/js/modules/core/LogicBase.js';
// NOTE: NotificationManager is accessed via window.NotificationManager (loaded by main app bundle)
import SalesModule from '/src/js/modules/M_SalesModule.js';
import { getNewData, migrateBookingTransactions, auditTransactionsChecking } from './accountant_logic.js';
import { SupplierDebtDashboard } from './acc_supplier_debt.js';
import { PnLReport } from './acc_pnl_report.js';
import { FinancialCharts } from './acc_charts.js';
import { AccExport } from './acc_export.js';
// CRITICAL: Import CSS so Vite bundles it with the module chunk.
// Without this, CSS fails to load via dynamic <link> tag because
// '@acc' alias only resolves in JS imports, not in browser-resolved URLs.
import './accountant.css';

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

// --- 2. CLASS DEFINITION ---

class AccountantController {
    static autoInit = false;

    constructor() {
        this.currentEntity = '9trip';
        this.entityConfig = {
            '9trip': { trans: 'transactions', fund: 'fund_accounts', role: 'acc' },
            thenice: {
                trans: 'transactions_thenice',
                fund: 'fund_accounts_thenice',
                role: 'acc_thenice',
            },
        };
        this.autoInit = false;
        this.funds = [];
        this.transactions = [];
        this.els = {}; // Cache DOM

        this.filterState = {
            period: 'month',
            startDate: null,
            endDate: null,
            field: 'all',
            keyword: '',
        };

        this.selectedIds = new Set();

        this.logic = new LogicBase();
        this._registerLogicFilters();
        this.supplierDebt = new SupplierDebtDashboard(this);
        this.pnlReport = new PnLReport(this);
        this.charts = new FinancialCharts(this);
        this.exportUtil = new AccExport(this);

        this._setupAutoRefresh();
    }

    _registerLogicFilters() {
        this.logic.registerFilter('period', (items, range) => {
            if (!range || !range.start || !range.end) return items;
            return items.filter((item) => {
                const itemDate = item.transaction_date ? item.transaction_date.substring(0, 10) : item.created_at ? item.created_at.substring(0, 10) : '';
                return itemDate >= range.start && itemDate <= range.end;
            });
        });

        this.logic.registerFilter('keyword', (items, keyword) => {
            if (!keyword) return items;
            const key = keyword.toLowerCase();
            const field = this.filterState.field;
            return items.filter((item) => {
                if (field === 'all') {
                    const content = removeVietnameseTones(`${item.id} ${item.type} ${item.description} ${item.category} ${item.booking_id} ${item.status}`).toLowerCase();
                    return content.includes(removeVietnameseTones(key));
                } else {
                    const val = item[field] ? String(item[field]).toLowerCase() : '';
                    return val.includes(key);
                }
            });
        });

        this.logic.registerFilter('status', (items, status) => {
            if (!status || status === 'all') return items;
            return items.filter((item) => item.status === status);
        });
    }

    _setupAutoRefresh() {
        this._refreshTimer = null;

        A.Event.on('data:bookings', () => {
            this._debouncedRefresh('bookings');
        });

        A.Event.on('data:operator_entries', () => {
            this._debouncedRefresh('operator_entries');
        });
    }

    _debouncedRefresh(source) {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => {
            logA(`Dữ liệu ${source} đã cập nhật. Làm mới...`, 'info', 'toast');
            this.refreshData();
        }, 5000);
    }

    destroy() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    // --- INIT & FLOW CONTROL ---

    async init() {
        if (this._initialized) return;
        this._initialized = true;
        L._('Accountant Module: Initializing...');

        // Fix #3: Đợi DOM load xong mới cache và bind event
        // Nếu file js được load async, có thể body chưa render xong
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._start());
        } else {
            // Check nếu container chính đã có chưa, nếu chưa thì retry nhẹ
            this._waitForDom();
        }
    }

    _waitForDom() {
        // Kiểm tra 1 element đặc trưng, ví dụ filterPeriod
        const checkEl = document.getElementById('acc-filter-period');
        const checkMdl = document.getElementById('acc-modal-form');
        if (checkEl || checkMdl) {
            this._start();
        } else {
            // Thử lại sau 100ms (tối đa 10 lần)
            if (!this._retryCount) this._retryCount = 0;
            this._retryCount++;
            if (this._retryCount < 20) {
                setTimeout(() => this._waitForDom(), 300);
            } else {
                console.error('Accountant: DOM Elements not found after retries. Check HTML ID.');
            }
        }
    }

    async _start() {
        try {
            let userRole = CURRENT_USER && CURRENT_USER.role ? CURRENT_USER.role : 'acc';
            if (userRole === 'admin') {
                showConfirm(
                    "Bạn đang đăng nhập với quyền admin. Bạn có muốn xem dữ liệu của The Nice Hotel không? (Chọn 'Cancel' để xem dữ liệu 9 Trip ERP)",
                    () => {
                        this.setupEntityAccess('acc_thenice');
                    },
                    () => {
                        this.setupEntityAccess('acc');
                    },
                    { okText: 'The Nice', denyText: '9 Trip' }
                );
            } else {
                this.setupEntityAccess(userRole);
            }

            this.cacheDom();
            this.bindEvents(); // Bind event ngay khi có DOM
            this._initATable(); // Khởi tạo ATable
            this.injectBulkActionBar(); // Inject bulk action bar
            this._bindInlineEditing(); // Bind inline editing

            await this.refreshData(); // Sau đó mới load data

            // Set default date picker values
            this.updateDatePickerUI();

            // Toggle view mode on screen width changes
            if (window.matchMedia) {
                const mq = window.matchMedia('(max-width: 768px)');
                mq.addEventListener('change', () => this.applyFiltersAndRender());
            }

            L._(`Accountant Module: Ready (${this.currentEntity})`);
        } catch (error) {
            console.error('Accountant Init Error:', error);
        }
    }

    setupEntityAccess(role) {
        const selector = document.getElementById('acc-entity-select');
        if (role === 'acc_thenice') {
            this.currentEntity = 'thenice';
            if (selector) {
                selector.value = 'thenice';
                selector.disabled = true;
            }
        } else {
            this.currentEntity = '9trip';
            if (selector) selector.value = '9trip';
        }
        this.currentTransCol = this.entityConfig[this.currentEntity].trans || 'transactions';
        this.currentFundCol = this.entityConfig[this.currentEntity].fund || 'fund_accounts';
    }

    cacheDom() {
        this.els = {
            totalFund: document.getElementById('d-total-fund'),
            fundListContainer: document.getElementById('acc-fund-list-container'),
            netBalance: document.getElementById('d-net-balance'),
            totalIn: document.getElementById('d-total-in'),
            totalOut: document.getElementById('d-total-out'),

            tableBody: document.getElementById('acc-table-body'),
            showingCount: document.getElementById('acc-showing-count'),

            // Filters
            filterPeriod: document.getElementById('acc-filter-period'),
            filterStart: document.getElementById('acc-filter-start'),
            filterEnd: document.getElementById('acc-filter-end'),
            filterField: document.getElementById('acc-filter-field'),
            filterValue: document.getElementById('acc-filter-value'),
            customDateRow: document.getElementById('acc-custom-date-row'),
            filterSummary: document.getElementById('acc-filter-summary'),
            btnApplyFilter: document.getElementById('btn-apply-filter'), // Cần ID này trong HTML
            btnFilterPending: document.getElementById('btn-filter-pending'),

            globalSearch: document.getElementById('acc-global-search'),
        };
    }

    // --- DATA HANDLING ---

    async getData(collectionName) {
        // Luôn fetch mới nhất để đảm bảo tính đúng đắn của kế toán
        // loadCollections viết thẳng vào APP_DATA và trả về số docs đã tải
        L._(`Fetching data for ${collectionName}...`);
        const data = APP_DATA?.[collectionName];
        if (!data) {
            if (window.A && window.A.DB) return await window.A.DB.local.getCollection(collectionName);
            return [];
        }
        if (Array.isArray(data)) return data;
        return Object.values(data);
    }

    async refreshData() {
        try {
            const [fundsData, transData] = await Promise.all([this.getData(this.currentFundCol), this.getData(this.currentTransCol)]);

            this.funds = Object.values(fundsData || []);
            this.transactions = Object.values(transData || []);

            // Sort: Mới nhất lên đầu (theo created_at)
            this.transactions?.sort((a, b) => new Date(b.created_at || b.transaction_date) - new Date(a.created_at || a.transaction_date));

            // Update pending badge
            const pendingCount = this.transactions.filter((t) => t.status === 'Pending').length;
            const badge = document.getElementById('acc-pending-badge');
            if (badge) {
                badge.innerText = pendingCount;
                badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
            }

            this.renderDashboardAssets();
            this.applyFiltersAndRender();
            this.updateFilterFieldOptions();
        } catch (error) {
            console.error('Refresh Data Error:', error);
        }
    }

    // ===================================================================
    // TỐI ƯU HIỂN THỊ DANH SÁCH QUỸ (JS Render)
    // ===================================================================

    renderDashboardAssets() {
        if (!this.els.fundListContainer) return;
        let totalBalance = 0;
        let html = '';

        this.funds.forEach((fund) => {
            const balance = parseFloat(fund.balance || 0);
            totalBalance += balance;
            const isCash = fund.id === 'cash';

            // UI mới: Icon có màu nền nhẹ, phân cấp text rõ ràng
            const iconBg = isCash ? 'bg-success' : 'bg-primary';
            const iconText = isCash ? 'text-success' : 'text-primary';
            const iconFa = isCash ? 'fa-money-bill-wave' : 'fa-university';
            const name = fund.name || fund.id || 'Quỹ ẩn';

            html += `
            <div class="d-flex justify-content-between align-items-center p-2 mb-2 rounded-3 border border-light bkg-light transition-hover fund-item-row">
                <div class="d-flex align-items-center overflow-hidden me-2">
                    <div class="${iconBg} bg-opacity-10 p-2 rounded-circle d-flex me-2">
                        <i class="fas ${iconFa} ${iconText}"></i>
                    </div>
                    <div class="d-flex flex-column fund-account" data-item="${fund.id}">
                        <span class=" fw-bold small text-truncate" title="${name}">${name}</span>
                        ${fund.account_no ? `<span class="text-muted" style="font-size:0.65rem;"><i class="fas fa-credit-card me-1"></i>${fund.account_no}</span>` : `<span class="text-muted" style="font-size:0.65rem;">Tiền mặt</span>`}
                    </div>
                </div>
                
                <div class="d-flex flex-column align-items-end justify-content-center" style="min-width: max-content;">
                    <span class="fw-bold  small mb-1">${formatMoney(balance)}</span>
                    <div class="commit-btn-container"></div>
                </div>
            </div>`;
        });

        this.els.fundListContainer.innerHTML = html || '<div class="text-muted small text-center py-4"><i class="fas fa-box-open mb-2 fs-4"></i><br>Chưa có dữ liệu quỹ</div>';

        if (this.els.totalFund) {
            this.els.totalFund.innerText = formatMoney(totalBalance);
        }

        // Gắn nút chốt số dư sau khi render xong HTML
        this.addCommitButtons();
    }

    addCommitButtons() {
        const rows = this.els.fundListContainer.querySelectorAll('.fund-item-row');
        rows.forEach((row, index) => {
            const fund = this.funds[index];
            if (!fund) return;

            const container = row.querySelector('.commit-btn-container');
            if (!container) return;

            const btn = document.createElement('button');
            // Style nút chốt mới: Nút outline, bo góc viền, hiệu ứng đẹp
            btn.className = 'btn btn-sm btn-outline-warning rounded-pill py-0 px-2 fw-bold d-flex align-items-center shadow-sm';
            btn.style.fontSize = '0.65rem';
            btn.innerHTML = '<i class="fas fa-check-double me-1"></i> Chốt sổ';

            btn.onclick = (e) => {
                e.stopPropagation(); // Ngăn sự kiện click lan ra ngoài
                const fundId = fund.id;
                this.handleCommitFund(fundId); // Gọi thẳng hàm logic cũ
            };

            container.appendChild(btn);
        });
    }

    /**
     * Helper: Mở modal prompt với input field, trả về Promise
     */
    openPromptModal(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            let resolved = false;
            const doResolve = (val) => {
                if (resolved) return;
                resolved = true;
                resolve(val);
            };

            const html = `
                <div class="p-3" style="min-width: 320px;">
                    <p class="mb-2 fw-semibold">${message}</p>
                    <input type="text" class="form-control form-control-sm" id="prompt-input" value="${defaultValue || ''}">
                </div>
            `;

            A.Modal.render(html, title);

            const handleSave = () => {
                const val = document.getElementById('prompt-input')?.value.trim();
                A.Modal.hide();
                doResolve(val || null);
            };

            const handleCancel = () => {
                A.Modal.hide();
                doResolve(null);
            };

            A.Modal.setSaveHandler(handleSave, 'OK');
            A.Modal.setResetHandler(handleCancel, 'Hủy');
            A.Modal.setFooter(true);
            A.Modal.show();

            // Lắng nghe hidden.bs.modal để resolve null nếu đóng bằng nút X hoặc backdrop
            const modalEl = document.getElementById('dynamic-modal');
            const onHidden = () => {
                doResolve(null);
                if (modalEl) modalEl.removeEventListener('hidden.bs.modal', onHidden);
            };
            if (modalEl) modalEl.addEventListener('hidden.bs.modal', onHidden);

            // Focus input và hỗ trợ phím Enter
            setTimeout(() => {
                const input = document.getElementById('prompt-input');
                if (input) {
                    input.focus();
                    input.select();
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSave();
                        }
                    });
                }
            }, 100);
        });
    }

    /**
     * Gọi Cloud Function commitFundAccount
     */
    async handleCommitFund(accountId) {
        try {
            const endDate = await this.openPromptModal(
                'Chốt Sổ',
                '📅 Ngày chốt số dư (định dạng dd/mm/yyyy) - Để trống: Chọn ngày hiện tại',
                new Date().toISOString().split('T')[0]
            );
            if (!endDate) return;

            logA('Đang xử lý chốt số dư...', 'info', 'toast');

            // Gọi Cloud Function (Modular SDK)
            const functions = getFunctions(getApp(), 'asia-southeast1');
            const commitFunc = httpsCallable(functions, 'commitFundAccount');
            const result = await commitFunc({ accountId: accountId, start: null, end: endDate });

            if (result.data && result.data.success && result.data.newBalance) {
                const newBalance = result.data.newBalance;
                logA(`✅ Chốt thành công! Số dư mới: ${formatMoney(newBalance)}`, 'success');

                // 1. Cập nhật APP_DATA
                if (A.DB) {
                    await A.DB.syncLocal(this.currentFundCol, accountId, 'u', {
                        amount: newBalance,
                        commit_date: new Date().toISOString(),
                    });
                }
                // 3. Refresh UI
                await this.refreshData();
            } else {
                throw new Error(result.data?.message || 'Lỗi không xác định từ server');
            }
        } catch (error) {
            Opps('Lỗi chốt số dư: ' + error.message);
        }
    }

    renderPerformanceStats(data) {
        let totalIn = 0,
            totalOut = 0;
        data.forEach((item) => {
            const amount = parseFloat(item.amount || 0);
            if (item.type === 'IN') totalIn += amount;
            else if (item.type === 'OUT') totalOut += amount;
        });
        const net = totalIn - totalOut;

        if (this.els.totalIn) this.els.totalIn.innerText = formatMoney(totalIn);
        if (this.els.totalOut) this.els.totalOut.innerText = formatMoney(totalOut);

        if (this.els.netBalance) {
            this.els.netBalance.innerText = (net >= 0 ? '+' : '-') + formatMoney(Math.abs(net));
            this.els.netBalance.className = `h4 mb-0 fw-bold ${net >= 0 ? 'text-success' : 'text-danger'}`;
        }
    }

    renderCardListView(transactions) {
        const container = document.getElementById('acc-card-list');
        if (!container) return;

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<div class="text-center text-muted small py-4">Không có giao dịch nào</div>';
            return;
        }

        let html = '';
        transactions.forEach((row) => {
            const isIn = row.type === 'IN';
            const amountClass = isIn ? 'text-success' : 'text-danger';
            const amountSign = isIn ? '+' : '-';
            const statusBadge = row.status === 'Completed'
                ? '<span class="badge bg-success-subtle text-success">✅ Hoàn thành</span>'
                : row.status === 'Pending'
                ? '<span class="badge bg-warning-subtle text-warning">⏳ Chờ duyệt</span>'
                : '<span class="badge bg-secondary">Khác</span>';

            html += `
                <div class="acc-card-item" data-type="${row.type}" data-id="${row.id}">
                    <div class="acc-card-header">
                        <span class="badge ${isIn ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">
                            ${isIn ? '📥 Thu' : '📤 Chi'}
                        </span>
                        <span class="acc-card-amount ${amountClass}">${amountSign} ${formatMoney(row.amount)}</span>
                    </div>
                    <div class="acc-card-desc text-truncate">${row.description || '-'}</div>
                    <div class="acc-card-meta">
                        <span class="acc-card-category">${row.category || '-'}</span>
                        <span>${formatDateVN(row.transaction_date)}</span>
                    </div>
                    <div class="acc-card-meta mt-1">
                        <span>${row.fund_source || '-'}</span>
                        ${statusBadge}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll('.acc-card-item').forEach((card) => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                const id = card.dataset.id;
                if (type && id) this.openEditModal(type, id);
            });
        });
    }

    async approveTransaction(id) {
        if (!CURRENT_USER || (CURRENT_USER.level < 50 && CURRENT_USER.role !== 'admin')) {
            logA('Bạn không có quyền duyệt giao dịch', 'warning', 'toast');
            return;
        }
        const trans = this.transactions.find((t) => t.id === id);
        if (!trans || trans.status === 'Completed') return;
        await A.DB.updateSingle(this.currentTransCol, id, {
            status: 'Completed',
            approved_by: CURRENT_USER.name,
            approved_at: new Date().toISOString(),
        });
        logA('✅ Đã duyệt giao dịch', 'success', 'toast');
        this.refreshData();
    }

    _initATable() {
        if (this.table) return;
        const wrapper = document.querySelector('.acc-table-wrapper');
        if (!wrapper) return;
        wrapper.id = 'acc-table-container';
        this.table = new ATable('acc-table-container', {
            columns: [
                { field: '_select', header: '<input type="checkbox" id="select-all" title="Chọn tất cả">', width: '40px', renderer: (v, row) => `<input type="checkbox" class="row-select" data-id="${row.id}" ${this.selectedIds.has(row.id) ? 'checked' : ''}>` },
                { field: 'id', header: 'ID GD', width: '90px', sortable: true },
                { field: 'type', header: 'Loại', width: '70px', renderer: (v) => (v === 'IN' ? '📥 Thu' : '📤 Chi') },
                { field: 'transaction_date', header: 'Ngày CT', width: '95px', sortable: true, formatter: 'date' },
                {
                    field: 'amount',
                    header: 'Số tiền',
                    align: 'right',
                    sortable: true,
                    renderer: (v, row) => {
                        const isIn = row.type === 'IN';
                        return `<span class="fw-bold ${isIn ? 'text-success' : 'text-danger'} acc-cell-amount" data-field="amount" data-id="${row.id}">${isIn ? '+' : '-'} ${formatMoney(v)}</span>`;
                    },
                },
                { field: 'description', header: 'Diễn giải', minWidth: '180px' },
                { field: 'category', header: 'Hạng mục', width: '120px', renderer: (v, row) => `<span class="acc-cell-category" data-field="category" data-id="${row.id}">${v || ''}</span>` },
                {
                    field: 'booking_id',
                    header: 'Booking ID',
                    width: '110px',
                    renderer: (v) => (v ? `<span class="badge bg-info">${v}</span>` : '-'),
                },
                { field: 'fund_source', header: 'Quỹ', width: '80px' },
                {
                    field: 'status',
                    header: 'Trạng thái',
                    width: '110px',
                    renderer: (v, row) => {
                        if (v === 'Completed') return `<span class="badge bg-success-subtle text-success acc-cell-status" data-field="status" data-id="${row.id}">✅ Hoàn thành</span>`;
                        if (v === 'Pending') return `<span class="badge bg-warning-subtle text-warning acc-cell-status" data-field="status" data-id="${row.id}">⏳ Chờ duyệt</span>`;
                        return `<span class="badge bg-secondary acc-cell-status" data-field="status" data-id="${row.id}">Khác</span>`;
                    },
                },
                { field: 'created_by', header: 'Người tạo', width: '100px' },
                { field: 'created_at', header: 'Ngày tạo', width: '95px', formatter: 'date' },
                {
                    field: 'actions',
                    header: '',
                    width: '50px',
                    renderer: (v, row) => {
                        if (row.status !== 'Pending') return '';
                        const canApprove = CURRENT_USER && (CURRENT_USER.level >= 50 || CURRENT_USER.role === 'admin');
                        if (!canApprove) return '';
                        return `<button class="btn btn-sm btn-success p-1" style="font-size:0.7rem" onclick="event.stopPropagation(); A.AccountantCtrl.approveTransaction('${row.id}')" title="Duyệt"><i class="fas fa-check"></i></button>`;
                    },
                },
            ],
            pageSize: 50,
            sorter: true,
            header: false,
            footer: false,
            onRowClick: (row) => {
                this._pendingRowClick = { type: row.type, id: row.id };
                if (this._rowClickTimeout) clearTimeout(this._rowClickTimeout);
                this._rowClickTimeout = setTimeout(() => {
                    if (this._pendingRowClick) {
                        this.openEditModal(this._pendingRowClick.type, this._pendingRowClick.id);
                        this._pendingRowClick = null;
                    }
                }, 280);
            },
        });
    }

    _createCategoryDatalists() {
        if (document.getElementById('acc-inline-cat-in')) return;
        const inList = document.createElement('datalist');
        inList.id = 'acc-inline-cat-in';
        ['Tiền Phòng', 'Tiền Tour', 'Tiền DV', 'Công Nợ OTA', 'Hoa hồng', 'Tăng Vốn', 'Thu khác'].forEach((cat) => {
            const opt = document.createElement('option');
            opt.value = cat;
            inList.appendChild(opt);
        });
        document.body.appendChild(inList);

        const outList = document.createElement('datalist');
        outList.id = 'acc-inline-cat-out';
        ['Thanh toán NCC', 'Định Phí', 'Biến Phí', 'Chi Lương', 'Hoàn tiền', 'Chi khác'].forEach((cat) => {
            const opt = document.createElement('option');
            opt.value = cat;
            outList.appendChild(opt);
        });
        document.body.appendChild(outList);
    }

    _bindInlineEditing() {
        const wrapper = document.querySelector('.acc-table-wrapper');
        if (!wrapper || wrapper.dataset.inlineBound) return;
        wrapper.dataset.inlineBound = 'true';

        wrapper.addEventListener('dblclick', (e) => {
            const cellEl = e.target.closest('[data-field]');
            if (!cellEl) return;

            const id = cellEl.dataset.id;
            const field = cellEl.dataset.field;
            if (!id || !['amount', 'category', 'status'].includes(field)) return;

            const trans = this.transactions.find((t) => t.id === id);
            if (!trans) return;

            this._pendingRowClick = null;
            if (this._rowClickTimeout) clearTimeout(this._rowClickTimeout);

            if (cellEl.classList.contains('acc-cell-editing')) return;
            cellEl.classList.add('acc-cell-editing');

            const originalValue = trans[field];
            let editor;

            if (field === 'amount') {
                editor = document.createElement('input');
                editor.type = 'number';
                editor.value = originalValue || 0;
            } else if (field === 'category') {
                editor = document.createElement('input');
                editor.type = 'text';
                editor.value = originalValue || '';
                editor.setAttribute('list', trans.type === 'IN' ? 'acc-inline-cat-in' : 'acc-inline-cat-out');
                this._createCategoryDatalists();
            } else if (field === 'status') {
                editor = document.createElement('select');
                ['Pending', 'Completed', 'Planning'].forEach((s) => {
                    const opt = document.createElement('option');
                    opt.value = s;
                    opt.textContent = s === 'Pending' ? '⏳ Chờ duyệt' : s === 'Completed' ? '✅ Hoàn thành' : '📝 Lên Lịch';
                    if (s === originalValue) opt.selected = true;
                    editor.appendChild(opt);
                });
            }

            const originalHTML = cellEl.innerHTML;
            cellEl.innerHTML = '';
            cellEl.appendChild(editor);
            editor.focus();
            if (editor.select) editor.select();

            const cancelEdit = () => {
                if (!cellEl.classList.contains('acc-cell-editing')) return;
                cellEl.classList.remove('acc-cell-editing');
                cellEl.innerHTML = originalHTML;
            };

            const saveEdit = async () => {
                if (!cellEl.classList.contains('acc-cell-editing')) return;
                let newValue = editor.value;
                if (field === 'amount') {
                    newValue = parseFloat(newValue);
                    if (isNaN(newValue) || newValue < 0) {
                        logA('Số tiền không hợp lệ', 'warning', 'toast');
                        cancelEdit();
                        return;
                    }
                }
                if (String(newValue) === String(originalValue)) {
                    cancelEdit();
                    return;
                }
                try {
                    await A.DB.updateSingle(this.currentTransCol, id, { [field]: newValue });
                    logA('Đã cập nhật ' + (field === 'amount' ? 'số tiền' : field === 'category' ? 'hạng mục' : 'trạng thái'), 'success', 'toast');
                    this.refreshData();
                } catch (err) {
                    logA('Lỗi cập nhật: ' + err.message, 'error', 'toast');
                    cancelEdit();
                }
            };

            editor.addEventListener('keydown', (ke) => {
                if (ke.key === 'Enter') {
                    ke.preventDefault();
                    saveEdit();
                } else if (ke.key === 'Escape') {
                    ke.preventDefault();
                    cancelEdit();
                }
            });

            editor.addEventListener('blur', () => {
                setTimeout(() => {
                    if (cellEl.classList.contains('acc-cell-editing')) {
                        saveEdit();
                    }
                }, 150);
            });
        });
    }

    // ===================================================================
    // BULK ACTIONS
    // ===================================================================

    renderBulkActionBar() {
        return `
            <div id="bulk-action-bar" class="d-none d-flex align-items-center gap-2 p-2 bg-light border-bottom">
                <span class="small"><span id="selected-count">0</span> đã chọn</span>
                <button class="btn btn-sm btn-success" onclick="A.AccountantCtrl.bulkApprove()">Duyệt</button>
                <button class="btn btn-sm btn-danger" onclick="A.AccountantCtrl.bulkDelete()">Xóa</button>
                <select class="form-select form-select-sm" style="width: 150px" onchange="A.AccountantCtrl.bulkChangeCategory(this.value)">
                    <option value="">Đổi hạng mục...</option>
                    <option value="Tiền Phòng">Tiền Phòng</option>
                    <option value="Tiền Tour">Tiền Tour</option>
                    <option value="Thanh toán NCC">Thanh toán NCC</option>
                </select>
            </div>
        `;
    }

    injectBulkActionBar() {
        const wrapper = document.querySelector('.acc-table-wrapper');
        if (!wrapper || wrapper.querySelector('#bulk-action-bar')) return;
        const barHtml = this.renderBulkActionBar();
        wrapper.insertAdjacentHTML('afterbegin', barHtml);
        this._bindCheckboxEvents();
    }

    getSelectedIds() {
        return Array.from(this.selectedIds);
    }

    async bulkApprove() {
        const ids = this.getSelectedIds();
        if (ids.length === 0) return logA('Chưa chọn giao dịch nào', 'warning', 'toast');
        for (const id of ids) {
            await this.approveTransaction(id);
        }
        this.selectedIds.clear();
        this._updateBulkActionBar();
        this.refreshData();
        logA(`Đã duyệt ${ids.length} giao dịch`, 'success', 'toast');
    }

    async bulkDelete() {
        const ids = this.getSelectedIds();
        if (ids.length === 0) return logA('Chưa chọn giao dịch nào', 'warning', 'toast');
        if (CURRENT_USER.level < 50 && CURRENT_USER.role !== 'admin') {
            return logA('Không đủ quyền xóa hàng loạt', 'warning', 'toast');
        }
        showConfirm(`Xóa ${ids.length} giao dịch?`, async () => {
            await A.DB.batchDelete(this.currentTransCol, ids);
            this.selectedIds.clear();
            this._updateBulkActionBar();
            this.refreshData();
            logA(`Đã xóa ${ids.length} giao dịch`, 'success', 'toast');
        });
    }

    async bulkChangeCategory(category) {
        if (!category) return;
        const ids = this.getSelectedIds();
        if (ids.length === 0) return logA('Chưa chọn giao dịch nào', 'warning', 'toast');
        for (const id of ids) {
            await A.DB.updateSingle(this.currentTransCol, id, { category });
        }
        this.selectedIds.clear();
        this._updateBulkActionBar();
        this.refreshData();
        logA(`Đã đổi hạng mục ${ids.length} giao dịch`, 'success', 'toast');
    }

    _bindCheckboxEvents() {
        const wrapper = document.querySelector('.acc-table-wrapper');
        if (!wrapper || wrapper.dataset.bulkEventsBound) return;

        wrapper.addEventListener('click', (e) => {
            const target = e.target;

            if (target.id === 'select-all') {
                e.stopPropagation();
                const isChecked = target.checked;
                const rowChecks = wrapper.querySelectorAll('.row-select');
                rowChecks.forEach((cb) => {
                    const id = cb.dataset.id;
                    if (isChecked) this.selectedIds.add(id);
                    else this.selectedIds.delete(id);
                    cb.checked = isChecked;
                });
                this._updateBulkActionBar();
                return;
            }

            if (target.classList.contains('row-select')) {
                e.stopPropagation();
                const id = target.dataset.id;
                if (target.checked) this.selectedIds.add(id);
                else this.selectedIds.delete(id);
                this._updateBulkActionBar();
                return;
            }
        });

        wrapper.dataset.bulkEventsBound = 'true';
    }

    _updateBulkActionBar() {
        const bar = document.getElementById('bulk-action-bar');
        const countEl = document.getElementById('selected-count');
        if (!bar || !countEl) return;
        const count = this.selectedIds.size;
        countEl.textContent = count;
        bar.classList.toggle('d-none', count === 0);
        bar.classList.toggle('d-flex', count > 0);
    }

    _syncCheckboxState() {
        const wrapper = document.querySelector('.acc-table-wrapper');
        if (!wrapper) return;
        const rowChecks = wrapper.querySelectorAll('.row-select');
        let allChecked = rowChecks.length > 0;
        rowChecks.forEach((cb) => {
            const id = cb.dataset.id;
            const isSelected = this.selectedIds.has(id);
            cb.checked = isSelected;
            if (!isSelected) allChecked = false;
        });
        const selectAll = wrapper.querySelector('#select-all');
        if (selectAll) selectAll.checked = allChecked;
        this._updateBulkActionBar();
    }

    // ===================================================================
    // CÁC HÀM XỬ LÝ LỌC & NGÀY THÁNG ĐƯỢC TỐI ƯU
    // ===================================================================

    bindEvents() {
        const selector = document.getElementById('acc-entity-select');
        if (selector && !selector.disabled) {
            selector.addEventListener('change', (e) => {
                this.currentEntity = e.target.value;
                this.setupEntityAccess(CURRENT_USER.role);
                this.refreshData();
            });
        }

        // Tối ưu UI: Bật/tắt trạng thái disable của input date thay vì ẩn/hiện (UX tốt hơn)
        if (this.els.filterPeriod) {
            this.els.filterPeriod.addEventListener('change', (e) => {
                const isCustom = e.target.value === 'custom';
                if (this.els.filterStart) this.els.filterStart.readOnly = !isCustom;
                if (this.els.filterEnd) this.els.filterEnd.readOnly = !isCustom;

                if (!isCustom) {
                    // Tự động điền ngày nếu không phải custom
                    this.updateDatePickerUI(e.target.value);
                    this.applyFiltersAndRender();
                }
            });
        }

        if (this.els.btnApplyFilter) {
            this.els.btnApplyFilter.addEventListener('click', () => {
                this.filterState.field = this.els.filterField.value;
                this.filterState.keyword = this.els.filterValue.value;
                // Nếu đang ở custom, ép cập nhật lại period
                this.filterState.period = this.els.filterPeriod.value;
                this.applyFiltersAndRender();
            });
        }

        if (this.els.globalSearch) {
            this.els.globalSearch.addEventListener('input', (e) => {
                if (this._searchTimeout) clearTimeout(this._searchTimeout);
                this._searchTimeout = setTimeout(() => {
                    this.filterState.keyword = e.target.value;
                    this.applyFiltersAndRender();
                }, 300);
            });
        }

        if (this.els.btnFilterPending) {
            this.els.btnFilterPending.addEventListener('click', () => {
                const isPending = this.filterState.status === 'Pending';
                this.filterState.status = isPending ? 'all' : 'Pending';
                this.els.btnFilterPending.classList.toggle('btn-warning', !isPending);
                this.els.btnFilterPending.classList.toggle('btn-outline-warning', isPending);
                this.applyFiltersAndRender();
            });
        }
    }

    // Helper chuyển đổi Date object thành chuỗi YYYY-MM-DD theo giờ Local (Tránh lỗi UTC)
    _toLocalDateString(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return '';
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    getDateRange(period) {
        // 1. Dùng global helper của hệ thống nếu có
        if (typeof window.getDateRange === 'function' && period !== 'custom') {
            const globalRange = window.getDateRange(period);
            if (globalRange && globalRange.start) {
                // FIX LỖI: Ép kiểu Object Date của Global Helper về chuỗi chuẩn YYYY-MM-DD
                return {
                    start: globalRange.start instanceof Date ? this._toLocalDateString(globalRange.start) : globalRange.start,
                    end: globalRange.end instanceof Date ? this._toLocalDateString(globalRange.end) : globalRange.end,
                };
            }
        }

        // 2. Fallback nội bộ (Dự phòng nếu Global Helper lỗi hoặc chưa load)
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = now.getDate();
        let start, end;

        switch (period) {
            case 'today':
                start = new Date(y, m, d);
                end = new Date(y, m, d);
                break;
            case 'week':
                const day = now.getDay() || 7; // CN = 0 -> 7
                start = new Date(y, m, d - day + 1);
                end = new Date(y, m, d + (7 - day));
                break;
            case 'month':
                start = new Date(y, m, 1);
                end = new Date(y, m + 1, 0);
                break;
            case 'last_month':
                start = new Date(y, m - 1, 1);
                end = new Date(y, m, 0);
                break;
            case 'quarter':
                const qStartMonth = Math.floor(m / 3) * 3;
                start = new Date(y, qStartMonth, 1);
                end = new Date(y, qStartMonth + 3, 0);
                break;
            case 'year':
                start = new Date(y, 0, 1);
                end = new Date(y, 11, 31);
                break;
            case 'all':
                return { start: '2024-01-01', end: '2030-12-31' };
            default:
                return { start: '', end: '' }; // Dành cho custom
        }

        return {
            start: this._toLocalDateString(start),
            end: this._toLocalDateString(end),
        };
    }

    updateDatePickerUI(period = 'month') {
        const range = this.getDateRange(period);
        if (range && range.start) {
            if (this.els.filterStart) {
                this.els.filterStart.value = range.start;
                this.els.filterStart.readOnly = period !== 'custom';
            }
            if (this.els.filterEnd) {
                this.els.filterEnd.value = range.end;
                this.els.filterEnd.readOnly = period !== 'custom';
            }
        }
    }

    applyFiltersAndRender() {
        this.filterState.period = this.els.filterPeriod ? this.els.filterPeriod.value : 'month';
        let dateRange = { start: '', end: '' };

        // Xử lý lấy khoảng ngày chuẩn xác
        if (this.filterState.period === 'custom') {
            dateRange.start = this.els.filterStart ? this.els.filterStart.value : '';
            dateRange.end = this.els.filterEnd ? this.els.filterEnd.value : '';
        } else {
            dateRange = this.getDateRange(this.filterState.period);
        }

        let filtered = this.transactions;
        filtered = this.logic.applyFilter('period', filtered, dateRange);
        filtered = this.logic.applyFilter('keyword', filtered, this.filterState.keyword);
        filtered = this.logic.applyFilter('status', filtered, this.filterState.status);

        // Update text mô tả filter
        if (this.els.filterSummary) {
            const pText = this.els.filterPeriod.options[this.els.filterPeriod.selectedIndex].text;
            let summaryText = this.filterState.period === 'custom' ? `${dateRange.start} ➝ ${dateRange.end}` : pText;
            if (this.filterState.status === 'Pending') {
                summaryText += ' | ⏳ Chờ duyệt';
            }
            this.els.filterSummary.innerText = summaryText;
        }

        this.renderPerformanceStats(filtered);
        this.filteredTransactions = filtered;
        if (this.table) this.table.updateData(filtered);
        this._syncCheckboxState();
        this.renderCardListView(filtered);
        if (this.els.showingCount) this.els.showingCount.innerText = filtered.length;
    }

    updateFilterFieldOptions() {
        if (!this.els.filterField || this.transactions.length === 0) return;
        const keys = [
            { value: 'id', label: 'ID Giao Dịch' },
            { value: 'type', label: 'Loại (IN/OUT)' },
            { value: 'amount', label: 'Số tiền' },
            { value: 'category', label: 'Hạng mục' },
            { value: 'description', label: 'Diễn giải' },
            { value: 'booking_id', label: 'Booking ID' },
            { value: 'status', label: 'Trạng thái' },
            { value: 'created_by', label: 'Người tạo' },
        ];
        let html = '<option value="all">Tất cả</option>';
        keys.forEach((k) => {
            html += `<option value="${k.value}">${k.label}</option>`;
        });
        this.els.filterField.innerHTML = html;
    }
    /**
     * Helper: Mở modal chỉnh sửa từ bảng
     * HTML gọi: openEditModal('IN', 'PT-001') -> Nên hàm phải nhận 2 tham số
     */
    openEditModal(type, id) {
        let transaction = null;
        if (this.transactions.length > 0) {
            transaction = this.transactions.find((t) => t.id === id);
        } else {
            transaction = HD.find(APP_DATA.transactions, id, 'id');
        }

        if (!transaction) {
            console.error('❌ Debug: Không tìm thấy giao dịch.', {
                tim_id: id,
                trong_list: this.transactions,
            });
            return;
        }

        // 2. Gọi hàm mở modal (truyền đúng type và id)
        this.openEditTransactionModal(transaction);
    }

    // --- TRANSACTION MODAL & SAVE LOGIC (CORE FIX #1) ---

    /**
     * Open modal for creating a new transaction (IN or OUT)
     */
    async openNewTransactionModal(type) {
        await this.openTransactionModal(type);
    }

    /**
     * Open modal for editing an existing transaction
     */
    async openEditTransactionModal(transaction) {
        await this.openTransactionModal(transaction);
    }

    async openTransactionModal(type) {
        let existingData = null;
        if (typeof type === 'object') {
            existingData = type;
            type = existingData.type;
        }
        const isEdit = !!existingData;
        const mode = existingData ? existingData.type : type; // Nếu edit thì lấy type cũ

        const title = isEdit ? `Sửa Giao Dịch (${existingData.id})` : mode === 'IN' ? 'Lập Phiếu Thu' : 'Lập Phiếu Chi';
        const colorClass = mode === 'IN' ? 'text-success' : 'text-danger';
        const currentUser = window.A && CURRENT_USER ? CURRENT_USER.name || 'Hệ thống' : 'Hệ thống';
        if (!this.funds || this.funds.length === 0) this.funds = (await this.getData('fund_accounts')) || [];
        L._('Debug: Funds for modal', this.funds);
        // Fund Options
        let fundOptions = (this.funds || []).map((f) => `<option value="${f.id}" ${existingData && existingData.fund_source === f.id ? 'selected' : ''}>${f.name} (${formatMoney(f.balance)})</option>`).join('');
        if (!fundOptions) fundOptions = '<option disabled selected>Chưa có quỹ</option>';
        const isManager = CURRENT_USER && (CURRENT_USER.level >= 50 || CURRENT_USER.role === 'admin');
        const html = `
            <div id="acc-modal-form" style="max-height: calc(100vh - 250px); overflow-y: auto; margin: 0 auto;" data-collection="${this.currentTransCol}" data-doc-id="${isEdit ? existingData.id : ''}">
                <div style="width: 100%; max-width: 500px; margin: 0 auto; padding: 1rem; box-sizing: border-box;">
                <!-- Section 1: ID & Type (Read-only/Hidden Info) -->
                ${
                    isEdit
                        ? `
                <div class="mb-3 p-2 bkg-light border-bottom">
                    <div class="mb-2">
                        <label class="form-label fw-bold text-muted small">ID Giao Dịch</label>
                        <div class="form-control form-control-sm bkg-light small" readonly>${existingData?.id || 'Auto-gen'}</div>
                        <input type="hidden" data-field="id" value="${existingData?.id || ''}">
                    </div>
                    <div>
                        <label class="form-label fw-bold text-muted small">Loại GD</label>
                        <div class="form-control form-control-sm bkg-light small" readonly>${mode === 'IN' ? '📥 Phiếu Thu' : '📤 Phiếu Chi'}</div>
                        <input type="hidden" data-field="type" value="${mode}">
                    </div>
                </div>
                `
                        : `
                <input type="hidden" data-field="type" value="${mode}">
                `
                }

                <!-- Section 2: Core Fields -->
                <div class="mb-3">
                    <div class="mb-2">
                        <label class="form-label fw-bold small">📅 Ngày chứng từ</label>
                        <input type="date" class="form-control form-control-sm w-100" data-field="transaction_date" 
                            value="${existingData?.transaction_date || new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label class="form-label fw-bold small">🔄 Trạng thái</label>
                        <select class="form-select form-select-sm w-100" data-field="status" ${isEdit && existingData.status === 'Completed' && !isManager ? 'disabled' : ''}>
                            <option value="Pending" ${existingData?.status === 'Pending' ? 'selected' : ''}>⏳ Chờ duyệt</option>
                            <option value="Completed" ${existingData?.status === 'Completed' || !isEdit ? 'selected' : ''}>✅ Hoàn thành</option>
                            <option value="Planning" ${existingData?.status === 'Planning' ? 'selected' : ''}>📝 Lên Lịchh</option>
                        </select>
                        ${isEdit && existingData.status === 'Completed' && !isManager ? '<div class="form-text text-warning small mt-1"><i class="fas fa-info-circle"></i> Không thể sửa trạng thái khi đã hoàn thành</div>' : ''}
                    </div>
                </div>

                <!-- Section 3: Amount & Fund -->
                <div class="mb-3">
                    <label class="form-label fw-bold small">💰 Số tiền (VNĐ)</label>
                    <div class="input-group input-group-sm w-100">
                        <span class="input-group-text ${colorClass} fw-bold">${mode === 'IN' ? '+' : '-'}</span>
                        <input type="text" class="form-control form-control-sm fw-bold ${colorClass}" id="inp-amount-show" 
                            value="${existingData ? parseInt(existingData.amount).toLocaleString('vi-VN') : ''}" 
                            placeholder="0" autocomplete="off" ${isEdit && !isManager ? 'disabled' : ''}> 
                    </div>
                    ${isEdit && !isManager ? '<div class="form-text text-danger small mt-1"><i class="fas fa-lock"></i> Không được sửa số tiền</div>' : ''}
                </div>

                <div class="mb-3">
                    <label class="form-label fw-bold small">🏦 Quỹ tài chính</label>
                    <select data-source="fund_accounts" data-searchable="true" class="smart-select form-select form-select-sm w-100" data-field="fund_source" ${isEdit && !isManager ? 'disabled' : ''}>
                        <option value="">-- Chọn quỹ --</option>
                        ${fundOptions}
                    </select>
                </div>

                <!-- Section 4: Optional Fields -->
                <div class="mb-3 p-2 border rounded bkg-light">
                    <label class="form-label fw-bold text-primary small">🔗 Booking ID (Liên kết)</label>
                    <input type="text" class="form-control form-control-sm w-100" data-field="booking_id" 
                        value="${existingData?.booking_id || ''}" placeholder="VD: BK-2023-001..." 
                        ${isEdit && !isManager ? 'disabled' : ''}>
                    <div class="form-text small mt-1">Hệ thống sẽ tự động kiểm tra và cập nhật công nợ (có thể để trống)</div>
                </div>

                <!-- Section 5: Category & Description -->
                <div class="mb-3">
                    <div class="mb-2">
                        <label class="form-label fw-bold small">📂 Hạng mục</label>
                        <input type="text" class="form-control form-control-sm w-100" data-field="category" list="${mode === 'IN' ? 'cat-list-in' : 'cat-list-out'}" 
                            value="${existingData?.category || ''}" placeholder="VD: ${mode === 'IN' ? 'Tiền Phòng, Thu khác...' : 'Thanh toán NCC, Chi khác...'}" autocomplete="off">
                        <datalist id="cat-list-in">
                            <option value="Tiền Phòng">
                            <option value="Tiền Tour">
                            <option value="Tiền DV">
                            <option value="Công Nợ OTA">
                            <option value="Hoa hồng">
                            <option value="Tăng Vốn">
                            <option value="Thu khác">
                        </datalist>                            
                        <datalist id="cat-list-out">
                            <option value="Thanh toán NCC">
                            <option value="Định Phí">
                            <option value="Biến Phí">
                            <option value="Chi Lương">
                            <option value="Hoàn tiền">
                            <option value="Chi khác">
                        </datalist>
                    </div>
                    <div>
                        <label class="form-label fw-bold small">📝 Diễn giải / Ghi chú</label>
                        <input type="text" class="form-control form-control-sm w-100" data-field="description" 
                            value="${existingData?.description || ''}" placeholder="Nội dung giao dịch...">
                    </div>
                </div>

                <!-- Section 6: Metadata (Display only when edit) -->
                ${
                    isEdit
                        ? `
                <div class="mb-0 p-2 bkg-light border-top">
                    <div class="mb-2">
                        <label class="form-label fw-bold text-muted small">✏️ Tạo bởi</label>
                        <div class="form-control form-control-sm bkg-light small" readonly>${existingData?.created_by || 'Hệ thống'}</div>
                        <input type="hidden" data-field="created_by" value="${existingData?.created_by || currentUser}">
                    </div>
                    <div>
                        <label class="form-label fw-bold text-muted small">🕐 Ngày tạo</label>
                        <div class="form-control form-control-sm bkg-light small" readonly>${existingData?.created_at ? formatDateVN(existingData.created_at) : new Date().toISOString().split('T')[0]}</div>
                        <input type="hidden" data-field="created_at" value="${existingData?.created_at || new Date().toISOString()}">
                    </div>
                </div>
                `
                        : `
                <input type="hidden" data-field="created_by" value="${currentUser}">
                <input type="hidden" data-field="created_at" value="${new Date().toISOString()}">
                `
                }
                </div>
            </div>
        `;

        A.Modal.render(html, title);

        if (existingData) {
            HD.setFormData('acc-modal-form', existingData);
        }

        // Format money input
        const inpMoney = document.getElementById('inp-amount-show');
        if (inpMoney && !inpMoney.disabled) {
            inpMoney.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                e.target.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
            });
        }

        A.Modal.setSaveHandler(() => this.handleSaveTransaction(mode, isEdit, existingData?.id), 'Lưu Giao Dịch');
        A.Modal.setResetHandler(() => this.deleteTransaction(existingData?.id), 'Xóa Giao Dịch');
        A.Modal.show();
    }

    async deleteTransaction(id) {
        if (!id) {
            id = await this.openPromptModal('Xóa Giao Dịch', 'Vui lòng nhập ID giao dịch để xóa...', '');
        }
        if (!id) return;
        showConfirm('Xác nhận xóa giao dịch?', async () => {
            if (CURRENT_USER.level < 50) return;
            await A.DB.deleteRecord(this.currentTransCol, id);
            this.refreshData();
            logA('Đã xóa giao dịch', 'success', 'toast');
        });
    }

    /**
     * CORE LOGIC: Save Transaction
     * 1. Validate Input
     * 2. Check Booking existence (quan trọng)
     * 3. Gen ID (PT-xxx)
     * 4. Save Trans
     * 5. Update Fund
     * 6. Aggregate & Update Booking/Operator
     */
    async handleSaveTransaction(type, isEdit, docId) {
        const formDataResult = HD.getFormData('acc-modal-form', this.currentTransCol);
        const data = Object.values(formDataResult)[0] || {};

        const amountShow = getVal('inp-amount-show');
        const amount = parseFloat(amountShow);
        if (!data.fund_source) data.fund_source = document.querySelector('#acc-modal-form [data-field="fund_source"]').value;
        // 1. Validate
        if (!amount || amount <= 0) return logA('Số tiền không hợp lệ', 'warning', 'alert');
        if (!data.fund_source && !isEdit) return logA('Chưa chọn quỹ', 'warning', 'alert');

        // --- 2. XỬ LÝ BOOKING ID (Quan trọng) ---
        // Đọc từ APP_DATA thay vì gọi Firestore trực tiếp — data đã có trong bộ nhớ
        let bookingData;
        let bkId;
        if (data.booking_id) {
            if (data.type === 'IN') {
                bookingData = window.APP_DATA?.bookings?.[data.booking_id];
                bkId = data.booking_id;
            } else if (data.type === 'OUT') {
                bookingData = window.APP_DATA?.operator_entries?.[data.booking_id];
                bkId = bookingData?.booking_id;
            }
            if (!bookingData) {
                return Opps(`❌ Lỗi: Booking/Operator Entries [${data.booking_id}] không tồn tại trong hệ thống!`, `❌ Lỗi: Booking ID [${data.booking_id}] không tồn tại trong hệ thống!`);
            }
        }

        // Setup button loading
        const btnSave = document.querySelector('.modal-footer .btn-primary');
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Xử lý...';
        btnSave.disabled = true;

        try {
            const db = window.A.DB.db;
            // --- 3. GENERATE ID (Tự động tăng cho cả PT và PC) ---
            // Sử dụng HD.generateTransId để đồng bộ với Sales/Operator modules
            let transId = docId; // Mặc định là ID cũ nếu đang Edit

            if (!isEdit) {
                transId = await HD.generateTransId(type === 'IN' ? 'IN' : 'OUT');
            }

            const collectionName = this.currentTransCol || 'transactions';
            // --- 4. TẠO RECORD GIAO DỊCH ---
            const record = {
                id: transId,
                ...data,
                amount: amount,
                type: type,
                updated_at: new Date().toISOString(),
            };

            await window.A.DB.saveRecord(collectionName, record);
            L._(`Saved Transaction ${transId}`);

            // --- Ghi booking history (nếu giao dịch gắn booking) ---
            if (bkId && window.A?.DB?.recordHistory) {
                const histAction = isEdit ? 'Cập nhật' : 'Tạo mới';
                const amountStr = typeof amount === 'number' ? amount.toLocaleString('vi-VN') : amount;
                window.A.DB.recordHistory(bkId, `${histAction} Giao dịch ${type} ${amountStr} (${transId})`);
            }

            // --- 5. AGGREGATION (CỘNG DỒN & UPDATE PARENT) ---
            // Bước này chạy riêng sau khi đã lưu transaction thành công
            if (type === 'IN' && data.booking_id && data.status === 'Completed') {
                await this.aggregateBookingBalance(bkId, type, amount);
                if (SalesModule) {
                    SalesModule.DB.updateDeposit();
                } else this.refreshData();
            }
            A.Modal.hide();
            logA('✅ Lưu thành công!', 'success');
        } catch (e) {
            console.error(e);
            Opps('❌ Lỗi: ' + e.message);
            btnSave.innerText = 'Lưu lại';
            btnSave.disabled = false;
        }
    }

    /**
     * Logic Cộng dồn tiền và Update vào Booking/Operator.
     * Đọc từ APP_DATA (đã được saveRecord cập nhật) — không cần thêm Firestore read.
     */
    async aggregateBookingBalance(bookingId, type, amount) {
        L._(`Aggregating for Booking: ${bookingId}, Type: ${type}`);
        // Access NotificationManager from the main app bundle (avoids broken relative import in production)
        const NotificationManager = window.A?.NotificationManager;
        if (amount) amount = parseFloat(amount);

        try {
            // Tổng hợp từ APP_DATA — saveRecord đã cập nhật trước đó, không cần query Firestore
            const allTransData = window.APP_DATA?.[`${this.currentTransCol}_by_booking`] || {};
            const transBk = HD.filter(allTransData[bookingId], 'Completed', '==', 'status');
            if (!transBk) return;
            let totalIn = 0,
                totalOut = 0;

            totalIn = HD.agg(HD.filter(transBk, 'IN', 'type'), 'amount');
            totalOut = HD.agg(HD.filter(transBk, 'OUT', 'type'), 'amount');
            L._(`[ACC CONTROLLER] Booking ${bookingId} totalIn: ${totalIn}, totalOut: ${totalOut}`);

            if (type === 'IN' && totalIn > 0) {
                totalIn = parseFloat(totalIn) / 1000;
                // Đọc booking từ APP_DATA — không cần .get() Firestore
                const bookingData = window.APP_DATA?.bookings?.[bookingId] || {};
                const totalAmount = parseFloat(bookingData.total_amount || 0);
                const customerName = bookingData.customer_full_name || '';
                const balance = totalAmount - totalIn;

                // Cập nhật qua DBManager (tự update APP_DATA + audit log)
                await window.A.DB.updateSingle('bookings', bookingId, {
                    id: bookingId,
                    deposit_amount: totalIn,
                    balance_amount: balance,
                    status: balance <= 0 ? 'Thanh Toán' : totalIn > 0 ? 'Đặt Cọc' : 'Đặt Lịch',
                });

                NotificationManager?.sendToSales('THANH TOÁN MỚI CHO BOOKING', `Booking ${bookingId} - ${customerName} đã nhận: ${amount}.000đ. Tổng thanh toán: ${formatNumber(totalIn)}.000đ. Còn lại: ${formatNumber(balance)}.000 VNĐ.`);
            } else if (type === 'OUT') {
                totalOut = parseFloat(totalOut) / 1000;
                // Đọc operator entry từ APP_DATA
                const opData = window.APP_DATA?.operator_entries?.[bookingId];
                if (opData) {
                    const totalCost = parseFloat(opData.total_cost || 0);
                    const debt = totalCost - totalOut;

                    // Cập nhật qua DBManager
                    await window.A.DB.updateSingle('operator_entries', bookingId, {
                        id: bookingId,
                        paid_amount: totalOut,
                        debt_balance: debt,
                    });
                    NotificationManager?.sendToOperator('CẬP NHẬT THANH TOÁN', `Đã thanh toán ${bookingId} - ${opData.service_name || ''} : ${formatNumber(totalOut)}000đ. Số dư còn lại: ${formatNumber(debt)}.000đ.`);
                }
            }
        } catch (e) {
            L.Log('Aggregation Error:', e);
            console.warn('Giao dịch đã lưu nhưng cập nhật số dư Booking thất bại. Hãy kiểm tra lại.');
        }
    }

    // --- FUND TRANSFER LOGIC ---

    async openTransferModal() {
        if (!this.funds || this.funds.length === 0) this.funds = (await this.getData(this.currentFundCol)) || [];
        const fundOptions = this.funds.map((f) => `<option value="${f.id}">${f.name} (${formatMoney(f.balance)})</option>`).join('');
        if (!fundOptions) return logA('Chưa có quỹ nào để chuyển', 'warning', 'alert');

        const html = `
            <div id="transfer-modal-form" style="max-width: 500px; margin: 0 auto; padding: 1rem;">
                <div class="mb-3">
                    <label class="form-label fw-bold small">📤 Quỹ nguồn</label>
                    <select class="form-select form-select-sm" id="transfer-source">${fundOptions}</select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small">📥 Quỹ đích</label>
                    <select class="form-select form-select-sm" id="transfer-dest">${fundOptions}</select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small">💰 Số tiền (VNĐ)</label>
                    <input type="text" class="form-control form-control-sm fw-bold" id="transfer-amount" placeholder="0" autocomplete="off">
                </div>
            </div>
        `;
        A.Modal.render(html, 'Chuyển Quỹ');

        // Format money input
        const inpMoney = document.getElementById('transfer-amount');
        if (inpMoney) {
            inpMoney.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                e.target.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
            });
        }

        A.Modal.setSaveHandler(() => this.handleTransfer(), 'Chuyển');
        A.Modal.show();
    }

    async handleTransfer() {
        const source = document.getElementById('transfer-source').value;
        const dest = document.getElementById('transfer-dest').value;
        const amountRaw = document.getElementById('transfer-amount').value.replace(/\D/g, '');
        const amount = parseFloat(amountRaw);

        if (source === dest) return logA('Quỹ nguồn và đích không được giống nhau', 'warning', 'alert');
        if (!amount || amount <= 0) return logA('Số tiền không hợp lệ', 'warning', 'alert');

        const transferId = 'TR-' + Date.now();
        const timestamp = new Date().toISOString();
        const today = timestamp.split('T')[0];
        const userName = CURRENT_USER?.name || 'Hệ thống';

        // Create OUT transaction
        await A.DB.saveRecord(this.currentTransCol, {
            id: await HD.generateTransId('OUT'),
            type: 'OUT',
            amount,
            category: 'Chuyển quỹ',
            description: `Chuyển sang ${dest}`,
            fund_source: source,
            status: 'Completed',
            transfer_id: transferId,
            transaction_date: today,
            created_at: timestamp,
            created_by: userName,
        });

        // Create IN transaction
        await A.DB.saveRecord(this.currentTransCol, {
            id: await HD.generateTransId('IN'),
            type: 'IN',
            amount,
            category: 'Chuyển quỹ',
            description: `Nhận từ ${source}`,
            fund_source: dest,
            status: 'Completed',
            transfer_id: transferId,
            transaction_date: today,
            created_at: timestamp,
            created_by: userName,
        });

        logA('Chuyển quỹ thành công', 'success');
        A.Modal.hide();
        this.refreshData();
    }

    /**
     * Mở modal báo cáo P&L (Lãi/Lỗ theo booking)
     */
    async openPnLReport() {
        await this.pnlReport.show();
    }

    /**
     * Mở dashboard công nợ nhà cung cấp
     */
    openSupplierDebt() {
        this.supplierDebt.show();
    }

    /**
     * Mở modal biểu đồ tài chính
     */
    async openCharts() {
        await this.charts.show();
    }

    /**
     * Xuất CSV
     */
    exportCSV() {
        this.exportUtil.exportCSV();
    }

    /**
     * Xuất PDF (print-based)
     */
    exportPDF() {
        this.exportUtil.exportPDF();
    }

    /**
     * Mở modal báo cáo giao dịch
     * Tải template động qua A.UI.HELP.loadHtmlFile và render bằng A.Modal
     */
    async openReportModal() {
        try {
            // Tải template HTML động
            const html = await A.UI.HELP.loadHtmlFile('./src/components/tpl_accountant_report.html');
            if (!html) {
                console.error('❌ Không thể tải template báo cáo');
                return;
            }

            // Render nội dung vào A.Modal
            A.Modal.render(html, 'Báo Cáo Giao Dịch', { size: 'modal-xl', footer: false });
            A.Modal.show();

            // Render dữ liệu sau khi modal mở
            await this.renderReportData();

            // Bind event listeners cho các filter
            this.setupReportEventListeners();
        } catch (e) {
            console.error('❌ Report Modal Error:', e);
            Opps('Lỗi mở báo cáo: ' + e.message);
        }
    }

    /**
     * Render dữ liệu báo cáo vào bảng
     */
    async renderReportData() {
        try {
            // Gọi hàm từ accountant_logic để tải dữ liệu
            const hasData = await getNewData();
            if (!hasData) {
                console.warn('⚠️ Không có dữ liệu từ getNewData');
            }

            // Lấy dữ liệu từ cache
            const allTransactions = this.transactions || [];
            const tbody = document.getElementById('report-table-body');

            if (!tbody) return;

            // Xóa loading state
            tbody.innerHTML = '';

            if (allTransactions.length === 0) {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-4">Không có dữ liệu</td></tr>`;
                return;
            }

            // Render bảng
            let totalIn = 0,
                totalOut = 0,
                totalAmount = 0;

            allTransactions.forEach((trans) => {
                const amount = parseFloat(trans.amount || 0);
                const isIn = trans.type === 'IN';
                if (isIn) totalIn += amount;
                else totalOut += amount;
                totalAmount += amount;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="ps-3">${trans.id || ''}</td>
                    <td class="text-center">
                        <span class="badge ${isIn ? 'bg-success' : 'bg-danger'}">
                            ${isIn ? '📥 IN' : '📤 OUT'}
                        </span>
                    </td>
                    <td class="text-center">${trans.transaction_date ? trans.transaction_date.substring(0, 10) : ''}</td>
                    <td class="text-center">${trans.created_at ? new Date(trans.created_at).toLocaleDateString('vi-VN') : ''}</td>
                    <td class="text-end fw-bold ${isIn ? 'text-success' : 'text-danger'}">
                        ${isIn ? '+' : '-'} ${formatMoney(amount)}
                    </td>
                    <td>${trans.description || ''}</td>
                    <td class="small">${trans.category || ''}</td>
                    <td class="small">${trans.booking_id || '-'}</td>
                    <td class="small">${trans.fund_source || '-'}</td>
                    <td class="text-center small">
                        <span class="badge ${trans.status === 'Completed' ? 'bg-success' : 'bg-warning'}">
                            ${trans.status || ''}
                        </span>
                    </td>
                    <td class="small">${trans.created_by || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="A.AccountantCtrl.openEditModal('${trans.type}', '${trans.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            // Update totals
            document.getElementById('report-total-records').textContent = allTransactions.length;
            document.getElementById('report-total-in').textContent = formatMoney(totalIn);
            document.getElementById('report-total-out').textContent = formatMoney(totalOut);
            document.getElementById('report-balance').textContent = formatMoney(totalIn - totalOut);
        } catch (e) {
            L.log('Render Report Error:', e);
            const tbody = document.getElementById('report-table-body');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger">Lỗi tải dữ liệu: ${e.message}</td></tr>`;
            }
        }
    }

    /**
     * Setup event listeners cho report modal
     */
    setupReportEventListeners() {
        try {
            // Period filter
            const periodSelect = document.getElementById('report-filter-period');
            const customDateRow = document.getElementById('report-custom-date-row');
            if (periodSelect) {
                periodSelect.addEventListener('change', (e) => {
                    if (customDateRow) {
                        customDateRow.style.display = e.target.value === 'custom' ? 'block' : 'none';
                    }
                });
            }

            // Apply filter button
            const applyBtn = document.getElementById('btn-apply-report-filter');
            if (applyBtn) {
                applyBtn.addEventListener('click', () => {
                    this.applyReportFilters();
                });
            }

            // Reset filter button
            const resetBtn = document.getElementById('btn-reset-report-filter');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    this.renderReportData();
                });
            }

            // Report type filter
            const typeSelect = document.getElementById('report-type-select');
            if (typeSelect) {
                typeSelect.addEventListener('change', () => {
                    this.applyReportFilters();
                });
            }
        } catch (e) {
            console.error('Setup Report Listeners Error:', e);
        }
    }

    applyReportFilters() {
        try {
            const typeFilter = document.getElementById('report-type-select')?.value || 'all';
            const keyword = document.getElementById('report-filter-keyword')?.value || '';
            const fundFilter = document.getElementById('report-filter-fund')?.value || '';

            // Lấy thêm filter theo ngày (Fix lỗi thiếu logic ngày trong Report)
            const periodSelect = document.getElementById('report-filter-period');
            const period = periodSelect ? periodSelect.value : 'month';
            let dateRange = { start: '', end: '' };

            if (period === 'custom') {
                dateRange.start = document.getElementById('report-filter-start')?.value || '';
                dateRange.end = document.getElementById('report-filter-end')?.value || '';
            } else {
                dateRange = this.getDateRange(period);
            }

            const allTransactions = this.transactions || [];
            let filtered = allTransactions;

            // Filter by Date (Mới thêm)
            if (dateRange && dateRange.start && dateRange.end) {
                filtered = filtered.filter((t) => {
                    const tDate = t.transaction_date ? t.transaction_date.substring(0, 10) : t.created_at ? t.created_at.substring(0, 10) : '';
                    return tDate >= dateRange.start && tDate <= dateRange.end;
                });
            }

            // Filter by type
            if (typeFilter !== 'all' && typeFilter !== 'summary') {
                filtered = filtered.filter((t) => t.type === typeFilter.toUpperCase());
            }

            // Filter by keyword
            if (keyword) {
                const lowerKeyword = removeVietnameseTones(keyword.toLowerCase());
                filtered = filtered.filter((t) => {
                    const content = removeVietnameseTones(`${t.id} ${t.description} ${t.booking_id}`).toLowerCase();
                    return content.includes(lowerKeyword);
                });
            }

            // Filter by fund
            if (fundFilter) {
                filtered = filtered.filter((t) => t.fund_source === fundFilter);
            }

            // Update text mô tả filter trên header report
            const summaryEl = document.getElementById('report-filter-summary');
            if (summaryEl && periodSelect) {
                summaryEl.innerText = period === 'custom' ? `${dateRange.start} ➝ ${dateRange.end}` : periodSelect.options[periodSelect.selectedIndex].text;
            }

            // Render filtered data ... (Giữ nguyên đoạn code render HTML table phía dưới của hàm này)
            const tbody = document.getElementById('report-table-body');
            if (!tbody) return;

            tbody.innerHTML = '';
            let totalIn = 0,
                totalOut = 0;

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-4">Không tìm thấy giao dịch phù hợp</td></tr>`;
            } else {
                filtered.forEach((trans) => {
                    const amount = parseFloat(trans.amount || 0);
                    const isIn = trans.type === 'IN';
                    if (isIn) totalIn += amount;
                    else totalOut += amount;

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="ps-3 fw-bold text-primary">${trans.id || ''}</td>
                        <td class="text-center">
                            <span class="badge ${isIn ? 'bg-success' : 'bg-danger'}">
                                ${isIn ? '📥 IN' : '📤 OUT'}
                            </span>
                        </td>
                        <td class="text-center">${trans.transaction_date ? trans.transaction_date.substring(0, 10) : ''}</td>
                        <td class="text-center">${trans.created_at ? new Date(trans.created_at).toLocaleDateString('vi-VN') : ''}</td>
                        <td class="text-end fw-bold ${isIn ? 'text-success' : 'text-danger'}">
                            ${isIn ? '+' : '-'} ${formatMoney(amount)}
                        </td>
                        <td><div class="text-truncate" style="max-width: 200px;" title="${trans.description || ''}">${trans.description || ''}</div></td>
                        <td class="small">${trans.category || ''}</td>
                        <td class="small">${trans.booking_id ? `<span class="badge bg-info ">${trans.booking_id}</span>` : '-'}</td>
                        <td class="small">${trans.fund_source || '-'}</td>
                        <td class="text-center small">
                            <span class="badge ${trans.status === 'Completed' ? 'bg-success' : 'bg-warning'}">
                                ${trans.status || ''}
                            </span>
                        </td>
                        <td class="small text-muted">${trans.created_by || ''}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary py-0" onclick="A.AccountantCtrl.openEditModal('${trans.type}', '${trans.id}')">
                                <i class="fas fa-edit"></i>
                            </button>
                        </td>
            `;
                    tbody.appendChild(row);
                });
            }

            // Update totals
            document.getElementById('report-total-records').textContent = filtered.length;
            document.getElementById('report-total-in').textContent = formatMoney(totalIn);
            document.getElementById('report-total-out').textContent = formatMoney(totalOut);
            const balanceEl = document.getElementById('report-balance');
            balanceEl.textContent = formatMoney(totalIn - totalOut);
            balanceEl.className = `fw-bold ${totalIn - totalOut >= 0 ? 'text-success' : 'text-danger'}`;
        } catch (e) {
            console.error('Apply Report Filters Error:', e);
        }
    }
}

// ===================================================================
// INITIALIZATION
// ===================================================================
const AccountantCtrl = new AccountantController();
export default AccountantCtrl;
