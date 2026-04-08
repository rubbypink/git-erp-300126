// =========================================================================
// 2. CORE RENDER ENGINE (LAZY LOAD)
// =========================================================================

var isSetupTabForm = false;
const setupMainFormUI = function (lists) {
  if (isSetupTabForm) {
    L._('Đã SetupTabForm - Pass!');
    return;
  }
  L._('setupMainFormUI running');

  if (!lists) return;

  const fillSelect = (elmId, dataArray) => {
    const el = getE(elmId);
    if (!el) return;
    el.innerHTML = '<option value="">--Chọn--</option>';
    if (!Array.isArray(dataArray) && typeof dataArray === 'object') {
      dataArray = Object.entries(dataArray).map(([key, value]) => ({ id: key, name: value }));
    }
    if (Array.isArray(dataArray)) {
      dataArray.forEach((item) => {
        let opt = document.createElement('option');
        opt.value = item.name ? item.name : item.id || item;
        opt.text = item.name ? item.name : item;
        el.appendChild(opt);
      });
    }
  };
  const fillDataList = (elmId, dataArray) => {
    const el = getE(elmId);
    if (!el) return;
    if (typeof dataArray === 'object') {
      let uniqueData = [...new Set(Object.values(dataArray))];
      el.innerHTML = uniqueData.map((item) => `<option value="${item}">`).join('');
    } else {
      let uniqueData = [...new Set(dataArray)];
      el.innerHTML = dataArray.map((item) => `<option value="${item}">`).join('');
    }
  };

  fillSelect('BK_Staff', lists.staff);
  fillSelect('Cust_Source', lists.source);
  fillSelect('BK_PayType', lists.payment);
  fillDataList('list-tours', lists.tours);

  const customers = Object.values(APP_DATA.customers ?? {});
  if (customers.length > 0) {
    let phones = [];
    let names = [];
    if (typeof customers[0] === 'object' && !Array.isArray(customers[0])) {
      phones = customers.map((r) => r.phone).filter(Boolean);
      names = customers.map((r) => r.full_name).filter(Boolean);
    } else {
      const validCustomers = customers.filter((r) => r && r.length > 2);
      phones = validCustomers.map((r) => r[1]).filter(Boolean);
      names = validCustomers.map((r) => r[2]).filter(Boolean);
    }
    fillDataList('list-cust-phones', phones.slice(0, 500));
    fillDataList('list-cust-names', names.slice(0, 500));
  }

  const tblBookingForm = getE('tbl-booking-form');
  if (tblBookingForm) {
    const thead = tblBookingForm.querySelector('thead');
    if (thead) {
      const collectionName = CURRENT_USER && CURRENT_USER.role === 'op' ? 'operator_entries' : 'booking_details';
      const headerHtml = renderHeaderHtml(collectionName);
      if (headerHtml) thead.innerHTML = headerHtml;
    }
  }
  isSetupTabForm = true;
};

// =========================================================================
// 3. TAB & CONTEXT HELPERS
// =========================================================================

function activateTab(targetTabId) {
  selectTab(targetTabId);
  toggleContextUI(targetTabId);
}

function toggleContextUI(targetTabIdOrIndex) {
  try {
    const activeTabIndex = isNaN(Number(targetTabIdOrIndex)) ? TAB_INDEX_BY_ID[String(targetTabIdOrIndex)] : Number(targetTabIdOrIndex);
    const els = document.querySelectorAll('[data-ontabs]');
    if (!activeTabIndex) {
      els.forEach((el) => el.classList.add('d-none'));
      return;
    }
    els.forEach((el) => {
      const allowedTabs = (el.dataset.ontabs || '').trim().split(/\s+/).filter(Boolean).map(Number) || el.dataset.ontabs === targetTabIdOrIndex;
      el.classList.toggle('d-none', !allowedTabs.includes(activeTabIndex));
    });

    if (activeTabIndex === TAB_INDEX_BY_ID['tab-form']) {
      CURRENT_TABLE_KEY = 'bookings';
      if (typeof setMany === 'function' && typeof getVal === 'function') {
        if (getE('BK_Start') === '' || getVal('BK_Date') === '') {
          setMany(['BK_Date', 'BK_Start', 'BK_End'], new Date());
          setVal('BK_Staff', CURRENT_USER.uid);
        }
      }
    } else if (activeTabIndex === TAB_INDEX_BY_ID['tab-dashboard']) {
      A.Event?.trigger('btn-dash-update', 'click');
    }
  } catch (e) {
    Opps('Lỗi trong toggleContextUI: ', e);
  }
}

