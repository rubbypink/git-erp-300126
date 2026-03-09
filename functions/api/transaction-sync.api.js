/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Transaction Sync API
 * Cloud Functions triggers cho collection transactions
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { logger } = require('firebase-functions');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { syncTransactionToFundAccount } = require('../services/transaction-sync.service');
const config = require('../config/system.config');

const REGION = config.FIREBASE.REGION;

/**
 * TRIGGER: Khi có bất kỳ thay đổi nào (Create, Update, Delete) trên transactions
 * Tự động cập nhật số dư tài khoản quỹ tương ứng
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
      logger.info(`🚀 Bắt đầu xử lý đồng bộ cho transaction: ${transactionId}`);

      const result = await syncTransactionToFundAccount(transactionId, afterData || null, beforeData || null);

      return result;
    } catch (error) {
      logger.error(`❌ Lỗi trigger syncTransactionOnWrite cho ${transactionId}:`, error);
      // Trong môi trường production, có thể cần cơ chế retry hoặc thông báo lỗi nghiêm trọng
      return { success: false, error: error.message };
    }
  }
);
