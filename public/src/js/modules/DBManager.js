/**
 * DB MANAGER - FIRESTORE VERSION
 * ─────────────────────────────────────────────────────────────────────────
 * Thiết kế:
 *  • Constructor nhận config → tự auto-init khi Firebase auth sẵn sàng.
 *  • loadAllData(): ưu tiên IndexedDB cache (72h), fallback Firestore .get().
 *  • Một onSnapshot DUY NHẤT cho collection 'notifications':
 *      - type='data-change' → #autoSyncData() → reload collection liên quan
 *      - type khác          → NotificationManager.receive()
 *  • Mọi ghi/xóa Firestore đi qua #firestoreCRUD (chốt chặn duy nhất).
 * ─────────────────────────────────────────────────────────────────────────
 */

const DEPT_COLLS = {
    admin: ['app_config', 'bookings', 'booking_details', 'operator_entries', 'customers', 'transactions', 'fund_accounts', 'users', 'suppliers', 'hotels', 'transactions_thenice', 'fund_accounts_thenice'],
    sales: ['bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts', 'users'],
    operations: ['operator_entries', 'bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts', 'users'],
    accountant: ['transactions', 'fund_accounts', 'users', 'bookings'],
    accountant_thenice: ['transactions_thenice', 'fund_accounts_thenice', 'users']
};

class DBManager {
    // ─── Private state ────────────────────────────────────────────────
    #db                  = null;
    #networkEnabled      = false;
    #persistenceEnabled  = false;
    #listeners           = {};      // chỉ dùng cho notifications listener
    #config              = {};
    #initPromise         = null;    // đảm bảo init chỉ chạy 1 lần
    #resolveInit         = null;    // để init() thủ công resolve promise
    #idbReady            = null;    // Promise<IDBDatabase> — IndexedDB instance

    // ─── Public State ────────────────────────────────────────────────
    batchCounterUpdates = {};
    currentCustomer     = null;
    _initialized        = false;    // true sau khi #bootInit hoàn tất

    // ─── Static keys ─────────────────────────────────────────────────
    static #OPTIONS_KEY  = 'DBManager_OPTIONS';
    static #IDB_NAME     = 'DBManager_IDB';
    static #IDB_STORE    = 'app_cache';
    static #IDB_VERSION  = 1;

    // ─── Collection Name Aliases ──────────────────────────────────────
    COLL = {
        BOOKINGS:             'bookings',
        DETAILS:              'booking_details',
        OPERATORS:            'operator_entries',
        CUSTOMERS:            'customers',
        TRANSACTIONS:         'transactions',
        TRANSACTIONS_THENICE: 'transactions_thenice',
        FUNDS:                'fund_accounts',
        FUNDS_THENICE:        'fund_accounts_thenice',
        USERS:                'users',
        CONFIG:               'app_config'
    };

