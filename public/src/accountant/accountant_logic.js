/**
 * ACCOUNTANT LOGIC - DBManager Abstraction
 *
 * Sử dụng DBManager để tương tác database, không truy cập Firestore trực tiếp.
 */

/**
 * HELPER: Trả về ngày hôm nay dạng YYYY-MM-DD
 */
const getTodayString = () => {
    return new Date().toISOString().split('T')[0];
};

/**
 * 1. HÀM GET NEW DATA: Tải dữ liệu vào RAM (Cache Layer)
 */
export async function getNewData() {
    try {
        const fetchCollection = async (colName, cacheKey) => {
            const data = await A.DB.local.getCollection(colName);
            APP_DATA[cacheKey] = data;
            L._(`- Đã tải ${data.length} docs từ [${colName}]`);
        };

        await Promise.all([
            fetchCollection('bookings', 'checkingBookings'),
            fetchCollection('transactions', 'checkingTransactions'),
            fetchCollection('fund_accounts', 'checkingFundAccounts'),
        ]);

        L._('9 Trip ERP: Hoàn tất nạp dữ liệu vào Cache!');
        return true;
    } catch (error) {
        console.error('9 Trip Error [getNewData]:', error);
        throw error;
    }
}

/**
 * 2. HÀM MIGRATE: Tạo Transactions từ Bookings
 */
export async function migrateBookingTransactions() {
    if (!APP_DATA.checkingBookings || APP_DATA.checkingBookings.length === 0) {
        await getNewData();
    }

    try {
        const currentUserName = window.CURRENT_USER?.name || 'Unknown Staff';
        const todayStr = getTodayString();

        const bookingsToProcess = APP_DATA.checkingBookings.filter((bk) => {
            const isNotCancelled = bk.status !== 'Hủy';
            const isPast = bk.end_date < todayStr;
            const isFullPaid = Number(bk.total_amount) === Number(bk.deposit_amount) && Number(bk.total_amount) > 0;
            return isNotCancelled && isPast && isFullPaid;
        });

        if (bookingsToProcess.length === 0) {
            L._('9 Trip ERP: Không có booking nào thỏa mãn điều kiện Migrate.');
            return;
        }

        const transIds = await HD.generateTransId('IN', bookingsToProcess.length * 2);
        let idIdx = 0;

        for (const bk of bookingsToProcess) {
            const fundSources = ['bank_mbb_cn01', 'cash'];
            for (const source of fundSources) {
                const newTransId = transIds[idIdx++];
                const transData = {
                    id: newTransId,
                    created_at: bk.created_at || new Date().toISOString(),
                    transaction_date: bk.created_at || new Date().toISOString(),
                    type: 'IN',
                    amount: Number(bk.deposit_amount) * 500,
                    category: 'Tour/Combo',
                    booking_id: bk.id,
                    fund_source: source,
                    created_by: bk.staff_id || 'System',
                    status: 'Completed',
                    updated_at: new Date().toISOString(),
                    updated_by: currentUserName,
                };
                await A.DB.saveRecord('transactions', transData);
            }
        }

        L._(`9 Trip Success: Hoàn tất Migrate!`);
        APP_DATA.checkingTransactions = null;
    } catch (error) {
        console.error('9 Trip Error [migrateBookingTransactions]:', error);
        throw new Error('Lỗi Migration, vui lòng kiểm tra Console.');
    }
}

/**
 * 3. HÀM CHECKING: Đối chiếu dòng tiền dựa trên Cache APP_DATA
 */
export async function auditTransactionsChecking() {
    try {
        if (!APP_DATA.checkingBookings || !APP_DATA.checkingTransactions) {
            await getNewData();
        }

        const bookings = APP_DATA.checkingBookings;
        const transactions = APP_DATA.checkingTransactions;

        const transMap = {};
        for (const trans of transactions) {
            if (trans.status !== 'Completed') continue;
            const bId = trans.booking_id;
            if (!bId) continue;
            if (!transMap[bId]) transMap[bId] = 0;
            transMap[bId] += Number(trans.amount) || 0;
        }

        const discrepancies = [];
        for (const bk of bookings) {
            const expectedDeposit = Number(bk.deposit_amount) || 0;
            const totalTransAmount = transMap[bk.id] || 0;
            const calculatedDeposit = totalTransAmount / 1000;

            if (calculatedDeposit !== expectedDeposit) {
                discrepancies.push({
                    booking_id: bk.id,
                    staff_id: bk.staff_id,
                    expected_deposit: expectedDeposit,
                    actual_transaction_total: calculatedDeposit,
                    raw_transaction_sum: totalTransAmount,
                    status: 'Mismatched',
                });
            }
        }

        if (discrepancies.length === 0) {
            L._('9 Trip Audit: Dữ liệu khớp 100%!');
        } else {
            console.warn(`9 Trip Alert: Phát hiện ${discrepancies.length} booking bị lệch.`);
        }

        return discrepancies;
    } catch (error) {
        console.error('9 Trip Error [auditTransactionsChecking]:', error);
        return [];
    }
}
