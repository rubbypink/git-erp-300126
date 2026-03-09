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

  // 1. Helper điền Select
  const fillSelect = (elmId, dataArray) => {
    const el = getE(elmId);
    if (!el) return;
    el.innerHTML = '<option value="">--Chọn--</option>';
    if (Array.isArray(dataArray)) {
      dataArray.forEach((item) => {
        let opt = document.createElement('option');
        opt.value = item;
        opt.text = item;
        el.appendChild(opt);
      });
    }
  };

  // 2. Helper điền DataList
  const fillDataList = (elmId, dataArray) => {
    const el = getE(elmId);
    if (!el) return;
    var uniqueData = [...new Set(dataArray)];
    el.innerHTML = uniqueData.map((item) => `<option value="${item}">`).join('');
  };

  // --- THỰC THI ---
  fillSelect('BK_Staff', lists.staff);
  fillSelect('Cust_Source', lists.source);
  fillSelect('BK_PayType', lists.payment);

  fillDataList('list-tours', lists.tours);

  // --- SỬA LỖI READING 1 TẠI ĐÂY ---
  const customers = Object.values(APP_DATA.customers ?? {});
  if (customers.length > 0) {
    let phones = [];
    let names = [];

    // Kiểm tra format: object hay array
    if (typeof customers[0] === 'object' && !Array.isArray(customers[0])) {
      // ✅ Object format (new)
      phones = customers.map((r) => r.phone).filter(Boolean);
      names = customers.map((r) => r.full_name).filter(Boolean);
    } else {
      // Array format (legacy)
      const validCustomers = customers.filter((r) => r && r.length > 2);
      phones = validCustomers.map((r) => r[1]).filter(Boolean);
      names = validCustomers.map((r) => r[2]).filter(Boolean);
    }

    fillDataList('list-cust-phones', phones.reverse().slice(0, 500));
    fillDataList('list-cust-names', names.reverse().slice(0, 500));
  }

  // --- RENDER HEADER CHO TABLE TBL-BOOKING-FORM ---
  const tblBookingForm = getE('tbl-booking-form');
  if (tblBookingForm) {
    const thead = tblBookingForm.querySelector('thead');
    if (thead) {
      // Xác định collection dựa trên role
      const collectionName = CURRENT_USER && CURRENT_USER.role === 'op' ? 'operator_entries' : 'booking_details';

      const headerHtml = renderHeaderHtml(collectionName);
      if (headerHtml) {
        thead.innerHTML = headerHtml;
      }
    } else {
      L._(`[Form] Không lấy được header cho [${collectionName}]`, 'warning');
    }
  }

  isSetupTabForm = true;
};

// =========================================================================
// 3. TAB & CONTEXT HELPERS
// =========================================================================

function activateTab(targetTabId) {
  selectTab(targetTabId);

  // 4. Xử lý các nút chức năng (Lưu, Xóa...)
  toggleContextUI(targetTabId);

  // Notify StateProxy to clear session tracking on tab switch
}

/**
 * Hàm bật tắt các thành phần UI dựa trên data-ontabs
 * @param {string|number} targetTabIdOrIndex - ID của tab (vd: 'tab-form') hoặc Index (vd: 2)
 */
function toggleContextUI(targetTabIdOrIndex) {
  try {
    // 1. Xác định Active Index chuẩn hóa
    const activeTabIndex = typeof targetTabIdOrIndex === 'number' ? targetTabIdOrIndex : TAB_INDEX_BY_ID[String(targetTabIdOrIndex)];

    // Log để debug xem đang vào tab nào
    // L._(`[UI] Switching to tab: ${targetTabIdOrIndex} (Index: ${activeTabIndex})`);

    // 2. Quét tất cả các element có thuộc tính data-ontabs
    const els = document.querySelectorAll('[data-ontabs]');

    if (!activeTabIndex) {
      // Trường hợp không tìm thấy index hợp lệ, ẩn tất cả để an toàn
      els.forEach((el) => el.classList.add('d-none'));
      return;
    }

    // 3. Xử lý Ẩn/Hiện
    els.forEach((el) => {
      // Lấy giá trị data-ontabs, ví dụ: "2 3" -> mảng [2, 3]
      const allowedTabs = (el.dataset.ontabs || '')
        .trim()
        .split(/\s+/) // Tách bằng khoảng trắng
        .filter(Boolean) // Loại bỏ giá trị rỗng
        .map(Number); // Chuyển thành số

      // Kiểm tra xem Index hiện tại có nằm trong danh sách cho phép không
      const shouldShow = allowedTabs.includes(activeTabIndex);

      // Toggle class d-none (Nếu shouldShow = true -> bỏ d-none. Nếu false -> thêm d-none)
      el.classList.toggle('d-none', !shouldShow);
    });

    // 4. Xử lý Logic riêng cho Tab Form (Index = 2)
    // SỬA LỖI Ở ĐÂY: Dùng activeTabIndex để so sánh, không dùng tabId
    if (activeTabIndex === TAB_INDEX_BY_ID['tab-form']) {
      setClass('#tab-form', 'd-none', false); // Hiện tab form
      CURRENT_TABLE_KEY = 'bookings';
      if (typeof setMany === 'function' && typeof getVal === 'function') {
        if (getE('BK_Start') === '' || getVal('BK_Date') === '') {
          setMany(['BK_Date', 'BK_Start', 'BK_End'], new Date());
          setVal('BK_Staff', CURRENT_USER.name);
        }
      }
    } else if (activeTabIndex === TAB_INDEX_BY_ID['tab-list']) {
      A.Event?.trigger('btn-select-datalist', 'change'); // Cập nhật lại datalist mỗi khi vào tab list
      setTimeout(() => {
        const rangeEl = getE('list-preset-range');
        let val = getVal(rangeEl);
        if (!val || val === '-1') {
          val = 'this_year';
          setVal(rangeEl, val);
          applyPresetDateRange(val);
        }
      }, 200); // Delay nhỏ để đảm bảo DOM đã cập nhật
    } else if (activeTabIndex === TAB_INDEX_BY_ID['tab-dashboard']) {
      // Khi tab log vừa được render xong -> Lấy dữ liệu từ LS đắp vào
      A.Event?.trigger('btn-dash-update', 'click');
    }
  } catch (e) {
    Opps('Lỗi trong toggleContextUI: ', e);
  }
}

function selectTab(targetTabId) {
  A.UI.lazyLoad(targetTabId);

  // 2. Tìm nút bấm trên Header
  const navBtn = document.querySelector(`button[data-bs-target="#${targetTabId}"]`) || document.querySelector(`.nav-link[data-bs-target="#${targetTabId}"]`);

  // 3. Kích hoạt chuyển tab bằng Bootstrap API
  if (navBtn) {
    // Dùng getOrCreateInstance để tránh lỗi Illegal invocation
    const tabTrigger = bootstrap.Tab.getOrCreateInstance(navBtn);
    tabTrigger.show();
  }
  const tabEl = getE(targetTabId);
  // A.Modal.setFooter(false); // Ẩn footer mặc định
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
      break;
    case 'tab-adm-users':
      setClass($(targetTabId), 'd-none', false);
      A.AdminConsole.modal.setFooter(true); // Hiện footer để show nút lưu/xóa
      A.AdminConsole.modal.setSaveHandler(A.AdminConsole?.saveUser, 'Lưu User');
      A.AdminConsole.modal.setResetHandler(() => {
        getE('users-form').reset();
        getE('form-created-at').valueAsDate = new Date();
      }, 'Nhập Lại');
      A.AdminConsole.loadUsersData();
      break;
    case 'tab-adm-database-control':
      A.AdminConsole.modal.setFooter(false);
      break;
    case 'tab-adm-app-config':
      A.AdminConsole.modal.setFooter(false);
      break;
    default:
      setClass($(targetTabId), 'd-none', false);
  }
  // Thêm delay nhỏ để đảm bảo DOM ready
  setTimeout(() => {
    const input = tabEl?.querySelector('input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])');
    if (input && input.offsetParent !== null) {
      // Kiểm tra input visible
      input.focus();
    }
    document.dispatchEvent(new CustomEvent('tabchange', { detail: { tabId: targetTabId } }));
  }, 100);
}

