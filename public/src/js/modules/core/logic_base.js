/**
 * LogicBase - Lớp cơ sở quản lý logic nghiệp vụ dùng chung cho toàn hệ thống ERP.
 * Chuyển đổi từ logic_base.js sang cấu trúc ES6 Class.
 */
export default class LogicBase {
  // =========================================================================
  // PROPERTIES (STATIC)
  // =========================================================================
  static GRID_COLS = [];
  static GRID_STATE = {
    currentTable: '',
    sourceData: [],
    filteredData: [],
    displayData: [],
    sort: {
      column: '',
      dir: 'desc',
    },
  };
  static CURRENT_BATCH_DATA = [];
  static SORT_STATE = LogicBase.GRID_STATE.sort;

  // Biến nội bộ dùng cho retry logic và search throttle
  static retryCount = 0;
  static MAX_RETRIES = 3;
  static RETRY_DELAY = 2000;
  static _lastSearchClickTime = 0;
  static _GAS_SECRETS = null;

  // =========================================================================
  // METHODS (STATIC)
  // =========================================================================

  static handleDashClick(idVal, isServiceId) {
    LogicBase.onGridRowClick(idVal);
  }

  static copyRow(sourceRow) {
    try {
      const tbody = getE('detail-tbody'),
        rows = tbody.querySelectorAll('tr');
      if (rows.length === 0) return SYS.runFnByRole(addDetailRow, 'UI');
      const lastRow = sourceRow || rows[rows.length - 1],
        gV = (f) => getVal(`[data-field="${f}"]`, lastRow);
      const rowData = {
        id: '',
        service_type: gV('service_type'),
        hotel_name: gV('hotel_name'),
        service_name: gV('service_name'),
        check_in: gV('check_in'),
        check_out: gV('check_out'),
        quantity: gV('quantity'),
        unit_price: gV('unit_price'),
        child_qty: gV('child_qty'),
        child_price: gV('child_price'),
        surcharge: gV('surcharge'),
        discount: gV('discount'),
        ref_code: gV('ref_code'),
        note: gV('note'),
      };
      SYS.runFnByRole(addDetailRow, 'UI', rowData);
    } catch (e) {}
  }

  static async findBookingInLocal(id, collection = 'bookings') {
    try {
      if (!id) return null;
      const local = A.DB.local;
      let role = CURRENT_USER.role,
        detailsSource = role === 'op' ? 'operator_entries' : 'booking_details';

      // 1. Tìm booking chính
      let bookingData = await local.get(collection, id);
      let detailsData = [];

      // 2. Nếu không thấy booking, thử tìm id trong bảng details (có thể user nhập detail ID)
      if (!bookingData && collection !== 'bookings') {
        const detailHit = await local.get(detailsSource, id);
        if (detailHit) {
          const bookingId = detailHit.booking_id;
          if (bookingId) {
            bookingData = await local.get('bookings', bookingId);
          }
        }
      }

      if (!bookingData) return null;

      // 3. Lấy tất cả details liên quan đến booking này
      const bookingId = bookingData.id;
      detailsData = await local.find(detailsSource, 'booking_id', bookingId);

      // 4. Lấy thông tin khách hàng
      let phoneRaw = bookingData.customer_phone;
      const phone = phoneRaw ? String(phoneRaw).replace(/^'/, '').trim() : '';
      let custRow = null;
      if (phone !== '') {
        const customers = await local.find('customers', 'phone', phone);
        custRow = customers.length > 0 ? customers[0] : null;
      }

      return { success: true, bookings: bookingData, [detailsSource]: detailsData, customer: custRow, source: 'local' };
    } catch (e) {
      L.log('findBookingInLocal Error:', e);
      return null;
    } finally {
      showLoading(false);
    }
  }

  static openBatchEdit(dataList, title) {
    LogicBase.CURRENT_BATCH_DATA = JSON.parse(JSON.stringify(dataList));
    A.UI.activateTab('tab-form');
    setClass('btn-save-group', 'd-none', true);
    setClass('btn-save-batch', 'd-none', false);
    LogicBase.refreshForm();
    const tbody = getE('detail-tbody');
    if (tbody) tbody.innerHTML = '';

    if (typeof SYS.runFnByRole === 'function') SYS.runFnByRole('addDetailRow', 'UI', LogicBase.CURRENT_BATCH_DATA);
  }

  static refreshForm() {
    getE('main-form').reset();
    getE('detail-tbody').innerHTML = '';
    if (window.SalesModule) window.SalesModule.State.detailRowCount = 0;
    if (window.Op) window.Op.State.detailRowCount = 0;
    const today = new Date();
    ['BK_Date', 'BK_Start', 'BK_End'].forEach((id) => (getE(id).valueAsDate = today));
    setVal('BK_Staff', CURRENT_USER.uid);
  }

  static reverseDetailsRows() {
    const tbody = getE('detail-tbody');
    if (!tbody || tbody.rows.length < 2) return;
    const rows = Array.from(tbody.rows).reverse();
    rows.forEach((row) => tbody.appendChild(row));
    LogicBase._reindexTableRows(tbody);
  }

  static _reindexTableRows(tbodyObj) {
    Array.from(tbodyObj.rows).forEach((row, i) => {
      row.id = `row-${i + 1}`;
      if (row.cells[0]) row.cells[0].innerText = i + 1;
      const delIcon = row.querySelector('i.fa-times');
      if (delIcon) delIcon.setAttribute('onclick', `SYS.runFnByRole('removeRow', 'UI', ${i})`);
    });
  }

  static _cleanModeFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    window.history.replaceState({}, '', url.toString());
  }

