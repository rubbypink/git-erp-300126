/**
 * ═════════════════════════════════════════════════════════════════════════
 * MIGRATION HELPER - Client-side Utility
 * ═════════════════════════════════════════════════════════════════════════
 * Helper functions to call the migrateField Cloud Function from the client
 *
 * Handles automatic batch splitting for large collections (max 500 per batch)
 *
 * Usage:
 *   1. Ensure user is logged in
 *   2. Call: migrationHelper.migrateField(...)
 *   3. Monitor progress in console
 * ═════════════════════════════════════════════════════════════════════════
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, query, where, limit, orderBy, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';

// Nhớ import 'db' từ file cấu hình Firebase của bạn
// import { db } from "./config/firebase-config.js";

export const migrationHelper = (() => {
  /**
   * Execute field migration in a Firestore collection
   *
   * Handles automatic batch splitting for large collections.
   * Max 500 writes per batch (Firestore limit).
   *
   * @param {string} collectionName - Collection name
   * @param {string} oldField - Old field name to migrate from
   * @param {string} newField - New field name to migrate to
   * @param {string} type - 'copy' (keep old) or 'move' (delete old), default 'move'
   * @returns {Promise<Object>} Migration result with batch details
   */
  async function migrateField(collectionName, oldField, newField, type = 'move') {
    try {
      const auth = getAuth(getApp());
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated. Please login first.');
      }

      // ─── Refresh ID Token (Very Important!) ───
      // Firebase tokens expire after 1 hour. Refresh to ensure valid token
      L._('%c🔐 Refreshing authentication token...', 'color: #FF9800; font-weight: bold');
      await currentUser.getIdToken(true);
      L._('%c✅ Token refreshed successfully', 'color: #4CAF50');

      const functions = getFunctions(getApp(), 'asia-southeast1');
      const migrate = httpsCallable(functions, 'migrateField');

      L._(`%c🔄 Starting Migration...`, 'color: #2196F3; font-weight: bold');
      L._(`   Collection: ${collectionName}`);
      L._(`   Old Field: ${oldField}`);
      L._(`   New Field: ${newField}`);
      L._(`   Operation: ${type.toUpperCase()}`);
      L._(`   Authenticated as: ${currentUser.email}`);

      // Call the Cloud Function
      const result = await migrate({
        collection: collectionName,
        oldField,
        newField,
        type,
      });

      // Log results
      L._(`%c✅ Migration Completed Successfully!`, 'color: #4CAF50; font-weight: bold');
      L._(`   Total Documents Scanned: ${result.data.totalDocumentsScanned}`);
      L._(`   Documents Processed: ${result.data.documentsProcessed}`);
      L._(`   Documents Failed: ${result.data.documentsFailed}`);
      L._(`   Batches Executed: ${result.data.batchesExecuted}`);
      L._(`   Batch Size Limit: ${result.data.batchSize} documents/batch`);
      if (result.data.errors && result.data.errors.length > 0) {
        console.warn('   Errors:', result.data.errors);
      }
      L._(`   Message: ${result.data.message}`);

      return result.data;
    } catch (error) {
      console.error('%c❌ Migration Failed!', 'color: #F44336; font-weight: bold');
      console.error(`   Error Code: ${error.code}`);
      console.error(`   Error Message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Batch migrate multiple fields using the same parameters
   *
   * @param {string} collectionName - Collection name
   * @param {Array<{oldField, newField}>} fieldPairs - Array of field pairs
   * @param {string} type - Operation type ('copy' or 'move')
   * @returns {Promise<Array>} Array of migration results
   */
  async function migrateFields(collectionName, fieldPairs, type = 'move') {
    const results = [];

    for (const { oldField, newField } of fieldPairs) {
      try {
        const result = await migrateField(collectionName, oldField, newField, type);
        results.push({
          oldField,
          newField,
          success: true,
          data: result,
        });
      } catch (error) {
        results.push({
          oldField,
          newField,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  return {
    migrateField,
    migrateFields,
  };
})();

/**
 * =========================================================================
 * MIGRATION: CẬP NHẬT HÀNG LOẠT GIÁ TRỊ CHO 1 FIELD (OPTIMIZED)
 * =========================================================================
 * @description Sử dụng LocalDB để lọc dữ liệu và Batch Write để cập nhật Firestore & LocalDB
 * @param {string} collectionName - Tên collection (vd: 'bookings')
 * @param {string} field - Tên trường cần update (vd: 'status')
 * @param {any} oldVal - Giá trị cũ cần tìm
 * @param {any} newVal - Giá trị mới cần gán
 */
export async function runMigrateFieldData(collectionName, field, oldVal, newVal) {
  L._(`🚀 [MIGRATION] Bắt đầu cập nhật ${collectionName}: ${field} [${oldVal}] -> [${newVal}]`, 'info');
  const db = A.DB;
  try {
    // 1. Lấy dữ liệu từ IndexedDB bằng A.DB.storage.getCollection
    const storage = A.DB?.local || window.localDB;
    if (!storage || typeof storage.getCollection !== 'function') {
      throw new Error('Không tìm thấy DB Storage (A.DB.storage) hoặc hàm getCollection không khả dụng.');
    }

    L._(`📥 Đang lấy dữ liệu từ LocalDB cho '${collectionName}'...`);
    const allDocs = await storage.getCollection(collectionName);

    // 2. Lọc các bản ghi cần cập nhật (item[field] === oldVal)
    const filteredDocs = allDocs.filter((item) => item[field] === oldVal);

    if (filteredDocs.length === 0) {
      L._(`ℹ️ Không tìm thấy bản ghi nào trong LocalDB '${collectionName}' có ${field} = ${oldVal}`, 'warning');
      return;
    }

    const total = filteredDocs.length;
    L._(`📦 Tìm thấy ${total} bản ghi cần cập nhật.`, 'info');

    let processed = 0;
    let localBatch = [];
    let countInBatch = 0;

    // 3. Duyệt và cập nhật Firestore bằng writeBatch
    for (const docData of filteredDocs) {
      const docId = docData.id || docData.uid;
      if (!docId) continue;

      // Chuẩn bị dữ liệu cho Local DB (updated_at dùng Date.now())
      localBatch.push({
        ...docData,
        [field]: newVal,
        updated_at: Date.now(),
      });
    }
    A.DB.batchSave(collectionName, localBatch);
    A.DB.local.putBatch(collectionName, localBatch);

    L._(`🎉 [MIGRATION HOÀN TẤT] Đã cập nhật thành công ${processed} bản ghi lên Firestore và LocalDB!`, 'success');
  } catch (error) {
    if (typeof Opps === 'function') {
      Opps(`❌ [MIGRATION ERROR] Thất bại khi migrate ${collectionName}:`, error);
    } else {
      console.error('❌ [MIGRATION ERROR]', error);
    }
  }
}
