/**
 * @module DBLocalStorage
 * @description Quản lý lõi lưu trữ IndexedDB — cache offline cho APP_DATA.
 * Tối ưu hóa bằng Dexie.js kết hợp Dynamic Index từ DB_SCHEMA.
 * Tích hợp Auto-Recovery và Silent Fail-safe cho bảng động.
 */

import { DB_SCHEMA } from './DBSchema.js';
import Dexie from 'dexie';

/**
 * Helper: Parse DB_SCHEMA thành Dexie Schema Format
 */
function buildDexieSchema() {
  // 1. Các table hệ thống và table bổ sung (Fix lỗi InvalidTableError)
  const dexieSchema = {
    _sync_meta: 'id',
    notifications: 'id, created_at, type',
    app_config: 'id',
    'app_config/general/settings': 'id', // Cache ngôn ngữ/cấu hình
    notification_dedup: 'id, processed_at', // Cache chống lặp thông báo (Thêm index processed_at)
    counters_id: 'id', // Cache bộ đếm ID
    ai_prices: 'id',
  };

  // 2. Load các table từ DB_SCHEMA
  for (const [collName, collDef] of Object.entries(DB_SCHEMA)) {
    if (collDef.isSecondaryIndex || typeof collDef === 'function') continue;

    const pk = collDef.primaryKey || 'id';
    let indexString = pk;

    if (collDef.index && Array.isArray(collDef.index)) {
      const indexes = collDef.index.filter((idx) => idx !== pk);
      if (indexes.length > 0) {
        indexString += ', ' + indexes.join(', ');
      }
    }
    dexieSchema[collName] = indexString;
  }

  return dexieSchema;
}

class IndexedDBHelper {
  #initPromise = null;
  #syncMeta = {};

  constructor(dbName = '9TripERP_LocalDB') {
    this.dbName = dbName;
    this.db = new Dexie(this.dbName);

    const _cfg = (key, fallback) => window.A?.getConfig?.(key) ?? fallback;
    this.ttlConfig = {
      app_config: _cfg('cache_ttl_master_data', 4320),
      users: 1440,
      hotels: _cfg('cache_ttl_master_data', 4320),
      suppliers: _cfg('cache_ttl_master_data', 4320),
      fund_accounts: _cfg('cache_ttl_master_data', 4320),
      hotel_price_schedules: 1440,
      service_price_schedules: 1440,
      bookings: _cfg('cache_ttl_bookings', 60),
      booking_details: _cfg('cache_ttl_booking_details', 60),
      operator_entries: _cfg('cache_ttl_booking_details', 60),
      transactions: _cfg('cache_ttl_transactions', 120),
      transactions_thenice: _cfg('cache_ttl_transactions', 120),
      customers: _cfg('cache_ttl_customers', 120),
      notifications: 60,
    };
    this.defaultTTL = 360;
  }

