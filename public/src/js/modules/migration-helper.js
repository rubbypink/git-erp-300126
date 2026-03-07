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

/** Load firebase-functions SDK động nếu chưa có (chỉ gọi khi admin dùng migration) */
function _loadFunctionsSDK() {
  if (typeof firebase !== 'undefined' && firebase.functions) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/8.10.0/firebase-functions.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Không thể load firebase-functions SDK'));
    document.head.appendChild(s);
  });
}

export const migrationHelper = (() => {
  /**
   * Execute field migration in a Firestore collection
   *
   * Handles automatic batch splitting for large collections.
   * Max 500 writes per batch (Firestore limit).
   *
   * @param {string} collection - Collection name
   * @param {string} oldField - Old field name to migrate from
   * @param {string} newField - New field name to migrate to
   * @param {string} type - 'copy' (keep old) or 'move' (delete old), default 'move'
   * @returns {Promise<Object>} Migration result with batch details
   */
  async function migrateField(collection, oldField, newField, type = 'move') {
    try {
      // ─── Load Functions SDK on demand ───
      await _loadFunctionsSDK();

      // ─── Check User Authentication ───
      const currentUser = firebase.auth().currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated. Please login first. ' + 'Run: await firebase.auth().signInWithEmailAndPassword(email, password)');
      }

      // ─── Refresh ID Token (Very Important!) ───
      // Firebase tokens expire after 1 hour. Refresh to ensure valid token
      L._('%c🔐 Refreshing authentication token...', 'color: #FF9800; font-weight: bold');
      await currentUser.getIdToken(true);
      L._('%c✅ Token refreshed successfully', 'color: #4CAF50');

      const app = firebase.app();
      const migrate = app.functions('asia-southeast1').httpsCallable('migrateField');

      L._(`%c🔄 Starting Migration...`, 'color: #2196F3; font-weight: bold');
      L._(`   Collection: ${collection}`);
      L._(`   Old Field: ${oldField}`);
      L._(`   New Field: ${newField}`);
      L._(`   Operation: ${type.toUpperCase()}`);
      L._(`   Authenticated as: ${currentUser.email}`);

      // Call the Cloud Function
      const result = await migrate({
        collection,
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
      if (result.data.errors.length > 0) {
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
   * @param {string} collection - Collection name
   * @param {Array<{oldField, newField}>} fieldPairs - Array of field pairs
   * @param {string} type - Operation type ('copy' or 'move')
   * @returns {Promise<Array>} Array of migration results
   */
  async function migrateFields(collection, fieldPairs, type = 'move') {
    const results = [];

    for (const { oldField, newField } of fieldPairs) {
      try {
        const result = await migrateField(collection, oldField, newField, type);
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
