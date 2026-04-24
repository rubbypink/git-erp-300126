/**
 * Module: ASelect (9Trip ERP Core)
 * Version: 2.9.3 (Enterprise-Grade - Fixed Ghost DOM & Optimized Batch Rendering)
 * Tech Lead: 9Trip ERP Core Architect
 *
 * @class ASelect
 * @description Thành phần Select thông minh hỗ trợ tìm kiếm, tạo mới và tối ưu hóa hiển thị.
 * Đảm bảo đồng bộ dữ liệu 2 chiều hoàn hảo giữa Smart UI và Element gốc.
 */
export default class ASelect {
    /** @type {Map<string, ASelect>} Lưu trữ instance theo UID để truy xuất nhanh */
    static instances = new Map();
    /** @type {ASelect[]} Hàng đợi nâng cấp UI để xử lý Batch Processing */
    static upgradeQueue = [];
    /** @type {number|null} Timer ID cho batch processing */
    static processTimer = null;
    /** @type {MutationObserver|null} Quan sát DOM để tự động khởi tạo và đồng bộ */
    static domObserver = null;
    /** @type {Map<string, Promise>} Gộp các request DB trùng lặp */
    static fetchPromises = new Map();
    static mapCache = new Map();

    // Stats tracking
    static stats = {
        totalProcessed: 0,
        activeInstances: 0,
        mutationCount: 0,
        lastScanTime: 0,
    };

    /**
     * @constructor
     * @param {HTMLSelectElement} selectEl - Thẻ select gốc cần nâng cấp
     * @param {Object} [opts={}] - Các tùy chọn
     */
    constructor(selectEl, opts = {}) {
        if (!selectEl || selectEl._smartInitLock || selectEl.dataset.smartInit) return;
        selectEl._smartInitLock = true;

        // Ngăn chặn tạo nhiều instance (Double-Init Protection)
        if (ASelect.getInstance(selectEl)) {
            return;
        }

        try {
            // Đánh dấu ngay lập tức để tránh race condition
            selectEl.dataset.smartInit = 'true';

            this.el = selectEl;
            this.el.getInstance = () => this;
            this.opts = opts;
            this.uid = 'as_' + Math.random().toString(36).substr(2, 9);
            this.state = 'BASE'; // Trạng thái: BASE -> UPGRADING -> UPGRADED
            this._isUpgrading = false;
            this.actionQueue = [];
            this.data = [];

            // Initial Value Capture
            this.initialValue = selectEl.dataset.val || selectEl.value || '';
            this.initialText = selectEl.options[selectEl.selectedIndex]?.text || '';

            // Metadata & Config
            this.source = opts.source || selectEl.dataset.source;
            this.isSearchable = opts.searchable ?? selectEl.dataset.searchable === 'true';
            this.isCreatable = opts.creatable ?? selectEl.dataset.creatable === 'true';
            this.isEditable = opts.editable ?? selectEl.dataset.editable === 'true';
            this.field = selectEl.dataset.field || selectEl.name || '';

            // Callbacks
            this.onChange = opts.onChange || selectEl.dataset.onchange;
            this.onCreate = opts.onCreate || selectEl.dataset.oncreate;
            this.onUpdate = opts.onUpdate || selectEl.dataset.onupdate;

            // UI Elements
            this.wrapper = null;
            this.toggleBtn = null;
            this.toggleState = false;
            this.searchInput = null;

            ASelect.stats.activeInstances++;

            this.dropdown = null;

            // Khởi tạo Base Render (Cực nhanh)
            this.initBase();
            ASelect.initGlobalEvents();
        } catch (e) {
            if (typeof Opps === 'function') Opps(e, `ASelect.constructor - ${e.message}`);
            else console.error(`[ASelect] Error:`, e);
        } finally {
            selectEl._smartInitLock = false;
        }
    }

    async initBase() {
        try {
            this.el.setAttribute('data-smart-id', this.uid);
            ASelect.instances.set(this.uid, this);

            // Fast-path Sync
            const fastData = await this.checkSyncData();
            if (fastData) {
                if (fastData !== true) this.data = this.mapData(fastData);
                if (typeof this.source === 'string') {
                    ASelect.mapCache.set(this.source.trim(), this.data);
                }
                this.renderNativeOptions();
                if (this.state === 'BASE') this.scheduleUpgrade();
            }

            // Sync 2 chiều
            this.el.addEventListener('change', (e) => {
                if (e._isInternal) {
                    this.triggerCallback('onChange', this.el.value);
                    return;
                }

                if (this.state === 'UPGRADED' && String(this.el.dataset.val) !== String(this.el.value)) {
                    this.setValue(this.el.value, false);
                }
                this.triggerCallback('onChange', this.el.value);
            });

            this.el.addEventListener('input', (e) => {
                this.triggerCallback('onInput', this.el.value);
            });
        } catch (e) {
            if (typeof L !== 'undefined' && L._) L._(`ASelect.initBase Error`, e, 'error');
        }
    }