  // ==========================================
  // MODULE: INIT & AUTO-RECOVERY
  // ==========================================
  async initDB() {
    if (this.#initPromise) return this.#initPromise;
    if (this.db.isOpen()) return true;

    this.#initPromise = this._doInitDB();
    try {
      return await this.#initPromise;
    } finally {
      this.#initPromise = null;
    }
  }

  async _doInitDB() {
    try {
      // Nâng cấp version lên 6 để cập nhật index cho notification_dedup
      this.db.version(7).stores(buildDexieSchema());
      await this.db.open();
      await this._loadSyncMeta();
      return true;
    } catch (error) {
      // Tự động dọn dẹp & sửa lỗi khi có xung đột Schema từ bản cũ
      const isUpgradeError = error.name === 'UpgradeError' || error.inner?.name === 'UpgradeError' || error.message.includes('primary key');

      if (isUpgradeError) {
        console.warn('⚠️ [ERP Dexie] Phát hiện xung đột DB cũ. Đang tự động làm sạch và Rebuild...');
        try {
          if (this.db.isOpen()) this.db.close();
          await Dexie.delete(this.dbName);

          this.db = new Dexie(this.dbName);
          this.db.version(1).stores(buildDexieSchema());
          await this.db.open();

          console.info('✅ [ERP Dexie] Rebuild Local DB thành công!');
          await this._loadSyncMeta();
          return true;
        } catch (e) {
          console.error('❌ [ERP Dexie] Lỗi Rebuild DB:', e);
          return false;
        }
      }
      return false;
    }
  }

  async _loadSyncMeta() {
    this.#syncMeta = {};
    try {
      const docs = await this.db._sync_meta.toArray();
      docs.forEach((doc) => {
        if (doc?.id) this.#syncMeta[doc.id] = doc.value;
      });
    } catch (e) {
      console.warn('[ERP Dexie] Lỗi load _sync_meta:', e);
    }
  }

  // ==========================================
  // MODULE: META & TTL TRACKING
  // ==========================================
  getMeta(key) {
    return this.#syncMeta[key] ?? null;
  }

  setMeta(key, value) {
    this.#syncMeta[key] = value;
    this.put('_sync_meta', { id: key, value });
  }

  isSynced(collection) {
    const raw = this.getMeta(`LAST_SYNC_${collection}`);
    if (!raw) return false;
    const ttlMs = (this.ttlConfig[collection] ?? this.defaultTTL) * 60 * 1000;
    return Date.now() - parseInt(raw, 10) < ttlMs;
  }

  markSynced(collection) {
    this.setMeta(`LAST_SYNC_${collection}`, Date.now().toString());
  }
  getStalecollections(collections) {
    return (collections ?? []).filter((c) => !this.isSynced(c));
  }

  // ==========================================
  // MODULE: SILENT ERROR HANDLER
  // ==========================================
  /**
   * Chặn không cho các lỗi Bảng Không Tồn Tại in ra console
   * Giúp console sạch sẽ, trả về fallback an toàn.
   */
  _handleError(error, operation, storeName, fallbackValue) {
    if (error.name === 'InvalidTableError' || error.message?.includes('does not exist')) {
      return fallbackValue; // Trả về an toàn, không in lỗi
    }
    console.error(`[ERP Dexie] ${operation} tại ${storeName}:`, error);
    return fallbackValue;
  }

  // ==========================================
  // MODULE: BACKGROUND SYNC
  // ==========================================
  async autoSync(collectionNames, fetcherFn, roleCollections = null) {
    if (!collectionNames?.length || typeof fetcherFn !== 'function') return;
    if (!this.db.isOpen()) await this.initDB();

    const allowed = roleCollections ? new Set(roleCollections) : null;
    const toSync = collectionNames.filter((c) => (!allowed || allowed.has(c)) && !this.isSynced(c));

    if (toSync.length === 0) return;

    const syncTasks = toSync.map(async (collection) => {
      try {
        const lastSyncStr = this.getMeta(`LAST_SYNC_${collection}`);
        const since = lastSyncStr ? new Date(parseInt(lastSyncStr, 10)) : null;
        const docs = await fetcherFn(collection, since);

        if (docs?.length > 0) await this.putBatch(collection, docs);
        this.markSynced(collection);
      } catch (error) {
        // Bỏ qua lỗi autoSync cho từng bảng
      }
    });
    await Promise.allSettled(syncTasks);
  }

  // ==========================================
  // MODULE: DEXIE CRUD (SIÊU TỐC ĐỘ & BẢO TOÀN LỖI)
  // ==========================================

  async get(storeName, id) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return (await this.db.table(storeName).get(id)) ?? null;
    } catch (error) {
      return this._handleError(error, `Get (${id})`, storeName, null);
    }
  }

  async put(storeName, data) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      if (!data?.id && !data?.uid && storeName !== '_sync_meta') return false;
      await this.db.table(storeName).put(data);
      return true;
    } catch (error) {
      return this._handleError(error, `Put`, storeName, false);
    }
  }

  async putBatch(storeName, docs) {
    if (!docs?.length) return 0;
    try {
      if (!this.db.isOpen()) await this.initDB();
      const validDocs = docs.filter((d) => d?.id || d?.uid || storeName === '_sync_meta');
      await this.db.table(storeName).bulkPut(validDocs);
      return validDocs.length;
    } catch (error) {
      return this._handleError(error, `putBatch`, storeName, 0);
    }
  }

  async delete(storeName, id) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      await this.db.table(storeName).delete(id);
      return true;
    } catch (error) {
      return this._handleError(error, `Delete (${id})`, storeName, false);
    }
  }

  async deleteBatch(storeName, ids) {
    if (!ids?.length) return true;
    try {
      if (!this.db.isOpen()) await this.initDB();
      await this.db.table(storeName).bulkDelete(ids);
      return true;
    } catch (error) {
      return this._handleError(error, `deleteBatch`, storeName, false);
    }
  }

  async clear(storeName) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      await this.db.table(storeName).clear();
      return true;
    } catch (error) {
      return this._handleError(error, `Clear`, storeName, false);
    }
  }

  async getCollection(storeName) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return (await this.db.table(storeName).toArray()) ?? [];
    } catch (error) {
      return this._handleError(error, `getCollection`, storeName, []);
    }
  }

  async getAllAsObject(storeName) {
    try {
      const docs = await this.getCollection(storeName);
      const result = {};
      for (const doc of docs) {
        const key = doc.id || doc.uid;
        if (key) result[key] = doc;
      }
      return result;
    } catch (error) {
      return this._handleError(error, `getAllAsObject`, storeName, {});
    }
  }

  // ==========================================
  // MODULE: ADVANCED QUERY HELPERS
  // ==========================================

  async count(storeName) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return await this.db.table(storeName).count();
    } catch (error) {
      return this._handleError(error, `Count`, storeName, 0);
    }
  }

  async find(storeName, fieldName, value) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      const table = this.db.table(storeName);
      try {
        return await table.where(fieldName).equals(value).toArray();
      } catch (indexError) {
        // Fallback: Nếu không khai báo Index, âm thầm chuyển sang scan filter
        return await table.filter((doc) => doc[fieldName] === value).toArray();
      }
    } catch (error) {
      return this._handleError(error, `Find (${fieldName})`, storeName, []);
    }
  }

  async findByMultiple(storeName, conditions) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return await this.db
        .table(storeName)
        .filter((doc) => {
          for (const [key, val] of Object.entries(conditions)) {
            if (doc[key] !== val) return false;
          }
          return true;
        })
        .toArray();
    } catch (error) {
      return this._handleError(error, `findByMultiple`, storeName, []);
    }
  }

  // ==========================================
  // NEW MODULE: ENHANCED UTILITIES (9TRIP ERP)
  // ==========================================

  /**
   * Cập nhật một phần dữ liệu (Patch)
   * @param {string} storeName
   * @param {string|number} id
   * @param {Object} changes
   */
  async patch(storeName, id, changes) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      await this.db.table(storeName).update(id, changes);
      return true;
    } catch (error) {
      return this._handleError(error, `Patch (${id})`, storeName, false);
    }
  }

  /**
   * Truy vấn nâng cao với Phân trang & Sắp xếp
   * @param {string} storeName
   * @param {Object} options { filter, orderBy, reverse, offset, limit }
   */
  async query(storeName, options = {}) {
    const { filter, orderBy, reverse = false, offset = 0, limit = 50 } = options;
    try {
      if (!this.db.isOpen()) await this.initDB();
      let collection = this.db.table(storeName);

      // 1. Xử lý Filter (Ưu tiên Index)
      if (filter && typeof filter === 'object') {
        const filterKeys = Object.keys(filter);
        if (filterKeys.length === 1) {
          const key = filterKeys[0];
          collection = collection.where(key).equals(filter[key]);
        } else {
          // Đa điều kiện: Dùng filter scan (Dexie không hỗ trợ compound query tự động tốt bằng filter cho dynamic keys)
          collection = collection.filter((doc) => {
            return filterKeys.every((k) => doc[k] === filter[k]);
          });
        }
      }

      // 2. Xử lý Sắp xếp
      if (orderBy) {
        if (collection instanceof Dexie.Table) {
          collection = collection.orderBy(orderBy);
        } else {
          // Nếu đã là Collection (sau where), Dexie không cho orderBy trực tiếp trên collection đó dễ dàng
          // Ta sẽ sort thủ công hoặc dùng logic Dexie Collection nếu có thể
          collection = collection.sortBy ? collection : collection.toCollection();
        }
      } else {
        collection = collection.toCollection ? collection.toCollection() : collection;
      }

      // 3. Đảo ngược
      if (reverse) collection = collection.reverse();

      // 4. Phân trang
      if (offset) collection = collection.offset(offset);
      if (limit) collection = collection.limit(limit);

      return await collection.toArray();
    } catch (error) {
      return this._handleError(error, `Query`, storeName, []);
    }
  }

  /**
   * Tìm kiếm chuỗi (Prefix Search) sử dụng Index
   * @param {string} storeName
   * @param {string} fieldName
   * @param {string} searchTerm
   */
  async search(storeName, fieldName, searchTerm) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return await this.db.table(storeName).where(fieldName).startsWithIgnoreCase(searchTerm).limit(20).toArray();
    } catch (error) {
      return this._handleError(error, `Search (${fieldName})`, storeName, []);
    }
  }

  /**
   * Thực thi Transaction an toàn
   * @param {string} mode 'rw' | 'r'
   * @param {string[]} tables Danh sách các bảng tham gia
   * @param {Function} fn Callback logic (async)
   */
  async runTransaction(mode, tables, fn) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return await this.db.transaction(mode, tables, async () => {
        return await fn();
      });
    } catch (error) {
      console.error(`[ERP Dexie] Transaction Error:`, error);
      throw error;
    }
  }

  /**
   * Lấy dữ liệu theo mảng IDs (Tối ưu cho quan hệ 1-n)
   * @param {string} storeName
   * @param {Array} ids
   */
  async getByIds(storeName, ids) {
    if (!ids?.length) return [];
    try {
      if (!this.db.isOpen()) await this.initDB();
      return await this.db.table(storeName).bulkGet(ids);
    } catch (error) {
      return this._handleError(error, `getByIds`, storeName, []);
    }
  }

  /**
   * Xóa bản ghi theo truy vấn linh hoạt (Tối ưu bộ nhớ)
   * @param {string} storeName
   * @param {string} fieldName
   * @param {'='|'<'|'<='|'>'|'>='|'in'|'startsWith'} operator
   * @param {any} value
   */
  async deleteByQuery(storeName, fieldName, operator, value) {
    try {
      if (!this.db.isOpen()) await this.initDB();
      let query = this.db.table(storeName).where(fieldName);

      switch (operator) {
        case '=':
          query = query.equals(value);
          break;
        case '<':
          query = query.below(value);
          break;
        case '<=':
          query = query.belowOrEqual(value);
          break;
        case '>':
          query = query.above(value);
          break;
        case '>=':
          query = query.aboveOrEqual(value);
          break;
        case 'in':
          query = query.anyOf(Array.isArray(value) ? value : [value]);
          break;
        case 'startsWith':
          query = query.startsWithIgnoreCase(value);
          break;
        default:
          throw new Error(`Operator ${operator} không được hỗ trợ`);
      }

      const count = await query.delete();
      return count;
    } catch (error) {
      return this._handleError(error, `deleteByQuery (${fieldName} ${operator} ${value})`, storeName, 0);
    }
  }

  /**
   * Lấy danh sách tất cả các store (tables) hiện có trong IndexedDB
   * @returns {Promise<string[]>}
   */
  async getStores() {
    try {
      if (!this.db.isOpen()) await this.initDB();
      return this.db.tables.map((table) => table.name);
    } catch (error) {
      console.error(`[ERP Dexie] getStores Error:`, error);
      return [];
    }
  }
}

// Singleton Export
const localDB = new IndexedDBHelper();
export default localDB;
