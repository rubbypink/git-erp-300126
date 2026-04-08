/**
 * PriceCalculator - Logic tính toán giá bán cho 9Trip ERP
 * Chuyên trách các thuật toán markup, làm tròn và áp dụng chính sách giá.
 */
export class PriceCalculator {
  static config = null;

  /**
   * Tải cấu hình Markup từ Firestore
   */
  static async loadConfig() {
    try {
      // Sử dụng A.DB nếu có, nếu không thì bỏ qua (sẽ dùng fallback)
      if (window.A && window.A.DB) {
        const data = await window.A.DB.getCollection('app_config/prices/markup', 'default');
        if (data) {
          this.config = data;
          console.log('[PriceCalculator] Cấu hình Markup đã được tải:', data);
          return data;
        }
      }
    } catch (error) {
      console.warn('[PriceCalculator] Không thể tải cấu hình Markup, sử dụng fallback:', error);
    }
    return null;
  }

  /**
   * Làm tròn số theo block (mặc định 1.000đ)
   * @param {number} amount - Số tiền cần làm tròn
   * @param {number} block - Đơn vị block (mặc định 1000)
   * @returns {number}
   */
  static roundToBlock(amount, block = 1000) {
    if (!amount || isNaN(amount)) return 0;
    return Math.ceil(amount / block) * block;
  }

  /**
   * Tính giá bán cho Khách sạn dựa trên hạng sao
   * @param {number} netPrice - Giá gốc (Net)
   * @param {number|string} star - Hạng sao (3, 4, 5)
   * @param {Object} options - { max_price }
   * @returns {number}
   */
  static calculateHotelPrice(netPrice, star, options = {}) {
    try {
      if (!netPrice) return 0;
      
      let markup = 1.10; // Mặc định 10%
      const starNum = parseInt(star);

      // Ưu tiên dùng cấu hình từ DB
      if (this.config && this.config.hotel) {
        const key = `star_${starNum}`;
        if (this.config.hotel[key] !== undefined) {
          markup = this.config.hotel[key];
        }
      } else {
        // Fallback logic cũ
        if (starNum === 3) markup = 1.15;
        else if (starNum === 4) markup = 1.10;
        else if (starNum === 5) markup = 1.07;
      }

      let sellingPrice = netPrice * markup;
      
      // Làm tròn theo block 1.000đ
      sellingPrice = this.roundToBlock(sellingPrice);

      // Áp dụng giới hạn max_price nếu có
      if (options.max_price && sellingPrice > options.max_price) {
        sellingPrice = options.max_price;
      }

      return sellingPrice;
    } catch (error) {
      console.error('[PriceCalculator] calculateHotelPrice error:', error);
      return 0;
    }
  }

  /**
   * Tính giá bán cho Dịch vụ dựa trên loại dịch vụ
   * @param {number} netPrice - Giá gốc (Net)
   * @param {string} type - Loại dịch vụ (Vé, Tour, Xe, Bữa ăn, ...)
   * @param {Object} options - { max_price }
   * @returns {number}
   */
  static calculateServicePrice(netPrice, type, options = {}) {
    try {
      if (!netPrice) return 0;

      let sellingPrice = 0;
      const normalizedType = String(type || '').toLowerCase().trim();

      // Ưu tiên dùng cấu hình từ DB
      if (this.config && this.config.service) {
        const cfg = this.config.service;
        
        if ((normalizedType.includes('vé mb') || normalizedType.includes('vé tàu')) && cfg.ticket_fixed !== undefined) {
          sellingPrice = netPrice + cfg.ticket_fixed;
        } else if (normalizedType.includes('tour') && cfg.tour !== undefined) {
          sellingPrice = netPrice * cfg.tour;
        } else if (normalizedType.includes('xe') && cfg.car_fixed !== undefined) {
          sellingPrice = netPrice + cfg.car_fixed;
        } else if (cfg.default !== undefined) {
          sellingPrice = netPrice * cfg.default;
        } else {
          sellingPrice = netPrice * 1.10;
        }
      } else {
        // Fallback logic cũ
        if (normalizedType.includes('vé mb') || normalizedType.includes('vé tàu')) {
          sellingPrice = netPrice + 50000;
        } else if (normalizedType.includes('vé')) {
          const markup = netPrice > 1000000 ? 1.08 : 1.10;
          sellingPrice = netPrice * markup;
        } else if (normalizedType.includes('tour')) {
          sellingPrice = netPrice * 1.25;
        } else if (normalizedType.includes('xe')) {
          sellingPrice = netPrice + 100000;
        } else if (normalizedType.includes('ăn') || normalizedType.includes('bữa ăn')) {
          sellingPrice = netPrice * 1.10;
        } else {
          sellingPrice = netPrice * 1.10;
        }
      }

      // Làm tròn theo block 1.000đ
      sellingPrice = this.roundToBlock(sellingPrice);

      // Áp dụng giới hạn max_price nếu có
      if (options.max_price && sellingPrice > options.max_price) {
        sellingPrice = options.max_price;
      }

      return sellingPrice;
    } catch (error) {
      console.error('[PriceCalculator] calculateServicePrice error:', error);
      return 0;
    }
  }

  /**
   * Recalculate toàn bộ bảng giá Hotel
   * @param {Object} priceData - Map {key: net_price}
   * @param {number|string} star - Hạng sao
   * @returns {Object} Map {key: selling_price}
   */
  static recalculateHotelTable(priceData, star) {
    const result = {};
    for (const [key, net] of Object.entries(priceData)) {
      result[key] = this.calculateHotelPrice(net, star);
    }
    return result;
  }

  /**
   * Recalculate toàn bộ danh sách dịch vụ
   * @param {Array} items - Mảng các object dịch vụ
   * @returns {Array} Mảng items đã được cập nhật sell_adl, sell_chd
   */
  static recalculateServiceItems(items) {
    return items.map(item => ({
      ...item,
      sell_adl: this.calculateServicePrice(item.net_adl || item.adl, item.type),
      sell_chd: this.calculateServicePrice(item.net_chd || item.chd, item.type)
    }));
  }
}