function selectTab(targetTabId) {
  A.UI.lazyLoad(targetTabId);
  const navBtn = document.querySelector(`button[data-bs-target="#${targetTabId}"]`) || document.querySelector(`.nav-link[data-bs-target="#${targetTabId}"]`);
  if (navBtn) bootstrap.Tab.getOrCreateInstance(navBtn).show();
  const tabEl = getE(targetTabId);
  switch (targetTabId) {
    case 'tab-theme-content':
      setClass($(targetTabId), 'd-none', false);
      setClass($('#tab-shortcut-content'), 'd-none', true);
      A.Modal.setSaveHandler(saveThemeSettings, 'Áp Dụng Theme');
      A.Modal.setResetHandler(THEME_MANAGER.resetToDefault, 'Đặt Lại');
      break;
    case 'tab-shortcut-content':
      setClass($(targetTabId), 'd-none', false);
      setClass($('#tab-theme-content'), 'd-none', true);
      A.ShortKey.renderSettingsForm();
      A.Modal.setFooter(false);
      break;
    case 'tab-adm-users':
      setClass($(targetTabId), 'd-none', false);
      A.AdminConsole.modal.setFooter(true);
      A.AdminConsole.modal.setSaveHandler(A.AdminConsole?.saveUser, 'Lưu User');
      A.AdminConsole.modal.setResetHandler(() => {
        getE('users-form').reset();
        getE('form-created-at').valueAsDate = new Date();
      }, 'Nhập Lại');
      A.AdminConsole.loadUsersData();
      break;
    case 'tab-data-tbl':
      if (getE('tbl-tab-data-tbl')) break;
      A.UI.createTable('tab-data-tbl', {
        colName: 'bookings',
        data: APP_DATA['bookings'],
        header: true,
        headerExtra: [
          `<div class="btn btn-sm btn-warning shadow-sm p-0" id="datalist-select"">
        <select id="btn-select-datalist" class="form-select form-select-sm bg-warning rounded border-0" style="min-width: 6rem;">
        </select>
      </div>`,
        ],
        contextMenu: false,
        draggable: true,
        pageSize: 50,
        sorter: true,
        title: `DANH SÁCH BOOKING`,
        footer: true,
        groupBy: true,
        fs: 0.7,
      });
      A.UI.initBtnSelectDataList();
      break;
    case 'tab-price-pkg':
      if (A.PriceManager) {
        A.PriceManager.init('tab-price-pkg');
      }
      break;
    case 'tab-tour-price':
      if (A.TourPrice) {
        A.TourPrice.init();
      }
      break;
    case 'tab-adm-app-config':
      A.AdminConsole.modal.setFooter(false);
      break;
    default:
      setClass($(targetTabId), 'd-none', false);
  }
  setTimeout(() => {
    const input = tabEl?.querySelector('input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])');
    if (input && input.offsetParent !== null) input.focus();
    document.dispatchEvent(new CustomEvent('tabchange', { detail: { tabId: targetTabId } }));
  }, 100);
}

// =========================================================================
// 4. DATA TABLE RENDERING LOGIC (Object-based + Array-based support)

function generateGridColsFromObject(collectionName) {
  const headerObj = A.DB.schema.createHeaderFromFields(collectionName);
  if (!headerObj || typeof headerObj !== 'object') {
    GRID_COLS = [];
    return;
  }
  const FORMAT_KEYWORDS = {
    date: ['ngày', 'hạn', 'date', 'dob', 'checkin', 'checkout', 'deadline', 'start', 'end'],
    money: ['tiền', 'giá', 'cọc', 'thu', 'chi', 'total', 'amount', 'price', 'deposit', 'revenue', 'cost', 'profit', 'balance'],
  };
  const matches = (text, type) =>
    String(text)
      .toLowerCase()
      .split(' ')
      .some((word) => FORMAT_KEYWORDS[type].some((key) => word.includes(key)));
  const translate = (t) => (A.Lang ? A.Lang.t(t) : t);

  GRID_COLS = Object.entries(headerObj).map(([fieldName, fieldValue], index) => {
    const vnTitle = fieldValue || translate(fieldName);
    let format = matches(vnTitle, 'date') || matches(fieldName, 'date') ? 'date' : matches(vnTitle, 'money') || matches(fieldName, 'money') ? 'money' : 'text';
    let res = { i: fieldName, key: fieldName, t: vnTitle, fmt: format, align: format === 'money' ? 'text-end' : 'text-center' };
    if (TABLE_HIDDEN_FIELDS[collectionName]?.includes(fieldName)) res.hidden = true;
    return res;
  });
}

