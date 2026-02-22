/**
 * =========================================================================
 * MODULE_LOADER.JS
 * Dynamic Module Loading System dựa trên Role & Feature Flags
 * =========================================================================
 * 
 * Purpose: Load modules dynamically dựa trên:
 * 1. User Role (operator, sales, manager, admin, etc.)
 * 2. Feature Flags (enable/disable modules)
 * 3. Lazy Loading (on-demand module initialization)
 * 
 * Usage:
 * const loader = ModuleLoader.getInstance();
 * const modules = await loader.loadModulesForRole('operator');
 * // modules = { HotelPriceController, ServicePriceController, ... }
 */

class ModuleLoader {
    static #instance = null;
    #loadedModules = {}; // Cache loaded modules
    #loadingPromises = {}; // Cache loading promises to prevent duplicate loads
    #disabledModules = new Set(); // Modules to skip (from config.disabledModule)

    /**
     * Singleton pattern
     */
    static getInstance() {
        if (!ModuleLoader.#instance) {
            ModuleLoader.#instance = new ModuleLoader();
        }
        return ModuleLoader.#instance;
    }

    constructor() {
        console.log('[ModuleLoader] 🚀 Initialized');
    }

    /**
     * Set disabled modules from application config
     * These modules will be skipped during loading
     * 
     * @param {Array<string>} disabledList - List of module names to skip
     * 
     * @example
     * loader.setDisabledModules(['Lang', 'AdminConsole']);
     * // Then Lang and AdminConsole will NOT be loaded for any role
     */
    setDisabledModules(disabledList = []) {
        this.#disabledModules = new Set(disabledList || []);
        if (this.#disabledModules.size > 0) {
            console.log(
                '[ModuleLoader] ⏭️ Disabled modules:', 
                Array.from(this.#disabledModules)
            );
        }
    }

    /**
     * Define which modules are needed per role
     * Can be extended with conditional logic
     * 
     * @returns {Object} Map of role → [module paths]
     */
    #getRoleModuleMap() {
        return {
            // 🔧 OPERATOR: Tour management, pricing
            op: [
                { name: 'HotelPriceController', path: '../modules/M_HotelPrice.js', named: true },
                { name: 'ServicePriceController', path: '../modules/M_ServicePrice.js' },
                { name: 'PriceManager', path: '../modules/M_PriceManager.js', named: false },
            ],

            // 💰 SALES: Booking, customer management
            sale: [
                { name: 'PriceManager', path: '../modules/M_PriceManager.js' },
                { name: 'Lang', path: '../modules/TranslationModule.js', named: true },
            ],

            // 👨‍💼 MANAGER: Reports, analytics
            manager: [
                { name: 'HotelPriceController', path: '../modules/M_HotelPrice.js', named: true },
                { name: 'ServicePriceController', path: '../modules/M_ServicePrice.js' },
                { name: 'PriceManager', path: '../modules/M_PriceManager.js' },
                { name: 'Lang', path: '../modules/TranslationModule.js', named: true },
                { name: 'AdminConsole', path: '../modules/AdminController.js', named: true },
            ],

            // 🔐 ADMIN: Full system access
            admin: [
                { name: 'HotelPriceController', path: '../modules/M_HotelPrice.js', named: true },
                { name: 'ServicePriceController', path: '../modules/M_ServicePrice.js' },
                { name: 'PriceManager', path: '../modules/M_PriceManager.js' },
                { name: 'Lang', path: '../modules/TranslationModule.js', named: true },
                { name: 'AdminConsole', path: '../modules/AdminController.js', named: true },
                { name: 'NotificationModule', path: '../modules/NotificationModule.js' },
            ],

            // 💼 ACCOUNTANT: Financial records only
            acc: [
                { name: 'Lang', path: '../modules/TranslationModule.js', named: true },
            ],

            // 🎯 COMMON: Available for all roles
            common: [
                { name: 'NotificationModule', path: './modules/NotificationModule.js' },
            ],
        };
    }

    /**
     * Load modules for specific role
     * Includes common modules + role-specific modules
     * 
     * @param {string} role - User role (op, sale, manager, admin, acc, etc.)
     * @returns {Promise<Array>} Loaded modules array [{ name, module }, ...]
     * 
     * @example
     * const modules = await loader.loadModulesForRole('op');
     * // Returns:
     * // [
     * //   { name: 'HotelPriceController', module: Class },
     * //   { name: 'ServicePriceController', module: Class },
     * //   { name: 'PriceManager', module: Class },
     * //   ...
     * // ]
     */
    async loadModulesForRole(role) {
        console.log(`[ModuleLoader] 📦 Loading modules for role: ${role}`);
        
        const cacheKey = `role_${role}`;
        
        // ✅ Return from cache if already loaded
        if (this.#loadedModules[cacheKey]) {
            console.log(`[ModuleLoader] ⚡ Using cached modules for role: ${role}`);
            return this.#loadedModules[cacheKey];
        }

        // ✅ Return pending promise if already loading (prevent duplicate requests)
        if (this.#loadingPromises[cacheKey]) {
            console.log(`[ModuleLoader] ⏳ Already loading modules for role: ${role}, waiting...`);
            return this.#loadingPromises[cacheKey];
        }

        // 🚀 Start loading
        const loadPromise = this._loadModulesAsync(role);
        this.#loadingPromises[cacheKey] = loadPromise;

        try {
            const modules = await loadPromise;
            // ✅ Cache result
            this.#loadedModules[cacheKey] = modules;
            return modules;
        } finally {
            // Clean up promise cache
            delete this.#loadingPromises[cacheKey];
        }
    }