// =========================================================================
// 4. DATA TABLE RENDERING LOGIC (Object-based + Array-based support)

/**
 * NEW: Generate grid columns from object properties
 * Supports both array (legacy) and object (new) formats
 */
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

  const matches = (text, type) => {
    const str = String(text).toLowerCase();
    return FORMAT_KEYWORDS[type].some((key) => str.includes(key));
  };

  const translate = (t) => (A.Lang ? A.Lang.t(t) : t);

  // 3. Xử lý chính: Convert object keys to columns
  GRID_COLS = Object.entries(headerObj).map(([fieldName, fieldValue], index) => {
    const vnTitle = fieldValue || translate(fieldName);
    let format = 'text';

    if (matches(vnTitle, 'date') || matches(fieldName, 'date')) {
      format = 'date';
    } else if (matches(vnTitle, 'money') || matches(fieldName, 'money')) {
      format = 'money';
    }
    let res = {
      i: fieldName, // ✅ NEW: Use field name instead of index
      key: fieldName, // Field name for object access
      t: vnTitle, // Display title
      fmt: format,
      align: format === 'money' ? 'text-end' : 'text-center',
    };

    if (TABLE_HIDDEN_FIELDS[collectionName] && TABLE_HIDDEN_FIELDS[collectionName].includes(fieldName)) {
      res.hidden = true;
    }
    return res;
  });
}

function renderHeaderHtml(collectionName) {
  generateGridColsFromObject(collectionName);
  // Render header row
  if (GRID_COLS && GRID_COLS.length > 0) {
    let headerHTML = '<th style="width:50px" class="text-center">#</th>';
    headerHTML += GRID_COLS.map((col) => `<th class="${col.hidden ? 'd-none ' : 'text-center'}" data-field="${col.key}">${col.t}</th>`).join('');
    return headerHTML;
  } else {
    return '<th>Không có cấu hình cột</th>';
  }
}

function generateGridCols(headerRow) {
  if (!headerRow || !Array.isArray(headerRow)) {
    GRID_COLS = [];
    return;
  }

  // 1. Cấu hình từ khóa nhận diện định dạng (Config Pattern)
  const FORMAT_KEYWORDS = {
    date: ['ngày', 'hạn', 'date', 'dob', 'check_in', 'check_out', 'deadline', 'start', 'end'],
    money: ['tiền', 'giá', 'cọc', 'thu', 'chi', 'total', 'amount', 'price', 'deposit', 'revenue', 'cost', 'profit', 'balance', 'paid'],
  };

  const matches = (text, type) => {
    const str = String(text).toLowerCase();
    return FORMAT_KEYWORDS[type].some((key) => str.includes(key));
  };

  const translate = (t) => (A.Lang ? A.Lang.t(t) : t);

  // 3. Xử lý chính
  GRID_COLS = headerRow.map((rawTitle, index) => {
    const vnTitle = translate(rawTitle);
    let format = 'text';

    if (matches(vnTitle, 'date') || matches(rawTitle, 'date')) {
      format = 'date';
    } else if (matches(vnTitle, 'money') || matches(rawTitle, 'money')) {
      format = 'money';
    }

    return {
      i: index,
      key: rawTitle,
      t: vnTitle,
      fmt: format,
      align: format === 'money' ? 'text-end' : 'text-center',
    };
  });

  L._('Auto-generated Grid Cols:', GRID_COLS);
}

function renderGrid(dataList, table) {
  let nohide = false;
  if (!table) {
    table = getE('tbl-container-tab2');
  }
  if (!table) return;
  if (table.id === 'tbl-container-tab2') nohide = true;
  const tbody = table.querySelector('tbody');
  const header = table.querySelector('thead');
  if (!tbody || !header) return;

  tbody.innerHTML = '';
  header.innerHTML = '';

  // A. HEADER
  if (!GRID_COLS || GRID_COLS.length === 0) {
    header.innerHTML = '<th>Không có cấu hình cột</th>';
  } else {
    let headerHTML = '<th style="width:50px" class="text-center">#</th>';
    headerHTML += GRID_COLS.map((c) => `<th class="${nohide ? '' : c.hidden ? 'd-none' : 'text-center'}" data-field="${c.key}">${c.t}</th>`).join('');
    header.innerHTML = headerHTML;
  }

  // B. BODY
  if (!dataList || dataList.length === 0) {
    const colCount = (GRID_COLS ? GRID_COLS.length : 0) + 1;
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center p-4 text-muted fst-italic">Không có dữ liệu hiển thị</td></tr>`;
    return;
  }

  const docFrag = document.createDocumentFragment();
  dataList.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'align-middle';

    // Cột STT (Tính theo trang nếu có phân trang)
    let stt = idx + 1;
    if (typeof PG_STATE !== 'undefined') stt = (PG_STATE.currentPage - 1) * PG_STATE.limit + idx + 1;

    let html = `<td class="text-center fw-bold text-secondary">${stt}</td>`;

    html += GRID_COLS.map((col) => {
      // ✅ NEW: Support both array (col.i is number) and object (col.i is string) access
      let val;
      if (typeof col.i === 'string') {
        // Object-based access (new)
        val = row[col.i];
      } else {
        // Array-based access (legacy)
        val = row[col.i];
      }

      if (val === undefined || val === null) val = '';

      if (col.fmt === 'money' && typeof formatNumber === 'function') val = formatNumber(val);
      if (col.fmt === 'date' && typeof formatDateVN === 'function') val = formatDateVN(val);

      const hiddenClass = nohide ? '' : col.hidden ? ' d-none' : '';
      return `<td class="${col.align}${hiddenClass}">${val}</td>`;
    }).join('');

    tr.innerHTML = html;
    tr.style.cursor = 'pointer';

    // ✅ NEW: Get row ID - support both array and object
    let rowId;
    if (typeof row === 'object' && !Array.isArray(row)) {
      // Object format
      rowId = row.id || row.booking_id;
    } else {
      // Array format (legacy)
      rowId = row[0];
      if (CURRENT_TABLE_KEY === 'booking_details' || CURRENT_TABLE_KEY === 'operator_entries') rowId = row[1]; // Details lấy cột 1 (BK_ID)
    }
    tr.id = rowId;
    tr.dataset.item = rowId;
    tr.onmouseover = function () {
      this.classList.add('table-active');
    };
    docFrag.appendChild(tr);
  });

  tbody.appendChild(docFrag);
  table.dataset.collection = CURRENT_TABLE_KEY; // Gắn collection vào dataset của table để tiện truy xuất sau này
  calculateSummary(dataList);
}

