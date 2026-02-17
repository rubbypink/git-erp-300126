import DB_MANAGER from './db_manager.js';
import { AUTH_MANAGER, SECURITY_MANAGER } from './login_module.js';
import UI_RENDERER from './renderUtils.js';
import EVENT_MANAGER from './modules/EventManager.js';
import FirestoreDataTableManager from './modules/M_FirestoreDataTable.js';
import { HotelPriceController } from './modules/M_HotelPrice.js';
import ServicePriceController from './modules/M_ServicePrice.js';
import PriceManager from './modules/M_PriceManager.js';
import MobileManager from './modules/MobileManager.js';
// CalculatorWidget được load từ global scope (không dùng ES Module)

// =========================================================================
// APPLICATION CLASS
// =========================================================================

class Application {
    #state = { 
        isReady: false,
        user: null,         // CURRENT_USER
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
    };

    #createDynamicModal() {
        const appInstance = this; 
        return {
            id: '#dynamic-modal',
            instance: null, // Bootstrap Instance
            dragState: {
                isDragging: false,
                startX: 0,
                startY: 0,
                offsetX: 0,
                offsetY: 0,
                initialLeft: 0,
                initialTop: 0
            },
            
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
                const dialog = el.querySelector('.modal-dialog');
                
                if (!bodyEl || !dialog) return false;

                // 1. Update title
                if (titleEl) titleEl.innerHTML = title;

                // 2. ✅ RESET kích thước modal để bắt đầu từ đầu
                bodyEl.innerHTML = '';
                dialog.style.width = 'auto';
                dialog.style.height = 'auto';
                dialog.style.maxHeight = '88vh';
                
                // 3. Check và xử lý content type
                // ✅ Xử lý thẻ <template> - extract nội dung từ template.content
                let processedContent = htmlContent;
                if (htmlContent instanceof HTMLElement && htmlContent.tagName === 'TEMPLATE') {
                    processedContent = htmlContent.content;
                }
                
                const isFragment = processedContent instanceof DocumentFragment;
                const isElement = processedContent instanceof HTMLElement;
                const isString = typeof processedContent === 'string';

                try {
                    if (isString) {
                        // String HTML - dùng innerHTML
                        bodyEl.innerHTML = processedContent;
                    } else if (isFragment) {
                        // DocumentFragment - clone và append
                        bodyEl.appendChild(processedContent.cloneNode(true));
                    } else if (isElement) {
                        // HTMLElement - clone và append
                        bodyEl.appendChild(processedContent.cloneNode(true));
                    } else if (processedContent) {
                        // Fallback: convert to string
                        bodyEl.innerHTML = String(processedContent);
                    }
                    
                    // 4. ✅ Force browser re-calculate kích thước
                    // Đọc offsetHeight để trigger reflow
                    const _ = dialog.offsetHeight;
                    
                    // 5. ✅ Đảm bảo modal không vượt quá viewport
                    const contentHeight = bodyEl.scrollHeight;
                    const maxHeight = window.innerHeight * 0.88; // 88% viewport
                    
                    if (contentHeight > maxHeight) {
                        dialog.style.maxHeight = maxHeight + 'px';
                        bodyEl.style.overflowY = 'auto';
                        bodyEl.style.maxHeight = (maxHeight - 100) + 'px'; // Trừ header + footer
                    } else {
                        dialog.style.maxHeight = 'none';
                        bodyEl.style.overflowY = 'visible';
                        bodyEl.style.maxHeight = 'none';
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
                    // ✅ Re-center modal sau khi hiển thị nội dung mới
                    setTimeout(() => {
                        this._centerModal();
                        this._initDragHandle();
                        this._initResizeHandles();
                        if (saveHandler) this.setSaveHandler(saveHandler);
                        if (resetHandler) this.setResetHandler(resetHandler);
                    }, 100); // Wait for Bootstrap fade animation
                }
            },

            /**
             * Center modal dialog - horizontally centered, positioned from top 10rem
             * @private
             */
            _centerModal: function() {
                const el = this._getEl();
                const dialog = el ? el.querySelector('.modal-dialog') : null;
                if (!dialog) return;
                
                dialog.style.position = 'fixed';
                dialog.style.left = '50%';
                dialog.style.top = '10%';  // 160px from top
                dialog.style.transform = 'translateX(-50%)';  // Center horizontally only
                dialog.style.margin = '0';
            },

            hide: function() {
                const inst = this._getInstance();
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
             * Initialize drag functionality for modal header.
             * Allows users to drag the modal by its header when not fullscreen.
             * ✅ FIX: Prevents modal size recalculation during drag
             * @private
             */
            _initDragHandle: function() {
                const el = this._getEl();
                const header = el ? el.querySelector('.modal-header') : null;
                const dialog = el ? el.querySelector('.modal-dialog') : null;
                
                if (!header || !dialog) return;

                // Set initial position if not already set
                if (!dialog.style.position || dialog.style.position === 'static') {
                    dialog.style.position = 'fixed';
                    dialog.style.left = '50%';
                    // dialog.style.top = '5rem';  // 80px from top
                    dialog.style.transform = 'translateX(-50%)';  // Center horizontally
                    dialog.style.margin = '0';
                    dialog.style.zIndex = '1060'; // Ensure above modal backdrop
                }

                // Store these outside event handlers để reuse
                const modalDrag = this;
                let onMouseMoveHandler = null;
                let onMouseUpHandler = null;
                
                // ✅ NEW: Lưu kích thước modal để lock khi drag (tránh reflow)
                let savedDimensions = null;

                const onMouseDown = (e) => {
                    // Ignore if fullscreen or clicking on buttons
                    if (dialog.classList.contains('modal-fullscreen') || 
                        e.target.closest('button') || 
                        e.target.closest('[data-bs-dismiss]')) {
                        return;
                    }

                    modalDrag.dragState.isDragging = true;
                    modalDrag.dragState.startX = e.clientX;
                    modalDrag.dragState.startY = e.clientY;

                    // Get current position
                    const rect = dialog.getBoundingClientRect();
                    modalDrag.dragState.initialLeft = rect.left;
                    modalDrag.dragState.initialTop = rect.top;

                    // ✅ FIX: Lock kích thước modal trước drag
                    // Tránh việc offsetHeight trigger reflow khi drag
                    savedDimensions = {
                        width: dialog.offsetWidth,
                        height: dialog.offsetHeight,
                        maxHeight: dialog.style.maxHeight
                    };
                    
                    // ✅ SET kích thước cứng (pixel-based) để lock
                    dialog.style.width = savedDimensions.width + 'px';
                    dialog.style.height = savedDimensions.height + 'px';
                    dialog.style.minHeight = savedDimensions.height + 'px'; // Prevent shrinking
                    dialog.style.maxHeight = savedDimensions.height + 'px';

                    header.style.cursor = 'grabbing';
                    dialog.style.transition = 'none !important'; // Force disable transition
                    dialog.style.userSelect = 'none';
                    document.body.style.userSelect = 'none';

                    // Add dragging class
                    dialog.classList.add('dragging');

                    // ✅ FIX: Attach move/up listeners NOW (not before)
                    document.addEventListener('mousemove', onMouseMoveHandler);
                    document.addEventListener('mouseup', onMouseUpHandler);
                };

                // Define move handler
                onMouseMoveHandler = (e) => {
                    if (!modalDrag.dragState.isDragging) return;

                    const deltaX = e.clientX - modalDrag.dragState.startX;
                    const deltaY = e.clientY - modalDrag.dragState.startY;

                    const newLeft = modalDrag.dragState.initialLeft + deltaX;
                    const newTop = modalDrag.dragState.initialTop + deltaY;

                    // ✅ FIX: Dùng saved dimensions thay vì đọc offsetWidth/offsetHeight
                    // Tránh trigger reflow/recalculation
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    const dialogWidth = savedDimensions.width;
                    const dialogHeight = savedDimensions.height;

                    const constrainedLeft = Math.max(0, Math.min(newLeft, viewportWidth - dialogWidth));
                    const constrainedTop = Math.max(0, Math.min(newTop, viewportHeight - dialogHeight));

                    dialog.style.left = constrainedLeft + 'px';
                    dialog.style.top = constrainedTop + 'px';
                    dialog.style.transform = 'none';

                    e.preventDefault();
                };

                // Define up handler
                onMouseUpHandler = (e) => {
                    if (!modalDrag.dragState.isDragging) return;

                    modalDrag.dragState.isDragging = false;
                    header.style.cursor = 'grab';
                    
                    // ✅ FIX: Restore kích thước modal về 'auto' sau khi drag
                    if (savedDimensions) {
                        dialog.style.width = 'auto';
                        dialog.style.height = 'auto';
                        dialog.style.minHeight = '';
                        dialog.style.maxHeight = savedDimensions.maxHeight || '88vh';
                        savedDimensions = null;
                    }
                    
                    dialog.style.transition = ''; // Re-enable transition
                    dialog.style.userSelect = '';
                    document.body.style.userSelect = '';
                    dialog.classList.remove('dragging');

                    // ✅ FIX: Remove listeners now
                    document.removeEventListener('mousemove', onMouseMoveHandler);
                    document.removeEventListener('mouseup', onMouseUpHandler);
                };

                // Attach mousedown to header
                header.addEventListener('mousedown', onMouseDown);
                header.style.cursor = 'grab';
            },

            /**
             * Initialize resize functionality for modal edges (top & right).
             * Allows users to resize modal from top edge (height) and right edge (width)
             * ✅ NEW: Resize handles without affecting drag functionality
             * @private
             */
            _initResizeHandles: function() {
                const el = this._getEl();
                const dialog = el ? el.querySelector('.modal-dialog') : null;
                const modalContent = el ? el.querySelector('.modal-content') : null;
                
                if (!dialog || !modalContent) return;

                const modalDrag = this;
                
                // ✅ CONFIG: Resize constraints
                const MIN_WIDTH = 300;
                const MIN_HEIGHT = 200;
                const MAX_WIDTH = window.innerWidth * 0.95;
                const MAX_HEIGHT = window.innerHeight * 0.95;
                const RESIZE_HANDLE_SIZE = 8; // px

                // ═══════════════════════════════════════════════════════════
                // 1️⃣ TOP EDGE RESIZE (Chiều cao - Height)
                // ═══════════════════════════════════════════════════════════
                
                let onBotResizeMove = null;
                let onBotResizeUp = null;
                let botResizeState = null;

                const onBotResizeDown = (e) => {
                    // Only trigger on bottom edge
                    const rect = dialog.getBoundingClientRect();
                    if (e.clientY < rect.bottom - RESIZE_HANDLE_SIZE) return;

                    botResizeState = {
                        startY: e.clientY,
                        initialBottom: rect.bottom,
                        initialHeight: rect.height
                    };

                    modalContent.style.cursor = 'ns-resize';
                    dialog.style.transition = 'none';
                    document.body.style.userSelect = 'none';

                    document.addEventListener('mousemove', onBotResizeMove);
                    document.addEventListener('mouseup', onBotResizeUp);
                    e.preventDefault();
                };

                onBotResizeMove = (e) => {
                    if (!botResizeState) return;

                    const deltaY = e.clientY - botResizeState.startY;
                    const newHeight = botResizeState.initialHeight - deltaY;

                    // Constraints: Respect min/max height
                    if (newHeight >= MIN_HEIGHT && newHeight <= MAX_HEIGHT) {
                        const newBottom = botResizeState.initialBottom - deltaY;
                        
                        // Update height
                        dialog.style.height = newHeight + 'px';
                        dialog.style.minHeight = newHeight + 'px';
                        dialog.style.maxHeight = newHeight + 'px';
                        
                        // Move dialog down when resizing from bottom
                        dialog.style.bottom = newBottom + 'px';
                    }

                    e.preventDefault();
                };

                onBotResizeUp = (e) => {
                    modalContent.style.cursor = '';
                    dialog.style.transition = '';
                    document.body.style.userSelect = '';

                    document.removeEventListener('mousemove', onBotResizeMove);
                    document.removeEventListener('mouseup', onBotResizeUp);
                    botResizeState = null;
                };

                // ═══════════════════════════════════════════════════════════
                // 2️⃣ RIGHT EDGE RESIZE (Chiều rộng - Width)
                // ═══════════════════════════════════════════════════════════
                
                let onRightResizeMove = null;
                let onRightResizeUp = null;
                let rightResizeState = null;

                const onRightResizeDown = (e) => {
                    // Only trigger on right edge
                    const rect = dialog.getBoundingClientRect();
                    if (e.clientX < rect.right - RESIZE_HANDLE_SIZE) return;

                    rightResizeState = {
                        startX: e.clientX,
                        initialRight: window.innerWidth - rect.right,
                        initialWidth: rect.width
                    };

                    modalContent.style.cursor = 'ew-resize';
                    dialog.style.transition = 'none';
                    document.body.style.userSelect = 'none';

                    document.addEventListener('mousemove', onRightResizeMove);
                    document.addEventListener('mouseup', onRightResizeUp);
                    e.preventDefault();
                };

                onRightResizeMove = (e) => {
                    if (!rightResizeState) return;

                    const deltaX = e.clientX - rightResizeState.startX;
                    const newWidth = rightResizeState.initialWidth + deltaX;

                    // Constraints: Respect min/max width
                    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
                        dialog.style.width = newWidth + 'px';
                        dialog.style.minWidth = newWidth + 'px';
                        dialog.style.maxWidth = newWidth + 'px';
                    }

                    e.preventDefault();
                };

                onRightResizeUp = (e) => {
                    modalContent.style.cursor = '';
                    dialog.style.transition = '';
                    document.body.style.userSelect = '';

                    document.removeEventListener('mousemove', onRightResizeMove);
                    document.removeEventListener('mouseup', onRightResizeUp);
                    rightResizeState = null;
                };

                // ═══════════════════════════════════════════════════════════
                // 3️⃣ ATTACH RESIZE HANDLES
                // ═══════════════════════════════════════════════════════════
                
                // Add resize listeners to modal-dialog
                dialog.addEventListener('mousedown', (e) => {
                    const rect = dialog.getBoundingClientRect();
                    const onBotEdge = e.clientY > rect.bottom - RESIZE_HANDLE_SIZE;
                    const onRightEdge = e.clientX > rect.right - RESIZE_HANDLE_SIZE;

                    if (onBotEdge) onBotResizeDown(e);
                    else if (onRightEdge) onRightResizeDown(e);
                });

                // ✅ Add visual feedback: Change cursor on hover over resize edges
                dialog.addEventListener('mousemove', (e) => {
                    const rect = dialog.getBoundingClientRect();
                    const onBotEdge = e.clientY > rect.bottom - RESIZE_HANDLE_SIZE;
                    const onRightEdge = e.clientX > rect.right - RESIZE_HANDLE_SIZE;

                    if (onBotEdge) {
                        dialog.style.cursor = 'ns-resize';
                    } else if (onRightEdge) {
                        dialog.style.cursor = 'ew-resize';
                    } else {
                        dialog.style.cursor = '';
                    }
                });

                // Reset cursor when leaving dialog
                dialog.addEventListener('mouseleave', () => {
                    dialog.style.cursor = '';
                });
            }
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
            console.log('[App] ✅ Modal #dynamic-modal found');
            return;
        }

        // Create modal HTML template from createDynamicModal spec
        const modalHTML = `
            <div id="dynamic-modal" class="modal modal-fit-content fade" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content shadow-lg border-0">
                        <div class="modal-header header bg-gradient py-2">
                            <h6 class="modal-title fw-bold text-uppercase" style="letter-spacing: 1px; justify-self: center;">
                                <i class="fa-solid fa-sliders me-2"></i>Modal Title
                            </h6>
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

        console.log('[App] ✅ Modal #dynamic-modal created dynamically');
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
            this.addModule('FirestoreDataTableManager', FirestoreDataTableManager);
            this.addModule('HotelPriceController', HotelPriceController);
            this.addModule('ServicePriceController', ServicePriceController);
            this.addModule('PriceManager', PriceManager);
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
                if(app) app.style.opacity = 1;
                // await A.UI.init();
                await this._call('UI', 'init');
                await this._call('Auth', 'fetchUserProfile', user);
                // Sau khi fetch profile và Security Manager đã render template vào app-container
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
            console.log('[App] 📱 Mobile device detected (width <= 768px)');
            activateTab('tab-form');
            MobileManager.init();
            document.querySelectorAll('.desktop-only').forEach(el => el.remove());
        } else if (typeof CalculatorWidget !== 'undefined' && CalculatorWidget.init) {
            CalculatorWidget.init();
        }

    } catch (e) {
        console.error("Critical Error:", e);
        document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
    }
});
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    document.getElementById('theme-toggle') && updateThemeToggleButton(window.THEME_MANAGER.getCurrentTheme());
}