function renderHeaderHtml(collectionName) {
  generateGridColsFromObject(collectionName);
  if (GRID_COLS?.length > 0) {
    return '<th style="width:50px" class="text-center">#</th>' + GRID_COLS.map((col) => `<th class="${col.hidden ? 'd-none ' : 'text-center'}" data-field="${col.key}">${col.t}</th>`).join('');
  }
  return '<th>Không có cấu hình cột</th>';
}

// function generateGridCols(headerRow) {
//   if (!headerRow || !Array.isArray(headerRow)) {
//     GRID_COLS = [];
//     return;
//   }
//   const FORMAT_KEYWORDS = {
//     date: ['ngày', 'hạn', 'date', 'dob', 'check_in', 'check_out', 'deadline', 'start', 'end'],
//     money: ['tiền', 'giá', 'cọc', 'thu', 'chi', 'total', 'amount', 'price', 'deposit', 'revenue', 'cost', 'profit', 'balance', 'paid'],
//   };
//   const matches = (text, type) =>
//     String(text)
//       .toLowerCase()
//       .split(' ')
//       .some((word) => FORMAT_KEYWORDS[type].some((key) => word.includes(key)));
//   const translate = (t) => (A.Lang ? A.Lang.t(t) : t);

//   GRID_COLS = headerRow.map((rawTitle, index) => {
//     const vnTitle = translate(rawTitle);
//     let format = matches(vnTitle, 'date') || matches(rawTitle, 'date') ? 'date' : matches(vnTitle, 'money') || matches(rawTitle, 'money') ? 'money' : 'text';
//     return { i: index, key: rawTitle, t: vnTitle, fmt: format, align: format === 'money' ? 'text-end' : 'text-center' };
//   });
// }

function renderGrid(dataList, table) {
  let nohide = table?.id === 'tbl-container-tab2';
  if (!table) table = getE('tbl-container-tab2');
  if (!table) return;
  const tbody = table.querySelector('tbody'),
    header = table.querySelector('thead');
  if (!tbody || !header) return;
  tbody.innerHTML = '';
  header.innerHTML = '';

  if (!GRID_COLS?.length) {
    header.innerHTML = '<th>Không có cấu hình cột</th>';
  } else {
    header.innerHTML = '<th style="width:50px" class="text-center">#</th>' + GRID_COLS.map((c) => `<th class="${nohide ? '' : c.hidden ? 'd-none' : 'text-center'}" data-field="${c.key}">${c.t}</th>`).join('');
  }

  if (!dataList?.length) {
    tbody.innerHTML = `<tr><td colspan="${(GRID_COLS?.length || 0) + 1}" class="text-center p-4 text-muted fst-italic">Không có dữ liệu hiển thị</td></tr>`;
    return;
  }

  const docFrag = document.createDocumentFragment();
  dataList.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'align-middle';
    let stt = typeof GRID_STATE !== 'undefined' ? (GRID_STATE.pagination.currentPage - 1) * GRID_STATE.pagination.limit + idx + 1 : idx + 1;
    let html = `<td class="text-center fw-bold text-secondary">${stt}</td>`;
    html += GRID_COLS.map((col) => {
      let val = row[col.i];
      if (val === undefined || val === null) val = '';
      if (col.fmt === 'money' && typeof formatNumber === 'function') val = formatNumber(val);
      if (col.fmt === 'date' && typeof formatDateVN === 'function') val = formatDateVN(val);
      return `<td class="${col.align}${nohide ? '' : col.hidden ? ' d-none' : ''}">${val}</td>`;
    }).join('');
    tr.innerHTML = html;
    tr.style.cursor = 'pointer';
    let rowId = typeof row === 'object' && !Array.isArray(row) ? row.id || row.booking_id : row[0];
    if (Array.isArray(row) && (CURRENT_TABLE_KEY === 'booking_details' || CURRENT_TABLE_KEY === 'operator_entries')) rowId = row[1];
    tr.id = rowId;
    tr.dataset.item = rowId;
    tr.onmouseover = function () {
      this.classList.add('table-active');
    };
    tr.onmouseout = function () {
      this.classList.remove('table-active');
    };
    docFrag.appendChild(tr);
  });
  tbody.appendChild(docFrag);
  table.dataset.collection = CURRENT_TABLE_KEY;
  // calculateSummary(dataList);
}

// // =========================================================================
// // 5. PAGINATION LOGIC

// function initPagination(sourceData, table) {
//   if (!Array.isArray(sourceData)) sourceData = [];
//   // GRID_STATE.pagination đã được khởi tạo trong logic_base.js
//   renderCurrentPage(table);
// }