// =========================================================================
// 5. PAGINATION LOGIC
// =========================================================================

function initPagination(sourceData, table) {
  if (!Array.isArray(sourceData)) sourceData = [];
  PG_STATE.data = sourceData;
  PG_STATE.currentPage = 1;
  PG_STATE.totalPages = Math.ceil(sourceData.length / PG_STATE.limit);
  renderCurrentPage(table);
}

function renderCurrentPage(table) {
  if (!table) table = getE('tbl-container-tab2');
  const total = PG_STATE.data.length;
  const pagination = table.querySelector('#pagination');
  const gridCount = table.querySelector('#grid-count');

  if (total === 0) {
    renderGrid([], table);
    pagination.innerHTML = '';
    gridCount.innerText = 'Không có dữ liệu';
    return;
  }

  const startIndex = (PG_STATE.currentPage - 1) * PG_STATE.limit;
  const endIndex = Math.min(startIndex + PG_STATE.limit, total);
  const pageData = PG_STATE.data.slice(startIndex, endIndex);

  renderGrid(pageData, table);
  renderPaginationControls(pagination);
  gridCount.innerText = `Hiển thị ${startIndex + 1} - ${endIndex} trên tổng ${total} dòng`;
}

function changePage(page) {
  if (page === 'prev') {
    if (PG_STATE.currentPage > 1) PG_STATE.currentPage--;
  } else if (page === 'next') {
    if (PG_STATE.currentPage < PG_STATE.totalPages) PG_STATE.currentPage++;
  } else {
    PG_STATE.currentPage = Number(page);
  }
  renderCurrentPage(); // Vẽ lại
  // Notify StateProxy to clear session tracking on page change
  document.dispatchEvent(new CustomEvent('paginationchange', { detail: { page: PG_STATE.currentPage } }));
}

function renderPaginationControls(container) {
  const { currentPage, totalPages } = PG_STATE;
  let html = '<ul class="pagination pagination-sm m-0">';

  // Nút Prev
  html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage('prev')">&laquo;</a></li>`;

  // Logic rút gọn số trang
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="changePage(1)">1</a></li>`;
    if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage(${i})">${i}</a></li>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
  }

  // Nút Next
  html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage('next')">&raquo;</a></li>`;
  html += '</ul>';

  container.innerHTML = html;
}

/**
 * Setup longpress event handler on element
 * Triggers on sustained touch/mouse press without significant movement
 * Similar to dblclick but works on mobile via touch
 * @param {HTMLElement} element - Target element
 * @param {Function} callback - Handler function to call on longpress
 * @param {number} [threshold=500] - Milliseconds for longpress detection
 */
function setupLongPress(element, callback, threshold = 500) {
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let isValidPress = false;
  let isMobile = window.innerWidth <= (window.A?.getConfig?.('mobile_breakpoint') ?? 768); // Configurable mobile detection
  if (!isMobile) return; // Only setup on mobile devices
  // Touch events
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
      if (e.touches.length > 0) {
        const moveX = Math.abs(e.touches[0].clientX - touchStartX);
        const moveY = Math.abs(e.touches[0].clientY - touchStartY);
        // Cancel longpress if user moves > 10px
        if (moveX > 10 || moveY > 10) {
          isValidPress = false;
        }
      }
    },
    { passive: true }
  );

  element.addEventListener(
    'touchend',
    (e) => {
      if (isValidPress && Date.now() - touchStartTime >= threshold) {
        callback(e);
      }
      isValidPress = false;
    },
    { passive: true }
  );

  // Pointer events (desktop + stylus support)
  let pointerDownTime = 0;
  element.addEventListener('pointerdown', () => {
    pointerDownTime = Date.now();
  });

  element.addEventListener('pointerup', (e) => {
    if (Date.now() - pointerDownTime >= threshold) {
      callback(e);
    }
  });
}

// =========================================================================
// 6. RENDER DATA (Main Entry for List Tab)
// =========================================================================

/**
 * Render bảng secondary index theo dạng nhóm (grouped view).
 *
 * Cấu trúc nguồn: APP_DATA[key] = { groupValue: [doc, doc, ...], ... }
 * Hiển thị: mỗi groupValue = 1 header row màu + các data rows bên dưới.
 * Cột lấy từ schema của source collection (vd: 'booking_details').
 *
 * @param {string} key    - Secondary index key (vd: 'booking_details_by_booking')
 * @param {string} [tblId] - ID của container element (mặc định: 'tbl-container-tab2')
 */
/**
 * Entry point for secondary-index tables.
 * Loads flat data from APP_DATA → PG_DATA, generates GRID_COLS,
 * then delegates rendering to renderSecondaryIndexFromFlat.
 *
 * @param {string} key    - Secondary index key (e.g. 'booking_details_by_booking')
 * @param {string} [tblId] - Container element ID (default: 'tbl-container-tab2')
 */
function renderSecondaryIndexTable(key, tblId) {
  CURRENT_TABLE_KEY = key;
  const schemaDef = A.DB.schema[key];
  const schemaKey = schemaDef?.source ?? key;

  // Flatten nested APP_DATA structure → PG_DATA (source of truth)
  const flatData = getAppDataFlat(key);
  window.PG_DATA = flatData;
  window.FILTER_ACTIVE = false;

  // Pre-generate GRID_COLS once for the source schema
  generateGridColsFromObject(schemaKey);

  // Render grouped view from PG_DATA
  renderSecondaryIndexFromFlat(key, window.PG_DATA, tblId);
  initFilterUI();
}

/**
 * Render a secondary-index table from a FLAT array of docs.
 * Groups docs by schemaDef.groupBy and renders the grouped HTML.
 * Works exclusively from the provided flatData — does NOT read APP_DATA.
 * Called by: renderSecondaryIndexTable (initial load), applyGridFilter, applyGridSorter.
 *
 * @param {string} key       - Secondary index key (e.g. 'booking_details_by_booking')
 * @param {Array}  flatData  - Flat array of doc objects (may be filtered/sorted subset of PG_DATA)
 * @param {string} [tblId]   - Container element ID (default: 'tbl-container-tab2')
 */
