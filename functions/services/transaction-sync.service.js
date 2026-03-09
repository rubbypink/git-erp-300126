/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Transaction Sync Service
 * Xử lý logic đồng bộ giữa Transactions và Fund Accounts
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { logger } = require('firebase-functions');
const { getFirestore, admin } = require('../utils/firebase-admin.util');

/**
 * Xử lý cập nhật số dư tài khoản quỹ khi có thay đổi trong transactions
 * Sử dụng Firestore Transaction để đảm bảo tính đồng bộ tuyệt đối
 *
 * @param {string} transactionId - ID của transaction
 * @param {Object|null} newData - Dữ liệu mới của transaction (null nếu là delete)
 * @param {Object|null} oldData - Dữ liệu cũ của transaction (null nếu là create)
 * @returns {Promise<Object>} Kết quả xử lý
 */
async function syncTransactionToFundAccount(transactionId, newData, oldData) {
  const db = getFirestore();

  try {
    return await db.runTransaction(async (t) => {
      // 1. Xác định loại thao tác: CREATE, UPDATE, DELETE
      const isCreate = !oldData && newData;
      const isDelete = oldData && !newData;
      const isUpdate = oldData && newData;

      // 2. Lấy thông tin fund_source (ID của fund_account)
      const fundAccountId = newData?.fund_source || oldData?.fund_source;
      if (!fundAccountId) {
        throw new Error(`Không thể cập nhật nếu thiếu tài khoản đích!.`);
      }

      const fundAccountRef = db.collection('fund_accounts').doc(fundAccountId);
      const fundAccountDoc = await t.get(fundAccountRef);

      if (!fundAccountDoc.exists) {
        throw new Error(`Tài khoản quỹ ${fundAccountId} không tồn tại.`);
      }

      const transStatus = newData.status;
      if (transStatus === 'Planning') {
        logger.info(`⚠️ Transaction ${transactionId} đang ở trạng thái 'Planning', bỏ qua đồng bộ số dư.`);
        return { success: true, message: 'Transaction ở trạng thái Planning, không cập nhật số dư.' };
      } else if (transStatus === 'Pending') {
        logger.info(`⚠️ Transaction ${transactionId} đang ở trạng thái 'Pending', bỏ qua đồng bộ số dư.`);
        return { success: true, message: 'Transaction ở trạng thái Pending, không cập nhật số dư.' };
      }

      const fundAccountData = fundAccountDoc.data();
      let currentBalance = fundAccountData.balance || 0;
      let newBalance = currentBalance;
      let action;

      // 3. Tính toán biến động số dư
      if (isCreate) {
        const amount = newData.amount || 0;
        const type = newData.type; // IN hoặc OUT
        action = 'set';

        if (type === 'IN') {
          newBalance += amount;
        } else if (type === 'OUT') {
          // Valid phiếu chi: amount < balance
          if (amount > currentBalance) {
            throw new Error(`Số dư tài khoản quỹ không đủ để thực hiện phiếu chi (Cần: ${amount}, Hiện có: ${currentBalance})`);
          }
          newBalance -= amount;
        }
      } else if (isDelete) {
        const amount = oldData.amount || 0;
        const type = oldData.type;
        action = 'delete';

        // Xóa phiếu thu (IN) -> Trừ lại balance
        if (type === 'IN') {
          newBalance -= amount;
        }
        // Xóa phiếu chi (OUT) -> Cộng lại balance
        else if (type === 'OUT') {
          newBalance += amount;
        }
      } else if (isUpdate) {
        // Trường hợp đổi fund_source (hiếm nhưng phải xử lý nếu có)
        if (oldData.fund_source !== newData.fund_source) {
          throw new Error('Không hỗ trợ thay đổi tài khoản quỹ trực tiếp trên transaction. Vui lòng xóa và tạo mới.');
        }
        action = 'update';
        const oldAmount = oldData.amount || 0;
        const newAmount = newData.amount || 0;
        const oldType = oldData.type;
        const newType = newData.type;

        // Nếu đổi type (IN <-> OUT)
        if (oldType !== newType) {
          // Hoàn tác giá trị cũ
          if (oldType === 'IN') currentBalance -= oldAmount;
          else currentBalance += oldAmount;

          // Áp dụng giá trị mới
          if (newType === 'IN') newBalance = currentBalance + newAmount;
          else {
            if (newAmount > currentBalance) {
              throw new Error(`Số dư không đủ sau khi đổi loại phiếu chi.`);
            }
            newBalance = currentBalance - newAmount;
          }
        }
        // Nếu chỉ đổi amount
        else {
          const diff = newAmount - oldAmount;
          if (newType === 'IN') {
            newBalance += diff;
          } else {
            // Kiểm tra nếu tăng amount chi mà balance không đủ
            if (diff > 0 && diff > currentBalance) {
              throw new Error(`Số dư không đủ để tăng giá trị phiếu chi.`);
            }
            newBalance -= diff;
          }
        }
      }

      // 4. Cập nhật balance mới vào fund_accounts
      t.update(fundAccountRef, {
        balance: newBalance,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. Tạo thông báo (Notification)
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
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
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
    throw error; // Re-throw để trigger retry hoặc log lỗi
  }
}

module.exports = {
  syncTransactionToFundAccount,
};
