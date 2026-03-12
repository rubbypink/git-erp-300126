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
  #debug = false;
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
    { index: 'booking_details_by_booking', source: 'booking_details', groupBy: 'booking_id', sumBy: 'total' },
    { index: 'operator_entries_by_booking', source: 'operator_entries', groupBy: 'booking_id', sumBy: 'total_cost' },
    { index: 'operator_entries_by_supplier', source: 'operator_entries', groupBy: 'supplier', sumBy: 'total_cost' },
    { index: 'operator_entries_by_month', source: 'operator_entries', groupBy: 'check_in', sumBy: 'total_cost' },
    { index: 'transactions_by_booking', source: 'transactions', groupBy: 'booking_id', sumBy: 'amount' },
    { index: 'transactions_by_fund', source: 'transactions', groupBy: 'fund_source', sumBy: 'amount' },
    { index: 'transactions_by_month', source: 'transactions', groupBy: 'transaction_date', sumBy: 'amount' },
  ];

  /**
   * Mapping role → danh sách collections được phép truy cập.
   * Nguồn chân lý DUY NHẤT — dùng trong loadAllData, syncDelta, và role-change pruning.
   * Thêm / sửa role mới chỉ cần cập nhật ở đây.
   */
  static #ROLE_COLL_MAP = {
    sale: ['bookings', 'booking_details', 'booking_details_by_booking', 'customers', 'transactions', 'transactions_by_booking', 'fund_accounts'],
    op: ['bookings', 'operator_entries', 'operator_entries_by_supplier', 'suppliers', 'hotels', 'hotel_price_schedules', 'service_price_schedules', 'transactions', 'transactions_by_booking', 'fund_accounts', 'customers'],
    acc: ['transactions', 'suppliers', 'fund_accounts', 'bookings', 'operator_entries', 'operator_entries_by_booking', 'transactions_by_booking', 'transactions_by_month'],
    acc_thenice: ['transactions_thenice', 'fund_accounts_thenice'],
    admin: ['bookings', 'booking_details', 'booking_details_by_booking', 'customers', 'operator_entries', 'operator_entries_by_booking', 'transactions', 'transactions_by_booking', 'suppliers', 'fund_accounts', 'transactions_thenice', 'fund_accounts_thenice', 'users'],
  };

  /**
   * Trả về danh sách collections cho role (không bao gồm 'users' — luôn tải qua loadMeta).
   * @param {string} role
   * @returns {string[]}
   */
  #getRoleCollections(role) {
    const indexNames = new Set(DBManager.#INDEX_CONFIG.map((c) => c.index));
    return (DBManager.#ROLE_COLL_MAP[role] ? DBManager.#ROLE_COLL_MAP[role] : ['bookings', 'booking_details', 'operator_entries', 'customers', 'transactions']).filter((c) => !indexNames.has(c)); // secondary index names
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
    this.#db = firebase.firestore();

    // Khởi tạo IndexedDB song song với Firestore
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
    await this.#initPromise;
    if (!this.#db || !firebase.auth().currentUser) return null;

    const currentRole = window.CURRENT_USER?.role ?? '';
    const currentRoleColls = this.#getRoleCollections(currentRole);
    const lastSyncRole = this.#localDB.getMeta('LAST_SYNC_ROLE') ?? '';
    const roleChanged = currentRole !== lastSyncRole;

    // ── 1. KHỞI TẠO FRAMEWORK DỮ LIỆU RỖNG ──
    this.#buildEmptyResult(); // Reset APP_DATA về trạng thái sạch

    // ── 2. CHIẾN LƯỢC LOCAL-FIRST (IDB -> Memory) ──
    if (!forceNew) {
      const indexedData = await this.#loadFromIndexedDB(currentRoleColls);
      const hasData = Object.keys(indexedData).some((k) => Object.keys(indexedData[k] || {}).length > 0);

      if (hasData) {
        // Đổ dữ liệu local vào Mirror Memory ngay lập tức
        Object.assign(APP_DATA, indexedData);

        // Nếu Role thay đổi: Prune dữ liệu thừa của Role cũ trong IDB và Memory
        if (roleChanged) {
          L._(`🔄 Role changed: [${lastSyncRole}] → [${currentRole}]. Cleaning cache...`);
          await this.#pruneDanglingCollections(currentRoleColls);
        }

        // Tải Meta (Config/Users) và chạy Delta Sync ngầm
        this.loadMeta(APP_DATA).catch((e) => L.log('Meta load fail:', e));

        // Rebuild indexes & Sort để UI sẵn sàng
        this.#rebuildAllSecondaryIndexes();
        this.#applyAllPostSorts(APP_DATA);
        this.#localDB.setMeta('LAST_SYNC_ROLE', currentRole);

        const networkSaver = window.A?.getConfig?.('network_saver');
        if (!networkSaver) {
          // Smart Delta Sync sẽ cập nhật IDB, sau đó IDB sẽ cập nhật lại APP_DATA
          this.#smartDeltaSync(currentRoleColls).catch((e) => L.log('Delta sync fail:', e));
        }

        return APP_DATA; // Trả về dữ liệu local ngay cho UI render
      }
    }
    // ── 3. FALLBACK: FULL LOAD TỪ FIRESTORE (Khi IDB trống hoặc forceNew) ──
    L._(`📚 Full load from Firestore (Role: ${currentRole})`);
    try {
      // Tải song song Meta và Data để tối ưu thời gian
      await Promise.all([
        this.loadMeta(APP_DATA),
        this.syncDelta(currentRoleColls, true), // forceFullLoad = true
      ]);

      this.#applyAllPostSorts(APP_DATA);
      // Lưu ngược lại IDB để lần sau không cần tải lại
      await this.#saveAppDataCache(currentRoleColls, forceNew);

      return APP_DATA;
    } catch (e) {
      console.error('❌ Critical loadAllData failure:', e);
      return null;
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
      // Không xóa meta collections
      if (['lists', 'currentUser', 'users'].includes(coll)) continue;
      if (DBManager.#INDEX_CONFIG.some((c) => c.index === coll)) continue;

      if (!allowedSet.has(coll)) {
        delete APP_DATA[coll]; // Xóa memory
        await this.#localDB.clear(coll); // Xóa IDB
        L._(`🗑️ Pruned collection: ${coll}`);
      }
    }
  }

  /**
   * GATEKEEPER CHÍNH: Firestore -> LocalDB -> APP_DATA
   * Đảm bảo không có dữ liệu nào lọt vào RAM mà chưa được ghi xuống ổ cứng.
   * * @param {string|null} coll - Tên collection (null nếu là batch đa collection)
   * @param {string|null} id - ID bản ghi (null nếu là batch)
   * @param {string} action - 's'(set/add), 'u'(update/increment), 'd'(delete)
   * @param {Object|null} payload - Dữ liệu (chỉ áp dụng khi không phải batch)
   * @param {boolean} isBatch - Cờ đánh dấu đang xử lý lô
   * @param {Array} batchItems - Mảng thao tác lô: [{ coll, id, action, data }]
   */
  async #gatekeepSyncToLocal(coll, id, action, payload, isBatch = false, batchItems = []) {
    try {
      // 1. Chuẩn hóa mọi luồng dữ liệu về 1 mảng items chung để xử lý
      const items = isBatch ? batchItems : [{ coll, id, action, data: payload }];

      // 2. Gom nhóm theo Collection để tối ưu Ghi/Xóa lô
      const putOps = {}; // { collName: [doc1, doc2] }
      const delOps = {}; // { collName: [id1, id2] }

      for (const item of items) {
        const c = item.coll;
        const i = item.id;
        const a = item.action;
        const d = item.data;

        if (!c || !i) continue; // Bỏ qua nếu thiếu key mapping

        if (a === 'd' || a === 'delete') {
          if (!delOps[c]) delOps[c] = [];
          delOps[c].push(i);
        } else if (a === 'ua') {
          let doc = APP_DATA[c]?.[i];
          let arrVal = doc?.[d.field];
          if (!arrVal) arrVal = [];
          arrVal.push(d.value);
          APP_DATA[c][i][d.field] = arrVal;
          this.#localDB.put(c, { id: i, data: APP_DATA[c][i] });
          L._('[Gatekeeper] Synced ArrayUnion Done', item);
          continue;
        } else {
          // Xử lý Set, Add, Update, Increment
          if (!putOps[c]) putOps[c] = [];

          // TRỌNG TÂM: Merge dữ liệu.
          // Lấy bản ghi đầy đủ từ APP_DATA (đã load từ IDB lúc đầu) để gộp với payload mới
          const currentDoc = APP_DATA[c]?.[i] || {};
          const mergedDoc = { ...currentDoc, ...d, id: i };

          putOps[c].push(mergedDoc);
        }
      }

      // 3. GHI VÀO LOCALDB (SOURCE OF TRUTH) - Thực hiện trước
      for (const c of Object.keys(putOps)) {
        if (putOps[c].length > 0) await this.#localDB.putBatch(c, putOps[c]);
      }
      for (const c of Object.keys(delOps)) {
        for (const i of delOps[c]) {
          await this.#localDB.delete(c, i);
        }
      }

      // 4. ĐẨY VÀO APP_DATA (MEMORY MIRROR) - Thực hiện sau
      for (const c of Object.keys(putOps)) {
        putOps[c].forEach((doc) => this._updateAppDataObj(c, doc));
      }
      for (const c of Object.keys(delOps)) {
        delOps[c].forEach((i) => this._removeFromAppDataObj(c, i));
      }
      L._('[Gatekeeper] Synced data Done', items);
      // Tùy chọn: Phát event báo hiệu UI cập nhật (Ví dụ: Balance vừa đổi)
      // window.dispatchEvent(new CustomEvent('erp-data-synced', { detail: { items } }));
    } catch (error) {
      console.error('❌ [Gatekeeper] Lỗi đồng bộ dữ liệu:', error);
    }
  }

  async syncLocal(coll, id, action, payload, isBatch = false, batchItems = []) {
    return await this.#gatekeepSyncToLocal(coll, id, action, payload, isBatch, batchItems);
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
      // forceNew / forceNew: xóa sạch store trước khi ghi
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
            L._(`🗑️→💾 IDB clear+putBatch [${coll}]: ${docList.length} docs`);
          } catch (e) {
            L.log(`⚠️ IndexedDB clear+putBatch [${coll}] thất bại:`, e);
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
            .catch((e) => L.log(`⚠️ IndexedDB putBatch [${coll}] thất bại:`, e));
        }
      }
    }

    // Lưu metadata vào IndexedDB _sync_meta (không dùng localStorage)
    this.#localDB.setMeta('LAST_SYNC', Date.now().toString());
    this.#localDB.setMeta('LAST_SYNC_ROLE', window.CURRENT_USER?.role ?? '');
  }

  async #startNotificationsListener() {
    if (this.#listeners['notifications']) return; // đã chạy

    const windowMs = this.#config.notificationsWindowMs;
    const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC');
    let lastSyncMs = lastSyncRaw ? parseInt(lastSyncRaw, 10) : 0;

    const now = Date.now();

    // Lấy mốc quá khứ gần nhất giữa lastSync và (now - 72h)
    const cutoffMs = Math.max(lastSyncMs, now - windowMs);
    const cutoffDate = new Date(cutoffMs);

    L._(`🔔 Notifications listener: query từ ${cutoffDate.toLocaleString()}`);
    const user = window.CURRENT_USER;

    if (!user) {
      L._('⚠️ Notifications listener: không xác định được người dùng', 'warning');
      return;
    }
    const role = window.CURRENT_USER.role;
    // Admin: xóa các notification cũ hơn 3 ngày
    if (role === 'admin') {
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
          if (result !== undefined) L._(`🗑️ Đã xóa ${result === undefined ? 0 : 'các'} notifications cũ hơn 3 ngày`, 'info');
        })
        .catch((e) => L.log('⚠️ Xóa old notifications thất bại:', e));
    }
    const query = this.#db.collection('notifications').where('created_at', '>=', cutoffDate);

    // 1. CHUẨN HÓA DỮ LIỆU USER (Nên để trước khi gọi onSnapshot)
    // Đảm bảo userGroups luôn là một mảng và các phần tử đều là chữ thường
    const userGroups = (Array.isArray(user.group) ? user.group : [user.group])
      .filter(Boolean) // Loại bỏ các giá trị null/undefined nếu có
      .map((g) => String(g).toLowerCase());

    const userName = String(user.name || '').toLowerCase();

    const unsubscribe = query.onSnapshot(
      async (snapshot) => {
        if (snapshot.empty) return;

        const dataChangeDocs = [];
        const notifDocsRaw = [];

        // Danh sách collection user này được phép sync ngầm
        const myColls = this.#getRoleCollections(role);

        // ── 2. PHÂN LOẠI & LỌC DATA-CHANGE TỪ SỚM ──
        const changes = snapshot.docChanges();
        for (const change of changes) {
          if (change.type === 'removed') continue;
          const docData = change.doc.data();
          const docId = change.doc.id;

          // [DEDUPLICATION MECHANISM]
          // Kiểm tra xem change này đã được xử lý chưa dựa trên IndexedDB
          // Key: collection + docId + action + updated_at
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
            if (isProcessed) {
              if (this.#debug) L._(`⏭️ Skip redundant notification: ${dedupId}`);
              continue;
            }
            // Đánh dấu đã xử lý (fire-and-forget)
            this.#localDB.put('notification_dedup', { id: dedupId, processed_at: Date.now() }).catch(() => {});
          }

          const doc = { id: docId, ...docData };

          if (doc.type === 'data-change') {
            // [BỘ LỌC NGẦM]: Chỉ đẩy vào Gatekeeper nếu user có quyền với collection này
            if (myColls.includes(doc.collection)) {
              dataChangeDocs.push(doc);
            }
          } else {
            notifDocsRaw.push(doc);
          }
        }

        // ── 3. XỬ LÝ AUTO SYNC DATA (Gatekeeper) ──
        if (dataChangeDocs.length > 0) {
          this.#autoSyncData(dataChangeDocs);
        }

        // ── 4. XỬ LÝ NOTIFICATION UI ──
        if (notifDocsRaw.length > 0) {
          const validNotifs = notifDocsRaw.filter((d) => {
            const docGroups = (Array.isArray(d.group) ? d.group : [d.group]).filter(Boolean).map((g) => String(g).toLowerCase());

            const docTargetUsers = (Array.isArray(d.target_users) ? d.target_users : []).map((u) => String(u).toLowerCase());

            // Logic kiểm tra của bạn + hỗ trợ thêm group 'all' và quyền 'admin'
            const isGroupMatch = docGroups.some((docG) => docG === 'all' || userGroups.includes(docG));
            const isRoleMatch = String(d?.role || '').toLowerCase() === role;
            const isUserMatch = docTargetUsers.includes(userName);
            const isAdmin = role === 'admin'; // Admin thấy mọi thông báo (Bỏ dòng này nếu không cần)

            return isGroupMatch || isUserMatch || isRoleMatch || isAdmin;
          });

          // Chỉ dispatch event khi thực sự có thông báo dành cho user này
          if (validNotifs.length > 0) {
            // Đảm bảo truy cập đúng object NotificationManager
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
      L._('🔕 Notifications listener stopped');
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
        L.log('⚠️ #autoSyncData: không parse được doc.data', notif);
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
      // XỬ LÝ BATCH
      if (typeof payload === 'string') {
        L._(`🔄 #applyLocalChange: batch lớn (batch_id=${payload}), reload server...`);
        await this.loadCollections(coll, { forceNew: true, batchId: payload });
      } else if (Array.isArray(payload)) {
        // payload là array [{id, action, data}]
        // Ép qua Gatekeeper dạng Batch
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
      // XỬ LÝ ĐƠN (Set, Update, Delete, Increment)
      // Chuyển action code 's', 'u', 'd', 'i' sang Gatekeeper
      await this.#gatekeepSyncToLocal(coll, id, action, payload);
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
          L.log(`⚠️ IndexedDB getAllAsObject [${coll}] thất bại:`, e);
          result[coll] = {};
        }
      })
    );
    return result;
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

          L._(`📥 Background sync [${coll}]: +${docs.length} docs`);
        }

        // Cập nhật TTL kể cả khi không có doc mới (tránh sync liên tục)
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
    // Smart delta chỉ áp dụng khi role có quyền truy cập bookings
    if (!roleColls.includes('bookings')) {
      L._('🔍 Smart Delta: role không có bookings — fallback backgroundSync');
      return this.#backgroundSync(roleColls);
    }

    const lastSyncRaw = this.#localDB.getMeta('LAST_SYNC_DELTA');
    const lastSyncDate = lastSyncRaw ? new Date(parseInt(lastSyncRaw, 10)) : null;

    // Chưa bao giờ sync delta → cần sync tất cả collections
    if (!lastSyncDate) {
      L._('🔍 Smart Delta: chưa có LAST_SYNC_DELTA — sync tất cả...');
      await this.syncDelta(roleColls, false);
      return;
    }

    try {
      // ── Probe bookings: chỉ cần biết có ít nhất 1 doc mới ──
      const probeSnap = await this.#db.collection('bookings').where('updated_at', '>', lastSyncDate).limit(1).get();
      const probeSnap2 = await this.#db.collection('transactions').where('updated_at', '>', lastSyncDate).limit(1).get();

      if (probeSnap.empty && probeSnap2.empty) {
        L._('🔍 Smart Delta: bookings & transactions không có dữ liệu mới — bỏ qua');
        return;
      }

      // ── Có dữ liệu mới → sync tất cả collections (bookings + các collection khác) ──
      const otherColls = roleColls.filter((c) => c !== 'bookings');
      L._(`🔍[Smart Delta]: phát hiện dữ liệu mới → sync + ${otherColls.length} collection(s) khác`);
      await this.syncDelta(roleColls, false);
    } catch (e) {
      L.log('⚠️ Smart Delta Sync thất bại:', e);
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
    if (options === true) {
      // Hỗ trợ gọi cũ: loadCollections(true) → forceNew=true
      options = { forceNew: true };
    }
    const { forceNew = false, deltaSync = false, batchId = null, limit: limitOverride = null } = options;

    // ── Xác định danh sách collections ───────────────────────────────
    let collList;
    if (!collections) {
      const role = window.CURRENT_USER?.role ?? null;
      collList = (DBManager.#ROLE_COLL_MAP[role] ?? ['bookings', 'booking_details', 'operator_entries', 'customers']).filter((c) => c !== 'users');
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

    L._(`📚 loadCollections (role=${CURRENT_USER?.role ?? '-'}, delta=${deltaSync}, force=${forceNew}): ${collList.join(', ')}`);

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

            // 1. Gom dữ liệu từ Firestore
            const fetchedDocs = [];
            snap.forEach((doc) => fetchedDocs.push({ id: doc.id, ...doc.data() }));

            if (!isDelta) {
              // ── TRƯỜNG HỢP 1: FULL LOAD (Thay thế toàn bộ) ──
              // Bước 1: IDB FIRST - Xóa sạch store cũ và ghi lô mới (Source of Truth)
              await this.#localDB.clear(collName);
              await this.#localDB.putBatch(collName, fetchedDocs);
              this.#localDB.markSynced(collName);

              // Bước 2: DỌN DẸP RAM (Mirror)
              APP_DATA[collName] = {};
              DBManager.#INDEX_CONFIG
                .filter((c) => c.source === collName)
                .forEach(({ index }) => {
                  APP_DATA[index] = {};
                });

              // Bước 3: ĐỔ VÀO RAM
              fetchedDocs.forEach((doc) => this._updateAppDataObj(collName, doc));
              APP_DATA[collName] = this.sortCollection(collName, APP_DATA[collName]);

              L._(`✅ [${collName}] full load: ${fetchedDocs.length} docs`);
            } else {
              // ── TRƯỜNG HỢP 2: DELTA LOAD (Chỉ cập nhật cái mới) ──
              // Ép toàn bộ qua Gatekeeper để nó lo việc Merge + Ghi IDB + Ghi RAM
              const syncItems = fetchedDocs.map((doc) => ({
                coll: collName,
                id: doc.id,
                action: 'u', // Upsert
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
        // Chỉ cập nhật Meta, dữ liệu đã được lưu an toàn
        this.#localDB.setMeta('LAST_SYNC', Date.now().toString());
        this.#localDB.setMeta('LAST_SYNC_ROLE', window.CURRENT_USER?.role ?? '');

        if (typeof initBtnSelectDataList === 'function') initBtnSelectDataList();
      }
      return total;
    } catch (e) {
      L._('❌ loadCollections thất bại:', e);
      return 0;
    } finally {
      showLoading(false);
    }
  }

  syncDelta = async (collection, forceNew = false) => {
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

      L._(`🔄 Sync Delta: ${collectionsToSync.length} collection(s) to sync`);

      if (collectionsToSync.length === 0) return 0;

      const results = await Promise.all(
        collectionsToSync.map(async (colName) => {
          const isMissingData = !APP_DATA[colName] || Object.keys(APP_DATA[colName]).length === 0;

          let query;
          let cfg = DBManager.#QUERY_CONFIG[colName];
          let limit = cfg?.limit || 1000;
          if (isMissingData || !lastSyncDate || forceNew) {
            // ⚠️ KHÔNG dùng orderBy() — Firestore v8 loại trừ mọi doc thiếu field orderBy
            //    → mất dữ liệu âm thầm. Ordering thực hiện client-side qua sortCollection.
            query = this.#db.collection(colName).limit(limit);
            L._(`[${colName}] Full load (forceNew=${forceNew}): limit=${limit}`);
          } else {
            query = this.#db.collection(colName).where('updated_at', '>', lastSyncDate);
          }

          const querySnapshot = await query.get();

          if (!querySnapshot.empty) {
            L._(`[${colName}] Đang xử lý ${querySnapshot.size} bản ghi.`);
            if (isMissingData || forceNew) {
              // Full reload: reset primary collection + secondary indexes liên quan
              APP_DATA[colName] = {};
              DBManager.#INDEX_CONFIG
                .filter((c) => c.source === colName)
                .forEach(({ index }) => {
                  APP_DATA[index] = {};
                });
              querySnapshot.forEach((doc) => {
                this.#gatekeepSyncToLocal(colName, doc.id, 's', doc.data());
              });
              // Client-side sort sau khi toàn bộ docs đã nạp
              APP_DATA[colName] = this.sortCollection(colName, APP_DATA[colName]);
            } else {
              // Delta: chỉ cập nhật/thêm docs thay đổi, secondary indexes tự cập nhật qua _updateAppDataObj
              querySnapshot.forEach((doc) => {
                this.#gatekeepSyncToLocal(colName, doc.id, 's', doc.data());
              });
            }

            L._(`[SYNC DELTA][${colName}] Cập nhật APP_DATA với ${querySnapshot.size} bản ghi thay đổi.`);

            return querySnapshot.size;
          }
          return 0;
        })
      );

      const totalChanges = results.reduce((a, b) => a + b, 0);

      if (totalChanges > 0) {
        initBtnSelectDataList();
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
  async loadMeta(result, forceNew = false) {
    // Đảm bảo cấu trúc khởi tạo an toàn
    if (!result.lists) result.lists = {};
    if (!result.users) result.users = {};

    // Mảng lưu trữ tên các collection bị thiếu trong cache cần tải từ Firestore
    const missingCollections = [];
    if (!forceNew) {
      // ==========================================
      // BƯỚC 1: KIỂM TRA TÍNH TOÀN VẸN INDEXEDDB CACHE
      // ==========================================
      try {
        const cachedAppCFgObj = await this.#localDB.getAllAsObject('app_config');
        let parsedUsers = await this.#localDB.getAllAsObject('users');
        let parsedLists = cachedAppCFgObj?.current || null;
        L._(Object.keys(parsedLists));

        if (Object.keys(parsedLists) && Object.keys(parsedUsers)) {
          // Kiểm tra kỹ xem cache có mảng dữ liệu của hotels và suppliers chưa
          const hasStaff = Array.isArray(parsedLists?.staff) && parsedLists.staff.length > 0;
          const hasHotels = Array.isArray(parsedLists?.hotel) && parsedLists.hotel.length > 0;
          const hasSuppliers = Array.isArray(parsedLists?.supplier) && parsedLists.supplier.length > 0;
          const hasUsers = parsedUsers && Object.keys(parsedUsers).length > 0;

          // Cấu hình app_config thường có nhiều key ngoài staff, hotel, supplier
          const hasAppConfig = parsedLists && Object.keys(parsedLists).filter((k) => !['staff', 'hotel', 'supplier'].includes(k)).length > 0;

          // Lưu các list thiếu vào biến
          if (!hasAppConfig) missingCollections.push('app_config');
          if (!hasUsers || !hasStaff) missingCollections.push('users');
          if (!hasHotels) missingCollections.push('hotels');
          if (!hasSuppliers) missingCollections.push('suppliers');

          // Nạp trước những dữ liệu ĐÃ CÓ vào result
          Object.assign(result.lists, parsedLists || {});
          Object.assign(result.users, parsedUsers || {});

          // Chỉ return nếu TẤT CẢ list đều đầy đủ
          if (missingCollections.length === 0) {
            L._('📦 [loadMeta] Đã load Meta (lists, users, hotels, suppliers) đầy đủ từ cache IndexedDB');
            return; // Kết thúc hàm an toàn
          } else {
            L._(`⚠️ [loadMeta] Cache hiện tại bị thiếu [${missingCollections.join(', ')}], tiến hành tải phần thiếu từ Firestore...`);
          }
        } else {
          L._('⚠️ [loadMeta] Cache IndexedDB không tồn tại hoặc rỗng, tiến hành tải toàn bộ từ Firestore...');
          missingCollections.push('app_config', 'users', 'hotels', 'suppliers');
        }
      } catch (e) {
        L.log('⚠️ [loadMeta] Lỗi đọc cache Meta từ IndexedDB, tiến hành fetch mới toàn bộ:', e);
        // Fallback: nếu lỗi parse thì tải lại tất cả
        missingCollections.push('app_config', 'users', 'hotels', 'suppliers');
      }
    }

    // ==========================================
    // BƯỚC 2: TẢI TỪ FIRESTORE (CHỈ NHỮNG PHẦN BỊ THIẾU) VÀ XỬ LÝ DỮ LIỆU
    // ==========================================
    L._(`📥 [loadMeta] Fetch data từ Firestore: ${missingCollections.join(', ')}...`);

    const promises = [];
    const lastSync = this.#localDB.getMeta('LAST_SYNC_META');
    const lastSyncDate = lastSync ? new Date(parseInt(lastSync)) : null;
    let cfg;
    let limit;

    missingCollections.forEach((coll) => {
      try {
        cfg = DBManager.#QUERY_CONFIG[coll];
        // 1. Xác định tên collection/path chính xác cho từng vòng lặp
        const actualColName = coll;
        limit = cfg?.limit || 1000;
        // 2. Khởi tạo Query RIÊNG cho từng collection dựa trên logic chung
        let query;
        if (lastSyncDate) {
          query = actualColName === 'app_config' ? this.#db.collection('app_config').doc('current') : this.#db.collection(actualColName).where('updated_at', '>', lastSyncDate).limit(limit);
        } else {
          query = this.#db.collection(actualColName).limit(limit);
        }

        // 3. Đẩy vào mảng promises
        promises.push(query.get());
      } catch (err) {
        L.error(`❌ Lỗi tạo query cho collection ${coll}:`, err);
        promises.push(Promise.resolve(null)); // Đảm bảo mảng promises không bị lệch index
      }
    });

    // Dynamic Query: Nếu không có trong missingCollections thì trả về null (bỏ qua query)
    // promises.push(missingCollections.includes('app_config') ? this.#db.collection('app_config').doc('current').get() : Promise.resolve(null));
    // promises.push(missingCollections.includes('users') ? this.#db.collection('users').get() : Promise.resolve(null));
    // promises.push(missingCollections.includes('hotels') ? this.#db.collection('hotels').get() : Promise.resolve(null));
    // promises.push(missingCollections.includes('suppliers') ? this.#db.collection('suppliers').get() : Promise.resolve(null));

    const [cfgSnap, usersSnap, hotelsSnap, suppliersSnap] = await Promise.all(promises);

    // 1. Xử lý app_config (Chỉ chạy nếu có dữ liệu tải về)
    if (cfgSnap) {
      if (cfgSnap.exists) {
        const rawCfg = cfgSnap.data();
        L._(`📋 [loadMeta] app_config/current: ${Object.keys(rawCfg).length} keys`);
        for (const k in rawCfg) {
          try {
            result.lists[k] = typeof rawCfg[k] === 'string' && rawCfg[k].startsWith('[') ? JSON.parse(rawCfg[k]) : rawCfg[k];
          } catch {
            result.lists[k] = rawCfg[k];
          }
        }
      } else {
        L._('⚠️ [loadMeta] app_config/current không tồn tại — lists sẽ rỗng');
      }
    }

    // 2. Xử lý users & tạo staffList (Chỉ chạy nếu có dữ liệu tải về)
    if (usersSnap) {
      const staffList = [];
      usersSnap.forEach((doc) => {
        result.users[doc.id] = { id: doc.id, ...doc.data() };
        staffList.push(doc.data().user_name || 'No Name');
      });
      result.lists.staff = staffList;
    }

    // 3. Xử lý hotels (Chỉ chạy nếu có dữ liệu tải về)
    if (hotelsSnap) {
      const hotelList = [];
      hotelsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.name) hotelList.push(data.name);
      });
      result.lists.hotel = hotelList;
    }

    // 4. Xử lý suppliers (Chỉ chạy nếu có dữ liệu tải về)
    if (suppliersSnap) {
      const supplierList = [];
      suppliersSnap.forEach((doc) => {
        const data = doc.data();
        if (data.name) supplierList.push(data.name);
      });
      result.lists.supplier = supplierList;
    }

    // ==========================================
    // BƯỚC 3: CẬP NHẬT LẠI INDEXEDDB CACHE
    // ==========================================
    try {
      var lists = result.lists;
      lists.id = 'current'; // Đảm bảo luôn có doc id cho app_config
      this.#localDB.put('app_config', lists);
      this.#localDB.setMeta('LAST_SYNC_META', Date.now().toString());
      this.#saveAppDataCache('users', true); // users lưu riêng, xóa cũ trước khi ghi
      L._(`💾 [loadMeta] Đã lưu cập nhật cache Meta mới (bổ sung: ${missingCollections.join(', ')}) vào IndexedDB thành công`);
    } catch (e) {
      L.log('⚠️ [loadMeta] Lỗi khi lưu cache Meta vào IndexedDB:', e);
    }
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

  /**
   * Xây dựng secondary indexes từ dữ liệu thô.
   * Hỗ trợ tự động nhóm theo tháng (m-yy) nếu tên index kết thúc bằng '_by_month'.
   * * @param {object} result - Đối tượng chứa APP_DATA
   * @param {string} collName - Tên collection nguồn
   * @param {object} data - Document data cần index
   */
  #buildSecondaryIndexes(result, collName, data) {
    DBManager.#INDEX_CONFIG
      .filter((cfg) => cfg.source === collName)
      .forEach(({ index, groupBy }) => {
        let rawValue = data[groupBy];

        // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào
        if (rawValue === undefined || rawValue === null || rawValue === '') return;

        let groupKey = rawValue;

        // 2. Xử lý logic Group By Month (Nếu tên index có suffix _by_month)
        if (index.endsWith('_by_month')) {
          let dateObj = null;

          // Hỗ trợ nhiều định dạng ngày tháng phổ biến trong hệ thống
          if (rawValue instanceof Date) {
            dateObj = rawValue;
          } else if (typeof rawValue === 'string') {
            // Thử parse định dạng VN (DD/MM/YYYY) thường gặp trong UI
            const vnParts = rawValue.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (vnParts) {
              dateObj = new Date(`${vnParts[3]}-${vnParts[2]}-${vnParts[1]}`);
            } else {
              // Thử parse ISO hoặc các định dạng chuẩn khác
              dateObj = new Date(rawValue);
            }
          }

          // Rủi ro: Dữ liệu ngày tháng không hợp lệ -> Bỏ qua để tránh làm hỏng cấu trúc Index
          if (!dateObj || isNaN(dateObj.getTime())) {
            // L._(`⚠️ Index [${index}] bỏ qua doc [${data.id}] do ngày lỗi: ${rawValue}`, 'warning');
            return;
          }

          const m = dateObj.getMonth() + 1;
          const yy = dateObj.getFullYear().toString().slice(-2);
          groupKey = `${m}-${yy}`; // Kết quả mong muốn: "3-26"
        }

        // 3. Khởi tạo cấu trúc cây Object trong APP_DATA
        if (!result[index]) result[index] = {};
        if (!result[index][groupKey]) result[index][groupKey] = {};

        // 4. Lưu vết dữ liệu (Sử dụng tham chiếu để tiết kiệm bộ nhớ)
        result[index][groupKey][data.id] = data;
      });
  }

  /**
   * Rebuild toàn bộ Index với kỹ thuật Time Slicing (Chống đơ UI khi data > 50.000 dòng)
   */
  async #rebuildAllSecondaryIndexes() {
    if (!window.APP_DATA) return;

    // 1. Reset các bảng Index
    DBManager.#INDEX_CONFIG.forEach(({ index }) => {
      window.APP_DATA[index] = {};
    });

    const uniqueSources = [...new Set(DBManager.#INDEX_CONFIG.map((cfg) => cfg.source))];

    // 2. Xử lý từng bảng gốc
    for (const sourceName of uniqueSources) {
      const coll = window.APP_DATA[sourceName];
      if (!coll) continue;

      const docs = Object.values(coll);

      // CHUNK_SIZE: Số lượng dòng xử lý trong 1 nhịp (2000 là mức tối ưu nhất)
      const CHUNK_SIZE = 2000;

      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        // Lấy ra 2000 dòng để xử lý
        const chunk = docs.slice(i, i + CHUNK_SIZE);

        chunk.forEach((doc) => {
          this.#buildSecondaryIndexes(window.APP_DATA, sourceName, doc);
        });

        // ĐIỂM SÁNG GIÁ NHẤT: Nhường CPU (Yield to Main Thread)
        // Lệnh này ép JS tạm dừng 0ms để trình duyệt kịp cập nhật giao diện (UI)
        // Nhờ vậy user vẫn có thể click, cuộn trang mượt mà dù app đang load data ngầm.
        await new Promise((resolve) => setTimeout(resolve, 0));
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
  // ─── Sync Trigger ─────────────────────────────────────────────────────
  /**
   * Đồng bộ 1 booking_detail row sang collection operator_entries.
   * Tối ưu: Nếu chỉ cập nhật 1 vài field, kiểm tra xem item đã tồn tại chưa và lọc field hợp lệ.
   */
  async _syncOperatorEntry(detailRow, customerName = '') {
    try {
      // ── 1. GUARD & PARSE DATA ──
      if (!detailRow) throw new Error('Dữ liệu detailRow bị trống.');

      let originalArray = null;
      if (Array.isArray(detailRow)) {
        originalArray = detailRow;
        if (typeof this.schema?.arrayToObject !== 'function') throw new Error('Thiếu helper arrayToObject.');
        detailRow = this.schema.arrayToObject(detailRow, 'booking_details');
      }

      // Cứu ID nếu mất (do nén array)
      if (!detailRow.id && originalArray) {
        const allDetails = window.APP_DATA?.booking_details || {};
        for (const [key, matrixRow] of Object.entries(allDetails)) {
          if (matrixRow === originalArray || JSON.stringify(matrixRow) === JSON.stringify(originalArray)) {
            detailRow.id = key;
            break;
          }
        }
      }

      const id = String(detailRow.id || '');
      if (!id || id === 'undefined') {
        L._(`[_syncOperatorEntry] ❌ ID không hợp lệ`, 'warning');
        return { success: false, error: 'Invalid ID' };
      }

      // ── 2. KIỂM TRA TỒN TẠI & LỌC FIELD (TỐI ƯU) ──
      const existingEntry = window.APP_DATA?.operator_entries?.[id];
      const isPartialUpdate = Object.keys(detailRow).length < 10; // Giả định nếu truyền ít field là partial update

      // Danh sách các field được phép đồng bộ từ booking_details sang operator_entries
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
        // Trường hợp cập nhật một vài field: Chỉ lấy các field hợp lệ có trong detailRow
        for (const [bdField, opField] of Object.entries(ALLOWED_SYNC_FIELDS)) {
          if (Object.prototype.hasOwnProperty.call(detailRow, bdField)) {
            let val = detailRow[bdField];
            // Format data nếu cần
            if (bdField === 'check_in' || bdField === 'check_out') val = val ? formatDateISO(val) : '';
            if (bdField === 'quantity' || bdField === 'child_qty' || bdField === 'nights') val = Number(val) || 0;
            if (bdField === 'total') val = Number(val) || 0;

            syncData[opField] = val;
            hasValidField = true;
          }
        }

        // Nếu không có field nào hợp lệ để update vào operator_entries thì bỏ qua
        if (!hasValidField) {
          if (this.#debug) L._(`[_syncOperatorEntry] ⏭️ Bỏ qua: Không có field hợp lệ để update cho ID ${id}`);
          return { success: true, skipped: true };
        }
      } else {
        // Trường hợp Full Sync hoặc Item chưa tồn tại: Build đầy đủ syncData
        let finalCustName = customerName || detailRow.customer_full_name || '';
        if (!finalCustName.trim() && detailRow.booking_id) {
          finalCustName = window.APP_DATA?.bookings?.[detailRow.booking_id]?.customer_full_name || '';
        }

        syncData = {
          id: id,
          booking_id: detailRow.booking_id || '',
          customer_full_name: finalCustName,
          service_type: detailRow.service_type || '',
          hotel_name: detailRow.hotel_name || '',
          service_name: detailRow.service_name || '',
          check_in: detailRow.check_in ? formatDateISO(detailRow.check_in) : '',
          check_out: detailRow.check_out ? formatDateISO(detailRow.check_out) : '',
          nights: Number(detailRow.nights) || 0,
          adults: Number(detailRow.quantity) || 0,
          children: Number(detailRow.child_qty) || 0,
          total_sale: Number(detailRow.total) || 0,
          ref_code: detailRow.ref_code || '',
        };
      }

      // Luôn cập nhật timestamp
      syncData.updated_at = firebase.firestore.FieldValue.serverTimestamp();

      // ── 3. GHI FIRESTORE & LOCAL CACHE ──
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
      // 1. Chuẩn hóa đầu vào (Biến đơn thành Mảng) - Quy tắc "Clean Input"
      const ids = Array.isArray(bookingIds) ? bookingIds : [bookingIds];
      const validIds = ids.filter((id) => id && String(id).trim() !== '');

      if (validIds.length === 0) {
        L._('[syncOperatorEntriesByBookingId] ⚠️ Không có booking_id hợp lệ để đồng bộ.', 'warning');
        return { success: false, totalProcessed: 0, totalSuccess: 0 };
      }

      L._(`[syncOperatorEntriesByBookingId] 🔄 Đang lọc details cho ${validIds.length} booking...`, 'info');

      // 2. Tra cứu siêu tốc toàn bộ details thuộc booking từ APP_DATA (In-Memory Lookup)
      const allDetails = window.APP_DATA?.booking_details || {};
      const detailsToSync = Object.values(allDetails).filter((detail) => detail && detail.booking_id && validIds.includes(detail.booking_id));

      if (detailsToSync.length === 0) {
        L._(`[syncOperatorEntriesByBookingId] ⚠️ Không tìm thấy booking_details nào khớp.`, 'warning');
        return { success: true, totalProcessed: 0, totalSuccess: 0 };
      }

      // 3. Xử lý song song (Parallel execution) để tối đa hiệu năng
      // Tại sao dùng allSettled? Nếu có 10 detail, 1 cái thiếu ID bị lỗi, 9 cái kia vẫn được Firestore ghi nhận thành công.
      const syncPromises = detailsToSync.map((detail) => this._syncOperatorEntry(detail));
      const results = await Promise.allSettled(syncPromises);

      // 4. Thống kê kết quả để báo cáo
      let successCount = 0;
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value && res.value.success) {
          successCount++;
        }
      });

      const isAllSuccess = successCount === detailsToSync.length;
      const logMode = isAllSuccess ? 'success' : 'warning';

      L._(`[syncOperatorEntriesByBookingId] Hoàn tất. Thành công: ${successCount}/${detailsToSync.length}`, logMode);

      return {
        success: true,
        totalProcessed: detailsToSync.length,
        totalSuccess: successCount,
      };
    } catch (error) {
      L._(`[syncOperatorEntriesByBookingId] ❌ Lỗi Fatal: ${error.message}`, 'error');
      return { success: false, error: error.message, totalProcessed: 0, totalSuccess: 0 };
    }
  }

  // ─── CHỐT CHẶN CRUD ──────────────────────────────────────────────────
  /**
   * Hàm chốt chặn DUY NHẤT thực hiện mọi thao tác ghi/xóa lên Firestore.
   * KHÔNG gọi Firestore trực tiếp ở bất kỳ nơi nào khác — mọi CRUD đi qua đây.
   *
   * @param {string}  collection - Tên collection Firestore
   * @param {'set'|'update'|'delete'|'increment'|'batch'|'transaction'|'arrayUnion'} action
   * @param {string|null}  id   - Document ID (null nếu action = 'batch')
   * @param {object|null}  data - Dữ liệu ghi (null khi delete/increment/batch)
   * @param {object}  [options]
   *   @param {boolean}  [options.merge=true]       - Dùng với action 'set', default true
   *   @param {object}   [options.batchRef]          - External batch ref; nếu có thì chỉ gắn
   *                                                   vào batch, KHÔNG tự commit
   *   @param {string}   [options.fieldName]         - Tên field (chỉ dùng với 'increment'/'arrayUnion')
   *   @param {array}   [options.arrayEntry=[]}    - Giá trị delta (chỉ dùng với 'arrayUnion')
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
    L._(`[CRUD] ${actor} | ${action.toUpperCase()} | ${target}`);

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
          let snap;
          let data;
          if (!id) {
            snap = await this.#db.collection(collection).orderBy('id', 'desc').limit(2000).get();
            data = snap.exists ? snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) : [];
          } else {
            snap = await this.#db.collection(collection).doc(String(id)).get();
            data = snap.exists ? { id: snap.id, ...snap.data() } : null;
          }
          await this.#gatekeepSyncToLocal(collection, doc.id, 'u', data);
          opResult = {
            success: true,
            data: data,
          };
          return opResult;
        }

        case 'query':
          let q = ref;
          if (options.queries)
            options.queries.forEach(([f, op, v]) => {
              q = q.where(f, op, v);
            });
          if (options.limit) q = q.limit(options.limit);
          if (options.orderBy) q = q.orderBy(options.orderBy[0], options.orderBy[1] || 'asc');

          const snap = await q.get();
          const docs = [];
          const batchToSync = [];

          snap.forEach((d) => {
            const docData = { id: d.id, ...d.data() };
            docs.push(docData);
            batchToSync.push({ coll: collection, id: d.id, action: 'u', data: docData });
          });

          opResult = { success: true, count: snap.size, data: docs };
          if (batchToSync.length > 0) {
            await this.#gatekeepSyncToLocal(null, null, null, null, true, batchToSync);
          }
          break;

        // 2. GHI: ADD, SET, UPDATE, DELETE
        case 'add':
          const newRef = await ref.add(data);
          data.id = newRef.id;
          await this.#gatekeepSyncToLocal(collection, data.id, 's', data);
          opResult = { success: true, data: data, id: newRef.id };
          break;
        case 'set': {
          if (!id) return { success: false, error: 'Cần id cho action set' };
          const ref = this.#db.collection(collection).doc(String(id));
          await ref.set(data, { merge: options.merge ?? true });
          await this.#gatekeepSyncToLocal(collection, id, 's', data);
          opResult = { success: true, data: data };
          break;
        }

        // ── Cập nhật một phần (chỉ các field được truyền) ───────────
        case 'update': {
          if (!id) return { success: false, error: 'Cần id cho action update' };
          const ref = this.#db.collection(collection).doc(String(id));
          await ref.update(data);
          await this.#gatekeepSyncToLocal(collection, id, 'u', data);
          opResult = { success: true };
          break;
        }

        // ── Xóa document ─────────────────────────────────────────────
        case 'delete': {
          if (!id) return { success: false, error: 'Cần id cho action delete' };
          await this.#db.collection(collection).doc(String(id)).delete();
          await this.#gatekeepSyncToLocal(collection, id, 'd', null);
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
          // Buộc phải GET lại để biết con số chính xác là bao nhiêu để ghi xuống LocalDB
          const incDoc = await ref.get();
          const finalData = { id: incDoc.id, ...incDoc.data() };
          await this.#gatekeepSyncToLocal(collection, id, 'u', finalData);
          opResult = { success: true, data: finalData };
          break;
        }

        case 'arrayUnion': {
          if (!id || !options.fieldName) return { success: false, error: 'Thiếu tham số' };
          const ref = this.#db.collection(collection).doc(String(id));
          await ref.update({
            [options.fieldName]: firebase.firestore.FieldValue.arrayUnion(data),
          });
          await this.#gatekeepSyncToLocal(collection, id, 'ua', { field: options.fieldName, value: data });
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

          // MẢNG THU THẬP CHO GATEKEEPER
          const syncItems = [];

          for (const item of items) {
            const docIdStr = String(item.docId);
            const ref = this.#db.collection(collection).doc(docIdStr);
            const op = item.op ?? 'set';

            // Nhúng batch_id vào các doc được ghi (không phải delete) khi batch lớn
            const docData = isLargeBatch && op !== 'delete' && item.docData ? { ...item.docData, batch_id: batchId } : item.docData;

            if (op === 'set') firestoreBatch.set(ref, docData, { merge: options.merge ?? true });
            else if (op === 'update') firestoreBatch.update(ref, docData);
            else if (op === 'delete') firestoreBatch.delete(ref);

            opCount++;

            // Ánh xạ sang chuẩn của Gatekeeper: action (s/u/d)
            const gkAction = op === 'delete' ? 'd' : op === 'set' ? 's' : 'u';
            syncItems.push({ coll: collection, id: docIdStr, action: gkAction, data: docData });

            // Commit chunk nếu đạt giới hạn
            if (opCount >= BATCH_LIMIT) {
              await firestoreBatch.commit();
              totalCommitted += opCount;
              firestoreBatch = this.#db.batch();
              opCount = 0;
            }
          }

          // Commit phần lẻ còn lại
          if (opCount > 0) {
            await firestoreBatch.commit();
            totalCommitted += opCount;
          }

          // ĐÂY LÀ CHỐT CHẶN: Ép dữ liệu xuống IndexedDB và RAM cho máy hiện tại ngay lập tức!
          if (syncItems.length > 0) {
            await this.#gatekeepSyncToLocal(null, null, null, null, true, syncItems);
          }

          // ── Tạo notification (fire-and-forget) báo cho các máy khác ─────────
          if (collection !== 'notifications') {
            const notifId = `${collection}_batch_notif_${Date.now()}`;
            // Batch nhỏ: gửi full list → máy nhận apply inline
            // Batch lớn: chỉ gửi batch_id → máy nhận tự fetch server
            const batchPayload = isLargeBatch ? batchId : items.map((it) => ({ id: it.docId, action: it.op ?? 'set', data: it.docData }));

            const actor = window.CURRENT_USER?.name || 'System';
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
              .catch((e) => L.log('⚠️ Không thể tạo batch notification:', e));
          }

          // ── Ghi booking history cho batch (fire-and-forget) ─────────
          if (typeof this.#recordBatchBookingHistory === 'function') {
            this.#recordBatchBookingHistory(collection, items, window.CURRENT_USER?.name || 'System');
          }

          result = { success: true, count: totalCommitted };
          break;
        }

        // 5. TRANSACTION (Logic phức tạp có Read & Write)
        case 'transaction':
          // options.transactionFn trả về mảng các items đã bị thay đổi để sync
          const txResultItems = await this.#db.runTransaction(async (transaction) => {
            return await options.transactionFn(transaction, this.#db);
          });

          if (Array.isArray(txResultItems) && txResultItems.length > 0) {
            await this.#gatekeepSyncToLocal(null, null, null, null, true, txResultItems);
          }
          opResult.data = txResultItems;
          break;

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
          .catch((e) => L.log('⚠️ Không thể tạo notification:', e));
      }

      // Ghi booking history (skip transactions không xác định được booking_id)
      if (DBManager.#HISTORY_COLLS.has(collection)) {
        const skipHistory = collection === 'transactions' && !originalData?.booking_id && !data?.booking_id;
        if (!skipHistory) this.#recordBookingHistory(collection, action, id, data, actor, originalData);
      }
      if (action !== 'get' && action !== 'batch') {
        const isDelete = action === 'delete';
        const syncData = isDelete ? { id } : { id, ...data };
      }

      return opResult;
    } catch (e) {
      console.error(`[CRUD ERROR] ${action.toUpperCase()} ${collection}/${id ?? '*'}:`, e);
      return { success: false, error: e.message };
    }
  }

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
    this.#firestoreCRUD('bookings', 'arrayUnion', bookingId, entry, {
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

  // ─── CRUD ─────────────────────────────────────────────────────────────

  getCollection = async (collectionName, syncDate) => {
    if (syncDate) return this.#fetchCollectionDocs(collectionName, syncDate);
    let data = await this.#fetchCollectionDocs(collectionName, syncDate);
    let dataObj = {};
    if (Array.isArray(data) && typeof data !== 'object') {
      dataObj = Object.fromEntries(data.map((obj) => [obj.id, obj]));
    } else if (typeof data === 'object') {
      dataObj = data;
    } else {
      L.log(`⚠️ Dữ liệu trả về không hợp lệ cho collection ${collectionName}:`, data);
    }
    return dataObj;
  };

  saveRecord = async (collectionName, dataArray, isBatch = false, batchRef = null) => {
    let dataObj;
    let isNew = false; // FIX: Phải khởi tạo giá trị mặc định để không bị undefined

    // 1. Chuẩn hóa dữ liệu đầu vào
    if (typeof dataArray === 'object' && !Array.isArray(dataArray)) {
      dataObj = { ...dataArray }; // Shallow copy để không làm bẩn object gốc trên UI
    } else {
      L._(`Converting array to object for ${collectionName} saving...`);
      dataObj = this.#schema.arrayToObject(dataArray, collectionName);
    }

    let docId = collectionName === 'users' ? dataObj.uid : dataObj.id;

    // 2. Tạo ID nếu chưa có
    if (!docId || String(docId).trim() === '') {
      let bookingId = null;
      if (collectionName === 'booking_details') {
        bookingId = dataObj.booking_id || (Array.isArray(dataArray) ? dataArray[COL_INDEX.D_BKID] : null);
      }

      const idResult = await this.generateIds(collectionName, bookingId);
      if (!idResult) return { success: false, message: 'Lỗi: Không thể sinh ID mới' };

      docId = idResult.newId;

      if (collectionName === 'users') {
        dataObj.uid = docId;
      } else {
        dataObj.id = docId;
      }

      if (Array.isArray(dataArray)) dataArray[0] = docId;
      isNew = true; // Đánh dấu chính xác là bản ghi mới
    }

    if (!docId) {
      console.error('❌ Lỗi: Dữ liệu bị thiếu ID sau khi cấp phát', dataObj);
      return { success: false, message: 'Missing ID' };
    }

    // 3. Làm sạch dữ liệu trước khi gửi lên Firebase (Firebase cực ghét value undefined)
    dataObj.updated_at = firebase.firestore.FieldValue.serverTimestamp();
    Object.keys(dataObj).forEach((key) => dataObj[key] === undefined && delete dataObj[key]);

    // 4. Lưu dữ liệu
    if (isBatch && batchRef) {
      return this.#firestoreCRUD(collectionName, 'set', docId, dataObj, { batchRef, merge: true });
    }

    try {
      const writeResult = await this.#firestoreCRUD(collectionName, 'set', docId, dataObj);
      if (!writeResult.success) throw new Error(writeResult.error);

      // 5. Hệ thống Notification
      if (collectionName === 'booking_details') {
        await this._syncOperatorEntry(dataObj);
        if (!isNew) {
          window.NotificationManager.sendToOperator(`Booking Detail ${dataObj.id} cập nhật!`, `Khách: ${dataObj.customer_full_name || 'Unknown'} cập nhật DV ${dataObj.service_name || 'Unknown'}`);
        }
      } else if (collectionName === 'bookings') {
        if (isNew) {
          window.NotificationManager.sendToOperator(`Booking ${dataObj.id} mới!`, `Khách: ${dataObj.customer_full_name || 'Unknown'}`);
        }
      }

      return { success: true, id: docId, data: dataObj }; // FIX: Trả thêm data để logic bên ngoài tái sử dụng
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

    // ── 0. Customer name lookup ───────────────────────────────────────
    let customerName = '';
    const bkId = Array.isArray(dataArrayList[0]) ? dataArrayList[0][1] : dataArrayList[0]?.booking_id;
    const bkRef = this.#db.collection('bookings').doc(String(bkId));
    const bkSnap = await bkRef.get();
    if (bkSnap.exists) customerName = bkSnap.data().customer_full_name || 'null';
    else L._('Booking not found ' + bkId);

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
      L._(`🆔 Pre-generated ${rowsNeedingId.length} IDs for ${collectionName}`);
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
        L._(`📦 Saved chunk: ${chunk.length} items to ${collectionName}`);
        chunk.forEach((row) => {
          const dataObj = typeof row === 'object' && !Array.isArray(row) ? row : this.#schema.arrayToObject(row, collectionName);
          this.#gatekeepSyncToLocal(collectionName, dataObj.id, 's', dataObj);
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
        else {
          detailRow = this.#schema.arrayToObject(detailRow, collectionName);
          detailRow.customer_full_name = customerName;
        }
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
    if (collectionName === 'bookings') {
      return this.handleDeleteBooking(id);
    }
    if (!id) return;
    try {
      const res = await this.#firestoreCRUD(collectionName, 'delete', id);
      if (!res.success) throw new Error(res.error);

      if (collectionName === 'booking_details') {
        await this.#firestoreCRUD('operator_entries', 'delete', id);
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
  arrayUnionField = async (collectionName, docId, fieldName, array) => {
    if (!collectionName || !docId || !fieldName || !array) {
      L.log('⚠️ arrayUnionField: Thiếu tham số');
      return { success: false, message: 'Missing required parameters' };
    }
    try {
      const res = await this.#firestoreCRUD(collectionName, 'arrayUnion', docId, array, {
        fieldName: fieldName,
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
      console.error("❌ updateDocument: objData không có field 'id'");
      return { success: false, message: "objData must have 'id' field" };
    }

    try {
      objData.updated_at = firebase.firestore.FieldValue.serverTimestamp();
      const res = await this.#firestoreCRUD(collectionName, 'update', id, objData);
      if (!res.success) throw new Error(res.error);
      else {
        if (collectionName === 'booking_details') {
        }
      }
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

      const collSnap = await this.#db.collection(collectionName).get();
      L._(`📦 Tìm thấy ${collSnap.size} documents.`);

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
          L._(`✅ [${totalUpdated}] ${doc.id}: ${fieldName} = "${newValue}"`);
          this.#gatekeepSyncToLocal(collectionName, doc.id, 'u', data);
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

  // ─── Queries ──────────────────────────────────────────────────────────

  runQuery = async (collectionName, fieldName, operator, value, fieldOrder = null, limit = null) => {
    if (!this.#db) {
      console.error('❌ DB chưa init');
      return null;
    }
    L._(`🔍 Query on ${collectionName}: ${fieldName} ${operator} ${value}`);
    try {
      let query = this.#db.collection(collectionName).where(fieldName, operator, value);
      if (fieldOrder) query = query.orderBy(fieldOrder, 'desc');
      if (limit && limit > 0) query = query.limit(limit);

      const querySnap = await query.get();
      const results = [];
      querySnap.forEach((doc) => results.push(doc.data()));
      L._(`✅ Query returned ${results.length} items from ${collectionName}`);
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
          L.log(`⚠️ generateIdsBatch: cannot derive lastNo for ${collectionName}:`, e);
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

    const counterRef = this.#db.collection('counters_id').doc(collectionName);

    try {
      const counterSnap = await counterRef.get();
      let lastNo = 0;
      let prefix = '';
      let useRandomId = false;

      // TRƯỜNG HỢP 1: Có cấu hình counter trong DB
      if (counterSnap.exists) {
        const data = counterSnap.data();
        if (collectionName === 'booking_details') {
          prefix = bookingId ? `${bookingId}_` : 'SID_';
        } else {
          prefix = data.prefix || '';
        }

        // FIX: Ép kiểu an toàn, mặc định là 0 nếu dữ liệu DB bị lỗi (undefined/null/"")
        lastNo = Number(data.last_no) || 0;

        if (lastNo > 0) {
          await this._updateCounter(collectionName, lastNo + 1);
        }
      }
      // TRƯỜNG HỢP 2: Fallback - Tìm document mới nhất để tự suy luận ID
      else {
        try {
          const latestSnap = await this.#db.collection(collectionName).orderBy('id', 'desc').limit(1).get();

          if (!latestSnap.empty) {
            const latestId = String(latestSnap.docs[0].id || '').trim();

            // FIX: Dùng Regex tìm chính xác tất cả các chữ số nằm ở CUỐI chuỗi (VD: BK-2023 -> 2023)
            const match = latestId.match(/(\d+)$/);

            if (match) {
              lastNo = parseInt(match[1], 10);
              prefix = latestId.substring(0, match.index); // Lấy phần chữ làm prefix
            } else {
              useRandomId = true;
            }
          } else {
            useRandomId = true;
          }
        } catch (e) {
          L.log(`⚠️ Cảnh báo: Không thể suy luận lastNo cho ${collectionName}:`, e.message);
          useRandomId = true; // Rơi vào fallback an toàn nhất
        }
      }

      // XỬ LÝ KẾT QUẢ CUỐI CÙNG
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

    // Đảm bảo collection tồn tại trong APP_DATA để tránh lỗi "Cannot read properties of undefined"
    if (!APP_DATA[collectionName]) {
      APP_DATA[collectionName] = {};
    }

    // 1. Merge dữ liệu để bảo toàn Delta Update
    const current = APP_DATA[collectionName][dataObj.id] || {};
    const merged = { ...current, ...dataObj };
    APP_DATA[collectionName][dataObj.id] = merged;

    // 2. Cập nhật Secondary Indexes
    this.#buildSecondaryIndexes(APP_DATA, collectionName, merged);
  }

  _removeFromAppDataObj(collectionName, id) {
    if (!APP_DATA?.[collectionName]?.[id]) return;
    const doc = APP_DATA[collectionName][id];

    // 1. Xóa khỏi Primary Memory
    delete APP_DATA[collectionName][id];

    // 2. Xóa khỏi Secondary Indexes
    DBManager.#INDEX_CONFIG
      .filter((cfg) => cfg.source === collectionName)
      .forEach(({ index, groupBy }) => {
        const groupKey = doc[groupBy];
        if (groupKey && APP_DATA[index]?.[groupKey]) {
          delete APP_DATA[index][groupKey][id];
          if (Object.keys(APP_DATA[index][groupKey]).length === 0) delete APP_DATA[index][groupKey];
        }
      });
  }

  /**
   * Dừng listeners và reset trạng thái.
   */
  resetOptions = () => {
    this.stopNotificationsListener();
    L._('🔄 DB options đã reset');
  };

  async handleDeleteBooking(bookingId) {
    // 1. (Tùy chọn) Frontend check IndexedDB để khóa UI ở đây...

    // 2. Xác nhận lại người dùng
    const confirm = await Swal.fire({
      title: 'Bạn có chắc chắn muốn xóa?',
      text: 'Hành động này không thể hoàn tác!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Đồng ý xóa',
    });

    if (!confirm.isConfirmed) return;

    try {
      // Show loading
      Swal.showLoading();

      // 3. Khởi tạo Callable Function (v8)
      // Nếu bạn không dùng mặc định (firebase.functions()), bạn phải trỏ đúng app và region
      const functions = firebase.app().functions('asia-southeast1');
      const deleteBookingCall = functions.httpsCallable('deleteBooking');

      // 4. Gọi hàm và truyền tham số lên Server
      const result = await deleteBookingCall({ bookingId: bookingId });

      // 5. Xử lý thành công
      Swal.fire('Thành công!', result.data.message, 'success');

      // TOD0: Viết hàm cập nhật lại UI, xóa booking khỏi IndexedDB (APP_DATA) và render lại bảng
      this.#gatekeepSyncToLocal('bookings', bookingId, 'd');
      // Nếu có bảng booking_details, cũng xóa các details liên quan khỏi APP_DATA và render lại
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

      // Bắt lỗi HttpsError từ Backend ném về (Ví dụ: Lỗi cọc, lỗi Level...)
      Swal.fire({
        icon: 'error',
        title: 'Từ chối thao tác',
        text: error.message || 'Có lỗi xảy ra khi kết nối máy chủ.',
      });
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────
// Tự động khởi chạy khi import — chờ auth ready rồi mới init Firestore.
// Để override config: thay `new DBManager()` bằng `new DBManager({ persistence: false, ... })`
const DB_MANAGER = new DBManager();
export default DB_MANAGER;
