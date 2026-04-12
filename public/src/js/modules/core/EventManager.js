// @ts-nocheck
/**Logg
 * =========================================================================
 * EVENT MANAGER - Quản lý tập trung tất cả sự kiện
 * =========================================================================
 * Purpose: Gắn tất cả event listeners cho ứng dụng
 * Dependencies: utils.js (getVal, setVal, log, this.on)
 */
class EventManager {
  constructor() {
    this._initialized = false;
    this.modules = {};
    /** @type {Map<string, { target: any, eventNames: string, options: any, cleaners: Set<Function>, count: number }>} */
    this._listenerRegistry = new Map();
  }

  async init() {
    if (this._initialized) {
      console.warn('[EventManager] Đã khởi tạo rồi, bỏ qua...');
      return;
    }

    try {
      // 1. Gắn events từ các module con
      this._setupServerActionEvents();
      // this._setupGridFilterEvents();
      this._setupSearchEvents();
      this._setupFormEvents();
      this._setupNumberInputEvents();
      // Context menu migrated to M_ContextMenu.js (managed by A.ContextMenu)
      this._setupKeyboardNavEvents();
      this.setupGlobalEvents();

      this._initialized = true;
      L._('[EventManager] ✅ Tất cả events đã khởi tạo', 'success');
    } catch (err) {
      console.error('[EventManager] ❌ Lỗi khởi tạo:', err);
      Opps(err.message);
    }
  }

  // =========================================================================
  // SECTION 1: CORE - EVENT REGISTRATION WITH AUTO-CLEANUP
  // =========================================================================

  /**
   * Tạo signature key duy nhất từ tham số để nhận dạng listener.
   * Dùng để tự động cleanup khi gán lại cùng target+event.
   *
   * @param {string|Element|NodeList} target
   * @param {string} eventNames
   * @param {Object|boolean} options
   * @returns {string} key - vd: '#btn-save::click', 'document::.btn-save::click'
   */
  _makeKey(target, eventNames, options) {
    const isLazy = options === true;
    let targetStr;

    if (isLazy) {
      // Lazy mode: target là selector, gắn vào document
      targetStr = `document::${target}`;
    } else if (typeof target === 'string') {
      targetStr = target;
    } else if (target && target.nodeType) {
      // DOM Element: dùng id nếu có, fallback tagName + dataset
      targetStr = target.id ? `#${target.id}` : `<${target.tagName.toLowerCase()}>[${target.className || 'no-class'}]`;
    } else if (target && target.length) {
      // NodeList/Array: dùng length + first item làm key
      targetStr = `nodelist[${target.length}]::${target[0]?.id || target[0]?.tagName || 'unknown'}`;
    } else {
      targetStr = String(target);
    }

    // Chuẩn hóa eventNames (sort để 'click change' === 'change click')
    const normalizedEvents = (eventNames || '').split(' ').filter(Boolean).sort().join('+');

    return `${targetStr}::${normalizedEvents}`;
  }

