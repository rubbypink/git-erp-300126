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
      // ─── Check Firebase Initialization ───
      if (typeof firebase === 'undefined' || !firebase.functions) {
        throw new Error('Firebase functions not initialized. Please load Firebase SDK first.');
      }

      // ─── Check User Authentication ───
      const currentUser = firebase.auth().currentUser;
      if (!currentUser) {
        throw new Error(
          'User not authenticated. Please login first. ' +
          'Run: await firebase.auth().signInWithEmailAndPassword(email, password)'
        );
      }

      // ─── Refresh ID Token (Very Important!) ───
      // Firebase tokens expire after 1 hour. Refresh to ensure valid token
      console.log('%c🔐 Refreshing authentication token...', 'color: #FF9800; font-weight: bold');
      await currentUser.getIdToken(true);
      console.log('%c✅ Token refreshed successfully', 'color: #4CAF50');

      const app = firebase.app();
      const migrate = app.functions('asia-southeast1').httpsCallable('migrateField');

      console.log(
        `%c🔄 Starting Migration...`,
        'color: #2196F3; font-weight: bold'
      );
      console.log(`   Collection: ${collection}`);
      console.log(`   Old Field: ${oldField}`);
      console.log(`   New Field: ${newField}`);
      console.log(`   Operation: ${type.toUpperCase()}`);
      console.log(`   Authenticated as: ${currentUser.email}`);

      // Call the Cloud Function
      const result = await migrate({
        collection,
        oldField,
        newField,
        type,
      });

      // Log results
      console.log(
        `%c✅ Migration Completed Successfully!`,
        'color: #4CAF50; font-weight: bold'
      );
      console.log(`   Total Documents Scanned: ${result.data.totalDocumentsScanned}`);
      console.log(`   Documents Processed: ${result.data.documentsProcessed}`);
      console.log(`   Documents Failed: ${result.data.documentsFailed}`);
      console.log(`   Batches Executed: ${result.data.batchesExecuted}`);
      console.log(`   Batch Size Limit: ${result.data.batchSize} documents/batch`);
      if (result.data.errors.length > 0) {
        console.warn('   Errors:', result.data.errors);
      }
      console.log(`   Message: ${result.data.message}`);

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

    for (const {oldField, newField} of fieldPairs) {
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

