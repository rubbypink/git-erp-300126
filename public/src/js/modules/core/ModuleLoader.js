export default class MODULELOADER {
    #config = { disabledModules: [] };
    #appInstance = null;

    constructor(appInstance, disabledModules = []) {
        this.#appInstance = appInstance;
        this.loaded = {};
        // Normalize disabledModules to lowercase for case-insensitive comparison
        this.#config.disabledModules = (disabledModules || []).map((m) => m);
        this.registry = {
            Database: () => import('/src/js/modules/db/DBManager.js').then((m) => m.default),
            MigrationHelper: () => import('/src/js/modules/db/MigrationHelper.js').then((m) => m.default),
            Event: () => import('@core/EventManager.js').then((m) => m.default),
            UI: () => import('@core/UI_Manager.js').then((m) => m.default),
            Logic: () => import('@core/LogicBase.js').then((m) => m.default),
            MobileEvent: () => import('./M_AutoMobileEvents.js').then((m) => m.default),
            PriceManager: () => import('/src/js/modules/prices/M_PriceManager.js').then((m) => m.default),
            HotelPriceManager: () => import('/src/js/modules/prices/M_HotelPrice.js').then((m) => m.default),
            PriceImportAI: () => import('/src/js/modules/prices/M_ImportPriceAI.js').then((m) => m.default),
            ServicePriceController: () => import('/src/js/modules/prices/M_ServicePrice.js').then((m) => m.default),
            CostManager: () => import('/src/js/modules/prices/M_CostManager.js').then((m) => m.default),
            TourPrice: () => import('/src/js/modules/prices/TourPriceController.js').then((m) => m.default),
            AdminConsole: () => import('@md/AdminController.js').then((m) => m.default),
            ReportModule: () => import('@md/ReportModule.js').then((m) => m.default),
            BookingOverview: () => import('../BookingOverviewController.js').then((m) => m.default),
            ThemeManager: () => import('./ThemeManager.js').then((m) => m.default),
            Router: () => import('./Router.js').then((m) => m.default),
            ShortKey: () => import('./M_ShortKey.js').then((m) => m.default),
            Lang: () => import('./TranslationModule.js').then((m) => m.Lang),
            NotificationManager: () => import('./NotificationModule.js').then((m) => m.default),
            StateProxy: () => import('./StateProxy.js').then((m) => m.default),
            ErpHeaderMenu: () => import('/src/js/components/header_menu.js').then((m) => m.default),
            ErpFooterMenu: () => import('/src/js/components/footer_menu.js').then((m) => m.default),
            ChromeMenuController: () => import('/src/js/components/Menu_StyleChrome.js').then((m) => m.ChromeMenuController),
            // Side-effect import: đăng ký custom element <offcanvas-menu> + <at-modal-full>
            // Trả về adapter object trỏ đến DOM instance để A.OffcanvasMenu.open() hoạt động
            ContextMenu: () => import('/src/js//components/M_ContextMenu.js').then((m) => m.default),
            CalculatorWidget: () => import('/src/js//components/calculator_widget.js').then((m) => m.CalculatorWidget),
            OffcanvasMenu: async () => {
                await import('/src/js//components/offcanvas_menu.js');
                const getEl = () => document.querySelector('offcanvas-menu');
                return {
                    init: () => getEl()?.open(),
                    close: () => getEl()?.close(),
                    toggle: () => getEl()?.toggle(),
                    togglePin: () => getEl()?.togglePin(),
                    toggleSide: () => getEl()?.toggleSide(),
                    setState: (s) => getEl()?.setState(s),
                    get el() {
                        return getEl();
                    },
                };
            },
            ModalFull: () => import('/src/js/components/at_modal_full.js').then((m) => m.ModalFull),
            Modal: () => import('/src/js/components/at_modal_full.js').then((m) => m.AModal),
            SalesModule: () => import('/src/js/modules/M_SalesModule.js').then((m) => m.default),
            Op: () => import('/src/js/modules/M_OperatorModule.js').then((m) => m.default),
            AccountantCtrl: () => import('@acc/controller_accountant.js').then((m) => m.default),
        };
        this.coreModules = ['Database', 'Event', 'MobileEvent'];
        this.roleMap = {
            admin: ['ServicePriceController', 'SalesModule', 'PriceManager'],
            op: ['Op', 'ServicePriceController', 'PriceManager'],
            acc: ['AccountantCtrl'],
            sale: ['SalesModule'],
            acc_thenice: [],
        };
        this.forAllModules = ['Logic', 'TourPrice', 'CalculatorWidget', 'ThemeManager', 'Lang', 'CostManager', 'ShortKey', 'BookingOverview', 'Router', 'ReportModule'];

        //-----Thứ tự load----//

        this.uiModules = ['OffcanvasMenu', 'ModalFull'];
        this.commonModules = ['Lang', 'ThemeManager', 'StateProxy'];
        this.asyncModules = ['TourPrice', 'CalculatorWidget', 'ServicePriceController', 'CostManager', 'ShortKey', 'BookingOverview', 'PriceManager', 'ContextMenu', 'AdminConsole', 'ReportModule'];
    }

    /**
     * Helper method: Kiểm tra module có bị disable không (case-insensitive)
     * @private
     */
    _isModuleDisabled(moduleKey) {
        return this.#config.disabledModules.includes(moduleKey);
    }

    async loadModule(moduleKey, initialized = true, args) {
        if (this._isModuleDisabled(moduleKey)) return null;
        if (this.loaded[moduleKey]) return this.loaded[moduleKey];

        try {
            const moduleImport = await this.registry[moduleKey]();
            this.loaded[moduleKey] = moduleImport;
            this.#appInstance.addModule(moduleKey, moduleImport, initialized, args);
            // L._(`[ModuleManager] ✅ Loaded module: ${moduleKey}`, 'success');
            return moduleImport;
        } catch (error) {
            console.error(`[ModuleManager] ❌ Lỗi khi tải ${moduleKey}:`, error);
            return null;
        }
    }
    async loadCoreModules() {
        const coreToLoad = this.coreModules;
        if (coreToLoad.length > 0) await Promise.all(coreToLoad.map((key) => this.loadModule(key, false)));
    }
    async loadCommonModules() {
        const commonToLoad = this.commonModules;
        if (commonToLoad.length > 0) await Promise.all(commonToLoad.map((key) => this.loadModule(key)));
    }
    async loadUiModules() {
        const uiToLoad = this.uiModules;
        if (uiToLoad.length > 0) await Promise.all(uiToLoad.map((key) => this.loadModule(key)));
    }

    async loadAsyncModules(role) {
        const asyncToLoad = this.asyncModules;
        const modulesToLoad = asyncToLoad.filter((key) => !this._isModuleDisabled(key)).filter((key) => this.roleMap[role].includes(key) || this.forAllModules.includes(key));
        if (modulesToLoad.length > 0) await Promise.all(modulesToLoad.map((key) => this.loadModule(key)));
    }

    async loadForRole(role) {
        const roleKey = role.toLowerCase();
        let modulesToLoad = this.roleMap[roleKey] || this.roleMap['sale'];
        // if (CURRENT_USER.level === 99) modulesToLoad = [...modulesToLoad, ['AdminConsole']];

        const activeModules = modulesToLoad
            .filter((key) => !this._isModuleDisabled(key))
            .filter((key) => !this.commonModules.includes(key))
            .filter((key) => !this.asyncModules.includes(key));

        if (activeModules.length > 0) await Promise.all(activeModules.map((key) => this.loadModule(key)));
    }
}
