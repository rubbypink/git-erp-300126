/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Transaction Sync Service
 * Xử lý logic đồng bộ giữa Transactions và Fund Accounts
 * Updated for Firebase Admin SDK v13 (Modular)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { logger } from 'firebase-functions';
import { getFirestore } from '../utils/firebase-admin.util.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Xử lý cập nhật số dư tài khoản quỹ khi có thay đổi trong transactions
 */
async function syncTransactionToFundAccount(transactionId, newData, oldData) {
  const db = getFirestore();

  try {
    return await db.runTransaction(async (t) => {
      const isCreate = !oldData && newData;
      const isDelete = oldData && !newData;
      const isUpdate = oldData && newData;

      const fundAccountId = newData?.fund_source || oldData?.fund_source;
      if (!fundAccountId) {
        logger.info(`OldData: ${oldData}, NewData: ${newData}`);
        throw new Error('Không thể cập nhật nếu thiếu tài khoản đích!.');
      }

      const fundAccountRef = db.collection('fund_accounts').doc(fundAccountId);
      const fundAccountDoc = await t.get(fundAccountRef);

      if (!fundAccountDoc.exists) {
        throw new Error(`Tài khoản quỹ ${fundAccountId} không tồn tại.`);
      }
      if (newData.amount < 0) {
        throw new Error('Không được nhập số âm. Hãy tạo phiếu đối trừ!');
      }

      const transStatus = newData?.status || oldData?.status;
      if (transStatus !== 'Completed') {
        return { success: true, message: 'Transaction ở trạng thái Planning/ Pending, không cập nhật số dư.' };
      }

      const fundAccountData = fundAccountDoc.data();
      const currentBalance = fundAccountData.balance || 0;
      let newBalance = currentBalance;
      let action;

      if (isCreate) {
        const amount = newData.amount || 0;
        const type = newData.type;
        action = 'set';

        if (type === 'IN') {
          newBalance += amount;
        } else if (type === 'OUT') {
          if (amount > currentBalance) {
            throw new Error(`Số dư tài khoản quỹ không đủ để thực hiện phiếu chi (Cần: ${amount}, Hiện có: ${currentBalance})`);
          }
          newBalance -= amount;
        }
      } else if (isDelete) {
        const amount = oldData.amount || 0;
        const type = oldData.type;
        action = 'delete';

        if (type === 'IN') {
          if (newBalance < amount) {
            throw new Error('Số dư không đủ để xóa phiếu thu.');
          }
          newBalance -= amount;
        } else if (type === 'OUT') {
          newBalance += amount;
        }
      } else if (isUpdate) {
        if (oldData.fund_source !== newData.fund_source) {
          throw new Error('Không hỗ trợ thay đổi tài khoản quỹ trực tiếp trên transaction. Vui lòng xóa và tạo mới.');
        }
        action = 'update';
        const oldAmount = oldData.amount || 0;
        const newAmount = newData.amount || 0;
        const oldType = oldData.type;
        const newType = newData.type;

        if (oldType !== newType) {
          throw new Error('Không hỗ trợ thay đổi loại phiếu chi trên transaction. Vui lòng xóa và tạo mới.');
        } else {
          const diff = newAmount - oldAmount;
          if (newType === 'IN') {
            newBalance += diff;
          } else {
            if (diff > 0 && diff > currentBalance) {
              throw new Error('Số dư không đủ để tăng giá trị phiếu chi.');
            }
            newBalance -= diff;
          }
        }
      }

      t.update(fundAccountRef, {
        balance: newBalance,
        updated_at: FieldValue.serverTimestamp(),
      });

      const notifRef = db.collection('notifications').doc();
      const typeStr = (newData?.type || oldData?.type) === 'IN' ? 'Phiếu thu' : 'Phiếu chi';
      const actionCode = { set: 's', update: 'u', delete: 'd', increment: 'i' }[action] ?? action;

      const collection = 'fund_accounts';
      const notifId = `$fund_accounts_${fundAccountId ?? 'x'}_${Date.now()}`;
      t.set(notifRef, {
        id: notifId,
        message: `Đồng bộ ${typeStr} ${transactionId} -> Cập nhật số dư tài khoản ${fundAccountData.name || fundAccountId}: ${currentBalance.toLocaleString()}đ -> ${newBalance.toLocaleString()}đ`,
        type: 'data-change',
        collection: collection,
        action: actionCode,
        data: JSON.stringify({ coll: collection, fundAccountId, action: actionCode, payload: fundAccountData }),
        payload: fundAccountData,
        created_at: FieldValue.serverTimestamp(),
        created_by: 'transaction-sync-service',
      });
      return {
        success: true,
        transactionId,
        fundAccountId,
        oldBalance: currentBalance,
        newBalance,
      };
    });
  } catch (error) {
    logger.error(`❌ Lỗi đồng bộ transaction ${transactionId}:`, error);
    throw error;
  }
}

export { syncTransactionToFundAccount };
