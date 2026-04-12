/**
 * ATable - Advanced Table Helper for 9Trip ERP
 * Quản lý bảng dữ liệu mạnh mẽ: loadData, filter, sorting, grouping, editable cells.
 * Kế thừa và tối ưu hóa từ UI_RENDERER.createTable.
 *
 * @author 9Trip Tech Lead
 * @version 3.0.3
 */

import { DB_SCHEMA } from '../db/DBSchema.js';
import { Sortable, TableResizeManager } from '/src/js/libs/ui_helper.js';

export default class ATable {
  static instances = new Map();

  constructor(containerId, options = {}) {
    // 1. Kiểm tra instance đã tồn tại chưa
    if (ATable.instances.has(containerId)) {
      const existing = ATable.instances.get(containerId);
      existing.options = { ...existing.options, ...options };

      if (options.headerExtra && String(options.headerExtra) !== 'false') {
        existing.state.headerExtra = Array.isArray(options.headerExtra) ? options.headerExtra : [options.headerExtra];
      } else if (existing.options.headerExtra) {
        existing.state.headerExtra = [$('.at-header-extra', existing.container)?.innerHTML];
      }

      if (existing.options.data) {
        return existing.init(existing.options.data);
      }

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
      zoom: false,
      style: 'auto',
      title: '',
      onCellChange: null,
      data: null,
      hiddenField: false, // Mặc định không hiển thị field ẩn
      ...options,
    };

    this.state = {
      fullData: [],
      filteredData: [],
      sort: { field: null, dir: 'asc' },
      groupByField: this.options.groupByField || null,
      currentPage: 1,
      fieldConfigs: {},
      hiddenFields: {}, // Khởi tạo state.hiddenFields
      allFieldsOrder: [], // Lưu thứ tự gốc của các cột
      isSecondary: false,
      currentColName: '',
      zoomLevel: 1,
      headerExtra: Array.isArray(this.options.headerExtra) ? this.options.headerExtra : this.options.headerExtra ? [this.options.headerExtra] : [],
    };

    if (!this.container) {
      console.warn(`[ATable] Container #${containerId} not found`);
    }
    if (CURRENT_USER && CURRENT_USER?.role === 'admin') {
      this.options.editable = true;
      this.options.draggable = false;
    }

    // Đăng ký instance vào registry
    ATable.instances.set(containerId, this);

    if (this.options.data && this.containerId) {
      this.init(this.options.data);
    }
  }

  /**
   * Khởi tạo và cập nhật dữ liệu cho bảng
   */
  async init(data = [], colName = null) {
    try {
      // 1. Chuẩn hóa dữ liệu
      const normalizedData = Array.isArray(data) ? data : typeof Object.values(data)[0] === 'object' ? Object.values(data) : [data];

      if (colName) this.options.colName = colName;

      // 2. Cập nhật trạng thái
      this.state.fullData = normalizedData;
      this.state.filteredData = [...this.state.fullData];
      this.state.currentPage = 1;

      // Tự động nhận diện colName nếu không có
      if (!this.options.colName) {
        this._autoDetectColName(normalizedData);
      }

      // Luôn resolve lại field configs khi init để đảm bảo header mới nhất
      this.state.fieldConfigs = {};
      this.state.hiddenFields = {};
      this.state.allFieldsOrder = []; // Reset thứ tự cột
      this._resolveFieldConfigs();

      // 3. Render
      this.render();

      // 4. Đăng ký các plugin bổ trợ
      if (this.options.contextMenu && window.A?.ContextMenu) {
        window.A.ContextMenu.register(`#tbl-${this.containerId} .grid-body`, { useGlobal: true });
      }
      if (this.options.draggable) {
        this._initSortable();
      }

      return this;
    } catch (error) {
      console.error('[ATable] init error:', error);
    }
  }

  /**
   * Hàm render chính - Điều phối việc vẽ giao diện
   */
  render() {
    if (!this.container) return;

    const wrapper = this.container.querySelector('.table-container-wrapper');

    // Nếu chưa có layout chính thì tạo mới
    if (!wrapper) {
      this._renderMainLayout();
      this._renderHeaderMenu();
    }

    // Luôn render lại header menu để cập nhật dropdown field ẩn

    // Luôn làm mới nội dung bảng và phân trang khi gọi render()
    this.refresh();

    this._attachEvents();
  }

