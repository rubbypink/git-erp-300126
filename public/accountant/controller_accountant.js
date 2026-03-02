// ===================================================================
// IMPORTS (v9 Modular ES6)
// ===================================================================
// NOTE: NotificationManager is accessed via window.A.NotificationManager (loaded by main app bundle)
import {
  getNewData,
  migrateBookingTransactions,
  auditTransactionsChecking,
} from './accountant_logic.js';

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  str = str.replace(/Đ/g, 'D');
  // Some system encode vietnamese combining accent as individual utf-8 characters
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '');
  str = str.replace(/\u02C6|\u0306|\u031B/g, ''); // ˆ ̆ ̛  Â, Ê, Ă, Ơ, Ư
  // Remove extra spaces
  str = str.replace(/ + /g, ' ');
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
      maximumFractionDigits: 0,
    }).format(num);
  } catch (e) {
    return '0 ₫';
  }
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
  } catch (e) {
    return dateStr || '-';
  }
}

// --- 2. CLASS DEFINITION ---

class AccountantController {
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
  }

  // --- INIT & FLOW CONTROL ---

  async init() {
    console.log('Accountant Module: Initializing...');

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
        setTimeout(300);
      } else {
        console.error('Accountant: DOM Elements not found after retries. Check HTML ID.');
      }
    }
  }

  async _start() {
    try {
      let userRole = CURRENT_USER && CURRENT_USER.role ? CURRENT_USER.role : 'acc';
      if (userRole === 'admin') {
        if (typeof window.showConfirm === 'function') {
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
          if (
            confirm(
              "Bạn đang đăng nhập với quyền admin. Bạn có muốn xem dữ liệu của The Nice Hotel không? (Chọn 'Cancel' để xem dữ liệu 9 Trip ERP)"
            )
          ) {
            this.setupEntityAccess('acc_thenice');
          } else {
            this.setupEntityAccess('acc');
          }
        }
      } else {
        this.setupEntityAccess(userRole);
      }

      this.cacheDom();
      this.bindEvents(); // Bind event ngay khi có DOM

      await this.refreshData(); // Sau đó mới load data

      // Set default date picker values
      this.updateDatePickerUI();

      console.log(`Accountant Module: Ready (${this.currentEntity})`);
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

      globalSearch: document.getElementById('acc-global-search'),
    };
  }

  // --- DATA HANDLING ---

  async getData(collectionName) {
    // Luôn fetch mới nhất để đảm bảo tính đúng đắn của kế toán
    // loadCollections viết thẳng vào APP_DATA và trả về số docs đã tải
    console.log(`Fetching data for ${collectionName}...`);
    if (window.A && window.A.DB)
      await window.A.DB.loadCollections(collectionName, { forceNew: true });
    return APP_DATA?.[collectionName] ?? {};
  }

  async refreshData() {
    try {
      const [fundsData, transData] = await Promise.all([
        this.getData(this.currentFundCol),
        this.getData(this.currentTransCol),
      ]);

      this.funds = Object.values(fundsData || []);
      this.transactions = Object.values(transData || []);

      // Sort: Mới nhất lên đầu (theo created_at)
      this.transactions?.sort(
        (a, b) =>
          new Date(b.created_at || b.transaction_date) -
          new Date(a.created_at || a.transaction_date)
      );

      this.renderDashboardAssets();
      this.applyFiltersAndRender();
      this.updateFilterFieldOptions();
    } catch (error) {
      console.error('Refresh Data Error:', error);
    }
  }

  // --- RENDER LOGIC ---

  renderDashboardAssets() {
    if (!this.els.fundListContainer) return;
    let totalBalance = 0;
    let html = '';

    this.funds.forEach((fund) => {
      const balance = parseFloat(fund.balance || 0);
      totalBalance += balance;
      const icon =
        fund.id === 'cash'
          ? '<i class="fas fa-money-bill-wave text-success me-2"></i>'
          : '<i class="fas fa-university text-primary me-2"></i>';
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

    this.els.fundListContainer.innerHTML =
      html || '<div class="text-muted small text-center">Chưa có quỹ</div>';
    if (this.els.totalFund) this.els.totalFund.innerText = formatCurrency(totalBalance);
  }

  applyFiltersAndRender() {
    // Fix #2: Logic bộ lọc
    this.filterState.period = this.els.filterPeriod ? this.els.filterPeriod.value : 'month';

    // Lấy khoảng ngày chuẩn
    const dateRange = this.getDateRange(this.filterState.period);

    // Update lại giá trị input date để user thấy
    if (dateRange && this.filterState.period !== 'custom') {
      if (this.els.filterStart) this.els.filterStart.value = dateRange.start;
      if (this.els.filterEnd) this.els.filterEnd.value = dateRange.end;
    } else if (this.filterState.period === 'custom') {
      // Nếu là custom, lấy giá trị từ input
      dateRange.start = this.els.filterStart.value;
      dateRange.end = this.els.filterEnd.value;
    }

    const filtered = this.transactions.filter((item) => {
      // Lọc ngày (So sánh String YYYY-MM-DD ok)
      if (dateRange && dateRange.start && dateRange.end) {
        if (item.transaction_date < dateRange.start || item.transaction_date > dateRange.end)
          return false;
      }

      // Lọc Keyword
      if (this.filterState.keyword) {
        const key = this.filterState.keyword.toLowerCase();
        const field = this.filterState.field;
        if (field === 'all') {
          const content = removeVietnameseTones(
            `${item.id} ${item.type} ${item.description} ${item.category} ${item.booking_id} ${formatCurrency(item.amount)} ${item.status} ${item.created_by}`
          ).toLowerCase();
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
    let totalIn = 0,
      totalOut = 0;
    data.forEach((item) => {
      const amount = parseFloat(item.amount || 0);
      if (item.type === 'IN') totalIn += amount;
      else if (item.type === 'OUT') totalOut += amount;
    });
    const net = totalIn - totalOut;

    if (this.els.totalIn) this.els.totalIn.innerText = formatCurrency(totalIn);
    if (this.els.totalOut) this.els.totalOut.innerText = formatCurrency(totalOut);

    if (this.els.netBalance) {
      this.els.netBalance.innerText = (net >= 0 ? '+' : '-') + formatCurrency(Math.abs(net));
      this.els.netBalance.className = `h4 mb-0 fw-bold ${net >= 0 ? 'text-success' : 'text-danger'}`;
    }
  }

  renderTable(data) {
    if (!this.els.tableBody) return;
    this.els.showingCount.innerText = data.length;

    if (data.length === 0) {
      this.els.tableBody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-5">Không có dữ liệu</td></tr>`;
      return;
    }

    const html = data
      .map((item) => {
        const isIn = item.type === 'IN';
        const amountClass = isIn ? 'text-success' : 'text-danger';
        const sign = isIn ? '+' : '-';
        const typeIcon = item.type === 'IN' ? '📥' : '📤';
        const fundName =
          this.funds.find((f) => f.id === item.fund_source)?.name || item.fund_source || '-';

        let statusBadge = '<span class="badge bg-secondary">Khác</span>';
        if (item.status === 'Completed')
          statusBadge = '<span class="badge bg-success-subtle text-success">✅ Hoàn thành</span>';
        else if (item.status === 'Pending')
          statusBadge = '<span class="badge bg-warning-subtle text-warning">⏳ Chờ duyệt</span>';

        return `
                <tr role="button" onclick="window.AccountantCtrl.openEditModal('${item.type}', '${item.id}')" class="text-nowrap">
                    <td class="small fw-bold text-primary"><i class="fas fa-barcode me-1"></i>${item.id || '-'}</td>
                    <td class="small text-muted">${typeIcon} ${item.type === 'IN' ? 'Thu' : 'Chi'}</td>
                    <td class="small text-muted">${formatDate(item.transaction_date)}</td>
                    <td class="text-end fw-bold ${amountClass}">${sign} ${formatCurrency(item.amount)}</td>
                    <td class="small">
                        <div class="fw-bold text-truncate" style="max-width: 180px;">${item.description || '-'}</div>
                    </td>
                    <td class="small text-muted">${item.category || '-'}</td>
                    <td class="small">
                        ${item.booking_id ? `<span class="badge bg-info text-white">${item.booking_id}</span>` : '-'}
                    </td>
                    <td class="small">${fundName}</td>
                    <td>${statusBadge}</td>
                    <td class="small text-muted">${item.created_by || 'Hệ thống'}</td>
                    <td class="small text-muted">${formatDate(item.created_at)}</td>
                    <td class="text-end"><i class="fas fa-chevron-right text-muted small"></i></td>
                </tr>
            `;
      })
      .join('');

    this.els.tableBody.innerHTML = html;
  }

  // --- FILTERS & UTILS ---

  bindEvents() {
    const selector = document.getElementById('acc-entity-select');
    if (selector && !selector.disabled) {
      selector.addEventListener('change', (e) => {
        this.currentEntity = e.target.value;
        this.setupEntityAccess(CURRENT_USER.role);
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
        if (this._searchTimeout) clearTimeout(this._searchTimeout);
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
      case 'today':
        start = now;
        end = now;
        break;
      case 'week':
        const day = now.getDay() || 7;
        start = new Date(now);
        start.setDate(now.getDate() - day + 1);
        end = new Date(now);
        end.setDate(now.getDate() + (7 - day));
        break;
      case 'month':
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 0);
        break;
      case 'last_month':
        start = new Date(y, m - 1, 1);
        end = new Date(y, m, 0);
        break;
      case 'year':
        start = new Date(y, 0, 1);
        end = new Date(y, 11, 31);
        break;
      case 'all':
        return { start: '2000-01-01', end: '2099-12-31' };
      default:
        return { start: '', end: '' }; // Custom
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }

  updateDatePickerUI() {
    const range = this.getDateRange('month');
    if (this.els.filterStart) this.els.filterStart.value = range.start;
    if (this.els.filterEnd) this.els.filterEnd.value = range.end;
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
    // 1. Tìm giao dịch dựa trên ID (tham số thứ 2)
    const transaction = this.transactions.find((t) => t.id === id);

    if (!transaction) {
      console.error('❌ Debug: Không tìm thấy giao dịch.', {
        tim_id: id,
        trong_list: this.transactions,
      });
      return;
    }

    // 2. Gọi hàm mở modal (truyền đúng type và id)
    this.openTransactionModal(transaction.type, id);
  }

  // --- TRANSACTION MODAL & SAVE LOGIC (CORE FIX #1) ---

  async openTransactionModal(type, id = null) {
    // Tìm transaction nếu là edit
    const existingData = id ? this.transactions.find((t) => t.id === id) : null;
    const isEdit = !!existingData;
    const mode = existingData ? existingData.type : type; // Nếu edit thì lấy type cũ

    const title = isEdit
      ? `Sửa Giao Dịch (${id})`
      : mode === 'IN'
        ? 'Lập Phiếu Thu'
        : 'Lập Phiếu Chi';
    const colorClass = mode === 'IN' ? 'text-success' : 'text-danger';
    const currentUser = window.A && CURRENT_USER ? CURRENT_USER.name || 'Hệ thống' : 'Hệ thống';
    if (!this.funds || this.funds.length === 0)
      this.funds = (await this.getData('fund_accounts')) || [];
    console.log('Debug: Funds for modal', this.funds);
    // Fund Options
    let fundOptions = this.funds
      ?.map(
        (f) =>
          `<option value="${f.id}" ${existingData && existingData.fund_source === f.id ? 'selected' : ''}>${f.name} (${formatCurrency(f.balance)})</option>`
      )
      .join('');
    if (!fundOptions) fundOptions = '<option disabled selected>Chưa có quỹ</option>';
    const isManager = CURRENT_USER && (CURRENT_USER.level >= 50 || CURRENT_USER.role === 'admin');
    const html = `
            <div id="acc-modal-form" style="max-height: calc(100vh - 250px); overflow-y: auto; margin: 0 auto;" data-collection="${this.currentTransCol}" data-doc-id="${isEdit ? existingData.id : ''}">
                <div style="width: 100%; max-width: 500px; margin: 0 auto; padding: 1rem; box-sizing: border-box;">
                <!-- Section 1: ID & Type (Read-only/Hidden Info) -->
                ${
                  isEdit
                    ? `
                <div class="mb-3 p-2 bg-light border-bottom">
                    <div class="mb-2">
                        <label class="form-label fw-bold text-muted small">ID Giao Dịch</label>
                        <div class="form-control form-control-sm bg-white small" readonly>${existingData?.id || 'Auto-gen'}</div>
                        <input type="hidden" data-field="id" value="${existingData?.id || ''}">
                    </div>
                    <div>
                        <label class="form-label fw-bold text-muted small">Loại GD</label>
                        <div class="form-control form-control-sm bg-white small" readonly>${mode === 'IN' ? '📥 Phiếu Thu' : '📤 Phiếu Chi'}</div>
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
                    <select class="form-select form-select-sm w-100" data-field="fund_source" ${isEdit && !isManager ? 'disabled' : ''}>
                        <option value="">-- Chọn quỹ --</option>
                        ${fundOptions}
                    </select>
                </div>

                <!-- Section 4: Optional Fields -->
                <div class="mb-3 p-2 border rounded bg-light">
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
                <div class="mb-0 p-2 bg-light border-top">
                    <div class="mb-2">
                        <label class="form-label fw-bold text-muted small">✏️ Tạo bởi</label>
                        <div class="form-control form-control-sm bg-white small" readonly>${existingData?.created_by || 'Hệ thống'}</div>
                        <input type="hidden" data-field="created_by" value="${existingData?.created_by || currentUser}">
                    </div>
                    <div>
                        <label class="form-label fw-bold text-muted small">🕐 Ngày tạo</label>
                        <div class="form-control form-control-sm bg-white small" readonly>${existingData?.created_at ? formatDate(existingData.created_at) : new Date().toISOString().split('T')[0]}</div>
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

    A.Modal.show(html, title);

    // Format money input
    const inpMoney = document.getElementById('inp-amount-show');
    if (inpMoney && !inpMoney.disabled) {
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
    inputs.forEach((i) => (data[i.dataset.field] = i.value.trim()));

    const amountShow = document.getElementById('inp-amount-show').value.replace(/\./g, '');
    const amount = parseFloat(amountShow);

    // 1. Validate
    if (!amount || amount <= 0) return logA('Số tiền không hợp lệ', 'warning', 'alert');
    if (!data.fund_source && !isEdit) return logA('Chưa chọn quỹ', 'warning', 'alert');

    // --- 2. XỬ LÝ BOOKING ID (Quan trọng) ---
    // Đọc từ APP_DATA thay vì gọi Firestore trực tiếp — data đã có trong bộ nhớ
    if (data.booking_id) {
      const bookingData = window.APP_DATA?.bookings?.[data.booking_id];
      if (!bookingData) {
        return logA(
          `❌ Lỗi: Booking ID [${data.booking_id}] không tồn tại trong hệ thống!`,
          'error',
          'alert'
        );
      }
      // operatorRef không cần nữa — aggregateBookingBalance đọc từ APP_DATA
    }

    // Setup button loading
    const btnSave = document.querySelector('.modal-footer .btn-primary');
    btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Xử lý...';
    btnSave.disabled = true;

    try {
      const db = window.A.DB.db;
      const batch = db.batch();

      // --- 3. GENERATE ID (Tự động tăng cho cả PT và PC) ---
      // Dùng Firestore Transaction để tránh trùng số — logic custom PT/PC không có trong DBManager
      let transId = docId; // Mặc định là ID cũ nếu đang Edit

      if (!isEdit) {
        const counterRef = db.collection('transactions').doc('last_invoice_number');
        await db.runTransaction(async (t) => {
          const cDoc = await t.get(counterRef);
          const currentCounts = cDoc.exists ? cDoc.data() : { in: 0, out: 0 };
          let nextNum = 1;
          if (type === 'IN') {
            nextNum = (currentCounts.in || 0) + 1;
            t.set(counterRef, { in: nextNum }, { merge: true });
            transId = `PT-${nextNum}`;
          } else if (type === 'OUT') {
            nextNum = (currentCounts.out || 0) + 1;
            t.set(counterRef, { out: nextNum }, { merge: true });
            transId = `PC-${nextNum}`;
          }
        });
      }

      const collectionName = this.currentTransCol || 'transactions';
      // --- 4. TẠO RECORD GIAO DỊCH ---
      const transRef = db.collection(collectionName).doc(transId);
      const record = {
        id: transId,
        ...data,
        amount: amount,
        type: type,
        updated_at: new Date().toISOString(),
      };

      if (!isEdit) {
        record.created_at = new Date().toISOString();
        // Check status để cập nhật quỹ
        if (data.status === 'Completed') {
          const fundRef = db
            .collection(this.currentFundCol || 'fund_accounts')
            .doc(data.fund_source);
          // IN: Balance + amount, OUT: Balance - amount
          const change = type === 'IN' ? amount : -amount;
          batch.update(fundRef, {
            balance: firebase.firestore.FieldValue.increment(change),
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
        await this.aggregateBookingBalance(data.booking_id, type, amount);
      }

      A.Modal.hide();
      logA('✅ Lưu thành công!', 'success');
      this.refreshData();
    } catch (e) {
      console.error(e);
      logA('❌ Lỗi: ' + e.message, 'error');
      btnSave.innerText = 'Lưu lại';
      btnSave.disabled = false;
    }
  }

  /**
   * Logic Cộng dồn tiền và Update vào Booking/Operator.
   * Đọc từ APP_DATA (đã được saveRecord cập nhật) — không cần thêm Firestore read.
   */
  async aggregateBookingBalance(bookingId, type, amount) {
    console.log(`Aggregating for Booking: ${bookingId}, Type: ${type}`);
    // Access NotificationManager from the main app bundle (avoids broken relative import in production)
    const NotificationManager = window.A?.NotificationManager;

    try {
      // Tổng hợp từ APP_DATA — saveRecord đã cập nhật trước đó, không cần query Firestore
      const allTransData = window.APP_DATA?.[this.currentTransCol] || {};
      let totalIn = 0,
        totalOut = 0;
      Object.values(allTransData).forEach((t) => {
        if (t.booking_id !== bookingId || t.status !== 'Completed') return;
        const amt = parseFloat(t.amount || 0);
        if (t.type === 'IN') totalIn += amt;
        else if (t.type === 'OUT') totalOut += amt;
      });

      if (type === 'IN') {
        totalIn = totalIn / 1000;
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

        NotificationManager?.sendToSales(
          'THANH TOÁN MỚI CHO BOOKING',
          `Booking ${bookingId} - ${customerName} đã nhận: ${amount}. Tổng thanh toán: ${formatCurrency(totalIn)} VNĐ. Số dư còn lại: ${formatCurrency(balance)} VNĐ.`
        );
      } else if (type === 'OUT') {
        totalOut = totalOut / 1000;
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
          NotificationManager?.sendToOperator(
            'CẬP NHẬT THANH TOÁN',
            `Đã thanh toán ${bookingId} - ${opData.service_name || ''} : ${formatCurrency(totalOut)} VNĐ. Số dư còn lại: ${formatCurrency(debt)} VNĐ.`
          );
        }
      }
    } catch (e) {
      console.error('Aggregation Error:', e);
      console.warn('Giao dịch đã lưu nhưng cập nhật số dư Booking thất bại. Hãy kiểm tra lại.');
    }
  }

  /**
   * Mở modal báo cáo giao dịch
   * Tải dữ liệu từ logic module và render bảng
   */
  async openReportModal() {
    try {
      // Lấy template
      const reportTemplate = document.getElementById('tmpl-report');
      if (!reportTemplate) {
        console.error('❌ Không tìm thấy template tmpl-report');
        return;
      }

      // Kiểm tra modal cũ, xóa nếu có
      const oldModal = document.getElementById('acc-report-modal');
      if (oldModal) oldModal.remove();

      // Clone template content
      const reportContent = reportTemplate.content.cloneNode(true);

      // Tạo modal bootstrap chuẩn
      const modalContainer = document.createElement('div');
      modalContainer.id = 'acc-report-modal';
      modalContainer.className = 'modal fade';
      modalContainer.tabIndex = -1;
      modalContainer.setAttribute('aria-labelledby', 'reportModalLabel');
      modalContainer.setAttribute('aria-hidden', 'true');

      // Modal dialog
      const modalDialog = document.createElement('div');
      modalDialog.className = 'modal-dialog modal-lg modal-dialog-scrollable';

      // Modal content
      const modalContent = document.createElement('div');
      modalContent.className = 'modal-content';

      // Modal header
      const modalHeader = document.createElement('div');
      modalHeader.className = 'modal-header bg-light border-bottom';
      modalHeader.innerHTML = `
                <h5 class="modal-title" id="reportModalLabel">
                    <i class="fas fa-file-invoice text-success me-2"></i> Báo Cáo Giao Dịch
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            `;

      // Modal body
      const modalBody = document.createElement('div');
      modalBody.className = 'modal-body p-0';
      modalBody.appendChild(reportContent);

      // Assemble modal
      modalContent.appendChild(modalHeader);
      modalContent.appendChild(modalBody);
      modalDialog.appendChild(modalContent);
      modalContainer.appendChild(modalDialog);

      // Append vào body
      document.body.appendChild(modalContainer);

      // Render dữ liệu
      await this.renderReportData();

      // Show modal bằng Bootstrap API
      const bsModal = new bootstrap.Modal(modalContainer, {
        backdrop: true,
        keyboard: true,
        focus: true,
      });
      bsModal.show();

      // Bind event listeners
      this.setupReportEventListeners();
    } catch (e) {
      console.error('❌ Report Modal Error:', e);
      logA('Lỗi mở báo cáo: ' + e.message, 'error', 'alert');
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
      const allTransactions = window.A?.DATA?.checkingTransactions || [];
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
                        ${isIn ? '+' : '-'} ${formatCurrency(amount)}
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
                        <button class="btn btn-sm btn-outline-primary" onclick="window.AccountantCtrl.openTransactionModal('${trans.type}', '${trans.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                `;
        tbody.appendChild(row);
      });

      // Update totals
      document.getElementById('report-total-records').textContent = allTransactions.length;
      document.getElementById('report-total-in').textContent = formatCurrency(totalIn);
      document.getElementById('report-total-out').textContent = formatCurrency(totalOut);
      document.getElementById('report-balance').textContent = formatCurrency(totalIn - totalOut);
    } catch (e) {
      console.error('Render Report Error:', e);
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

  /**
   * Áp dụng các bộ lọc cho báo cáo
   */
  applyReportFilters() {
    try {
      const typeFilter = document.getElementById('report-type-select')?.value || 'all';
      const periodFilter = document.getElementById('report-filter-period')?.value || 'month';
      const keyword = document.getElementById('report-filter-keyword')?.value || '';
      const fundFilter = document.getElementById('report-filter-fund')?.value || '';

      const allTransactions = window.A?.DATA?.checkingTransactions || [];
      let filtered = allTransactions;

      // Filter by type
      if (typeFilter !== 'all') {
        filtered = filtered.filter((t) => t.type === typeFilter.toUpperCase());
      }

      // Filter by keyword
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            (t.id && t.id.toLowerCase().includes(lowerKeyword)) ||
            (t.description && t.description.toLowerCase().includes(lowerKeyword)) ||
            (t.booking_id && t.booking_id.toLowerCase().includes(lowerKeyword))
        );
      }

      // Filter by fund
      if (fundFilter) {
        filtered = filtered.filter((t) => t.fund_source === fundFilter);
      }

      // Render filtered data
      const tbody = document.getElementById('report-table-body');
      if (!tbody) return;

      tbody.innerHTML = '';
      let totalIn = 0,
        totalOut = 0;

      filtered.forEach((trans) => {
        const amount = parseFloat(trans.amount || 0);
        const isIn = trans.type === 'IN';
        if (isIn) totalIn += amount;
        else totalOut += amount;

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
                        ${isIn ? '+' : '-'} ${formatCurrency(amount)}
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
                        <button class="btn btn-sm btn-outline-primary" onclick="window.AccountantCtrl.openTransactionModal('${trans.type}', '${trans.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                `;
        tbody.appendChild(row);
      });

      // Update totals
      document.getElementById('report-total-records').textContent = filtered.length;
      document.getElementById('report-total-in').textContent = formatCurrency(totalIn);
      document.getElementById('report-total-out').textContent = formatCurrency(totalOut);
      document.getElementById('report-balance').textContent = formatCurrency(totalIn - totalOut);
    } catch (e) {
      console.error('Apply Report Filters Error:', e);
    }
  }
}

// ===================================================================
// INITIALIZATION
// ===================================================================
window.AccountantCtrl = new AccountantController();
window.AccountantCtrl.init(); // Gọi init ngay
export default AccountantCtrl;
