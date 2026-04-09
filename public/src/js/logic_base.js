var GRID_COLS = [];
// var LAST_FILTER_SIGNATURE = null;

// =========================================================================
// TRẠNG THÁI QUẢN LÝ DỮ LIỆU TẬP TRUNG (GRID_STATE)
// =========================================================================
var GRID_STATE = {
  currentTable: '',
  sourceData: [],
  filteredData: [],
  displayData: [],

  // filter: {
  //   keyword: '',
  //   column: '',
  //   dateFrom: '',
  //   dateTo: '',
  // },

  sort: {
    column: '',
    dir: 'desc',
  },

  // pagination: {
  //   currentPage: 1,
  //   limit: window.A?.getConfig?.('table_page_size') ?? 50,
  //   totalPages: 0,
  // },
};

// Legacy compatibility
// var PG_STATE = GRID_STATE.pagination;
var SORT_STATE = GRID_STATE.sort;
// var PG_DATA = [];
// var FILTER_ACTIVE = false;

function handleDashClick(idVal, isServiceId) {
  onGridRowClick(idVal);
}

window.copyRow = (sourceRow) => {
  try {
    const tbody = getE('detail-tbody'),
      rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return runFnByRole(addDetailRow, 'UI');
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
    runFnByRole(addDetailRow, 'UI', rowData);
  } catch (e) {}
};

async function findBookingInLocal(id, collection = 'bookings') {
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

async function updateTableData(collection, fullData) {
  if (!collection) collection = getVal('btn-select-datalist');
  fullData = await A.DB.local.getCollection(collection);
  A.UI.createTable('tab-data-tbl', { colName: collection, data: fullData });
  setVal('btn-select-datalist', collection);
}

var CURRENT_BATCH_DATA = [];
function openBatchEdit(dataList, title) {
  CURRENT_BATCH_DATA = JSON.parse(JSON.stringify(dataList));
  activateTab('tab-form');
  setClass('btn-save-group', 'd-none', true);
  setClass('btn-save-batch', 'd-none', false);
  refreshForm();
  const tbody = getE('detail-tbody');
  if (tbody) tbody.innerHTML = '';

  if (typeof runFnByRole === 'function') runFnByRole('addDetailRow', 'UI', CURRENT_BATCH_DATA);
}

function refreshForm() {
  getE('main-form').reset();
  getE('detail-tbody').innerHTML = '';
  if (window.SalesModule) window.SalesModule.State.detailRowCount = 0;
  if (window.Op) window.Op.State.detailRowCount = 0;
  const today = new Date();
  ['BK_Date', 'BK_Start', 'BK_End'].forEach((id) => (getE(id).valueAsDate = today));
  setVal('BK_Staff', CURRENT_USER.uid);
}

function reverseDetailsRows() {
  const tbody = getE('detail-tbody');
  if (!tbody || tbody.rows.length < 2) return;
  const rows = Array.from(tbody.rows).reverse();
  rows.forEach((row) => tbody.appendChild(row));
  _reindexTableRows(tbody);
}

function _reindexTableRows(tbodyObj) {
  Array.from(tbodyObj.rows).forEach((row, i) => {
    row.id = `row-${i + 1}`;
    if (row.cells[0]) row.cells[0].innerText = i + 1;
    const delIcon = row.querySelector('i.fa-times');
    if (delIcon) delIcon.setAttribute('onclick', `runFnByRole('removeRow', 'UI', ${i})`);
  });
}

function clearLocalCache() {
  if (!confirm('Xóa Local Cache?')) return;
  localStorage.clear();
  A.DB.stopNotificationsListener();
  setTimeout(() => reloadPage(true), 1000);
}

function _cleanModeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.history.replaceState({}, '', url.toString());
}

function applyModeFromUrl() {
  const modeParam = new URLSearchParams(window.location.search).get('mode');
  if (!modeParam) return false;
  const modeCode = modeParam.toUpperCase();
  _cleanModeFromUrl();
  if (!['SALE', 'OPERATOR', 'ACC'].includes(modeCode)) return false;
  reloadSystemMode(modeCode);
  return true;
}

function reloadSystemMode(modeCode) {
  const user = A.getState('user');
  let realRole;
  if (user) realRole = user.role;
  localStorage.setItem('erp-mock-role', JSON.stringify({ realRole: realRole, maskedRole: modeCode }));
  A.DB.stopNotificationsListener();
  window.location.reload();
}

