/**
 * =========================================================================
 * BookingOverviewController.js
 * Purpose: Controller cho modal Booking Overview (tổng hợp chi tiết booking).
 * Refactored: Sử dụng Strategy Pattern để xử lý đa role (Sale/Operator).
 * Optimization: Chuyển sang indexedDB (A.DB.local) & Tách biệt CRUD theo tab.
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
      dataKey: 'booking_details',
      displayFields: ['id', 'service_type', 'hotel_name', 'service_name', 'check_in', 'check_out', 'nights', 'quantity', 'unit_price', 'child_qty', 'child_price', 'surcharge', 'discount', 'total', 'ref_code', 'note'],
      totalField: 'total',
      summaryTotalField: 'total',
      calculateRow: (tr) => {
        const g = (f) => getNum(tr.querySelector(`[data-field="${f}"]`));
        const type = getVal(tr.querySelector('[data-field="service_type"]'));
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
      summaryTotalField: 'total_sale',
      calculateRow: (tr) => {
        const g = (f) => getNum(tr.querySelector(`[data-field="${f}"]`));
        const type = getVal(tr.querySelector('[data-field="service_type"]'));
        const night = g('nights');
        const multiplier = type === 'Phòng' ? Math.max(1, night) : 1;

        const totalCost = (g('adults') * g('cost_adult') + g('children') * g('cost_child')) * multiplier + g('surcharge') - g('discount');
        const elTotalCost = tr.querySelector('[data-field="total_cost"]');
        if (elTotalCost) {
          elTotalCost.value = formatNumber(totalCost);
          elTotalCost.dataset.val = totalCost;
        }

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

    const role = (window.CURRENT_USER?.role || 'sale').toLowerCase();
    _currentStrategy = STRATEGIES[role] || STRATEGIES.sale;

    try {
      showLoading(true);

      if (_modalRef) {
        try { _modalRef.hide(); } catch (e) {}
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

      await new Promise((resolve) => setTimeout(resolve, 200));
      _rootEl = _modalRef._getEl();

      if (!_rootEl) throw new Error('Không tìm thấy container modal');

      await _loadData(bookingId);
      _populateAll();

      _bindEvents();
      _initStateProxy();

      if (options.tab) _switchTab(options.tab);

    } catch (e) {
      Opps('BookingOverview.open', e);
      if (_modalRef) _modalRef.hide();
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
    };
  }

  // =========================================================================
  // 3. DATA LOADING & POPULATION
  // =========================================================================

  async function _loadData(bookingId) {
    try {
      _bookingData = await A.DB.local.get('bookings', bookingId);
      if (!_bookingData) {
        await A.DB.loadCollections(['bookings'], { forceNew: true });
        _bookingData = await A.DB.local.get('bookings', bookingId);
      }

      if (!_bookingData) throw new Error(`Không tìm thấy dữ liệu Booking: ${bookingId}`);

      if (_bookingData.customer_id) {
        _customerData = await A.DB.local.get('customers', _bookingData.customer_id);
      }

      const allDetails = await A.DB.local.getAllAsObject(_currentStrategy.collection);
      _detailsData = Object.values(allDetails).filter(d => d.booking_id === bookingId);
      _detailsData = _sortDetails(_detailsData);

      const allTrans = await A.DB.local.getAllAsObject('transactions');
      _transactionsData = Object.values(allTrans).filter(t => t.booking_id === bookingId);

    } catch (e) {
      Opps('BookingOverview._loadData', e);
      throw e;
    }
  }

  function _populateAll() {
    _populateHeader();
    _populateDetail();
    _populateCustomer();
    _populateServices();
    _populatePayment();
    _populateNotes();
    _populateHistory();
    _updateStats();
  }

  function _populateHeader() {
    if (!_bookingData) return;
    setVal(getE('bkov-h-id'), _bookingData.id);
    setVal(getE('bkov-h-customer'), _bookingData.customer_full_name || '—');
    setVal(getE('bkov-h-status'), _bookingData.status || 'Đặt Lịch');
    setVal(getE('bkov-h-total'), formatNumber(_bookingData.total_amount));
    setVal(getE('bkov-h-date'), formatDateVN(_bookingData.created_at));
  }

  function _populateDetail() {
    if (!_bookingData) return;
    const pane = getE('bkov-pane-detail');
    HD.setFormData(pane, _bookingData, false, { collection: 'bookings' });
  }

  function _populateCustomer() {
    if (!_customerData) return;
    const pane = getE('bkov-pane-customer');
    HD.setFormData(pane, _customerData, false, { collection: 'customers' });
  }

  function _populateServices() {
    const tbody = _rootEl.querySelector('#bkov-services-tbody');
    const thead = _rootEl.querySelector('#bkov-tbl-services thead');
    if (!tbody || !thead) return;

    tbody.innerHTML = '';
    _renderServiceHeader(thead);

    if (_detailsData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="20" class="text-center text-muted py-3">Chưa có dịch vụ nào</td></tr>';
      return;
    }

    _detailsData.forEach((row) => _addBkDetailRow(row));
    _renderServiceSummary();
  }

  function _renderServiceHeader(thead) {
    const fields = _currentStrategy.displayFields;
    let html = '<tr><th width="30">#</th>';
    fields.forEach((f) => {
      const schema = DB_SCHEMA[_currentStrategy.collection].fields.find((sf) => sf.name === f);
      const label = schema ? schema.displayName : f;
      const hidden = schema?.class?.includes('d-none') ? 'd-none' : '';
      html += `<th class="${hidden}">${label}</th>`;
    });
    html += '<th width="30"></th></tr>';
    thead.innerHTML = html;
  }

  function _populatePayment() {
    _renderTransactions();
  }

  function _populateNotes() {
    _renderInternalNotes();
    if (_bookingData?.note) {
      setVal(getE('bkov-f-note'), _bookingData.note);
    }
  }

  function _renderInternalNotes() {
    const container = getE('bkov-notes-list');
    if (!container) return;

    const notes = _bookingData?.note_internal || [];
    if (notes.length === 0) {
      container.innerHTML = '<div class="text-muted small p-2">Chưa có ghi chú nội bộ</div>';
      return;
    }

    container.innerHTML = notes
      .map((n) => {
        const { ts, text, author } = _parseNoteEntry(n);
        return `
        <div class="note-item border-bottom p-2">
          <div class="d-flex justify-content-between small text-muted">
            <span class="fw-bold text-primary">${author}</span>
            <span>${ts}</span>
          </div>
          <div class="mt-1">${text}</div>
        </div>`;
      })
      .join('');
    container.scrollTop = container.scrollHeight;
  }

  function _parseNoteEntry(entry) {
    const match = entry.match(/^\[(.*?)\] (.*?) - (.*)$/);
    if (match) return { ts: match[1], text: match[2], author: match[3] };
    return { ts: '', text: entry, author: 'System' };
  }

  function _populateHistory() {
    const container = getE('bkov-history-list');
    if (!container) return;

    const history = _bookingData?.history || [];
    if (history.length === 0) {
      container.innerHTML = '<div class="text-muted small p-2">Chưa có lịch sử thay đổi</div>';
      return;
    }

    container.innerHTML = history
      .map((h) => {
        const { ts, action, user } = _parseHistoryEntry(h);
        return `
        <div class="history-item small border-bottom p-1">
          <span class="text-muted">[${ts}]</span> 
          <span class="fw-bold">${user}:</span> 
          <span>${action}</span>
        </div>`;
      })
      .join('');
  }

  function _parseHistoryEntry(entry) {
    const match = entry.match(/^\[(.*?)\] (.*?) by (.*)$/);
    if (match) return { ts: match[1], action: match[2], user: match[3] };
    return { ts: '', action: entry, user: 'System' };
  }

  // =========================================================================
  // 4. STATS CALCULATION
  // =========================================================================

  function _updateStats() {
    try {
      let totalIn = 0;
      let totalOut = 0;
      _transactionsData.forEach(t => {
        if (t.type === 'IN') totalIn += (t.amount || 0);
        else if (t.type === 'OUT') totalOut += (t.amount || 0);
      });

      const totalBooking = getNum(getE('bkov-f-total'));
      const balance = totalBooking - totalIn;

      // Cập nhật Stats Cards trong tab Payment
      setVal(getE('bkov-pay-total'), formatNumber(totalBooking));
      setVal(getE('bkov-pay-paid'), formatNumber(totalIn));
      setVal(getE('bkov-pay-remain'), formatNumber(balance));
      setVal(getE('bkov-pay-total-in'), formatNumber(totalIn));
      setVal(getE('bkov-pay-total-out'), formatNumber(totalOut));
      setVal(getE('bkov-pay-balance'), formatNumber(totalIn - totalOut));

      // Cập nhật Header & Detail Tab
      setVal(getE('bkov-h-total'), formatNumber(totalBooking));
      setVal(getE('bkov-f-deposit'), formatNumber(totalIn));
      setVal(getE('bkov-f-balance'), formatNumber(balance));

      // Tự động cập nhật trạng thái booking dựa trên thanh toán
      if (_bookingData && _bookingData.status !== 'Hủy') {
        let newStatus = 'Đặt Lịch';
        if (totalIn >= totalBooking && totalBooking > 0) {
          newStatus = 'Thanh Toán';
        } else if (totalIn > 0) {
          newStatus = 'Đặt Cọc';
        }
        
        if (newStatus !== _bookingData.status) {
          setVal(getE('bkov-f-status'), newStatus);
          setVal(getE('bkov-h-status'), newStatus);
          _bookingData.status = newStatus;
        }
      }
    } catch (e) {
      Opps('BookingOverview._updateStats', e);
    }
  }

  // =========================================================================
  // 5. SERVICE TABLE LOGIC
  // =========================================================================

  function _addBkDetailRow(data) {
    const tbody = _rootEl.querySelector('#bkov-services-tbody');
    const fields = _currentStrategy.displayFields;
    const tr = document.createElement('tr');
    tr.dataset.id = data.id || `new_${Date.now()}`;
    tr.className = 'align-middle';

    let html = `<td>${tbody.children.length + 1}</td>`;
    fields.forEach((f) => {
      const schema = DB_SCHEMA[_currentStrategy.collection].fields.find((sf) => sf.name === f);
      const val = data[f] !== undefined ? data[f] : (schema?.initial || '');
      const hidden = schema?.class?.includes('d-none') ? 'd-none' : '';
      const isNumber = schema?.type === 'number' || schema?.class?.includes('number');
      const displayVal = isNumber ? formatNumber(val) : val;

      if (schema?.type === 'select' || schema?.tag === 'select') {
        html += `<td class="${hidden}">
          <select class="smart-select form-select-sm border-0 bg-transparent" data-field="${f}" 
                    data-source="${schema.dataSource || ''}" data-val="${val}"></select>
        </td>`;
      } else {
        html += `<td class="${hidden}">
          <input type="text" class="form-control form-control-sm border-0 bg-transparent ${isNumber ? 'text-end' : ''}" 
                 data-field="${f}" value="${displayVal}" data-val="${val}" ${schema?.attrs?.join(' ') || ''}>
        </td>`;
      }
    });

    html += `<td>
      <button class="btn btn-sm btn-outline-danger bkov-btn-del-row border-0" title="Xóa dòng"><i class="bi bi-trash"></i></button>
    </td>`;

    tr.innerHTML = html;
    tbody.appendChild(tr);
    _detailRowCount++;
  }

  function _onTypeChange(tr) {
    const type = getVal(tr.querySelector('[data-field="service_type"]'));
    const hotelSel = tr.querySelector('[data-field="hotel_name"]');
    const serviceSel = tr.querySelector('[data-field="service_name"]');

    if (hotelSel) {
      const source = type === 'Phòng' ? 'hotels' : 'APP_DATA.lists.locOther';
      hotelSel.setAttribute('data-source', source);
      hotelSel.value = '';
    }
    if (serviceSel) serviceSel.value = '';
  }

  function _onLocationChange(tr) {
    const type = getVal(tr.querySelector('[data-field="service_type"]'));
    const hotel = getVal(tr.querySelector('[data-field="hotel_name"]'));
    const serviceSel = tr.querySelector('[data-field="service_name"]');

    if (serviceSel) {
      let options = [];
      if (type === 'Phòng' && hotel) {
        options = APP_DATA.lists.hotelMatrix[hotel]?.slice(2) || [];
      } else if (type) {
        options = APP_DATA.lists.serviceMatrix[type] || [];
      }
      
      if (typeof serviceSel.setOptions === 'function') {
        serviceSel.setOptions(options);
      } else {
        serviceSel.setAttribute('data-options', JSON.stringify(options));
      }
      serviceSel.value = '';
    }
  }

  // =========================================================================
  // 6. CALCULATIONS
  // =========================================================================

  function _calcDetailRow(tr) {
    if (!tr || !_currentStrategy.calculateRow) return;
    _currentStrategy.calculateRow(tr);
    _calcServicesTotal();
  }

  function _calcServicesTotal() {
    let total = 0;
    const rows = _rootEl.querySelectorAll('#bkov-services-tbody tr');
    rows.forEach((tr) => {
      const val = getNum(tr.querySelector(`[data-field="${_currentStrategy.totalField}"]`));
      total += val;
    });

    const elSummary = getE('bkov-services-total');
    if (elSummary) elSummary.innerText = formatNumber(total);

    setVal(getE('bkov-f-total'), formatNumber(total));
    _updateStats();

    return total;
  }

  function _renderServiceSummary() {
    const container = getE('bkov-services-summary');
    if (!container) return;

    const total = _calcServicesTotal();
    const count = _rootEl.querySelectorAll('#bkov-services-tbody tr').length;

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center p-2 bg-light border rounded shadow-sm">
        <div><i class="fa-solid fa-layer-group me-2 text-secondary"></i><strong>Số lượng:</strong> ${count} dịch vụ</div>
        <div class="text-primary"><strong>Tổng cộng:</strong> <span class="fw-bold fs-5">${formatNumber(total)}</span> <small>VND</small></div>
      </div>
    `;
  }

  function _renderTransactions() {
    const container = getE('bkov-payment-list');
    if (!container) return;

    if (_transactionsData.length === 0) {
      container.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Chưa có giao dịch nào</td></tr>';
      return;
    }

    container.innerHTML = _transactionsData
      .map((t) => {
        const isIn = t.type === 'IN';
        return `
        <tr>
          <td>${formatDateVN(t.transaction_date)}</td>
          <td><span class="badge bg-${isIn ? 'success' : 'danger'}">${isIn ? 'THU' : 'CHI'}</span></td>
          <td class="text-end fw-bold ${isIn ? 'text-success' : 'text-danger'}">${formatNumber(t.amount)}</td>
          <td>${t.fund_source || '—'}</td>
          <td class="text-start">${t.description || ''}</td>
          <td><span class="badge bg-secondary bg-opacity-10 text-dark border">${t.status || 'Completed'}</span></td>
        </tr>`;
      })
      .join('');
  }

  // =========================================================================
  // 7. EVENT BINDING
  // =========================================================================

  function _bindEvents() {
    if (!_rootEl) return;

    const tbody = _rootEl.querySelector('#bkov-services-tbody');
    if (tbody) {
      tbody.addEventListener('change', (e) => {
        const tr = e.target.closest('tr');
        const field = e.target.dataset.field;
        if (field === 'service_type') _onTypeChange(tr);
        if (field === 'hotel_name') _onLocationChange(tr);
        _calcDetailRow(tr);
      });
    }

    _rootEl.addEventListener('click', _handleClick);

    _rootEl.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', _handleDetailChange);
    });
  }

  async function _handleClick(e) {
    const target = e.target.closest('button, a');
    if (!target) return;

    const action = target.dataset.action || target.id;

    try {
      switch (action) {
        case 'bkov-btn-save-all':
          await _saveBkOverview();
          break;
        case 'bkov-btn-save-tab':
          const activeTab = _rootEl.querySelector('.nav-link.active').id.replace('bkov-tab-', '');
          await _saveTab(activeTab);
          break;
        case 'bkov-btn-reload-tab':
          const activeTabReload = _rootEl.querySelector('.nav-link.active').id.replace('bkov-tab-', '');
          await _reloadTab(activeTabReload);
          break;
        case 'bkov-btn-add-service':
          _addBkDetailRow({});
          break;
        case 'bkov-btn-add-trans':
          await _openTransactionForm();
          break;
        case 'bkov-btn-add-note':
          _addInternalNote();
          break;
        case 'bkov-btn-close':
          close();
          break;
        case 'bkov-btn-del-row':
          const tr = target.closest('tr');
          if (await confirmA('Xác nhận xóa dòng dịch vụ này?')) {
            tr.remove();
            _calcServicesTotal();
          }
          break;
        
        case 'confirm-email':
          await _handleMenuAction('confirm-email');
          break;
        case 'create-contract':
          await _handleMenuAction('create-contract');
          break;
        case 'update-payment':
          await _openTransactionForm();
          break;
        case 'recalc-total':
          _calcServicesTotal();
          logA('Đã tính toán lại toàn bộ số liệu.', 'success');
          break;
        case 'export-pdf':
          await _handleMenuAction('export-pdf');
          break;
      }
    } catch (err) {
      Opps('BookingOverview._handleClick', err);
    }
  }

  function _handleDetailChange(e) {
    const el = e.target;
    el.classList.add('is-dirty');
    const tabPane = el.closest('.tab-pane');
    if (tabPane) {
      const tabId = tabPane.id.replace('bkov-pane-', '');
      const tabBtn = getE(`bkov-tab-${tabId}`);
      if (tabBtn) tabBtn.classList.add('text-danger', 'fw-bold');
    }
  }

  async function _handleMenuAction(action) {
    try {
      if (!window.SalesModule) {
        await import('./M_SalesModule.js');
      }

      // Đồng bộ dữ liệu từ modal vào SalesModule.State để các hàm SalesModule hoạt động đúng
      SalesModule.State.currentBookingData = {
        bookings: _bookingData,
        customer: _customerData,
        booking_details: _detailsData
      };

      switch (action) {
        case 'confirm-email':
          await SalesModule.Confirmation.openModal(_bookingId);
          break;
        case 'create-contract':
          await SalesModule.Logic.createContract();
          break;
        case 'export-pdf':
          await SalesModule.Confirmation.exportPDF();
          break;
      }
    } catch (e) {
      Opps('BookingOverview._handleMenuAction', e);
    }
  }

  // =========================================================================
  // 8. CRUD OPERATIONS
  // =========================================================================

  async function _saveTab(tabKey) {
    try {
      showLoading(true);
      let result = false;

      switch (tabKey) {
        case 'detail': result = await _saveBookingInfo(); break;
        case 'customer': result = await _saveCustomerInfo(); break;
        case 'services': result = await _saveServicesInfo(); break;
        case 'notes': result = await _saveBookingInfo(); break;
        default:
          logA(`Tab ${tabKey} không hỗ trợ lưu riêng biệt.`, 'warning');
          return;
      }

      if (result) {
        logA(`Lưu dữ liệu tab ${tabKey} thành công!`, 'success');
        const tabBtn = getE(`bkov-tab-${tabKey}`);
        if (tabBtn) tabBtn.classList.remove('text-danger', 'fw-bold');
      }
    } catch (e) {
      Opps(`BookingOverview._saveTab(${tabKey})`, e);
    } finally {
      showLoading(false);
    }
  }

  async function _reloadTab(tabKey) {
    try {
      showLoading(true);
      const colls = [];
      if (tabKey === 'detail' || tabKey === 'notes') colls.push('bookings');
      if (tabKey === 'customer') colls.push('customers');
      if (tabKey === 'services') colls.push(_currentStrategy.collection);
      if (tabKey === 'payment') colls.push('transactions');

      if (colls.length > 0) {
        await A.DB.loadCollections(colls, { forceNew: true });
        await _loadData(_bookingId);
        _populateAll();
        logA(`Đã tải lại dữ liệu mới nhất cho tab ${tabKey}`, 'success');
      }
    } catch (e) {
      Opps(`BookingOverview._reloadTab(${tabKey})`, e);
    } finally {
      showLoading(false);
    }
  }

  async function _saveBookingInfo() {
    const pane = getE('bkov-pane-detail');
    const notePane = getE('bkov-pane-notes');
    const updates = HD.getFormData(pane, 'bookings', true);
    const noteUpdates = HD.getFormData(notePane, 'bookings', true);
    const finalUpdates = { ...updates, ...noteUpdates };
    if (Object.keys(finalUpdates).length <= 1) return true;
    await A.DB.batchSave('bookings', [finalUpdates]);
    return true;
  }

  async function _saveCustomerInfo() {
    const pane = getE('bkov-pane-customer');
    const updates = HD.getFormData(pane, 'customers', true);
    if (Object.keys(updates).length <= 1) return true;
    await A.DB.batchSave('customers', [updates]);
    return true;
  }

  async function _saveServicesInfo() {
    const rows = _rootEl.querySelectorAll('#bkov-services-tbody tr');
    const updates = [];
    rows.forEach(tr => {
      const rowData = HD.getFormData(tr, _currentStrategy.collection, true);
      if (Object.keys(rowData).length > 1) updates.push(rowData);
    });
    if (updates.length > 0) await A.DB.batchSave(_currentStrategy.collection, updates);
    return true;
  }

  async function _saveBkOverview() {
    try {
      showLoading(true);
      await Promise.all([_saveBookingInfo(), _saveCustomerInfo(), _saveServicesInfo()]);
      logA('Lưu toàn bộ dữ liệu thành công!', 'success');
      _rootEl.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('text-danger', 'fw-bold'));
    } catch (e) {
      Opps('BookingOverview._saveBkOverview', e);
    } finally {
      showLoading(false);
    }
  }

  // =========================================================================
  // 9. OTHER ACTIONS
  // =========================================================================

  async function _openTransactionForm() {
    try {
      const mod = await import('@acc/controller_accountant.js');
      const AccountantCtrl = mod.default || window.AccountantCtrl;
      if (AccountantCtrl?.openTransactionModal) {
        const type = window.CURRENT_USER?.role === 'op' ? 'OUT' : 'IN';
        const relatedId = _currentStrategy.role === 'op' ? _detailsData[0]?.id || _bookingId : _bookingId;
        await AccountantCtrl.openTransactionModal({
          type: type,
          booking_id: relatedId,
          description: `Thanh toán cho Booking ${_bookingId}`,
          onSuccess: () => _reloadTab('payment')
        });
      }
    } catch (e) {
      Opps('Lỗi mở modal giao dịch: ', e);
    }
  }

  function _addInternalNote() {
    const input = getE('bkov-note-input');
    if (!input || !input.value.trim()) return;
    const entry = `[${formatDateVN(new Date(), true)}] ${input.value.trim()} - ${window.CURRENT_USER?.user_name || 'User'}`;
    if (_bookingId && A.DB) {
      A.DB.arrayUnionField('bookings', _bookingId, 'note_internal', entry).then(() => {
        if (_bookingData) {
          if (!Array.isArray(_bookingData.note_internal)) _bookingData.note_internal = [];
          _bookingData.note_internal.push(entry);
        }
        _renderInternalNotes();
        input.value = '';
      }).catch(e => Opps('Lỗi lưu ghi chú: ', e));
    }
  }

  function _initStateProxy() {
    if (!window.StateProxy || !_bookingData) return;
    StateProxy.clearSession();
    if (_bookingData.id) StateProxy.beginEdit('bookings', _bookingData.id);
    if (_customerData?.id) StateProxy.beginEdit('customers', _customerData.id);
    _detailsData.forEach(row => row?.id && StateProxy.beginEdit(_currentStrategy.collection, row.id));
  }

  function _sortDetails(detailsArr) {
    const priority = { 'Vé MB': 1, 'Vé Tàu': 2, Phòng: 3, Xe: 4 };
    return [...detailsArr].sort((a, b) => {
      const pa = priority[a.service_type] || 99;
      const pb = priority[b.service_type] || 99;
      return pa !== pb ? pa - pb : (a.check_in || '').localeCompare(b.check_in || '');
    });
  }

  function _switchTab(tabKey) {
    const btn = getE(`bkov-tab-${tabKey}`);
    if (btn) bootstrap.Tab.getOrCreateInstance(btn).show();
  }

  function _reset() {
    _bookingId = null; _bookingData = null; _customerData = null;
    _detailsData = []; _transactionsData = []; _detailRowCount = 0;
    _rootEl = null; _modalRef = null; _currentStrategy = null;
  }

  return { open, close, getData };
})();

export default BookingOverviewController;