// function renderCurrentPage(table) {
//   if (!table) table = getE('tbl-container-tab2');
//   const { data, currentPage, limit } = GRID_STATE.pagination;
//   const total = GRID_STATE.displayData.length;
//   const pagination = table.querySelector('#pagination'),
//     gridCount = table.querySelector('#grid-count');

//   if (total === 0) {
//     renderGrid([], table);
//     if (pagination) pagination.innerHTML = '';
//     if (gridCount) gridCount.innerText = 'Không có dữ liệu';
//     return;
//   }

//   const startIndex = (currentPage - 1) * limit,
//     endIndex = Math.min(startIndex + limit, total);
//   const pageData = GRID_STATE.displayData.slice(startIndex, endIndex);

//   renderGrid(pageData, table);
//   if (pagination) renderPaginationControls(pagination);
//   if (gridCount) gridCount.innerText = `Hiển thị ${startIndex + 1} - ${endIndex} trên tổng ${total} dòng`;
// }

// function changePage(page) {
//   const p = GRID_STATE.pagination;
//   if (page === 'prev') {
//     if (p.currentPage > 1) p.currentPage--;
//   } else if (page === 'next') {
//     if (p.currentPage < p.totalPages) p.currentPage++;
//   } else {
//     p.currentPage = Number(page);
//   }
//   renderCurrentPage();
//   document.dispatchEvent(new CustomEvent('paginationchange', { detail: { page: p.currentPage } }));
// }

// function renderPaginationControls(container) {
//   const { currentPage, totalPages } = GRID_STATE.pagination;
//   let html = '<ul class="pagination pagination-sm m-0">';
//   html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage('prev')">&laquo;</a></li>`;
//   let startPage = Math.max(1, currentPage - 2),
//     endPage = Math.min(totalPages, currentPage + 2);
//   if (startPage > 1) {
//     html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="changePage(1)">1</a></li>`;
//     if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
//   }
//   for (let i = startPage; i <= endPage; i++) html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage(${i})">${i}</a></li>`;
//   if (endPage < totalPages) {
//     if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
//     html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
//   }
//   html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage('next')">&raquo;</a></li></ul>`;
//   container.innerHTML = html;
// }

function setupLongPress(element, callback, threshold = 500) {
  let touchStartTime = 0,
    touchStartX = 0,
    touchStartY = 0,
    isValidPress = false;
  if (window.innerWidth > (window.A?.getConfig?.('mobile_breakpoint') ?? 768)) return;
  element.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 0) {
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isValidPress = true;
      }
    },
    { passive: true }
  );
  element.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 0 && (Math.abs(e.touches[0].clientX - touchStartX) > 10 || Math.abs(e.touches[0].clientY - touchStartY) > 10)) isValidPress = false;
    },
    { passive: true }
  );
  element.addEventListener(
    'touchend',
    (e) => {
      if (isValidPress && Date.now() - touchStartTime >= threshold) callback(e);
      isValidPress = false;
    },
    { passive: true }
  );
  let pointerDownTime = 0;
  element.addEventListener('pointerdown', () => (pointerDownTime = Date.now()));
  element.addEventListener('pointerup', (e) => {
    if (Date.now() - pointerDownTime >= threshold) callback(e);
  });
}

