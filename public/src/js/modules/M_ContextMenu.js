/**
 * =========================================================================
 * M_ContextMenu.js — Dynamic Context Menu Manager (ES6) v2.1
 * Purpose: Reusable, event-delegated context menu with conditional items
 *          per target selector. Integrates into A.addModule() system.
 *
 * Features:
 *   - Built-in "Edit" submenu (Undo, Reset, Copy, Cut, Paste, Clear, Select All)
 *   - Undo integration with StateProxy history
 *   - Submenu support (nested items with hover flyout)
 *   - Conditional visibility/disabled per item
 *   - Smart viewport positioning
 *   - Auto-registers booking context menu on init()
 *   - ★ Mobile support via M_AutoMobileEvents (auto-initialized separately)
 *
 * Mobile Integration:
 *   M_AutoMobileEvents.js auto-initializes on import and converts touch
 *   gestures (tap → click, double-tap → dblclick, long-press → contextmenu)
 *   into synthetic DOM events. This module does NOT need to manage mobile
 *   events — they arrive as standard contextmenu events.
 *
 * Version: 2.2
 * =========================================================================
 *
 * Usage:
 *   // 1. Register via module system (app.js)
 *   A.addModule('ContextMenu', new ContextMenu(), true);
 *
 *   // 2. Register custom menu (auto-includes Edit submenu at top)
 *   A.ContextMenu.register('#my-grid tbody', {
 *     items: [
 *       { id: 'action', label: 'Do Something', icon: 'fa-bolt', action: (ctx) => {} },
 *       '---',
 *       { id: 'del', label: 'Xóa', icon: 'fa-trash', cls: 'text-danger',
 *         visible: (ctx) => !!ctx.rowId, action: (ctx) => {} },
 *     ]
 *   });
 *
 *   // 3. Register without Edit submenu
 *   A.ContextMenu.register('.simple-area', { includeEditSubmenu: false, items: [...] });
 *
 *   // 4. Unregister
 *   A.ContextMenu.unregister('#my-grid tbody');
 *
 * @module M_ContextMenu
 */

// =========================================================================
// 1. CONSTANTS & DEFAULT CONFIG
// =========================================================================

const DEFAULT_CONFIG = {
  /** Menu z-index (above modals) */
  zIndex: 10500,
  /** Extra CSS class applied to every menu container */
  menuClass: 'context-menu dropdown-menu shadow',
  /** Animation class (Bootstrap compatible) */
  showClass: 'show',
  /** Prepend the default "Edit" submenu to every registered menu */
  includeEditSubmenu: true,
};

// =========================================================================
// 2. HELPERS (module-level, not exported)
// =========================================================================

/**
 * Extract StateProxy document info (coll, id) from context.
 * Checks data-doc-id / data-collection attributes, falls back to row .d-sid.
 *
 * @param {object} ctx - Context from onContextMenu
 * @returns {{ coll: string, id: string } | null}
 */
function _getDocInfo(ctx) {
  const { target, row, form } = ctx;

  // 1. data-doc-id on the element or an ancestor
  const boundEl = target?.closest?.('[data-field="id"]');
  let docId = getVal(boundEl) || boundEl?.value || boundEl?.dataset?.docId;
  let coll = boundEl?.dataset?.collection || target?.closest?.('[data-collection]')?.dataset?.collection;

  // 2. Fallback: row's .d-sid input
  if (!docId && (row || form)) {
    const docEl = row?.querySelector('.d-sid') || row || form?.querySelector('.d-sid') || form?.querySelector('[data-field="id"]');
    docId = getVal(docEl) || docEl?.value;
  }

  // 3. Fallback: virtual doc ID (new unsaved rows tracked by StateProxy)
  if (!docId) {
    const anchor = row || target?.closest?.('tr') || form;
    docId = anchor?.dataset?.virtualDocId ?? null;
  }

  // 4. Fallback: data-doc-id on focused element (set by StateProxy bindElement)
  if (!docId) {
    docId = ctx.focusedEl?.dataset?.docId ?? target?.dataset?.docId ?? null;
  }

  // 5. Fallback collection from user role
  if (!coll) {
    coll = _getCollection(ctx);
  }

  return docId ? { coll, id: docId } : null;
}

/**
 * Resolve the active collection key based on current user role.
 * @returns {string}
 */
function _getCollection(ctx) {
  const container = ctx.form || ctx.target?.closest('table') || ctx.target?.closest('[data-collection]') || ctx.target?.closest('fieldset');
  if (!container) return window.CURRENT_USER?.role === 'op' ? 'operator_entries' : 'booking_details';
  return container.dataset.collection || container.name;
}

/**
 * Check if the target is an editable form element.
 * @param {Element} el
 * @returns {boolean}
 */
function _isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'hidden'].includes(el.type)) {
    return !el.readOnly && !el.disabled;
  }
  if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled;
  if (tag === 'SELECT') return !el.disabled;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Sync a document's values from APP_DATA back to DOM elements.
 * Flow: find [data-field="id"] whose value === info.id → climb to nearest
 * container (fieldset/form/tr) → set sibling [data-field] values.
 *
 * For table rows the container is always the <tr>, never the <table>,
 * to prevent one doc's values from overwriting all rows in the table.
 *
 * @param {{ coll: string, id: string }} info - Document identifier
 * @param {object} ctx - Context with row reference
 * @param {string} [restrictField] - When provided, only sync this one field (HTML data-field name)
 */
/**
 * Sync a document's values from APP_DATA back to DOM elements.
 *
 * @param {{ coll: string, id: string }} info - Document identifier
 * @param {object} ctx - Context with row reference
 * @param {string} [restrictField] - When provided, only sync this one field (HTML data-field name)
 */
