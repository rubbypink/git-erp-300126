// =====================================================================
// 1. CORE IMPORTS (Bắt buộc load trước để chạy App & Login)
// =====================================================================
import DB_MANAGER from './modules/DBManager.js';
import { AUTH_MANAGER, SECURITY_MANAGER } from './modules/LoginModule.js';
import { DraggableSetup, Resizable, TableResizeManager } from './libs/ui_helper.js';
import UI_RENDERER from './modules/UI_Manager.js';
import EVENT_MANAGER from './modules/EventManager.js';

// =========================================================================
// APPLICATION CLASS
// =========================================================================

class Application {
    #state = {
        isReady: false,
        user: {},           // Giữ nguyên: {} thay vì null
        currentView: {},    // Dữ liệu màn hình hiện tại
        tempMatrix: {},     // [QUAN TRỌNG] Lưu dữ liệu input ẩn realtime
        eventCache: new Set(),
        modalHandlers: {}
    };

    #moduleManager = null;

    #config = {
        debug: false,
        roles: {},
        tables: {},
        path: {},
        consts: {
            COLLECTIONS: ['bookings', 'booking_details', 'booking_details_by_booking', 'customers', 'operator_entries', 'operator_entries_by_booking', 'transactions', 'suppliers', 'hotels', 'hotel_price_schedules', 'service_price_schedules', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'users', 'app_config', 'notifications'],
            DATE_FMT: 'DD/MM/YYYY',
            DB_DATE_FMT: 'YYYY-MM-DD',
            CURRENCY: 'VND'
        },
        disabledModules: []
    };

    #modules = {
        'Database': DB_MANAGER,
        'Auth': AUTH_MANAGER,
        'Security': SECURITY_MANAGER,
        'UI': UI_RENDERER,
        'Events': EVENT_MANAGER
    };

    constructor(options = {}) {
        Object.assign(this.#config, options);
    }

    // =========================================================================
    // ★ MODAL ENGINE (Dynamic) - Đã khôi phục 100%
    // =========================================================================

    #createDynamicModal() {
        const appInstance = this;
        return {
            id: '#dynamic-modal',
            instance: null,
            initialStyles: {},

            _getEl: function () { return document.querySelector(this.id); },

            _getInstance: function () {
                const el = this._getEl();
                if (!el) {
                    console.error(`❌ Modal ${this.id} not found!`);
                    return null;
                }

                if (!this.instance) {
                    /* global bootstrap */
                    this.instance = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el, { backdrop: false, keyboard: false });

                    const dialog = el.querySelector('.modal-dialog');
                    if (dialog && Object.keys(this.initialStyles).length === 0) {
                        this.initialStyles = {
                            width: dialog.style.width,
                            maxWidth: dialog.style.maxWidth,
                            minWidth: dialog.style.minWidth,
                            maxHeight: dialog.style.maxHeight,
                            height: dialog.style.height,
                            minHeight: dialog.style.minHeight
                        };
                    }

                    this._initEscListener();
                    new DraggableSetup(this._getEl(), { targetSelector: '.modal-dialog', handleSelector: '.modal-header' });
                    new Resizable(this._getEl(), { targetSelector: '.modal-content', minWidth: 400, minHeight: 300 });

                    onEvent(el, 'hidden.bs.modal', () => { this._resetContent(); }, true);
                }
                return this.instance;
            },

            render: function (htmlContent, title = 'Thông báo') {
                const el = this._getEl();
                if (!el) return false;

                const titleEl = el.querySelector('.modal-title');
                const bodyEl = el.querySelector('#dynamic-modal-body');
                if (!bodyEl) return false;

                if (titleEl && title) titleEl.innerHTML = title;

                try {
                    if (htmlContent instanceof DocumentFragment) {
                        bodyEl.innerHTML = '';
                        bodyEl.appendChild(htmlContent.cloneNode(true));
                    } else if (htmlContent instanceof HTMLElement) {
                        bodyEl.innerHTML = '';
                        if (htmlContent.tagName === 'TEMPLATE') bodyEl.appendChild(htmlContent.content.cloneNode(true));
                        else bodyEl.appendChild(htmlContent.cloneNode(true));
                    } else if (typeof htmlContent === 'string') {
                        bodyEl.innerHTML = htmlContent;
                    }
                    return true;
                } catch (error) {
                    console.error('[Modal.render] ❌ Error:', error);
                    return false;
                }
            },

            show: function (htmlContent = null, title = null, saveHandler = null, resetHandler = null) {
                if (htmlContent) this.render(htmlContent, title);

                const inst = this._getInstance();
                if (inst) {
                    inst.show();
                    setTimeout(() => {
                        if (saveHandler) {
                            this.setSaveHandler(saveHandler);
                            if (!resetHandler) this.setResetHandler(() => this._resetToDefaults(), 'Đặt lại');
                        }
                        if (resetHandler) this.setResetHandler(resetHandler);
                    }, 100);

                    this._setupFullscreenButton();
                }
            },

            _initEscListener: function () {
                const modalEl = this._getEl();
                if (!modalEl) return;

                if (this.escKeyHandler) document.removeEventListener('keydown', this.escKeyHandler);

                this.escKeyHandler = (e) => {
                    if (e.key !== 'Escape') return;
                    const focusedElement = document.activeElement;
                    const isFormElement = focusedElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(focusedElement.tagName);
                    if (isFormElement) return;
                    this.hide();
                };
                document.addEventListener('keydown', this.escKeyHandler, { once: true });
            },

            hide: function () {
                const inst = this._getInstance();
                this._resetToDefaults();
                if (inst) inst.hide();
            },

            _resetContent: function () {
                const el = this._getEl();
                if (el) {
                    const bodyEl = el.querySelector('#dynamic-modal-body');
                    if (bodyEl) bodyEl.innerHTML = '';
                    this._resetButton('#btn-save-modal');
                    this._resetButton('#btn-reset-modal');
                }
                if (this.escKeyHandler) {
                    document.removeEventListener('keydown', this.escKeyHandler);
                    this.escKeyHandler = null;
                }
            },

            setSaveHandler: function (callback, btnText = 'Lưu') {
                this.setFooter(true);
                const btn = this._getButton('#btn-save-modal');
                if (!btn) return;

                const handlers = appInstance.getState('modalHandlers') || {};
                if (handlers.saveHandler) btn.removeEventListener('click', handlers.saveHandler);

                const wrappedHandler = () => callback();
                handlers.save = callback;
                handlers.saveHandler = wrappedHandler;
                appInstance.setState({ modalHandlers: handlers });

                btn.addEventListener('click', wrappedHandler);
                btn.style.display = 'inline-block';
                btn.textContent = btnText;
            },

            setResetHandler: function (callback, btnText = 'Reset') {
                const btn = this._getButton('#btn-reset-modal');
                if (!btn) return;

                const handlers = appInstance.getState('modalHandlers') || {};
                if (handlers.resetHandler) btn.removeEventListener('click', handlers.resetHandler);

                const wrappedHandler = () => callback();
                handlers.reset = callback;
                handlers.resetHandler = wrappedHandler;
                appInstance.setState({ modalHandlers: handlers });

                btn.addEventListener('click', wrappedHandler);
                btn.style.display = 'inline-block';
                btn.textContent = btnText;
                this.setFooter(true);
            },

            setFooter: function (show = true) {
                const el = this._getEl();
                if (el) {
                    const footer = el.querySelector('.modal-footer');
                    if (footer) footer.style.display = show ? 'flex' : 'none';
                }
            },

            _getButton: function (selector) {
                const el = this._getEl();
                return el ? el.querySelector(selector) : null;
            },

            _resetButton: function (selector) {
                const btn = this._getButton(selector);
                if (btn) {
                    const newBtn = btn.cloneNode(true);
                    btn.parentNode.replaceChild(newBtn, btn);
                    newBtn.style.display = 'none';
                }
            },

            _setupFullscreenButton: function () {
                const el = this._getEl();
                if (!el) return;

                const btn = el.querySelector('.btn-fullscreen');
                const dialog = el.querySelector('.modal-dialog');
                if (!btn || !dialog) return;

                if (this._fullscreenHandler) btn.removeEventListener('click', this._fullscreenHandler);

                this._fullscreenHandler = () => {
                    const isFullscreen = dialog.classList.contains('modal-fullscreen');
                    if (isFullscreen) {
                        dialog.classList.remove('modal-fullscreen');
                        dialog.style.width = this.initialStyles.width || '';
                        dialog.style.maxWidth = this.initialStyles.maxWidth || '';
                        dialog.style.maxHeight = this.initialStyles.maxHeight || '';
                        dialog.style.height = this.initialStyles.height || '';
                        btn.querySelector('i').className = 'fa-solid fa-expand';
                        btn.title = 'Fullscreen';
                    } else {
                        dialog.classList.add('modal-fullscreen');
                        dialog.style.width = '100vw';
                        dialog.style.maxWidth = '100vw';
                        dialog.style.maxHeight = '100vh';
                        dialog.style.height = '100vh';
                        btn.querySelector('i').className = 'fa-solid fa-compress';
                        btn.title = 'Exit Fullscreen';
                    }
                };
                onEvent(btn, 'click', this._fullscreenHandler);
            },

            _resetToDefaults: function () {
                const el = this._getEl();
                if (!el) return;
                const dialog = el.querySelector('.modal-dialog');
                if (!dialog) return;

                dialog.style.position = '';
                dialog.style.left = '';
                dialog.style.top = '';
                dialog.style.width = this.initialStyles.width || '';
                dialog.style.height = this.initialStyles.height || '';
                dialog.style.minWidth = this.initialStyles.minWidth || '';
                dialog.style.minHeight = this.initialStyles.minHeight || '';
                dialog.style.maxWidth = this.initialStyles.maxWidth || '';
                dialog.style.maxHeight = this.initialStyles.maxHeight || '';
                dialog.style.transform = '';
                dialog.style.transition = '';

                if (!dialog.classList.contains('modal-dialog-centered')) dialog.classList.add('modal-dialog-centered');
                dialog.classList.remove('modal-fullscreen', 'dragging');

                const btn = el.querySelector('.btn-fullscreen');
                if (btn) {
                    btn.querySelector('i').className = 'fa-solid fa-expand';
                    btn.title = 'Fullscreen';
                }
            }
        }
    }

    _ensureModalExists() {
        if (document.querySelector('#dynamic-modal')) return;

        const modalHTML = `
            <div id="dynamic-modal" class="modal fade" tabindex="-1" aria-hidden="true" data-bs-backdrop="false">
                <div class="modal-dialog modal-dialog-centered" style="width: auto; max-width: max-content; min-width: 300px; padding-bottom: 5rem; max-height: fit-content;">
                    <div class="modal-content shadow-lg border-0">
                        <div class="modal-header bg-gradient py-2">
                            <h6 class="modal-title fw-bold text-uppercase" style="letter-spacing: 1px; justify-self: center;">
                                <i class="fa-solid fa-sliders me-2"></i>Modal Title
                            </h6>
                            <div class="btn-group gap-2">
                                <button class="btn btn-sm btn-link text-dark btn-minimize px-1" title="Minimize"><i class="fa-solid fa-minus"></i></button>
                                <button class="btn btn-sm btn-link text-dark btn-fullscreen px-1" title="Fullscreen"><i class="fa-solid fa-expand"></i></button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>                        
                        </div>
                        <div id="dynamic-modal-body" class="modal-body px-2"></div>
                        <div class="modal-footer bg-gray p-2 m-2 gap-2" data-ft="true" style="display:none;">
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
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    getModalInstance() { return this.Modal; }

    // =========================================================================
    // ★ DYNAMIC METHOD FORWARDING & SHORTCUTS (TỐI ƯU GỌN GÀNG)
    // =========================================================================

    _call(moduleName, methodName, ...args) {
        const module = this.#modules[moduleName];
        if (!module) throw new Error(`Module "${moduleName}" not found. Available: ${Object.keys(this.#modules).join(', ')}`);
        if (typeof module[methodName] !== 'function') throw new Error(`Method "${methodName}" not found in module "${moduleName}"`);
        if (this.#config.debug) console.log(`[App._call] ${moduleName}.${methodName}(...)`, args);
        return module[methodName].apply(module, args);
    }

    call(moduleName, methodName, ...args) {
        return this._call(moduleName, methodName, ...args);
    }

    // Helper tạo Proxy để tái sử dụng mã (Giúp code gọn hơn 5 lần)
    #createProxy(moduleName) {
        return new Proxy({}, {
            get: (target, prop) => {
                const module = this.#modules[moduleName];
                if (prop === 'raw') return module;
                const value = module?.[prop];
                // Bind method về đúng instance để private fields (#) hoạt động đúng
                if (typeof value === 'function') return value.bind(module);
                return value ?? ((...args) => this._call(moduleName, prop, ...args));
            },
            set: (target, prop, value) => {
                this.#modules[moduleName][prop] = value;
                return true;
            }
        });
    }

    get DB() { return this.#createProxy('Database'); }
    get Auth() { return this.#createProxy('Auth'); }
    get Security() { return this.#createProxy('Security'); }
    get UI() { return this.#createProxy('UI'); }
    get Event() { return this.#createProxy('Events'); }

    get Modal() {
        if (!this.#modules['Modal']) this.#modules['Modal'] = this.#createDynamicModal();
        return this.#modules['Modal'];
    }

    // get Notification() {
    //     if (!this.#modules['Notifications']) {
    //         if (!window.CURRENT_USER) {
    //             console.warn('[App] Notification module not ready - CURRENT_USER not set');
    //             return null;
    //         }
    //         // Import trực tiếp class nếu module Loader chưa chạy xong
    //         if(typeof NotificationManager !== 'undefined') {
    //             this.#modules['Notifications'] = NotificationManager.getInstance();
    //         }
    //     }
    //     return this.#modules['Notifications'];
    // }    

    // =========================================================================
    // ★ QUẢN LÝ MODULE ĐỘNG (Đã khôi phục)
    // =========================================================================

    addModule(name, moduleOrClass, initialized = true) {
        const builtInShortcuts = ['DB', 'Auth', 'Security', 'UI', 'Event', 'Modal'];
        if (builtInShortcuts.includes(name)) {
            console.warn(`⚠️ Cannot add module "${name}" - Reserved shortcut`);
            return false;
        }

        if (this.#modules[name] && Object.getOwnPropertyDescriptor(this, name)) {
            console.warn(`⚠️ Module "${name}" already exists.`);
            return false;
        }

        const isClass = typeof moduleOrClass === 'function' && moduleOrClass.toString().includes('class ');

        if (isClass) {
            this.#modules[name] = { _class: moduleOrClass, _instance: null, _isLazy: true };
            Object.defineProperty(this, name, {
                get: () => {
                    return new Proxy(moduleOrClass, {
                        construct: (target, args) => {
                            if (!this.#modules[name]._instance) {
                                this.#modules[name]._instance = new target(...args);
                                const instance = this.#modules[name]._instance;

                                // ✅ Kiểm tra: Nếu constructor không gọi init() thì gọi
                                if (initialized && typeof instance?.init === 'function' && !instance._initialized) {
                                    instance.init();
                                    instance._initialized = true;
                                }
                            }
                            return this.#modules[name]._instance;
                        },
                        get: (target, prop) => target[prop]
                    });
                },
                configurable: true
            });
        } else {
            this.#modules[name] = moduleOrClass;
            Object.defineProperty(this, name, {
                get: () => this.#createProxy(name), // Tái sử dụng proxy helper
                configurable: true
            });

            // ✅ Kiểm tra: Nếu constructor không gọi init() thì gọi
            if (initialized && typeof moduleOrClass?.init === 'function' && !moduleOrClass?._initialized) {
                moduleOrClass.init();
                moduleOrClass._initialized = true;
            }
        }
        return true;
    }

    unregisterModule(name) {
        if (!this.#modules[name]) return false;
        delete this.#modules[name];
        if (Object.getOwnPropertyDescriptor(this, name)) {
            Object.defineProperty(this, name, { get: undefined, set: undefined, configurable: true });
            delete this[name];
        }
        return true;
    }

    getModules() { return Object.keys(this.#modules); }

    // =========================================================================
    // ★ STATE MANAGEMENT
    // =========================================================================

    getState(key = null) { return key ? this.#state[key] : this.#state; }
    getConfig(key = null) { return key ? this.#config[key] : this.#config; }

    setConfig(updates) {
        if ((this.#state.user && this.#state.user.role !== 'admin') && !this.#config.saveLoad) throw new Error('Only admin can update config');

        // 🔧 Xử lý disabledModules - merge vào thay vì ghi đè
        const mergedUpdates = { ...updates };
        if (updates.disabledModules && Array.isArray(updates.disabledModules)) {
            // Giữ nguyên disabledModules từ updates
            mergedUpdates.disabledModules = updates.disabledModules;
        } else if (!updates.disabledModules && this.#config.disabledModules) {
            // Nếu updates không có disabledModules, giữ nguyên cái cũ
            mergedUpdates.disabledModules = this.#config.disabledModules;
        }

        this.#config = { ...this.#config, ...mergedUpdates };
    }

    setState(updates) {
        if (!this.#state.user) throw new Error('Only user can update state');
        this.#state = { ...this.#state, ...updates };
    }

    isReady() { return this.#state.isReady; }

    // =========================================================================
    // ★ APP CONFIG MANAGEMENT (Load/Save from Firestore)
    // =========================================================================

    /**
     * Tải cấu hình ứng dụng từ Firestore app_config/app_secrets/admin_config
     * Và sync vào A.#config + form UI
     */
    async loadAppConfig() {
        try {
            if (this.#state.user && this.#state.user.role !== 'admin' && !this.#config.saveLoad) throw new Error('Only admin can update config');
            const db = this.#modules['Database']?.db || (window.firebase?.firestore && window.firebase.firestore());

            if (!db) {
                console.error('[App.loadAppConfig] ❌ Firestore DB not initialized');
                return false;
            }

            const docRef = db.collection('app_config').doc('app_secrets');
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                console.warn('[App.loadAppConfig] ⚠️ Config document not found, using default');
                return false;
            }

            const firestoreConfig = docSnap.data()?.admin_config || {};

            // Cập nhật A.#config thông qua setConfig
            this.setConfig(firestoreConfig);

            return true;
        } catch (error) {
            console.error('[App.loadAppConfig] ❌ Lỗi:', error);
            return false;
        }
    }

    /**
     * Lưu cấu hình từ form Database Control vào A.#config và Firestore
     */
    async saveAppConfig() {
        try {
            if (this.#state.user && this.#state.user.role !== 'admin') {
                log('⛔ Chỉ Admin mới có quyền lưu cài đặt', 'error');
                return;
            }

            // 1. Lấy dữ liệu từ form
            const formConfig = this._extractConfigFromForm();

            // 2. Cập nhật A.#config thông qua setConfig
            this.setConfig(formConfig);

            // 3. Lưu vào Firestore qua DBManager
            const timestamp = new Date().toISOString();
            // ✅ Route qua DBManager để đồng bộ notification
            await this.#modules['Database'].updateSingle('app_config', 'app_secrets', {
                id: 'app_secrets',
                admin_config: formConfig,
                last_updated: timestamp,
                updated_by: this.#state.user?.email || 'unknown',
            });

            return true;
        } catch (error) {
            console.error('[App.saveAppConfig] ❌ Lỗi:', error);
            log('❌ Lỗi lưu cài đặt: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Trích xuất cấu hình từ form (Database Control tab)
     * Xử lý module_* prefix để quản lý disabledModules
     * @private
     */
    _extractConfigFromForm() {
        const configData = {
            disabledModules: []
        };
        const tbl = document.getElementById('tab-adm-database-control');
        const inputs = tbl ? tbl.querySelectorAll('.erp-config-input') : [];
        if (!inputs.length) {
            console.warn('[App._extractConfigFromForm] ⚠️ No config inputs found to extract');
            return configData;
        }
        inputs.forEach(input => {
            const key = input.getAttribute('data-key') || input.id || input.name;

            if (!key) return; // Skip nếu không có key

            // 🔧 XỬ LÝ MODULE PREFIX
            if (key.startsWith('module_')) {
                // Trích tên module: module_CalculatorWidget -> CalculatorWidget
                const moduleName = key.substring(7);

                // Nếu checkbox không được check (tắt) -> thêm vào disabledModules
                if (input.type === 'checkbox' && !input.checked) {
                    configData.disabledModules.push(moduleName);
                }
            } else {
                // CÁC KEY KHÁC: Lưu bình thường
                if (input.type === 'checkbox') {
                    configData[key] = input.checked;
                } else if (input.type === 'number') {
                    configData[key] = parseFloat(input.value) || 0;
                } else {
                    configData[key] = input.value?.trim() || '';
                }
            }
        });
        return configData;
    }

    /**
     * Đồng bộ cấu hình từ Firestore vào form UI
     * Xử lý disabledModules để set checkbox module_*
     * @private
     */
    _syncConfigToForm(configData) {
        if (!configData) configData = this.#config;
        const tbl = document.getElementById('tab-adm-database-control');
        const inputs = tbl ? tbl.querySelectorAll('.erp-config-input') : [];
        if (!inputs.length) {
            console.warn('[App._syncConfigToForm] ⚠️ No config inputs found to sync');
            return;
        }
        const disabledModules = configData.disabledModules || [];

        inputs.forEach(input => {
            const key = input.getAttribute('data-key') || input.id || input.name;

            if (!key) return; // Skip nếu không có key

            // 🔧 XỬ LÝ MODULE PREFIX
            if (key.startsWith('module_')) {
                // Trích tên module: module_CalculatorWidget -> CalculatorWidget
                const moduleName = key.substring(7);

                // Nếu moduleName nằm trong disabledModules -> uncheck
                if (input.type === 'checkbox') {
                    input.checked = !disabledModules.includes(moduleName);
                }
            } else {
                // CÁC KEY KHÁC: Sync bình thường
                const value = configData[key];

                if (value === undefined || value === null) return;

                if (input.type === 'checkbox') {
                    input.checked = Boolean(value);
                } else if (input.type === 'number') {
                    input.value = Number(value);
                } else {
                    input.value = String(value);
                }
            }
        });

        console.log('[App._syncConfigToForm] ✅ Form synced with config. Disabled modules:', disabledModules);
    }

    // =========================================================================
    // ★ SYSTEM INITIALIZATION
    // =========================================================================

    async init() {
        await this._call('Auth', 'initFirebase');
        this.#listenAuth();
    }

    /**
     * CRITICAL BOOT PATH — chỉ chứa những gì BẮT BUỘC để hiện app.
     *
     * Thứ tự:
     *  1. DB init (lấy Firestore instance)
     *  2. Fetch user doc (timeout 15s)
     *  3. Set CURRENT_USER + xử lý role masking
     *  4. UI.init + applySecurity (load JS role + render template) song song
     *  5. cleanDOM → ensureModal → showLoading(false)
     *
     * Mọi tác vụ không thiết yếu → #runPostBoot() (background, không block).
     */
    #listenAuth() {
        this.#modules['Auth'].auth.onAuthStateChanged(async (user) => {
            const launcher = document.getElementById('app-launcher');
            const appEl = document.getElementById('main-app');

            // ── Chưa đăng nhập ─────────────────────────────────────────────
            if (!user) {
                if (launcher) launcher.remove();
                if (appEl) appEl.style.opacity = 1;
                await this._call('Auth', 'showChoiceScreen');
                return;
            }

            // ── Đã đăng nhập — CRITICAL PATH ──────────────────────────────
            try {
                // 1. Khởi tạo Firestore instance (không await notifications listener)
                await this.#modules['Database'].init();

                // 2. Fetch user profile — timeout 15s tránh treo vô hạn trên mobile
                let docSnap;
                try {
                    docSnap = await Promise.race([
                        this.#modules['Database'].db.collection('users').doc(user.uid).get(),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('⏰ Timeout 15s')), 15000))
                    ]);
                } catch (e) {
                    console.error('[Boot] ❌ Fetch user timeout/error:', e.message);
                    alert('❌ Không thể kết nối server. Kiểm tra mạng và thử lại.');
                    showLoading(false);
                    return;
                }

                if (!docSnap.exists) {
                    alert('Tài khoản chưa có dữ liệu. Vui lòng liên hệ Admin.');
                    showLoading(false);
                    return;
                }

                // 3. Gán CURRENT_USER + xử lý role masking
                const userProfile = docSnap.data();
                this.#state.user = userProfile;

                window.CURRENT_USER = window.CURRENT_USER || {};
                CURRENT_USER.uid = user.uid;
                CURRENT_USER.email = user.email;
                CURRENT_USER.name = userProfile.user_name || '';
                CURRENT_USER.level = userProfile.level;
                CURRENT_USER.profile = userProfile;
                CURRENT_USER.group = userProfile.group || '';

                const masker = localStorage.getItem('erp-mock-role');
                if (masker) {
                    const mockData = JSON.parse(masker);
                    const realRole = mockData.realRole;
                    if (realRole === 'admin' || realRole === 'manager' || CURRENT_USER.level >= 50) {
                        CURRENT_USER.role = mockData.maskedRole;
                        CURRENT_USER.realRole = realRole;
                        localStorage.removeItem('erp-mock-role');
                        this.#modules['UI'].renderedTemplates = {};
                        // Xóa script/template của role cũ
                        ['JS_MANIFEST', 'TEMPLATE_MANIFEST'].forEach(manifestName => {
                            const m = window[manifestName];
                            if (!m) return;
                            Object.values(m).flat().forEach(id => {
                                const sel = manifestName === 'JS_MANIFEST'
                                    ? `script[src*="${id}"]`
                                    : `#${id}`;
                                document.querySelectorAll(sel).forEach(el => el.remove());
                            });
                        });
                    }
                } else {
                    CURRENT_USER.role = userProfile.role || 'guest';
                }

                // 4. Khởi tạo UI renderer + render template theo role (song song)
                const moduleManager = new MODULELOADER(this, this.#config.disabledModules);
                this.#moduleManager = moduleManager;
                this.#config.saveLoad = true;

                CR_COLLECTION = (typeof ROLE_DATA !== 'undefined' ? ROLE_DATA[CURRENT_USER.role] : '') || '';

                await Promise.all([
                    this._call('UI', 'init', moduleManager),
                    SECURITY_MANAGER.applySecurity(CURRENT_USER),
                ]);

                this.#config.saveLoad = false;
                SECURITY_MANAGER.cleanDOM(document);
                this._ensureModalExists();

                // 5. Hiển thị app — xóa màn hình loading
                if (appEl) appEl.style.opacity = 1;
                if (launcher) launcher.remove();
                if (appEl) appEl.classList.remove('d-none');
                showLoading(false);

                this.#state.isReady = true;
                log('✅ App ready', 'success');

                // Chạy tất cả tác vụ background — KHÔNG block UI
                this.#runPostBoot(user, moduleManager);

            } catch (err) {
                console.error('[Boot] ❌ Critical boot failed:', err);
                showLoading(false);
                document.body.innerHTML =
                    `<div class="text-danger p-4"><strong>Lỗi khởi động:</strong> ${err.message}</div>`;
            }
        });
    }

    /**
     * Chạy BACKGROUND sau khi app đã hiển thị.
     * Tất cả tác vụ ở đây đều không block UI và có thể fail im lặng.
     *
     * @param {object} user          - Firebase auth user
     * @param {MODULELOADER} mgr     - Module manager instance
     */
    async #runPostBoot(user, mgr) {
        // a. Cập nhật user menu
        try { this._call('Auth', 'updateUserMenu'); } catch (_) { }

        // b. Load UI modules TRƯỚC (OffcanvasMenu → đăng ký <at-modal-full> custom element)
        //    Phải hoàn thành trước khi AdminConsole / ReportModule khởi tạo.
        try {
            await mgr.loadUiModules();
        } catch (e) {
            console.warn('[PostBoot] uiModules load error:', e.message);
        }

        // c. Load config từ Firestore (không block UI)
        this.loadAppConfig().catch(e => console.warn('[PostBoot] loadAppConfig:', e.message));

        // d. Load data (silent=true — không render UI ngay) + common/async modules song song.
        //    at-modal-full đã được đăng ký ở bước b → an toàn cho AdminConsole / ReportModule.
        const dataPromise = (typeof loadDataFromFirebase === 'function')
            ? loadDataFromFirebase(true).catch(e => console.warn('[PostBoot] dataLoad:', e.message))
            : Promise.resolve();

        try {
            await Promise.all([
                mgr.loadCommonModules(),
                mgr.loadAsyncModules(CURRENT_USER.role),
                dataPromise,
            ]);
        } catch (e) {
            console.warn('[PostBoot] Module load error:', e.message);
        }
        await SECURITY_MANAGER.cleanDOM(document);
        // e. Cả UI modules + data đã sẵn sàng → render UI với data
        if (typeof handleServerData === 'function') {
            try { debounce(handleServerData, 500)(APP_DATA); } catch (e) { console.warn('[PostBoot] handleServerData:', e.message); }
        }

        // e-bis. Activate đúng startup tab sau khi:
        //   • loadUiModules() (bước b) đã tạo nav buttons trong DOM
        //   • data đã load và handleServerData đã chạy
        // Ghi đè lần gọi activateTab sớm trong applySecurity (lúc đó chưa có nav btn).
        // Mobile sẽ override tiếp tại bước j.
        if (typeof activateTab === 'function' && window.innerWidth > 768) {
            try {
                // tab-admin-dashboard không có render targets → dùng tab-dashboard cho mọi role
                // Admin có thể chuyển sang Admin Dashboard qua header dropdown.
                activateTab('tab-dashboard');
            } catch (e) { console.warn('[PostBoot] activateTab:', e.message); }
        }

        // f. Event manager
        try {
            const em = new this.#modules['Events']();
            em.init();
        } catch (e) {
            console.warn('[PostBoot] EventManager:', e.message);
        }

        // g. Acc footer toggle
        if (['acc', 'acc_thenice'].includes(CURRENT_USER.role)) {
            if (typeof toggleTemplate === 'function') toggleTemplate('erp-footer-menu-container');
        }

        // h. Notification manager
        if (this.#modules['NotificationManager']) {
            try {
                await this._call('NotificationManager', 'init');
                this.#modules['NotificationManager'].sendToAdmin(
                    'User Login',
                    `${CURRENT_USER.name} (${CURRENT_USER.email}) vừa đăng nhập.`
                );
            } catch (e) {
                console.warn('[PostBoot] NotificationManager:', e.message);
            }
        }

        // i. Keyboard shortcuts
        if (typeof window.initShortcuts === 'function') window.initShortcuts();

        // j. Mobile-specific tweaks (chạy sau khi UI đã render)
        const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
        if (isMobile) {
            if (typeof activateTab === 'function' && document.getElementById('tab-form')) {
                activateTab('tab-form');
            }
            document.querySelectorAll('.desktop-only').forEach(el => el.remove());
            document.body.classList.add('no-select');
        }

        // k. Thêm <at-modal-full> vào DOM nếu chưa có.
        // Custom element đã được đăng ký bởi OffcanvasMenu ở bước e.
        // connectedCallback() tự xử lý DraggableSetup bên trong.
        if (!document.querySelector('at-modal-full')) {
            document.body.appendChild(document.createElement('at-modal-full'));
        }
        const existingMenu = document.querySelector('offcanvas-menu');

        if (!existingMenu) {
            const menu = document.createElement('offcanvas-menu');
            document.body.appendChild(menu);
            log('✅ [9Trip System] ERP Left Menu Injected.', 'success');

            menu.addEventListener('pin-changed', (e) => {
                _updateMenuState({ isPinned: e.detail.isPinned });
            });
            menu.addEventListener('side-changed', (e) => {
                _updateMenuState({ isRightSide: e.detail.isRightSide });
            });
            menu.addEventListener('resize-changed', (e) => {
                _updateMenuState({ menuWidth: e.detail.width });
            });
            // menu.toggleSide();
        };
    }
}

// =====================================================================
// 2. DYNAMIC MODULE MANAGER (Giữ nguyên kiến trúc của bạn)
// =====================================================================
class MODULELOADER {
    #config = { disabledModules: [] };
    #appInstance = null;

    constructor(appInstance, disabledModules = []) {
        this.#appInstance = appInstance;
        this.loaded = {};
        // Normalize disabledModules to lowercase for case-insensitive comparison
        this.#config.disabledModules = (disabledModules || []).map(m => m);
        log('[ModuleLoader] Initialized with disabled modules:', this.#config.disabledModules);
        this.registry = {
            'DB': () => import('./modules/DBManager.js').then(m => m.default),
            'HotelPriceController': () => import('./modules/M_HotelPrice.js').then(m => m.HotelPriceController),
            'ServicePriceController': () => import('./modules/M_ServicePrice.js').then(m => m.default),
            'PriceManager': () => import('./modules/M_PriceManager.js').then(m => m.default),
            'AdminConsole': () => import('./modules/AdminController.js').then(m => m.AdminConsole),
            'ReportModule': () => import('./modules/ReportModule.js').then(m => m.default),
            'ThemeManager': () => import('./modules/ThemeManager.js').then(m => m.default),

            'Lang': () => import('./modules/TranslationModule.js').then(m => m.Lang),
            'NotificationManager': () => import('./modules/NotificationModule.js').then(m => m.default),
            'CalculatorWidget': () => import('./common/components/calculator_widget.js').then(m => m.CalculatorWidget),
            'ErpHeaderMenu': () => import('./common/components/header_menu.js').then(m => m.default),
            'ErpFooterMenu': () => import('./common/components/footer_menu.js').then(m => m.default),
            'ChromeMenuController': () => import('./common/components/Menu_StyleChrome.js').then(m => m.ChromeMenuController),
            // Side-effect import: đăng ký custom element <offcanvas-menu> + <at-modal-full>
            // Trả về adapter object trỏ đến DOM instance để A.OffcanvasMenu.open() hoạt động
            'OffcanvasMenu': async () => {
                await import('./common/components/offcanvas_menu.js');
                const getEl = () => document.querySelector('offcanvas-menu');
                return {
                    init: () => getEl()?.open(),
                    close: () => getEl()?.close(),
                    toggle: () => getEl()?.toggle(),
                    togglePin: () => getEl()?.togglePin(),
                    toggleSide: () => getEl()?.toggleSide(),
                    setState: (s) => getEl()?.setState(s),
                    get el() { return getEl(); },
                };
            }
        };

        this.roleMap = {
            'admin': ['AdminConsole'],
            'op': ['HotelPriceController', 'ServicePriceController', 'PriceManager'],
            'acc': [],
            'sale': ['PriceManager'],
            'acc_thenice': ['PriceManager']
        };
        this.forAllModules = ['ReportModule', 'CalculatorWidget', 'ThemeManager', 'Lang', 'NotificationManager', 'PriceManager'];
        this.commonModules = ['Lang', 'ThemeManager'];
        this.uiModules = ['ErpHeaderMenu', 'ErpFooterMenu', 'ChromeMenuController', 'OffcanvasMenu'];
        this.asyncModules = ['AdminConsole', 'ReportModule', 'CalculatorWidget', 'HotelPriceController', 'ServicePriceController', 'PriceManager', 'NotificationManager'];
    }

    /**
     * Helper method: Kiểm tra module có bị disable không (case-insensitive)
     * @private
     */
    _isModuleDisabled(moduleKey) {
        return this.#config.disabledModules.includes(moduleKey);
    }

    async loadModule(moduleKey, initialized = true) {
        if (this._isModuleDisabled(moduleKey)) return null;
        if (this.loaded[moduleKey]) return this.loaded[moduleKey];

        try {
            const moduleImport = await this.registry[moduleKey]();
            this.loaded[moduleKey] = moduleImport;
            this.#appInstance.addModule(moduleKey, moduleImport, initialized);
            log(`[ModuleManager] ✅ Loaded module: ${moduleKey}`, 'success');
            return moduleImport;
        } catch (error) {
            console.error(`[ModuleManager] ❌ Lỗi khi tải ${moduleKey}:`, error);
            return null;
        }
    }

    async loadCommonModules() {
        const commonToLoad = this.commonModules;
        if (commonToLoad.length > 0) await Promise.all(commonToLoad.map(key => this.loadModule(key)));
    }
    async loadUiModules() {
        const uiToLoad = this.uiModules;
        if (uiToLoad.length > 0) await Promise.all(uiToLoad.map(key => this.loadModule(key)));
    }

    async loadAsyncModules(role) {
        const asyncToLoad = this.asyncModules;
        const modulesToLoad = asyncToLoad
            .filter(key => !this._isModuleDisabled(key))
            .filter(key => this.roleMap[role].includes(key) || this.forAllModules.includes(key));
        if (modulesToLoad.length > 0) await Promise.all(modulesToLoad.map(key => this.loadModule(key)));
    }

    async loadForRole(role) {
        const roleKey = role.toLowerCase();
        let modulesToLoad = this.roleMap[roleKey] || this.roleMap['sale'];

        const activeModules = modulesToLoad
            .filter(key => !this._isModuleDisabled(key))
            .filter(key => !this.commonModules.includes(key))
            .filter(key => !this.asyncModules.includes(key));

        if (activeModules.length > 0) await Promise.all(activeModules.map(key => this.loadModule(key)));
    }
}

// =========================================================================
// EXPORT & BOOTSTRAP
// =========================================================================

const A = new Application();
window.A = A;
export default A;

document.addEventListener('DOMContentLoaded', () => {
    // Chỉ gọi init() — critical path tiếp tục bên trong #listenAuth.
    // Mọi tác vụ sau khi app hiển thị (mobile tweaks, modal-full, v.v.)
    // được xử lý trong #runPostBoot sau khi A.#state.isReady = true.
    A.init().catch(e => {
        console.error('Critical Error:', e);
        document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
    });
});