function handleServerError(err) {
  handleRetry(err.message);
}

function handleRetry(reason) {
  if (retryCount < MAX_RETRIES) {
    retryCount++;
    setTimeout(loadDataFromFirebase, RETRY_DELAY);
  } else {
    showLoading(false);
  }
}

let _lastSearchClickTime = 0;
const SEARCH_THROTTLE_MS = () => window.A?.getConfig?.('search_throttle_ms') ?? 500;

function handleBookingSearch(bkId) {
  const now = Date.now();
  if (now - _lastSearchClickTime < SEARCH_THROTTLE_MS()) return;
  _lastSearchClickTime = now;
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
      if (bkId) return onGridRowClick(topResults[0].id);
      logA(`Load booking ${topResults[0].id}?`, 'info', () => {
        onGridRowClick(topResults[0].id);
        searchInput.value = '';
      });
      return;
    }
    _populateSearchDatalist(topResults, searchInput);
  } catch (error) {}
}

function initGlobalTableSearch(inputId = 'global-search') {
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

function _populateSearchDatalist(results, inputElement) {
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
      onGridRowClick(this.value);
      this.value = '';
    }
  };
}

async function deleteItem(id, dataSource = 'booking_details') {
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

function handleServerData(data) {
  showLoading(false);
  if (!data) return;
  try {
    if (typeof A.UI.initBtnSelectDataList === 'function') A.UI.initBtnSelectDataList(data);
  } catch (e) {}
  // if (typeof initFilterUI === 'function') initFilterUI();
  initDashboard();
}

async function loadDataFromFirebase(silent = false) {
  if (retryCount > 0) showLoading(true, `Thử lại (${retryCount}/${MAX_RETRIES})...`);
  try {
    const loadedData = await A.DB.loadAllData();
    if (!loadedData) {
      handleRetry('DB chưa sẵn sàng');
      return;
    }
    retryCount = 0;
  } catch (error) {
    handleServerError(error);
  }
}

async function loadModule_Accountant() {
  try {
    const appContent = document.querySelector('.app-content');
    if (appContent) appContent.innerHTML = 'Đang tải...';
    const response = await fetch('/accountant/tpl_accountant.html');
    if (appContent) appContent.innerHTML = await response.text();
    if (!getE('css-accountant')) {
      const link = document.createElement('link');
      link.id = 'css-accountant';
      link.rel = 'stylesheet';
      link.href = '/accountant/accountant.css';
      document.head.appendChild(link);
    }
    const module = await import('../../accountant/controller_accountant.js');
    if (module.default?.init) await module.default.init();
  } catch (error) {}
}

async function openSettingsModal() {
  try {
    await A.UI.renderTemplate('body', 'tmpl-download-library');
    await A.Modal.render(getE('tmpl-settings-form'), 'Cài Đặt Chung', { size: 'modal-xl' });
    await A.Modal.show(
      null,
      null,
      async (e, target) => {
        await saveBasicSettings(e, target);
      },
      () => THEME_MANAGER.resetToDefault(true)
    );
    await initSettingsTab();
    if (THEME_MANAGER) {
      THEME_MANAGER.fillSettingsForm();
      THEME_MANAGER.setupColorSync();
    }
  } catch (e) {}
}

async function initSettingsTab() {
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
      initDashboard(dashConfig);
    }
    handleDashTableChange();
  } catch (e) {}
}