    /**
     * Internal: Load modules asynchronously
     * Filters out disabled modules before loading
     * 
     * @private
     */
    async _loadModulesAsync(role) {
        const map = this.#getRoleModuleMap();
        const moduleSpecs = [];

        // 1️⃣ Get role-specific modules
        const roleModules = map[role] || [];
        moduleSpecs.push(...roleModules);

        // 2️⃣ Add common modules (available to all roles)
        const commonModules = map.common || [];
        moduleSpecs.push(...commonModules);

        // 3️⃣ ✅ FILTER OUT DISABLED MODULES
        const enabledSpecs = moduleSpecs.filter(spec => {
            if (this.#disabledModules.has(spec.name)) {
                console.log(
                    `[ModuleLoader] ⏭️ Skipping disabled module: ${spec.name}`
                );
                return false;
            }
            return true;
        });

        // 4️⃣ Load all enabled modules in parallel
        const loadedModules = [];
        const loadPromises = enabledSpecs.map(spec => 
            this._loadModule(spec).then(module => {
                if (module) {
                    loadedModules.push({
                        name: spec.name,
                        module: module
                    });
                }
                return module;
            })
        );

        try {
            await Promise.all(loadPromises);
            console.log(
                `[ModuleLoader] ✅ Loaded ${loadedModules.length}/${enabledSpecs.length} modules for role: ${role}`,
                loadedModules.map(m => m.name)
            );
            return loadedModules;
        } catch (error) {
            console.error(`[ModuleLoader] ❌ Error loading modules for role: ${role}`, error);
            throw error;
        }
    }

    /**
     * Load single module using dynamic import
     * 
     * @private
     * @param {Object} spec - Module spec { name, path, named }
     * @returns {Promise<*>} Loaded module or named export
     */
    async _loadModule(spec) {
        const { name, path, named = false } = spec;
        
        try {
            // ✅ Dynamic import (respects chunk splitting for code optimization)
            const moduleExport = await import(path);
            
            // If named export, extract it
            const module = named ? moduleExport[name] : moduleExport.default;
            
            if (!module) {
                throw new Error(`Missing export "${name}" in ${path}`);
            }
            
            console.log(`  ✓ Loaded: ${name} (${named ? 'named' : 'default'} export)`);
            return module;
            
        } catch (error) {
            console.error(`  ❌ Failed to load ${name} from ${path}:`, error);
            return null; // Continue loading other modules even if one fails
        }
    }

    /**
     * Load specific module on-demand (lazy loading)
     * 
     * @param {string} moduleName - Module name or file path
     * @param {Object} options - { isNamed, fallbackName }
     * @returns {Promise<*>} Loaded module
     * 
     * @example
     * const SalesModule = await loader.loadModule(
     *     './modules/SalesModule.js',
     *     { isNamed: false }
     * );
     */
    async loadModule(moduleName, options = {}) {
        const { isNamed = false } = options;
        const cacheKey = `module_${moduleName}`;

        // ✅ Return from cache if already loaded
        if (this.#loadedModules[cacheKey]) {
            console.log(`[ModuleLoader] ⚡ Cache hit: ${moduleName}`);
            return this.#loadedModules[cacheKey];
        }

        // ✅ Return pending promise if already loading
        if (this.#loadingPromises[cacheKey]) {
            return this.#loadingPromises[cacheKey];
        }

        const loadPromise = this._loadModule({
            name: moduleName,
            path: moduleName,
            named: isNamed
        });

        this.#loadingPromises[cacheKey] = loadPromise;

        try {
            const module = await loadPromise;
            if (module) {
                this.#loadedModules[cacheKey] = module;
            }
            return module;
        } finally {
            delete this.#loadingPromises[cacheKey];
        }
    }

    /**
     * Load multiple modules in parallel
     * Useful for loading feature bundles or optional modules
     * 
     * @param {Array<string>} moduleNames - List of module paths
     * @param {Object} options - { isNamed }
     * @returns {Promise<Object>} { moduleName: module }
     * 
     * @example
     * const modules = await loader.loadModules([
     *     './modules/Module1.js',
     *     './modules/Module2.js'
     * ], { isNamed: false });
     */
    async loadModules(moduleNames, options = {}) {
        const { isNamed = false } = options;
        const promises = moduleNames.map(name =>
            this.loadModule(name, { isNamed })
        );
        
        const modules = await Promise.all(promises);
        return modules.reduce((acc, module, idx) => {
            acc[moduleNames[idx]] = module;
            return acc;
        }, {});
    }

    /**
     * Get loading status / statistics
     */
    getStats() {
        return {
            loaded: Object.keys(this.#loadedModules).length,
            loading: Object.keys(this.#loadingPromises).length,
            modules: Object.keys(this.#loadedModules),
        };
    }

    /**
     * Clear module cache (for testing or hot reload)
     * 
     * @param {string} [pattern] - Optional: clear only modules matching pattern
     */
    clearCache(pattern = null) {
        if (!pattern) {
            this.#loadedModules = {};
            this.#loadingPromises = {};
            console.log('[ModuleLoader] 🧹 Cleared all module cache');
            return;
        }

        const regex = new RegExp(pattern);
        Object.keys(this.#loadedModules).forEach(key => {
            if (regex.test(key)) {
                delete this.#loadedModules[key];
            }
        });
        console.log(`[ModuleLoader] 🧹 Cleared cache matching: ${pattern}`);
    }
}

export default ModuleLoader;
