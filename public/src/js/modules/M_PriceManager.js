const DB_PATHS = {
    HOTELS: 'hotels',
    PERIODS: 'app_config/lists/price_periods',
    SCHEDULES: 'hotel_price_schedules',
    SERVICE_SCHEDULES: 'service_price_schedules'
};

// ★ NEW: Timeout config (milliseconds)
const TIMEOUT_CONFIG = {
    GET_HOTEL_PRICE: 10000,      // 10 seconds
    GET_SERVICE_PRICE: 10000,    // 10 seconds
    FETCH_OPERATIONS: 10000      // 10 seconds
};

export default class PriceManager {

    /**
     * ★ NEW: Helper function - Wrap promise với timeout
     * @param {Promise} promise - Promise cần thực thi
     * @param {number} timeoutMs - Timeout milliseconds
     * @param {string} operationName - Tên operation (để log)
     */
    static async _withTimeout(promise, timeoutMs, operationName = 'Operation') {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => {
                    const error = new Error(`⏱️ ${operationName} TIMEOUT - Vượt quá ${timeoutMs}ms`);
                    error.code = 'TIMEOUT';
                    reject(error);
                }, timeoutMs)
            )
        ]);
    }

    /**
     * Hàm lấy giá phòng (Core Logic)
     */
    static async getHotelPrice(hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId = 'base', packageId = 'base') {
        try {
            console.time("Timer_getHotelPrice");
            
            // ★ NEW: Wrap toàn bộ hàm với timeout
            return await this._withTimeout(
                this._executeGetHotelPrice(hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId, packageId),
                TIMEOUT_CONFIG.GET_HOTEL_PRICE,
                'getHotelPrice'
            );
        } catch (error) {
            console.error("[PriceManager] Error:", error);
            console.timeEnd("Timer_getHotelPrice");
            
            // ★ NEW: Handle timeout error specially
            if (error.code === 'TIMEOUT') {
                return {
                    success: false,
                    error: error.message,
                    code: 'TIMEOUT'
                };
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * ★ NEW: Thực thi logic getHotelPrice (Tách ra để wrap timeout)
     */
    static async _executeGetHotelPrice(hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId = 'base', packageId = 'base') {
            // BƯỚC 1: CHUẨN BỊ DỮ LIỆU (Chạy song song để tối ưu tốc độ)
            // Ta cần 3 nguồn: 
            // 1. Bảng giá Active của Hotel (để lấy giá)
            // 2. Danh sách Phòng của Hotel (để map Name -> ID)
            // 3. Danh sách Mùa (để map Date -> PeriodID)
            
            const checkInDateObj = new Date(checkInDate);
            const checkOutDateObj = new Date(checkOutDate);
            
            // BƯỚC 1.5: LẶP QUA TỪng NGÀY (Check-in đến Check-out, không tính ngày check-out)
            const nightlyPrices = [];
            const currentDate = new Date(checkInDateObj);
            
            while (currentDate < checkOutDateObj) {
                const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
                nightlyPrices.push({
                    date: dateStr,
                    price: null // Sẽ fill sau
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }

            const year = checkInDateObj.getFullYear();
            
            // ★ FIX: Wrap Promise.all() với timeout
            const [priceDoc, roomsList, periodsList] = await this._withTimeout(
                Promise.all([
                    this._fetchPriceSchedule(hotelIdentifier, year),
                    this._fetchHotelRooms(hotelIdentifier),
                    this._fetchMasterPeriods()
                ]),
                TIMEOUT_CONFIG.FETCH_OPERATIONS,
                'Data fetching'
            );

            // --- Validate dữ liệu nền ---
            if (!priceDoc) return { error: `Không tìm thấy bảng giá Active năm ${year} cho ${hotelIdentifier}` };
            if (!periodsList || periodsList.length === 0) return { error: "Không tải được cấu hình Mùa (Periods)" };

            // BƯỚC 2: GIẢI MÃ (RESOLVE) CÁC THAM SỐ THÀNH ID
            
            // 2.1. Resolve RoomID
            let resolvedRoomId = this._resolveIdByName(roomsList, roomIdentifier);
            if (!resolvedRoomId) {
                console.warn(`Không tìm thấy phòng "${roomIdentifier}" trong DB Hotels. Thử dùng trực tiếp làm ID.`);
                resolvedRoomId = roomIdentifier; 
            }

            // 2.2. Resolve PeriodID
            const resolvedPeriodId = this._getPeriodIdFromDate(checkInDateObj, periodsList);
            if (!resolvedPeriodId) return { error: `Ngày ${checkInDate} không thuộc giai đoạn giá nào.` };

            // 2.3. Rate & Package
            const finalRateId = rateTypeId || 'base';
            const finalPkgId = packageId || 'base';

            // BƯỚC 3: TRA CỨU GIÁ CHO TỪng NGÀY
            let totalPrice = 0;
            let successCount = 0;

            for (const nightData of nightlyPrices) {
                const nightDate = new Date(nightData.date);
                const nightPeriodId = this._getPeriodIdFromDate(nightDate, periodsList);
                
                const targetKey = `${resolvedRoomId}_${finalRateId}_${nightPeriodId}_${finalPkgId}`;
                const price = priceDoc.priceData[targetKey];

                if (price !== undefined && price !== null) {
                    nightData.price = Number(price);
                    nightData.key = targetKey;
                    nightData.periodId = nightPeriodId;
                    totalPrice += nightData.price;
                    successCount++;
                } else {
                    nightData.price = null;
                    nightData.key = targetKey;
                    nightData.periodId = nightPeriodId;
                    nightData.error = "Not Found";
                }
            }

            console.timeEnd("Timer_getHotelPrice");

            // BƯỚC 4: TÍNH GIÁ BÌNH QUÂN VÀ TRẢ KẾT QUẢ
            if (successCount === 0) {
                return { 
                    success: false, 
                    error: "Không tìm được giá cho bất kỳ ngày nào",
                    details_price: nightlyPrices
                };
            }

            // Format details_price thành text
            const details_price_text = nightlyPrices.map(night => {
                const periodName = this._getPeriodName(night.periodId, periodsList);
                const priceStr = night.price !== null ? formatMoney(night.price) : "N/A";
                return `Ngày ${night.date}: - Giá: ${priceStr} - Mùa: ${periodName}`;
            }).join('\n');

            const averagePrice = totalPrice / nightlyPrices.length;

            return {
                success: true,
                price: Number(averagePrice.toFixed(0)),
                totalPrice: Number(totalPrice),
                nightCount: nightlyPrices.length,
                successNightCount: successCount,
                details: {
                    room: resolvedRoomId,
                    rateType: finalRateId,
                    package: finalPkgId,
                    currency: 'VND',
                    checkIn: checkInDate,
                    checkOut: checkOutDate
                },
                details_price: details_price_text
            };
    }
    /**
     * Tra cứu đơn giá Dịch vụ (Lookup Only)
     * @param {string} serviceName - Tên dịch vụ
     * @param {Date|string} useDate - Ngày sử dụng
     * @param {string} supplierId - (Optional) ID nhà cung cấp. Nếu null sẽ tìm tất cả.
     */
    static async getServicePrice(serviceName, useDate, supplierId = null) {
        try {
            console.time("Timer_getServicePrice");
            
            // ★ NEW: Wrap với timeout
            return await this._withTimeout(
                this._executeGetServicePrice(serviceName, useDate, supplierId),
                TIMEOUT_CONFIG.GET_SERVICE_PRICE,
                'getServicePrice'
            );
        } catch (error) {
            console.error("[PriceManager] Service Price Error:", error);
            console.timeEnd("Timer_getServicePrice");
            
            // ★ NEW: Handle timeout error specially
            if (error.code === 'TIMEOUT') {
                return {
                    success: false,
                    error: error.message,
                    code: 'TIMEOUT'
                };
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * ★ NEW: Thực thi logic getServicePrice (Tách ra để wrap timeout)
     */
    static async _executeGetServicePrice(serviceName, useDate, supplierId = null) {
        const dUse = new Date(useDate);
        const year = dUse.getFullYear();
        
        // Hàm con: Tìm item khớp trong 1 document bảng giá
        const findMatchInDoc = (docData) => {
            const items = docData.items || [];
            const matchedItem = items.find(item => {
                // 1. Check Tên
                const isNameMatch = item.name && item.name.trim().toLowerCase() === serviceName.trim().toLowerCase();
                if (!isNameMatch) return false;
                // 2. Check Ngày hiệu lực
                return this._checkDateInRange(dUse, item.from || '01/01', item.to || '31/12');
            });

            if (matchedItem) {
                return {
                    supplierId: docData.info.supplierId,
                    supplierName: docData.info.supplierName,
                    updatedAt: docData.info.updatedAt || 0, // Dùng để sort mới nhất
                    adl: Number(matchedItem.adl) || 0,
                    chd: Number(matchedItem.chd) || 0,
                    note: matchedItem.note
                };
            }
            return null;
        };

        let candidates = [];

        // TRƯỜNG HỢP 1: Có chỉ định Supplier ID -> Tìm đích danh
        if (supplierId) {
            const docId = `${supplierId}_${year}`.toUpperCase();
            const docSnap = await firebase.firestore().collection(DB_PATHS.SERVICE_SCHEDULES).doc(docId).get();
            
            if (docSnap.exists) {
                const data = docSnap.data();
                if (data.info && data.info.status === 'actived') {
                    const match = findMatchInDoc(data);
                    if (match) candidates.push(match);
                }
            }
        } 
        // TRƯỜNG HỢP 2: Không chỉ định Supplier -> Quét tất cả bảng giá Active trong năm
        else {
            const querySnap = await firebase.firestore().collection(DB_PATHS.SERVICE_SCHEDULES)
                .where('info.year', '==', year)
                .where('info.status', '==', 'actived')
                .get();

            querySnap.forEach(doc => {
                const match = findMatchInDoc(doc.data());
                if (match) candidates.push(match);
            });
        }

        if (candidates.length === 0) {
            return { success: false, error: "Không tìm thấy giá phù hợp" };
        }

        // Sắp xếp: Mới nhất lên đầu (dựa vào updatedAt)
        candidates.sort((a, b) => b.updatedAt - a.updatedAt);

        // Kết quả chính (Thằng mới nhất)
        const bestMatch = candidates[0];

        console.timeEnd("Timer_getServicePrice");

        return {
            success: true,
            // Giá trả về của thằng tốt nhất
            price: {
                adl: bestMatch.adl,
                chd: bestMatch.chd
            },
            // Thông tin NCC của thằng tốt nhất
            supplier: {
                id: bestMatch.supplierId,
                name: bestMatch.supplierName
            },
            // Danh sách tất cả các kết quả tìm được (để bạn làm Tooltip tham khảo)
            matches: candidates 
        };
    }
    // ========================================================
    // PRIVATE HELPERS (Xử lý Logic tìm kiếm & Fetch)
    // ========================================================

    // 1. Lấy bảng giá Active từ Firestore
    static async _fetchPriceSchedule(hotelIdentifier, year) {
        // Ưu tiên tìm theo ID trước nếu hotelIdentifier giống format ID
        // Nếu không thì phải query mảng searchTags (như bài trước đã bàn)
        
        const colRef = firebase.firestore().collection(DB_PATHS.SCHEDULES);
        let query = colRef
            .where('info.year', '==', year)
            .where('info.status', '==', 'actived');

        // Tìm trong mảng searchTags (Hỗ trợ cả ID và Name nếu Name đã được lưu vào tags)
        query = query.where('searchTags', 'array-contains', hotelIdentifier);

        const snapshot = await query.limit(1).get();
        return snapshot.empty ? null : snapshot.docs[0].data();
    }

    // 2. Lấy danh sách phòng của Hotel (Để map Name -> ID)
    static async _fetchHotelRooms(hotelIdentifier) {
        try {
            // Giả định hotelIdentifier là ID. Nếu là Name, bạn cần 1 bước tìm ID Hotel trước.
            // Để đơn giản và nhanh, ta coi input đầu vào là HotelID. 
            // Nếu input là Name, ở bước searchTags trên ta đã tìm được doc bảng giá -> lấy hotelID từ doc đó.
            
            // Cách an toàn nhất: Query collection hotels
            const hotelDoc = await firebase.firestore().collection(DB_PATHS.HOTELS).doc(hotelIdentifier).get();
            
            if (!hotelDoc.exists) {
                log("Fallback: Tìm hotel bằng id  ko thành công.");
                // Fallback: Nếu không tìm thấy bằng ID, thử query bằng field 'name'
                const querySnapshot = await firebase.firestore().collection(DB_PATHS.HOTELS)
                    .where('name', '==', hotelIdentifier).limit(1).get();
                
                if (!querySnapshot.empty) {
                     // Query sub-collection rooms của hotel tìm được
                     
                     const realId = querySnapshot.docs[0].id;
                     const roomsSnap = await firebase.firestore().collection(`${DB_PATHS.HOTELS}/${realId}/rooms`).get();
                     return roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }
                return [];
            }

            // Nếu ID đúng, lấy sub-collection rooms
            const roomsSnap = await firebase.firestore().collection(`${DB_PATHS.HOTELS}/${hotelIdentifier}/rooms`).get();
            log("Rooms fetched:", roomsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            return roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        } catch (e) {
            console.warn("Lỗi fetch rooms:", e);
            return [];
        }
    }

    // 3. Lấy Master Periods (Để map Date -> ID)
    static async _fetchMasterPeriods() {
        // Cache biến global nếu có (lists.price_periods)
        if (typeof APP_DATA.lists !== 'undefined' && APP_DATA.lists.price_periods) {
            return APP_DATA.lists.price_periods;
        }
        
        // Nếu không thì fetch DB
        try {
            const periods = await firebase.firestore().collection(DB_PATHS.PERIODS).get();
            
            log("Fetched periods from DB:", periods.docs.map(d => ({ id: d.id, ...d.data() })));
            // Giả sử periods nằm trong 1 document list
            return periods.docs.map(d => ({ id: d.id, ...d.data() }));


        } catch (e) {
            // Fallback hardcode nếu DB lỗi (để code không chết)
            log("Lỗi fetch periods, dùng fallback:", e);
            return [
                { id: 'standard_season', name: 'Mùa Hè', from: '01/04', to: '30/08' },
            ];
        }
    }

    // --- LOGIC XỬ LÝ ---

    // Map Name/ID -> ID
    static _resolveIdByName(list, input) {
        if (!list || !input) return null;
        // 1. Check ID exact match
        const matchId = list.find(i => i.id === input);
        if (matchId) return matchId.id;
        
        // 2. Check Name exact match (Case insensitive)
        const matchName = list.find(i => i.name && i.name.toLowerCase() === input.toLowerCase());
        if (matchName) return matchName.id;

        return null;
    }

    static _parseMMDD(str) {
        if(!str) return 0;
        const parts = str.split('/');
        if(parts.length < 2) return 0;
        return (parseInt(parts[1]) * 100) + parseInt(parts[0]);
    }

    static _checkDateInRange(dateObj, fromStr, toStr) {
        const currentVal = (dateObj.getMonth() + 1) * 100 + dateObj.getDate();
        const fromVal = this._parseMMDD(fromStr);
        const toVal = this._parseMMDD(toStr);

        if (fromVal <= toVal) {
            return currentVal >= fromVal && currentVal <= toVal;
        } else {
            return currentVal >= fromVal || currentVal <= toVal;
        }
    }
    // Map Date -> PeriodID
    static _getPeriodIdFromDate(dateObj, periodsList) {

        const currentVal = (dateObj.getMonth() + 1) * 100 + dateObj.getDate();

        // Tìm period phù hợp (ưu tiên các mùa cụ thể trước)
        const found = periodsList.find(p => {
            // Bỏ qua all_year, xử lý sau cùng
            if (p.id === 'all_year') return false;
            
            const fromVal = this._parseMMDD(p.from);
            const toVal = this._parseMMDD(p.to);
            
            // Logic Mùa
            if (fromVal <= toVal) {
                // Mùa trong năm (VD: 01/04 -> 30/08)
                return currentVal >= fromVal && currentVal <= toVal;
            } else {
                // Mùa vắt năm (VD: 15/12 -> 15/01)
                return currentVal >= fromVal || currentVal <= toVal;
            }
        });

        // Nếu tìm thấy period cụ thể, trả về
        if (found) return found.id;

        // Fallback: Tìm all_year sau cùng
        const allYearPeriod = periodsList.find(p => p.id === 'all_year');
        return allYearPeriod ? allYearPeriod.id : null;
    }
    
    static _getPeriodName(pid, list) {
        const p = list.find(i => i.id === pid);
        return p ? p.name : pid;
    }
}

