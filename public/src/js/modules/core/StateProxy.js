/**
 * =============================================================================
 * STATE PROXY  v5.1  Reactive State Management (Redo Support)
 * =============================================================================
 *
 * Kiến trúc:
 *   Auto-init Proxy         Proxy được khởi tạo tự động khi setVal / setNum
 *                            được gọi cho element trong container có [data-collection].
 *   Context Resolution      collection = data-collection trên <table>, <form>,
 *                            hoặc <fieldset> gần nhất bao quanh element.
 *   Proxy Lifecycle         Proxy tự động gắn khi _ensureTracked(coll, id).
 *                            Bị gỡ khi clearSession() (đổi tab / load booking mới).
 *
 * Quy tắc đồng bộ (Refactored):
 *   1. KHÔNG tự động đồng bộ DOM từ Proxy -> UI trong quá trình chỉnh sửa thông thường.
 *   2. Sử dụng getVal() để đọc dữ liệu từ UI vào Proxy.
 *   3. Sử dụng setVal() để cập nhật UI từ Proxy CHỈ khi gọi undo(), redo(), reset() hoặc rollback().
 *   4. Proxy đóng vai trò là bộ lưu trữ trạng thái (APP_DATA) và quản lý lịch sử (Undo/Redo).
 * =============================================================================
 */
