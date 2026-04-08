/**
 * Cron Jobs API
 * Updated for Cloud Functions v7 (v2) & Admin SDK v13
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { getFirestore } = require('../utils/firebase-admin.util');
const { FieldValue } = require('firebase-admin/firestore');

// Chạy vào 07:00 sáng mỗi ngày, theo giờ Việt Nam
const dailyReminders = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Asia/Ho_Chi_Minh',
    region: 'asia-southeast1',
  },
  async (event) => {
    const db = getFirestore();
    const batch = db.batch();
    let notifCount = 0;

    const todayDate = new Date();
    const todayStr = todayDate.toISOString().split('T')[0];

    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    try {
      // 1. NHẮC NHỞ KHỞI HÀNH
      const upcomingSnap = await db.collection('bookings').where('start_date', 'in', [todayStr, tomorrowStr]).get();

      upcomingSnap.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'Cancelled' || data.status === 'Completed') return;

        const isToday = data.start_date === todayStr;

        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          title: isToday ? '🚨 KHỞI HÀNH HÔM NAY' : '🔔 Khởi hành ngày mai',
          message: `Booking ${doc.id} (${data.customer_name || 'Khách'}) sẽ bắt đầu chuyến đi vào ${data.start_date}. Vui lòng kiểm tra dịch vụ.`,
          type: 'system_reminder',
          created_at: FieldValue.serverTimestamp(),
          is_read: false,
          group: ['Admin'],
          role: 'admin',
          target_users: [data.staff_id],
          link: `/booking/${doc.id}`,
        });
        notifCount++;
      });

      // 2. NHẮC NHỞ HẠN THANH TOÁN
      const paymentDueSnap = await db.collection('bookings').where('payment_due_date', '==', todayStr).get();

      paymentDueSnap.forEach((doc) => {
        const data = doc.data();
        if (data.balance_amount === 0) return;

        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          title: '💰 ĐẾN HẠN THU TIỀN',
          message: `Booking ${doc.id} của khách ${data.customer_name || 'Unknow'} cần xử lý thanh toán (${data.balance_amount.toLocaleString()}đ) trong hôm nay.`,
          type: 'warning',
          created_at: FieldValue.serverTimestamp(),
          is_read: false,
          role: 'sale',
          group: ['Sales', 'Admin'],
          link: `/booking/${doc.id}`,
        });
        notifCount++;
      });

      if (notifCount > 0) {
        await batch.commit();
        logger.info(`✅ Daily Reminders chạy xong. Đã tạo ${notifCount} thông báo.`);
      } else {
        logger.info('✅ Daily Reminders chạy xong. Không có sự kiện nào hôm nay.');
      }
    } catch (error) {
      logger.error('❌ Lỗi khi chạy Daily Reminders:', error);
    }
  }
);

module.exports = { dailyReminders };
