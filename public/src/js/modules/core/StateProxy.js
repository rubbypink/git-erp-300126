/**
 * =============================================================================
 * STATE PROXY  v8.2  Global Undo/Redo Reactive State Management (Timeline History)
 * =============================================================================
 *
 * Chức năng:
 *   1. Quản lý trạng thái chỉnh sửa (Undo/Redo) toàn cục (Global) trong RAM.
 *   2. Tự động track thay đổi từ UI vào APP_DATA thông qua Proxy.
 *   3. Hệ thống Global Undo/Redo quản lý tối đa 20 stack theo cơ chế FIFO.
 *   4. Cơ chế hoán đổi oldValue/newValue trong stack để duy trì lịch sử.
 *   5. Định danh Element thông minh dựa trên ID hoặc context (data-field + parent).
 *   6. Timeline History: Không xóa stack khi thao tác mới ở giữa lịch sử,
 *      giúp duy trì toàn bộ audit trail của người dùng.
 *
 * Quy tắc:
 *   - Chỉ track các thay đổi do người dùng thực hiện.
 *   - Loại trừ các trường hệ thống (SYSTEM_FIELDS).
 *   - Sử dụng _suppressBind khi cập nhật UI từ Proxy.
 * =============================================================================
 */
const StateProxy = (() => {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  const MAX_UNDO = 20;
  const VIRTUAL_PREFIX = '__new_';
  let _virtualCounter = 0;
  const _virtualIds = new Set();

  /**
   * Danh sách các trường hệ thống KHÔNG bao giờ được track thay đổi
   */
  const SYSTEM_FIELDS = new Set(['id', 'updated_at', 'updated_by', 'created_at', 'created_by', 'edit_history', 'history', 'batch_id', '_search_index', '_keywords', '_search_keywords', 'is_deleted']);

  // ─── Internal Stores (RAM Only) ────────────────────────────────────────────
  const _historyStack = []; // Global stack: [{ coll, id, field, oldVal, newVal, selector }]
  let _historyPointer = 0; // Con trỏ hiện tại trong stack toàn cục

  const _baseline = new Map(); // Trạng thái gốc khi bắt đầu edit { key: docObj }
  const _dirty = new Map(); // Tập hợp các field bị thay đổi { key: Set(fields) }
  const _session = new Map(); // Danh sách các doc đang được track { key: {coll, id} }
  const _proxyCache = new Map(); // Cache các Proxy object theo collection

  const _elemBinding = new WeakMap(); // Liên kết Element -> {coll, id, field}
  const _boundEls = new WeakSet(); // Tập hợp các Element đã được gắn listener
  const _focusSnapshot = new WeakMap(); // Giá trị tại thời điểm focus để so sánh khi change
  const _scopedObservers = new Map(); // RootElement -> { observer, callbacks: Map<Selector, Callback> }

  // ─── Control Flags ─────────────────────────────────────────────────────────
  let _suppressBind = false;
  let _lifecycleAC = new AbortController();

  // Patched globals
  let _origSetToEl = null;
  let _origSetNum = null;

  // ─── Field Alias ───────────────────────────────────────────────────────────
  const FIELD_ALIAS = {
    customers: {
      customer_id: 'id',
      customer_full_name: 'full_name',
      customer_dob: 'dob',
      customer_id_card: 'id_card',
      customer_id_card_date: 'id_card_date',
      customer_phone: 'phone',
      customer_email: 'email',
      customer_source: 'source',
      customer_total_spend: 'total_spend',
      customer_address: 'address',
    },
  };

  const _FIELD_ALIAS_REV = {};
  for (const [coll, map] of Object.entries(FIELD_ALIAS)) {
    _FIELD_ALIAS_REV[coll] = Object.fromEntries(Object.entries(map).map(([htmlF, schemaF]) => [schemaF, htmlF]));
  }

  function _resolveField(coll, htmlField) {
    return FIELD_ALIAS[coll]?.[htmlField] ?? htmlField;
  }

  function _htmlFieldOf(coll, schemaField) {
    return _FIELD_ALIAS_REV[coll]?.[schemaField] ?? schemaField;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────
  const _k = (coll, id) => `${coll}::${id}`;

  /**
   * Lấy hoặc tạo mới MutationObserver cho một vùng scope (root)
   * @param {HTMLElement} root - Phần tử gốc để theo dõi
   * @returns {{observer: MutationObserver, callbacks: Map}}
   */
  function _getOrCreateScopedObserver(root) {
    if (_scopedObservers.has(root)) return _scopedObservers.get(root);

    const callbacks = new Map();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const target = m.target;
        if (target && target.tagName === 'SELECT') {
          for (const [selector, cb] of callbacks) {
            if (target.matches(selector)) {
              if (target.options.length === 0) {
                try {
                  cb(target);
                } catch (err) {
                  if (typeof L !== 'undefined') L.log(err, 'StateProxy.ScopedObserver.callback');
                }
              }
            }
          }
        }
      }
    });

    observer.observe(root, { childList: true, subtree: true });

    const entry = { observer, callbacks };
    _scopedObservers.set(root, entry);
    return entry;
  }

  function _clone(obj) {
    if (!obj) return obj;
    try {
      return structuredClone(obj);
    } catch {
      return JSON.parse(JSON.stringify(obj));
    }
  }

  /**
   * Đảm bảo document được track trong session
   */
  function _ensureTracked(coll, id) {
    if (!coll || !id) return;
    const key = _k(coll, id);
    if (_session.has(key)) return;
    const docData = window.APP_DATA?.[coll]?.[id] ?? { id };
    _baseline.set(key, _clone(docData));
    _session.set(key, { coll, id });
    if (!_proxyCache.has(coll)) _installProxy(coll);
  }

  /**
   * Định danh Element để đồng bộ UI chính xác
   */
  function _getElSelector(el) {
    if (!el) return null;
    if (el.id) return `#${el.id}`;
    const field = el.dataset.field;
    if (!field) return null;
    const parent = el.closest('[data-item], tr, fieldset, form');
    if (parent) {
      const itemId = parent.dataset.item || parent.id;
      if (itemId) return `[data-item="${CSS.escape(itemId)}"] [data-field="${CSS.escape(field)}"]`;
      const tag = parent.tagName.toLowerCase();
      return `${tag} [data-field="${CSS.escape(field)}"]`;
    }
    return `[data-field="${CSS.escape(field)}"]`;
  }

  /**
   * Đẩy một thay đổi vào Global History Stack (FIFO 20)
   */
  function _pushRing(coll, id, field, oldVal, newVal, el = null) {
    try {
      if (SYSTEM_FIELDS.has(field)) return;
      if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return;

      // 1. Thêm entry mới vào cuối stack (Không xóa các bước redo cũ để giữ lịch sử)
      const selector = _getElSelector(el);
      _historyStack.push({
        coll,
        id,
        field,
        oldVal: _clone(oldVal),
        newVal: _clone(newVal),
        selector,
        ts: Date.now(),
      });

      // 2. FIFO: Giới hạn 20 bước
      if (_historyStack.length > MAX_UNDO) {
        _historyStack.shift();
      }

      // 3. Luôn chuyển con trỏ lên cuối stack để chặn redo nhưng vẫn undo được các bước cũ
      _historyPointer = _historyStack.length;

      if (typeof L !== 'undefined') L._(`[StateProxy] History pushed. Pointer: ${Object.entries(_historyStack)}`);
    } catch (err) {
      if (typeof L !== 'undefined') L.log(err, 'StateProxy._pushRing');
    }
  }

  /**
   * Đồng bộ giá trị hiện tại của UI vào Stack nếu cần
   */
  function _syncUndoStack(coll, id, el = null) {
    try {
      if (!el) return;
      const htmlField = el.dataset.field;
      if (!htmlField) return;
      const field = _resolveField(coll, htmlField);
      if (SYSTEM_FIELDS.has(field)) return;

      const currentVal = getVal(el);
      const initialVal = el.dataset.initial;

      if (initialVal !== undefined && String(initialVal) !== String(currentVal)) {
        const hasHistory = _historyStack.some((s) => s.coll === coll && s.id === id && s.field === field);
        if (!hasHistory) {
          _pushRing(coll, id, field, initialVal, currentVal, el);
          _focusSnapshot.set(el, currentVal);
        }
      }
    } catch (err) {
      if (typeof L !== 'undefined') L.log(err, 'StateProxy._syncUndoStack');
    }
  }

  // ─── Proxy Handlers ────────────────────────────────────────────────────────
  function _makeCollHandler(coll) {
    return {
      set(target, id, val) {
        try {
          const key = _k(coll, id);
          const isTracked = typeof id === 'string' && _session.has(key);
          const prevDoc = isTracked ? _clone(target[id]) : undefined;

          target[id] = val;

          if (isTracked && val && typeof val === 'object' && val.updated_at) {
            _baseline.set(key, _clone(val));
            _clearDirty(coll, id);
            return true;
          }

          if (prevDoc !== undefined) _onUpdate(coll, val, prevDoc);
          return true;
        } catch (err) {
          if (typeof L !== 'undefined') L.log(err, 'StateProxy.ProxyHandler.set');
          return false;
        }
      },
      deleteProperty(target, id) {
        if (typeof id === 'string' && _session.has(_k(coll, id))) _onRemove(coll, id);
        return delete target[id];
      },
    };
  }

  function _installProxy(coll) {
    if (_proxyCache.has(coll)) return;
    const raw = window.APP_DATA?.[coll];
    if (!raw || typeof raw !== 'object') return;
    const proxy = new Proxy(raw, _makeCollHandler(coll));
    _proxyCache.set(coll, { proxy, target: raw });
    window.APP_DATA[coll] = proxy;
  }

  function _uninstallProxy(coll) {
    const entry = _proxyCache.get(coll);
    if (entry && window.APP_DATA) window.APP_DATA[coll] = entry.target;
    _proxyCache.delete(coll);
  }

  // ─── Dirty Tracking ────────────────────────────────────────────────────────────
  function _markDirty(coll, id, fields) {
    const key = _k(coll, id);
    let s = _dirty.get(key);
    if (!s) {
      s = new Set();
      _dirty.set(key, s);
    }
    for (const f of fields) {
      if (SYSTEM_FIELDS.has(f)) continue;
      s.add(f);
      const htmlF = _htmlFieldOf(coll, f);
      document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`).forEach((el) => el.classList.add('is-dirty'));
    }
    document.querySelectorAll(`[data-bind-dirty="${key}"]`).forEach((el) => (el.style.display = 'inline-flex'));
  }

  function _clearDirty(coll, id) {
    const key = _k(coll, id);
    const s = _dirty.get(key);
    if (s) {
      for (const f of s) {
        const htmlF = _htmlFieldOf(coll, f);
        document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`).forEach((el) => el.classList.remove('is-dirty'));
      }
    }
    _dirty.delete(key);
    document.querySelectorAll(`[data-bind-dirty="${key}"]`).forEach((el) => (el.style.display = 'none'));
  }

  // ─── Core Mutation Handlers ─────────────────────────────────────────────────────
  function _onUpdate(coll, dataObj, prevDoc) {
    try {
      const { id } = dataObj ?? {};
      if (!id || !dataObj || typeof dataObj !== 'object') return;
      const oldDoc = prevDoc ?? _clone(window.APP_DATA?.[coll]?.[id] ?? {});

      const changed = Object.keys(dataObj).filter((f) => {
        if (SYSTEM_FIELDS.has(f)) return false;
        return JSON.stringify(oldDoc[f]) !== JSON.stringify(dataObj[f]);
      });

      if (changed.length) {
        _markDirty(coll, id, changed);
      }
    } catch (err) {
      if (typeof L !== 'undefined') L.log(err, 'StateProxy._onUpdate');
    }
  }

  function _onRemove(coll, id) {
    const docData = _proxyCache.get(coll)?.target?.[id] ?? window.APP_DATA?.[coll]?.[id];
    if (docData) {
      _pushRing(coll, id, '__doc__', docData, null);
    }
    _session.delete(_k(coll, id));
    _baseline.delete(_k(coll, id));
    _dirty.delete(_k(coll, id));
  }

  function _migrateVirtualId(coll, virtualId, realId, anchor) {
    const oldKey = _k(coll, virtualId);
    const newKey = _k(coll, realId);
    if (_session.has(newKey)) return;

    if (_session.has(oldKey)) {
      _session.delete(oldKey);
      _session.set(newKey, { coll, id: realId });
    }
    const base = _baseline.get(oldKey);
    if (base) {
      _baseline.delete(oldKey);
      base.id = realId;
      _baseline.set(newKey, base);
    }
    const dirtySet = _dirty.get(oldKey);
    if (dirtySet) {
      _dirty.delete(oldKey);
      _dirty.set(newKey, dirtySet);
    }

    _historyStack.forEach((s) => {
      if (s.coll === coll && s.id === virtualId) {
        s.id = realId;
        if (s.selector) s.selector = s.selector.replace(CSS.escape(virtualId), CSS.escape(realId));
      }
    });

    document.querySelectorAll(`[data-item="${CSS.escape(virtualId)}"]`).forEach((container) => {
      container.dataset.item = realId;
      container.querySelectorAll('[data-field]').forEach((el) => {
        const binding = _elemBinding.get(el);
        if (binding) binding.id = realId;
      });
    });

    if (anchor) delete anchor.dataset.virtualDocId;
    _virtualIds.delete(virtualId);
  }

  function _resolveCollId(el) {
    if (!el || el.nodeType !== 1) return null;
    const container = el.closest('table[data-collection], tbody[data-collection], form[data-collection], fieldset[data-collection]');
    if (!container) return null;
    const coll = container.dataset.collection;
    if (!coll) return null;

    const idHtmlField = _FIELD_ALIAS_REV[coll]?.['id'] ?? 'id';
    const idSelector = idHtmlField !== 'id' ? `[data-field="id"], [data-field="${idHtmlField}"]` : '[data-field="id"]';

    let id = null;
    const tr = el.closest('tr');
    if (tr && container.contains(tr)) {
      const idEl = tr.querySelector(idSelector);
      if (idEl) id = getVal(idEl) || null;
    }
    if (!id && el.parentElement) {
      const siblingId = el.parentElement.querySelector(`:scope > ${idSelector}`);
      if (siblingId && siblingId !== el) id = getVal(siblingId) || null;
    }
    if (!id) {
      const itemAnchor = el.closest('[data-item]');
      if (itemAnchor && container.contains(itemAnchor)) id = itemAnchor.dataset.item || null;
    }
    if (!id) id = container.dataset.item ?? null;
    if (!id) {
      const idEl = container.querySelector(idSelector);
      if (idEl) id = getVal(idEl) || null;
    }

    if (coll && id) return { coll, id };

    if (coll) {
      const virtualAnchor = tr && container.contains(tr) ? tr : container;
      let virtualId = virtualAnchor.dataset.virtualDocId;
      if (!virtualId) {
        _virtualCounter++;
        virtualId = VIRTUAL_PREFIX + coll + '_' + (virtualAnchor.id || _virtualCounter);
        virtualAnchor.dataset.virtualDocId = virtualId;
        _virtualIds.add(virtualId);
      }
      return { coll, id: virtualId };
    }
    return null;
  }

  function _isBindableEl(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    return (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') && el.type !== 'hidden';
  }

  function _tryAutoBind(el, value) {
    if (_suppressBind) return;
    const htmlField = el?.dataset?.field;
    if (htmlField && value && !String(value).startsWith(VIRTUAL_PREFIX)) {
      if (htmlField === 'id' || el?.type === 'hidden') {
        const container = el.closest('table[data-collection], tbody[data-collection], form[data-collection], fieldset[data-collection]');
        const coll = container?.dataset?.collection;
        if (coll && _resolveField(coll, htmlField) === 'id') {
          const tr = el.closest('tr');
          const anchor = tr && container.contains(tr) ? tr : container;
          const virtualId = anchor?.dataset?.virtualDocId;
          if (virtualId) _migrateVirtualId(coll, virtualId, String(value), anchor);
        }
        return;
      }
    }

    if (!_isBindableEl(el) || !htmlField || htmlField === 'id') return;
    const ctx = _resolveCollId(el);
    if (!ctx) return;
    const field = _resolveField(ctx.coll, htmlField);
    if (SYSTEM_FIELDS.has(field)) return;

    const wasBound = _elemBinding.has(el);
    if (wasBound) {
      const cleanVal = typeof value === 'number' ? value : !isNaN(Number(value)) ? Number(value) : value;
      const coll_data = window.APP_DATA?.[ctx.coll];
      if (coll_data?.[ctx.id] !== undefined) {
        const current = coll_data[ctx.id]?.[field];
        if (JSON.stringify(current) !== JSON.stringify(cleanVal)) {
          const oldSnap = _focusSnapshot.get(el);
          if (oldSnap !== undefined && String(oldSnap) !== String(cleanVal)) {
            _pushRing(ctx.coll, ctx.id, field, oldSnap, cleanVal, el);
            _focusSnapshot.set(el, cleanVal);
          }
          coll_data[ctx.id] = { ...coll_data[ctx.id], [field]: cleanVal };
        }
      }
    } else {
      if (el.dataset.initial !== undefined) {
        const initialVal = el.dataset.initial;
        const currentVal = getVal(el);
        if (String(initialVal) !== String(currentVal)) {
          _pushRing(ctx.coll, ctx.id, field, initialVal, currentVal, el);
          _focusSnapshot.set(el, currentVal);
        }
      }
    }
    _ensureTracked(ctx.coll, ctx.id);
    api.bindElement(el, ctx.coll, ctx.id, field);
  }

  /**
   * Áp dụng thay đổi từ stack vào UI và Proxy
   */
  function _applyHistoryEntry(entry) {
    const { coll, id, field, newVal, selector } = entry;
    const wasSuppressed = _suppressBind;
    _suppressBind = true;

    try {
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      if (field === '__doc__') {
        if (raw) {
          if (newVal === null) delete raw[id];
          else raw[id] = _clone(newVal);
        }
        if (newVal) {
          Object.keys(newVal).forEach((f) => {
            const hF = _htmlFieldOf(coll, f);
            document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(hF)}"]`).forEach((el) => {
              setVal(el, newVal[f]);
              _focusSnapshot.set(el, newVal[f]);
            });
          });
        }
      } else {
        if (raw?.[id]) raw[id] = { ...raw[id], [field]: newVal };

        const htmlF = _htmlFieldOf(coll, field);
        let els = [];
        if (selector) {
          const el = document.querySelector(selector);
          if (el) els.push(el);
        }
        if (!els.length) {
          els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`);
        }

        els.forEach((el) => {
          setVal(el, newVal);
          _focusSnapshot.set(el, newVal);
        });

        const baseline = _baseline.get(_k(coll, id));
        const dirtySet = _dirty.get(_k(coll, id));
        if (dirtySet && baseline) {
          if (JSON.stringify(newVal) === JSON.stringify(baseline[field])) {
            dirtySet.delete(field);
            els.forEach((el) => el.classList.remove('is-dirty'));
          } else {
            dirtySet.add(field);
            els.forEach((el) => el.classList.add('is-dirty'));
          }
        }
      }
    } finally {
      _suppressBind = wasSuppressed;
    }
  }

  // ─── DOM Event Handlers ────────────────────────────────────────────────────────
  function _onFocusCapture(e) {
    const el = e.currentTarget ?? e.target;
    const binding = _elemBinding.get(el);
    if (binding) {
      const proxyVal = window.APP_DATA?.[binding.coll]?.[binding.id]?.[binding.field];
      _focusSnapshot.set(el, proxyVal !== undefined ? proxyVal : getVal(el));
    }
  }

  function _onChangeEvent(e) {
    try {
      const el = e.currentTarget ?? e.target;
      const binding = _elemBinding.get(el);
      if (!binding) return;
      const { coll, id, field } = binding;

      const oldVal = _focusSnapshot.get(el);
      const newVal = getVal(el);

      if (oldVal !== undefined && String(oldVal) !== String(newVal)) {
        _pushRing(coll, id, field, oldVal, newVal, el);
      }
      _focusSnapshot.set(el, newVal);

      const coll_data = window.APP_DATA?.[coll];
      if (coll_data?.[id] !== undefined) {
        coll_data[id] = { ...coll_data[id], [field]: newVal };
      }
    } catch (err) {
      if (typeof L !== 'undefined') L.log(err, 'StateProxy._onChangeEvent');
    }
  }

  function _onDelegatedFocusIn(e) {
    try {
      const el = e.target;
      if (_elemBinding.has(el) || !_isBindableEl(el)) return;
      const htmlField = el.dataset?.field;
      if (!htmlField) return;
      const ctx = _resolveCollId(el);
      if (!ctx) return;
      const field = _resolveField(ctx.coll, htmlField);
      if (SYSTEM_FIELDS.has(field)) return;

      let proxyOldVal;
      if (e.type === 'change') {
        proxyOldVal = window.APP_DATA?.[ctx.coll]?.[ctx.id]?.[field];
        if (proxyOldVal === undefined) proxyOldVal = el.defaultValue ?? '';
      }

      _ensureTracked(ctx.coll, ctx.id);
      api.bindElement(el, ctx.coll, ctx.id, field);

      if (e.type === 'change') {
        const val = getVal(el);
        if (proxyOldVal !== undefined && String(proxyOldVal) !== String(val)) {
          _pushRing(ctx.coll, ctx.id, field, proxyOldVal, val, el);
        }
        const coll_data = window.APP_DATA?.[ctx.coll];
        if (coll_data?.[ctx.id] !== undefined) {
          coll_data[ctx.id] = { ...coll_data[ctx.id], [field]: val };
        }
        _focusSnapshot.set(el, val);
      }
    } catch (err) {
      if (typeof L !== 'undefined') L.log(err, 'StateProxy._onDelegatedFocusIn');
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────────
  const api = {
    bindElement(el, coll, id, field) {
      if (!el || !coll || !id || !field) return;
      const isNew = !_boundEls.has(el);
      _elemBinding.set(el, { coll, id, field });
      const itemContainer = el.closest('tr, fieldset, form') ?? el.parentElement;
      if (itemContainer && !itemContainer.dataset.item) itemContainer.dataset.item = id;
      if (isNew) {
        _boundEls.add(el);
        const proxyVal = window.APP_DATA?.[coll]?.[id]?.[field];
        _focusSnapshot.set(el, proxyVal !== undefined ? proxyVal : getVal(el));
        _syncUndoStack(coll, id, el);
        el.addEventListener('focus', _onFocusCapture, { passive: true });
        el.addEventListener('change', _onChangeEvent, { passive: true });
      }
    },

    beginEdit(coll, id) {
      _ensureTracked(coll, id);
    },
    suppressAutoBinding() {
      _suppressBind = true;
    },
    resumeAutoBinding() {
      _suppressBind = false;
    },

    commitSession(targetColl = null, targetId = null) {
      try {
        const _doCommit = (coll, id) => {
          const key = _k(coll, id);
          const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
          const currentDoc = raw?.[id];

          if (currentDoc) {
            _baseline.set(key, _clone(currentDoc));
            document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field]`).forEach((el) => {
              const binding = _elemBinding.get(el);
              if (binding && binding.coll === coll && binding.id === id) {
                const val = currentDoc[binding.field];
                if (val !== undefined) _focusSnapshot.set(el, val);
              }
            });
          }
          _clearDirty(coll, id);
        };

        if (targetColl && targetId) {
          _doCommit(targetColl, targetId);
        } else {
          _session.forEach(({ coll, id }) => _doCommit(coll, id));
        }

        if (!targetColl) {
          _historyStack.length = 0;
          _historyPointer = 0;
        }
        if (typeof L !== 'undefined') L._('[StateProxy] Session committed locally.');
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.commitSession');
      }
    },

    commitDoc(coll, id) {
      this.commitSession(coll, id);
    },

    rollbackSession() {
      try {
        _session.forEach(({ coll, id }) => {
          const key = _k(coll, id);
          const snap = _baseline.get(key);
          if (!snap) return;
          const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
          if (raw) raw[id] = _clone(snap);
          _clearDirty(coll, id);

          Object.keys(snap).forEach((f) => {
            const htmlF = _htmlFieldOf(coll, f);
            document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`).forEach((el) => setVal(el, snap[f]));
          });
        });
        _historyStack.length = 0;
        _historyPointer = 0;
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.rollbackSession');
      }
    },

    clearSession() {
      try {
        _session.forEach(({ coll, id }) => _clearDirty(coll, id));
        document.querySelectorAll('[data-initial]').forEach((el) => delete el.dataset.initial);
        _virtualIds.forEach((vid) => {
          document.querySelectorAll(`[data-virtual-doc-id="${vid}"]`).forEach((el) => delete el.dataset.virtualDocId);
          document.querySelectorAll(`[data-item="${vid}"]`).forEach((el) => delete el.dataset.item);
        });
        _virtualIds.clear();
        _session.clear();
        _baseline.clear();
        _dirty.clear();
        _historyStack.length = 0;
        _historyPointer = 0;
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.clearSession');
      }
    },

    undo() {
      try {
        if (_historyPointer <= 0) return false;

        _historyPointer--;
        const entry = _historyStack[_historyPointer];

        const temp = entry.oldVal;
        entry.oldVal = entry.newVal;
        entry.newVal = temp;

        _applyHistoryEntry(entry);

        if (typeof L !== 'undefined') L._(`[StateProxy] Undo performed. Pointer: ${_historyPointer}/${_historyStack.length}`);
        return true;
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.undo');
        return false;
      }
    },

    redo() {
      try {
        if (_historyPointer >= _historyStack.length) return false;

        const entry = _historyStack[_historyPointer];

        const temp = entry.oldVal;
        entry.oldVal = entry.newVal;
        entry.newVal = temp;

        _applyHistoryEntry(entry);

        _historyPointer++;

        if (typeof L !== 'undefined') L._(`[StateProxy] Redo performed. Pointer: ${_historyPointer}/${_historyStack.length}`);
        return true;
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.redo');
        return false;
      }
    },

    reset(coll, id) {
      try {
        const snap = _baseline.get(_k(coll, id));
        if (!snap) return false;
        const copy = _clone(snap);
        const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
        if (raw) raw[id] = copy;
        _clearDirty(coll, id);
        Object.keys(copy).forEach((f) => {
          const htmlF = _htmlFieldOf(coll, f);
          document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`).forEach((el) => setVal(el, copy[f]));
        });
        return true;
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.reset');
        return false;
      }
    },

    isDirty: (coll, id) => (_dirty.get(_k(coll, id))?.size ?? 0) > 0,
    canUndo: () => _historyPointer > 0,
    canRedo: () => _historyPointer < _historyStack.length,

    getHistoryStack: () => _historyStack.map((s, i) => ({ ...s, isCurrent: i === _historyPointer - 1 })),

    hookSetters() {
      try {
        if (window._stateProxyHooked) return;
        window._stateProxyHooked = true;
        if (typeof window.setToEl === 'function' && !_origSetToEl) {
          _origSetToEl = window.setToEl;
          window.setToEl = function (el, value) {
            const result = _origSetToEl.call(this, el, value);
            if (result !== false) _tryAutoBind(el, value);
            return result;
          };
        }
        if (typeof window.setNum === 'function' && !_origSetNum) {
          _origSetNum = window.setNum;
          window.setNum = function (idOrEl, val, root = document) {
            _origSetNum.call(this, idOrEl, val, root);
            const el = typeof idOrEl === 'string' ? getE(idOrEl) : idOrEl;
            if (el) _tryAutoBind(el, val);
          };
        }
        const _patchRenderForm = () => {
          if (window.A?.UI?.renderForm && !window.A?.UI?._spPatched) {
            const orig = window.A.UI.renderForm.bind(window.A.UI);
            window.A.UI.renderForm = async function (collectionName, formId) {
              api.clearSession();
              return orig(collectionName, formId);
            };
            window.A.UI_spPatched = true;
          }
        };
        _patchRenderForm();
        setTimeout(_patchRenderForm, 100);
        document.addEventListener('focusin', _onDelegatedFocusIn, { signal: _lifecycleAC.signal, passive: true });
        document.addEventListener('change', _onDelegatedFocusIn, { signal: _lifecycleAC.signal, passive: true });
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.hookSetters');
      }
    },

    showProxyDebug() {
      try {
        const badge = (txt, cls) => `<span class="badge bg-${cls} fw-normal" style="font-size:.75em">${txt}</span>`;

        const historyHtml = `
          <div class="mt-3 border-top pt-2">
            <h6 class="mb-2">Global History Stack (${_historyStack.length}/${MAX_UNDO}) - Pointer: ${_historyPointer}</h6>
            <div class="table-responsive" style="max-height:400px">
              <table class="table table-sm table-hover border small mb-0">
                <thead class="table-light sticky-top">
                  <tr><th>#</th><th>Doc</th><th>Field</th><th>Old</th><th>New</th><th>Status</th></tr>
                </thead>
                <tbody>
                  ${
                    _historyStack.length
                      ? _historyStack
                          .map(
                            (s, i) => `
                    <tr class="${i >= _historyPointer ? 'opacity-50 text-decoration-line-through' : ''} ${i === _historyPointer - 1 ? 'table-primary' : ''}">
                      <td>${i + 1}</td>
                      <td><small>${s.coll}::${s.id}</small></td>
                      <td class="fw-bold">${s.field}</td>
                      <td class="text-truncate" style="max-width:80px">${JSON.stringify(s.oldVal)}</td>
                      <td class="text-truncate" style="max-width:80px">${JSON.stringify(s.newVal)}</td>
                      <td>${i === _historyPointer - 1 ? badge('Current', 'primary') : i < _historyPointer ? badge('Past', 'success') : badge('Future', 'secondary')}</td>
                    </tr>`
                          )
                          .reverse()
                          .join('')
                      : '<tr><td colspan="6" class="text-center text-muted">History empty</td></tr>'
                  }
                </tbody>
              </table>
            </div>
          </div>`;

        const observerStats = Array.from(_scopedObservers.entries())
          .map(([root, data]) => {
            const rootId = root.id ? `#${root.id}` : root === document.body ? 'body' : root.tagName.toLowerCase();
            const selectors = Array.from(data.callbacks.keys()).join(', ');
            return `<li><code class="text-primary">${rootId}</code>: <span class="text-muted">${selectors}</span></li>`;
          })
          .join('');

        const observerHtml = `
          <div class="mt-3 border-top pt-2">
            <h6 class="mb-2">Active Select Observers (${_scopedObservers.size})</h6>
            <ul class="small mb-0 ps-3">
              ${observerStats || '<li class="text-muted">None</li>'}
            </ul>
          </div>`;

        const statsHtml = `
          <div class="d-flex flex-wrap gap-2 mb-3" style="font-size:.82rem">
            ${badge(_proxyCache.size + ' proxy active', 'primary')}
            ${badge(_session.size + ' session docs', 'info')}
            ${badge(_historyStack.length + ' history steps', 'warning')}
            <button class="btn btn-xs btn-outline-secondary ms-auto" onclick="StateProxy.showProxyDebug()">🔄 Refresh</button>
          </div>`;

        const html = `
          <div style="font-family:var(--bs-font-monospace,monospace)">
            ${statsHtml}
            ${observerHtml}
            ${historyHtml}
            <p class="text-muted mt-3 mb-0" style="font-size:.75rem">Snapshot tại ${new Date().toLocaleString('vi-VN')}</p>
          </div>`;

        if (!window.A?.Modal) return console.warn('[StateProxy] A.Modal not available');
        window.A.Modal.render(html, '🔍 StateProxy — Global History Debug');
        window.A.Modal.show();
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.showProxyDebug');
      }
    },

    /**
     * Gán một "Proxy" (MutationObserver Scoped Delegation) để theo dõi trạng thái rỗng của thẻ select.
     * Khi tất cả các thẻ <option> bị xóa, hàm callback sẽ được thực thi.
     * Hỗ trợ tham số root để giới hạn vùng scope theo dõi, tối ưu hiệu suất.
     *
     * @param {string|HTMLElement} selectorOrEl - CSS Selector hoặc Element của thẻ select.
     * @param {Function} callback - Hàm được gọi khi select không còn option nào.
     * @param {HTMLElement|string} rootOrId - Vùng scope giới hạn (mặc định là document.body).
     * @returns {string|null} - Trả về selector đã đăng ký.
     */
    bindSelectEmptyProxy(selectorOrEl, callback, rootOrId = document.body) {
      try {
        const root = typeof rootOrId === 'string' ? getE(rootOrId) : rootOrId;
        if (!root) {
          if (typeof L !== 'undefined') L._('[StateProxy] bindSelectEmptyProxy: Root không hợp lệ', 'warning');
          return null;
        }

        let selector = typeof selectorOrEl === 'string' ? selectorOrEl : null;
        if (!selector && selectorOrEl?.nodeType === 1) {
          selector = selectorOrEl.id ? `#${selectorOrEl.id}` : `[data-field="${selectorOrEl.dataset.field}"]`;
        }

        if (!selector) {
          if (typeof L !== 'undefined') L._('[StateProxy] bindSelectEmptyProxy: Selector không hợp lệ', 'warning');
          return null;
        }

        // 1. Lấy hoặc tạo observer cho vùng scope này
        const { callbacks } = _getOrCreateScopedObserver(root);

        // 2. Đăng ký callback theo Selector
        callbacks.set(selector, callback);

        // 3. Kiểm tra ngay lập tức cho các phần tử hiện có trong root
        root.querySelectorAll(selector).forEach((el) => {
          if (el.tagName === 'SELECT' && el.options.length === 0) {
            try {
              callback(el);
            } catch (e) {
              console.error(e);
            }
          }
        });

        return selector;
      } catch (err) {
        if (typeof L !== 'undefined') L.log(err, 'StateProxy.bindSelectEmptyProxy');
        return null;
      }
    },

    destroy() {
      api.clearSession();
      [..._proxyCache.keys()].forEach((c) => _uninstallProxy(c));
      _lifecycleAC.abort();
      _lifecycleAC = new AbortController();
      if (_origSetToEl) window.setToEl = _origSetToEl;
      if (_origSetNum) window.setNum = _origSetNum;

      // Dọn dẹp tất cả các scoped observers
      _scopedObservers.forEach((entry) => {
        entry.observer.disconnect();
        entry.callbacks.clear();
      });
      _scopedObservers.clear();

      window._stateProxyHooked = false;
    },
  };

  return api;
})();

export default StateProxy;