function handleDashTableChange(el) {
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

async function saveBasicSettings(e, target) {
  const btn = e?.target || target?.querySelector('.btn-save') || getE('btn-save-modal');
  if (btn) setBtnLoading(btn, true, 'Đang lưu...');
  let dash_tables = { table1: getVal('st-dash-table-1') || '', table2: getVal('st-dash-table-2') || '', table3: getVal('st-dash-table-3') || '', table4: getVal('st-dash-table-4') || '' };
  localStorage.setItem('dashTables', JSON.stringify(dash_tables));
  initDashboard(dash_tables);
  setTimeout(() => {
    if (btn) setBtnLoading(btn, false, 'Lưu Cài Đặt');
    A.Modal.hide();
    activateTab('tab-dashboard');
  }, 500);
}

async function onGridRowClick(id, collection = 'bookings') {
  if (!id) return;
  showLoading(true);

  try {
    const localResult = await findBookingInLocal(id, collection);
    if (localResult) {
      runFnByRole('fillFormFromSearch', 'UI', localResult);
      return;
    }
    await A.DB.syncDelta(collection);
    const retryResult = await findBookingInLocal(id, collection);
    if (retryResult) {
      runFnByRole('fillFormFromSearch', 'UI', retryResult);
    } else {
      L._('onGridRowClick: Data still not found after Firebase load', id, 'warning');
    }
  } catch (e) {
    Opps('onGridRowClick Error:', e);
  } finally {
    showLoading(false);
  }
}

/**
 * Pipeline trung tâm: Filter -> Sort -> Render
 */
// function refreshGridPipeline(resetPage = false) {
//   try {
//     const { currentTable, sourceData, filter, sort } = GRID_STATE;
//     if (!currentTable || !sourceData) return;

//     // 1. FILTERING
//     let filtered = [...sourceData];
//     const searchKey = filter.keyword.trim().toLowerCase();
//     const isCheckDate = filter.dateFrom && filter.dateTo;

//     if (searchKey || isCheckDate) {
//       const resolveCC = (raw) => GRID_COLS?.find((c) => String(c?.i) === String(raw) || String(c?.key) === String(raw)) || null;
//       let DATE_FIELD_KEY = TABLE_DATE_CONFIG[currentTable] ?? null;
//       if (isCheckDate && (DATE_FIELD_KEY === null || typeof DATE_FIELD_KEY === 'number')) {
//         const dateCol = (GRID_COLS || []).find((c) => c?.fmt === 'date' && !c.hidden) || (GRID_COLS || []).find((c) => c?.fmt === 'date');
//         if (dateCol) DATE_FIELD_KEY = dateCol.key || dateCol.i || DATE_FIELD_KEY;
//       }

//       let dStart, dEnd;
//       if (isCheckDate) {
//         dStart = new Date(filter.dateFrom);
//         dStart.setHours(0, 0, 0, 0);
//         dEnd = new Date(filter.dateTo);
//         dEnd.setHours(23, 59, 59, 999);
//       }

//       filtered = sourceData.filter((row) => {
//         let matchKeyword = true;
//         if (searchKey) {
//           if (!filter.column || filter.column === '') {
//             matchKeyword = getAllCellValues(row).includes(searchKey);
//           } else {
//             const cc = resolveCC(filter.column);
//             const field = cc?.key || cc?.i || filter.column;
//             matchKeyword = String(row?.[field] ?? '')
//               .toLowerCase()
//               .includes(searchKey);
//           }
//         }
//         let matchDate = true;
//         if (isCheckDate && DATE_FIELD_KEY !== null) {
//           const cellDateRaw = row?.[DATE_FIELD_KEY];
//           if (cellDateRaw) {
//             const rowDate = new Date(cellDateRaw);
//             matchDate = !isNaN(rowDate) && rowDate >= dStart && rowDate <= dEnd;
//           } else matchDate = false;
//         }
//         return matchKeyword && matchDate;
//       });
//     }
//     GRID_STATE.filteredData = filtered;
//     window.FILTER_ACTIVE = searchKey || isCheckDate;

//     const sorted = A.UI.stableSort(filtered);

//     GRID_STATE.displayData = sorted;
//     window.PG_DATA = sorted;

//     // 3. PAGINATION & RENDER
//     if (resetPage) GRID_STATE.pagination.currentPage = 1;
//     GRID_STATE.pagination.totalPages = Math.ceil(GRID_STATE.displayData.length / GRID_STATE.pagination.limit);

//     _renderFromPGData();
//     if (typeof calculateSummary === 'function') debounce(calculateSummary, 100)(GRID_STATE.displayData);

//     L._(`[Pipeline] Table: ${currentTable} | Filtered: ${filtered.length} | Sorted: ${GRID_STATE.displayData.length}`, 'success');
//   } catch (err) {
//     console.error('❌ Error in refreshGridPipeline:', err);
//   }
// }

// function getAllRowDataByField(collectionName, rootIdOrEl, skipEmpty = true) {
//   try {
//     let container = typeof rootIdOrEl === 'string' ? $(rootIdOrEl) : rootIdOrEl instanceof Element ? rootIdOrEl : null;
//     if (!container) return [];
//     const trElements = container.querySelectorAll('tr');
//     if (trElements.length === 0) return [];
//     const allRowsData = [],
//       fieldNames = A.DB.schema.getFieldNames(collectionName);
//     trElements.forEach((trElement) => {
//       const rowData = {};
//       fieldNames.forEach((fieldName) => {
//         const field = trElement.querySelector(`[data-field="${fieldName}"]`);
//         if (field) rowData[fieldName] = getVal(field) || '';
//       });
//       if (skipEmpty && !rowData.id) return;
//       allRowsData.push(rowData);
//     });
//     return allRowsData;
//   } catch (e) {
//     return [];
//   }
// }

// function setRowDataByField(collectionName, rowData, rootIdOrEl, rowId = null) {
//   try {
//     let container = typeof rootIdOrEl === 'string' ? $(rootIdOrEl) : rootIdOrEl instanceof Element ? rootIdOrEl : document.body;
//     let trElement = rowId !== null ? container.querySelector(`tr#row-${rowId}`) || container.querySelector(`tr[data-row-id="${rowId}"]`) : container.querySelector('tr');
//     if (!trElement) return false;
//     Object.entries(rowData).forEach(([fieldName, value]) => {
//       const field = trElement.querySelector(`[data-field="${fieldName}"]`);
//       if (field) setVal(field, value);
//     });
//     return true;
//   } catch (e) {
//     return false;
//   }
// }

// function getAllCellValues(row) {
//   if (typeof row === 'object' && !Array.isArray(row))
//     return Object.values(row)
//       .map((v) => String(v ?? ''))
//       .join(' ')
//       .toLowerCase();
//   else if (Array.isArray(row))
//     return row
//       .map((v) => String(v ?? ''))
//       .join(' ')
//       .toLowerCase();
//   return String(row ?? '').toLowerCase();
// }

// function applyGridFilter() {
//   try {
//     const colSelect = getE('filter-col'),
//       valInput = getE('filter-val'),
//       fromInput = getE('filter-from'),
//       toInput = getE('filter-to');
//     const rawCol = colSelect ? colSelect.value.trim() : '',
//       rawKeyword = valInput ? valInput.value : '',
//       rawFrom = fromInput ? fromInput.value.trim() : '',
//       rawTo = toInput ? toInput.value.trim() : '';
//     GRID_STATE.filter = { keyword: rawKeyword, column: rawCol, dateFrom: rawFrom, dateTo: rawTo };
//     if (!rawKeyword && !rawFrom && !rawTo) {
//       resetGridData();
//       return;
//     }
//     LAST_FILTER_SIGNATURE = JSON.stringify({ t: GRID_STATE.currentTable, c: rawCol, k: rawKeyword, f: rawFrom, to: rawTo });
//     refreshGridPipeline(true);
//   } catch (err) {}
// }

// window.FILTER_THROTTLE_STATE = window.FILTER_THROTTLE_STATE || {
//   lastTime: 0,
//   get THROTTLE_MS() {
//     return window.A?.getConfig?.('filter_throttle_ms') ?? 1000;
//   },
// };

// function applyGridFilterThrottled() {
//   const now = Date.now();
//   const state = window.FILTER_THROTTLE_STATE;
//   if (now - state.lastTime >= state.THROTTLE_MS) {
//     state.lastTime = now;
//     applyGridFilter();
//   }
// }

// function _renderFromPGData(tblId) {
//   const isSecondary = A.DB?.schema?.[GRID_STATE.currentTable]?.isSecondaryIndex === true;
//   if (isSecondary) {
//     if (typeof renderSecondaryIndexFromFlat === 'function') renderSecondaryIndexFromFlat(GRID_STATE.currentTable, window.PG_DATA, tblId);
//   } else {
//     const table = tblId ? getE(tblId) : getE('tbl-container-tab2');
//     if (typeof initPagination === 'function') initPagination(window.PG_DATA, table);
//   }
// }

// function resetGridData() {
//   GRID_STATE.filter = { keyword: '', column: '', dateFrom: '', dateTo: '' };
//   GRID_STATE.sort = { column: '', dir: 'desc' };
//   window.FILTER_ACTIVE = false;
//   LAST_FILTER_SIGNATURE = null;
//   const valInput = getE('filter-val');
//   if (valInput) valInput.value = '';
//   refreshGridPipeline(true);
// }

// /**
//  * Sắp xếp bảng
//  */
// function applyGridSorter(dir = null) {
//   const selectEl = getE('filter-col');
//   if (!selectEl) return;
//   const rawCol = String(selectEl.value ?? '').trim();
//   if (!rawCol) return;

//   // Cập nhật trạng thái sort
//   if (GRID_STATE.sort.column === rawCol) {
//     GRID_STATE.sort.dir = dir ? dir : GRID_STATE.sort.dir === 'asc' ? 'desc' : 'asc';
//   } else {
//     GRID_STATE.sort.column = rawCol;
//     GRID_STATE.sort.dir = dir ? dir : 'desc';
//   }

//   refreshGridPipeline(false);
//   updateSortButtonUI(GRID_STATE.sort.dir);
// }

// function updateSortButtonUI(dir) {
//   const btn = getE('btn-data-sort');
//   if (!btn) return;
//   if (dir === 'asc') {
//     btn.innerHTML = '<i class="bi bi-sort-alpha-down"></i> Tăng dần';
//     btn.classList.replace('btn-secondary', 'btn-primary');
//   } else {
//     btn.innerHTML = '<i class="bi bi-sort-alpha-down-alt"></i> Giảm dần';
//     btn.classList.replace('btn-primary', 'btn-secondary');
//   }
// }

// function handleTableChange(key) {
//   if (typeof renderTableByKey === 'function') {
//     renderTableByKey(key);
//     clearFilterUI();
//   }
// }

// function clearFilterUI() {
//   ['filter-col', 'filter-val', 'filter-from', 'filter-to'].forEach((id) => {
//     const el = getE(id);
//     if (el) el.value = '';
//   });
//   setVal('list-preset-range', '-1');
//   window.FILTER_ACTIVE = false;
//   LAST_FILTER_SIGNATURE = null;
// }

// function calculateSummary(dataRows) {
//   if (!dataRows || !Array.isArray(dataRows) || dataRows.length === 0) {
//     if (window.PG_DATA && window.PG_DATA.length > 0) {
//       dataRows = window.PG_DATA;
//     } else {
//       if (typeof updateStatUI === 'function') updateStatUI(0, 0, 0);
//       return;
//     }
//   }
//   if (typeof GRID_COLS === 'undefined' || !Array.isArray(GRID_COLS)) return;
//   const isMatch = (col, keywords) => keywords.includes(String(col.t).toLowerCase().trim());
//   const colTotal = GRID_COLS.find((c) => isMatch(c, ['thành tiền', 'tổng cộng', 'tổng booking', 'tổng chi tiêu', 'tổng chi phí']));
//   const colQty = GRID_COLS.find((c) => isMatch(c, ['sl', 'số lượng', 'ng lớn', 'người lớn']));
//   if (!colTotal) return;
//   const firstRow = dataRows[0],
//     isObjRow = typeof firstRow === 'object' && !Array.isArray(firstRow);
//   const fieldTotal = isObjRow ? colTotal.key || colTotal.k || colTotal.i : colTotal.i;
//   const fieldQty = colQty ? (isObjRow ? colQty.key || colQty.k || colQty.i : colQty.i) : null;
//   const sumTotal = HD.agg(dataRows, fieldTotal),
//     sumQty = fieldQty !== null ? HD.agg(dataRows, fieldQty) : 0,
//     avg = sumQty !== 0 ? sumTotal / sumQty : 0;
//   if (typeof updateStatUI === 'function') updateStatUI(sumTotal, sumQty, avg);
// }

// function updateStatUI(total, qty, avg) {
//   const fmt = (n) => (typeof formatNumber === 'function' ? formatNumber(n) : Number(n).toLocaleString());
//   setText('stat-total', fmt(total));
//   setText('stat-qty', fmt(qty));
//   setText('stat-avg', fmt(avg));
// }

// async function downloadData(type = 'excel') {
//   const IDX_PAY_TYPE = 12,
//     IDX_BOOKINGS_ID = 0,
//     IDX_DETAILS_ID = 1;
//   const data = STATE_TABLE['tab-data-tbl'].displayData;
//   if (!data.length) return;
//   const selectEl = getE('btn-select-datalist');
//   let viewType = selectEl ? selectEl.value : 'bookings',
//     viewText = selectEl ? selectEl.options[selectEl.selectedIndex].text : 'Export';
//   const now = new Date(),
//     dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(2)}`;
//   let fileName = `${viewText}_${dateStr}`,
//     dataToProcess = [...data];
//   if (['bookings', 'booking_details', 'operator_entries'].includes(viewType)) {
//     if (confirm(`Lọc danh sách xuất Hóa Đơn cho bảng [${viewText}]?`)) {
//       const vatKeywords = ['CK CT', 'Đã Xuất', 'VAT', 'Chờ Xuất'],
//         isVat = (val) =>
//           vatKeywords.some((k) =>
//             String(val || '')
//               .toLowerCase()
//               .includes(k.toLowerCase())
//           );
//       if (viewType === 'bookings') dataToProcess = dataToProcess.filter((row) => isVat(row[IDX_PAY_TYPE]));
//       else {
//         const bookingsrc = typeof APP_DATA !== 'undefined' ? Object.values(APP_DATA.bookings) : [];
//         if (bookingsrc.length > 0) {
//           const validIds = new Set();
//           bookingsrc.forEach((mRow) => {
//             if (isVat(mRow[IDX_PAY_TYPE])) validIds.add(String(mRow[IDX_BOOKINGS_ID]));
//           });
//           dataToProcess = dataToProcess.filter((dRow) => validIds.has(String(dRow[IDX_DETAILS_ID])));
//         }
//       }
//       if (dataToProcess.length === 0) return;
//       fileName += '_VAT_ONLY';
//     }
//   }
//   const exportData = dataToProcess.map((row) => {
//     const rowObj = {};
//     GRID_COLS.forEach((col) => {
//       let val = row[col.i];
//       if (val && col.fmt === 'date') {
//         try {
//           const d = new Date(val);
//           if (!isNaN(d.getTime())) val = d.toLocaleDateString('vi-VN');
//         } catch (e) {}
//       }
//       rowObj[col.t] = val || '';
//     });
//     return rowObj;
//   });
//   try {
//     if (type === 'excel') {
//       const wb = XLSX.utils.book_new(),
//         ws = XLSX.utils.json_to_sheet(exportData);
//       ws['!cols'] = Object.keys(exportData[0] || {}).map(() => ({ wch: 15 }));
//       XLSX.utils.book_append_sheet(wb, ws, 'Data');
//       XLSX.writeFile(wb, `${fileName}.xlsx`);
//     } else {
//       const { jsPDF } = window.jspdf,
//         doc = new jsPDF({ orientation: 'landscape' });
//       doc.text(`BÁO CÁO: ${viewText}`, 14, 15);
//       doc.autoTable({ head: [Object.keys(exportData[0] || {})], body: exportData.map((obj) => Object.values(obj)), startY: 25, theme: 'grid', styles: { fontSize: 8 } });
//       doc.save(`${fileName}.pdf`);
//     }
//   } catch (err) {}
// }

// function applyPresetDateRange(val) {
//   if (!val || val === '-1') {
//     setVal('filter-from', '');
//     setVal('filter-to', '');
//   } else {
//     const { start, end } = getDateRange(val);
//     setVal('filter-from', start);
//     setVal('filter-to', end);

//     // Tìm ưu tiên các field ngày trong select filter-col
//     const colSelect = getE('filter-col');
//     if (colSelect) {
//       const options = Array.from(colSelect.options).map((opt) => opt.value);
//       const priorityFields = ['start_date', 'check_in', 'created_at'];
//       const foundField = priorityFields.find((f) => options.includes(f));
//       if (foundField) setVal('filter-col', foundField);
//     }

//     const sortField = getVal('filter-col');
//     if (!sortField || !sortField.includes('date')) {
//       // Nếu sau khi tìm vẫn không có field ngày phù hợp, fallback về created_at nếu không phải field date
//       if (!['start_date', 'check_in', 'created_at'].includes(sortField)) {
//         setVal('filter-col', 'created_at');
//       }
//     }
//     applyGridFilterThrottled();
//   }
// }