function renderSecondaryIndexFromFlat(key, flatData, tblId) {
  const table = tblId ? getE(tblId) : getE('tbl-container-tab2');
  if (!table) return;

  const tblEl = table.querySelector('table');
  if (tblEl) tblEl.dataset.collection = key;

  const tbody = table.querySelector('tbody');
  const thead = table.querySelector('thead');

  try {
    const schemaDef = A.DB.schema[key];
    const schemaKey = schemaDef?.source ?? key;
    const groupBy = schemaDef?.groupBy ?? 'id';

    if (!flatData || flatData.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-center p-4 text-muted">Không có dữ liệu (${key})</td></tr>`;
      return;
    }

    // Ensure GRID_COLS exists (may have been generated by caller already)
    if (!GRID_COLS || GRID_COLS.length === 0) {
      generateGridColsFromObject(schemaKey);
    }
    if (!GRID_COLS || GRID_COLS.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-center p-4 text-muted">Không tìm thấy cấu hình cột cho '${schemaKey}'</td></tr>`;
      return;
    }
    const colCount = GRID_COLS.length + 1;

    // Render thead
    if (thead) {
      let headerHTML = '<th style="width:50px" class="text-center">#</th>';
      headerHTML += GRID_COLS.map((col) => `<th class="${col.hidden ? 'd-none ' : ''}text-center" data-field="${col.key}">${col.t}</th>`).join('');
      thead.innerHTML = headerHTML;
    }

    // Group flatData by groupBy field (in-memory, no APP_DATA access)
    const grouped = {};
    flatData.forEach((doc) => {
      const gVal = String(doc[groupBy] ?? '');
      if (!grouped[gVal]) grouped[gVal] = [];
      grouped[gVal].push(doc);
    });

    const groupByLabel = A.DB.schema[schemaKey]?.fields?.find((f) => f.name === groupBy)?.displayName ?? groupBy;

    const docFrag = document.createDocumentFragment();
    let globalIdx = 0;
    let totalDocs = 0;

    Object.entries(grouped).forEach(([groupValue, docs]) => {
      totalDocs += docs.length;

      // ── Group header row ──────────────────────────────────────────
      const groupTr = document.createElement('tr');
      groupTr.className = 'table-secondary';
      groupTr.style.cursor = 'pointer';
      groupTr.innerHTML = `
				<td colspan="${colCount}" class="ps-3 py-1 fw-bold">
					<span class="badge bg-primary me-2">${docs.length}</span>
					<span class="text-muted small fw-normal me-1">${groupByLabel}:</span>
					<span>${groupValue}</span>
				</td>`;

      const groupId = `grp-${key}-${String(groupValue).replace(/\W/g, '_')}`;
      groupTr.dataset.groupId = groupId;
      groupTr.addEventListener('click', () => {
        const rows = tbody.querySelectorAll(`tr[data-group="${groupId}"]`);
        const isHidden = rows[0]?.classList.contains('d-none');
        rows.forEach((r) => r.classList.toggle('d-none', !isHidden));
      });
      docFrag.appendChild(groupTr);

      // ── Data rows ─────────────────────────────────────────────────
      docs.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'align-middle';
        tr.dataset.group = groupId;

        let html = `<td class="text-center fw-bold text-secondary ps-4">${idx + 1}</td>`;
        html += GRID_COLS.map((col) => {
          let val = row[col.key];
          if (val === undefined || val === null) val = '';
          if (col.fmt === 'money' && typeof formatNumber === 'function') val = formatNumber(val);
          if (col.fmt === 'date' && typeof formatDateVN === 'function') val = formatDateVN(val);
          const hiddenClass = col.hidden ? ' d-none' : '';
          return `<td class="${col.align}${hiddenClass}">${val}</td>`;
        }).join('');

        tr.innerHTML = html;
        tr.style.cursor = 'pointer';
        tr.id = row.id || `${key}-${globalIdx}`;
        tr.dataset.item = row.id || `${key}-${globalIdx}`;
        tr.onmouseover = function () {
          this.classList.add('table-active');
        };
        tr.onmouseout = function () {
          this.classList.remove('table-active');
        };
        globalIdx++;
        docFrag.appendChild(tr);
      });
    });

    if (tbody) {
      tbody.innerHTML = '';
      tbody.appendChild(docFrag);
    }

    const groupCount = Object.keys(grouped).length;

    if (typeof TableResizeManager !== 'undefined') {
      try {
        new TableResizeManager('grid-table');
      } catch (_) {}
    }
  } catch (e) {
    Opps(`Lỗi render secondary index flat [${key}]: ${e.message}`);
  }
}

/**
 * Main dispatch: render any collection or secondary-index table.
 *
 * Responsibilities:
 *   1. Set CURRENT_TABLE_KEY.
 *   2. Flatten APP_DATA[key] → PG_DATA (source of truth for filter/sort/render).
 *   3. Reset FILTER_ACTIVE + SORT_STATE.
 *   4. Secondary index  → renderSecondaryIndexFromFlat (grouped view).
 *      Normal collection → initPagination (flat paginated view).
 *   5. Call initFilterUI.
 *
 * @param {string} key    - Collection or secondary-index key
 * @param {string} [tblId] - Container element ID (default: 'tbl-container-tab2')
 */
