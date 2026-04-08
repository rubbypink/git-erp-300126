import { getFirestore, collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { getApp } from 'firebase/app';

const DB_PATHS = {
  HOTELS: 'hotels',
  PERIODS: 'app_config/lists/price_periods',
  SCHEDULES: 'hotel_price_schedules',
  SERVICE_SCHEDULES: 'service_price_schedules',
};

const TIMEOUT_CONFIG = {
  GET_HOTEL_PRICE: 10000,
  GET_SERVICE_PRICE: 10000,
  FETCH_OPERATIONS: 10000,
};

export default class CostManager {
  static autoInit = false;

  static async _withTimeout(promise, timeoutMs, operationName = 'Operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => {
          const error = new Error(`⏱️ ${operationName} TIMEOUT - Vượt quá ${timeoutMs}ms`);
          error.code = 'TIMEOUT';
          reject(error);
        }, timeoutMs)
      ),
    ]);
  }

  // =====================================================================
  // 1. MODULE TÍNH GIÁ KHÁCH SẠN (HOTEL PRICING) - OPTIMIZED & DEBUGGED
  // =====================================================================

  /**
   * Lấy giá khách sạn theo giai đoạn lưu trú
   * @param {string} hotelIdentifier - ID hoặc Tên khách sạn
   * @param {string} checkInDate - Định dạng YYYY-MM-DD
   * @param {string} checkOutDate - Định dạng YYYY-MM-DD
   * @param {string} roomIdentifier - ID hoặc Tên hạng phòng
   * @param {string} rateTypeId - Loại giá (bb, ro, hb, fb...)
   * @param {string} packageId - Gói giá (base, promo...)
   * @param {string|null} preferredSupplierId - ID nhà cung cấp ưu tiên (nếu có)
   */
  static async getHotelPrice(hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId = 'bb', packageId = 'base', preferredSupplierId = null) {
    const timerName = `Timer_getHotelPrice_${Math.random().toString(36).substr(2, 5)}`;
    try {
      console.time(timerName);
      console.log(`[CostManager] 🚀 Bắt đầu getHotelPrice:`, { hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId, packageId, preferredSupplierId });
      return await this._withTimeout(this._executeGetHotelPrice(hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId, packageId, preferredSupplierId), TIMEOUT_CONFIG.GET_HOTEL_PRICE, 'getHotelPrice');
    } catch (error) {
      console.error('[CostManager] ❌ Hotel Price Error:', error);
      return { success: false, error: error.message, code: error.code || 'ERROR' };
    } finally {
      console.timeEnd(timerName);
    }
  }

  static async _executeGetHotelPrice(hotelIdentifier, checkInDate, checkOutDate, roomIdentifier, rateTypeId = 'bb', packageId = 'base', preferredSupplierId = null) {
    const checkInDateObj = new Date(checkInDate);
    const checkOutDateObj = new Date(checkOutDate);
    const year = checkInDateObj.getFullYear();

    const finalRateId = rateTypeId || 'BB';
    const finalPkgId = (packageId || 'base').toLowerCase();

    // 1. Fetch dữ liệu song song
    const [priceDoc, roomsList] = await this._withTimeout(Promise.all([this._fetchPriceSchedule(hotelIdentifier, finalPkgId, year), this._fetchHotelRooms(hotelIdentifier)]), TIMEOUT_CONFIG.FETCH_OPERATIONS, 'Data fetching');

    if (!priceDoc) {
      console.warn(`[CostManager] ⚠️ Không tìm thấy bảng giá cho:`, { hotelIdentifier, finalPkgId, year });
      return { error: `Không tìm thấy bảng giá Active (Gói: ${finalPkgId}) năm ${year} cho khách sạn này.` };
    }

    // 2. Xác định Room ID chuẩn (Đồng bộ với HotelPriceManager)
    let resolvedRoomId = this._resolveIdByName(roomsList, roomIdentifier);
    if (!resolvedRoomId) {
      resolvedRoomId = this._sanitizeRoomId(roomIdentifier);
      console.log(`[CostManager] ℹ️ Room ID resolved by sanitize:`, { roomIdentifier, resolvedRoomId });
    } else {
      console.log(`[CostManager] ℹ️ Room ID resolved by list:`, { roomIdentifier, resolvedRoomId });
    }

    const roomRateKey = `${resolvedRoomId}___${finalRateId}`;
    const roomRateData = priceDoc.priceData?.[roomRateKey] || {};

    // 3. TIỀN XỬ LÝ: Lọc các periods có khả năng chứa ngày lưu trú để tối ưu vòng lặp
    const startRangeNum = parseInt(checkInDate.replace(/-/g, ''));
    const endRangeNum = parseInt(checkOutDate.replace(/-/g, ''));

    // Chuyển Map thành Array và lọc sơ bộ
    const allPeriods = Object.values(roomRateData).filter((p) => {
      // Lọc các giai đoạn giao thoa với khoảng lưu trú
      return p.startDate <= endRangeNum && p.endDate >= startRangeNum;
    });

    if (allPeriods.length === 0) {
      console.warn(`[CostManager] ⚠️ Không tìm thấy giai đoạn giá phù hợp trong bảng giá cho:`, { roomRateKey, startRangeNum, endRangeNum });
      return { success: false, error: 'Không tìm được cấu hình giá cho hạng phòng và loại giá này trong giai đoạn yêu cầu.' };
    }

    let totalPrice = 0;
    let totalCostPrice = 0;
    let successCount = 0;
    const nightlyPrices = [];
    const currentDate = new Date(checkInDateObj);

    // 4. Vòng lặp tính giá từng đêm
    while (currentDate < checkOutDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dateNum = parseInt(dateStr.replace(/-/g, ''));

      // Tìm các NCC có báo giá cho ngày này
      let validPeriods = allPeriods.filter((p) => p.startDate <= dateNum && p.endDate >= dateNum);

      if (validPeriods.length > 0) {
        let bestPeriod = null;

        // Ưu tiên NCC được chỉ định
        if (preferredSupplierId) {
          bestPeriod = validPeriods.find((p) => p.supplier === preferredSupplierId);
        }

        // Nếu không có NCC ưu tiên hoặc không tìm thấy giá của NCC đó, lấy ông rẻ nhất
        if (!bestPeriod) {
          validPeriods.sort((a, b) => getNum(a.sellPrice) - getNum(b.sellPrice));
          bestPeriod = validPeriods[0];
        }

        const sellP = getNum(bestPeriod.sellPrice);
        const costP = getNum(bestPeriod.costPrice);

        nightlyPrices.push({
          date: dateStr,
          price: sellP,
          costPrice: costP,
          periodName: bestPeriod.periodName || 'Không tên',
          supplier: bestPeriod.supplier,
          key: roomRateKey,
        });
        totalPrice += sellP;
        totalCostPrice += costP;
        successCount++;
      } else {
        nightlyPrices.push({
          date: dateStr,
          price: null,
          error: 'Không có giá cho ngày này',
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (successCount === 0) return { success: false, error: 'Không tìm được giá cho giai đoạn lưu trú này.', details_price: nightlyPrices };

    // 5. Format kết quả trả về
    const details_price_text = nightlyPrices
      .map((night) => {
        const priceStr = night.price !== null ? formatNumber(night.price) : 'N/A (Hết giá)';
        return `Ngày ${night.date}: - Bán: ${priceStr} - Mùa: ${night.periodName || 'N/A'} - [Bởi: ${night.supplier || 'N/A'}]`;
      })
      .join('\n');

    const averagePrice = totalPrice / nightlyPrices.length;

    return {
      success: true,
      price: Math.round(averagePrice),
      totalPrice: Number(totalPrice),
      totalCostPrice: Number(totalCostPrice),
      nightCount: nightlyPrices.length,
      successNightCount: successCount,
      details: {
        room: resolvedRoomId,
        rateType: finalRateId,
        package: finalPkgId,
        currency: 'VND',
        checkIn: checkInDate,
        checkOut: checkOutDate,
        preferredSupplier: preferredSupplierId,
      },
      details_price: details_price_text,
      nightly_details: nightlyPrices,
    };
  }

  // =====================================================================
  // 2. MODULE TÍNH GIÁ DỊCH VỤ (SERVICE PRICING)
  // =====================================================================

  static async getServicePrice(serviceName, useDate, supplierId = null) {
    const timerName = `Timer_getServicePrice_${Math.random().toString(36).substr(2, 5)}`;
    try {
      console.time(timerName);
      return await this._withTimeout(this._executeGetServicePrice(serviceName, useDate, supplierId), TIMEOUT_CONFIG.GET_SERVICE_PRICE, 'getServicePrice');
    } catch (error) {
      console.error('[CostManager] Service Price Error:', error);
      return { success: false, error: error.message, code: error.code || 'ERROR' };
    } finally {
      console.timeEnd(timerName);
    }
  }

  static async _executeGetServicePrice(serviceName, useDate, supplierId = null) {
    const dUse = new Date(useDate);
    const year = dUse.getFullYear();
    const db = getFirestore(getApp());

    const findMatchInDoc = (docData) => {
      const items = docData.items || [];
      if (!items.length) return null;
      const matchedItem = items.find((item) => {
        const isNameMatch = item.name && item.name.trim().toLowerCase() === serviceName.trim().toLowerCase();
        if (!isNameMatch) return false;
        return this._checkDateInRange(dUse, item.from || '01/01', item.to || '31/12');
      });

      if (matchedItem) {
        return {
          supplierId: docData.info?.supplierId,
          supplierName: docData.info?.supplierName,
          updatedAt: docData.info.updatedAt || 0,
          adl: getNum(matchedItem.adl),
          chd: getNum(matchedItem.chd),
          note: matchedItem.note ?? '',
        };
      }
      return null;
    };

    let candidates = [];

    if (supplierId) {
      const docId = `${supplierId}_${year}`.toUpperCase();
      const docSnap = await getDoc(doc(db, DB_PATHS.SERVICE_SCHEDULES, docId));

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.info && data.info.status === 'actived') {
          const match = findMatchInDoc(data);
          if (match) candidates.push(match);
        }
      }
    } else {
      const q = query(collection(db, DB_PATHS.SERVICE_SCHEDULES), where('info.year', '==', year), where('info.status', '==', 'actived'));
      const querySnap = await getDocs(q);

      querySnap.forEach((d) => {
        const match = findMatchInDoc(d.data());
        if (match) candidates.push(match);
      });
    }

    if (candidates.length === 0) return { success: false, error: 'Không tìm thấy giá phù hợp cho dịch vụ này.' };

    // Ưu tiên bản cập nhật mới nhất
    candidates.sort((a, b) => b.updatedAt - a.updatedAt);
    const bestMatch = candidates[0];

    return {
      success: true,
      price: {
        adl: bestMatch.adl,
        chd: bestMatch.chd,
      },
      supplier: {
        id: bestMatch.supplierId,
        name: bestMatch.supplierName,
      },
      matches: candidates,
    };
  }

  // ========================================================
  // 3. PRIVATE HELPERS (Lấy Data & Tiện ích xử lý)
  // ========================================================

  static async _fetchPriceSchedule(hotelIdentifier, packageId, year) {
    try {
      const db = getFirestore(getApp());
      // Ưu tiên cao nhất: Lấy chuẩn xác bằng Document ID (O(1))
      const docId = `${hotelIdentifier}_${packageId}_${year}`.toUpperCase();
      console.log(`[CostManager] 🔍 Thử lấy bảng giá bằng ID: ${docId}`);
      const docSnap = await getDoc(doc(db, DB_PATHS.SCHEDULES, docId));

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.info?.status === 'actived') {
          console.log(`[CostManager] ✅ Tìm thấy bảng giá bằng ID: ${docId}`);
          return data;
        }
        console.warn(`[CostManager] ⚠️ Bảng giá ${docId} tồn tại nhưng status không phải actived:`, data.info?.status);
      }

      // Fallback 1: Dùng Query quét qua tags (Dành cho trường hợp hotelIdentifier là ID chuẩn nhưng docId lệch)
      console.log(`[CostManager] 🔍 Thử tìm bảng giá bằng searchTags: ${hotelIdentifier}`);
      const q = query(collection(db, DB_PATHS.SCHEDULES), where('info.year', '==', parseInt(year)), where('info.ratePkg', '==', packageId), where('info.status', '==', 'actived'), where('searchTags', 'array-contains', hotelIdentifier), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        console.log(`[CostManager] ✅ Tìm thấy bảng giá bằng searchTags: ${hotelIdentifier}`);
        return snapshot.docs[0].data();
      }

      // Fallback 2: Nếu hotelIdentifier là Tên khách sạn, tìm ID khách sạn trước
      console.log(`[CostManager] 🔍 Thử tìm ID khách sạn từ Tên: ${hotelIdentifier}`);
      const hotelQ = query(collection(db, DB_PATHS.HOTELS), where('name', '==', hotelIdentifier), limit(1));
      const hotelSnap = await getDocs(hotelQ);
      if (!hotelSnap.empty) {
        const hotelId = hotelSnap.docs[0].id;
        console.log(`[CostManager] ℹ️ Tìm thấy ID khách sạn: ${hotelId} từ Tên: ${hotelIdentifier}. Thử query lại bảng giá...`);
        const q2 = query(collection(db, DB_PATHS.SCHEDULES), where('info.year', '==', parseInt(year)), where('info.ratePkg', '==', packageId), where('info.status', '==', 'actived'), where('searchTags', 'array-contains', hotelId), limit(1));
        const snapshot2 = await getDocs(q2);
        if (!snapshot2.empty) {
          console.log(`[CostManager] ✅ Tìm thấy bảng giá bằng ID khách sạn vừa tìm được: ${hotelId}`);
          return snapshot2.docs[0].data();
        }
      }

      console.warn(`[CostManager] ❌ Không tìm thấy bảng giá sau tất cả các bước fallback.`);
      return null;
    } catch (e) {
      console.error('[CostManager] ❌ _fetchPriceSchedule error:', e);
      return null;
    }
  }

  static async _fetchHotelRooms(hotelIdentifier) {
    try {
      const db = getFirestore(getApp());
      console.log(`[CostManager] 🔍 Lấy danh sách phòng cho: ${hotelIdentifier}`);
      let hotelDoc = await getDoc(doc(db, DB_PATHS.HOTELS, hotelIdentifier));
      let hotelData = null;

      if (!hotelDoc.exists()) {
        const q = query(collection(db, DB_PATHS.HOTELS), where('name', '==', hotelIdentifier), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          hotelDoc = querySnapshot.docs[0];
          hotelData = hotelDoc.data();
          console.log(`[CostManager] ℹ️ Tìm thấy khách sạn bằng Tên: ${hotelIdentifier}, ID: ${hotelDoc.id}`);
        }
      } else {
        hotelData = hotelDoc.data();
        console.log(`[CostManager] ℹ️ Tìm thấy khách sạn bằng ID: ${hotelIdentifier}`);
      }

      if (!hotelData) {
        console.warn(`[CostManager] ⚠️ Không tìm thấy thông tin khách sạn: ${hotelIdentifier}`);
        return [];
      }

      // Xử lý rooms dạng Map (Object) - Theo yêu cầu mới: rooms là field Map trong document hotel
      if (hotelData.rooms && typeof hotelData.rooms === 'object' && !Array.isArray(hotelData.rooms)) {
        const rooms = Object.entries(hotelData.rooms).map(([id, data]) => ({
          id: id,
          ...(typeof data === 'object' ? data : { name: data }),
        }));
        console.log(`[CostManager] ✅ Lấy được ${rooms.length} phòng từ field Map 'rooms'.`);
        return rooms;
      }

      // Nếu rooms là Array (Fallback cho các bản ghi cũ)
      if (Array.isArray(hotelData.rooms)) {
        console.log(`[CostManager] ✅ Lấy được ${hotelData.rooms.length} phòng từ field Array 'rooms'.`);
        return hotelData.rooms;
      }

      console.warn(`[CostManager] ⚠️ Field 'rooms' không tồn tại hoặc không đúng định dạng Map cho khách sạn: ${hotelIdentifier}`);
      return [];
    } catch (e) {
      console.warn('[CostManager] ❌ _fetchHotelRooms error:', e);
      return [];
    }
  }

  static _resolveIdByName(list, input) {
    if (!list || !input) return null;
    const search = String(input).trim().toLowerCase();
    const matchId = list.find((i) => String(i.id).toLowerCase() === search);
    if (matchId) return matchId.id;
    const matchName = list.find((i) => i.name && i.name.trim().toLowerCase() === search);
    if (matchName) return matchName.id;
    return null;
  }

  /**
   * Chuẩn hóa tên phòng -> ID phòng (Đồng bộ tuyệt đối với HotelPriceManager)
   */
  static _sanitizeRoomId(name) {
    if (!name) return 'phong_mac_dinh';
    return name
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Xóa dấu tiếng Việt
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_') // Thay ký tự đặc biệt bằng _
      .replace(/_+/g, '_') // Gộp nhiều gạch dưới
      .replace(/^_|_$/g, ''); // Cắt gạch dưới ở 2 đầu
  }

  static _parseMMDD(str) {
    if (!str) return 0;
    const parts = str.split('/');
    if (parts.length < 2) return 0;
    return parseInt(parts[1]) * 100 + parseInt(parts[0]);
  }

  static _checkDateInRange(dateObj, fromStr, toStr) {
    const currentVal = (dateObj.getMonth() + 1) * 100 + dateObj.getDate();
    const fromVal = this._parseMMDD(fromStr);
    const toVal = this._parseMMDD(toStr);

    if (fromVal <= toVal) return currentVal >= fromVal && currentVal <= toVal;
    else return currentVal >= fromVal || currentVal <= toVal;
  }
}
