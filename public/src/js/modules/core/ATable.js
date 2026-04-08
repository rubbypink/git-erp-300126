/**
 * ATable - Advanced Table Helper for 9Trip ERP
 * Quản lý bảng dữ liệu mạnh mẽ: loadData, filter, sorting, grouping, editable cells.
 * Kế thừa và tối ưu hóa từ UI_RENDERER.createTable.
 *
 * @author 9Trip Tech Lead
 * @version 2.3.1
 */

import { DB_SCHEMA } from '../db/DBSchema.js';
import { Sortable, TableResizeManager } from '/src/js/libs/ui_helper.js';

export default class ATable {
  static instances = new Map();

  constructor(containerId, options = {}) {
    // 1. Kiểm tra instance đã tồn tại chưa
    if (ATable.instances.has(containerId)) {
      const existing = ATable.instances.get(containerId);
      // Cập nhật options mới nếu cần (tùy chọn)
      existing.options = { ...existing.options, ...options };

      if (existing.options.data) {
        return existing.init(existing.options.data);
      }

      // QUAN TRỌNG: Trả về instance cũ để ngăn việc tạo object mới hoàn toàn logic bên dưới
      return existing;
    }

    this.containerId = containerId;
    this.container = getE(containerId);
    this.options = {
      mode: 'replace',
      colName: '',
      pageSize: 25,
      sorter: true,
      fs: 12,
      header: true,
      headerExtra: [],
      footer: true,
      groupBy: false,
      editable: false,
      draggable: false,
      download: false,
      contextMenu: false,
      title: '',
      onCellChange: null,
      data: null,
      ...options,
    };

    this.state = {
      fullData: [],
      filteredData: [],
      sort: { field: null, dir: 'asc' },
      groupByField: this.options.groupByField || null,
      currentPage: 1,
      fieldConfigs: {},
      isSecondary: false,
      currentColName: '',
    };

    if (!this.container) {
      console.warn(`[ATable] Container #${containerId} not found`);
    }

    // Đăng ký instance vào registry
    ATable.instances.set(containerId, this);

    if (this.options.data && this.containerId) {
      this.init(this.options.data);
    }
  }

  /**
   * Khởi tạo và render bảng lần đầu hoặc khi cập nhật cấu trúc mới
   */
  async init(data = [], colName = null) {
    try {
      // 1. Reset trạng thái cấu trúc và phân trang để đảm bảo render lại đúng colName mới
      this.state.fieldConfigs = {};
      this.state.currentPage = 1;
      this.state.sort = { field: null, dir: 'asc' };
      this.state.isSecondary = false;

      // 2. Chuẩn hóa dữ liệu (Hỗ trợ Firestore Collection Object hoặc Array)
      if (data) this.state.fullData = Array.isArray(data) ? data : typeof Object.values(data)[0] === 'object' ? Object.values(data) : [data];
      if (colName) this.options.colName = colName;
      // 3. Tự động nhận diện colName nếu không có
      if (!this.options.colName) {
        this._autoDetectColName(data);
      }

      // 4. Xử lý colName đặc biệt (_by_)
      this._handleSpecialColName();

      this.state.filteredData = [...this.state.fullData];
      this._resolveFieldConfigs();

      // Render toàn bộ lần đầu
      this.render(!this.state.isNew);

      // 5. Đăng ký ContextMenu nếu cần
      if (this.options.contextMenu && window.A?.ContextMenu) {
        window.A.ContextMenu.register(`#tbl-${this.containerId} .grid-body`, { useGlobal: true });
      }
      if (this.options.draggable) {
        this._initSortable();
      }

      return this;
    } catch (error) {
      Opps('[ATable] init error:', error);
    }
  }

  _autoDetectColName(data) {
    const collections = window.A?.getConfig?.('consts/collections') || Object.keys(DB_SCHEMA);
    // Thử tìm theo tham chiếu dữ liệu trong APP_DATA
    if (typeof APP_DATA !== 'undefined') {
      const foundCol = collections.find((col) => APP_DATA[col] === data);
      if (foundCol) this.options.colName = foundCol;
    }
    // Nếu vẫn không thấy, thử tìm trong containerId
    if (!this.options.colName) {
      const foundCol = collections.find((col) => this.containerId.toLowerCase().includes(col.toLowerCase()));
      if (foundCol) this.options.colName = foundCol;
    }
    if (this.options.colName) {
      this.state.currentColName = this.options.colName;
      L._(`[ATable] Tự động nhận diện colName: ${this.options.colName}`, 'info');
    }
  }

