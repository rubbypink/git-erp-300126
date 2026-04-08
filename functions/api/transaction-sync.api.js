/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Transaction Sync API
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { logger } = require('firebase-functions');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { syncTransactionToFundAccount } = require('../services/transaction-sync.service');
const { getFirestore } = require('../utils/firebase-admin.util');
const config = require('../config/system.config');

const REGION = config.FIREBASE.REGION;

/**
 * TRIGGER: Khi có bất kỳ thay đổi nào trên transactions
 */
exports.syncTransactionOnWrite = onDocumentWritten(
  {
    document: 'transactions/{transactionId}',
    region: REGION,
  },
  async (event) => {
    const transactionId = event.params.transactionId;
    const beforeData = event.data.before.data?.();
    const afterData = event.data.after.data?.();

    try {
      if (beforeData && beforeData.status === 'Commited') {
        const auth = event.auth;
        let canUpdate = false;

        if (auth && auth.uid) {
          const db = getFirestore();
          const userDoc = await db.collection('users').doc(auth.uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.level >= 50) {
              canUpdate = true;
            }
          }
        }

        if (!canUpdate) {
          return { success: false, error: 'Không thể chỉnh sửa giao dịch đã chốt số dư.' };
        }
      }

      const result = await syncTransactionToFundAccount(transactionId, afterData || null, beforeData || null);

      return result;
    } catch (error) {
      logger.error(`❌ Lỗi trigger syncTransactionOnWrite cho ${transactionId}:`, error);
      return { success: false, error: error.message };
    }
  }
);
