import { AUTH_MANAGER, SECURITY_MANAGER } from './LoginModule.js';

// Expose globally so legacy scripts (logic_operator, api_operator, etc.) can access it

// ─── Private Symbol used as lazy-wrapper marker inside Application.#modules ───
// Using a Symbol (instead of a string key) prevents accidental collision with
// any plain-object module that might happen to own a property named '_isLazy'.
const _LAZY = Symbol('AppLazyModule');

// =========================================================================
// APPLICATION CLASS
// =========================================================================

class Application {
    #state = {
        isReady: false,
        user: {}, // Giữ nguyên: {} thay vì null
        currentView: {}, // Dữ liệu màn hình hiện tại
        tempMatrix: {}, // [QUAN TRỌNG] Lưu dữ liệu input ẩn realtime
        eventCache: new Set(),
    };
    #moduleManager = null;
    #config = {
        debug: true,
        fbDebugToken: '42655718-72A6-44EE-B9E9-3135A302B0D4',
        roles: {},
        tables: {},
        path: {},
        // consts: {
        //   collections: ['bookings', 'booking_details', 'customers', 'operator_entries', 'transactions', 'suppliers', 'hotels', 'hotel_price_schedules', 'service_price_schedules', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'users', 'app_config', 'notifications', 'tour_prices'],
        // },
        intl: { locale: 'vi-VN', dateOptions: { day: '2-digit', month: '2-digit', year: 'numeric' }, currencyOptions: { style: 'currency', currency: 'VND', minimumFractionDigits: 0, maximumFractionDigits: 1 }, numberOptions: { minimumFractionDigits: 0, maximumFractionDigits: 1 } },
        disabledModules: ['Router'],
        ADMIN_EMAILS: ['tranthuaanh90@gmail.com', '9tripphuquoc@gmail.com', 'tranthuaanh90@9tripphuquoc.com'],
    };

    #modules = {
        Database: null,
        Auth: AUTH_MANAGER,
        Security: null,
        UI: null,
        Event: null,
    };

    constructor(options = {}) {
        Object.assign(this.#config, options);
    }

    /**
     * Register a module under `name` and expose it as `A.<name>`.
     *
     * @param {string}   name          - Property name to expose on the Application instance.
     * @param {*}        moduleOrClass - One of three shapes:
     *   • Class constructor  (detected via non-writable .prototype)
     *       → stored as lazy wrapper; instantiated on first property access
     *   • Plain object / pre-instantiated singleton
     *       → stored and proxied directly
     *   • Plain function (factory / namespace with attached methods)
     *       → treated as plain object (properties accessed via function.prop)
     * @param {boolean}  initialized   - When true (default) and the resolved instance exposes
     *                                   an `init()` method, it is called automatically.
     *                                   Pass false when you want to call `init()` yourself.
     * @param {any[]}    ctorArgs      - Arguments forwarded to `new Class(...ctorArgs)`.
     *                                   Only relevant for the Class shape.
     */
    addModule(name, moduleOrClass, initialized = true, ctorArgs = []) {
        const builtInShortcuts = ['Auth'];
        if (builtInShortcuts.includes(name)) {
            console.warn(`⚠️ Cannot add module "${name}" - Reserved shortcut`);
            return false;
        }

        if (this.#modules[name] && Object.getOwnPropertyDescriptor(this, name)) {
            console.warn(`⚠️ Module "${name}" already exists.`);
            return false;
        }

        // ── Robust class detection ────────────────────────────────────────────────
        const protoDesc = typeof moduleOrClass === 'function' ? Object.getOwnPropertyDescriptor(moduleOrClass, 'prototype') : undefined;
        const isClassConstructor = protoDesc !== undefined && protoDesc.writable === false;

        if (isClassConstructor) {
            // ── 9TRIP OPTIMIZATION: Handle Lazy vs Eager instantiation ──
            // Nếu class có static autoInit = false HOẶC tham số initialized = false
            // => Sử dụng Lazy Wrapper để trì hoãn việc tạo instance.
            const shouldLazy = moduleOrClass.autoInit === false || initialized === false;

            if (shouldLazy) {
                this.#modules[name] = {
                    [_LAZY]: true,
                    _class: moduleOrClass,
                    _instance: null,
                    _autoInit: initialized,
                    _ctorArgs: ctorArgs,
                };
            } else {
                // Khởi tạo ngay lập tức (Eager)
                try {
                    const instance = new moduleOrClass(...ctorArgs);
                    this.#modules[name] = instance;

                    if (initialized && typeof instance.init === 'function' && !instance._initialized) {
                        instance.init();
                        instance._initialized = true;
                        L._(`🚀 [App.addModule] Module "${name}" Auto initialized.`);
                    }
                } catch (error) {
                    console.error(`[App.addModule] ❌ Lỗi khi khởi tạo class "${name}":`, error);
                    return false;
                }
            }
        } else {
            // Shape A — plain object / singleton / instance đã có
            this.#modules[name] = moduleOrClass;

            if (initialized && typeof moduleOrClass?.init === 'function' && !moduleOrClass?._initialized) {
                moduleOrClass.init();
                moduleOrClass._initialized = true;
            }
        }

        // Đăng ký Proxy để truy cập module qua A.<name>
        Object.defineProperty(this, name, {
            get: () => this.#createProxy(name),
            set: (value) => {
                // Cho phép ghi đè/cập nhật trực tiếp vào kho lưu trữ module
                // Nếu value là một instance mới, ta sẽ cập nhật vào #modules
                this.#modules[name] = value;
                return true;
            },
            configurable: true,
        });
        return true;
    }

    /**
     * Universal proxy factory — handles all module shapes:
     *
     *   Shape A — Plain singleton object (isClass=false, Modal, pre-instantiated imports)
     *             stored value is the object itself.
     *
     *   Shape B — Lazy class wrapper [_LAZY]=true
     *             { [_LAZY]: true, _class: Ctor, _instance: null, _autoInit, _ctorArgs }
     *             #resolveModule() auto-instantiates on first property access.
     *
     * Special props (always available through the proxy):
     *   • `.raw`   → the raw stored value (wrapper or plain object)
     *   • `.class` → original class constructor (Shape B only, else null)
     */
    #createProxy(moduleName) {
        return new Proxy(
            {},
            {
                get: (target, prop) => {
                    // Escape hatch: ignore Symbol probes (e.g. Symbol.toPrimitive, Symbol.iterator)
                    // so the proxy is never accidentally treated as iterable/thenable.
                    if (typeof prop === 'symbol') {
                        const module = this.#resolveModule(moduleName);
                        return module?.[prop];
                    }

                    const stored = this.#modules[moduleName];
                    if (prop === 'raw') return stored;
                    if (prop === 'class') return stored?.[_LAZY] ? stored._class : null;

                    const module = this.#resolveModule(moduleName);
                    if (!module) return undefined;

                    let value = module[prop];

                    // ─── 9TRIP FIX: Support Static Properties for Class-based Modules ───
                    // If property not found on instance, check the original class (static members)
                    if (value === undefined && stored?.[_LAZY] && stored._class) {
                        value = stored._class[prop];
                        if (typeof value === 'function') return value.bind(stored._class);
                    }

                    // Bind method to the resolved instance so private fields (#) work correctly.
                    // Arrow functions / non-function values are returned as-is.
                    if (typeof value === 'function') return value.bind(module);
                    return value;
                },

                set: (target, prop, value) => {
                    // Always write to the resolved instance (never to the lazy wrapper object).
                    const module = this.#resolveModule(moduleName);
                    if (module) {
                        module[prop] = value;
                        return true;
                    }
                    // Module does not exist yet — write is a no-op but must return true per Proxy spec.
                    return true;
                },

                has: (target, prop) => {
                    const module = this.#resolveModule(moduleName);
                    return module ? prop in module : false;
                },

                // Prevent JSON.stringify / Object.keys from seeing the empty {}
                // and instead reflect the resolved module's own keys.
                ownKeys: (target) => {
                    const module = this.#resolveModule(moduleName);
                    return module ? Reflect.ownKeys(module) : [];
                },
                getOwnPropertyDescriptor: (target, prop) => {
                    const module = this.#resolveModule(moduleName);
                    return module ? Object.getOwnPropertyDescriptor(module, prop) : undefined;
                },
            }
        );
    }
    /**
     * Resolve the actual module target from #modules, handling lazy class wrappers.
     *
     * Shape of a lazy wrapper (stored in #modules):
     *   { [_LAZY]: true, _class: Ctor, _instance: null, _autoInit: bool, _ctorArgs: any[] }
     *
     * - Plain object / singleton (isClass=false, Modal) → returned as-is
     * - Lazy class wrapper  [_LAZY]=true   → auto-instantiates singleton on first access
     * @private
     */
    #resolveModule(moduleName) {
        const stored = this.#modules[moduleName];
        if (!stored) return null;
        if (!stored[_LAZY]) return stored; // plain object — return as-is

        // ── Lazy class wrapper: instantiate singleton on first access ──
        if (!stored._instance) {
            stored._instance = new stored._class(...(stored._ctorArgs || []));
            if (stored._autoInit && typeof stored._instance.init === 'function' && !stored._instance._initialized) {
                stored._instance.init();
                stored._instance._initialized = true;
            }
        }
        return stored._instance;
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

    getModules() {
        return Object.keys(this.#modules);
    }

    // =========================================================================
    // ★ SYSTEM INITIALIZATION
    // =========================================================================

    async init() {
        await this._call('Auth', 'initFirebase');
        this.#listenAuth();
    }

    // =========================================================================
    // ★ DYNAMIC METHOD FORWARDING & SHORTCUTS (TỐI ƯU GỌN GÀNG)
    // =========================================================================

    _call(moduleName, methodName, ...args) {
        const module = this.#resolveModule(moduleName);
        if (!module) throw new Error(`Module "${moduleName}" not found. Available: ${Object.keys(this.#modules).join(', ')}`);
        if (typeof module[methodName] !== 'function') throw new Error(`Method "${methodName}" not found in module "${moduleName}"`);
        return module[methodName].apply(module, args);
    }

    call(moduleName, methodName, ...args) {
        return this._call(moduleName, methodName, ...args);
    }

    async load(module, initialized = true, args) {
        if (!this.#moduleManager) {
            this.#moduleManager = new MODULELOADER(this, this.#config.disabledModules);
        }
        return await this.#moduleManager.loadModule(module, initialized, args);
    }
    // =========================================================================
    // ★ MODAL MANAGER - SMART PROXY
    // =========================================================================

    /**
     * Getter: Trả về Proxy của Modal cao nhất hiện tại (Topmost)
     * Giúp gọi A.Modal.show() luôn trúng modal trên cùng.
     */
    get Modal() {
        // Hỗ trợ lazy-load / dynamic import thông qua ModuleManager
        return this.#createProxy('Modal');
    }

    // /**
    //  * Setter: Cho phép đăng ký nhanh một instance modal vào hệ thống
    //  * Giải quyết lỗi 'has only a getter'
    //  */
    // set Modal(modalInstance) {
    //     if (!modalInstance) return;

    //     // Nếu truyền vào một object có cấu trúc {id, data} hoặc một instance có property id
    //     const id = modalInstance.id || 'Modal';
    //     const data = modalInstance.data || modalInstance;

    //     this.#modules[id] = data;

    //     // Đồng bộ tạo Proxy nếu id này chưa được định nghĩa trên instance A
    //     if (!Object.getOwnPropertyDescriptor(this, id)) {
    //         Object.defineProperty(this, id, {
    //             get: () => this.#createProxy(id),
    //             set: (val) => {
    //                 this.#modules[id] = val;
    //                 return true;
    //             },
    //             configurable: true,
    //         });
    //     }
    // }

    get DB() {
        return this.#createProxy('Database');
    }
    get Auth() {
        return this.#createProxy('Auth');
    }
    get Security() {
        return this.#createProxy('Security');
    }
    get CalculatorWidget() {
        return this.#createProxy('CalculatorWidget');
    }
    get UI() {
        return this.#createProxy('UI');
    }
    get Event() {
        return this.#createProxy('Event');
    }

    // --- FIX GETSTATE / GETCONFIG ---
    getState(key = null) {
        if (key === 'user') return Object.freeze(structuredClone(this.#state.user));
        if (key && (key.includes('/') || key.includes('.'))) {
            const keys = key.split(/[\/\.]/);
            let target = this.#state;
            for (const k of keys) {
                // Fix: Kiểm tra cả null và undefined
                if (target === null || target === undefined || target[k] === undefined) return undefined;
                target = target[k];
            }
            return target;
        }
        return key ? this.#state[key] : this.#state;
    }
    getConfig(key = null) {
        // 1. Kiểm tra nếu key có chứa '/' hoặc '.'
        if (key && (key.includes('/') || key.includes('.'))) {
            // 2. Sử dụng Regex /[\/\.]/ để split bởi cả hai ký tự
            const keys = key.split(/[\/\.]/);
            let target = this.#config;

            for (let i = 0; i < keys.length; i++) {
                if (target[keys[i]] === undefined) return undefined;
                target = target[keys[i]];
            }
            return target;
        }
        return key ? this.#config[key] : this.#config;
    }

    // --- FIX SETCONFIG ---
    setConfig(keyOrUpdates, value = null) {
        if (this.#state.user && this.#state.user.role !== 'admin' && !this.#config.saveLoad && !this.#config.debug) {
            console.warn('Only admin can update config');
            return;
        }

        if (typeof keyOrUpdates === 'string' && (keyOrUpdates.includes('.') || keyOrUpdates.includes('/'))) {
            const keys = keyOrUpdates.split(/[\/\.]/);
            const newConfig = { ...this.#config };
            let current = newConfig;

            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                current[k] = current[k] && typeof current[k] === 'object' ? { ...current[k] } : {};
                current = current[k];
            }
            current[keys[keys.length - 1]] = value;
            this.#config = newConfig;
        } else {
            // Fix lỗi ReferenceError và logic merge disabledModules
            const updates = { ...keyOrUpdates };
            if (!updates.disabledModules && this.#config.disabledModules) {
                updates.disabledModules = this.#config.disabledModules;
            }
            this.#config = { ...this.#config, ...updates };
        }
    }

    // --- FIX SETSTATE ---
    setState(keyOrUpdates, value = null) {
        if (!this.#state.user) throw new Error('State must have a user');

        if (typeof keyOrUpdates === 'string' && (keyOrUpdates.includes('.') || keyOrUpdates.includes('/'))) {
            const keys = keyOrUpdates.split(/[\/\.]/);
            const newState = { ...this.#state };
            let current = newState;

            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                // Đảm bảo tạo bản sao mới để giữ tính immutable
                current[k] = current[k] && typeof current[k] === 'object' ? { ...current[k] } : {};
                current = current[k];
            }

            const lastKey = keys[keys.length - 1];
            if (lastKey === 'user') throw new Error('Only user can update state');
            current[lastKey] = value;
            this.#state = newState;
        } else if (typeof keyOrUpdates === 'object' && keyOrUpdates !== null) {
            if (keyOrUpdates.user) throw new Error('Only user can update state');
            this.#state = { ...this.#state, ...keyOrUpdates };
        }
    }

    isReady() {
        return this.#state.isReady;
    }

    // =========================================================================
    // ★ APP CONFIG MANAGEMENT (Load/Save from Firestore)
    // =========================================================================

    /**
     * Tải cấu hình ứng dụng từ Firestore app_config/app_secrets/admin_config
     * Và sync vào A.#config + form UI
     */
    async loadAppConfig() {
        try {
            const cfg = await this.#modules['Database'].getCollection('app_config', 'app_secrets');
            const firestoreConfig = cfg.admin_config || {};
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
            if (this.#state.user && this.#state.user.role !== 'admin' && !this.#config.debug) {
                L._('⛔ Chỉ Admin mới có quyền lưu cài đặt', 'error');
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
            L._('❌ Lỗi lưu cài đặt: ' + error.message, 'error');
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
            disabledModules: [],
        };
        const tbl = getE('tab-adm-app-config');
        const inputs = tbl ? tbl.querySelectorAll('.erp-config-input') : [];
        if (!inputs.length) {
            console.warn('[App._extractConfigFromForm] ⚠️ No config inputs found to extract');
            return configData;
        }
        inputs.forEach((input) => {
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
            } else if (key.includes('/')) {
                // 🔧 XỬ LÝ NESTED KEY (ví dụ: "notifications/emailEnabled")
                const keys = key.split('/');
                let target = configData;
                for (let i = 0; i < keys.length - 1; i++) {
                    if (!target[keys[i]]) target[keys[i]] = {};
                    target = target[keys[i]];
                }
                const finalKey = keys[keys.length - 1];
                if (input.type === 'checkbox') {
                    target[finalKey] = input.checked;
                } else if (input.type === 'number') {
                    target[finalKey] = parseFloat(input.value) || 0;
                } else {
                    target[finalKey] = input.value?.trim() || '';
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
        const tbl = getE('tab-adm-app-config');
        const inputs = tbl ? tbl.querySelectorAll('.erp-config-input') : [];
        if (!inputs.length) {
            console.warn('[App._syncConfigToForm] ⚠️ No config inputs found to sync');
            return;
        }
        const disabledModules = configData.disabledModules || [];

        inputs.forEach((input) => {
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
            } else if (key.includes('/')) {
                // 🔧 XỬ LÝ NESTED KEY (ví dụ: "notifications/emailEnabled")
                const keys = key.split('/');
                let target = configData;
                for (let i = 0; i < keys.length - 1; i++) {
                    if (target[keys[i]] === undefined) return; // Nếu bất kỳ cấp nào không tồn tại, skip
                    target = target[keys[i]];
                }
                const finalKey = keys[keys.length - 1];
                const value = target[finalKey];
                if (value === undefined || value === null) return;
                if (input.type === 'checkbox') {
                    input.checked = Boolean(value);
                } else if (input.type === 'number') {
                    input.value = Number(value);
                } else {
                    input.value = String(value);
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
    }

    #listenAuth() {
        this.#modules['Auth'].auth.onAuthStateChanged(async (user) => {
            const launcher = getE('app-launcher');
            const appEl = getE('main-app');

            // ── Chưa đăng nhập ─────────────────────────────────────────────
            if (!user) {
                if (launcher) launcher.remove();
                if (appEl) appEl.style.opacity = 1;
                L._('!user-not-logged-in');
                await this._call('Auth', 'showChoiceScreen');
                return;
            }

            // ── Đã đăng nhập — CRITICAL PATH ──────────────────────────────
            try {
                const mdl = { MODULELOADER: () => import('@core/ModuleLoader.js').then((m) => m.default) };
                const MODULELOADER = await mdl.MODULELOADER();

                this.#moduleManager = new MODULELOADER(this, this.#config.disabledModules);
                await this.#moduleManager.loadCoreModules();
                await this.#modules['Database'].init();
                await this._call('Event', 'init');

                // 2. Fetch user profile — timeout 15s tránh treo vô hạn trên mobile
                let docSnap;
                try {
                    docSnap = await this.#modules['Database'].getCollection('users', user.uid);
                } catch (e) {
                    console.error('[Boot] ❌ Fetch user timeout/error:', e.message);
                    logA('❌ Không thể kết nối server. Kiểm tra mạng và thử lại.', 'warning', 'alert');
                    showLoading(false);
                    return;
                }

                if (!docSnap) {
                    logA('Tài khoản chưa có dữ liệu. Vui lòng liên hệ Admin.', 'warning', 'alert');
                    showLoading(false);
                    return;
                }
                this.#moduleManager.loadModule('Modal', true, ['dynamic-modal', {}, this]);
                // 3. Gán CURRENT_USER + xử lý role masking
                const userProfile = docSnap;
                // ─── THÊM ĐOẠN NÀY: CHẶN RENDER FRONTEND NẾU LÀ ADMIN APP ───
                if (window.location.pathname.startsWith('/admin')) {
                    // Xóa thẻ Login (nếu nó đang hiển thị)
                    const launcher = document.getElementById('app-launcher');
                    if (launcher) launcher.remove();

                    this.#state.user = userProfile;
                    window.CURRENT_USER = userProfile;
                    // Báo cho admin_app.js biết là Auth đã xử lý xong
                    this.#state.isReady = true;
                    return; // Dừng ngay, không chạy tiếp các logic vẽ UI bên dưới
                }
                await this.load('UI', false);

                if ((userProfile.role === 'admin' || userProfile.level >= 50) && typeof applyModeFromUrl === 'function' && applyModeFromUrl()) return;
                this.#state.user = userProfile;
                const masker = localStorage.getItem('erp-mock-role');
                if (masker) {
                    const mockData = JSON.parse(masker);
                    const realRole = mockData.realRole;
                    if (realRole === 'admin' || realRole === 'manager' || userProfile.level >= 50) {
                        userProfile.role = mockData.maskedRole;
                        window.CURRENT_USER = window.CURRENT_USER || {};
                        this.#state.user.realRole = realRole;
                        localStorage.removeItem('erp-mock-role');
                        this.#modules['UI'].renderedTemplates = {};
                        // Xóa script/template của role cũ
                        ['JS_MANIFEST', 'TEMPLATE_MANIFEST'].forEach((manifestName) => {
                            const m = window[manifestName];
                            if (!m) return;
                            Object.values(m)
                                .flat()
                                .forEach((id) => {
                                    const sel = manifestName === 'JS_MANIFEST' ? `script[src*="${id}"]` : `#${id}`;
                                    document.querySelectorAll(sel).forEach((el) => el.remove());
                                });
                        });
                    }
                }

                this.#state.user.uid = user.uid;
                this.#state.user.name = userProfile.user_name || '';
                this.#state.user.profile = userProfile;
                this.#config.saveLoad = true;

                CURRENT_USER = this.#state.user;
                CR_COLLECTION = (typeof ROLE_DATA !== 'undefined' ? ROLE_DATA[CURRENT_USER.role] : '') || '';

                await Promise.all([this._call('UI', 'init', this.#moduleManager), SECURITY_MANAGER.applySecurity(CURRENT_USER), this.#moduleManager.loadForRole(CURRENT_USER.role)]);
                this.#moduleManager.loadModule('Router', false);

                this.#config.saveLoad = false;

                // 5. Hiển thị app — xóa màn hình loading
                if (appEl) appEl.style.opacity = 1;
                if (launcher) launcher.remove();
                if (appEl) appEl.classList.remove('d-none');
                showLoading(false);

                this.#state.isReady = true;

                // Chạy tất cả tác vụ background — KHÔNG block UI
                this.#runPostBoot(user, this.#moduleManager);
            } catch (err) {
                console.error('[Boot] ❌ Critical boot failed:', err);
                showLoading(false);
                document.body.innerHTML = `<div class="text-danger p-4"><strong>Lỗi khởi động:</strong> ${err.message}</div>`;
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
        try {
            this._call('Auth', 'updateUserMenu');
        } catch (_) {}

        // b. Load UI modules TRƯỚC (OffcanvasMenu → đăng ký <at-modal-full> custom element)
        //    Phải hoàn thành trước khi AdminConsole / ReportModule khởi tạo.
        try {
            await mgr.loadUiModules();
        } catch (e) {
            console.warn('[PostBoot] uiModules load error:', e.message);
        }

        // c. Load config từ Firestore (không block UI)
        this.loadAppConfig().catch((e) => console.warn('[PostBoot] loadAppConfig:', e.message));
        // k. Thêm <at-modal-full> vào DOM nếu chưa có.
        // Custom element đã được đăng ký bởi OffcanvasMenu ở bước e.
        // connectedCallback() tự xử lý FloatDraggable bên trong.
        if (!document.querySelector('at-modal-full') && !this.#config.disabledModules.includes('ModalFull')) {
            document.body.appendChild(document.createElement('at-modal-full'));
        }
        await this.load('Logic');
        // d. Load data (silent=true — không render UI ngay) + common/async modules song song.
        //    at-modal-full đã được đăng ký ở bước b → an toàn cho AdminConsole / ReportModule.
        const dataPromise = typeof loadDataFromFirebase === 'function' ? loadDataFromFirebase(true).catch((e) => console.warn('[PostBoot] dataLoad:', e.message)) : Promise.resolve();

        try {
            await Promise.all([mgr.loadCommonModules(), dataPromise]);
        } catch (e) {
            console.warn('[PostBoot] Module load error:', e.message);
        }
        await SECURITY_MANAGER.cleanDOM(document);
        // f. Event manager — instance đã tồn tại từ #modules init, chỉ cần gọi init()
        // try {
        //     this._call('Event', 'init');
        // } catch (e) {
        //     console.warn('[PostBoot] EventManager:', e.message);
        // }
        // e. Cả UI modules + data đã sẵn sàng → render UI với data
        if (typeof handleServerData === 'function') {
            try {
                debounce(handleServerData, 500)(APP_DATA);
            } catch (e) {
                console.warn('[PostBoot] handleServerData:', e.message);
            }
        }

        // e+. StateProxy: lifecycle hooks are installed lazily on first beginEdit() call.
        // No patchDBManager needed — v3 uses Lazy Collection Proxy on APP_DATA[coll].
        // See logic_operator.js / SalesModule.js for beginEdit() call sites.
        // hookSetters() patches setToEl / setNum so proxy binding is deferred until an
        // element actually receives a non-empty value (lazy — no eager bindContainer scan).
        try {
            window.StateProxy = this.StateProxy;
            StateProxy?.hookSetters();
        } catch (e) {
            console.warn('[PostBoot] StateProxy.hookSetters:', e.message);
        }

        mgr.loadAsyncModules(CURRENT_USER.role);
        L._('✅ App ready', 'success');
        window.dispatchEvent(new CustomEvent('app-ready'));

        // f2. Context menu — init (auto-registers booking menu internally)
        try {
            if (!this.#modules['ContextMenu']) {
                await mgr.loadModule('ContextMenu');
            }
            this.#modules['ContextMenu']?.init?.();
        } catch (e) {
            console.warn('[PostBoot] ContextMenu:', e.message);
        }

        // g. Acc footer toggle
        if (['acc', 'acc_thenice'].includes(CURRENT_USER.role)) {
            if (typeof toggleTemplate === 'function') toggleTemplate('erp-footer-menu-container');
        }

        // j. Mobile-specific tweaks (chạy sau khi UI đã render)
        const isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;
        if (isMobile) {
            document.querySelectorAll('.desktop-only').forEach((el) => el.remove());
            document.body.classList.add('no-select');
        }

        const existingMenu = document.querySelector('offcanvas-menu');

        if (!existingMenu && !this.#config.disabledModules.includes('OffcanvasMenu')) {
            const menu = document.createElement('offcanvas-menu');
            document.body.appendChild(menu);

            menu.addEventListener('pin-changed', (e) => {
                menu._updateMenuState({ isPinned: e.detail.isPinned });
            });
            menu.addEventListener('side-changed', (e) => {
                menu._updateMenuState({ isRightSide: e.detail.isRightSide });
            });
            menu.addEventListener('resize-changed', (e) => {
                menu._updateMenuState({ menuWidth: e.detail.width });
            });
            // menu.toggleSide();
        }
        await SECURITY_MANAGER.cleanDOM(document);

        const emily = await mgr.loadModule('EmilyChatUI', true);
        A.UI.activateTab('tab-dashboard');
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
    A.init().catch((e) => {
        console.error('Critical Error:', e);
        document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
    });
});
