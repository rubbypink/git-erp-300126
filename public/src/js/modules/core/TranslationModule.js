/**
 * MODULE: TRANSLATION SYSTEM (CORE)
 * Path: public/src/js/modules/TranslationModule.js
 * Updated: Fixed Firestore Path
 */

import { DB_SCHEMA } from '/src/js/modules/db/DBSchema.js';
import localDB from '/src/js/modules/db/DBLocalStorage.js';

// --- CẬP NHẬT ĐƯỜNG DẪN MỚI TẠI ĐÂY ---
const ROOT_COL = 'app_config'; // Collection gốc
const GENERAL_DOC = 'general'; // Document cấp 1
const SETTINGS_COL = 'settings'; // Sub-collection cấp 2
const LANG_DOC = 'languages'; // Document chứa data (vi/en)
// ---------------------------------------

const META_KEY_DICT = 'lang_dict'; // IndexedDB meta key cho full dict
const META_KEY_SCHEMA = 'lang_schema'; // IndexedDB meta key cho schema translations

class TranslationModule {
  constructor() {
    this._initialized = true;
    this.dict = {};
    this.currentLang = 'vi'; // Mặc định tiếng Việt

    // 1. Load Cache ngay lập tức
    this._loadFromCache();

    // 2. Sync Firestore (Sau 100ms để đợi A.DB init)
    setTimeout(() => this._syncRemote(), 100);
  }

  /**
   * Load dict từ IndexedDB cache (async, fire-and-forget từ constructor).
   * Ưu tiên: lang_dict (full) → lang_schema (schema-only, fill gap)
   */
  async _loadFromCache() {
    try {
      await localDB.initDB();

      // 1. Load full dict đã lưu trước đó
      const dictRaw = localDB.getMeta(META_KEY_DICT);
      if (dictRaw) {
        Object.assign(this.dict, JSON.parse(dictRaw));
      }

      // 2. Merge schema translations (fill gap — không ghi đè)
      const schemaRaw = localDB.getMeta(META_KEY_SCHEMA);
      if (schemaRaw) {
        const schemaDict = JSON.parse(schemaRaw);
        for (const [key, value] of Object.entries(schemaDict)) {
          if (!this.dict[key]) this.dict[key] = value;
        }
      }
    } catch (e) {
      console.warn('⚠️ Lang: Cache Error', e);
    }
  }

  async _syncRemote() {
    // Kiểm tra A.DB.db đã sẵn sàng chưa
    if (typeof A === 'undefined' || !A.DB || !A.DB.db) {
      console.error('❌ Lang: A.DB.db chưa kết nối!');
      return;
    }

    try {
      const data = await A.DB.getCollection('app_config/general/settings');
      if (data && data[LANG_DOC] && data[LANG_DOC][this.currentLang]) {
        this.dict = data[LANG_DOC][this.currentLang];

        // Lưu dict vào IndexedDB để lần sau load nhanh
        localDB.setMeta(META_KEY_DICT, JSON.stringify(this.dict));
      }
    } catch (error) {
      console.error('❌ Lang: Sync Failed', error);
    }
  }

  /**
   * Sync tất cả field name → displayName từ DB_SCHEMA vào this.dict.
   *
   * - Duyệt mọi collection trong DB_SCHEMA có mảng `fields`
   * - Lấy cặp `field.name: field.displayName` cho từng field
   * - Lấy cặp `collectionKey: collection.displayName` cho collection
   * - Chỉ thêm mới, KHÔNG ghi đè các translation đã có (ưu tiên Firestore/manual)
   * - Lưu vào IndexedDB (_sync_meta key 'lang_schema')
   *
   * @returns {Promise<number>} Số entry mới được thêm vào dict
   */
  async syncFromSchema() {
    let addedCount = 0;

    try {
      const schemaDict = {};

      for (const [collectionKey, collection] of Object.entries(DB_SCHEMA)) {
        // Bỏ qua entry không có fields (secondary indexes, utility keys)
        if (!collection?.fields || !Array.isArray(collection.fields)) continue;

        // Collection-level: collectionKey → displayName
        if (collection.displayName && !this.dict[collectionKey]) {
          schemaDict[collectionKey] = collection.displayName;
        }

        // Field-level: field.name → field.displayName
        for (const field of collection.fields) {
          if (!field?.name || !field?.displayName) continue;

          // Chỉ thêm nếu chưa có trong dict hiện tại
          if (!this.dict[field.name]) {
            schemaDict[field.name] = field.displayName;
          }
        }
      }

      // Merge vào dict
      addedCount = Object.keys(schemaDict).length;
      if (addedCount > 0) {
        Object.assign(this.dict, schemaDict);

        // Lưu IndexedDB (persistent cache)
        await localDB.setMeta(META_KEY_SCHEMA, JSON.stringify(schemaDict));
        L._(`✅ Lang: Synced ${addedCount} entries from DB_SCHEMA`);
      }
    } catch (error) {
      console.error('❌ Lang: syncFromSchema Failed', error);
    }

    return addedCount;
  }

  t(input) {
    if (!input) return '';
    if (Array.isArray(input)) return input.map((k) => this.dict[k] || k);
    return this.dict[input] || input;
  }

  fd(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    try {
      const targetFormat = window.A?.getConfig?.('consts/date_format') ?? 'dd/mm/yyyy';
      let y, m, d;

      // Remove time portion if present (2024-01-01T12:00 -> 2024-01-01)
      const cleanDate = dateStr.split('T')[0];

      // Detect input format and parse
      if (cleanDate.includes('-')) {
        // ISO format: yyyy-mm-dd or yy-mm-dd
        const parts = cleanDate.split('-');
        y = parts[0];
        m = parts[1];
        d = parts[2];
      } else if (cleanDate.includes('/')) {
        // Vietnamese format: dd/mm/yyyy or d/m/yy or dd/mm/yy
        const parts = cleanDate.split('/');
        d = parts[0];
        m = parts[1];
        y = parts[2];

        // Convert 2-digit year to 4-digit year
        if (y && y.length === 2) {
          y = parseInt(y) > 50 ? '19' + y : '20' + y;
        }
      } else {
        return dateStr; // Unknown format
      }

      // Validate parsed values
      if (!y || !m || !d) return dateStr;

      // Pad with zeros for single digits
      y = String(y).padStart(4, '0');
      m = String(m).padStart(2, '0');
      d = String(d).padStart(2, '0');

      // Format according to target format
      return targetFormat.replace('yyyy', y).replace('yy', y.slice(-2)).replace('mm', m).replace('m', m.replace(/^0/, '')).replace('dd', d).replace('d', d.replace(/^0/, ''));
    } catch (e) {
      L._('⚠️ Lang: Lỗi format date: ' + dateStr, 'warning');
      return dateStr;
    }
  }

  async update(key, value) {
    if (!key || !value || !A.DB.db) return;

    this.dict[key] = value;

    // Cập nhật IndexedDB cache
    localDB.setMeta(META_KEY_DICT, JSON.stringify(this.dict));

    try {
      const updatePayload = {};
      updatePayload[`${this.currentLang}.${key}`] = value;

      // Cập nhật đường dẫn update
      await A.DB.db.collection(ROOT_COL).doc(GENERAL_DOC).collection(SETTINGS_COL).doc(LANG_DOC).update(updatePayload);
      L._(`✅ Lang: Updated [${key}]`);
    } catch (error) {
      console.error('❌ Lang: Update Failed', error);
    }
  }
}

export const Lang = new TranslationModule();