  /**
   * Gắn event listener với hỗ trợ delegation, auto-cleanup và registry tracking.
   *
   * ★ TỰ ĐỘNG CLEANUP: Nếu cùng target+eventNames đã được gán trước đó,
   *   hàm sẽ tự xóa listener cũ trước khi gán mới — không cần gọi off() thủ công.
   *
   * @param {string|Element|NodeList} target - Selector hoặc Element đích
   * @param {string} eventNames - Tên sự kiện (vd: 'click change')
   * @param {Function} handler - Hàm xử lý
   * @param {Object|boolean} [options={}] - Options chuẩn HOẶC true để bật Lazy Delegation
   * @param {boolean} [allowMultiple=false] - true = cho phép gán nhiều handler cùng key (bỏ qua auto-cleanup)
   * @returns {Function} cleaner - Hàm để remove listener thủ công nếu cần
   */
  on(target, eventNames, handler, options = {}, allowMultiple = false) {
    // ── 1. CHUẨN HÓA THAM SỐ ──────────────────────────────────────────────
    const isLazy = options === true;
    const delegateSelector = isLazy ? target : typeof options === 'object' && options !== null ? options.delegate || null : null;
    const events = (eventNames || '').split(' ').filter((e) => e.trim());

    // Guard: eventNames rỗng
    if (!events.length) {
      L._(`[EventManager.on] eventNames rỗng, bỏ qua.`, 'warning');
      return () => {};
    }

    // ── 2. XÁC ĐỊNH PHẦN TỬ ĐỂ GẮN SỰ KIỆN ──────────────────────────────
    let els = [];

    if (isLazy) {
      // Lazy Delegation: luôn gắn vào document (không bao giờ null)
      els = [document];
    } else {
      try {
        if (!target) {
          L._(`[EventManager.on] Target null for "${eventNames}"`, 'warning');
          return () => {};
        }
        if (typeof target === 'string') {
          els = Array.from(document.querySelectorAll(target));
          // Warn nếu selector không match phần tử nào (chỉ với direct mode)
          if (!els.length && A.getConfig('debug')) {
            L._(`[EventManager.on] Selector không tìm thấy phần tử: "${target}"`, 'warning');
          }
        } else if (target && target.nodeType) {
          els = [target];
        } else if (target && target.length) {
          els = Array.from(target);
        }
      } catch (err) {
        L._(`[EventManager.on] Selector error: ${err.message}`, 'error');
        return () => {};
      }

      // Direct mode: không có element → trả về sớm (không cleanup)
      if (!els.length) return () => {};
    }

    // ── 3. AUTO-CLEANUP: Xóa listener cũ nếu cùng signature ───────────────
    const sigKey = this._makeKey(target, eventNames, options);

    if (!allowMultiple && this._listenerRegistry.has(sigKey)) {
      const entry = this._listenerRegistry.get(sigKey);
      entry.cleaners.forEach((fn) => fn());
      this._listenerRegistry.delete(sigKey);
      if (A.getConfig('debug')) {
        L._(`[EventManager] ♻️ Auto-cleanup: "${sigKey}"`, 'warning');
      }
    }

    // ── 4. XỬ LÝ NATIVE OPTIONS ──────────────────────────────────────────
    const { delegate, ...nativeOpts } = typeof options === 'object' && options !== null ? options : {};

    // ── 5. MAIN HANDLER với tracking activation count ─────────────────────
    const finalHandler = (e) => {
      try {
        let matched = null;
        if (delegateSelector) {
          if (typeof delegateSelector === 'string') {
            matched = e.target?.closest(delegateSelector);
          } else if (delegateSelector.nodeType && delegateSelector.contains(e.target)) {
            matched = delegateSelector;
          }

          if (matched && e.currentTarget.contains(matched)) {
            // Increment count for this specific registration
            const entry = this._listenerRegistry.get(sigKey);
            if (entry) entry.count++;

            handler.call(matched, e, matched);
          }
        } else {
          // Increment count
          const entry = this._listenerRegistry.get(sigKey);
          if (entry) entry.count++;

          handler.call(e.currentTarget, e, e.currentTarget);
        }
      } catch (handlerErr) {
        if (typeof Opps === 'function') {
          Opps(`[EventManager] Handler error (${eventNames}): ${handlerErr.message}`);
        } else {
          console.error('[EventManager] Handler error:', handlerErr);
        }
      }
    };

    // ── 6. ATTACH LISTENERS ───────────────────────────────────────────────
    els.forEach((el) => {
      events.forEach((evt) => el.addEventListener(evt, finalHandler, nativeOpts));
    });

    // ── 7. TẠO CLEANER + LƯU VÀO REGISTRY ────────────────────────────────
    const cleaner = () => {
      els.forEach((el) => {
        events.forEach((evt) => el.removeEventListener(evt, finalHandler, nativeOpts));
      });
      const entry = this._listenerRegistry.get(sigKey);
      if (entry) {
        entry.cleaners.delete(cleaner);
        if (entry.cleaners.size === 0) this._listenerRegistry.delete(sigKey);
      }
    };

    if (!this._listenerRegistry.has(sigKey)) {
      this._listenerRegistry.set(sigKey, {
        target,
        eventNames,
        options,
        cleaners: new Set(),
        count: 0,
      });
    }
    this._listenerRegistry.get(sigKey).cleaners.add(cleaner);

    return cleaner;
  }