    scheduleUpgrade() {
        if (this.state !== 'BASE') return;
        this.state = 'UPGRADING';
        ASelect.upgradeQueue.push(this);
        ASelect.scheduleQueue();
    }

    async checkSyncData() {
        if (!this.source) return null;
        let data = null;
        let cacheKey = null; // [TỐI ƯU]: Lưu trữ key ở scope rộng để dùng cho việc set Cache ở cuối hàm

        if (typeof this.source === 'string') {
            const s = this.source.trim();
            cacheKey = s;

            // [TỐI ƯU]: Xử lý JSON String ngay từ đầu
            if (s.startsWith('[') || s.startsWith('{')) {
                try {
                    return JSON.parse(s); // Không cần mapCache cho chuỗi JSON tĩnh vì parse rất nhẹ
                } catch (e) {
                    console.warn(`[ASelect] JSON parse failed for source:`, s);
                }
            }

            if (ASelect.mapCache.has(s)) {
                this.data = ASelect.mapCache.get(s);
                return true;
            }
            if (ASelect.fetchPromises.has(s)) {
                await ASelect.fetchPromises.get(s);
                return true;
            }

            // [TỐI ƯU]: Dùng hàm nội bộ xử lý lặp Object (Dễ đọc và an toàn hơn)
            const getDeepProp = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);

            if (s.startsWith('APP_DATA.lists.') || s.startsWith('window.APP_DATA.lists.')) {
                let path = s.replace('window.', '').replace('APP_DATA.lists.', '');
                data = getDeepProp(window.APP_DATA?.lists, path);
            } else if (s.startsWith('lists.')) {
                let lists = await A.DB.local.getCollection('app_config', 'lists');
                let path = s.replace('lists.', '');
                data = getDeepProp(lists, path) || getDeepProp(window.APP_DATA?.lists, path);
            } else if (typeof window.APP_DATA !== 'undefined' && window.APP_DATA[s]) {
                if (Object.keys(window.APP_DATA[s]).length > 1) data = window.APP_DATA[s];
                else if (typeof A !== 'undefined' && A.DB?.schema?.isCollection(s)) data = await A.DB.local.getAllAsObject(s);
                else data = window.APP_DATA[s];
            }
        }