function renderTableByKey(key, tblId) {
  CURRENT_TABLE_KEY = key;
  GRID_STATE.currentTable = key;
  const table = tblId ? getE(tblId) : getE('tbl-container-tab2');
  if (!table) return;
  const tblEl = table.querySelector('table');
  if (tblEl) tblEl.dataset.collection = key;
  const tbody = table.querySelector('tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="100%" class="text-center p-3">Đang tải...</td></tr>';
  try {
    GRID_STATE.sourceData = getAppDataFlat(key);
    GRID_STATE.filter = { keyword: '', column: '', dateFrom: '', dateTo: '' };
    GRID_STATE.sort = { column: '', dir: 'desc' };
    if (!GRID_STATE.sourceData?.length) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="${(GRID_COLS?.length || 0) + 1}" class="text-center p-4 text-muted">Không có dữ liệu</td></tr>`;
      initFilterUI();
      return;
    }
    const schemaDef = A.DB.schema[key];
    if (schemaDef?.isSecondaryIndex) {
      generateGridColsFromObject(schemaDef.source ?? key);
    } else {
      generateGridColsFromObject(key);
    }
    refreshGridPipeline(true);
    initFilterUI();
    if (typeof TableResizeManager !== 'undefined')
      try {
        new TableResizeManager('grid-table').init();
      } catch (_) {}
  } catch (e) {
    Opps(`Lỗi hiển thị bảng [${key}]: ${e.message}`);
  }
}

// =========================================================================
// 8. DASHBOARD RENDERER
function setupMonthSelector(id = 'dash-month-select') {
  const sel = getE(id);
  if (!sel) return;
  let html = '<option value="-1">-- Tùy chỉnh --</option>';
  for (let i = 1; i <= 12; i++) html += `<option value="Tháng-${i - 1}">Tháng ${i}</option>`;
  ['Quý 1', 'Quý 2', 'Quý 3', 'Quý 4', 'Năm Nay', 'Năm Trước', 'Năm Tới', 'All'].forEach((v) => (html += `<option value="${v}">${v}</option>`));
  sel.innerHTML = html;
  sel.value = 'Năm Nay';
  sel.onchange = function () {
    const { start, end } = getDateRange('Năm Nay');
    setVal('dash-filter-from', start || '');
    setVal('dash-filter-to', end || '');
    runFnByRole('renderDashboard');
  };
  A.Event?.trigger(sel, 'change');
}

function initDashboard(config) {
  if (CURRENT_USER?.role === 'acc' || CURRENT_USER?.role === 'acc_thenice') return;
  // const today = new Date();
  // setVal('dash-filter-from', new Date(today.getFullYear(), today.getMonth(), 1));
  // setVal('dash-filter-to', new Date(today.getFullYear(), today.getMonth() + 1, 0));
  setupMonthSelector();
  if (!config) config = localStorage.getItem('dashTables') ? JSON.parse(localStorage.getItem('dashTables')) : null;
  const dashBtn = getE('btn-dash-update');
  if (dashBtn) dashBtn.onclick = () => runFnByRole('renderDashboard', config);
}

function renderDashboard(config) {
  if (!APP_DATA?.bookings) return;
  try {
    const renderByOption = (option, tableId) => {
      switch (option) {
        case 'BK_MOI':
          renderDashTable_New(tableId, option);
          break;
        case 'BK_XIN_REVIEW':
          renderDashTable_Review(tableId, option);
          break;
        case 'BK_SAP_DEN':
          renderDashTable_Arrival(tableId, option);
          break;
        case 'BK_DANG_O':
          renderDashTable_Staying(tableId, option);
          break;
        case 'BK_CHO_CODE':
          renderDashTable_MissingCode(tableId, option);
          break;
        case 'BK_CHO_THANH_TOAN':
          renderDashTable_PendingPayment(tableId, option);
          break;
      }
    };
    renderByOption(config?.table1 ?? 'BK_SAP_DEN', 'tbl-dash-1');
    renderByOption(config?.table2 ?? 'BK_CHO_CODE', 'tbl-dash-2');
    renderByOption(config?.table3 ?? 'BK_MOI', 'tbl-dash-3');
    if (config?.table4) renderByOption(config?.table4, 'tbl-dash-staff');
    else renderAggregates();
  } catch (err) {
    Opps('renderDashboard Error:', err);
  }
}

function updateDashHeaderStats(tableName, tableId, count = 0, total = 0) {
  let badgeDays = window.A?.getConfig?.('dash_badge_days') || 30;
  const dFrom = new Date(getVal('dash-filter-from')),
    dTo = new Date(getVal('dash-filter-to')),
    today = new Date();
  const dFromCalc = Math.floor((today - dFrom) / 86400000),
    dToCalc = Math.floor((dTo - today) / 86400000);
  const configs = {
    BK_MOI: { title: `Booking Mới (${dFromCalc >= 1 ? dFromCalc : badgeDays} Ngày)`, badgeClass: 'planning' },
    BK_XIN_REVIEW: { title: `Booking Xin Review (${dFromCalc >= 1 ? dFromCalc : badgeDays} Ngày)`, badgeClass: 'completed' },
    BK_SAP_DEN: { title: `Booking Sắp Đến (${dToCalc >= 1 ? dToCalc : badgeDays} Ngày)`, badgeClass: 'confirmed' },
    BK_DANG_O: { title: 'Booking Đang Ở', badgeClass: 'in-progress' },
    BK_CHO_CODE: { title: `Booking Chờ Code (${dToCalc > badgeDays * 5 ? dToCalc : badgeDays * 5} Ngày)`, badgeClass: 'planning' },
    BK_CHO_THANH_TOAN: { title: `Booking Cần TT (${dToCalc > badgeDays * 5 ? dToCalc : badgeDays * 5} Ngày)`, badgeClass: 'warning' },
    // Config cho role OP
    OP_MISSING_SUPPLIER: { title: 'Dịch Vụ Chờ NCC', badgeClass: 'danger' },
    OP_NEW_PRICES: { title: 'Bảng Giá Mới Cập Nhật', badgeClass: 'info' },
    OP_UPCOMING_SERVICES: { title: 'Dịch Vụ Sắp Khởi Hành', badgeClass: 'warning' },
  };
  getE(tableId).setAttribute('data-tabname', tableName);
  const badgeId = `badge-dash-tbl-${tableId.split('-').pop()}`;
  setVal(badgeId, total > 0 ? `Tổng: ${formatNumber(total)} / SL: ${count}` : `${count} BK`);
  setClass(badgeId, configs[tableName]?.badgeClass || 'secondary', true);
  const card = document.querySelector(`#${tableId}`).closest('.card');
  if (card) {
    const titleEl = card.querySelector('.card-header small');
    if (titleEl) titleEl.textContent = configs[tableName]?.title || 'Danh sách';
  }
}

function _renderDashThead(tableId, columns = []) {
  const thead = document.querySelector(`#${tableId} thead`);
  if (!thead) return;
  thead.innerHTML = '<tr>' + columns.map((col) => `<th class="${col.class || 'text-center'}">${col.label || col.key.toUpperCase()}</th>`).join('') + '</tr>';
}

function _createDashRow(row, columns = []) {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.id = row.id;
  tr.innerHTML = columns
    .map((col) => {
      let val = row[col.key] || '',
        className = col.class || 'text-center';
      if (col.format === 'date') val = formatDateVN(val);
      if (col.format === 'money') val = formatNumber(val);
      if (col.format === 'status') val = `<at-status status="${val}"></at-status>`;
      if (col.key === 'balance') {
        const bal = getNum(row.total_amount) - getNum(row.deposit_amount);
        val = formatNumber(bal);
        className += bal > 0 ? ' text-danger fw-bold' : ' text-success';
      }
      return `<td class="${className}">${val}</td>`;
    })
    .join('');
  return tr;
}

function renderDashTable_New(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  const dFrom = new Date(getVal('dash-filter-from')),
    dTo = new Date(getVal('dash-filter-to')),
    today = new Date();
  today.setHours(0, 0, 0, 0);
  let limitDate = dFrom < today ? dFrom : new Date(today.getTime() - (window.A?.getConfig?.('dash_badge_days') ?? 30) * 86400000);
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'created_at', label: 'Ngày Tạo', format: 'date' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money', class: 'text-success' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
    { key: 'staff_id', label: 'NV' },
  ];
  _renderDashThead(tableId, cols);
  const list = Object.values(APP_DATA.bookings)
    .filter((b) => {
      const d = new Date(b.created_at || b.start_date);
      return d >= limitDate && d <= (dTo > today ? today : dTo);
    })
    .sort((a, b) => new Date(b.created_at || b.start_date) - new Date(a.created_at || a.start_date));
  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(
    option,
    tableId,
    list.length,
    list.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  );
}

function renderDashTable_Review(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  const dFrom = new Date(getVal('dash-filter-from')),
    today = new Date(),
    limitDate = dFrom < today ? dFrom : new Date(today.getTime() - (window.A?.getConfig?.('dash_badge_days') ?? 30) * 86400000);
  const list = Object.values(APP_DATA.bookings)
    .filter((r) => r.status === 'Xong BK' && new Date(r.end_date) < today && new Date(r.end_date) >= limitDate)
    .sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'end_date', label: 'Ngày Về', format: 'date' },
    { key: 'staff_id', label: 'NV' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
  ];
  _renderDashThead(tableId, cols);
  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(option, tableId, list.length);
}

