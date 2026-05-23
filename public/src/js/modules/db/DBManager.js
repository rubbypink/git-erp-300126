import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, orderBy, writeBatch, runTransaction, serverTimestamp, increment, arrayUnion, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { DB_SCHEMA } from './DBSchema.js';
import localDB from './DBLocalStorage.js';
import HD from '@js/libs/db_helper.js';
window.HD = HD;
/** DB Manager — Firestore Modular (v9+). Auto-init when auth ready, IndexedDB-first with Smart Delta Sync. */

class DBManager {
    #db = null;
    #listeners = {};
    #config = {};
    #initPromise = null;
    #resolveInit = null;
    #schema = DB_SCHEMA;
    #localDB = localDB;
    #functions = null;
    #debug = false;

    #writeQueue = [];
    #flushTimer = null;
    #isFlushing = false;
    #maxBatchSize = 450;
    #flushDelay = 800;

    batchCounterUpdates = {};
    currentCustomer = null;
    _initialized = false;

    /**
     * Query config — limits are overridable via Admin Settings (A.getConfig).
     * Getter pattern ensures config is read at query-time, not at class-definition time.
     */
    static get #QUERY_CONFIG() {
        const _cfg = (key, fallback) => window.A?.getConfig?.(key) ?? fallback;
        return {
            bookings: { limit: _cfg('query_limit_bookings', 1000), postSort: { key: 'created_at', dir: 'desc' } },
            booking_details: { limit: _cfg('query_limit_booking_details', 2000), postSort: { key: 'booking_id', dir: 'desc' } },
            operator_entries: { limit: _cfg('query_limit_operator_entries', 2000), postSort: { key: 'booking_id', dir: 'desc' } },
            customers: { limit: _cfg('query_limit_customers', 1000), postSort: { key: 'id', dir: 'asc' } },
            transactions: { limit: _cfg('query_limit_transactions', 2000), postSort: { key: 'transaction_date', dir: 'desc' } },
            suppliers: { limit: 1000, postSort: { key: 'id', dir: 'desc' } },
            fund_accounts: { limit: 20, postSort: { key: 'id', dir: 'desc' } },
            transactions_thenice: { limit: 2000, postSort: { key: 'id', dir: 'desc' } },
            fund_accounts_thenice: { limit: 20, postSort: { key: 'id', dir: 'desc' } },
            hotels: { limit: 1000, postSort: { key: 'name', dir: 'asc' } },
            tour_prices: { limit: 500, postSort: { key: 'id', dir: 'desc' } },
            hotel_price_schedules: { limit: 500, postSort: { key: 'id', dir: 'desc' } },
            service_price_schedules: { limit: 500, postSort: { key: 'id', dir: 'desc' } },
        };
    }
    static #HISTORY_COLLS = new Set(['bookings', 'booking_details', 'transactions']);

    /**
     * Mapping role → danh sách collections được phép truy cập.
     * Nguồn chân lý DUY NHẤT — dùng trong loadAllData, syncDelta, và role-change pruning.
     * Thêm / sửa role mới chỉ cần cập nhật ở đây.
     */
    static #ROLE_COLL_MAP = {
        sale: ['bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts', 'tour_prices', 'hotel_price_schedules', 'service_price_schedules'],
        op: ['bookings', 'operator_entries', 'suppliers', 'hotels', 'hotel_price_schedules', 'service_price_schedules', 'transactions', 'fund_accounts', 'customers', 'tour_prices'],
        acc: ['transactions', 'suppliers', 'fund_accounts', 'bookings', 'operator_entries'],
        acc_thenice: ['transactions_thenice', 'fund_accounts_thenice'],
        admin: ['bookings', 'booking_details', 'customers', 'operator_entries', 'transactions', 'suppliers', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'users', 'tour_prices', 'hotel_price_schedules', 'service_price_schedules'],
    };

    /**
     * Trả về danh sách collections cho role (không bao gồm 'users' — luôn tải qua loadMeta).
     * @param {string} role
     * @returns {string[]}
     */

    #getRoleCollections(role) {
        return DBManager.#ROLE_COLL_MAP[role] ? DBManager.#ROLE_COLL_MAP[role] : ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions'];
    }

    /**
     * Constructor — luôn dùng manual-init.
     * Gọi await DB.init() sau khi Firebase auth sẵn sàng để khởi động.
     *
     * @param {object} [options]
     * @param {number}  [options.cacheMaxAgeMs] - Tuổi tối đa của cache (ms), mặc định 72h
     */
    constructor(options = {}) {
        const _cfg = (key, fallback) => window.A?.getConfig?.(key) ?? fallback;
        const cacheMaxAgeHours = _cfg('cache_max_age_hours', 72);
        const HR72 = 72 * 60 * 60 * 1000;
        this.#config = {
            cacheMaxAgeMs: options.cacheMaxAgeMs ?? cacheMaxAgeHours * 60 * 60 * 1000,
            notificationsWindowMs: options.notificationsWindowMs ?? HR72,
        };
        this._initialized = false;
        this.#initPromise = new Promise((resolve) => {
            this.#resolveInit = resolve;
        });
    }

    /**
     * Khởi tạo nội bộ — chạy 1 lần sau khi auth ready.
     * Có thể await bên ngoài qua: await DB_MANAGER.ready()
     */
    async #bootInit() {
        this.#db = getFirestore(getApp());
        this.#functions = getFunctions(getApp(), 'asia-southeast1');

        await this.#localDB.initDB().catch((e) => L.log('⚠️ IndexedDB initDB thất bại:', e));
        this.#debug = A.getConfig('debug') || false;
        window.addEventListener('app-ready', () => {
            this.#startNotificationsListener();
            L._('🔔 Notifications listener started');
        });

        this._initialized = true;
        window.COLL_MANIFEST = DBManager.#ROLE_COLL_MAP;
    }

    /**
     * Cho phép nơi khác await cho đến khi init hoàn tất.
     * @returns {Promise<void>}
     */
    ready = () => this.#initPromise;

    /**
     * Khởi động DBManager — gọi sau khi Firebase auth sẵn sàng.
     */
    async init() {
        if (!this._initialized && !this.#db) {
            await this.#bootInit().catch((e) => console.error('❌ bootInit thất bại:', e));
            this.#resolveInit?.();
            L._(`🔍 [DBManager] ✅ DBManager khởi tạo thành công!`);
        } else {
            await this.#initPromise;
        }
        return this;
    }

    /** Firestore instance */
    get db() {
        return this.#db;
    }
    get schema() {
        return this.#schema;
    }
    get local() {
        return this.#localDB;
    }

    /**
     * Gửi yêu cầu thực thi một Cloud Function ở Backend.
     * @param {string} functionName - Tên function (endpoint) đã khai báo ở Firebase Functions.
     * @param {Object} payload - Dữ liệu tham số gửi kèm.
     * @param {string|Object} [regionOrOptions='asia-southeast1'] - Region string hoặc object { region, useEmulator, timeout }.
     * @returns {Promise<Object>} Kết quả trả về từ server.
     */
    async callFunction(functionName, payload = {}, regionOrOptions = 'asia-southeast1') {
        try {
            await this.ready();

            const region = typeof regionOrOptions === 'string' ? regionOrOptions : (regionOrOptions.region || 'asia-southeast1');
            const useEmulator = typeof regionOrOptions === 'object' && regionOrOptions.useEmulator;
            const timeout = typeof regionOrOptions === 'object' ? regionOrOptions.timeout : undefined;

            if (!this.#functions) {
                this.#functions = getFunctions(getApp(), region);
            }

            if (useEmulator) {
                const { connectFunctionsEmulator } = await import('firebase/functions');
                connectFunctionsEmulator(this.#functions, 'localhost', 5001);
            }

            if (this.#debug) L._(`[CloudFunction] Calling: ${functionName}`, payload);

            const callable = httpsCallable(this.#functions, functionName, timeout ? { timeout } : undefined);
            const result = await callable(payload);

            return result.data;
        } catch (error) {
            const isCorsError = error.message?.includes('CORS')
                || error.message?.includes('cors')
                || error.message?.includes('ERR_FAILED')
                || error.message?.includes('Access-Control-Allow-Origin')
                || error.code === 'functions/unavailable';

            if (isCorsError) {
                console.error(`❌ [DBManager.callFunction] Lỗi CORS khi gọi ${functionName}. Function chưa được deploy hoặc thiếu cấu hình CORS. Chạy lệnh: cd functions-ai && npm run deploy`, error);
            } else {
                L.log(`❌ [DBManager.callFunction] Lỗi thực thi ${functionName}:`, error);
            }
            throw error;
        }
    }

    /**
     * Tải toàn bộ data cần thiết cho APP_DATA.
     *
     * Cache Strategy (đã tối ưu):
     *  • Chỉ dùng 1 key duy nhất 'APP_DATA' trong localStorage (không phân biệt role)
     *    → tránh bội lưu khi user có nhiều role.
     *  • Khi role thay đổi so với 'LAST_SYNC_ROLE':
     *    1. Prune: xóa collections không thuộc role hiện tại khỏi APP_DATA
     *    2. Delta-load: tải bổ sung các collections còn thiếu cho role mới
     *    → Không bao giờ tải lại toàn bộ chỉ vì đổi role.
     *
     * @param {boolean} [forceNew=false] - Bỏ qua cache, buộc tải lại từ Firestore
     * @returns {Promise<object|null>} APP_DATA
     */
    async loadAllData(forceNew = false) {
        await this.#initPromise;
        if (!this.#db || !getAuth().currentUser) return null;

        const currentRole = window.CURRENT_USER?.role ?? '';
        const currentRoleColls = this.#getRoleCollections(currentRole);
        const lastSyncRole = this.#localDB.getMeta('LAST_SYNC_ROLE') ?? '';
        const roleChanged = currentRole !== lastSyncRole;

        this.#buildEmptyResult();

        if (!forceNew) {
            const indexedData = await this.#loadFromIndexedDB(currentRoleColls);
            const hasData = Object.keys(indexedData).some((k) => Object.keys(indexedData[k] || {}).length > 0);

            if (hasData) {
                Object.assign(APP_DATA, indexedData);

                if (roleChanged) {
                    L._(`🔄 Role changed: [${lastSyncRole}] → [${currentRole}]. Cleaning cache...`);
                    await this.#pruneDanglingCollections(currentRoleColls);
                }

                this.loadMeta(APP_DATA).catch((e) => L.log('Meta load fail:', e));

                this.#localDB.setMeta('LAST_SYNC_ROLE', currentRole);

                const networkSaver = window.A?.getConfig?.('network_saver');
                if (!networkSaver) {
                    this.#smartDeltaSync(currentRoleColls).catch((e) => L.log('Delta sync fail:', e));
                }

                return APP_DATA;
            }
        }
        L._(`📚 Full load from Firestore (Role: ${currentRole})`);
        try {
            await Promise.all([
                this.loadMeta(APP_DATA),
                this.syncDelta(currentRoleColls, true),
            ]);
            await this.#saveAppDataCache(currentRoleColls, forceNew);

            return APP_DATA;
        } catch (e) {
            console.error('❌ Critical loadAllData failure:', e);
            return null;
        }
    }

    /**
     * Nạp tất cả collections từ IndexedDB vào object result.
     * Trả về { [collName]: { [id]: doc } } — cùng format với APP_DATA.
     *
     * @param {string[]} roleColls - Danh sách collections cần tải
     * @returns {Promise<object>}
     */
    async #loadFromIndexedDB(roleColls) {
        const result = {};
        await Promise.all(
            roleColls.map(async (coll) => {
                try {
                    result[coll] = await this.#localDB.getAllAsObject(coll);
                } catch (e) {
                    L.log(`⚠️ IndexedDB getAllAsObject [${coll}] thất bại:`, e);
                    result[coll] = {};
                }
            })
        );
        return result;
    }

    /**
     * Hàm DUY NHẤT tải collection(s) từ Firestore vào APP_DATA.
     * Mọi nơi cần fetch data từ Firestore đều phải gọi qua hàm này.
     *
     * @param {string|string[]|null} [collections=null]
     * @param {object}  [options={}]
     * @param {boolean} [options.forceNew=false]  - Bỏ qua so sánh, tải lại toàn bộ docs
     * @param {boolean} [options.deltaSync=false] - Chỉ fetch docs có updated_at > LAST_SYNC_DELTA
     * @param {string}  [options.batchId]         - Lọc theo batchId (Large Batch reload)
     * @param {number}  [options.limit]           - Override limit từ QUERY_CONFIG
     * @returns {Promise<number>} Tổng số docs đã tải
     */
    async loadCollections(collections = null, options = {}) {
        await this.#initPromise;
        if (!this.#db) {
            console.error('❌ DB chưa init');
            return 0;
        }
        if (options === true) {
            options = { forceNew: true };
        }
        const { forceNew = false, deltaSync = false, batchId = null, limit: limitOverride = null } = options;

        let collList;
        if (!collections) {
            const role = window.CURRENT_USER?.role ?? null;
            collList = (DBManager.#ROLE_COLL_MAP[role] ?? ['bookings', 'booking_details', 'operator_entries', 'customers']).filter((c) => c !== 'users');
            const dataListSelect = document.getElementById('btn-select-datalist');
            const selectedColls = dataListSelect
                ? Array.from(dataListSelect.querySelectorAll('option'))
                      .map((opt) => opt.value)
                      .filter(Boolean)
                : [];
            if (selectedColls.length > 0) collList = collList.filter((c) => !selectedColls.includes(c));
        } else {
            collList = Array.isArray(collections) ? collections : [collections];
        }

        if (collList.length === 0) return 0;

        const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC_DELTA');
        const lastSyncDate = deltaSync && lastSyncRaw ? new Date(parseInt(lastSyncRaw)) : null;

        L._(`📚 loadCollections (role=${CURRENT_USER?.role ?? '-'}, delta=${deltaSync}, force=${forceNew}): ${collList.join(', ')}`);

        showLoading(true);
        try {
            const counts = await Promise.all(
                collList.map(async (collName) => {
                    const cfg = DBManager.#QUERY_CONFIG[collName];
                    const isMissingData = !APP_DATA[collName] || Object.keys(APP_DATA[collName]).length === 0;
                    try {
                        let q = collection(this.#db, collName);

                        if (deltaSync && lastSyncDate && !isMissingData && !forceNew) {
                            q = query(q, where('updated_at', '>', lastSyncDate));
                        } else if (batchId) {
                            q = query(q, where('batch_id', '==', batchId));
                        } else {
                            const lim = limitOverride ?? cfg?.limit;
                            if (lim) q = query(q, limit(lim));
                        }

                        const snap = await getDocs(q);
                        if (snap.empty) return 0;

                        const isDelta = deltaSync && lastSyncDate && !isMissingData && !forceNew;

                        const fetchedDocs = [];
                        snap.forEach((d) => fetchedDocs.push({ id: d.id, ...d.data() }));

                        if (!isDelta) {
                            await this.#localDB.clear(collName);
                            await this.#localDB.putBatch(collName, fetchedDocs);
                            this.#localDB.markSynced(collName);

                            APP_DATA[collName] = {};

                            for (const doc of fetchedDocs) {
                                this._updateAppDataObj(collName, doc);
                            }

                            L._(`✅ [${collName}] full load: ${fetchedDocs.length} docs`);
                        } else {
                            const syncItems = fetchedDocs.map((doc) => ({
                                coll: collName,
                                id: doc.id,
                                action: 'u',
                                data: doc,
                            }));
                            await this.#gatekeepSyncToLocal(null, null, null, null, true, syncItems);

                            L._(`✅ [${collName}] delta: ${fetchedDocs.length} docs mới/thay đổi`);
                        }
                        return snap.size;
                    } catch (e) {
                        console.error(`❌ [${collName}] tải thất bại:`, e);
                        return 0;
                    }
                })
            );

            const total = counts.reduce((a, b) => a + b, 0);
            if (total > 0) {
                this.#localDB.setMeta('LAST_SYNC', Date.now().toString());
                this.#localDB.setMeta('LAST_SYNC_ROLE', window.CURRENT_USER?.role ?? '');

                if (typeof A.UI.initBtnSelectDataList === 'function') A.UI.initBtnSelectDataList();
            }
            return total;
        } catch (e) {
            L._('❌ loadCollections thất bại:', e);
            return 0;
        } finally {
            showLoading(false);
        }
    }

    /**
     * Hàm bổ trợ: Dọn dẹp dữ liệu của role cũ
     */
    async #pruneDanglingCollections(allowedColls) {
        if (this.#debug) return;
        const allowedSet = new Set(allowedColls);
        const currentInApp = Object.keys(APP_DATA);

        for (const coll of currentInApp) {
            if (['lists', 'currentUser', 'users'].includes(coll)) continue;

            if (!allowedSet.has(coll)) {
                delete APP_DATA[coll];
                await this.#localDB.clear(coll);
                L._(`🗑️ Pruned collection: ${coll}`);
            }
        }
    }

    /**
     * GATEKEEPER CHÍNH: Firestore -> LocalDB -> APP_DATA
     * Đảm bảo không có dữ liệu nào lọt vào RAM mà chưa được ghi xuống ổ cứng.
     * * @param {string|null} collectionName - Tên collection (null nếu là batch đa collection)
     * @param {string|null} id - ID bản ghi (null nếu là batch)
     * @param {string} action - 's'(set/add), 'u'(update/increment), 'd'(delete)
     * @param {Object|null} payload - Dữ liệu (chỉ áp dụng khi không phải batch)
     * @param {boolean} isBatch - Cờ đánh dấu đang xử lý lô
     * @param {Array} batchItems - Mảng thao tác lô: [{ coll, id, action, data }]
     */
    async #gatekeepSyncToLocal(collName, id, action, payload, isBatch = false, batchItems = []) {
        try {
            const appDataExists = typeof APP_DATA !== 'undefined' && APP_DATA;

            const items = isBatch ? batchItems : [{ coll: collName, id, action, data: payload }];

            const putOps = {};
            const delOps = {};

            const sanitizeForLocal = (obj) => {
                if (obj === null || typeof obj !== 'object') return obj;
                if (obj instanceof Date) return obj;
                if (typeof obj.toMillis === 'function') return obj.toDate();
                if (obj.constructor?.name === 'FieldValue' || obj._methodName === 'serverTimestamp' || obj.serverTimestamp) return new Date();

                if (Array.isArray(obj)) return obj.map(sanitizeForLocal);

                const cleaned = {};
                for (const [key, val] of Object.entries(obj)) {
                    cleaned[key] = sanitizeForLocal(val);
                }
                return cleaned;
            };

            for (const item of items) {
                const c = item.coll;
                const i = item.id;
                const a = item.action;
                const d = item.data;

                if (!c || !i) continue;

                if (a === 'd' || a === 'delete') {
                    if (!delOps[c]) delOps[c] = [];
                    delOps[c].push(i);
                } else if (a === 'ua') {
                    let doc = appDataExists ? APP_DATA[c]?.[i] : null;
                    let arrVal = doc?.[d.field];
                    if (!arrVal) arrVal = [];
                    arrVal.push(d.value);

                    if (appDataExists) {
                        if (!APP_DATA[c]) APP_DATA[c] = {};
                        if (!APP_DATA[c][i]) APP_DATA[c][i] = {};
                        APP_DATA[c][i][d.field] = arrVal;
                    }

                    const idbDoc = (await this.#localDB.get(c, i)) || { id: i };
                    const currentArr = idbDoc[d.field] || [];
                    currentArr.push(d.value);
                    this.#localDB.put(c, sanitizeForLocal({ ...idbDoc, [d.field]: currentArr }));

                    L._('[Gatekeeper] Synced ArrayUnion Done', item);
                    continue;
                } else {
                    if (!putOps[c]) putOps[c] = [];
                    let currentDoc = appDataExists ? APP_DATA[c]?.[i] : null;
                    if (!currentDoc || Object.keys(currentDoc).length <= 1) {
                        try {
                            currentDoc = (await this.#localDB.get(c, i)) || {};
                        } catch (err) {
                            if (err.name === 'NotFoundError') {
                                currentDoc = {};
                            } else {
                                throw err;
                            }
                        }
                    }

                    const mergedDoc = { ...currentDoc, ...d, id: i };
                    putOps[c].push(sanitizeForLocal(mergedDoc));
                }
            }

            for (const c of Object.keys(putOps)) {
                if (putOps[c].length > 0) {
                    try {
                        await this.#localDB.putBatch(c, putOps[c]);
                    } catch (e) {
                        if (e.name === 'NotFoundError') {
                            L.log(`⚠️ [Gatekeeper] Store '${c}' not found, skipping local sync.`);
                        } else {
                            throw e;
                        }
                    }
                }
            }
            for (const c of Object.keys(delOps)) {
                for (const i of delOps[c]) {
                    try {
                        await this.#localDB.delete(c, i);
                    } catch (e) {
                        if (e.name === 'NotFoundError') {
                            L.log(`⚠️ [Gatekeeper] Store '${c}' not found, skipping local delete.`);
                        } else {
                            throw e;
                        }
                    }
                }
            }

            if (appDataExists) {
                for (const c of Object.keys(putOps)) {
                    for (const doc of putOps[c]) {
                        this._updateAppDataObj(c, doc);
                    }
                }
                for (const c of Object.keys(delOps)) {
                    for (const i of delOps[c]) {
                        this._removeFromAppDataObj(c, i);
                    }
                }
            }
        } catch (error) {
            console.error('❌ [Gatekeeper] Lỗi đồng bộ dữ liệu:', error);
        }
    }

    /** Clean data for Firestore — currently disabled (early return). */
    async cleanDataForFirestore(inputData, options = { removeEmptyString: false, debug: false }) {
        return inputData;
        const removedFields = [];
        const seen = new WeakSet();

        /**
         * Hàm đệ quy làm sạch object
         * @param {any} obj - Đối tượng cần làm sạch
         * @param {string} path - Đường dẫn truy cập field (để debug)
         */
        const sanitize = (obj, path = '') => {
            if (obj === null || obj === undefined) return obj;

            if (typeof obj === 'object' && obj !== null && !(obj instanceof Date)) {
                if (seen.has(obj)) {
                    removedFields.push({ path, reason: 'Tham chiếu vòng (Circular Reference)' });
                    return undefined;
                }
                seen.add(obj);
            }

            if (obj instanceof Date) return obj;

            if (obj && typeof obj === 'object' && (obj.constructor?.name === 'FieldValue' || typeof obj.toMillis === 'function' || obj._methodName || obj.serverTimestamp)) {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj
                    .map((item, index) => sanitize(item, path ? `${path}[${index}]` : `[${index}]`))
                    .filter((item, index) => {
                        const isInvalid = item === undefined || item === null || item === 'undefined' || item === 'null';
                        if (isInvalid) {
                            removedFields.push({ path: path ? `${path}[${index}]` : `[${index}]`, reason: `Phần tử mảng không hợp lệ: ${item}` });
                        }
                        return !isInvalid;
                    });
            }

            if (typeof obj === 'object') {
                const cleanedObj = {};

                for (const [key, value] of Object.entries(obj)) {
                    const currentPath = path ? `${path}.${key}` : key;

                    if (key.startsWith('_')) {
                        removedFields.push({ path: currentPath, reason: 'Field nội bộ (bắt đầu bằng _)' });
                        continue;
                    }

                    if (value === undefined || value === null || value === 'undefined' || value === 'null') {
                        removedFields.push({ path: currentPath, reason: `Giá trị không hợp lệ: ${value}` });
                        continue;
                    }

                    if (typeof value === 'number' && isNaN(value)) {
                        removedFields.push({ path: currentPath, reason: 'Giá trị là NaN' });
                        continue;
                    }

                    if (typeof value === 'string') {
                        const trimmed = value.trim();
                        if (trimmed === '' && options.removeEmptyString) {
                            removedFields.push({ path: currentPath, reason: 'Chuỗi rỗng (removeEmptyString=true)' });
                            continue;
                        }
                        cleanedObj[key] = trimmed;
                    }
                    else if (typeof value === 'object') {
                        const nested = sanitize(value, currentPath);

                        if (nested === undefined) continue;

                        const isDate = nested instanceof Date;
                        const isFirestoreType = nested && typeof nested.toMillis === 'function';
                        const isNotEmptyObj = !Array.isArray(nested) && Object.keys(nested).length > 0;
                        const isNotEmptyArr = Array.isArray(nested) && nested.length > 0;

                        if (isDate || isFirestoreType || isNotEmptyObj || isNotEmptyArr) {
                            cleanedObj[key] = nested;
                        } else {
                            removedFields.push({ path: currentPath, reason: 'Object/Array rỗng sau khi làm sạch' });
                        }
                    }
                    else {
                        cleanedObj[key] = value;
                    }
                }
                return cleanedObj;
            }

            return obj;
        };

        try {
            if (this.#debug || options.debug) {
                L._(`[cleanDataForFirestore] Input:`, inputData, 'debug');
            }

            let processData = inputData;

            if (Array.isArray(processData)) {
                processData = processData.reduce((acc, item, idx) => {
                    if (item && typeof item === 'object') {
                        const key = item.id;
                        if (key) {
                            acc[key] = item;
                        } else {
                            removedFields.push({ path: `root[${idx}]`, reason: 'Thiếu trường "id" trong mảng dữ liệu gốc' });
                        }
                    }
                    return acc;
                }, {});
            }

            const result = sanitize(processData);

            if (removedFields.length > 0 && (this.#debug || options.debug)) {
                L._(`[cleanDataForFirestore] Đã loại bỏ ${removedFields.length} trường dữ liệu:`, removedFields, 'debug');
            }

            return result || {};
        } catch (error) {
            if (typeof Opps === 'function') {
                Opps(error, 'cleanDataForFirestore', { severity: 'error', data: { inputData, removedFields } });
            } else {
                console.error('[cleanDataForFirestore] Lỗi nghiêm trọng:', error, removedFields);
            }
            return {};
        }
    }

    /**
     * HÀM CHÍNH XỬ LÝ CRUD với indexedDB
     * * @param {string|null} collName - Tên collection (null nếu là batch đa collection)
     * @param {string|null} id - ID bản ghi (null nếu là batch)
     * @param {string} action - 's'(set/add), 'u'(update/increment), 'd'(delete)
     * @param {Object|null} payload - Dữ liệu (chỉ áp dụng khi không phải batch)
     * @param {boolean} isBatch - Cờ đánh dấu đang xử lý lô
     * @param {Array} batchItems - Mảng thao tác lô: [{ coll, id, action, data }]
     */

    async syncLocal(collName, id, action = 'set', payload = null, isBatch = false, batchItems = []) {
        return await this.#gatekeepSyncToLocal(collName, id, action, payload, isBatch, batchItems);
    }

    /**
     * Ghi APP_DATA vào IndexedDB và cập nhật metadata sync.
     * Toàn bộ metadata (LAST_SYNC, LAST_SYNC_ROLE) lưu trong IndexedDB _sync_meta
     * — không còn dùng localStorage để tránh bị mất khi localStorage bị clear.
     *
     * @param {string[]} [collNames]         - Collections cần ghi (mặc định: tất cả có trong APP_DATA)
     * @param {boolean}  [clearStores=false] - Khi true: xóa sạch IDB store trước khi putBatch
     *                                         (dùng cho forceNew — loại bỏ docs đã xóa trên server)
     */
    async #saveAppDataCache(collNames = null, clearStores = false) {
        if (!APP_DATA) return;

        var toWrite = collNames ?? this.#getRoleCollections(window.CURRENT_USER?.role ?? '');
        if (!Array.isArray(toWrite)) toWrite = [toWrite];
        if (clearStores) {
            await Promise.all(
                toWrite.map(async (coll) => {
                    const docs = APP_DATA[coll];
                    if (!docs || typeof docs !== 'object') return;
                    const docList = Object.values(docs).filter((d) => d?.id);
                    if (docList.length === 0) return;
                    try {
                        await this.#localDB.clear(coll);
                        await this.#localDB.putBatch(coll, docList);
                        this.#localDB.markSynced(coll);
                        L._(`🗑️→💾 IDB clear+putBatch [${coll}]: ${docList.length} docs`);
                    } catch (e) {
                        L.log(`⚠️ IndexedDB clear+putBatch [${coll}] thất bại:`, e);
                    }
                })
            );
        } else {
            for (const coll of toWrite) {
                const docs = APP_DATA[coll];
                if (!docs || typeof docs !== 'object') continue;
                const docList = Object.values(docs).filter((d) => d?.id);
                if (docList.length > 0) {
                    this.#localDB
                        .putBatch(coll, docList)
                        .then(() => this.#localDB.markSynced(coll))
                        .catch((e) => L.log(`⚠️ IndexedDB putBatch [${coll}] thất bại:`, e));
                }
            }
        }

        this.#localDB.setMeta('LAST_SYNC', Date.now().toString());
        this.#localDB.setMeta('LAST_SYNC_ROLE', window.CURRENT_USER?.role ?? '');
    }

    async #startNotificationsListener() {
        if (this.#listeners['notifications']) return;

        const windowMs = this.#config.notificationsWindowMs;
        const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC');
        let lastSyncMs = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;

        const now = Date.now();

        const cutoffMs = Math.max(lastSyncMs, now - windowMs);
        const cutoffDate = new Date(cutoffMs);

        L._(`🔔 Notifications listener: query từ ${cutoffDate.toLocaleString()}`);

        const dedupCutoff = now - 24 * 60 * 60 * 1000;
        this.#localDB
            .deleteByQuery('notification_dedup', 'processed_at', '<', dedupCutoff)
            .then((count) => {
                if (count > 0) {
                    L._(`🗑️ Đã dọn dẹp ${count} bản ghi notification_dedup cũ (>24h)`);
                }
            })
            .catch((e) => L.log('⚠️ Dọn dẹp notification_dedup thất bại:', e));
        const user = window.CURRENT_USER;

        if (!user) {
            L._('⚠️ Notifications listener: không xác định được người dùng', 'warning');
            return;
        }
        const role = window.CURRENT_USER.role;
        if (role === 'admin') {
            const deleteCutoff = new Date(now - 3 * 24 * 60 * 60 * 1000);
            const q = query(collection(this.#db, 'notifications'), where('created_at', '<', deleteCutoff));
            getDocs(q)
                .then((snap) => {
                    if (snap.empty) return;
                    const batch = writeBatch(this.#db);
                    snap.forEach((d) => batch.delete(d.ref));
                    return batch.commit();
                })
                .then((result) => {
                    if (result !== undefined) L._(`🗑️ Đã xóa ${result === undefined ? 0 : 'các'} notifications cũ hơn 3 ngày`, 'info');
                })
                .catch((e) => L.log('⚠️ Xóa old notifications thất bại:', e));
        }
        const q = query(collection(this.#db, 'notifications'), where('created_at', '>=', cutoffDate));

        const userGroups = (Array.isArray(user.group) ? user.group : [user.group])
            .filter(Boolean)
            .map((g) => String(g).toLowerCase());

        const userName = String(user.name || '').toLowerCase();

        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                if (snapshot.empty) return;

                const dataChangeDocs = [];
                const notifDocsRaw = [];

                const myColls = this.#getRoleCollections(role);

                const changes = snapshot.docChanges();
                for (const change of changes) {
                    if (change.type === 'removed') continue;
                    const docData = change.doc.data();
                    const docId = change.doc.id;

                    let changePayload;
                    try {
                        changePayload = typeof docData.data === 'string' ? JSON.parse(docData.data) : docData.data;
                    } catch (e) {
                        changePayload = docData.data;
                    }

                    const targetColl = changePayload?.coll || docData.collection;
                    const targetDocId = changePayload?.id || docData.id;
                    const action = changePayload?.action || docData.action;
                    const updatedAt = docData.created_at?.toMillis?.() || (docData.created_at?.seconds ? docData.created_at.seconds * 1000 : 0) || 0;

                    if (targetColl && targetDocId && action) {
                        const dedupId = `${targetColl}_${targetDocId}_${action}_${updatedAt}`;
                        const isProcessed = await this.#localDB.get('notification_dedup', dedupId);
                        this.#localDB.put('notification_dedup', { id: dedupId, processed_at: Date.now() }).catch(() => {});
                    }

                    const doc = { id: docId, ...docData };

                    if (doc.type === 'data-change') {
                        if (myColls.includes(doc.collection)) {
                            dataChangeDocs.push(doc);
                        }
                    } else {
                        notifDocsRaw.push(doc);
                    }
                }

                if (dataChangeDocs.length > 0) {
                    this.#autoSyncData(dataChangeDocs);
                }

                if (notifDocsRaw.length > 0) {
                    const validNotifs = notifDocsRaw.filter((d) => {
                        if (d.type === 'data-change') return false;

                        const docGroups = (Array.isArray(d.group) ? d.group : [d.group]).filter(Boolean).map((g) => String(g).toLowerCase());

                        const docTargetUsers = (Array.isArray(d.target_users) ? d.target_users : []).map((u) => String(u).toLowerCase());

                        const isGroupMatch = docGroups.some((docG) => docG === 'all' || userGroups.includes(docG));
                        const isRoleMatch = String(d?.role || '').toLowerCase() === role;
                        const isUserMatch = docTargetUsers.includes(userName);
                        const isAdmin = role === 'admin';

                        return isGroupMatch || isUserMatch || isRoleMatch || isAdmin;
                    });

                    if (validNotifs.length > 0) {
                        const notifManager = window.A?.NotificationManager || window.NotificationManager;
                        if (notifManager && typeof notifManager.receiveFromServer === 'function') {
                            notifManager.receiveFromServer(validNotifs);
                        }
                    }
                }
            },
            (err) => console.error('❌ Notifications listener error:', err)
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
        const deduped = new Map();

        for (const notif of docs) {
            let change;
            try {
                change = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
            } catch {
                L.log('⚠️ #autoSyncData: không parse được doc.data', notif);
                continue;
            }

            if (!change?.coll || !change?.id) continue;

            const key = `${change.coll}::${change.id}`;
            const ts = notif.created_at?.toMillis?.() ?? (notif.created_at?.seconds ? notif.created_at.seconds * 1000 : 0) ?? 0;

            const existing = deduped.get(key);
            if (!existing || ts > existing._ts) {
                deduped.set(key, { ...change, _ts: ts });
            }
        }

        if (deduped.size === 0) return;

        for (const [, change] of deduped) {
            await this.#applyLocalChange(change);
        }
        L._(`🔄 autoSyncData: Tổng ${deduped.size} item được cập nhật dữ liệu`);
    }

    /**
     * Áp dụng 1 thay đổi (từ notification data-change) vào APP_DATA local.
     *
     * @param {{ coll: string, id: string, action: string, payload: any }} param0
     */
    async #applyLocalChange({ coll, id, action, payload }) {
        if (!APP_DATA || !coll || !id) return;

        if (action === 'b') {
            if (typeof payload === 'string') {
                L._(`🔄 #applyLocalChange: batch lớn (batch_id=${payload}), reload server...`);
                await this.loadCollections(coll, { forceNew: true, batchId: payload });
            } else if (Array.isArray(payload)) {
                await this.#gatekeepSyncToLocal(
                    null,
                    null,
                    null,
                    null,
                    true,
                    payload.map((item) => ({
                        coll,
                        id: item.id,
                        action: item.action,
                        data: item.data,
                    }))
                );
            }
        } else {
            await this.#gatekeepSyncToLocal(coll, id, action, payload);
        }
    }

    /**
     * Background sync: cập nhật các collections đã vượt TTL từ Firestore → IndexedDB → APP_DATA.
     * Chạy ngầm — không block giao diện.
     *
     * @param {string[]} roleColls - Collections của role hiện tại
     */
    async #backgroundSync(roleColls) {
        const staleColls = this.#localDB.getStalecollections(roleColls);
        if (staleColls.length === 0) return;

        L._(`🔄 Background sync: ${staleColls.join(', ')}`);

        for (const coll of staleColls) {
            try {
                const lastSyncStr = this.#localDB.getMeta(`LAST_SYNC_${coll}`);
                const since = lastSyncStr ? new Date(parseInt(lastSyncStr, 10)) : null;

                const docs = await this.#fetchCollectionDocs(coll, since);

                if (docs?.length > 0) {
                    await this.#localDB.putBatch(coll, docs);

                    for (const doc of docs) {
                        this._updateAppDataObj(coll, doc);
                    }

                    L._(`📥 Background sync [${coll}]: +${docs.length} docs`);
                }

                this.#localDB.markSynced(coll);
            } catch (e) {
                L.log(`⚠️ Background sync [${coll}] thất bại:`, e);
            }
        }

        L._(`✅ Background sync hoàn tất: ${staleColls.join(', ')}`);
    }

    /**
     * Smart Delta Sync: dùng bookings làm "canary" để kiểm tra dữ liệu mới.
     *
     * Chiến lược:
     *  1. Probe collection `bookings`: query docs có `updated_at` > LAST_SYNC_DELTA (limit 1)
     *  2. Nếu KHÔNG có docs mới → bỏ qua (tiết kiệm network)
     *  3. Nếu CÓ docs mới → gọi syncDelta cho bookings + tất cả collections khác của role
     *
     * Fallback: nếu role không có quyền bookings → dùng #backgroundSync (TTL-based).
     *
     * @param {string[]} roleColls - Collections của role hiện tại
     * @returns {Promise<void>}
     */
    async #smartDeltaSync(roleColls) {
        if (!roleColls.includes('bookings')) {
            L._('🔍 Smart Delta: role không có bookings — fallback backgroundSync');
            return this.#backgroundSync(roleColls);
        }

        const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC_DELTA');
        const lastSyncDate = lastSyncRaw ? new Date(parseInt(lastSyncRaw, 10)) : null;

        if (!lastSyncDate) {
            L._('🔍 Smart Delta: chưa có LAST_SYNC_DELTA — sync tất cả...');
            await this.syncDelta(roleColls, false);
            return;
        }

        try {
            const q1 = query(collection(this.#db, 'bookings'), where('updated_at', '>', lastSyncDate), limit(1));
            const q2 = query(collection(this.#db, 'transactions'), where('updated_at', '>', lastSyncDate), limit(1));

            const [probeSnap, probeSnap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

            if (probeSnap.empty && probeSnap2.empty) {
                L._('🔍 Smart Delta: bookings & transactions không có dữ liệu mới — bỏ qua');
                return;
            }

            const otherColls = roleColls.filter((c) => c !== 'bookings');
            L._(`🔍[Smart Delta]: phát hiện dữ liệu mới → sync + ${otherColls.length} collection(s) khác`);
            await this.syncDelta(roleColls, false);
        } catch (e) {
            L.log('⚠️ Smart Delta Sync thất bại:', e);
        }
    }

    syncDelta = async (collectionName, forceNew = false) => {
        try {
            showLoading(true);
            const lastSync = this.#localDB.getMeta('LAST_SYNC_DELTA');
            const lastSyncDate = lastSync ? new Date(parseInt(lastSync)) : null;
            let collectionsToSync;

            if (collectionName) {
                collectionsToSync = Array.isArray(collectionName) ? collectionName : [collectionName];
            } else {
                const role = CURRENT_USER.role;
                const roleColls = this.#getRoleCollections(role);
                const dataListSelect = getE('btn-select-datalist');
                const selectedColls = dataListSelect
                    ? Array.from(dataListSelect.querySelectorAll('option'))
                          .map((opt) => opt.value)
                          .filter(Boolean)
                    : [];
                collectionsToSync = [...new Set([...roleColls, ...selectedColls])];
            }

            L._(`🔄 Sync Delta: ${collectionsToSync.length} collection(s) to sync`);

            if (collectionsToSync.length === 0) return 0;

            const results = await Promise.all(
                collectionsToSync.map(async (colName) => {
                    const isMissingData = !APP_DATA[colName] || Object.keys(APP_DATA[colName]).length === 0;

                    let q = collection(this.#db, colName);
                    let cfg = DBManager.#QUERY_CONFIG[colName];
                    let lim = cfg?.limit || 1000;
                    if (isMissingData || !lastSyncDate || forceNew) {
                        q = query(q, limit(lim));
                        L._(`[${colName}] Full load (forceNew=${forceNew}): limit=${lim}`);
                    } else {
                        q = query(q, where('updated_at', '>', lastSyncDate));
                    }

                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        L._(`[${colName}] Đang xử lý ${querySnapshot.size} bản ghi.`);
                        if (isMissingData || forceNew) {
                            APP_DATA[colName] = {};

                            for (const d of querySnapshot.docs) {
                                await this.#gatekeepSyncToLocal(colName, d.id, 's', d.data());
                            }
                        } else {
                            for (const d of querySnapshot.docs) {
                                await this.#gatekeepSyncToLocal(colName, d.id, 's', d.data());
                            }
                        }

                        L._(`[SYNC DELTA][${colName}] Cập nhật APP_DATA với ${querySnapshot.size} bản ghi thay đổi.`);

                        return querySnapshot.size;
                    }
                    return 0;
                })
            );

            const totalChanges = results.reduce((a, b) => a + b, 0);

            if (totalChanges > 0) {
                A.UI.initBtnSelectDataList();
            }
            this.#localDB.setMeta('LAST_SYNC_DELTA', Date.now().toString());
            logA(`✅ Sync Delta hoàn tất. Tổng bản ghi thay đổi: ${totalChanges}`);

            return totalChanges;
        } catch (e) {
            Opps(`Lỗi syncDelta (Hybrid): `, e);
            return 0;
        } finally {
            showLoading(false);
        }
    };

    /**
     * Tải meta: app_config + users + hotels + suppliers.
     * Cấu trúc: Ưu tiên lấy từ Cache IndexedDB, kiểm tra tính toàn vẹn, nếu thiếu thì CHỈ tải list thiếu từ Firestore và cập nhật Cache.
     * @param {object} result - Đối tượng chứa APP_DATA
     * @param {boolean} forceNew - Nếu true, buộc tải lại toàn bộ dữ liệu từ Firestore
     */
    async loadMeta(result, forceNew = false, needNew = null) {
        if (needNew === 'lists') await this.#localDB.delete('app_config', 'lists');
        else if (needNew) await this.#localDB.clear(needNew);
        if (!result.lists) result.lists = {};
        if (!result.users) result.users = {};

        const missingCollections = [];
        if (!forceNew) {
            try {
                const cachedAppCFgObj = await this.#localDB.getAllAsObject('app_config');
                let parsedUsers = await this.#localDB.getAllAsObject('users');
                let parseHotels = await this.#localDB.getAllAsObject('hotels');
                let parseSuppliers = await this.#localDB.getAllAsObject('suppliers');
                let parsedLists = cachedAppCFgObj?.lists || null;

                if (Object.keys(parsedLists) && Object.keys(parsedUsers)) {
                    const hasStaff = Array.isArray(Object.values(parsedLists?.staff)) && Object.values(parsedLists?.staff).length > 0;
                    const hasHotels = parseHotels && Object.values(parseHotels).length > 0;
                    const hasSuppliers = parseSuppliers && Object.values(parseSuppliers).length > 0;
                    const hasUsers = parsedUsers && Object.keys(parsedUsers).length > 0;
                    const hasAppConfig = parsedLists && Object.values(parsedLists).filter((k) => !['staff', 'hotel', 'supplier'].includes(k)).length > 0;

                    if (!hasAppConfig) missingCollections.push('app_config');
                    if (!hasUsers || !hasStaff) missingCollections.push('users');
                    if (!hasHotels) missingCollections.push('hotels');
                    if (!hasSuppliers) missingCollections.push('suppliers');

                    Object.assign(result.lists, parsedLists || {});
                    Object.assign(result.users, parsedUsers || {});
                    Object.assign(result.hotels, parseHotels || {});
                    Object.assign(result.suppliers, parseSuppliers || {});

                    if (missingCollections.length === 0) {
                        L._('📦 [loadMeta] Đã load Meta (lists, users, hotels, suppliers) đầy đủ từ cache IndexedDB');
                        return;
                    } else {
                        L._(`⚠️ [loadMeta] Cache hiện tại bị thiếu [${missingCollections.join(', ')}], tiến hành tải phần thiếu từ Firestore...`);
                    }
                } else {
                    L._('⚠️ [loadMeta] Cache IndexedDB không tồn tại hoặc rỗng, tiến hành tải toàn bộ từ Firestore...');
                    missingCollections.push('app_config', 'users', 'hotels', 'suppliers');
                }
            } catch (e) {
                L.log('⚠️ [loadMeta] Lỗi đọc cache Meta từ IndexedDB, tiến hành fetch mới toàn bộ:', e);
                missingCollections.push('app_config', 'users', 'hotels', 'suppliers');
            }
        }

        L._(`📥 [loadMeta] Fetch data từ Firestore: ${missingCollections.join(', ')}...`);

        const promises = [];
        const lastSync = this.#localDB.getMeta('LAST_SYNC_META');
        const lastSyncDate = lastSync ? new Date(parseInt(lastSync)) : null;
        let cfg;
        let lim;

        missingCollections.forEach((coll) => {
            try {
                cfg = DBManager.#QUERY_CONFIG[coll];
                const actualColName = coll;
                lim = cfg?.limit || 1000;
                let q;
                if (lastSyncDate) {
                    if (actualColName === 'app_config') {
                        q = getDoc(doc(this.#db, 'app_config', 'lists'));
                    } else {
                        q = getDocs(query(collection(this.#db, actualColName), where('updated_at', '>', lastSyncDate), limit(lim)));
                    }
                } else {
                    if (actualColName === 'app_config') {
                        q = getDoc(doc(this.#db, 'app_config', 'lists'));
                    } else {
                        q = getDocs(query(collection(this.#db, actualColName), limit(lim)));
                    }
                }

                promises.push(q);
            } catch (err) {
                L.error(`❌ Lỗi tạo query cho collection ${coll}:`, err);
                promises.push(Promise.resolve(null));
            }
        });

        const snaps = await Promise.all(promises);

        const snapMap = {};
        missingCollections.forEach((coll, i) => {
            snapMap[coll] = snaps[i];
        });

        const cfgSnap = snapMap['app_config'];
        const usersSnap = snapMap['users'];
        const hotelsSnap = snapMap['hotels'];
        const suppliersSnap = snapMap['suppliers'];

        if (cfgSnap) {
            if (cfgSnap.exists()) {
                const rawCfg = cfgSnap.data();
                L._(`📋 [loadMeta] app_config/lists: ${Object.keys(rawCfg).length} keys`);
                for (const k in rawCfg) {
                    try {
                        result.lists[k] = typeof rawCfg[k] === 'string' && rawCfg[k].startsWith('[') ? JSON.parse(rawCfg[k]) : rawCfg[k];
                    } catch {
                        result.lists[k] = rawCfg[k];
                    }
                }
            } else {
                L._('⚠️ [loadMeta] app_config/lists không tồn tại — lists sẽ rỗng');
            }
        }

        if (usersSnap && !usersSnap.empty) {
            const staffList = [];
            const userDocs = [];
            usersSnap.forEach((d) => {
                const userData = { id: d.uid, ...d.data() };
                result.users[d.uid] = userData;
                userDocs.push(userData);
                staffList.push({ id: d.uid, name: d.data().name || d.data().user_name });
            });
            result.lists.staff = staffList;
            await this.#localDB.putBatch('users', userDocs);
        } else {
            L._('⚠️ [loadMeta] users không có dữ liệu hoặc query lỗi');
        }

        if (hotelsSnap && !hotelsSnap.empty) {
            const hotelList = [];
            const hotelDocs = [];
            hotelsSnap.forEach((d) => {
                const hotelData = { id: d.id, ...d.data() };
                result.hotels[d.id] = hotelData;
                hotelDocs.push(hotelData);
                hotelList.push({ id: d.id, name: d.data().name });
            });
            result.lists.hotels = hotelList;
            await this.#localDB.putBatch('hotels', hotelDocs);
        } else {
            L._('⚠️ [loadMeta] hotels không có dữ liệu hoặc query lỗi');
        }
        if (suppliersSnap && !suppliersSnap.empty) {
            const supplierList = [];
            const supplierDocs = [];
            suppliersSnap.forEach((d) => {
                const supplierData = { id: d.id, ...d.data() };
                result.suppliers[d.id] = supplierData;
                supplierDocs.push(supplierData);
                supplierList.push({ id: d.id, name: d.data().name });
            });
            result.lists.suppliers = supplierList;
            await this.#localDB.putBatch('suppliers', supplierDocs);
        } else {
            L._('⚠️ [loadMeta] suppliers không có dữ liệu hoặc query lỗi');
        }
        try {
            var lists = { id: 'lists', ...result.lists };
            lists.id = 'lists';
            this.#localDB.put('app_config', lists);
            this.#localDB.setMeta('LAST_SYNC_META', Date.now().toString());
            L._(`💾 [loadMeta] Đã lưu cập nhật cache Meta mới (bổ sung: ${missingCollections.join(', ')}) vào IndexedDB thành công`);
        } catch (e) {
            L.log('⚠️ [loadMeta] Lỗi khi lưu cache Meta vào IndexedDB:', e);
        }
    }

    /**
     * Fetcher callback dùng for localDB.autoSync().
     * Tải docs từ Firestore cho 1 collection (incremental nếu có sinceDate).
     *
     * @param {string} collName
     * @param {Date|null} sinceDate - Chỉ lấy docs có updated_at > sinceDate; null = full load
     * @returns {Promise<object[]>} Plain object array [{id, ...fields}]
     */
    async #fetchCollectionDocs(collName, sinceDate) {
        if (!this.#db) return [];
        const cfg = DBManager.#QUERY_CONFIG[collName];
        let q = collection(this.#db, collName);

        if (sinceDate) {
            q = query(q, where('updated_at', '>', sinceDate));
        } else {
            const lim = cfg?.limit;
            if (lim) q = query(q, limit(lim));
        }

        const snap = await getDocs(q);
        const docs = [];
        snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
        return docs;
    }

    #buildEmptyResult() {
        const primaryColls = ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions', 'suppliers', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'hotels', 'hotel_price_schedules', 'service_price_schedules', 'tour_prices', 'users'];

        APP_DATA = { lists: {}, currentUser: {} };

        primaryColls.forEach((c) => {
            APP_DATA[c] = {};
        });
        return APP_DATA;
    }

    /**
     * Đảm bảo dữ liệu đầu vào là Object chuẩn.
     * Nếu là Array, thực hiện chuyển đổi dựa trên Schema.
     * @param {Object|Array} data
     * @param {string} collectionName
     * @returns {Object}
     */
    #ensureObject(data, collectionName) {
        if (!data) return {};
        if (typeof data === 'object' && !Array.isArray(data)) {
            return { ...data };
        }
        if (typeof this.#schema?.arrayToObject === 'function') {
            return this.#schema.arrayToObject(data, collectionName);
        }
        return {};
    }

    /**
     * Đồng bộ 1 booking_detail row sang collection operator_entries.
     * Tối ưu: Nếu chỉ cập nhật 1 vài field, kiểm tra xem item đã tồn tại chưa và lọc field hợp lệ.
     */
    async _syncOperatorEntry(detailRow, customerName = '') {
        try {
            if (!detailRow) throw new Error('Dữ liệu detailRow bị trống.');

            const dataObj = this.#ensureObject(detailRow, 'booking_details');

            const id = String(dataObj.id || '');
            if (!id || id === 'undefined') {
                L._(`[_syncOperatorEntry] ❌ ID không hợp lệ`, 'warning');
                return { success: false, error: 'Invalid ID' };
            }

            const existingEntry = window.APP_DATA?.operator_entries?.[id];
            const isPartialUpdate = Object.keys(dataObj).length < 10;

            const ALLOWED_SYNC_FIELDS = {
                booking_id: 'booking_id',
                customer_full_name: 'customer_full_name',
                service_type: 'service_type',
                hotel_name: 'hotel_name',
                service_name: 'service_name',
                check_in: 'check_in',
                check_out: 'check_out',
                nights: 'nights',
                quantity: 'adults',
                child_qty: 'children',
                total: 'total_sale',
                ref_code: 'ref_code',
            };

            let syncData = {};
            let hasValidField = false;

            if (isPartialUpdate && existingEntry) {
                for (const [bdField, opField] of Object.entries(ALLOWED_SYNC_FIELDS)) {
                    if (Object.prototype.hasOwnProperty.call(dataObj, bdField)) {
                        let val = dataObj[bdField];
                        if (bdField === 'check_in' || bdField === 'check_out') val = val ? formatDateISO(val) : '';
                        if (bdField === 'quantity' || bdField === 'child_qty' || bdField === 'nights') val = Number(val) || 0;
                        if (bdField === 'total') val = Number(val) || 0;

                        syncData[opField] = val;
                        hasValidField = true;
                    }
                }

                if (!hasValidField) {
                    if (this.#debug) L._(`[_syncOperatorEntry] ⏭️ Bỏ qua: Không có field hợp lệ để update cho ID ${id}`);
                    return { success: true, skipped: true };
                }
            } else {
                let finalCustName = customerName || dataObj.customer_full_name || '';
                if (!finalCustName.trim() && dataObj.booking_id) {
                    finalCustName = window.APP_DATA?.bookings?.[dataObj.booking_id]?.customer_full_name || '';
                }

                syncData = {
                    id: id,
                    booking_id: dataObj.booking_id || '',
                    customer_full_name: finalCustName,
                    service_type: dataObj.service_type || '',
                    hotel_name: dataObj.hotel_name || '',
                    service_name: dataObj.service_name || '',
                    check_in: dataObj.check_in ? formatDateISO(dataObj.check_in) : '',
                    check_out: dataObj.check_out ? formatDateISO(dataObj.check_out) : '',
                    nights: Number(dataObj.nights) || 0,
                    adults: Number(dataObj.quantity) || 0,
                    children: Number(dataObj.child_qty) || 0,
                    total_sale: Number(dataObj.total) || 0,
                    ref_code: dataObj.ref_code || '',
                };
            }

            syncData.updated_at = serverTimestamp();

            const res = await this.#firestoreCRUD('operator_entries', 'set', id, syncData, { merge: true });
            if (res.success) {
                if (this.#debug) L._(`[_syncOperatorEntry] ✅ Synced ID: ${id}`, 'success');
            } else {
                throw new Error(res.error || 'FirestoreCRUD failed');
            }

            return res;
        } catch (error) {
            L._(`[_syncOperatorEntry] ❌ Lỗi: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Đồng bộ toàn bộ booking_details của một hoặc nhiều booking_id sang operator_entries.
     * Dùng Promise.allSettled để đảm bảo 1 detail lỗi KHÔNG làm chết tiến trình đồng bộ các detail khác.
     *
     * @param {string|string[]} bookingIds - ID của booking hoặc mảng các ID booking
     * @returns {Promise<{success:boolean, totalProcessed: number, totalSuccess: number}>}
     */
    async syncOperatorEntriesByBookingId(bookingIds) {
        try {
            const ids = Array.isArray(bookingIds) ? bookingIds : [bookingIds];
            const validIds = ids.filter((id) => id && String(id).trim() !== '');

            if (validIds.length === 0) {
                L._('[syncOperatorEntriesByBookingId] ⚠️ Không có booking_id hợp lệ để đồng bộ.', 'warning');
                return { success: false, totalProcessed: 0, totalSuccess: 0 };
            }

            L._(`[syncOperatorEntriesByBookingId] 🔄 Đang lọc details cho ${validIds.length} booking...`, 'info');

            const allDetails = window.APP_DATA?.booking_details || {};
            const detailsToSync = Object.values(allDetails).filter((detail) => detail && detail.booking_id && validIds.includes(detail.booking_id));

            if (detailsToSync.length === 0) {
                L._(`[syncOperatorEntriesByBookingId] ⚠️ Không tìm thấy booking_details nào khớp.`, 'warning');
                return { success: true, totalProcessed: 0, totalSuccess: 0 };
            }

            const batchItems = detailsToSync.map((detail) => {
                const dataObj = this.#ensureObject(detail, 'booking_details');
                const id = String(dataObj.id || '');

                let finalCustName = dataObj.customer_full_name || '';
                if (!finalCustName.trim() && dataObj.booking_id) {
                    finalCustName = window.APP_DATA?.bookings?.[dataObj.booking_id]?.customer_full_name || '';
                }

                const syncData = {
                    id: id,
                    booking_id: dataObj.booking_id || '',
                    customer_full_name: finalCustName,
                    service_type: dataObj.service_type || '',
                    hotel_name: dataObj.hotel_name || '',
                    service_name: dataObj.service_name || '',
                    check_in: dataObj.check_in ? formatDateISO(dataObj.check_in) : '',
                    check_out: dataObj.check_out ? formatDateISO(dataObj.check_out) : '',
                    nights: Number(dataObj.nights) || 0,
                    adults: Number(dataObj.quantity) || 0,
                    children: Number(dataObj.child_qty) || 0,
                    total_sale: Number(dataObj.total) || 0,
                    ref_code: dataObj.ref_code || '',
                    updated_at: serverTimestamp(),
                };

                return { docId: id, docData: syncData, op: 'set' };
            });

            const res = await this.#firestoreCRUD('operator_entries', 'batch', null, null, { items: batchItems });

            if (res.success) {
                L._(`[syncOperatorEntriesByBookingId] Hoàn tất. Thành công: ${res.count}/${detailsToSync.length}`, 'success');
                return {
                    success: true,
                    totalProcessed: detailsToSync.length,
                    totalSuccess: res.count,
                };
            } else {
                throw new Error(res.error || 'Batch sync failed');
            }
        } catch (error) {
            L._(`[syncOperatorEntriesByBookingId] ❌ Lỗi Fatal: ${error.message}`, 'error');
            return { success: false, error: error.message, totalProcessed: 0, totalSuccess: 0 };
        }
    }

    async #firestoreCRUD(collectionName, action, id = null, data = null, options = {}) {
        if (!this.#db) return { success: false, error: 'DB chưa init' };
        if (!collectionName) return { success: false, error: 'Thiếu collection' };

        const queueableActions = ['set', 'update', 'delete', 'increment', 'arrayUnion'];
        if (options.useQueue && queueableActions.includes(action) && !options.batchRef) {
            return new Promise((resolve, reject) => {
                this.#addToQueue({ collectionName, action, id, data, options, resolve, reject });
            });
        }

        const actor = window.CURRENT_USER?.name ?? 'system';
        const target = id ? `${collectionName}/${id}` : collectionName;

        const writeActions = ['add', 'set', 'update', 'arrayUnion'];
        if (writeActions.includes(action)) {
            if (data) {
                if (this.#debug) L._(`[CRUD DEBUG] Pre-clean data for ${target}:`, data);
            }

            if (data === null || data === undefined) {
                L.log(`❌ [CRUD ERROR] Data đầu vào bị lỗi hoặc null tại ${target}`, 'firestoreCRUD', { severity: 'error', data: data });
                throw new Error(`Dữ liệu đầu vào không hợp lệ khi chuẩn bị lưu vào ${collectionName}`);
            }
        }

        if (data && typeof data === 'object' && !Array.isArray(data)) data.updated_by = actor;
        L._(`[CRUD] ${actor} | ${action.toUpperCase()} | ${target}`);

        const originalData = id ? (APP_DATA?.[collectionName]?.[id] ?? null) : null;

        try {
            if (options.batchRef) {
                if (!id) return { success: false, error: 'Cần id khi dùng batchRef' };
                const ref = doc(this.#db, collectionName, String(id));
                if (action === 'set') options.batchRef.set(ref, data, { merge: options.merge ?? true });
                else if (action === 'update') options.batchRef.update(ref, data);
                else if (action === 'delete') options.batchRef.delete(ref);
                else return { success: false, error: `batchRef không hỗ trợ action: ${action}` };
                return { success: true };
            }

            let opResult;

            switch (action) {
                case 'get': {
                    let snap;
                    let resultData;
                    if (!id) {
                        const q = query(collection(this.#db, collectionName), orderBy('id', 'desc'), limit(2000));
                        snap = await getDocs(q);
                        resultData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                    } else {
                        snap = await getDoc(doc(this.#db, collectionName, String(id)));
                        resultData = snap.exists() ? { id: snap.id, ...snap.data() } : null;
                    }

                    if (resultData) {
                        if (Array.isArray(resultData) && resultData.length > 0) {
                            const batchToSync = resultData.map((d) => ({ coll: collectionName, id: d.id, action: 'u', data: d }));
                            await this.#gatekeepSyncToLocal(null, null, null, null, true, batchToSync);
                        } else {
                            await this.#gatekeepSyncToLocal(collectionName, resultData.id, 'u', resultData);
                        }
                        opResult = {
                            success: true,
                            data: resultData,
                        };
                    } else opResult = { success: false, error: 'Not Found' };

                    return opResult;
                }

                case 'query': {
                    let q = collection(this.#db, collectionName);
                    if (options.queries) {
                        options.queries.forEach(([f, op, v]) => {
                            q = query(q, where(f, op, v));
                        });
                    }
                    if (options.limit) q = query(q, limit(options.limit));
                    if (options.orderBy) q = query(q, orderBy(options.orderBy[0], options.orderBy[1] || 'asc'));

                    const snap = await getDocs(q);
                    const docs = [];
                    const batchToSync = [];

                    snap.forEach((d) => {
                        const docData = { id: d.id, ...d.data() };
                        docs.push(docData);
                        batchToSync.push({ coll: collectionName, id: d.id, action: 'u', data: docData });
                    });

                    opResult = { success: true, count: snap.size, data: docs };
                    if (batchToSync.length > 0) {
                        await this.#gatekeepSyncToLocal(null, null, null, null, true, batchToSync);
                    }
                    break;
                }

                case 'add': {
                    const ref = doc(collection(this.#db, collectionName));
                    await setDoc(ref, data);
                    data.id = ref.id;
                    await this.#gatekeepSyncToLocal(collectionName, data.id, 's', data);
                    opResult = { success: true, data: data, id: ref.id };
                    break;
                }
                case 'set': {
                    if (!id) return { success: false, error: 'Cần id cho action set' };
                    const ref = doc(this.#db, collectionName, String(id));
                    await setDoc(ref, data, { merge: options.merge ?? true });
                    await this.#gatekeepSyncToLocal(collectionName, id, 's', data);
                    opResult = { success: true, data: data };
                    break;
                }

                case 'update': {
                    if (!id) return { success: false, error: 'Cần id cho action update' };
                    const ref = doc(this.#db, collectionName, String(id));
                    await updateDoc(ref, data);
                    await this.#gatekeepSyncToLocal(collectionName, id, 'u', data);
                    opResult = { success: true };
                    break;
                }

                case 'delete': {
                    if (!id) return { success: false, error: 'Cần id cho action delete' };
                    await deleteDoc(doc(this.#db, collectionName, String(id)));
                    await this.#gatekeepSyncToLocal(collectionName, id, 'd', null);
                    opResult = { success: true };
                    break;
                }

                case 'increment': {
                    if (!id) return { success: false, error: 'Cần id cho action increment' };
                    if (!options.fieldName) return { success: false, error: 'Thiếu options.fieldName' };
                    const ref = doc(this.#db, collectionName, String(id));
                    await updateDoc(ref, {
                        [options.fieldName]: increment(options.incrementBy ?? 1),
                    });
                    const incDoc = await getDoc(ref);
                    const finalData = { id: incDoc.id, ...incDoc.data() };
                    await this.#gatekeepSyncToLocal(collectionName, id, 'u', finalData);
                    opResult = { success: true, data: finalData };
                    break;
                }

                case 'arrayUnion': {
                    if (!id || !options.fieldName) return { success: false, error: 'Thiếu tham số' };
                    const ref = doc(this.#db, collectionName, String(id));
                    await updateDoc(ref, {
                        [options.fieldName]: arrayUnion(data),
                    });
                    await this.#gatekeepSyncToLocal(collectionName, id, 'ua', { field: options.fieldName, value: data });
                    opResult = { success: true };
                    break;
                }

                case 'batch': {
                    const items = options.items ?? [];
                    if (items.length === 0) return { success: true, count: 0 };

                    const NOTIF_INLINE_LIMIT = 200;
                    const isLargeBatch = items.length >= NOTIF_INLINE_LIMIT;
                    const batchId = isLargeBatch ? `${collectionName}_batch_${Date.now()}` : null;

                    const BATCH_LIMIT = 499;
                    let firestoreBatch = writeBatch(this.#db);
                    let opCount = 0;
                    let totalCommitted = 0;

                    const syncItems = [];

                    for (const i of items) {
                        const item = i;
                        if (!item || !item.docId) {
                            L.log('⚠️ [Batch] Bỏ qua item không hợp lệ hoặc thiếu docId:', i);
                            continue;
                        }
                        const docIdStr = String(item.docId);
                        const ref = doc(this.#db, collectionName, docIdStr);
                        const op = item.op ?? 'set';
                        if (item.docData && typeof item.docData === 'object' && !Array.isArray(item.docData)) {
                            item.docData.updated_by = actor;
                        }

                        const docData = isLargeBatch && op !== 'delete' && item.docData ? { ...item.docData, batch_id: batchId } : item.docData;

                        if (op === 'set') firestoreBatch.set(ref, docData, { merge: options.merge ?? true });
                        else if (op === 'update') firestoreBatch.update(ref, docData);
                        else if (op === 'delete') firestoreBatch.delete(ref);

                        opCount++;

                        const gkAction = op === 'delete' ? 'd' : op === 'set' ? 's' : 'u';
                        syncItems.push({ coll: collectionName, id: docIdStr, action: gkAction, data: docData });

                        if (opCount >= BATCH_LIMIT) {
                            await firestoreBatch.commit();
                            totalCommitted += opCount;
                            firestoreBatch = writeBatch(this.#db);
                            opCount = 0;
                        }
                    }

                    if (opCount > 0) {
                        await firestoreBatch.commit();
                        totalCommitted += opCount;
                    }

                    await this.#gatekeepSyncToLocal(null, null, null, null, true, syncItems);

                    if (collectionName !== 'notifications') {
                        const notifId = `${collectionName}_batch_notif_${Date.now()}`;
                        const sanitizePayload = (data) => {
                            if (!data || typeof data !== 'object') return data;
                            const cleaned = { ...data };
                            for (const key in cleaned) {
                                if (cleaned[key] && (cleaned[key].constructor?.name === 'FieldValue' || cleaned[key]._methodName === 'serverTimestamp')) {
                                    cleaned[key] = Date.now();
                                }
                            }
                            return cleaned;
                        };

                        const batchPayload = isLargeBatch ? batchId : items.map((it) => ({ id: it.docId, action: it.op ?? 'set', data: sanitizePayload(it.docData) }));

                        const actorName = window.CURRENT_USER?.name || 'System';
                        const now = serverTimestamp();
                        const batchNotif = {
                            id: notifId,
                            type: 'data-change',
                            collection: collectionName,
                            action: 'b',
                            data: JSON.stringify({
                                coll: collectionName,
                                id: null,
                                action: 'b',
                                payload: batchPayload,
                            }),
                            payload: batchPayload,
                            created_at: now,
                            created_by: actorName,
                        };

                        setDoc(doc(this.#db, 'notifications', notifId), batchNotif, { merge: false }).catch((e) => L.log('⚠️ Không thể tạo batch notification:', e));
                    }

                    if (typeof this.#recordBatchBookingHistory === 'function') {
                        this.#recordBatchBookingHistory(collectionName, items, window.CURRENT_USER?.name || 'System');
                    }

                    opResult = { success: true, count: totalCommitted };
                    break;
                }

                case 'transaction': {
                    const txResultItems = await runTransaction(this.#db, async (transaction) => {
                        return await options.transactionFn(transaction, this.#db);
                    });

                    if (Array.isArray(txResultItems) && txResultItems.length > 0) {
                        await this.#gatekeepSyncToLocal(null, null, null, null, true, txResultItems);
                    }
                    opResult = { success: true, data: txResultItems };
                    break;
                }

                default:
                    return { success: false, error: `Action không hợp lệ: "${action}"` };
            }

            const noUpdateColls = ['notifications', 'counters_id', 'app_config'];
            if (!noUpdateColls.includes(collectionName) && action !== 'batch') {
                const actionCode = { set: 's', update: 'u', delete: 'd', increment: 'i' }[action] ?? action;
                const notifId = `${collectionName}_${id ?? 'x'}_${Date.now()}`;
                const now = serverTimestamp();

                const sanitizePayload = (data) => {
                    if (!data || typeof data !== 'object') return data;
                    const cleaned = { ...data };
                    for (const key in cleaned) {
                        if (cleaned[key] && (cleaned[key].constructor?.name === 'FieldValue' || cleaned[key]._methodName === 'serverTimestamp')) {
                            cleaned[key] = Date.now();
                        }
                    }
                    return cleaned;
                };

                const notifDoc = {
                    id: notifId,
                    type: 'data-change',
                    collection: collectionName,
                    action: actionCode,
                    data: JSON.stringify({ coll: collectionName, id, action: actionCode, payload: sanitizePayload(data) }),
                    payload: sanitizePayload(data),
                    created_at: now,
                    created_by: actor,
                };

                if (originalData) notifDoc.original_data = originalData;

                setDoc(doc(this.#db, 'notifications', notifId), notifDoc, { merge: false }).catch((e) => L.log('⚠️ Không thể tạo notification:', e));
            }

            if (DBManager.#HISTORY_COLLS.has(collectionName) && action !== 'arrayUnion') {
                const skipHistory = collectionName === 'transactions' && !originalData?.booking_id && !data?.booking_id;
                if (!skipHistory) this.#recordBookingHistory(collectionName, action, id, data, actor, originalData);
            }

            return opResult;
        } catch (e) {
            console.error(`[CRUD ERROR] ${action.toUpperCase()} ${collectionName}/${id ?? '*'}:`, e);
            return { success: false, error: e.message };
        }
    }

    #addToQueue(item) {
        this.#writeQueue.push(item);

        if (this.#flushTimer) clearTimeout(this.#flushTimer);

        if (this.#writeQueue.length >= this.#maxBatchSize) {
            this.#flushQueue();
        } else {
            this.#flushTimer = setTimeout(() => this.#flushQueue(), this.#flushDelay);
        }
    }

    /**
     * Xử lý toàn bộ hàng đợi bằng writeBatch.
     */
    async #flushQueue() {
        if (this.#isFlushing || this.#writeQueue.length === 0) return;

        this.#isFlushing = true;
        const currentQueue = [...this.#writeQueue];
        this.#writeQueue = [];

        L._(`🚀 [Queue] Flushing ${currentQueue.length} operations...`);

        try {
            const collGroups = {};
            currentQueue.forEach((item) => {
                if (!collGroups[item.collectionName]) collGroups[item.collectionName] = [];
                collGroups[item.collectionName].push(item);
            });

            for (const [collName, items] of Object.entries(collGroups)) {
                const batchItems = items.map((item) => ({
                    docId: item.id,
                    docData: item.data,
                    op: item.action === 'increment' || item.action === 'arrayUnion' ? 'update' : item.action,
                }));

                const res = await this.#firestoreCRUD(collName, 'batch', null, null, { items: batchItems });

                items.forEach((item) => {
                    if (res.success) item.resolve(res);
                    else item.reject(new Error(res.error));
                });
            }
        } catch (error) {
            L.log('❌ [Queue] Flush failed:', error);
            currentQueue.forEach((item) => item.reject(error));
        } finally {
            this.#isFlushing = false;
            if (this.#writeQueue.length > 0) {
                this.#flushQueue();
            }
        }
    }

    /**
     * Helper thực hiện lại một tác vụ với cơ chế Exponential Backoff.
     */
    async #withRetry(taskFn, maxRetries = 3) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                return await taskFn();
            } catch (error) {
                attempt++;
                if (attempt >= maxRetries) throw error;
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                L._(`⚠️ [Retry] Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Kiểm tra xem có nên ghi history hay không.
     * @param {string} collectionName
     * @param {string} action
     * @param {object|null} data
     * @param {object|null} originalData
     * @returns {boolean}
     */
    #shouldRecordHistory(collectionName, action, data, originalData) {
        const isNew = (action === 'set' || action === 'add') && !originalData;
        if (isNew || action === 'delete') return true;

        if (action === 'update' || action === 'set' || action === 'increment') {
            if (collectionName === 'bookings' && originalData && data) {
                const hasTotalChanged = Object.prototype.hasOwnProperty.call(data, 'total_amount') && String(data.total_amount) !== String(originalData.total_amount);
                const hasDepositChanged = Object.prototype.hasOwnProperty.call(data, 'deposit_amount') && String(data.deposit_amount) !== String(originalData.deposit_amount);
                return hasTotalChanged || hasDepositChanged;
            }
        }

        return false;
    }

    /**
     * Xác định booking_id từ collection / data / APP_DATA.
     * @param {string} collectionName
     * @param {string|null} id
     * @param {object|null} data
     * @param {object|null} originalData - Dữ liệu trước khi thay đổi (cho delete)
     * @returns {string|null}
     */
    #resolveBookingId(collectionName, id, data, originalData) {
        if (collectionName === 'bookings') return id;
        return data?.booking_id ?? originalData?.booking_id ?? APP_DATA?.[collectionName]?.[id]?.booking_id ?? null;
    }

    /**
     * Tạo mô tả hành động cho history entry.
     * @param {string} collectionName
     * @param {string} action - 'set'|'update'|'delete'|'increment'|'batch'
     * @param {string|null} id
     * @param {object|null} data
     * @param {object|null} originalData
     * @returns {string}
     */
    #buildHistoryDetail(collectionName, action, id, data, originalData) {
        const isNew = (action === 'set' || action === 'add') && !originalData;
        const actionLabel = action === 'delete' ? 'XÓA' : isNew ? 'TẠO MỚI' : 'CẬP NHẬT';

        if (actionLabel === 'CẬP NHẬT' && originalData && data) {
            const changedFields = [];
            const fieldsToWatch = ['total_amount', 'deposit_amount'];

            fieldsToWatch.forEach((f) => {
                const oldVal = originalData[f] !== undefined && originalData[f] !== null ? String(originalData[f]) : '';
                const newVal = data[f] !== undefined && data[f] !== null ? String(data[f]) : '';

                if (Object.prototype.hasOwnProperty.call(data, f) && oldVal !== newVal) {
                    const fmtOld = oldVal || '(trống)';
                    const fmtNew = newVal || '(trống)';
                    changedFields.push(`cột ${A.Lang?.t(f) || f} thay đổi từ ${fmtOld} thành ${fmtNew}`);
                }
            });

            if (changedFields.length > 0) {
                return `Nội dung: ${A.Lang?.t(collectionName) || collectionName} ${id} ${changedFields.join(', ')}.`;
            }
        }

        const collLabel = { bookings: 'Booking', booking_details: 'Dịch Vụ', transactions: 'Thanh Toán' }[collectionName] ?? collectionName;
        return `${collLabel} ${id || ''}`;
    }
    /**
     * Ghi 1 entry vào bookings/{bookingId}.history (arrayUnion — fire-and-forget).
     * Format: "[ACTION] bởi [username] lúc [HH:mm:ss DD/MM/YYYY]"
     *
     * @param {string} collectionName - Tên collection vừa thay đổi
     * @param {string} action     - 'set'|'update'|'delete'|'increment'|'batch'
     * @param {string|null} id    - Document ID
     * @param {object|null} data  - Dữ liệu mới
     * @param {string} actor      - Người thực hiện (CURRENT_USER.name)
     * @param {object|null} [originalData=null] - Dữ liệu trước khi thay đổi
     */
    #recordBookingHistory(collectionName, action, id, data, actor, originalData = null) {
        try {
            if (action === 'get' || action === 'batch') return;

            if (!this.#shouldRecordHistory(collectionName, action, data, originalData)) return;

            const bookingId = this.#resolveBookingId(collectionName, id, data, originalData);
            if (!bookingId) return;

            const detail = this.#buildHistoryDetail(collectionName, action, id, data, originalData);
            const entry = this.#formatHistoryEntry(collectionName, action, detail, actor, originalData);

            this.#appendBookingHistory(bookingId, entry);
        } catch (error) {
            L.log('❌ [#recordBookingHistory] Lỗi:', error);
        }
    }

    /**
     * Ghi history cho batch operations.
     * @param {string} collectionName
     * @param {Array} items - [{docId, docData, op}]
     * @param {string} actor
     */
    #recordBatchBookingHistory(collectionName, items, actor) {
        try {
            if (!DBManager.#HISTORY_COLLS.has(collectionName)) return;
            if (!items || items.length === 0) return;

            const grouped = new Map();
            for (const item of items) {
                const originalData = APP_DATA?.[collectionName]?.[item.docId] ?? null;
                const action = item.op ?? 'set';

                if (!this.#shouldRecordHistory(collectionName, action, item.docData, originalData)) continue;

                const bkId = this.#resolveBookingId(collectionName, item.docId, item.docData, originalData);
                if (!bkId) continue;

                const detail = this.#buildHistoryDetail(collectionName, action, item.docId, item.docData, originalData);
                const entry = this.#formatHistoryEntry(collectionName, action, detail, actor, originalData);

                if (!grouped.has(bkId)) grouped.set(bkId, []);
                grouped.get(bkId).push(entry);
            }

            for (const [bkId, entries] of grouped) {
                entries.forEach((entry) => this.#appendBookingHistory(bkId, entry));
            }
        } catch (error) {
            L.log('❌ [#recordBatchBookingHistory] Lỗi:', error);
        }
    }

    /**
     * Format history entry string.
     * @param {string} collectionName
     * @param {string} action
     * @param {string} detail
     * @param {string} actor
     * @param {object|null} originalData
     * @returns {string}
     */
    #formatHistoryEntry(collectionName, action, detail, actor, originalData) {
        const isNew = (action === 'set' || action === 'add') && !originalData;
        const actionLabel = action === 'delete' ? 'XÓA' : isNew ? 'TẠO MỚI' : 'CẬP NHẬT';

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

        const header = `[${actionLabel}] bởi ${actor} lúc ${ts}`;

        if (actionLabel === 'CẬP NHẬT') {
            return `${header}\n${detail}`;
        }
        return `${header} ${detail}`;
    }

    /**
     * Append 1 entry vào bookings/{bookingId}.history bằng arrayUnion.
     * @param {string} bookingId
     * @param {string} entry - Chuỗi history đã format
     */
    #appendBookingHistory(bookingId, entry) {
        if (!this.#db || !bookingId || !entry) return;

        const finalEntry = String(entry);

        this.#firestoreCRUD('bookings', 'arrayUnion', bookingId, finalEntry, {
            fieldName: 'history',
        }).catch((e) => L.log(`⚠️ Ghi booking history thất bại [${bookingId}]:`, e));
    }

    /**
     * Public API: Ghi history entry vào booking.
     * Dùng cho các module ngoài DBManager (vd: controller_accountant.js) muốn ghi history
     * khi thao tác CRUD bypass DBManager.
     *
     * @param {string} bookingId - ID booking cần ghi history
     * @param {string} detail    - Mô tả hành động (không cần format thời gian/staff)
     */
    recordHistory(bookingId, detail) {
        if (!bookingId || !detail) return;
        const actor = window.CURRENT_USER?.name ?? 'system';
        const entry = this.#formatHistoryEntry(detail, bookingId, actor);
        this.#appendBookingHistory(bookingId, entry);
    }

    getCollection = async (collectionName, docId) => {
        let snap;
        if (docId) {
            snap = await this.#firestoreCRUD(collectionName, 'get', docId);
            return snap.success ? snap.data : null;
        }
        snap = await this.#firestoreCRUD(collectionName, 'get');
        return snap.success ? snap.data : [];
    };
    /**
     *
     * @param {*} listName
     * @param {*} opts
     * @returns array/object with key base on opts. Priority local Data
     */
    getList = async (listName, opts = { array: false }) => {
        const { query, collection, limit = 500, orderBy = 'created_at', field = 'id' } = opts;
        const list = APP_DATA.lists?.[listName];
        if (list) return list;
        L.log(`⚠️ Không có danh sách ${listName} trong APP_DATA.lists`);
        if (collection && typeof collection === 'string') {
            const snap = await getDocs(collection(this.#db, collection), orderBy(orderBy, 'desc'), limit(limit));
            let data;
            snap.docs.map((d) => {
                if (d.name && !opts.array) data.id = data.name;
                else if (opts.array) data.push(d.name);
            });
            const cachedAppCFgObj = await this.#localDB.get('app_config', 'lists');
            if (cachedAppCFgObj) {
                cachedAppCFgObj[listName] = data;
                this.#localDB.put('app_config', { current: cachedAppCFgObj });
            }
            return data;
        }
    };

    saveRecord = async (collectionName, dataArray, isBatch = false, batchRef = null) => {
        let isNew = false;

        const dataObj = this.#ensureObject(dataArray, collectionName);

        let docId = collectionName === 'users' ? dataObj.uid : dataObj.id;

        const idStr = String(docId || '')
            .trim()
            .toLowerCase();
        const isPlaceholderId = !idStr || idStr === 'id dv' || idStr === 'auto-generated' || idStr === 'undefined' || idStr === 'null';

        if (!isBatch && isPlaceholderId) {
            let bookingId = dataObj.booking_id || null;

            const idResult = await this.generateIds(collectionName, bookingId);
            if (!idResult) return { success: false, message: 'Lỗi: Không thể sinh ID mới' };

            docId = idResult.newId;

            if (collectionName === 'users') {
                dataObj.uid = docId;
            } else {
                dataObj.id = docId;
            }

            if (Array.isArray(dataArray)) dataArray[0] = docId;
            isNew = true;
        }

        if (!docId) {
            console.error('❌ Lỗi: Dữ liệu bị thiếu ID sau khi cấp phát', dataObj);
            return { success: false, message: 'Missing ID' };
        }

        dataObj.updated_at = serverTimestamp();
        Object.keys(dataObj).forEach((key) => dataObj[key] === undefined && delete dataObj[key]);

        if (isBatch && batchRef) {
            return this.#firestoreCRUD(collectionName, 'set', docId, dataObj, { batchRef, merge: true });
        }

        try {
            const writeResult = await this.#firestoreCRUD(collectionName, 'set', docId, dataObj, { useQueue: true });

            this._updateAppDataObj(collectionName, dataObj);

            if (collectionName === 'booking_details') {
                await this._syncOperatorEntry(dataObj);
                if (!isNew) {
                    window.NotificationManager.sendToOperator(`Booking Detail ${dataObj.id} cập nhật!`, `Khách: ${dataObj.customer_full_name || 'Unknown'} cập nhật DV ${dataObj.service_name || 'Unknown'}`);
                }
            }
            return { success: true, id: docId, data: dataObj };
        } catch (e) {
            console.error('Save Error:', e);
            if (this.batchCounterUpdates && this.batchCounterUpdates[collectionName]) {
                await this._updateCounter(collectionName, this.batchCounterUpdates[collectionName] - 1);
                delete this.batchCounterUpdates[collectionName];
            }
            return { success: false, error: e.message };
        }
    };

    batchSave = async (collectionName, dataArrayList) => {
        if (!dataArrayList || dataArrayList.length === 0) return;

        const objectList = dataArrayList.map((item) => this.#ensureObject(item, collectionName));

        let customerName = '';
        const firstItem = objectList[0];
        const bkId = firstItem.booking_id;
        if (bkId) {
            const bkRef = doc(this.#db, 'bookings', String(bkId));
            const bkSnap = await getDoc(bkRef);
            if (bkSnap.exists()) customerName = bkSnap.data().customer_full_name || 'null';
            else L._('Booking not found ' + bkId);
        }

        this.batchCounterUpdates = {};
        const itemsNeedingId = objectList.filter((obj) => {
            const id = String(obj.id || '').trim();
            return id === '' || id === 'ID DV' || id === 'Auto-generated' || id === 'undefined' || id === 'null';
        });

        if (itemsNeedingId.length > 0) {
            if (collectionName === 'booking_details') {
                const groups = new Map();
                for (const obj of itemsNeedingId) {
                    const gBkId = obj.booking_id;
                    if (!groups.has(gBkId)) groups.set(gBkId, []);
                    groups.get(gBkId).push(obj);
                }
                for (const [groupBkId, groupItems] of groups) {
                    const ids = await this.generateIdsBatch(collectionName, groupItems.length, groupBkId);
                    groupItems.forEach((obj, i) => {
                        obj.id = ids[i];
                    });
                }
            } else {
                const ids = await this.generateIdsBatch(collectionName, itemsNeedingId.length);
                itemsNeedingId.forEach((obj, i) => {
                    obj.id = ids[i];
                });
            }
            dataArrayList.forEach((original, i) => {
                if (Array.isArray(original)) original[0] = objectList[i].id;
                else if (original && typeof original === 'object') original.id = objectList[i].id;
            });
            L._(`🆔 Pre-generated ${itemsNeedingId.length} IDs for ${collectionName}`);
        }

        const batchSize = 450;
        const chunks = [];
        for (let i = 0; i < objectList.length; i += batchSize) chunks.push(objectList.slice(i, i + batchSize));

        let totalSuccess = 0;
        const detailsForTrigger = [];

        for (const chunk of chunks) {
            const batchItems = chunk.map((obj) => {
                if (collectionName === 'booking_details') detailsForTrigger.push(obj);
                obj.updated_at = serverTimestamp();
                return { docId: obj.id, docData: obj, op: 'set' };
            });

            try {
                const res = await this.#firestoreCRUD(collectionName, 'batch', null, null, { items: batchItems });
                if (res.success) {
                    totalSuccess += res.count;
                    L._(`📦 Saved chunk: ${res.count} items to ${collectionName}`);
                }
            } catch (e) {
                console.error(`❌ Batch Error in ${collectionName}:`, e);
            }
        }
        this.batchCounterUpdates = {};

        if (collectionName === 'booking_details' && detailsForTrigger.length > 0) {
            const bookingIds = [...new Set(detailsForTrigger.map((d) => d.booking_id))];
            await this.syncOperatorEntriesByBookingId(bookingIds);
        }

        if (DBManager.#HISTORY_COLLS.has(collectionName) && totalSuccess > 0) {
            const actor = window.CURRENT_USER?.name ?? 'system';
            const historyItems = objectList.map((obj) => ({
                docId: obj.id,
                docData: obj,
                op: 'set',
            }));
            this.#recordBatchBookingHistory(collectionName, historyItems, actor);
        }

        return { success: true, count: totalSuccess, data: dataArrayList };
    };

    deleteRecord = async (collectionName, id) => {
        if (collectionName === 'bookings') {
            return this.handleDeleteBooking(id);
        }
        if (!id) return;
        try {
            const res = await this.#firestoreCRUD(collectionName, 'delete', id, null, { useQueue: true });

            if (collectionName === 'booking_details') {
                await this.#firestoreCRUD('operator_entries', 'delete', id, null, { useQueue: true });
            }
            return { success: true, message: 'Deleted' };
        } catch (e) {
            L.log('❌ Delete Error:', e);
            return { success: false, error: e.message };
        }
    };

    batchDelete = async (collectionName, idList) => {
        try {
            const items = idList.map((id) => ({ docId: id, op: 'delete' }));
            const res = await this.#firestoreCRUD(collectionName, 'batch', null, null, { items });
            if (!res.success) throw new Error(res.error);

            if (collectionName === 'booking_details') {
                await this.#firestoreCRUD('operator_entries', 'batch', null, null, { items });
            }

            return { success: true };
        } catch (e) {
            console.error('❌ Batch Delete Error:', e);
            return { success: false, error: e.message };
        }
    };

    incrementField = async (collectionName, docId, fieldName, incrementBy) => {
        if (!this.#db) {
            console.error('❌ DB chưa init');
            return false;
        }
        try {
            const res = await this.#firestoreCRUD(collectionName, 'increment', docId, null, {
                fieldName,
                incrementBy,
                useQueue: true,
            });
            return res.success;
        } catch (e) {
            console.error(`❌ Error incrementing field for ${collectionName}/${docId}:`, e);
            return false;
        }
    };
    arrayUnionField = async (collectionName, docId, fieldName, array) => {
        if (!collectionName || !docId || !fieldName || !array) {
            L.log('⚠️ arrayUnionField: Thiếu tham số');
            return { success: false, message: 'Missing required parameters' };
        }
        try {
            const res = await this.#firestoreCRUD(collectionName, 'arrayUnion', docId, array, {
                fieldName: fieldName,
                useQueue: true,
            });
            return res.success;
        } catch (e) {
            console.error(`❌ Error arrayUnionField for ${collectionName}/${docId}:`, e);
            return false;
        }
    };

    updateSingle = async (collectionName, id, objData) => {
        if (!collectionName || !objData) {
            L.log('⚠️ updateDocument: Thiếu tham số');
            return { success: false, message: 'Missing required parameters' };
        }
        if (!objData.id || objData.id === '') {
            if (id) objData.id = id;
            else {
                console.error("❌ updateDocument: objData không có field 'id'");
                return { success: false, message: "objData must have 'id' field" };
            }
        }
        if (collectionName === 'booking_details' && !objData.booking_id) {
            objData.booking_id = objData.id.split('_')[0] || getVal('BK_ID');
        }

        try {
            objData.updated_at = serverTimestamp();
            const res = await this.#firestoreCRUD(collectionName, 'update', id, objData, { useQueue: true });
            return { success: true, message: 'Updated successfully' };
        } catch (e) {
            console.error('❌ updateDocument Error:', e);
            return { success: false, message: e.message };
        }
    };

    batchUpdateFieldData = async (collectionName, fieldName, oldValue, newValue, ids = null, forceNew = false) => {
        console.time('⏱ Thời gian cập nhật');
        L._(`🚀 Bắt đầu cập nhật ${collectionName}.${fieldName}: "${oldValue}" → "${newValue}"`);

        try {
            if (!collectionName || !fieldName) throw new Error('❌ Lỗi: collectionName và fieldName không được để trống');

            if (!this.#db) throw new Error('❌ Firestore DB chưa khởi tạo');

            const collSnap = await getDocs(collection(this.#db, collectionName));
            L._(`📦 Tìm thấy ${collSnap.size} documents.`);

            const batchItems = [];
            let totalUpdated = 0;
            let totalSkipped = 0;
            const idsSet = ids && Array.isArray(ids) ? new Set(ids.map((id) => String(id))) : null;

            for (const d of collSnap.docs) {
                const data = d.data();

                if (idsSet && !idsSet.has(String(d.id))) {
                    totalSkipped++;
                    continue;
                }

                const isMatch = String(data[fieldName]).trim() === String(oldValue).trim();

                if (isMatch || forceNew) {
                    const updateObj = {
                        [fieldName]: newValue,
                        updated_at: serverTimestamp(),
                    };
                    batchItems.push({ docId: d.id, docData: updateObj, op: 'update' });
                    totalUpdated++;
                    L._(`✅ [${totalUpdated}] ${d.id}: ${fieldName} = "${newValue}"`);
                } else {
                    if (!idsSet) totalSkipped++;
                }
            }

            if (batchItems.length > 0) {
                const batchRes = await this.#firestoreCRUD(collectionName, 'batch', null, null, {
                    items: batchItems,
                });
                if (!batchRes.success) throw new Error(batchRes.error);
            }

            const result = {
                success: true,
                count: totalUpdated,
                skipped: totalSkipped,
                message: idsSet ? `✅ Hoàn tất! Cập nhật ${totalUpdated}/${ids.length} documents trong danh sách` : `✅ Hoàn tất! Cập nhật ${totalUpdated} documents, bỏ qua ${totalSkipped}`,
            };
            L._(`🎉 ${result.message}`);
            return result;
        } catch (error) {
            console.error(`❌ Lỗi: ${error.message}`);
            return { success: false, count: 0, message: `❌ Lỗi: ${error.message}` };
        } finally {
            console.timeEnd('⏱ Thời gian cập nhật');
        }
    };

    runTransaction = async (collectionName, transactionFunction) => {
        if (!this.#db) {
            console.error('❌ DB chưa init');
            return null;
        }
        L._(`🔍 Run Transaction on ${collectionName}`);
        try {
            const result = await this.#firestoreCRUD(collectionName, 'transaction', null, null, { transactionFn: transactionFunction });
            if (result.success) L._(`🔍 Run Transaction on ${collectionName}: Thành công!`);
            else L._(`🔍 Run Transaction on ${collectionName}: Lỗi: ${result.message}`);
            return result;
        } catch (error) {
            console.error(`❌ Lỗi: ${error.message}`);
            return { success: false, count: 0, message: `❌ Lỗi: ${error.message}` };
        } finally {
            showLoading(false);
        }
        return null;
    };

    runQuery = async (collectionName, fieldName, operator, value, fieldOrder = null, lim = null) => {
        if (!this.#db) {
            console.error('❌ DB chưa init');
            return null;
        }
        L._(`🔍 Query on ${collectionName}: ${fieldName} ${operator} ${value}`);
        try {
            let q = query(collection(this.#db, collectionName), where(fieldName, operator, value));
            if (fieldOrder) q = query(q, orderBy(fieldOrder, 'desc'));
            if (lim && lim > 0) q = query(q, limit(lim));

            const querySnap = await getDocs(q);
            const results = [];
            querySnap.forEach((d) => results.push(d.data()));
            L._(`✅ Query returned ${results.length} items from ${collectionName}`);
            return results;
        } catch (e) {
            console.error(`❌ Error running query on ${collectionName}:`, e);
            return null;
        }
    };

    /**
     * Sinh N IDs liên tiếp cho 1 collection — chỉ đọc counter 1 lần và ghi 1 lần.
     *
     * @param {string} collectionName
     * @param {number} count
     * @param {string|null} bookingId
     * @returns {Promise<string[]>}
     */
    generateIdsBatch = async (collectionName, count, bookingId = null) => {
        if (!this.#db || count <= 0) return [];

        const counterRef = doc(this.#db, 'counters_id', collectionName);

        try {
            const counterSnap = await getDoc(counterRef);
            let lastNo = 0;
            let prefix = '';
            let useRandomId = false;

            if (counterSnap.exists()) {
                if (collectionName === 'booking_details') prefix = bookingId ? `${bookingId}_` : '';
                else prefix = counterSnap.data().prefix || '';
                lastNo = Number(counterSnap.data().last_no) || 0;
            } else {
                if (collectionName === 'booking_details') prefix = bookingId ? `${bookingId}_` : '';
                try {
                    const q = query(collection(this.#db, collectionName), orderBy('id', 'desc'), limit(1));
                    const latestSnap = await getDocs(q);
                    if (!latestSnap.empty) {
                        const latestDoc = latestSnap.docs[0].data() || {};
                        const latestId = String(latestDoc.id || latestSnap.docs[0].id || '').trim();
                        if (/^\d+$/.test(latestId)) {
                            lastNo = parseInt(latestId, 10);
                            prefix = '';
                        } else if (latestId.includes('-')) {
                            const parts = latestId.split('-').filter(Boolean);
                            const lastPart = parts[parts.length - 1] || '';
                            if (/^\d+$/.test(lastPart)) {
                                lastNo = parseInt(lastPart, 10);
                                prefix = parts.slice(0, -1).join('-');
                                prefix = prefix ? `${prefix}-` : '';
                            } else if (!/\d/.test(latestId)) {
                                useRandomId = true;
                            }
                        } else if (!/\d/.test(latestId)) {
                            useRandomId = true;
                        }
                    } else {
                        useRandomId = true;
                    }
                } catch (e) {
                    L.log(`⚠️ generateIdsBatch: cannot derive lastNo for ${collectionName}:`, e);
                    useRandomId = true;
                }
            }

            const ids = [];
            for (let i = 0; i < count; i++) {
                if (useRandomId) {
                    ids.push(`${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`.trim());
                } else {
                    lastNo++;
                    ids.push(`${prefix}${lastNo}`.trim());
                }
            }

            if (!useRandomId) {
                await this._updateCounter(collectionName, lastNo);
            }

            L._(`🆔 [Batch] ${count} IDs for ${collectionName}: ${ids[0]} → ${ids[ids.length - 1]}`);
            return ids;
        } catch (e) {
            console.error(`❌ Error in generateIdsBatch for ${collectionName}:`, e);
            return [];
        }
    };

    generateIds = async (collectionName, bookingId = null) => {
        if (!this.#db) {
            console.error(`❌ DB chưa init khi tạo ID cho ${collectionName}`);
            return null;
        }

        const counterRef = doc(this.#db, 'counters_id', collectionName);

        try {
            const counterSnap = await getDoc(counterRef);
            let lastNo = 0;
            let prefix = '';
            let useRandomId = false;

            if (counterSnap.exists()) {
                const data = counterSnap.data();
                if (collectionName === 'booking_details') {
                    prefix = bookingId ? `${bookingId}_` : '';
                } else {
                    prefix = data.prefix || '';
                }

                lastNo = Number(data.last_no) || 0;

                if (lastNo > 0) {
                    await this._updateCounter(collectionName, lastNo + 1);
                }
            }
            } else {
                if (collectionName === 'booking_details') prefix = bookingId ? `${bookingId}_` : '';
                try {
                    const q = query(collection(this.#db, collectionName), orderBy('id', 'desc'), limit(1));
                    const latestSnap = await getDocs(q);

                    if (!latestSnap.empty) {
                        const latestId = String(latestSnap.docs[0].id || '').trim();

                        const match = latestId.match(/(\d+)$/);

                        if (match) {
                            lastNo = parseInt(match[1], 10);
                            prefix = latestId.substring(0, match.index);
                        } else {
                            useRandomId = true;
                        }
                    } else {
                        useRandomId = true;
                    }
                } catch (e) {
                    L.log(`⚠️ Cảnh báo: Không thể suy luận lastNo cho ${collectionName}:`, e.message);
                    useRandomId = true;
                }
            }

            const newNo = lastNo + 1;
            let newId = '';

            if (useRandomId) {
                newId = `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`.trim();
                L._(`🆔 TẠO RANDOM ID cho ${collectionName}: ${newId}`);
            } else {
                newId = `${prefix}${newNo}`.trim();
                L._(`🆔 TẠO TỰ ĐỘNG ID cho ${collectionName}: ${newId} (Từ số: ${lastNo} -> ${newNo})`);
            }

            return { newId, newNo };
        } catch (e) {
            console.error(`❌ Lỗi nghiêm trọng khi tạo ID cho ${collectionName}:`, e);
            return null;
        }
    };

    /**
     * Generate transaction IDs (PT/PC prefix) using Firestore runTransaction
     * @param {'IN'|'OUT'} type - 'IN' → PT prefix, 'OUT' → PC prefix
     * @param {number} count - Number of IDs to generate
     * @returns {Promise<string[]>} - e.g. ['PT-1', 'PT-2'] or ['PC-1']
     */
    generateTransIds = async (type, count) => {
        if (!this.#db || count <= 0) return [];

        const { runTransaction, doc } = await import('firebase/firestore');
        const counterRef = doc(this.#db, 'counters_id', 'transactions');
        const prefix = type === 'IN' ? 'PT' : 'PC';
        const field = type === 'IN' ? 'last_pt' : 'last_pc';

        try {
            const ids = await runTransaction(this.#db, async (transaction) => {
                const counterSnap = await transaction.get(counterRef);
                let lastNo = 0;

                if (counterSnap.exists()) {
                    const data = counterSnap.data();
                    lastNo = Number(data[field]) || 0;
                }

                const newLastNo = lastNo + count;
                const newIds = [];
                for (let i = lastNo + 1; i <= newLastNo; i++) {
                    newIds.push(`${prefix}-${i}`);
                }

                if (!counterSnap.exists()) {
                    transaction.set(counterRef, {
                        [field]: newLastNo,
                        last_pt: type === 'IN' ? newLastNo : 0,
                        last_pc: type === 'OUT' ? newLastNo : 0,
                    });
                } else {
                    transaction.update(counterRef, { [field]: newLastNo });
                }

                return newIds;
            });

            L._(`🆔 [TransIds] ${count} ${type} IDs: ${ids[0]} → ${ids[ids.length - 1]}`);
            return ids;
        } catch (e) {
            console.error(`❌ Error generating ${type} transaction IDs:`, e);
            return [];
        }
    };

    async _updateCounter(collectionName, newNo) {
        try {
            const res = await this.#firestoreCRUD('counters_id', 'set', collectionName, {
                last_no: newNo,
            });
            if (!res.success) throw new Error(res.error);
            if (!this.batchCounterUpdates[collectionName] || this.batchCounterUpdates[collectionName] <= newNo) this.batchCounterUpdates[collectionName] = newNo;
        } catch (e) {
            console.error(`❌ Error updating counter for ${collectionName}:`, e);
        }
    }

    _updateAppDataObj(collectionName, dataObj) {
        if (!APP_DATA || !dataObj?.id) return;

        if (!APP_DATA[collectionName]) {
            APP_DATA[collectionName] = {};
        }

        const current = APP_DATA[collectionName][dataObj.id] || {};
        const merged = { ...current, ...dataObj };
        APP_DATA[collectionName][dataObj.id] = merged;
    }

    _removeFromAppDataObj(collectionName, id) {
        if (!APP_DATA?.[collectionName]?.[id]) return;

        delete APP_DATA[collectionName][id];
    }

    /**
     * Dừng listeners và reset trạng thái.
     */
    resetOptions = () => {
        this.stopNotificationsListener();
        L._('🔄 DB options đã reset');
    };

    async handleDeleteBooking(bookingId) {
        const confirm = await Swal.fire({
            title: 'Bạn có chắc chắn muốn xóa?',
            text: 'Hành động này không thể hoàn tác!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Đồng ý xóa',
        });

        if (!confirm.isConfirmed) return;

        try {
            Swal.showLoading();

            const functions = getFunctions(getApp(), 'asia-southeast1');
            const deleteBookingCall = httpsCallable(functions, 'deleteBooking');

            const result = await deleteBookingCall({ bookingId: bookingId });

            Swal.fire('Thành công!', result.data.message, 'success');

            this.#gatekeepSyncToLocal('bookings', bookingId, 'd');
            if (APP_DATA?.booking_details) {
                Object.values(APP_DATA.booking_details)
                    .filter((detail) => detail.booking_id === bookingId)
                    .forEach((detail) => this.#gatekeepSyncToLocal('booking_details', detail.id, 'd'));
                Object.values(APP_DATA.operator_entries)
                    .filter((detail) => detail.booking_id === bookingId)
                    .forEach((detail) => this.#gatekeepSyncToLocal('operator_entries', detail.id, 'd'));
                Object.values(APP_DATA.transactions)
                    .filter((detail) => detail.booking_id === bookingId)
                    .forEach((detail) => this.#gatekeepSyncToLocal('transactions', detail.id, 'd'));
            }
        } catch (error) {
            console.error('Lỗi xóa Booking:', error);

            Swal.fire({
                icon: 'error',
                title: 'Từ chối thao tác',
                text: error.message || 'Có lỗi xảy ra khi kết nối máy chủ.',
            });
        }
    }

    roleCollections(role) {
        return DBManager.#ROLE_COLL_MAP[role] ? DBManager.#ROLE_COLL_MAP[role] : ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions'];
    }
}

// Singleton Export
const DB_MANAGER = new DBManager();

export default DB_MANAGER;
