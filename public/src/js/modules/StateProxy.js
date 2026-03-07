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
 *
 * Field Alias (FIELD_ALIAS):
 *   Một số fieldset dùng prefix trong data-field (vd. "customer_full_name") nhưng
 *   collection schema dùng tên khác ("full_name"). StateProxy xử lý tự động bằng
 *   FIELD_ALIAS config — không cần sửa HTML. Hiện tại áp dụng cho:
 *     • customers collection: prefix "customer_" → stripped khi ghi vào proxy/dirty
 *
 *   Ví dụ fieldset customers:
 *   <fieldset data-collection="customers">
 *     <input data-field="customer_id" />          ← alias → 'id' (dùng để resolve doc ID)
 *     <input data-field="customer_full_name" />   ← alias → 'full_name'
 *     <input data-field="customer_phone" />       ← alias → 'phone'
 *   </fieldset>
 * =============================================================================
 */
const StateProxy = (() => {
  ('use strict');

  // ─── DEBUG ─────────────────────────────────────────────────────────────────
  const _DEBUG = true; // ★ Set false khi đã fix xong
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

  // ─── Config (overridable via Admin Settings → A.getConfig) ─────────────────
  const _cfg = (key, fallback) => window.A?.getConfig?.(key) ?? fallback;
  const MAX_UNDO = _cfg('undo_max_steps', 15);
  const MAX_HIST_LS = _cfg('history_max_local', 100); // max entries per booking in localStorage
  const MAX_HIST_FLUSH = _cfg('history_max_flush', 20); // max entries per flush to Firestore
  const HIST_LS_PREFIX = 'HIST_';
  const HIST_FS_FIELD = 'edit_history';
  const DASH_DEBOUNCE_MS = 300;

  // ─── Virtual Doc ID ──────────────────────────────────────────────────────────
  // Khi element nằm trong [data-collection] container nhưng chưa có doc ID thật
  // (ví dụ: dòng mới chưa lưu), StateProxy tạo ID ảo tạm thời để theo dõi undo.
  // Virtual ID tồn tại trong session hiện tại và bị xóa khi clearSession().
  const VIRTUAL_PREFIX = '__new_';
  let _virtualCounter = 0;
  /** @type {Set<string>} Track all active virtual IDs for cleanup */
  const _virtualIds = new Set();

  const HISTORY_COLLS = new Set(['bookings', 'booking_details', 'operator_entries', 'transactions', 'customers', 'transactions']);

  // ─── Internal Stores ───────────────────────────────────────────────────────
  /** @type {Array<{coll: string, id: string}>} Tracks global chronological order of edits */
  const _globalUndoStack = []; // Bổ sung mảng theo dõi Global Undo

  // ─── Field Alias ────────────────────────────────────────────────────────────
  // Maps HTML data-field attribute names → actual collection schema field names.
  // Required when a form uses a prefix convention (e.g. "customer_full_name" in
  // HTML) that differs from the Firestore schema (e.g. "full_name" in customers).
  // WITHOUT changing any HTML, StateProxy internally normalises field names so
  // proxy tracking, dirty marking, and DOM sync all work with schema names while
  // the DOM retains its prefixed attribute names.
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

  // Reverse alias: schema field name → HTML data-field name (for DOM sync / dirty marking).
  // Auto-computed from FIELD_ALIAS.
  const _FIELD_ALIAS_REV = {};
  for (const [coll, map] of Object.entries(FIELD_ALIAS)) {
    _FIELD_ALIAS_REV[coll] = Object.fromEntries(Object.entries(map).map(([htmlF, schemaF]) => [schemaF, htmlF]));
  }

  /**
   * Resolve schema field name from an HTML data-field attribute value.
   * Returns the mapped schema name if an alias exists, otherwise the original.
   * @param {string} coll
   * @param {string} htmlField
   * @returns {string}
   */
  function _resolveField(coll, htmlField) {
    return FIELD_ALIAS[coll]?.[htmlField] ?? htmlField;
  }

  /**
   * Reverse-resolve the HTML data-field for a schema field (for DOM queries).
   * Returns the aliased HTML attribute name if one exists, otherwise the schema name.
   * @param {string} coll
   * @param {string} schemaField
   * @returns {string}
   */
  function _htmlFieldOf(coll, schemaField) {
    return _FIELD_ALIAS_REV[coll]?.[schemaField] ?? schemaField;
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

  // WeakMap/WeakSet for DOM binding — auto-GC when elements removed from DOM
  /** @type {WeakMap<Element, {coll:string, id:string, field:string}>} */
  const _elemBinding = new WeakMap();
  /** @type {WeakSet<Element>} guard against double event attachment */
  const _boundEls = new WeakSet();
  /** @type {WeakMap<Element, *>} Value captured when element received focus (before editing) */
  const _focusSnapshot = new WeakMap();
  /** @type {Map<string, number>} coll::id → pointer into _undoStack for non-destructive undo */
  const _undoPointer = new Map();

  /**
   * Query [data-field] elements inside containers that carry data-item="id".
   * The project convention is to set data-item on parent elements (tr, fieldset, form)
   * rather than data-doc-id on individual inputs.
   * @param {string} id    - Document ID (data-item value)
   * @param {string} field - data-field attribute value
   * @returns {NodeList}
   */
  function _queryByItem(id, field) {
    return document.querySelectorAll(`[data-item="${id}"] [data-field="${field}"], tr[data-item="${id}"] [data-field="${field}"]`);
  }

  let _dashTimer = null;
  let _hooksInstalled = false;

  // ─── Suppress Auto-Binding ────────────────────────────────────────────────
  // When true, _tryAutoBind() becomes a no-op.  This prevents the hooked
  // setToEl / setNum from triggering proxy creation, DOM binding, and
  // logging during initial form population (loadBookingToUI → addDetailRow,
  // setVal, calcRow, etc.).  The existing document-level delegation
  // (focusin + change via _onDelegatedFocusIn) will lazily initialise proxy
  // tracking only when the user actually interacts with a field.
  let _suppressBind = false;

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
    if (arr.length >= MAX_UNDO) {
      arr.shift();
      // Adjust pointer down by 1 since array shifted
      const ptr = _undoPointer.get(key);
      if (ptr != null) _undoPointer.set(key, Math.max(0, ptr - 1));
    }
    arr.push(val);
    // Reset pointer to end — new entry means fresh state
    _undoPointer.set(key, arr.length);

    // BỔ SUNG: Track thứ tự thay đổi global
    try {
      const [coll, id] = key.split('::');
      if (coll && id) {
        _globalUndoStack.push({ coll, id });
        // Giữ cho global stack không bị tràn bộ nhớ (MAX_UNDO * 10 docs là an toàn)
        if (_globalUndoStack.length > MAX_UNDO * 10) {
          _globalUndoStack.shift();
        }
      }
    } catch (err) {
      console.error('[StateProxy] Error tracking global undo:', err);
    }
  }

  // --- Debounced _syncUndoStack ---
  let _syncUndoStackPending = {};
  function _syncUndoStack(coll, id, el = null) {
    const key = _k(coll, id);
    if (_syncUndoStackPending[key]) {
      L._('Đang pending');
      return;
    }
    _syncUndoStackPending[key] = true;
    if (el) {
      const binding = _elemBinding.get(el);
      const field = el.dataset.field;
      if (!field || field === 'id') return;
      const currentVal = getVal(el);
      // 1. Seed from data-initial when no entries exist for this doc
      if (el.dataset.initial !== undefined && !_undoStack.get(key)?.length) {
        if (String(el.dataset.initial)) {
          _pushRing(key, { field, oldVal: el.dataset.initial });
          _focusSnapshot.set(el, currentVal);
          _dbg('_syncUndoStack seed', { field, initial: el.dataset.initial, current: currentVal });
        }
      }
      _syncUndoStackPending[key] = false;
      return;
    }
    setTimeout(() => {
      const els = document.querySelectorAll(`[data-item="${id}"] [data-field]`);
      for (const el of els) {
        if (!_isBindableEl(el)) continue;
        const binding = _elemBinding.get(el);
        const field = binding?.field ?? _resolveField(coll, el.dataset.field);
        if (!field || field === 'id') continue;
        const currentVal = _readCurrentValue(el);
        // 1. Seed from data-initial when no entries exist for this doc
        if (!_undoStack.get(key)?.length && el.dataset.initial !== undefined) {
          if (String(el.dataset.initial) !== String(currentVal)) {
            _pushRing(key, { field, oldVal: el.dataset.initial });
            _dbg('_syncUndoStack seed', { field, initial: el.dataset.initial, current: currentVal });
          }
        }
        // 2. Capture in-flight edit (user changed value but hasn't blurred yet)
        const snap = _focusSnapshot.get(el);
        if (snap !== undefined && String(snap) !== String(currentVal)) {
          _pushRing(key, { field, oldVal: snap });
          _focusSnapshot.set(el, currentVal);
          _dbg('_syncUndoStack in-flight', { field, snap, current: currentVal });
        }
      }
      _syncUndoStackPending[key] = false;
    }, 250);
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
    return;
    if (_proxyCache.has(coll)) {
      _dbg('_installProxy SKIP (cached)', coll);
      return;
    }
    const raw = window.APP_DATA?.[coll];
    if (!raw || typeof raw !== 'object') {
      _dbgWarn('_installProxy ABORT — no raw data', {
        coll,
        raw: typeof raw,
        hasAppData: !!window.APP_DATA,
      });
      return;
    }
    _dbg('_installProxy CREATING', coll, '| keys:', Object.keys(raw).length);
    const proxy = new Proxy(raw, _makeCollHandler(coll));
    _proxyCache.set(coll, { proxy, target: raw });
    _proxyMeta.set(coll, { coll, createdAt: Date.now(), uninstalledAt: null });
    window.APP_DATA[coll] = proxy;
    _dbg('_installProxy OK ✅', coll);
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
        // Resolve the HTML data-field name (may differ from schema field via alias)
        const htmlField = _htmlFieldOf(coll, field);
        // data-field inside [data-item] containers — query by HTML field name first
        _queryByItem(id, htmlField).forEach((el) => _writeEl(el, val));
        // Also catch any element using the raw schema field name (non-aliased collections)
        if (htmlField !== field) {
          _queryByItem(id, field).forEach((el) => _writeEl(el, val));
        }
        // grid row cell — prefer HTML alias, fall back to schema name
        let row = document.querySelector(`tr[data-id="${id}"]`);
        // Virtual doc fallback: find row by data-virtual-doc-id attribute
        if (!row && id?.startsWith?.(VIRTUAL_PREFIX)) {
          row = document.querySelector(`tr[data-virtual-doc-id="${id}"]`);
        }
        if (row) {
          const cell = row.querySelector(`[data-field="${htmlField}"]`) ?? (htmlField !== field ? row.querySelector(`[data-field="${field}"]`) : null);
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
      // Mark by HTML alias name (covers prefixed fields like customer_full_name)
      const htmlF = _htmlFieldOf(coll, f);
      _queryByItem(id, htmlF).forEach((el) => el.classList.add('is-dirty'));
      if (htmlF !== f) {
        _queryByItem(id, f).forEach((el) => el.classList.add('is-dirty'));
      }
    }
    document.querySelectorAll(`[data-bind-dirty="${key}"]`).forEach((el) => (el.style.display = 'inline-flex'));
  }

  function _clearDirty(coll, id) {
    const key = _k(coll, id);
    const s = _dirty.get(key);
    if (s) {
      for (const f of s) {
        // Clear by HTML alias name so class is removed from prefixed elements
        const htmlF = _htmlFieldOf(coll, f);
        _queryByItem(id, htmlF).forEach((el) => el.classList.remove('is-dirty'));
        if (htmlF !== f) {
          _queryByItem(id, f).forEach((el) => el.classList.remove('is-dirty'));
        }
      }
    }
    _dirty.delete(key);
    document.querySelectorAll(`[data-bind-dirty="${key}"]`).forEach((el) => (el.style.display = 'none'));
  }

  // ─── Pending History ───────────────────────────────────────────────────────────
  function _recordPending(coll, id, oldDoc, newDoc) {
    if (!HISTORY_COLLS.has(coll)) return;
    // Virtual docs are temporary — no history recording
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
            [HIST_FS_FIELD]: firebase.firestore.FieldValue.arrayUnion(...pending.slice(-MAX_HIST_FLUSH)),
          })
          .catch((e) => console.warn('[StateProxy] history flush:', e));
      }
    } catch {
      /* non-critical */
    }

    _pendingHist.delete(bookingId);
  }

  // ─── Core Mutation Handlers ─────────────────────────────────────────────────────
  /**
   * Called by proxy set trap after each write.
   * Pushes per-FIELD undo entries (not full-doc snapshots) so undo() can
   * restore individual fields independently.
   */
  function _onUpdate(coll, dataObj, prevDoc) {
    const { id } = dataObj ?? {};
    if (!id) {
      _dbgWarn('_onUpdate ABORT — no id', { coll, dataObj });
      return;
    }
    const key = _k(coll, id);
    // Use prevDoc captured by the proxy BEFORE the write (avoids reading overwritten target)
    const oldDoc = prevDoc ?? _clone(window.APP_DATA?.[coll]?.[id] ?? {});

    const changed = Object.keys(dataObj).filter((f) => f !== 'id' && JSON.stringify(oldDoc[f]) !== JSON.stringify(dataObj[f]));

    _dbg('_onUpdate', { coll, id, changedFields: changed });

    if (changed.length) {
      // Undo entries are created ONLY by _onChangeEvent (change/blur),
      // NOT by the proxy set trap. This prevents per-keystroke undo spam.
      _markDirty(coll, id, changed);
      _recordPending(coll, id, oldDoc, { ...oldDoc, ...dataObj });
      // NOTE: Computed fields (nights, total, etc.) are handled by calcRow() in logic_sales/logic_operator.
      // DOM sync for normal edits is also handled by those modules. StateProxy only syncs DOM on undo/reset.
    }
  }

  function _onRemove(coll, id) {
    const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
    const doc = raw?.[id];
    if (doc) {
      // Full-doc marker for delete undo (special '__doc__' field)
      _pushRing(_k(coll, id), { field: '__doc__', oldVal: _clone(doc) });
      _recordPending(coll, id, doc, null);
    }
    _session.delete(_k(coll, id));
    _baseline.delete(_k(coll, id));
    _dirty.delete(_k(coll, id));
  }

  // ─── Virtual → Real ID Migration ──────────────────────────────────────────
  /**
   * Migrate tracking data from a virtual doc ID to a real doc ID.
   *
   * Called when `setVal` writes a real ID (e.g. server-generated 'OE-xxxxx')
   * to an element whose row/container was previously tracked under a virtual ID
   * (e.g. '__new_operator_entries_row-5').
   *
   * Re-keys: _session, _baseline, _undoStack, _undoPointer, _dirty, raw target,
   *          DOM data-item attributes, and _elemBinding entries.
   *
   * @param {string}  coll      - Collection name
   * @param {string}  virtualId - The virtual key to migrate FROM
   * @param {string}  realId    - The real key to migrate TO
   * @param {Element} anchor    - The <tr> or container element holding data-virtual-doc-id
   */
  function _migrateVirtualId(coll, virtualId, realId, anchor) {
    const oldKey = _k(coll, virtualId);
    const newKey = _k(coll, realId);

    // Skip if target key already tracked (avoid collision)
    if (_session.has(newKey)) {
      _dbgWarn('_migrateVirtualId SKIP — realId already tracked', { coll, realId });
      return;
    }

    // Re-key session
    if (_session.has(oldKey)) {
      _session.delete(oldKey);
      _session.set(newKey, { coll, id: realId });
    }

    // Re-key baseline
    const base = _baseline.get(oldKey);
    if (base) {
      _baseline.delete(oldKey);
      base.id = realId;
      _baseline.set(newKey, base);
    }

    // Re-key undo stack
    const stack = _undoStack.get(oldKey);
    if (stack) {
      _undoStack.delete(oldKey);
      _undoStack.set(newKey, stack);
    }

    // Re-key undo pointer
    const ptr = _undoPointer.get(oldKey);
    if (ptr != null) {
      _undoPointer.delete(oldKey);
      _undoPointer.set(newKey, ptr);
    }

    // Re-key dirty set
    const dirtySet = _dirty.get(oldKey);
    if (dirtySet) {
      _dirty.delete(oldKey);
      _dirty.set(newKey, dirtySet);
    }

    // BỔ SUNG: Cập nhật ID mới cho _globalUndoStack
    try {
      for (let i = 0; i < _globalUndoStack.length; i++) {
        const entry = _globalUndoStack[i];
        if (entry.coll === coll && entry.id === virtualId) {
          entry.id = realId;
        }
      }
    } catch (err) {
      console.error('[StateProxy] Error migrating global stack:', err);
    }

    // NOTE: Không thao tác APP_DATA target — doc thật đã tồn tại hoặc sẽ được
    // tạo bởi flow CRUD bình thường. Virtual doc chỉ sống trong internal maps.

    // Update DOM bindings: re-point data-item and _elemBinding from virtual to real
    document.querySelectorAll(`[data-item="${virtualId}"]`).forEach((container) => {
      container.dataset.item = realId;
      // Also update _elemBinding for all bound elements inside this container
      container.querySelectorAll('[data-field]').forEach((el) => {
        const binding = _elemBinding.get(el);
        if (binding) binding.id = realId;
      });
    });

    // Clean up virtual marker
    if (anchor) delete anchor.dataset.virtualDocId;
    _virtualIds.delete(virtualId);

    _dbg('_migrateVirtualId OK ✅', { coll, virtualId, realId });
  }

  // ─── Context Resolution ────────────────────────────────────────────────────
  /**
   * Resolve { coll, id } from a DOM element.
   *
   * Container MUST be <table>, <tbody>, <form>, or <fieldset> carrying [data-collection].
   * Any other ancestor tag is ignored.
   *
   * Doc ID resolution order:
   *   1. Same <tr> as element → [data-field="id"] value  (table-row case)
   *   2. Sibling [data-field="id"] at the same parent level as el
   *   3. Nearest [data-item] ancestor within container    (project convention)
   *   4. First [data-field="id"] anywhere inside container (form/fieldset case)
   *
   * Returns null when either coll or id is not determinable.
   * @param {Element} el
   * @returns {{ coll: string, id: string } | null}
   */
  function _resolveCollId(el) {
    if (!el || el.nodeType !== 1) {
      _dbgWarn('_resolveCollId ABORT — invalid el', el);
      return null;
    }
    const container = el.closest('table[data-collection], tbody[data-collection], form[data-collection], fieldset[data-collection]');
    if (!container) {
      _dbg('_resolveCollId NO container', { tag: el.tagName, field: el.dataset?.field, id: el.id });
      return null;
    }
    const coll = container.dataset.collection;
    if (!coll) {
      _dbgWarn('_resolveCollId EMPTY coll', {
        containerTag: container.tagName,
        containerId: container.id,
      });
      return null;
    }

    // Build an ID-field selector that also handles aliased id fields.
    // e.g. for "customers" collection the HTML uses data-field="customer_id"
    // instead of data-field="id", so we check via the reverse alias map.
    const idHtmlField = _FIELD_ALIAS_REV[coll]?.['id'] ?? 'id';
    const idSelector = idHtmlField !== 'id' ? `[data-field="id"], [data-field="${idHtmlField}"]` : '[data-field="id"]';

    let id = null;
    // 1. Table row: same <tr>
    const tr = el.closest('tr');
    if (tr && container.contains(tr)) {
      const idEl = tr.querySelector(idSelector);
      if (idEl) id = (typeof getVal === 'function' ? getVal(idEl) : idEl.value) || null;
    }
    // 2. Sibling: [data-field="id"] at the same parent level as el
    if (!id && el.parentElement) {
      const siblingId = el.parentElement.querySelector(`:scope > ${idSelector}`);
      if (siblingId && siblingId !== el) {
        id = (typeof getVal === 'function' ? getVal(siblingId) : siblingId.value) || null;
      }
    }
    // 3. Explicit container override (data-item on tr/fieldset/form)
    if (!id) {
      const itemAnchor = el.closest('[data-item]');
      if (itemAnchor && container.contains(itemAnchor)) id = itemAnchor.dataset.item || null;
    }
    if (!id) id = container.dataset.item ?? null;
    // 4. Fallback: first id-field anywhere inside container
    if (!id) {
      const idEl = container.querySelector(idSelector);
      if (idEl) id = (typeof getVal === 'function' ? getVal(idEl) : idEl.value) || null;
    }
    if (coll && id) {
      _dbg('_resolveCollId OK', { coll, id });
      return { coll, id };
    }

    // ── Virtual Doc ID Fallback ──
    // Container has data-collection but no real doc ID (e.g. new unsaved row).
    // Generate a temporary virtual ID anchored to the <tr> (or container) so
    // undo tracking can still bind and function correctly.
    if (coll) {
      const virtualAnchor = tr && container.contains(tr) ? tr : container;
      let virtualId = virtualAnchor.dataset.virtualDocId;
      if (!virtualId) {
        _virtualCounter++;
        virtualId = VIRTUAL_PREFIX + coll + '_' + (virtualAnchor.id || _virtualCounter);
        virtualAnchor.dataset.virtualDocId = virtualId;
        _virtualIds.add(virtualId);
        _dbg('_resolveCollId VIRTUAL ID generated', { coll, virtualId, anchor: virtualAnchor.id });
      }
      return { coll, id: virtualId };
    }

    _dbgWarn('_resolveCollId FAIL — no coll/id found', {
      coll,
      containerTag: container.tagName,
      containerId: container.id,
    });
    return null;
  }

  /**
   * Return true for any form control (INPUT, SELECT, TEXTAREA).
   * Includes readonly and disabled elements — they can be changed by JS
   * (setVal, calcRow, etc.) and should still be tracked for undo.
   * Hidden inputs are excluded (used for internal IDs, not user-visible).
   * @param {Element} el
   * @returns {boolean}
   */
  function _isBindableEl(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
    if (el.type === 'hidden') return false;
    return true;
  }

  /**
   * Read the CURRENT DOM value from a form element for proxy tracking.
   *
   * For number inputs this reads `el.value` directly instead of `getVal(el)`,
   * because `getVal → getFromEl` prioritises `dataset.val` which is stale
   * (only updated by the last `setNum` call, not by user keystrokes).
   *
   * @param {Element} el
   * @returns {*} Cleaned value ready for proxy storage
   */
  function _readCurrentValue(el) {
    const cl = el.classList;
    // Number inputs: read live el.value, clean to numeric
    if (cl.contains('number') || cl.contains('number-only') || el.type === 'number') {
      const raw = String(el.value || '').replace(/[^0-9.-]/g, '');
      return raw === '' ? 0 : Number(raw);
    }
    // Phone inputs: digits only
    if (cl.contains('phone_number') || el.type === 'tel') {
      return String(el.value || '').replace(/[^0-9]/g, '');
    }
    // Checkbox
    if (el.type === 'checkbox') return el.checked;
    // Multi-select
    if (el.tagName === 'SELECT' && el.multiple) {
      return Array.from(el.selectedOptions).map((o) => o.value);
    }
    // Default: getVal for rich handling, fallback to raw value
    return typeof getVal === 'function' ? getVal(el) : el.value;
  }

  /**
   * Auto-bind gate — called from hooked setToEl / setNum after every write.
   * Resolves DOM context → auto-tracks doc (idempotent) → binds element.
   *
   * When the element is ALREADY bound (programmatic updates from EventManager's
   * debounced setNum, calcRow, etc.) the new value is also written through the
   * proxy so tracking / undo / dirty-marking stay in sync.
   *
   * Skipped when:
   *   • element is non-editable (readonly / disabled / hidden / non-input)
   *   • value is falsy / empty  (element not yet populated)
   *   • element has no [data-field] or field === 'id'
   *   • no valid <table|form|fieldset>[data-collection] + id found in DOM
   * @param {Element} el
   * @param {*} value
   */
  function _tryAutoBind(el, value) {
    return;
    // ── Fast-exit when auto-binding is suppressed (initial form render) ──
    if (_suppressBind) return;

    // ── Virtual → Real ID migration ──
    // When a hidden/visible id field (data-field="id" or aliased) receives a real
    // doc ID and the row/container was tracked under a virtual ID, migrate all
    // tracking data (session, baseline, undoStack, dirty, bindings) to the real key.
    const htmlField = el?.dataset?.field;
    if (htmlField && value && !String(value).startsWith(VIRTUAL_PREFIX)) {
      if (htmlField === 'id' || el?.type === 'hidden') {
        const container = el.closest('table[data-collection], tbody[data-collection], form[data-collection], fieldset[data-collection]');
        const coll = container?.dataset?.collection;
        if (coll && _resolveField(coll, htmlField) === 'id') {
          const tr = el.closest('tr');
          const anchor = tr && container.contains(tr) ? tr : container;
          const virtualId = anchor?.dataset?.virtualDocId;
          if (virtualId) {
            _migrateVirtualId(coll, virtualId, String(value), anchor);
            _dbg('_tryAutoBind → virtual migration', { coll, virtualId, realId: value });
          }
        }
        return; // id/hidden fields are never bound for tracking
      }
    }

    if (!_isBindableEl(el)) {
      // Too noisy for non-input elements — only log for elements that HAVE data-field
      if (el?.dataset?.field || value === '' || value === null || value === undefined)
        _dbg('_tryAutoBind SKIP (not bindable/empty value)', {
          tag: el.tagName,
          field: el.dataset.field,
          readOnly: el.readOnly,
          disabled: el.disabled,
          value,
        });
      return;
    }
    if (!htmlField || htmlField === 'id') return; // fast-path: literal "id" skipped before alias lookup
    _dbg('_tryAutoBind START', { htmlField, value: String(value).slice(0, 30), elId: el.id });
    // Resolve ctx so we know the collection (required before alias lookup)
    const ctx = _resolveCollId(el);
    if (!ctx) {
      _dbgWarn('_tryAutoBind NO ctx', { htmlField, elId: el.id });
      return;
    }
    // Normalise HTML field name → schema field name via alias
    const field = _resolveField(ctx.coll, htmlField);
    if (field === 'id') return; // aliased id field (e.g. customer_id → id), skip

    const wasBound = _elemBinding.has(el);
    // ── Write through proxy for programmatic updates on already-bound elements ──
    // When EventManager's debounced setNum or calcRow calls setNum/setVal programmatically,
    // the DOM value changes but no native 'input' event fires → per-element handler won't run.
    // Write the new value through proxy so undo/dirty/computed tracking stay in sync.
    if (wasBound) {
      const numVal = Number(value);
      const cleanVal = !isNaN(numVal) ? numVal : value;
      const coll_data = window.APP_DATA?.[ctx.coll];
      if (coll_data?.[ctx.id] !== undefined) {
        const current = coll_data[ctx.id]?.[field];
        if (current != cleanVal) {
          // ── Undo entry for programmatic setVal on already-bound element ──
          // Without this, setVal changes after user focus were not undoable.
          const oldSnap = _focusSnapshot.get(el);
          if (oldSnap !== undefined && String(oldSnap) !== String(cleanVal)) {
            const key = _k(ctx.coll, ctx.id);
            _pushRing(key, { field, oldVal: oldSnap });
            _focusSnapshot.set(el, cleanVal);
            _dbg('_tryAutoBind → undo (programmatic setVal)', { field, oldVal: oldSnap, newVal: cleanVal });
          }
          coll_data[ctx.id] = { ...coll_data[ctx.id], [field]: cleanVal };
        }
      }
    } else {
      // ── First bind: check data-initial (set by setToEl in utils.js) ──
      // data-initial is the single source of truth for the initially loaded value.
      // If programmatic setVal changed the value since form load, create
      // one undo entry so the user can restore the initially loaded value.
      if (el.dataset.initial !== undefined) {
        try {
          const initialVal = el.dataset.initial;
          const currentVal = _readCurrentValue(el);
          const key = _k(ctx.coll, ctx.id);
          if (String(initialVal) && !_undoStack.get(key)?.length) {
            _pushRing(key, { field, oldVal: initialVal });
            _focusSnapshot.set(el, currentVal);
            _dbg('_tryAutoBind → undo (initial≠current)', { field, initialVal, currentVal });
          }
        } catch {
          /* non-critical */
        }
      }
    }
    _dbg('_tryAutoBind → _ensureTracked', { coll: ctx.coll, id: ctx.id, field, wasBound });
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
    if (!coll || !id) {
      _dbgWarn('_ensureTracked ABORT — missing coll/id', { coll, id });
      return;
    }
    const key = _k(coll, id);
    if (_session.has(key)) {
      _dbg('_ensureTracked SKIP (already tracked)', key);
      return;
    }
    const doc = window.APP_DATA?.[coll]?.[id] ?? { id };
    _dbg('_ensureTracked NEW & baseline snapshot', { coll, id, docKeys: Object.keys(doc) });
    _baseline.set(key, _clone(doc));
    _session.set(key, { coll, id });
    if (!_proxyCache.has(coll)) _installProxy(coll);
    // Virtual docs: tracked only in internal maps (_session, _baseline, _undoStack).
    // KHÔNG seed vào APP_DATA target — tránh ghi đè dữ liệu thật khi migration.
  }

  // ─── DOM Event Handlers ────────────────────────────────────────────────────────
  // NOTE: _onInputEvent has been REMOVED.
  // All proxy sync + undo entry creation is now handled by _onChangeEvent alone.
  // This prevents per-keystroke proxy writes from conflicting with change-based undo
  // and ensures the undo snapshot (oldVal) is always accurate.

  /**
   * Focus handler — capture current value BEFORE user starts editing.
   * This becomes the "oldVal" reference when the subsequent change event fires.
   */
  function _onFocusCapture(e) {
    const el = e.currentTarget ?? e.target;
    const binding = _elemBinding.get(el);
    if (!binding) return;
    const val = _readCurrentValue(el);
    _focusSnapshot.set(el, val);
    _dbg('_onFocusCapture', { field: binding.field, val: String(val).slice(0, 30) });
  }

  /**
   * Change handler — fires ONCE when user commits a field change (blur / enter / select).
   * Creates exactly ONE undo entry per committed change AND writes through proxy.
   * This is the SOLE source of both undo entries and user-initiated proxy writes
   * (programmatic writes still go via _tryAutoBind → proxy directly).
   */
  function _onChangeEvent(e) {
    const el = e.currentTarget ?? e.target;
    const binding = _elemBinding.get(el);
    if (!binding) return;
    const { coll, id, field } = binding;
    const key = _k(coll, id);

    const oldVal = _focusSnapshot.get(el);
    const newVal = _readCurrentValue(el);
    _dbg('_onChangeEvent', { field, oldVal, newVal: String(newVal).slice(0, 30) });

    // Create undo entry only if value actually changed
    if (oldVal !== undefined && String(oldVal) !== String(newVal)) {
      _pushRing(key, { field, oldVal });

      _dbg('_onChangeEvent → undo entry', { field, oldVal, newVal: String(newVal).slice(0, 30) });
    }

    // Update snapshot for next focus→change cycle
    _focusSnapshot.set(el, newVal);

    // Write through proxy — sole user-edit sync point (replaces removed _onInputEvent)
    const coll_data = window.APP_DATA?.[coll];
    if (coll_data?.[id] !== undefined) {
      coll_data[id] = { ...coll_data[id], [field]: newVal };
    }
  }

  /**
   * Document-level delegated handler for focusin / change on [data-field] elements.
   * Auto-binds elements on first interaction within a [data-collection] container,
   * enabling undo/dirty-tracking even without prior setVal/setNum call.
   *
   * On focusin: binds the element (snapshot baseline + proxy + per-element listeners).
   * On change:  fallback bind for selects/date pickers, then writes through proxy.
   *
   * Subsequent events rely on per-element listeners.
   *
   * @param {Event} e - focusin or change event (bubbled to document)
   */
  function _onDelegatedFocusIn(e) {
    const el = e.target;
    // Already bound — per-element listeners handle it
    if (_elemBinding.has(el)) return;
    // Only bind user-editable form controls (INPUT, SELECT, TEXTAREA)
    if (!_isBindableEl(el)) return;

    const htmlField = el.dataset?.field;
    if (!htmlField) return;

    _dbg('_onDelegatedFocusIn', { type: e.type, htmlField, tag: el.tagName, elId: el.id });

    // Resolve { coll, id } from ancestor [data-collection] container
    const ctx = _resolveCollId(el);
    if (!ctx) {
      _dbgWarn('_onDelegatedFocusIn NO ctx', { htmlField });
      return;
    }

    // Normalise HTML field name → schema field name via alias
    const field = _resolveField(ctx.coll, htmlField);
    if (field === 'id') return; // id field should not be user-editable

    // For change events on unbound elements, capture proxy's old value BEFORE binding.
    // bindElement will snapshot DOM value (which is already the NEW value for change),
    // so we need the proxy's pre-change value for a correct undo entry.
    let proxyOldVal;
    if (e.type === 'change') {
      proxyOldVal = window.APP_DATA?.[ctx.coll]?.[ctx.id]?.[field];
      // Virtual/new docs: proxy has no value yet — fall back to element's template default
      if (proxyOldVal === undefined) proxyOldVal = el.defaultValue ?? '';
    }

    _dbg('_onDelegatedFocusIn → bind', { coll: ctx.coll, id: ctx.id, field });

    // Auto-track doc (snapshot baseline, install proxy) + bind element
    _ensureTracked(ctx.coll, ctx.id);
    api.bindElement(el, ctx.coll, ctx.id, field);

    // For change events: per-element listener was just attached, won't fire for this event.
    // Create undo entry + write through proxy manually.
    if (e.type === 'change') {
      const val = _readCurrentValue(el);
      const key = _k(ctx.coll, ctx.id);

      // Create undo entry using proxy's old value (before this change)
      if (proxyOldVal !== undefined && String(proxyOldVal) !== String(val)) {
        _pushRing(key, { field, oldVal: proxyOldVal });
        _dbg('_onDelegatedFocusIn → undo entry (first change)', {
          field,
          oldVal: proxyOldVal,
          newVal: val,
        });
      }

      // Write through proxy
      const coll_data = window.APP_DATA?.[ctx.coll];
      if (coll_data?.[ctx.id] !== undefined) {
        coll_data[ctx.id] = { ...coll_data[ctx.id], [field]: val };
        _dbg('_onDelegatedFocusIn WROTE through proxy (change)', {
          field,
          val: String(val).slice(0, 30),
        });
      }

      // Update snapshot to new value for subsequent changes
      _focusSnapshot.set(el, val);
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
      return;
      if (!el || !coll || !id || !field) {
        _dbgWarn('bindElement ABORT — missing params', { el: !!el, coll, id, field });
        return;
      }
      const isNew = !_boundEls.has(el);
      _elemBinding.set(el, { coll, id, field });
      // Ensure data-item is set on the nearest container (tr/fieldset/form) for DOM queries
      const itemContainer = el.closest('tr, fieldset, form') ?? el.parentElement;
      if (itemContainer && !itemContainer.dataset.item) itemContainer.dataset.item = id;
      if (isNew) {
        _boundEls.add(el);
        // focus: capture before-value for undo
        el.addEventListener('focus', _onFocusCapture, { passive: true });
        // change: sole user-edit handler — creates undo entry + writes through proxy
        el.addEventListener('change', _onChangeEvent, { passive: true });
        // Capture initial snapshot from proxy (not DOM) to avoid stale snapshot
        // when element is first bound during a change event (DOM already has new value)
        const proxyVal = window.APP_DATA?.[coll]?.[id]?.[field];
        _focusSnapshot.set(el, proxyVal !== undefined ? proxyVal : _readCurrentValue(el));

        _syncUndoStack(coll, id, el); // ensure undo stack exists for this doc

        _dbg('bindElement NEW', { coll, id, field, tag: el.tagName, elId: el.id });
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
      return;
      _ensureTracked(coll, id);
    },

    /**
     * Suppress auto-binding from hooked setToEl / setNum.
     *
     * Call BEFORE programmatic form population (loadBookingToUI, addDetailRow,
     * calcRow, etc.) to prevent the proxy hooks from firing on every setVal.
     * The delegated focusin / change listeners will lazily initialise proxy
     * tracking when the user actually starts editing a field.
     *
     * MUST be paired with resumeAutoBinding() in a finally block.
     *
     * @example
     * StateProxy.suppressAutoBinding();
     * try {
     *   // ... populate form (setVal, addDetailRow, calcRow) ...
     * } finally {
     *   StateProxy.resumeAutoBinding();
     * }
     */
    suppressAutoBinding() {
      _suppressBind = true;
      _dbg('suppressAutoBinding ON — setVal/setNum hooks paused');
    },

    /**
     * Resume auto-binding from hooked setToEl / setNum.
     * Call AFTER form population is complete.
     */
    resumeAutoBinding() {
      _suppressBind = false;
      _dbg('resumeAutoBinding OFF — setVal/setNum hooks active');
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
        _undoPointer.delete(key);
        _clearDirty(coll, id);
        // Skip virtual IDs — they have no Firestore counterpart
        if (id?.startsWith?.(VIRTUAL_PREFIX)) return;
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
        _undoPointer.delete(key);
        _scheduleSync(coll, id, snap, Object.keys(snap));
      });
      _pendingHist.clear();
      if (typeof log === 'function') L._('[StateProxy] Session rolled back', 'warning');
    },

    /**
     * Discard all session tracking state (dirty marks, baseline, undo stack).
     *
     * Proxies are deliberately kept installed — the proxy `set` handler checks
     * `_session` membership before recording writes, so untracked docs are
     * silently ignored.  Proxies are only removed by `destroy()`.
     *
     * No Firestore write. Call on: load new booking, app reload.
     */
    clearSession() {
      clearTimeout(_dashTimer);
      _session.forEach(({ coll, id }) => {
        _clearDirty(coll, id);
      });
      // Clean data-initial from all tracked elements (reset for next form load)
      document.querySelectorAll('[data-initial]').forEach((el) => {
        delete el.dataset.initial;
      });
      // Clean virtual DOM attributes
      _virtualIds.forEach((vid) => {
        document.querySelectorAll(`[data-virtual-doc-id="${vid}"]`).forEach((el) => {
          delete el.dataset.virtualDocId;
        });
        document.querySelectorAll(`[data-item="${vid}"]`).forEach((el) => {
          delete el.dataset.item;
        });
      });
      _virtualIds.clear();
      _session.clear();
      _baseline.clear();
      _undoStack.clear();
      _undoPointer.clear();
      _dirty.clear();
      _pendingHist.clear();

      // BỔ SUNG: Xóa lịch sử undo global
      _globalUndoStack.length = 0;
      // Proxies intentionally kept — _uninstallProxy is called only by destroy().
    },

    /**
     * Step-undo one change for a specific field (or the most recent change).
     *
     * When `htmlField` is provided (e.g. from the right-clicked input's data-field),
     * only that field is restored — other fields are untouched.
     * When omitted, the most recent field entry is popped.
     *
     * Returns `{ field, oldVal }` on success, or `false` when nothing to undo.
     *
     * @param {string}  coll
     * @param {string}  id
     * @param {string}  [htmlField] - HTML data-field attribute name (auto-resolved via alias)
     * @returns {{ field: string, oldVal: * } | false}
     */
    undo(coll, id, htmlField) {
      if (!coll || !id) {
        try {
          _dbg('undo() GLOBAL trigger called');
          while (_globalUndoStack.length > 0) {
            const lastAction = _globalUndoStack.pop();
            // Chỉ undo nếu document đó thực sự còn bước lùi (canUndo = true)
            if (api.canUndo(lastAction.coll, lastAction.id)) {
              _dbg('undo() GLOBAL match found', lastAction);
              return api.undo(lastAction.coll, lastAction.id); // Gọi đệ quy lại chính doc đó
            }
          }
          _dbgWarn('undo() GLOBAL NO actions left');
          return false;
        } catch (err) {
          console.error('[StateProxy] Global undo error:', err);
          return false;
        }
      }
      // Ensure stack is seeded (data-initial) and in-flight edits captured
      _syncUndoStack(coll, id);
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      _dbg('undo() called', { coll, id, htmlField, stackSize: stack?.length ?? 0 });

      if (!stack?.length) {
        _dbgWarn('undo() EMPTY stack', { key });
        return false;
      }

      // Resolve HTML field name → schema field name (alias-aware)
      const targetField = htmlField ? _resolveField(coll, htmlField) : null;
      let ptr = _undoPointer.get(key) ?? stack.length;
      _dbg('undo() target', { targetField, ptr, stackEntries: stack.map((e) => e.field) });

      let entry;
      if (targetField) {
        // Search backward from pointer for the specific field
        for (let i = ptr - 1; i >= 0; i--) {
          if (stack[i].field === targetField) {
            entry = stack[i];
            _undoPointer.set(key, i);
            break;
          }
        }
      } else {
        // No specific field → go back one step from pointer
        if (ptr <= 0) {
          _dbgWarn('undo() pointer at start', { key });
          return false;
        }
        ptr--;
        entry = stack[ptr];
        _undoPointer.set(key, ptr);
      }
      if (!entry) {
        _dbgWarn('undo() NO matching entry', { targetField });
        return false;
      }
      _dbg('undo() FOUND', { field: entry.field, oldVal: entry.oldVal, ptr: _undoPointer.get(key) });

      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];

      // Special case: full-doc restore (from delete undo)
      if (entry.field === '__doc__') {
        if (raw) raw[id] = entry.oldVal;
        _clearDirty(coll, id);
        _scheduleSync(coll, id, entry.oldVal, Object.keys(entry.oldVal));
        return { field: '__doc__', oldVal: entry.oldVal };
      }

      // ── Field-level restore: write directly via setVal ──
      // Using setVal instead of _scheduleSync avoids the _writeEl guard
      // that skips document.activeElement (which blocks undo on focused inputs).
      const restoreVal = entry.oldVal;
      const htmlF = _htmlFieldOf(coll, entry.field);

      // Suppress hooks so setVal doesn't create new undo entries
      const wasSuppressed = _suppressBind;
      _suppressBind = true;
      try {
        const writeToEl = (el) => {
          if (typeof setVal === 'function') setVal(el, restoreVal);
          else if ('value' in el) el.value = restoreVal;
          _focusSnapshot.set(el, restoreVal);
        };
        _queryByItem(id, htmlF).forEach(writeToEl);
        if (htmlF !== entry.field) {
          _queryByItem(id, entry.field).forEach(writeToEl);
        }
      } finally {
        _suppressBind = wasSuppressed;
      }

      // Update proxy raw data (bypass proxy to avoid _onUpdate)
      if (raw?.[id]) raw[id] = { ...raw[id], [entry.field]: restoreVal };

      // Update dirty tracking: remove dirty mark if field matches baseline
      const baseline = _baseline.get(key);
      const dirtySet = _dirty.get(key);
      if (dirtySet && baseline) {
        if (JSON.stringify(restoreVal) === JSON.stringify(baseline[entry.field])) {
          dirtySet.delete(entry.field);
          _queryByItem(id, htmlF).forEach((el) => el.classList.remove('is-dirty'));
          if (htmlF !== entry.field) {
            _queryByItem(id, entry.field).forEach((el) => el.classList.remove('is-dirty'));
          }
        }
      }

      _dbg('undo() OK ✅', { field: entry.field, restoredTo: restoreVal });
      return { field: entry.field, oldVal: restoreVal };
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
      _undoPointer.delete(_k(coll, id));
      _scheduleSync(coll, id, copy, Object.keys(copy));
      return true;
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

    /**
     * Check if undo is possible for a document.
     *
     * Returns true when:
     *   1. The undo stack has entries before the current pointer, OR
     *   2. Any bound element has data-initial different from its current value
     *      (programmatic changes not yet captured in undo stack).
     *
     * @param {string} coll
     * @param {string} id
     * @returns {boolean}
     */
    canUndo(coll, id) {
      // Ensure stack captures data-initial diffs and in-flight edits
      _syncUndoStack(coll, id);
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      const ptr = _undoPointer.get(key) ?? stack?.length ?? 0;
      return !!(stack?.length && ptr > 0);
    },

    /**
     * Return the undo stack for a document (for history display).
     * Each entry includes: index, field, oldVal, isUndone (past the pointer).
     * @param {string} coll
     * @param {string} id
     * @returns {Array<{index:number, field:string, oldVal:*, isUndone:boolean}>}
     */
    getUndoStack(coll, id) {
      // Sync stack so in-flight edits and data-initial are included
      _syncUndoStack(coll, id);
      const key = _k(coll, id);
      const stack = _undoStack.get(key);
      if (!stack?.length) return [];
      const ptr = _undoPointer.get(key) ?? stack.length;
      const result = stack.map((entry, idx) => ({
        index: idx,
        field: entry.field,
        oldVal: entry.oldVal,
        isUndone: idx >= ptr,
      }));
      // Append current value per tracked field so display shows latest state
      const raw = _proxyCache.get(coll)?.target ?? window.APP_DATA?.[coll];
      const doc = raw?.[id];
      if (doc) {
        const fields = [...new Set(stack.map((e) => e.field).filter((f) => f !== '__doc__'))];
        for (const field of fields) {
          result.push({
            index: stack.length,
            field,
            oldVal: doc[field] ?? '',
            isCurrent: true,
            isUndone: false,
          });
        }
      }
      return result;
    },

    /**
     * Install all auto-tracking hooks. Call once in app.js before any form renders.
     *
     * Hooks installed:
     *   1. window.setToEl  → _tryAutoBind (auto-track + bind on every setVal call)
     *   2. window.setNum   → _tryAutoBind (auto-track + bind on every setNum call)
     *   3. A.UI.renderForm → clearSession() before rendering a new admin form
     *   4. Document input/change delegation → auto-track + bind on user keystroke
     *      (enables undo even for fields never touched by setVal/setNum)
     *
     * Tab navigation (activateTab, tabchange) and paginationchange no longer
     * clear the session.  Proxies survive tab switches and grid pagination;
     * they are only removed by destroy() or when `beginEdit()` re-registers
     * after a fresh `clearSession()` call inside `loadBookingToUI`.
     *
     * Idempotent — safe to call multiple times; hooks installed exactly once.
     * All patches are fully restored by destroy().
     *
     * @example
     * // app.js — once, before any form renders
     * StateProxy.hookSetters();
     */
    hookSetters() {
      return;
      if (window._stateProxyHooked) {
        _dbg('hookSetters SKIP (already hooked)');
        return;
      }
      window._stateProxyHooked = true;
      _dbg('hookSetters START');

      // ── 1. Hook setToEl ────────────────────────────────────────────────────
      // Low-level writer called by all setVal() paths (text, date, select, …).
      if (typeof window.setToEl === 'function' && !_origSetToEl) {
        _origSetToEl = window.setToEl;
        _dbg('hookSetters: setToEl HOOKED ✅');
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
        _dbg('hookSetters: setNum HOOKED ✅');
        window.setNum = function (idOrEl, val) {
          _origSetNum.call(this, idOrEl, val);
          const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
          // data-initial is set by setToEl in utils.js (called internally by setNum).
          // No extra attribute needed here — data-initial is the single source of truth.
          const num = Number(val);
          if (!isNaN(num) && num !== 0) {
            if (el) _tryAutoBind(el, val);
          }
        };
      }

      // ── 3. Hook A.UI.renderForm ────────────────────────────────────────────
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
      setTimeout(_patchRenderForm, 100); // retry after current task (A.UI may not exist yet)

      // ── 4. Document-level delegation (focusin + change) ─────────────────
      // Auto-binds any [data-field] within [data-collection] on first interaction.
      // focusin: binds element + captures before-value when user focuses a field.
      // change:  fallback bind for selects/date pickers that may not fire focusin.
      // Uses _lifecycleAC signal → auto-cleaned by destroy().
      const sig = _lifecycleAC.signal;
      document.addEventListener('focusin', _onDelegatedFocusIn, { signal: sig, passive: true });
      document.addEventListener('change', _onDelegatedFocusIn, { signal: sig, passive: true });
      _dbg('hookSetters: delegation listeners INSTALLED ✅ (focusin + change)');
      _dbg('hookSetters DONE ✅ — all hooks active');
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
      const badge = (txt, cls) => `<span class="badge bg-${cls} fw-normal" style="font-size:.75em">${txt}</span>`;

      // ── 1. Global stats bar ───────────────────────────────────────────
      const totalPending = [..._pendingHist.values()].reduce((n, a) => n + a.length, 0);
      const totalAliases = Object.values(FIELD_ALIAS).reduce((n, m) => n + Object.keys(m).length, 0);
      const statsHtml = `
        <div class="d-flex flex-wrap gap-2 mb-3" style="font-size:.82rem">
          ${badge(_proxyCache.size + ' proxy active', _proxyCache.size ? 'primary' : 'secondary')}
          ${badge(_session.size + ' session docs', _session.size ? 'info' : 'secondary')}
          ${badge(totalPending + ' pending hist', totalPending ? 'warning' : 'secondary')}
          ${badge(Object.keys(FIELD_ALIAS).length + ' alias colls (' + totalAliases + ' fields)', totalAliases ? 'info' : 'secondary')}
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
          const statusBadge = isActive ? badge('● Active', 'success') : badge('○ Uninstalled ' + fmt(meta.uninstalledAt), 'secondary');
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
          const dirtyBadge = dirtySet.size ? badge(dirtySet.size + ' dirty', 'warning') : badge('clean', 'secondary');
          const dirtyFields = dirtySet.size ? `<br><small class="text-muted">${[...dirtySet].join(', ')}</small>` : '';
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

      // ── 4. Assemble full HTML ─────────────────────────────────────────
      const html = `
        <div style="font-family:var(--bs-font-monospace,monospace)">
          ${statsHtml}
          <h6 class="fw-semibold mt-2 mb-1">🔌 Proxy Cache <small class="text-muted fw-normal">(${_proxyMeta.size} collection)</small></h6>
          ${proxyCacheTable}
          <h6 class="fw-semibold mt-3 mb-1">📝 Session Docs <small class="text-muted fw-normal">(${_session.size} doc)</small></h6>
          ${sessionTable}
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
      // Explicitly uninstall all proxies — clearSession() no longer does this.
      [..._proxyCache.keys()].forEach((c) => _uninstallProxy(c));
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
      if (window.A?.UI?._spPatched) delete window.A.UI._spPatched;
      window._stateProxyHooked = false;
      _proxyMeta.clear();
    },
  };

  return api;
})();

export default StateProxy;
