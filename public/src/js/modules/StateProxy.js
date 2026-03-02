/**
 * =============================================================================
 * STATE PROXY  v4   Reactive State Management
 * =============================================================================
 *
 * Kiến trúc:
 *   Auto-init Proxy         Proxy được khởi tạo tự động khi setVal / setNum
 *                            được gọi cho element trong container có [data-collection].
 *                            Không cần gọi beginEdit() thủ công.
 *   Context Resolution      collection = data-collection trên <table>, <form>,
 *                            hoặc <fieldset> gần nhất bao quanh element.
 *                            document id = value của [data-field="id"] trong
 *                            cùng <tr> (nếu có), hoặc trong container.
 *   Pending history buffer  Ghi lịch sử vào _pendingHistory trong suốt session.
 *                            Chỉ flush sang localStorage + Firestore khi commit
 *                            thành công. clearSession() hủy toàn bộ pending.
 *   Proxy Lifecycle         Proxy tự động gắn khi _ensureTracked(coll, id).
 *                            Bị gỡ khi clearSession() (đổi tab / load booking mới).
 *
 * Session lifecycle:
 *   _ensureTracked(coll, id)  auto-called on setVal/setNum   (snapshot + proxy)
 *   commitSession()           save OK   (advance baseline, flush history)
 *   rollbackSession()         save fail (revert to baseline)
 *   clearSession()            tab switch / load booking mới (remove proxy, drop tracking)
 *
 * Tích hợp (hookSetters — gọi 1 lần trong app.js):
 *   1. Hooks window.setToEl   → auto-bind + auto-track khi setVal() chạy
 *   2. Hooks window.setNum    → auto-bind + auto-track khi setNum() chạy
 *   3. Hooks window.activateTab → clearSession() khi rời khỏi tab-form
 *   4. Hooks A.UI.renderForm  → clearSession() trước khi render form mới
 *   5. Lắng nghe tabchange / paginationchange CustomEvent → clearSession()
 *
 * HTML Convention:
 *   <table data-collection="operator_entries">
 *     <tbody>
 *       <tr>
 *         <input data-field="id" value="DOC_ID" />       ← id nguồn
 *         <input data-field="service_type" />             ← auto-bound
 *         <input data-field="cost_adult" type="number" /> ← auto-bound
 *       </tr>
 *     </tbody>
 *   </table>
 * =============================================================================
 */