  _handleSpecialColName() {
    let { colName } = this.options;
    if (colName && colName.includes('_by_')) {
      this.state.currentColName = colName;
      const schemaConfig = DB_SCHEMA[colName];
      if (schemaConfig) {
        this.options.groupBy = true;
        this.state.groupByField = schemaConfig.groupBy;
        // Cập nhật colName loại bỏ phần _by_...
        this.options.colName = colName.split('_by_')[0];
        this.state.isSecondary = true;

        if (typeof APP_DATA !== 'undefined' && APP_DATA[this.options.colName]) {
          this.state.fullData = Object.values(APP_DATA[this.options.colName]);
        }
      }
    }
  }

  _resolveFieldConfigs() {
    // Nếu đã có config (và không bị reset bởi init), giữ nguyên để tránh tính toán lại khi render thường
    if (Object.keys(this.state.fieldConfigs).length > 0) return;

    const { colName } = this.options;
    if (colName && DB_SCHEMA[colName]) {
      const schema = DB_SCHEMA[colName];
      const fields = schema.fields || [];
      fields.forEach((f) => {
        if (f.class !== 'd-none' && f.type !== 'hidden') {
          this.state.fieldConfigs[f.name] = f;
        }
      });
    } else if (this.state.fullData.length > 0) {
      // Thu thập tất cả các keys duy nhất từ toàn bộ items
      const allKeys = new Set();
      this.state.fullData.forEach((item) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((key) => allKeys.add(key));
        }
      });
      allKeys.forEach((key) => {
        this.state.fieldConfigs[key] = { name: key, displayName: A.Lang?.t(key) || key.replace(/_/g, ' ') };
      });
    }
  }

  /**
   * Render bảng.
   * @param {boolean} isUpdate Nếu true, chỉ render lại phần dữ liệu (thead, tbody, tfoot, pagination), giữ nguyên header menu.
   */
  render(isUpdate = false) {
    if (!this.container) return;

    const { fs, header, footer, mode } = this.options;
    const { filteredData, currentPage, fieldConfigs } = this.state;
    const pageSize = this.options.pageSize || window.A?.getConfig?.('table_page_size') || 25;
    const headers = Object.keys(fieldConfigs);

    const start = (currentPage - 1) * pageSize;
    const displayItems = filteredData.slice(start, start + pageSize);

    // Tối ưu: Nếu là update và đã có wrapper, chỉ cập nhật các phần thay đổi
    const wrapper = this.container.querySelector('.table-container-wrapper');
    if (isUpdate && wrapper) {
      try {
        // 1. Cập nhật thead (để đổi icon sort hoặc cấu trúc cột)
        const thead = wrapper.querySelector('thead');
        if (thead) thead.innerHTML = `<tr>${this._renderTableHead(headers)}</tr>`;

        // 2. Cập nhật tbody
        const tbody = wrapper.querySelector(`#${this.containerId}-tbody`);
        if (tbody) tbody.innerHTML = this._renderTableRows(displayItems, headers);

        // 3. Cập nhật tfoot
        if (footer) {
          const tfoot = wrapper.querySelector(`#${this.containerId}-tfoot`);
          if (tfoot) tfoot.innerHTML = this._renderTableFooter(filteredData, headers);
        }

        // 4. Cập nhật pagination
        const pagination = wrapper.querySelector(`#${this.containerId}-pagination`);
        if (pagination) pagination.innerHTML = this._renderPagination(filteredData.length, pageSize, currentPage);

        this._initResizer();
        this._initTooltips();
        return;
      } catch (e) {
        console.warn('[ATable] Partial update failed, falling back to full render', e);
      }
    }

    // Render toàn bộ (Lần đầu hoặc khi isUpdate = false)
    let fsStyle = '';
    if (fs) {
      const fsValue = parseFloat(fs);
      fsStyle = `font-size: ${fsValue < 5 ? fsValue + 'rem' : fsValue + 'px'};`;
    }

    const tableId = `tbl-${this.containerId}`;
    const collectionAttr = this.options.colName ? `data-collection="${this.options.colName}"` : '';

    let headerHtml = '';
    if (header) {
      headerHtml = this._buildHeaderHtml(headers);
    }

    let tableHtml = `
      <div class="d-flex flex-column h-100 w-100 table-container-wrapper" style="${fsStyle}">
        ${headerHtml}
        <div class="table-responsive w-100" style="overflow: auto; position: relative;">
          <table class="table table-sm table-hover table-bordered text-center align-middle mb-0 w-100" id="${tableId}" ${collectionAttr}>
            <thead class="table-secondary text-nowrap sticky-top border-bottom" style="z-index: 3; top: 0;">
              <tr>${this._renderTableHead(headers)}</tr>
            </thead>
            <tbody class="grid-body text-nowrap" id="${this.containerId}-tbody">
              ${this._renderTableRows(displayItems, headers)}
            </tbody>
            ${footer ? `<tfoot class="table-light fw-bold border-top-2 sticky-bottom" id="${this.containerId}-tfoot" style="z-index: 2; bottom: 0;">${this._renderTableFooter(filteredData, headers)}</tfoot>` : ''}
          </table>
        </div>
        <div id="${this.containerId}-pagination" class="flex-shrink-0 bg-white border-top pb-1">
          ${this._renderPagination(filteredData.length, pageSize, currentPage)}
        </div>
      </div>`;

    if (mode === 'replace') {
      this.container.innerHTML = tableHtml;
    } else if (mode === 'prepend') {
      this.container.insertAdjacentHTML('afterbegin', tableHtml);
    } else {
      this.container.insertAdjacentHTML('beforeend', tableHtml);
    }

    this._attachEvents();
    this._initResizer();
    this._initTooltips();
  }

  _buildHeaderHtml(headers) {
    const { colName, groupBy, title, headerExtra } = this.options;
    const { fieldConfigs, groupByField } = this.state;

    let groupByHtml = '';
    if (groupBy) {
      groupByHtml = `
        <div class="group-by-box btn btn-sm btn-warning shadow-sm p-0" style="min-width: 6rem;">
          <select class="form-select form-select-sm bg-warning rounded border-0 at-group-by">
            <option value="">-- Gom nhóm --</option>
            ${headers.map((h) => `<option value="${h}" ${groupByField === h ? 'selected' : ''}>${fieldConfigs[h].displayName || h}</option>`).join('')}
          </select>
        </div>`;
    }
    let downloadHtml = '';
    if (this.options.download) {
      downloadHtml = `
      <div class="dropdown d-none d-md-block at-download-group">
          <button class="btn btn-warning btn-sm dropdown-toggle shadow-sm" type="button" data-bs-toggle="dropdown" style="min-width: 6rem;">
              <i class="fa-solid fa-download"></i> Tải...
          </button>
          <div class="dropdown-menu border-0 shadow-sm">
              <button class="dropdown-item py-2 at-download-excel" type="button"><i class="fa-solid fa-file-excel text-success w-20px"></i> File Excel</button>
              <button class="dropdown-item py-2 at-download-pdf" type="button"><i class="fa-solid fa-file-pdf text-danger w-20px"></i> File PDF</button>
              <button class="dropdown-item py-2 at-reload-data" type="button"><i class="fa-solid fa-sync-alt"></i> Cập Nhật Dữ Liệu</button>
          </div>
      </div>`;
    }

    // Xử lý headerExtra: Chèn lần lượt các item vào đầu header
    let extraHtml = '';
    if (Array.isArray(headerExtra) && headerExtra.length > 0) {
      extraHtml = headerExtra
        .map((item) => {
          try {
            if (typeof item === 'string') {
              // Kiểm tra xem có phải ID của template không
              const el = document.getElementById(item);
              if (el && el.tagName === 'TEMPLATE') {
                return el.innerHTML;
              }
              return item; // HTML string
            } else if (item instanceof HTMLElement) {
              return item.outerHTML;
            }
          } catch (e) {
            console.warn('[ATable] headerExtra item error:', e);
          }
          return '';
        })
        .join('');
    }

    return `
      <div id="tbl-${this.containerId}-header" class="table-header-actions d-flex align-items-center mb-1 gap-3">
        <h6 class="mb-0 fw-bold text-primary text-uppercase me-auto">${title || (colName ? window.A?.Lang?.t(colName) : '')}</h6>
        <div class="search-box flex-grow-1" style="max-width: 200px; border-color: var(--bs-border-color) !important;">
          <div class="input-group input-group-sm bg-white rounded overflow-hidden shadow-sm border" style="border-color: var(--bs-border-color) !important;">
            <span class="input-group-text border-0"><i class="fas fa-search text-muted"></i></span>
            <input type="text" class="form-control bg-light border-0 ps-0 at-search-input" placeholder="Tìm kiếm nhanh..." style="box-shadow: none;">
          </div>
        </div>
        ${groupByHtml}
        ${downloadHtml}
        ${extraHtml}
      </div>`;
  }

  _renderTableHead(headers) {
    const { sorter } = this.options;
    const { fieldConfigs, sort } = this.state;

    return headers
      .map((h) => {
        const config = fieldConfigs[h];
        const label = config.displayName || window.A?.Lang?.t(h) || h.replace(/_/g, ' ');
        const isSorted = sort.field === h;
        const sortIcon = sorter ? ` <i class="fas fa-sort${isSorted ? (sort.dir === 'asc' ? '-up' : '-down') : ''} small ${isSorted ? 'text-primary' : 'text-muted'}" style="font-size:0.7rem"></i>` : '';
        const sortAttr = sorter ? `style="cursor:pointer" data-sort-field="${h}"` : '';
        return `<th scope="col" class="text-capitalize" ${sortAttr}>${label}${sortIcon}</th>`;
      })
      .join('');
  }

  _renderTableRows(items, headers) {
    const { groupByField, fieldConfigs } = this.state;
    const { editable } = this.options;

    if (groupByField) {
      return this._renderGroupedRows(items, headers);
    }

    return items
      .map((item) => {
        const itemId = item.id || item.uid || String(item) || '';
        const itemAttr = itemId ? `data-item="${itemId}"` : '';
        return `
        <tr ${itemAttr}>
          ${headers
            .map((h) => {
              let val = item[h] !== undefined && item[h] !== null ? item[h] : '';
              const config = fieldConfigs[h] || {};

              if (config.type === 'date' && val) val = formatDateISO(val);
              if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

              if (editable && config.editable !== false) {
                return this._renderEditableCell(h, val, config);
              }

              const isHtml = config.type === 'html' || config.html === true;
              const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
              const isLong = !isHtml && displayVal.length > 50;
              const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
              const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';
              const firstCell = h === 'id' || h === 'uid';

              return `<td data-field="${h}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''} ${firstCell ? 'drag-handle' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${isHtml ? displayVal : escapeHtml(shortVal)}</td>`;
            })
            .join('')}
        </tr>`;
      })
      .join('');
  }

  _renderGroupedRows(items, headers) {
    const { groupByField, fieldConfigs } = this.state;
    const { editable } = this.options;
    const groups = {};
    items.forEach((item) => {
      const groupVal = item[groupByField] !== undefined && item[groupByField] !== null ? String(item[groupByField]) : 'Khác';
      if (!groups[groupVal]) groups[groupVal] = [];
      groups[groupVal].push(item);
    });

    let html = '';
    const colSpan = headers.length;

    Object.entries(groups).forEach(([groupName, groupItems]) => {
      const displayGroupName = fieldConfigs[groupByField]?.type === 'date' ? formatDateVN(groupName) : groupName;
      html += `
        <tr class="table-info fw-bold text-start at-group-header" style="cursor:pointer">
          <td colspan="${colSpan}" class="ps-3">
            <i class="fas fa-chevron-down me-2 group-icon"></i> ${displayGroupName} (${groupItems.length} dòng)
          </td>
        </tr>`;

      groupItems.forEach((item) => {
        const itemId = item.id || item.uid || '';
        const itemAttr = itemId ? `data-item="${itemId}"` : '';
        html += `
          <tr ${itemAttr}>
            ${headers
              .map((h) => {
                let val = item[h] !== undefined && item[h] !== null ? item[h] : '';
                const config = fieldConfigs[h] || {};
                if (config.type === 'date' && val) val = formatDateVN(val);
                if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

                if (editable && config.editable !== false) {
                  return this._renderEditableCell(h, val, config);
                }

                const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                const isLong = displayVal.length > 50;
                const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
                const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';

                return `<td data-field="${h}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${escapeHtml(shortVal)}</td>`;
              })
              .join('')}
          </tr>`;
      });
    });

    return html;
  }

  /**
   * Render ô có thể chỉnh sửa dựa trên cấu hình DBSchema
   */
  _renderEditableCell(field, val, config) {
    const tag = config.tag || 'input';
    const type = config.type || 'text';
    const extraClass = config.class || '';
    const attrs = Array.isArray(config.attrs) ? config.attrs.join(' ') : '';
    const baseClass = 'form-control form-control-sm border-0 bg-transparent text-center at-cell-edit';
    const fullClass = `${baseClass} ${extraClass}`.trim();

    let inputHtml = '';
    if (tag === 'select') {
      const options = config.options || [];
      const optionsHtml = options.map((opt) => `<option value="${opt}" ${String(opt) === String(val) ? 'selected' : ''}>${opt}</option>`).join('');
      inputHtml = `<select class="${fullClass}" data-field="${field}" ${attrs}>${optionsHtml}</select>`;
    } else if (tag === 'textarea') {
      inputHtml = `<textarea class="${fullClass}" data-field="${field}" ${attrs}>${val}</textarea>`;
    } else {
      inputHtml = `<input type="${type}" class="${fullClass}" data-field="${field}" value="${val}" ${attrs}>`;
    }

    return `<td class="p-0">${inputHtml}</td>`;
  }

  _renderTableFooter(items, headers) {
    const { colName } = this.options;
    const aggregate = DB_SCHEMA[colName]?.aggregate || {};
    const sumFields = aggregate.sum || [];
    const uniqueFields = aggregate.unique || [];

    return `
      <tr>
        ${headers
          .map((h) => {
            let result = '';
            if (sumFields.includes(h)) {
              const total = items.reduce((acc, item) => {
                const val = typeof getNum === 'function' ? getNum(item[h]) : parseFloat(String(item[h] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                return acc + val;
              }, 0);
              result = `<div class="small text-muted">Tổng:</div><div class="text-primary">${formatNumber(total)}</div>`;
            } else if (uniqueFields.includes(h)) {
              const uniqueCount = new Set(items.map((item) => item[h]).filter((v) => v !== undefined && v !== null && v !== '')).size;
              result = `<div class="small text-muted"></div><div class="text-success">${uniqueCount}</div>`;
            }
            return `<td class="bg-light sticky-bottom" style="bottom: 0; z-index: 2;">${result}</td>`;
          })
          .join('')}
      </tr>`;
  }

  _renderPagination(totalItems, pageSize, currentPage) {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalItems);

    const showNav = totalPages > 1;

    let pagesHtml = '';
    if (showNav) {
      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(totalPages, startPage + 4);
      if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

      for (let i = startPage; i <= endPage; i++) {
        pagesHtml += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link at-page-link" href="#" data-page="${i}">${i}</a></li>`;
      }
    }

    const navHtml = showNav
      ? `
        <nav aria-label="Table pagination">
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link at-page-link" href="#" data-page="${currentPage - 1}">Trước</a></li>
            ${pagesHtml}
            <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link at-page-link" href="#" data-page="${currentPage + 1}">Sau</a></li>
          </ul>
        </nav>`
      : '';

    return `
      <div class="d-flex justify-content-between align-items-center mt-0 px-2">
        <small class="text-muted">Hiển thị ${startIdx}-${endIdx} / ${totalItems} dòng</small>
        ${navHtml}
      </div>`;
  }

  _attachEvents() {
    const wrapper = this.container.querySelector('.table-container-wrapper');
    if (!wrapper || wrapper.dataset.eventsAttached) return;

    // 1. Search (Input event - dùng debounce)
    const searchInput = wrapper.querySelector('.at-search-input');
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        debounce((e) => this.filter(e.target.value), 500)
      );
    }

    // 2. Event Delegation cho Click Events
    wrapper.addEventListener('click', (e) => {
      const target = e.target;

      // Sort
      const sortTh = target.closest('[data-sort-field]');
      if (sortTh) {
        this.sort(sortTh.dataset.sortField);
        return;
      }

      // Pagination
      const pageLink = target.closest('.at-page-link');
      if (pageLink) {
        e.preventDefault();
        this.goToPage(parseInt(pageLink.dataset.page));
        return;
      }

      // Toggle Group
      const groupHeader = target.closest('.at-group-header');
      if (groupHeader) {
        this._toggleGroup(groupHeader);
        return;
      }

      // Download Excel
      if (target.closest('.at-download-excel')) {
        this.download('excel');
        return;
      }

      // Download PDF
      if (target.closest('.at-download-pdf')) {
        this.download('pdf');
        return;
      }

      // Reload
      if (target.closest('.at-reload-data')) {
        this.updateData(this.state.fullData);
        return;
      }
    });

    // 3. Event Delegation cho Change Events
    wrapper.addEventListener('change', (e) => {
      const target = e.target;

      // Group By
      if (target.classList.contains('at-group-by')) {
        this.groupBy(target.value);
        return;
      }

      // Editable Cells
      if (target.classList.contains('at-cell-edit')) {
        const tr = target.closest('tr');
        const itemId = tr.dataset.item;
        const field = target.dataset.field;
        const newVal = target.value;
        this._handleCellChange(itemId, field, newVal);
        return;
      }
    });

    // Đánh dấu đã gắn event để tránh gắn trùng lặp
    wrapper.dataset.eventsAttached = 'true';
  }

  _initResizer() {
    const resizer = new TableResizeManager(`tbl-${this.containerId}`);
    resizer.init();
  }

  _initSortable() {
    this.state.draggable = new Sortable(`${this.containerId}-tbody`, {
      handleSelector: '.drag-handle',
      stateBtn: `tbl-${this.containerId}-header`,
    });
  }

  _initTooltips() {
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(this.container.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      });
    }
  }

  filter(keyword) {
    const kw = keyword.toLowerCase().trim();
    if (!kw) {
      this.state.filteredData = [...this.state.fullData];
    } else {
      this.state.filteredData = this.state.fullData.filter((item) =>
        Object.values(item).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(kw);
        })
      );
    }
    this.state.currentPage = 1;
    this.render(true);
  }

  sort(field) {
    const { sort, filteredData } = this.state;
    const dir = sort.field === field && sort.dir === 'asc' ? 'desc' : 'asc';
    this.state.sort = { field, dir };

    if (window.A?.UI?.stableSort) {
      this.state.filteredData = window.A.UI.stableSort(filteredData, this.options.colName, { column: field, dir: dir });
    } else {
      this.state.filteredData = [...filteredData].sort((a, b) => {
        let valA = a[field] ?? '';
        let valB = b[field] ?? '';

        if (!isNaN(getNum(valA)) && !isNaN(getNum(valB))) {
          return dir === 'asc' ? getNum(valA) - getNum(valB) : getNum(valB) - getNum(valA);
        }

        return dir === 'asc' ? String(valA).localeCompare(String(valB), 'vi') : String(valB).localeCompare(String(valA), 'vi');
      });
    }

    this.render(true);
  }

  groupBy(field) {
    this.state.groupByField = field || null;
    this.render(true);
  }

  goToPage(page) {
    const pageSize = this.options.pageSize || 25;
    const totalPages = Math.ceil(this.state.filteredData.length / pageSize) || 1;

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    this.state.currentPage = page;
    this.render(true);
  }

  _handleCellChange(itemId, field, value) {
    const item = this.state.fullData.find((i) => (i.id || i.uid) === itemId);
    if (item) {
      item[field] = value;
      if (this.options.onCellChange) {
        this.options.onCellChange(itemId, field, value, item);
      }
    }
  }

  _toggleGroup(headerRow) {
    let next = headerRow.nextElementSibling;
    const icon = headerRow.querySelector('.group-icon');
    let isHiding = false;

    if (next && !next.classList.contains('at-group-header')) {
      isHiding = !next.classList.contains('d-none');
    }

    while (next && !next.classList.contains('at-group-header')) {
      next.classList.toggle('d-none', isHiding);
      next = next.nextElementSibling;
    }

    if (icon) {
      icon.className = isHiding ? 'fas fa-chevron-right me-2 group-icon' : 'fas fa-chevron-down me-2 group-icon';
    }
  }

  async download(type = 'excel') {
    try {
      const { colName, title } = this.options;
      const { filteredData, fieldConfigs } = this.state;

      if (!filteredData.length) {
        return logA('Không có dữ liệu để xuất!', 'warning');
      }

      if (type === 'excel') {
        await loadLibraryAsync('xlsx');
      } else {
        await loadLibraryAsync('html2pdf');
      }

      const viewType = colName || 'export';
      const viewText = title || (colName ? window.A?.Lang?.t(colName) : 'Export');

      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getFullYear()).slice(2)}`;
      let fileName = `${viewText}_${dateStr}`;
      let dataToProcess = [...filteredData];

      if (['bookings', 'booking_details', 'operator_entries'].includes(viewType)) {
        const isConfirmed = await showConfirm(`Lọc danh sách xuất Hóa Đơn cho bảng [${viewText}]?`);

        if (isConfirmed) {
          const vatKeywords = ['ck ct', 'đã xuất', 'vat', 'chờ xuất'];
          const isVat = (val) =>
            vatKeywords.some((k) =>
              String(val || '')
                .toLowerCase()
                .includes(k)
            );

          if (viewType === 'bookings') {
            dataToProcess = dataToProcess.filter((row) => isVat(row.payment_type));
          } else {
            const bookingsrc = typeof APP_DATA !== 'undefined' ? Object.values(APP_DATA.bookings || {}) : [];
            if (bookingsrc.length > 0) {
              const validBookingIds = new Set(bookingsrc.filter((b) => isVat(b.payment_type)).map((b) => String(b.id)));
              dataToProcess = dataToProcess.filter((dRow) => validBookingIds.has(String(dRow.booking_id)));
            }
          }

          if (dataToProcess.length === 0) {
            return logA('Không tìm thấy dữ liệu thỏa điều kiện VAT!', 'info');
          } else {
            L._('Đã lọc dữ liệu VAT: ' + dataToProcess.length, 'info');
          }
          fileName += '_VAT_ONLY';
        }
      }

      const headers = Object.keys(fieldConfigs).length > 0 ? Object.keys(fieldConfigs) : Object.keys(dataToProcess[0] || {});

      const exportData = dataToProcess.map((row) => {
        const rowObj = {};
        headers.forEach((h) => {
          const config = fieldConfigs[h] || {};
          let val = row[h] !== undefined && row[h] !== null ? row[h] : '';

          if (config.type === 'date' && val) val = formatDateVN(val);
          else if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

          const label = config.displayName || window.A?.Lang?.t(h) || h;
          rowObj[label] = typeof val === 'object' ? JSON.stringify(val) : val;
        });
        return rowObj;
      });

      if (type === 'excel') {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } else {
        const tempDiv = document.createElement('div');
        tempDiv.style.padding = '20px';
        tempDiv.style.fontFamily = 'Arial, sans-serif';

        const tableHtml = `
          <h3 style="text-align: center; color: #2c3e50;">BÁO CÁO: ${viewText}</h3>
          <p style="text-align: center; font-size: 12px; color: #7f8c8d;">Ngày xuất: ${new Date().toLocaleString('vi-VN')}</p>
          <table border="1" style="width: 100%; border-collapse: collapse; font-size: 10px;">
            <thead>
              <tr style="background-color: #2c3e50; color: white;">
                ${Object.keys(exportData[0] || {})
                  .map((h) => `<th style="padding: 8px;">${h}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${exportData
                .map(
                  (row) => `
                <tr>
                  ${Object.values(row)
                    .map((v) => `<td style="padding: 5px; text-align: center;">${v}</td>`)
                    .join('')}
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `;
        tempDiv.innerHTML = tableHtml;

        if (window.A?.Modal) {
          window.A.Modal.show(tempDiv, 'Xuất file PDF');
        }

        const opt = {
          margin: [10, 10, 10, 10],
          filename: `${fileName}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        };

        await html2pdf().set(opt).from(tempDiv).save();

        if (window.A?.Modal) {
          window.A.Modal.hide();
        }
      }

      L._(`Đã xuất file ${type} thành công: ${fileName}`, 'success');
    } catch (err) {
      Opps('[ATable] download error:', err);
    } finally {
      showLoading(false);
    }
  }

  updateData(newData) {
    this.state.fullData = Array.isArray(newData) ? newData : Object.values(newData);
    this.state.filteredData = [...this.state.fullData];
    const searchVal = this.container?.querySelector('.at-search-input')?.value || '';
    this.filter(searchVal);
  }

  getData() {
    return this.state.fullData;
  }

  /**
   * Hủy instance và dọn dẹp registry
   */
  destroy() {
    if (this.containerId) {
      ATable.instances.delete(this.containerId);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