function renderTableByKey(key, tblId) {
  CURRENT_TABLE_KEY = key;

  const schemaDef = A.DB.schema[key];
  const isSecondary = schemaDef?.isSecondaryIndex === true;

  let table = tblId ? getE(tblId) : getE('tbl-container-tab2');
  if (!table) return;

  const tblEl = table.querySelector('table');
  if (tblEl) tblEl.dataset.collection = key;

  const tbody = table.querySelector('tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="100%" class="text-center p-3">Đang tải...</td></tr>';

  try {
    // Flatten APP_DATA → PG_DATA (single source of truth for subsequent ops)
    const flatData = getAppDataFlat(key);
    window.PG_DATA = flatData;
    window.FILTER_ACTIVE = false;
    SORT_STATE.col = -1;
    SORT_STATE.dir = 'desc';

    if (!flatData || flatData.length === 0) {
      L._(`[GRID] Không có dữ liệu cho [${key}]`, 'warning');
      if (tbody) {
        const colCount = (GRID_COLS ? GRID_COLS.length : 0) + 1;
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center p-4 text-muted">Không có dữ liệu</td></tr>`;
      }
      initFilterUI();
      return;
    }
    if (isSecondary) {
      // Secondary index: generate GRID_COLS then render grouped from PG_DATA
      generateGridColsFromObject(schemaDef.source ?? key);
      renderSecondaryIndexFromFlat(key, window.PG_DATA, tblId);
    } else {
      // Normal collection: generate GRID_COLS then paginate from PG_DATA
      generateGridColsFromObject(key);
      if (typeof initPagination === 'function') {
        initPagination(window.PG_DATA, table);
      } else {
        renderGrid(window.PG_DATA, table);
      }
    }
    initFilterUI();
  } catch (e) {
    Opps(`Lỗi hiển thị bảng [${key}]: ${e.message}`);
  }
}

// =========================================================================
// 7. FILTERS & OPTIONS UI
// =========================================================================

/**
 * Helper: lấy flat array of docs từ APP_DATA — hỗ trợ cả primary lẫn secondary index.
 * Primary:  APP_DATA[key] = { docId: doc }            → Object.values() = [doc, ...]
 * Secondary: APP_DATA[key] = { groupKey: { docId: doc } } → flatten về [doc, ...]
 * @param {string} key - Collection key hoặc secondary index key
 * @returns {Array} Flat array of doc objects
 */
function getAppDataFlat(key) {
  const data = APP_DATA?.[key];
  if (!data || typeof data !== 'object') return [];
  const isSecondary = A.DB?.schema?.[key]?.isSecondaryIndex === true;
  if (isSecondary) {
    // nested: { groupKey: { docId: doc, ... } } → [doc, ...]
    return Object.values(data).flatMap((group) => (group && typeof group === 'object' ? Object.values(group) : []));
  }
  return Object.values(data);
}
window.getAppDataFlat = getAppDataFlat;

function initFilterUI() {
  const select = getE('filter-col');
  if (!select) return;

  select.innerHTML = '';

  if (GRID_COLS && GRID_COLS.length > 0) {
    GRID_COLS.forEach((col) => {
      const opt = document.createElement('option');
      opt.value = col.i;
      opt.textContent = col.t;
      select.appendChild(opt);
      if (col.i === 'booking_id') {
        setVal('filter-col', col.i);
        select.selectedIndex = select.options.length - 1;
        select.dispatchEvent(new Event('change'));
      }
    });
    if (GRID_COLS.length > 1) select.selectedIndex = 0;
  } else {
    select.innerHTML = '<option value="-1">...</option>';
  }
  A.Event.on('filter-col', 'change', updateFilterOptions);
  updateFilterOptions();
}

function updateFilterOptions() {
  const rawCol = String(getE('filter-col')?.value ?? '').trim();
  const datalist = getE('filter-datalist');
  if (!datalist || rawCol === '-1' || rawCol === '') return;

  datalist.innerHTML = '';

  // Helpers
  const isNumericString = (s) => typeof s === 'string' && /^\d+$/.test(s.trim());
  const stripHeaderIfAny = (arr) => {
    if (!Array.isArray(arr)) return [];
    if (arr.length === 0) return [];
    const first = arr[0];
    if (Array.isArray(first) && typeof first[0] === 'string' && (first[0].toLowerCase() === 'id' || first[0].toLowerCase() === 'số thứ tự')) {
      return arr.slice(1);
    }
    return arr;
  };
  const resolveColConfig = (raw) => {
    if (!GRID_COLS || !Array.isArray(GRID_COLS)) return null;
    const rawStr = String(raw ?? '').trim();
    return GRID_COLS.find((c) => String(c?.i) === rawStr || String(c?.key) === rawStr) || null;
  };

  // Lấy data nguồn từ APP_DATA — hỗ trợ cả primary lẫn secondary index
  const objectKey = CURRENT_TABLE_KEY + '';
  const sourceData = getAppDataFlat(objectKey);
  if (sourceData.length === 0) return;

  const distinctValues = new Set();
  const colCfg = resolveColConfig(rawCol);
  const fieldName = colCfg?.key || colCfg?.i || rawCol;
  const arrayIdx = isNumericString(rawCol) ? Number(rawCol) : typeof colCfg?.i === 'number' ? colCfg.i : -1;
  sourceData.forEach((row) => {
    let val;

    // ✅ FIX: Handle both array and object row formats
    if (typeof row === 'object' && !Array.isArray(row)) {
      // Object format - use field name
      val = row[fieldName];
    } else {
      // Array format (legacy) - use index
      val = arrayIdx >= 0 ? row[arrayIdx] : undefined;
    }

    if (val) distinctValues.add(String(val).trim());
  });

  const sortedValues = [...distinctValues].sort((a, b) => b.localeCompare(a));
  const limit = window.A?.getConfig?.('filter_datalist_limit') ?? 500;
  setDataList('filter-datalist', sortedValues.slice(0, limit));
  setVal('filter-val', '');
}

/**
 * ✅ OPTIMIZED: Render option list based on COLL_MANIFEST role-based access control
 * Displays only collections that:
 * 1. Are defined in COLL_MANIFEST for current user's role
 * 2. Have data available in APP_DATA (supports both object & array formats)
 *
 * @param {object} [data] - Source data object (defaults to APP_DATA)
 */
function initBtnSelectDataList(data) {
  if (!data) data = APP_DATA;
  const selectElem = getE('btn-select-datalist');
  if (!selectElem) return;

  selectElem.innerHTML = '';
  let hasOption = false;

  // ✅ Use COLL_MANIFEST to determine allowed collections by role
  const userRole = CURRENT_USER?.role || 'sale';
  const allowedCollections = (COLL_MANIFEST && COLL_MANIFEST[userRole]) || [];

  const mappedKeys = A.DB.schema.getCollectionNames(); // Get all collection keys from schema
  allowedCollections.forEach((key) => {
    const label = mappedKeys?.[key] || key; // Get display label for collection
    const hasObjectData = data && data[key] && Object.values(data[key]).length > 0;
    if (hasObjectData) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      selectElem.appendChild(opt);
      hasOption = true;
    }
  });
  if (!hasOption) {
    selectElem.innerHTML = '<option>-- Trống --</option>';
    selectElem.disabled = true;
  } else {
    selectElem.disabled = false;
    if (data['bookings']) {
      selectElem.value = 'bookings';
      debounce(applyGridSorter, 250)(['desc']);
    }
  }
}

// =========================================================================
// 8. DASHBOARD RENDERER (Logic vẽ biểu đồ)
// =========================================================================

function initDashboard(config) {
  if (CURRENT_USER?.role === 'acc' || CURRENT_USER?.role === 'acc_thenice') return;
  const today = new Date();
  setVal('dash-filter-from', new Date(today.getFullYear(), today.getMonth(), 1));
  setVal('dash-filter-to', new Date(today.getFullYear(), today.getMonth() + 1, 0));

  setupMonthSelector(); // Cần hàm setupMonthSelector (giữ lại từ code cũ)
  if (!config) config = localStorage.getItem('dashTables') ? JSON.parse(localStorage.getItem('dashTables')) : null;
  // Gán sự kiện Update Dashboard
  const dashBtn = getE('btn-dash-update');
  if (dashBtn) dashBtn.onclick = () => runFnByRole('renderDashboard', config);
}

function renderDashboard(config) {
  if (!APP_DATA || !APP_DATA.bookings) return;

  try {
    // Render các bảng con dựa theo config
    // Nếu config.table1/2/3 có giá trị đặc biệt (BK_...) thì gọi hàm render tương ứng
    // Nếu không có hoặc là giá trị cũ thì dùng mặc định

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
        default:
        // Mặc định theo logic cũ nếu không khớp option mới
        // if (tableId === 'tbl-dash-1') renderDashTable1();
        // else if (tableId === 'tbl-dash-2') renderDashTable2();
        // else if (tableId === 'tbl-dash-3') renderDashTable3();
      }
    };

    renderByOption(config?.table1 ?? 'BK_SAP_DEN', 'tbl-dash-1');
    renderByOption(config?.table2 ?? 'BK_CHO_CODE', 'tbl-dash-2');
    renderByOption(config?.table3 ?? 'BK_MOI', 'tbl-dash-3');

    renderAggregates(); // Gom logic bảng 3,4 vào đây
  } catch (err) {
    Opps('renderDashboard Error:', err);
  }
}

/**
 * Trả về tiêu đề và ID badge tương ứng với tên bảng dashboard
 */
function updateDashHeaderStats(tableName, tableId, count = 0, total = 0) {
  let badgeDays = window.A?.getConfig?.('dash_badge_days') || 30;
  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));
  let today = new Date();
  const dFromCalc = Math.floor((today - dFrom) / (1000 * 60 * 60 * 24));
  const isEarlier = dFromCalc >= 1;
  const dToCalc = Math.floor((dTo - today) / (1000 * 60 * 60 * 24));
  const isFuther = dToCalc >= 1;
  const configs = {
    BK_MOI: { title: `Booking Mới (${isEarlier ? dFromCalc : badgeDays} Ngày)`, badgeClass: 'planning' },
    BK_XIN_REVIEW: { title: `Booking Xin Review (${isEarlier ? dFromCalc : badgeDays} Ngày)`, badgeClass: 'completed' },
    BK_SAP_DEN: { title: `Booking Sắp Đến (${isFuther ? dToCalc : badgeDays} Ngày)`, badgeClass: 'confirmed' },
    BK_DANG_O: { title: 'Booking Đang Ở', badgeClass: 'in-progress' },
    BK_CHO_CODE: { title: `Booking Chờ Code Phòng (${dToCalc > Number(badgeDays) * 5 ? dToCalc : Number(badgeDays) * 5 || 365} Ngày)`, badgeClass: 'pending' },
    BK_CHO_THANH_TOAN: { title: `Booking Cần Thanh Toán (${dToCalc > Number(badgeDays) * 5 ? dToCalc : Number(badgeDays) * 5 || 90} Ngày)`, badgeClass: 'pending' },
  };
  getE(tableId).setAttribute('data-tabname', tableName);
  let tableNo = tableId ? tableId.split('-').pop() : null;
  const badgeId = `badge-dash-tbl-${tableNo || 1}`;
  let text;
  if (total && total > 0) text = `Tổng Cộng: ${formatNumber(total)} / Số Lượng: ${count}`;
  else text = `${count} BK`;
  setClass(badgeId, configs[tableName]?.badgeClass || 'secondary', true);
  setVal(badgeId, text);

  const card = document.querySelector(`#${tableId}`).closest('.card');
  if (card) {
    const titleEl = card.querySelector('.card-header small');
    if (titleEl) titleEl.textContent = configs[tableName]?.title || 'Danh sách';
  }
}

