/**
 * @module DBLocalStorage
 * @description Quản lý lõi lưu trữ IndexedDB — cache offline cho APP_DATA.
 *
 * Thay thế hoàn toàn localStorage (vốn bị tràn do APP_DATA quá lớn).
 * • initDB()            — khởi tạo / nâng cấp schema, deduplicate concurrent calls.
 * • get/put/delete/getAll — CRUD cơ bản.
 * • putBatch()          — ghi nhiều docs trong 1 transaction (nhanh hơn put() nhiều lần).
 * • getAllAsObject()     — trả về { [id]: doc } thay vì array.
 * • clear()             — xóa sạch 1 store.
 * • getMeta(key)        — đọc metadata (LAST_SYNC_*, LAST_SYNC_ROLE…) từ IndexedDB, ĐỒNG BỘ.
 * • setMeta(key,value)  — ghi metadata vào IndexedDB (in-memory + async flush).
 * • isSynced()          — kiểm tra TTL dùng getMeta() thay vì localStorage.
 * • markSynced()        — ghi LAST_SYNC_${coll} qua setMeta().
 * • getStalecollections() — trả về các collection đã vượt TTL.
 * • autoSync()          — nhận fetcherFn callback từ ngoài → không còn phụ thuộc A.DB.
 *
 * Store nội bộ `_sync_meta`: lưu mọi metadata sync (LAST_SYNC_*, LAST_SYNC_ROLE, LAST_SYNC_DELTA…).
 * Tách biệt hoàn toàn với localStorage — không bị mất khi localStorage bị clear.
 *
 * @version 5.0.0
 */

class IndexedDBHelper {
  // ─── Private state ────────────────────────────────────────────────
  #collections = {}; // FIX: khai báo private field (trước đây thiếu → SyntaxError)
  #initPromise = null; // deduplicate concurrent initDB() calls
  #syncMeta = {}; // In-memory cache của store _sync_meta, load 1 lần lúc initDB

  constructor(dbName = '9TripERP_LocalDB') {
    this.dbName = dbName;
    this.db = null;

    // Cấu hình TTL (Time-To-Live) theo phút cho từng nhóm dữ liệu.
    // Dùng cho isSynced() / getStalecollections() trong flow loadAllData.
    this.ttlConfig = {
      // ── Cold Data: ít thay đổi ────────────────────────────────────
      app_config: 4320, // 72h
      users: 1440, // 24h
      hotels: 4320, // 72h
      suppliers: 4320, // 72h
      fund_accounts: 4320, // 72h
      hotel_price_schedules: 1440, // 24h
      service_price_schedules: 1440, // 24h

      // ── Warm/Hot Data: cần cập nhật thường xuyên ──────────────────
      bookings: 60, // 60 phút
      booking_details: 60, // 60 phút
      operator_entries: 60, // 60 phút
      transactions: 120, // 2 tiếng
      transactions_thenice: 120, // 2 tiếng
      customers: 120, // 2 tiếng
      notifications: 60, // 60 phút
    };
    this.defaultTTL = 360; // 6h cho bảng không khai báo
  }

  // ==========================================
  // MODULE: INIT
  // ==========================================

