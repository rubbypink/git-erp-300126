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
      this.toogleState = false;
      this.dropdown = null;
      this.searchInput = null;

      ASelect.stats.activeInstances++;

      // Kế thừa quyền Admin
      if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.role === 'admin') {
        this.opts.isCreatable = true;
        this.opts.isEditable = true;
      }

      // Khởi tạo Base Render (Cực nhanh)
      this.initBase();
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
      const fastData = this.checkSyncData();
      if (fastData) {
        this.data = this.mapData(fastData);
        this.renderNativeOptions();
        this.scheduleUpgrade();
      } else {
        // Nạp async
        this.loadData().then(() => {
          this.renderNativeOptions();
          if (this.state === 'BASE') this.scheduleUpgrade();
        });
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

  checkSyncData() {
    if (typeof this.source !== 'string') return null;
    const s = this.source.trim();
    if (typeof window.APP_DATA !== 'undefined' && window.APP_DATA[s]) return window.APP_DATA[s];
    return null;
  }

  scheduleUpgrade() {
    if (this.state !== 'BASE') return;
    this.state = 'UPGRADING';
    ASelect.upgradeQueue.push(this);
    ASelect.scheduleQueue();
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

  async loadData() {
    try {
      let src = this.source;
      if (!src) return;

      if (typeof src === 'string') {
        src = src.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
      }

      const cacheKey = typeof src === 'string' ? src : null;

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
        let raw = null;
        if (typeof src === 'function') {
          raw = await src(this.el, this);
        } else if (Array.isArray(src) || typeof src === 'object') {
          raw = src;
        } else if (typeof src === 'string') {
          const s = src;
          if (window.A?.DB?.schema?.isCollection?.(s)) {
            raw = await window.A.DB.local.getCollection(s);
          } else {
            const resolved = this._resolveWindowPath(s);
            if (resolved && resolved.value !== undefined) {
              const { value, context } = resolved;
              if (typeof value === 'function') {
                raw = await value.call(context, this.el, this);
              } else {
                raw = value;
              }
            } else if (typeof window.SYS?.runFn === 'function') {
              raw = await window.SYS.runFn(s, [this.el, this]);
            } else if (typeof window.normalizeList === 'function') {
              raw = window.normalizeList(s);
            }
          }
        }
        return raw;
      })();

      if (cacheKey) ASelect.fetchPromises.set(cacheKey, fetchPromise);
      const result = await fetchPromise;

      this.data = this.mapData(result);

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

      this.dropdown = document.createElement('div');
      this.dropdown.className = 'dropdown-menu shadow p-0 smart-dropdown-menu';
      this.dropdown.style.cssText = 'max-height: 50vh; overflow: hidden; overflow-y: auto; z-index: 2000; position: fixed; display: none; min-width:120px; width: fit-content; max-width: 250px;';
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
    if (!this.dropdown) return;

    // An toàn nội dung
    const formatStr = (str) => (typeof escapeHtml === 'function' ? escapeHtml(str) : str);

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
    this.searchInput = this.dropdown.querySelector('.smart-search-input');
  }

  initInstanceEvents() {
    try {
      this.wrapper.addEventListener('click', (e) => {
        const toggle = e.target.closest('.smart-toggle-btn');
        if (toggle) {
          e.stopPropagation();
          if (!this.toogleState) this.openDropdown();
          else this.closeDropdown();
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
    try {
      if (!this.dropdown) return;
      this.toogleState = true;

      // Đóng các dropdown khác đang mở
      document.querySelectorAll('.smart-dropdown-menu').forEach((m) => {
        if (m !== this.dropdown) m.style.display = 'none';
      });

      if (!this.dropdown.parentNode) document.body.appendChild(this.dropdown);

      const rect = this.toggleBtn.getBoundingClientRect();
      const dropdownWidth = Math.max(rect.width, 200);

      this.dropdown.style.width = `${dropdownWidth}px`;
      this.dropdown.style.display = 'block';
      this.dropdown.style.visibility = 'hidden';

      const dropdownHeight = this.dropdown.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = rect.bottom + window.scrollY;
      let left = rect.left + window.scrollX;

      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (dropdownHeight > spaceBelow && spaceAbove > spaceBelow) {
        top = rect.top + window.scrollY - dropdownHeight;
        if (top < window.scrollY) top = window.scrollY;
      } else {
        if (top + dropdownHeight > viewportHeight + window.scrollY) {
          top = Math.max(window.scrollY, viewportHeight + window.scrollY - dropdownHeight);
        }
      }

      if (rect.left + dropdownWidth > viewportWidth) {
        left = rect.right + window.scrollX - dropdownWidth;
      }
      if (left < window.scrollX) left = window.scrollX;

      this.dropdown.style.top = `${top}px`;
      this.dropdown.style.left = `${left}px`;
      this.dropdown.style.visibility = 'visible';

      if (this.searchInput) {
        this.searchInput.value = '';
        setTimeout(() => this.searchInput.focus(), 10);
        this.dropdown.querySelectorAll('.smart-option').forEach((opt) => {
          opt.classList.remove('d-none');
          opt.classList.remove('highlight');
        });
      }

      // Xóa Listeners cũ để chống Memory Leak
      if (this._outsideClickRef) document.removeEventListener('click', this._outsideClickRef);
      if (this._scrollRef) window.removeEventListener('scroll', this._scrollRef, true);

      // Bind Listeners mới bằng Vanilla JS chuẩn mực
      this._outsideClickRef = (e) => {
        if (!this.wrapper.contains(e.target) && !this.dropdown.contains(e.target)) {
          this.closeDropdown();
        }
      };
      document.addEventListener('click', this._outsideClickRef);

      this._scrollRef = (e) => {
        if (!this.dropdown.contains(e.target)) {
          this.closeDropdown();
        }
      };
      window.addEventListener('scroll', this._scrollRef, { capture: true, passive: true });

      this.syncUI();
    } catch (e) {
      if (typeof L !== 'undefined' && L._) L._(`ASelect.openDropdown Error`, e, 'error');
    }
  }

  closeDropdown() {
    this.toogleState = false;
    if (this.dropdown) this.dropdown.style.display = 'none';

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
        console.warn(`[ASelect Debug - LỖI GHOST DOM KHẮC PHỤC THÀNH CÔNG] Nếu log này còn xuất hiện, bảng thực sự đã bị refresh và element cũ cần dọn rác.`);
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

      if (forceTrigger) {
        const changeEvt = new Event('change', { bubbles: true });
        changeEvt._isInternal = true;
        this.el.dispatchEvent(changeEvt);

        const inputEvt = new Event('input', { bubbles: true });
        inputEvt._isInternal = true;
        this.el.dispatchEvent(inputEvt);
      } else {
        this.triggerCallback('onChange', this.el.value);
      }
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

    if (this.dropdown) {
      this.dropdown.querySelectorAll('.smart-option').forEach((opt) => {
        opt.classList.toggle('active', String(opt.dataset.value) === currentVal);
      });
    }
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

      if (this.dropdown && this.dropdown.parentNode) {
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
    const uid = el.dataset.smartId || el.closest('.smart-select-wrapper')?.dataset.smartId || el.closest('.smart-dropdown-menu')?.dataset.smartId;
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ASelect.initDOMWatcher());
} else {
  ASelect.initDOMWatcher();
}
