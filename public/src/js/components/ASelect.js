/**
 * Module: ASelect (9Trip ERP Core)
 * Version: 2.9.1 (Enterprise-Grade - Optimized Batch Rendering & Double-Init Protection)
 * Tech Lead: 9Trip ERP Core Architect
 *
 * @class ASelect
 * @description Thành phần Select thông minh hỗ trợ tìm kiếm, tạo mới và tối ưu hóa hiển thị cho Table/Standalone.
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
    // 1. Ngăn chặn tạo nhiều instance (Double-Init Protection)
    if (ASelect.getInstance(selectEl)) {
      return;
    }

    try {
      // Đánh dấu ngay lập tức để tránh race condition
      selectEl.dataset.smartInit = 'true';

      this.el = selectEl;
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
      this.dropdown = null;
      this.searchInput = null;

      ASelect.stats.activeInstances++;

      // BƯỚC 1: Khởi tạo Base Render (Cực nhanh)
      this.initBase();
    } catch (e) {
      if (typeof Opps === 'function') Opps(e, `ASelect.constructor - ${e.message}`);
      else console.error(`[ASelect] Error:`, e);
    } finally {
      selectEl._smartInitLock = false;
    }
  }

  /**
   * BƯỚC 1: Khởi tạo Base Mode (Chỉ render native options và gán thuộc tính)
   * @private
   */
  async initBase() {
    try {
      this.el.id = this.uid;
      ASelect.instances.set(this.uid, this);

      // Fast-path Sync: Nếu dữ liệu có sẵn trong RAM
      const fastData = this.checkSyncData();
      if (fastData) {
        this.data = this.mapData(fastData);
        this.renderNativeOptions();
        this.scheduleUpgrade();
      } else {
        // Nạp dữ liệu async nhưng không block UI
        this.loadData().then(() => {
          this.renderNativeOptions();
          if (this.state === 'BASE') this.scheduleUpgrade();
        });
      }

      // Đảm bảo onchange/oninput trên thẻ gốc hoạt động bình thường
      this.el.addEventListener('change', (e) => {
        // if (this.state === 'UPGRADED') this.syncUI();
        // L._(`ASelect.change event: call SyncUI`);
        this.triggerCallback('onChange', this.el.value);
      });

      this.el.addEventListener('input', (e) => {
        this.triggerCallback('onInput', this.el.value);
      });
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`ASelect.initBase Error`, e, 'error');
    }
  }

  /**
   * Kiểm tra dữ liệu đồng bộ trong RAM
   * @private
   */
  checkSyncData() {
    if (typeof this.source !== 'string') return null;
    const s = this.source.trim();
    if (window.APP_DATA && window.APP_DATA[s]) return window.APP_DATA[s];
    return null;
  }

  /**
   * Đưa instance vào hàng đợi nâng cấp UI (Bước 2)
   */
  scheduleUpgrade() {
    if (this.state !== 'BASE') return;
    this.state = 'UPGRADING';
    ASelect.upgradeQueue.push(this);
    ASelect.scheduleQueue();
  }

  /**
   * Nạp dữ liệu với Deduplication (fetchPromises)
   */
  async loadData() {
    try {
      const src = this.source;
      if (!src) return;

      const cacheKey = typeof src === 'string' ? src : null;

      // TRƯỚC KHI FETCH: Check xem RAM đã có data chuẩn (đã map) chưa
      if (cacheKey && ASelect.mapCache.has(cacheKey)) {
        this.data = ASelect.mapCache.get(cacheKey);
        return;
      }

      if (cacheKey && ASelect.fetchPromises.has(cacheKey)) {
        const raw = await ASelect.fetchPromises.get(cacheKey);
        this.data = this.mapData(raw);
        return;
      }

      const fetchPromise = (async () => {
        let raw = [];
        if (typeof src === 'function') {
          raw = await src();
        } else if (typeof src === 'string') {
          const s = src.trim();
          if (s.includes('.')) {
            let parts = s.split('.');
            let current = window;
            for (let part of parts) {
              if (current && current[part] !== undefined) {
                current = current[part];
              } else {
                current = null;
                break;
              }
            }
            if (current) {
              raw = current;
            } else if (typeof SYS.runFn === 'function') {
              raw = await SYS.runFn(s, [this.el, this]);
            }
          } else if (window.A?.DB && window.A.DB.schema.isCollection(s)) {
            raw = await window.A.DB.local.getCollection(s);
          } else {
            raw = typeof normalizeList === 'function' ? normalizeList(s) : [];
          }
        }
        // 2. [BẢN VÁ]: Không có dấu chấm nhưng CÓ TỒN TẠI ở Global Window (Hàm hoặc Biến tĩnh)
        else if (window[s] !== undefined) {
          if (typeof window[s] === 'function') {
            // Nếu là hàm: Thực thi hàm và lấy kết quả
            raw = await window[s](this.el, this);
          } else {
            // Nếu là biến tĩnh (VD: mảng LIST_COUNTRIES): Lấy luôn giá trị
            raw = window[s];
          }
        } else if (src && typeof src === 'object') {
          raw = src;
        }
        return raw;
      })();

      if (cacheKey) ASelect.fetchPromises.set(cacheKey, fetchPromise);

      const result = await fetchPromise;
      this.data = this.mapData(result);

      // SAU KHI MAP XONG: Lưu thẳng vào RAM để 99 instance khác ăn ké
      if (cacheKey) {
        ASelect.mapCache.set(cacheKey, this.data);
        setTimeout(() => ASelect.fetchPromises.delete(cacheKey), 1000);
      }
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`ASelect.loadData Error`, e, 'error');
    }
  }

  mapData(raw) {
    try {
      if (!raw) return [];
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        return Object.entries(raw).map(([key, value]) => {
          if (value && typeof value === 'object') {
            const id = value.id || value.uid || value.value || key;
            const text = value.name || value.displayName || value.full_name || value.text || value.title || String(id);
            return { id: String(id), text: String(text) };
          }
          return { id: String(key), text: String(value) };
        });
      }
      if (Array.isArray(raw)) {
        return raw.map((item) => {
          if (item === null || item === undefined) return { id: '', text: '' };
          if (typeof item !== 'object') return { id: String(item), text: String(item) };
          if (Array.isArray(item)) return { id: String(item[0] ?? ''), text: String(item[1] ?? item[0]) };
          const id = item.id || item.uid || item.value || '';
          const text = item.name || item.displayName || item.full_name || item.text || item.title || String(id);
          return { id: String(id), text: String(text) };
        });
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Render options và Auto-correction
   */
  renderNativeOptions() {
    let currentVal = this.el.dataset.val || this.el.value || this.initialValue;

    // Auto-correction: Nếu giá trị là Text, tìm ID tương ứng
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
    this.data.forEach((item) => {
      const selected = String(item.id) === String(currentVal) ? 'selected' : '';
      html += `<option value="${item.id}" ${selected}>${item.text}</option>`;
    });
    this.el.innerHTML = html;

    // Đảm bảo giá trị thực tế của element khớp với currentVal sau khi render options
    if (this.el.value !== String(currentVal)) {
      this.el.value = currentVal;
    }
  }

  /**
   * BƯỚC 2: Nâng cấp UI (Upgrade Mode) - Chỉ thực hiện qua Batch Processing
   */
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
      const toggleClass = isInTable ? 'border-0 p-0 bg-transparent h-100' : 'form-select form-select-sm';

      this.wrapper.innerHTML += `
        <div class="${toggleClass} smart-toggle-btn cursor-pointer d-flex align-items-center" tabindex="0" style="${isInTable ? 'min-height: 31px;' : ''}">
          <span class="smart-selected-text text-truncate w-100">${selectedText}</span>
        </div>
      `;

      this.dropdown = document.createElement('div');
      this.dropdown.className = 'dropdown-menu shadow p-0 smart-dropdown-menu';
      this.dropdown.style.cssText = 'max-height: 300px; overflow-y: auto; z-index: 2000; position: fixed; display: none; width: 250px;';
      this.dropdown.setAttribute('data-smart-id', this.uid);

      this.renderDropdownContent();

      this.toggleBtn = this.wrapper.querySelector('.smart-toggle-btn');
      this.initInstanceEvents();

      this.state = 'UPGRADED';
      this._isUpgrading = false;
      ASelect.stats.totalProcessed++;

      while (this.actionQueue.length > 0) {
        const action = this.actionQueue.shift();
        action();
      }
    } catch (e) {
      this._isUpgrading = false;
      if (typeof L !== 'undefined' && L._) L._(`ASelect.upgrade Error`, e, 'error');
    }
  }

  renderDropdownContent() {
    if (!this.dropdown) return;
    this.dropdown.innerHTML = `
      ${
        this.isSearchable
          ? `
        <div class="p-2 border-bottom sticky-top bg-white">
          <input type="text" class="form-control form-control-sm smart-search-input" placeholder="Tìm kiếm..." autocomplete="off">
        </div>`
          : ''
      }
      <ul class="list-unstyled mb-0 smart-list-container">
        ${this.data.map((item) => `<li class="dropdown-item cursor-pointer smart-option" data-value="${item.id}">${item.text}</li>`).join('')}
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
    this.searchInput = this.dropdown.querySelector('.smart-search-input');
  }

  initInstanceEvents() {
    try {
      this.wrapper.addEventListener('click', (e) => {
        const toggle = e.target.closest('.smart-toggle-btn');
        if (toggle) {
          e.stopPropagation();
          this.openDropdown();
        }
      });

      this.dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.target;

        const option = target.closest('.smart-option');
        if (option) {
          this.setValue(option.dataset.value);
          this.closeDropdown();
          return;
        }

        const createBtn = target.closest('.smart-create-btn');
        if (createBtn) {
          const kw = this.searchInput?.value || '';
          this.triggerCallback('onCreate', kw);
          this.closeDropdown();
          return;
        }
      });

      if (this.searchInput) {
        this.searchInput.addEventListener('input', (e) => {
          const kw = e.target.value.toLowerCase().trim();
          const items = this.dropdown.querySelectorAll('.smart-option');
          let found = 0;

          items.forEach((item) => {
            const match = item.textContent.toLowerCase().includes(kw);
            item.classList.toggle('d-none', !match);
            if (match) found++;
          });

          if (this.isCreatable) {
            const createWrap = this.dropdown.querySelector('.smart-create-wrapper');
            if (kw && found === 0) {
              createWrap.classList.remove('d-none');
              const kwEl = createWrap.querySelector('.create-keyword');
              if (kwEl) kwEl.textContent = kw;
            } else {
              createWrap.classList.add('d-none');
            }
          }
        });

        this.searchInput.addEventListener('keydown', (e) => this.handleKeyboard(e));
      }

      this.toggleBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          this.openDropdown();
        }
      });
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`ASelect.initInstanceEvents Error`, e, 'error');
    }
  }

  handleKeyboard(e) {
    try {
      const options = Array.from(this.dropdown.querySelectorAll('.smart-option:not(.d-none)'));
      if (options.length === 0 && !this.isCreatable) return;

      let currentIdx = options.findIndex((opt) => opt.classList.contains('highlight'));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        options.forEach((opt) => opt.classList.remove('highlight'));
        currentIdx = (currentIdx + 1) % options.length;
        const nextOpt = options[currentIdx];
        if (nextOpt) {
          nextOpt.classList.add('highlight');
          nextOpt.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        options.forEach((opt) => opt.classList.remove('highlight'));
        currentIdx = (currentIdx - 1 + options.length) % options.length;
        const prevOpt = options[currentIdx];
        if (prevOpt) {
          prevOpt.classList.add('highlight');
          prevOpt.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const highlighted = options[currentIdx];
        if (highlighted) {
          this.setValue(highlighted.dataset.value);
          this.closeDropdown();
        } else if (this.isCreatable) {
          const createBtn = this.dropdown.querySelector('.smart-create-btn:not(.d-none)');
          if (createBtn) {
            const kw = this.searchInput?.value || '';
            this.triggerCallback('onCreate', kw);
            this.closeDropdown();
          }
        }
      } else if (e.key === 'Escape') {
        this.closeDropdown();
        this.toggleBtn.focus();
      }
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`ASelect.handleKeyboard Error`, e, 'error');
    }
  }

  openDropdown() {
    if (!this.dropdown) return;

    document.querySelectorAll('.smart-dropdown-menu').forEach((m) => {
      if (m !== this.dropdown) m.style.display = 'none';
    });

    if (!this.dropdown.parentNode) document.body.appendChild(this.dropdown);

    const rect = this.toggleBtn.getBoundingClientRect();
    const dropdownWidth = Math.max(rect.width, 200);

    this.dropdown.style.width = `${dropdownWidth}px`;
    this.dropdown.style.display = 'block';

    let top = rect.bottom + window.scrollY;
    let left = rect.left + window.scrollX;

    const dropdownHeight = this.dropdown.offsetHeight;
    if (top + dropdownHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - dropdownHeight;
    }

    this.dropdown.style.top = `${top}px`;
    this.dropdown.style.left = `${left}px`;

    if (this.searchInput) {
      this.searchInput.value = '';
      setTimeout(() => this.searchInput.focus(), 10);
      this.dropdown.querySelectorAll('.smart-option').forEach((opt) => {
        opt.classList.remove('d-none');
        opt.classList.remove('highlight');
      });
    }

    this._outsideClickRef = (e) => {
      if (!this.wrapper.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this._outsideClickRef);
    L._(`ASelect.openDropdown - ${this.el.dataset.field}`, { top, left });
    this.syncUI();
    this.dropdown.style.top = `${top}px`;
    this.dropdown.style.left = `${left}px`;

    // Lắng nghe sự kiện scroll để auto-close dropdown
    this._scrollRef = (e) => {
      // Tránh việc scroll bên trong chính dropdown gây đóng
      if (!this.dropdown.contains(e.target)) {
        this.closeDropdown();
      }
    };
  }

  closeDropdown() {
    if (this.dropdown) this.dropdown.style.display = 'none';

    if (this._outsideClickRef) {
      document.removeEventListener('click', this._outsideClickRef);
      this._outsideClickRef = null;
    }

    // Dọn dẹp sự kiện scroll để giải phóng RAM
    if (this._scrollRef) {
      window.removeEventListener('scroll', this._scrollRef, true);
      this._scrollRef = null;
    }
  }
  syncUI() {
    if (!this.wrapper) return;

    let currentVal = this.el.dataset.val || this.el.value;
    L._(`ASelect.syncUI - ${this.el.dataset.field}`, { currentVal });
    if (currentVal !== undefined) {
      const options = Array.from(this.el.options);
      let targetIdx = options.findIndex((opt) => String(opt.value) === String(currentVal));

      // if (targetIdx === -1) {
      //   targetIdx = options.findIndex((opt) => opt.text === currentVal);
      //   if (targetIdx !== -1) {
      //     L._(`ASelect.syncUI change lần 2 - ${this.el.dataset.field}`, { foundVal, currentVal });
      //     const foundVal = options[targetIdx].value;
      //     this.el.value = foundVal;
      //     this.el.dataset.val = foundVal;
      //     currentVal = foundVal;
      //   }
      // }

      if (targetIdx !== -1 && this.el.selectedIndex !== targetIdx) {
        this.el.selectedIndex = targetIdx;
      }
    }

    const text = this.el.options[this.el.selectedIndex]?.text || '-- Chọn --';
    const textEl = this.wrapper.querySelector('.smart-selected-text');
    if (textEl && textEl.textContent !== text) textEl.textContent = text;

    if (this.dropdown) {
      this.dropdown.querySelectorAll('.smart-option').forEach((opt) => {
        opt.classList.toggle('active', String(opt.dataset.val) === String(currentVal));
      });
    }
    L._(`ASelect.syncUI - getVal = ${getVal(this.uid)}`);
  }

  /**
   * Gán giá trị thông minh
   * @param {string} rawVal - Giá trị cần gán
   * @param {boolean} [forceTrigger=true] - Có trigger event hay không
   */
  setValue(rawVal, forceTrigger = true) {
    try {
      const val = rawVal === null || rawVal === undefined ? '' : String(rawVal);
      let dataVal = this.el.dataset.val;
      L._(`ASelect.setValue - ${this.uid}: data-val = ${dataVal}, value = ${this.el.value}`, { val, forceTrigger });

      // Đảm bảo data-val luôn được cập nhật đồng bộ với value
      getE(this.uid).value = val;
      if (dataVal !== val) {
        L._(`ASelect.setValue - có khác biệt: data-val update`, { val, dataVal });
        this.el.setAttribute('data-val', val);
      }

      if (this.state !== 'UPGRADED') {
        this.actionQueue.push(() => this.setValue(val, forceTrigger));
        return;
      }

      let optionExists = Array.from(this.el.options).some((opt) => String(opt.value) === val);

      if (!optionExists && val !== '') {
        const found = this.data.find((d) => String(d.id) === val);
        if (found) {
          const newOpt = new Option(found.text, found.id);
          this.el.add(newOpt);
        } else {
          // Nếu không tìm thấy trong data, nhưng vẫn muốn set (có thể là text)
          const newOpt = new Option(val, val);
          this.el.add(newOpt);
        }
      }

      // Re-assign để chắc chắn element nhận giá trị sau khi add option
      // this.el.value = val;

      if (forceTrigger) {
        this.el.dispatchEvent(new Event('change', { bubbles: true }));
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      L._(`ASelect.setValue - call SyncUI`);
      this.syncUI();
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`ASelect.setValue Error`, e, 'error');
    }
  }

  async triggerCallback(type, value) {
    const cb = this[type];
    if (!cb) return;
    try {
      const finalValue = value !== undefined ? value : this.el.dataset.val || this.el.value;
      if (typeof SYS.runFn === 'function') {
        await SYS.runFn(cb, [finalValue, this.el, this], this);
      }
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`[ASelect] Lỗi gọi hàm ${type}:`, e, 'error');
    }
  }

  destroy() {
    try {
      if (this.state === 'DESTROYED' || this._isUpgrading) return;

      if (this.dropdown && this.dropdown.parentNode) {
        this.dropdown.parentNode.removeChild(this.dropdown);
      }

      if (this.wrapper && this.wrapper.parentNode) {
        this.el.classList.remove('d-none');
        this.wrapper.parentNode.insertBefore(this.el, this.wrapper);
        this.wrapper.parentNode.removeChild(this.wrapper);
      }

      if (this._outsideClickRef) {
        document.removeEventListener('click', this._outsideClickRef);
      }

      ASelect.instances.delete(this.uid);
      ASelect.stats.activeInstances--;

      this.state = 'DESTROYED';
    } catch (e) {
      console.error(`[ASelect] Destroy Error:`, e);
    }
  }

  // --- STATIC METHODS ---

  static scheduleQueue() {
    if (ASelect.processTimer) return;
    // Sử dụng requestAnimationFrame để tối ưu hóa rendering
    ASelect.processTimer = requestAnimationFrame(() => ASelect.processQueue());
  }

  static processQueue() {
    if (ASelect.upgradeQueue.length === 0) {
      ASelect.processTimer = null;
      return;
    }

    const startTime = performance.now();
    const frameBudget = 16; // 16ms budget cho mỗi frame (60fps)

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
    const uid = el.id || el.dataset.smartId || el.closest('.smart-select-wrapper')?.dataset.smartId || el.closest('.smart-dropdown-menu')?.dataset.smartId;
    return ASelect.instances.get(uid) || null;
  }

  /**
   * Khởi tạo quan sát DOM để tự động init và đồng bộ 2 chiều
   */
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
            const newVal = target.getAttribute(mutation.attributeName);
            // Chỉ sync nếu giá trị thực sự khác để tránh loop
            // Ép kiểu String để so sánh chính xác
            if (String(inst.el.value) !== String(newVal) || String(inst.el.dataset.val) !== String(newVal)) {
              inst.setValue(newVal, false); // false để không trigger ngược lại event
            }
          }
          continue;
        }

        if (mutation.type === 'childList' && target.tagName === 'SELECT' && target.classList.contains('smart-select')) {
          if (inst && !inst._isUpgrading) {
            inst.data = inst.mapData(Array.from(target.options).map((opt) => ({ id: opt.value, text: opt.text })));
            inst.renderDropdownContent();
            L._(`ASelect.initDOMWatcher - call SyncUI`);
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
      }
    });

    ASelect.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-val', 'value'],
    });

    scan();
    console.log('[ASelect] DOM Watcher initialized (v2.9.1 - Optimized Batch Rendering)', ASelect.stats);
  }
}

// Tự động khởi chạy khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ASelect.initDOMWatcher());
} else {
  ASelect.initDOMWatcher();
}

window.ASelect = ASelect;
