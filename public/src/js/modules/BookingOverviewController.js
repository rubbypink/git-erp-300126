/**
 * =========================================================================
 * BookingOverviewController.js
 * Purpose: Controller cho modal Booking Overview (tổng hợp chi tiết booking).
 * Refactored: Sử dụng Strategy Pattern để xử lý đa role (Sale/Operator).
 * =========================================================================
 */

import { DB_SCHEMA } from './db/DBSchema.js';

const BookingOverviewController = (function () {
  // =========================================================================
  // 1. PRIVATE STATE & STRATEGIES
  // =========================================================================
  let _bookingId = null;
  let _bookingData = null;
  let _customerData = null;
  let _detailsData = [];
  let _transactionsData = [];
  let _detailRowCount = 0;
  let _rootEl = null;
  let _modalRef = null;
  let _currentStrategy = null;

  /**
   * Định nghĩa các chiến lược xử lý theo Role
   */
  const STRATEGIES = {
    sale: {
      role: 'sale',
      collection: 'booking_details',
      dataKey: 'booking_details_by_booking',
      displayFields: ['id', 'service_type', 'hotel_name', 'service_name', 'check_in', 'check_out', 'nights', 'quantity', 'unit_price', 'child_qty', 'child_price', 'surcharge', 'discount', 'total', 'ref_code', 'note'],
      totalField: 'total',
      summaryTotalField: 'total',
      calculateRow: (tr, idx) => {
        const g = (f) => getNum(tr.querySelector(`[data-field="${f}"]`));
        const type = getVal('[data-field="service_type"]', tr);
        const night = g('nights');
        const multiplier = type === 'Phòng' ? Math.max(1, night) : 1;

        const total = (g('quantity') * g('unit_price') + g('child_qty') * g('child_price')) * multiplier + g('surcharge') - g('discount');

        const elTotal = tr.querySelector('[data-field="total"]');
        if (elTotal) {
          elTotal.value = formatNumber(total);
          elTotal.dataset.val = total;
        }
        return total;
      },
    },
    op: {
      role: 'op',
      collection: 'operator_entries',
      dataKey: 'operator_entries_by_booking',
      displayFields: ['id', 'service_type', 'hotel_name', 'service_name', 'check_in', 'check_out', 'nights', 'adults', 'cost_adult', 'children', 'cost_child', 'surcharge', 'discount', 'total_sale', 'total_cost', 'paid_amount', 'debt_balance', 'ref_code', 'operator_note'],
      totalField: 'total_cost',
      summaryTotalField: 'total_sale', // OP summary vẫn xem doanh thu sale
      calculateRow: (tr, idx) => {
        const g = (f) => getNum(tr.querySelector(`[data-field="${f}"]`));
        const type = getVal('[data-field="service_type"]', tr);
        const night = g('nights');
        const multiplier = type === 'Phòng' ? Math.max(1, night) : 1;

        // Tính Total Cost
        const totalCost = (g('adults') * g('cost_adult') + g('children') * g('cost_child')) * multiplier + g('surcharge') - g('discount');
        const elTotalCost = tr.querySelector('[data-field="total_cost"]');
        if (elTotalCost) {
          elTotalCost.value = formatNumber(totalCost);
          elTotalCost.dataset.val = totalCost;
        }

        // Tính Debt Balance
        const paid = g('paid_amount');
        const elDebt = tr.querySelector('[data-field="debt_balance"]');
        if (elDebt) {
          const debt = totalCost - paid;
          elDebt.value = formatNumber(debt);
          elDebt.dataset.val = debt;
        }
        return totalCost;
      },
    },
  };

  // Admin dùng chung strategy với Sale nhưng có thể mở rộng sau này
  STRATEGIES.admin = STRATEGIES.sale;

  // =========================================================================
  // 2. PUBLIC API
  // =========================================================================

  async function open(bookingId, options = {}) {
    if (!bookingId) {
      const input = await prompt('Vui lòng nhập ID booking (VD: BK0001):', '11234');
      if (input) this.open(input.trim(), options);
      return;
    }

    _bookingId = bookingId;
    _detailRowCount = 0;

    // Khởi tạo Strategy dựa trên role
    const role = (window.CURRENT_USER?.role || 'sale').toLowerCase();
    _currentStrategy = STRATEGIES[role] || STRATEGIES.sale;

    try {
      showLoading(true);

      // ⚠️ Fix Modal Lifecycle: Đảm bảo modal cũ được dọn dẹp nếu có
      if (_modalRef) {
        try {
          _modalRef.hide();
        } catch (e) {}
        _modalRef = null;
      }

      _modalRef = await A.UI.renderModal('tpl_booking_overview.html', `Booking - ${bookingId}`, null, null, {
        footer: 'false',
        fullscreen: 'true',
        size: 'modal-xl',
      });

      if (!_modalRef) throw new Error('Không thể khởi tạo modal');

      _modalRef.setFooter(false);
      _modalRef.show();

      // Chờ một chút để DOM được chèn vào (Fix Container not found)
      await new Promise((resolve) => setTimeout(resolve, 100));

      _rootEl = getE('bkov-root');
      if (!_rootEl) {
        // Thử tìm lại sau 200ms nữa nếu vẫn chưa thấy
        await new Promise((resolve) => setTimeout(resolve, 200));
        _rootEl = getE('bkov-root');
        if (!_rootEl) throw new Error('Không tìm thấy bkov-root sau khi render modal');
      }

      _rootEl.setAttribute('data-item', bookingId);

      await _loadData(bookingId);

      _populateHeader();
      _populateDetail();
      _populateCustomer();
      _populateServices();
      _populatePayment();
      _populateNotes();
      _populateHistory();

      _bindEvents();
      _initStateProxy();

      if (options.activeTab) _switchTab(options.activeTab);
    } catch (e) {
      Opps('BookingOverview.open', e);
    } finally {
      showLoading(false);
    }
  }

  function close() {
    if (_modalRef) _modalRef.hide();
    _reset();
  }

  function getData() {
    return {
      booking: _bookingData,
      customer: _customerData,
      details: _detailsData,
      transactions: _transactionsData,
    };
  }

  // =========================================================================
  // 3. DATA LOADING (Refactored with Strategy)
  // =========================================================================

  async function _loadData(bookingId) {
    const data = window.APP_DATA;
    if (!data) throw new Error('APP_DATA chưa sẵn sàng');

    _bookingData = data.bookings?.[bookingId] || null;
    if (!_bookingData) {
      L._(`Không tìm thấy booking: ${bookingId}`, 'warning');
      return;
    }

    const custId = _bookingData.customer_id;
    _customerData = custId ? data.customers?.[custId] || null : null;

    // 1. Lấy dữ liệu chi tiết dịch vụ theo Strategy
    const detailsMap = data[_currentStrategy.dataKey]?.[bookingId];
    _detailsData = Array.isArray(detailsMap) ? detailsMap : detailsMap ? Object.values(detailsMap) : [];

    // 2. Fix Role-Based Transaction Mapping & Payment Table Logic
    // - Sale/Admin: transactions map tới bookings.id
    // - OP: transactions map tới operator_entries.id
    if (_currentStrategy.role === 'op') {
      const entryIds = _detailsData.map((d) => d.id).filter(Boolean);
      let allOpTxns = [];

      // Gom tất cả transactions của từng entry
      entryIds.forEach((eid) => {
        const txns = data.transactions_by_booking?.[eid];
        if (txns) {
          const txnList = Array.isArray(txns) ? txns : Object.values(txns);
          allOpTxns = allOpTxns.concat(txnList);
        }
      });

      // Loại bỏ trùng lặp nếu có
      _transactionsData = Array.from(new Map(allOpTxns.map((t) => [t.id, t])).values());
    } else {
      const txnMap = data.transactions_by_booking?.[bookingId];
      _transactionsData = Array.isArray(txnMap) ? txnMap : txnMap ? Object.values(txnMap) : [];
    }
  }

  // =========================================================================
  // 4. UI POPULATION
  // =========================================================================

  function _populateHeader() {
    if (!_bookingData) return;
    const bk = _bookingData;
    const custName = bk.customer_full_name || _customerData?.full_name || '—';

    setText('bkov-cust-name', custName);
    setText('bkov-bk-id', bk.id || '—');
    setText('bkov-start-date', formatDateVN(bk.start_date) || '—');
    setText('bkov-end-date', formatDateVN(bk.end_date) || '—');
    setText('bkov-status', bk.status || '—');
    setText('bkov-total-amount', formatNumber(bk.total_amount * 1000 || 0));
  }

  function _populateDetail() {
    if (!_bookingData) return;
    const root = getE('bkov-pane-detail');
    if (!root) return;

    HD.setFormData(root, _bookingData);
    _renderServiceSummary();
    _populateSelectOptions(root);
  }

  function _populateCustomer() {
    const root = getE('bkov-pane-customer');
    if (!root) return;
    if (_customerData) {
      HD.setFormData(root, _customerData, true, { prefix: 'customer_' });
    }
  }

  function _populateServices() {
    const tbody = getE('bkov-detail-tbody');
    // ⚠️ Fix Service Tab Data Rendering: Lấy thead chính xác từ table
    const table = getE('bkov-detail-table');
    const thead = table ? table.querySelector('thead') : null;

    if (!tbody || !thead) return;

    _renderServiceHeader(thead);

    tbody.innerHTML = '';
    _detailRowCount = 0;

    if (_detailsData.length === 0) {
      const colCount = thead.querySelectorAll('th').length || 17;
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center text-muted fst-italic py-3">Chưa có dịch vụ</td></tr>`;
      return;
    }

    const sorted = _sortDetails(_detailsData);
    sorted.forEach((row) => _addBkDetailRow(row));

    _calcServicesTotal();
  }

  function _renderServiceHeader(thead) {
    const schema = DB_SCHEMA[_currentStrategy.collection];
    if (!schema) return;

    let html = '<tr><th class="text-center" style="width:40px">#</th>';
    _currentStrategy.displayFields.forEach((fName) => {
      if (fName === 'id') return;
      const field = schema.fields.find((f) => f.name === fName);
      if (field) {
        html += `<th class="text-nowrap">${field.displayName}</th>`;
      }
    });
    html += '<th class="text-center" style="width:40px"></th></tr>';
    thead.innerHTML = html;
  }

  function _populatePayment() {
    if (!_bookingData) return;

    // Tính toán tổng tiền và đã trả dựa trên transactions thực tế đã load
    const total = Number(_bookingData.total_amount * 1000) || 0;

    // Đã trả = Tổng các giao dịch Thu/IN (trừ Chi/OUT nếu cần, tùy logic kế toán)
    const deposit = _transactionsData.reduce((sum, tx) => {
      if (tx.status === 'Hoàn thành' || tx.status === 'Completed' || tx.status === 'success') {
        if (tx.type === 'Thu' || tx.type === 'IN') return sum + (Number(tx.amount) || 0);
        if (tx.type === 'Chi' || tx.type === 'OUT') return sum - (Number(tx.amount) || 0);
      }
      return sum;
    }, 0);

    const balance = total - deposit;
    const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((deposit / total) * 100))) : 0;

    setText('bkov-pay-total', formatNumber(total));
    setText('bkov-pay-deposited', formatNumber(deposit));
    setText('bkov-pay-remaining', formatNumber(balance));
    setText('bkov-pay-method', _bookingData.payment_method || '—');

    const progressEl = getE('bkov-pay-progress');
    if (progressEl) {
      progressEl.style.width = pct + '%';
      progressEl.setAttribute('aria-valuenow', pct);
      progressEl.title = `${pct}% đã thanh toán`;
      progressEl.className = `progress-bar ${pct >= 100 ? 'bg-success' : pct > 0 ? 'bg-info' : 'bg-secondary'}`;
    }

    _renderTransactions();
  }

  function _populateNotes() {
    if (!_bookingData) return;
    setVal('bkov-n-note', _bookingData.note || '');
    _renderInternalNotes();
  }

  function _renderInternalNotes() {
    const feed = getE('bkov-notes-feed');
    if (!feed) return;

    const notes = _bookingData?.note_internal;
    if (!Array.isArray(notes) || notes.length === 0) {
      feed.innerHTML = '<div class="text-muted small fst-italic">Chưa có ghi chú nội bộ</div>';
      return;
    }

    const reversed = [...notes].reverse();
    let html = '';
    reversed.forEach((entry) => {
      const parsed = _parseNoteEntry(entry);
      html += `
        <div class="border rounded p-2 bg-light small">
          <div class="d-flex justify-content-between">
            <strong>${escapeHtml(parsed.author)}</strong>
            <span class="text-muted">${escapeHtml(parsed.timestamp)}</span>
          </div>
          <div class="mt-1">${escapeHtml(parsed.content)}</div>
        </div>`;
    });
    feed.innerHTML = html;
  }

  function _parseNoteEntry(entry) {
    if (typeof entry !== 'string') return { timestamp: '', content: String(entry), author: '' };
    const match = entry.match(/^\[([^\]]+)\]\s*:?\s*(.+?)\s*-\s*([^-]+)$/);
    if (match) return { timestamp: match[1].trim(), content: match[2].trim(), author: match[3].trim() };
    const match2 = entry.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
    if (match2) return { timestamp: match2[1].trim(), content: match2[2].trim(), author: '' };
    return { timestamp: '', content: entry, author: '' };
  }

  function _populateHistory() {
    const feed = getE('bkov-history-feed');
    if (!feed) return;

    const historyArr = _bookingData?.history;
    if (!Array.isArray(historyArr) || historyArr.length === 0) {
      feed.innerHTML = '<div class="text-muted small fst-italic">Chưa có hoạt động nào được ghi nhận</div>';
      return;
    }

    const reversed = [...historyArr].reverse();
    let html = '';
    reversed.forEach((entry) => {
      const parsed = _parseHistoryEntry(entry);
      html += `
        <div class="d-flex align-items-start gap-2 border-start border-2 border-primary ps-2 py-1">
          <div class="flex-shrink-0">
            <i class="fa-solid ${parsed.icon} text-${parsed.color}"></i>
          </div>
          <div class="flex-grow-1">
            <div class="small">${escapeHtml(parsed.detail)}</div>
            <div class="d-flex gap-2 text-muted" style="font-size: 0.75rem">
              <span><i class="fa-regular fa-clock me-1"></i>${escapeHtml(parsed.timestamp)}</span>
              ${parsed.actor ? `<span><i class="fa-regular fa-user me-1"></i>${escapeHtml(parsed.actor)}</span>` : ''}
            </div>
          </div>
        </div>`;
    });
    feed.innerHTML = html;
  }

  function _parseHistoryEntry(entry) {
    if (typeof entry !== 'string') return { timestamp: '', detail: String(entry), actor: '', icon: 'fa-circle-info', color: 'secondary' };

    let timestamp = '',
      detail = entry,
      actor = '';
    const tsMatch = entry.match(/^\[([^\]]+)\]\s*:?\s*/);
    if (tsMatch) {
      timestamp = tsMatch[1].trim();
      detail = entry.slice(tsMatch[0].length);
    }

    const lastDash = detail.lastIndexOf(' - ');
    if (lastDash > 0) {
      actor = detail.slice(lastDash + 3).trim();
      detail = detail.slice(0, lastDash).trim();
    }

    detail = detail.replace(/\s*-\s*Booking\s+\S+$/i, '').trim();

    const lc = detail.toLowerCase();
    let icon = 'fa-circle-info',
      color = 'secondary';
    if (lc.includes('tạo mới') || lc.includes('thêm')) {
      icon = 'fa-plus-circle';
      color = 'success';
    } else if (lc.includes('cập nhật') || lc.includes('sửa')) {
      icon = 'fa-pen-to-square';
      color = 'primary';
    } else if (lc.includes('xóa') || lc.includes('hủy')) {
      icon = 'fa-trash';
      color = 'danger';
    } else if (lc.includes('giao dịch') || lc.includes('thanh toán')) {
      icon = 'fa-money-bill-wave';
      color = 'warning';
    }

    return { timestamp, detail, actor, icon, color };
  }

  // =========================================================================
  // 5. DETAIL ROW RENDERING (Refactored with Strategy)
  // =========================================================================

  function _addBkDetailRow(data) {
    _detailRowCount++;
    const idx = _detailRowCount;
    const schema = DB_SCHEMA[_currentStrategy.collection];
    const lists = APP_DATA.lists || {};

    const tr = document.createElement('tr');
    tr.id = `bkov-row-${idx}`;
    tr.setAttribute('data-row', idx);
    if (data?.id) tr.setAttribute('data-item', data.id);

    let html = `<td class="text-center text-muted align-middle">${idx}<input type="hidden" class="d-sid" data-field="id"></td>`;

    _currentStrategy.displayFields.forEach((fName) => {
      if (fName === 'id') return;
      const field = schema.fields.find((f) => f.name === fName);
      if (!field) return;

      let cellContent = '';
      const fieldClass = field.class || '';
      const isReadonly = field.attrs?.includes('readonly') ? 'readonly' : '';

      if (field.tag === 'select') {
        let options = '<option value="">-</option>';
        if (fName === 'service_type') {
          options += (Object.values(lists.types) || []).map((x) => `<option value="${x}">${x}</option>`).join('');
        } else if (fName === 'supplier') {
          options += (Object.values(lists.suppliers) || []).map((s) => `<option value="${s}">${s}</option>`).join('');
        }
        cellContent = `<select class="form-select form-select-sm ${fieldClass}" data-field="${fName}" ${isReadonly}>${options}</select>`;
      } else if (field.tag === 'textarea') {
        cellContent = `<input type="text" class="form-control form-control-sm ${fieldClass}" data-field="${fName}" ${isReadonly}>`;
      } else {
        const inputType = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text';
        const alignClass = field.type === 'number' || fieldClass.split('').includes('number') ? 'text-end' : '';
        cellContent = `<input type="${inputType}" class="form-control form-control-sm ${fieldClass} ${alignClass}" data-field="${fName}" ${isReadonly}>`;
      }

      html += `<td>${cellContent}</td>`;
    });

    html += `
      <td class="text-center align-middle">
        <i class="fa-solid fa-times text-danger" style="cursor:pointer" data-action="remove-row" data-row-idx="${idx}"></i>
      </td>
    `;

    tr.innerHTML = html;
    const tbody = getE('bkov-detail-tbody');
    if (tbody) tbody.appendChild(tr);

    _updateHotelSelect(idx);

    if (data) {
      _currentStrategy.displayFields.forEach((fName) => {
        const el = tr.querySelector(`[data-field="${fName}"]`);
        if (el) {
          if (fName === 'service_type') {
            setVal(el, data[fName], tr);
            _onTypeChange(idx, false);
          } else if (fName === 'hotel_name') {
            setVal(el, data[fName], tr);
            _onLocationChange(idx, false);
          } else {
            setVal(el, data[fName], tr);
          }
        }
      });

      tr.querySelectorAll('input, select').forEach((el) => {
        el.setAttribute('data-initial', el.value);
      });

      _calcDetailRow(idx);
    }
  }

  // =========================================================================
  // 6. CASCADING DROPDOWN LOGIC
  // =========================================================================

  function _onTypeChange(idx, resetChildren = true) {
    _updateHotelSelect(idx);
    if (resetChildren) {
      const tr = getE(`bkov-row-${idx}`);
      if (tr) {
        setVal('[data-field="hotel_name"]', '', tr);
        setVal('[data-field="service_name"]', '', tr);
      }
    }
  }

  function _onLocationChange(idx, resetName = true) {
    _updateServiceSelect(idx);
    if (resetName) {
      const tr = getE(`bkov-row-${idx}`);
      if (tr) setVal('[data-field="service_name"]', '', tr);
    }
  }

  function _updateHotelSelect(idx) {
    const tr = getE(`bkov-row-${idx}`);
    if (!tr) return;
    const lists = APP_DATA.lists || {};
    const selLoc = tr.querySelector('[data-field="hotel_name"]');
    if (!selLoc) return;

    const currentVal = selLoc.value;
    const hotels = (Object.values(lists.hotelMatrix) || []).map((r) => r[0]).filter(Boolean);
    const others = Object.values(lists.locOther) || [];
    const allLocs = [...new Set([...hotels, ...others])];

    selLoc.innerHTML = '<option value="">-</option>' + allLocs.map((loc) => `<option value="${loc}">${loc}</option>`).join('');
    if (currentVal) selLoc.value = currentVal;
  }

  function _updateServiceSelect(idx) {
    const tr = getE(`bkov-row-${idx}`);
    if (!tr) return;
    const lists = APP_DATA.lists || {};
    const type = getVal('[data-field="service_type"]', tr);
    const loc = getVal('[data-field="hotel_name"]', tr);
    const selName = tr.querySelector('[data-field="service_name"]');
    if (!selName) return;

    const currentVal = selName.value;
    let options = [];

    if (type === 'Phòng' && loc) {
      const hotelRow = (Object.values(lists.hotelMatrix) || []).find((r) => r[0] === loc);
      if (hotelRow) options = hotelRow.slice(2).filter((c) => c);
    } else if (type) {
      options = (Object.values(lists.serviceMatrix) || [])
        .filter((r) => r[0] === type)
        .map((r) => r[1])
        .filter(Boolean);
    }

    selName.innerHTML = '<option value="">-</option>' + options.map((opt) => `<option value="${opt}">${opt}</option>`).join('');
    if (currentVal) selName.value = currentVal;
  }

  // =========================================================================
  // 7. CALCULATION (Refactored with Strategy)
  // =========================================================================

  function _calcDetailRow(idx) {
    const tr = getE(`bkov-row-${idx}`);
    if (!tr) return;

    const dInStr = getVal('[data-field="check_in"]', tr);
    const dOutStr = getVal('[data-field="check_out"]', tr);
    const type = getVal('[data-field="service_type"]', tr);

    let night = 0;
    if (dInStr && dOutStr) {
      const dIn = new Date(dInStr);
      const dOut = new Date(dOutStr);
      const diff = (dOut - dIn) / 86400000;
      night = type !== 'Phòng' || diff <= 0 ? 1 : diff;
    }
    const nightEl = tr.querySelector('[data-field="nights"]');
    if (nightEl) nightEl.value = night;

    // Gọi logic tính toán từ Strategy
    _currentStrategy.calculateRow(tr, idx);

    _calcServicesTotal();
  }

  function _calcServicesTotal() {
    let grandTotal = 0;
    const tbody = getE('bkov-detail-tbody');
    if (!tbody) return;

    tbody.querySelectorAll(`[data-field="${_currentStrategy.totalField}"]`).forEach((el) => {
      grandTotal += getNum(el);
    });

    setText('bkov-services-total', formatNumber(grandTotal));
  }

  // =========================================================================
  // 8. RENDER HELPERS
  // =========================================================================

  function _renderServiceSummary() {
    const container = getE('bkov-service-summary');
    if (!container) return;

    if (_detailsData.length === 0) {
      container.innerHTML = '<div class="text-muted small fst-italic">Chưa có dịch vụ nào</div>';
      return;
    }

    const grouped = {};
    _detailsData.forEach((d) => {
      const type = d.service_type || 'Khác';
      if (!grouped[type]) grouped[type] = { count: 0, total: 0 };
      grouped[type].count++;
      grouped[type].total += Number(d[_currentStrategy.summaryTotalField]) || 0;
    });

    const typeIcons = { Phòng: 'fa-bed', 'Vé MB': 'fa-plane', 'Vé Tàu': 'fa-train', Ăn: 'fa-utensils', Xe: 'fa-car', Tour: 'fa-map-marked-alt' };
    const typeColors = { Phòng: 'primary', 'Vé MB': 'info', 'Vé Tàu': 'warning', Ăn: 'success', Xe: 'secondary', Tour: 'danger' };

    let html = '';
    for (const [type, info] of Object.entries(grouped)) {
      const icon = typeIcons[type] || 'fa-concierge-bell';
      const color = typeColors[type] || 'secondary';
      html += `
        <div class="card border-${color} border-opacity-50 flex-fill" style="min-width: 140px; max-width: 200px;">
          <div class="card-body p-2 text-center">
            <i class="fa-solid ${icon} text-${color} mb-1"></i>
            <div class="small fw-bold">${escapeHtml(type)}</div>
            <div class="small text-muted">${info.count} mục</div>
            <div class="small fw-bold text-${color} number">${formatNumber(info.total)}</div>
          </div>
        </div>`;
    }
    container.innerHTML = html;
  }

  function _renderTransactions() {
    const tbody = getE('bkov-txn-tbody');
    if (!tbody) return;

    if (_transactionsData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted fst-italic py-3">Chưa có giao dịch</td></tr>';
      return;
    }

    const sorted = [..._transactionsData].sort((a, b) => (b.transaction_date || '').localeCompare(a.transaction_date || ''));
    const typeColors = { IN: 'success', OUT: 'danger', PENDING: 'info', Thu: 'success', Chi: 'danger' };

    let html = '';
    sorted.forEach((txn) => {
      const color = typeColors[txn.type] || 'secondary';
      html += `
        <tr class="align-middle" data-item="${txn.id || ''}">
          <td class="fw-bold small">${escapeHtml(txn.id || '—')}</td>
          <td class="text-center">${formatDateVN(txn.transaction_date) || '—'}</td>
          <td class="text-center"><span class="badge bg-${color}">${escapeHtml(txn.type || '—')}</span></td>
          <td class="text-end fw-bold number">${formatNumber(txn.amount || 0)}</td>
          <td>${escapeHtml(txn.category || '—')}</td>
          <td>${escapeHtml(A.Lang.t(txn.fund_source) || '—')}</td>
          <td class="text-center"><span class="badge bg-${color}">${escapeHtml(A.Lang.t(txn.status) || '—')}</span></td>
          <td class="small">${escapeHtml(txn.description || '')}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
  }

  // =========================================================================
  // 9. SELECT OPTIONS POPULATION
  // =========================================================================

  function _populateSelectOptions(root) {
    if (!root) return;
    const data = window.APP_DATA;

    const staffSelect = root.querySelector('[data-field="staff_id"]');
    if (staffSelect && data.users) {
      const users = Object.values(data.users);
      staffSelect.innerHTML = '<option value="">-</option>' + users.map((u) => `<option value="${u.uid || u.id}">${escapeHtml(u.user_name || u.account || u.id)}</option>`).join('');
      if (_bookingData?.staff_id) staffSelect.value = _bookingData.staff_id;
    }

    const paySelect = root.querySelector('[data-field="payment_method"]');
    if (paySelect) {
      const methods = Object.values(APP_DATA.lists.payment);
      paySelect.innerHTML = '<option value="">-</option>' + methods.map((m) => `<option value="${m}">${m}</option>`).join('');
      if (_bookingData?.payment_method) paySelect.value = _bookingData.payment_method;
    }
  }

  // =========================================================================
  // 10. EVENT BINDING
  // =========================================================================

  function _bindEvents() {
    if (!_rootEl) return;
    _rootEl.addEventListener('click', _handleClick);
    const detailTbody = getE('bkov-detail-tbody');
    if (detailTbody) {
      detailTbody.addEventListener('change', _handleDetailChange);
      detailTbody.addEventListener('dblclick', _handleTblDblClick);
    }
    const transTbody = getE('bkov-txn-tbody');
    if (transTbody) transTbody.addEventListener('dblclick', _handleTblDblClick);
  }

  async function _handleTblDblClick(e) {
    e.stopPropagation();
    const tr = e.target.closest('tr');
    if (!tr) return;
    const dataId = tr?.dataset?.item;
    if (!dataId) return;
    const parentId = tr.closest('#bkov-detail-tbody') ? _currentStrategy.collection : tr.closest('#bkov-txn-tbody') ? 'transactions' : null;
    if (!parentId) return;

    showConfirm('Bạn có muốn chỉnh sửa mục này không?', async () => {
      if (parentId === 'booking_details' || parentId === 'operator_entries') {
        A.UI.renderForm(parentId, dataId);
      } else {
        const module = await import('@acc/controller_accountant.js');
        const AccountantCtrl = module?.default || window.AccountantCtrl;
        if (AccountantCtrl) {
          const type = window.CURRENT_USER?.role === 'op' ? 'OUT' : 'IN';
          await AccountantCtrl.openEditModal(type, dataId);
        }
      }
    });
  }

  async function _handleClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    switch (action) {
      case 'close-overview':
        close();
        break;
      case 'save-booking':
        _saveBkOverview();
        break;
      case 'add-service-row':
        _addBkDetailRow();
        break;
      case 'remove-row': {
        const idx = actionEl.dataset.rowIdx;
        const row = getE(`bkov-row-${idx}`);
        if (row) row.remove();
        _calcServicesTotal();
        break;
      }
      case 'add-transaction':
        await _openTransactionForm();
        break;
      case 'add-note':
        _addInternalNote();
        break;
      case 'confirm-email':
        if (typeof SalesModule?.Confirmation?.openModal === 'function') SalesModule.Confirmation.openModal();
        break;
      case 'update-deposit':
        if (typeof SalesModule?.DB?.updateDeposit === 'function') SalesModule.DB.updateDeposit();
        break;
      case 'update-status':
        if (typeof SalesModule?.Logic?.updateBkStatus === 'function') SalesModule.Logic.updateBkStatus();
        break;
      case 'recalc-total':
        if (typeof SalesModule?.Logic?.calcGrandTotal === 'function') SalesModule.Logic.calcGrandTotal();
        break;
      case 'export-pdf':
        if (typeof SalesModule?.Confirmation !== 'undefined') {
          await SalesModule.Confirmation.openModal();
          await SalesModule.Confirmation.exportPDF();
        }
        break;
      case 'create-contract':
        if (typeof SYS.runFnByRole === 'function') {
          SYS.runFnByRole(loadBookingToUI, 'UI', _bookingData, _customerData, _detailsData);
          await SalesModule.Logic.createContract();
        }
        break;
    }
  }

  function _handleDetailChange(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const idx = tr.getAttribute('data-row');
    if (!idx) return;

    const field = e.target.getAttribute('data-field');
    if (field === 'service_type') {
      _onTypeChange(Number(idx));
    } else if (field === 'hotel_name') {
      _onLocationChange(Number(idx));
    } else {
      _calcDetailRow(Number(idx));
    }
  }

  // =========================================================================
  // 11. ACTIONS (Refactored with Strategy)
  // =========================================================================

  async function _saveBkOverview() {
    try {
      showLoading(true, 'Đang lưu dữ liệu...');

      const getExtract = (cId) => (typeof window.filterUpdateData === 'function' ? window.filterUpdateData(cId, document, true) || {} : _extractAllDataFields(cId));

      let bookingUpdates = getExtract('bkov-pane-detail');
      const noteData = getExtract('bkov-pane-notes');
      let customerUpdates = getExtract('bkov-pane-customer');

      bookingUpdates = { ...bookingUpdates, ...noteData };

      const bkId = getVal(getE('bkov-f-id')) || _bookingId;
      const custId = getVal(getE('bkov-c-id')) || _customerData?.id;

      if (Object.keys(bookingUpdates).length > 0) bookingUpdates.id = bkId;
      if (Object.keys(customerUpdates).length > 0) customerUpdates.id = custId;

      const custName = getVal(getE('bkov-c-name'));
      const custPhone = getVal(getE('bkov-c-phone'));

      if (Object.keys(bookingUpdates).length > 0 || custName !== _bookingData?.customer_full_name || custPhone !== _bookingData?.customer_phone) {
        bookingUpdates.id = bkId;
        bookingUpdates.customer_id = custId || '';
        bookingUpdates.customer_full_name = custName;
        bookingUpdates.customer_phone = custPhone;
      }

      let calcDeposit = 0;
      if (window.APP_DATA?.transactions_by_booking?.[bkId]) {
        const txns = Object.values(window.APP_DATA.transactions_by_booking[bkId]);
        calcDeposit = txns.reduce((sum, tx) => {
          if (tx.type === 'Thu' || tx.type === 'IN') return sum + (Number(tx.amount) || 0);
          return sum;
        }, 0);
      } else {
        calcDeposit = getNum(getE('bkov-f-deposit'));
      }

      const totalAmt = bookingUpdates.total_amount !== undefined ? getNum(bookingUpdates.total_amount) : Number(_bookingData?.total_amount) || 0;

      bookingUpdates.id = bkId;
      bookingUpdates.deposit_amount = calcDeposit;
      bookingUpdates.balance_amount = totalAmt - calcDeposit;

      const detailsUpdates = [];
      const tbody = getE('bkov-detail-tbody');

      if (tbody) {
        tbody.querySelectorAll('tr').forEach((tr) => {
          const typeEl = tr.querySelector('[data-field="service_type"]');
          if (!typeEl || !getVal(typeEl)) return;

          const rowData = {};
          tr.querySelectorAll('[data-field]').forEach((el) => {
            const fieldName = el.getAttribute('data-field');
            if (fieldName) rowData[fieldName] = getVal(el);
          });

          rowData.booking_id = bkId;
          detailsUpdates.push(rowData);
        });
      }

      const promises = [];

      if (Object.keys(customerUpdates).length > 1) {
        const cleanCustUpdates = { id: customerUpdates.id };
        Object.keys(customerUpdates).forEach((k) => {
          const cleanKey = k.replace(/^customer_/, '');
          cleanCustUpdates[cleanKey] = customerUpdates[k];
        });
        promises.push(A.DB.batchSave('customers', [cleanCustUpdates]));
      }

      if (Object.keys(bookingUpdates).length > 1) {
        promises.push(A.DB.batchSave('bookings', [bookingUpdates]));
      }

      if (detailsUpdates.length > 0) {
        promises.push(A.DB.batchSave(_currentStrategy.collection, detailsUpdates));
      }

      if (promises.length === 0) {
        logA('Không có dữ liệu thay đổi để lưu.', 'info');
        return;
      }

      await Promise.all(promises);

      if (window.StateProxy) await StateProxy.commitSession();

      setVal(getE('bkov-f-deposit'), calcDeposit);
      setVal(getE('bkov-f-balance'), bookingUpdates.balance_amount);

      logA('Lưu dữ liệu Tổng quan Booking thành công!', 'success');
    } catch (e) {
      Opps('BookingOverview._saveBkOverview', e);
    } finally {
      showLoading(false);
    }
  }

  function _extractAllDataFields(containerId) {
    const container = getE(containerId);
    if (!container) return {};
    const data = {};
    container.querySelectorAll('[data-field]').forEach((el) => {
      const field = el.getAttribute('data-field');
      if (field) data[field] = getVal(el);
    });
    return data;
  }

  async function _openTransactionForm() {
    try {
      const mod = await import('@acc/controller_accountant.js');
      const AccountantCtrl = mod.default || window.AccountantCtrl;
      if (AccountantCtrl?.openTransactionModal) {
        const type = window.CURRENT_USER?.role === 'op' ? 'OUT' : 'IN';
        // ⚠️ Fix Payment Table Logic: Truyền đúng format object cho AccountantCtrl
        const relatedId = _currentStrategy.role === 'op' ? _detailsData[0]?.id || _bookingId : _bookingId;
        await AccountantCtrl.openTransactionModal({
          type: type,
          booking_id: relatedId,
          description: `Thanh toán cho Booking ${_bookingId}`,
        });
      } else {
        L._('Không thể mở modal giao dịch: AccountantCtrl không khả dụng.', 'error');
      }
    } catch (e) {
      Opps('Lỗi import AccountantController: ', e);
    }
  }

  function _addInternalNote() {
    const input = getE('bkov-note-input');
    if (!input || !input.value.trim()) return;

    const noteText = input.value.trim();
    const user = window.CURRENT_USER;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const author = user?.user_name || user?.name || user?.email || 'User';

    const entry = `[${ts}] ${noteText} - ${author}`;

    if (_bookingId && A.DB) {
      A.DB.arrayUnionField('bookings', _bookingId, 'note_internal', entry).catch((e) => {
        Opps('Lỗi lưu ghi chú nội bộ: ', e);
      });
    }

    if (_bookingData) {
      if (!Array.isArray(_bookingData.note_internal)) _bookingData.note_internal = [];
      _bookingData.note_internal.push(entry);
    }

    _renderInternalNotes();
    input.value = '';
    input.focus();
  }

  // =========================================================================
  // 12. STATE PROXY INTEGRATION
  // =========================================================================

  function _initStateProxy() {
    if (!window.StateProxy || !_bookingData) return;
    StateProxy.clearSession();

    if (_bookingData.id) StateProxy.beginEdit('bookings', _bookingData.id);
    if (_customerData?.id) StateProxy.beginEdit('customers', _customerData.id);

    _detailsData.forEach((row) => {
      if (row?.id) StateProxy.beginEdit(_currentStrategy.collection, row.id);
    });
  }

  // =========================================================================
  // 13. HELPERS
  // =========================================================================

  function _sortDetails(detailsArr) {
    const priority = { 'Vé MB': 1, 'Vé Tàu': 2, Phòng: 3, Xe: 4 };
    return [...detailsArr].sort((a, b) => {
      const pa = priority[a.service_type] || 99;
      const pb = priority[b.service_type] || 99;
      if (pa !== pb) return pa - pb;
      return (a.check_in || '').localeCompare(b.check_in || '');
    });
  }

  function _switchTab(tabKey) {
    const btn = getE(`bkov-tab-${tabKey}`);
    if (btn) {
      const tabInstance = bootstrap.Tab.getOrCreateInstance(btn);
      tabInstance.show();
    }
  }

  function _reset() {
    _bookingId = null;
    _bookingData = null;
    _customerData = null;
    _detailsData = [];
    _transactionsData = [];
    _detailRowCount = 0;
    _rootEl = null;
    _modalRef = null;
    _currentStrategy = null;
  }

  return { open, close, getData };
})();

export default BookingOverviewController;