const StateProxy = (() => {
  ('use strict');

  // ─── DEBUG ─────────────────────────────────────────────────────────────────
  const _DEBUG = true;
  let _logCount = 0;
  function _dbg(step, ...args) {
    if (!_DEBUG) return;
    _logCount++;
    L._(`%c[SP #${_logCount}] ${step}`, 'color:#0af;font-weight:bold', ...args);
  }
  function _dbgWarn(step, ...args) {
    if (!_DEBUG) return;
    _logCount++;
    console.warn(`[SP #${_logCount}] ⚠️ ${step}`, ...args);
  }

  // ─── Config ────────────────────────────────────────────────────────────────
  const _cfg = (key, fallback) => window.A?.getConfig?.(key) ?? fallback;
  const MAX_UNDO = _cfg('undo_max_steps', 15);
  const MAX_HIST_LS = _cfg('history_max_local', 100);
  const MAX_HIST_FLUSH = _cfg('history_max_flush', 20);
  const HIST_LS_PREFIX = 'HIST_';
  const HIST_FS_FIELD = 'edit_history';

  const VIRTUAL_PREFIX = '__new_';
  let _virtualCounter = 0;
  const _virtualIds = new Set();
  const HISTORY_COLLS = new Set(['bookings', 'booking_details', 'operator_entries', 'transactions', 'customers']);

  // ─── Internal Stores ───────────────────────────────────────────────────────
  const _globalUndoStack = [];
  const _globalRedoStack = [];
  const _baseline = new Map();
  const _undoStack = new Map();
  const _dirty = new Map();
  const _session = new Map();
  const _pendingHist = new Map();
  const _proxyCache = new Map();
  const _proxyMeta = new Map();

  const _elemBinding = new WeakMap();
  const _boundEls = new WeakSet();
  const _focusSnapshot = new WeakMap();
  const _undoPointer = new Map();

  // ─── Suppress Auto-Binding ────────────────────────────────────────────────
  let _suppressBind = false;

  // AbortController for lifecycle event listeners
  let _lifecycleAC = new AbortController();

  // Patched globals — restored by destroy()
  let _origSetToEl = null;
  let _origSetNum = null;
  let _origActivateTab = null;

  // ─── Field Alias ────────────────────────────────────────────────────────────
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

  function _clone(obj) {
    try {
      return structuredClone(obj);
    } catch {
      return JSON.parse(JSON.stringify(obj ?? {}));
    }
  }

  function _pushRing(key, val) {
    let arr = _undoStack.get(key);
    if (!arr) {
      arr = [];
      _undoStack.set(key, arr);
    }

    // Khi có thay đổi mới, xóa các bước redo phía trước của key này
    const ptr = _undoPointer.get(key) ?? arr.length;
    if (ptr < arr.length) {
      arr.splice(ptr);
    }

    if (arr.length >= MAX_UNDO) {
      arr.shift();
    }
    arr.push(val);
    _undoPointer.set(key, arr.length);

    // Xóa redo stack toàn cục khi có thay đổi mới
    _globalRedoStack.length = 0;

    try {
      const [coll, id] = key.split('::');
      if (coll && id) {
        _globalUndoStack.push({ coll, id });
        if (_globalUndoStack.length > MAX_UNDO * 10) _globalUndoStack.shift();
      }
    } catch (err) {
      console.error('[StateProxy] Error tracking global undo:', err);
    }
  }

  function _syncUndoStack(coll, id, el = null) {
    const key = _k(coll, id);
    if (el) {
      const field = el.dataset.field;
      if (!field || field === 'id') return;
      const currentVal = _readCurrentValue(el);
      if (el.dataset.initial !== undefined && !_undoStack.get(key)?.length) {
        if (String(el.dataset.initial)) {
          _pushRing(key, { field, oldVal: el.dataset.initial, newVal: currentVal });
          _focusSnapshot.set(el, currentVal);
        }
      }
      return;
    }
    // Sync all bound elements for this doc
    const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field]`);
    for (const el of els) {
      if (!_isBindableEl(el)) continue;
      const binding = _elemBinding.get(el);
      const field = binding?.field ?? _resolveField(coll, el.dataset.field);
      if (!field || field === 'id') continue;
      const currentVal = _readCurrentValue(el);
      const snap = _focusSnapshot.get(el);
      if (snap !== undefined && String(snap) !== String(currentVal)) {
        _pushRing(key, { field, oldVal: snap, newVal: currentVal });
        _focusSnapshot.set(el, currentVal);
      }
    }
  }

  // ─── Proxy Handlers ────────────────────────────────────────────────────────
  function _makeCollHandler(coll) {
    return {
      set(target, id, val) {
        const prevDoc = typeof id === 'string' && _session.has(_k(coll, id)) ? _clone(target[id]) : undefined;
        target[id] = val;
        if (prevDoc !== undefined) _onUpdate(coll, val, prevDoc);
        return true;
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
    _proxyMeta.set(coll, { coll, createdAt: Date.now(), uninstalledAt: null });
    window.APP_DATA[coll] = proxy;
  }

  function _uninstallProxy(coll) {
    const entry = _proxyCache.get(coll);
    if (entry && window.APP_DATA) window.APP_DATA[coll] = entry.target;
    const meta = _proxyMeta.get(coll);
    if (meta) meta.uninstalledAt = Date.now();
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

  // ─── Pending History ───────────────────────────────────────────────────────────
  function _recordPending(coll, id, oldDoc, newDoc) {
    if (!HISTORY_COLLS.has(coll)) return;
    if (id?.startsWith?.(VIRTUAL_PREFIX)) return;
    const bookingId = coll === 'bookings' ? id : (newDoc?.booking_id ?? oldDoc?.booking_id);
    if (!bookingId) return;

    const ts = Date.now();
    const userId = window.CURRENT_USER?.uid ?? 'anon';
    const userName = window.CURRENT_USER?.name ?? 'unknown';
    const action = !oldDoc ? 'create' : !newDoc ? 'delete' : 'update';
    const entries = [];

    if (action === 'update') {
      for (const f of Object.keys(newDoc)) {
        if (f === 'id') continue;
        const ov = oldDoc?.[f],
          nv = newDoc[f];
        if (JSON.stringify(ov) !== JSON.stringify(nv)) entries.push({ ts, userId, userName, bookingId, coll, docId: id, field: f, oldVal: ov, newVal: nv, action });
      }
    } else {
      entries.push({ ts, userId, userName, bookingId, coll, docId: id, action });
    }

    if (!entries.length) return;
    const buf = _pendingHist.get(bookingId) ?? [];
    buf.push(...entries);
    _pendingHist.set(bookingId, buf);
  }

  function _flushHistory(ids) {
    const idList = ids instanceof Set || Array.isArray(ids) ? [...ids] : [ids];
    if (!idList.length) return;

    const db = window.A?.DB?.db ?? window.firebase?.firestore?.();
    const batch = db ? db.batch() : null;
    let hasBatchOps = false;

    idList.forEach((bookingId) => {
      const pending = _pendingHist.get(bookingId);
      if (!pending?.length) return;

      // 1. Update LocalStorage
      try {
        const lsKey = HIST_LS_PREFIX + bookingId;
        const prev = JSON.parse(localStorage.getItem(lsKey) ?? '[]');
        const merged = prev.concat(pending);
        if (merged.length > MAX_HIST_LS) merged.splice(0, merged.length - MAX_HIST_LS);
        localStorage.setItem(lsKey, JSON.stringify(merged));
      } catch (e) {
        console.warn('[StateProxy] LS history error:', e);
      }

      // 2. Add to Firestore Batch
      if (batch) {
        try {
          const docRef = db.collection('bookings').doc(bookingId);
          batch.update(docRef, {
            [HIST_FS_FIELD]: firebase.firestore.FieldValue.arrayUnion(...pending.slice(-MAX_HIST_FLUSH)),
          });
          hasBatchOps = true;
        } catch (e) {
          console.warn('[StateProxy] batch add error:', e);
        }
      }

      _pendingHist.delete(bookingId);
    });

    if (hasBatchOps && batch) {
      batch.commit().catch((e) => console.error('[StateProxy] history batch commit failed:', e));
    }
  }

  // ─── Core Mutation Handlers ─────────────────────────────────────────────────────
  function _onUpdate(coll, dataObj, prevDoc) {
    const { id } = dataObj ?? {};
    if (!id) return;
    const oldDoc = prevDoc ?? _clone(window.APP_DATA?.[coll]?.[id] ?? {});
    const changed = Object.keys(dataObj).filter((f) => f !== 'id' && JSON.stringify(oldDoc[f]) !== JSON.stringify(dataObj[f]));

    if (changed.length) {
      _markDirty(coll, id, changed);
    }
  }

  function _onRemove(coll, id) {
    const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
    const doc = raw?.[id];
    if (doc) {
      _pushRing(_k(coll, id), { field: '__doc__', oldVal: _clone(doc), newVal: null });
      _recordPending(coll, id, doc, null);
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
    const stack = _undoStack.get(oldKey);
    if (stack) {
      _undoStack.delete(oldKey);
      _undoStack.set(newKey, stack);
    }
    const ptr = _undoPointer.get(oldKey);
    if (ptr != null) {
      _undoPointer.delete(oldKey);
      _undoPointer.set(newKey, ptr);
    }
    const dirtySet = _dirty.get(oldKey);
    if (dirtySet) {
      _dirty.delete(oldKey);
      _dirty.set(newKey, dirtySet);
    }

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
      if (idEl) id = (typeof getVal === 'function' ? getVal(idEl) : idEl.value) || null;
    }
    if (!id && el.parentElement) {
      const siblingId = el.parentElement.querySelector(`:scope > ${idSelector}`);
      if (siblingId && siblingId !== el) id = (typeof getVal === 'function' ? getVal(siblingId) : siblingId.value) || null;
    }
    if (!id) {
      const itemAnchor = el.closest('[data-item]');
      if (itemAnchor && container.contains(itemAnchor)) id = itemAnchor.dataset.item || null;
    }
    if (!id) id = container.dataset.item ?? null;
    if (!id) {
      const idEl = container.querySelector(idSelector);
      if (idEl) id = (typeof getVal === 'function' ? getVal(idEl) : idEl.value) || null;
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

  function _readCurrentValue(el) {
    if (typeof getVal === 'function') return getVal(el);
    const cl = el.classList;
    if (cl.contains('number') || cl.contains('number-only') || el.type === 'number') {
      const raw = String(el.value || '').replace(/[^0-9.-]/g, '');
      return raw === '' ? 0 : Number(raw);
    }
    if (el.type === 'checkbox') return el.checked;
    if (el.tagName === 'SELECT' && el.multiple) return Array.from(el.selectedOptions).map((o) => o.value);
    return el.value;
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
    if (field === 'id') return;

    const wasBound = _elemBinding.has(el);
    if (wasBound) {
      const cleanVal = typeof value === 'number' ? value : !isNaN(Number(value)) ? Number(value) : value;
      const coll_data = window.APP_DATA?.[ctx.coll];
      if (coll_data?.[ctx.id] !== undefined) {
        const current = coll_data[ctx.id]?.[field];
        if (current != cleanVal) {
          const oldSnap = _focusSnapshot.get(el);
          if (oldSnap !== undefined && String(oldSnap) !== String(cleanVal)) {
            _pushRing(_k(ctx.coll, ctx.id), { field, oldVal: oldSnap, newVal: cleanVal });
            _focusSnapshot.set(el, cleanVal);
          }
          coll_data[ctx.id] = { ...coll_data[ctx.id], [field]: cleanVal };
        }
      }
    } else {
      if (el.dataset.initial !== undefined) {
        const initialVal = el.dataset.initial;
        const currentVal = _readCurrentValue(el);
        if (String(initialVal) && !_undoStack.get(_k(ctx.coll, ctx.id))?.length) {
          _pushRing(_k(ctx.coll, ctx.id), { field, oldVal: initialVal, newVal: currentVal });
          _focusSnapshot.set(el, currentVal);
        }
      }
    }
    _ensureTracked(ctx.coll, ctx.id);
    api.bindElement(el, ctx.coll, ctx.id, field);
  }

  function _ensureTracked(coll, id) {
    if (!coll || !id) return;
    const key = _k(coll, id);
    if (_session.has(key)) return;
    const doc = window.APP_DATA?.[coll]?.[id] ?? { id };
    _baseline.set(key, _clone(doc));
    _session.set(key, { coll, id });
    if (!_proxyCache.has(coll)) _installProxy(coll);
  }

  // ─── DOM Event Handlers ────────────────────────────────────────────────────────
  function _onFocusCapture(e) {
    const el = e.currentTarget ?? e.target;
    if (_elemBinding.has(el)) _focusSnapshot.set(el, _readCurrentValue(el));
  }

  function _onChangeEvent(e) {
    const el = e.currentTarget ?? e.target;
    const binding = _elemBinding.get(el);
    if (!binding) return;
    const { coll, id, field } = binding;
    const key = _k(coll, id);

    const oldVal = _focusSnapshot.get(el);
    const newVal = _readCurrentValue(el);

    if (oldVal !== undefined && String(oldVal) !== String(newVal)) {
      _pushRing(key, { field, oldVal, newVal });
    }
    _focusSnapshot.set(el, newVal);

    const coll_data = window.APP_DATA?.[coll];
    if (coll_data?.[id] !== undefined) {
      coll_data[id] = { ...coll_data[id], [field]: newVal };
    }
  }

  function _onDelegatedFocusIn(e) {
    const el = e.target;
    if (_elemBinding.has(el) || !_isBindableEl(el)) return;
    const htmlField = el.dataset?.field;
    if (!htmlField) return;
    const ctx = _resolveCollId(el);
    if (!ctx) return;
    const field = _resolveField(ctx.coll, htmlField);
    if (field === 'id') return;

    let proxyOldVal;
    if (e.type === 'change') {
      proxyOldVal = window.APP_DATA?.[ctx.coll]?.[ctx.id]?.[field];
      if (proxyOldVal === undefined) proxyOldVal = el.defaultValue ?? '';
    }

    _ensureTracked(ctx.coll, ctx.id);
    api.bindElement(el, ctx.coll, ctx.id, field);

    if (e.type === 'change') {
      const val = _readCurrentValue(el);
      if (proxyOldVal !== undefined && String(proxyOldVal) !== String(val)) {
        _pushRing(_k(ctx.coll, ctx.id), { field, oldVal: proxyOldVal, newVal: val });
      }
      const coll_data = window.APP_DATA?.[ctx.coll];
      if (coll_data?.[ctx.id] !== undefined) {
        coll_data[ctx.id] = { ...coll_data[ctx.id], [field]: val };
      }
      _focusSnapshot.set(el, val);
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
        _focusSnapshot.set(el, proxyVal !== undefined ? proxyVal : _readCurrentValue(el));
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

    commitSession() {
      const bookingIds = new Set();
      _session.forEach(({ coll, id }) => {
        const key = _k(coll, id);
        const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
        const currentDoc = raw?.[id];
        const baseDoc = _baseline.get(key);

        if (currentDoc && baseDoc) {
          _recordPending(coll, id, baseDoc, currentDoc);
          _baseline.set(key, _clone(currentDoc));
        }

        _undoStack.delete(key);
        _undoPointer.delete(key);
        _clearDirty(coll, id);

        if (id?.startsWith?.(VIRTUAL_PREFIX)) return;
        if (coll === 'bookings') bookingIds.add(id);
        else if (currentDoc?.booking_id) bookingIds.add(currentDoc.booking_id);
      });

      _globalUndoStack.length = 0;
      _globalRedoStack.length = 0;
      _flushHistory(bookingIds);
    },

    rollbackSession() {
      _session.forEach(({ coll, id }) => {
        const key = _k(coll, id);
        const snap = _baseline.get(key);
        if (!snap) return;
        const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
        if (raw) raw[id] = _clone(snap);
        _clearDirty(coll, id);
        _undoStack.delete(key);
        _undoPointer.delete(key);

        Object.keys(snap).forEach((f) => {
          const htmlF = _htmlFieldOf(coll, f);
          const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`);
          els.forEach((el) => setVal(el, snap[f]));
        });
      });
      _globalUndoStack.length = 0;
      _globalRedoStack.length = 0;
      _pendingHist.clear();
    },

    clearSession() {
      _session.forEach(({ coll, id }) => _clearDirty(coll, id));
      document.querySelectorAll('[data-initial]').forEach((el) => delete el.dataset.initial);
      _virtualIds.forEach((vid) => {
        document.querySelectorAll(`[data-virtual-doc-id="${vid}"]`).forEach((el) => delete el.dataset.virtualDocId);
        document.querySelectorAll(`[data-item="${vid}"]`).forEach((el) => delete el.dataset.item);
      });
      _virtualIds.clear();
      _session.clear();
      _baseline.clear();
      _undoStack.clear();
      _undoPointer.clear();
      _dirty.clear();
      _pendingHist.clear();
      _globalUndoStack.length = 0;
      _globalRedoStack.length = 0;
    },

    undo(coll, id, htmlField) {
      if (!coll || !id) {
        while (_globalUndoStack.length > 0) {
          const lastAction = _globalUndoStack.pop();
          if (api.canUndo(lastAction.coll, lastAction.id)) {
            const res = api.undo(lastAction.coll, lastAction.id);
            if (res) return res;
          }
        }
        return false;
      }
      _syncUndoStack(coll, id);
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      if (!stack?.length) return false;

      const targetField = htmlField ? _resolveField(coll, htmlField) : null;
      let ptr = _undoPointer.get(key) ?? stack.length;

      let entry;
      if (targetField) {
        for (let i = ptr - 1; i >= 0; i--) {
          if (stack[i].field === targetField) {
            entry = stack[i];
            ptr = i;
            _undoPointer.set(key, ptr);
            break;
          }
        }
      } else {
        if (ptr <= 0) return false;
        ptr--;
        entry = stack[ptr];
        _undoPointer.set(key, ptr);
      }
      if (!entry) return false;

      // Lưu vào redo stack toàn cục
      _globalRedoStack.push({ coll, id });
      if (_globalRedoStack.length > MAX_UNDO * 10) _globalRedoStack.shift();

      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      if (entry.field === '__doc__') {
        if (raw) raw[id] = entry.oldVal;
        _clearDirty(coll, id);
        Object.keys(entry.oldVal).forEach((f) => {
          const htmlF = _htmlFieldOf(coll, f);
          const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`);
          els.forEach((el) => setVal(el, entry.oldVal[f]));
        });
        return { field: '__doc__', oldVal: entry.oldVal };
      }

      const restoreVal = entry.oldVal;
      const htmlF = _htmlFieldOf(coll, entry.field);
      const wasSuppressed = _suppressBind;
      _suppressBind = true;
      try {
        const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`);
        els.forEach((el) => {
          setVal(el, restoreVal);
          _focusSnapshot.set(el, restoreVal);
        });
      } finally {
        _suppressBind = wasSuppressed;
      }

      if (raw?.[id]) raw[id] = { ...raw[id], [entry.field]: restoreVal };

      const baseline = _baseline.get(key);
      const dirtySet = _dirty.get(key);
      if (dirtySet && baseline && JSON.stringify(restoreVal) === JSON.stringify(baseline[entry.field])) {
        dirtySet.delete(entry.field);
        document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`).forEach((el) => el.classList.remove('is-dirty'));
      }
      return { field: entry.field, oldVal: restoreVal };
    },

    redo(coll, id) {
      if (!coll || !id) {
        while (_globalRedoStack.length > 0) {
          const lastAction = _globalRedoStack.pop();
          if (api.canRedo(lastAction.coll, lastAction.id)) {
            const res = api.redo(lastAction.coll, lastAction.id);
            if (res) {
              _globalUndoStack.push({ coll: lastAction.coll, id: lastAction.id });
              return res;
            }
          }
        }
        return false;
      }

      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      if (!stack?.length) return false;

      let ptr = _undoPointer.get(key) ?? stack.length;
      if (ptr >= stack.length) return false;

      const entry = stack[ptr];
      const restoreVal = entry.newVal;
      const htmlF = _htmlFieldOf(coll, entry.field);

      const wasSuppressed = _suppressBind;
      _suppressBind = true;
      try {
        const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
        if (entry.field === '__doc__') {
          if (raw) {
            if (restoreVal === null) delete raw[id];
            else raw[id] = restoreVal;
          }
          if (restoreVal) {
            Object.keys(restoreVal).forEach((f) => {
              const hF = _htmlFieldOf(coll, f);
              const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(hF)}"]`);
              els.forEach((el) => setVal(el, restoreVal[f]));
            });
          }
        } else {
          const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`);
          els.forEach((el) => {
            setVal(el, restoreVal);
            _focusSnapshot.set(el, restoreVal);
          });
          if (raw?.[id]) raw[id] = { ...raw[id], [entry.field]: restoreVal };
        }
      } finally {
        _suppressBind = wasSuppressed;
      }

      _undoPointer.set(key, ptr + 1);
      return { field: entry.field, newVal: restoreVal };
    },

    reset(coll, id) {
      const snap = _baseline.get(_k(coll, id));
      if (!snap) return false;
      const copy = _clone(snap);
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      if (raw) raw[id] = copy;
      _clearDirty(coll, id);
      _undoStack.delete(_k(coll, id));
      _undoPointer.delete(_k(coll, id));
      Object.keys(copy).forEach((f) => {
        const htmlF = _htmlFieldOf(coll, f);
        const els = document.querySelectorAll(`[data-item="${CSS.escape(id)}"] [data-field="${CSS.escape(htmlF)}"]`);
        els.forEach((el) => setVal(el, copy[f]));
      });
      return true;
    },

    getEditHistory(bookingId) {
      try {
        return JSON.parse(localStorage.getItem(HIST_LS_PREFIX + bookingId) ?? '[]');
      } catch {
        return [];
      }
    },
    isDirty: (coll, id) => (_dirty.get(_k(coll, id))?.size ?? 0) > 0,
    canUndo(coll, id) {
      _syncUndoStack(coll, id);
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      const ptr = _undoPointer.get(key) ?? stack?.length ?? 0;
      return !!(stack?.length && ptr > 0);
    },
    canRedo(coll, id) {
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      const ptr = _undoPointer.get(key) ?? stack?.length ?? 0;
      return !!(stack?.length && ptr < stack.length);
    },

    getUndoStack(coll, id) {
      _syncUndoStack(coll, id);
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      if (!stack?.length) return [];
      const ptr = _undoPointer.get(key) ?? stack.length;
      const result = stack.map((entry, idx) => ({ index: idx, field: entry.field, oldVal: entry.oldVal, isUndone: idx >= ptr }));
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      const doc = raw?.[id];
      if (doc) {
        const fields = [...new Set(stack.map((e) => e.field).filter((f) => f !== '__doc__'))];
        for (const field of fields) result.push({ index: stack.length, field, oldVal: doc[field] ?? '', isCurrent: true, isUndone: false });
      }
      return result;
    },

    hookSetters() {
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
          const num = Number(val) || 0;
          if (!isNaN(num) && el) _tryAutoBind(el, val);
        };
      }
      const _patchRenderForm = () => {
        if (window.A?.UI?.renderForm && !window.A?.UI?._spPatched) {
          const orig = window.A.UI.renderForm.bind(window.A.UI);
          window.A.UI.renderForm = async function (collection, formId) {
            api.clearSession();
            return orig(collection, formId);
          };
          window.A.UI_spPatched = true;
        }
      };
      _patchRenderForm();
      setTimeout(_patchRenderForm, 100);
      document.addEventListener('focusin', _onDelegatedFocusIn, { signal: _lifecycleAC.signal, passive: true });
      document.addEventListener('change', _onDelegatedFocusIn, { signal: _lifecycleAC.signal, passive: true });
    },

    showProxyDebug() {
      const fmt = (ts) => (ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour12: false }) : '—');
      const badge = (txt, cls) => `<span class="badge bg-${cls} fw-normal" style="font-size:.75em">${txt}</span>`;
      const totalPending = [..._pendingHist.values()].reduce((n, a) => n + a.length, 0);
      const statsHtml = `<div class="d-flex flex-wrap gap-2 mb-3" style="font-size:.82rem">${badge(_proxyCache.size + ' proxy active', 'primary')} ${badge(_session.size + ' session docs', 'info')} ${badge(totalPending + ' pending hist', 'warning')}</div>`;
      const html = `<div style="font-family:var(--bs-font-monospace,monospace)">${statsHtml}<p class="text-muted mt-2 mb-0" style="font-size:.75rem">Snapshot tại ${new Date().toLocaleString('vi-VN')}</p></div>`;
      if (!window.A?.Modal) return console.warn('[StateProxy] A.Modal not available');
      window.A.Modal.render(html, '🔍 StateProxy — Proxy Debug');
      window.A.Modal.show();
    },

    destroy() {
      api.clearSession();
      [..._proxyCache.keys()].forEach((c) => _uninstallProxy(c));
      _pendingHist.clear();
      _lifecycleAC.abort();
      _lifecycleAC = new AbortController();
      if (_origSetToEl) window.setToEl = _origSetToEl;
      if (_origSetNum) window.setNum = _origSetNum;
      window._stateProxyHooked = false;
    },
  };

  return api;
})();

export default StateProxy;