  /**
   * Xóa listener theo signature key (target + eventNames).
   */
  off(target, eventNames, options = {}) {
    const sigKey = this._makeKey(target, eventNames, options);

    if (!this._listenerRegistry.has(sigKey)) {
      L._(`[EventManager.off] Key không tồn tại: "${sigKey}"`, 'warning');
      return;
    }

    const entry = this._listenerRegistry.get(sigKey);
    entry.cleaners.forEach((fn) => fn());
    this._listenerRegistry.delete(sigKey);
    L._(`[EventManager] 🗑️ Removed: "${sigKey}"`, 'info');
  }

  /**
   * Lấy danh sách các sự kiện đang ảnh hưởng đến một element.
   * Bao gồm cả sự kiện gắn trực tiếp và sự kiện delegation.
   *
   * @param {HTMLElement} el
   * @returns {Array<{ event: string, selector: string, count: number, type: string }>}
   */
  getListenersForElement(el) {
    if (!el || !el.nodeType) return [];
    const results = [];

    for (const [sigKey, entry] of this._listenerRegistry.entries()) {
      const { target, eventNames, options, count } = entry;
      const isLazy = options === true;
      const delegateSelector = isLazy ? target : options?.delegate || null;

      // 1. Kiểm tra Direct Listener
      if (!delegateSelector) {
        let isMatch = false;
        if (target === el) isMatch = true;
        else if (typeof target === 'string' && el.matches(target)) isMatch = true;
        else if (target && (target.length !== undefined || Array.isArray(target))) {
          // Xử lý NodeList hoặc Array
          isMatch = Array.from(target).includes(el);
        }

        if (isMatch) {
          results.push({
            event: eventNames,
            selector: typeof target === 'string' ? target : target.id ? `#${target.id}` : `<${target.tagName?.toLowerCase()}>`,
            count: count,
            type: 'Direct',
          });
        }
      }
      // 2. Kiểm tra Delegated Listener
      else {
        if (typeof delegateSelector === 'string' && el.matches(delegateSelector)) {
          results.push({
            event: eventNames,
            selector: delegateSelector,
            count: count,
            type: 'Delegated',
          });
        }
      }
    }
    return results;
  }

  /**
   * Xóa toàn bộ listeners (dùng khi destroy EventManager).
   */
  destroy() {
    let total = 0;
    this._listenerRegistry.forEach((entry) => {
      entry.cleaners.forEach((fn) => fn());
      total += entry.cleaners.size;
    });
    this._listenerRegistry.clear();
    this._initialized = false;
    L._(`[EventManager] 🗑️ Đã destroy ${total} listener(s)`, 'warning');
  }

  // Hàm trigger event thủ công (nếu cần)
  trigger(selector, eventName) {
    const el = $(selector);
    if (el) el.dispatchEvent(new Event(eventName));
  }

  /**
   * =========================================================================
   * SECTION 2: SERVER ACTION EVENTS
   * =========================================================================
   */
  _setupServerActionEvents() {
    this.on(
      '.btn-server-action',
      'click',
      (e, target) => {
        this._handleServerAction(e, target);
      },
      true
    );
  }

  async _handleServerAction(e, target) {
    e.preventDefault();

    const funcName = target.dataset.func;
    const argsRaw = target.dataset.args;
    const confirmMsg = target.dataset.confirm;
    const confirmType = target.dataset.confirmType || 'warning';

    if (!funcName) {
      L._('❌ Thiếu data-func trên nút', 'error');
      return;
    }

    let args = null;
    if (argsRaw) {
      try {
        args = JSON.parse(argsRaw);
      } catch (err) {
        logA('❌ Lỗi cấu trúc JSON trên nút bấm!', false);
        return;
      }
    }

    const runAction = async () => {
      try {
        if (args) {
          await requestAPI(funcName, args);
        } else {
          await requestAPI(funcName);
        }
      } catch (err) {
        Opps(`Lỗi gọi ${funcName}: ${err.message}`);
      }
    };

    if (confirmMsg) {
      logA(confirmMsg, confirmType, runAction);
    } else {
      await runAction();
    }
  }

