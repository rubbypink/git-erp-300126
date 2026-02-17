/**
 * AccountantController - Module quản lý kế toán
 * 
 * Note: Không import classical scripts (db_manager, renderer, utils).
 * Những file này đã được load trong index.html và có sẵn globally.
 * Sử dụng window.A để truy cập UI, validators, etc.
 */

// Helper function để format tiền tệ (sử dụng formatMoney từ global scope)
function formatCurrency(amount) {
    try {
        const num = parseFloat(amount || 0);
        if (isNaN(num)) return '0';
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num);
    } catch (e) {
        return '0';
    }
}

// Helper function để format ngày 
function formatDate(dateStr) {
    try {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr || '-';
    }
}

class AccountantController {
    constructor() {
        // Cấu hình Entity
        this.currentEntity = '9trip'; // Mặc định
        this.entityConfig = {
            '9trip': {
                trans: 'transactions',
                fund: 'fund_accounts',
                role: 'acc'
            },
            'thenice': {
                trans: 'transactions_thenice',
                fund: 'fund_accounts_thenice',
                role: 'acc_thenice'
            }
        };

        // State nội bộ
        this.funds = [];
        this.transactions = [];
        
        // Cấu hình bộ lọc mặc định
        this.filterState = {
            period: 'month',
            startDate: null,
            endDate: null,
            field: 'all',
            keyword: ''
        };
    }

    // --- 1. KHỞI TẠO MODULE ---
    async init() {
        console.log("Accountant Module: Initializing...");
        try {
            // 1.1 Xác định quyền & Entity
            const userRole = (window.A && A.CFG && A.CFG.role) ? A.CFG.role : 'acc';
            this.setupEntityAccess(userRole);

            // 1.2 Cache DOM Elements
            this.cacheDom();

            
            // 1.4 Load Data & Render
            await this.refreshData();
            // 1.3 Bind Events (Click, Change, Search)
            this.bindEvents();

            console.log(`Accountant Module: Ready (${this.currentEntity})`);

        } catch (error) {
            console.error("Accountant Init Error:", error);
            if(window.A && A.Modal) console.log("Lỗi khởi tạo module kế toán.");
        }
    }

    setupEntityAccess(role) {
        const selector = document.getElementById('acc-entity-select');
        
        if (role === 'acc_thenice') {
            this.currentEntity = 'thenice';
            if(selector) {
                selector.value = 'thenice';
                selector.disabled = true;
            }
        } else {
            this.currentEntity = '9trip';
            if(selector) selector.value = '9trip';
        }
        
        // Update tên collection hiện hành
        this.currentTransCol = this.entityConfig[this.currentEntity].trans;
        this.currentFundCol = this.entityConfig[this.currentEntity].fund;
    }

    cacheDom() {
        this.els = {
            // Stats
            totalFund: document.getElementById('d-total-fund'),
            fundListContainer: document.getElementById('acc-fund-list-container'),
            netBalance: document.getElementById('d-net-balance'),
            totalIn: document.getElementById('d-total-in'),
            totalOut: document.getElementById('d-total-out'),
            
            // Table (Lưu ý: Nằm trong #tab-form theo yêu cầu mới)
            tableBody: document.getElementById('acc-table-body'),
            showingCount: document.getElementById('acc-showing-count'),
            
            // Filter
            filterPeriod: document.getElementById('acc-filter-period'),
            filterStart: document.getElementById('acc-filter-start'),
            filterEnd: document.getElementById('acc-filter-end'),
            filterField: document.getElementById('acc-filter-field'),
            filterValue: document.getElementById('acc-filter-value'),
            customDateRow: document.getElementById('acc-custom-date-row'),
            filterSummary: document.getElementById('acc-filter-summary'),
            
            // Global Search
            globalSearch: document.getElementById('acc-global-search')
        };
    }

    // --- 2. QUẢN LÝ DỮ LIỆU (DATA HANDLING) ---
    
    // Hàm lấy data ưu tiên từ A.DATA
    async getData(collectionName) {
        // Kiểm tra A.DATA trước
        if (window.A && A.DATA && A.DATA[collectionName]) {
            console.log(`Using cached data for ${collectionName}`);
            return A.DATA[collectionName];
        }
        
        // Nếu chưa có, gọi DB load về và lưu vào A.DATA
        console.log(`Fetching data for ${collectionName}...`);
        const data = await (window.A && window.A.DB ? window.A.DB.loadCollection(collectionName) : []);
        
        if (window.A && A.DATA) {
            A.DATA[collectionName] = data;
        }
        console.log(...data);
        return data;
    }

