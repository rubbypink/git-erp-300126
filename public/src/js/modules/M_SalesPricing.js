export class SalesPricing {

    /**
     * Hàm tính giá phòng đơn lẻ (Single Price Lookup)
     * @param {string} hotelIdentifier - ID hoặc Tên khách sạn
     * @param {Date|string} checkInDate - Ngày check-in (Object Date hoặc string YYYY-MM-DD)
     * @param {string} roomIdentifier - ID hoặc Tên loại phòng
     * @param {string} rateTypeIdentifier - (Optional) ID hoặc Tên loại giá (Default: 'base')
     * @param {string} packageIdentifier - (Optional) ID hoặc Tên gói (Default: 'base')
     * @returns {Promise<number|null>} - Trả về GIÁ (number) hoặc null nếu không tìm thấy
     */
    static async getPrice(hotelIdentifier, checkInDate, roomIdentifier, rateTypeIdentifier = 'base', packageIdentifier = 'base') {
        try {
            // 1. Chuẩn hóa ngày tháng
            const dateObj = new Date(checkInDate);
            const year = dateObj.getFullYear(); // Lấy năm để tìm Document
            
            // 2. Tìm Document Bảng giá phù hợp (Active + Year + Hotel)
            // Vì ta cần tìm cả theo ID hoặc Name, nên ta query theo Year trước (tag) rồi lọc memory
            // (Tối ưu: Nên query searchTags array-contains hotelIdentifier nếu chắc chắn ID là unique)
            const collectionRef = firebase.firestore().collection('hotel_price_schedules');
            
            // Query sơ bộ: Lấy tất cả bảng giá của năm đó + đã kích hoạt
            // Lưu ý: Đảm bảo bạn đã đánh index cho câu query này nếu dữ liệu lớn
            const snapshot = await collectionRef
                .where('info.year', '==', year) 
                .where('info.status', '==', 'actived')
                .get();

            if (snapshot.empty) {
                console.warn(`Không tìm thấy bảng giá Active nào cho năm ${year}`);
                return null;
            }

            // 3. Lọc chính xác Khách sạn (ID hoặc Name)
            // Fallback: So sánh ID (chính xác) hoặc Name (chứa hoặc chính xác tùy logic, ở đây làm chính xác)
            const docData = snapshot.docs.map(d => d.data()).find(data => {
                const info = data.info || {};
                return info.hotelId === hotelIdentifier || info.hotelName === hotelIdentifier;
            });

            if (!docData) {
                console.warn(`Không tìm thấy KS "${hotelIdentifier}" trong các bảng giá Active năm ${year}`);
                return null;
            }

            // =========================================================
            // Đã có Document Bảng giá. Bắt đầu giải mã ID (Fallback ID/Name)
            // =========================================================

            // 4. Tìm ID thực tế từ Input (Map Name -> ID nếu cần)
            const realRoomId = this._resolveId(docData.rooms, roomIdentifier);
            if (!realRoomId) return console.warn(`Không tìm thấy Room: ${roomIdentifier}`) || null;

            const realRateId = this._resolveId(docData.rooms.flatMap(r => r.rateTypes || []), rateTypeIdentifier, true) || rateTypeIdentifier; 
            // Lưu ý rateTypes: Cấu trúc hơi khác, nó nằm lồng trong rooms hoặc master list. 
            // Ở đây tôi giả định rateTypes là chuẩn chung hoặc tìm trong room đầu tiên tìm thấy. 
            // Để an toàn, tôi tìm trong Schema rateTypes (nếu bạn có lưu master list trong doc, nếu ko thì lấy default)
            // *Fix*: Ở module trước ta không lưu master rateTypes ra ngoài rooms. 
            // Ta sẽ tìm rateId bằng cách duyệt qua room hiện tại.
            const targetRoomSchema = docData.rooms.find(r => r.id === realRoomId);
            const resolvedRateId = this._resolveId(targetRoomSchema.rateTypes, rateTypeIdentifier) || 'base';

            const realPackageId = this._resolveId(docData.packages, packageIdentifier) || 'base';


            // 5. Tìm Period phù hợp với ngày Check-in
            const foundPeriod = docData.periods.find(period => {
                return this._isDateInPeriod(dateObj, period.from, period.to);
            });

            if (!foundPeriod) {
                console.warn(`Ngày ${checkInDate} không thuộc giai đoạn mùa nào trong cấu hình.`);
                return null;
            }

            // 6. Tạo Key để tra cứu giá
            // Key format: ROOM_RATE_PERIOD_PACKAGE
            const lookupKey = `${realRoomId}_${resolvedRateId}_${foundPeriod.id}_${realPackageId}`;
            
            // 7. Lấy giá
            const price = docData.priceData[lookupKey];

            if (price === undefined || price === null) {
                console.log(`Key ${lookupKey} không có giá trị.`);
                return null;
            }

            return Number(price);

        } catch (error) {
            console.error("Lỗi tính giá:", error);
            return null;
        }
    }

    // ========================================================
    // PRIVATE HELPERS
    // ========================================================

    /**
     * Helper: Tìm ID từ ID hoặc Name trong mảng đối tượng
     * @param {Array} list - Mảng chứa {id, name}
     * @param {string} input - Giá trị cần tìm (ID hoặc Name)
     */
    static _resolveId(list, input) {
        if (!list || !Array.isArray(list)) return null;
        if (!input) return null;

        // 1. Thử tìm chính xác ID
        const matchId = list.find(item => item.id === input);
        if (matchId) return matchId.id;

        // 2. Thử tìm chính xác Name (Case insensitive)
        const matchName = list.find(item => item.name && item.name.toLowerCase() === input.toLowerCase());
        if (matchName) return matchName.id;

        return null; // Không thấy
    }

    /**
     * Helper: So sánh ngày dd/mm
     * Logic: Chuyển về số MMDD để so sánh (Ví dụ: 01/05 -> 501)
     */
    static _isDateInPeriod(checkDate, fromStr, toStr) {
        if (!fromStr || !toStr) return false;

        // Hàm con parse "dd/mm" -> Number MMDD
        const parseMMDD = (str) => {
            const [d, m] = str.split('/').map(Number);
            return (m * 100) + d;
        };

        const currentVal = (checkDate.getMonth() + 1) * 100 + checkDate.getDate();
        const fromVal = parseMMDD(fromStr);
        const toVal = parseMMDD(toStr);

        // Xử lý logic:
        // Case 1: Mùa bình thường (Ví dụ 01/04 -> 30/08) => from <= current <= to
        if (fromVal <= toVal) {
            return currentVal >= fromVal && currentVal <= toVal;
        } 
        // Case 2: Mùa vắt qua năm mới (Ví dụ 15/12 -> 15/01) => current >= from HOẶC current <= to
        else {
            return currentVal >= fromVal || currentVal <= toVal;
        }
    }
}