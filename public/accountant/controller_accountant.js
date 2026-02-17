/**
 * AccountantController - Module quản lý kế toán (Fixed & Optimized)
 * * Updates:
 * - Fix DOM Timing issue
 * - Advanced Transaction Logic (Check Booking -> Gen ID -> Update Balance)
 * - Fix Filter logic
 * - Added removeVietnameseTones
 */

// --- 1. HELPER FUNCTIONS ---

function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    // Some system encode vietnamese combining accent as individual utf-8 characters
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ""); 
    str = str.replace(/\u02C6|\u0306|\u031B/g, ""); // ˆ ̆ ̛  Â, Ê, Ă, Ơ, Ư
    // Remove extra spaces
    str = str.replace(/ + /g, " ");
    str = str.trim();
    return str;
}

function formatCurrency(amount) {
    try {
        const num = parseFloat(amount || 0);
        if (isNaN(num)) return '0 ₫';
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num);
    } catch (e) { return '0 ₫'; }
}

function formatDate(dateStr) {
    try {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) { return dateStr || '-'; }
}

// --- 2. CLASS DEFINITION ---

class AccountantController {
    constructor() {
        this.currentEntity = '9trip';
        this.entityConfig = {
            '9trip': { trans: 'transactions', fund: 'fund_accounts', role: 'acc' },
            'thenice': { trans: 'transactions_thenice', fund: 'fund_accounts_thenice', role: 'acc_thenice' }
        };

        this.funds = [];
        this.transactions = [];
        this.els = {}; // Cache DOM

        this.filterState = {
            period: 'month',
            startDate: null,
            endDate: null,
            field: 'all',
            keyword: ''
        };
    }

    // --- INIT & FLOW CONTROL ---

    async init() {
        console.log("Accountant Module: Initializing...");
        
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
        if (checkEl) {
            this._start();
        } else {
            // Thử lại sau 100ms (tối đa 10 lần)
            if (!this._retryCount) this._retryCount = 0;
            this._retryCount++;
            if (this._retryCount < 20) {
                setTimeout(() => this._waitForDom(), 100);
            } else {
                console.error("Accountant: DOM Elements not found after retries. Check HTML ID.");
            }
        }
    }

    async _start() {
        try {
            const userRole = (window.A && A.CFG && A.CFG.role) ? A.CFG.role : 'acc';
            this.setupEntityAccess(userRole);

            this.cacheDom();
            this.bindEvents(); // Bind event ngay khi có DOM

            await this.refreshData(); // Sau đó mới load data
            
            // Set default date picker values
            this.updateDatePickerUI();
            
            console.log(`Accountant Module: Ready (${this.currentEntity})`);
        } catch (error) {
            console.error("Accountant Init Error:", error);
        }
    }