const StateProxy = (() => {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  const MAX_UNDO = 30;
  const MAX_HIST_LS = 100; // max entries per booking in localStorage
  const MAX_HIST_FLUSH = 20; // max entries per flush to Firestore
  const HIST_LS_PREFIX = 'HIST_';
  const HIST_FS_FIELD = 'edit_history';
  const DASH_DEBOUNCE_MS = 300;

  const HISTORY_COLLS = new Set([
    'bookings',
    'booking_details',
    'operator_entries',
    'transactions',
  ]);

  //  Computed Rules
  // key = 'collection::outputField'
  const COMPUTED_RULES = {
    'operator_entries::nights': {
      deps: ['check_in', 'check_out', 'service_type'],
      fn: (d) => {
        if (d.service_type !== 'Phòng' || !d.check_in || !d.check_out) return 1;
        const n = (new Date(d.check_out) - new Date(d.check_in)) / 86_400_000;
        return n > 0 ? n : 1;
      },
    },
    'operator_entries::total_cost': {
      deps: [
        'adults',
        'cost_adult',
        'children',
        'cost_child',
        'surcharge',
        'discount',
        'check_in',
        'check_out',
        'service_type',
      ],
      fn: (d) => {
        const nights = COMPUTED_RULES['operator_entries::nights'].fn(d);
        const mult = d.service_type === 'Phòng' ? Math.max(1, nights) : 1;
        return (
          ((+d.adults || 0) * (+d.cost_adult || 0) +
            (+d.children || 0) * (+d.cost_child || 0) +
            (+d.surcharge || 0) -
            (+d.discount || 0)) *
          mult
        );
      },
    },
    'operator_entries::debt_balance': {
      deps: ['total_cost', 'paid_amount'],
      fn: (d) => (+d.total_cost || 0) - (+d.paid_amount || 0),
    },
    'booking_details::nights': {
      deps: ['check_in', 'check_out', 'service_type'],
      fn: (d) => {
        if (d.service_type !== 'Phòng' || !d.check_in || !d.check_out) return 1;
        const n = (new Date(d.check_out) - new Date(d.check_in)) / 86_400_000;
        return n > 0 ? n : 1;
      },
    },
    'booking_details::total': {
      deps: [
        'quantity',
        'unit_price',
        'child_qty',
        'child_price',
        'surcharge',
        'discount',
        'check_in',
        'check_out',
        'service_type',
      ],
      fn: (d) => {
        const nights = COMPUTED_RULES['booking_details::nights'].fn(d);
        const mult = d.service_type === 'Phòng' ? Math.max(1, nights) : 1;
        return (
          ((+d.quantity || 0) * (+d.unit_price || 0) +
            (+d.child_qty || 0) * (+d.child_price || 0) +
            (+d.surcharge || 0) -
            (+d.discount || 0)) *
          mult
        );
      },
    },
    'transactions::balance': {
      deps: ['amount', 'fee'],
      fn: (d) => (+d.amount || 0) - (+d.fee || 0),
    },
  };

  // Reverse dep index: 'coll::depField' → Set<'coll::outputField'>
  const _depIdx = new Map();
  for (const [ruleKey, { deps }] of Object.entries(COMPUTED_RULES)) {
    const coll = ruleKey.split('::')[0];
    for (const dep of deps) {
      const k = `${coll}::${dep}`;
      if (!_depIdx.has(k)) _depIdx.set(k, new Set());
      _depIdx.get(k).add(ruleKey);
    }
  }

  // ─── Internal Stores ───────────────────────────────────────────────────────
  /** @type {Map<string, object>}   'coll::id' → deep-clone of doc at _ensureTracked */
  const _baseline = new Map();
  /** @type {Map<string, object[]>} 'coll::id' → ring buffer of past states */
  const _undoStack = new Map();
  /** @type {Map<string, Set<string>>} 'coll::id' → dirty field names */
  const _dirty = new Map();
  /** @type {Map<string, {coll:string, id:string}>}  active session docs */
  const _session = new Map();
  /** @type {Map<string, object[]>} bookingId → pending history (not yet committed) */
  const _pendingHist = new Map();
  /** @type {Map<string, {proxy:object, target:object}>} coll → installed proxy */
  const _proxyCache = new Map();
  /** @type {Map<string, {coll:string, createdAt:number, uninstalledAt:number|null}>} */
  const _proxyMeta = new Map();
  /** @type {Map<string, Set<Function>>} pub/sub handlers */
  const _subs = new Map();

  // WeakMap/WeakSet for DOM binding — auto-GC when elements removed from DOM
  /** @type {WeakMap<Element, {coll:string, id:string, field:string}>} */
  const _elemBinding = new WeakMap();
  /** @type {WeakSet<Element>} guard against double event attachment */
  const _boundEls = new WeakSet();

  let _batching = false;
  let _batchQ = [];
  let _dashTimer = null;
  let _hooksInstalled = false;

  // AbortController for lifecycle event listeners
  let _lifecycleAC = new AbortController();

  // Patched globals — restored by destroy()
  let _origSetToEl = null;
  let _origSetNum = null;
  let _origActivateTab = null;

  //  Private Helpers
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
    if (arr.length >= MAX_UNDO) arr.shift();
    arr.push(val);
  }

  // ─── Proxy Install / Uninstall ───────────────────────────────────────────────────
  // Build Proxy handler for a given collection
  function _makeCollHandler(coll) {
    return {
      set(target, id, val) {
        const prevDoc =
          typeof id === 'string' && _session.has(_k(coll, id))
            ? _clone(target[id]) // 1a. snapshot OLD state BEFORE write
            : undefined;
        target[id] = val; // 1b. write through to raw object
        if (prevDoc !== undefined) _onUpdate(coll, val, prevDoc); // 2. track only session docs, pass old state
        return true;
      },
      deleteProperty(target, id) {
        if (typeof id === 'string' && _session.has(_k(coll, id))) _onRemove(coll, id);
        return delete target[id];
      },
    };
  }

  /** Install a Proxy on APP_DATA[coll] if not already installed */
  function _installProxy(coll) {
    if (_proxyCache.has(coll)) return;
    const raw = window.APP_DATA?.[coll];
    if (!raw || typeof raw !== 'object') return;
    const proxy = new Proxy(raw, _makeCollHandler(coll));
    _proxyCache.set(coll, { proxy, target: raw });
    _proxyMeta.set(coll, { coll, createdAt: Date.now(), uninstalledAt: null });
    window.APP_DATA[coll] = proxy;
  }

  /** Remove Proxy from APP_DATA[coll], restore raw object */
  function _uninstallProxy(coll) {
    const entry = _proxyCache.get(coll);
    if (entry && window.APP_DATA) window.APP_DATA[coll] = entry.target;
    const meta = _proxyMeta.get(coll);
    if (meta) meta.uninstalledAt = Date.now();
    _proxyCache.delete(coll);
  }

  // ─── DOM Sync (RAF-batched) ──────────────────────────────────────────────────
  let _rafPending = false;
  const _rafQueue = []; // { coll, id, doc, fields }

  function _scheduleSync(coll, id, doc, fields) {
    _rafQueue.push({ coll, id, doc, fields });
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(_flushRaf);
  }

  function _flushRaf() {
    _rafPending = false;
    const items = _rafQueue.splice(0);
    for (const { coll, id, doc, fields } of items) {
      if (!fields?.length) continue;
      for (const field of fields) {
        const val = doc?.[field] ?? '';
        // data-field + data-doc-id (form inputs)
        document
          .querySelectorAll(`[data-field="${field}"][data-doc-id="${id}"]`)
          .forEach((el) => _writeEl(el, val));
        // grid row cell
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) {
          const cell = row.querySelector(`[data-field="${field}"]`);
          if (cell) _writeEl(cell, val);
        }
      }
      if (coll === 'bookings') {
        clearTimeout(_dashTimer);
        _dashTimer = setTimeout(() => {
          if (typeof renderDashboard === 'function') renderDashboard();
        }, DASH_DEBOUNCE_MS);
      }
    }
  }

  function _writeEl(el, val) {
    if (!el || document.activeElement === el) return;
    if (typeof setVal === 'function') {
      setVal(el, val);
      return;
    }
    if ('value' in el) el.value = val;
    else el.textContent = val;
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
      document
        .querySelectorAll(`[data-field="${f}"][data-doc-id="${id}"]`)
        .forEach((el) => el.classList.add('is-dirty'));
    }
    document
      .querySelectorAll(`[data-bind-dirty="${key}"]`)
      .forEach((el) => (el.style.display = 'inline-flex'));
  }

  function _clearDirty(coll, id) {
    const key = _k(coll, id);
    const s = _dirty.get(key);
    if (s) {
      for (const f of s) {
        document
          .querySelectorAll(`[data-field="${f}"][data-doc-id="${id}"]`)
          .forEach((el) => el.classList.remove('is-dirty'));
      }
    }
    _dirty.delete(key);
    document
      .querySelectorAll(`[data-bind-dirty="${key}"]`)
      .forEach((el) => (el.style.display = 'none'));
  }

  // ─── Pending History ───────────────────────────────────────────────────────────
  function _recordPending(coll, id, oldDoc, newDoc) {
    if (!HISTORY_COLLS.has(coll)) return;
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
        if (JSON.stringify(ov) !== JSON.stringify(nv))
          entries.push({
            ts,
            userId,
            userName,
            bookingId,
            coll,
            docId: id,
            field: f,
            oldVal: ov,
            newVal: nv,
            action,
          });
      }
    } else {
      entries.push({ ts, userId, userName, bookingId, coll, docId: id, action });
    }

    if (!entries.length) return;
    const buf = _pendingHist.get(bookingId) ?? [];
    buf.push(...entries);
    _pendingHist.set(bookingId, buf);
  }

  /** Flush pending history to localStorage + Firestore. Called ONLY on commitSession(). */
  function _flushHistory(bookingId) {
    const pending = _pendingHist.get(bookingId);
    if (!pending?.length) return;

    // Append to localStorage (never delete existing entries)
    try {
      const lsKey = HIST_LS_PREFIX + bookingId;
      const prev = JSON.parse(localStorage.getItem(lsKey) ?? '[]');
      const merged = prev.concat(pending);
      if (merged.length > MAX_HIST_LS) merged.splice(0, merged.length - MAX_HIST_LS);
      localStorage.setItem(lsKey, JSON.stringify(merged));
    } catch {
      /* storage quota  non-critical */
    }

    // Append to Firestore (arrayUnion, never overwrite)
    try {
      const db = window.A?.DB?.raw?.db ?? window.firebase?.firestore?.();
      if (db) {
        db.collection('bookings')
          .doc(bookingId)
          .update({
            [HIST_FS_FIELD]: firebase.firestore.FieldValue.arrayUnion(
              ...pending.slice(-MAX_HIST_FLUSH)
            ),
          })
          .catch((e) => console.warn('[StateProxy] history flush:', e));
      }
    } catch {
      /* non-critical */
    }

    _pendingHist.delete(bookingId);
  }

  // ─── Computed Fields ───────────────────────────────────────────────────────────
  function _runComputeds(coll, id, changedFields) {
    const triggered = new Set();
    for (const f of changedFields) {
      const targets = _depIdx.get(`${coll}::${f}`);
      if (!targets) continue;
      for (const ruleKey of targets) triggered.add(ruleKey);
    }
    if (!triggered.size) return;

    const doc = window.APP_DATA?.[coll]?.[id];
    if (!doc) return;

    for (const ruleKey of triggered) {
      const { fn } = COMPUTED_RULES[ruleKey];
      const outField = ruleKey.split('::')[1];
      const newVal = fn(doc);
      if (doc[outField] === newVal) continue;
      // Write directly to raw target to avoid re-triggering proxy set
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA[coll];
      raw[id] = { ...raw[id], [outField]: newVal };
      _emit(coll, id, raw[id], [outField], 'computed');
    }
  }

  // ─── Pub/Sub ──────────────────────────────────────────────────────────────────
  function _emit(coll, id, doc, changedFields, eventType) {
    if (_batching) {
      _batchQ.push({ collection: coll, id, doc, changedFields, eventType });
      return;
    }
    _dispatch({ collection: coll, id, doc, changedFields, eventType });
  }

  function _dispatch(detail) {
    const { collection: coll, id, doc, changedFields } = detail;

    // Notify subscribers
    for (const p of ['*', coll, `${coll}::${id}`]) {
      _subs.get(p)?.forEach((fn) => {
        try {
          fn(detail);
        } catch (e) {
          console.warn('[StateProxy sub]', e);
        }
      });
    }
    if (changedFields) {
      for (const f of changedFields) {
        _subs.get(`${coll}::${id}::${f}`)?.forEach((fn) => {
          try {
            fn(detail);
          } catch {}
        });
      }
    }

    // DOM CustomEvent (async, non-blocking)
    requestAnimationFrame(() =>
      document.dispatchEvent(new CustomEvent('statechange', { detail, bubbles: false }))
    );

    _scheduleSync(coll, id, doc, changedFields);
  }

  // ─── Core Mutation Handlers ─────────────────────────────────────────────────────
  function _onUpdate(coll, dataObj, prevDoc) {
    const { id } = dataObj ?? {};
    if (!id) return;
    const key = _k(coll, id);
    // Use prevDoc captured by the proxy BEFORE the write (avoids reading overwritten target)
    const oldDoc = prevDoc ?? _clone(window.APP_DATA?.[coll]?.[id] ?? {});

    const changed = Object.keys(dataObj).filter(
      (f) => f !== 'id' && JSON.stringify(oldDoc[f]) !== JSON.stringify(dataObj[f])
    );

    if (changed.length) {
      _pushRing(key, oldDoc);
      _markDirty(coll, id, changed);
      _recordPending(coll, id, oldDoc, { ...oldDoc, ...dataObj });
      _runComputeds(coll, id, changed);
    }

    const current = window.APP_DATA?.[coll]?.[id];
    _emit(coll, id, current, changed.length ? changed : undefined, 'update');
  }

  function _onRemove(coll, id) {
    const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
    const doc = raw?.[id];
    if (doc) {
      _pushRing(_k(coll, id), _clone(doc));
      _recordPending(coll, id, doc, null);
    }
    _session.delete(_k(coll, id));
    _baseline.delete(_k(coll, id));
    _dirty.delete(_k(coll, id));
    _emit(coll, id, null, null, 'delete');
  }

  // ─── Context Resolution ────────────────────────────────────────────────────
  /**
   * Resolve { coll, id } from a DOM element.
   *
   * Container MUST be <table>, <form>, or <fieldset> carrying [data-collection].
   * Any other ancestor tag is ignored.
   *
   * Doc ID resolution order:
   *   1. Same <tr> as element → [data-field="id"] value  (table-row case)
   *   2. container.dataset.docId                          (explicit override)
   *   3. First [data-field="id"] anywhere inside container (form/fieldset case)
   *
   * Returns null when either coll or id is not determinable.
   * @param {Element} el
   * @returns {{ coll: string, id: string } | null}
   */
  function _resolveCollId(el) {
    if (!el || el.nodeType !== 1) return null;
    const container = el.closest(
      'table[data-collection], form[data-collection], fieldset[data-collection]'
    );
    if (!container) return null;
    const coll = container.dataset.collection;
    if (!coll) return null;

    let id = null;
    // 1. Table row: same <tr>
    const tr = el.closest('tr');
    if (tr && container.contains(tr)) {
      const idEl = tr.querySelector('[data-field="id"]');
      if (idEl) id = (typeof getVal === 'function' ? getVal(idEl) : idEl.value) || null;
    }
    // 2. Explicit container override
    if (!id) id = container.dataset.docId ?? null;
    // 3. Fallback: first [data-field="id"] in container
    if (!id) {
      const idEl = container.querySelector('[data-field="id"]');
      if (idEl) id = (typeof getVal === 'function' ? getVal(idEl) : idEl.value) || null;
    }
    return coll && id ? { coll, id } : null;
  }

  /**
   * Return true only for user-editable, focusable form controls.
   * Excludes readonly, disabled, and hidden elements.
   * @param {Element} el
   * @returns {boolean}
   */
  function _isBindableEl(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled || el.type === 'hidden') return false;
    return true;
  }

  /**
   * Auto-bind gate — called from hooked setToEl / setNum after every write.
   * Resolves DOM context → auto-tracks doc (idempotent) → binds element.
   * Skipped when:
   *   • element is non-editable (readonly / disabled / hidden / non-input)
   *   • value is falsy / empty  (element not yet populated)
   *   • element has no [data-field] or field === 'id'
   *   • no valid <table|form|fieldset>[data-collection] + id found in DOM
   * @param {Element} el
   * @param {*} value
   */
  function _tryAutoBind(el, value) {
    if (!_isBindableEl(el)) return;
    if (value === '' || value === null || value === undefined) return;
    const field = el.dataset.field;
    if (!field || field === 'id') return; // id field is the key, not tracked payload
    const ctx = _resolveCollId(el);
    if (!ctx) return;
    _ensureTracked(ctx.coll, ctx.id); // idempotent
    api.bindElement(el, ctx.coll, ctx.id, field);
  }

  /**
   * Ensure a doc is registered for tracking. Idempotent.
   * Steps: add to _session → snapshot baseline → install collection Proxy
   *        → prime missing computed fields (bypasses proxy to avoid noise).
   * @param {string} coll
   * @param {string} id
   */
  function _ensureTracked(coll, id) {
    if (!coll || !id) return;
    const key = _k(coll, id);
    if (_session.has(key)) return; // already tracked

    const doc = window.APP_DATA?.[coll]?.[id] ?? { id };
    _baseline.set(key, _clone(doc));
    _session.set(key, { coll, id });
    _installProxy(coll);

    // Prime missing computed fields directly on raw (bypass proxy to avoid noise)
    const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
    if (raw?.[id]) {
      let primed = { ...raw[id] };
      let changed = false;
      for (const [ruleKey, { fn }] of Object.entries(COMPUTED_RULES)) {
        const [rc, outField] = ruleKey.split('::');
        if (rc !== coll) continue;
        if (primed[outField] !== undefined && primed[outField] !== null) continue;
        primed[outField] = fn(primed);
        changed = true;
      }
      if (changed) raw[id] = primed;
    }
  }

  // ─── DOM Input Handler ───────────────────────────────────────────────────────────
  function _onInputEvent(e) {
    const binding = _elemBinding.get(e.currentTarget);
    if (!binding) return;
    const { coll, id, field } = binding;
    const val = e.currentTarget.value;
    // Mutate through the proxy so tracking fires automatically
    const coll_data = window.APP_DATA?.[coll];
    if (coll_data?.[id] !== undefined) {
      coll_data[id] = { ...coll_data[id], [field]: val };
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────────
  const api = {
    /**
     * Bind a form input element to a document field.
     * WeakMap — no cleanup needed when element is removed from DOM.
     * @param {Element} el
     * @param {string}  coll
     * @param {string}  id
     * @param {string}  field
     */
    bindElement(el, coll, id, field) {
      if (!el || !coll || !id || !field) return;
      _elemBinding.set(el, { coll, id, field });
      if (!_boundEls.has(el)) {
        _boundEls.add(el);
        el.addEventListener('input', _onInputEvent, { passive: true });
        el.addEventListener('change', _onInputEvent, { passive: true });
      }
    },

    /**
     * Manually register a document for tracking.
     * Usually not needed — hookSetters() handles this automatically via setVal/setNum.
     * Still available for explicit use or when rendering without setVal.
     * @param {string} coll
     * @param {string} id
     */
    beginEdit(coll, id) {
      _ensureTracked(coll, id);
    },

    /**
     * Save completed successfully.
     * Advances baselines, clears undo/dirty, flushes pending history to Firestore.
     */
    commitSession() {
      const bookingIds = new Set();
      _session.forEach(({ coll, id }) => {
        const key = _k(coll, id);
        const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
        if (raw?.[id]) _baseline.set(key, _clone(raw[id]));
        _undoStack.delete(key);
        _clearDirty(coll, id);
        if (coll === 'bookings') bookingIds.add(id);
        else {
          const doc = raw?.[id];
          if (doc?.booking_id) bookingIds.add(doc.booking_id);
        }
      });
      bookingIds.forEach((bkId) => _flushHistory(bkId));
    },

    /**
     * Save failed. Revert all docs to their _ensureTracked snapshots.
     * Discards pending history (save never succeeded).
     */
    rollbackSession() {
      _session.forEach(({ coll, id }) => {
        const key = _k(coll, id);
        const snap = _baseline.get(key);
        if (!snap) return;
        const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
        if (raw) raw[id] = _clone(snap); // bypass proxy
        _clearDirty(coll, id);
        _undoStack.delete(key);
        _emit(coll, id, snap, Object.keys(snap), 'rollback');
      });
      _pendingHist.clear();
      if (typeof log === 'function') log('[StateProxy] Session rolled back', 'warning');
    },

    /**
     * Discard all tracking and remove all installed proxies.
     * No Firestore write. Call on: tab change, load new booking, app reload.
     */
    clearSession() {
      clearTimeout(_dashTimer);
      _session.forEach(({ coll, id }) => _clearDirty(coll, id));

      // Determine which collections had all session docs removed
      const activeColl = new Set();
      _session.forEach(({ coll }) => activeColl.add(coll));

      _session.clear();
      _baseline.clear();
      _undoStack.clear();
      _dirty.clear();
      _pendingHist.clear();
      _batchQ = [];

      // Uninstall proxies
      activeColl.forEach((c) => _uninstallProxy(c));
    },

    /**
     * Step-undo one change for a specific document.
     * @param {string} coll
     * @param {string} id
     * @returns {boolean}
     */
    undo(coll, id) {
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      if (!stack?.length) return false;
      const prev = stack.pop();
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      if (raw) raw[id] = prev; // bypass proxy
      _clearDirty(coll, id);
      _emit(coll, id, prev, Object.keys(prev), 'undo');
      return true;
    },

    /**
     * Full reset to the _ensureTracked snapshot.
     * @param {string} coll
     * @param {string} id
     * @returns {boolean}
     */
    reset(coll, id) {
      const snap = _baseline.get(_k(coll, id));
      if (!snap) return false;
      const copy = _clone(snap);
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      if (raw) raw[id] = copy; // bypass proxy
      _clearDirty(coll, id);
      _undoStack.delete(_k(coll, id));
      _emit(coll, id, copy, Object.keys(copy), 'reset');
      return true;
    },

    /**
     * Suppress events inside fn(), emit once per unique doc on exit.
     * Use for loadBookingToUI() render phase to prevent event storms.
     * @param {Function} fn
     */
    batch(fn) {
      _batching = true;
      _batchQ = [];
      try {
        fn();
      } finally {
        _batching = false;
        const seen = new Map();
        for (const d of _batchQ) seen.set(`${d.collection}::${d.id}`, d);
        seen.forEach((d) => _dispatch(d));
        _batchQ = [];
      }
    },

    /**
     * Subscribe to state changes.
     * @param {string}   pattern  '*' | collName | 'coll::id' | 'coll::id::field'
     * @param {Function} handler
     * @returns {Function} unsubscribe
     */
    on(pattern, handler) {
      if (!_subs.has(pattern)) _subs.set(pattern, new Set());
      _subs.get(pattern).add(handler);
      return () => _subs.get(pattern)?.delete(handler);
    },

    /** Read edit history for a booking from localStorage. @returns {object[]} */
    getEditHistory(bookingId) {
      try {
        return JSON.parse(localStorage.getItem(HIST_LS_PREFIX + bookingId) ?? '[]');
      } catch {
        return [];
      }
    },

    /** @returns {boolean} */
    isDirty: (coll, id) => (_dirty.get(_k(coll, id))?.size ?? 0) > 0,

    /** @returns {Set<string>} */
    getDirtyFields: (coll, id) => new Set(_dirty.get(_k(coll, id))),

    /** @returns {boolean} */
    isSessionDirty() {
      for (const { coll, id } of _session.values()) if (api.isDirty(coll, id)) return true;
      return false;
    },

    /** @returns {number} number of docs currently tracked */
    get sessionSize() {
      return _session.size;
    },

    /** Read-only view of computed rules */
    get computedRules() {
      return Object.freeze({ ...COMPUTED_RULES });
    },

    /**
     * Install all auto-tracking hooks. Call once in app.js before any form renders.
     *
     * Hooks installed:
     *   1. window.setToEl     → _tryAutoBind (auto-track + bind on every setVal call)
     *   2. window.setNum      → _tryAutoBind (auto-track + bind on every setNum call)
     *   3. window.activateTab → clearSession() when navigating AWAY from tab-form
     *   4. A.UI.renderForm    → clearSession() before rendering a new admin form
     *   5. tabchange event    → clearSession() unless tabId === 'tab-form' (navigating away only)
     *   6. paginationchange   → clearSession()
     *
     * Idempotent — safe to call multiple times; hooks installed exactly once.
     * All patches are fully restored by destroy().
     *
     * @example
     * // app.js — once, before any form renders
     * StateProxy.hookSetters();
     */
    hookSetters() {
      if (window._stateProxyHooked) return;
      window._stateProxyHooked = true;

      // ── 1. Hook setToEl ────────────────────────────────────────────────────
      // Low-level writer called by all setVal() paths (text, date, select, …).
      if (typeof window.setToEl === 'function' && !_origSetToEl) {
        _origSetToEl = window.setToEl;
        window.setToEl = function (el, value) {
          const result = _origSetToEl.call(this, el, value);
          if (result !== false) _tryAutoBind(el, value);
          return result;
        };
      }

      // ── 2. Hook setNum ─────────────────────────────────────────────────────
      // Called directly for numeric inputs, bypasses setToEl.
      // Skip zero — it is the default / empty sentinel for numbers.
      if (typeof window.setNum === 'function' && !_origSetNum) {
        _origSetNum = window.setNum;
        window.setNum = function (idOrEl, val) {
          _origSetNum.call(this, idOrEl, val);
          const num = Number(val);
          if (!isNaN(num) && num !== 0) {
            const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
            if (el) _tryAutoBind(el, val);
          }
        };
      }

      // ── 3. Hook activateTab ────────────────────────────────────────────────
      // clearSession when navigating AWAY from tab-form.
      // Navigating TO tab-form starts a fresh session (proxy installed lazily).
      if (typeof window.activateTab === 'function' && !_origActivateTab) {
        _origActivateTab = window.activateTab;
        window.activateTab = function (tabId) {
          if (tabId !== 'tab-form') api.clearSession();
          return _origActivateTab.call(this, tabId);
        };
      }

      // ── 4. Hook A.UI.renderForm ────────────────────────────────────────────
      // clearSession before rendering a new admin form into a modal.
      // Deferred so A.UI is guaranteed to exist when first renderForm() is called.
      const _patchRenderForm = () => {
        if (window.A?.UI?.renderForm && !window.A.UI._spPatched) {
          const orig = window.A.UI.renderForm.bind(window.A.UI);
          window.A.UI.renderForm = async function (collection, formId) {
            api.clearSession();
            return orig(collection, formId);
          };
          window.A.UI._spPatched = true;
        }
      };
      _patchRenderForm();
      setTimeout(_patchRenderForm, 0); // retry after current task (A.UI may not exist yet)

      // ── 5 & 6. DOM lifecycle events ────────────────────────────────────────
      if (!_hooksInstalled) {
        _hooksInstalled = true;
        const { signal } = _lifecycleAC;
        // tabchange fires from toggleContextUI() after every Bootstrap tab switch.
        // Guard: do NOT clear session when navigating TO tab-form (form stays active).
        document.addEventListener('tabchange', (e) => {
          if (e.detail?.tabId !== 'tab-form') api.clearSession();
        }, { signal });
        // paginationchange fires when grid page changes (different document context)
        document.addEventListener('paginationchange', () => api.clearSession(), { signal });
      }
    },

    /**
     * Render a diagnostic table of all proxy/session state and open it in A.Modal.
     *
     * Columns shown:
     *  • Proxy Cache  — collection, status, created at, target size, active session docs
     *  • Session Docs — coll::id, dirty fields, undo depth, pending history entries
     *
     * Requires `window.A.Modal` (Bootstrap dynamic modal via app.js).
     * Safe to call at any time; purely read-only, no mutations.
     */
    showProxyDebug() {
      const fmt = (ts) => (ts ? new Date(ts).toLocaleTimeString('vi-VN', { hour12: false }) : '—');
      const badge = (txt, cls) =>
        `<span class="badge bg-${cls} fw-normal" style="font-size:.75em">${txt}</span>`;

      // ── 1. Global stats bar ───────────────────────────────────────────
      const totalSubs = [..._subs.values()].reduce((n, s) => n + s.size, 0);
      const totalPending = [..._pendingHist.values()].reduce((n, a) => n + a.length, 0);
      const statsHtml = `
        <div class="d-flex flex-wrap gap-2 mb-3" style="font-size:.82rem">
          ${badge(_proxyCache.size + ' proxy active', _proxyCache.size ? 'primary' : 'secondary')}
          ${badge(_session.size + ' session docs', _session.size ? 'info' : 'secondary')}
          ${badge(totalPending + ' pending hist', totalPending ? 'warning' : 'secondary')}
          ${badge(totalSubs + ' subscribers', totalSubs ? 'success' : 'secondary')}
          ${badge('hookSetters: ' + (window._stateProxyHooked ? 'ON' : 'OFF'), window._stateProxyHooked ? 'success' : 'secondary')}
          ${badge('lifecycleHooks: ' + (_hooksInstalled ? 'ON' : 'OFF'), _hooksInstalled ? 'success' : 'secondary')}
        </div>`;

      // ── 2. Proxy Cache table ──────────────────────────────────────────
      const proxyCacheRows = [..._proxyMeta.entries()]
        .map(([coll, meta]) => {
          const isActive = _proxyCache.has(coll);
          const target = isActive ? (_proxyCache.get(coll)?.target ?? {}) : {};
          const targetSize = Object.keys(target).length;
          const sessionDocs = [..._session.values()].filter((d) => d.coll === coll).length;
          const statusBadge = isActive
            ? badge('● Active', 'success')
            : badge('○ Uninstalled ' + fmt(meta.uninstalledAt), 'secondary');
          return `
            <tr>
              <td><code>${coll}</code></td>
              <td>${statusBadge}</td>
              <td class="text-muted">${fmt(meta.createdAt)}</td>
              <td class="text-center">${targetSize.toLocaleString()}</td>
              <td class="text-center">${sessionDocs}</td>
            </tr>`;
        })
        .join('');

      const proxyCacheTable =
        _proxyMeta.size === 0
          ? '<p class="text-muted small mb-0">Chưa có proxy nào được tạo.</p>'
          : `<table class="table table-sm table-bordered table-hover mb-0" style="font-size:.82rem">
              <thead class="table-dark">
                <tr>
                  <th>Collection</th><th>Trạng thái</th><th>Tạo lúc</th>
                  <th class="text-center">Target docs</th><th class="text-center">Session docs</th>
                </tr>
              </thead>
              <tbody>${proxyCacheRows}</tbody>
            </table>`;

      // ── 3. Session Docs table ─────────────────────────────────────────
      const sessionRows = [..._session.values()]
        .map(({ coll, id }) => {
          const key = _k(coll, id);
          const dirtySet = _dirty.get(key) ?? new Set();
          const undoDepth = _undoStack.get(key)?.length ?? 0;
          const pendingBookId = coll === 'bookings' ? id : null;
          const pendingCount = pendingBookId ? (_pendingHist.get(pendingBookId)?.length ?? 0) : '—';
          const dirtyBadge = dirtySet.size
            ? badge(dirtySet.size + ' dirty', 'warning')
            : badge('clean', 'secondary');
          const dirtyFields = dirtySet.size
            ? `<br><small class="text-muted">${[...dirtySet].join(', ')}</small>`
            : '';
          return `
            <tr>
              <td><code>${coll}</code></td>
              <td><code style="font-size:.78em">${id}</code></td>
              <td>${dirtyBadge}${dirtyFields}</td>
              <td class="text-center">${undoDepth}</td>
              <td class="text-center">${pendingCount}</td>
            </tr>`;
        })
        .join('');

      const sessionTable =
        _session.size === 0
          ? '<p class="text-muted small mb-0">Không có session doc nào đang được theo dõi.</p>'
          : `<table class="table table-sm table-bordered table-hover mb-0" style="font-size:.82rem">
              <thead class="table-dark">
                <tr>
                  <th>Collection</th><th>Doc ID</th><th>Dirty</th>
                  <th class="text-center">Undo depth</th><th class="text-center">Pending hist</th>
                </tr>
              </thead>
              <tbody>${sessionRows}</tbody>
            </table>`;

      // ── 4. Subscribers table ──────────────────────────────────────────
      const subRows = [..._subs.entries()]
        .filter(([, s]) => s.size > 0)
        .map(
          ([pattern, s]) =>
            `<tr><td><code>${pattern}</code></td><td class="text-center">${s.size}</td></tr>`
        )
        .join('');

      const subsTable = subRows
        ? `<table class="table table-sm table-bordered table-hover mb-0" style="font-size:.82rem">
            <thead class="table-dark"><tr><th>Pattern</th><th class="text-center">Handlers</th></tr></thead>
            <tbody>${subRows}</tbody>
          </table>`
        : '<p class="text-muted small mb-0">Không có subscriber nào.</p>';

      // ── 5. Assemble full HTML ─────────────────────────────────────────
      const html = `
        <div style="font-family:var(--bs-font-monospace,monospace)">
          ${statsHtml}
          <h6 class="fw-semibold mt-2 mb-1">🔌 Proxy Cache <small class="text-muted fw-normal">(${_proxyMeta.size} collection)</small></h6>
          ${proxyCacheTable}
          <h6 class="fw-semibold mt-3 mb-1">📝 Session Docs <small class="text-muted fw-normal">(${_session.size} doc)</small></h6>
          ${sessionTable}
          <h6 class="fw-semibold mt-3 mb-1">📡 Subscribers <small class="text-muted fw-normal">(${_subs.size} pattern)</small></h6>
          ${subsTable}
          <p class="text-muted mt-2 mb-0" style="font-size:.75rem">Snapshot tại ${new Date().toLocaleString('vi-VN')}</p>
        </div>`;

      // ── 6. Render into A.Modal ────────────────────────────────────────
      if (!window.A?.Modal) {
        console.table(
          [..._proxyMeta.entries()].map(([coll, m]) => ({
            coll,
            active: _proxyCache.has(coll),
            createdAt: fmt(m.createdAt),
            sessionDocs: [..._session.values()].filter((d) => d.coll === coll).length,
          }))
        );
        console.warn('[StateProxy] A.Modal not available — proxy info logged to console.');
        return;
      }

      window.A.Modal.render(html, '🔍 StateProxy — Proxy Debug');
      window.A.Modal.setFooter(false);
      window.A.Modal.show();
    },

    /**
     * Full teardown  remove all proxies, event listeners, timers.
     * Call if the SPA unmounts the module entirely.
     */
    destroy() {
      api.clearSession();
      _subs.clear();
      _pendingHist.clear();
      clearTimeout(_dashTimer);
      _lifecycleAC.abort();
      _lifecycleAC = new AbortController();
      _hooksInstalled = false;
      // Restore patched globals
      if (_origSetToEl) {
        window.setToEl = _origSetToEl;
        _origSetToEl = null;
      }
      if (_origSetNum) {
        window.setNum = _origSetNum;
        _origSetNum = null;
      }
      if (_origActivateTab) {
        window.activateTab = _origActivateTab;
        _origActivateTab = null;
      }
      if (window.A?.UI?._spPatched) delete window.A.UI._spPatched;
      window._stateProxyHooked = false;
      _proxyMeta.clear();
    },
  };

  return api;
})();

export default StateProxy;
