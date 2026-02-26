/**
 * ═════════════════════════════════════════════════════════════════════════
 * MIGRATION API
 * ═════════════════════════════════════════════════════════════════════════
 * Functions for data migration operations:
 *   - migrateField: Rename/copy field across all documents in a collection
 * 
 * Region: asia-southeast1 (Bangkok/Singapore) for better latency for VN users
 * ═════════════════════════════════════════════════════════════════════════
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {logger} = require('firebase-functions');
const admin = require('firebase-admin');
const config = require('../config/system.config');

/**
 * Migrate a field in a Firestore collection (rename, copy, or move).
 * 
 * Supports two operation types:
 *   - 'copy': Copy data from oldField to newField, keep oldField
 *   - 'move': Copy data from oldField to newField, delete oldField (default)
 * 
 * @param {string} collection - Collection name (required)
 * @param {string} oldField - Source field name (required)
 * @param {string} newField - Target field name (required)
 * @param {string} [type='move'] - Operation type: 'copy' or 'move'
 * 
 * @returns {Object} Migration result:
 *   - success: boolean
 *   - documentsProcessed: number
 *   - documentsFailed: number
 *   - errors: Array of error details
 *   - message: string
 * 
 * @example
 * // Rename field 'customer_name' to 'full_name' in 'bookings' collection
 * const result = await migrateField({
 *   collection: 'bookings',
 *   oldField: 'customer_name',
 *   newField: 'full_name',
 *   type: 'move' // or 'copy'
 * });
 */
exports.migrateField = onCall(
    {
      region: config.FIREBASE.REGION,
      cors: config.CORS,
      maxInstances: config.FUNCTIONS.MAX_INSTANCES,
      timeoutSeconds: config.FUNCTIONS.TIMEOUT,
    },
    async (request) => {
      const {collection, oldField, newField, type = 'move'} = request.data;

// ─── Verify Authentication ───
      if (!request.auth) {
        logger.warn('⚠️ Unauthenticated request to migrateField');
        throw new HttpsError(
          'unauthenticated',
          'User must be authenticated to run migrations'
        );
      }

      logger.info(`🔐 Migration request from user: ${request.auth.uid}`);

      // ─── Verify Admin Role (optional: enforce admin-only access) ───
      // Uncomment to restrict migrations to admins only
      // const userDoc = await admin.firestore()
      //   .collection('users')
      //   .doc(request.auth.uid)
      //   .get();
      // if (userDoc.data()?.role !== 'admin') {
      //   throw new HttpsError(
      //     'permission-denied',
      //     'Only admins can run data migrations'
      //   );
      // }

      // ─── Validate Input Parameters ───
      if (!collection || typeof collection !== 'string' || !collection.trim()) {
        throw new HttpsError(
          'invalid-argument',
          'Parameter "collection" is required and must be a non-empty string'
        );
      }

      if (!oldField || typeof oldField !== 'string' || !oldField.trim()) {
        throw new HttpsError(
          'invalid-argument',
          'Parameter "oldField" is required and must be a non-empty string'
        );
      }

      if (!newField || typeof newField !== 'string' || !newField.trim()) {
        throw new HttpsError(
          'invalid-argument',
          'Parameter "newField" is required and must be a non-empty string'
        );
      }

      if (!['copy', 'move'].includes(type)) {
        throw new HttpsError(
          'invalid-argument',
          'Parameter "type" must be "copy" or "move" (default: "move")'
        );
      }

      // Prevent operating on the same field
      if (oldField === newField) {
        throw new HttpsError(
          'invalid-argument',
          'oldField and newField cannot be the same'
        );
      }

      // ─── Execute Migration ───
      const db = admin.firestore();
      let documentsProcessed = 0;
      let documentsFailed = 0;
      const errors = [];
      const BATCH_SIZE = 500; // Firestore batch limit

      try {
        // Get all documents in collection
        const querySnapshot = await db.collection(collection).get();

        if (querySnapshot.empty) {
          logger.info(`📭 Collection "${collection}" is empty`);
          return {
            success: true,
            documentsProcessed: 0,
            documentsFailed: 0,
            errors: [],
            message: `Collection "${collection}" is empty. No documents to migrate.`,
          };
        }

        const docs = querySnapshot.docs;
        const totalDocs = docs.length;
        
        logger.info(
          `🚀 Migration started: ${totalDocs} documents found in "${collection}"`
        );

        // Process documents in batches (Firestore limit: 500 ops per batch)
        for (let i = 0; i < totalDocs; i += BATCH_SIZE) {
          const batch = db.batch();
          const batchDocs = docs.slice(i, Math.min(i + BATCH_SIZE, totalDocs));
          let batchSize = 0;

          // Process each document in this batch
          batchDocs.forEach((doc) => {
            try {
              const data = doc.data();

              // Skip documents that don't have the oldField
              if (!(oldField in data)) {
                return;
              }

              // Prepare update object
              const updateData = {};
              updateData[newField] = data[oldField];

              // For 'move' type, add delete operation for oldField
              if (type === 'move') {
                updateData[oldField] = admin.firestore.FieldValue.delete();
              }

              batch.update(doc.ref, updateData);
              documentsProcessed++;
              batchSize++;
            } catch (error) {
              documentsFailed++;
              errors.push({
                documentId: doc.id,
                error: error.message,
              });
            }
          });

          // Commit batch if it has operations
          if (batchSize > 0) {
            await batch.commit();
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const batchProgress = Math.min(i + BATCH_SIZE, totalDocs);
            logger.info(
              `✅ Batch ${batchNumber} committed: ${batchProgress}/${totalDocs} documents processed`
            );
          }
        }

        const result = {
          success: true,
          documentsProcessed,
          documentsFailed,
          errors,
          batchSize: BATCH_SIZE,
          batchesExecuted: Math.ceil(totalDocs / BATCH_SIZE),
          totalDocumentsScanned: totalDocs,
          message: `Successfully migrated field "${oldField}" to "${newField}" in ` +
                   `collection "${collection}" (${documentsProcessed}/${totalDocs} documents, ` +
                   `${Math.ceil(documentsProcessed / BATCH_SIZE)} batches, type: ${type})`,
        };

        logger.info(`🎉 ${result.message}`);
        return result;
      } catch (error) {
        logger.error('Migration error:', error);
        throw new HttpsError(
          'internal',
          `Migration failed: ${error.message}`
        );
      }
    }
);
// The migrateField function is exported at the top using exports.migrateField