/**
 * RENDER HELPER: Tạo tiêu đề cho bảng Dashboard
 */
function _renderDashThead(tableId, columns = []) {
  const thead = document.querySelector(`#${tableId} thead`);
  if (!thead) return;

  let html = '<tr>';
  columns.forEach((col) => {
    const label = col.label || col.key.toUpperCase();
    const className = col.class || 'text-center';
    html += `<th class="${className}">${label}</th>`;
  });
  html += '</tr>';
  thead.innerHTML = html;
}

/**
 * RENDER HELPER: Tạo dòng cho bảng Dashboard
 */
function _createDashRow(row, columns = []) {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.id = row.id;

  let html = '';
  columns.forEach((col) => {
    let val = row[col.key] || '';
    let className = col.class || 'text-center';

    if (col.format === 'date') val = formatDateVN(val);
    if (col.format === 'money') val = formatNumber(val);
    if (col.format === 'status') val = `<at-status status="${val}"></at-status>`;

    if (col.key === 'balance') {
      const bal = getNum(row.total_amount) - getNum(row.deposit_amount);
      val = formatNumber(bal);
      if (bal > 0) className += ' text-danger fw-bold';
      else className += ' text-success';
    }

    html += `<td class="${className}">${val}</td>`;
  });

  tr.innerHTML = html;
  return tr;
}

/**
 * OPTION: Booking Mới (BK_MOI)
 */
function renderDashTable_New(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return 0;
  tbody.innerHTML = '';
  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));
  let today = new Date();
  let limitDate = new Date();
  today.setHours(0, 0, 0, 0);
  const badgeDays = window.A?.getConfig?.('dash_badge_days') ?? 30;
  if (dFrom && dTo && dFrom < today) {
    today = dTo > today ? today : dTo;
    limitDate = dFrom;
  } else {
    limitDate.setDate(today.getDate() - badgeDays);
  }
  let count = 0;
  let totalAmount = 0;

  const cols = [
    { key: 'id', label: 'ID', class: 'text-center' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary text-center' },
    { key: 'created_at', label: 'Ngày Tạo', format: 'date' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money', class: 'text-center text-success' },
    { key: 'deposit_amount', label: 'Đặt Cọc', format: 'money' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
    { key: 'staff_id', label: 'NV', class: 'text-center' },
  ];

  _renderDashThead(tableId, cols);

  const bookings = Object.values(APP_DATA.bookings)
    .filter((b) => {
      const dDate = new Date(b.created_at || b.start_date);
      return dDate >= limitDate && dDate <= today;
    })
    .sort((a, b) => new Date(b.created_at || b.start_date) - new Date(a.created_at || a.start_date));

  bookings.forEach((row) => {
    count++;
    totalAmount += Number(row.total_amount);
    tbody.appendChild(_createDashRow(row, cols));
  });
  updateDashHeaderStats(option, tableId, count, totalAmount); // Cập nhật header với count
}

/**
 * OPTION: Booking Xin Review (BK_XIN_REVIEW)
 * Logic: Booking đã kết thúc (end_date < today) trong vòng 7 ngày qua và status là 'Xong BK'
 */
function renderDashTable_Review(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return 0;
  tbody.innerHTML = '';

  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));
  let today = new Date();
  let limitDate = new Date();
  const badgeDays = window.A?.getConfig?.('dash_badge_days') ?? 30;
  if (dFrom && dTo) {
    limitDate = dFrom < limitDate ? dFrom : limitDate.setDate(limitDate.getDate() - badgeDays);
    today = dTo > today ? dTo : today;
  } else {
    limitDate.setDate(today.getDate() - badgeDays);
  }

  const list = Object.values(APP_DATA.bookings)
    .filter((r) => {
      const dEnd = new Date(r.end_date);
      return r.status === 'Xong BK' && dEnd < today && dEnd >= limitDate;
    })
    .sort((a, b) => new Date(a.end_date) - new Date(b.end_date));

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'end_date', label: 'Ngày Về', format: 'date' },
    { key: 'staff_id', label: 'NV', class: 'text-center' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
  ];

  _renderDashThead(tableId, cols);

  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(option, tableId, list.length); // Cập nhật header với count
}

/**
 * OPTION: Booking Sắp Đến (BK_SAP_DEN)
 */
function renderDashTable_Arrival(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return 0;
  tbody.innerHTML = '';
  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));
  let today = new Date();
  let limitDate = new Date();
  today.setHours(0, 0, 0, 0);
  if (dFrom && dTo) {
    today = dFrom < today ? today : dFrom;
    limitDate = dTo > limitDate ? dTo : limitDate;
  } else {
    const badgeDays = window.A?.getConfig?.('dash_badge_days') ?? 14;
    limitDate.setDate(today.getDate() + badgeDays);
  }
  let count = 0;
  let totalAmount = 0;
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'start_date', label: 'Ngày Đi', format: 'date' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money' },
    { key: 'balance', label: 'Còn Lại' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
    { key: 'staff_id', label: 'NV', class: 'text-center' },
  ];

  _renderDashThead(tableId, cols);

  const list = Object.values(APP_DATA.bookings)
    .filter((r) => {
      const dStart = new Date(r.start_date);
      return r.status !== 'Hủy' && dStart >= today && dStart <= limitDate;
    })
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  list.forEach((row) => {
    count++;
    totalAmount += Number(row.total_amount);
    tbody.appendChild(_createDashRow(row, cols));
  });

  updateDashHeaderStats(option, tableId, count, totalAmount); // Cập nhật header với count
}

/**
 * OPTION: Booking Đang Ở (BK_DANG_O)
 */
function renderDashTable_Staying(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return 0;
  tbody.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const list = Object.values(APP_DATA.bookings)
    .filter((r) => {
      const dIn = new Date(r.start_date);
      const dOut = new Date(r.end_date);
      return dIn <= today && dOut >= today && r.status !== 'Hủy';
    })
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'start_date', label: 'Ngày Đi', format: 'date' },
    { key: 'end_date', label: 'Ngày Về', format: 'date' },
    { key: 'staff_id', label: 'NV', class: 'text-center' },
    { key: 'status', label: 'Trạng Thái', format: 'status' },
  ];

  _renderDashThead(tableId, cols);

  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(option, tableId, list.length); // Cập nhật header với count
}

/**
 * OPTION: Booking Chờ Code (BK_CHO_CODE)
 */