  /**
   * Khởi tạo và tự động nâng cấp IndexedDB dựa trên Schema của hệ thống.
   * Đảm bảo chỉ mở DB 1 lần dù gọi song song nhiều lần.
   *
   * @returns {Promise<boolean>}
   */
  async initDB() {
    // Deduplicate: nếu đang init thì chờ promise cũ
    if (this.#initPromise) return this.#initPromise;
    if (this.db) return true;

    this.#initPromise = this._doInitDB();
    try {
      const result = await this.#initPromise;
      return result;
    } finally {
      // Reset để cho phép retry nếu lỗi
      this.#initPromise = null;
    }
  }

  async _doInitDB() {
    // Lấy danh sách stores cần thiết từ Schema (nếu có)
    let requiredStores = [];
    try {
      if (typeof A !== 'undefined' && A.DB?.schema) {
        const collectionMap = A.DB.schema.getCollectionNames();
        this.#collections = collectionMap;
        requiredStores = Object.keys(collectionMap);
      }
    } catch (error) {
      console.warn('[ERP DB] Không lấy được schema, dùng danh sách mặc định.', error);
    }

    // Fallback store list nếu schema chưa sẵn sàng
    if (requiredStores.length === 0) {
      requiredStores = [
        'bookings',
        'booking_details',
        'operator_entries',
        'customers',
        'transactions',
        'transactions_thenice',
        'fund_accounts',
        'fund_accounts_thenice',
        'hotels',
        'suppliers',
        'hotel_price_schedules',
        'service_price_schedules',
        'users',
        'app_config',
        'notifications',
      ];
    }

    // _sync_meta luôn được thêm vào — store nội bộ cho mọi metadata sync
    if (!requiredStores.includes('_sync_meta')) requiredStores.push('_sync_meta');
    // notifications luôn được thêm vào — không có trong DB_SCHEMA nhưng được dùng bởi NotificationModule
    if (!requiredStores.includes('notifications')) requiredStores.push('notifications');

    return new Promise((resolve, reject) => {
      const checkRequest = indexedDB.open(this.dbName);

      checkRequest.onsuccess = (event) => {
        const db = event.target.result;
        const existingStores = Array.from(db.objectStoreNames);
        const needsUpgrade = requiredStores.some((s) => !existingStores.includes(s));

        if (!needsUpgrade) {
          this.db = db;
          // Tải _sync_meta vào bộ nhớ trước khi resolve
          this._loadSyncMeta()
            .then(() => resolve(true))
            .catch(() => resolve(true));
          return;
        }

        // Cần nâng cấp schema
        const newVersion = db.version + 1;
        db.close();
        console.info(`[ERP DB] Phát hiện Store mới — nâng cấp DB lên v${newVersion}...`);

        const upgradeReq = indexedDB.open(this.dbName, newVersion);

        upgradeReq.onupgradeneeded = (upgEvent) => {
          const upgradeDb = upgEvent.target.result;
          requiredStores.forEach((storeName) => {
            if (!upgradeDb.objectStoreNames.contains(storeName)) {
              upgradeDb.createObjectStore(storeName, { keyPath: 'id' });
              console.info(`[ERP DB] + Store tạo mới: ${storeName}`);
            }
          });
        };

        upgradeReq.onsuccess = (upgEvent) => {
          this.db = upgEvent.target.result;
          // Tải _sync_meta vào bộ nhớ trước khi resolve
          this._loadSyncMeta()
            .then(() => resolve(true))
            .catch(() => resolve(true));
        };
        upgradeReq.onerror = (e) => reject(e.target.error);
      };

      checkRequest.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Nạp toàn bộ records từ store `_sync_meta` vào `#syncMeta` in-memory.
   * Gọi nội bộ sau khi `this.db` đã được gán — không gọi từ ngoài.
   */
  async _loadSyncMeta() {
    this.#syncMeta = {};
    try {
      const docs = await this.getAll('_sync_meta');
      docs.forEach((doc) => {
        if (doc?.id) this.#syncMeta[doc.id] = doc.value;
      });
    } catch (e) {
      console.warn('[ERP DB] Không load được _sync_meta:', e);
    }
  }

  // ==========================================
  // MODULE: META KEY-VALUE (thay localStorage)
  // ==========================================

  /**
   * Đọc metadata theo key từ in-memory cache (load từ IndexedDB lúc init).
   * Hoạt động ĐỒNG BỘ — an toàn gọi ngay sau khi initDB() hoàn tất.
   *
   * @param {string} key
   * @returns {string|number|null}
   */
  getMeta(key) {
    return this.#syncMeta[key] ?? null;
  }

  /**
   * Ghi metadata theo key:
   *  1. Cập nhật in-memory cache ngay lập tức (đồng bộ)
   *  2. Flush sang IndexedDB store `_sync_meta` (bất đồng bộ, fire-and-forget)
   *
   * @param {string} key
   * @param {string|number} value
   */
  setMeta(key, value) {
    this.#syncMeta[key] = value;
    // Flush sang IDB — không await, không block caller
    this.put('_sync_meta', { id: key, value }).catch((e) =>
      console.warn(`[ERP DB] setMeta flush '${key}' lỗi:`, e)
    );
  }

  // ==========================================
  // MODULE: TTL / SYNC TRACKING
  // ==========================================

  /**
   * Kiểm tra collection đã được sync trong TTL hay chưa.
   * Dùng getMeta() thay vì localStorage — không bị mất khi clear localStorage.
   *
   * @param {string} collection
   * @returns {boolean} true = còn trong TTL (không cần sync)
   */
  isSynced(collection) {
    const raw = this.getMeta(`LAST_SYNC_${collection}`);
    if (!raw) return false;
    const ttlMs = (this.ttlConfig[collection] ?? this.defaultTTL) * 60 * 1000;
    return Date.now() - parseInt(raw, 10) < ttlMs;
  }

  /**
   * Đánh dấu collection đã sync tại thời điểm hiện tại.
   * Dùng setMeta() thay vì localStorage.
   *
   * @param {string} collection
   */
  markSynced(collection) {
    this.setMeta(`LAST_SYNC_${collection}`, Date.now().toString());
  }

  /**
   * Trả về danh sách collections đã vượt TTL (cần background sync).
   * @param {string[]} collections
   * @returns {string[]}
   */
  getStalecollections(collections) {
    return (collections ?? []).filter((c) => !this.isSynced(c));
  }

  // ==========================================
  // MODULE: BACKGROUND SYNC
  // ==========================================

  /**
   * Kiểm tra và đồng bộ dữ liệu mới từ Firestore về IndexedDB.
   *
   * FIX: Không còn import A.DB trực tiếp (circular dependency).
   * Thay bằng fetcherFn callback được DBManager truyền vào.
   *
   * @param {string[]} collectionNames   - Danh sách bảng cần kiểm tra
   * @param {Function} fetcherFn         - async (collection, sinceDateOrNull) => doc[]
   *                                       DBManager.#fetchCollectionDocs()
   * @param {string[]} [roleCollections] - Giới hạn theo role (nếu không truyền thì sync tất cả)
   */
  async autoSync(collectionNames, fetcherFn, roleCollections = null) {
    if (!collectionNames?.length || typeof fetcherFn !== 'function') return;
    if (!this.db) await this.initDB();

    // Chỉ sync collections thuộc role hiện tại
    const allowed = roleCollections ? new Set(roleCollections) : null;
    const toSync = collectionNames.filter((c) => {
      if (allowed && !allowed.has(c)) return false;
      return !this.isSynced(c); // Chỉ sync collection đã hết TTL
    });

    if (toSync.length === 0) {
      console.info('[ERP DB Sync] Tất cả collections đều trong TTL — bỏ qua.');
      return;
    }

    console.info(`[ERP DB Sync] Background sync: ${toSync.join(', ')}`);

    const syncTasks = toSync.map(async (collection) => {
      try {
        const lastSyncStr = this.getMeta(`LAST_SYNC_${collection}`);
        const since = lastSyncStr ? new Date(parseInt(lastSyncStr, 10)) : null;

        // fetcherFn trả về plain object array: [{id, ...fields}]
        const docs = await fetcherFn(collection, since);

        if (docs?.length > 0) {
          await this.putBatch(collection, docs);
          console.info(`[ERP DB Sync] ✅ ${collection}: ${docs.length} bản ghi cập nhật.`);
        }

        this.markSynced(collection);
      } catch (error) {
        console.error(`[ERP DB Sync] ❌ Lỗi sync '${collection}':`, error);
        // Tiếp tục với collection khác — không dừng toàn bộ
      }
    });

    await Promise.allSettled(syncTasks);
    console.info('[ERP DB Sync] Hoàn tất background sync.');
  }

  // ==========================================
  // MODULE: CRUD OPERATIONS
  // ==========================================

  /**
   * Lấy 1 document theo id.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async get(storeName, id) {
    try {
      if (!this.db) await this.initDB();
      return new Promise((resolve, reject) => {
        const req = this.db.transaction([storeName], 'readonly').objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.error(`[ERP DB] Get (${id}) from ${storeName}:`, error);
      return null;
    }
  }

  /**
   * Ghi 1 document (insert hoặc update).
   * @param {string} storeName
   * @param {object} data - Phải có field `id`
   * @returns {Promise<boolean>}
   */
  async put(storeName, data) {
    try {
      if (!this.db) await this.initDB();
      if (!data?.id) {
        console.warn(`[ERP DB] put() bỏ qua: thiếu 'id' trong store ${storeName}`);
        return false;
      }
      return new Promise((resolve, reject) => {
        const req = this.db.transaction([storeName], 'readwrite').objectStore(storeName).put(data);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.error(`[ERP DB] Put into ${storeName}:`, error);
      return false;
    }
  }

  /**
   * Ghi nhiều documents trong 1 transaction duy nhất.
   * Nhanh hơn gọi put() nhiều lần vì chỉ mở 1 transaction.
   *
   * @param {string} storeName
   * @param {object[]} docs - Mảng objects, mỗi phần tử phải có `id`
   * @returns {Promise<number>} Số docs đã ghi
   */
  async putBatch(storeName, docs) {
    if (!docs?.length) return 0;
    try {
      if (!this.db) await this.initDB();

      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        let count = 0;

        docs.forEach((doc) => {
          if (doc?.id) {
            store.put(doc);
            count++;
          }
        });

        tx.oncomplete = () => resolve(count);
        tx.onerror = (e) => reject(e.target.error);
        tx.onabort = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.error(`[ERP DB] putBatch into ${storeName}:`, error);
      return 0;
    }
  }

  /**
   * Xóa 1 document theo id.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(storeName, id) {
    try {
      if (!this.db) await this.initDB();
      return new Promise((resolve, reject) => {
        const req = this.db.transaction([storeName], 'readwrite').objectStore(storeName).delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.error(`[ERP DB] Delete (${id}) from ${storeName}:`, error);
      return false;
    }
  }

  /**
   * Xóa toàn bộ dữ liệu trong 1 store.
   * @param {string} storeName
   * @returns {Promise<boolean>}
   */
  async clear(storeName) {
    try {
      if (!this.db) await this.initDB();
      return new Promise((resolve, reject) => {
        const req = this.db.transaction([storeName], 'readwrite').objectStore(storeName).clear();
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.error(`[ERP DB] Clear ${storeName}:`, error);
      return false;
    }
  }

  /**
   * Lấy tất cả documents dưới dạng array.
   * @param {string} storeName
   * @returns {Promise<object[]>}
   */
  async getAll(storeName) {
    try {
      if (!this.db) await this.initDB();
      return new Promise((resolve, reject) => {
        const req = this.db.transaction([storeName], 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (error) {
      console.error(`[ERP DB] GetAll from ${storeName}:`, error);
      return [];
    }
  }

  /**
   * Lấy tất cả documents dưới dạng object keyed-by-id: { [id]: doc }.
   * Đây là format mà APP_DATA sử dụng — dùng khi nạp vào APP_DATA.
   *
   * @param {string} storeName
   * @returns {Promise<Record<string, object>>}
   */
  async getAllAsObject(storeName) {
    const docs = await this.getAll(storeName);
    const result = {};
    docs.forEach((doc) => {
      if (doc?.id) result[doc.id] = doc;
    });
    return result;
  }
}

// Khởi tạo Singleton pattern
const localDB = new IndexedDBHelper();
export default localDB;
