/**
 * ═════════════════════════════════════════════════════════════════════════
 * MIGRATION API
 * ═════════════════════════════════════════════════════════════════════════
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 * ═════════════════════════════════════════════════════════════════════════
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from '../utils/firebase-admin.util.js';
import { FieldValue } from 'firebase-admin/firestore';
import config from '../config/system.config.js';

/**
 * Migrate a field in a Firestore collection (rename, copy, or move).
 */
export const migrateField = onCall(
  {
    region: config.FIREBASE.REGION,
    cors: config.CORS,
    maxInstances: config.FUNCTIONS.MAX_INSTANCES,
    timeoutSeconds: config.FUNCTIONS.TIMEOUT,
  },
  async (request) => {
    const { collection, oldField, newField, type = 'move' } = request.data;

    if (!request.auth) {
      logger.warn('⚠️ Unauthenticated request to migrateField');
      throw new HttpsError('unauthenticated', 'User must be authenticated to run migrations');
    }

    logger.info(`🔐 Migration request from user: ${request.auth.uid}`);

    if (!collection || typeof collection !== 'string' || !collection.trim()) {
      throw new HttpsError('invalid-argument', 'Parameter "collection" is required and must be a non-empty string');
    }

    if (!oldField || typeof oldField !== 'string' || !oldField.trim()) {
      throw new HttpsError('invalid-argument', 'Parameter "oldField" is required and must be a non-empty string');
    }

    if (!newField || typeof newField !== 'string' || !newField.trim()) {
      throw new HttpsError('invalid-argument', 'Parameter "newField" is required and must be a non-empty string');
    }

    if (!['copy', 'move'].includes(type)) {
      throw new HttpsError('invalid-argument', 'Parameter "type" must be "copy" or "move" (default: "move")');
    }

    if (oldField === newField) {
      throw new HttpsError('invalid-argument', 'oldField and newField cannot be the same');
    }

    const db = getFirestore();
    let documentsProcessed = 0;
    let documentsFailed = 0;
    const errors = [];
    const BATCH_SIZE = 500;

    try {
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

      logger.info(`🚀 Migration started: ${totalDocs} documents found in "${collection}"`);

      for (let i = 0; i < totalDocs; i += BATCH_SIZE) {
        const batch = db.batch();
        const batchDocs = docs.slice(i, Math.min(i + BATCH_SIZE, totalDocs));
        let batchSize = 0;

        batchDocs.forEach((doc) => {
          try {
            const data = doc.data();

            if (!(oldField in data)) {
              return;
            }

            const updateData = {};
            updateData[newField] = data[oldField];

            if (type === 'move') {
              updateData[oldField] = FieldValue.delete();
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

        if (batchSize > 0) {
          await batch.commit();
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
          const batchProgress = Math.min(i + BATCH_SIZE, totalDocs);
          logger.info(`✅ Batch ${batchNumber} committed: ${batchProgress}/${totalDocs} documents processed`);
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
        message: `Successfully migrated field "${oldField}" to "${newField}" in ` + `collection "${collection}" (${documentsProcessed}/${totalDocs} documents, ` + `${Math.ceil(documentsProcessed / BATCH_SIZE)} batches, type: ${type})`,
      };

      logger.info(`🎉 ${result.message}`);
      return result;
    } catch (error) {
      logger.error('Migration error:', error);
      throw new HttpsError('internal', `Migration failed: ${error.message}`);
    }
  }
);