  static applyModeFromUrl() {
    const modeParam = new URLSearchParams(window.location.search).get('mode');
    if (!modeParam) return false;
    const modeCode = modeParam.toUpperCase();
    LogicBase._cleanModeFromUrl();
    if (!['SALE', 'OPERATOR', 'ACC'].includes(modeCode)) return false;
    LogicBase.reloadSystemMode(modeCode);
    return true;
  }

  static reloadSystemMode(modeCode) {
    const user = A.getState('user');
    let realRole;
    if (user) realRole = user.role;
    localStorage.setItem('erp-mock-role', JSON.stringify({ realRole: realRole, maskedRole: modeCode }));
    A.DB.stopNotificationsListener();
    window.location.reload();
  }

  static handleServerError(err) {
    LogicBase.handleRetry(err.message);
  }

  static handleRetry(reason) {
    if (LogicBase.retryCount < LogicBase.MAX_RETRIES) {
      LogicBase.retryCount++;
      setTimeout(LogicBase.loadDataFromFirebase, LogicBase.RETRY_DELAY);
    } else {
      showLoading(false);
    }
  }

  static handleBookingSearch(bkId) {
    const SEARCH_THROTTLE_MS = () => window.A?.getConfig?.('search_throttle_ms') ?? 500;
    const now = Date.now();
    if (now - LogicBase._lastSearchClickTime < SEARCH_THROTTLE_MS()) return;
    LogicBase._lastSearchClickTime = now;
    const searchInput = getE('booking-search'),
      k = String(bkId || searchInput?.value || '').trim();
    if (!k) return;
    try {
      const bookingsObj = Object.values(APP_DATA.bookings || {});
      if (!bookingsObj.length) return;
      const norm = (s) =>
          String(s ?? '')
            .toLowerCase()
            .trim(),
        kText = norm(k),
        kPhone = String(k).replace(/\D+/g, '');
      const results = bookingsObj
        .filter((row) => {
          if (!row) return false;
          return norm(row.id).includes(kText) || norm(row.customer_full_name).includes(kText) || (kPhone && String(row.customer_phone).includes(kPhone));
        })
        .sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
      if (!results.length) return;
      const topResults = results.slice(0, 10);
      if (topResults.length === 1) {
        if (bkId) return LogicBase.onGridRowClick(topResults[0].id);
        logA(`Load booking ${topResults[0].id}?`, 'info', () => {
          LogicBase.onGridRowClick(topResults[0].id);
          searchInput.value = '';
        });
        return;
      }
      LogicBase._populateSearchDatalist(topResults, searchInput);
    } catch (error) {}
  }