  /**
   * =========================================================================
   * SECTION 3: GRID FILTER & SORT EVENTS
   * =========================================================================
   */
  // _setupGridFilterEvents() {
  //   this.on(
  //     '#btn-data-filter',
  //     'click',
  //     () => {
  //       if (window.FILTER_ACTIVE) {
  //         if (typeof resetGridData === 'function') {
  //           resetGridData();
  //         }
  //       } else {
  //         if (typeof applyGridFilterThrottled === 'function') {
  //           applyGridFilterThrottled();
  //         }
  //       }
  //     },
  //     true
  //   );

  //   this.on(
  //     '#filter-val',
  //     'input',
  //     () => {
  //       if (typeof applyGridFilterThrottled === 'function') {
  //         applyGridFilterThrottled();
  //       }
  //     },
  //     true
  //   );

  //   this.on(
  //     '#filter-val',
  //     'change',
  //     () => {
  //       if (typeof applyGridFilterThrottled === 'function') {
  //         applyGridFilterThrottled();
  //       }
  //     },
  //     true
  //   );

  //   this.on(
  //     '#btn-data-sort',
  //     'click',
  //     () => {
  //       if (typeof applyGridSorter === 'function') {
  //         applyGridSorter();
  //       }
  //     },
  //     true
  //   );
  //   this.on(
  //     '#btn-reload-collection',
  //     'click',
  //     () => {
  //       if (typeof A.DB.syncDelta === 'function') {
  //         A.DB.syncDelta(getVal('btn-select-datalist') || null, true);
  //       }
  //     },
  //     true
  //   );
  //   this.on(
  //     '#btn-sync-delta-collection',
  //     'click',
  //     () => {
  //       if (typeof A.DB.syncDelta === 'function') {
  //         L._('Start Delta Sync');
  //         A.DB.syncDelta();
  //       }
  //     },
  //     true
  //   );
  //   this.on(
  //     '#btn-select-datalist',
  //     'change',
  //     async (e) => {
  //       const el = e.target;
  //       const selectedKey = el.value;
  //       CURRENT_TABLE_KEY = selectedKey;
  //       // STATE_TABLE['tab-data-tbl'].groupByField = null;
  //       if (getE('tbl-tab-data-tbl')) {
  //         A.UI.createTable('tab-data-tbl', { colName: selectedKey, data: APP_DATA[`${selectedKey}`] });
  //         A.UI.initBtnSelectDataList();
  //         getE('btn-select-datalist').value = selectedKey;
  //         A.UI.iniGroupByOps('tab-data-tbl');
  //       }
  //     },
  //     true
  //   );
  // }

  /**
   * =========================================================================
   * SECTION 4: SEARCH EVENTS
   * =========================================================================
   */
  _setupSearchEvents() {
    this.on(
      '#global-search',
      'keyup',
      (e) => {
        if (e.key === 'Enter') {
          if (typeof initGlobalTableSearch === 'function') {
            initGlobalTableSearch();
          }
        }
      },
      true
    );
    this.on(
      '#booking-search',
      'keyup',
      (e) => {
        if (e.key === 'Enter') {
          if (typeof handleBookingSearch === 'function') {
            handleBookingSearch();
          }
        }
      },
      true
    );
  }

  /**
   * =========================================================================
   * SECTION 5: FORM EVENTS (Booking)
   * =========================================================================
   */
  _setupFormEvents() {
    this.on(
      '#BK_Start',
      'change',
      (e, target) => {
        if (typeof SYS.runFnByRole === 'function') SYS.runFnByRole('autoSetOrCalcDate', 'Logic', target.value, 'BK_PayDue');
        const startDate = new Date(target.value);
        const endDate = new Date(getVal('BK_End'));
        if (startDate && endDate && endDate < startDate) {
          setVal('BK_End', formatDateForInput(target.value));
        }
      },
      true
    );

    this.on(
      '#tab-form-btn-save-cust',
      'click',
      async (e) => {
        if (typeof SalesModule.DB.saveCustomer === 'function') {
          await SalesModule.DB.saveCustomer();
        }
      },
      true
    );
    this.on(
      '#tab-form-btn-new-deposit',
      'click',
      async (e) => {
        const module = await import('@acc/controller_accountant.js');
        if (module && module.default) {
          const AccountantCtrl = module.default;
          await AccountantCtrl.openTransactionModal('IN');
          setVal('inp-amount-show', getVal('BK_Balance') * 1000);
          const inpBkId = $("[data-field='booking_id']", getE('dynamic-modal-body'));
          if (inpBkId) {
            setVal(inpBkId, getVal('BK_ID'));
          }
        }
      },
      true
    );
  }

