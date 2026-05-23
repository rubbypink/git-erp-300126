/**
 * Module: ASelect (9Trip ERP Core)
 * Version: 3.0.0 (Native-Select Only — Lightweight Data Manager)
 * Tech Lead: 9Trip ERP Core Architect
 *
 * @class ASelect
 * @description Quản lý dữ liệu options cho thẻ select.
 * Tự động tải data từ source, match value bằng cả value lẫn text,
 * và phát hiện select mới qua MutationObserver.
 */
export default class ASelect {
    /** @type {Map<string, ASelect>} Lưu trữ instance theo UID để truy xuất nhanh */
    static instances = new Map();
    /** @type {MutationObserver|null} Quan sát DOM để tự động khởi tạo và đồng bộ */
    static domObserver = null;
    /** @type {Map<string, Promise>} Gộp các request DB trùng lặp */
    static fetchPromises = new Map();
    /** @type {Map<string, Array>} Cache dữ liệu đã map */
    static mapCache = new Map();

    /**
     * @constructor
     * @param {HTMLSelectElement} selectEl - Thẻ select gốc
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
            this.state = 'READY';
            this._syncGuard = false; // Flag chống loop vô hạn khi đồng bộ DOM
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
            const fastData = await this.checkSyncData();
            if (fastData) {
                if (fastData !== true) this.data = fastData;
                if (typeof this.source === 'string') {
                    ASelect.mapCache.set(this.source.trim(), this.data);
                }
                this.renderNativeOptions();
            }

            // Lắng nghe sự kiện native
            this.el.addEventListener('change', (e) => {
                this.triggerCallback('onChange', this.el.value);
            });

            this.el.addEventListener('input', (e) => {
                this.triggerCallback('onInput', this.el.value);
            });
        } catch (e) {
            if (typeof L !== 'undefined' && L._) L._(`ASelect.initBase Error`, e, 'error');
        }
    }

    async checkSyncData() {
        if (!this.source) return null;
        let data = null;
        let cacheKey = null;

        if (typeof this.source === 'string') {
            const s = this.source.trim();
            cacheKey = s;

            // Xử lý JSON String ngay từ đầu
            if (s.startsWith('[') || s.startsWith('{')) {
                try {
                    return JSON.parse(s);
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
            return this.mapData(data);
        } else if (data && !cacheKey) {
            return this.mapData(data);
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
        if (this._syncGuard) return;
        this._syncGuard = true;

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
        this._syncGuard = false;
    }

    setValue(rawVal, forceTrigger = true) {
        if (this._syncGuard) return;
        this._syncGuard = true;

        try {
            if (!document.body.contains(this.el)) {
                this.destroy();
                return;
            }

            let val = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

            // Guard chống loop
            if (String(this.el.value) === val && String(this.el.dataset.val) === val) {
                return;
            }

            this.el.dataset.val = val;

            let options = [...this.el.options];
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

            // Dispatch event để các module khác nhận biết sự thay đổi
            if (forceTrigger) {
                this.el.dispatchEvent(new Event('change', { bubbles: true }));
                this.el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (e) {
            console.error(`[ASelect] setValue Error:`, e);
        } finally {
            // Reset guard bằng microtask
            // Đảm bảo MutationObserver đã chạy xong trước khi mở khóa
            queueMicrotask(() => {
                this._syncGuard = false;
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
            if (this.state === 'DESTROYED') return;

            this.el.dataset.smartInit = '';
            this.el.removeAttribute('data-smart-id');

            ASelect.instances.delete(this.uid);

            this.state = 'DESTROYED';
        } catch (e) {
            console.error(`[ASelect] Destroy Error:`, e);
        }
    }

    static getInstance(el) {
        if (!el) return null;
        const uid = el.dataset?.smartId;
        return uid ? ASelect.instances.get(uid) || null : null;
    }

    static initDOMWatcher() {
        if (ASelect.domObserver) return;

        const scan = (root = document.body) => {
            root.querySelectorAll('select.smart-select:not([data-smart-init])').forEach((el) => new ASelect(el));
        };

        ASelect.domObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                const target = mutation.target;

                // Xử lý thay đổi attribute (data-val/value)
                if (mutation.type === 'attributes' && (mutation.attributeName === 'data-val' || mutation.attributeName === 'value')) {
                    const inst = ASelect.getInstance(target);
                    if (inst && !inst._syncGuard && typeof inst.setValue === 'function') {
                        const newVal = String(target.getAttribute(mutation.attributeName) || '').trim();
                        const currentVal = String(inst.el.value || '');
                        const currentDataVal = String(inst.el.dataset.val || '');

                        if (newVal !== currentVal || newVal !== currentDataVal) {
                            inst.setValue(newVal, false);
                        }
                    }
                    continue;
                }

                // Xử lý thêm node mới — auto-init select.smart-select
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
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        ASelect.initDOMWatcher();
    });
} else {
    ASelect.initDOMWatcher();
}
window.ASelect = ASelect;
