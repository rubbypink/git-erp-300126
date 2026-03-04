import { DB_SCHEMA } from './DBSchema.js';
import localDB from './DBLocalStorage.js';
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

class DBManager {
  // ─── Private state ────────────────────────────────────────────────
  #db = null;
  #listeners = {}; // chỉ dùng cho notifications listener
  #config = {};
  #initPromise = null; // đảm bảo init chỉ chạy 1 lần
  #resolveInit = null; // để init() thủ công resolve promise
  #schema = DB_SCHEMA; // Cấu trúc schema tập trung, dễ maintain và dùng chung với UI Renderer
  #localDB = localDB; // Instance của DBLocalStorage để quản lý cache IndexedDB
  // ─── Public State ────────────────────────────────────────────────
  batchCounterUpdates = {};
  currentCustomer = null;
  _initialized = false; // true sau khi #bootInit hoàn tất

  /**
   * Query config — limits are overridable via Admin Settings (A.getConfig).
   * Getter pattern ensures config is read at query-time, not at class-definition time.
   */
  static get #QUERY_CONFIG() {
    const _cfg = (key, fallback) => window.A?.getConfig?.(key) ?? fallback;
    // postSort: client-side sort SAU KHI hydrate — KHÔNG dùng orderBy cho Firestore query.
    // Lý do: Firestore v8 với orderBy() sẽ loại trừ mọi document thiếu field đó khỏi kết quả,
    //        dẫn đến mất dữ liệu âm thầm. Toàn bộ ordering được xử lý phía client.
    // limit:   Chỉ áp dụng khi KHÔNG có orderBy (tức là full-collection scan có giới hạn).
    return {
      bookings: { limit: _cfg('query_limit_bookings', 1000), postSort: { key: 'id', dir: 'desc' } },
      booking_details: { limit: _cfg('query_limit_booking_details', 2000), postSort: { key: 'booking_id', dir: 'desc' } },
      operator_entries: { limit: _cfg('query_limit_operator_entries', 2000), postSort: { key: 'booking_id', dir: 'desc' } },
      customers: { limit: _cfg('query_limit_customers', 1000), postSort: { key: 'id', dir: 'asc' } },
      transactions: { limit: _cfg('query_limit_transactions', 2000), postSort: { key: 'transaction_date', dir: 'desc' } },
      suppliers: { limit: 1000, postSort: { key: 'id', dir: 'desc' } },
      fund_accounts: { limit: 20, postSort: { key: 'id', dir: 'desc' } },
      transactions_thenice: { limit: 2000, postSort: { key: 'id', dir: 'desc' } },
      fund_accounts_thenice: { limit: 20, postSort: { key: 'id', dir: 'desc' } },
      hotels: { limit: 1000, postSort: { key: 'name', dir: 'asc' } },
      hotel_price_schedules: { limit: 500, postSort: { key: 'id', dir: 'desc' } },
      service_price_schedules: { limit: 500, postSort: { key: 'id', dir: 'desc' } },
    };
  }
  // ─── Cấu hình Booking History ─────────────────────────────────────────
  // Collections mà khi CRUD sẽ tự động ghi history vào bookings.history
  // Key = collection name, value = cách lấy booking_id từ data/APP_DATA
  static #HISTORY_COLLS = new Set(['bookings', 'booking_details', 'transactions']);

  // ─── Cấu hình secondary indexes ──────────────────────────────────────
  // Khai báo tập trung — dễ thêm index mới sau này
  static #INDEX_CONFIG = [
    { index: 'booking_details_by_booking', source: 'booking_details', groupBy: 'booking_id' },
    { index: 'operator_entries_by_booking', source: 'operator_entries', groupBy: 'booking_id' },
    { index: 'transactions_by_booking', source: 'transactions', groupBy: 'booking_id' },
    { index: 'transactions_by_fund', source: 'transactions', groupBy: 'fund_source' },
  ];

  /**
   * Mapping role → danh sách collections được phép truy cập.
   * Nguồn chân lý DUY NHẤT — dùng trong loadAllData, syncDelta, và role-change pruning.
   * Thêm / sửa role mới chỉ cần cập nhật ở đây.
   */
  static #ROLE_COLL_MAP = {
    sale: ['bookings', 'booking_details', 'customers', 'transactions', 'fund_accounts'],
    op: ['bookings', 'operator_entries', 'transactions'],
    acc: ['transactions', 'fund_accounts', 'bookings'],
    acc_thenice: ['transactions_thenice', 'fund_accounts_thenice'],
    admin: ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions', 'fund_accounts'],
  };

  /**
   * Trả về danh sách collections cho role (không bao gồm 'users' — luôn tải qua loadMeta).
   * @param {string} role
   * @returns {string[]}
   */
  #getRoleCollections(role) {
    const indexNames = new Set(DBManager.#INDEX_CONFIG.map((c) => c.index));
    return (COLL_MANIFEST?.[role] ?? DBManager.#ROLE_COLL_MAP[role] ?? ['bookings', 'booking_details', 'operator_entries', 'customers']).filter((c) => !indexNames.has(c)); // secondary index names
  }

  /**
   * Constructor — luôn dùng manual-init.
   * Gọi await DB.init() sau khi Firebase auth sẵn sàng để khởi động.
   *
   * @param {object} [options]
   * @param {number}  [options.cacheMaxAgeMs]            - Tuổi tối đa của cache (ms), mặc định 72h
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
    this.#db = firebase.firestore();

    // Khởi tạo IndexedDB song song với Firestore
    await this.#localDB.initDB().catch((e) => console.warn('⚠️ IndexedDB initDB thất bại:', e));

    this.#startNotificationsListener();
    this._initialized = true;
    log('🚀 DBManager ready (IndexedDB + Firestore)');
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
    } else {
      await this.#initPromise;
    }
    return this;
  }
  // ─── Getters ──────────────────────────────────────────────────────────

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

  // ─── Load All Data ────────────────────────────────────────────────────────

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
    await this.#initPromise; // đảm bảo #bootInit xong
    if (!this.#db) {
      console.error('❌ DB chưa init');
      return null;
    }
    if (!firebase.auth().currentUser) {
      console.error('❌ Chưa đăng nhập');
      return null;
    }

    const currentRole = window.CURRENT_USER?.role ?? '';
    const currentRoleColls = this.#getRoleCollections(currentRole);
    const lastSyncRole = this.#localDB.getMeta('LAST_SYNC_ROLE') ?? '';
    const roleChanged = currentRole !== lastSyncRole;

    // ── 1. Ưu tiên IndexedDB (thay thế localStorage — không bị overflow) ──
    if (!forceNew) {
      this.#buildEmptyResult();
      const indexedData = await this.#loadFromIndexedDB(currentRoleColls);
      const hasIndexedData = Object.keys(indexedData).some((k) => Object.keys(indexedData[k] ?? {}).length > 0);

      if (hasIndexedData) {
        // Nạp dữ liệu từ IndexedDB vào APP_DATA
        Object.assign(APP_DATA, indexedData);

        // Prune collections không thuộc role hiện tại (nếu role thay đổi)
        if (roleChanged) {
          log(`🔄 Role thay đổi: [${lastSyncRole}] → [${currentRole}]`);
          const allowedColls = new Set(currentRoleColls);
          for (const coll of Object.keys(APP_DATA)) {
            if (coll === 'lists' || coll === 'currentUser' || coll === 'users' || DBManager.#INDEX_CONFIG.some((c) => c.index === coll)) continue;
            if (!allowedColls.has(coll)) {
              log(`🗑️ Prune [${coll}] (không cần cho role ${currentRole})`);
              delete APP_DATA[coll];
              DBManager.#INDEX_CONFIG.filter((c) => c.source === coll).forEach(({ index }) => delete APP_DATA[index]);
            }
          }
        }

        // Tải bổ sung collections còn thiếu trong IndexedDB
        const missingColls = currentRoleColls.filter((c) => !APP_DATA[c] || Object.keys(APP_DATA[c]).length === 0);
        if (missingColls.length > 0) {
          log(`📥 IndexedDB thiếu ${missingColls.length} collection(s): ${missingColls.join(', ')} — tải từ Firestore...`);
          await this.syncDelta(missingColls, true);
        }

        // Tải meta (app_config + users) — nhỏ, luôn fresh từ Firestore
        await this.loadMeta(APP_DATA).catch((e) => console.warn('⚠️ loadMeta thất bại:', e));

        this.#rebuildAllSecondaryIndexes();
        this.#applyAllPostSorts(APP_DATA);
        this.#localDB.setMeta('LAST_SYNC_ROLE', currentRole);

        log(`📦 APP_DATA từ IndexedDB (role: ${currentRole})`);

        // Smart delta sync: probe bookings → nếu có dữ liệu mới → sync tất cả collections
        // Khi network_saver=true → bỏ qua hoàn toàn (tiết kiệm network tối đa)
        const networkSaver = window.A?.getConfig?.('network_saver');
        if (!networkSaver) {
          this.#smartDeltaSync(currentRoleColls).catch((e) => console.warn('⚠️ Smart Delta Sync lỗi:', e));
        } else {
          log('🌐 Network Saver ON — bỏ qua background sync');
        }

        return APP_DATA;
      }
    }

    // ── 2. Tải toàn bộ từ Firestore (IndexedDB trống hoặc forceNew) ────
    console.time('loadAllData');
    this.#buildEmptyResult();

    log(`📚 Full load từ Firestore (role=${currentRole}): ${currentRoleColls.join(', ')}`);

    try {
      await Promise.all([this.loadMeta(APP_DATA), this.syncDelta(currentRoleColls, true)]);
      console.timeEnd('loadAllData');
      log('📥 APP_DATA sẵn sàng (tải từ Firestore)');
      this.#applyAllPostSorts(APP_DATA);
      await this.#saveAppDataCache(currentRoleColls, forceNew); // await: forceNew cần clear IDB trước khi trả về
      return APP_DATA;
    } catch (e) {
      logError('❌ loadAllData thất bại:', e);
      console.timeEnd('loadAllData');
      return null;
    }
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

    // Xác định danh sách collections cần ghi
    const toWrite = collNames ?? this.#getRoleCollections(window.CURRENT_USER?.role ?? '');

    if (clearStores) {
      // forceNew / forceFullLoad: xóa sạch store trước khi ghi
      // — PHẢI await để đảm bảo clear hoàn tất TRƯỚC khi putBatch
      //   (nếu fire-and-forget, app có thể đọc lại IDB trước khi ghi xong)
      await Promise.all(
        toWrite.map(async (coll) => {
          const docs = APP_DATA[coll];
          if (!docs || typeof docs !== 'object') return;
          const docList = Object.values(docs).filter((d) => d?.id);
          if (docList.length === 0) return;
          try {
            await this.#localDB.clear(coll); // xóa sạch store cũ
            await this.#localDB.putBatch(coll, docList); // ghi mới hoàn toàn
            this.#localDB.markSynced(coll); // đánh dấu TTL
            log(`🗑️→💾 IDB clear+putBatch [${coll}]: ${docList.length} docs`);
          } catch (e) {
            console.warn(`⚠️ IndexedDB clear+putBatch [${coll}] thất bại:`, e);
          }
        })
      );
    } else {
      // Delta / normal save: fire-and-forget — không block UI
      for (const coll of toWrite) {
        const docs = APP_DATA[coll];
        if (!docs || typeof docs !== 'object') continue;
        const docList = Object.values(docs).filter((d) => d?.id);
        if (docList.length > 0) {
          this.#localDB
            .putBatch(coll, docList)
            .then(() => this.#localDB.markSynced(coll))
            .catch((e) => console.warn(`⚠️ IndexedDB putBatch [${coll}] thất bại:`, e));
        }
      }
    }

    // Lưu metadata vào IndexedDB _sync_meta (không dùng localStorage)
    this.#localDB.setMeta('LAST_SYNC', Date.now().toString());
    this.#localDB.setMeta('LAST_SYNC_ROLE', window.CURRENT_USER?.role ?? '');
  }

  #startNotificationsListener() {
    if (this.#listeners['notifications']) return; // đã chạy

    const windowMs = this.#config.notificationsWindowMs;
    const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC');
    let lastSyncMs = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;

    const now = Date.now();

    // Lấy mốc quá khứ gần nhất giữa lastSync và (now - 72h)
    const cutoffMs = Math.max(lastSyncMs, now - windowMs);
    const cutoffDate = new Date(cutoffMs);

    log(`🔔 Notifications listener: query từ ${cutoffDate.toLocaleString()}`);

    // Admin: xóa các notification cũ hơn 3 ngày
    if (CURRENT_USER.role === 'admin') {
      const deleteCutoff = new Date(now - 3 * 24 * 60 * 60 * 1000);
      this.#db
        .collection('notifications')
        .where('created_at', '<', deleteCutoff)
        .get()
        .then((snap) => {
          if (snap.empty) return;
          const batch = this.#db.batch();
          snap.forEach((doc) => batch.delete(doc.ref));
          return batch.commit();
        })
        .then((result) => {
          if (result !== undefined) log(`🗑️ Đã xóa ${result === undefined ? 0 : 'các'} notifications cũ hơn 3 ngày`, 'info');
        })
        .catch((e) => console.warn('⚠️ Xóa old notifications thất bại:', e));
    }
    const query = this.#db.collection('notifications').where('created_at', '>=', cutoffDate);

    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        if (snapshot.empty) return;

        const dataChangeDocs = [];
        const notifDocs = [];

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') return;
          const doc = { id: change.doc.id, ...change.doc.data() };
          if (doc.type === 'data-change') dataChangeDocs.push(doc);
          else notifDocs.push(doc);
        });

        if (dataChangeDocs.length > 0) this.#autoSyncData(dataChangeDocs);
        if (notifDocs.length > 0) {
          window.dispatchEvent(new CustomEvent('new-notifications-arrived', { detail: notifDocs }));
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
      const ts = notif.created_at?.toMillis?.() ?? (notif.created_at?.seconds ? notif.created_at.seconds * 1000 : 0) ?? 0;

      const existing = deduped.get(key);
      if (!existing || ts > existing._ts) {
        deduped.set(key, { ...change, _ts: ts });
      }
    }

    if (deduped.size === 0) return;

    // ── 2. Áp dụng từng thay đổi ─────────────────────────────────────
    for (const [, change] of deduped) {
      await this.#applyLocalChange(change);
      log(`🔄 autoSyncData: ${JSON.stringify(change)} áp dụng`);
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
      case 's': // set — ghi đè toàn bộ document
      case 'u': // update — cập nhật các field
        this._updateAppDataObj(coll, { id, ...payload });
        break;

      case 'd': // delete
        this._removeFromAppDataObj(coll, id);
        break;

      case 'b': // batch
        if (typeof payload === 'string') {
          // payload là batch_id → batch lớn, fetch toàn bộ collection từ server
          log(`🔄 #applyLocalChange: batch lớn (batch_id=${payload}), reload từ server...`);
          await this.loadCollections(coll, { forceNew: true, batchId: payload });
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

      case 'i': // increment — payload: { fieldName, incrementBy }
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
   * Sort 1 collection in-place theo postSort config.
   *
   * Ưu tiên phát hiện kiểu theo thứ tự:
   *   1. Timestamp (Firestore Timestamp, JS Date, Unix ms)
   *   2. String ngày: ISO (YYYY-MM-DD[T...]) hoặc VN (DD/MM/YYYY)
   *   3. Số (number thuần hoặc string có dấu phân cách `,` `_`)
   *   4. Chuỗi thông thường — localeCompare tiếng Việt
   *
   * Hướng sắp xếp luôn theo `dir` trong QUERY_CONFIG (asc / desc).
   *
   * @param {string} collName - Tên collection
   * @param {object} collData - Dữ liệu dạng { docId: doc, ... }
   * @returns {object} Object đã sort
   */
  sortCollection(collName, collData, direction = null) {
    const cfg = DBManager.#QUERY_CONFIG[collName];
    if (!cfg?.postSort || !collData || typeof collData !== 'object') return collData;
    const { key, dir: configDir } = cfg.postSort;
    const dir = direction === 'desc' || direction === 'asc' ? direction : configDir;
    const items = Object.values(collData);
    if (items.length === 0) return collData;

    // ── Helpers ────────────────────────────────────────────────────────
    /** Firestore Timestamp / JS Date / Unix ms / ISO string / VN date string → ms hoặc null */
    const toTimestamp = (v) => {
      if (v?.toMillis) return v.toMillis(); // Firestore Timestamp
      if (v instanceof Date) return v.getTime(); // JS Date
      if (typeof v === 'number' && v > 1e10) return v; // Unix ms (> năm ~1973)
      if (typeof v === 'string' && v.trim() !== '') {
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
          // ISO: YYYY-MM-DD[T...]
          const ms = Date.parse(v);
          return isNaN(ms) ? null : ms;
        }
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // VN: DD/MM/YYYY
        if (m) {
          const ms = Date.parse(`${m[3]}-${m[2]}-${m[1]}`);
          return isNaN(ms) ? null : ms;
        }
      }
      return null;
    };

    /** Số thuần hoặc string số (có dấu , _ ngàn) → number hoặc null */
    const toNumber = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string' || v.trim() === '') return null;
      const cleaned = v.trim().replace(/[,_\s]/g, ''); // bỏ dấu phân cách
      const n = Number(cleaned);
      return isNaN(n) ? null : n;
    };

    // ── Comparator ────────────────────────────────────────────────────
    items.sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';

      // 1. Timestamp / Date
      const at = toTimestamp(av);
      const bt = toTimestamp(bv);
      if (at !== null && bt !== null) {
        const cmp = at - bt;
        return dir === 'desc' ? -cmp : cmp;
      }

      // 2. Số (kể cả string dạng số, có dấu phân cách)
      const an = toNumber(av);
      const bn = toNumber(bv);
      if (an !== null && bn !== null) {
        const cmp = an - bn;
        return dir === 'desc' ? -cmp : cmp;
      }

      // 3. Chuỗi thuần — A-Z (localeCompare tiếng Việt)
      const cmp = String(av).localeCompare(String(bv), 'vi', { sensitivity: 'base' });
      return dir === 'desc' ? -cmp : cmp;
    });
    const out = {};
    items.forEach((doc) => {
      if (doc?.id) out[doc.id] = doc;
    });
    return out;
  }

  /**
   * Áp dụng postSort cho tất cả collection có config — gọi sortCollection.
   * @param {object} [data] - APP_DATA hoặc bất kỳ data object nào (mặc định APP_DATA)
   */
  #applyAllPostSorts(data) {
    const target = data ?? APP_DATA;
    if (!target) return;
    for (const collName of Object.keys(DBManager.#QUERY_CONFIG)) {
      if (!target[collName]) continue;
      target[collName] = this.sortCollection(collName, target[collName]);
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
          console.warn(`⚠️ IndexedDB getAllAsObject [${coll}] thất bại:`, e);
          result[coll] = {};
        }
      })
    );
    return result;
  }

  /**
   * Rebuild toàn bộ secondary indexes từ primary collections trong APP_DATA.
   * Gọi sau khi nạp data từ IndexedDB (secondary indexes không được lưu trong IndexedDB).
   */
  #rebuildAllSecondaryIndexes() {
    if (!APP_DATA) return;
    // Reset secondary indexes
    DBManager.#INDEX_CONFIG.forEach(({ index }) => {
      APP_DATA[index] = {};
    });
    // Rebuild từ primary collections
    for (const { source, index, groupBy } of DBManager.#INDEX_CONFIG) {
      const coll = APP_DATA[source];
      if (!coll) continue;
      for (const doc of Object.values(coll)) {
        const groupKey = doc[groupBy];
        if (!groupKey) continue;
        if (!APP_DATA[index][groupKey]) APP_DATA[index][groupKey] = {};
        APP_DATA[index][groupKey][doc.id] = doc;
      }
    }
  }

  /**
   * Fetcher callback dùng cho localDB.autoSync().
   * Tải docs từ Firestore cho 1 collection (incremental nếu có sinceDate).
   *
   * @param {string} collName
   * @param {Date|null} sinceDate - Chỉ lấy docs có updated_at > sinceDate; null = full load
   * @returns {Promise<object[]>} Plain object array [{id, ...fields}]
   */
  async #fetchCollectionDocs(collName, sinceDate) {
    if (!this.#db) return [];
    const cfg = DBManager.#QUERY_CONFIG[collName];
    let query = this.#db.collection(collName);

    if (sinceDate) {
      // Incremental: chỉ lấy docs đã thay đổi kể từ lần sync trước
      query = query.where('updated_at', '>', sinceDate);
    } else {
      // Full load với limit
      const lim = cfg?.limit;
      if (lim) query = query.limit(lim);
    }

    const snap = await query.get();
    const docs = [];
    snap.forEach((doc) => docs.push({ id: doc.id, ...doc.data() }));
    return docs;
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

    log(`🔄 Background sync: ${staleColls.join(', ')}`);

    // FIX: Thay vì dùng autoSync (chỉ putBatch/merge → docs đã xóa vẫn còn trong IDB)
    // rồi getAllAsObject (full overwrite APP_DATA → khôi phục docs đã xóa),
    // ta fetch trực tiếp từ Firestore và áp dụng per-doc qua _updateAppDataObj.
    // _updateAppDataObj chỉ add/update — không bao giờ khôi phục docs đã xóa.
    for (const coll of staleColls) {
      try {
        const lastSyncStr = this.#localDB.getMeta(`LAST_SYNC_${coll}`);
        const since = lastSyncStr ? new Date(parseInt(lastSyncStr, 10)) : null;

        // Chỉ lấy docs thay đổi/thêm mới từ Firestore — docs đã xóa KHÔNG được trả về
        const docs = await this.#fetchCollectionDocs(coll, since);

        if (docs?.length > 0) {
          // Ghi vào IDB (merge — cho lần tải trang sau)
          await this.#localDB.putBatch(coll, docs);

          // Merge vào APP_DATA theo từng doc — không ghi đè toàn bộ collection
          for (const doc of docs) {
            this._updateAppDataObj(coll, doc); // cũng cập nhật secondary indexes
          }

          // Sắp xếp lại sau khi merge
          if (APP_DATA?.[coll]) {
            APP_DATA[coll] = this.sortCollection(coll, APP_DATA[coll]);
          }

          log(`📥 Background sync [${coll}]: +${docs.length} docs`);
        }

        // Cập nhật TTL kể cả khi không có doc mới (tránh sync liên tục)
        this.#localDB.markSynced(coll);
      } catch (e) {
        console.warn(`⚠️ Background sync [${coll}] thất bại:`, e);
      }
    }

    log(`✅ Background sync hoàn tất: ${staleColls.join(', ')}`);
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
    // Smart delta chỉ áp dụng khi role có quyền truy cập bookings
    if (!roleColls.includes('bookings')) {
      log('🔍 Smart Delta: role không có bookings — fallback backgroundSync');
      return this.#backgroundSync(roleColls);
    }

    const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC_DELTA');
    const lastSyncDate = lastSyncRaw ? new Date(parseInt(lastSyncRaw, 10)) : null;

    // Chưa bao giờ sync delta → cần sync tất cả collections
    if (!lastSyncDate) {
      log('🔍 Smart Delta: chưa có LAST_SYNC_DELTA — sync tất cả...');
      await this.syncDelta(roleColls, false);
      return;
    }

    try {
      // ── Probe bookings: chỉ cần biết có ít nhất 1 doc mới ──
      const probeSnap = await this.#db.collection('bookings').where('updated_at', '>', lastSyncDate).limit(1).get();

      if (probeSnap.empty) {
        log('🔍 Smart Delta: bookings không có dữ liệu mới — bỏ qua');
        return;
      }

      // ── Có dữ liệu mới → sync tất cả collections (bookings + các collection khác) ──
      const otherColls = roleColls.filter((c) => c !== 'bookings');
      log(`🔍 Smart Delta: phát hiện bookings mới → sync bookings + ${otherColls.length} collection(s) khác`);
      await this.syncDelta(roleColls, false);
    } catch (e) {
      console.warn('⚠️ Smart Delta Sync thất bại:', e);
    }
  }

  /**
   * Hàm DUY NHẤT tải collection(s) từ Firestore vào APP_DATA.
   * Mọi nơi cần fetch data từ Firestore đều phải gọi qua hàm này.
   *
   * @param {string|string[]|null} [collections=null]
   *   - null     → lấy danh sách mặc định từ COLL_MANIFEST theo role hiện tại
   *   - string   → tải 1 collection
   *   - string[] → tải nhiều collections
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

    const { forceNew = false, deltaSync = false, batchId = null, limit: limitOverride = null } = options;

    // ── Xác định danh sách collections ───────────────────────────────
    let collList;
    if (!collections) {
      const role = window.CURRENT_USER?.role ?? null;
      collList = (COLL_MANIFEST?.[role] ?? ['bookings', 'booking_details', 'operator_entries', 'customers']).filter((c) => c !== 'users');
      // Loại trừ các collections đã được chọn trong UI filter (btn-select-datalist)
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

    // Loại bỏ secondary index names — không phải Firestore collection thật
    const indexNames = new Set(DBManager.#INDEX_CONFIG.map((c) => c.index));
    collList = collList.filter((c) => !indexNames.has(c));

    if (collList.length === 0) return 0;

    // ── Delta: mốc thời gian cho updated_at filter ────────────────────
    const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC_DELTA');
    const lastSyncDate = deltaSync && lastSyncRaw ? new Date(parseInt(lastSyncRaw)) : null;

    log(`📚 loadCollections (role=${CURRENT_USER?.role ?? '-'}, delta=${deltaSync}, force=${forceNew}): ${collList.join(', ')}`);

    showLoading(true);
    try {
      const counts = await Promise.all(
        collList.map(async (collName) => {
          const cfg = DBManager.#QUERY_CONFIG[collName];
          const isMissingData = !APP_DATA[collName] || Object.keys(APP_DATA[collName]).length === 0;
          try {
            // ── Build query ───────────────────────────────────────────────────────
            // ⚠️  KHÔNG dùng orderBy() trong Firestore query:
            //     Firestore v8 loại trừ mọi doc thiếu field orderBy khỏi kết quả
            //     → mất dữ liệu âm thầm. Ordering luôn thực hiện client-side.
            let query = this.#db.collection(collName);

            if (deltaSync && lastSyncDate && !isMissingData && !forceNew) {
              // Delta mode: chỉ lấy docs có updated_at thay đổi sau lần sync cuối
              query = query.where('updated_at', '>', lastSyncDate);
            } else if (batchId) {
              // Large-batch reload: lọc theo batchId
              query = query.where('batchId', '==', batchId);
            } else {
              // Full load: KHÔNG thêm orderBy, chỉ giới hạn số docs nếu có config
              const lim = limitOverride ?? cfg?.limit;
              if (lim) query = query.limit(lim);
            }

            const snap = await query.get();
            if (snap.empty) return 0;

            const isDelta = deltaSync && lastSyncDate && !isMissingData && !forceNew;
            if (!isDelta) {
              // Full replace — reset primary + secondary indexes rồi hydrate
              APP_DATA[collName] = {};
              DBManager.#INDEX_CONFIG
                .filter((c) => c.source === collName)
                .forEach(({ index }) => {
                  APP_DATA[index] = {};
                });
              this.#hydrateCollection(APP_DATA, collName, snap);
              // Client-side post-sort
              APP_DATA[collName] = this.sortCollection(collName, APP_DATA[collName]);
              log(`✅ [${collName}] full load: ${snap.size} docs`);
            } else {
              // Delta merge — chỉ cập nhật/thêm docs thay đổi
              snap.forEach((doc) => {
                this._updateAppDataObj(collName, { id: doc.id, ...doc.data() });
              });
              log(`✅ [${collName}] delta: ${snap.size} docs mới/thay đổi`);
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
        await this.#saveAppDataCache(collList, forceNew); // forceNew → xóa store cũ trước khi ghi
        if (typeof initBtnSelectDataList === 'function') initBtnSelectDataList();
      }
      return total;
    } catch (e) {
      log('❌ loadCollections thất bại:', e);
      return 0;
    } finally {
      showLoading(false);
    }
  }

  syncDelta = async (collection, forceFullLoad = false) => {
    try {
      showLoading(true);
      const lastSync = this.#localDB.getMeta('LAST_SYNC_DELTA');
      const lastSyncDate = lastSync ? new Date(parseInt(lastSync)) : null;
      let collectionsToSync;

      if (collection) {
        // Hỗ trợ cả string ('bookings') lẫn array (['bookings', 'customers', ...])
        collectionsToSync = Array.isArray(collection) ? collection : [collection];
      } else {
        const role = CURRENT_USER.role;
        // Dùng #getRoleCollections — nguồn chân lý duy nhất (không duplicate roleMap)
        const roleColls = this.#getRoleCollections(role);
        const dataListSelect = getE('btn-select-datalist');
        const selectedColls = dataListSelect
          ? Array.from(dataListSelect.querySelectorAll('option'))
              .map((opt) => opt.value)
              .filter(Boolean)
          : [];
        // Union: roleColls + select options, khử trùng
        collectionsToSync = [...new Set([...roleColls, ...selectedColls])];
      }
      // Loại bỏ secondary index names — không phải Firestore collection thật
      const _indexNames = new Set(DBManager.#INDEX_CONFIG.map((c) => c.index));
      collectionsToSync = collectionsToSync.filter((c) => !_indexNames.has(c));

      log(`🔄 Sync Delta: ${collectionsToSync.length} collection(s) to sync`);

      if (collectionsToSync.length === 0) return 0;

      const results = await Promise.all(
        collectionsToSync.map(async (colName) => {
          const isMissingData = !APP_DATA[colName] || Object.keys(APP_DATA[colName]).length === 0;

          let query;
          let cfg = DBManager.#QUERY_CONFIG[colName];
          let limit = cfg?.limit || 1000;
          if (isMissingData || !lastSyncDate || forceFullLoad) {
            // ⚠️ KHÔNG dùng orderBy() — Firestore v8 loại trừ mọi doc thiếu field orderBy
            //    → mất dữ liệu âm thầm. Ordering thực hiện client-side qua sortCollection.
            query = this.#db.collection(colName).limit(limit);
            log(`[${colName}] Full load (forceFullLoad=${forceFullLoad}): limit=${limit}`);
          } else {
            query = this.#db.collection(colName).where('updated_at', '>', lastSyncDate);
          }

          const querySnapshot = await query.get();

          if (!querySnapshot.empty) {
            log(`[${colName}] Đang xử lý ${querySnapshot.size} bản ghi.`);
            if (isMissingData || forceFullLoad) {
              // Full reload: reset primary collection + secondary indexes liên quan
              APP_DATA[colName] = {};
              DBManager.#INDEX_CONFIG
                .filter((c) => c.source === colName)
                .forEach(({ index }) => {
                  APP_DATA[index] = {};
                });
              querySnapshot.forEach((doc) => {
                this._updateAppDataObj(colName, { id: doc.id, ...doc.data() });
              });
              // Client-side sort sau khi toàn bộ docs đã nạp
              APP_DATA[colName] = this.sortCollection(colName, APP_DATA[colName]);
            } else {
              // Delta: chỉ cập nhật/thêm docs thay đổi, secondary indexes tự cập nhật qua _updateAppDataObj
              querySnapshot.forEach((doc) => {
                this._updateAppDataObj(colName, { id: doc.id, ...doc.data() });
              });
            }

            log(`[SYNC DELTA][${colName}] Cập nhật APP_DATA với ${querySnapshot.size} bản ghi thay đổi.`);
            return querySnapshot.size;
          }
          return 0;
        })
      );

      const totalChanges = results.reduce((a, b) => a + b, 0);

      if (totalChanges > 0) {
        await this.#saveAppDataCache(collectionsToSync, forceFullLoad); // forceFullLoad → xóa store cũ trước khi ghi
        initBtnSelectDataList();
      }
      this.#localDB.setMeta('LAST_SYNC_DELTA', Date.now().toString());
      logA(`✅ Sync Delta hoàn tất. Tổng bản ghi thay đổi: ${totalChanges}`);

      return totalChanges;
    } catch (e) {
      logError(`Lỗi syncDelta (Hybrid): `, e);
      return 0;
    } finally {
      showLoading(false);
    }
  };

  /**
   * Tải meta: app_config + users.
   * @param {object} result
   */
  async loadMeta(result) {
    // ★ FIX: đảm bảo result.lists và result.users tồn tại trước khi ghi
    if (!result.lists) result.lists = {};
    if (!result.users) result.users = {};

    const [cfgSnap, usersSnap] = await Promise.all([this.#db.collection('app_config').doc('current').get(), this.#db.collection('users').get()]);

    // app_config
    if (cfgSnap?.exists) {
      const rawCfg = cfgSnap.data();
      log(`📋 app_config/current: ${Object.keys(rawCfg).length} keys`);
      for (const k in rawCfg) {
        try {
          result.lists[k] = typeof rawCfg[k] === 'string' && rawCfg[k].startsWith('[') ? JSON.parse(rawCfg[k]) : rawCfg[k];
        } catch {
          result.lists[k] = rawCfg[k];
        }
      }
    } else {
      log('⚠️ app_config/current không tồn tại — lists sẽ rỗng');
    }

    // users
    const staffList = [];
    usersSnap?.forEach((doc) => {
      result.users[doc.id] = { id: doc.id, ...doc.data() };
      staffList.push(doc.data().user_name || 'No Name');
    });
    result.lists.staff = staffList;
  }

  // Dùng cho .get() — snapshot.forEach() là đúng
  #hydrateCollection(result, collName, snapshot) {
    if (!result[collName]) result[collName] = {};
    snapshot.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() };
      result[collName][doc.id] = data;
      this.#buildSecondaryIndexes(result, collName, data);
    });
  }

  #buildSecondaryIndexes(result, collName, data) {
    DBManager.#INDEX_CONFIG
      .filter((cfg) => cfg.source === collName)
      .forEach(({ index, groupBy }) => {
        const groupKey = data[groupBy];
        if (!groupKey) return;
        if (!result[index]) result[index] = {};
        if (!result[index][groupKey]) result[index][groupKey] = {};
        result[index][groupKey][data.id] = data;
      });
  }

  // ─── Private: Build Empty Result ─────────────────────────────────────

  #buildEmptyResult() {
    const primaryColls = ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions', 'suppliers', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'hotels', 'hotel_price_schedules', 'service_price_schedules', 'users'];

    APP_DATA = { lists: {}, currentUser: {} };

    // Primary flat indexes
    primaryColls.forEach((c) => {
      APP_DATA[c] = {};
    });

    // Secondary grouped indexes
    DBManager.#INDEX_CONFIG.forEach(({ index }) => {
      APP_DATA[index] = {};
    });

    return APP_DATA;
  }

  // ─── Sync Trigger ─────────────────────────────────────────────────────
  /**
   * Đồng bộ 1 booking_detail row sang collection operator_entries.
   *
   * Chỉ sync các field có trong booking_details → operator_entries:
   *   - id, booking_id, customer_full_name (từ booking header)
   *   - service_type, hotel_name, service_name
   *   - check_in, check_out, nights
   *   - quantity → adults
   *   - child_qty → children
   *   - surcharge, discount
   *   - total → total_sale
   *   - ref_code
   *
   * Các field operator-only (cost_adult, cost_child, total_cost,
   * paid_amount, debt_balance, supplier, operator_note) KHÔNG ghi đè
   * — dùng merge:true để giữ nguyên giá trị đã có.
   *
   * @param {object|Array} detailRow - booking_detail dạng object hoặc array
   * @param {string} [customerName=''] - Tên khách từ booking header (bookings.customer_full_name)
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async _syncOperatorEntry(detailRow, customerName = '') {
    // ── 1. FORMAT DETECTION ───────────────────────────────────────────
    const isObj = typeof detailRow === 'object' && !Array.isArray(detailRow);
    const f = (objKey, arrIdx) => (isObj ? detailRow[objKey] : detailRow[arrIdx]);

    // ── 2. EXTRACT FIELDS từ booking_details schema ───────────────────
    // index 0  → id
    const d_id = f('id', COL_INDEX.D_SID);
    // index 1  → booking_id
    const d_bkid = f('booking_id', COL_INDEX.D_BKID);
    // index 2  → service_type
    const d_type = f('service_type', COL_INDEX.D_TYPE);
    // index 3  → hotel_name
    const d_hotel = f('hotel_name', COL_INDEX.D_HOTEL);
    // index 4  → service_name
    const d_service = f('service_name', COL_INDEX.D_SERVICE);
    // index 5  → check_in
    const d_in = f('check_in', COL_INDEX.D_IN);
    // index 6  → check_out
    const d_out = f('check_out', COL_INDEX.D_OUT);
    // index 7  → nights
    const d_night = f('nights', COL_INDEX.D_NIGHT);
    // index 8  → quantity  (→ operator_entries.adults)
    const d_qty = f('quantity', COL_INDEX.D_QTY);
    // index 10 → child_qty (→ operator_entries.children)
    const d_childQty = f('child_qty', COL_INDEX.D_CHILD);
    // index 12 → surcharge
    const d_sur = f('surcharge', COL_INDEX.D_SUR);
    // index 13 → discount
    const d_disc = f('discount', COL_INDEX.D_DISC);
    // index 14 → total    (→ operator_entries.total_sale)
    const d_total = f('total', COL_INDEX.D_TOTAL);
    // index 15 → ref_code
    const d_code = f('ref_code', COL_INDEX.D_CODE);

    // ── 3. GUARD: id bắt buộc hợp lệ ────────────────────────────────
    if (!d_id || String(d_id).trim() === '' || String(d_id) === 'undefined') {
      log(`[_syncOperatorEntry] ❌ Bỏ qua: id không hợp lệ (${d_id})`, 'warning');
      return { success: false, error: 'Invalid id' };
    }
    if (!customerName || String(customerName).trim() === '') {
      const bkidInfo = APP_DATA.bookings?.[d_bkid]?.customer_full_name;
      if (bkidInfo) {
        customerName = bkidInfo;
      }
    }

    // ── 4. BUILD syncData ─────────────────────────────────────────────
    // CHỈ ghi các field lấy từ booking_details
    // Các field operator-only (cost_adult, cost_child, ...) KHÔNG có ở đây
    // → dùng merge:true để không xóa chúng nếu đã tồn tại
    const syncData = {
      id: String(d_id),
      booking_id: d_bkid || '',
      customer_full_name: customerName || '',
      service_type: d_type || '',
      hotel_name: d_hotel || '',
      service_name: d_service || '',
      check_in: d_in ? formatDateISO(d_in) : '',
      check_out: d_out ? formatDateISO(d_out) : '',
      nights: Number(d_night) || 0,
      adults: Number(d_qty) || 0, // booking_details.quantity
      children: Number(d_childQty) || 0, // booking_details.child_qty
      surcharge: Number(d_sur) || 0,
      discount: Number(d_disc) || 0,
      total_sale: Number(d_total) || 0, // booking_details.total
      ref_code: d_code || '',
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // ── 5. GHI FIRESTORE (merge:true = không xóa operator-only fields) ─
    const res = await this.#firestoreCRUD('operator_entries', 'set', syncData.id, syncData, {
      merge: true,
    });
    if (res.success) {
      this._updateAppDataObj('operator_entries', syncData);
    } else {
      log(`[_syncOperatorEntry] ❌ Firestore lỗi: ${res.error}`, 'error');
    }
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
    if (!this.#db) return { success: false, error: 'DB chưa init' };
    if (!collection) return { success: false, error: 'Thiếu collection' };

    // ── Logging / Audit hook ────────────────────────────────────────────
    const actor = window.CURRENT_USER?.name ?? 'system';
    const target = id ? `${collection}/${id}` : collection;
    log(`[CRUD] ${actor} | ${action.toUpperCase()} | ${target}`);

    // ── Ghi nhận dữ liệu trước khi thay đổi (cho delete/update) ────────
    const originalData = id ? (APP_DATA?.[collection]?.[id] ?? null) : null;

    try {
      // ── Nếu được truyền batchRef từ ngoài → gắn vào batch, KHÔNG commit ─
      if (options.batchRef) {
        if (!id) return { success: false, error: 'Cần id khi dùng batchRef' };
        const ref = this.#db.collection(collection).doc(String(id));
        if (action === 'set') options.batchRef.set(ref, data, { merge: options.merge ?? true });
        else if (action === 'update') options.batchRef.update(ref, data);
        else if (action === 'delete') options.batchRef.delete(ref);
        else return { success: false, error: `batchRef không hỗ trợ action: ${action}` };
        return { success: true };
      }

      let opResult;

      switch (action) {
        case 'get': {
          const snap = await this.#db.collection(collection).orderBy('id', 'desc').limit(2000).get();
          if (snap.empty) return { success: false, error: 'Collection không tồn tại' };
          opResult = {
            success: true,
            data: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          };
          return opResult;
        }
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
          if (!id) return { success: false, error: 'Cần id cho action increment' };
          if (!options.fieldName) return { success: false, error: 'Thiếu options.fieldName' };
          const ref = this.#db.collection(collection).doc(String(id));
          await ref.update({
            [options.fieldName]: firebase.firestore.FieldValue.increment(options.incrementBy ?? 1),
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
          const batchId = isLargeBatch ? `${collection}_batch_${Date.now()}` : null;

          const BATCH_LIMIT = 499;
          let firestoreBatch = this.#db.batch();
          let opCount = 0;
          let totalCommitted = 0;

          for (const item of items) {
            const ref = this.#db.collection(collection).doc(String(item.docId));
            const op = item.op ?? 'set';
            // Nhúng batch_id vào các doc được ghi (không phải delete) khi batch lớn
            const docData = isLargeBatch && op !== 'delete' && item.docData ? { ...item.docData, batch_id: batchId } : item.docData;

            if (op === 'set') firestoreBatch.set(ref, docData, { merge: options.merge ?? true });
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
            const batchPayload = isLargeBatch ? batchId : items.map((it) => ({ id: it.docId, action: it.op ?? 'set', data: it.docData }));

            const batchNotif = {
              id: notifId,
              type: 'data-change',
              collection: collection,
              action: 'b',
              data: JSON.stringify({
                coll: collection,
                id: null,
                action: 'b',
                payload: batchPayload,
              }),
              payload: batchPayload,
              created_at: firebase.firestore.FieldValue.serverTimestamp(),
              created_by: actor,
            };

            this.#db
              .collection('notifications')
              .doc(notifId)
              .set(batchNotif, { merge: false })
              .catch((e) => console.warn('⚠️ Không thể tạo batch notification:', e));
          }

          // ── Ghi booking history cho batch (fire-and-forget) ─────────
          this.#recordBatchBookingHistory(collection, items, actor);

          opResult = { success: true, count: totalCommitted };
          break;
        }

        default:
          return { success: false, error: `Action không hợp lệ: "${action}"` };
      }

      // ── Tạo notification data-change (fire-and-forget) ──────────────
      // Bỏ qua khi: ghi vào 'notifications' (tránh vòng lặp vô tận)
      //             hoặc action='batch' (đã xử lý notification ngay trong case 'batch')
      const noUpdateColls = ['notifications', 'counters_id', 'app_config'];
      if (!noUpdateColls.includes(collection) && action !== 'batch') {
        const actionCode = { set: 's', update: 'u', delete: 'd', increment: 'i' }[action] ?? action;
        const notifId = `${collection}_${id ?? 'x'}_${Date.now()}`;

        const notifDoc = {
          id: notifId,
          type: 'data-change',
          collection: collection,
          action: actionCode,
          data: JSON.stringify({ coll: collection, id, action: actionCode, payload: data }),
          payload: data,
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
          created_by: actor,
        };

        if (originalData) notifDoc.original_data = originalData;

        this.#db
          .collection('notifications')
          .doc(notifId)
          .set(notifDoc, { merge: false })
          .catch((e) => console.warn('⚠️ Không thể tạo notification:', e));
      }

      // Ghi booking history (skip transactions không xác định được booking_id)
      if (DBManager.#HISTORY_COLLS.has(collection)) {
        const skipHistory = collection === 'transactions' && !originalData?.booking_id && !data?.booking_id;
        if (!skipHistory) this.#recordBookingHistory(collection, action, id, data, actor, originalData);
      }

      return opResult;
    } catch (e) {
      console.error(`[CRUD ERROR] ${action.toUpperCase()} ${collection}/${id ?? '*'}:`, e);
      return { success: false, error: e.message };
    }
  }

  // ─── Booking History ────────────────────────────────────────────────

  /**
   * Xác định booking_id từ collection / data / APP_DATA.
   * @param {string} collection
   * @param {string|null} id
   * @param {object|null} data
   * @param {object|null} originalData - Dữ liệu trước khi thay đổi (cho delete)
   * @returns {string|null}
   */
  #resolveBookingId(collection, id, data, originalData) {
    if (collection === 'bookings') return id;
    // Lấy từ data trước, fallback về APP_DATA (cho delete khi data=null)
    return data?.booking_id ?? originalData?.booking_id ?? APP_DATA?.[collection]?.[id]?.booking_id ?? null;
  }

  /**
   * Tạo mô tả hành động cho history entry.
   * @param {string} collection
   * @param {string} action - 'set'|'update'|'delete'|'increment'|'batch'
   * @param {string|null} id
   * @param {object|null} data
   * @param {object|null} originalData
   * @returns {string}
   */
  #buildHistoryDetail(collection, action, id, data, originalData) {
    const collLabel = { bookings: 'Booking', booking_details: 'Dịch Vụ', transactions: 'Giao dịch' }[collection] ?? collection;
    const isNew = action === 'set' && !originalData && !APP_DATA?.[collection]?.[id];
    const actionLabel = action === 'delete' ? 'Xóa' : isNew ? 'Tạo Mới' : 'Cập Nhật';

    let detail = `${actionLabel} ${collLabel}:`;

    // Bổ sung chi tiết tùy collection
    if (collection === 'booking_details') {
      const svc = data?.service_name ?? originalData?.service_name ?? '';
      const hotel = data?.hotel_name ?? originalData?.hotel_name ?? '';
      const type = data?.service_type ?? originalData?.service_type ?? '';

      if (hotel && type === 'Phòng') detail += ` [${type} ${hotel} - ${svc}]`;
      else detail += ` [${type}: ${svc}]`;
      // if (id) detail += ` (${id})`;
    } else if (collection === 'transactions') {
      const type = data?.type ?? originalData?.type ?? '';
      const amount = data?.amount ?? originalData?.amount ?? '';
      if (type && amount) detail += ` ${type === 'IN' ? 'Đã Nhận' : 'Đã Chi'} ${typeof amount === 'number' ? amount.toLocaleString('vi-VN') : amount}`;
      if (id) detail += ` Số (${id})`;
    }
    // Bổ sung chi tiết thay đổi: field: oldVal → newVal (chỉ cho update)
    if (action !== 'delete' && originalData && data) {
      const SKIP_FIELDS = new Set(['id', 'updated_at', 'created_at', 'history', 'edit_history', 'batch_id']);
      const changed = Object.keys(data).filter((f) => !SKIP_FIELDS.has(f) && JSON.stringify(originalData[f]) !== JSON.stringify(data[f]));
      if (changed.length) {
        const fmtVal = (v) => {
          if (v === undefined || v === null || v === '') return '(trống)';
          if (typeof v === 'number') return v.toLocaleString('vi-VN');
          if (typeof v === 'date') return A.Lang.fd(v);
          const s = String(v);
          return s.length > 30 ? s.slice(0, 27) + '...' : s;
        };
        const parts = changed.map((f) => `${A.Lang.t(f)}: ${fmtVal(originalData[f])} → ${fmtVal(data[f])}`);
        detail += ` | ${parts.join(', ')}`;
      }
    }
    return detail;
  }

  /**
   * Ghi 1 entry vào bookings/{bookingId}.history (arrayUnion — fire-and-forget).
   * Format: "[DD/MM/YYYY HH:mm] $Action $detail cho Booking $id - $staff"
   *
   * @param {string} collection - Tên collection vừa thay đổi
   * @param {string} action     - 'set'|'update'|'delete'|'increment'|'batch'
   * @param {string|null} id    - Document ID
   * @param {object|null} data  - Dữ liệu mới
   * @param {string} actor      - Người thực hiện (CURRENT_USER.name)
   * @param {object|null} [originalData=null] - Dữ liệu trước khi thay đổi
   */
  #recordBookingHistory(collection, action, id, data, actor, originalData = null) {
    if (action === 'get' || action === 'batch') return; // batch xử lý riêng bên trong case 'batch'

    const bookingId = this.#resolveBookingId(collection, id, data, originalData);
    if (!bookingId) return;

    const detail = this.#buildHistoryDetail(collection, action, id, data, originalData);
    const entry = this.#formatHistoryEntry(detail, bookingId, actor);

    this.#appendBookingHistory(bookingId, entry);
  }

  /**
   * Ghi history cho batch operations.
   * Ghi chi tiết từng item (service_name, changed fields), gom theo booking_id.
   *
   * @param {string} collection
   * @param {Array} items - [{docId, docData, op}]
   * @param {string} actor
   */
  #recordBatchBookingHistory(collection, items, actor) {
    if (!DBManager.#HISTORY_COLLS.has(collection)) return;
    if (!items || items.length === 0) return;

    // Gom chi tiết từng item theo booking_id
    const grouped = new Map(); // bookingId → detail strings[]
    for (const item of items) {
      const originalData = APP_DATA?.[collection]?.[item.docId] ?? null;
      const bkId = this.#resolveBookingId(collection, item.docId, item.docData, originalData);
      if (!bkId) continue;

      const action = item.op ?? 'set';
      const detail = this.#buildHistoryDetail(collection, action, item.docId, item.docData, originalData);

      if (!grouped.has(bkId)) grouped.set(bkId, []);
      grouped.get(bkId).push(detail);
    }

    for (const [bkId, details] of grouped) {
      // Ghi 1 entry tổng hợp cho mỗi booking (gộp detail bằng '; ')
      const combined = details.length === 1 ? details[0] : `Batch ${details.length}: ${details.join('; ')}`;
      const entry = this.#formatHistoryEntry(combined, bkId, actor);
      this.#appendBookingHistory(bkId, entry);
    }
  }

  /**
   * Format history entry string.
   * @param {string} detail
   * @param {string} bookingId
   * @param {string} actor
   * @returns {string}
   */
  #formatHistoryEntry(detail, bookingId, actor) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return `[${ts} bởi ${actor}] ${detail}`;
  }

  /**
   * Append 1 entry vào bookings/{bookingId}.history bằng arrayUnion.
   * Fire-and-forget — không block caller.
   *
   * @param {string} bookingId
   * @param {string} entry - Chuỗi history đã format
   */
  #appendBookingHistory(bookingId, entry) {
    if (!this.#db || !bookingId || !entry) return;

    this.#db
      .collection('bookings')
      .doc(String(bookingId))
      .update({
        history: firebase.firestore.FieldValue.arrayUnion(entry),
      })
      .then(() => {
        // Cập nhật APP_DATA local (nếu booking đang có trong memory)
        if (APP_DATA?.bookings?.[bookingId]) {
          if (!Array.isArray(APP_DATA.bookings[bookingId].history)) {
            APP_DATA.bookings[bookingId].history = [];
          }
          APP_DATA.bookings[bookingId].history.push(entry);
        }
      })
      .catch((e) => console.warn(`⚠️ Ghi booking history thất bại [${bookingId}]:`, e));
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

  // ─── CRUD ─────────────────────────────────────────────────────────────

  getCollection = async (collectionName) => {
    const res = await this.#firestoreCRUD(collectionName, 'get');
    this._updateAppDataObj(collectionName, res.data);
    return res.data;
  };

  saveRecord = async (collectionName, dataArray, isBatch = false, batchRef = null) => {
    let dataObj;
    let isNew;

    if (typeof dataArray === 'object' && !Array.isArray(dataArray)) {
      dataObj = dataArray;
    } else {
      log(`Converting array to object for ${collectionName} saving...`);
      dataObj = this.#schema.arrayToObject(dataArray, collectionName);
    }
    let docId = dataObj.id;

    if (!docId || docId === '') {
      let bookingId = null;
      if (collectionName === 'booking_details') bookingId = dataObj.booking_id || dataArray[COL_INDEX.D_BKID];

      const idResult = await this.generateIds(collectionName, bookingId);
      if (!idResult) return { success: false, message: 'Failed to generate ID' };

      docId = idResult.newId;
      dataObj.id = docId;
      if (Array.isArray(dataArray)) dataArray[0] = docId;
      isNew = true;
    }

    if (!docId) {
      console.error('❌ Lỗi: Dữ liệu thiếu ID', dataArray);
      return { success: false, message: 'Missing ID' };
    }

    dataObj.updated_at = firebase.firestore.FieldValue.serverTimestamp();

    if (isBatch && batchRef) {
      return this.#firestoreCRUD(collectionName, 'set', docId, dataObj, { batchRef, merge: true });
    }

    try {
      const writeResult = await this.#firestoreCRUD(collectionName, 'set', docId, dataObj);
      if (!writeResult.success) throw new Error(writeResult.error);

      this._updateAppDataObj(collectionName, dataObj);

      if (collectionName === 'booking_details') {
        await this._syncOperatorEntry(dataArray);
        if (!isNew) A.NotificationManager.sendToOperator(`Booking Detail ${dataObj.id} cập nhật!`, `Khách: ${dataObj.customer_full_name || dataArray[COL_INDEX.M_CUST] || 'Unknown'} cập nhật DV ${dataObj.service_name || dataArray[COL_INDEX.D_SERVICE] || 'Unknown'}`);
      } else if (collectionName === 'bookings') {
        if (isNew) A.NotificationManager.sendToOperator(`Booking ${dataObj.id} mới!`, `Khách: ${dataObj.customer_full_name || dataArray[COL_INDEX.M_CUST] || 'Unknown'}`);
      }
      return { success: true, id: docId };
    } catch (e) {
      console.error('Save Error:', e);
      await this._updateCounter(collectionName, this.batchCounterUpdates[collectionName] - 1);
      delete this.batchCounterUpdates[collectionName];
      return { success: false, error: e.message };
    }
  };

  batchSave = async (collectionName, dataArrayList) => {
    if (!dataArrayList || dataArrayList.length === 0) return;

    // ── 0. Customer name lookup ───────────────────────────────────────
    let customerName = '';
    const bkId = Array.isArray(dataArrayList[0]) ? dataArrayList[0][1] : dataArrayList[0].booking_id;
    const bkRef = this.#db.collection('bookings').doc(String(bkId));
    const bkSnap = await bkRef.get();
    if (bkSnap.exists) customerName = bkSnap.data().customer_full_name || 'null';
    else log('Booking not found ' + bkId);

    // ── 1. Pre-generate IDs (1 read + 1 write per unique prefix) ─────📦 Saved chunk
    // Gom tất cả rows thiếu ID, sinh hàng loạt thay vì từng cái một.
    this.batchCounterUpdates = {};

    const rowsNeedingId = dataArrayList.filter((row) => {
      const rowId = Array.isArray(row) ? row[0] : row.id;
      return !rowId || rowId === '';
    });

    if (rowsNeedingId.length > 0) {
      if (collectionName === 'booking_details') {
        // Group theo bookingId (mỗi prefix khác nhau)
        const groups = new Map(); // bookingId → rows[]
        for (const row of rowsNeedingId) {
          const gBkId = Array.isArray(row) ? row[COL_INDEX.D_BKID] : row.booking_id;
          if (!groups.has(gBkId)) groups.set(gBkId, []);
          groups.get(gBkId).push(row);
        }
        for (const [groupBkId, groupRows] of groups) {
          // 1 read + 1 write cho mỗi bookingId prefix
          const ids = await this.generateIdsBatch(collectionName, groupRows.length, groupBkId);
          groupRows.forEach((row, i) => {
            if (Array.isArray(row)) row[0] = ids[i];
            else row.id = ids[i];
          });
        }
      } else {
        // 1 read + 1 write cho toàn bộ batch
        const ids = await this.generateIdsBatch(collectionName, rowsNeedingId.length);
        rowsNeedingId.forEach((row, i) => {
          if (Array.isArray(row)) row[0] = ids[i];
          else row.id = ids[i];
        });
      }
      console.log(`🆔 Pre-generated ${rowsNeedingId.length} IDs for ${collectionName}`);
    }

    // ── 2. Batch save (chunks of 450) ────────────────────────────────
    const batchSize = 450;
    const chunks = [];
    for (let i = 0; i < dataArrayList.length; i += batchSize) chunks.push(dataArrayList.slice(i, i + batchSize));

    let totalSuccess = 0;
    const detailsForTrigger = [];
    const processedData = [...dataArrayList];

    for (const chunk of chunks) {
      const batch = this.#db.batch();

      // Phải await toàn bộ saveRecord trước khi commit —
      // saveRecord là async, nếu dùng forEach không await thì batch.commit()
      // chạy trước → lỗi "write batch can no longer be used after commit()"
      await Promise.all(
        chunk.map((row) => {
          if (collectionName === 'booking_details') detailsForTrigger.push(row);
          return this.saveRecord(collectionName, row, true, batch);
        })
      );

      try {
        await batch.commit();
        totalSuccess += chunk.length;
        console.log(`📦 Saved chunk: ${chunk.length} items to ${collectionName}`);
        chunk.forEach((row) => {
          const dataObj = typeof row === 'object' && !Array.isArray(row) ? row : this.#schema.arrayToObject(row, collectionName);
          this._updateAppDataObj(collectionName, dataObj);
        });
      } catch (e) {
        console.error(`❌ Batch Error in ${collectionName}:`, e);
      }
    }
    this.batchCounterUpdates = {};

    // ── 3. Trigger operator sync ──────────────────────────────────────
    if (collectionName === 'booking_details' && detailsForTrigger.length > 0) {
      for (const detailRow of detailsForTrigger) {
        if (typeof detailRow === 'object') detailRow.customer_full_name = customerName;
        else detailRow[COL_INDEX.M_CUST] = customerName;
        await this._syncOperatorEntry(detailRow);
      }
    }

    // ── 4. Ghi booking history (batchRef path không qua #recordBookingHistory) ──
    if (DBManager.#HISTORY_COLLS.has(collectionName) && totalSuccess > 0) {
      const actor = window.CURRENT_USER?.name ?? 'system';
      const items = processedData.map((row) => {
        const obj = typeof row === 'object' && !Array.isArray(row) ? row : this.#schema.arrayToObject(row, collectionName);
        return { docId: obj.id, docData: obj, op: 'set' };
      });
      this.#recordBatchBookingHistory(collectionName, items, actor);
    }

    return { success: true, count: totalSuccess, data: processedData };
  };

  deleteRecord = async (collectionName, id) => {
    if (!id) return;
    try {
      const res = await this.#firestoreCRUD(collectionName, 'delete', id);
      if (!res.success) throw new Error(res.error);
      this._removeFromAppDataObj(collectionName, id);

      if (collectionName === 'booking_details') {
        await this.#firestoreCRUD('operator_entries', 'delete', id);
        this._removeFromAppDataObj('operator_entries', id);
      }
      return { success: true, message: 'Deleted' };
    } catch (e) {
      logError('❌ Delete Error:', e);
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

      idList.forEach((id) => {
        this._removeFromAppDataObj(collectionName, id);
        if (collectionName === 'booking_details') this._removeFromAppDataObj('operator_entries', id);
      });
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
      });
      return res.success;
    } catch (e) {
      console.error(`❌ Error incrementing field for ${collectionName}/${docId}:`, e);
      return false;
    }
  };

  updateSingle = async (collectionName, id, objData) => {
    if (!collectionName || !objData) {
      console.warn('⚠️ updateDocument: Thiếu tham số');
      return { success: false, message: 'Missing required parameters' };
    }
    if (!objData.id || objData.id === '') {
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
  };

  batchUpdateFieldData = async (collectionName, fieldName, oldValue, newValue, ids = null, forceNew = false) => {
    console.time('⏱ Thời gian cập nhật');
    console.log(`🚀 Bắt đầu cập nhật ${collectionName}.${fieldName}: "${oldValue}" → "${newValue}"`);

    try {
      if (!collectionName || !fieldName) throw new Error('❌ Lỗi: collectionName và fieldName không được để trống');

      if (!this.#db) throw new Error('❌ Firestore DB chưa khởi tạo');

      const collSnap = await this.#db.collection(collectionName).get();
      console.log(`📦 Tìm thấy ${collSnap.size} documents.`);

      const batchItems = [];
      let totalUpdated = 0;
      let totalSkipped = 0;
      const idsSet = ids && Array.isArray(ids) ? new Set(ids.map((id) => String(id))) : null;

      for (const doc of collSnap.docs) {
        const data = doc.data();

        if (idsSet && !idsSet.has(String(doc.id))) {
          totalSkipped++;
          continue;
        }

        const isMatch = String(data[fieldName]).trim() === String(oldValue).trim();

        if (isMatch || forceNew) {
          const updateObj = {
            [fieldName]: newValue,
            updated_at: firebase.firestore.FieldValue.serverTimestamp(),
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
      console.log(`🎉 ${result.message}`);
      return result;
    } catch (error) {
      console.error(`❌ Lỗi: ${error.message}`);
      return { success: false, count: 0, message: `❌ Lỗi: ${error.message}` };
    } finally {
      console.timeEnd('⏱ Thời gian cập nhật');
    }
  };

  // ─── Queries ──────────────────────────────────────────────────────────

  runQuery = async (collectionName, fieldName, operator, value, fieldOrder = null, limit = null) => {
    if (!this.#db) {
      console.error('❌ DB chưa init');
      return null;
    }
    console.log(`🔍 Query on ${collectionName}: ${fieldName} ${operator} ${value}`);
    try {
      let query = this.#db.collection(collectionName).where(fieldName, operator, value);
      if (fieldOrder) query = query.orderBy(fieldOrder, 'desc');
      if (limit && limit > 0) query = query.limit(limit);

      const querySnap = await query.get();
      const results = [];
      querySnap.forEach((doc) => results.push(doc.data()));
      console.log(`✅ Query returned ${results.length} items from ${collectionName}`);
      return results;
    } catch (e) {
      console.error(`❌ Error running query on ${collectionName}:`, e);
      return null;
    }
  };

  // ─── ID Generation ────────────────────────────────────────────────────

  /**
   * Sinh N IDs liên tiếp cho 1 collection — chỉ đọc counter 1 lần và ghi 1 lần.
   * Dùng thay cho gọi generateIds() N lần trong batchSave.
   *
   * @param {string} collectionName
   * @param {number} count           - Số lượng IDs cần sinh
   * @param {string|null} bookingId  - Chỉ dùng cho booking_details (xác định prefix)
   * @returns {Promise<string[]>}    - Mảng IDs theo thứ tự
   */
  generateIdsBatch = async (collectionName, count, bookingId = null) => {
    if (!this.#db || count <= 0) return [];

    const counterRef = this.#db.collection('counters_id').doc(collectionName);

    try {
      const counterSnap = await counterRef.get(); // ★ 1 read duy nhất
      let lastNo = 0;
      let prefix = '';
      let useRandomId = false;

      if (counterSnap.exists) {
        if (collectionName === 'booking_details') prefix = bookingId ? `${bookingId}_` : 'SID_';
        else prefix = counterSnap.data().prefix || '';
        lastNo = Number(counterSnap.data().last_no) || 0;
      } else {
        // Suy ra lastNo từ doc mới nhất (giống generateIds)
        try {
          const latestSnap = await this.#db.collection(collectionName).orderBy('id', 'desc').limit(1).get();
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
          console.warn(`⚠️ generateIdsBatch: cannot derive lastNo for ${collectionName}:`, e);
          useRandomId = true;
        }
      }

      // Sinh N IDs trong memory
      const ids = [];
      for (let i = 0; i < count; i++) {
        if (useRandomId) {
          ids.push(`${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`.trim());
        } else {
          lastNo++;
          ids.push(`${prefix}${lastNo}`.trim());
        }
      }

      // ★ 1 write duy nhất — cập nhật counter về giá trị cuối cùng
      if (!useRandomId) {
        await this._updateCounter(collectionName, lastNo);
      }

      console.log(`🆔 [Batch] ${count} IDs for ${collectionName}: ${ids[0]} → ${ids[ids.length - 1]}`);
      return ids;
    } catch (e) {
      console.error(`❌ Error in generateIdsBatch for ${collectionName}:`, e);
      return [];
    }
  };

  generateIds = async (collectionName, bookingId = null) => {
    if (!this.#db) {
      console.error('❌ DB chưa init');
      return null;
    }

    const counterRef = this.#db.collection('counters_id').doc(collectionName);

    try {
      const counterSnap = await counterRef.get();
      let lastNo = 0;
      let prefix = '';
      let useRandomId = false;

      if (counterSnap.exists) {
        if (collectionName === 'booking_details') prefix = bookingId ? `${bookingId}_` : 'SID_';
        else prefix = counterSnap.data().prefix || '';
        lastNo = Number(counterSnap.data().last_no);
        if (lastNo && lastNo > 0) await this._updateCounter(collectionName, lastNo + 1);
      }

      if (!counterSnap.exists) {
        try {
          const latestSnap = await this.#db.collection(collectionName).orderBy('id', 'desc').limit(1).get();

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
  };

  // ─── Internal Helpers ─────────────────────────────────────────────────

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

    // 1. Cập nhật primary collection trong APP_DATA
    if (!APP_DATA[collectionName]) APP_DATA[collectionName] = {};
    APP_DATA[collectionName][dataObj.id] = {
      ...APP_DATA[collectionName][dataObj.id],
      ...dataObj,
    };

    // 2. Cập nhật secondary indexes liên quan
    DBManager.#INDEX_CONFIG
      .filter((cfg) => cfg.source === collectionName)
      .forEach(({ index, groupBy }) => {
        const groupKey = dataObj[groupBy];
        if (!groupKey) return;

        if (!APP_DATA[index]) APP_DATA[index] = {};
        if (!APP_DATA[index][groupKey]) APP_DATA[index][groupKey] = {};

        APP_DATA[index][groupKey][dataObj.id] = APP_DATA[collectionName][dataObj.id];
      });

    // 3. Đồng bộ vào IndexedDB (fire-and-forget — không await, không block)
    const docToStore = APP_DATA[collectionName][dataObj.id];
    this.#localDB.put(collectionName, docToStore).catch((e) => console.warn(`⚠️ IndexedDB put [${collectionName}/${dataObj.id}] thất bại:`, e));
  }

  _removeFromAppDataObj(collectionName, id) {
    if (!APP_DATA?.[collectionName]?.[id]) return;

    // Lấy doc trước khi xóa để biết groupKey cho secondary indexes
    const doc = APP_DATA[collectionName][id];

    // 1. Xóa khỏi primary
    delete APP_DATA[collectionName][id];

    // 2. Xóa khỏi secondary indexes
    if (doc) {
      DBManager.#INDEX_CONFIG
        .filter((cfg) => cfg.source === collectionName)
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

    // 3. Đồng bộ xóa khỏi IndexedDB (fire-and-forget)
    this.#localDB.delete(collectionName, id).catch((e) => console.warn(`⚠️ IndexedDB delete [${collectionName}/${id}] thất bại:`, e));
  }

  /**
   * Dừng listeners và reset trạng thái.
   */
  resetOptions = () => {
    this.stopNotificationsListener();
    console.log('🔄 DB options đã reset');
  };
}

// ─── Singleton Export ─────────────────────────────────────────────────────
// Tự động khởi chạy khi import — chờ auth ready rồi mới init Firestore.
// Để override config: thay `new DBManager()` bằng `new DBManager({ persistence: false, ... })`
const DB_MANAGER = new DBManager();
export default DB_MANAGER;