function renderDashTable_MissingCode(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return 0;
  tbody.innerHTML = '';

  const bookingsMap = {};
  Object.values(APP_DATA.bookings).forEach((r) => {
    if (r.id) bookingsMap[r.id] = r.customer_full_name;
  });
  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));
  let today = new Date();
  let limitDate = new Date();
  today.setHours(0, 0, 0, 0);
  if (dFrom && dTo && dFrom > today && dTo > today) {
    today = dFrom;
    limitDate = dTo;
  } else {
    const badgeDays = window.A?.getConfig?.('dash_badge_days') ?? 365;
    limitDate.setDate(today.getDate() + Number(badgeDays));
  }

  const list = Object.values(APP_DATA.booking_details)
    .filter((r) => {
      const type = r.service_type;
      const code = r.ref_code;
      const dIn = new Date(r.check_in);
      return (!type || type.trim() === 'Phòng') && !code && dIn >= today && dIn <= limitDate;
    })
    .sort((a, b) => new Date(a.check_in) - new Date(b.check_in));

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_name', label: 'Khách Hàng', class: 'fw-bold text-primary text-truncate' },
    { key: 'hotel_name', label: 'Khách Sạn' },
    { key: 'service_name', label: 'Dịch Vụ' },
    { key: 'check_in', label: 'Ngày Đi', format: 'date' },
  ];

  _renderDashThead(tableId, cols);

  list.forEach((r) => {
    const rowData = {
      ...r,
      customer_name: bookingsMap[r.booking_id] || '---',
    };
    tbody.appendChild(_createDashRow(rowData, cols));
  });
  updateDashHeaderStats(option, tableId, list.length); // Cập nhật header với count
}

/**
 * OPTION: Booking Chờ Thanh Toán (BK_CHO_THANH_TOAN)
 */
function renderDashTable_PendingPayment(tableId, option) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return 0;
  tbody.innerHTML = '';

  const list = Object.values(APP_DATA.bookings).filter((r) => {
    const bal = Number(r.total_amount) - Number(r.deposit_amount);
    return bal > 0 && r.status !== 'Hủy';
  });

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng', class: 'fw-bold text-primary' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money' },
    { key: 'balance', label: 'Còn Lại' },
    { key: 'payment_due_date', label: 'Hạn TT', format: 'date' },
    { key: 'staff_id', label: 'NV', class: 'text-center' },
  ];

  _renderDashThead(tableId, cols);

  list.forEach((row) => tbody.appendChild(_createDashRow(row, cols)));
  updateDashHeaderStats(option, tableId, list.length); // Cập nhật header với count
}

function renderAggregates() {
  if (!APP_DATA || !APP_DATA.bookings) return;
  // Logic Bảng Công nợ Staff
  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));
  const aggStaff = {};

  const bookings = Object.values(APP_DATA.bookings);
  bookings.forEach((row) => {
    const dIn = new Date(row.start_date);
    if (dIn >= dFrom && dIn <= dTo) {
      const total = Number(row.total_amount) || 0;
      const paid = Number(row.deposit_amount) || 0;
      const bal = total - paid;

      let staff = row.staff_id || 'Chưa có NV';
      if (!aggStaff[staff]) aggStaff[staff] = { total: 0, paid: 0, bal: 0 };

      aggStaff[staff].total += total;
      aggStaff[staff].paid += paid;
      aggStaff[staff].bal += bal;
    }
  });

  renderAggTable('tbl-dash-staff', aggStaff, 'sum-staff-bal');
}