    setupEntityAccess(role) {
        const selector = document.getElementById('acc-entity-select');
        if (role === 'acc_thenice') {
            this.currentEntity = 'thenice';
            if(selector) { selector.value = 'thenice'; selector.disabled = true; }
        } else {
            this.currentEntity = '9trip';
            if(selector) selector.value = '9trip';
        }
        this.currentTransCol = this.entityConfig[this.currentEntity].trans;
        this.currentFundCol = this.entityConfig[this.currentEntity].fund;
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
            
            globalSearch: document.getElementById('acc-global-search')
        };
    }

    // --- DATA HANDLING ---

    async getData(collectionName) {
        // Luôn fetch mới nhất để đảm bảo tính đúng đắn của kế toán
        // Có thể cache nhẹ nếu cần, nhưng kế toán nên ưu tiên real-time
        console.log(`Fetching data for ${collectionName}...`);
        const data = await (window.A && window.A.DB ? window.A.DB.loadCollection(collectionName) : []);
        if (window.A && A.DATA) A.DATA[collectionName] = data;
        return data;
    }

    async refreshData() {
        try {
            const [fundsData, transData] = await Promise.all([
                this.getData(this.currentFundCol),
                this.getData(this.currentTransCol)
            ]);
            
            this.funds = fundsData || [];
            this.transactions = transData || [];
            
            // Sort: Mới nhất lên đầu
            this.transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

            this.renderDashboardAssets();
            this.applyFiltersAndRender();
            this.updateFilterFieldOptions();

        } catch (error) {
            console.error("Refresh Data Error:", error);
        }
    }

    // --- RENDER LOGIC ---

    renderDashboardAssets() {
        if (!this.els.fundListContainer) return;
        let totalBalance = 0;
        let html = '';

        this.funds.forEach(fund => {
            const balance = parseFloat(fund.balance || 0);
            totalBalance += balance;
            const icon = fund.id === 'cash' ? '<i class="fas fa-money-bill-wave text-success me-2"></i>' : '<i class="fas fa-university text-primary me-2"></i>';
            const name = fund.name || fund.id || 'Quỹ ẩn';
            
            html += `
                <div class="d-flex justify-content-between align-items-center mb-2 p-2 border-bottom border-light">
                    <div class="d-flex align-items-center small">
                        ${icon} <span class="text-dark fw-bold">${name}</span>
                        ${fund.account_no ? `<span class="text-muted ms-1" style="font-size:0.75rem">(${fund.account_no})</span>` : ''}
                    </div>
                    <span class="fw-bold text-dark">${formatCurrency(balance)}</span>
                </div>`;
        });

        this.els.fundListContainer.innerHTML = html || '<div class="text-muted small text-center">Chưa có quỹ</div>';
        if (this.els.totalFund) this.els.totalFund.innerText = formatCurrency(totalBalance);
    }

    applyFiltersAndRender() {
        // Fix #2: Logic bộ lọc
        this.filterState.period = this.els.filterPeriod ? this.els.filterPeriod.value : 'month';
        
        // Lấy khoảng ngày chuẩn
        const dateRange = this.getDateRange(this.filterState.period);
        
        // Update lại giá trị input date để user thấy
        if (dateRange && this.filterState.period !== 'custom') {
            if(this.els.filterStart) this.els.filterStart.value = dateRange.start;
            if(this.els.filterEnd) this.els.filterEnd.value = dateRange.end;
        } else if (this.filterState.period === 'custom') {
             // Nếu là custom, lấy giá trị từ input
             dateRange.start = this.els.filterStart.value;
             dateRange.end = this.els.filterEnd.value;
        }

        const filtered = this.transactions.filter(item => {
            // Lọc ngày (So sánh String YYYY-MM-DD ok)
            if (dateRange && dateRange.start && dateRange.end) {
                if (item.transaction_date < dateRange.start || item.transaction_date > dateRange.end) return false;
            }

            // Lọc Keyword
            if (this.filterState.keyword) {
                const key = this.filterState.keyword.toLowerCase();
                const field = this.filterState.field;
                if (field === 'all') {
                    const content = removeVietnameseTones(`${item.description} ${item.category} ${item.booking_id} ${formatCurrency(item.amount)}`).toLowerCase();
                    if (!content.includes(removeVietnameseTones(key))) return false;
                } else {
                    const val = item[field] ? String(item[field]).toLowerCase() : '';
                    if (!val.includes(key)) return false;
                }
            }
            return true;
        });

        this.renderPerformanceStats(filtered);
        this.renderTable(filtered);
    }

    renderPerformanceStats(data) {
        let totalIn = 0, totalOut = 0;
        data.forEach(item => {
            const amount = parseFloat(item.amount || 0);
            if (item.type === 'IN') totalIn += amount;
            else if (item.type === 'OUT') totalOut += amount;
        });
        const net = totalIn - totalOut;

        if(this.els.totalIn) this.els.totalIn.innerText = formatCurrency(totalIn);
        if(this.els.totalOut) this.els.totalOut.innerText = formatCurrency(totalOut);
        
        if(this.els.netBalance) {
            this.els.netBalance.innerText = (net >= 0 ? '+' : '-') + formatCurrency(Math.abs(net));
            this.els.netBalance.className = `h4 mb-0 fw-bold ${net >= 0 ? 'text-success' : 'text-danger'}`;
        }
    }

    renderTable(data) {
        if (!this.els.tableBody) return;
        this.els.showingCount.innerText = data.length;

        if (data.length === 0) {
            this.els.tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">Không có dữ liệu</td></tr>`;
            return;
        }

        const html = data.map(item => {
            const isIn = item.type === 'IN';
            const amountClass = isIn ? 'text-success' : 'text-danger';
            const sign = isIn ? '+' : '-';
            const fundName = this.funds.find(f => f.id === item.fund_source)?.name || item.fund_source || '-';
            
            let statusBadge = '<span class="badge bg-secondary">Khác</span>';
            if(item.status === 'Completed') statusBadge = '<span class="badge bg-success-subtle text-success">Hoàn thành</span>';
            else if(item.status === 'Pending') statusBadge = '<span class="badge bg-warning-subtle text-warning">Chờ duyệt</span>';

            return `
                <tr role="button" onclick="window.AccountantCtrl.openEditModal('${item.type}', '${item.id}')">
                    <td class="small fw-bold text-muted">${formatDate(item.transaction_date)}</td>
                    <td class="small text-muted">${item.id || '-'}</td>
                    <td class="text-end fw-bold ${amountClass}">${sign} ${formatCurrency(item.amount)}</td>
                    <td>
                        <div class="text-truncate fw-bold text-dark" style="max-width: 200px;">${item.description}</div>
                        <div class="small text-muted fst-italic">
                            ${item.category} ${item.booking_id ? `<span class="badge bg-light text-dark border ms-1">${item.booking_id}</span>` : ''}
                        </div>
                    </td>
                    <td class="small">${fundName}</td>
                    <td>${statusBadge}</td>
                    <td class="text-end"><i class="fas fa-chevron-right text-muted small"></i></td>
                </tr>
            `;
        }).join('');

        this.els.tableBody.innerHTML = html;
    }

    // --- FILTERS & UTILS ---

    bindEvents() {
        const selector = document.getElementById('acc-entity-select');
        if (selector && !selector.disabled) {
            selector.addEventListener('change', (e) => {
                this.currentEntity = e.target.value;
                this.setupEntityAccess(A.CFG.role);
                this.refreshData();
            });
        }

        // Filter Period Change -> Apply ngay lập tức
        if (this.els.filterPeriod) {
            this.els.filterPeriod.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    if (this.els.customDateRow) this.els.customDateRow.classList.remove('d-none');
                } else {
                    if (this.els.customDateRow) this.els.customDateRow.classList.add('d-none');
                    this.applyFiltersAndRender(); // Auto apply nếu không phải custom
                }
            });
        }

        // Button Apply Filter (Dành cho custom date hoặc mobile)
        if (this.els.btnApplyFilter) {
            this.els.btnApplyFilter.addEventListener('click', () => {
                this.filterState.field = this.els.filterField.value;
                this.filterState.keyword = this.els.filterValue.value;
                this.applyFiltersAndRender();
            });
        }

        // Global Search Input
        if (this.els.globalSearch) {
            this.els.globalSearch.addEventListener('input', (e) => {
                // Debounce simple: Clear timeout cũ
                if(this._searchTimeout) clearTimeout(this._searchTimeout);
                this._searchTimeout = setTimeout(() => {
                     this.filterState.keyword = e.target.value;
                     this.applyFiltersAndRender();
                }, 300);
            });
        }
    }

    getDateRange(period) {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        let start, end;

        switch (period) {
            case 'today': start = now; end = now; break;
            case 'week': 
                const day = now.getDay() || 7; 
                start = new Date(now); start.setDate(now.getDate() - day + 1);
                end = new Date(now); end.setDate(now.getDate() + (7 - day));
                break;
            case 'month': start = new Date(y, m, 1); end = new Date(y, m + 1, 0); break;
            case 'last_month': start = new Date(y, m - 1, 1); end = new Date(y, m, 0); break;
            case 'year': start = new Date(y, 0, 1); end = new Date(y, 11, 31); break;
            case 'all': return { start: '2000-01-01', end: '2099-12-31' };
            default: return { start: '', end: '' }; // Custom
        }

        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    updateDatePickerUI() {
        const range = this.getDateRange('month');
        if(this.els.filterStart) this.els.filterStart.value = range.start;
        if(this.els.filterEnd) this.els.filterEnd.value = range.end;
    }

    updateFilterFieldOptions() {
        if (!this.els.filterField || this.transactions.length === 0) return;
        const keys = ['description', 'category', 'booking_id', 'amount']; // Các field phổ biến
        let html = '<option value="all">Tất cả</option>';
        keys.forEach(k => {
            html += `<option value="${k}">${k.toUpperCase()}</option>`;
        });
        this.els.filterField.innerHTML = html;
    }
    /**
     * Helper: Mở modal chỉnh sửa từ bảng
     * HTML gọi: openEditModal('IN', 'PT-001') -> Nên hàm phải nhận 2 tham số
     */
    openEditModal(type, id) {
        // 1. Tìm giao dịch dựa trên ID (tham số thứ 2)
        const transaction = this.transactions.find(t => t.id === id);
        
        if (!transaction) {
            console.error("❌ Debug: Không tìm thấy giao dịch.", { tim_id: id, trong_list: this.transactions });
            return;
        }

        // 2. Gọi hàm mở modal (truyền đúng type và id)
        this.openTransactionModal(transaction.type, id);
    }

    // --- TRANSACTION MODAL & SAVE LOGIC (CORE FIX #1) ---

    openTransactionModal(type, id = null) {
        // Tìm transaction nếu là edit
        const existingData = id ? this.transactions.find(t => t.id === id) : null;
        const isEdit = !!existingData;
        const mode = existingData ? existingData.type : type; // Nếu edit thì lấy type cũ
        
        const title = isEdit ? `Sửa Giao Dịch (${id})` : (mode === 'IN' ? 'Lập Phiếu Thu' : 'Lập Phiếu Chi');
        const colorClass = mode === 'IN' ? 'text-success' : 'text-danger';

        // Fund Options
        let fundOptions = this.funds.map(f => 
            `<option value="${f.id}" ${existingData && existingData.fund_source === f.id ? 'selected' : ''}>${f.name} (${formatCurrency(f.balance)})</option>`
        ).join('');
        if(!fundOptions) fundOptions = '<option disabled selected>Chưa có quỹ</option>';

        const html = `
            <div id="acc-modal-form">
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label small fw-bold">Ngày chứng từ</label>
                        <input type="date" class="form-control" data-field="transaction_date" value="${existingData?.transaction_date || new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="col-6">
                        <label class="form-label small fw-bold">Trạng thái</label>
                        <select class="form-select" data-field="status" ${isEdit && existingData.status === 'Completed' ? 'disabled' : ''}>
                            <option value="Completed" ${existingData?.status === 'Completed' ? 'selected' : ''}>✅ Hoàn thành</option>
                            <option value="Pending" ${existingData?.status === 'Pending' ? 'selected' : ''}>⏳ Chờ duyệt</option>
                        </select>
                        ${isEdit && existingData.status === 'Completed' ? '<div class="form-text text-warning small">Không thể sửa trạng thái khi đã hoàn thành</div>' : ''}
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Số tiền (VNĐ)</label>
                    <div class="input-group">
                        <span class="input-group-text ${colorClass} fw-bold">${mode === 'IN' ? '+' : '-'}</span>
                        <input type="text" class="form-control fw-bold ${colorClass}" id="inp-amount-show" 
                            value="${existingData ? parseInt(existingData.amount).toLocaleString('vi-VN') : ''}" 
                            placeholder="0" autocomplete="off" ${isEdit ? 'disabled' : ''}> </div>
                    ${isEdit ? '<div class="form-text text-danger small">Không được sửa số tiền. Hãy xóa đi tạo lại nếu sai.</div>' : ''}
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Quỹ tài chính</label>
                    <select class="form-select" data-field="fund_source" ${isEdit ? 'disabled' : ''}>${fundOptions}</select>
                </div>

                <div class="mb-3 p-2 border rounded bg-light">
                    <label class="form-label small fw-bold text-primary">Booking ID (Liên kết)</label>
                    <input type="text" class="form-control" data-field="booking_id" 
                        value="${existingData?.booking_id || ''}" placeholder="VD: BK-2023..." 
                        ${isEdit ? 'disabled' : ''}>
                    <div class="form-text small">Hệ thống sẽ tự động kiểm tra và cập nhật công nợ Booking này.</div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Hạng mục</label>
                    <input type="text" class="form-control" data-field="category" list="cat-list" value="${existingData?.category || ''}">
                    <datalist id="cat-list">
                        <option value="Thanh toán tiền tour"><option value="Chi phí vận hành"><option value="Hoàn tiền"><option value="Tạm ứng">
                    </datalist>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">Diễn giải</label>
                    <textarea class="form-control" data-field="description" rows="2">${existingData?.description || ''}</textarea>
                </div>
            </div>
        `;

        A.Modal.show(html, title);
        
        // Format money input
        const inpMoney = document.getElementById('inp-amount-show');
        if(inpMoney && !inpMoney.disabled) {
            inpMoney.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                e.target.value = val ? parseInt(val).toLocaleString('vi-VN') : '';
            });
        }

        A.Modal.setSaveHandler(() => this.handleSaveTransaction(mode, isEdit, id), 'Lưu Giao Dịch');
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
        const container = document.getElementById('acc-modal-form');
        const inputs = container.querySelectorAll('[data-field]');
        const data = {};
        inputs.forEach(i => data[i.dataset.field] = i.value.trim());

        const amountShow = document.getElementById('inp-amount-show').value.replace(/\./g, '');
        const amount = parseFloat(amountShow);

        // 1. Validate
        if (!amount || amount <= 0) return alert("Số tiền không hợp lệ");
        if (!data.fund_source && !isEdit) return alert("Chưa chọn quỹ");
        
        // --- 2. XỬ LÝ BOOKING ID (Quan trọng) ---
        let bookingRef = null;
        let operatorRef = null;

        if (data.booking_id) {
            // Kiểm tra booking tồn tại
            const bookingSnap = await window.A.DB.db.collection('bookings').doc(data.booking_id).get();
            if (!bookingSnap.exists) {
                return alert(`❌ Lỗi: Booking ID [${data.booking_id}] không tồn tại trong hệ thống!`);
            }
            bookingRef = bookingSnap.ref;
            
            // Nếu là Phiếu Chi (OUT), kiểm tra thêm operator_entries
            if (type === 'OUT') {
                const opSnap = await window.A.DB.db.collection('operator_entries').doc(data.booking_id).get();
                // Nếu chưa có doc operator thì có thể cho phép tạo mới hoặc báo lỗi tuỳ logic, ở đây giả sử phải có
                if (opSnap.exists) operatorRef = opSnap.ref;
                // Note: Nếu không bắt buộc operator_entries phải có sẵn thì bỏ qua check này
            }
        }

        // Setup button loading
        const btnSave = document.querySelector('.modal-footer .btn-primary');
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Xử lý...';
        btnSave.disabled = true;

        try {
            const db = window.A.DB.db;
            const batch = db.batch(); // Dùng Batch Write cho an toàn (Atomicity)

            // --- 3. GENERATE ID (Tự động tăng cho cả PT và PC) ---
            let transId = docId; // Mặc định là ID cũ nếu đang Edit

            if (!isEdit) {
                const counterRef = db.collection('transactions').doc('last_invoice_number');
                
                // Sử dụng Transaction để đảm bảo không bị trùng số khi nhiều người cùng tạo
                await db.runTransaction(async (t) => {
                    const cDoc = await t.get(counterRef);
                    
                    // Lấy dữ liệu đếm hiện tại (nếu doc chưa tồn tại thì coi như bằng 0)
                    const currentCounts = cDoc.exists ? cDoc.data() : { in: 0, out: 0 };
                    let nextNum = 1;

                    if (type === 'IN') {
                        // Xử lý Phiếu Thu (PT) -> field 'in'
                        nextNum = (currentCounts.in || 0) + 1;
                        t.set(counterRef, { in: nextNum }, { merge: true });
                        transId = `PT-${nextNum}`; // Ví dụ: PT-101
                    } 
                    else if (type === 'OUT') {
                        // Xử lý Phiếu Chi (PC) -> field 'out'
                        nextNum = (currentCounts.out || 0) + 1;
                        t.set(counterRef, { out: nextNum }, { merge: true });
                        transId = `PC-${nextNum}`; // Ví dụ: PC-55
                    }
                });
            }

            // --- 4. TẠO RECORD GIAO DỊCH ---
            const transRef = db.collection(this.currentTransCol).doc(transId);
            const record = {
                id: transId,
                ...data,
                amount: amount,
                type: type,
                updated_at: new Date().toISOString()
            };

            if (!isEdit) {
                record.created_at = new Date().toISOString();
                // Check status để cập nhật quỹ
                if (data.status === 'Completed') {
                    const fundRef = db.collection(this.currentFundCol).doc(data.fund_source);
                    // IN: Balance + amount, OUT: Balance - amount
                    const change = type === 'IN' ? amount : -amount;
                    batch.update(fundRef, { 
                        balance: firebase.firestore.FieldValue.increment(change) 
                    });
                }
            }

            batch.set(transRef, record, { merge: true });

            // Commit Batch 1: Lưu giao dịch & Cập nhật Quỹ trước
            await batch.commit(); 
            console.log(`Saved Transaction ${transId}`);

            // --- 5. AGGREGATION (CỘNG DỒN & UPDATE PARENT) ---
            // Bước này chạy riêng sau khi đã lưu transaction thành công
            if (data.booking_id && data.status === 'Completed') {
                await this.aggregateBookingBalance(data.booking_id, type);
            }

            A.Modal.hide();
            alert("✅ Lưu thành công!");
            this.refreshData();

        } catch (e) {
            console.error(e);
            alert("Lỗi: " + e.message);
            btnSave.innerText = 'Lưu lại';
            btnSave.disabled = false;
        }
    }

    /**
     * Logic Cộng dồn tiền và Update vào Booking/Operator
     */
    async aggregateBookingBalance(bookingId, type) {
        const db = window.A.DB.db;
        console.log(`Aggregating for Booking: ${bookingId}, Type: ${type}`);

        try {
            // Lấy TẤT CẢ giao dịch của booking này
            const transSnap = await db.collection(this.currentTransCol)
                .where('booking_id', '==', bookingId)
                .where('status', '==', 'Completed') // Chỉ tính cái đã hoàn thành
                .get();

            let totalIn = 0;
            let totalOut = 0;

            transSnap.forEach(doc => {
                const t = doc.data();
                const amt = parseFloat(t.amount || 0);
                if (t.type === 'IN') totalIn += amt;
                else if (t.type === 'OUT') totalOut += amt;
            });

            // Update Logic
            if (type === 'IN') {
                // Cập nhật Collection: BOOKINGS
                const bookingRef = db.collection('bookings').doc(bookingId);
                
                // Lấy total_amount hiện tại để tính balance
                const bDoc = await bookingRef.get();
                const totalAmount = parseFloat(bDoc.data().total_amount || 0);
                const balance = totalAmount - totalIn;

                await bookingRef.update({
                    deposit_amount: totalIn,
                    balance_amount: balance,
                    payment_status: balance <= 0 ? 'Paid' : (totalIn > 0 ? 'Deposited' : 'Unpaid')
                });
                console.log(`Updated Booking ${bookingId}: Paid ${totalIn}, Bal ${balance}`);

            } else if (type === 'OUT') {
                // Cập nhật Collection: OPERATOR_ENTRIES
                // operator_entries có thể dùng ID là bookingId
                const opRef = db.collection('operator_entries').doc(bookingId);
                const opDoc = await opRef.get();

                if (opDoc.exists) {
                    const totalCost = parseFloat(opDoc.data().total_cost || 0);
                    const debt = totalCost - totalOut; // debt_balance = cost - paid

                    await opRef.update({
                        paid_amount: totalOut,
                        debt_balance: debt
                    });
                    console.log(`Updated Operator ${bookingId}: Paid ${totalOut}, Debt ${debt}`);
                }
            }

        } catch (e) {
            console.error("Aggregation Error:", e);
            // Không throw error ra ngoài để tránh báo lỗi cho user khi giao dịch chính đã lưu xong
            console.warn("Giao dịch đã lưu nhưng cập nhật số dư Booking thất bại. Hãy kiểm tra lại.");
        }
    }
}

// Khởi tạo
window.AccountantCtrl = new AccountantController();
window.AccountantCtrl.init(); // Gọi init ngay
export default window.AccountantCtrl;