  static initGlobalTableSearch(inputId = 'global-search') {
    const searchInput = getE(inputId);
    if (!searchInput) return;
    let debounceTimer;
    searchInput.oninput = (e) => {
      clearTimeout(debounceTimer);
      const searchTerm = e.target.value.trim().toLowerCase();
      debounceTimer = setTimeout(() => {
        document.querySelectorAll('table tbody tr').forEach((row) => {
          row.style.display = row.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
      }, 300);
    };
  }

  static _populateSearchDatalist(results, inputElement) {
    if (!inputElement) return;
    let datalist = getE('search-bookings-datalist');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'search-bookings-datalist';
      document.body.appendChild(datalist);
      inputElement.setAttribute('list', 'search-bookings-datalist');
    }
    datalist.innerHTML = results.map((r) => `<option value="${r.id}">${r.id} - ${r.customer_full_name || 'N/A'}</option>`).join('');
    inputElement.onchange = function () {
      if (results.find((r) => r.id === this.value)) {
        LogicBase.onGridRowClick(this.value);
        this.value = '';
      }
    };
  }

  static async deleteItem(id, dataSource = 'booking_details') {
    if (!id) return;
    logA(`Xóa vĩnh viễn ID: ${id}?`, 'danger', async () => {
      if (await A.DB.deleteRecord(dataSource, id)) {
        if (CURRENT_CTX_ROW) {
          CURRENT_CTX_ROW.remove();
          CURRENT_CTX_ROW = null;
        }
      }
    });
  }

  static handleServerData(data) {
    showLoading(false);
    if (!data) return;
    try {
      if (typeof A.UI.initBtnSelectDataList === 'function') A.UI.initBtnSelectDataList(data);
    } catch (e) {}
    UI_DASH.initDashboard();
  }

  static async loadDataFromFirebase(silent = false) {
    if (LogicBase.retryCount > 0) showLoading(true, `Thử lại (${LogicBase.retryCount}/${LogicBase.MAX_RETRIES})...`);
    try {
      const loadedData = await A.DB.loadAllData();
      if (!loadedData) {
        LogicBase.handleRetry('DB chưa sẵn sàng');
        return;
      }
      LogicBase.retryCount = 0;
    } catch (error) {
      LogicBase.handleServerError(error);
    }
  }

  static async loadModule_Accountant() {
    try {
      const appContent = document.querySelector('.app-content');
      if (appContent) appContent.innerHTML = 'Đang tải...';
      const response = await fetch('/accountant/tpl_accountant.html');
      if (appContent) appContent.innerHTML = await response.text();
      if (!getE('css-accountant')) {
        const link = document.createElement('link');
        link.id = 'css-accountant';
        link.rel = 'stylesheet';
        link.href = '@acc/accountant.css';
        document.head.appendChild(link);
      }
      const module = await import('@acc/controller_accountant.js');
      if (module.default?.init) await module.default.init();
    } catch (error) {}
  }

  static async openSettingsModal() {
    try {
      await A.UI.renderTemplate('body', 'tmpl-download-library');
      await A.Modal.render(getE('tmpl-settings-form'), 'Cài Đặt Chung', { size: 'modal-xl' });
      await A.Modal.show(
        null,
        null,
        async (e, target) => {
          await LogicBase.saveBasicSettings(e, target);
        },
        () => THEME_MANAGER.resetToDefault(true)
      );
      await LogicBase.initSettingsTab();
      if (THEME_MANAGER) {
        THEME_MANAGER.fillSettingsForm();
        THEME_MANAGER.setupColorSync();
      }
    } catch (e) {}
  }

  static async initSettingsTab() {
    try {
      const colSelect = getE('st-sync-collection');
      if (colSelect && typeof APP_DATA !== 'undefined')
        fillSelect(
          'st-sync-collection',
          Object.keys(APP_DATA).filter((k) => !k.includes('_by_') && !k.includes('lists')),
          '-- Chọn --'
        );
      const dashConfig = localStorage.getItem('dashTables') ? JSON.parse(localStorage.getItem('dashTables')) : null;
      if (dashConfig) {
        for (let i = 1; i <= 4; i++) {
          const el = getE(`st-dash-table-${i}`);
          if (el) el.value = dashConfig[`table${i}`] || '';
        }
        UI_DASH.initDashboard(dashConfig);
      }
      LogicBase.handleDashTableChange();
    } catch (e) {}
  }

  static handleDashTableChange(el) {
    const selects = $$('.st-dash-table'),
      selectedValues = selects.map((s) => s.value).filter((v) => v !== '');
    selects.forEach((s) => {
      Array.from(s.options).forEach((opt) => {
        if (opt.value === '') return;
        const isUsed = selectedValues.includes(opt.value) && opt.value !== s.value;
        opt.disabled = isUsed;
        opt.style.display = isUsed ? 'none' : 'block';
      });
    });
  }

  static async saveBasicSettings(e, target) {
    const btn = e?.target || target?.querySelector('.btn-save') || getE('btn-save-modal');
    if (btn) setBtnLoading(btn, true, 'Đang lưu...');
    let dash_tables = {
      table1: getVal('st-dash-table-1') || '',
      table2: getVal('st-dash-table-2') || '',
      table3: getVal('st-dash-table-3') || '',
      table4: getVal('st-dash-table-4') || '',
    };
    localStorage.setItem('dashTables', JSON.stringify(dash_tables));
    UI_DASH.initDashboard(dash_tables);
    setTimeout(() => {
      if (btn) setBtnLoading(btn, false, 'Lưu Cài Đặt');
      A.Modal.hide();
      A.UI.activateTab('tab-dashboard');
    }, 500);
  }

  static async onGridRowClick(id, collection = 'bookings') {
    if (!id) return;
    showLoading(true);

    try {
      const localResult = await LogicBase.findBookingInLocal(id, collection);
      if (localResult) {
        SYS.runFnByRole('fillFormFromSearch', 'UI', localResult);
        return;
      }
      await A.DB.syncDelta(collection);
      const retryResult = await LogicBase.findBookingInLocal(id, collection);
      if (retryResult) {
        SYS.runFnByRole('fillFormFromSearch', 'UI', retryResult);
      } else {
        L._('onGridRowClick: Data still not found after Firebase load', id, 'warning');
      }
    } catch (e) {
      Opps('onGridRowClick Error:', e);
    } finally {
      showLoading(false);
    }
  }

  static async _callServer(funcName, ...args) {
    const reqId = `CS_${Date.now().toString().slice(-6)}`;

    // Debug log
    const dbg = (msg, data) => {
      if (typeof LOG_CFG !== 'undefined' && LOG_CFG.ENABLE) L._(msg, data || '');
    };

    dbg(`[${reqId}] 🚀 CALL -> ${funcName}`, args);

    try {
      // 1. Tải Config (Singleton)
      if (!LogicBase._GAS_SECRETS) {
        const doc = await A.DB.getCollection('app_config', 'app_secrets');
        if (!doc) throw new Error('Missing app_secrets');
        LogicBase._GAS_SECRETS = doc;
      }
      if (funcName.endsWith('API')) {
        funcName = funcName.slice(0, -3);
      }

      // 2. Chuẩn bị Payload
      const finalPayload = args.length === 1 ? args[0] : args;
      const requestBody = {
        api_key: LogicBase._GAS_SECRETS.gas_app_secret,
        mode: typeof CURRENT_USER !== 'undefined' && CURRENT_USER?.role ? CURRENT_USER.role : 'guest',
        action: funcName,
        payload: finalPayload,
      };

      // 3. Gọi Fetch
      const response = await fetch(LogicBase._GAS_SECRETS.gas_app_url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },

        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const res = await response.json();

      return res;
    } catch (err) {
      const errMsg = err.message || String(err);
      dbg(`❌ [${reqId}] CALL ERROR: ${errMsg}`);
      throw err;
    } finally {
      dbg(`[${reqId}] ✅ CALL COMPLETE: ${funcName}`);
    }
  }

  static async requestAPI(funcName, ...args) {
    showLoading(true, 'Đang xử lý...');

    try {
      const res = await LogicBase._callServer(funcName, ...args);

      // 1. Trường hợp Server trả về void (undefined) hoặc null
      if (res === undefined || res === null) {
        L._('Server đã chạy xong ko trả kết quả: ', funcName);
        return null;
      }
      // 2. Chuẩn hóa logic Success/Fail
      let isSuccess = false;
      if ('success' in res) isSuccess = res.success === true;
      else if ('status' in res) isSuccess = res.status === true || res.status === 200;
      else return res; // Data thô -> Trả về luôn

      // 3. Hiển thị thông báo (nếu có)
      if (res.message) logA(res.message, isSuccess ? 'success' : 'warning');

      // 4. LOGIC TRẢ VỀ DỮ LIỆU (TỐI ƯU MỚI)
      if (isSuccess) {
        const { success, status, code, error, ...payload } = res;
        if (payload.data === undefined) payload.data = {};
        return payload;
      } else {
        if (res.status !== 200 || res.error) {
          L._(`❌ API Error [${res.status || 'UNKNOWN'}]:`, res.error || res.message, 'error');
        }
        return null;
      }
    } catch (err) {
      const errMsg = err.message || String(err);
      Opps(errMsg, err);
      return null;
    } finally {
      showLoading(false);
    }
  }

  static reloadPage(forceUpdate = false, url = null) {
    try {
      if (typeof A !== 'undefined' && A?.DB?.stopNotificationsListener) {
        A.DB.stopNotificationsListener();
      }
    } catch (e) {
      console.warn('[reloadPage] stopNotificationsListener error:', e);
    }

    if (url) {
      if (forceUpdate) {
        const separator = url.includes('?') ? '&' : '?';
        window.location.href = `${url}${separator}_cb=${Date.now()}`;
      } else {
        window.location.href = url;
      }
    } else {
      if (forceUpdate) {
        const currentUrl = window.location.href.split('?')[0];
        const hash = window.location.hash || '';
        window.location.href = `${currentUrl}?_cb=${Date.now()}${hash}`;
      } else {
        window.location.reload();
      }
    }
  }
}

// =========================================================================
// LEGACY COMPATIBILITY (Gán ngược ra window)
// =========================================================================
window.GRID_COLS = LogicBase.GRID_COLS;
window.GRID_STATE = LogicBase.GRID_STATE;
window.CURRENT_BATCH_DATA = LogicBase.CURRENT_BATCH_DATA;
window.SORT_STATE = LogicBase.SORT_STATE;

window.handleDashClick = LogicBase.handleDashClick;
window.copyRow = LogicBase.copyRow;
window.findBookingInLocal = LogicBase.findBookingInLocal;
window.openBatchEdit = LogicBase.openBatchEdit;
window.refreshForm = LogicBase.refreshForm;
window.reverseDetailsRows = LogicBase.reverseDetailsRows;
window._reindexTableRows = LogicBase._reindexTableRows;
window._cleanModeFromUrl = LogicBase._cleanModeFromUrl;
window.applyModeFromUrl = LogicBase.applyModeFromUrl;
window.reloadSystemMode = LogicBase.reloadSystemMode;
window.handleServerError = LogicBase.handleServerError;
window.handleRetry = LogicBase.handleRetry;
window.handleBookingSearch = LogicBase.handleBookingSearch;
window.initGlobalTableSearch = LogicBase.initGlobalTableSearch;
window._populateSearchDatalist = LogicBase._populateSearchDatalist;
window.deleteItem = LogicBase.deleteItem;
window.handleServerData = LogicBase.handleServerData;
window.loadDataFromFirebase = LogicBase.loadDataFromFirebase;
window.loadModule_Accountant = LogicBase.loadModule_Accountant;
window.openSettingsModal = LogicBase.openSettingsModal;
window.initSettingsTab = LogicBase.initSettingsTab;
window.handleDashTableChange = LogicBase.handleDashTableChange;
window.saveBasicSettings = LogicBase.saveBasicSettings;
window.onGridRowClick = LogicBase.onGridRowClick;
window._callServer = LogicBase._callServer;
window.requestAPI = LogicBase.requestAPI;
window.reloadPage = LogicBase.reloadPage;