    async refreshData() {
        try {
            // Load song song Quỹ và Giao dịch
            const [fundsData, transData] = await Promise.all([
                this.getData(this.currentFundCol),
                this.getData(this.currentTransCol)
            ]);
            console.log("Data refreshed:", { fundsCount: fundsData.length, transactionsCount: transData.length });

            this.funds = fundsData || [];
            this.transactions = transData || [];

            // Sắp xếp transactions mới nhất lên đầu
            this.transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

            // Render giao diện
            this.renderDashboardAssets(); // Card 1: Quỹ
            this.applyFiltersAndRender(); // Card 2 & Table

            // Cập nhật options cho Filter Field (lấy key động từ data)
            this.updateFilterFieldOptions();

        } catch (error) {
            console.error("Refresh Data Error:", error);
        }
    }

    // --- 3. LOGIC RENDER ---

    // 3.1 Card TÀI SẢN (Không phụ thuộc bộ lọc ngày)
    renderDashboardAssets() {
        if (!this.els.fundListContainer) return;

        let totalBalance = 0;
        let html = '';

        // Loop qua từng tài khoản quỹ
        this.funds.forEach(fund => {
            const balance = parseFloat(fund.balance || 0);
            totalBalance += balance;

            // Xác định icon/class dựa trên type
            const icon = fund.id === 'cash' ? '<i class="fas fa-money-bill-wave text-success me-2"></i>' : '<i class="fas fa-university text-primary me-2"></i>';
            const name = fund.name || fund.id || 'Quỹ không tên';
            
            html += `
                <div class="d-flex justify-content-between align-items-center mb-2 p-2 border-bottom border-light">
                    <div class="d-flex align-items-center small">
                        ${icon}
                        <span class="text-dark fw-bold">${name}</span>
                        ${fund.account_no ? `<span class="text-muted ms-1" style="font-size:0.75rem">(${fund.account_no})</span>` : ''}
                    </div>
                    <span class="fw-bold text-dark">${formatMoney(balance)}</span>
                </div>
            `;
        });

        this.els.fundListContainer.innerHTML = html || '<div class="text-muted small text-center">Chưa có quỹ nào</div>';
        this.els.totalFund.innerText = formatMoney(totalBalance);
    }

    // 3.2 Xử lý Bộ lọc & Render Table/Stats
    applyFiltersAndRender() {
        // 1. Xác định khoảng thời gian
        const dateRange = this.getDateRange(this.filterState.period);
        
        // 2. Lọc dữ liệu
        const filtered = this.transactions.filter(item => {
            // a. Lọc theo ngày (transaction_date)
            if (dateRange) {
                if (item.transaction_date < dateRange.start || item.transaction_date > dateRange.end) return false;
            }

            // b. Lọc theo từ khóa (Field specific)
            if (this.filterState.keyword) {
                const key = this.filterState.keyword.toLowerCase();
                const field = this.filterState.field;
                
                if (field === 'all') {
                    // Tìm trên description, category, ref_id
                    const content = removeVietnameseTones(`${item.description} ${item.category} ${item.booking_id}`).toLowerCase();
                    if (!content.includes(removeVietnameseTones(key))) return false;
                } else {
                    // Tìm trên field cụ thể
                    const val = item[field] ? String(item[field]).toLowerCase() : '';
                    if (!val.includes(key)) return false;
                }
            }

            return true;
        });

        // 3. Render Card Hiệu Quả (Flow)
        this.renderPerformanceStats(filtered);

        // 4. Render Table (vào #tab-form)
        this.renderTable(filtered);
    }

    renderPerformanceStats(data) {
        let totalIn = 0;
        let totalOut = 0;

        data.forEach(item => {
            const amount = parseFloat(item.amount || 0);
            if (item.type === 'IN') totalIn += amount;
            else if (item.type === 'OUT') totalOut += amount;
        });

        const net = totalIn - totalOut;

        this.els.totalIn ? this.els.totalIn.innerText = formatCurrency(totalIn) : null;
        this.els.totalOut ? this.els.totalOut.innerText = formatCurrency(totalOut) : null;
        
        this.els.netBalance ? this.els.netBalance.innerText = formatCurrency(net) : null;
        // Đổi màu Net Balance
        if (net >= 0 && this.els.netBalance) {
            this.els.netBalance.classList.add('fs-5', 'fw-bold', 'text-success');
            this.els.netBalance.classList.remove('text-danger');
            this.els.netBalance.innerText = '+' + formatCurrency(net);
        } else if (this.els.netBalance) {
            this.els.netBalance.classList.add('fs-5', 'fw-bold', 'text-danger');
            this.els.netBalance.classList.remove('text-success');
            this.els.netBalance.innerText = '-' + formatCurrency(Math.abs(net));
        }
    }

