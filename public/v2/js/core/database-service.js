/**
 * DATABASE SERVICE (Core)
 * Vai trò: Cung cấp công cụ kết nối và thao tác Firestore.
 * Nguyên tắc: Không chứa logic nghiệp vụ, không hardcode tên collection.
 */
import { APP_CONFIG } from '../core/app-config.js';

class DatabaseService {
    constructor() {
        this.db = null;
    }

    /**
     * Khởi tạo kết nối (Gọi từ main.js sau khi init Firebase)
     * @param {Object} firestoreInstance 
     */
    init(firestoreInstance) {
        this.db = firestoreInstance;
        console.log("✅ [DB] Service Ready");
    }

    /**
     * Lấy 1 document theo ID
     */
    async getOne(collectionName, id) {
        if (!this.db) throw new Error("DB not initialized");
        try {
            const doc = await this.db.collection(collectionName).doc(String(id)).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (e) {
            console.error(`[DB] getOne Error (${collectionName}/${id}):`, e);
            throw e;
        }
    }

    /**
     * Lấy danh sách (Có hỗ trợ query cơ bản)
     * @param {string} collectionName 
     * @param {Object} options { limit: number, orderBy: {field, dir}, where: [{field, op, val}] }
     */
    async getList(collectionName, options = {}) {
        if (!this.db) throw new Error("DB not initialized");
        
        try {
            let ref = this.db.collection(collectionName);

            // 1. Apply Filters (Where)
            if (options.where && Array.isArray(options.where)) {
                options.where.forEach(cond => {
                    ref = ref.where(cond.field, cond.op, cond.val);
                });
            }

            // 2. Apply Sorting
            if (options.orderBy) {
                ref = ref.orderBy(options.orderBy.field, options.orderBy.dir || 'asc');
            }

            // 3. Apply Limit
            if (options.limit) {
                ref = ref.limit(options.limit);
            }

            const snapshot = await ref.get();
            
            // Trả về mảng Object chuẩn
            const data = [];
            snapshot.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() });
            });
            
            return data;
        } catch (e) {
            console.error(`[DB] getList Error (${collectionName}):`, e);
            throw e;
        }
    }

    // Hàm set nguyên bản (Ghi đè hoặc tạo mới nếu đã có ID)
    async set(coll, id, data, merge = true) {
        if (!this.db) throw new Error("DB not init");
        const payload = { ...data, updated_at: new Date().toISOString() };
        await this.db.collection(coll).doc(String(id)).set(payload, { merge });
        return id;
    }

    // Hàm CREATE mới: Tự động sinh ID -> Gọi Set
    async create(coll, data) {
        const newId = await this.generateId(coll);
        const payload = { ...data, created_at: new Date().toISOString() };
        await this.set(coll, newId, payload);
        return newId;
    }

    // --- ADVANCED ---
    async generateId(coll) {
        // Lấy config từ APP_CONFIG (Centralized)
        const cfg = APP_CONFIG.database.idConfig[coll];
        if (!cfg) return this.db.collection(coll).doc().id; // Fallback random ID

        return await this.db.runTransaction(async (t) => {
            const ref = this.db.doc(cfg.path);
            const doc = await t.get(ref);
            const nextVal = (doc.exists ? (doc.data()[cfg.field] || 0) : 0) + 1;
            t.set(ref, { [cfg.field]: nextVal }, { merge: true });
            return `${cfg.prefix}${String(nextVal).padStart(5, '0')}`;
        });
    }

    /**
     * Xóa document
     */
    async delete(collectionName, id) {
        if (!this.db) throw new Error("DB not initialized");
        try {
            await this.db.collection(collectionName).doc(String(id)).delete();
            return true;
        } catch (e) {
            console.error(`[DB] delete Error:`, e);
            throw e;
        }
    }
    /**
    * 1. TRANSACTION WRAPPER (Safe Atomic Operations)
    * @param {Function} updateFunction - Hàm thực thi logic trong transaction (nhận tham số 't')
    */
   async runTransaction(updateFunction) {
       if (!this.db) throw new Error("DB not initialized");
       try {
           await this.db.runTransaction(async (t) => {
               await updateFunction(t);
           });
           return true;
       } catch (e) {
           console.error("[DB] Transaction Failed:", e);
           throw e;
       }
   }

   /**
    * 2. BATCH WRITE (Grouped Requests)
    * Tự động chunking nếu danh sách quá lớn (> 450 items)
    * @param {Array} operations - Mảng các lệnh: { type: 'set'|'delete'|'update', ref: DocRef, data: Object }
    */
   async runBatch(operations) {
       if (!this.db) throw new Error("DB not initialized");
       if (!operations || operations.length === 0) return;

       const CHUNK_SIZE = 450; // Firestore limit là 500
       const chunks = [];

       for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
           chunks.push(operations.slice(i, i + CHUNK_SIZE));
       }

       console.log(`[DB] Running Batch: ${operations.length} ops in ${chunks.length} chunks.`);

       for (const chunk of chunks) {
           const batch = this.db.batch();
           chunk.forEach(op => {
               // op.ref phải là Firestore Document Reference
               // Nếu người dùng truyền string path, ta phải convert (tùy logic controller)
               // Ở đây giả định controller truyền DocRef chuẩn.
               if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
               else if (op.type === 'update') batch.update(op.ref, op.data);
               else if (op.type === 'delete') batch.delete(op.ref);
           });
           await batch.commit();
       }
   }
  
}

// Export Singleton Instance
export const DbService = new DatabaseService();