function _syncDocToDom(info, ctx, restrictField) {
  if (!info) return;
  const doc = window.APP_DATA?.[info.coll]?.[info.id];
  if (!doc) return;

  // Helper: write doc values to [data-field] children of a container
  const _syncContainer = (container) => {
    container.querySelectorAll('[data-field]:not([data-field="id"])').forEach((el) => {
      const field = el.dataset.field;
      if (!field) return;
      // Field restriction: skip fields that don't match
      if (restrictField && field !== restrictField) return;
      const val = doc[field];
      if (val === undefined) return;
      if (typeof setVal === 'function') setVal(el, val);
      else if ('value' in el) el.value = val;
      else el.textContent = val;
      el.classList.remove('is-dirty');
    });
  };

  // 1. Sync row inputs (table-based forms — ctx.row from right-click)
  let row = ctx?.row || document.querySelector(`tr[data-id="${info.id}"]`);
  // Virtual doc fallback: find row by data-virtual-doc-id
  if (!row && info.id?.startsWith?.('__new_')) {
    row = document.querySelector(`tr[data-virtual-doc-id="${info.id}"]`);
  }
  if (row) _syncContainer(row);

  // 2. Sync form/fieldset inputs — find all [data-field="id"] matching info.id.
  //    For table rows: scope to the <tr> only (never the whole <table>, which
  //    would overwrite every row with one doc's values).
  //    For form/fieldset: climb to nearest meaningful container.
  document.querySelectorAll('[data-field="id"]').forEach((idEl) => {
    const idVal = typeof getVal === 'function' ? getVal(idEl) : idEl.value;
    if (idVal !== info.id) return;

    // Table row → sync just this <tr>, NOT the whole <table>
    const tr = idEl.closest('tr');
    if (tr) {
      if (tr !== row) _syncContainer(tr);
      return;
    }

    // Form/fieldset context
    const container = idEl.closest('fieldset, form, [data-collection]') || idEl.parentElement;
    if (!container || container === row) return;
    _syncContainer(container);
  });
}

// =========================================================================
// 3. CONTEXT MENU CLASS
// =========================================================================

class ContextMenu {
  /** @type {Map<string, { config: object, menuEl: HTMLElement }>} */
  #registrations = new Map();

  /** @type {HTMLElement|null} Currently visible menu element */
  #activeMenu = null;

  /** @type {string|null} Selector key of the currently active menu */
  #activeKey = null;

  /** @type {object} Merged config */
  #config = { ...DEFAULT_CONFIG };

  /** @type {boolean} Global listeners installed */
  #initialized = false;

  /** @type {object} Context passed to item action callbacks */
  #currentContext = {};

  /** @type {AbortController} For easy cleanup of all global listeners */
  #abortController = null;