        if (!data) data = await this.fetchPromise(this.source);
        if (data) {
            setTimeout(() => ASelect.fetchPromises.delete(cacheKey), 1000);
            return data;
        } else if (data && !cacheKey) {
            // Trường hợp source là mảng/object trực tiếp thì không cache
            return data;
        }
        return null;
    }
    async fetchPromise(src) {
        let raw = null;
        if (src instanceof Promise) {
            raw = await src;
        } else if (typeof src === 'function') {
            raw = await src(this.el, this);
        } else if (Array.isArray(src) || typeof src === 'object') {
            raw = src;
        } else {
            const s = src;
            const resolved = this._resolveWindowPath(s);
            if (resolved && resolved.value !== undefined) {
                const { value, context } = resolved;
                if (typeof value === 'function') {
                    raw = await value.call(context, this.el, this);
                } else {
                    raw = value;
                }
            } else if (typeof window.SYS?.runFn === 'function') {
                raw = await window.SYS.runFn(s, [null, this.el, this]);
            } else raw = s;
        }
        return raw;
    }

    _resolveWindowPath(path) {
        if (!path) return null;
        if (window[path] !== undefined) {
            return { value: window[path], context: window };
        }

        const parts = path.split('.');
        let current = window;
        let context = window;

        for (let i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return null;
            if (i === parts.length - 1) context = current;
            current = current[parts[i]];
        }
        return current !== undefined ? { value: current, context: context } : null;
    }

    mapData(raw) {
        try {
            if (!raw) return [];
            let normalized = [];

            if (typeof raw === 'object' && !Array.isArray(raw)) {
                normalized = Object.entries(raw).map(([key, value]) => {
                    if (value && typeof value === 'object') {
                        const id = value.id ?? value.uid ?? value.value ?? key;
                        const text = value.name ?? value.displayName ?? value.full_name ?? value.user_name ?? value.text ?? String(id);
                        return { id: String(id), text: String(text), _original: value };
                    }
                    return { id: String(key), text: String(value), _original: value };
                });
            } else if (Array.isArray(raw)) {
                normalized = raw
                    .map((item) => {
                        if (item === null || item === undefined) return null;
                        if (Array.isArray(item)) {
                            return { id: String(item[0] ?? ''), text: String(item[1] ?? item[0] ?? ''), _original: item };
                        }
                        if (typeof item === 'object') {
                            const id = item.id ?? item.uid ?? item.value ?? '';
                            const text = item.name ?? item.displayName ?? item.full_name ?? item.user_name ?? item.text ?? String(id);
                            return { id: String(id), text: String(text), _original: item };
                        }
                        return { id: String(item), text: String(item), _original: item };
                    })
                    .filter(Boolean);
            }

            const uniqueMap = new Map();
            normalized.forEach((item) => {
                if (item.id !== undefined && item.id !== null) uniqueMap.set(item.id, item);
            });

            return Array.from(uniqueMap.values());
        } catch (e) {
            if (typeof L !== 'undefined' && L._) L._(`ASelect.mapData Error`, e, 'error');
            return [];
        }
    }

    renderNativeOptions() {
        let currentVal = this.el.dataset.val || this.el.value || this.initialValue;

        if (currentVal && !this.data.find((d) => String(d.id) === String(currentVal))) {
            const foundByText = this.data.find((d) => d.text === currentVal);
            if (foundByText) {
                currentVal = foundByText.id;
                this.el.value = currentVal;
                this.el.dataset.val = currentVal;
            } else {
                const currentText = this.el.options[this.el.selectedIndex]?.text || currentVal;
                if (currentVal && currentText) {
                    const exists = this.data.find((d) => String(d.id) === String(currentVal));
                    if (!exists) {
                        this.data.push({ id: String(currentVal), text: String(currentText) });
                    }
                }
            }
        }

        let html = '<option value="">-- Chọn --</option>';
        Object.values(this.data).forEach((item) => {
            const selected = String(item.id) === String(currentVal) ? 'selected' : '';
            html += `<option value="${item.id}" ${selected}>${typeof escapeHtml === 'function' ? escapeHtml(item.text) : item.text}</option>`;
        });
        this.el.innerHTML = html;

        if (this.el.value !== String(currentVal)) {
            this.el.value = currentVal;
        }
    }

    upgrade() {
        try {
            if (this.state === 'UPGRADED' || !this.el.parentNode) return;

            this._isUpgrading = true;

            const isInTable = !!this.el.closest('td, th');
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'smart-select-wrapper dropdown position-relative w-100';
            this.wrapper.setAttribute('data-smart-id', this.uid);

            this.el.parentNode.insertBefore(this.wrapper, this.el);
            this.el.classList.add('d-none');
            this.wrapper.appendChild(this.el);

            const selectedText = this.el.options[this.el.selectedIndex]?.text || '-- Chọn --';
            const toggleClass = isInTable ? 'border-0 p-0 bg-transparent h-100' : 'form-select form-select-sm bg-warning border-0 rounded-2';
            const inlineStyle = (isInTable ? 'min-height: 31px;' : '') + ' background-image: none; padding-right: 0.75rem;';

            const safeSelectedText = typeof escapeHtml === 'function' ? escapeHtml(selectedText) : selectedText;

            // FIX QUAN TRỌNG: Dùng insertAdjacentHTML thay vì innerHTML += để giữ nguyên vẹn DOM Object gốc (Chống Ghost DOM)
            this.wrapper.insertAdjacentHTML(
                'beforeend',
                `
        <div class="${toggleClass} smart-toggle-btn cursor-pointer d-flex align-items-center" tabindex="0" style="${inlineStyle}">
          <span class="smart-selected-text text-truncate w-100">${safeSelectedText}</span>
        </div>
      `
            );

            this.renderDropdownContent();

            this.toggleBtn = this.wrapper.querySelector('.smart-toggle-btn');
            // this.initInstanceEvents();

            this.state = 'UPGRADED';
            this._isUpgrading = false;
            ASelect.stats.totalProcessed++;

            while (this.actionQueue.length > 0) {
                const action = this.actionQueue.shift();
                action();
            }

            if (this.state === 'UPGRADED') {
                const currentVal = this.el.dataset.val || this.el.value || '';
                if (typeof setVal === 'function') {
                    setVal(this.el, currentVal);
                }
            }
        } catch (e) {
            this._isUpgrading = false;
            if (typeof L !== 'undefined' && L._) L._(`ASelect.upgrade Error`, e, 'error');
        }
    }

    renderDropdownContent() {
        if (!this.data) return;

        // An toàn nội dung
        const formatStr = (str) => (typeof escapeHtml === 'function' ? escapeHtml(str) : str);
        if (this.isCreatable) this.isSearchable = true;

        // [TỐI ƯU 2]: Lưu String HTML siêu nhẹ vào biến thay vì nhồi vào DOM
        this._cachedHTML = `
      ${
          this.isSearchable
              ? `
        <div class="p-2 border-bottom sticky-top bg-light ">
          <input type="text" class="form-control form-control-sm smart-search-input" placeholder="Tìm kiếm..." autocomplete="off">
        </div>`
              : ''
      }
      <ul class="list-unstyled mb-0 smart-list-container">
        ${this.data.map((item) => `<li class="dropdown-item cursor-pointer smart-option" data-value="${formatStr(item.id)}">${formatStr(item.text)}</li>`).join('')}
      </ul>
      ${
          this.isCreatable
              ? `
        <div class="p-2 border-top bg-light d-none smart-create-wrapper">
          <button class="btn btn-sm btn-primary w-100 smart-create-btn">
            <i class="bi bi-plus-circle me-1"></i>Tạo mới: <span class="create-keyword fw-bold"></span>
          </button>
        </div>`
              : ''
      }
    `;
    }

    // initInstanceEvents() {
    //     try {
    //         // Đảm bảo nút toggle nhận focus
    //         if (this.toggleBtn && !this.toggleBtn.hasAttribute('tabindex')) {
    //             this.toggleBtn.setAttribute('tabindex', '0');
    //         }

    //         // 1. XỬ LÝ CLICK MỞ/ĐÓNG (Tự động cleanup nhờ EventManager)
    //         A.Event.on(this.wrapper, 'click', (e) => {
    //             const toggle = e.target.closest('.smart-toggle-btn');
    //             if (toggle) {
    //                 if (!this.toggleState) this.openDropdown();
    //                 else this.closeDropdown();
    //             }
    //         });

    //         // 2. XỬ LÝ BÀN PHÍM (2 PHA RÕ RÀNG)
    //         A.Event.on(this.wrapper, 'keydown', (e) => {
    //             // PHA 1: DROPDOWN ĐANG ĐÓNG
    //             if (!this.toggleState) {
    //                 if (e.key === 'Enter' || e.key === ' ') {
    //                     e.preventDefault();
    //                     this.openDropdown();
    //                 } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    //                     e.preventDefault();
    //                     this._handleNativeArrowSelect(e.key); // Chuyển option trực tiếp
    //                 }
    //                 return;
    //             }

    //             // PHA 2: DROPDOWN ĐANG MỞ
    //             this.handleKeyboard(e);
    //         });
    //     } catch (e) {
    //         if (typeof L !== 'undefined' && L._) L._(`ASelect.initInstanceEvents Error`, e, 'error');
    //     }
    // }

    /**
     * Helper: Thay đổi giá trị trực tiếp khi dùng phím Lên/Xuống lúc Dropdown ĐÓNG
     */
    _handleNativeArrowSelect(key) {
        if (!this.data || this.data.length === 0) return;

        let currentIndex = this.data.findIndex((item) => String(item.id) === String(this.el.value));

        if (key === 'ArrowDown') {
            currentIndex = currentIndex < this.data.length - 1 ? currentIndex + 1 : currentIndex;
        } else if (key === 'ArrowUp') {
            currentIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }

        const nextItem = this.data[currentIndex];
        if (nextItem) {
            this.setValue(nextItem.id);
        }
    }
    handleKeyboard(e) {
        try {
            // 1. Chỉ xử lý các phím điều hướng và Enter/Esc. Bỏ qua các phím gõ chữ (search)
            const validKeys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
            if (!validKeys.includes(e.key)) return;

            // 2. NGĂN CHẶN trình duyệt cuộn trang khi bấm phím lên/xuống/enter
            if (e.key !== 'Escape') {
                e.preventDefault();
            }

            // 3. Gom tất cả các thẻ CÓ THỂ CHỌN ĐƯỢC (Đang hiển thị) vào 1 mảng
            // Gộp cả '.smart-option' và nút '.smart-create-btn' (nếu đang hiển thị)
            const visibleItems = Array.from(this.dropdown.querySelectorAll('.smart-option:not(.d-none), .smart-create-btn:not(.d-none)'));

            if (visibleItems.length === 0) return;

            // 4. Tìm vị trí item đang được bôi đen (highlight)
            let currentIndex = visibleItems.findIndex((item) => item.classList.contains('highlight') || item.classList.contains('active'));

            // 5. Xử lý Logic từng phím
            if (e.key === 'ArrowDown') {
                // Đi xuống: Nếu đang ở cuối thì vòng lại đầu (0)
                currentIndex = currentIndex < visibleItems.length - 1 ? currentIndex + 1 : 0;
                this._updateHighlight(visibleItems, currentIndex);
            } else if (e.key === 'ArrowUp') {
                // Đi lên: Nếu chưa chọn hoặc đang ở đầu (0) thì vòng xuống cuối
                currentIndex = currentIndex > 0 ? currentIndex - 1 : visibleItems.length - 1;
                this._updateHighlight(visibleItems, currentIndex);
            } else if (e.key === 'Enter') {
                // Chọn item
                if (currentIndex > -1) {
                    const selectedItem = visibleItems[currentIndex];

                    if (selectedItem.classList.contains('smart-option')) {
                        this.setValue(selectedItem.dataset.value);
                    } else if (selectedItem.classList.contains('smart-create-btn')) {
                        const kw = this.searchInput?.value || '';
                        if (typeof this.triggerCallback === 'function') this.triggerCallback('onCreate', kw);
                    }
                    this.closeDropdown();
                    if (this.toggleBtn) this.toggleBtn.focus();
                }
            } else if (e.key === 'Escape') {
                this.closeDropdown();
                if (this.toggleBtn) this.toggleBtn.focus(); // Trả lại focus cho nút bật tắt để không bị mất dấu tab
            }
        } catch (err) {
            if (typeof L !== 'undefined' && L._) L._(`ASelect.handleKeyboard Error`, err, 'error');
        }
    }

    /**
     * Hàm helper xử lý giao diện bôi đen và cuộn chuột
     * @param {Array} items - Mảng các thẻ DOM đang hiển thị
     * @param {Number} targetIndex - Vị trí thẻ cần bôi đen
     */
    _updateHighlight(items, targetIndex) {
        // Xóa tất cả highlight cũ cho sạch sẽ
        items.forEach((item) => item.classList.remove('highlight'));

        // Cập nhật thẻ mới
        const targetElement = items[targetIndex];
        if (targetElement) {
            targetElement.classList.add('highlight');

            // TUYỆT CHIÊU: Tự động cuộn thanh scroll của Dropdown đi theo phần tử đang chọn
            // block: 'nearest' giúp nó chỉ cuộn nếu item bị khuất, nếu đang nhìn thấy thì không cuộn
            targetElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    openDropdown() {
        try {
            if (!this.toggleBtn) return; // An toàn nếu DOM chưa sẵn sàng
            this.toggleState = true;

            // Đánh dấu UI wrapper đang mở (hỗ trợ CSS mũi tên quay lên/xuống)
            if (this.wrapper) this.wrapper.classList.add('is-open');

            // ==========================================
            // 1. TÌM HOẶC TẠO GLOBAL DROPDOWN (LIVE DOM)
            // ==========================================
            let globalDropdown = document.getElementById('smart-global-dropdown');
            if (!globalDropdown) {
                globalDropdown = document.createElement('div');
                globalDropdown.id = 'smart-global-dropdown';
                // CHÚ Ý TÊN CLASS: Có 'smart-dropdown-menu' để Global Event nhận diện
                globalDropdown.className = 'dropdown-menu shadow p-0 smart-dropdown-menu';
                globalDropdown.style.cssText = 'max-height: 50vh; overflow: hidden; overflow-y: auto; z-index: 9999; position: fixed; display: none; min-width:120px; width: fit-content; max-width: 250px;';
                document.body.appendChild(globalDropdown);
            }

            // Trỏ instance hiện tại vào Global Dropdown
            this.dropdown = globalDropdown;
            const activeId = this.dropdown.dataset.activeSmartId;
            if (activeId && activeId !== this.uid) {
                const prevInstance = ASelect.instances.get(activeId);
                // Nếu có thằng khác đang mở, ép nó đóng ngay lập tức và dọn rác của nó
                if (prevInstance && prevInstance.toggleState) {
                    prevInstance.closeDropdown();
                }
            }
            // ==========================================
            // 2. NẠP DỮ LIỆU & ĐÓNG DẤU ID
            // ==========================================
            this.dropdown.setAttribute('data-smart-id', this.uid);
            this.dropdown.dataset.activeSmartId = this.uid;
            // Nạp nội dung HTML siêu nhẹ đã cache
            if (!this._cachedHTML) this.renderDropdownContent();
            this.dropdown.innerHTML = this._cachedHTML || '';

            // Query ô Search sau khi nạp HTML
            this.searchInput = this.dropdown.querySelector('.smart-search-input');

            // ==========================================
            // 3. TÍNH TOÁN TỌA ĐỘ VÀ KÍCH THƯỚC
            // ==========================================
            const rect = this.toggleBtn.getBoundingClientRect();
            const dropdownWidth = Math.max(rect.width, 200);

            this.dropdown.style.width = `${dropdownWidth}px`;
            this.dropdown.style.display = 'block';
            this.dropdown.style.visibility = 'hidden'; // Ẩn tạm để lấy offsetHeight

            const dropdownHeight = this.dropdown.offsetHeight;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let top = rect.bottom + window.scrollY;
            let left = rect.left + window.scrollX;
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;

            // Tính tràn viền dọc
            if (dropdownHeight > spaceBelow && spaceAbove > spaceBelow) {
                top = rect.top + window.scrollY - dropdownHeight;
                if (top < window.scrollY) top = window.scrollY;
            } else {
                if (top + dropdownHeight > viewportHeight + window.scrollY) {
                    top = Math.max(window.scrollY, viewportHeight + window.scrollY - dropdownHeight);
                }
            }

            // Tính tràn viền ngang
            if (rect.left + dropdownWidth > viewportWidth) {
                left = rect.right + window.scrollX - dropdownWidth;
            }
            if (left < window.scrollX) left = window.scrollX;

            // Áp dụng tọa độ và hiển thị thật
            this.dropdown.style.top = `${top}px`;
            this.dropdown.style.left = `${left}px`;
            this.dropdown.style.visibility = 'visible';

            // ==========================================
            // 4. UX & TÌM KIẾM
            // ==========================================
            if (this.searchInput) {
                this.searchInput.value = '';
                // Xóa mờ các lựa chọn cũ
                this.dropdown.querySelectorAll('.smart-option').forEach((opt) => {
                    opt.classList.remove('d-none');
                    opt.classList.remove('highlight');
                });

                // Mặc định bôi đen item đầu tiên
                if (typeof this._resetHighlightToTop === 'function') this._resetHighlightToTop();

                setTimeout(() => this.searchInput.focus(), 10);
            }

            // ==========================================
            // 5. XỬ LÝ EVENT NATIVE (Click ngoài & Scroll)
            // ==========================================
            // Dọn dẹp Listener cũ cho an toàn
            if (this._outsideClickRef) document.removeEventListener('click', this._outsideClickRef);
            if (this._scrollRef) window.removeEventListener('scroll', this._scrollRef, true);

            // Bắt click ra ngoài
            this._outsideClickRef = (e) => {
                if (this.wrapper && !this.wrapper.contains(e.target) && this.dropdown && !this.dropdown.contains(e.target)) {
                    this.closeDropdown();
                }
            };

            // Dùng setTimeout 0ms để tránh việc click mở sủi bọt kích hoạt đóng ngay lập tức
            setTimeout(() => {
                document.addEventListener('click', this._outsideClickRef);
            }, 0);

            // Bắt cuộn trang
            this._scrollRef = (e) => {
                if (this.dropdown && !this.dropdown.contains(e.target)) {
                    this.closeDropdown();
                }
            };
            window.addEventListener('scroll', this._scrollRef, { capture: true, passive: true });

            if (typeof this.syncUI === 'function') this.syncUI();
        } catch (e) {
            if (typeof L !== 'undefined' && L._) L._(`ASelect.openDropdown Error`, e, 'error');
            console.error('[ASelect] openDropdown Error:', e);
        }
    }

    closeDropdown() {
        if (!this.toggleState) return;
        this.toggleState = false;

        // Ẩn Global Dropdown
        if (this.dropdown) {
            this.dropdown.style.display = 'none';
        }
        if (this.dropdown && this.dropdown.dataset.activeSmartId === this.uid) {
            this.dropdown.style.display = 'none';
        }
        // Trả lại UI trạng thái đóng
        if (this.wrapper) this.wrapper.classList.remove('is-open');

        // [DỌN RÁC NATIVE LẬP TỨC]
        if (this._outsideClickRef) {
            document.removeEventListener('click', this._outsideClickRef);
            this._outsideClickRef = null;
        }
        if (this._scrollRef) {
            window.removeEventListener('scroll', this._scrollRef, true);
            this._scrollRef = null;
        }
    }

    setValue(rawVal, forceTrigger = true) {
        try {
            if (!document.body.contains(this.el)) {
                // console.warn(`[ASelect Debug - LỖI GHOST DOM KHẮC PHỤC THÀNH CÔNG]`);
                this.destroy();
                return;
            }

            let val = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

            if (String(this.el.value) === val && String(this.el.dataset.val) === val) {
                return; // Chống loop
            }

            this.el.dataset.val = val;

            if (this.state !== 'UPGRADED') {
                this.actionQueue.push(() => this.setValue(val, forceTrigger));
                return;
            }

            let options = Array.from(this.el.options);
            let targetIdx = options.findIndex((opt) => String(opt.value) === val);

            if (targetIdx === -1 && val !== '') {
                targetIdx = options.findIndex((opt) => opt.text === val);
                if (targetIdx !== -1) {
                    val = options[targetIdx].value;
                    this.el.dataset.val = val;
                } else {
                    const found = this.data.find((d) => String(d.id) === val);
                    const newOpt = new Option(found ? found.text : val, val);
                    this.el.add(newOpt);
                    options = Array.from(this.el.options);
                    targetIdx = options.length - 1;
                }
            }

            // CHỐT DOM
            this.el.value = val;
            options.forEach((opt, idx) => {
                if (idx === targetIdx) {
                    opt.setAttribute('selected', 'selected');
                    opt.selected = true;
                } else {
                    opt.removeAttribute('selected');
                    opt.selected = false;
                }
            });
            if (targetIdx !== -1) this.el.selectedIndex = targetIdx;

            this.syncUI();

            // [FIX CRITICAL BUG]: CHỈ TRIGGER KHI ĐƯỢC PHÉP
            if (forceTrigger) {
                // Dispatch native event (Hàm lắng nghe trong initBase sẽ tự bắt cái này
                // và gọi this.triggerCallback cho đại ca)
                const changeEvt = new Event('change', { bubbles: true });
                changeEvt._isInternal = true;
                this.el.dispatchEvent(changeEvt);

                const inputEvt = new Event('input', { bubbles: true });
                inputEvt._isInternal = true;
                this.el.dispatchEvent(inputEvt);
            }
            // TUYỆT ĐỐI KHÔNG CÓ `else { this.triggerCallback(...) }` Ở ĐÂY NỮA!!!
        } catch (e) {
            console.error(`[ASelect Debug - ERROR] Lỗi trong setValue:`, e);
        }
    }

    syncUI() {
        if (!this.wrapper) return;
        const currentVal = String(this.el.dataset.val || this.el.value || '');
        const text = this.el.options[this.el.selectedIndex]?.text || '-- Chọn --';

        const textEl = this.wrapper.querySelector('.smart-selected-text');
        if (textEl && textEl.textContent !== text) {
            textEl.innerHTML = typeof escapeHtml === 'function' ? escapeHtml(text) : text;
        }

        this.dropdown.querySelectorAll('.smart-option').forEach((opt) => {
            opt.classList.toggle('active', String(opt.dataset.value) === currentVal);
        });
    }

    async triggerCallback(type, value) {
        if (!this[type]) return;
        const cb = typeof unescapeHtml === 'function' ? unescapeHtml(this[type]) : this[type];
        try {
            const finalValue = value !== undefined ? value : this.el.dataset.val || this.el.value;
            if (typeof window.SYS?.runFn === 'function') {
                await window.SYS.runFn(cb, [this.el, this]);
            }
        } catch (e) {
            if (typeof L !== 'undefined' && L._) L._(`[ASelect] Lỗi gọi hàm ${type}:`, e, 'error');
        }
    }

    destroy() {
        try {
            if (this.state === 'DESTROYED' || this._isUpgrading) return;

            if (this.dropdown) {
                this.dropdown.remove(); // Tối ưu: Vanilla JS trực tiếp remove node
            }

            if (this.wrapper && this.wrapper.parentNode) {
                this.el.classList.remove('d-none');
                this.wrapper.parentNode.insertBefore(this.el, this.wrapper);
                this.wrapper.remove(); // Tối ưu dọn dẹp bộ nhớ
            }

            if (this._outsideClickRef) {
                document.removeEventListener('click', this._outsideClickRef);
            }
            if (this._scrollRef) {
                window.removeEventListener('scroll', this._scrollRef, true);
            }

            ASelect.instances.delete(this.uid);
            ASelect.stats.activeInstances--;

            this.state = 'DESTROYED';
        } catch (e) {
            console.error(`[ASelect] Destroy Error:`, e);
        }
    }

    static scheduleQueue() {
        if (ASelect.processTimer) return;
        ASelect.processTimer = requestAnimationFrame(() => ASelect.processQueue());
    }

    static processQueue() {
        if (ASelect.upgradeQueue.length === 0) {
            ASelect.processTimer = null;
            return;
        }

        const startTime = performance.now();
        const frameBudget = 32;

        while (ASelect.upgradeQueue.length > 0 && performance.now() - startTime < frameBudget) {
            const inst = ASelect.upgradeQueue.shift();
            if (inst && inst.state !== 'UPGRADED') {
                inst.upgrade();
            }
        }

        if (ASelect.upgradeQueue.length > 0) {
            ASelect.processTimer = requestAnimationFrame(() => ASelect.processQueue());
        } else {
            ASelect.processTimer = null;
        }
    }

    static getInstance(el) {
        if (!el) return null;
        const uid = el.dataset?.smartId || el.closest('.smart-select-wrapper')?.dataset.smartId || el.closest('.smart-dropdown-menu')?.dataset.smartId;
        return ASelect.instances.get(uid) || null;
    }

    static initDOMWatcher() {
        if (ASelect.domObserver) return;

        const scan = (root = document.body) => {
            ASelect.stats.lastScanTime = Date.now();
            root.querySelectorAll('select.smart-select:not([data-smart-init])').forEach((el) => new ASelect(el));
        };

        ASelect.domObserver = new MutationObserver((mutations) => {
            ASelect.stats.mutationCount++;

            for (const mutation of mutations) {
                const target = mutation.target;
                const inst = ASelect.getInstance(target);

                if (mutation.type === 'attributes' && (mutation.attributeName === 'data-val' || mutation.attributeName === 'value')) {
                    if (inst && typeof inst.setValue === 'function') {
                        const newVal = String(target.getAttribute(mutation.attributeName) || '').trim();
                        const currentVal = String(inst.el.value || '');
                        const currentDataVal = String(inst.el.dataset.val || '');

                        if (newVal !== currentVal || newVal !== currentDataVal) {
                            inst.setValue(newVal, false);
                        }
                    }
                    continue;
                }

                if (mutation.type === 'childList' && target.tagName === 'SELECT' && target.classList.contains('smart-select')) {
                    if (inst && !inst._isUpgrading) {
                        inst.data = inst.mapData(Array.from(target.options).map((opt) => ({ id: opt.value, text: opt.text })));
                        inst.renderDropdownContent();
                        inst.syncUI();
                    }
                    continue;
                }

                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            if (node.matches?.('select.smart-select:not([data-smart-init])')) {
                                new ASelect(node);
                            } else if (node.querySelector) {
                                const selects = node.querySelectorAll('select.smart-select:not([data-smart-init])');
                                if (selects.length) selects.forEach((s) => new ASelect(s));
                            }
                        }
                    });
                }

                if (mutation.removedNodes.length) {
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            let wrappers = [];
                            if (node.matches?.('.smart-select-wrapper')) {
                                wrappers.push(node);
                            }
                            if (node.querySelectorAll) {
                                wrappers = [...wrappers, ...Array.from(node.querySelectorAll('.smart-select-wrapper'))];
                            }

                            wrappers.forEach((w) => {
                                const uid = w.dataset.smartId;
                                const inst = ASelect.instances.get(uid);
                                if (inst) {
                                    inst.destroy();
                                }
                            });
                        }
                    });
                }
            }
        });

        ASelect.domObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-val', 'value'],
        });

        scan();
    }
    /**
     * Khởi tạo Event Toàn Cục (Gọi 1 lần duy nhất ở cuối file ASelect.js)
     * Dùng Lazy Delegation = true siêu tối ưu
     */
    static initGlobalEvents() {
        if (ASelect._globalEventsBound) return;
        ASelect._globalEventsBound = true;

        // 1. CLICK TOGGLE (Mở/Đóng)
        A.Event.on(
            '.smart-toggle-btn',
            'click',
            (e) => {
                const instance = ASelect.getInstance(e.target);
                if (instance) {
                    if (!instance.toggleState) instance.openDropdown();
                    else instance.closeDropdown();
                }
            },
            true
        ); // Lazy = true

        // 2. CLICK CHỌN ITEM HOẶC CREATE (Trong Dropdown chung)
        A.Event.on(
            '.smart-dropdown-menu',
            'click',
            (e) => {
                const instance = ASelect.getInstance(e.target);
                if (!instance) return;

                const option = e.target.closest('.smart-option');
                const createBtn = e.target.closest('.smart-create-btn');

                if (option) {
                    instance.setValue(option.dataset.value);
                    instance.closeDropdown();
                    if (instance.toggleBtn) instance.toggleBtn.focus();
                } else if (createBtn) {
                    const searchInput = instance.dropdown.querySelector('.smart-search-input');
                    const kw = searchInput ? searchInput.value : '';
                    if (typeof instance.triggerCallback === 'function') instance.triggerCallback('onCreate', kw);
                    instance.closeDropdown();
                    if (instance.toggleBtn) instance.toggleBtn.focus();
                }
            },
            true
        ); // Lazy = true

        // 3. GÕ TÌM KIẾM
        A.Event.on(
            '.smart-search-input',
            'input',
            (e) => {
                const instance = ASelect.getInstance(e.target);
                if (!instance) return;

                const kw = e.target.value.toLowerCase().trim();
                const items = instance.dropdown.querySelectorAll('.smart-option');
                let found = 0;

                items.forEach((item) => {
                    const match = item.textContent.toLowerCase().includes(kw);
                    item.classList.toggle('d-none', !match);
                    if (match) found++;
                });

                if (instance.isCreatable) {
                    const createWrap = instance.dropdown.querySelector('.smart-create-wrapper');
                    if (createWrap) {
                        if (kw && found === 0) {
                            createWrap.classList.remove('d-none');
                            const kwEl = createWrap.querySelector('.create-keyword');
                            if (kwEl) kwEl.textContent = kw;
                        } else {
                            createWrap.classList.add('d-none');
                        }
                    }
                }

                if (typeof instance._resetHighlightToTop === 'function') instance._resetHighlightToTop();
            },
            true
        ); // Lazy = true

        // 4. BÀN PHÍM BAO TRỌN GÓI (Cả Wrapper lúc đóng & Dropdown lúc mở)
        // Gom 2 selector bằng dấu phẩy, A.Event.on vẫn hiểu ngon ơ!
        A.Event.on(
            '.smart-select-wrapper, .smart-dropdown-menu',
            'keydown',
            (e) => {
                const instance = ASelect.getInstance(e.target);
                if (!instance) return;

                // PHA 1: NẾU ĐANG ĐÓNG -> Xử lý Native
                if (!instance.toggleState) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        instance.openDropdown();
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (typeof instance._handleNativeArrowSelect === 'function') {
                            instance._handleNativeArrowSelect(e.key);
                        }
                    }
                    return;
                }

                // PHA 2: NẾU ĐANG MỞ -> Chuyển cho handleKeyboard xử lý chọn Item
                if (typeof instance.handleKeyboard === 'function') instance.handleKeyboard(e);
            },
            true
        ); // Lazy = true
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        ASelect.initDOMWatcher();
        // ASelect.initGlobalEvents();
    }); // DOMContentLoaded là từ HTML
} else {
    ASelect.initDOMWatcher();
}
window.ASelect = ASelect;
