/**
 * PricingEngine - Bộ máy tính toán giá Tour/Combo (V2)
 * Thực thi các quy tắc nghiệp vụ phức tạp về vận chuyển, lưu trú và markup.
 *
 * @author 9Trip Tech Lead
 */

export default class PricingEngine {
  /**
   * Tính toán toàn bộ bảng giá dựa trên dữ liệu đầu vào
   * @param {Object} services - Dữ liệu từ các bảng con (hotels, private, common, cars)
   * @param {Object} info - Thông tin tour (list_price, profit_adult, profit_child)
   * @returns {Object} Kết quả tính toán (base_adult, base_child, selling_adult, selling_child, surcharges, footers)
   */
  static calculateAll(services, info, footers) {
    const results = {
      base_adult: [],
      base_child: [],
      selling_adult: [],
      selling_child: [],
      surcharges: {
        adult: { peak: 0, holiday: 0 },
        child: { peak: 0, holiday: 0 },
      },
      footers: {
        hotels: { adult: 0, child: 0, single: 0, peak: 0, holiday: 0 },
        private: { adult: 0, child: 0 },
        common: { adult: 0, child: 0, peak: 0, holiday: 0 },
        cars: { p7: 0, p16: 0, p29: 0, p35: 0, p45: 0 },
      },
    };

    try {
      const { hotels = [], private: privateSvcs = [], common = [], cars = [] } = services;
      const profitAdult = parseFloat(info.profit_adult) || 0;
      const profitChild = parseFloat(info.profit_child) || 0;
      const listPrice = parseFloat(info.list_price) || 0;

      // Lấy dữ liệu footer từ services (do Controller đã tính toán và truyền vào)
      if (footers) {
        results.footers = { ...results.footers, ...footers };
      }

      // 2. Tính toán bảng giá gốc người lớn (2-35 pax)
      for (let pax = 2; pax <= 35; pax++) {
        // Giá gốc = cộng giá người lớn các bảng con lại
        let basePrice = results.footers.hotels.adult + results.footers.private.adult;

        // Dịch vụ chung: người lớn = sumproduct (đơn giá * số lượng) / số người lớn.
        // Loại DV = 'HDV' & NL < 4 => giá HDV = 0.
        const commonAdultBase =
          common.reduce((sum, s) => {
            const price = parseFloat(s.price) || 0;
            const qty = parseFloat(s.qty) || 0;
            if (s.type === 'HDV' && pax < 4) return sum;
            return sum + price * qty;
          }, 0) / pax;
        basePrice += commonAdultBase;

        // Xe: người lớn = tổng cột loại xe tương ứng / số người lớn.
        // Điều kiện: số người lớn <= số chỗ - 2.
        let carTotal = 0;
        if (pax <= 5)
          carTotal = results.footers.cars.p7; // 7-2=5
        else if (pax <= 14)
          carTotal = results.footers.cars.p16; // 16-2=14
        else if (pax <= 27)
          carTotal = results.footers.cars.p29; // 29-2=27
        else if (pax <= 33)
          carTotal = results.footers.cars.p35; // 35-2=33
        else carTotal = results.footers.cars.p45; // 45-2=43 (pax <= 35 nên luôn thỏa)

        basePrice += carTotal / pax;

        // Nếu số người lớn lẻ: cộng thêm (giá khách sạn người lẻ - giá khách sạn người lớn) / tổng số người lớn.
        if (pax % 2 !== 0) {
          basePrice += (results.footers.hotels.single - results.footers.hotels.adult) / pax;
        }

        const roundedBase = Math.ceil(basePrice / 1000) * 1000;
        results.base_adult.push({ pax, price: basePrice });

        // Tính giá bán (chỉ cho 2-10 pax)
        if (pax <= 10) {
          const sellingPrice = Math.ceil((basePrice + profitAdult) / 100) * 100 - 10;
          const discount = listPrice - sellingPrice;
          results.selling_adult.push({ pax, price: sellingPrice, discount });
        }
      }

      // 3. Tính toán bảng giá gốc trẻ em (3x3 grid)
      // Chỉ tốn tiền Khách sạn và dịch vụ riêng.
      const childLabels = ['Dưới 1M', 'Từ 1M-1M39', 'Từ 1M4'];
      const ageLabels = ['2-3 tuổi', '4-5 tuổi', '6-11 tuổi'];

      childLabels.forEach((hLabel, hIdx) => {
        const row = { label: hLabel, prices: [] };
        ageLabels.forEach((aLabel, aIdx) => {
          let childBase = 0;

          // Logic Khách sạn cho trẻ em: < 4 tuổi free, 6-11 tuổi giá trẻ em. Vinpearl: tính từ 4-11 tuổi.
          hotels.forEach((h) => {
            const isVinpearl = h.name && h.name.toLowerCase().includes('vinpearl');
            const nights = parseFloat(h.nights) || 0;
            const priceChild = parseFloat(h.child) || 0;

            if (aIdx === 0) {
              // 2-3 tuổi (< 4 tuổi)
              // Free
            } else if (aIdx === 1) {
              // 4-5 tuổi
              if (isVinpearl) childBase += priceChild * nights;
            } else {
              // 6-11 tuổi
              childBase += priceChild * nights;
            }
          });

          // Logic Dịch vụ cho trẻ em: Vé MB tính từ 2-11 tuổi. Khác: tính theo chiều cao (1m-1m39). >= 1m4 tính giá người lớn.
          privateSvcs.forEach((s) => {
            if (s.type === 'Vé MB') {
              // Vé MB tính từ 2-11 tuổi (tất cả các cột tuổi trong bảng này đều >= 2)
              childBase += parseFloat(s.child) || 0;
            } else {
              if (hIdx === 1) {
                // 1M-1M39
                childBase += parseFloat(s.child) || 0;
              } else if (hIdx === 2) {
                // >= 1M4 tính giá người lớn
                childBase += parseFloat(s.adult) || 0;
              }
            }
          });
          const sellingChildPrice = Math.ceil((childBase + profitChild) / 100) * 100 - 10;
          row.prices.push({ age: aLabel, price: childBase, selling: sellingChildPrice });
        });
        results.base_child.push(row);
      });

      // 4. Tính toán phụ thu
      // Phụ thu lễ tết người lớn: = tổng cột cao điểm/lễ tết khách sạn / 2 + tổng cột cao điểm/lễ tết dịch vụ chung.
      // Tối thiểu >= 20% giá bán bình quân.
      results.surcharges.adult.peak = results.footers.hotels.peak / 2 + results.footers.common.peak;
      results.surcharges.adult.holiday = results.footers.hotels.holiday / 2 + results.footers.common.holiday;

      // Nếu holiday chưa có thì lấy peak
      if (!results.surcharges.adult.holiday) results.surcharges.adult.holiday = results.surcharges.adult.peak;

      // Kiểm tra tối thiểu 20% giá bán bình quân cho lễ tết
      if (results.selling_adult.length > 0) {
        const avgSelling = results.selling_adult.reduce((sum, p) => sum + p.price, 0) / results.selling_adult.length;
        if (results.surcharges.adult.holiday < avgSelling * 0.2) {
          results.surcharges.adult.holiday = Math.ceil((avgSelling * 0.2) / 100) * 100 - 10;
        }
      }

      // Phụ thu trẻ em: = tổng cột cao điểm/lễ tết dịch vụ chung.
      results.surcharges.child.peak = results.footers.private.peak;
      results.surcharges.child.holiday = results.footers.private.holiday;
      if (!results.surcharges.child.holiday) results.surcharges.child.holiday = results.surcharges.child.peak;
    } catch (error) {
      console.error('PricingEngine.calculateAll error:', error);
      if (typeof Opps === 'function') Opps('Lỗi tính toán bảng giá', error);
    }

    return results;
  }
}
