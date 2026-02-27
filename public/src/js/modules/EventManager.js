// @ts-nocheck
/**
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
    }

    async init() {
        if (this._initialized) {
            console.warn('[EventManager] Đã khởi tạo rồi, bỏ qua...');
            return;
        }

        try {
            log('[EventManager] 🚀 Khởi tạo sự kiện...');
            // 1. Gắn events từ các module con
            this._setupModalEvents();
            this._setupServerActionEvents();
            this._setupGridFilterEvents();
            this._setupSearchEvents();
            this._setupFormEvents();
            this._setupNumberInputEvents();
            this._setupBkFormCtm();
            this._setupKeyboardNavEvents();
            this.setupGlobalEvents();

            this._initialized = true;
            log('[EventManager] ✅ Tất cả events đã khởi tạo', 'success');
        } catch (err) {
            console.error('[EventManager] ❌ Lỗi khởi tạo:', err);
            logError(err.message);
        }
    }

    // @ts-nocheck
    /**
     * Gắn event listener với hỗ trợ delegation
     */
    on(target, eventNames, handler, options) {
        // 1. CHUẨN HÓA THAM SỐ
        if (options === undefined) options = {};
        const isLazy = (options === true);
        const delegateSelector = isLazy ? target : (typeof options === 'object' ? options.delegate : null);
        const events = (eventNames || '').split(' ').filter(e => e.trim());

        // 2. XÁC ĐỊNH PHẦN TỬ
        let els = [];

        if (isLazy) {
            // Lazy/Delegation: Gán vào Document
            els = [document];
        } else {
            // Direct: Gán vào Element(s)
            try {
                if (typeof target === 'string') {
                    els = Array.from(document.querySelectorAll(target));
                } else if (target && target.nodeType) {
                    els = [target];
                } else if (target && target.length) {
                    els = Array.from(target);
                }
            } catch (err) {
                console.error('[EventManager.setE] Target Error:', err);
                return;
            }
        }

        if (!els.length || !events.length) return;

        // 3. MAIN HANDLER
        const nativeOpts = (typeof options === 'object' && options !== true)
            ? { ...options, delegate: undefined }
            : {};

        const finalHandler = (e) => {
            if (delegateSelector) {
                // Delegation mode: tìm phần tử khớp selector
                const matched = e.target.closest(delegateSelector);
                if (matched && e.currentTarget.contains(matched)) {
                    handler.call(matched, e, matched);
                }
            } else {
                // Direct mode: gọi trên phần tử hiện tại
                handler.call(e.currentTarget, e, e.currentTarget);
            }
        };

        // 4. ATTACH EVENT
        els.forEach(el => {
            events.forEach(evt => {
                el.addEventListener(evt, finalHandler, nativeOpts);
            });
        });
    }

    // Hàm trigger event thủ công (nếu cần)
    trigger(selector, eventName) {
        const el = document.querySelector(selector);
        if (el) el.dispatchEvent(new Event(eventName));
    }

    _setupModalEvents() {
        // Nút Batch Create Data
        const btnBatchCreate = document.getElementById('btn-batch-create-data');
        if (btnBatchCreate && A.FirestoreDataTableManager) {
            btnBatchCreate.addEventListener('click', async (e) => {
                log('[BATCH CREATE DATA] Bắt đầu tạo dữ liệu mẫu...');
                let modal = document.querySelector('at-modal-full');
                if (!modal) {
                    console.warn('[EventManager] Modal not found, creating...');
                    modal = document.createElement('at-modal-full');
                    document.body.appendChild(modal);
                }
                new A.FirestoreDataTableManager('dynamic-modal-full-body');
                modal.show(null, 'Tạo Dữ Liệu Mẫu');
                modal.setFooter?.(false);
            });
        }
    }

    /**
     * =========================================================================
     * SECTION 2: SERVER ACTION EVENTS
     * =========================================================================
     */
    _setupServerActionEvents() {
        // Sử dụng event delegation cho tất cả nút .btn-server-action
        this.on('.btn-server-action', 'click', (e, target) => {
            this._handleServerAction(e, target);
        }, true); // true = event delegation
    }

    async _handleServerAction(e, target) {
        e.preventDefault();

        const funcName = target.dataset.func;
        const argsRaw = target.dataset.args;
        const confirmMsg = target.dataset.confirm;
        const confirmType = target.dataset.confirmType || 'warning';

        if (!funcName) {
            log('❌ Thiếu data-func trên nút', 'error');
            return;
        }

        // Parse arguments
        let args = null;
        if (argsRaw) {
            try {
                args = JSON.parse(argsRaw);
            } catch (err) {
                showNotify('❌ Lỗi cấu trúc JSON trên nút bấm!', false);
                return;
            }
        }

        // Define action
        const runAction = async () => {
            try {
                if (args) {
                    await requestAPI(funcName, args);
                } else {
                    await requestAPI(funcName);
                }
            } catch (err) {
                logError(`Lỗi gọi ${funcName}: ${err.message}`);
            }
        };

        // Execute with or without confirmation
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
    _setupGridFilterEvents() {
        // Nút Lọc — click lần 1: áp dụng filter; click lần 2: reset về dữ liệu gốc
        this.on('#btn-data-filter', 'click', () => {
            if (window.FILTER_ACTIVE) {
                // Second click → toggle off: reset PG_DATA and clear UI
                if (typeof resetGridData === 'function') {
                    resetGridData();
                }
            } else {
                if (typeof applyGridFilter === 'function') {
                    applyGridFilter();
                }
            }
        }, true);

        // Input Filter — dùng throttle để giới hạn số lần chạy khi gõ liên tục
        this.on('#filter-val', 'input', () => {
            if (typeof applyGridFilterThrottled === 'function') {
                applyGridFilterThrottled();
            }
        }, true);

        // Vẫn bắt thêm 'change' để đảm bảo chạy khi giá trị thay đổi
        // (ví dụ: chọn từ datalist, paste, blur)
        this.on('#filter-val', 'change', () => {
            if (typeof applyGridFilter === 'function') {
                applyGridFilter();
            }
        }, true);

        // Nút Sắp xếp
        this.on('#btn-data-sort', 'click', () => {
            if (typeof applyGridSorter === 'function') {
                applyGridSorter();
            }
        }, true);
        this.on('#btn-reload-collection', 'click', () => {
            if (typeof A.DB.loadCollections === 'function') {
                A.DB.loadCollections(getVal('btn-select-datalist') || null, { forceNew: true });
            }
        }, true);
        this.on('#btn-select-datalist', 'change', (e) => {
            const el = e.target;
            const selectedKey = el.value;
            CURRENT_TABLE_KEY = selectedKey;
            // renderTableByKey là hàm cũ của bạn, nó sẽ tự switch case 
            // để chọn Object.values(APP_DATA.booking_details) hay Object.values(APP_DATA.bookings)
            renderTableByKey(selectedKey);
            if ($('#tbl-container-tab2')) $('#tbl-container-tab2').dataset.collection = selectedKey; // Cập nhật dataset để filter hoạt động đúng 
        }, true);
    }

    /**
     * =========================================================================
     * SECTION 4: SEARCH EVENTS
     * =========================================================================
     */
    _setupSearchEvents() {
        this.on('#global-search', 'keyup', (e) => {
            if (e.key === 'Enter') {
                if (typeof handleSearchClick === 'function') {
                    handleSearchClick();
                }
            }
        }, true);
    }

    /**
     * =========================================================================
     * SECTION 5: FORM EVENTS (Booking)
     * =========================================================================
     */
    _setupFormEvents() {
        // Khi thay đổi ngày bắt đầu
        this.on('#BK_Start', 'change', (e, target) => {
            if (typeof autoSetOrCalcDate === 'function') {
                autoSetOrCalcDate(target.value, 'BK_PayDue');
            }

            const startDate = new Date(target.value);
            const endDate = new Date(getVal('BK_End'));
            if (startDate && endDate && endDate < startDate) {
                setVal('BK_End', formatDateForInput(target.value));
            }
        }, true);

        // Khi thay đổi deposit
        this.on('#BK_Deposit', 'change', (e) => {
            const el = e.target;
            setTimeout(() => {
                const grandTotal = getNum('BK_Total');
                const deposit = getNum('BK_Deposit');
                const balance = grandTotal - deposit;
                setNum('BK_Balance', balance);
            }, 500);
        }, true);

        this.on('#tab-form-btn-save-cust', 'click', async (e) => {
            if (typeof saveCustomer === 'function') {
                await saveCustomer();
            }
        }, true);
        this.on('#tab-form-btn-new-deposit', 'click', async (e) => {
            const module = await import('../../../accountant/controller_accountant.js');
            if (module && module.default) {
                const AccountantCtrl = module.default;
                await AccountantCtrl.openTransactionModal('IN');
                setVal('inp-amount-show', getVal('BK_Deposit') * 1000);
                const inpBkId = $("[data-field='booking_id']", getE('dynamic-modal-body'));
                if (inpBkId) {
                    setVal(inpBkId, getVal('BK_ID'));
                }
            }
        }, true);
    }

    /**
     * =========================================================================
     * SECTION 6: NUMBER INPUT EVENTS (With Debounce)
     * =========================================================================
     */
    _setupNumberInputEvents() {
        const numberInputSelector = 'input:not([type="hidden"]):not([disabled])';

        // Input event với debounce
        this.on(numberInputSelector, 'input', (e, target) => {
            // Clear old timer
            if (target._debounceTimer) {
                clearTimeout(target._debounceTimer);
            }

            // Set new timer (1s delay)
            target._debounceTimer = setTimeout(() => {
                // Clean data: only keep numbers and minus sign
                let cleanValue = target.value.replace(/[^0-9-]/g, '');
                let numericVal = parseFloat(cleanValue);
                target.dataset.val = isNaN(numericVal) ? 0 : numericVal;

                // Trigger calculation
                const tr = target.closest('tr');
                if (tr && tr.id && typeof calcRow === 'function') {
                    if (!window.CURRENT_CTX_ROW) {
                        window.CURRENT_CTX_ROW = tr;
                    }
                    const rowId = tr.id.replace('row-', '');
                    calcRow(rowId);
                }

                delete target._debounceTimer;
            }, 1000);
        }, true);

        // Click event trên number inputs
        this.on('input.number, input.number-only', 'click', (e) => {
            const el = e.target;
            if (getVal(el) > 0) return;
            e.preventDefault();
            el.select();
        }, true);
    }

    /**
     * =========================================================================
     * SECTION 7: BOOKING FORM CONTEXT MENU EVENTS (Right Click)
     * =========================================================================
     */
    _setupBkFormCtm() {
        // const tbody = document.getElementById('detail-tbody');
        const menu = document.getElementById('bookingContextMenu');

        if (!menu) {
            console.warn('[EventManager] Context menu elements not found');
            return;
        }

        // Right click event
        this.on('#detail-tbody', 'contextmenu', (e) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            if (isCtrl) return; // Skip if Ctrl

            const row = e.target.closest('tr');
            if (!row) return;

            e.preventDefault();
            const tbody = document.getElementById('detail-tbody');

            // Save context
            window.CURRENT_CTX_ROW = row;
            const details = window.CURRENT_USER?.role === 'op' ? 'operator_entries' : 'booking_details';
            const collection = window.CURRENT_TABLE_KEY === 'bookings' || window.CURRENT_TABLE_KEY === 'detail-tbody'
                ? details
                : window.CURRENT_TABLE_KEY;

            const sidInput = row.querySelector('.d-sid');
            window.CURRENT_CTX_ID = sidInput ? sidInput.value : '';

            // Get row data
            if (typeof getRowData === 'function') {
                window.CURRENT_ROW_DATA = getRowData(collection, window.CURRENT_CTX_ROW, tbody);
            }

            // Position menu
            menu.style.top = `${e.clientY}px`;
            menu.style.left = `${e.clientX}px`;
            menu.style.display = 'block';
        }, true);

        document.addEventListener('click', (e) => {
            if (!menu || menu.contains(e.target)) return;
            menu.style.display = 'none';
        });

        // Setup context menu buttons
        this._setupBkFormCtmBtn(menu);
    }

    _setupBkFormCtmBtn(menu) {
        const btnCopyData = menu.querySelector('#ctx-copyData');
        const btnPasteData = menu.querySelector('#ctx-paste');
        const btnCopy = menu.querySelector('#ctx-copy');
        const btnDelete = menu.querySelector('#ctx-delete');
        const btnDeleteBooking = menu.querySelector('#ctx-delete-bk');
        const btnSaveOne = menu.querySelector('#ctx-save-one');

        if (btnCopyData) {
            btnCopyData.onclick = async (e) => {
                e.preventDefault();
                if (!window.CURRENT_ROW_DATA) return;

                try {
                    const jsonString = JSON.stringify(window.CURRENT_ROW_DATA);
                    await navigator.clipboard.writeText(jsonString);
                    menu.style.display = 'none';
                    logA('✅ Copied data to clipboard!', 'success');
                } catch (err) {
                    logError('❌ Copy failed: ' + err.message);
                }
            };
        }

        if (btnPasteData) {
            btnPasteData.onclick = async (e) => {
                e.preventDefault();
                await this._pasteFromClipboard();
            };
        }

        if (btnCopy) {
            btnCopy.onclick = (e) => {
                e.preventDefault();
                if (typeof copyRow === 'function' && window.CURRENT_CTX_ROW) {
                    copyRow(window.CURRENT_CTX_ROW);
                }
            };
        }

        if (btnDelete) {
            btnDelete.onclick = (e) => {
                e.preventDefault();
                if (window.CURRENT_CTX_ID) {
                    const collection = window.CURRENT_USER?.role === 'op' ? 'operator_entries' : 'booking_details';
                    if (typeof deleteItem === 'function') {
                        deleteItem(window.CURRENT_CTX_ID, collection);
                        // if(window.CURRENT_CTX_ROW){
                        //     window.CURRENT_CTX_ROW.remove();
                        // }
                    }
                } else {
                    logA('❓ Dòng chưa lưu. Xóa khỏi giao diện?', 'info', () => {
                        if (window.CURRENT_CTX_ROW) {
                            window.CURRENT_CTX_ROW.remove();
                        }
                    });
                }
            };
        }

        if (btnDeleteBooking) {
            btnDeleteBooking.onclick = (e) => {
                e.preventDefault();
                const bkId = getVal('BK_ID');
                if (bkId) {
                    if (typeof deleteItem === 'function') {
                        deleteItem(bkId, 'bookings');
                        window.refreshForm();
                    }
                } else {
                    logA('❓ Booking chưa lưu. Xóa khỏi giao diện?', 'info', () => {
                        window.refreshForm();
                    });
                }
            };
        }

        if (btnSaveOne) {
            btnSaveOne.onclick = async (e) => {
                e.preventDefault();
                if (window.CURRENT_CTX_ROW && window.CURRENT_ROW_DATA && window.A.DB) {
                    const collection = window.CURRENT_USER?.role === 'op' ? 'operator_entries' : 'booking_details';
                    const res = await window.A.DB.saveRecord(collection, window.CURRENT_ROW_DATA);
                    if (res?.success) {
                        logA('✅ Lưu thành công!', 'success');
                    }
                }
            };
        }
    }

    async _pasteFromClipboard() {
        if (!window.CURRENT_CTX_ROW) {
            alert('❌ Lỗi: Vui lòng chọn một dòng để dán.');
            return;
        }

        try {
            const textFromClipboard = await navigator.clipboard.readText();
            if (!textFromClipboard) {
                alert('❌ Clipboard trống!');
                return;
            }

            const pastedData = JSON.parse(textFromClipboard);
            const collection = window.CURRENT_USER?.role === 'op' ? 'operator_entries' : 'booking_details';

            if (typeof setRowDataByField === 'function') {
                setRowDataByField(collection, pastedData, window.CURRENT_CTX_ROW);
            }
        } catch (err) {
            console.error('[EventManager] Paste error:', err);
            alert('❌ Lỗi: Dữ liệu clipboard không hợp lệ.');
        }
    }

    /**
     * =========================================================================
     * SECTION 8: KEYBOARD NAVIGATION EVENTS
     * =========================================================================
     */
    _setupKeyboardNavEvents() {
        this.on('#detail-tbody', 'keydown', (e) => {
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

            const allInputs = Array.from(
                currentTr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select')
            );
            const inputIndex = allInputs.indexOf(currentInput);

            if (inputIndex === -1) return;

            // A. Go down (Enter or Ctrl+Down)
            if (isEnter || (isCtrl && isDown)) {
                e.preventDefault();
                let nextTr = currentTr.nextElementSibling;

                if (!nextTr) {
                    if (typeof copyRow === 'function') {
                        copyRow();
                    } else if (typeof addDetailRow === 'function') {
                        addDetailRow();
                    }
                    nextTr = document.querySelector('#detail-tbody')?.lastElementChild;
                }

                this._focusCell(nextTr, inputIndex);
            }
            // B. Go up (Ctrl+Up)
            else if (isCtrl && isUp) {
                e.preventDefault();
                const prevTr = currentTr.previousElementSibling;
                if (prevTr) this._focusCell(prevTr, inputIndex);
            }
            // C. Go left (Ctrl+Left)
            else if (isCtrl && isLeft) {
                e.preventDefault();
                if (inputIndex > 0) {
                    const targetInput = allInputs[inputIndex - 1];
                    if (targetInput) {
                        targetInput.focus();
                        targetInput.select?.();
                    }
                }
            }
            // D. Go right (Ctrl+Right)
            else if (isCtrl && isRight) {
                e.preventDefault();
                if (inputIndex < allInputs.length - 1) {
                    const targetInput = allInputs[inputIndex + 1];
                    if (targetInput) {
                        targetInput.focus();
                        targetInput.select?.();
                    }
                }
            }
            // E. Copy from above (Ctrl+D)
            else if (isCtrl && isD) {
                e.preventDefault();
                const prevTr = currentTr.previousElementSibling;
                if (prevTr) {
                    const prevInputs = Array.from(
                        prevTr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select')
                    );
                    const sourceInput = prevInputs[inputIndex];

                    if (sourceInput) {
                        this._copyValueSmart(sourceInput, currentInput);
                        currentInput.classList.add('bg-success', 'bg-opacity-10');
                        setTimeout(() => currentInput.classList.remove('bg-success', 'bg-opacity-10'), 200);
                    }
                }
            }
        }, true);

        // Auto-select on focus
        this.on('#main-form', 'focus', (e) => {
            const currentInput = e.target;
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(currentInput.tagName)) {
                currentInput.select?.();
            }
        }, true);
    }

    _focusCell(tr, index) {
        if (!tr) return;
        const inputs = Array.from(
            tr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select')
        );
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
            log('[EventManager] Trang sắp được tải lại, hủy tất cả subscription...');
            A.DB.stopNotificationsListener();
            log('[EventManager] ✅ Đã hủy tất cả subscription');
        });

        // Handler chung cho cả dblclick và longpress
        const handleRowClick = (e) => {
            if (!e || !e.target || typeof e.target.closest !== 'function') return;

            const table = e.target.closest('table');
            if (!table) return;
            const tbody = table.querySelector('tbody');
            if (!tbody) return;

            const tr = e.target.closest('tr');
            if (!tr) return;
            const collection = table.dataset.collection;
            const trId = tr.id;

            if (!collection || !trId) return;

            const isDetailEntry = ['booking_details', 'operator_entries'].includes(collection);

            if (typeof onGridRowClick === 'function') {
                onGridRowClick(trId, isDetailEntry);
            }
        };

        // Xử lý dblclick
        this.on('tr', 'dblclick', (e) => {
            e.preventDefault();
            handleRowClick(e);
        }, true);
        this.on('tr', 'click', (e) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            if (!isCtrl) return;
            handleRowClick(e);
        }, true);

        // Xử lý longpress (chỉ trên mobile)
        if (window.innerWidth <= 768) {
            let touchStartTime = 0;
            let touchStartX = 0;
            let touchStartY = 0;
            let currentTr = null;
            const threshold = 500;

            document.addEventListener('touchstart', (e) => {
                const tr = e.target.closest('tr');
                if (!tr) return;

                if (e.touches.length > 0) {
                    touchStartTime = Date.now();
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    currentTr = tr;
                }
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (e.touches.length > 0) {
                    const moveX = Math.abs(e.touches[0].clientX - touchStartX);
                    const moveY = Math.abs(e.touches[0].clientY - touchStartY);
                    if (moveX > 10 || moveY > 10) {
                        currentTr = null;
                    }
                }
            }, { passive: true });

            document.addEventListener('touchend', (e) => {
                if (currentTr && Date.now() - touchStartTime >= threshold) {
                    handleRowClick({ target: currentTr, currentTarget: currentTr });
                }
                currentTr = null;
            }, { passive: true });
        }
    }
}
// Export cho ES6 import
export default EventManager;