  /**
   * =========================================================================
   * SECTION 6: NUMBER INPUT EVENTS (With Debounce) --- DEPRECATED
   * =========================================================================
   */
  _setupNumberInputEvents() {
    const numberInputSelector = 'input[type="number"]:not([disabled]), input.number:not([disabled])';

    this.on(
      numberInputSelector,
      'input',
      (e, target) => {
        if (target._debounceTimer) {
          clearTimeout(target._debounceTimer);
        }
        const debounceMs = window.A?.getConfig?.('number_input_debounce_ms') ?? 850;
        target._debounceTimer = setTimeout(() => {
          setNum(target, target.value);
          const tr = target.closest('tr');
          if (tr && typeof SYS.runFnByRole === 'function') {
            if (!window.CURRENT_CTX_ROW) {
              window.CURRENT_CTX_ROW = tr;
            }
            const rowId = tr.dataset.row || tr.id.replace('row-', '');
            SYS.runFnByRole('calcRow', 'Logic', rowId);
          }
          delete target._debounceTimer;
        }, debounceMs);
      },
      true
    );

    this.on(
      'input.number',
      'click',
      (e) => {
        const el = e.target;
        if (getVal(el) > 0) return;
        e.preventDefault();
        el.select();
      },
      true
    );
  }
  async _pasteFromClipboard() {
    if (!window.CURRENT_CTX_ROW) {
      logA('❌ Lỗi: Vui lòng chọn một dòng để dán.', 'error', 'alert');
      return;
    }

    try {
      const textFromClipboard = await navigator.clipboard.readText();
      if (!textFromClipboard) {
        logA('❌ Clipboard trống!', 'warning', 'alert');
        return;
      }

      const pastedData = JSON.parse(textFromClipboard);
      const collectionName = window.CURRENT_USER?.role === 'op' ? 'operator_entries' : 'booking_details';

      if (typeof setRowDataByField === 'function') {
        setRowDataByField(collectionName, pastedData, window.CURRENT_CTX_ROW);
      }
    } catch (err) {
      console.error('[EventManager] Paste error:', err);
      Opps('❌ Lỗi: Dữ liệu clipboard không hợp lệ.', err);
    }
  }

