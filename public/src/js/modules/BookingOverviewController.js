/**
 * =========================================================================
 * BookingOverviewController.js
 * Purpose: Controller cho modal Booking Overview (tổng hợp chi tiết booking).
 * Sử dụng A.Modal engine, StateProxy, HD.setFormData/getFormData.
 * =========================================================================
 */

const BookingOverviewController = (function () {
  // =========================================================================
  // 1. PRIVATE STATE
  // =========================================================================
  let _bookingId = null;
  let _bookingData = null;
  let _customerData = null;
  let _detailsData = [];
  let _transactionsData = [];
  let _detailRowCount = 0;
  let _rootEl = null;
  let _modalRef = null;

  // =========================================================================
  // 2. PUBLIC API
  // =========================================================================

  /**
   * Mở modal Booking Overview cho 1 booking.
   *
   * @param {string} bookingId - ID booking (VD: 'BK0001')
   * @param {object} [options] - Cấu hình mở rộng
   * @param {string} [options.activeTab] - Tab mặc định ('detail'|'customer'|'services'|'payment'|'notes'|'history')
   */
  async function open(bookingId, options = {}) {
    if (!bookingId) {
      log('BookingOverview: Thiếu bookingId', 'warning');
      return;
    }

    _bookingId = bookingId;
    _detailRowCount = 0;

    try {
      showLoading(true);

      // 1. Load template vào modal
      _modalRef = await A.UI.renderModal('tpl_booking_overview.html', `Tổng Quan Booking — ${bookingId}`);
      if (_modalRef) {
        _modalRef.setFooter(false); // Footer được tích hợp sẵn trong template
        const modalEl = _modalRef._getEl();
        _modalRef.show();
      }

      // 2. Lấy root element sau khi modal đã render
      _rootEl = getE('bkov-root');
      if (!_rootEl) {
        Opps('BookingOverview', 'Không tìm thấy bkov-root');
        return;
      }

      // 3. Đặt data-item cho StateProxy context resolution
      _rootEl.setAttribute('data-item', bookingId);

      // 4. Load dữ liệu
      await _loadData(bookingId);

      // 5. Populate UI
      _populateHeader();
      _populateDetail();
      _populateCustomer();
      _populateServices();
      _populatePayment();
      _populateNotes();
      _populateHistory();

      // 6. Bind events
      _bindEvents();

      // 7. Init StateProxy tracking
      _initStateProxy();

      // 8. Chuyển tab nếu được chỉ định
      if (options.activeTab) {
        _switchTab(options.activeTab);
      }
    } catch (e) {
      Opps('BookingOverview.open', e);
    } finally {
      showLoading(false);
      setClass('#tab-form', 'd-none', true);
    }
  }

  /**
   * Đóng modal overview.
   */
  function close() {
    setClass('#tab-form', 'd-none', false);
    if (_modalRef) {
      _modalRef.hide();
    }
    _reset();
  }

  /**
   * Lấy booking data hiện tại.
   * @returns {object|null}
   */
  function getData() {
    return {
      booking: _bookingData,
      customer: _customerData,
      details: _detailsData,
      transactions: _transactionsData,
    };
  }

  // =========================================================================
  // 3. DATA LOADING
  // =========================================================================

  /**
   * Load tất cả dữ liệu liên quan đến 1 booking từ APP_DATA.
   * @private
   */
  async function _loadData(bookingId) {
    const data = window.APP_DATA;
    if (!data) {
      Opps('BookingOverview._loadData', 'APP_DATA chưa sẵn sàng');
      return;
    }

    // Booking
    _bookingData = data.bookings?.[bookingId] || null;
    if (!_bookingData) {
      log(`Không tìm thấy booking: ${bookingId}`, 'warning');
      return;
    }

    // Customer
    const custId = _bookingData.customer_id;
    _customerData = custId ? data.customers?.[custId] || null : null;

    // Booking Details (từ secondary index)
    const detailsMap = data.booking_details_by_booking?.[bookingId];
    if (Array.isArray(detailsMap)) {
      _detailsData = detailsMap;
    } else if (detailsMap && typeof detailsMap === 'object') {
      _detailsData = Object.values(detailsMap);
    } else {
      _detailsData = [];
    }

    // Transactions (từ secondary index)
    const txnMap = data.transactions_by_booking?.[bookingId];
    if (Array.isArray(txnMap)) {
      _transactionsData = txnMap;
    } else if (txnMap && typeof txnMap === 'object') {
      _transactionsData = Object.values(txnMap);
    } else {
      _transactionsData = [];
    }
  }

  // =========================================================================
  // 4. UI POPULATION
  // =========================================================================

  /** Populate sticky header summary */
  function _populateHeader() {
    if (!_bookingData) return;
    const bk = _bookingData;
    const custName = bk.customer_full_name || _customerData?.full_name || '—';

    setText('bkov-cust-name', custName);
    setText('bkov-bk-id', bk.id || '—');
    setText('bkov-start-date', formatDateVN(bk.start_date) || '—');
    setText('bkov-end-date', formatDateVN(bk.end_date) || '—');
    setText('bkov-status', bk.status || '—');
    setText('bkov-total-amount', formatMoney(bk.total_amount || 0));
  }

  /** Populate Tab Chi tiết (booking fields) */
  function _populateDetail() {
    if (!_bookingData) return;
    const root = getE('bkov-pane-detail');
    if (!root) return;

    // Dùng HD.setFormData để đổ dữ liệu vào các [data-field] elements
    HD.setFormData(root, _bookingData);

    // Populate service summary cards
    _renderServiceSummary();

    // Populate select options
    _populateSelectOptions(root);
  }

  /** Populate Tab Khách hàng */
  function _populateCustomer() {
    const root = getE('bkov-pane-customer');
    if (!root) return;

    if (_customerData) {
      // Map customer fields (schema uses no prefix, but HTML has customer_ prefix via FIELD_ALIAS)
      HD.setFormData(root, _bookingData); // uses customer_* aliased fields from booking
    }
  }

  /** Populate Tab Dịch vụ (booking_details table) */
  function _populateServices() {
    const tbody = getE('bkov-detail-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    _detailRowCount = 0;

    if (_detailsData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="17" class="text-center text-muted fst-italic py-3">Chưa có dịch vụ</td></tr>';
      return;
    }

    // Sort theo thứ tự ưu tiên
    const sorted = _sortDetails(_detailsData);
    sorted.forEach((row) => _addDetailRow(row));
    // tbody.addEventListener('dblclick', (e) => {
    //   const tr = e.target.closest('tr');
    //   if (!tr) return;
    //   const dataId = tr?.dataset?.item;
    //   showConfirm('Bạn có muốn chỉnh sửa dịch vụ này không?', () => {
    //     A.UI.renderForm('booking_details', dataId);
    //   });
    // });

    // Cập nhật tổng
    _calcServicesTotal();
  }

  /** Populate Tab Thanh toán */
  function _populatePayment() {
    if (!_bookingData) return;
    const total = Number(_bookingData.total_amount) || 0;
    const deposit = Number(_bookingData.deposit_amount) || 0;
    const balance = total - deposit;
    const pct = total > 0 ? Math.min(100, Math.round((deposit / total) * 100)) : 0;

    setText('bkov-pay-total', formatMoney(total));
    setText('bkov-pay-deposited', formatMoney(deposit));
    setText('bkov-pay-remaining', formatMoney(balance));
    setText('bkov-pay-method', _bookingData.payment_method || '—');

    const progressEl = getE('bkov-pay-progress');
    if (progressEl) {
      progressEl.style.width = pct + '%';
      progressEl.setAttribute('aria-valuenow', pct);
      progressEl.title = `${pct}% đã thanh toán`;
    }

    // Render transactions table
    _renderTransactions();
  }

  /** Populate Tab Ghi chú */
  function _populateNotes() {
    if (!_bookingData) return;
    setVal('bkov-n-note', _bookingData.note || '');

    // Render ghi chú nội bộ (note_internal — array of strings)
    _renderInternalNotes();
  }

  /**
   * Render danh sách ghi chú nội bộ từ bookings.note_internal (dạng array).
   * Mỗi entry có format: "[DD/MM/YYYY HH:mm] Nội dung - Người tạo"
   * @private
   */
  function _renderInternalNotes() {
    const feed = getE('bkov-notes-feed');
    if (!feed) return;

    const notes = _bookingData?.note_internal;
    if (!Array.isArray(notes) || notes.length === 0) {
      feed.innerHTML = '<div class="text-muted small fst-italic">Chưa có ghi chú nội bộ</div>';
      return;
    }

    // Render mới nhất trước (reverse copy)
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

  /**
   * Parse 1 entry note_internal string.
   * Expected format: "[DD/MM/YYYY HH:mm] Nội dung - Người tạo"
   * Fallback: trả về toàn bộ string làm content.
   * @private
   * @param {string} entry
   * @returns {{ timestamp: string, content: string, author: string }}
   */
  function _parseNoteEntry(entry) {
    if (typeof entry !== 'string') return { timestamp: '', content: String(entry), author: '' };

    // Try parse: [timestamp] content - author (same format as history)
    const match = entry.match(/^\[([^\]]+)\]\s*:?\s*(.+?)\s*-\s*([^-]+)$/);
    if (match) {
      return { timestamp: match[1].trim(), content: match[2].trim(), author: match[3].trim() };
    }

    // Fallback: try parse [timestamp] content (no author)
    const match2 = entry.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
    if (match2) {
      return { timestamp: match2[1].trim(), content: match2[2].trim(), author: '' };
    }

    // Plain string fallback
    return { timestamp: '', content: entry, author: '' };
  }

  /**
   * Populate Tab Lịch sử từ bookings.history (array of strings).
   * Mỗi entry có format: "[DD/MM/YYYY HH:mm]: $detail - Booking $id - $actor"
   * @private
   */
  function _populateHistory() {
    const feed = getE('bkov-history-feed');
    if (!feed) return;

    const historyArr = _bookingData?.history;
    if (!Array.isArray(historyArr) || historyArr.length === 0) {
      feed.innerHTML = '<div class="text-muted small fst-italic">Chưa có hoạt động nào được ghi nhận</div>';
      return;
    }

    // Render mới nhất trước (reverse copy)
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

  /**
   * Parse 1 entry history string.
   * Expected format: "[DD/MM/YYYY HH:mm]: $detail - Booking $id - $actor"
   * @private
   * @param {string} entry
   * @returns {{ timestamp: string, detail: string, actor: string, icon: string, color: string }}
   */
  function _parseHistoryEntry(entry) {
    if (typeof entry !== 'string') return { timestamp: '', detail: String(entry), actor: '', icon: 'fa-circle-info', color: 'secondary' };

    let timestamp = '';
    let detail = entry;
    let actor = '';

    // Extract [timestamp]
    const tsMatch = entry.match(/^\[([^\]]+)\]\s*:?\s*/);
    if (tsMatch) {
      timestamp = tsMatch[1].trim();
      detail = entry.slice(tsMatch[0].length);
    }

    // Extract actor (last segment after " - ")
    const lastDash = detail.lastIndexOf(' - ');
    if (lastDash > 0) {
      actor = detail.slice(lastDash + 3).trim();
      detail = detail.slice(0, lastDash).trim();
    }

    // Remove "Booking BKxxxx" suffix if present
    detail = detail.replace(/\s*-\s*Booking\s+\S+$/i, '').trim();

    // Determine icon/color by action keyword
    const lc = detail.toLowerCase();
    let icon = 'fa-circle-info';
    let color = 'secondary';
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
  // 5. DETAIL ROW RENDERING (Reuse addDetailRow pattern)
  // =========================================================================

  /**
   * Thêm 1 dòng chi tiết dịch vụ vào bảng overview.
   * Tương tự logic_sales.addDetailRow nhưng tối ưu cho readonly/overview.
   * @private
   */
  function _addDetailRow(data) {
    _detailRowCount++;
    const idx = _detailRowCount;
    const lists = APP_DATA.lists || {};

    // Dropdown Loại DV
    const optsType = (lists.types || []).map((x) => `<option value="${x}">${x}</option>`).join('');

    const tr = document.createElement('tr');
    tr.id = `bkov-row-${idx}`;
    tr.setAttribute('data-row', idx);
    if (data?.id) tr.setAttribute('data-item', data.id);

    tr.innerHTML = `
      <td class="text-center text-muted align-middle">${idx}<input type="hidden" class="d-sid" data-field="id"></td>
      <td>
        <select class="form-select form-select-sm d-type" data-field="service_type">
          <option value="">-</option>${optsType}
        </select>
      </td>
      <td>
        <select class="form-select form-select-sm d-loc" data-field="hotel_name">
          <option value="">-</option>
        </select>
      </td>
      <td>
        <select class="form-select form-select-sm d-name" data-field="service_name">
          <option value="">-</option>
        </select>
      </td>
      <td><input type="date" class="form-control form-control-sm d-in" data-field="check_in"></td>
      <td><input type="date" class="form-control form-control-sm d-out" data-field="check_out"></td>
      <td><input type="number" class="form-control form-control-sm d-night number bg-light text-center" data-field="nights" readonly></td>
      <td><input type="number" class="form-control form-control-sm d-qty number" data-field="quantity" value="1"></td>
      <td><input type="number" class="form-control form-control-sm d-pri number" data-field="unit_price" placeholder="-"></td>
      <td><input type="number" class="form-control form-control-sm d-qtyC number" data-field="child_qty" placeholder="-"></td>
      <td><input type="number" class="form-control form-control-sm d-priC number" data-field="child_price" placeholder="-"></td>
      <td><input type="number" class="form-control form-control-sm d-sur number" data-field="surcharge" placeholder="-"></td>
      <td><input type="number" class="form-control form-control-sm d-disc number" data-field="discount" placeholder="-"></td>
      <td><input type="text" class="form-control form-control-sm d-total number fw-bold text-end" data-field="total" readonly data-val="0"></td>
      <td><input type="text" class="form-control form-control-sm d-code" data-field="ref_code"></td>
      <td><input type="text" class="form-control form-control-sm d-note" data-field="note"></td>
      <td class="text-center align-middle">
        <i class="fa-solid fa-times text-danger" style="cursor:pointer" data-action="remove-row" data-row-idx="${idx}"></i>
      </td>
    `;

    const tbody = getE('bkov-detail-tbody');
    if (tbody) tbody.appendChild(tr);

    // Fill location list
    _updateLocationList(idx);

    // Set data values if row has data
    if (data) {
      setVal('.d-sid', data.id || '', tr);
      setVal('.d-type', data.service_type, tr);
      _onTypeChange(idx, false);
      setVal('.d-loc', data.hotel_name, tr);
      _onLocationChange(idx, false);
      setVal('.d-name', data.service_name, tr);
      setVal('.d-in', data.check_in, tr);
      setVal('.d-out', data.check_out, tr);
      setVal('.d-qty', data.quantity, tr);
      setVal('.d-pri', data.unit_price, tr);
      setVal('.d-qtyC', data.child_qty, tr);
      setVal('.d-priC', data.child_price, tr);
      setVal('.d-sur', data.surcharge, tr);
      setVal('.d-disc', data.discount, tr);
      setVal('.d-code', data.ref_code, tr);
      setVal('.d-note', data.note, tr);
      _calcDetailRow(idx);

      // Snapshot initial values
      tr.querySelectorAll('input, select').forEach((el) => {
        el.setAttribute('data-initial', el.value);
      });
    }
  }

  // =========================================================================
  // 6. CASCADING DROPDOWN LOGIC (Mirrors logic_sales patterns)
  // =========================================================================

  function _onTypeChange(idx, resetChildren = true) {
    _updateLocationList(idx);
    if (resetChildren) {
      const tr = getE(`bkov-row-${idx}`);
      if (tr) {
        setVal('.d-loc', '', tr);
        setVal('.d-name', '', tr);
      }
    }
  }

  function _onLocationChange(idx, resetName = true) {
    _updateServiceNameList(idx);
    if (resetName) {
      const tr = getE(`bkov-row-${idx}`);
      if (tr) setVal('.d-name', '', tr);
    }
  }

  function _updateLocationList(idx) {
    const tr = getE(`bkov-row-${idx}`);
    if (!tr) return;
    const lists = APP_DATA.lists || {};
    const selLoc = tr.querySelector('.d-loc');
    if (!selLoc) return;

    const currentVal = selLoc.value;
    const hotels = (lists.hotelMatrix || []).map((r) => r[0]).filter(Boolean);
    const others = lists.locOther || [];
    const allLocs = [...new Set([...hotels, ...others])];

    selLoc.innerHTML = '<option value="">-</option>' + allLocs.map((loc) => `<option value="${loc}">${loc}</option>`).join('');

    if (currentVal) selLoc.value = currentVal;
  }

  function _updateServiceNameList(idx) {
    const tr = getE(`bkov-row-${idx}`);
    if (!tr) return;
    const lists = APP_DATA.lists || {};
    const type = getVal('.d-type', tr);
    const loc = getVal('.d-loc', tr);
    const selName = tr.querySelector('.d-name');
    if (!selName) return;

    const currentVal = selName.value;
    let options = [];

    if (type === 'Phòng' && loc) {
      const hotelRow = (lists.hotelMatrix || []).find((r) => r[0] === loc);
      if (hotelRow) {
        options = hotelRow.slice(2).filter((c) => c);
      }
    } else if (type) {
      options = (lists.serviceMatrix || [])
        .filter((r) => r[0] === type)
        .map((r) => r[1])
        .filter(Boolean);
    }

    selName.innerHTML = '<option value="">-</option>' + options.map((opt) => `<option value="${opt}">${opt}</option>`).join('');

    if (currentVal) selName.value = currentVal;
  }

  // =========================================================================
  // 7. CALCULATION (Mirrors logic_sales.calcRow / calcGrandTotal)
  // =========================================================================

  function _calcDetailRow(idx) {
    const tr = getE(`bkov-row-${idx}`);
    if (!tr) return;

    const dInStr = getVal('.d-in', tr);
    const dOutStr = getVal('.d-out', tr);
    const type = getVal('.d-type', tr);

    let night = 0;
    if (dInStr && dOutStr) {
      const dIn = new Date(dInStr);
      const dOut = new Date(dOutStr);
      const diff = (dOut - dIn) / 86400000;
      night = type !== 'Phòng' || diff <= 0 ? 1 : diff;
    }
    const nightEl = tr.querySelector('.d-night');
    if (nightEl) nightEl.value = night;

    const g = (cls) => Number(tr.querySelector('.' + cls)?.value) || 0;
    const qtyA = g('d-qty');
    const priA = g('d-pri');
    const qtyC = g('d-qtyC');
    const priC = g('d-priC');
    const sur = g('d-sur');
    const disc = g('d-disc');
    const multiplier = type === 'Phòng' ? Math.max(1, night) : 1;
    const total = (qtyA * priA + qtyC * priC) * multiplier + sur - disc;

    const elTotal = tr.querySelector('.d-total');
    if (elTotal) {
      elTotal.value = formatMoney(total);
      elTotal.dataset.val = total;
    }

    _calcServicesTotal();
  }

  function _calcServicesTotal() {
    let grandTotal = 0;
    const tbody = getE('bkov-detail-tbody');
    if (!tbody) return;

    tbody.querySelectorAll('.d-total').forEach((el) => {
      grandTotal += Number(el.dataset.val) || 0;
    });

    setText('bkov-services-total', formatMoney(grandTotal));
  }

  // =========================================================================
  // 8. RENDER HELPERS
  // =========================================================================

  /** Render tóm tắt dịch vụ dạng card nhỏ */
  function _renderServiceSummary() {
    const container = getE('bkov-service-summary');
    if (!container) return;

    if (_detailsData.length === 0) {
      container.innerHTML = '<div class="text-muted small fst-italic">Chưa có dịch vụ nào</div>';
      return;
    }

    // Group bằng service_type
    const grouped = {};
    _detailsData.forEach((d) => {
      const type = d.service_type || 'Khác';
      if (!grouped[type]) grouped[type] = { count: 0, total: 0, items: [] };
      grouped[type].count++;
      grouped[type].total += Number(d.total) || 0;
      grouped[type].items.push(d);
    });

    const typeIcons = {
      Phòng: 'fa-bed',
      'Vé MB': 'fa-plane',
      'Vé Tàu': 'fa-train',
      Ăn: 'fa-utensils',
      Xe: 'fa-car',
      Tour: 'fa-map-marked-alt',
    };

    const typeColors = {
      Phòng: 'primary',
      'Vé MB': 'info',
      'Vé Tàu': 'warning',
      Ăn: 'success',
      Xe: 'secondary',
      Tour: 'danger',
    };

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
            <div class="small fw-bold text-${color} number">${formatMoney(info.total)}</div>
          </div>
        </div>`;
    }
    container.innerHTML = html;
  }

  /** Render bảng lịch sử giao dịch */
  function _renderTransactions() {
    const tbody = getE('bkov-txn-tbody');
    if (!tbody) return;

    if (_transactionsData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted fst-italic py-3">Chưa có giao dịch</td></tr>';
      return;
    }

    // Sort theo ngày mới nhất
    const sorted = [..._transactionsData].sort((a, b) => {
      return (b.transaction_date || '').localeCompare(a.transaction_date || '');
    });

    const typeColors = { Thu: 'success', Chi: 'danger', Chuyển: 'info' };

    let html = '';
    sorted.forEach((txn) => {
      const color = typeColors[txn.type] || 'secondary';
      html += `
        <tr class="align-middle" data-item="${txn.id || ''}">
          <td class="fw-bold small">${escapeHtml(txn.id || '—')}</td>
          <td class="text-center">${formatDateVN(txn.transaction_date) || '—'}</td>
          <td class="text-center"><span class="badge bg-${color}">${escapeHtml(txn.type || '—')}</span></td>
          <td class="text-end fw-bold number">${formatMoney(txn.amount || 0)}</td>
          <td>${escapeHtml(txn.category || '—')}</td>
          <td>${escapeHtml(txn.fund_source || '—')}</td>
          <td class="text-center">
            <at-status><span>${escapeHtml(txn.status || '—')}</span></at-status>
          </td>
          <td class="small">${escapeHtml(txn.description || '')}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    // tbody.addEventListener('dblclick', (e) => {
    //   const tr = e.target.closest('tr');
    //   if (!tr) return;
    //   const dataId = tr?.dataset?.item;
    //   showConfirm('Bạn có muốn chỉnh sửa dịch vụ này không?', () => {
    //     A.UI.renderForm('transactions', dataId);
    //   });
    // });
  }

  // =========================================================================
  // 9. SELECT OPTIONS POPULATION
  // =========================================================================

  function _populateSelectOptions(root) {
    if (!root) return;
    const data = window.APP_DATA;

    // Staff select
    const staffSelect = root.querySelector('[data-field="staff_id"]');
    if (staffSelect && data.users) {
      const users = Object.values(data.users);
      staffSelect.innerHTML = '<option value="">-</option>' + users.map((u) => `<option value="${u.uid || u.id}">${escapeHtml(u.user_name || u.account || u.id)}</option>`).join('');
      if (_bookingData?.staff_id) staffSelect.value = _bookingData.staff_id;
    }

    // Payment method select
    const paySelect = root.querySelector('[data-field="payment_method"]');
    if (paySelect) {
      const methods = ['TM', 'CK CN', 'CK CT', 'Công Nợ', 'Thẻ tín dụng'];
      paySelect.innerHTML = '<option value="">-</option>' + methods.map((m) => `<option value="${m}">${m}</option>`).join('');
      if (_bookingData?.payment_method) paySelect.value = _bookingData.payment_method;
    }
  }

  // =========================================================================
  // 10. EVENT BINDING
  // =========================================================================

  function _bindEvents() {
    if (!_rootEl) return;

    // Delegate click events
    _rootEl.addEventListener('click', _handleClick);

    // Detail row change events (delegate trên bkov-detail-tbody)
    const detailTbody = getE('bkov-detail-tbody');
    if (detailTbody) {
      detailTbody.addEventListener('change', _handleDetailChange);
      detailTbody.addEventListener('dblclick', _handleTblDblClick);
    }
    const transTbody = getE('bkov-txn-tbody');
    if (transTbody) {
      transTbody.addEventListener('dblclick', _handleTblDblClick);
    }
  }

  function _handleTblDblClick(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const dataId = tr?.dataset?.item;
    if (!dataId) return;
    const parentId = tr.closest('#bkov-detail-tbody') ? 'booking_details' : tr.closest('#bkov-txn-tbody') ? 'transactions' : null;
    if (!parentId) return;
    showConfirm('Bạn có muốn chỉnh sửa mục này không?', async () => {
      if (parentId === 'booking_details') {
        A.UI.renderForm(parentId, dataId);
      } else {
        // Dynamic import AccountantController and call openTransactionModal
        const module = await import('/accountant/controller_accountant.js');
        if (module && module.default) {
          const AccountantCtrl = module.default;
          await AccountantCtrl.openTransactionModal('IN', dataId); // Pass transaction ID for editing
        }
      }
    });
  }

  function _handleClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    switch (action) {
      case 'close-overview':
        close();
        setClass('#tab-form', 'd-none', false);
        break;

      case 'save-booking':
        _saveBkOverview();
        break;

      case 'add-service-row':
        _addDetailRow();
        break;

      case 'remove-row': {
        const idx = actionEl.dataset.rowIdx;
        const row = getE(`bkov-row-${idx}`);
        if (row) row.remove();
        _calcServicesTotal();
        break;
      }

      case 'add-transaction':
        _openTransactionForm();
        break;

      case 'add-note':
        _addInternalNote();
        break;

      case 'confirm-email':
        if (typeof createConfirmation === 'function') createConfirmation();
        break;

      case 'update-deposit':
        if (typeof updateDeposit === 'function') updateDeposit();
        break;

      case 'update-status':
        if (typeof updateBkStatus === 'function') updateBkStatus();
        break;

      case 'recalc-total':
        if (typeof calcGrandTotal === 'function') calcGrandTotal();
        break;

      case 'export-pdf':
        if (typeof ConfirmationModule !== 'undefined') ConfirmationModule.exportPDF();
        break;

      case 'create-contract':
        if (typeof loadBookingToUI === 'function') {
          loadBookingToUI(_bookingData, _customerData, _detailsData);
          createContract();
        }
        break;
    }
  }

  function _handleDetailChange(e) {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const idx = tr.getAttribute('data-row');
    if (!idx) return;

    const el = e.target;
    if (el.classList.contains('d-type')) {
      _onTypeChange(Number(idx));
    } else if (el.classList.contains('d-loc')) {
      _onLocationChange(Number(idx));
    } else {
      // Recalc for any numeric field change
      _calcDetailRow(Number(idx));
    }
  }

  // =========================================================================
  // 11. ACTIONS
  // =========================================================================

  /** Thu thập và lưu dữ liệu booking */
  async function _saveBkOverview() {
    try {
      showLoading(true);

      // Collect data from form using HD.getFormData
      const bkPane = getE('bkov-pane-detail');
      const custPane = getE('bkov-pane-customer');
      const notesPane = getE('bkov-pane-notes');

      const bkUpdates = bkPane ? HD.getFormData(bkPane, 'bookings', true) : {};
      const custUpdates = custPane ? HD.getFormData(custPane, 'customers', true) : {};
      const noteData = notesPane ? HD.getFormData(notesPane, 'bookings', true) : {};

      // Merge note vào booking data
      Object.assign(bkUpdates, noteData);

      // Commit qua StateProxy nếu đang tracking
      if (window.StateProxy) {
        await StateProxy.commitSession();
        log('Booking Overview: Đã lưu thành công!', 'success');
      }
    } catch (e) {
      Opps('BookingOverview._saveBkOverview', e);
    } finally {
      showLoading(false);
    }
  }

  async function _openTransactionForm() {
    // Dynamic import AccountantController and call openTransactionModal
    await import('/accountant/controller_accountant.js')
      .then(async (mod) => {
        const AccountantCtrl = mod.default || window.AccountantCtrl;
        if (AccountantCtrl && typeof AccountantCtrl.openTransactionModal === 'function') {
          await AccountantCtrl.openTransactionModal('IN'); // Default to 'IN', or pass type as needed
        } else {
          log('Không thể mở modal giao dịch: AccountantCtrl không khả dụng.', 'error');
        }
      })
      .catch((e) => {
        log('Lỗi import AccountantController: ' + e, 'error');
      });
  }

  /** Thêm ghi chú nội bộ → lưu vào bookings.note_internal (arrayUnion) */
  function _addInternalNote() {
    const input = getE('bkov-note-input');
    if (!input || !input.value.trim()) return;

    const noteText = input.value.trim();
    const user = window.CURRENT_USER;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const author = user?.user_name || user?.name || user?.email || 'User';

    // Build entry string matching note_internal format
    const entry = `[${ts}] ${noteText} - ${author}`;

    // 1. Persist to Firestore via arrayUnion (fire-and-forget)
    if (_bookingId && window.firebase?.firestore) {
      firebase
        .firestore()
        .collection('bookings')
        .doc(String(_bookingId))
        .update({
          note_internal: firebase.firestore.FieldValue.arrayUnion(entry),
        })
        .catch((e) => console.warn('⚠️ Ghi note_internal thất bại:', e));
    }

    // 2. Update APP_DATA local
    if (APP_DATA?.bookings?.[_bookingId]) {
      if (!Array.isArray(APP_DATA.bookings[_bookingId].note_internal)) {
        APP_DATA.bookings[_bookingId].note_internal = [];
      }
      APP_DATA.bookings[_bookingId].note_internal.push(entry);
    }

    // 3. Also update _bookingData ref
    if (_bookingData) {
      if (!Array.isArray(_bookingData.note_internal)) {
        _bookingData.note_internal = [];
      }
      _bookingData.note_internal.push(entry);
    }

    // 4. Re-render feed
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

    // Track booking
    if (_bookingData.id) {
      StateProxy.beginEdit('bookings', _bookingData.id);
    }

    // Track customer
    const custId = _customerData?.id;
    if (custId) {
      StateProxy.beginEdit('customers', custId);
    }

    // Track details
    _detailsData.forEach((row) => {
      if (row?.id) {
        StateProxy.beginEdit('booking_details', row.id);
      }
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
  }

  // =========================================================================
  // EXPOSE PUBLIC API
  // =========================================================================
  return {
    open,
    close,
    getData,
  };
})();

export default BookingOverviewController;