function renderDashTable_Arrival(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  const dFrom = new Date(getVal('dash-filter-from')),
    dTo = new Date(getVal('dash-filter-to')),
    today = new Date();
  today.setHours(0, 0, 0, 0);
  let limitDate = dTo > today ? dTo : new Date(today.getTime() + (window.A?.getConfig?.('dash_badge_days') ?? 14) * 86400000);
  const list = Object.values(APP_DATA.bookings)
    .filter((r) => r.status !== 'Hủy' && new Date(r.start_date) >= (dFrom < today ? today : dFrom) && new Date(r.start_date) <= limitDate)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'start_date', label: 'Ngày Đi', format: 'date' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money' },
    { key: 'balance', label: 'Còn Lại' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
  ];
  _renderDashThead(tableId, cols);
  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(
    option,
    tableId,
    list.length,
    list.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  );
}

function renderDashTable_Staying(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const list = Object.values(APP_DATA.bookings)
    .filter((r) => new Date(r.start_date) <= today && new Date(r.end_date) >= today && r.status !== 'Hủy')
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'start_date', label: 'Ngày Đi', format: 'date' },
    { key: 'end_date', label: 'Ngày Về', format: 'date' },
    { key: 'staff_id', label: 'NV' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
  ];
  _renderDashThead(tableId, cols);
  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(option, tableId, list.length);
}

