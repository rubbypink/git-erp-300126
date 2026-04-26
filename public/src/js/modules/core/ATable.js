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
    /**
     * Lấy instance của ATable từ ID hoặc element
     */
    static getInstance(idOrEl) {
        let containerId = typeof idOrEl === 'string' ? idOrEl : idOrEl?.id;
        if (!containerId) return null;
        return ATable.instances.get(containerId) || null;
    }

    constructor(containerId, options = {}) {
        // 1. Kiểm tra instance đã tồn tại chưa
        if (ATable.instances.has(containerId)) {
            const existing = ATable.instances.get(containerId);
            existing.updateOptions(options);
            return existing;
        }

        // 2. Khởi tạo thuộc tính cơ bản
        this.containerId = containerId;
        this.container = getE(containerId);
        if (this.container) this.container.getInstance = () => this;

        // 3. Khởi tạo Options & State
        this._initOptions(options);
        this._initState();

        if (!this.container) {
            console.warn(`[ATable] Container #${containerId} not found`);
        }

        // 4. Đăng ký instance vào registry
        ATable.instances.set(containerId, this);

        // 5. Khởi tạo dữ liệu nếu có
        if (this.options.data && this.containerId) {
            this.init(this.options.data);
        } else return this;
    }

    /**
     * Khởi tạo các tùy chọn cấu hình
     */
    _initOptions(options = {}) {
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
            hiddenField: false,
            ...options,
        };
    }

    /**
     * Khởi tạo trạng thái nội bộ
     */
    _initState() {
        this.state = {
            fullData: [],
            filteredData: [],
            settings: {},
            sort: { field: 'id', dir: 'desc' },
            groupByField: this.options.groupByField || null,
            currentPage: 1,
            fieldConfigs: {},
            hiddenFields: {},
            allFieldsOrder: [],
            dictionaries: {},
            isSecondary: false,
            currentColName: '',
            zoomLevel: 1,
            headerExtra: Array.isArray(this.options.headerExtra) ? this.options.headerExtra : this.options.headerExtra ? [this.options.headerExtra] : [],
        };
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
            await this._prefetchDictionaries();
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
            const btnSettings = getE(`${this.containerId}-btn-settings`, this.container);
            if (btnSettings.contains(e.target)) {
                e.preventDefault();
                this.generateOptionsForm();
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

            // Xử lý click xem chi tiết object (Tối ưu Memory: Lấy từ RAM, không lấy từ DOM)
            const viewObjBtn = target.closest('.at-view-object');
            if (viewObjBtn) {
                e.preventDefault();
                e.stopPropagation();

                const tr = viewObjBtn.closest('tr');
                const itemId = tr ? tr.dataset.item : null;
                const field = viewObjBtn.dataset.field;

                if (itemId && field) {
                    // Tìm đúng item trong bộ nhớ đang hiển thị
                    const item = this.state.fullData.find((i) => String(i.id || i.uid || i) === String(itemId));
                    if (item && item[field] !== undefined) {
                        const config = this.state.fieldConfigs[field] || {};
                        const title = config.displayName || field;
                        this._showObjectPopup(item[field], title, item); // Truyền raw data (chưa bị stringify)
                    } else {
                        console.warn('[ATable] Không tìm thấy data cho:', itemId, field);
                    }
                }
                return;
            }
        });

        A.Event.on(
            wrapper,
            'change',
            async (e) => {
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
     * Tối ưu Helper: Pre-fetch tất cả data source của các cột 1 LẦN DUY NHẤT
     * Hỗ trợ chuẩn hóa dữ liệu từ Array hoặc Object Map (Firestore chuẩn)
     */
    async _prefetchDictionaries() {
        this.state.dictionaries = this.state.dictionaries || {};
        const { fieldConfigs, allFieldsOrder } = this.state;

        // Chỉ lấy các cột đang được cấu hình có dataSource
        const fetchPromises = allFieldsOrder
            .filter((h) => fieldConfigs[h] && fieldConfigs[h].dataSource)
            .map(async (h) => {
                const source = fieldConfigs[h].dataSource;

                // Caching: Nếu chưa có dict cho source này thì mới fetch
                if (!this.state.dictionaries[source]) {
                    try {
                        const rawData = await this._getDataSource(source);

                        const displayDict = {}; // Từ điển nhẹ: Dùng để map ID -> Tên hiển thị (Render Table)
                        const fullByIdDict = {}; // Từ điển nặng: Map ID -> Full Object (Dành cho xử lý Logic)

                        if (rawData) {
                            // Chuẩn hóa thành Array để dễ lặp (bất chấp đầu vào là Array hay Object Map của Firestore)
                            // Bổ sung: Nếu bản thân rawData đã là 1 mảng thì giữ nguyên, nếu là Object thì gom Object.keys/values
                            let normalizedArray = [];
                            if (Array.isArray(rawData)) {
                                normalizedArray = rawData;
                            } else if (typeof rawData === 'object') {
                                // Duyệt Object Map của Firestore: { "id1": {...}, "id2": {...} }
                                Object.entries(rawData).forEach(([key, val]) => {
                                    // Đảm bảo val có chứa id bên trong để đồng nhất
                                    if (typeof val === 'object' && val !== null) {
                                        normalizedArray.push({ id: key, ...val });
                                    }
                                });
                            }

                            // Xây dựng 2 cuốn từ điển
                            normalizedArray.forEach((item) => {
                                if (item && typeof item === 'object') {
                                    const id = String(item.id || item.uid || item.value || '');

                                    if (id) {
                                        // 1. Lưu từ điển Full Data (Second Index)
                                        fullByIdDict[id] = item;

                                        // 2. Lưu từ điển Hiển thị (Display)
                                        displayDict[id] = item.displayName || item.name || item.title || item.user_name || item.text || item.full_name || id;
                                    }
                                } else if (typeof item === 'string' || typeof item === 'number') {
                                    // Xử lý fallback nếu mảng chỉ là các chuỗi hoặc số: ['Pending', 'Confirmed']
                                    const val = String(item);
                                    displayDict[val] = val;
                                    fullByIdDict[val] = item;
                                }
                            });
                        }

                        // Lưu vào State của Table
                        this.state.dictionaries[source] = displayDict;
                        this.state.dictionaries[`${source}_Obj`] = fullByIdDict; // Second index cho Full Data
                    } catch (err) {
                        console.error(`[ATable] Lỗi khi prefetch từ điển cho source "${source}":`, err);
                        this.state.dictionaries[source] = {};
                        this.state.dictionaries[`${source}_Obj`] = {};
                    }
                }
            });

        await Promise.all(fetchPromises);
    }

    async _getDataSource(source) {
        if (!source) return null;
        if (Array.isArray(source) || typeof source === 'object') {
            return source;
        }
        let codeStr = unescapeHtml(source);
        L._(`[ATable] _getDataSource: ${codeStr}`);
        try {
            if (codeStr.startsWith('APP_DATA')) {
                const paths = codeStr.split('.');
                let current = APP_DATA; // Quét từ root của RAM cache
                let foundInRAM = true;

                // 1. Quét sâu vào RAM một cách an toàn (Safe Traversal)
                for (let i = 1; i < paths.length; i++) {
                    if (current && current[paths[i]] !== undefined) {
                        current = current[paths[i]];
                    } else {
                        foundInRAM = false;
                        break; // Gãy nhánh ở RAM, dừng vòng lặp ngay để tránh lỗi TypeError
                    }
                }

                // Nếu tìm thấy mượt mà trên RAM, trả về luôn (Tốc độ ánh sáng)
                if (foundInRAM && current !== undefined && current !== null) {
                    // Trả về Array nếu là Object dạng { id1: {...}, id2: {...} } để Helper map data dễ hơn
                    return typeof current === 'object' && !Array.isArray(current) ? Object.values(current) : current;
                }

                // 2. FALLBACK XUỐNG LOCAL DB NẾU RAM MISS
                // paths[0] luôn là 'APP_DATA'
                // paths[1] là Collection (VD: 'users', 'rooms')
                // paths[2] là Document ID (VD: 'u123')
                if (!foundInRAM && paths.length > 1) {
                    const collectionName = paths[1];

                    if (paths.length === 2) {
                        // Trường hợp: "APP_DATA.users" -> Lấy Full Collection
                        const dbData = await A.DB.local.getAllAsObject(collectionName);
                        return dbData ? dbData : null;
                    } else if (paths.length === 3) {
                        // Trường hợp: "APP_DATA.users.u123" -> Lấy 1 Document
                        const docId = paths[2];
                        const docData = await A.DB.local.get(collectionName, docId);
                        return docData ? docData : null;
                    }
                }
                return null;
            }
            if (A?.DB?.schema.isCollection(codeStr)) {
                const data = await A.DB.local.getCollection(codeStr);

                if (data) return data;
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
                    return current;
                }
            }
        } catch (e) {
            console.warn(`[ATable] _getDataSource error for ${source}:`, e);
        }

        return null;
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
      <div class="d-flex flex-column h-100 w-100 table-container-wrapper" style="${fsStyle}"><div id="${this.containerId}-header-menu" class="table-header-actions-wrapper flex-center gap-2 flex-shrink-0" style="z-index: 1055;"></div>
        <div id="${this.containerId}-content-area" class="table-responsive w-100 at-table-container flex-grow-1" style="overflow: auto; position: relative;">
          <!-- Table will be rendered here -->
        </div>
        <div id="${this.containerId}-pagination-area" class="flex-shrink-0 bkg-light border-top pb-1">
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
        this._initTooltips();
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
              <button class="dropdown-item py-2 at-reload-data" type="button"><i class="fa-solid fa-sync-alt"></i> Reload Data</button>
          </div>
      </div>`;
        }

        let zoomHtml = '';
        if (zoom) {
            zoomHtml = `
        <div class="btn-group btn-group-sm gap-2 px-2 border shadow-sm at-zoom-group">
          <button type="button" class="btn btn-sm btn-light border-0 at-zoom-out" title="Thu nhỏ"><i class="fas fa-minus"></i></button>
          <button type="button" class="btn btn-sm btn-light border-0 at-zoom-in" title="Phóng to"><i class="fas fa-plus"></i></button>
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
      <div id="tbl-${this.containerId}-header" class="table-header-actions flex-center mb-1 gap-3 w-100" style="z-index: 5;">
        <h6 class="mb-0 fw-bold text-primary text-uppercase me-auto">${title || (colName ? window.A?.Lang?.t(colName) : '')}</h6>
        ${extraHtml}
        <div class="group-by-select">${groupByHtml}</div>
        ${zoomHtml}
        ${downloadHtml}
        ${draggableHtml}
        <div id="hidden-field-select">${hiddenFieldsDropdownHtml}</div>
        <div class="search-box" style="width: 150px;">
          <div class="input-group input-group-sm p-0 bkg-light rounded overflow-hidden shadow-sm border">
            <span class="input-group-text border-0"><i class="fas fa-search text-muted small"></i></span>
            <input type="text" class="form-control form-control-sm bkg-light border-0 ps-0 at-search-input" placeholder="Tìm kiếm nhanh..." style="box-shadow: none;">
          </div>
        </div>
        <button id="${this.containerId}-btn-settings" class="btn btn-light border-0 shadow-sm p-0 bg-transparent" style="font-size: large;"><icon class="fas fa-cog"></icon></button>
      </div>`;
    }

    /**
     * Trả về HTML cho một dropdown menu chứa danh sách các checkbox để ẩn/hiện field
     */
    _renderHiddenFieldsDropdown(update = false) {
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

        let html = `
      <div class="dropdown btn-group at-fields-dropdown">
        <button class="btn btn-sm btn-light border shadow-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside">
          <i class="fas fa-columns"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 bkg-light fs-2" style="overflow: hidden; min-width: 200px; max-height: 400px; overflow-y: auto;">
          <li class="dropdown-header sticky-top py-1 fw-bold border-bottom mb-1 d-flex justify-content-between align-items-center" style="z-index: 10;">
            <span class="small">Hiển thị cột</span>
            <button class="btn btn-xs btn-primary at-apply-fields" title="Áp dụng thay đổi">
              <i class="fas fa-check"></i> Áp dụng
            </button>
          </li>
          ${itemsHtml}
        </ul>
      </div>`;
        if (update) {
            const headerMenuEl = getE(`${this.containerId}-header-menu`);
            if (headerMenuEl) {
                const container = getE('hidden-field-select', headerMenuEl);
                if (container) container.innerHTML = html;
            }
            return html;
        }
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
        <thead class="table-secondary text-nowrap sticky-top border-bottom" style="z-index: 3; top: 0; font-size: 0.85rem;">
          <tr>${this._renderTableHead(headers)}</tr>
        </thead>
        <tbody class="grid-body text-nowrap" id="${this.containerId}-tbody">
          ${this._renderTableRows(displayItems, headers)}
        </tbody>
        ${footer ? `<tfoot class="table-light fw-bold border-top-2 sticky-bottom" id="${this.containerId}-tfoot" style="z-index: 2; bottom: 0;">${this._renderTableFooter(filteredData, headers)}</tfoot>` : ''}
      </table>`;
        this._renderGroupByBtn(true);
        this._renderHiddenFieldsDropdown(true);
        this._initResizer();
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
                  val = this._tryParseJSON(val);

                  if ((config.type === 'date' || config.name?.split('_').includes('at')) && val) val = formatDateISO(val);
                  if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);
                  if ((typeof val === 'object' && val !== null) || config.type === 'map' || config.type === 'json') {
                      return this._renderObjectCell(val, config, h);
                  }

                  if (editable && config.editable !== false) {
                      return this._renderEditableCell(h, val, config);
                  }

                  // Xử lý field type select hoặc có dataSource
                  if (config.type === 'select' || config.tag === 'select' || config.dataSource) {
                      return this._renderSelectCell(h, val, config);
                  }

                  const isHtml = config.type === 'html' || config.html === true;
                  let displayVal = String(val);

                  const isLong = !isHtml && displayVal.length > 50;
                  const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
                  const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';
                  const firstCell = h === 'id' || h === 'uid';

                  return `<td data-field="${h}" data-val="${val}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''} ${firstCell ? 'drag-handle' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${isHtml ? escapeHtml(shortVal) : displayVal}</td>`;
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
            const displayGroupName = fieldConfigs[groupByField]?.type === 'date' ? formatDateISO(groupName) : groupName;

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
                    val = this._tryParseJSON(val);
                    if (config.type === 'date' && val) val = formatDateISO(val);
                    if (config.class?.split(' ').includes('number') && val) val = formatNumber(val);

                    if ((typeof val === 'object' && val !== null) || config.type === 'object') {
                        return this._renderObjectCell(val, config, h);
                    }

                    if (editable && config.editable !== false) {
                        return this._renderEditableCell(h, val, config);
                    }

                    // Xử lý field type select hoặc có dataSource
                    if (config.type === 'select' || config.tag === 'select' || config.dataSource) {
                        return this._renderSelectCell(h, val, config);
                    }

                    let displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
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

    /**
     * Render ô chứa dữ liệu dạng Select (Hiển thị tên thay vì ID)
     */
    _renderSelectCell(field, val, config) {
        let displayVal = String(val);
        if (config.dataSource) {
            const dict = this.state.dictionaries[config.dataSource];
            if (dict && dict[String(val)]) {
                displayVal = dict[String(val)];
            }
        } else if (config.options) {
            const opt = config.options.find((o) => String(o.id || o.uid || o) === String(val));
            if (opt) displayVal = opt.name || opt.text || opt.displayName || opt;
        }

        const isLong = displayVal.length > 50;
        const shortVal = isLong ? displayVal.substring(0, 47) + '...' : displayVal;
        const tooltipAttr = isLong ? `title="${escapeHtml(displayVal)}" data-bs-toggle="tooltip"` : '';

        return `<td data-field="${field}" data-val="${val}" ${tooltipAttr} class="${isLong ? 'text-truncate' : ''}" style="${isLong ? 'max-width: 200px;' : ''}">${escapeHtml(shortVal)}</td>`;
    }

    _renderEditableCell(field, val, config) {
        const tag = config.tag || 'input';
        const type = config.type || 'text';
        const extraClass = config.class || '';
        const attrs = Array.isArray(config.attrs)
            ? config.attrs
                  .filter((attr) => {
                      attr !== 'readonly' || attr !== 'hidden';
                  })
                  .join(' ')
            : String(config.attrs).replace('readonly', '').replace('hidden', '');
        const baseClass = 'form-control form-control-sm m-0 px-1 border-0 bg-transparent text-center at-cell-edit';
        const fullClass = `${baseClass} ${extraClass.replace('d-none', '')}`.trim();

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
                const optionsHtml = options
                    .map((opt) => {
                        const optId = String(opt.id || opt.uid || opt);
                        const optName = opt.name || opt.text || opt.displayName || opt;
                        const isSelected = String(optId) === String(val);
                        return `<option value="${optId}" ${isSelected ? 'selected' : ''}>${optName}</option>`;
                    })
                    .join('');
                inputHtml = `<select class="${fullClass}" data-field="${field}" ${selectAttrs}>${optionsHtml}</select>`;
            }
        } else if (tag === 'textarea') {
            inputHtml = `<textarea class="${fullClass}" data-field="${field}" ${attrs} rows="1" cols="2">${val}</textarea>`;
        } else if (type === 'status' || config.name === 'status') {
            inputHtml = `<at-status data-field="${field}" ${attrs}>${val}</at-status>`;
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
                return `<td class="bkg-light sticky-bottom" style="bottom: 0; z-index: 4;">${result}</td>`;
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
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            const tableContainer = this.container.querySelector('.table-container-wrapper');
            if (!tableContainer || tableContainer.dataset.tooltipInited) return;

            // Khởi tạo qua cha, tự động áp dụng cho mọi element con (kể cả element mới được render sau này)
            new bootstrap.Tooltip(tableContainer, {
                selector: '[data-bs-toggle="tooltip"]',
                html: true,
                trigger: 'hover', // Tránh lỗi kẹt tooltip
            });

            tableContainer.dataset.tooltipInited = 'true';
        }
    }

    async _handleCellChange(itemId, field, value) {
        const item = this.state.fullData.find((i) => (i.id || i.uid) === itemId);
        const collection = this.options.colName;
        if (item) {
            item[field] = value;
            if (this.options.onCellChange) {
                this.options.onCellChange(collection, itemId, { field: value, item: item });
            } else if (collection && itemId) {
                const res = await this._defaultCellChange(collection, itemId, { field: value });
                if (res && res.success) logA(`Lưu thành công: ${res.message}`, 'success', 'toast');
                else logA(`Lưu thất bại: ${res.message}`, 'warning', 'toast');
            }
        }
    }
    async _defaultCellChange(collection, itemId, change) {
        showConfirm(
            `Lưu thông tin?`,
            async () => {
                try {
                    const res = await A.DB.updateSingle(collection, itemId, change);
                    if (res && res.success) logA(`Lưu thành công: ${res.message}`, 'success', 'toast');
                    else logA(`Lưu thất bại: ${res.message}`, 'warning', 'toast');
                } catch (e) {
                    logA(`Lưu thất bại: ${e.message}`, 'warning', 'toast');
                }
            },
            () => {
                StateProxy.undo();
            }
        );
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
        if (this.options.customfieldConfigs) {
            this.state.fieldConfigs = this.options.customfieldConfigs;
            if (this.options.customfieldConfigs) {
                this.state.fieldConfigs = this.options.customfieldConfigs;
                // ✅ Thêm dòng này:
                this.state.allFieldsOrder = Object.keys(this.options.customfieldConfigs);
                return;
            }

            return;
        }

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

    /**
     * Lọc dữ liệu theo từ khóa
     * @param {string} keyword - Từ khóa tìm kiếm
     */
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

    /**
     * Sắp xếp dữ liệu theo cột
     * @param {string} field - Tên trường cần sắp xếp
     */
    sort(field) {
        const { sort, filteredData } = this.state;
        const dir = sort.field === field && sort.dir === 'asc' ? 'desc' : 'asc';
        this.state.sort = { field, dir };

        if (A?.UI?.stableSort) {
            this.state.filteredData = A.UI.stableSort(filteredData, this.options.colName, { column: field, dir: dir });
        }
        this.refresh();
    }

    /**
     * Gom nhóm dữ liệu theo trường
     * @param {string} field - Tên trường cần gom nhóm
     */
    groupBy(field) {
        this.state.groupByField = field || null;
        this.refresh();
    }

    /**
     * Chuyển đến trang chỉ định
     * @param {number} page - Số trang
     */
    goToPage(page) {
        const pageSize = this.options.pageSize || 25;
        const totalPages = Math.ceil(this.state.filteredData.length / pageSize) || 1;

        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        this.state.currentPage = page;
        this.refresh();
    }

    /**
     * Phóng to/thu nhỏ bảng nội dung
     * @param {number} direction - Hướng thay đổi (1: phóng to, -1: thu nhỏ)
     */
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
     * Cập nhật ẩn hiện các thành phần trên Header Menu dựa trên options
     */
    _updateHeaderVisibility() {
        const headerMenuEl = getE(`${this.containerId}-header-menu`);
        if (!headerMenuEl) return;

        const { groupBy, download, zoom, hiddenField, header } = this.options;

        // Header chính
        const headerEl = getE(`tbl-${this.containerId}-header`, headerMenuEl);
        if (headerEl) headerEl.classList.toggle('d-none', !header);

        // GroupBy
        const groupBySelect = headerMenuEl.querySelector('.group-by-select');
        if (groupBySelect) {
            groupBySelect.classList.toggle('d-none', !groupBy);
            if (groupBy) this._renderGroupByBtn(true);
        }

        // Download
        const downloadGroup = headerMenuEl.querySelector('.at-download-group');
        if (downloadGroup) downloadGroup.classList.toggle('d-none', !download);

        // Zoom
        const zoomGroup = headerMenuEl.querySelector('.at-zoom-group');
        if (zoomGroup) zoomGroup.classList.toggle('d-none', !zoom);

        // Hidden Fields
        const hiddenFieldContainer = getE('hidden-field-select', headerMenuEl);
        if (hiddenFieldContainer) {
            hiddenFieldContainer.classList.toggle('d-none', !hiddenField);
            if (hiddenField) this._renderHiddenFieldsDropdown(true);
        }
    }

    /**
     * Cập nhật headerExtra và render lại menu
     */
    updateHeaderExtra(newExtra) {
        try {
            this.state.headerExtra = Array.isArray(newExtra) ? newExtra : newExtra ? [newExtra] : [];

            // Tối ưu: Chỉ cập nhật nội dung container extra thay vì render lại toàn bộ menu
            const extraEl = this.container?.querySelector('.at-header-extra');
            if (extraEl) {
                const content = this.state.headerExtra
                    .map((item) => {
                        if (typeof item === 'string') {
                            const el = document.getElementById(item);
                            if (el && el.tagName === 'TEMPLATE') return el.innerHTML;
                            return item;
                        }
                        if (item instanceof HTMLElement) return item.outerHTML;
                        return '';
                    })
                    .join('');
                extraEl.innerHTML = content;
            } else {
                this._renderHeaderMenu();
            }
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

    /**
     * Tải dữ liệu bảng về máy
     * @param {string} type - Định dạng file ('excel' hoặc 'pdf')
     */
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

                    if (config.type === 'date' && val) val = formatDateISO(val);
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
              <tr style="background-color: var(--app-bg); color: var(--text-color);">
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

    /**
     * Cập nhật dữ liệu mới cho bảng
     * @param {Array|Object} newData - Mảng dữ liệu hoặc Object map
     */
    updateData(newData) {
        this.state.fullData = Array.isArray(newData) ? newData : Object.values(newData);
        this.state.filteredData = [...this.state.fullData];
        const searchVal = this.container?.querySelector('.at-search-input')?.value || '';
        this.filter(searchVal);
    }

    /**
     * Lấy toàn bộ dữ liệu hiện tại trong RAM
     */
    getData() {
        return this.state.fullData;
    }
    /**
     * Cập nhật các tùy chọn cấu hình và refresh bảng
     */
    async updateOptions(options = {}) {
        const prevColName = this.options.colName;

        // 1. Xử lý headerExtra: giữ nguyên nội dung hiện tại nếu không cung cấp mới
        if (options.headerExtra === undefined) {
            const existingExtraEl = this.container?.querySelector('.at-header-extra');
            if (existingExtraEl) {
                this.state.headerExtra = [existingExtraEl.innerHTML];
            }
        } else if (options.headerExtra === false || options.headerExtra === 'false') {
            this.state.headerExtra = [];
        } else {
            this.state.headerExtra = Array.isArray(options.headerExtra) ? options.headerExtra : [options.headerExtra];
        }

        // 2. Cập nhật options
        this.options = { ...this.options, ...options };

        // 3. Cập nhật hiển thị Header (ẩn/hiện components)
        this._updateHeaderVisibility();

        // 4. Nếu thay đổi Collection -> Resolve lại cấu hình
        if (options.colName && options.colName !== prevColName) {
            this.state.fieldConfigs = {};
            this.state.hiddenFields = {};
            this.state.allFieldsOrder = [];
            this._resolveFieldConfigs();
            await this._prefetchDictionaries();
        }

        // 5. Cập nhật dữ liệu nếu có
        if (options.data !== undefined) {
            this.updateData(options.data);
        }

        // 6. Refresh nội dung bảng
        this.refresh();
    }

    /**
     * Hủy instance và dọn dẹp bộ nhớ/sự kiện
     */
    destroy() {
        if (this.containerId) {
            ATable.instances.delete(this.containerId);
        }

        // Hủy Sortable instance nếu có
        if (this.state.draggable) {
            this.state.draggable.destroy();
        }

        // Hủy các tooltips đã gắn vào container
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            const tooltipInstance = bootstrap.Tooltip.getInstance(this.container.querySelector('.table-container-wrapper'));
            if (tooltipInstance) tooltipInstance.dispose();
        }

        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Helper: Render ô chứa dữ liệu dạng object
     */
    /**
     * Tối ưu: Render ô chứa dữ liệu dạng Object / Array
     * Trọng tâm: KHÔNG lưu JSON vào DOM attribute để tránh phình bộ nhớ.
     */
    _renderObjectCell(val, config, field) {
        try {
            const isArray = Array.isArray(val);
            const keyCount = isArray ? val.length : Object.keys(val).length;
            const typeText = isArray ? `Xem DS (${keyCount})` : `(${keyCount} Thông tin)`;
            const icon = isArray ? 'fa-list-ol' : 'fa-cube';

            // Tạo tóm tắt siêu ngắn gọn cho Tooltip (chỉ lấy 2 key đầu)
            let summary = '';
            if (isArray && keyCount > 0) {
                summary = `Gồm ${keyCount} phần tử...`;
            } else if (!isArray && keyCount > 0) {
                const sampleKeys = Object.keys(val).slice(0, 2);
                summary = sampleKeys.map((k) => `${k}: ${String(val[k]).substring(0, 20)}`).join(', ');
                if (keyCount > 2) summary += '...';
            } else {
                summary = 'Dữ liệu trống';
            }

            // Chỉ truyền tên field. Element cha <tr> đã có sẵn data-item (ID).
            return `
        <td data-field="${field}" class="at-object-cell text-center align-middle">
          <div class="d-inline-flex align-items-center gap-2 border rounded px-2 py-1 bkg-light shadow-sm">
            <span class="small text-muted cursor-help" data-bs-toggle="tooltip" title="${escapeHtml(summary)}">
              <i class="fas ${icon} me-1 text-secondary"></i> ${typeText}
            </span>
            <button type="button" class="btn btn-xs btn-outline-primary p-0 px-1 at-view-object" data-field="${field}" title="Xem chi tiết">
              <i class="fas fa-eye" style="font-size: 0.75rem;"></i>
            </button>
          </div>
        </td>`;
        } catch (err) {
            console.error('[ATable] _renderObjectCell error:', err);
            return `<td data-field="${field}"><span class="text-danger">Lỗi</span></td>`;
        }
    }

    /**
     * Helper: Thuật toán đệ quy render Object/Array đa tầng
     */
    _buildNestedObjectHtml(obj, depth = 0) {
        L._(`[ATable] _buildNestedObjectHtml: ${JSON.stringify(obj)}`);
        if (obj === null || obj === undefined) return '<span class="badge bkg-light text-muted border">null</span>';
        if (typeof obj !== 'object') return `<span class="fw-medium">${escapeHtml(String(obj))}</span>`;

        // 1. XỬ LÝ MẢNG (ARRAY)
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '<span class="text-muted small">[] (Mảng rỗng)</span>';

            // Nếu là mảng giá trị đơn (string, number) -> Dùng badge cho gọn
            if (typeof obj[0] !== 'object' || obj[0] === null) {
                return obj.map((v) => `<span class="badge bg-info  border me-1 mb-1 shadow-sm">${A.Lang?.t(v) || escapeHtml(String(v))}</span>`).join('');
            }

            // Nếu là mảng Object -> Vẽ bảng
            const keys = Array.from(new Set(obj.flatMap((o) => Object.keys(o || {}))));
            let html = `<div class="table-responsive bkg-light rounded border mt-1 mb-2 shadow-sm">
                    <table class="table table-sm table-hover table-bordered mb-0" style="font-size: 0.7rem;">`;
            html += `<thead class="table-light text-nowrap"><tr>${keys.map((k) => `<th class="text-secondary fw-bold">${escapeHtml(k)}</th>`).join('')}</tr></thead><tbody>`;
            html += obj.map((row) => `<tr>${keys.map((k) => `<td>${this._buildNestedObjectHtml(row[k], depth + 1)}</td>`).join('')}</tr>`).join('');
            html += `</tbody></table></div>`;
            return html;
        }

        // 2. XỬ LÝ OBJECT / FIRESTORE MAP
        const keys = Object.keys(obj);
        if (keys.length === 0) return '<span class="text-muted small">{} (Object rỗng)</span>';

        // Vẽ layout dạng Tree-Table (Key - Value)
        let html = `<table class="table table-sm table-borderless mb-0 w-100 ${depth > 0 ? 'border-start border-2 border-primary ms-2' : ''}" style="font-size: 0.7rem;"><tbody>`;
        keys.forEach((key) => {
            const val = obj[key];
            const isComplex = typeof val === 'object' && val !== null;

            html += `
        <tr class="border-bottom border-light">
          <th class="text-nowrap fw-bold  align-top pt-2" style="width: 1%; padding-left: 0.5rem; background-color: var(--app-bg);">
            ${isComplex ? `<i class="fas fa-layer-group text-primary me-2 small"></i>` : `<i class="fas fa-caret-right text-muted me-2 small"></i>`} 
            ${escapeHtml(val)}
          </th>
          <td class="text-break align-middle pt-2 pb-2">
            ${this._buildNestedObjectHtml(val, depth + 1)}
          </td>
        </tr>`;
        });
        html += `</tbody></table>`;
        return html;
    }

    /**
     * Tối ưu Helper: Cập nhật hàm gọi Modal hiển thị
     */
    _showObjectPopup(rawData, title = 'Chi tiết dữ liệu', fullItem = null) {
        try {
            if (!window.A?.Modal) {
                alert(JSON.stringify(rawData, null, 2));
                return;
            }

            let contentHtml = '';
            let icon = '<i class="fas fa-database text-primary me-2"></i>';

            // ĐỊNH TUYẾN 1: Nếu là dữ liệu Giá Khách Sạn -> Vẽ Ma trận
            if (this._isHotelPriceMatrix(rawData)) {
                icon = '<i class="fas fa-th text-success me-2"></i>';
                const currentHotelId = fullItem?.info?.hotelId || fullItem?.info?.hotel_id || fullItem?.info?.id || '';
                let hotel = APP_DATA.hotels[currentHotelId];
                contentHtml = this._buildMatrixHtml(rawData, hotel);
                title = `Bảng Giá ${hotel?.name} - ${fullItem?.info?.year}`;
            }
            // ĐỊNH TUYẾN 2: Dữ liệu Object/Array lồng nhau thông thường -> Đệ quy
            else {
                contentHtml = `
          <div class="at-nested-viewer rounded overflow-auto" style="max-height: 70vh; background-color: var(--app-bg);">
            ${this._buildNestedObjectHtml(rawData)}
          </div>`;
            }

            A.Modal.render(contentHtml, `${icon} Dữ Liệu: ${title.toUpperCase()}`, { size: 'modal-xl', footer: false });
            A.Modal.show();
        } catch (err) {
            console.error('[ATable] _showObjectPopup error:', err);
        }
    }

    /**
     * Helper: Nhận diện cấu trúc Matrix Giá Hotel
     * Cấu trúc chuẩn: { "roomId_rateType": { "periodId_supplierId": { costPrice, sellPrice... } } }
     */
    _isHotelPriceMatrix(obj) {
        try {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
            const keys1 = Object.keys(obj);
            if (keys1.length === 0 || !keys1[0].includes('___')) return false;

            const val1 = obj[keys1[0]];
            if (!val1 || typeof val1 !== 'object') return false;

            const keys2 = Object.keys(val1);
            if (keys2.length === 0 || !keys2[0].includes('___')) return false;

            const leaf = val1[keys2[0]];
            // Nếu có 1 trong các key đặc trưng của giá thì xác nhận là Ma trận
            return leaf && (leaf.costPrice !== undefined || leaf.sellPrice !== undefined || leaf.price !== undefined || leaf.startDate !== undefined);
        } catch (e) {
            return false;
        }
    }

    /**
     * Helper: Build giao diện Ma trận bảng giá
     */
    _buildMatrixHtml(obj, hotel) {
        const items = [];
        const rooms = new Set();
        const rateTypes = new Set();
        const periods = new Set();
        let globalSupplier = 'N/A';
        const periodData = {}; // Lưu: { periodId: { sDate, eDate } }

        let roomData = hotel?.rooms;

        // 1. Phân tách và san phẳng dữ liệu (Flatten Data)
        Object.entries(obj).forEach(([key1, val1]) => {
            // Split by _ and pop the last part in case roomId contains _
            const parts1 = key1.split('___');
            const rateType = parts1.pop();
            const roomId = parts1.join('___');

            rooms.add(roomId);
            rateTypes.add(rateType);

            if (val1 && typeof val1 === 'object') {
                Object.entries(val1).forEach(([key2, val2]) => {
                    const parts2 = key2.split('___');
                    const supplierId = parts2.pop();
                    if (globalSupplier === 'N/A') globalSupplier = supplierId;
                    const periodId = parts2.join('___');
                    if (!periodData[periodId]) {
                        periodData[periodId] = {
                            sDate: this._formatShortDate(val2.startDate),
                            eDate: this._formatShortDate(val2.endDate),
                        };
                    }
                    periods.add(periodId);
                    items.push({ roomId, rateType, periodId, supplierId, ...val2 });
                });
            }
        });

        // 2. Logic Trục thông minh: Ưu tiên trải dài CỘT
        // Ông nào NHIỀU ITEM HƠN sẽ được ưu tiên làm CỘT (để dễ so sánh ngang).
        // Ông nào ÍT ITEM HƠN sẽ bị đẩy xuống làm Dòng Cha (Group).

        // Mặc định ban đầu: Giai đoạn làm Cột, Gói giá làm Dòng Cha
        let parentKey = 'rateType';
        let colKey = 'periodId';
        let parentSet = rateTypes;
        let colSet = periods;
        let parentLabel = 'Gói Giá (Rate Type)';
        let colLabel = 'Giai Đoạn (Period)';

        // ĐẢO TRỤC: Nếu Gói giá (VD: 7) > Giai đoạn (VD: 1)
        if (rateTypes.size > periods.size) {
            parentKey = 'periodId'; // Giai đoạn bị đẩy làm Dòng Cha
            colKey = 'rateType'; // Gói giá được đẩy lên làm Cột
            parentSet = periods;
            colSet = rateTypes;
            parentLabel = 'Giai Đoạn (Period)';
            colLabel = 'Gói Giá (Rate Type)';
        }

        const cols = Array.from(colSet);
        const parentGroups = Array.from(parentSet);
        const roomList = Array.from(rooms);
        const supplierName = APP_DATA.suppliers[globalSupplier]?.name || globalSupplier;

        // 3. Render HTML
        let html = `<div class="table-responsive bkg-light rounded shadow-sm border" style="max-height: 75vh; overflow-y: auto;">
                  <table class="table table-bordered table-hover table-sm align-middle mb-0 text-nowrap" style="font-size: 0.75rem;">`;

        // HEADER
        html += `<thead class="table-dark sticky-top" style="z-index: 2;">
    <tr>
      <th class="text-center bkg-light text-warning p-2" style="width: 180px; border-right: 2px solid #444;">
         <div class="small opacity-75">NHÀ CUNG CẤP</div>
         <div class="fw-bold"><i class="fas fa-handshake"></i> ${supplierName}</div>
      </th>`;
        cols.forEach((c) => {
            // Nếu cột là Period, hiển thị kèm ngày
            let subTitle = '';
            if (colKey === 'periodId' && periodData[c]) {
                subTitle = `<div class="small fw-normal opacity-75">${periodData[c].sDate} - ${periodData[c].eDate}</div>`;
            }
            html += `<th class="text-center py-2">
                <div class="fw-bold">${window.A?.Lang?.t(c) || c}</div>
                ${subTitle}
                </th>`;
        });
        html += `</tr></thead><tbody>`;

        // BODY
        parentGroups.forEach((groupVal) => {
            const displayGroup = window.A?.Lang?.t(groupVal) || groupVal;
            let groupExtraInfo = '';
            if (parentKey === 'periodId' && periodData[groupVal]) {
                groupExtraInfo = ` <span class="badge bkg-light text-primary ms-2">${periodData[groupVal].sDate} - ${periodData[groupVal].eDate}</span>`;
            }
            // Dòng Cha (Group)
            html += `<tr class="table-active">
                 <td colspan="${cols.length + 1}" class="fw-bold text-primary text-uppercase" style="border-top: 2px solid #dee2e6; border-bottom: 2px solid #dee2e6;">
                   <i class="fas fa-folder-open me-2"></i> ${parentLabel}: <span class="text-danger">${displayGroup}</span>${groupExtraInfo}
                 </td>
               </tr>`;

            // Các dòng Con (Room)
            roomList.forEach((roomVal) => {
                let hasData = false; // Cờ kiểm tra xem phòng này có data trong group này không
                const roomObj = Array.isArray(roomData) ? roomData.find((r) => String(r.id) === String(roomVal)) : roomData[roomVal];
                const displayRoom = roomObj?.name || roomVal;

                let rowHtml = `<tr>
                         <td class="fw-bold text-start ps-3 bkg-light" style="border-right: 2px solid #dee2e6;">
                           ${displayRoom}
                         </td>`;

                cols.forEach((colVal) => {
                    // Khớp dữ liệu
                    const match = items.find((i) => i.roomId === roomVal && i[parentKey] === groupVal && i[colKey] === colVal);

                    if (match) {
                        hasData = true;
                        // Xử lý format tiền tệ và ngày tháng
                        const cost = typeof formatMoney === 'function' ? formatMoney(match.costPrice) : match.costPrice;
                        const sell = typeof formatMoney === 'function' ? formatMoney(match.sellPrice) : match.sellPrice;

                        // Áp dụng format mới
                        // const sDate = formatShortDate(match.startDate);
                        // const eDate = formatShortDate(match.endDate);
                        // const supId = match.supplier || match.supplierId || 'N/A';

                        rowHtml += `
              <td class="text-center" style="min-width: 100px; vertical-align: top;">
                <div class="d-flex flex-column gap-1 h-100 w-100">
                  <div class="px-2 py-1 d-flex justify-content-between border-bottom bg-danger bg-opacity-10">
                    <span class="text-muted small">NET:</span>
                    <span class="text-danger fw-bold">${cost}</span>
                  </div>
                  <div class="px-2 py-1 d-flex justify-content-between bg-success bg-opacity-10">
                    <span class="text-muted small">BÁN:</span>
                    <span class="text-success fw-bold">${sell}</span>
                  </div>
                </div>
              </td>`;
                    } else {
                        rowHtml += `<td class="text-center bkg-light opacity-50"><i class="fas fa-minus small"></i></td>`;
                    }
                });
                rowHtml += `</tr>`;

                // Chỉ in ra dòng nếu phòng này thực sự có giá trong Group này
                if (hasData) {
                    html += rowHtml;
                }
            });
        });

        html += `</tbody></table></div>`;
        return html;
    }

    // Helper format ngày siêu an toàn (nằm gọn bên trong loop)
    _formatShortDate(dateVal) {
        if (!dateVal) return '?';
        const str = String(dateVal); // Ép kiểu số về chuỗi an toàn

        // Bắt định dạng YYYYMMDD (ví dụ: 20260331 -> 31/03)
        if (str.length === 8 && !isNaN(str)) {
            return `${str.substring(6, 8)}/${str.substring(4, 6)}`;
        }

        // Bắt định dạng chuẩn YYYY-MM-DD (2026-03-31 -> 31/03)
        if (str.includes('-')) {
            const parts = str.split('T')[0].split('-'); // Loại bỏ giờ nếu có
            return parts.length === 3 ? `${parts[2]}/${parts[1]}` : str.substring(0, 5);
        }

        // Các trường hợp khác (DD/MM/YYYY)
        return str.substring(0, 5);
    }

    /**
     * Helper: Quét và dịch ngược chuỗi JSON thành Object/Array một cách an toàn
     */
    _tryParseJSON(val) {
        // Chỉ xử lý nếu là chuỗi, có độ dài hợp lý và có dấu hiệu của JSON
        if (typeof val === 'string' && val.length >= 2) {
            const trimmed = val.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    return JSON.parse(trimmed); // Ép kiểu thành Object/Array
                } catch (e) {
                    return val; // Nếu lỗi parse (JSON fake), trả về chuỗi gốc
                }
            }
        }
        return val;
    }

    /**
     * Tạo form cấu hình từ đối tượng options hiện tại
     */
    generateOptionsForm() {
        try {
            const finalOptions = { ...this.options };
            delete finalOptions.data; // Không đưa data vào form config
            delete finalOptions.onCellChange;
            if (this.options.headerExtra) delete finalOptions.headerExtra;

            finalOptions.colName = this.state?.currentColName || this.options.colName || 'bookings';

            // Bản đồ nhãn tiếng Việt
            const labels = {
                colName: 'Tên Collection',
                pageSize: 'Số hàng hiển thị',
                sorter: 'Sorter',
                fs: 'Cỡ chữ (px)',
                header: 'Header Menu',
                footer: 'Hiện chân trang',
                groupBy: 'Group By',
                editable: 'Editable',
                draggable: 'Draggable',
                download: 'Tính Năng Download',
                contextMenu: 'Tạo Context Menu',
                zoom: 'Tính Năng Zoom',
                title: 'Tiêu đề',
                hiddenField: 'Tính năng Ẩn Cột',
            };

            let html = `<form id="full-settings-form" class="options-form container-fluid p-2 bkg-light rounded border shadow-sm">
                          <div class="row g-3">`;

            for (const [key, value] of Object.entries(finalOptions)) {
                // Bỏ qua các trường null hoặc function
                if (value === null || typeof value === 'function') continue;

                const label = labels[key] || key;
                let inputHtml = '';

                if (typeof value === 'boolean') {
                    // Sử dụng form-switch cho boolean
                    inputHtml = `
                      <div class="col-6 col-md-4 col-lg-3 p-0">
                          <div class="form-check form-switch h-100 d-flex align-items-center">
                              <input class="form-check-input me-2" type="checkbox" role="switch" 
                                  id="opt_${key}" data-field="${key}" ${value ? 'checked' : ''}>
                              <label class="form-check-label small text-secondary text-truncate" for="opt_${key}">${label}</label>
                          </div>
                      </div>`;
                } else {
                    // Sử dụng input text/number cho các loại khác
                    const inputType = typeof value === 'number' ? 'number' : 'text';
                    inputHtml = `
                      <div class="col-12 col-md-6 col-lg-4 p-0">
                          <div class="form-floating mb-0">
                              <input type="${inputType}" class="form-control form-control-sm shadow-none border-0 border-bottom rounded-0 bg-transparent" 
                                  id="opt_${key}" data-field="${key}" placeholder="${label}" value="${value}">
                              <label for="opt_${key}" class="small text-muted">${label}</label>
                          </div>
                      </div>`;
                }

                html += inputHtml;
            }

            html += `   </div>
                  </form>`;

            A.Modal.render(html, 'Cấu hình', { size: 'modal-sm' });
            A.Modal.show(null, 'Cấu hình', this._updateSettings.bind(this));
        } catch (error) {
            console.error('Error in generateOptionsForm:', error);
            return `<div class="alert alert-danger">Lỗi khi tạo form cấu hình.</div>`;
        }
    }
    /**
     * Thu thập giá trị từ form cấu hình và cập nhật instance
     */
    _updateSettings() {
        try {
            const form = document.getElementById('full-settings-form');
            if (!form) return;

            const settings = {};
            const inputs = form.querySelectorAll('.options-form input');

            inputs.forEach((input) => {
                const field = input.dataset.field;
                if (input.type === 'checkbox') {
                    settings[field] = input.checked;
                } else if (input.type === 'number') {
                    settings[field] = parseFloat(input.value);
                } else {
                    settings[field] = input.value;
                }
            });
            this.state.settings = settings;
            this.updateOptions(settings);
        } catch (error) {
            console.error('Error in _updateSettings:', error);
            return;
        }
    }
}