  /**
   * =========================================================================
   * SECTION 8: KEYBOARD NAVIGATION EVENTS
   * =========================================================================
   */
  _setupKeyboardNavEvents() {
    this.on(
      '#detail-tbody',
      'keydown',
      (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        const isEnter = e.key === 'Enter';
        const isDown = e.key === 'ArrowDown';
        const isUp = e.key === 'ArrowUp';
        const isLeft = e.key === 'ArrowLeft';
        const isRight = e.key === 'ArrowRight';
        const isD = e.key === 'd' || e.key === 'D';

        if (!isEnter && !isCtrl) return;

        const currentInput = e.target;
        if (currentInput.tagName !== 'INPUT' && currentInput.tagName !== 'SELECT') return;

        const currentTr = currentInput.closest('tr');
        if (!currentTr) return;

        const allInputs = Array.from(currentTr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select'));
        const inputIndex = allInputs.indexOf(currentInput);

        if (inputIndex === -1) return;

        if (isEnter || (isCtrl && isDown)) {
          e.preventDefault();
          let nextTr = currentTr.nextElementSibling;

          if (!nextTr) {
            if (typeof copyRow === 'function') {
              copyRow();
            } else if (typeof SYS.runFnByRole === 'function') {
              SYS.runFnByRole('addDetailRow', 'UI');
            }
            nextTr = document.querySelector('#detail-tbody')?.lastElementChild;
          }

          this._focusCell(nextTr, inputIndex);
        } else if (isCtrl && isUp) {
          e.preventDefault();
          const prevTr = currentTr.previousElementSibling;
          if (prevTr) this._focusCell(prevTr, inputIndex);
        } else if (isCtrl && isLeft) {
          e.preventDefault();
          if (inputIndex > 0) {
            const targetInput = allInputs[inputIndex - 1];
            if (targetInput) {
              targetInput.focus();
              targetInput.select?.();
            }
          }
        } else if (isCtrl && isRight) {
          e.preventDefault();
          if (inputIndex < allInputs.length - 1) {
            const targetInput = allInputs[inputIndex + 1];
            if (targetInput) {
              targetInput.focus();
              targetInput.select?.();
            }
          }
        } else if (isCtrl && isD) {
          e.preventDefault();
          const prevTr = currentTr.previousElementSibling;
          if (prevTr) {
            const prevInputs = Array.from(prevTr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select'));
            const sourceInput = prevInputs[inputIndex];

            if (sourceInput) {
              this._copyValueSmart(sourceInput, currentInput);
              currentInput.classList.add('bg-success', 'bg-opacity-10');
              setTimeout(() => currentInput.classList.remove('bg-success', 'bg-opacity-10'), 200);
            }
          }
        }
      },
      true
    );

    this.on(
      '#main-form',
      'focus',
      (e) => {
        const currentInput = e.target;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(currentInput.tagName)) {
          currentInput.select?.();
        }
      },
      true
    );
  }

  _focusCell(tr, index) {
    if (!tr) return;
    const inputs = Array.from(tr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select'));
    const target = inputs[index];
    if (target) {
      target.focus();
      target.select?.();
    }
  }

  _copyValueSmart(sourceEl, targetEl) {
    targetEl.value = sourceEl.value;
    if (sourceEl.dataset.val !== undefined) {
      targetEl.dataset.val = sourceEl.dataset.val;
    } else {
      delete targetEl.dataset.val;
    }
    targetEl.dispatchEvent(new Event('change', { bubbles: true }));
    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async setupGlobalEvents() {
    window.addEventListener('beforeunload', () => {
      A.DB.stopNotificationsListener();
      L._('[EventManager] ✅ Đã hủy tất cả subscription');
    });

    const handleRowClick = (e) => {
      if (!e || !e.target || typeof e.target.closest !== 'function' || getE('detail-tbody')?.contains(e.target)) return;

      const table = e.target.closest('table');
      if (!table) return;

      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const tr = e.target.closest('tr');
      if (!tr) return;
      const coll = table.dataset.collection;
      const trId = tr.id || tr.dataset.item;

      if (!trId) return;
      let bookingId = String(trId);

      // 1. TÁCH BOOKING_ID TỪ CHUỖI ID (Không cần query database)
      // Kiểm tra nếu ID bắt đầu bằng 5 chữ số và theo sau là dấu "_" (VD: 12345_xyz)
      const idMatch = bookingId.match(/^(\d{5})_/);
      let collName;
      if (idMatch) {
        bookingId = idMatch[1]; // Lấy đúng 5 chữ số đầu tiên làm booking_id
      }

      LogicBase.onGridRowClick(bookingId, 'bookings');
    };

    this.on(
      'tr',
      'dblclick',
      (e) => {
        e.preventDefault();
        if (e.key !== 'Ctrl') return;
        L._('EventManager.on tr dblclick + Ctrl');
        if (getE('#detail-tbody')?.contains(e.target) || getE('#bkov-detail-tbody')?.contains(e.target) || getE('#bkov-txn-tbody')?.contains(e.target)) return;
        handleRowClick(e);
      },
      true
    );
    this.on(
      'tr',
      'click',
      (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        if (!isCtrl) return;
        if (getE('#detail-tbody')?.contains(e.target) || getE('#bkov-detail-tbody')?.contains(e.target) || getE('#bkov-txn-tbody')?.contains(e.target)) return;
        handleRowClick(e);
      },
      true
    );
  }
}
export default EventManager;