function renderDashTable_MissingCode(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  const bookingsMap = {};
  Object.values(APP_DATA.bookings).forEach((r) => (bookingsMap[r.id] = r.customer_full_name));
  const dFrom = new Date(getVal('dash-filter-from')),
    dTo = new Date(getVal('dash-filter-to')),
    today = new Date();
  today.setHours(0, 0, 0, 0);
  let start = dFrom > today ? dFrom : today,
    end = dTo > today ? dTo : new Date(today.getTime() + (window.A?.getConfig?.('dash_badge_days') ?? 365) * 86400000);
  const list = Object.values(APP_DATA.booking_details)
    .filter((r) => (!r.service_type || r.service_type.trim() === 'Phòng') && !r.ref_code && new Date(r.check_in) >= start && new Date(r.check_in) <= end)
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in));
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'hotel_name', label: 'Khách Sạn' },
    { key: 'service_name', label: 'Dịch Vụ' },
    { key: 'check_in', label: 'Ngày Đi', format: 'date' },
  ];
  _renderDashThead(tableId, cols);
  list.forEach((r) => tbody.appendChild(_createDashRow({ ...r, customer_name: bookingsMap[r.booking_id] || '---' }, cols)));
  updateDashHeaderStats(option, tableId, list.length);
}

function renderDashTable_PendingPayment(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  const list = Object.values(APP_DATA.bookings).filter((r) => Number(r.total_amount) - Number(r.deposit_amount) > 0 && r.status !== 'Hủy');
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money' },
    { key: 'balance', label: 'Còn Lại' },
    { key: 'payment_due_date', label: 'Hạn TT', format: 'date' },
  ];
  _renderDashThead(tableId, cols);
  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(option, tableId, list.length);
}

function renderAggregates() {
  if (!APP_DATA?.bookings) return;
  const dFrom = new Date(getVal('dash-filter-from')),
    dTo = new Date(getVal('dash-filter-to')),
    aggStaff = {};
  Object.values(APP_DATA.bookings).forEach((row) => {
    const dIn = new Date(row.start_date);
    if (dIn >= dFrom && dIn <= dTo) {
      let s = row.staff_id || 'Chưa có NV';
      if (!aggStaff[s]) aggStaff[s] = { total: 0, paid: 0, bal: 0 };
      aggStaff[s].total += Number(row.total_amount || 0);
      aggStaff[s].paid += Number(row.deposit_amount || 0);
      aggStaff[s].bal += Number(row.total_amount || 0) - Number(row.deposit_amount || 0);
    }
  });
  renderAggTable('tbl-dash-staff', aggStaff, 'badge-dash-tbl-staff');
}

// Các hàm xử lý cho role op

function renderAggTable(tblId, dataObj, sumId) {
  const tbody = document.querySelector(`#${tblId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  let totalBal = 0;
  Object.keys(dataObj)
    .sort((a, b) => dataObj[b].bal - dataObj[a].bal)
    .forEach((k) => {
      const item = dataObj[k];
      totalBal += item.bal;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${k}</td><td class="text-end text-muted">${formatNumber(item.total)}</td><td class="text-end text-muted">${formatNumber(item.paid)}</td><td class="text-end ${item.bal > 0 ? 'text-danger fw-bold' : 'text-success'}">${formatNumber(item.bal)}</td>`;
      tr.style.cursor = 'pointer';
      tr.onclick = (e) => {
        if (e.ctrlKey || e.metaKey) Op.Logic.handleAggClick(k, 'staff');
      };
      setupLongPress(tr, () => Op.Logic.handleAggClick(k, 'staff'));
      tbody.appendChild(tr);
    });
  if (getE(sumId)) setVal(sumId, formatNumber(totalBal));
}

window.renderDashboard_Op = function () {
  if (!APP_DATA) return;
  renderDashTable_MissingSupplier_Op();
  renderDashTable_NewPrices_Op();
  renderDashTable_UpcomingServices_Op();
  renderDashTable_SupplierDebt_Op(new Date(getVal('dash-filter-from')), new Date(getVal('dash-filter-to')));
};

