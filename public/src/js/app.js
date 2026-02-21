import DB_MANAGER from './db_manager.js';
import { AUTH_MANAGER, SECURITY_MANAGER } from './login_module.js';
import UI_RENDERER from './renderUtils.js';
import EVENT_MANAGER from './modules/EventManager.js';
// import FirestoreDataTableManager from './modules/M_FirestoreDataTable.js';
import { HotelPriceController } from './modules/M_HotelPrice.js';
import ServicePriceController from './modules/M_ServicePrice.js';
import PriceManager from './modules/M_PriceManager.js';
import { Lang } from './modules/TranslationModule.js';
import { AdminConsole } from './modules/AdminController.js';
import NotificationModule from './modules/NotificationModule.js';
import ErpFooterMenu, { renderRoleBasedFooterButtons } from './common/components/footer_menu.js';
import ErpHeaderMenu from './common/components/header_menu.js';
import { DraggableSetup, Resizable, TableResizeManager } from './libs/ui_helper.js';

// =========================================================================
// APPLICATION CLASS
// =========================================================================

class Application {
    #state = { 
        isReady: false,
        user: {},           // ★ FIX: Initialize as {} instead of null to prevent "cannot set property of null"
        appData: {},        // APP_DATA (Global cache)
        currentView: {},    // Dữ liệu màn hình hiện tại (rowId, table đang chọn...)
        tempMatrix: {},     // [QUAN TRỌNG] Nơi lưu dữ liệu input ẩn realtime (Bước 3)
        eventCache: new Set(), // Cache lưu các sự kiện đã gán
        modalHandlers: {}
    };
    DATA = {}; // Dữ liệu chung (APP_DATA cũ)
    #config = {
        debug: true, // Bật log để dev
        roles: {},   // ROLE_DATA cũ
        tables: {},  // TBL_CFG cũ
        path: {},    // Đường dẫn các file
        consts: {    // Các hằng số
            DATE_FMT: 'DD/MM/YYYY',
            DB_DATE_FMT: 'YYYY-MM-DD',
            CURRENCY: 'VND'
        }
    };
    
    // ★ QUAN TRỌNG: Map module objects để dynamic forwarding
    #modules = {
        'Database': DB_MANAGER,
        'Auth': AUTH_MANAGER,
        'Security': SECURITY_MANAGER,
        'UI': UI_RENDERER,
        'Events': EVENT_MANAGER
        // ★ NotificationModule: Khởi tạo CHỈ sau khi có CURRENT_USER (trong listenAuth)
        // 'Notifications': NotificationModule.getInstance() ← MOVED to listenAuth
    };

    #createDynamicModal() {
        const appInstance = this; 
        return {
            id: '#dynamic-modal',
            instance: null, // Bootstrap Instance
            
            _getEl: function() {
                return document.querySelector(this.id);
            },

            // Khởi tạo & Cache Instance
            _getInstance: function() {
                const el = this._getEl();
                if (!el) {
                    console.error(`❌ Modal ${this.id} not found!`);
                    return null;
                }
                // Singleton Bootstrap Instance
                if (!this.instance) {
                    // Kiểm tra xem đã có instance bootstrap gắn vào chưa
                    /* global bootstrap */
                    this.instance = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el, {
                        backdrop: 'static',
                        keyboard: false
                    });

                    // [QUAN TRỌNG] Reset modal khi đóng để tránh lỗi hiển thị kích thước
                    el.addEventListener('hidden.bs.modal', () => {
                        this._resetContent();
                    });
                }
                return this.instance;
            },

            /**
             * Render content vào modal body
             * Hỗ trợ string HTML, DocumentFragment, và HTMLElement
             * Tự động resize modal theo nội dung mới
             * 
             * @param {string|DocumentFragment|HTMLElement} htmlContent - Nội dung cần render
             * @param {string} title - Tiêu đề modal
             */
            render: function(htmlContent, title = 'Thông báo') {
                const el = this._getEl();
                if (!el) return false;

                const titleEl = el.querySelector('.modal-title');
                const bodyEl = el.querySelector('#dynamic-modal-body');
                
                if (!bodyEl) return false;

                // Update title
                if (titleEl && title) {
                    titleEl.innerHTML = title;
                }

                // Load content (support string, DocumentFragment, HTMLElement, Template)
                try {
                    if (htmlContent instanceof DocumentFragment) {
                        bodyEl.innerHTML = '';
                        bodyEl.appendChild(htmlContent.cloneNode(true));
                    } else if (htmlContent instanceof HTMLElement) {
                        if (htmlContent.tagName === 'TEMPLATE') {
                            bodyEl.innerHTML = '';
                            bodyEl.appendChild(htmlContent.content.cloneNode(true));
                        } else {
                            bodyEl.innerHTML = '';
                            bodyEl.appendChild(htmlContent.cloneNode(true));
                        }
                    } else if (typeof htmlContent === 'string') {
                        bodyEl.innerHTML = htmlContent;
                    }
                    
                    return true;
                } catch (error) {
                    console.error('[Modal.render] ❌ Error:', error);
                    return false;
                }
            },

            show: function(htmlContent = null, title = null, saveHandler = null, resetHandler = null) {
                if (htmlContent) this.render(htmlContent, title);
                
                const inst = this._getInstance();
                if (inst) {
                    inst.show();
                    setTimeout(() => {

                        // this._initResizeHandles();
                        this._initEscListener();
                        new DraggableSetup(this._getEl(), { targetSelector: '.modal-dialog', handleSelector: '.modal-header' });
                        new Resizable(this._getEl(), { targetSelector: '.modal-content',
                        minWidth: 400, minHeight: 300 });
                        
                        if (saveHandler) {
                            this.setSaveHandler(saveHandler); 
                            if (!resetHandler) this.setResetHandler(() => this._resetToDefaults(), 'Đặt lại');  
                        } 
                        if (resetHandler) this.setResetHandler(resetHandler);
                    }, 100); // Wait for Bootstrap fade animation
                    this._resetToDefaults(); // Reset mỗi lần show để tránh lỗi kích thước do drag/resize lần trước
                }
            },

            /**
             * Initialize Esc key listener để đóng modal
             * Ngoại lệ: không đóng nếu focus vào input, select, textarea
             * @private
             */
            _initEscListener: function() {
                const modalEl = this._getEl();
                if (!modalEl) return;

                // Remove old listener nếu có
                if (this.escKeyHandler) {
                    document.removeEventListener('keydown', this.escKeyHandler);
                }

                // Define handler
                this.escKeyHandler = (e) => {
                    // Chỉ xử lý Esc key
                    if (e.key !== 'Escape') return;

                    // Kiểm tra nếu focus element là input, select, textarea thì bỏ qua
                    const focusedElement = document.activeElement;
                    const isFormElement = focusedElement && 
                        (focusedElement.tagName === 'INPUT' || 
                         focusedElement.tagName === 'SELECT' || 
                         focusedElement.tagName === 'TEXTAREA');

                    if (isFormElement) {
                        return; // Bỏ qua - cho phép user tiếp tục nhập
                    }

                    // Đóng modal nếu không phải form element
                    this.hide();
                };

                // Gán event listener
                document.addEventListener('keydown', this.escKeyHandler);
            },

            hide: function() {
                const inst = this._getInstance();
                this._resetToDefaults(); // Reset về mặc định khi đóng
                if (inst) inst.hide();
            },

            // [TỐI ƯU] Xóa sạch data khi đóng để lần sau mở ra Modal tự tính lại chiều cao/rộng
            _resetContent: function() {
                const el = this._getEl();
                if (el) {
                    const bodyEl = el.querySelector('#dynamic-modal-body');
                    if (bodyEl) bodyEl.innerHTML = ''; 
                    // Reset các nút về trạng thái mặc định (clone để xóa sạch event cũ)
                    this._resetButton('#btn-save-modal');
                    this._resetButton('#btn-reset-modal');
                }
                
                // ✅ Remove Esc listener khi modal đóng
                if (this.escKeyHandler) {
                    document.removeEventListener('keydown', this.escKeyHandler);
                    this.escKeyHandler = null;
                }
            },

            setSaveHandler: function(callback, btnText = 'Lưu') {
                this.setFooter(true); // Hiển thị footer nếu có nút save
                const btn = this._getButton('#btn-save-modal');
                if (!btn) return;
    
                // ✅ ĐÚNG - dùng appInstance từ closure
                if (appInstance.getState('modalHandlers').save) {
                    btn.removeEventListener('click', appInstance.getState('modalHandlers').save);
                }
    
                const handlers = appInstance.getState('modalHandlers') || {};
                handlers.save = callback;
                appInstance.setState({ modalHandlers: handlers });
                
                btn.addEventListener('click', callback);
                btn.style.display = 'inline-block';
                btn.textContent = btnText;
                
            },
    
            setResetHandler: function(callback, btnText = 'Reset') {
                const btn = this._getButton('#btn-reset-modal');
                if (!btn) return;
    
                const handlers = appInstance.getState('modalHandlers') || {};
                if (handlers.reset) {
                    btn.removeEventListener('click', handlers.reset);
                }
    
                handlers.reset = callback;
                appInstance.setState({ modalHandlers: handlers });
                btn.addEventListener('click', callback);
                btn.style.display = 'inline-block';
                btn.textContent = btnText;
                this.setFooter(true); // Hiển thị footer nếu có nút reset
            },

            setFooter: function(show = true) {
                const el = this._getEl();
                if (el) {
                    const footer = el.querySelector('.modal-footer');
                    if (footer) footer.style.display = show ? 'flex' : 'none';
                }
            },

            // Helpers
            _getButton: function(selector) {
                const el = this._getEl();
                return el ? el.querySelector(selector) : null;
            },

            _resetButton: function(selector) {
                const btn = this._getButton(selector);
                if (btn) {
                    // Clone node để xóa sạch mọi event listener "cứng đầu"
                    const newBtn = btn.cloneNode(true);
                    btn.parentNode.replaceChild(newBtn, btn);
                    newBtn.style.display = 'none'; // Mặc định ẩn
                }
            },

            /**
             * Reset modal to Bootstrap defaults (centered, auto-sized).
             * Removes all manual positioning and sizing from drag/resize.
             * @private
             */
            _resetToDefaults: function() {
                const el = this._getEl();
                if (!el) return;

                const dialog = el.querySelector('.modal-dialog');
                if (!dialog) return;

                // Remove manual positioning styles
                dialog.style.position = '';
                dialog.style.left = '';
                dialog.style.top = '';
                dialog.style.width = '';
                dialog.style.height = '';
                dialog.style.minWidth = '';
                dialog.style.minHeight = '';
                dialog.style.maxWidth = '';
                dialog.style.maxHeight = '';
                dialog.style.transform = '';
                dialog.style.transition = '';

                // Re-add Bootstrap centering class
                // if (!dialog.classList.contains('modal-dialog-centered')) {
                //     dialog.classList.add('modal-dialog-centered');
                // }

                // Remove any dragging/resizing classes
                dialog.classList.remove('dragging');
            },

            /**
             * Initialize resize functionality for all modal edges (top, bottom, left, right).
             * Allows unrestricted resizing from any edge or corner.
             * @private
             */
            // _initResizeHandles: function() {
            //     const el = this._getEl();
            //     const dialog = el ? el.querySelector('.modal-dialog') : null;
            //     const modalContent = el ? el.querySelector('.modal-content') : null;
                
            //     if (!dialog || !modalContent) return;

            //     // Prevent duplicate listeners
            //     if (dialog._resizeHandlesInitialized) return;
            //     dialog._resizeHandlesInitialized = true;
            //     dialog.classList.remove('modal-dialog-centered');

            //     const RESIZE_HANDLE_SIZE = 15; // px - increased for easier catching bottom/top edge
            //     const MIN_WIDTH = 300;
            //     const MIN_HEIGHT = 200;

            //     let resizeState = null;

            //     // Generic resize down handler
            //     const onResizeDown = (e) => {
            //         const rect = dialog.getBoundingClientRect();
                    
            //         // Detect which edge(s) are being dragged
            //         const onTop = e.clientY < rect.top + RESIZE_HANDLE_SIZE;
            //         const onBot = e.clientY > rect.bottom - RESIZE_HANDLE_SIZE;
            //         const onLeft = e.clientX < rect.left + RESIZE_HANDLE_SIZE;
            //         const onRight = e.clientX > rect.right - RESIZE_HANDLE_SIZE;

            //         if (!onTop && !onBot && !onLeft && !onRight) return;

            //         // Store initial state
            //         resizeState = {
            //             startX: e.clientX,
            //             startY: e.clientY,
            //             initialLeft: parseFloat(dialog.style.left) || rect.left,
            //             initialTop: parseFloat(dialog.style.top) || rect.top,
            //             initialWidth: rect.width,
            //             initialHeight: rect.height,
            //             resizeTop: onTop,
            //             resizeBot: onBot,
            //             resizeLeft: onLeft,
            //             resizeRight: onRight
            //         };
                    
            //         // Flag if resizing height to prevent interference (store on dialog element for global access)
            //         if (onTop || onBot) {
            //             dialog._isResizingHeight = true;
            //             // Lock height to prevent any other code from changing it
            //             dialog.style.height = rect.height + 'px';
            //         }

            //         // Remove Bootstrap centering class during resize
            //         dialog.classList.remove('modal-dialog-centered');

            //         // Set position: fixed if not already
            //         if (dialog.style.position !== 'fixed') {
            //             dialog.style.position = 'fixed';
            //         }

            //         // Set appropriate cursor
            //         const cursorMap = {
            //             'top': 'n-resize',
            //             'bottom': 's-resize',
            //             'left': 'w-resize',
            //             'right': 'e-resize',
            //             'top-left': 'nw-resize',
            //             'top-right': 'ne-resize',
            //             'bottom-left': 'sw-resize',
            //             'bottom-right': 'se-resize'
            //         };
                    
            //         let cursorKey = '';
            //         if (onTop) cursorKey += 'top';
            //         if (onBot) cursorKey += 'bottom';
            //         if (onLeft) cursorKey += (cursorKey ? '-' : '') + 'left';
            //         if (onRight) cursorKey += (cursorKey ? '-' : '') + 'right';
                    
            //         modalContent.style.cursor = cursorMap[cursorKey] || 'move';
            //         dialog.style.transition = 'none';
            //         document.body.style.userSelect = 'none';

            //         document.addEventListener('mousemove', onResizeMove);
            //         document.addEventListener('mouseup', onResizeUp);
            //         e.preventDefault();
            //     };

            //     // Generic resize move handler
            //     const onResizeMove = (e) => {
            //         if (!resizeState) return;

            //         const deltaX = e.clientX - resizeState.startX;
            //         const deltaY = e.clientY - resizeState.startY;

            //         let newWidth = resizeState.initialWidth;
            //         let newHeight = resizeState.initialHeight;
            //         let newLeft = resizeState.initialLeft;
            //         let newTop = resizeState.initialTop;

            //         // Handle width changes
            //         if (resizeState.resizeLeft) {
            //             newLeft = resizeState.initialLeft + deltaX;
            //             newWidth = resizeState.initialWidth - deltaX;
            //         } else if (resizeState.resizeRight) {
            //             newWidth = resizeState.initialWidth + deltaX;
            //         }

            //         // Handle height changes
            //         if (resizeState.resizeTop) {
            //             newTop = resizeState.initialTop + deltaY;
            //             newHeight = resizeState.initialHeight - deltaY;
            //         } else if (resizeState.resizeBot) {
            //             newHeight = resizeState.initialHeight + deltaY;
            //         }

            //         // Apply minimum size constraints
            //         if (newWidth >= MIN_WIDTH) {
            //             dialog.style.width = newWidth + 'px';
            //             if (resizeState.resizeLeft) {
            //                 dialog.style.left = newLeft + 'px';
            //             }
            //         }

            //         if (newHeight >= MIN_HEIGHT) {
            //             dialog.style.height = newHeight + 'px';
            //             // Lock height explicitly to prevent any interference
            //             dialog.style.minHeight = newHeight + 'px';
            //             dialog.style.maxHeight = 'none';
            //             if (resizeState.resizeTop) {
            //                 dialog.style.top = newTop + 'px';
            //             }
            //         }

            //         e.preventDefault();
            //     };

            //     // Generic resize up handler
            //     const onResizeUp = (e) => {
            //         if (!resizeState) return;

            //         resizeState = null;
            //         dialog._isResizingHeight = false; // Clear the height protection flag (stored on element)
            //         dialog.style.cursor = ''; // Clear cursor từ dialog thay modalContent
            //         dialog.style.transition = '';
            //         document.body.style.userSelect = '';

            //         document.removeEventListener('mousemove', onResizeMove);
            //         document.removeEventListener('mouseup', onResizeUp);
            //     };

            //     // Cursor feedback on hover
            //     const onDocumentMouseMove = (e) => {
            //         if (resizeState) return; // Don't update cursor while actively resizing

            //         const rect = dialog.getBoundingClientRect();
                    
            //         const onTop = e.clientY < rect.top + RESIZE_HANDLE_SIZE && 
            //                       e.clientX >= rect.left && e.clientX <= rect.right;
            //         const onBot = e.clientY > rect.bottom - RESIZE_HANDLE_SIZE && 
            //                       e.clientY <= rect.bottom && 
            //                       e.clientX >= rect.left && e.clientX <= rect.right;
            //         // Thu hẹp left/right zones: cách 15px từ top và bottom (tránh overlap với header/footer)
            //         const onLeft = e.clientX < rect.left + RESIZE_HANDLE_SIZE && 
            //                        e.clientY > rect.top + 15 && e.clientY < rect.bottom - 15;
            //         const onRight = e.clientX > rect.right - RESIZE_HANDLE_SIZE && 
            //                         e.clientX <= rect.right && 
            //                         e.clientY > rect.top + 15 && e.clientY < rect.bottom - 15;

            //         const cursorMap = {
            //             'top': 'n-resize',
            //             'bottom': 's-resize',
            //             'left': 'w-resize',
            //             'right': 'e-resize',
            //             'top-left': 'nw-resize',
            //             'top-right': 'ne-resize',
            //             'bottom-left': 'sw-resize',
            //             'bottom-right': 'se-resize'
            //         };
                    
            //         let cursorKey = '';
            //         if (onTop) cursorKey += 'top';
            //         if (onBot) cursorKey += 'bottom';
            //         if (onLeft) cursorKey += (cursorKey ? '-' : '') + 'left';
            //         if (onRight) cursorKey += (cursorKey ? '-' : '') + 'right';
                    
            //         // ✅ Set cursor trên dialog (parent) thay modalContent để avoid z-index issues với header/footer
            //         dialog.style.cursor = cursorKey ? cursorMap[cursorKey] : '';
            //     };

            //     // Attach event listeners
            //     dialog.addEventListener('mousedown', onResizeDown);
            //     // ✅ Attach listener vào dialog (không document) - chỉ track hover trên modal, tốc độ tốt hơn
            //     dialog.addEventListener('mousemove', onDocumentMouseMove);
            // }
        }
    };

    /**
     * Ensure modal HTML template exists and is from createDynamicModal.
     * Creates it dynamically if not found in DOM.
     * Removes any old/alternative modal versions.
     * 
     * @private
     */
    _ensureModalExists() {
        const existingModal = document.querySelector('#dynamic-modal');
        // If modal already exists, we're good
        if (existingModal) {
            return;
        }

        // Create modal HTML template from createDynamicModal spec
        const modalHTML = `
            <div id="dynamic-modal" class="modal fade" tabindex="-1" aria-hidden="true" data-bs-backdrop="false">
                <div class="modal-dialog modal-dialog-centered" style="max-width: 90vw; max-height: 90vh;">
                    <div class="modal-content shadow-lg border-0">
                        <div class="modal-header bg-gradient py-2">
                            <h6 class="modal-title fw-bold text-uppercase" style="letter-spacing: 1px; justify-self: center;">
                                <i class="fa-solid fa-sliders me-2"></i>Modal Title
                            </h6>
                            <button class="btn btn-sm btn-link text-dark btn-minimize px-1"><i class="fa-solid fa-minus"></i></button>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div id="dynamic-modal-body" class="modal-body px-2"></div>
                        <div class="modal-footer bg-gray p-2 m-2 gap-2" data-ft="true">
                            <button id="btn-reset-modal" type="button" class="btn btn-secondary">
                                <i class="fa-solid fa-redo me-2"></i>Đặt lại
                            </button>
                            <button id="btn-save-modal" type="submit" class="btn btn-primary px-4 fw-bold">
                                <i class="fa-solid fa-check me-2"></i>Lưu
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert modal at end of body
        const container = document.createElement('div');
        container.innerHTML = modalHTML.trim();
        document.body.appendChild(container.firstChild);
    }

    /**
     * Get or create modal instance.
     * Always uses createDynamicModal version.
     * 
     * @returns {Object} Modal instance
     */
    getModalInstance() {
        return this.Modal;
    }

    // =========================================================================
    // ★ DYNAMIC METHOD FORWARDING (Tự động resolve methods)
    // =========================================================================

    /**
     * Generic method resolver
     * 
     * Cách gọi:
     * A._call('Database', 'getBooking', 'BK001')
     * A._call('Auth', 'login', 'user@9trip.com', 'password')
     * A._call('UI', 'renderTemplate', ...)
     */
    _call(moduleName, methodName, ...args) {
        const module = this.#modules[moduleName];
        
        if (!module) {
            throw new Error(`Module "${moduleName}" not found. Available: ${Object.keys(this.#modules).join(', ')}`);
        }
        
        if (typeof module[methodName] !== 'function') {
            throw new Error(`Method "${methodName}" not found in module "${moduleName}"`);
        }
        
        if (this.#config.debug) {
            console.log(`[App._call] ${moduleName}.${methodName}(...)`, args);
        }
        
        // Call method with proper 'this' binding
        return module[methodName].apply(module, args);
    }

    /**
     * Alias for shorter syntax
     * A.call('Database', 'getBooking', 'BK001')
     */
    call(moduleName, methodName, ...args) {
        return this._call(moduleName, methodName, ...args);
    }

    // =========================================================================
    // PUBLIC SHORTCUTS (Tùy chọn - để code dễ đọc)
    // =========================================================================

    /**
     * Database shortcuts (optional, để code dễ đọc)
     * 
     * Usage:
     * A.DB.getBooking('BK001')  // ✅ Call method
     * A.DB.db = value           // ✅ SET property on DB_MANAGER
     * A.DB.raw                  // ✅ Get raw DB_MANAGER instance
     */
    get DB() {
        return new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'raw') return this.#modules['Database'];
                // Try to get property or method from module
                return this.#modules['Database'][prop] ?? ((...args) => this._call('Database', prop, ...args));
            },
            set: (target, prop, value) => {
                // ✅ SET property directly on module
                this.#modules['Database'][prop] = value;
                return true;
            }
        });
    }

    /**
     * Auth shortcuts
     * 
     * Usage:
     * A.Auth.login(user, pass)  // ✅ Call method
     * A.Auth.token = newToken   // ✅ SET property on AUTH_MANAGER
     */
    get Auth() {
        return new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'raw') return this.#modules['Auth'];
                return this.#modules['Auth'][prop] ?? ((...args) => this._call('Auth', prop, ...args));
            },
            set: (target, prop, value) => {
                this.#modules['Auth'][prop] = value;
                return true;
            }
        });
    }

    /**
     * Security shortcuts
     * 
     * Usage:
     * A.Security.validate(data)  // ✅ Call method
     * A.Security.level = 'high'  // ✅ SET property on SECURITY_MANAGER
     */
    get Security() {
        return new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'raw') return this.#modules['Security'];
                return this.#modules['Security'][prop] ?? ((...args) => this._call('Security', prop, ...args));
            },
            set: (target, prop, value) => {
                this.#modules['Security'][prop] = value;
                return true;
            }
        });
    }

    /**
     * UI shortcuts
     * 
     * Usage:
     * A.UI.render(data)    // ✅ Call method
     * A.UI.cache = {}      // ✅ SET property on UI_RENDERER
     */
    get UI() {
        return new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'raw') return this.#modules['UI'];
                return this.#modules['UI'][prop] ?? ((...args) => this._call('UI', prop, ...args));
            },
            set: (target, prop, value) => {
                this.#modules['UI'][prop] = value;
                return true;
            }
        });
    }

    get Event() {
        return new Proxy({}, {
            get: (target, prop) => {
                if (prop === 'raw') return this.#modules['Events'];
                return this.#modules['Events'][prop] ?? ((...args) => this._call('Events', prop, ...args));
            },
            set: (target, prop, value) => {
                this.#modules['Events'][prop] = value;
                return true;
            }
        });
    }

    get Modal() {
        if (!this.#modules['Modal']) {
            this.#modules['Modal'] = this.#createDynamicModal();
        }
        return this.#modules['Modal'];
    }

    get Notification() {
        // ★ LAZY INIT: Initialize only when first accessed + only if CURRENT_USER exists
        if (!this.#modules['Notifications']) {
            if (!window.CURRENT_USER) {
                console.warn('[App] Notification module not ready - CURRENT_USER not set');
                return null;
            }
            this.#modules['Notifications'] = NotificationModule.getInstance();
            this.#modules['Notifications'].setCurrentUser(window.CURRENT_USER);
        }
        return this.#modules['Notifications'];
    }    

    // =========================================================================
    // ADD NEW MODULE (Rất dễ!)
    // =========================================================================

    /**
     * Thêm module mới - hỗ trợ cả instance và class
     * 
     * Usage:
     * 1. Add instance: A.addModule('Cache', cacheInstance)
     *    → A.call('Cache', 'get', 'key')
     *    → A.get('Cache')  // Get shortcut
     *
     * 2. Add class: A.addModule('MyService', MyServiceClass)
     *    → const svc = new A.MyService(options)  // Lazy init
     *    → A.MyService.staticMethod()  // Static access
     * 
     * @param {string} name - Module name
     * @param {Object|Class} moduleOrClass - Instance or Constructor
     */
    addModule(name, moduleOrClass) {
        // Check if it's a class (constructor function)
        const isClass = typeof moduleOrClass === 'function' && moduleOrClass.toString().includes('class ');
        
        if (isClass) {
            // ★ LAZY INSTANTIATION: Lưu class, khởi tạo khi cần
            this.#modules[name] = {
                _class: moduleOrClass,
                _instance: null,
                _isLazy: true
            };
            
            // Tạo shortcut Proxy động
            Object.defineProperty(this, name, {
                get: () => {
                    // Pattern 1: new A.ModuleName() - Khởi tạo instance
                    return new Proxy(moduleOrClass, {
                        construct: (target, args) => {
                            // ✅ Lưu instance đầu tiên vào cache
                            if (!this.#modules[name]._instance) {
                                this.#modules[name]._instance = new target(...args);
                            }
                            return this.#modules[name]._instance;
                        },
                        get: (target, prop) => {
                            // Pattern 2: A.ModuleName.staticMethod() - Static access
                            return target[prop];
                        }
                    });
                },
                configurable: true
            });
            
            console.log(`✅ Module "${name}" (class) added - Use: new A.${name}(...) or A.${name}.static()`);
        } else {
            // ★ INSTANCE: Lưu instance ngay
            this.#modules[name] = moduleOrClass;
            
            // Tạo shortcut Proxy động
            Object.defineProperty(this, name, {
                get: () => {
                    return new Proxy({}, {
                        get: (target, prop) => {
                            if (prop === 'raw') return this.#modules[name];
                            // Try to get property or method from module
                            return this.#modules[name][prop] ?? ((...args) => this._call(name, prop, ...args));
                        },
                        set: (target, prop, value) => {
                            // ✅ SET property directly on module
                            this.#modules[name][prop] = value;
                            return true;
                        }
                    });
                },
                configurable: true
            });
            
            console.log(`✅ Module "${name}" (instance) added - Use: A.${name}.method() or A.${name}.prop = value`);
        }
    }

    /**
     * List all available modules
     */
    getModules() {
        return Object.keys(this.#modules);
    }

    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================

    getState(key = null) {
        return key ? this.#state[key] : this.#state;
    }

    setState(updates) {
        this.#state = { ...this.#state, ...updates };
    }

    isReady() {
        return this.#state.isReady;
    }
    
    
    constructor(options = {}) {
        Object.assign(this.#config, options);
    }

    async init() {
        try {
            console.log('[App] 🚀 Initializing...');
            await this._call('Auth', 'initFirebase');
            this._ensureModalExists();
            this.listenAuth();
            this.addModule('HotelPriceController', HotelPriceController);
            this.addModule('ServicePriceController', ServicePriceController);
            this.addModule('PriceManager', PriceManager);
            this.addModule('Lang', Lang); // Thêm module dịch thuật
        } catch (err) {
            console.error('[App] ❌ Error:', err);
            throw err;
        }
    }

    listenAuth () {
        this.#modules['Auth'].auth.onAuthStateChanged(async (user) => {
            const launcher = document.getElementById('app-launcher');
            const app = document.getElementById('main-app');
            if (user) {
                log("🔓 User detected, verifying profile...", "success");
                // ✅ FIRESTORE: Dùng .collection().doc().get()
                const docRef = this.DB.db.collection('users').doc(user.uid);
                const docSnap = await docRef.get();
                if (!docSnap.exists) {
                    alert("Tài khoản chưa có dữ liệu trên ERP. Vui lòng liên hệ Admin.");
                    this.#modules['Auth'].signOut();
                    showLoading(false);
                    return;
                }   
                // ✅ FIRESTORE: Dùng .data()
                const userProfile = docSnap.data();
                // Merge data
                CURRENT_USER.uid = user.uid;
                CURRENT_USER.name = userProfile.user_name || '';
                CURRENT_USER.email = user.email;  
                CURRENT_USER.level = userProfile.level;
                CURRENT_USER.profile = userProfile;
                CURRENT_USER.group = userProfile.group || '';
                this.#state.user = CURRENT_USER; // ★ Set global CURRENT_USER for easy access in modules
                const masker = localStorage.getItem('erp-mock-role');
                
                if (masker) {                  
                    const realRole = JSON.parse(masker).realRole;
                    if (realRole === 'admin' || realRole === 'manager' || CURRENT_USER.level >= 50) {
                        CURRENT_USER.role = JSON.parse(masker).maskedRole;

                        CURRENT_USER.realRole = realRole;
                        localStorage.removeItem('erp-mock-role');
                        this.#modules['UI'].renderedTemplates = {}; // Clear cache template để load lại
                        log('🎭 Admin masking mode detected. Cleaning up old role scripts...');

                        Object.keys(JS_MANIFEST).forEach(role => {
                            JS_MANIFEST[role].forEach(fileName => {
                                document.querySelectorAll(`script[src*="${fileName}"]`).forEach(script => {
                                    script.remove();
                                    log(`✂️ Removed script: ${fileName}`);
                                });
                            });
                        });
                        log('🎭 Clearing cached templates...');
                        Object.keys(TEMPLATE_MANIFEST).forEach(role => {
                            TEMPLATE_MANIFEST[role].forEach(templateId => {
                                document.querySelectorAll(`#${templateId}`).forEach(template => {
                                    template.remove();
                                    log(`✂️ Removed template: ${templateId}`);
                                });
                            });
                        });
                    }
                } else CURRENT_USER.role = userProfile.role || 'guest';

                if(app) app.style.opacity = 1;
                // await A.UI.init();
                await this._call('UI', 'init');
                
                
                const userRoleFromFirebase = this.#state.user.role;
                const headerMenu = new ErpHeaderMenu('nav-container');
                headerMenu.init(userRoleFromFirebase);

                await this._call('Auth', 'fetchUserProfile', user);

                // Sau khi fetch profile và Security Manager đã render template vào app-container
                if ( CURRENT_USER.role !== 'acc' && CURRENT_USER.role !== 'acc_thenice' ) {
                    log('[App] Initializing main ERP footer menu... != ACC');
                    const mainErpFooter = new ErpFooterMenu('erp-main-footer');
                    mainErpFooter.init().then(() => {
                        renderRoleBasedFooterButtons(userRoleFromFirebase, mainErpFooter);
                    });
                }

                MenuController.init();
                
                // ★ IMPORTANT: Initialize Notification module NOW that CURRENT_USER is available
                // (Lazy init on first access via getter, or explicit init here)
                if (!this.#modules['Notifications']) {
                    this.#modules['Notifications'] = NotificationModule.getInstance();
                    this.#modules['Notifications'].setCurrentUser(this.#state.user);
                    console.log('[App] ✅ NotificationModule initialized');
                }
                
                if (launcher) launcher.classList.add('d-none');
                if (app) app.classList.remove('d-none');
                showLoading(false);
                const eventManager = new this.#modules['Events']();
                await eventManager.init();
                log('[App] ✅ Events initialized');
                if (typeof window.initShortcuts === 'function') {
                    window.initShortcuts();
                }
                this.#state.isReady = true;
                console.log('[App] ✅ Ready');
                // Send login notification
                // this.Notification?.sendToAdmin('LOG IN', 'User logged in: ' + this.#state.user.name);
            } else {
                log("🔒 No user. Showing Login...", "warning");
                if (launcher) launcher.classList.add('d-none');
                if (launcher) launcher.remove();
                if(app) app.style.opacity = 1;            
                await this._call('Auth', 'showChoiceScreen');
            }
        });
    }
}

// =========================================================================
// EXPORT
// =========================================================================

const A = new Application();

// Backward compatibility
window.A = A;
// window.DB_MANAGER = DB_MANAGER;
// window.UI_RENDERER = UI_RENDERER;

export default A;

document.addEventListener('DOMContentLoaded', () => {
    try {
        isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
        A.init();
        
        if (isMobile) {
            activateTab('tab-form');
            document.querySelectorAll('.desktop-only').forEach(el => el.remove());
            fitToViewport('.footer-bar');
        } else if (typeof CalculatorWidget !== 'undefined' && CalculatorWidget.init) {
            CalculatorWidget.init();
        }
        if (!document.querySelector('at-modal-full')) {
            document.body.appendChild(document.createElement('at-modal-full'));
            const draggableSetup = new DraggableSetup('dynamic-modal-full', {
                targetSelector: '.modal-dialog',    
                handleSelector: '.modal-header'
            });
        }


    } catch (e) {
        console.error("Critical Error:", e);
        document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
    }
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    document.getElementById('theme-toggle') && updateThemeToggleButton(window.THEME_MANAGER.getCurrentTheme());
    
}