    renderTable(data) {
        if (!this.els.tableBody) return;
        this.els.tableBody.innerHTML = '';
        this.els.showingCount.innerText = data.length;

        if (data.length === 0) {
            this.els.tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Không tìm thấy giao dịch nào</td></tr>`;
            return;
        }

        let html = '';
        data.forEach((item, index) => {
            // Status Badge
            let statusBadge = '';
            if(item.status === 'Completed') statusBadge = '<span class="badge bg-success-subtle text-success">Hoàn thành</span>';
            else if(item.status === 'Pending') statusBadge = '<span class="badge bg-warning-subtle text-warning">Chờ duyệt</span>';
            else statusBadge = '<span class="badge bg-secondary-subtle text-secondary">Khác</span>';

            // Amount Style
            const isIn = item.type === 'IN';
            const amountClass = isIn ? 'text-success' : 'text-danger';
            const sign = isIn ? '+' : '-';
            
            // Tìm tên quỹ
            const fundObj = this.funds.find(f => f.id === item.fund_source) || { name: item.fund_source || '-' };

            html += `
                <tr role="button" onclick="window.AccountantCtrl.openEditModal('${item.id}')" >
                    <td class="small fw-bold">${formatDate(item.transaction_date)}</td>
                    <td>
                        <span class="badge border ${isIn ? 'border-success text-success' : 'border-danger text-danger'}">
                            ${isIn ? 'THU' : 'CHI'}
                        </span>
                    </td>
                    <td class="text-end fw-bold ${amountClass}">${sign} ${formatCurrency(item.amount)}</td>
                    <td>
                        <div class="text-truncate" style="max-width: 180px;" title="${item.description}">${item.description}</div>
                        <div class="small text-muted fst-italic">${item.category || ''} ${item.booking_id ? `| ${item.booking_id}` : ''}</div>
                    </td>
                    <td class="small text-muted">${fundObj.name}</td>
                    <td>${statusBadge}</td>
                    <td class="text-end"><i class="fas fa-chevron-right text-muted small"></i></td>
                </tr>
            `;
        });

        this.els.tableBody.innerHTML = html;
    }

    // --- 4. EVENT HANDLERS & UTILS ---

    bindEvents() {
        // Change Entity
        const selector = document.getElementById('acc-entity-select');
        if (selector && !selector.disabled) {
            selector.addEventListener('change', (e) => {
                this.currentEntity = e.target.value;
                this.setupEntityAccess(A.CFG.role); // Re-config collections
                this.refreshData(); // Reload all
            });
        }
        onEvent('btn-apply-filter', 'click', (e) => {
            this.filterState.period = this.els.filterPeriod.value;
            this.filterState.startDate = this.els.filterStart.value;
            this.filterState.endDate = this.els.filterEnd.value;
            this.filterState.field = this.els.filterField.value;
            this.filterState.keyword = this.els.filterValue.value;

            this.applyFiltersAndRender();
            
            // UI Feedback: Đóng collapse & update text summary
            document.querySelector('.acc-filter-container').classList.remove('active');
            const periodText = this.els.filterPeriod.options[this.els.filterPeriod.selectedIndex].text || '';
            this.els.filterSummary.innerText = periodText;
            log('trigger event apply filter', this.filterState);
        });

        // Toggle Custom Date Picker
        onEvent(this.els.filterPeriod,'change', (e) => {
            if (e.target.value === 'custom') {
                this.els.customDateRow.classList.remove('d-none');
            } else {
                this.els.customDateRow.classList.add('d-none');
            }
        });

        // Global Visual Search
        onEvent(this.els.globalSearch, 'input', debounce((e) => {
            this.handleGlobalSearch(e.target.value);
        }, 300));
    }

    getDateRange(period) {
        if (period === 'all') return null;
        if (period === 'custom') {
            return {
                start: this.filterState.startDate || '1970-01-01',
                end: this.filterState.endDate || '2099-12-31'
            };
        }

        const now = new Date();
        let start = new Date();
        let end = new Date();

        // Sử dụng logic đơn giản cho JS thuần
        if (period === 'today') {
            // start/end giữ nguyên
        } else if (period === 'week') {
            const day = now.getDay() || 7; 
            if (day !== 1) start.setHours(-24 * (day - 1));
            end.setHours(24 * (7 - day));
        } else if (period === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), q * 3, 1);
            end = new Date(now.getFullYear(), (q + 1) * 3, 0);
        } else if (period === 'year') {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
        }

        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    updateFilterFieldOptions() {
        if (this.transactions.length === 0) return;
        
        // Lấy keys từ object đầu tiên để làm options
        const sample = this.transactions[0];
        const ignoreKeys = ['id', 'created_at', 'created_by'];
        const keys = Object.keys(sample).filter(k => !ignoreKeys.includes(k));

        let html = '<option value="all">Tất cả</option>';
        keys.forEach(k => {
            // Beautify key name (category -> Category)
            const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
            html += `<option value="${k}">${label}</option>`;
        });
        
        this.els.filterField.innerHTML = html;
    }

    handleGlobalSearch(keyword) {
        const container = document.querySelector('.app-content');
        if (!container) return;

        // Xóa highlight cũ
        // Lưu ý: Cách implement highlight DOM đơn giản an toàn là remove class
        const highlighted = container.querySelectorAll('.highlight-text');
        highlighted.forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.innerText), el);
            parent.normalize(); // Merge text nodes
        });

        if (!keyword || keyword.length < 2) return;

        // Tìm và highlight mới (Logic duyệt text node an toàn)
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const nodesToHighlight = [];
        const regex = new RegExp(`(${removeVietnameseTones(keyword)})`, 'gi'); // Regex đơn giản

        while (walker.nextNode()) {
            const node = walker.currentNode;
            // Chỉ tìm trong node cha ko phải là script/style
            if (node.parentNode.tagName !== 'SCRIPT' && node.parentNode.tagName !== 'STYLE' && node.textContent.trim().length > 0) {
                 // Check if match (using includes for basic match)
                 if (removeVietnameseTones(node.textContent).toLowerCase().includes(removeVietnameseTones(keyword).toLowerCase())) {
                     nodesToHighlight.push(node);
                 }
            }
        }

        // Highlight node đầu tiên tìm thấy và scroll tới
        if (nodesToHighlight.length > 0) {
            const node = nodesToHighlight[0];
            const span = document.createElement('span');
            span.className = 'highlight-text';
            span.innerText = node.textContent; // Thay thế toàn bộ text node bằng span (Simplification)
            
            // Để highlight chính xác từng từ cần logic phức tạp hơn split text node.
            // Ở đây tạm thời highlight cả cụm text chứa từ khóa để tránh vỡ layout phức tạp.
            node.parentNode.replaceChild(span, node);
            
            span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // --- 5. MODAL TRANSACTION (CORE FEATURE) ---

    openTransactionModal(type, existingData = null) {
        // 1. Chuẩn bị dữ liệu
        const isEdit = !!existingData;
        const title = isEdit ? 'Chỉnh sửa Giao dịch' : (type === 'IN' ? 'Tạo Phiếu Thu (IN)' : 'Tạo Phiếu Chi (OUT)');
        const colorClass = type === 'IN' ? 'text-success' : 'text-danger';
        
        // Tạo options cho Select Quỹ từ dữ liệu this.funds đã load
        let fundOptions = '';
        if (this.funds.length > 0) {
            this.funds.forEach(f => {
                const selected = existingData && existingData.fund_source === f.id ? 'selected' : '';
                fundOptions += `<option value="${f.id}" ${selected}>${f.name} (${window.formatMoney(f.balance)})</option>`;
            });
        } else {
            fundOptions = `<option value="" disabled selected>Chưa có quỹ nào được tạo</option>`;
        }

        // 2. Render HTML Form (Mobile First UI)
        // Sử dụng data-field thay vì name
        const html = `
            <div id="acc-modal-form" class="needs-validation">
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="acc-label">Ngày hạch toán</label>
                        <input type="date" class="form-control" data-field="transaction_date" 
                            value="${existingData ? existingData.transaction_date : new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="col-6">
                        <label class="acc-label">Trạng thái</label>
                        <select class="form-select fw-bold" data-field="status" id="acc-input-status">
                            <option value="Completed" ${existingData?.status === 'Completed' ? 'selected' : ''} class="text-success">✅ Đã hoàn thành</option>
                            <option value="Pending" ${existingData?.status === 'Pending' ? 'selected' : ''} class="text-warning">⏳ Chờ duyệt</option>
                            <option value="Planning" ${existingData?.status === 'Planning' ? 'selected' : ''} class="text-secondary">📅 Dự kiến (Planning)</option>
                        </select>
                    </div>
                </div>

                <div class="mb-3">
                    <label class="acc-label">Số tiền (VND)</label>
                    <div class="input-group">
                        <span class="input-group-text bg-white ${colorClass} fw-bold">${type === 'IN' ? '+' : '-'}</span>
                        <input type="text" class="form-control form-control-lg fw-bold ${colorClass}" 
                            id="acc-input-amount-display" 
                            placeholder="0" 
                            value="${existingData ? window.formatMoney(existingData.amount) : ''}"
                            autocomplete="off" inputmode="numeric">
                        <input type="hidden" data-field="amount" id="acc-input-amount-raw" value="${existingData ? existingData.amount : ''}">
                    </div>
                </div>

                <div class="mb-3">
                    <label class="acc-label">Nguồn tiền / Quỹ</label>
                    <select class="form-select" data-field="fund_source">
                        ${fundOptions}
                    </select>
                    <div class="form-text small" id="acc-fund-feedback">
                        *Chọn quỹ để hệ thống tự động cập nhật số dư
                    </div>
                </div>

                <div class="mb-3">
                    <label class="acc-label">Hạng mục</label>
                    <input type="text" class="form-control" data-field="category" list="acc-list-categories" 
                        placeholder="Ví dụ: Thanh toán Tour, Điện nước..."
                        value="${existingData ? existingData.category : ''}">
                    <datalist id="acc-list-categories">
                        <option value="Thanh toán Tour">
                        <option value="Hoàn tiền khách">
                        <option value="Chi phí vận hành">
                        <option value="Lương nhân viên">
                        <option value="Marketing">
                        <option value="Khác">
                    </datalist>
                </div>

                <div class="mb-3 p-2 bg-light rounded border border-light">
                    <label class="acc-label text-primary"><i class="fas fa-link me-1"></i>Liên kết Booking (Nếu có)</label>
                    <input type="text" class="form-control form-control-sm" data-field="booking_id" 
                        placeholder="Nhập ID Booking (VD: BK-1234)..."
                        value="${existingData ? existingData.booking_id || '' : ''}">
                    <div class="form-text small text-muted">Hệ thống sẽ tự động thông báo cho Sales nếu nhập mục này.</div>
                </div>

                <div class="mb-3">
                    <label class="acc-label">Nội dung / Ghi chú</label>
                    <textarea class="form-control" data-field="description" rows="2">${existingData ? existingData.description || '' : ''}</textarea>
                </div>
            </div>
        `;

        // 3. Show Modal
        A.Modal.show(html, title);

        // 4. Bind Events (Format Money)
        const displayInput = document.getElementById('acc-input-amount-display');
        const rawInput = document.getElementById('acc-input-amount-raw');

        displayInput.addEventListener('input', (e) => {
            // Chỉ giữ lại số
            const rawValue = e.target.value.replace(/[^0-9]/g, '');
            rawInput.value = rawValue;
            
            // Format lại hiển thị
            e.target.value = rawValue ? parseInt(rawValue).toLocaleString('vi-VN') : '';
        });

        // 5. Handle Save
        A.Modal.setSaveHandler(() => {
            this.handleSaveTransaction(type, isEdit, existingData?.id);
        }, 'Lưu phiếu');
    }

    async handleSaveTransaction(type, isEdit, docId) {
        try {
            // 1. Collect Data using data-field
            const container = document.getElementById('acc-modal-form');
            const inputs = container.querySelectorAll('[data-field]');
            const data = {};
            
            inputs.forEach(input => {
                data[input.dataset.field] = input.value;
            });

            // 2. Validate
            const amount = parseFloat(data.amount);
            if (!amount || amount <= 0) {
                alert("Vui lòng nhập số tiền hợp lệ!");
                return;
            }
            if (!data.fund_source) {
                alert("Vui lòng chọn nguồn quỹ!");
                return;
            }

            // Button Loading
            const btnSave = document.querySelector('.modal-footer .btn-primary');
            const originalBtnText = btnSave.innerText;
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
            btnSave.disabled = true;

            // 3. Prepare Record Object
            const record = {
                ...data, // transaction_date, status, category, booking_id, description, fund_source
                amount: amount,
                type: type, // IN or OUT
                updated_at: new Date().toISOString(),
                updated_by: CURRENT_USER?.email || 'unknown'
            };

            if (!isEdit) {
                record.created_at = new Date().toISOString();
                record.created_by = CURRENT_USER?.name || 'unknown';
            }

            // 4. DOUBLE ENTRY LOGIC (QUAN TRỌNG)
            if (isEdit) {
                // TODO: Logic sửa phức tạp (Phải hoàn tiền cũ -> trừ tiền mới).
                // Giai đoạn này tạm thời chặn sửa số tiền/quỹ nếu đã Completed để an toàn.
                alert("Tính năng sửa đang được hoàn thiện. Vui lòng xóa và tạo mới để đảm bảo tính đúng đắn của quỹ.");
                btnSave.innerText = originalBtnText;
                btnSave.disabled = false;
                return;
            } 
            
            // --- CASE: TẠO MỚI ---
            
            // Bước 4.1: Lưu vào Sổ cái (Transactions)
            await window.A.DB.saveRecord(this.currentTransCol, record);

            // Bước 4.2: Cập nhật số dư Quỹ (Chỉ khi status Completed)
            if (record.status === 'Completed') {
                // IN: Tăng quỹ, OUT: Giảm quỹ
                const incrementValue = (type === 'IN') ? amount : -amount;
                
                // Gọi hàm update atomic của Firestore
                // Lưu ý: Đảm bảo A.DB.incrementField đã tồn tại
                if (window.A && window.A.DB) await window.A.DB.incrementField(this.currentFundCol, record.fund_source, 'balance', incrementValue);
            }

            // Bước 4.3: Sync & Notify (Nếu có Booking ID & là 9Trip)
            if (this.currentEntity === '9trip' && record.booking_id && record.status === 'Completed') {
                await this.processSyncAndNotify(record);
            }

            // 5. Finish
            A.Modal.hide();
            logA("Lưu giao dịch thành công!");
            
            // Reload Data
            await this.refreshData();

        } catch (error) {
            console.error("Save Error:", error);
            alert("Lỗi khi lưu: " + error.message);
            // Reset Button
            const btnSave = document.querySelector('.modal-footer .btn-primary');
            if(btnSave) {
                btnSave.innerText = 'Lưu phiếu';
                btnSave.disabled = false;
            }
        }
    }

    async processSyncAndNotify(record) {
        try {
            console.log(`Syncing Booking ${record.booking_id}...`);
            
            // 1. Cập nhật Deposit trong collection Bookings
            // Cần query booking để chắc chắn nó tồn tại
            // Ở đây dùng increment để cộng dồn số tiền vừa thu vào deposit của booking
            // Field 'deposit' trong booking là tổng tiền đã thu
            if (record.type === 'IN') {
                 await window.A.DB.incrementField('bookings', record.booking_id, 'deposit', record.amount);
            }

            // 2. Tạo thông báo (Notifications Collection)
            const notiContent = `
                <strong>[ACC] Xác nhận thanh toán</strong><br>
                Booking: <b>${record.booking_id}</b><br>
                Số tiền: <span class="text-success fw-bold">+${window.formatMoney(record.amount)}</span><br>
                Nội dung: ${record.description}
            `;

            const notiRecord = {
                created_at: new Date().toISOString(),
                content: notiContent,
                from_dept: 'ACC',
                to_dept: 'SALES',
                ref_id: record.booking_id,
                is_read: false,
                type: 'payment_confirm'
            };

            await window.A.DB.saveRecord('notifications', notiRecord);
            console.log("Notification sent to Sales.");

        } catch (error) {
            console.warn("Non-critical Sync Error:", error);
            // Không chặn flow chính nếu lỗi sync (ví dụ booking id sai)
        }
    }
}

// Export controller instance
window.AccountantCtrl = new AccountantController();
export default window.AccountantCtrl;

document.addEventListener('DOMContentLoaded', () => {
    getE('acc-entity-select').dispatchEvent(new Event('change')); // Trigger change để khởi tạo entity và load data
});