function renderDashTable_MissingSupplier_Op() {
  const tableId = 'tbl-dash-missing-supplier',
    tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entries = Object.values(APP_DATA.operator_entries || {})
    .filter((r) => (!r.suppliers || !r.suppliers.trim()) && new Date(r.check_in) >= today)
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in));
  const cols = [
    { key: 'id', label: 'SID' },
    { key: 'customer_full_name', label: 'Khách Hàng' },
    { key: 'service_type', label: 'Loại DV' },
    { key: 'service_name', label: 'Dịch Vụ' },
    { key: 'check_in', label: 'Check-In', format: 'date' },
  ];
  _renderDashThead(tableId, cols);
  entries.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats('OP_MISSING_SUPPLIER', tableId, entries.length);
}

function renderDashTable_NewPrices_Op() {
  const tableId = 'tbl-dash-prices',
    tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  const allPrices = [...Object.values(APP_DATA.hotel_price_schedules || {}).map((r) => ({ ...r, type: 'Khách Sạn', display_name: r.hotel_id || r.hotelName, updated_at: r.updated_at || r.created_at })), ...Object.values(APP_DATA.service_price_schedules || {}).map((r) => ({ ...r, type: 'Dịch Vụ', display_name: r.serviceName || r.id, updated_at: r.updated_at || r.created_at }))].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 50);
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'type', label: 'Loại' },
    { key: 'display_name', label: 'Tên Bảng Giá' },
    { key: 'year', label: 'Năm' },
    { key: 'updated_at', label: 'Cập Nhật', format: 'date' },
  ];
  _renderDashThead(tableId, cols);
  allPrices.forEach((row) => {
    const tr = _createDashRow(row, cols);
    tr.ondblclick = async () => {
      if (row.type === 'Khách Sạn') await A.HotelPriceManager?.init('dynamic-modal-full-body');
      else await A.ServicePriceController?.init('dynamic-modal-full-body');
    };
    tbody.appendChild(tr);
  });
  updateDashHeaderStats('OP_NEW_PRICES', tableId, allPrices.length);
}

function renderDashTable_UpcomingServices_Op() {
  const tableId = 'tbl-dash-upcoming',
    tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today.getTime() + 30 * 86400000);
  const entries = Object.values(APP_DATA.operator_entries || {})
    .filter((r) => r.check_in && new Date(r.check_in) > today && new Date(r.check_in) <= end)
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in));
  const cols = [
    { key: 'id', label: 'SID' },
    { key: 'customer_full_name', label: 'Khách Hàng' },
    { key: 'service_name', label: 'Dịch Vụ' },
    { key: 'check_in', label: 'Check-In', format: 'date' },
    { key: 'supplier', label: 'NCC' },
    { key: 'ref_code', label: 'Code' },
  ];
  _renderDashThead(tableId, cols);
  entries.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats('OP_UPCOMING_SERVICES', tableId, entries.length);
}

function renderDashTable_SupplierDebt_Op(dFrom, dTo) {
  const agg = {};
  Object.values(APP_DATA.operator_entries || {}).forEach((row) => {
    const d = row.check_in ? new Date(row.check_in) : null;
    if (d && d >= dFrom && d <= dTo) {
      let s = row.supplier || '(Chưa có NCC)';
      if (!agg[s]) agg[s] = { cost: 0, paid: 0, bal: 0, count: 0 };
      agg[s].cost += getNum(row.total_cost);
      agg[s].paid += getNum(row.paid_amount);
      agg[s].bal += getNum(row.total_cost) - getNum(row.paid_amount);
      agg[s].count++;
    }
  });
  const tableId = 'tbl-dash-supplier',
    tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';
  let totalBal = 0;
  Object.keys(agg)
    .sort((a, b) => agg[b].bal - agg[a].bal)
    .forEach((k) => {
      const item = agg[k];
      totalBal += item.bal;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${k} <span class="text-muted small">(${item.count})</span></td><td class="text-end text-muted">${formatNumber(item.cost)}</td><td class="text-end text-muted">${formatNumber(item.paid)}</td><td class="text-end ${item.bal > 0 ? 'text-danger fw-bold' : 'text-success'}">${formatNumber(item.bal)}</td>`;
      tr.style.cursor = 'pointer';
      tr.onclick = (e) => {
        if (e.ctrlKey || e.metaKey) Op.Logic.handleAggClick(k, 'supplier');
      };
      tbody.appendChild(tr);
    });
  setVal('sum-supplier-bal', formatNumber(totalBal));
}
