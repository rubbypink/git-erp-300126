/**
 * MODULE: TRANSLATION SYSTEM (CORE)
 * Path: public/src/js/modules/TranslationModule.js
 * Updated: Fixed Firestore Path
 */

// --- CẬP NHẬT ĐƯỜNG DẪN MỚI TẠI ĐÂY ---
const ROOT_COL = 'app_config'; // Collection gốc
const GENERAL_DOC = 'general'; // Document cấp 1
const SETTINGS_COL = 'settings'; // Sub-collection cấp 2
const LANG_DOC = 'languages'; // Document chứa data (vi/en)
// ---------------------------------------

const CACHE_KEY = '9trip_lang_v1';

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

  _loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) this.dict = JSON.parse(cached);
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
      const db = A.DB.db;

      // --- CẬP NHẬT LOGIC LẤY DOC REF ---
      // Path: app_config/general/settings/languages
      const docRef = db
        .collection(ROOT_COL)
        .doc(GENERAL_DOC)
        .collection(SETTINGS_COL)
        .doc(LANG_DOC);

      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data[this.currentLang]) {
          this.dict = data[this.currentLang];
          localStorage.setItem(CACHE_KEY, JSON.stringify(this.dict));
        }
      } else {
        console.warn(`⚠️ Lang: Document [${LANG_DOC}] không tìm thấy! Kiểm tra lại Firestore.`);
      }
    } catch (error) {
      console.error('❌ Lang: Sync Failed', error);
    }
  }

  t(input) {
    if (!input) return '';
    if (Array.isArray(input)) return input.map((k) => this.dict[k] || k);
    return this.dict[input] || input;
  }

  async update(key, value) {
    if (!key || !value || !A.DB.db) return;

    this.dict[key] = value;
    localStorage.setItem(CACHE_KEY, JSON.stringify(this.dict));

    try {
      const updatePayload = {};
      updatePayload[`${this.currentLang}.${key}`] = value;

      // Cập nhật đường dẫn update
      await A.DB.db
        .collection(ROOT_COL)
        .doc(GENERAL_DOC)
        .collection(SETTINGS_COL)
        .doc(LANG_DOC)
        .update(updatePayload);
      console.log(`✅ Lang: Updated [${key}]`);
    } catch (error) {
      console.error('❌ Lang: Update Failed', error);
    }
  }
}

export const Lang = new TranslationModule();
