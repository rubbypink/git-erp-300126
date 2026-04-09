import { createFormBySchema, loadFormDataSchema, DB_SCHEMA } from '/src/js/modules/db/DBSchema.js';
import PriceImportAI from '../prices/M_ImportPriceAI.js';
import ATable from './ATable.js';

const UI_RENDERER = {
  renderedTemplates: {},
  currentSaveHandler: null,
  COMPONENT_PATH: '/src/components/',
  htmlCache: {},

  // Render Dashboard & Load Data
  init: async function (moduleManager) {
    await Promise.all([]);
    const user = A.getState('user');
    const role = user ? user.role : CURRENT_USER.role;
    L._('UI: User Role:', role);
    if (!['acc', 'acc_thenice', 'ketoan'].includes(role)) {
      const [headerModule, chromeMenu, footerModule] = await Promise.all([moduleManager.loadModule('ErpHeaderMenu'), moduleManager.loadModule('ChromeMenuController', false), moduleManager.loadModule('ErpFooterMenu'), this.renderTemplate('body', 'tpl_all.html', true, '.app-container')]);
      if (headerModule) new headerModule();
      A.call('ChromeMenuController', 'init', role);
      const mainErpFooter = new footerModule('erp-main-footer');
      mainErpFooter.init();
    } else {
      const [headerModule, chromeMenu] = await Promise.all([moduleManager.loadModule('ErpHeaderMenu'), moduleManager.loadModule('ChromeMenuController', false), this.renderTemplate('body', 'tpl_all.html', true, '.app-container')]);
      if (headerModule) new headerModule();
      A.call('ChromeMenuController', 'init', role);
    }

    L._('[UI MODULE]✅ UI Initialization completed.');
  },

  renderMainLayout: async function (source = 'main_layout.html', containerSelector = '#main-app') {
    let finalSourcePath = source;

    // Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
    if (source?.endsWith('.html') && !source.includes('/')) {
      finalSourcePath = this.COMPONENT_PATH + source;
    }
    const container = document.querySelector(containerSelector);
    if (!container) {
      console.error('❌ Không tìm thấy container: ' + containerSelector);
      return;
    }

    try {
      container.innerHTML = ''; // Xóa nội dung cũ nếu có
      // 1. Lấy nội dung template (Sử dụng cache nếu đã tải)
      let html;
      if (this.htmlCache[finalSourcePath]) {
        html = this.htmlCache[finalSourcePath];
      } else {
        const response = await fetch(finalSourcePath);
        if (!response.ok) throw new Error(`Không thể tải template tại ${finalSourcePath}: HTTP ${response.status}`);
        html = await response.text();
        this.htmlCache[finalSourcePath] = html; // Lưu cache
      }

      // 2. Chèn vào đầu container (afterbegin)
      // 'afterbegin' giúp layout chính (Sidebar/Header) luôn nằm trên cùng
      // trước khi các module Sales/Op render dữ liệu vào bên trong.
      container.insertAdjacentHTML('afterbegin', html);

      L._('✅ Đã render Main Layout thành công', 'success');
    } catch (error) {
      L._('🔥 Lỗi Render Layout: ' + error.message, 'danger');
    } finally {
      showLoading(false);
    }
  },

  /**
   * HÀM RENDER ĐA NĂNG (SMART RENDER)
   * @param {string} targetId - ID của container cha (hoặc 'body')
   * @param {string} source - Có thể là DOM ID ('tmpl-form') HOẶC File Path ('form.html')
   * @param {boolean} force - True: Bắt buộc render lại (xóa cũ)
   * @param {string} positionRef - Selector của phần tử mốc để chèn (dùng khi insertAdjacent)
   * @param {string} mode - 'replace' (ghi đè), 'append' (nối đuôi), 'prepend' (lên đầu)
   */
  renderTemplate: async function (targetId, source, force = false, positionRef = null, mode = 'replace') {
    // 1. CHUẨN HÓA SOURCE KEY (QUAN TRỌNG NHẤT)
    // Phải xác định unique key ngay từ đầu để check và save thống nhất
    let finalSourcePath = source;

    // Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
    if (source?.endsWith('.html') && !source.includes('/')) {
      finalSourcePath = this.COMPONENT_PATH + source;
    }

    // 2. Guard Clause: Kiểm tra dựa trên FINAL PATH
    if (this.renderedTemplates[finalSourcePath] && !force && mode === 'replace') {
      return true; // Trả về true giả lập là đã xong
    }

    // 3. Xác định nội dung (Content)
    let contentFragment = null;

    // CASE A: Source là File Path (.html)
    if (finalSourcePath.endsWith('.html')) {
      try {
        let htmlString = '';

        // Kiểm tra Cache RAM (Nội dung file)
        if (this.htmlCache[finalSourcePath]) {
          htmlString = this.htmlCache[finalSourcePath];
        } else {
          // 1. Fetch Network với validations
          const response = await fetch(finalSourcePath);

          // 1a. Kiểm tra HTTP Status
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} - Không tìm thấy file: ${finalSourcePath}`);
          }

          // 1b. Kiểm tra Content-Type (phải là HTML)
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            console.warn(`⚠️ Content-Type không phải HTML: ${contentType} cho file ${finalSourcePath}`);
          }

          htmlString = await response.text();

          // 1c. Xác nhận không phải fallback index.html
          // Note: SPA thường return index.html với status 200 để xử lý routing
          const isIndexFallback = htmlString.includes('id="app-launcher"') || htmlString.includes('id="main-app"') || (htmlString.includes('<!DOCTYPE html>') && !htmlString.includes('<template') && !htmlString.includes('tpl-'));

          if (isIndexFallback) {
            throw new Error(`Fallback index.html (SPA) thay vì template component: ${finalSourcePath}`);
          }

          // 1d. Xác nhận nội dung không rỗng
          if (!htmlString.trim()) {
            throw new Error(`File trống: ${finalSourcePath}`);
          }

          this.htmlCache[finalSourcePath] = htmlString; // Lưu cache nội dung
        }

        // 2. Tạo div ảo để chứa HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        // 3. Tạo Fragment để chứa kết quả
        contentFragment = document.createDocumentFragment();

        // 4. Chuyển TOÀN BỘ nội dung từ tempDiv sang Fragment
        // Cách này sẽ giữ nguyên mọi thứ: div, span, và cả thẻ <template>
        while (tempDiv.firstChild) {
          contentFragment.appendChild(tempDiv.firstChild);
        }
      } catch (e) {
        console.error(`❌ Lỗi tải file ${finalSourcePath}:`, e.message);
        return false;
      }
    }
    // CASE B: Source là DOM ID (<template id="...">)
    else {
      const templateEl = document.getElementById(source); // ID thì dùng source gốc
      if (!templateEl) {
        return false;
      }
      contentFragment = templateEl.content.cloneNode(true);
      // Với ID, ta dùng ID làm key lưu trữ
      finalSourcePath = source;
    }

    // 4. Security Check & Container Handling
    let container;

    // --- SCENARIO 1: Render vào BODY ---
    if (targetId === 'body') {
      container = document.body;

      if (positionRef) {
        const refElement = container.querySelector(positionRef);
        if (refElement) {
          refElement.parentNode.insertBefore(contentFragment, refElement.nextSibling);
        } else {
          container.appendChild(contentFragment);
        }
      } else {
        // Chèn trước script đầu tiên để tránh lỗi JS loading
        const firstScript = container.querySelector('script');
        container.insertBefore(contentFragment, firstScript || container.lastChild);
      }
    }
    // --- SCENARIO 2: Render vào Container ID ---
    else {
      container = document.getElementById(targetId);
      if (!container) {
        console.warn(`⚠️ Container not found: ${targetId}`);
        return contentFragment;
      }

      if (mode === 'replace') {
        container.innerHTML = '';
        container.appendChild(contentFragment);
      } else if (mode === 'prepend') {
        container.insertBefore(contentFragment, container.firstChild);
      } else {
        // append
        container.appendChild(contentFragment);
      }
    }
    // 5. Đánh dấu Flag (Sử dụng KEY ĐÃ CHUẨN HÓA)
    this.renderedTemplates[finalSourcePath] = true;
    return true;
  },
  // Hàm được gọi khi bấm chuyển Tab (Hoặc Init)
  lazyLoad: function (tabId) {
    const tabEl = getE(tabId);
    if (!tabEl) {
      L._(`Không tìm thấy Tab ID: ${tabId}`, 'error');
      return;
    }
    if (tabEl.dataset.isLoaded === 'true' && tabEl.innerHTML.trim() !== '') {
      return;
    }
    const tmplId = tabId.replace('tab-', 'tmpl-');

    // 1. Luôn đảm bảo HTML được render trước
    this.renderTemplate(tabId, tmplId, false);

    // 2. Logic khởi tạo Component (Chạy ngay cả khi chưa có Data)
    // Ví dụ: Tạo Datepicker, Gán sự kiện click nút update...
    if (tabId === 'tab-dashboard') {
      // Setup tháng, ngày lọc... (Cần chạy ngay để user thấy form lọc)
      if (typeof initDashboard === 'function') initDashboard();
    }
    if (tabId === 'tab-form') {
      setupMainFormUI(APP_DATA.lists);
      this.initTableResizer('detail-tbody');
    }
    // if (tabId === 'tab-price-pkg') {
    //   // Vào tab list thì check xem có data chưa để vẽ bảng
    //   const tbody = document.getElementById('grid-body');
    //   if (APP_DATA && Object.values(APP_DATA.bookings) && tbody && tbody.innerHTML.trim() === '') {
    //     renderTableByKey('bookings');
    //   }
    // }

    tabEl.dataset.isLoaded = 'true';
  },

  /**
   * Hàm thiết lập hành động cho nút Save của Modal
   * @param {Function} newActionFunc - Hàm logic bạn muốn chạy khi bấm Save
   */
  bindBtnEvent: function (newActionFunc, btnId, btnText = null) {
    let btn = getE(btnId);

    if (!btn) {
      L._(`Không tìm thấy nút nào của ${btnId} trong DOM!`, 'error');
      return;
    }

    // Gỡ bỏ event handler cũ nếu có
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    btn = newBtn;
    if (btnText) btn.textContent = btnText;

    // 2. SETUP: Gán hàm mới
    // Lưu ý: Ta nên bọc hàm logic trong 1 khối try-catch để an toàn
    this.currentSaveHandler = async function (e) {
      // Prevent Default nếu nút nằm trong form
      e.preventDefault();

      // Disable nút để tránh bấm liên tục (Double Submit)
      btn.disabled = true;
      const currentBtnHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

      try {
        // Chạy hàm logic được truyền vào
        await newActionFunc(e);
      } catch (err) {
        Opps('Lỗi hàm bindBtnEvent: ', err);
        logA('Có lỗi xảy ra: ' + err.message);
      } finally {
        // Mở lại nút sau khi xong (hoặc tùy logic đóng modal của bạn)
        btn.disabled = false;
        btn.innerHTML = currentBtnHTML;
      }
    };

    btn.addEventListener('click', this.currentSaveHandler);
    L._('Đã gán sự kiện mới cho Btn Save Modal.');
  },

  initBtnSelectDataList: function (data) {
    const selectElem = getE('btn-select-datalist');
    if (!data) data = APP_DATA;
    if (!selectElem) return;
    selectElem.innerHTML = '';
    let hasOption = false;
    const userRole = CURRENT_USER?.role || 'sale',
      allowedCollections = COLL_MANIFEST?.[userRole] || [],
      mappedKeys = A.DB.schema.getCollectionNames();
    allowedCollections.forEach((key) => {
      if (data[key] && Object.values(data[key]).length > 0) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = mappedKeys?.[key] || key;
        selectElem.appendChild(opt);
        hasOption = true;
        if (key === 'bookings') selectElem.selectedIndex = selectElem.options.length - 1;
      }
    });
    selectElem.disabled = false;
  },

  initTableResizer: function (tableId) {
    if (typeof TableResizeManager === 'undefined') return;

    if (!this._debouncedResizer) {
      this._debouncedResizer = debounce((tid) => {
        try {
          const resizer = new TableResizeManager(tid);
          resizer.init();
        } catch (e) {
          console.warn('[UI_RENDERER] Resizer init failed:', e);
        }
      }, 300);
    }
    this._debouncedResizer(tableId);
  },

  stableSort: function (data, currentTable, sort) {
    if (!currentTable) currentTable = GRID_STATE.currentTable;
    if (!sort) sort = GRID_STATE.sort;
    if (!data) data = GRID_STATE.filteredData;
    let sorted = [...data];
    const modifier = sort.dir === 'asc' ? 1 : -1;
    const DATE_PRIORITY = ['start_date', 'check_in', 'transaction_date', 'created_at', 'updated_at'];

    const _compare = (va, vb, fmt) => {
      if (fmt === 'date') return parseDateVal(va) - parseDateVal(vb);
      if (fmt === 'money' || fmt === 'number') {
        const toNum = (v) => (typeof getNum === 'function' ? getNum(v) : Number(String(v).replace(/[^0-9.-]+/g, '')) || 0);
        return toNum(va) - toNum(vb);
      }
      return String(va ?? '')
        .toLowerCase()
        .localeCompare(String(vb ?? '').toLowerCase(), 'vi');
    };

    const _stableSort = (a, b, fieldName, format) => {
      let cmp = _compare(a?.[fieldName] ?? '', b?.[fieldName] ?? '', format) * modifier;
      if (cmp !== 0) return cmp;
      for (const f of DATE_PRIORITY) {
        if (f === fieldName) continue;
        const valA = a?.[f],
          valB = b?.[f];
        if (valA || valB) {
          const dateCmp = (parseDateVal(valA) - parseDateVal(valB)) * modifier;
          if (dateCmp !== 0) return dateCmp;
        }
      }
      return String(a?.id || '').localeCompare(String(b?.id || ''), 'en') * modifier;
    };

    if (sort.column) {
      const resolveColConfig = (raw) => GRID_COLS?.find((c) => String(c?.i) === raw || String(c?.key) === raw) || null;
      const colConfig = resolveColConfig(sort.column);
      const fieldName = colConfig?.key || colConfig?.i || sort.column;
      const format = colConfig?.fmt ?? 'text';

      const isSecondary = A.DB?.schema?.[currentTable]?.isSecondaryIndex === true;
      if (isSecondary) {
        const groupByField = A.DB.schema[currentTable]?.groupBy ?? 'id';
        sorted.sort((a, b) => {
          const ga = String(a?.[groupByField] ?? '');
          const gb = String(b?.[groupByField] ?? '');
          const groupCmp = ga.localeCompare(gb, 'vi') * modifier;
          if (groupCmp !== 0) return groupCmp;
          return _stableSort(a, b, fieldName, format);
        });
      } else {
        sorted.sort((a, b) => _stableSort(a, b, fieldName, format));
      }
    }
    return sorted;
  },
  resetForm: function (e) {
    const form = e.target.closest('form') || $('form', getE('dynamic-modal-body'));
    if (form) {
      form.reset();
    }
  },
  renderModal: async function (tmplId, title, btnSaveHandler = null, btnResetHandler = null, opts = {}) {
    try {
      const modalContent = await this.renderTemplate(null, tmplId);

      A.Modal.render(modalContent, title, opts);
      if (btnSaveHandler) {
        A.Modal.setSaveHandler(btnSaveHandler, 'Lưu');
      }
      if (btnResetHandler) {
        A.Modal.setResetHandler(btnResetHandler);
      } else A.Modal.setResetHandler(this.resetForm, 'Đặt Lại');
      return A.Modal;
    } catch (e) {
      Opps('Lỗi trong renderModal: ', e);
    }
  },
  renderForm: async function (collectionName, dataorId = null, title = null, opts = {}) {
    const html = await createFormBySchema(collectionName);
    if (!title) title = `Chỉnh sửa ${A.Lang?.t(collectionName)} ${dataorId ? '(ID: ' + dataorId + ')' : ''}`;
    A.Modal.render(html, title, opts); // Có thể tùy chỉnh title theo collection hoặc formId nếu muốn
    A.Modal.show();
    if (dataorId) {
      const formId = `${collectionName}-schema-form`;
      // Tải dữ liệu vào form trước khi render modal
      await loadFormDataSchema(formId.toString(), dataorId);
    }
    A.Modal.setFooter(false);
  },
  renderBtn(label, action = '', color = 'primary', icon = '', isSmall = true) {
    const sizeClass = isSmall ? 'btn-sm' : '';
    const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i> ` : '';

    return `
			<button 
				type="button" 
				class="btn btn-${color} ${sizeClass} d-inline-flex align-items-center gap-2"
				onclick="${action}"
				aria-label="${label}"
			>
				${iconHtml}
				<span>${label}</span>
			</button>`;
  },
  renderFormInput(label, id, type = 'text', value = '', isSmall = true, placeholder = '') {
    const sizeClass = isSmall ? 'form-control-sm' : '';
    return `
		  <div class="mb-2">
			<label for="${id}" class="form-label fw-bold mb-0 ${isSmall ? 'small' : ''}">${label}</label>
			<input 
			  type="${type}" 
			  class="form-control ${sizeClass}" 
			  id="${id}" 
			  value="${value}" 
			  placeholder="${placeholder}"
			>
		  </div>`;
  },

  /**
   * TẠO BẢNG HIỂN THỊ DỮ LIỆU NHANH (DYNAMIC TABLE)
   * @param {string} containerId - ID của container chứa bảng
   * @param {Object|Array} data - Dữ liệu object hoặc mảng object
   * @param {Object} opts - Tùy chọn: { mode: 'replace', colName: '', contextMenu: false, pageSize: 25, sorter: false, fs: 14, header: false, title: '', footer: false, groupBy: false }
   */

  createTable: function (containerId, opts = {}) {
    try {
      const table = new ATable(containerId, opts);
    } catch (error) {
      Opps(`[UI_RENDERER] createTable lỗi: ${error.message}`, error);
    }
  },

  // iniGroupByOps: function (containerId) {
  //   if (containerId) {
  //     const select = getE('group-by-tab-data-tbl');
  //     if (!select) return;
  //     select.innerHTML = '';
  //     const headers = STATE_TABLE?.['tab-data-tbl'].fieldConfigs;
  //     const optDefault = document.createElement('option');
  //     optDefault.value = '';
  //     optDefault.textContent = '-- Group --';
  //     select.appendChild(optDefault);
  //     select.options[0].selected = true;
  //     Object.values(headers).forEach((col) => {
  //       const opt = document.createElement('option');
  //       opt.value = col.name;
  //       opt.textContent = col.displayName;
  //       select.appendChild(opt);
  //       // if (col.name === 'booking_id') {
  //       //   select.selectedIndex = select.options.length - 1;
  //       //   select.dispatchEvent(new Event('change'));
  //       // }
  //     });
  //   }
  // },

  // /**
  //  * Render các dòng dữ liệu cho bảng
  //  * @private
  //  */
  // _renderTableRows: function (items, headers, fieldConfigs = {}, containerId = '') {
  //   const tblData = containerId ? window.STATE_TABLE?.[containerId] : null;
  //   const groupByField = tblData?.groupByField;

  //   if (groupByField) {
  //     return this._renderGroupedRows(items, headers, fieldConfigs, groupByField);
  //   }

  //   return items
  //     .map((item) => {
  //       const itemId = item.id || item.uid || '';
  //       const itemAttr = itemId ? `data-item="${itemId}"` : '';
  //       return `
  //       <tr ${itemAttr}>
  //         ${headers
  //           .map((h) => {
  //             let val = item[h] !== undefined && item[h] !== null ? item[h] : '';
  //             const config = fieldConfigs[h] || {};

  //             // Format dữ liệu dựa trên type trong schema
  //             if (config.type === 'date' && val) val = formatDateVN(val);
  //             if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

  //             const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
  //             const isLong = displayVal.length > 50;
  //             const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
  //             const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';

  //             return `<td data-field="${h}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${escapeHtml(shortVal)}</td>`;
  //           })
  //           .join('')}
  //       </tr>`;
  //     })
  //     .join('');
  // },

  // /**
  //  * Render các dòng dữ liệu đã được gom nhóm
  //  * @private
  //  */
  // _renderGroupedRows: function (items, headers, fieldConfigs, groupByField) {
  //   const groups = {};
  //   items.forEach((item) => {
  //     const groupVal = item[groupByField] !== undefined && item[groupByField] !== null ? String(item[groupByField]) : 'Khác';
  //     if (!groups[groupVal]) groups[groupVal] = [];
  //     groups[groupVal].push(item);
  //   });

  //   let html = '';
  //   const colSpan = headers.length;

  //   Object.entries(groups).forEach(([groupName, groupItems]) => {
  //     // Render Group Header
  //     const displayGroupName = fieldConfigs[groupByField]?.type === 'date' ? formatDateVN(groupName) : groupName;
  //     html += `
  //       <tr class="table-info fw-bold text-start" style="cursor:pointer" onclick="A.UI.toggleGroup(this)">
  //         <td colspan="${colSpan}" class="ps-3">
  //           <i class="fas fa-chevron-down me-2 group-icon"></i> ${displayGroupName} (${groupItems.length} dòng)
  //         </td>
  //       </tr>`;

  //     // Render Group Items
  //     groupItems.forEach((item) => {
  //       const itemId = item.id || item.uid || '';
  //       const itemAttr = itemId ? `data-item="${itemId}"` : '';
  //       html += `
  //         <tr ${itemAttr}>
  //           ${headers
  //             .map((h) => {
  //               let val = item[h] !== undefined && item[h] !== null ? item[h] : '';
  //               const config = fieldConfigs[h] || {};

  //               if (config.type === 'date' && val) val = formatDateVN(val);
  //               if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

  //               const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
  //               const isLong = displayVal.length > 50;
  //               const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
  //               const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';

  //               return `<td data-field="${h}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${escapeHtml(shortVal)}</td>`;
  //             })
  //             .join('')}
  //         </tr>`;
  //     });
  //   });

  //   return html;
  // },
  // /**
  //  * Ẩn/Hiện các dòng trong một nhóm
  //  */
  // toggleGroup: function (headerRow) {
  //   let next = headerRow.nextElementSibling;
  //   const icon = headerRow.querySelector('.group-icon');
  //   let isHiding = false;

  //   // Kiểm tra trạng thái của dòng đầu tiên để quyết định ẩn hay hiện
  //   if (next && !next.classList.contains('table-info')) {
  //     isHiding = !next.classList.contains('d-none');
  //   }

  //   while (next && !next.classList.contains('table-info')) {
  //     if (isHiding) next.classList.add('d-none');
  //     else next.classList.remove('d-none');
  //     next = next.nextElementSibling;
  //   }

  //   if (icon) {
  //     icon.className = isHiding ? 'fas fa-chevron-right me-2 group-icon' : 'fas fa-chevron-down me-2 group-icon';
  //   }
  // },

  // /**
  //  * Render Footer cho bảng dựa trên aggregate config
  //  * @private
  //  */
  // _renderTableFooter: function (items, headers, fieldConfigs, colName) {
  //   const aggregate = DB_SCHEMA[colName]?.aggregate || {};
  //   const sumFields = aggregate.sum || [];
  //   const uniqueFields = aggregate.unique || [];

  //   return `
  //     <tr>
  //       ${headers
  //         .map((h) => {
  //           let result = '';
  //           if (sumFields.includes(h)) {
  //             const total = items.reduce((acc, item) => {
  //               const val = typeof getNum === 'function' ? getNum(item[h]) : parseFloat(String(item[h] || '0').replace(/[^0-9.-]+/g, '')) || 0;
  //               return acc + val;
  //             }, 0);
  //             result = `<div class="small text-muted">Tổng:</div><div class="text-primary">${formatNumber(total)}</div>`;
  //           } else if (uniqueFields.includes(h)) {
  //             const uniqueCount = new Set(items.map((item) => item[h]).filter((v) => v !== undefined && v !== null && v !== '')).size;
  //             result = `<div class="small text-muted"></div><div class="text-success">${uniqueCount}</div>`;
  //           }
  //           return `<td class="bg-light sticky-bottom" style="bottom: 0; z-index: 2;">${result}</td>`;
  //         })
  //         .join('')}
  //     </tr>`;
  // },

  // /**
  //  * Render thanh phân trang
  //  * @private
  //  */
  // _renderPagination: function (containerId, totalItems, pageSize, currentPage) {
  //   const totalPages = Math.ceil(totalItems / pageSize) || 1;
  //   const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  //   const endIdx = Math.min(currentPage * pageSize, totalItems);

  //   let pagesHtml = '';
  //   // Hiển thị tối đa 5 nút trang xung quanh trang hiện tại
  //   let startPage = Math.max(1, currentPage - 2);
  //   let endPage = Math.min(totalPages, startPage + 4);
  //   if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  //   for (let i = startPage; i <= endPage; i++) {
  //     pagesHtml += `
  //       <li class="page-item ${i === currentPage ? 'active' : ''}">
  //         <a class="page-link" ${currentPage === 1 ? 'disabled' : ''} href="javascript:void(0)" onclick="A.UI.changeTablePage('${containerId}', ${i})">${i}</a>
  //       </li>`;
  //   }

  //   return `
  //     <div class="d-flex justify-content-between align-items-center mt-0 px-2">
  //       <small class="text-muted">Hiển thị ${startIdx}-${endIdx} / ${totalItems} dòng</small>
  //       <nav aria-label="Table pagination">
  //         <ul class="pagination pagination-sm mb-0">
  //           <li class="page-item ${currentPage === 1 ? 'd-none' : ''}">
  //             <a class="page-link" href="javascript:void(0)" onclick="A.UI.changeTablePage('${containerId}', ${currentPage - 1})">Trước</a>
  //           </li>
  //           ${pagesHtml}
  //           <li class="page-item ${currentPage === totalPages || totalPages === 1 ? 'd-none' : ''}">
  //             <a class="page-link" href="javascript:void(0)" onclick="A.UI.changeTablePage('${containerId}', ${currentPage + 1})">Sau</a>
  //           </li>
  //         </ul>
  //       </nav>
  //     </div>`;
  // },

  // /**
  //  * Chuyển trang cho bảng
  //  * @param {string} containerId
  //  * @param {number} page
  //  */
  // changeTablePage: function (containerId, page) {
  //   const tblData = window.STATE_TABLE?.[containerId];
  //   if (!tblData) return;

  //   const { filteredData, opts, fieldConfigs: cachedConfigs } = tblData;
  //   const pageSize = opts.pageSize || A.getConfig('table_page_size') || 25;
  //   const totalItems = filteredData.length;
  //   const totalPages = Math.ceil(totalItems / pageSize) || 1;

  //   if (page < 1 || !page) page = 1;
  //   if (page > totalPages && totalPages > 0) page = totalPages;

  //   // 1. Xác định Headers và Configs (Ưu tiên dùng cache từ state)
  //   let fieldConfigs = cachedConfigs;
  //   let headers = [];

  //   if (!fieldConfigs || Object.keys(fieldConfigs).length === 0) {
  //     fieldConfigs = {};
  //     const colName = opts.colName;
  //     if (colName && DB_SCHEMA[colName]) {
  //       console.log('[DEBUG] changeTablePage colName:', colName);
  //       console.log('[DEBUG] changeTablePage fields:', DB_SCHEMA[colName].fields);
  //       headers = DB_SCHEMA[colName].fields.filter((f) => f.class !== 'd-none' && f.type !== 'hidden').map((f) => f.name);
  //       const schemaFields = DB_SCHEMA[colName].fields || [];
  //       headers = schemaFields.filter((f) => f.class !== 'd-none' && f.type !== 'hidden').map((f) => f.name);
  //       schemaFields.forEach((f) => {
  //         fieldConfigs[f.name] = f;
  //       });
  //     } else {
  //       const allKeys = new Set();
  //       filteredData.forEach((item) => {
  //         if (item && typeof item === 'object') {
  //           Object.keys(item).forEach((key) => allKeys.add(key));
  //         }
  //       });
  //       headers = Array.from(allKeys);
  //     }
  //     tblData.fieldConfigs = fieldConfigs; // Cập nhật ngược lại cache
  //   } else {
  //     // Nếu đã có fieldConfigs, lấy headers từ schema nếu có để đảm bảo thứ tự
  //     const colName = opts.colName;
  //     if (colName && DB_SCHEMA[colName]) {
  //       headers = DB_SCHEMA[colName].fields.filter((f) => f.class !== 'd-none' && f.type !== 'hidden').map((f) => f.name);
  //     } else {
  //       headers = Object.keys(fieldConfigs);
  //     }
  //   }

  //   // 2. Cắt dữ liệu cho trang hiện tại
  //   const start = (page - 1) * pageSize;
  //   const displayItems = filteredData.slice(start, start + pageSize);

  //   // 3. Cập nhật DOM
  //   const tbody = getE(`${containerId}-tbody`);
  //   const paginContainer = getE(`${containerId}-pagination`);

  //   if (tbody) tbody.innerHTML = this._renderTableRows(displayItems, headers, fieldConfigs, containerId);
  //   if (paginContainer) paginContainer.innerHTML = this._renderPagination(containerId, totalItems, pageSize, page);

  //   // 3.1. Re-init TableResizeManager với Debounce
  //   this.initTableResizer(`tbl-${containerId}`);
  //   // 4. Re-init tooltips nếu có dùng Bootstrap Tooltip
  //   if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
  //     const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  //     tooltipTriggerList.map(function (tooltipTriggerEl) {
  //       return new bootstrap.Tooltip(tooltipTriggerEl);
  //     });
  //   }
  // },

  // /**
  //  * Cập nhật dữ liệu cho bảng hiện có (Tối ưu render nhanh nhất)
  //  * @param {string} containerId
  //  * @param {Object|Array} newData
  //  * @param {Object} newOpts
  //  */
  // updateTable: function (containerId, newData, newOpts = {}) {
  //   return this.createTable(containerId, newData, { ...newOpts, mode: 'replace' });
  // },

  // downloadData: async function (type = 'excel') {
  //   try {
  //     // showLoading(true, `Đang chuẩn bị xuất file ${type}...`);
  //     // 1. Kiểm tra và load thư viện cần thiết
  //     if (type === 'excel') {
  //       await loadLibraryAsync('xlsx');
  //     } else {
  //       await loadLibraryAsync('jspdf');
  //       await loadLibraryAsync('autotable');
  //     }

  //     const tblData = window.STATE_TABLE?.['tab-data-tbl'];
  //     const data = tblData?.filteredData || [];
  //     // showLoading(false);
  //     if (!data.length) {
  //       return logA('Không có dữ liệu để xuất!', 'warning');
  //     }

  //     const selectEl = getE('btn-select-datalist');
  //     let viewType = selectEl ? selectEl.value : 'bookings',
  //       viewText = selectEl ? selectEl.options[selectEl.selectedIndex].text : 'Export';

  //     const now = new Date(),
  //       dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(2)}`;
  //     let fileName = `${viewText}_${dateStr}`,
  //       dataToProcess = [...data];

  //     // 2. Logic lọc VAT (Chỉ áp dụng cho một số collection nhất định)
  //     if (['bookings', 'booking_details', 'operator_entries'].includes(viewType)) {
  //       const isConfirmed = await showConfirm(`Lọc danh sách xuất Hóa Đơn cho bảng [${viewText}]?`);

  //       if (isConfirmed) {
  //         const vatKeywords = ['ck ct', 'đã xuất', 'vat', 'chờ xuất'];
  //         const isVat = (val) =>
  //           vatKeywords.some((k) =>
  //             String(val || '')
  //               .toLowerCase()
  //               .includes(k)
  //           );

  //         if (viewType === 'bookings') {
  //           dataToProcess = dataToProcess.filter((row) => isVat(row.payment_type));
  //         } else {
  //           // Đối với chi tiết, cần check pay_type của booking cha
  //           const bookingsrc = typeof APP_DATA !== 'undefined' ? Object.values(APP_DATA.bookings || {}) : [];
  //           if (bookingsrc.length > 0) {
  //             const validBookingIds = new Set(bookingsrc.filter((b) => isVat(b.payment_type)).map((b) => String(b.id)));
  //             dataToProcess = dataToProcess.filter((dRow) => validBookingIds.has(String(dRow.booking_id)));
  //           }
  //         }

  //         if (dataToProcess.length === 0) {
  //           // showLoading(false);
  //           return logA('Không tìm thấy dữ liệu thỏa điều kiện VAT!', 'info');
  //         } else L._('Đã lọc dữ liệu VAT: ' + dataToProcess.length, 'info');
  //         fileName += '_VAT_ONLY';
  //       }
  //     }

  //     // 3. Map dữ liệu sang định dạng xuất (Dùng fieldConfigs từ state bảng)
  //     const fieldConfigs = tblData.fieldConfigs || {};
  //     const headers = Object.keys(fieldConfigs).length > 0 ? Object.keys(fieldConfigs).filter((k) => !fieldConfigs[k].class?.includes('d-none')) : Object.keys(dataToProcess[0] || {});

  //     const exportData = dataToProcess.map((row) => {
  //       const rowObj = {};
  //       headers.forEach((h) => {
  //         const config = fieldConfigs[h] || {};
  //         let val = row[h] !== undefined && row[h] !== null ? row[h] : '';

  //         // Format dữ liệu
  //         if (config.type === 'date' && val) val = formatDateVN(val);
  //         else if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

  //         const label = config.displayName || A.Lang?.t(h) || h;
  //         rowObj[label] = typeof val === 'object' ? JSON.stringify(val) : val;
  //       });
  //       return rowObj;
  //     });
  //     // 4. Thực hiện tải file
  //     if (type === 'excel') {
  //       const wb = XLSX.utils.book_new();
  //       const ws = XLSX.utils.json_to_sheet(exportData);
  //       // Auto-size columns (tạm thời set cố định 20)
  //       ws['!cols'] = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
  //       XLSX.utils.book_append_sheet(wb, ws, 'Data');
  //       XLSX.writeFile(wb, `${fileName}.xlsx`);
  //     } else {
  //       // Sử dụng html2pdf để hỗ trợ tiếng Việt tốt hơn jsPDF thuần
  //       await loadLibraryAsync('html2pdf');

  //       // Tạo bảng HTML tạm thời để render
  //       const tempDiv = document.createElement('div');
  //       tempDiv.style.padding = '20px';
  //       tempDiv.style.fontFamily = 'Arial, sans-serif';

  //       const tableHtml = `
  //         <h3 style="text-align: center; color: #2c3e50;">BÁO CÁO: ${viewText}</h3>
  //         <p style="text-align: center; font-size: 12px; color: #7f8c8d;">Ngày xuất: ${new Date().toLocaleString('vi-VN')}</p>
  //         <table border="1" style="width: 100%; border-collapse: collapse; font-size: 10px;">
  //           <thead>
  //             <tr style="background-color: #2c3e50; color: white;">
  //               ${Object.keys(exportData[0] || {})
  //                 .map((h) => `<th style="padding: 8px;">${h}</th>`)
  //                 .join('')}
  //             </tr>
  //           </thead>
  //           <tbody>
  //             ${exportData
  //               .map(
  //                 (row) => `
  //               <tr>
  //                 ${Object.values(row)
  //                   .map((v) => `<td style="padding: 5px; text-align: center;">${v}</td>`)
  //                   .join('')}
  //               </tr>
  //             `
  //               )
  //               .join('')}
  //           </tbody>
  //         </table>
  //       `;
  //       tempDiv.innerHTML = tableHtml;
  //       A.Modal.show(tempDiv, 'Xuất file PDF');

  //       const opt = {
  //         margin: [10, 10, 10, 10],
  //         filename: `${fileName}.pdf`,
  //         image: { type: 'jpeg', quality: 0.98 },
  //         html2canvas: { scale: 2, useCORS: true, logging: false },
  //         jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
  //       };

  //       await html2pdf().set(opt).from(tempDiv).save();
  //       // document.body.removeChild(tempDiv);
  //       A.Modal.hide();
  //     }

  //     L._(`Đã xuất file ${type} thành công: ${fileName}`, 'success');
  //   } catch (err) {
  //     Opps('Lỗi trong downloadData: ', err);
  //   } finally {
  //     showLoading(false);
  //   }
  // },

  // /**
  //  * Khởi tạo TableResizeManager với debounce để tối ưu hiệu suất
  //  * @param {string} tableId
  //  */
};

export default UI_RENDERER;
