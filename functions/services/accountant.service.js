/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Accountant Service
 * Xử lý logic kế toán nâng cao
 * Updated for Firebase Admin SDK v13 (Modular)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { logger } = require('firebase-functions');
const { getFirestore } = require('../utils/firebase-admin.util');
const { Timestamp } = require('firebase-admin/firestore');

/**
 * Chốt số dư tài khoản quỹ
 * @param {string} accountId ID của tài khoản quỹ
 * @param {string|Timestamp} start Thời điểm bắt đầu
 * @param {string|Timestamp} end Thời điểm kết thúc
 * @return {Promise<object>} Kết quả chốt số dư
 */
async function commitFundAccountLogic(accountId, start, end) {
  const db = getFirestore();
  const fundRef = db.collection('fund_accounts').doc(accountId);
  const serverNow = Timestamp.now();
  const endTime = end ? (typeof end === 'string' ? Timestamp.fromDate(new Date(end)) : end) : serverNow;

  try {
    return await db.runTransaction(async (t) => {
      const fundDoc = await t.get(fundRef);
      if (!fundDoc.exists) {
        throw new Error(`Tài khoản quỹ ${accountId} không tồn tại.`);
      }

      const fundData = fundDoc.data();
      let baseDate = fundData.commit_date;

      if (!baseDate) {
        if (start) {
          baseDate = typeof start === 'string' ? Timestamp.fromDate(new Date(start)) : start;
        } else {
          const firstTrans = await db.collection('transactions').where('fund_source', '==', accountId).orderBy('transaction_date', 'asc').limit(1).get();

          if (!firstTrans.empty) {
            const d = firstTrans.docs[0].data().transaction_date;
            baseDate = typeof d === 'string' ? Timestamp.fromDate(new Date(d)) : d;
          } else {
            baseDate = Timestamp.fromDate(new Date('2000-01-01'));
          }
        }
      }

      const transQuery = db.collection('transactions').where('fund_source', '==', accountId).where('status', '==', 'Completed');

      const snapshot = await transQuery.get();

      let totalIn = 0;
      let totalOut = 0;
      const committedTransRefs = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        let tDate = data.transaction_date;

        if (typeof tDate === 'string') {
          tDate = Timestamp.fromDate(new Date(tDate));
        }

        if (tDate > baseDate && tDate <= endTime) {
          const amt = parseFloat(data.amount || 0);
          if (data.type === 'IN') totalIn += amt;
          else if (data.type === 'OUT') totalOut += amt;

          committedTransRefs.push(doc.ref);
        }
      });

      const balanceShift = totalIn - totalOut;
      const currentAmount = parseFloat(fundData.amount || fundData.balance || 0);
      const newAmount = currentAmount + balanceShift;

      t.update(fundRef, {
        amount: newAmount,
        balance: newAmount,
        commit_date: endTime,
        updated_at: serverNow,
      });

      committedTransRefs.forEach((ref) => {
        t.update(ref, {
          status: 'Commited',
          committed_at: serverNow,
        });
      });

      logger.info(`✅ Committed account ${accountId}: ${currentAmount} -> ${newAmount} (Shift: ${balanceShift}, Trans: ${committedTransRefs.length})`);

      return { success: true, newBalance: newAmount };
    });
  } catch (error) {
    logger.error(`❌ Lỗi commitFundAccount cho ${accountId}:`, error);
    throw error;
  }
}

module.exports = {
  commitFundAccountLogic,
};