  _attachEvents() {
    const wrapper = this.container.querySelector('.table-container-wrapper');
    if (!wrapper || wrapper.dataset.eventsAttached) return;

    const searchInput = wrapper.querySelector('.at-search-input');
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        debounce((e) => this.filter(e.target.value), 500)
      );
    }

    // Code mới: Bổ sung xử lý sự kiện click vào icon xem object
    wrapper.addEventListener('click', (e) => {
      const target = e.target;

      const sortTh = target.closest('[data-sort-field]');
      if (sortTh) {
        this.sort(sortTh.dataset.sortField);
        return;
      }

      const pageLink = target.closest('.at-page-link');
      if (pageLink) {
        e.preventDefault();
        this.goToPage(parseInt(pageLink.dataset.page));
        return;
      }

      const groupHeader = target.closest('.at-group-header');
      if (groupHeader) {
        this._toggleGroup(groupHeader);
        return;
      }

      if (target.closest('.at-download-excel')) {
        this.download('excel');
        return;
      }

      if (target.closest('.at-download-pdf')) {
        this.download('pdf');
        return;
      }

      if (target.closest('.at-reload-data')) {
        this.updateData(this.state.fullData);
        return;
      }

      if (target.closest('.at-zoom-in')) {
        this.zoom(1);
        return;
      }

      if (target.closest('.at-zoom-out')) {
        this.zoom(-1);
        return;
      }

      // Xử lý nút Áp dụng ẩn/hiện cột
      if (target.closest('.at-apply-fields')) {
        this.applyFieldVisibility();
        return;
      }

      // Xử lý click xem chi tiết object
      const viewObjBtn = target.closest('.at-view-object');
      if (viewObjBtn) {
        try {
          const valStr = viewObjBtn.dataset.val;
          const val = JSON.parse(decodeURIComponent(valStr));
          this._showObjectPopup(val);
        } catch (err) {
          console.error('[ATable] Parse object error:', err);
        }
        return;
      }
    });

    A.Event.on(
      wrapper,
      'change',
      (e) => {
        const target = e.target;

        if (target.classList.contains('at-group-by')) {
          this.groupBy(target.value);
          return;
        }

        if (target.classList.contains('at-cell-edit')) {
          const tr = target.closest('tr');
          const itemId = tr.dataset.item;
          const field = target.dataset.field;
          const newVal = target.value;
          this._handleCellChange(itemId, field, newVal);
          return;
        }
      },
      true,
      true
    );
    wrapper.dataset.eventsAttached = 'true';
  }

  /**
   * Tạo khung layout chính cho bảng
   */
  _renderMainLayout() {
    const { fs, mode } = this.options;
    let fsStyle = '';
    if (fs) {
      const fsValue = parseFloat(fs);
      fsStyle = `font-size: ${fsValue < 5 ? fsValue + 'rem' : fsValue + 'px'};`;
    }

    const layoutHtml = `
      <div class="d-flex flex-column h-100 w-100 table-container-wrapper" style="${fsStyle}">
        <div id="${this.containerId}-header-menu" class="table-header-actions-wrapper" style="z-index: 5;"></div>
        <div id="${this.containerId}-content-area" class="table-responsive w-100 at-table-container flex-grow-1" style="overflow: auto; position: relative;">
          <!-- Table will be rendered here -->
        </div>
        <div id="${this.containerId}-pagination-area" class="flex-shrink-0 bg-white border-top pb-1">
          <!-- Pagination will be rendered here -->
        </div>
      </div>`;

    if (mode === 'replace') {
      this.container.innerHTML = layoutHtml;
    } else if (mode === 'prepend') {
      this.container.insertAdjacentHTML('afterbegin', layoutHtml);
    } else {
      this.container.insertAdjacentHTML('beforeend', layoutHtml);
    }
  }

  _renderGroupByBtn(update = false) {
    const { fieldConfigs, groupByField, allFieldsOrder } = this.state;
    const headers = allFieldsOrder.filter((h) => fieldConfigs[h]);
    const html = `
    <div class="group-by-box btn btn-sm btn-warning shadow-sm p-0" style="min-width: 6rem;">
      <select class="form-select form-select-sm bg-warning rounded border-0 at-group-by">
        <option value="">-- Gom nhóm --</option>
        ${headers.map((h) => `<option value="${h}" ${groupByField === h ? 'selected' : ''}>${fieldConfigs[h].displayName || h}</option>`).join('')}
      </select>
    </div>`;
    if (update) {
      const headerMenuEl = getE(`${this.containerId}-header-menu`);
      if (headerMenuEl) {
        const groupBySelect = headerMenuEl.querySelector('.group-by-select');
        if (groupBySelect) groupBySelect.innerHTML = html;
      }
      return;
    }
    return html;
  }

  /**
   * Render thanh công cụ phía trên bảng (Title, Search, Buttons, Extra)
   */
  _renderHeaderMenu() {
    const headerMenuEl = getE(`${this.containerId}-header-menu`);
    if (!headerMenuEl || !this.options.header) return;

    const { colName, groupBy, title, zoom, download } = this.options;
    const { fieldConfigs, groupByField, headerExtra } = this.state;

    let groupByHtml = '';
    if (groupBy) {
      groupByHtml = this._renderGroupByBtn();
    }

    let downloadHtml = '';
    if (download) {
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

    let zoomHtml = '';
    if (zoom) {
      zoomHtml = `
        <div class="btn-group btn-group-sm shadow-sm at-zoom-group">
          <button type="button" class="btn btn-light border at-zoom-out" title="Thu nhỏ"><i class="fas fa-minus"></i></button>
          <button type="button" class="btn btn-light border at-zoom-in" title="Phóng to"><i class="fas fa-plus"></i></button>
        </div>`;
    }

    let extraHtml = '';
    if (Array.isArray(headerExtra) && headerExtra.length > 0) {
      const content = headerExtra
        .map((item) => {
          if (typeof item === 'string') {
            // Nếu là ID của template
            const el = document.getElementById(item);
            if (el && el.tagName === 'TEMPLATE') return el.innerHTML;
            // Nếu là chuỗi HTML
            return item;
          }
          // Nếu là HTMLElement
          if (item instanceof HTMLElement) return item.outerHTML;
          return '';
        })
        .join('');
      extraHtml = `<div class="at-header-extra d-flex align-items-center gap-2">${content}</div>`;
    } else {
      extraHtml = `<div class="at-header-extra d-flex align-items-center gap-2"></div>`;
    }
    let draggableHtml = `<div class="d-flex align-items-center gap-2" id="tbl-${this.containerId}-header-drag"></div>`;

    // Render dropdown chọn field ẩn
    const hiddenFieldsDropdownHtml = this._renderHiddenFieldsDropdown();

    headerMenuEl.innerHTML = `
      <div id="tbl-${this.containerId}-header" class="table-header-actions d-flex align-items-center mb-1 gap-3 p-2" style="z-index: 5;">
        <h6 class="mb-0 fw-bold text-primary text-uppercase me-auto">${title || (colName ? window.A?.Lang?.t(colName) : '')}</h6>
        <div class="search-box flex-grow-1" style="max-width: 200px;">
          <div class="input-group input-group-sm bg-white rounded overflow-hidden shadow-sm border">
            <span class="input-group-text border-0"><i class="fas fa-search text-muted"></i></span>
            <input type="text" class="form-control bg-light border-0 ps-0 at-search-input" placeholder="Tìm kiếm nhanh..." style="box-shadow: none;">
          </div>
        </div>
        <div class="group-by-select">${groupByHtml}</div>
        ${zoomHtml}
        ${downloadHtml}
        ${draggableHtml}
        ${hiddenFieldsDropdownHtml}
        ${extraHtml}
      </div>`;
  }

  /**
   * Trả về HTML cho một dropdown menu chứa danh sách các checkbox để ẩn/hiện field
   */
  _renderHiddenFieldsDropdown() {
    const { fieldConfigs, hiddenFields, allFieldsOrder } = this.state;
    const allFields = { ...fieldConfigs, ...hiddenFields };
    const fieldNames = allFieldsOrder;

    if (fieldNames.length === 0) return '';

    const itemsHtml = fieldNames
      .map((name) => {
        const config = allFields[name];
        if (!config) return '';
        const label = config.displayName || window.A?.Lang?.t(name) || name.replace(/_/g, ' ');
        const isVisible = !!fieldConfigs[name];
        return `
        <li>
          <div class="dropdown-item py-1" style="z-index: 9;">
            <div class="form-check w-100">
              <input class="form-check-input at-field-checkbox" type="checkbox" value="${name}" id="chk-${this.containerId}-${name}" ${isVisible ? 'checked' : ''}>
              <label class="form-check-label flex-grow-1 cursor-pointer" for="chk-${this.containerId}-${name}">
                ${label}
              </label>
            </div>
          </div>
        </li>`;
      })
      .join('');

    return `
      <div class="dropdown btn-group at-fields-dropdown">
        <button class="btn btn-sm btn-light border shadow-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
          <i class="fas fa-columns"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 bg-light fs-2" style="overflow: hidden; min-width: 200px; max-height: 400px; overflow-y: auto;">
          <li class="dropdown-header sticky-top py-1 fw-bold border-bottom mb-1 d-flex justify-content-between align-items-center" style="z-index: 10;">
            <span class="small">Hiển thị cột</span>
            <button class="btn btn-xs btn-primary at-apply-fields" title="Áp dụng thay đổi">
              <i class="fas fa-check"></i> Áp dụng
            </button>
          </li>
          ${itemsHtml}
        </ul>
      </div>`;
  }

  /**
   * Render nội dung bảng (thead, tbody, tfoot)
   */
  _renderTableContent() {
    const contentArea = getE(`${this.containerId}-content-area`);
    if (!contentArea) return;

    const { style, footer } = this.options;
    const { filteredData, currentPage, fieldConfigs, allFieldsOrder } = this.state;
    const pageSize = this.options.pageSize || 25;
    const headers = allFieldsOrder.filter((h) => fieldConfigs[h]);

    const start = (currentPage - 1) * pageSize;
    const displayItems = filteredData.slice(start, start + pageSize);

    let tableClass = 'table table-sm table-hover table-bordered text-center align-middle mb-0 w-100';
    if (style && style !== 'auto') tableClass += ` table-${style}`;

    const tableId = `tbl-${this.containerId}`;
    const collectionAttr = this.options.colName ? `data-collection="${this.options.colName}"` : '';

    contentArea.innerHTML = `
      <table class="${tableClass}" id="${tableId}" ${collectionAttr} style="transform: scale(${this.state.zoomLevel}); transform-origin: top left;">
        <thead class="table-secondary text-nowrap sticky-top border-bottom" style="z-index: 3; top: 0;">
          <tr>${this._renderTableHead(headers)}</tr>
        </thead>
        <tbody class="grid-body text-nowrap" id="${this.containerId}-tbody">
          ${this._renderTableRows(displayItems, headers)}
        </tbody>
        ${footer ? `<tfoot class="table-light fw-bold border-top-2 sticky-bottom" id="${this.containerId}-tfoot" style="z-index: 2; bottom: 0;">${this._renderTableFooter(filteredData, headers)}</tfoot>` : ''}
      </table>`;
    this._renderGroupByBtn(true);
    this._initResizer();
    this._initTooltips();
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

              // Code mới: Xử lý hiển thị dữ liệu dạng object
              const isHtml = config.type === 'html' || config.html === true;

              // Nếu là object và không phải null
              if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                return this._renderObjectCell(val, config, h);
              }

              let displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);

              if (config.dataSource && val) {
                let sourceData = null;
                this._getDataSource(config.dataSource).then((data) => {
                  sourceData = data;
                  L._(`[ATable] _renderObjectCell - sourceData: ${sourceData[0]}`);
                });
                if (sourceData) {
                  const matched = sourceData.find((i) => String(i.id || i.uid || i.value) === String(val));
                  if (matched) {
                    displayVal = matched.displayName || matched.name || matched.value || matched.title || matched.user_name || matched.text || matched.full_name || displayVal;
                  }
                }
              }

              const isLong = !isHtml && displayVal.length > 50;
              const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
              const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';
              const firstCell = h === 'id' || h === 'uid';

              return `<td data-field="${h}" data-val="${val}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''} ${firstCell ? 'drag-handle' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${isHtml ? displayVal : escapeHtml(shortVal)}</td>`;
            })
            .join('')}
        </tr>`;
      })
      .join('');
  }

  _renderGroupedRows(items, headers) {
    const { groupByField, fieldConfigs } = this.state;
    const { editable, colName } = this.options;
    const aggregate = DB_SCHEMA[colName]?.aggregate || {};
    const sumFields = aggregate.sum || [];

    const groups = HD.group(items, groupByField);

    let html = '';

    Object.entries(groups).forEach(([groupName, groupItemObj]) => {
      let groupItems = Object.values(groupItemObj);
      const displayGroupName = fieldConfigs[groupByField]?.type === 'date' ? formatDateVN(groupName) : groupName;

      const groupSums = {};
      sumFields.forEach((f) => {
        groupSums[f] = groupItems.reduce((acc, item) => {
          const val = typeof getNum === 'function' ? getNum(item[f]) : parseFloat(String(item[f] || '0').replace(/[^0-9.-]+/g, '')) || 0;
          return acc + val;
        }, 0);
      });

      html += `
        <tr class="table-info fw-bold text-start at-group-header" style="cursor:pointer">
          ${headers
            .map((h, index) => {
              let content = '';
              if (index === 0) {
                content = `<i class="fas fa-chevron-down me-2 group-icon"></i> ${displayGroupName} (${groupItems.length} dòng)`;
              } else if (sumFields.includes(h)) {
                content = formatNumber(groupSums[h]);
              }
              return `<td class="ps-3">${content}</td>`;
            })
            .join('')}
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

                // Code mới: Xử lý hiển thị dữ liệu dạng object trong grouped rows
                if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                  return this._renderObjectCell(val, config, h);
                }

                let displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);

                if (config.dataSource && val) {
                  let sourceData = null;
                  this._getDataSource(config.dataSource).then((data) => {
                    sourceData = data;
                    L._(`[ATable] _renderObjectCell - sourceData: ${sourceData[0]}`);
                  });
                  if (sourceData) {
                    const matched = sourceData.find((i) => String(i.id || i.uid || i.value) === String(val));
                    if (matched) {
                      displayVal = matched.displayName || matched.name || matched.title || matched.user_name || matched.text || matched.full_name || displayVal;
                    }
                  }
                }

                const isLong = displayVal.length > 50;
                const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
                const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';

                return `<td data-field="${h}" data-val="${val}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${escapeHtml(shortVal)}</td>`;
              })
              .join('')}
          </tr>`;
      });
    });

    return html;
  }

  _renderEditableCell(field, val, config) {
    const tag = config.tag || 'input';
    const type = config.type || 'text';
    const extraClass = config.class || '';
    const attrs = Array.isArray(config.attrs) ? config.attrs.join(' ') : '';
    const baseClass = 'form-control form-control-sm border-0 bg-transparent text-center at-cell-edit';
    const fullClass = `${baseClass} ${extraClass}`.trim();

    let inputHtml = '';
    if (tag === 'select') {
      const isSmart = config.dataSource || extraClass.includes('smart-select');
      const smartClass = isSmart ? 'smart-select' : '';
      const dataSource = config.dataSource || '';
      const searchable = config.searchable !== undefined ? config.searchable : 'true';
      const creatable = config.creatable !== undefined ? config.creatable : 'false';

      const selectAttrs = `${attrs} data-source="${dataSource}" data-searchable="${searchable}" data-creatable="${creatable}" data-val="${val}"`.trim();

      if (isSmart) {
        inputHtml = `<select class="${fullClass} ${smartClass}" data-field="${field}" ${selectAttrs}></select>`;
      } else {
        const options = config.options || [];
        const optionsHtml = options.map((opt) => `<option value="${opt}" ${String(opt) === String(val) ? 'selected' : ''}>${opt}</option>`).join('');
        inputHtml = `<select class="${fullClass}" data-field="${field}" ${selectAttrs}>${optionsHtml}</select>`;
      }
    } else if (tag === 'textarea') {
      inputHtml = `<textarea class="${fullClass}" data-field="${field}" ${attrs}>${val}</textarea>`;
    } else {
      inputHtml = `<input type="${type}" class="${fullClass}" data-field="${field}" value="${val}" ${attrs}>`;
    }

    return `<td class="p-0">${inputHtml}</td>`;
  }

  async _getDataSource(source) {
    if (!source) return null;
    let codeStr = unescapeHtml(source);
    L._(`[ATable] _getDataSource: ${codeStr}`);
    try {
      if (A?.DB?.schema.isCollection(codeStr)) {
        const data = await A.DB.local.getCollection(codeStr);
        if (data) return Array.isArray(data) ? data : Object.values(data);
      } else {
        // TH2: Chuỗi là Code Nội Tuyến (Inline Code)
        // Dấu hiệu nhận biết: Có chứa dấu phẩy, khoảng trắng, hoặc ngoặc
        if (codeStr.includes(';') || codeStr.includes('(') || codeStr.includes(' ')) {
          // Sử dụng hàm Function nội hàm để wrap logic.
          // Hỗ trợ truyền cứng 3 biến hay dùng ở các Form/Select
          const dynamicScript = new Function('value', 'selectEl', 'instance', codeStr);
          return await dynamicScript(safeArgs[0], safeArgs[1], safeArgs[2]);
        }

        // TH3: Chuỗi là Đường Dẫn Hàm (Object Path) - VD: 'App.Sales.tinhTien'
        const parts = codeStr.split('.');
        let current = window; // Bắt đầu quét từ Window (Global)
        let context = window; // Context mặc định là Window

        for (let i = 0; i < parts.length; i++) {
          if (current[parts[i]] !== undefined) {
            // Ghi nhận context là object cha (phần tử đứng ngay trước hàm cuối cùng)
            if (i < parts.length - 1) {
              context = current[parts[i]];
            }
            current = current[parts[i]];
          } else {
            console.warn(`[runFn] Lỗi: Không tìm thấy đường dẫn hàm "${codeStr}"`);
            return null;
          }
        }

        // Sau khi phân giải, kiểm tra xem nó có đích thị là function không
        if (typeof current === 'function') {
          // Gọi hàm và áp dụng (apply) đúng ngữ cảnh context đã tìm được
          return await current.apply(context, safeArgs);
        } else {
          return Array.isArray(current) ? current : Object.values(current);
        }
      }
    } catch (e) {
      console.warn(`[ATable] _getDataSource error for ${source}:`, e);
    }
    return null;
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

  _autoDetectColName(data) {
    const collections = window.A?.getConfig?.('consts/collections') || Object.keys(DB_SCHEMA);
    const rElement = $('[data-collection]', getE(this.containerId));
    if (rElement) {
      this.options.colName = rElement.dataset.collection;
    }
    if (!this.options.colName) {
      const foundCol = collections.find((col) => this.containerId.toLowerCase().includes(col.toLowerCase()));
      if (foundCol) this.options.colName = foundCol;
    }
    if (this.options.colName) {
      this.state.currentColName = this.options.colName;
    }
  }

  _initResizer() {
    const resizer = new TableResizeManager(`tbl-${this.containerId}`);
    resizer.init();
  }

  _initSortable() {
    if (this.state.draggable) this.state.draggable.destroy();
    this.state.draggable = new Sortable(`${this.containerId}-tbody`, {
      handleSelector: '.drag-handle',
      stateBtn: `tbl-${this.containerId}-header-drag`,
    });
  }

  _initTooltips() {
    /*
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(this.container.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      });
    }
    */

    // Code mới: Bổ sung option { html: true } khi khởi tạo bootstrap.Tooltip
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(this.container.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, { html: true });
      });
    }
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

  _resolveFieldConfigs() {
    if (Object.keys(this.state.fieldConfigs).length > 0) return;

    const { colName, hiddenField } = this.options;
    if (colName && DB_SCHEMA[colName]) {
      const schema = DB_SCHEMA[colName];
      const fields = schema.fields || [];
      fields.forEach((f) => {
        const isHiddenInSchema = f.class === 'd-none' || f.type === 'hidden';

        // Lưu thứ tự gốc
        this.state.allFieldsOrder.push(f.name);

        if (hiddenField === true) {
          // Nếu hiddenField là true: Bỏ qua kiểm tra d-none/hidden, đưa tất cả vào fieldConfigs
          this.state.fieldConfigs[f.name] = f;
        } else if (Array.isArray(hiddenField)) {
          // Nếu hiddenField là mảng: Các field có tên trong mảng đưa vào hiddenFields, còn lại vào fieldConfigs
          if (hiddenField.includes(f.name)) {
            this.state.hiddenFields[f.name] = f;
          } else {
            this.state.fieldConfigs[f.name] = f;
          }
        } else {
          // Mặc định: d-none/hidden vào hiddenFields, còn lại vào fieldConfigs
          if (isHiddenInSchema) {
            this.state.hiddenFields[f.name] = f;
          } else {
            this.state.fieldConfigs[f.name] = f;
          }
        }
      });
    } else if (this.state.fullData.length > 0) {
      const allKeys = new Set();
      this.state.fullData.forEach((item) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((key) => allKeys.add(key));
        }
      });
      allKeys.forEach((key) => {
        // Lưu thứ tự gốc
        this.state.allFieldsOrder.push(key);

        const config = { name: key, displayName: A.Lang?.t(key) || key.replace(/_/g, ' ') };
        if (Array.isArray(hiddenField) && hiddenField.includes(key)) {
          this.state.hiddenFields[key] = config;
        } else {
          this.state.fieldConfigs[key] = config;
        }
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
    this.refresh();
  }

  sort(field) {
    const { sort, filteredData } = this.state;
    const dir = sort.field === field && sort.dir === 'asc' ? 'desc' : 'asc';
    this.state.sort = { field, dir };

    if (A?.UI?.stableSort) {
      this.state.filteredData = A.UI.stableSort(filteredData, this.options.colName, { column: field, dir: dir });
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

    this.refresh();
  }

  groupBy(field) {
    this.state.groupByField = field || null;
    this.refresh();
  }

  goToPage(page) {
    const pageSize = this.options.pageSize || 25;
    const totalPages = Math.ceil(this.state.filteredData.length / pageSize) || 1;

    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    this.state.currentPage = page;
    this.refresh();
  }

  zoom(direction) {
    const step = 0.1;
    let newLevel = this.state.zoomLevel + direction * step;

    if (newLevel < 0.5) newLevel = 0.5;
    if (newLevel > 2.0) newLevel = 2.0;

    this.state.zoomLevel = parseFloat(newLevel.toFixed(1));

    const table = this.container.querySelector(`#tbl-${this.containerId}`);
    if (table) {
      table.style.transform = `scale(${this.state.zoomLevel})`;
      table.style.transformOrigin = 'top left';
    }
  }

  /**
   * Làm mới toàn bộ nội dung bảng và phân trang
   */
  refresh() {
    this._renderTableContent();
    this.updatePagination();
  }

  /**
   * Cập nhật riêng phần Body của bảng
   */
  updateBody() {
    const tbody = getE(`${this.containerId}-tbody`);
    if (!tbody) return;

    const { fieldConfigs, filteredData, currentPage, allFieldsOrder } = this.state;
    const pageSize = this.options.pageSize || 25;
    const headers = allFieldsOrder.filter((h) => fieldConfigs[h]);
    const start = (currentPage - 1) * pageSize;
    const displayItems = filteredData.slice(start, start + pageSize);

    tbody.innerHTML = this._renderTableRows(displayItems, headers);
    this._initTooltips();
  }

  /**
   * Cập nhật riêng phần Footer của bảng
   */
  updateFooter() {
    const tfoot = getE(`${this.containerId}-tfoot`);
    if (!tfoot || !this.options.footer) return;

    const { fieldConfigs, filteredData, allFieldsOrder } = this.state;
    const headers = allFieldsOrder.filter((h) => fieldConfigs[h]);

    tfoot.innerHTML = this._renderTableFooter(filteredData, headers);
  }

  /**
   * Cập nhật riêng phần phân trang
   */
  updatePagination() {
    const paginationArea = getE(`${this.containerId}-pagination-area`);
    if (!paginationArea) return;

    const { filteredData, currentPage } = this.state;
    const pageSize = this.options.pageSize || 25;

    paginationArea.innerHTML = this._renderPagination(filteredData.length, pageSize, currentPage);
  }

  /**
   * Cập nhật headerExtra và render lại menu
   */
  updateHeaderExtra(newExtra) {
    try {
      this.state.headerExtra = Array.isArray(newExtra) ? newExtra : newExtra ? [newExtra] : [];
      this._renderHeaderMenu();
    } catch (error) {
      console.error('[ATable] updateHeaderExtra error:', error);
    }
  }

  /**
   * Áp dụng trạng thái ẩn/hiện cột hàng loạt từ các checkbox trong dropdown
   */
  applyFieldVisibility() {
    try {
      const dropdown = this.container.querySelector('.at-fields-dropdown');
      if (!dropdown) return;

      const checkboxes = dropdown.querySelectorAll('.at-field-checkbox');
      const updates = [];

      checkboxes.forEach((chk) => {
        updates.push({
          name: chk.value,
          visible: chk.checked,
        });
      });

      // Cập nhật state hàng loạt
      updates.forEach((upd) => {
        const { name, visible } = upd;
        if (visible) {
          if (this.state.hiddenFields[name]) {
            this.state.fieldConfigs[name] = this.state.hiddenFields[name];
            delete this.state.hiddenFields[name];
          }
        } else {
          if (this.state.fieldConfigs[name]) {
            this.state.hiddenFields[name] = this.state.fieldConfigs[name];
            delete this.state.fieldConfigs[name];
          }
        }
      });

      // Render lại bảng
      this.render();
      L._('Đã cập nhật hiển thị cột', 'success');
    } catch (error) {
      console.error('[ATable] applyFieldVisibility error:', error);
    }
  }

  /**
   * Chuyển đổi trạng thái ẩn/hiện của một field (Giữ lại để tương thích ngược hoặc dùng lẻ)
   */
  // toggleField(fieldName, isVisible) {
  //   try {
  //     if (isVisible) {
  //       // Chuyển từ hiddenFields sang fieldConfigs
  //       if (this.state.hiddenFields[fieldName]) {
  //         this.state.fieldConfigs[fieldName] = this.state.hiddenFields[fieldName];
  //         delete this.state.hiddenFields[fieldName];
  //       }
  //     } else {
  //       // Chuyển từ fieldConfigs sang hiddenFields
  //       if (this.state.fieldConfigs[fieldName]) {
  //         this.state.hiddenFields[fieldName] = this.state.fieldConfigs[fieldName];
  //         delete this.state.fieldConfigs[fieldName];
  //       }
  //     }
  //
  //     // Render lại bảng để cập nhật giao diện
  //     this.render();
  //   } catch (error) {
  //     console.error('[ATable] toggleField error:', error);
  //   }
  // }

  async download(type = 'excel') {
    try {
      const { colName, title } = this.options;
      const { filteredData, fieldConfigs, allFieldsOrder } = this.state;

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
            const bookingsrc = await A.DB.local.getCollection('bookings');
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

      const headers = allFieldsOrder.filter((h) => fieldConfigs[h]);

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

        if (window.A?.Modal) window.A.Modal.show(tempDiv, 'Xuất file PDF');

        const opt = {
          margin: [10, 10, 10, 10],
          filename: `${fileName}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        };

        await html2pdf().set(opt).from(tempDiv).save();
        if (window.A?.Modal) window.A.Modal.hide();
      }

      L._(`Đã xuất file ${type} thành công: ${fileName}`, 'success');
    } catch (err) {
      console.error('[ATable] download error:', err);
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
  updateOptions(options = {}) {
    let existingExtra;
    if (!options.headerExtra) {
      existingExtra = this.container.querySelector('.at-header-extra')?.innerHTML;
      this.state.headerExtra = [existingExtra];
    }
    this.options = { ...this.options, ...options };
    this.init(this.options.data, this.options.colName);
  }

  destroy() {
    if (this.containerId) {
      ATable.instances.delete(this.containerId);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Helper: Render ô chứa dữ liệu dạng object
   */
  _renderObjectCell(val, config, field) {
    try {
      const tableHtml = this._objectToTableHtml(val);
      const valStr = encodeURIComponent(JSON.stringify(val));
      const tooltipAttr = `data-bs-toggle="tooltip" data-bs-placement="top" title='${tableHtml.replace(/'/g, '&apos;')}'`;

      return `
        <td data-field="${field}" class="at-object-cell">
          <div class="d-flex align-items-center justify-content-center gap-2">
            <span class="badge bg-light text-primary border cursor-help" ${tooltipAttr}>
              <i class="fas fa-cube me-1"></i> Object
            </span>
            <button class="btn btn-xs btn-outline-primary at-view-object" data-val="${valStr}" title="Xem chi tiết">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </td>`;
    } catch (err) {
      console.error('[ATable] _renderObjectCell error:', err);
      return `<td data-field="${field}">Error</td>`;
    }
  }

  /**
   * Helper: Chuyển đổi object thành HTML table đơn giản cho tooltip
   */
  _objectToTableHtml(obj) {
    if (!obj || typeof obj !== 'object') return String(obj);
    try {
      let rows = '';
      Object.entries(obj).forEach(([key, val]) => {
        let displayVal = val;
        if (typeof val === 'object' && val !== null) {
          displayVal = Array.isArray(val) ? `Array(${val.length})` : '{...}';
        }
        rows += `
          <tr>
            <td class="text-start fw-bold pe-2" style="font-size: 10px; color: #666;">${key}:</td>
            <td class="text-start" style="font-size: 10px;">${escapeHtml(String(displayVal))}</td>
          </tr>`;
      });
      return `<table class="table table-sm table-borderless mb-0 text-white">${rows}</table>`;
    } catch (err) {
      return 'Error rendering object';
    }
  }

  /**
   * Helper: Hiển thị popup chi tiết object
   */
  _showObjectPopup(val) {
    try {
      if (!window.A?.Modal) {
        console.warn('[ATable] window.A.Modal not found');
        alert(JSON.stringify(val, null, 2));
        return;
      }

      let rows = '';
      Object.entries(val).forEach(([key, value]) => {
        let displayValue = value;
        if (typeof value === 'object' && value !== null) {
          displayValue = `<pre class="mb-0 bg-light p-2 rounded" style="font-size: 11px;">${JSON.stringify(value, null, 2)}</pre>`;
        } else {
          displayValue = `<span class="fw-medium">${escapeHtml(String(value))}</span>`;
        }

        rows += `
          <tr>
            <th class="bg-light w-30" style="width: 150px;">${key}</th>
            <td>${displayValue}</td>
          </tr>`;
      });

      const html = `
        <div class="table-responsive">
          <table class="table table-bordered align-middle mb-0">
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      A.Modal.render(html, 'Chi tiết dữ liệu', { size: 'modal-sm', footer: false });
      A.Modal.show();
    } catch (err) {
      console.error('[ATable] _showObjectPopup error:', err);
    }
  }
}
