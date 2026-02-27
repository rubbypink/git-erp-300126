/**
 * ACCOUNTANT LOGIC - Firebase V8 (Compat)
 * 
 * Chuyển sang Firebase V8 để đồng bộ hoàn toàn với hệ thống
 * Không cần auth bridge phức tạp, thẳng dùng window.firebase
 */

/**
 * HELPER: Lấy Firestore DB instance từ V8
 */
const getDB = () => {
    const db = window.firebase?.firestore?.();
    if (!db) {
        throw new Error("❌ Lỗi: Firebase V8 (compat) chưa được khởi tạo!");
    }
    return db;
};

/**
 * HELPER: Trả về ngày hôm nay dạng YYYY-MM-DD
 */
const getTodayString = () => {
    return new Date().toISOString().split('T')[0];
};

/**
 * 1. HÀM GET NEW DATA: Tải dữ liệu vào RAM (Cache Layer)
 * Tối đa 2000 document mới nhất cho mỗi Collection
 * 
 * ✅ Firebase V8 - tự động có auth từ login_module.js
 */
export async function getNewData() {
    const db = getDB();

    try {
        const fetchCollection = async (colName, cacheKey) => {
            const snap = await db
                .collection(colName)
                .orderBy("created_at", "desc")
                .limit(2000)
                .get();

            const dataList = [];
            snap.forEach(doc => {
                dataList.push({ db_id: doc.id, ...doc.data() });
            });
            APP_DATA[cacheKey] = dataList;
            console.log(`- Đã tải ${dataList.length} docs từ [${colName}]`);
        };

        // Chạy song parallel để tối ưu tốc độ
        await Promise.all([
            fetchCollection("bookings", "checkingBookings"),
            fetchCollection("transactions", "checkingTransactions"),
            fetchCollection("fund_accounts", "checkingFundAccounts")
        ]);

        console.log("9 Trip ERP: Hoàn tất nạp dữ liệu vào Cache!");
        return true;
    } catch (error) {
        console.error("9 Trip Error [getNewData]:", error);
        throw error; // Quăng lỗi để UI bắt và thông báo
    }
}

/**
 * 2. HÀM MIGRATE: Tạo Transactions từ Bookings (Sử dụng Chunking & Cache)
 */
export async function migrateBookingTransactions() {
    const db = getDB();

    // Kiểm tra Cache, nếu chưa có thì tải mới
    if (!APP_DATA.checkingBookings || APP_DATA.checkingBookings.length === 0) {
        await getNewData();
    }

    try {
        // --- 1. Sinh thời gian đồng nhất (Đóng vai trò như Session ID) ---
        const sessionTimestamp = window.firebase.firestore.Timestamp.now();
        const currentUserName = window.CURRENT_USER?.name || "Unknown Staff";

        // --- 2. Lấy số hóa đơn cuối cùng trực tiếp từ DB (Bắt buộc để tránh Race Condition) ---
        const lastInvoiceRef = db.collection("transactions").doc("last_invoice_number");
        const lastInvoiceSnap = await lastInvoiceRef.get();
        let currentInValue = lastInvoiceSnap.exists ? (Number(lastInvoiceSnap.data().in) || 0) : 0;

        // --- 3. Lọc dữ liệu thuần Javascript từ Cache ---
        const todayStr = getTodayString();
        const bookingsToProcess = APP_DATA.checkingBookings.filter(bk => {
            const isNotCancelled = bk.status !== "Hủy";
            const isPast = bk.end_date < todayStr;
            const isFullPaid = Number(bk.total_amount) === Number(bk.deposit_amount) && Number(bk.total_amount) > 0;
            return isNotCancelled && isPast && isFullPaid;
        });

        if (bookingsToProcess.length === 0) {
            console.log("9 Trip ERP: Không có booking nào thỏa mãn điều kiện Migrate.");
            return;
        }

        // --- 4. Xử lý Chunking & Ghi Batch ---
        const CHUNK_SIZE = 490;
        let batch = db.batch();
        let operationCount = 0;

        for (const bk of bookingsToProcess) {
            const fundSources = ["bank_mbb_cn01", "cash"];

            for (const source of fundSources) {
                currentInValue++;
                const newTransId = `PT-${currentInValue}`;
                const newDocRef = db.collection("transactions").doc();

                const transData = {
                    id: newTransId,
                    created_at: bk.created_at || sessionTimestamp, // Fallback nếu booking thiếu
                    transaction_date: bk.created_at || sessionTimestamp,
                    type: "IN",
                    amount: Number(bk.deposit_amount) * 500,
                    category: "Tour/Combo",
                    booking_id: bk.id,
                    fund_source: source,
                    created_by: bk.staff_id || "System",
                    status: "Completed",

                    // Fields chuẩn hóa cho việc Rollback & Audit
                    updated_at: sessionTimestamp, // Dùng chung 1 Timestamp tuyệt đối
                    updated_by: currentUserName
                };

                batch.set(newDocRef, transData);
                operationCount++;

                if (operationCount >= CHUNK_SIZE) {
                    await batch.commit();
                    batch = db.batch();
                    operationCount = 0;
                }
            }
        }

        // --- 5. Commit Chunk cuối & Cập nhật Last Invoice ---
        batch.set(lastInvoiceRef, {
            in: currentInValue,
            updated_at: sessionTimestamp,
            updated_by: currentUserName
        }, { merge: true });

        await batch.commit();

        console.log(`9 Trip Success: Hoàn tát Migrate! Đã tạo các transactions với updated_at chung.`);
        // Force clear cache transactions để lần Audit sau bắt buộc phải lấy data mới nhất
        APP_DATA.checkingTransactions = null;

    } catch (error) {
        console.error("9 Trip Error [migrateBookingTransactions]:", error);
        throw new Error("Lỗi Migration, vui lòng kiểm tra Console.");
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

        // Tạo Map để tối ưu O(1) tra cứu giao dịch
        const transMap = {};
        for (const trans of transactions) {
            if (trans.status !== "Completed") continue; // Lọc thêm an toàn

            const bId = trans.booking_id;
            if (!bId) continue;

            if (!transMap[bId]) {
                transMap[bId] = 0;
            }
            transMap[bId] += Number(trans.amount) || 0;
        }

        const discrepancies = [];

        // So sánh
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
                    status: "Mismatched"
                });
            }
        }

        if (discrepancies.length === 0) {
            console.log("9 Trip Audit: Dữ liệu khớp 100%!");
        } else {
            console.warn(`9 Trip Alert: Phát hiện ${discrepancies.length} booking bị lệch.`);
        }

        return discrepancies;

    } catch (error) {
        console.error("9 Trip Error [auditTransactionsChecking]:", error);
        return [];
    }
}

// Export function cho window access (nếu cần)
window.migrateBookingTransactions = migrateBookingTransactions;