function renderAggTable(tblId, dataObj, sumId) {
  const tbody = document.querySelector(`#${tblId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';

  let totalBal = 0;
  const keys = Object.keys(dataObj).sort((a, b) => dataObj[b].bal - dataObj[a].bal);

  keys.forEach((k) => {
    const item = dataObj[k];
    const bal = Number(String(item.bal).replace(/[^0-9-]/g, '')) || 0;
    totalBal += bal;
    const tr = document.createElement('tr');
    const balClass = bal > 0 ? 'text-danger fw-bold' : 'text-success';
    tr.innerHTML = `
			<td>${k}</td>
			<td class="text-end text-muted">${formatNumber(item.total)}</td>
			<td class="text-end text-muted">${formatNumber(item.paid)}</td>
			<td class="text-end ${balClass}">${formatNumber(item.bal)}</td>
		`;
    // Gán sự kiện click lọc theo nhân viên (Batch Edit)
    tr.style.cursor = 'pointer';
    tr.id = item.id || item[0]; // Gán ID cho tr để dễ lấy khi click
    tr.onclick = (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (typeof handleAggClick === 'function') handleAggClick(k, 'staff');
    };
    // Longpress support on mobile (similar to dblclick)
    setupLongPress(tr, (e) => {
      e.preventDefault?.();
      if (typeof handleAggClick === 'function') handleAggClick(k, 'staff');
    });
    tbody.appendChild(tr);
  });
  if (getE(sumId)) setVal(sumId, formatNumber(totalBal));
}

// =========================================================================
// 9. HELPER UI (Month Selector)
// =========================================================================
function setupMonthSelector(id = 'dash-month-select') {
  const sel = getE(id);
  if (!sel) return;
  let html = '<option value="-1">-- Tùy chỉnh --</option>';
  for (let i = 1; i <= 12; i++) {
    html += `<option value="Tháng-${i - 1}">Tháng ${i}</option>`;
  }
  html += `<option value="Quý 1">Quý 1</option><option value="Quý 2">Quý 2</option><option value="Quý 3">Quý 3</option><option value="Quý 4">Quý 4</option>`;
  html += `<option value="Năm Nay">Năm nay</option><option value="Năm Trước">Năm trước</option><option value="Năm Tới">Năm tới</option>`;
  html += `<option value="All">Tất Cả</option><option value="-1">Tùy chọn</option>`;

  sel.innerHTML = html;
  sel.value = 'Năm Nay';

  sel.addEventListener('change', function () {
    const val = this.value;
    const { start, end } = getDateRange(val);
    if (start && end) {
      setVal('dash-filter-from', start);
      setVal('dash-filter-to', end);
    } else {
      setVal('dash-filter-from', '');
      setVal('dash-filter-to', '');
    }
    runFnByRole('renderDashboard');
  });
  A.Event?.trigger(sel, 'change');
}

/**
 * 2. Hàm Render chính (Điều phối)
 */
window.renderDashboard_Op = function () {
  if (!APP_DATA || !APP_DATA.bookings || !APP_DATA.operator_entries) return;

  // Chuẩn bị dữ liệu ngày
  const dFrom = new Date(getVal('dash-filter-from'));
  const dTo = new Date(getVal('dash-filter-to'));

  // --- BẢNG 1: BOOKING MỚI (7 NGÀY QUA) ---
  renderDashTable1_Op();

  // --- BẢNG 2: MISSING SUPPLIER ---
  renderDashTable2_Op();

  // --- BẢNG 3 & 4: CÔNG NỢ (Lọc theo dFrom - dTo) ---
  // Gom nhóm dữ liệu trước để tối ưu
  const aggSupplier = {};
  const aggType = {};
  let totalSupplierBal = 0;
  let totalTypeBal = 0;

  const operatorEntries = Object.values(APP_DATA.operator_entries); // Bỏ header

  operatorEntries.forEach((row) => {
    const dIn = row.check_in ? new Date(row.check_in) : row.start_date ? new Date(row.start_date) : null;

    // Điều kiện lọc ngày (Dựa theo Check-in)
    if (dIn && dIn >= dFrom && dIn <= dTo) {
      // Tính toán tiền
      const cost = getNum(row.total_cost);
      const paid = getNum(row.paid_amount);

      const bal = cost - paid;
      const sid = row.id;
      // 1. Group by Supplier
      let supplier = row.supplier;
      if (!supplier) supplier = '(Chưa có NCC)';

      if (!aggSupplier[supplier]) aggSupplier[supplier] = { cost: 0, paid: 0, bal: 0, list: [] };
      aggSupplier[supplier].cost += cost;
      aggSupplier[supplier].paid += paid;
      aggSupplier[supplier].bal += bal;
      // Lưu lại SID dòng đầu tiên để click nhảy tới (hoặc logic khác tùy bạn)
      aggSupplier[supplier].list.push(sid);

      // 2. Group by Type
      const type = row.service_type || 'Khác';
      if (!aggType[type]) aggType[type] = { cost: 0, paid: 0, bal: 0, list: [] };
      aggType[type].cost += cost;
      aggType[type].paid += paid;
      aggType[type].bal += bal;
      aggType[type].list.push(sid);
    }
  });
  renderAggTable_Op('tbl-dash-supplier', aggSupplier, 'sum-supplier-bal');
  renderAggTable_Op('tbl-dash-type', aggType, 'sum-type-bal');
};

/**
 * Render Bảng 1: Booking Mới
 */
function renderDashTable1_Op() {
  const tableId = 'tbl-dash-1';
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) {
    L._('No tbody found for new bookings table');
    return;
  }
  tbody.innerHTML = '';

  // Lấy giá trị lọc ngày từ form
  const dFromInput = getVal('dash-filter-from');
  const dToInput = getVal('dash-filter-to');
  const dFrom = dFromInput ? new Date(dFromInput) : null;
  const dTo = dToInput ? new Date(dToInput) : null;

  const bookings = Object.values(APP_DATA.bookings);

  let count = 0;
  let totalDeposit = 0;

  const cols = [
    { key: 'id', label: 'ID', class: 'fw-bold text-primary' },
    { key: 'customer_full_name', label: 'Khách Hàng' },
    { key: 'start_date', label: 'Ngày Đi', format: 'date', class: 'text-center' },
    { key: 'status', label: 'Trạng Thái', class: 'small' },
    { key: 'total_amount', label: 'Tổng Tiền', format: 'money', class: 'text-end' },
    { key: 'deposit_amount', label: 'Đặt Cọc', format: 'money', class: 'text-end' },
    { key: 'balance', label: 'Còn Lại', class: 'text-end' },
  ];

  _renderDashThead(tableId, cols);

  bookings.forEach((row) => {
    // Kiểm tra điều kiện lọc theo ngày
    let passDateFilter = true;

    if (row.start_date) {
      const startDate = new Date(row.start_date);

      // Lọc nếu dFrom có giá trị: start_date >= dFrom
      if (dFrom && startDate < dFrom) {
        passDateFilter = false;
      }

      // Lọc nếu dTo có giá trị: start_date <= dTo
      if (dTo && startDate > dTo) {
        passDateFilter = false;
      }
    }

    // Chỉ hiển thị nếu thỏa điều kiện ngày VÀ có deposit
    const depositAmt = getNum(row.deposit_amount);
    const totalAmt = getNum(row.total_amount);
    if (passDateFilter && depositAmt > 0 && depositAmt < totalAmt) {
      count++;
      totalDeposit += depositAmt;
      tbody.appendChild(_createDashRow(row, cols));
    }
  });

  setVal('badge-dash-tbl-1', `Tổng: ${formatNumber(totalDeposit)} | Số BK: ${count}`);
}

/**
 * Render Bảng 2: Missing Supplier
 */
function renderDashTable2_Op() {
  const tableId = 'tbl-dash-2';
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) {
    L._('No tbody found for missing supplier table');
    return;
  }
  tbody.innerHTML = '';

  let details = Object.values(APP_DATA.operator_entries ?? {})
    .filter((r) => !r.supplier || String(r.supplier).trim() === '')
    .sort((a, b) => new Date(b.check_in) - new Date(a.check_in));

  let count = 0;
  let total = 0;

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'customer_full_name', label: 'Khách Hàng' },
    { key: 'service_type', label: 'Loại DV' },
    { key: 'service_name', label: 'Tên DV' },
    { key: 'check_in', label: 'Ngày Đi', format: 'date', class: 'text-center' },
    { key: 'adults', label: 'SL', class: 'text-center' },
    { key: 'total_cost_display', label: 'Tổng Chi Phí', class: 'text-end' },
  ];

  _renderDashThead(tableId, cols);

  details.forEach((row) => {
    // Điều kiện: Supplier rỗng hoặc null
    count++;
    const cost = getNum(row.total_cost || row.total_sale || 0);
    total += cost;

    const rowData = {
      ...row,
      total_cost_display: formatNumber(cost),
    };

    tbody.appendChild(_createDashRow(rowData, cols));
  });
  setVal('badge-missing-supplier', `Tổng Phải Trả: ${formatNumber(total)} | Số Lượt: ${count}`);
}

/**
 * Hàm chung render bảng tổng hợp (Bảng 3 & 4)
 */
function renderAggTable_Op(tableId, dataObj, sumId) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) {
    L._(`No tbody found for table ${tableId}`);
    return;
  }
  tbody.innerHTML = '';
  let totalBal = 0;

  // Chuyển object thành mảng để sort theo Balance giảm dần
  const sortedKeys = Object.keys(dataObj).sort((a, b) => dataObj[b].bal - dataObj[a].bal);

  sortedKeys.forEach((key) => {
    const item = dataObj[key];
    totalBal += item.bal;

    const tr = document.createElement('tr');
    // Highlight nếu còn nợ nhiều
    const balClass = item.bal > 0 ? 'text-danger fw-bold' : 'text-success';

    tr.innerHTML = `
			<td>${key} <span class="text-muted small">(${item.list.length})</span></td>
			<td class="text-end text-muted">${formatNumber(item.cost)}</td>
			<td class="text-end text-muted">${formatNumber(item.paid)}</td>
			<td class="text-end ${balClass}">${formatNumber(item.bal)}</td>
		`;

    // Khi click vào dòng tổng hợp -> Gọi handleAggClick
    if (item.list.length > 0) {
      tr.style.cursor = 'pointer';

      // Xác định loại lọc dựa trên ID bảng
      const filterType = tableId === 'tbl-dash-supplier' ? 'supplier' : 'type';

      // Gán sự kiện
      tr.onclick = (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        if (!isCtrl) return;
        if (typeof handleAggClick === 'function') {
          handleAggClick(key, filterType);
        }
      };
    }

    tbody.appendChild(tr);
  });

  if (getE(sumId)) setVal(sumId, formatNumber(totalBal));
}

function renderDashboard_Acc() {
  if (!window.AccountantCtrl) {
    L._('Modue kế toán chưa được tải. Vui lòng thử lại sau.', 'warning');
    return;
  }
}

function renderDashboard_Acc_thenice() {
  if (!window.AccountantCtrl) {
    L._('Modue kế toán chưa được tải. Vui lòng thử lại sau.', 'warning');
    return;
  }
}