    static #QUERY_CONFIG = {
        bookings:                { orderBy: 'created_at', limit: 1000 },
        booking_details:         { orderBy: 'created_at',  limit: 2000 },
        operator_entries:        { orderBy: 'created_at',  limit: 2000 },
        customers:               { orderBy: 'created_at',  limit: 2000 },
        transactions:            { orderBy: 'created_at', limit: 2000 },
        suppliers:               { orderBy: 'created_at', limit: 1000 },
        fund_accounts:           { orderBy: 'created_at', limit: 20 },
        transactions_thenice:    { orderBy: 'created_at', limit: 2000 },
        fund_accounts_thenice:   { orderBy: 'created_at', limit: 20 },
        hotels:                  { orderBy: 'name', limit: 1000 },
        hotel_price_schedules:   { orderBy: 'created_at', limit: 500 },
        service_price_schedules: { orderBy: 'created_at', limit: 500 },
    };

    // ─── Cấu hình secondary indexes ──────────────────────────────────────
    // Khai báo tập trung — dễ thêm index mới sau này
    static #INDEX_CONFIG = [
        { index: 'booking_details_by_booking',      source: 'booking_details',      groupBy: 'booking_id'    },
        { index: 'operator_entries_by_booking',    source: 'operator_entries',     groupBy: 'booking_id'    },
        { index: 'transactions_by_booking', source: 'transactions',         groupBy: 'booking_id'    },
        { index: 'transactions_by_fund',    source: 'transactions',         groupBy: 'fund_source'       },
    ];

    /**
     * Constructor — nhận config một lần, tự động khởi chạy init()
     * khi firebase.auth() sẵn sàng (lắng nghe onAuthStateChanged).
     *
     * @param {object} [options]
     * @param {boolean} [options.persistence=true]         - Bật IndexedDB persistence
     * @param {boolean} [options.networkEnabled=true]      - Bật network ngay từ đầu
     * @param {number}  [options.cacheMaxAgeMs]            - Tuổi tối đa của cache (ms), mặc định 72h
     * @param {number}  [options.notificationsWindowMs]    - Cửa sổ thời gian query notifications, mặc định 72h
     */
    constructor(options = {}) {
        const HR72 = 72 * 60 * 60 * 1000;

        // Kiểm tra config đã lưu từ trước
        const savedCfg           = this.#loadOptions('config');
        const hasSaved           = savedCfg?.persistence !== undefined || savedCfg?.networkEnabled !== undefined;
        const hasExplicitOptions = Object.keys(options).length > 0;

        this.#config = {
            persistence:           options.persistence           ?? savedCfg?.persistence           ?? true,
            networkEnabled:        options.networkEnabled        ?? savedCfg?.networkEnabled        ?? true,
            cacheMaxAgeMs:         options.cacheMaxAgeMs         ?? HR72,
            notificationsWindowMs: options.notificationsWindowMs ?? HR72,
        };

        if (hasExplicitOptions || hasSaved) {
            // ── Auto-init: có config rõ ràng hoặc đã lưu → tự khởi chạy khi auth ready ──
            this.#initPromise = new Promise(resolve => {
                this.#resolveInit = resolve;
                const unsub = firebase.auth().onAuthStateChanged(user => {
                    if (user) { unsub(); this.#bootInit().then(resolve); }
                });
            });
        } else {
            // ── Manual-init: không có config → chờ gọi init() thủ công từ bên ngoài ──
            this._initialized = false;
            this.#initPromise = new Promise(resolve => { this.#resolveInit = resolve; });
            log('⏸️ DBManager: không có config — chờ init() thủ công');
        }
    }

    /**
     * Khởi tạo nội bộ — chạy 1 lần sau khi auth ready.
     * Có thể await bên ngoài qua: await DB_MANAGER.ready()
     */
    async #bootInit() {
        const cfg = this.#config;

        // Bật IndexedDB persistence
        if (cfg.persistence) {
            try {
                await firebase.firestore().enablePersistence({ synchronizeTabs: true });
                this.#persistenceEnabled = true;
                console.log('✅ enablePersistence: THÀNH CÔNG');
            } catch (err) {
                this.#persistenceEnabled = false;
                console.warn('⚠️ enablePersistence THẤT BẠI:', err.code);
                // failed-precondition = nhiều tab | unimplemented = trình duyệt không hỗ trợ
            }
        }

        this.#db = firebase.firestore();

        // Bật / tắt network theo config
        if (!cfg.networkEnabled) {
            await this.setNetwork(false);
        } else {
            this.#networkEnabled = true;
        }

        // Khởi notifications listener
        this.#startNotificationsListener();

        this._initialized = true;
        log(`🚀 DBManager ready | Persistence: ${this.#persistenceEnabled ? 'ON' : 'OFF'} | Network: ${this.#networkEnabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Cho phép nơi khác await cho đến khi init hoàn tất.
     * @returns {Promise<void>}
     */
    ready = () => this.#initPromise;

    /**
     * (Legacy compat) Gọi thủ công với firestoreInstance nếu cần.
     * • Nếu DBManager chưa tự init (không có config) → gọi này để khởi động.
     * • Nếu đã tự init → chỉ override #db nếu cần.
     * @param {object} [firestoreInstance]
     * @param {object} [options] - config ghi đè (dùng khi manual-init)
     */
    async init(firestoreInstance, options = {}) {
        if (!this._initialized && !this.#db) {
            // Manual-init path: cập nhật config rồi chạy bootInit
            const HR72 = 72 * 60 * 60 * 1000;
            this.#config = {
                ...this.#config,
                ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
                cacheMaxAgeMs:         options.cacheMaxAgeMs         ?? this.#config.cacheMaxAgeMs         ?? HR72,
                notificationsWindowMs: options.notificationsWindowMs ?? this.#config.notificationsWindowMs ?? HR72,
            };
            await this.#bootInit().catch(e => console.error('❌ bootInit thất bại:', e));
            this.#resolveInit?.();
        } else {
            await this.#initPromise; // đảm bảo bootInit xong
        }
        if (firestoreInstance && firestoreInstance !== this.#db) {
            this.#db = firestoreInstance;
            log('🔄 DBManager: firestoreInstance overridden manually');
        }
        return this;
    }

    // ─── Private: Đọc/ghi options vào localStorage ────────────────────

    #loadOptions = (key) => {
        if (!key) return false;
        try {
            let prefix = 'DBManager';
            key = `${prefix}.${key}`;
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error(`❌ Lỗi khi đọc key [${key}] từ storage:`, e);
            return null;
        }
    }

    #saveOptions = (key, data) => {
        if (!key) return false;
        try {
            let prefix = 'DBManager';
            key = `${prefix}.${key}`;
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn(`⚠️ Không thể lưu dữ liệu cho key [${key}]:`, e);
            return false;
        }
    }

    // ─── IndexedDB Cache ─────────────────────────────────────────────────────
    // APP_DATA được lưu vào IDB thay vì localStorage → dữ liệu tăng không phải sửa.

    /**
     * Mở (hoặc tái sử dụng) IndexedDB database.
     * @returns {Promise<IDBDatabase>}
     */
    #openIDB() {
        if (this.#idbReady) return this.#idbReady;
        this.#idbReady = new Promise((resolve, reject) => {
            const req = indexedDB.open(DBManager.#IDB_NAME, DBManager.#IDB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DBManager.#IDB_STORE))
                    db.createObjectStore(DBManager.#IDB_STORE);
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => { console.error('❌ IDB open failed:', e.target.error); reject(e.target.error); };
        });
        return this.#idbReady;
    }

    /**
     * Ghi giá trị vào IndexedDB.
     * @param {string} key
     * @param {*} value - bất kỳ giá trị structured-clone-able (object, array, string...)
     * @returns {Promise<boolean>}
     */
    async #idbSet(key, value) {
        try {
            const db = await this.#openIDB();
            return new Promise((resolve, reject) => {
                const tx  = db.transaction(DBManager.#IDB_STORE, 'readwrite');
                const req = tx.objectStore(DBManager.#IDB_STORE).put(value, key);
                req.onsuccess = () => resolve(true);
                req.onerror   = e => { console.warn('⚠️ IDB set failed:', e.target.error); reject(e.target.error); };
            });
        } catch (e) { console.warn('⚠️ #idbSet error:', e); return false; }
    }

    /**
     * Đọc giá trị từ IndexedDB.
     * @param {string} key
     * @returns {Promise<*>} null nếu key không tồn tại
     */
    async #idbGet(key) {
        try {
            const db = await this.#openIDB();
            return new Promise((resolve, reject) => {
                const tx  = db.transaction(DBManager.#IDB_STORE, 'readonly');
                const req = tx.objectStore(DBManager.#IDB_STORE).get(key);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror   = e => { console.warn('⚠️ IDB get failed:', e.target.error); reject(e.target.error); };
            });
        } catch (e) { console.warn('⚠️ #idbGet error:', e); return null; }
    }

    /**
     * Xóa key trong IndexedDB.
     * @param {string} key
     */
    async #idbDelete(key) {
        try {
            const db = await this.#openIDB();
            return new Promise(resolve => {
                const tx = db.transaction(DBManager.#IDB_STORE, 'readwrite');
                tx.objectStore(DBManager.#IDB_STORE).delete(key);
                tx.oncomplete = () => resolve(true);
            });
        } catch (e) { return false; }
    }

    // ─── Initialization ───────────────────────────────────────────────

    /**
     * @param {object} firestoreInstance - firebase.firestore()
     * @param {object} [options]
     * @param {boolean} [options.persistence=false]
     * @param {boolean} [options.network=true]
     */


    /**
     * Bật/tắt network Firestore — tự động lưu trạng thái vào localStorage.
     * @param {boolean} enabled
     */
    setNetwork = async (enabled) => {
        if (!this.#db) { console.error('❌ DB chưa init'); return; }

        if (enabled && !this.#networkEnabled) {
            await this.#db.enableNetwork();
            this.#networkEnabled = true;
            console.log('🌐 Firestore network: BẬT');
        } else if (!enabled && this.#networkEnabled) {
            await this.#db.disableNetwork();
            this.#networkEnabled = false;
            console.log('✈️ Firestore network: TẮT (offline mode)');
        }

        // Cập nhật lại localStorage khi trạng thái thay đổi
        const saved = this.#loadOptions('config') ?? {};
        this.#saveOptions('config', { ...saved, network: this.#networkEnabled });
    }

    /**
     * Xoá settings đã lưu, về lại defaults lần khởi động tiếp theo.
     */
    resetOptions = () => {
        localStorage.removeItem(DBManager.#OPTIONS_KEY);
        this.stopNotificationsListener();
        console.log('🔄 DB options đã reset');
    }

    // ─── Getters ──────────────────────────────────────────────────────────

    /** Firestore instance */
    get db() { return this.#db; }

    /** Trạng thái mạng Firestore */
    get isOnline() { return this.#networkEnabled; }

    /** Trạng thái IndexedDB persistence */
    get isPersisted() { return this.#persistenceEnabled; }

    // ─── Notifications Listener ────────────────────────────────────────────────

    /**
     * Khởi chạy onSnapshot DUY NHẤT cho collection 'notifications'.
     *
     * • Query window: từ thời điểm `lastSync` (nếu gần hơn cửa sổ 72h)
     *   hoặc từ 72h trước — tùy cái nào gần hơn.
     * • Document có `type === 'data-change'` → gọi `#autoSyncData(docs)`
     * • Document khác → gửi sang `window.A?.NotificationManager?.receive(docs)`
     */
    #startNotificationsListener() {
        if (this.#listeners['notifications']) return; // đã chạy

        const windowMs   = this.#config.notificationsWindowMs;
        const lastSyncMs = parseInt(localStorage.getItem('LAST_SYNC') ?? '0', 10);
        const now        = Date.now();

        // Lấy mốc quá khứ gần nhất giữa lastSync và (now - 72h)
        const cutoffMs   = Math.max(lastSyncMs, now - windowMs);
        const cutoffDate = new Date(cutoffMs);

        log(`🔔 Notifications listener: query từ ${cutoffDate.toLocaleString()}`);

        const query = this.#db
            .collection('notifications')
            .where('created_at', '>=', cutoffDate);

        const unsubscribe = query.onSnapshot(
            snapshot => {
                if (snapshot.empty) return;

                const dataChangeDocs = [];
                const notifDocs      = [];

                snapshot.docChanges().forEach(change => {
                    if (change.type === 'removed') return;
                    const doc = { id: change.doc.id, ...change.doc.data() };
                    if (doc.type === 'data-change') dataChangeDocs.push(doc);
                    else                            notifDocs.push(doc);
                });

                if (dataChangeDocs.length > 0) this.#autoSyncData(dataChangeDocs);
                if (notifDocs.length      > 0) window.A?.NotificationManager?.receive?.(notifDocs);
            },
            err => console.error('❌ Notifications listener error:', err)
        );

        this.#listeners['notifications'] = unsubscribe;
    }

    /**
     * Hủy notifications listener (gọi khi logout).
     */
    stopNotificationsListener() {
        if (this.#listeners['notifications']) {
            this.#listeners['notifications']();
            delete this.#listeners['notifications'];
            log('🔕 Notifications listener stopped');
        }
    }

    /**
     * Tự động sync lại collection khi nhận được data-change notification.
     * @param {{collection:string}[]} docs - Danh sách notification docs có type='data-change'
     */
    /**
     * Áp dụng danh sách notification data-change vào APP_DATA local.
     *
     * Luồng xử lý:
     *   1. Parse `doc.data` (JSON string hoặc object) → `{coll, id, action, payload}`
     *   2. Dedup theo `coll::id` — giữ bản có `created_at` mới nhất
     *   3. Áp dụng từng thay đổi qua `#applyLocalChange`
     *   4. Cập nhật cache IndexedDB + LAST_SYNC
     *
     * @param {Array} docs - Mảng notification documents (type='data-change')
     */
    async #autoSyncData(docs) {
        // ── 1. Parse + deduplicate theo coll::id ─────────────────────────
        const deduped = new Map();

        for (const notif of docs) {
            let change;
            try {
                change = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
            } catch {
                console.warn('⚠️ #autoSyncData: không parse được doc.data', notif);
                continue;
            }

            if (!change?.coll || !change?.id) continue;

            const key = `${change.coll}::${change.id}`;
            // created_at có thể là Firebase Timestamp hoặc số milliseconds
            const ts  = notif.created_at?.toMillis?.()
                     ?? (notif.created_at?.seconds ? notif.created_at.seconds * 1000 : 0)
                     ?? 0;

            const existing = deduped.get(key);
            if (!existing || ts > existing._ts) {
                deduped.set(key, { ...change, _ts: ts });
            }
        }

        if (deduped.size === 0) return;

        log(`🔄 autoSyncData: ${deduped.size} thay đổi cần áp dụng`);

        // ── 2. Áp dụng từng thay đổi ─────────────────────────────────────
        for (const [, change] of deduped) {
            await this.#applyLocalChange(change);
        }

        // ── 3. Cập nhật cache + LAST_SYNC ────────────────────────────────
        await this.#saveAppDataCache();
    }

    /**
     * Áp dụng 1 thay đổi (từ notification data-change) vào APP_DATA local.
     *
     * @param {{ coll: string, id: string, action: string, payload: any }} param0
     */
    async #applyLocalChange({ coll, id, action, payload }) {
        if (!APP_DATA || !coll || !id) return;

        switch (action) {
            case 's':   // set — ghi đè toàn bộ document
            case 'u':   // update — cập nhật các field
                this._updateAppDataObj(coll, { id, ...payload });
                break;

            case 'd':   // delete
                this._removeFromAppDataObj(coll, id);
                break;

            case 'b':   // batch
                if (typeof payload === 'string') {
                    // payload là batch_id → batch lớn, fetch toàn bộ collection từ server
                    log(`🔄 #applyLocalChange: batch lớn (batch_id=${payload}), reload từ server...`);
                    await this.#reloadCollection(coll, payload);
                } else if (Array.isArray(payload)) {
                    // payload là array [{id, action, data}] → batch nhỏ, apply inline
                    for (const item of payload) {
                        if (item.action === 'd') {
                            this._removeFromAppDataObj(coll, item.id);
                        } else {
                            this._updateAppDataObj(coll, { id: item.id, ...item.data });
                        }
                    }
                }
                break;

            case 'i':   // increment — payload: { fieldName, incrementBy }
                if (APP_DATA[coll]?.[id] && payload?.fieldName) {
                    const cur = APP_DATA[coll][id][payload.fieldName] ?? 0;
                    this._updateAppDataObj(coll, {
                        id,
                        [payload.fieldName]: cur + (payload.incrementBy ?? 1),
                    });
                }
                break;

            default:
                console.warn(`⚠️ #applyLocalChange: action không xác định "${action}"`);
        }
    }

    /**
     * Tải lại 1 collection từ Firestore (server), cập nhật APP_DATA.
     * @param {string} collName
     * @param {string} [batchId] - optional batch ID for large batch reload
     */
    async #reloadCollection(collName, batchId) {
        const cfg = DBManager.#QUERY_CONFIG[collName];
        if (!cfg) { console.warn(`⚠️ #reloadCollection: không có config cho '${collName}'`);}
        try {
            let query = this.#db.collection(collName);
            if (cfg.orderBy) query = query.orderBy(cfg.orderBy, 'desc');
            if (cfg.limit)   query = query.limit(cfg.limit);
            if (batchId)     query = query.where('batchId', '==', batchId);

            const snap = await query.get({ source: 'server' });
            if (!APP_DATA) APP_DATA = {};
            APP_DATA[collName] = {};
            this.#hydrateCollection(APP_DATA, collName, snap);
            log(`✅ #reloadCollection [${collName}]: ${snap.size} docs`);
            await this.#saveAppDataCache();
        } catch (e) {
            console.error(`❌ #reloadCollection [${collName}]:`, e);
        }
    }

    // ─── Load All Data ────────────────────────────────────────────────────────

    /**
     * Tải toàn bộ data cần thiết cho APP_DATA.
     *
     * Ưu tiên 1 — IndexedDB cache (localStorage):
     *   Nếu có data và LAST_SYNC < 72h thì dùng luôn, không đụng Firestore.
     *
     * Ưu tiên 2 — Firestore:
     *   Tải theo QUERY_CONFIG cho các collections được phép (theo role),
     *   sau đó lưu cache để lần sau dùng.
     *
     * @param {boolean} [forceNew=false] - Bỏ qua cache, buộc tải từ Firestore
     * @returns {Promise<object|null>} APP_DATA
     */
    async loadAllData(forceNew = false) {
        await this.#initPromise; // đảm bảo #bootInit xong
        if (!this.#db)                    { console.error('❌ DB chưa init'); return null; }
        if (!firebase.auth().currentUser) { console.error('❌ Chưa đăng nhập'); return null; }

        // ── 1. Ưu tiên IndexedDB cache ────────────────────────────────────
        const cachedData = await this.#idbGet('APP_DATA');
        const lastSync   = localStorage.getItem('LAST_SYNC');
        const cacheAge   = this.#config.cacheMaxAgeMs;

        if (!forceNew && cachedData && lastSync && (Date.now() - parseInt(lastSync, 10) < cacheAge)) {
            APP_DATA = cachedData;
            log(`📦 APP_DATA từ IndexedDB (age: ${Math.round((Date.now() - parseInt(lastSync, 10)) / 60000)} phút)`);
            return APP_DATA;
        }

        // ── 2. Tải từ Firestore ───────────────────────────────────────────
        console.time('loadAllData');
        const result = this.#buildEmptyResult();

        const userRole = window.CURRENT_USER?.role ?? null;
        const allowed  = (userRole && window.COLL_MANIFEST?.[userRole])
            ? window.COLL_MANIFEST[userRole]
            : ['bookings', 'booking_details', 'operator_entries', 'customers'];

        try {
            await Promise.all([
                this.#loadCollections(result, allowed),
                this.#loadMeta(result),
            ]);

            APP_DATA = result;
            await this.#saveAppDataCache();

            console.timeEnd('loadAllData');
            log('📥 APP_DATA sẵn sàng (tải từ Firestore)');
            return APP_DATA;
        } catch (e) {
            console.error('❌ loadAllData thất bại:', e);
            console.timeEnd('loadAllData');
            return null;
        }
    }

    // Lưu APP_DATA vào IndexedDB (không JSON.stringify — IDB tự serialize object)
    // LAST_SYNC — giá trị nhỏ, vẫn dùng localStorage — không cần thay đổi
    async #saveAppDataCache() {
        try {
            await this.#idbSet('APP_DATA', APP_DATA);
            localStorage.setItem('LAST_SYNC', Date.now().toString());
        } catch (e) {
            console.warn('⚠️ Không lưu được IDB cache:', e);
        }
    }

    /**
     * Tải tất cả collections theo QUERY_CONFIG qua loadCollectionWithCache.
     * @param {object}   result  - object kết quả đang xây dựng
     * @param {string[]} allowed - danh sách collections được phép
     */
    async #loadCollections(result, allowed) {
        const tasks = allowed.map(async collName => {
            const cfg = DBManager.#QUERY_CONFIG[collName];
            if (!cfg) return;
            try {
                let query = this.#db.collection(collName);
                if (cfg.orderBy) query = query.orderBy(cfg.orderBy, 'desc');
                if (cfg.limit)   query = query.limit(cfg.limit);

                const snap   = await this.loadCollectionWithCache(query);
                const source = snap.metadata?.fromCache ? '📦 cache' : '🌐 server';
                this.#hydrateCollection(result, collName, snap);
                log(`✅ [${collName}] ${snap.size} docs — ${source}`);
            } catch (e) {
                console.error(`❌ [${collName}] tải thất bại:`, e);
            }
        });
        return Promise.all(tasks);
    }

    /**
     * Tải meta: app_config + users (cache-first).
     * @param {object} result
     */
    async #loadMeta(result) {
        const [cfgSnap, usersSnap] = await Promise.all([
            this.loadCollectionWithCache(this.#db.collection('app_config').doc('current')),
            this.loadCollectionWithCache(this.#db.collection('users')),
        ]);

        // app_config
        if (cfgSnap?.exists) {
            const rawCfg = cfgSnap.data();
            for (const k in rawCfg) {
                try {
                    result.lists[k] = (typeof rawCfg[k] === 'string' && rawCfg[k].startsWith('['))
                        ? JSON.parse(rawCfg[k]) : rawCfg[k];
                } catch { result.lists[k] = rawCfg[k]; }
            }
        } else {
            log('⚠️ app_config/current không tồn tại');
        }

        // users
        const staffList = [];
        usersSnap?.forEach(doc => {
            result.users[doc.id] = { id: doc.id, ...doc.data() };
            staffList.push(doc.data().user_name || 'No Name');
        });
        result.lists.staff = staffList;
    }

    // Dùng cho .get() — snapshot.forEach() là đúng
    #hydrateCollection(result, collName, snapshot) {
        if (!result[collName]) result[collName] = {};
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            result[collName][doc.id] = data;
            this.#buildSecondaryIndexes(result, collName, data);
        });
    }

    #buildSecondaryIndexes(result, collName, data) {
        DBManager.#INDEX_CONFIG
            .filter(cfg => cfg.source === collName)
            .forEach(({ index, groupBy }) => {
                const groupKey = data[groupBy];
                if (!groupKey) return;
                if (!result[index])           result[index] = {};
                if (!result[index][groupKey]) result[index][groupKey] = {};
                result[index][groupKey][data.id] = data;
            });
    }


    // ─── Private: Build Empty Result ─────────────────────────────────────

    #buildEmptyResult() {
        const primaryColls = [
            'bookings', 'booking_details', 'operator_entries', 'customers',
            'transactions', 'suppliers', 'fund_accounts',
            'transactions_thenice', 'fund_accounts_thenice',
            'hotels', 'hotel_price_schedules', 'service_price_schedules', 'users'
        ];

        const result = { lists: {}, currentUser: {} };

        // Primary flat indexes
        primaryColls.forEach(c => { result[c] = {}; });

        // Secondary grouped indexes
        DBManager.#INDEX_CONFIG.forEach(({ index }) => { result[index] = {}; });

        return result;
    }

    loadCollection = async (collectionName, limit = 2000) => {
        if (!this.#db) { console.error("❌ DB chưa init"); return null; }
        console.log(`📥 Loading collection: ${collectionName}...`);
        try {
            const collSnap = await this.#db.collection(collectionName)
                .orderBy('created_at', 'desc').limit(limit).get();
            const dataList = [];
            collSnap.forEach(doc => dataList.push(doc.data()));
            console.log(`✅ Loaded ${dataList.length} items from ${collectionName}`);
            return dataList;
        } catch (e) {
            console.error(`❌ Error loading ${collectionName}:`, e);
            return null;
        }
    }

    /**
     * Lấy collection: ưu tiên cache, fall back server nếu cache miss.
     */
    loadCollectionWithCache = async (query) => {
        try {
            // Ưu tiên lấy từ IndexDB (Firestore Persistence)
            const snap = await query.get({ source: 'cache' });
            
            // Nếu cache rỗng (size === 0), bắt buộc phải lên server
            if (snap.empty) {
                log('📦 Cache empty, fetching from server...');
                return await query.get({ source: 'server' });
            }
            log(`loadCollectionWithCache: 📦 Cache hit: ${snap.size} docs`);
            
            return snap;
        } catch (e) {
            log('⚠️ Cache load failed, fetching from server...', e);
            return await query.get({ source: 'server' });
        }
    }

    // ─── Sync ─────────────────────────────────────────────────────────────

    syncDelta = async (collection, forceFullLoad = false) => {
        try {
            showLoading(true);
            const lastSync     = localStorage.getItem('LAST_SYNC');
            const lastSyncDate = lastSync ? new Date(parseInt(lastSync)) : null;
            let collectionsToSync = [];

            if (collection) {
                collectionsToSync = [collection];
            } else {
                const role = window.CURRENT_USER?.role;
                const roleMap = {
                    'sale':        ['bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts', 'users'],
                    'op':          ['bookings', 'operator_entries', 'transactions'],
                    'acc':         ['transactions', 'fund_accounts'],
                    'acc_thenice': ['transactions_thenice', 'fund_accounts_thenice'],
                    'admin':       ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions', 'users']
                };
                collectionsToSync = roleMap[role] || [];
            }

            if (collectionsToSync.length === 0) return 0;

            const results = await Promise.all(collectionsToSync.map(async (colName) => {
                const isMissingData = !window.APP_DATA[colName] || Object.keys(window.APP_DATA[colName]).length === 0;

                let query;
                if (isMissingData || !lastSyncDate || forceFullLoad) {
                    log(`[${colName}] Chưa có dữ liệu hoặc yêu cầu tải lại toàn bộ. Đang tải...`);
                    query = this.#db.collection(colName);
                } else {
                    query = this.#db.collection(colName).where("updated_at", ">", lastSyncDate);
                }

                const querySnapshot = await query.get();

                if (!querySnapshot.empty) {
                    log(`[${colName}] Đang xử lý ${querySnapshot.size} bản ghi.`);
                    if (isMissingData || forceFullLoad) {
                        // Full reload: reset primary collection + all related secondary indexes
                        window.APP_DATA[colName] = {};
                        DBManager.#INDEX_CONFIG
                            .filter(cfg => cfg.source === colName)
                            .forEach(({ index }) => { window.APP_DATA[index] = {}; });
                        querySnapshot.forEach(doc => {
                            this._updateAppDataObj(colName, { id: doc.id, ...doc.data() });
                        });
                    } else {
                        // Delta: chỉ cập nhật/thêm docs thay đổi, secondary indexes tự cập nhật qua _updateAppDataObj
                        querySnapshot.forEach(doc => {
                            this._updateAppDataObj(colName, { id: doc.id, ...doc.data() });
                        });
                    }
                    return querySnapshot.size;
                }
                return 0;
            }));

            const totalChanges = results.reduce((a, b) => a + b, 0);

            if (totalChanges > 0) {
                await this.#saveAppDataCache();
                initBtnSelectDataList();
            }

            localStorage.setItem('LAST_SYNC', Date.now().toString());
            logA(`✅ Sync Delta hoàn tất. Tổng bản ghi thay đổi: ${totalChanges}`);
            return totalChanges;
        } catch (e) {
            log(`Lỗi syncDelta (Hybrid): `, e);
            return 0;
        } finally {
            showLoading(false);
        }
    }


    // ─── Sync Trigger ─────────────────────────────────────────────────────

    async _syncOperatorEntry(detailRow) {
        let d_id, d_bkid, d_type, d_hotel, d_service, d_in, d_out, d_night, d_qty, d_child, d_total;

        if (Array.isArray(detailRow)) {
            d_id     = detailRow[COL_INDEX.D_SID];
            d_bkid   = detailRow[COL_INDEX.D_BKID];
            d_type   = detailRow[COL_INDEX.D_TYPE];
            d_hotel  = detailRow[COL_INDEX.D_HOTEL];
            d_service = detailRow[COL_INDEX.D_SERVICE];
            d_in     = detailRow[COL_INDEX.D_IN];
            d_out    = detailRow[COL_INDEX.D_OUT];
            d_night  = detailRow[COL_INDEX.D_NIGHT];
            d_qty    = detailRow[COL_INDEX.D_QTY];
            d_child  = detailRow[COL_INDEX.D_CHILD];
            d_total  = detailRow[COL_INDEX.D_TOTAL];
        } else {
            d_id     = detailRow.id;
            d_bkid   = detailRow.booking_id;
            d_type   = detailRow.service_type;
            d_hotel  = detailRow.hotel_name;
            d_service = detailRow.service_name;
            d_in     = detailRow.check_in;
            d_out    = detailRow.check_out;
            d_night  = detailRow.nights;
            d_qty    = detailRow.quantity;
            d_child  = detailRow.child_qty;
            d_total  = detailRow.total;
        }

        const syncData = {
            id:                 d_id     || "",
            booking_id:         d_bkid   || "",
            customer_full_name: detailRow.customer_full_name || detailRow[COL_INDEX.M_CUST] || "",
            service_type:       d_type   || "",
            hotel_name:         d_hotel  || "",
            service_name:       d_service || "",
            check_in:           d_in  ? formatDateISO(d_in)  : "",
            check_out:          d_out ? formatDateISO(d_out) : "",
            nights:             d_night  || 0,
            adults:             d_qty    || 0,
            children:           d_child  || 0,
            total_sale:         d_total  || 0,
            updated_at:         firebase.firestore.FieldValue.serverTimestamp()
        };

        const res = await this.#firestoreCRUD(this.COLL.OPERATORS, 'set', String(d_id), syncData);
        if (res.success) this._updateAppDataObj(this.COLL.OPERATORS, syncData);
        return res;
    }

    // ─── CHỐT CHẶN CRUD ──────────────────────────────────────────────────
    /**
     * Hàm chốt chặn DUY NHẤT thực hiện mọi thao tác ghi/xóa lên Firestore.
     * KHÔNG gọi Firestore trực tiếp ở bất kỳ nơi nào khác — mọi CRUD đi qua đây.
     *
     * @param {string}  collection - Tên collection Firestore
     * @param {'set'|'update'|'delete'|'increment'|'batch'} action
     * @param {string|null}  id   - Document ID (null nếu action = 'batch')
     * @param {object|null}  data - Dữ liệu ghi (null khi delete/increment/batch)
     * @param {object}  [options]
     *   @param {boolean}  [options.merge=true]       - Dùng với action 'set', default true
     *   @param {object}   [options.batchRef]          - External batch ref; nếu có thì chỉ gắn
     *                                                   vào batch, KHÔNG tự commit
     *   @param {string}   [options.fieldName]         - Tên field (chỉ dùng với 'increment')
     *   @param {number}   [options.incrementBy=1]     - Giá trị delta (chỉ dùng với 'increment')
     *   @param {{docId:string, docData?:object, op?:'set'|'update'|'delete'}[]} [options.items]
     *                                                 - Danh sách items cho action 'batch';
     *                                                   tự động chia batch ≤ 499 ops/commit
     * @returns {Promise<{success:boolean, count?:number, error?:string}>}
     *
     * @example
     * // Ghi đơn
     * await this.#firestoreCRUD('bookings', 'set', 'BK001', { name: 'A' });
     * // Xóa đơn
     * await this.#firestoreCRUD('bookings', 'delete', 'BK001');
     * // Tăng field
     * await this.#firestoreCRUD('funds', 'increment', 'F1', null, { fieldName: 'balance', incrementBy: 500000 });
     * // Ghi hàng loạt
     * await this.#firestoreCRUD('bookings', 'batch', null, null, {
     *   items: [{ docId: 'BK001', docData: {...}, op: 'set' }, { docId: 'BK002', op: 'delete' }]
     * });
     * // Gắn vào external batch (không tự commit)
     * const batch = db.batch();
     * await this.#firestoreCRUD('bookings', 'set', 'BK001', data, { batchRef: batch });
     * await batch.commit(); // Caller tự commit
     */
    async #firestoreCRUD(collection, action, id = null, data = null, options = {}) {
        if (!this.#db)   return { success: false, error: 'DB chưa init' };
        if (!collection) return { success: false, error: 'Thiếu collection' };

        // ── Logging / Audit hook ────────────────────────────────────────────
        const actor  = window.CURRENT_USER?.account ?? 'system';
        const target = id ? `${collection}/${id}` : collection;
        log(`[CRUD] ${actor} | ${action.toUpperCase()} | ${target}`);

        // ── Ghi nhận dữ liệu trước khi thay đổi (cho delete/update) ────────
        const originalData = (action === 'delete' || action === 'update') && id
            ? (APP_DATA?.[collection]?.[id] ?? null)
            : null;

        try {
            // ── Nếu được truyền batchRef từ ngoài → gắn vào batch, KHÔNG commit ─
            if (options.batchRef) {
                if (!id) return { success: false, error: 'Cần id khi dùng batchRef' };
                const ref = this.#db.collection(collection).doc(String(id));
                if      (action === 'set')    options.batchRef.set(ref, data, { merge: options.merge ?? true });
                else if (action === 'update') options.batchRef.update(ref, data);
                else if (action === 'delete') options.batchRef.delete(ref);
                else return { success: false, error: `batchRef không hỗ trợ action: ${action}` };
                return { success: true };
            }

            let opResult;

            switch (action) {

                // ── Tạo mới / Ghi đè (merge theo mặc định) ──────────────────
                case 'set': {
                    if (!id) return { success: false, error: 'Cần id cho action set' };
                    const ref = this.#db.collection(collection).doc(String(id));
                    await ref.set(data, { merge: options.merge ?? true });
                    opResult = { success: true };
                    break;
                }

                // ── Cập nhật một phần (chỉ các field được truyền) ───────────
                case 'update': {
                    if (!id) return { success: false, error: 'Cần id cho action update' };
                    const ref = this.#db.collection(collection).doc(String(id));
                    await ref.update(data);
                    opResult = { success: true };
                    break;
                }

                // ── Xóa document ─────────────────────────────────────────────
                case 'delete': {
                    if (!id) return { success: false, error: 'Cần id cho action delete' };
                    await this.#db.collection(collection).doc(String(id)).delete();
                    opResult = { success: true };
                    break;
                }

                // ── Tăng/giảm giá trị một field ──────────────────────────────
                case 'increment': {
                    if (!id)               return { success: false, error: 'Cần id cho action increment' };
                    if (!options.fieldName) return { success: false, error: 'Thiếu options.fieldName' };
                    const ref = this.#db.collection(collection).doc(String(id));
                    await ref.update({
                        [options.fieldName]: firebase.firestore.FieldValue.increment(options.incrementBy ?? 1)
                    });
                    opResult = { success: true };
                    break;
                }

                // ── Ghi/xóa hàng loạt (tự tạo và commit batch, chia nhỏ ≤499) ─
                case 'batch': {
                    const items = options.items ?? [];
                    if (items.length === 0) return { success: true, count: 0 };

                    // Batch lớn (≥200): đính kèm batch_id vào mỗi doc để máy nhận
                    // biết phạm vi thay đổi và tự fetch từ server thay vì apply inline.
                    const NOTIF_INLINE_LIMIT = 200;
                    const isLargeBatch = items.length >= NOTIF_INLINE_LIMIT;
                    const batchId = isLargeBatch
                        ? `${collection}_batch_${Date.now()}`
                        : null;

                    const BATCH_LIMIT = 499;
                    let firestoreBatch = this.#db.batch();
                    let opCount        = 0;
                    let totalCommitted = 0;

                    for (const item of items) {
                        const ref = this.#db.collection(collection).doc(String(item.docId));
                        const op  = item.op ?? 'set';
                        // Nhúng batch_id vào các doc được ghi (không phải delete) khi batch lớn
                        const docData = (isLargeBatch && op !== 'delete' && item.docData)
                            ? { ...item.docData, batch_id: batchId }
                            : item.docData;

                        if      (op === 'set')    firestoreBatch.set(ref, docData, { merge: options.merge ?? true });
                        else if (op === 'update') firestoreBatch.update(ref, docData);
                        else if (op === 'delete') firestoreBatch.delete(ref);
                        opCount++;

                        if (opCount >= BATCH_LIMIT) {
                            await firestoreBatch.commit();
                            totalCommitted += opCount;
                            firestoreBatch = this.#db.batch();
                            opCount = 0;
                        }
                    }

                    if (opCount > 0) {
                        await firestoreBatch.commit();
                        totalCommitted += opCount;
                    }

                    // ── Tạo notification (fire-and-forget) ──────────────────
                    if (collection !== 'notifications') {
                        const notifId = `${collection}_batch_notif_${Date.now()}`;
                        // Batch nhỏ: gửi full list → máy nhận apply inline
                        // Batch lớn: chỉ gửi batch_id → máy nhận tự fetch server
                        const batchPayload = isLargeBatch
                            ? batchId
                            : items.map(it => ({ id: it.docId, action: it.op ?? 'set', data: it.docData }));

                        const batchNotif = {
                            id:         notifId,
                            type:       'data-change',
                            collection: collection,
                            action:     'b',
                            data:       JSON.stringify({ coll: collection, id: null, action: 'b', payload: batchPayload }),
                            payload:    batchPayload,
                            created_at: firebase.firestore.FieldValue.serverTimestamp(),
                            created_by: actor,
                        };

                        this.#db.collection('notifications').doc(notifId)
                            .set(batchNotif, { merge: false })
                            .catch(e => console.warn('⚠️ Không thể tạo batch notification:', e));
                    }

                    opResult = { success: true, count: totalCommitted };
                    break;
                }

                default:
                    return { success: false, error: `Action không hợp lệ: "${action}"` };
            }

            // ── Tạo notification data-change (fire-and-forget) ──────────────
            // Bỏ qua khi: ghi vào 'notifications' (tránh vòng lặp vô tận)
            //             hoặc action='batch' (đã xử lý notification ngay trong case 'batch')
            if (collection !== 'notifications' && action !== 'batch') {
                const actionCode = { set: 's', update: 'u', delete: 'd', increment: 'i' }[action] ?? action;
                const notifId    = `${collection}_${id ?? 'x'}_${Date.now()}`;

                const notifDoc = {
                    id:         notifId,
                    type:       'data-change',
                    collection: collection,
                    action:     actionCode,
                    data:       JSON.stringify({ coll: collection, id, action: actionCode, payload: data }),
                    payload:    data,
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    created_by: actor,
                };

                if (originalData) notifDoc.original_data = originalData;

                this.#db.collection('notifications').doc(notifId)
                    .set(notifDoc, { merge: false })
                    .catch(e => console.warn('⚠️ Không thể tạo notification:', e));
            }

            return opResult;

        } catch (e) {
            console.error(`[CRUD ERROR] ${action.toUpperCase()} ${collection}/${id ?? '*'}:`, e);
            return { success: false, error: e.message };
        }
    }

    // ─── CRUD ─────────────────────────────────────────────────────────────

    saveRecord = async (collectionName, dataArray, isBatch = false, batchRef = null) => {
        let dataObj;
        let isNew;

        if (typeof dataArray === 'object' && !Array.isArray(dataArray)) {
            dataObj = dataArray;
        } else {
            log(`Converting array to object for ${collectionName} saving...`);
            dataObj = arrayToObject(dataArray, collectionName);
        }

        if (collectionName === this.COLL.BOOKINGS)
            this.currentCustomer = dataObj.customer_full_name || dataArray[COL_INDEX.M_CUST];

        // Auto-create customer nếu booking thiếu customer_id
        if (collectionName === this.COLL.BOOKINGS && (!dataObj.customer_id || dataObj.customer_id === "")) {
            let customerPhone = dataObj.customer_phone || dataArray[COL_INDEX.M_PHONE];

            if (customerPhone) {
                if (customerPhone.startsWith("'") || customerPhone.startsWith('+'))
                    customerPhone = customerPhone.slice(1).trim();

                const customerSnap = await this.#db.collection(this.COLL.CUSTOMERS)
                    .where('phone', '==', String(customerPhone)).limit(1).get();

                if (customerSnap.size > 0) {
                    dataObj.customer_id = customerSnap.docs[0].id;
                    console.log(`✅ Tìm thấy customer cũ: ${customerSnap.docs[0].id}`);
                } else {
                    const newCustomerId = await this.generateIds(this.COLL.CUSTOMERS);
                    if (!newCustomerId) return { success: false, message: "Failed to create customer ID" };

                    const newCustomer = {
                        id:         newCustomerId.newId,
                        full_name:  dataObj.customer_full_name || "",
                        phone:      String(customerPhone).trim(),
                        source:     'Fanpage',
                        created_at: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    try {
                        const custRes = await this.#firestoreCRUD(this.COLL.CUSTOMERS, 'set', newCustomerId.newId, newCustomer);
                        if (!custRes.success) throw new Error(custRes.error ?? 'Lỗi tạo customer');
                        this._updateAppDataObj(this.COLL.CUSTOMERS, newCustomer);
                        dataObj.customer_id = newCustomerId.newId;
                        console.log(`✅ Tạo customer mới thành công: ${newCustomerId.newId}`);
                    } catch (e) {
                        console.error(`❌ Lỗi tạo customer: ${e.message}`);
                        await this._updateCounter(this.COLL.CUSTOMERS, newCustomerId.newNo - 1);
                        delete this.batchCounterUpdates[this.COLL.CUSTOMERS];
                        return { success: false, message: "Failed to create customer" };
                    }
                }
            } else {
                console.warn("⚠️ customer_phone trống, không thể tạo customer mới.");
            }
        }

        let docId = dataObj.id;

        if (!docId || docId === "") {
            let bookingId = null;
            if (collectionName === this.COLL.DETAILS)
                bookingId = dataObj.booking_id || dataArray[COL_INDEX.D_BKID];

            const idResult = await this.generateIds(collectionName, bookingId);
            if (!idResult) return { success: false, message: "Failed to generate ID" };

            docId = idResult.newId;
            dataObj.id = docId;
            if (Array.isArray(dataArray)) dataArray[0] = docId;
            isNew = true;
        }

        if (!docId) {
            console.error("❌ Lỗi: Dữ liệu thiếu ID", dataArray);
            return { success: false, message: "Missing ID" };
        }

        dataObj.updated_at = firebase.firestore.FieldValue.serverTimestamp();

        if (isBatch && batchRef) {
            return this.#firestoreCRUD(collectionName, 'set', docId, dataObj, { batchRef, merge: true });
        }

        try {
            const writeResult = await this.#firestoreCRUD(collectionName, 'set', docId, dataObj);
            if (!writeResult.success) throw new Error(writeResult.error);

            this._updateAppDataObj(collectionName, dataObj);

            if (collectionName === this.COLL.DETAILS) {
                await this._syncOperatorEntry(dataArray);
                if (!isNew)
                    A.NotificationManager.sendToOperator(
                        `Booking Detail ${dataObj.id} cập nhật!`,
                        `Khách: ${dataObj.customer_full_name || dataArray[COL_INDEX.M_CUST] || "Unknown"} cập nhật DV ${dataObj.service_name || dataArray[COL_INDEX.D_SERVICE] || "Unknown"}`
                    );
            } else if (collectionName === this.COLL.BOOKINGS) {
                if (isNew)
                    A.NotificationManager.sendToOperator(
                        `Booking ${dataObj.id} mới!`,
                        `Khách: ${dataObj.customer_full_name || dataArray[COL_INDEX.M_CUST] || "Unknown"}`
                    );
            }
            return { success: true, id: docId };
        } catch (e) {
            console.error("Save Error:", e);
            await this._updateCounter(collectionName, this.batchCounterUpdates[collectionName] - 1);
            delete this.batchCounterUpdates[collectionName];
            return { success: false, error: e.message };
        }
    }

    batchSave = async (collectionName, dataArrayList) => {
        if (!dataArrayList || dataArrayList.length === 0) return;

        let customerName = "";
        const bkId  = Array.isArray(dataArrayList[0]) ? dataArrayList[0][1] : dataArrayList[0].booking_id;
        const bkRef = this.#db.collection('bookings').doc(String(bkId));
        const bkSnap = await bkRef.get();
        if (bkSnap.exists) customerName = bkSnap.data().customer_full_name || "null";
        else log("Booking not found " + bkId);

        const batchSize = 450;
        const chunks    = [];
        for (let i = 0; i < dataArrayList.length; i += batchSize)
            chunks.push(dataArrayList.slice(i, i + batchSize));

        let totalSuccess = 0;
        this.batchCounterUpdates = {};
        const detailsForTrigger = [];
        const processedData     = [];

        // Giai đoạn 1: Pre-generate IDs
        for (const chunk of chunks) {
            for (const row of chunk) {
                const rowId = Array.isArray(row) ? row[0] : row.id;
                if (!rowId || rowId === "") {
                    const bookingId = (collectionName === this.COLL.DETAILS)
                        ? (Array.isArray(row) ? row[COL_INDEX.D_BKID] : row.booking_id)
                        : null;
                    const idResult = await this.generateIds(collectionName, bookingId);
                    if (idResult) {
                        if (Array.isArray(row)) row[0] = idResult.newId;
                        else row.id = idResult.newId;
                        if (!this.batchCounterUpdates[collectionName] || this.batchCounterUpdates[collectionName] <= idResult.newNo)
                            this.batchCounterUpdates[collectionName] = idResult.newNo;
                        console.log(`🆔 Pre-generated ID: ${idResult.newId}`);
                    }
                }
                processedData.push(row);
            }
        }

        // Giai đoạn 2: Batch save
        for (const chunk of chunks) {
            const batch = this.#db.batch();
            chunk.forEach(row => {
                this.saveRecord(collectionName, row, true, batch);
                if (collectionName === this.COLL.DETAILS) detailsForTrigger.push(row);
            });

            try {
                await batch.commit();
                totalSuccess += chunk.length;
                console.log(`📦 Saved chunk: ${chunk.length} items to ${collectionName}`);
                chunk.forEach(row => {
                    const dataObj = (typeof row === 'object' && !Array.isArray(row))
                        ? row : arrayToObject(row, collectionName);
                    this._updateAppDataObj(collectionName, dataObj);
                });
            } catch (e) {
                console.error(`❌ Batch Error in ${collectionName}:`, e);
            }
        }
        this.batchCounterUpdates = {};

        // Giai đoạn 3: Trigger operator sync
        if (collectionName === this.COLL.DETAILS && detailsForTrigger.length > 0) {
            for (const detailRow of detailsForTrigger) {
                if (typeof detailRow === 'object') detailRow.customer_full_name = customerName;
                else detailRow[COL_INDEX.M_CUST] = customerName;
                await this._syncOperatorEntry(detailRow);
            }
        }

        return { success: true, count: totalSuccess, data: processedData };
    }

    deleteRecord = async (collectionName, id) => {
        if (!id) return;
        try {
            const res = await this.#firestoreCRUD(collectionName, 'delete', id);
            if (!res.success) throw new Error(res.error);
            this._removeFromAppDataObj(collectionName, id);

            if (collectionName === this.COLL.DETAILS) {
                await this.#firestoreCRUD(this.COLL.OPERATORS, 'delete', id);
                this._removeFromAppDataObj(this.COLL.OPERATORS, id);
            }
            return { success: true, message: 'Deleted' };
        } catch (e) {
            logError('❌ Delete Error:', e);
            return { success: false, error: e.message };
        }
    }

    batchDelete = async (collectionName, idList) => {
        try {
            const items = idList.map(id => ({ docId: id, op: 'delete' }));
            const res = await this.#firestoreCRUD(collectionName, 'batch', null, null, { items });
            if (!res.success) throw new Error(res.error);

            if (collectionName === this.COLL.DETAILS) {
                await this.#firestoreCRUD(this.COLL.OPERATORS, 'batch', null, null, { items });
            }

            idList.forEach(id => {
                this._removeFromAppDataObj(collectionName, id);
                if (collectionName === this.COLL.DETAILS)
                    this._removeFromAppDataObj(this.COLL.OPERATORS, id);
            });
            return { success: true };
        } catch (e) {
            console.error('❌ Batch Delete Error:', e);
            return { success: false, error: e.message };
        }
    }

    incrementField = async (collectionName, docId, fieldName, incrementBy) => {
        if (!this.#db) { console.error('❌ DB chưa init'); return false; }
        try {
            const res = await this.#firestoreCRUD(collectionName, 'increment', docId, null, { fieldName, incrementBy });
            return res.success;
        } catch (e) {
            console.error(`❌ Error incrementing field for ${collectionName}/${docId}:`, e);
            return false;
        }
    }

    updateSingle = async (collectionName, id, objData) => {
        if (!collectionName || !objData) {
            console.warn("⚠️ updateDocument: Thiếu tham số");
            return { success: false, message: "Missing required parameters" };
        }
        if (!objData.id || objData.id === "") {
            console.error("❌ updateDocument: objData không có field 'id'");
            return { success: false, message: "objData must have 'id' field" };
        }

        try {
            objData.updated_at = firebase.firestore.FieldValue.serverTimestamp();
            const res = await this.#firestoreCRUD(collectionName, 'set', id, objData);
            if (!res.success) throw new Error(res.error);
            this._updateAppDataObj(collectionName, objData);
            console.log(`✅ Updated ${collectionName}/${id}`);
            return { success: true, message: 'Updated successfully' };
        } catch (e) {
            console.error('❌ updateDocument Error:', e);
            return { success: false, message: e.message };
        }
    }

    batchUpdateFieldData = async (collectionName, fieldName, oldValue, newValue, ids = null, forceNew = false) => {
        console.time("⏱ Thời gian cập nhật");
        console.log(`🚀 Bắt đầu cập nhật ${collectionName}.${fieldName}: "${oldValue}" → "${newValue}"`);

        try {
            if (!collectionName || !fieldName)
                throw new Error("❌ Lỗi: collectionName và fieldName không được để trống");

            if (!this.#db) throw new Error("❌ Firestore DB chưa khởi tạo");

            const collSnap = await this.#db.collection(collectionName).get();
            console.log(`📦 Tìm thấy ${collSnap.size} documents.`);

            const batchItems  = [];
            let totalUpdated  = 0;
            let totalSkipped  = 0;
            const idsSet = ids && Array.isArray(ids) ? new Set(ids.map(id => String(id))) : null;

            for (const doc of collSnap.docs) {
                const data = doc.data();

                if (idsSet && !idsSet.has(String(doc.id))) { totalSkipped++; continue; }

                const isMatch = String(data[fieldName]).trim() === String(oldValue).trim();

                if (isMatch || forceNew) {
                    const updateObj = {
                        [fieldName]: newValue,
                        updated_at:  firebase.firestore.FieldValue.serverTimestamp()
                    };
                    batchItems.push({ docId: doc.id, docData: updateObj, op: 'update' });
                    totalUpdated++;
                    console.log(`✅ [${totalUpdated}] ${doc.id}: ${fieldName} = "${newValue}"`);
                    this._updateAppDataObj(collectionName, { id: doc.id, ...data, ...updateObj });
                } else {
                    if (!idsSet) totalSkipped++;
                }
            }

            if (batchItems.length > 0) {
                const batchRes = await this.#firestoreCRUD(collectionName, 'batch', null, null, { items: batchItems });
                if (!batchRes.success) throw new Error(batchRes.error);
            }

            const result = {
                success: true, count: totalUpdated, skipped: totalSkipped,
                message: idsSet
                    ? `✅ Hoàn tất! Cập nhật ${totalUpdated}/${ids.length} documents trong danh sách`
                    : `✅ Hoàn tất! Cập nhật ${totalUpdated} documents, bỏ qua ${totalSkipped}`
            };
            console.log(`🎉 ${result.message}`);
            return result;
        } catch (error) {
            console.error(`❌ Lỗi: ${error.message}`);
            return { success: false, count: 0, message: `❌ Lỗi: ${error.message}` };
        } finally {
            console.timeEnd("⏱ Thời gian cập nhật");
        }
    }

    // ─── Queries ──────────────────────────────────────────────────────────

    runQuery = async (collectionName, fieldName, operator, value, fieldOrder = null, limit = null) => {
        if (!this.#db) { console.error("❌ DB chưa init"); return null; }
        console.log(`🔍 Query on ${collectionName}: ${fieldName} ${operator} ${value}`);
        try {
            let query = this.#db.collection(collectionName).where(fieldName, operator, value);
            if (fieldOrder) query = query.orderBy(fieldOrder, 'desc');
            if (limit && limit > 0) query = query.limit(limit);

            const querySnap = await query.get();
            const results = [];
            querySnap.forEach(doc => results.push(doc.data()));
            console.log(`✅ Query returned ${results.length} items from ${collectionName}`);
            return results;
        } catch (e) {
            console.error(`❌ Error running query on ${collectionName}:`, e);
            return null;
        }
    }

    // ─── ID Generation ────────────────────────────────────────────────────

    generateIds = async (collectionName, bookingId = null) => {
        if (!this.#db) { console.error("❌ DB chưa init"); return null; }

        const counterRef = this.#db.collection('counters_id').doc(collectionName);

        try {
            const counterSnap = await counterRef.get();
            let lastNo = 0;
            let prefix = '';
            let useRandomId = false;

            if (counterSnap.exists) {
                if (collectionName === this.COLL.DETAILS) prefix = bookingId ? `${bookingId}_` : 'SID_';
                else prefix = counterSnap.data().prefix || '';
                lastNo = counterSnap.data().last_no;
                if (lastNo && lastNo > 0) await this._updateCounter(collectionName, lastNo + 1);
            }

            if (!counterSnap.exists) {
                try {
                    const latestSnap = await this.#db.collection(collectionName)
                        .orderBy('id', 'desc').limit(1).get();

                    if (!latestSnap.empty) {
                        const latestDoc  = latestSnap.docs[0].data() || {};
                        const latestId   = String(latestDoc.id || latestSnap.docs[0].id || '').trim();

                        if (/^\d+$/.test(latestId)) {
                            lastNo = parseInt(latestId, 10); prefix = '';
                        } else if (latestId.includes('-')) {
                            const parts    = latestId.split('-').filter(Boolean);
                            const lastPart = parts[parts.length - 1] || '';
                            if (/^\d+$/.test(lastPart)) {
                                lastNo = parseInt(lastPart, 10);
                                prefix = parts.slice(0, -1).join('-');
                                prefix = prefix ? `${prefix}-` : '';
                            } else if (!/\d/.test(latestId)) { useRandomId = true; }
                        } else if (!/\d/.test(latestId)) { useRandomId = true; }
                    } else { useRandomId = true; }
                } catch (e) {
                    console.warn(`⚠️ Cannot derive lastNo from latest ${collectionName} id:`, e);
                }
            }

            const newNo = lastNo + 1;

            if (useRandomId) {
                const newId = `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`.trim();
                console.log(`🆔 Generated RANDOM ID for ${collectionName}: ${newId}`);
                return { newId, newNo };
            }

            const newId = `${prefix}${newNo}`.trim();
            console.log(`🆔 Generated ID for ${collectionName}: ${newId} (lastNo: ${lastNo} -> ${newNo})`);
            return { newId, newNo };
        } catch (e) {
            console.error(`❌ Error generating ID for ${collectionName}:`, e);
            return null;
        }
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────

    async _updateCounter(collectionName, newNo) {
        try {
            const res = await this.#firestoreCRUD('counters_id', 'set', collectionName, { last_no: newNo });
            if (!res.success) throw new Error(res.error);
            if (!this.batchCounterUpdates[collectionName] || this.batchCounterUpdates[collectionName] <= newNo)
                this.batchCounterUpdates[collectionName] = newNo;
        } catch (e) {
            console.error(`❌ Error updating counter for ${collectionName}:`, e);
        }
    }

    _updateAppDataObj(collectionName, dataObj) {

        if (!APP_DATA || !dataObj?.id) return;

        if (!APP_DATA[collectionName]) APP_DATA[collectionName] = {};
        APP_DATA[collectionName][dataObj.id] = {
            ...APP_DATA[collectionName][dataObj.id],
            ...dataObj
        };

        // 2. Cập nhật secondary indexes liên quan
        DBManager.#INDEX_CONFIG
            .filter(cfg => cfg.source === collectionName)
            .forEach(({ index, groupBy }) => {
                const groupKey = dataObj[groupBy];
                if (!groupKey) return;

                if (!APP_DATA[index])           APP_DATA[index] = {};
                if (!APP_DATA[index][groupKey]) APP_DATA[index][groupKey] = {};

                APP_DATA[index][groupKey][dataObj.id] = APP_DATA[collectionName][dataObj.id];
            });
    }

    _removeFromAppDataObj(collectionName, id) {
        if (!APP_DATA?.[collectionName]?.[id]) return;

        // Lấy doc trước khi xóa để biết groupKey
        const doc = APP_DATA[collectionName][id];

        // 1. Xóa khỏi primary
        delete APP_DATA[collectionName][id];

        // 2. Xóa khỏi secondary indexes
        if (doc) {
            DBManager.#INDEX_CONFIG
                .filter(cfg => cfg.source === collectionName)
                .forEach(({ index, groupBy }) => {
                    const groupKey = doc[groupBy];
                    if (!groupKey || !APP_DATA[index]?.[groupKey]) return;

                    delete APP_DATA[index][groupKey][id];

                    // Dọn group rỗng
                    if (Object.keys(APP_DATA[index][groupKey]).length === 0) {
                        delete APP_DATA[index][groupKey];
                    }
                });
        }
    }


    // ─── Migration Utilities ──────────────────────────────────────────────

    migrateFieldClientSide = async (collectionName, oldFieldName, newFieldName, strategy = 'move', transformFn = null, limitDocs = 1000) => {
        if (!this.#db) return { success: false, error: 'DB not initialized' };

        const startTime = Date.now();
        let migratedCount = 0;
        const errors = [];

        try {
            log(`🔄 Bắt đầu migrate client-side: [${oldFieldName}] → [${newFieldName}]`);

            let query = this.#db.collection(collectionName).where(oldFieldName, '!=', null);
            if (limitDocs > 0) query = query.limit(limitDocs);

            const snapshot = await query.get();
            if (snapshot.empty) {
                log('⚠️ Không tìm thấy documents với field: ' + oldFieldName);
                return { success: true, migratedCount: 0, message: 'Không có dữ liệu để migrate' };
            }

            log(`📥 Tìm thấy ${snapshot.size} documents`);

            const batchItems = [];

            for (const doc of snapshot.docs) {
                try {
                    const data     = doc.data();
                    const oldValue = data[oldFieldName];
                    if (oldValue === undefined || oldValue === null) continue;

                    const newValue   = transformFn ? transformFn(oldValue) : oldValue;
                    const updateData = {
                        [newFieldName]:   newValue,
                        _migrated_at:     new Date(),
                        _migration_field: `${oldFieldName}→${newFieldName}`
                    };
                    if (strategy === 'move')
                        updateData[oldFieldName] = firebase.firestore.FieldValue.delete();

                    batchItems.push({ docId: doc.id, docData: updateData, op: 'update' });
                    migratedCount++;
                } catch (err) {
                    errors.push({ docId: doc.id, error: err.message });
                }
            }

            if (batchItems.length > 0) {
                const batchRes = await this.#firestoreCRUD(collectionName, 'batch', null, null, { items: batchItems });
                if (!batchRes.success) throw new Error(batchRes.error);
                log(`📦 Hoàn thành migrate batch (${migratedCount}/${snapshot.size})`);
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            log(`✅ Migration hoàn thành (${migratedCount} docs, ${duration}s)`);
            return { success: true, migratedCount, errors, duration: `${duration}s`, strategy, message: `Migrate thành công ${migratedCount} documents` };
        } catch (err) {
            console.error('❌ Migration error:', err);
            return { success: false, migratedCount, errors: [...errors, { error: err.message }], duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s` };
        }
    }

    migrateBatchFieldsClientSide = async (collectionName, fieldMappings, strategy = 'move', limitDocs = 1000) => {
        const results = { success: true, collectionName, migrations: [], startTime: new Date().toLocaleString() };

        for (const mapping of fieldMappings) {
            try {
                const result = await this.migrateFieldClientSide(collectionName, mapping.old, mapping.new, strategy, mapping.transform, limitDocs);
                results.migrations.push({ field: `${mapping.old} → ${mapping.new}`, ...result });
                if (!result.success) results.success = false;
            } catch (err) {
                results.success = false;
                results.migrations.push({ field: `${mapping.old} → ${mapping.new}`, error: err.message, success: false });
            }
        }

        results.endTime = new Date().toLocaleString();
        return results;
    }

    checkMigrationStatus = async (collectionName, oldFieldName, newFieldName) => {
        try {
            const snapshot = await this.#db.collection(collectionName).where(oldFieldName, '!=', null).get();

            const total = snapshot.size;
            let migrated = 0, remaining = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data[newFieldName] !== undefined && data[newFieldName] !== null) migrated++;
                else remaining++;
            });

            const percentage = total > 0 ? Math.round((migrated / total) * 100) : 0;
            const status = remaining === 0 ? '✅ COMPLETE' : percentage > 50 ? '⏳ IN PROGRESS' : '⚠️ PENDING';

            return { success: true, collectionName, oldFieldName, newFieldName, total, migrated, remaining, percentage, status };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

}

// ─── Singleton Export ─────────────────────────────────────────────────────
// Tự động khởi chạy khi import — chờ auth ready rồi mới init Firestore.
// Để override config: thay `new DBManager()` bằng `new DBManager({ persistence: false, ... })`
const DB_MANAGER = new DBManager();
export default DB_MANAGER;