  /** @type {boolean} CSS injected */
  #stylesInjected = false;

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  constructor(config = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Install global document-level listeners (called once).
   * Safe to call multiple times — idempotent.
   *
   */
  init() {
    if (this.#initialized) return;
    this.#initialized = true;

    this.#injectStyles();

    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;

    // ── Right-click handler (event delegation) ──
    // Also handles synthetic contextmenu from M_AutoMobileEvents
    // on mobile (long-press → contextmenu).
    document.addEventListener('contextmenu', (e) => this.#onContextMenu(e), { signal });

    // ── Hide on click outside / Escape / scroll / tap outside ──
    document.addEventListener('click', (e) => this.#onDocumentClick(e), { signal });
    // Mobile: also hide on touchstart outside the menu
    document.addEventListener('touchstart', (e) => this.#onDocumentClick(e), {
      signal,
      passive: true,
    });
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') debounce(this.hide.bind(this), 300)();
      },
      { signal }
    );
    window.addEventListener(
      'scroll',
      (e) => {
        // Only hide if the scroll is NOT inside the active menu itself
        if (this.#activeMenu && this.#activeMenu.contains(e.target)) return;
        debounce(this.hide.bind(this), 300)();
      },
      { signal, capture: true }
    );
    window.addEventListener('resize', () => debounce(this.hide.bind(this), 300)(), { signal });

    // ── Auto-register built-in menus ──
    this._registerBookingContextMenu();
    this._registerGlobalInputMenu();
    // this.register('#grid-body');
  }

  /**
   * Tear down all listeners and remove generated DOM elements.
   */
  destroy() {
    this.hide();
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
    for (const [, reg] of this.#registrations) {
      reg.menuEl?.remove();
    }
    this.#registrations.clear();
    this.#initialized = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a context menu configuration for a target selector.
   *
   * @param {string} targetSelector - CSS selector for the trigger area
   * @param {object} config - Menu configuration
   * @param {string}   [config.id]                - Unique menu element ID
   * @param {string}   [config.rowSelector='tr']   - Selector to find closest "row"
   * @param {boolean}  [config.includeEditSubmenu]  - Override global setting per menu
   * @param {Function} [config.onBeforeOpen]        - Return false to cancel
   * @param {Function} [config.onAfterOpen]         - Called after shown
   * @param {Array}    config.items                 - Item definitions or '---' dividers
   *
   * Item shape:
   * {
   *   id:        string,           // Unique button id
   *   label:     string,           // Display text
   *   icon:      string,           // FontAwesome icon (e.g. 'fa-copy')
   *   iconColor: string,           // Icon color class (e.g. 'text-primary')
   *   cls:       string,           // CSS class for button (e.g. 'text-danger')
   *   action:    (ctx) => void,    // Click handler
   *   visible:   (ctx) => boolean, // Dynamic visibility
   *   disabled:  (ctx) => boolean, // Dynamic disabled
   *   shortcut:  string,           // Hint text (e.g. 'Ctrl+C')
   *   children:  Array,            // Submenu items (recursive)
   * }
   *
   * @returns {boolean}
   */
  register(targetSelector, config = {}) {
    if (!targetSelector || typeof targetSelector !== 'string') {
      console.warn('[ContextMenu] Invalid targetSelector:', targetSelector);
      return false;
    }
    // Determine if Edit submenu should be prepended
    const shouldIncludeEdit = config.includeEditSubmenu !== undefined ? config.includeEditSubmenu : this.#config.includeEditSubmenu;

    const items = Array.isArray(config.items) ? config.items : [];
    if (!shouldIncludeEdit && !items.length) {
      console.warn('[ContextMenu] No items provided for:', targetSelector);
      return false;
    }

    // Unregister existing if re-registering
    if (this.#registrations.has(targetSelector)) {
      this.unregister(targetSelector);
    }

    // Build final items: [Edit submenu, (---,) ...custom items]
    const finalItems = shouldIncludeEdit ? [this.#getDefaultEditSubmenu(), ...(items.length ? ['---', ...items] : [])] : [...items];

    const menuId = config.id || `ctx-menu-${this.#registrations.size + 1}-${Date.now()}`;
    const menuEl = this.#buildMenuElement(menuId, finalItems);

    this.#registrations.set(targetSelector, {
      config: {
        ...config,
        id: menuId,
        rowSelector: config.rowSelector || 'tr',
        _allItems: finalItems,
      },
      menuEl,
    });

    return true;
  }

  /**
   * Unregister a context menu for a target selector.
   * @param {string} targetSelector
   * @returns {boolean}
   */
  unregister(targetSelector) {
    const reg = this.#registrations.get(targetSelector);
    if (!reg) return false;
    if (this.#activeKey === targetSelector) this.hide();
    reg.menuEl?.remove();
    this.#registrations.delete(targetSelector);
    return true;
  }

  /**
   * Update items of an existing registration dynamically.
   * @param {string} targetSelector
   * @param {Array}  newItems
   * @returns {boolean}
   */
  updateItems(targetSelector, newItems) {
    const reg = this.#registrations.get(targetSelector);
    if (!reg) return false;

    const shouldIncludeEdit = reg.config.includeEditSubmenu !== undefined ? reg.config.includeEditSubmenu : this.#config.includeEditSubmenu;

    const finalItems = shouldIncludeEdit ? [this.#getDefaultEditSubmenu(), ...(newItems.length ? ['---', ...newItems] : [])] : [...newItems];

    reg.config.items = newItems;
    reg.config._allItems = finalItems;
    const newMenuEl = this.#buildMenuElement(reg.config.id, finalItems);
    reg.menuEl?.remove();
    reg.menuEl = newMenuEl;
    return true;
  }

  /** Programmatically hide the active context menu. */
  hide() {
    if (this.#activeMenu) {
      this.#activeMenu.classList.remove(this.#config.showClass);
      this.#activeMenu.style.display = 'none';
      this.#activeMenu = null;
      this.#activeKey = null;
      this.#currentContext = {};
    }
  }

  /** @returns {string[]} all registered target selectors */
  getRegistered() {
    return [...this.#registrations.keys()];
  }

  /** @returns {object} current context (shallow copy) */
  getContext() {
    return { ...this.#currentContext };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEFAULT EDIT SUBMENU
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the default "Edit" submenu definition.
   * Always prepended to every registered menu (unless disabled via config).
   *
   * Items: Undo, Reset, Cut, Copy, Paste, Clear, Select All, Inspect (admin)
   *
   * @returns {object} Submenu item definition with children[]
   */
  #getDefaultEditSubmenu() {
    return {
      id: 'ctx-edit-submenu',
      label: 'Edit',
      icon: 'fa-pen-to-square',
      iconColor: 'text-secondary',
      children: [
        // ── Undo — StateProxy history ──
        {
          id: 'ctx-undo',
          label: 'Hoàn tác (Undo)',
          icon: 'fa-rotate-left',
          iconColor: 'text-warning',
          shortcut: 'Ctrl+Z',
          disabled(ctx) {
            const info = _getDocInfo(ctx);
            if (!info) return true;
            return !window.StateProxy?.canUndo?.(info.coll, info.id);
          },
          action(ctx) {
            const info = _getDocInfo(ctx);
            if (!info) {
              typeof logA === 'function' && logA('Không xác định được dữ liệu.', 'warning');
              return;
            }
            // Pass the focused field so undo restores only that field
            const htmlField = ctx.focusedEl?.dataset?.field || ctx.target?.dataset?.field;
            const result = window.StateProxy?.undo?.(info.coll, info.id, htmlField);
            if (result) {
              // undo() writes directly to DOM via setVal — no extra sync needed
              typeof logA === 'function' && logA(`↩️ Hoàn tác: ${result.field}`, 'success');
            } else {
              typeof logA === 'function' && logA('Không có thao tác để hoàn tác.', 'info');
            }
          },
        },

        // ── Reset — StateProxy full reset to baseline ──
        {
          id: 'ctx-reset',
          label: 'Đặt lại (Reset)',
          icon: 'fa-clock-rotate-left',
          iconColor: 'text-info',
          disabled(ctx) {
            const info = _getDocInfo(ctx);
            if (!info) return true;
            return !window.StateProxy?.isDirty?.(info.coll, info.id);
          },
          action(ctx) {
            const info = _getDocInfo(ctx);
            if (!info) return;
            typeof showConfirm === 'function'
              ? showConfirm('Reset dòng này về trạng thái ban đầu?', () => {
                  window.StateProxy?.reset?.(info.coll, info.id);
                  _syncDocToDom(info, ctx); // reset syncs ALL fields (no restriction)
                })
              : (() => {
                  window.StateProxy?.reset?.(info.coll, info.id);
                  _syncDocToDom(info, ctx);
                })();
          },
        },

        // ── History — show undo stack as modal ──
        {
          id: 'ctx-history',
          label: 'Lịch sử (History)',
          icon: 'fa-rectangle-list',
          iconColor: 'text-primary',
          disabled(ctx) {
            const info = _getDocInfo(ctx);
            if (!info) return true;
            const stack = window.StateProxy?.getUndoStack?.(info.coll, info.id);
            return !stack?.length;
          },
          action(ctx) {
            const info = _getDocInfo(ctx);
            if (!info) {
              typeof logA === 'function' && logA('Không xác định được dữ liệu.', 'warning');
              return;
            }
            const stack = window.StateProxy?.getUndoStack?.(info.coll, info.id);
            if (!stack?.length) {
              typeof logA === 'function' && logA('Chưa có thay đổi nào.', 'info');
              return;
            }
            const ptr = stack.findIndex((e) => e.isUndone);
            const ptrIdx = ptr === -1 ? stack.length : ptr;
            const rows = stack
              .map((entry, i) => {
                const isCurrent = !!entry.isCurrent;
                const undoneCls = entry.isUndone ? 'text-decoration-line-through opacity-50' : '';
                const currentCls = isCurrent ? 'table-info fw-semibold' : '';
                const marker = isCurrent ? '<span class="badge bg-success ms-1" style="font-size:.7em">current</span>' : i === ptrIdx - 1 ? '<span class="badge bg-warning text-dark ms-1" style="font-size:.7em">← pointer</span>' : '';
                const valStr = entry.oldVal != null ? String(entry.oldVal).slice(0, 40) : '<i>empty</i>';
                return `<tr class="${undoneCls} ${currentCls}">
                  <td class="text-center text-muted">${isCurrent ? '✦' : i + 1}</td>
                  <td><code style="font-size:.8em">${entry.field}</code></td>
                  <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${valStr}</td>
                  <td>${marker}</td>
                </tr>`;
              })
              .join('');
            const html = `
              <p class="text-muted small mb-2">
                Document: <code>${info.coll}::${info.id}</code> — ${stack.length} entries, pointer tại #${ptrIdx}
              </p>
              <table class="table table-sm table-bordered table-hover mb-0" style="font-size:.82rem">
                <thead class="table-dark">
                  <tr>
                    <th class="text-center" style="width:32px">#</th>
                    <th>Field</th>
                    <th>Giá trị cũ</th>
                    <th style="width:80px"></th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`;
            if (window.A?.Modal) {
              window.A.Modal.render(html, '📜 Undo History');
              window.A.Modal.setFooter(false);
              window.A.Modal.show();
            } else {
              console.table(stack);
              typeof logA === 'function' && logA(`History: ${stack.length} entries (logged to console)`, 'info');
            }
          },
        },

        '---',

        // ── Cut ──
        {
          id: 'ctx-cut',
          label: 'Cắt (Cut)',
          icon: 'fa-scissors',
          shortcut: 'Ctrl+X',
          disabled(ctx) {
            return !_isEditable(ctx.focusedEl);
          },
          action(ctx) {
            const el = ctx.focusedEl;
            if (!el) return;
            if (el.selectionStart !== undefined && el.selectionStart !== el.selectionEnd) {
              const text = el.value.substring(el.selectionStart, el.selectionEnd);
              navigator.clipboard.writeText(text).catch(() => {});
              el.setRangeText('', el.selectionStart, el.selectionEnd, 'start');
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              navigator.clipboard.writeText(el.value || '').catch(() => {});
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          },
        },

        // ── Copy Text ──
        {
          id: 'ctx-copy-text',
          label: 'Sao chép (Copy)',
          icon: 'fa-copy',
          iconColor: 'text-primary',
          shortcut: 'Ctrl+C',
          action(ctx) {
            const el = ctx.focusedEl;
            if (el?.selectionStart !== undefined && el.selectionStart !== el.selectionEnd) {
              const text = el.value.substring(el.selectionStart, el.selectionEnd);
              navigator.clipboard.writeText(text).catch(() => {});
            } else if (el?.value) {
              navigator.clipboard.writeText(el.value).catch(() => {});
            } else {
              const sel = window.getSelection()?.toString();
              if (sel) navigator.clipboard.writeText(sel).catch(() => {});
            }
          },
        },

        // ── Paste ──
        {
          id: 'ctx-paste-text',
          label: 'Dán (Paste)',
          icon: 'fa-paste',
          iconColor: 'text-success',
          shortcut: 'Ctrl+V',
          disabled(ctx) {
            return !_isEditable(ctx.focusedEl);
          },
          async action(ctx) {
            const el = ctx.focusedEl;
            if (!el) return;
            try {
              const text = await navigator.clipboard.readText();
              if (!text) return;
              if (el.selectionStart !== undefined) {
                el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
              } else {
                setVal ? setVal(el, text) : (el.value = text);
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } catch {
              /* clipboard permission denied */
            }
          },
        },

        '---',

        // ── Clear Field ──
        {
          id: 'ctx-clear',
          label: 'Xóa ô (Clear)',
          icon: 'fa-eraser',
          iconColor: 'text-danger',
          disabled(ctx) {
            return !_isEditable(ctx.focusedEl);
          },
          action(ctx) {
            const el = ctx.focusedEl;
            if (!el) return;
            if (el.tagName === 'SELECT') {
              el.selectedIndex = 0;
            } else {
              setVal ? setVal(el, '') : (el.value = '');
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          },
        },

        // ── Select All ──
        {
          id: 'ctx-select-all',
          label: 'Chọn tất cả',
          icon: 'fa-object-group',
          iconColor: 'text-info',
          shortcut: 'Ctrl+A',
          disabled(ctx) {
            const el = ctx.focusedEl;
            return !el || el.tagName === 'SELECT';
          },
          action(ctx) {
            const el = ctx.focusedEl;
            if (!el) return;
            if (typeof el.select === 'function') {
              el.select();
            } else if (el.selectionStart !== undefined) {
              el.setSelectionRange(0, el.value.length);
            }
            el.focus();
          },
        },

        '---',

        // ── Copy Row Data — copy toàn bộ dữ liệu hàng hiện tại ──
        {
          id: 'ctx-copy-row',
          label: 'Copy dữ liệu hàng',
          icon: 'fa-table-cells',
          iconColor: 'text-primary',
          visible(ctx) {
            return !!ctx.row;
          },
          async action(ctx) {
            if (!ctx.row) return;
            const info = _getDocInfo(ctx);
            const coll = info?.coll || _getCollection(ctx);
            let data;
            if (typeof getRowData === 'function') {
              const tbody = ctx.row.closest('tbody');
              data = getRowData(coll, ctx.row, tbody);
            } else {
              // Fallback: gather data-field inputs from row
              data = {};
              ctx.row.querySelectorAll('[data-field]').forEach((el) => {
                data[el.dataset.field] = typeof getVal === 'function' ? getVal(el) : el.value;
              });
            }
            if (!data || !Object.keys(data).length) {
              typeof logA === 'function' && logA('Không có dữ liệu để copy.', 'info');
              return;
            }
            try {
              await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              typeof logA === 'function' && logA('✅ Đã copy dữ liệu hàng!', 'success');
            } catch {
              typeof logA === 'function' && logA('❌ Không thể copy.', 'error');
            }
          },
        },

        {
          id: 'ctx-open-booking',
          label: 'Mở booking',
          icon: 'fa-book-open',
          iconColor: 'text-success',
          visible(ctx) {
            // Visible when there's a data-collection context
            const container = ctx.target?.closest?.('[data-collection="bookings"]');
            return !!container;
          },
          action(ctx) {
            const container = ctx.target?.closest?.('[data-collection="bookings"]');
            const collection = container?.dataset?.collection;
            const doc = ctx.target.closest('table') || ctx.target.closest('fieldset') || ctx.target.closest('form');
            const id = getVal($('[data-field="id"]', doc)) || doc?.id || doc?.dataset.item || ctx.rowId || '';
            if (A?.BookingOverview?.open) {
              A.BookingOverview.open(id);
            }
          },
        },

        // ── Tạo mới — find [data-collection] → A.UI.renderForm ──
        {
          id: 'ctx-create-new',
          label: 'Tạo mới',
          icon: 'fa-plus',
          iconColor: 'text-success',
          visible(ctx) {
            // Visible when there's a data-collection context
            const container = ctx.target?.closest?.('[data-collection]');
            return !!container?.dataset?.collection;
          },
          action(ctx) {
            const container = ctx.target?.closest?.('[data-collection]');
            const collection = container?.dataset?.collection;
            if (!collection) {
              typeof logA === 'function' && logA('Không tìm thấy collection.', 'warning');
              return;
            }
            typeof showConfirm === 'function'
              ? showConfirm(`Tạo mới form cho "${collection}"?`, () => {
                  if (window.A?.UI?.renderForm) {
                    window.A.UI.renderForm(collection);
                  } else {
                    typeof logA === 'function' && logA('A.UI.renderForm chưa sẵn sàng.', 'warning');
                  }
                })
              : (() => {
                  if (window.A?.UI?.renderForm) window.A.UI.renderForm(collection);
                })();
          },
        },
        {
          id: 'ctx-update-doc',
          label: 'Cập nhật',
          icon: 'fa-edit',
          iconColor: 'text-warning',
          visible(ctx) {
            // Visible when there's a data-collection context
            const container = ctx.target?.closest?.('[data-collection]');
            return !!container?.dataset?.collection;
          },
          action(ctx) {
            const container = ctx.target?.closest?.('[data-collection]');
            const collection = container?.dataset?.collection;
            if (!collection) {
              typeof logA === 'function' && logA('Không tìm thấy collection.', 'warning');
              return;
            }
            const doc = ctx.target.closest('tr') || ctx.target.closest('fieldset') || ctx.target.closest('form');
            const id = getVal($('[data-field="id"]', doc)) || doc?.id || doc?.dataset.row || ctx.rowId || '';
            typeof showConfirm === 'function'
              ? showConfirm(`Chỉnh sửa cho "${A.Lang.t(collection)}" - ${id}?`, () => {
                  if (A?.UI?.renderForm) {
                    A.UI.renderForm(collection, id || null);
                  } else {
                    typeof logA === 'function' && logA('A.UI.renderForm chưa sẵn sàng.', 'warning');
                  }
                })
              : (() => {
                  if (window.A?.UI?.renderForm) window.A.UI.renderForm(collection);
                })();
          },
        },

        '---',

        // ── Inspect (admin / debug only) ──
        {
          id: 'ctx-inspect-field',
          label: 'Inspect Field',
          icon: 'fa-bug',
          iconColor: 'text-muted',
          visible(ctx) {
            return window.CURRENT_USER?.role === 'admin' || !!window._EM_DEBUG;
          },
          action(ctx) {
            const el = ctx.focusedEl || ctx.target;
            const info = _getDocInfo(ctx);
            const field = el?.dataset?.field || el?.closest('[data-field]')?.dataset?.field || '?';
            const details = {
              tagName: el?.tagName,
              field,
              collection: info?.coll || '—',
              docId: info?.id || '—',
              value: el?.value ?? el?.textContent?.substring(0, 50),
              dirty: info ? window.StateProxy?.isDirty?.(info.coll, info.id) : false,
            };
            console.table(details);
            typeof logA === 'function' && logA(`🔍 ${field} → ${info?.coll || '?'}::${info?.id || '?'}`, 'info');
          },
        },
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Central contextmenu event handler (delegated from document).
   * Finds the matching registration by checking e.target.closest().
   *
   * @param {MouseEvent} e
   */
  #onContextMenu(e) {
    // Allow Ctrl+RightClick to show native menu (for debugging)
    if (e.ctrlKey || e.metaKey) return;

    // Find matching registration (first match wins)
    let matchedKey = null;
    let matchedReg = null;

    for (const [selector, reg] of this.#registrations) {
      if (e.target.closest(selector)) {
        matchedKey = selector;
        matchedReg = reg;
        break;
      }
    }

    if (!matchedKey || !matchedReg) return;

    e.preventDefault();
    e.stopPropagation();

    const { config, menuEl } = matchedReg;

    // Build context object
    const row = e.target.closest(config.rowSelector);
    const form = e.target.closest('form, fieldset');
    const tbody = e.target.closest('tbody');

    // Determine the editable element under cursor
    const focusedEl = _isEditable(e.target) ? e.target : e.target.closest('input, select, textarea, [contenteditable]') || null;

    const ctx = {
      event: e,
      target: e.target,
      focusedEl,
      row,
      form,
      rowIndex: row ? row.rowIndex : -1,
      rowId: row?.querySelector('.d-sid')?.value || '',
      tbody,
      selector: matchedKey,
      menuEl,
    };

    // Allow registration to enrich context
    if (typeof config.onBeforeOpen === 'function') {
      const result = config.onBeforeOpen(ctx);
      if (result === false) return;
    }

    this.#currentContext = ctx;

    // Legacy globals for backward compatibility
    if (row) {
      window.CURRENT_CTX_ROW = row;
      const sidInput = row.querySelector('.d-sid');
      window.CURRENT_CTX_ID = sidInput ? sidInput.value : '';
    }

    // Update item visibility/disabled states
    this.#updateItemStates(menuEl, config._allItems, ctx);

    // Show & position
    this.#showMenu(menuEl, e.clientX, e.clientY);

    // After-open callback
    if (typeof config.onAfterOpen === 'function') {
      config.onAfterOpen(ctx);
    }
  }

  /**
   * Hide menu when clicking outside.
   * @param {MouseEvent} e
   */
  #onDocumentClick(e) {
    if (!this.#activeMenu) return;
    if (this.#activeMenu.contains(e.target)) return;
    this.hide();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: DOM BUILDING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the menu DOM element from item definitions (recursive for submenus).
   *
   * @param {string}  menuId
   * @param {Array}   items
   * @param {boolean} [isSubmenu=false]
   * @returns {HTMLElement}
   */
  #buildMenuElement(menuId, items, isSubmenu = false) {
    const menu = document.createElement('div');
    menu.id = menuId;
    menu.className = isSubmenu ? 'ctx-submenu-children dropdown-menu shadow' : this.#config.menuClass;

    if (!isSubmenu) {
      menu.style.cssText = `
        display: none;
        position: fixed;
        z-index: ${this.#config.zIndex};
        width: fit-content;
        overflow: visible;
        border: none;
        min-width: 180px;
      `;
    }

    items.forEach((item, idx) => {
      if (item === '---' || item === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'dropdown-divider';
        menu.appendChild(divider);
        return;
      }

      // ── Submenu item (has children) ──
      if (item.children && Array.isArray(item.children)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ctx-submenu';
        wrapper.dataset.ctxId = item.id || '';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `dropdown-item gap-2 d-flex align-items-center ${item.cls || ''}`.trim();

        if (item.icon) {
          const iconEl = document.createElement('i');
          iconEl.className = `fa-solid ${item.icon} ${item.iconColor || ''}`.trim();
          iconEl.style.width = '20px';
          btn.appendChild(iconEl);
        }

        const labelEl = document.createElement('span');
        labelEl.className = 'flex-grow-1';
        labelEl.textContent = item.label || '';
        btn.appendChild(labelEl);

        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-right ms-2 small opacity-50';
        btn.appendChild(chevron);

        wrapper.appendChild(btn);

        // Build children recursively
        const subId = `${menuId}-sub-${idx}`;
        const subMenu = this.#buildMenuElement(subId, item.children, true);
        wrapper.appendChild(subMenu);

        // ── Mobile: toggle submenu on tap (hover doesn't work on touch) ──
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Close sibling submenus
          wrapper.parentElement?.querySelectorAll('.ctx-submenu.submenu-open').forEach((s) => {
            if (s !== wrapper) s.classList.remove('submenu-open');
          });
          wrapper.classList.toggle('submenu-open');
        });

        menu.appendChild(wrapper);
        return;
      }

      // ── Regular item ──
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dropdown-item gap-2 d-flex align-items-center ${item.cls || ''}`.trim();
      btn.dataset.ctxId = item.id || '';

      if (item.icon) {
        const iconEl = document.createElement('i');
        iconEl.className = `fa-solid ${item.icon} ${item.iconColor || ''}`.trim();
        iconEl.style.width = '20px';
        btn.appendChild(iconEl);
      }

      const labelEl = document.createElement('span');
      labelEl.className = 'flex-grow-1';
      labelEl.textContent = item.label || '';
      btn.appendChild(labelEl);

      if (item.shortcut) {
        const shortcutEl = document.createElement('small');
        shortcutEl.className = 'text-muted ms-3 opacity-50';
        shortcutEl.textContent = item.shortcut;
        btn.appendChild(shortcutEl);
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ctx = this.#currentContext; // save ref before hide() clears it
        this.hide();
        if (typeof item.action === 'function') {
          item.action(ctx);
        }
      });

      menu.appendChild(btn);
    });

    if (!isSubmenu) {
      document.body.appendChild(menu);
    }

    return menu;
  }

  /**
   * Recursively update visibility and disabled states for all items.
   *
   * @param {HTMLElement} menuEl
   * @param {Array}       items
   * @param {object}      ctx
   */
  #updateItemStates(menuEl, items, ctx) {
    const children = Array.from(menuEl.children);
    let childIdx = 0;

    items.forEach((item) => {
      if (item === '---' || item === 'divider') {
        childIdx++; // skip divider element
        return;
      }

      const el = children[childIdx++];
      if (!el) return;

      // ── Submenu wrapper ──
      if (item.children && Array.isArray(item.children)) {
        if (typeof item.visible === 'function') {
          el.style.display = item.visible(ctx) ? '' : 'none';
        } else {
          el.style.display = '';
        }
        // Recurse into children
        const subMenuEl = el.querySelector('.ctx-submenu-children');
        if (subMenuEl) {
          this.#updateItemStates(subMenuEl, item.children, ctx);
        }
        return;
      }

      // ── Regular button ──
      if (typeof item.visible === 'function') {
        el.style.display = item.visible(ctx) ? '' : 'none';
      } else {
        el.style.display = '';
      }

      if (typeof item.disabled === 'function') {
        const isDisabled = item.disabled(ctx);
        el.disabled = isDisabled;
        el.classList.toggle('opacity-50', isDisabled);
        el.classList.toggle('d-none', isDisabled);
      } else {
        el.disabled = false;
        el.classList.remove('opacity-50');
        el.classList.remove('d-none');
      }
    });

    this.#cleanDividers(menuEl);
  }

  /**
   * Remove visual artifacts: consecutive / leading / trailing dividers.
   * @param {HTMLElement} menuEl
   */
  #cleanDividers(menuEl) {
    const children = Array.from(menuEl.children);
    let prevWasDivider = true;

    children.forEach((child) => {
      const isDivider = child.classList.contains('dropdown-divider');
      const isHidden = child.classList.contains('d-none') || child.style.display === 'none';

      if (isDivider) {
        child.style.display = prevWasDivider ? 'none' : '';
        prevWasDivider = true;
      } else if (!isHidden) {
        prevWasDivider = false;
      }
    });

    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const isHidden = child.classList.contains('d-none') || child.style.display === 'none';
      if (isHidden) continue;
      if (child.classList.contains('dropdown-divider')) {
        child.style.display = 'none';
      }
      break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: POSITIONING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Position and display the menu near the cursor, staying on screen.
   *
   * @param {HTMLElement} menuEl
   * @param {number}      x - clientX
   * @param {number}      y - clientY
   */
  #showMenu(menuEl, x, y) {
    if (this.#activeMenu && this.#activeMenu !== menuEl) {
      this.hide();
    }

    menuEl.style.visibility = 'hidden';
    menuEl.style.display = 'block';

    const menuW = menuEl.offsetWidth;
    const menuH = menuEl.offsetHeight;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const pad = 4;

    let posX = x;
    if (x + menuW + pad > viewW) {
      posX = x - menuW;
      if (posX < pad) posX = pad;
    }

    let posY = y;
    if (y + menuH + pad > viewH) {
      posY = y - menuH;
      if (posY < pad) posY = pad;
    }

    menuEl.style.top = `${posY}px`;
    menuEl.style.left = `${posX}px`;
    menuEl.style.visibility = '';
    menuEl.classList.add(this.#config.showClass);

    // Flip submenus that overflow viewport right edge
    menuEl.querySelectorAll('.ctx-submenu').forEach((sub) => {
      const child = sub.querySelector('.ctx-submenu-children');
      if (!child) return;
      const rect = sub.getBoundingClientRect();
      const childW = child.offsetWidth || 180;
      sub.classList.toggle('flip-left', rect.right + childW > viewW - 180);
    });

    this.#activeMenu = menuEl;
    this.#activeKey = [...this.#registrations.entries()].find(([, reg]) => reg.menuEl === menuEl)?.[0] || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: CSS INJECTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inject submenu CSS once. Scoped to .ctx-submenu to avoid conflicts.
   */
  #injectStyles() {
    if (this.#stylesInjected) return;
    this.#stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'ctx-menu-styles';
    style.textContent = `
      /* ── Context Menu: Submenu Flyout ── */
      .ctx-submenu {
        position: relative;
      }
      .ctx-submenu > .ctx-submenu-children {
        display: none;
        position: absolute;
        left: 100%;
        top: 0;
        min-width: 180px;
        z-index: 1;
      }
      .ctx-submenu:hover > .ctx-submenu-children,
      .ctx-submenu:focus-within > .ctx-submenu-children {
        display: block;
      }
      /* Flip to left when overflowing viewport */
      .ctx-submenu.flip-left > .ctx-submenu-children {
        left: auto;
        right: 100%;
      }
      /* Item styling */
      .context-menu .dropdown-item,
      .ctx-submenu-children .dropdown-item {
        font-size: 0.82rem;
        padding: 0.35rem 0.75rem;
      }
      .context-menu .dropdown-item:disabled,
      .ctx-submenu-children .dropdown-item:disabled {
        pointer-events: none;
        opacity: 0.5;
      }
      /* ── Mobile: vertical submenu layout + tap toggle ── */
      @media (pointer: coarse) {
        /* Override hover/focus flyout — sticky hover on touch would show submenu permanently */
        .ctx-submenu > .ctx-submenu-children,
        .ctx-submenu:hover > .ctx-submenu-children,
        .ctx-submenu:focus-within > .ctx-submenu-children {
          display: none;
        }

        /* JS tap toggle: stack submenu vertically below parent (not horizontal flyout) */
        .ctx-submenu.submenu-open > .ctx-submenu-children {
          display: block;
          position: static;
          left: auto;
          right: auto;
          box-shadow: none;
          border: none;
          border-left: 2px solid rgba(var(--bs-primary-rgb, 13,110,253), 0.25);
          margin: 0;
          padding: 0 0 0 0.25rem;
          min-width: unset;
          width: 100%;
          background: inherit;
        }

        /* Chevron rotation indicator for open/closed state */
        .ctx-submenu > button > .fa-chevron-right {
          transition: transform 0.15s ease;
        }
        .ctx-submenu.submenu-open > button > .fa-chevron-right {
          transform: rotate(90deg);
        }

        /* Context menu container: scrollable + viewport-safe */
        .context-menu {
          min-width: 230px;
          max-width: calc(100vw - 16px);
          max-height: calc(100vh - 32px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================================
  // ★ BUILT-IN: Booking Detail Table Context Menu
  // =========================================================================

  /**
   * Register the default booking context menu for #tbl-booking-form tbody.
   * Migrated from EventManager._setupBkFormCtm / _setupBkFormCtmBtn.
   *
   * Items: Copy Row (JSON), Paste Row (JSON), Clone, Save 1 row, Delete row, Delete Booking.
   */
  _registerBookingContextMenu() {
    this.register('#tbl-booking-form tbody', {
      id: 'bookingContextMenu',
      rowSelector: 'tr',

      onBeforeOpen(ctx) {
        const { row } = ctx;
        if (!row) return false;

        const collection = _getCollection(ctx);
        const tbody = document.getElementById('detail-tbody');

        window.CURRENT_CTX_ROW = row;
        const sidInput = row.querySelector('.d-sid');
        window.CURRENT_CTX_ID = sidInput ? sidInput.value : '';

        if (typeof getRowData === 'function') {
          window.CURRENT_ROW_DATA = getRowData(collection, row, tbody);
        }
      },

      items: [
        // ── Copy Row Data → Clipboard (JSON) ──
        {
          id: 'ctx-copyData',
          label: 'Copy (Hàng)',
          icon: 'fa-copy',
          iconColor: 'text-primary',
          shortcut: 'JSON',
          async action() {
            if (!window.CURRENT_ROW_DATA) return;
            try {
              await navigator.clipboard.writeText(JSON.stringify(window.CURRENT_ROW_DATA));
              typeof logA === 'function' && logA('✅ Copied row to clipboard!', 'success');
            } catch (err) {
              typeof logError === 'function' && logError('❌ Copy failed: ' + err.message);
            }
          },
        },

        // ── Paste Row Data ← Clipboard (JSON) ──
        {
          id: 'ctx-paste',
          label: 'Dán (Hàng)',
          icon: 'fa-paste',
          iconColor: 'text-success',
          shortcut: 'JSON',
          async action(ctx) {
            if (!ctx.row) {
              typeof logA === 'function' && logA('❌ Vui lòng chọn một dòng để dán.', 'error', 'alert');
              return;
            }
            try {
              const text = await navigator.clipboard.readText();
              if (!text) {
                typeof logA === 'function' && logA('❌ Clipboard trống!', 'warning', 'alert');
                return;
              }
              const pastedData = JSON.parse(text);
              const collection = _getCollection(ctx);
              if (typeof setRowDataByField === 'function') {
                setRowDataByField(collection, pastedData, ctx.row);
              }
            } catch (err) {
              console.error('[ContextMenu] Paste error:', err);
              typeof logA === 'function' && logA('❌ Dữ liệu clipboard không hợp lệ.', 'error', 'alert');
            }
          },
        },

        // ── Clone (Duplicate Row) ──
        {
          id: 'ctx-clone',
          label: 'Clone (Hàng)',
          icon: 'fa-clone',
          iconColor: 'text-primary',
          action(ctx) {
            if (typeof copyRow === 'function' && ctx.row) {
              copyRow(ctx.row);
            }
          },
        },

        '---',

        // ── Save 1 Row ──
        {
          id: 'ctx-save-one',
          label: 'Save (1 Hàng)',
          icon: 'fa-floppy-disk',
          cls: 'text-success',
          async action() {
            if (window.CURRENT_CTX_ROW && window.CURRENT_ROW_DATA && window.A?.DB) {
              const collection = _getCollection(ctx);
              const res = await window.A.DB.saveRecord(collection, window.CURRENT_ROW_DATA);
              if (res?.success) {
                typeof logA === 'function' && logA('✅ Lưu thành công!', 'success');
              }
            }
          },
        },

        '---',

        // ── Delete 1 Row ──
        {
          id: 'ctx-delete',
          label: 'Delete (1 Hàng)',
          icon: 'fa-trash',
          action(ctx) {
            if (ctx.rowId) {
              const collection = _getCollection(ctx);
              if (typeof deleteItem === 'function') deleteItem(ctx.rowId, collection);
            } else {
              typeof logA === 'function' &&
                logA('❓ Dòng chưa lưu. Xóa khỏi giao diện?', 'info', () => {
                  if (ctx.row) ctx.row.remove();
                });
            }
          },
        },

        '---',

        // ── Delete Booking (from Database) ──
        {
          id: 'ctx-delete-bk',
          label: 'Xóa Booking (DB)',
          icon: 'fa-trash-can',
          cls: 'text-danger',
          action() {
            const bkId = typeof getVal === 'function' ? getVal('BK_ID') : '';
            if (bkId) {
              if (typeof deleteItem === 'function') {
                deleteItem(bkId, 'bookings');
                window.refreshForm?.();
              }
            } else {
              typeof logA === 'function' &&
                logA('❓ Booking chưa lưu. Xóa khỏi giao diện?', 'info', () => {
                  window.refreshForm?.();
                });
            }
          },
        },
      ],
    });
  }

  // =========================================================================
  // ★ BUILT-IN: Global Input/Select/Textarea Context Menu
  // =========================================================================

  /**
   * Register a default Edit-only context menu for all editable form elements
   * that are NOT inside an already-registered area.
   * Uses event delegation — a single listener covers all current & future inputs.
   *
   * Edit items are rendered as top-level menu items (no submenu nesting)
   * for quicker access on global inputs.
   *
   * Registered AFTER booking menu so booking inputs match their richer menu first.
   */
  _registerGlobalInputMenu() {
    // Extract edit submenu children as flat top-level items
    const editSubmenu = this.#getDefaultEditSubmenu();
    this.register('input, select, textarea, #grid-body', {
      id: 'globalInputContextMenu',
      rowSelector: 'tr',
      includeEditSubmenu: false,
      items: editSubmenu.children || [],
    });
  }
}

// =========================================================================
// 4. EXPORT
// =========================================================================
export default ContextMenu;
