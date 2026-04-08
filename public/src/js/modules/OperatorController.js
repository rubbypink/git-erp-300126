import { collection, doc, writeBatch } from 'firebase/firestore';

/**
 * Module: Supplier Debt & Payment Manager (Operator Team)
 * Dependencies: HD (Helper), APP_DATA, A.DB, Swal, toggleTemplate, addDetailRow, getDateRange
 */

export const SupplierPayment = {
  // Lưu state hiện tại để xử lý Payment/Update
  state: {
    entries: [],
    supplierId: null,
    totalDebt: 0,
  },

  /**
   * BƯỚC 1: Hiển thị form lọc bằng SweetAlert2
   */
  async openFilterDialog() {
    try {
      // 1.1 Chuẩn bị Options cho Nhà cung cấp
      const suppliers = APP_DATA?.lists?.suppliers || Object.values(window.APP_DATA?.suppliers || {});
      let supplierOptions = '<option value="">-- Chọn Nhà Cung Cấp --</option>';
      suppliers.forEach((s) => {
        supplierOptions += `<option value="${s.id || s}">${s.name || s}</option>`;
      });

      // 1.2 Render Popup
      const { value: filterParams } = await Swal.fire({
        title: 'Tra cứu Công nợ NCC',
        html: `
                    <div class="text-start">
                        <div class="mb-3">
                            <label class="form-label fw-bold">Nhà cung cấp <span class="text-danger">*</span></label>
                            <select id="swal-supplier" class="form-select">${supplierOptions}</select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Giai đoạn</label>
                            <select id="swal-date-preset" class="form-select mb-2">
                                <option value="">-- Chọn mốc thời gian --</option>
                                <option value="Tháng 1">Tháng 1</option>
                                <option value="Tháng 2">Tháng 2</option>
                                <option value="Tháng 3">Tháng 3</option>
                                <option value="Quý 1">Quý 1</option>
                                <option value="Quý 2">Quý 2</option>
                                <option value="Năm Nay">Năm Nay</option>
                                <option value="Tất Cả">Tất Cả</option>
                                <option value="Tùy chọn">Tùy chọn</option>
                            </select>
                            <div class="row">
                                <div class="col-6"><input type="date" id="swal-start-date" class="form-control" placeholder="Từ ngày"></div>
                                <div class="col-6"><input type="date" id="swal-end-date" class="form-control" placeholder="Đến ngày"></div>
                            </div>
                        </div>
                    </div>
                `,
        didOpen: () => {
          // Lắng nghe sự kiện chọn Preset Date để auto-fill input date
          getE('swal-date-preset').addEventListener('change', function (e) {
            if (typeof getDateRange === 'function') {
              const range = getDateRange(e.target.value);
              if (range && range.start && range.end) {
                getE('swal-start-date').value = formatDateForInput(range.start);
                getE('swal-end-date').value = formatDateForInput(range.end);
              }
            }
          });
        },
        preConfirm: () => {
          const supplier = getE('swal-supplier').value;
          const start = getE('swal-start-date').value;
          const end = getE('swal-end-date').value;

          if (!supplier) {
            Swal.showValidationMessage('Vui lòng chọn Nhà cung cấp!');
            return false;
          }
          return { supplier, start, end };
        },
      });

      if (filterParams) {
        await this.processData(filterParams);
      }
    } catch (error) {
      console.error('[SupplierDebt] Lỗi khởi tạo filter:', error);
    }
  },

  /**
   * BƯỚC 2 & 3: Lấy dữ liệu, tính toán thống kê và Render UI
   */
  async processData({ supplier, start, end }) {
    try {
      Swal.showLoading();

      // 2.1 Load Dữ liệu ưu tiên APP_DATA, fallback Firestore
      let sourceData = APP_DATA?.operator_entries;
      if (!sourceData || sourceData.length === 0) {
        sourceData = await A.DB.getCollection('operator_entries');
        if (APP_DATA) APP_DATA.operator_entries = sourceData; // Cache lại
      }
      let supData = HD.find(APP_DATA?.suppliers, supplier, 'id') || HD.find(APP_DATA?.suppliers, supplier, 'name');

      // 2.2 Lọc bằng HD.filter (Lọc Supplier trước)
      let filtered = HD.filter(sourceData, supData.name, '==', 'supplier') || HD.filter(sourceData, supplier, '==', 'supplier');
      L._(`🔍 Filtered ${Object.values(supData)} supplier`);

      // Lọc tiếp theo Date Range (check_in)
      if (start && end) {
        filtered = Object.values(filtered).filter((item) => new Date(formatDateISO(item.check_in)) >= new Date(start) && new Date(formatDateISO(item.check_in)) <= new Date(end));
        L._(`🔍 Filtered ${filtered.length} entries by date range: ${start} - ${end}`);
      }

      this.state.entries = filtered;
      this.state.supplierId = supplier;

      if (filtered.length === 0) {
        Swal.fire('Thông báo', 'Không có dữ liệu công nợ trong giai đoạn này.', 'info');
        return;
      }

      // 2.3 Tính toán Thống kê bằng HD.agg
      const totalCost = HD.agg(filtered, 'total_cost');
      const totalPaid = HD.agg(filtered, 'paid_amount');
      const totalDebt = HD.agg(filtered, 'dept_balance') || totalCost - totalPaid;
      this.state.totalDebt = totalDebt;

      // Thống kê số lượng theo service_type
      const statsAdults = {};
      filtered.forEach((item) => {
        const type = item.service_type || 'Khác';
        statsAdults[type] = (statsAdults[type] || 0) + (Number(item.adults) || 0);
      });
      let typeHtml = Object.entries(statsAdults)
        .map(([type, qty]) => `<span class="badge bg-info me-1">${type}: ${qty} lượt</span>`)
        .join('');

      // 2.4 Render UI (Action Container & Bảng)
      this._setupActionContainer(totalCost, totalPaid, totalDebt, typeHtml);

      // Xóa rỗng tbody trước khi render
      const tbody = getE('detail-tbody');
      if (tbody) tbody.innerHTML = '';

      // Render từng dòng
      filtered.forEach((rowData) => {
        if (typeof Op.UI.addDetailRow === 'function') Op.UI.addDetailRow(rowData);
      });

      // Ẩn Card hiện tại để nhường chỗ cho ActionContainer & Table
      if (typeof toggleTemplate === 'function') toggleTemplate('booking-card');

      Swal.close();
    } catch (error) {
      console.error('[SupplierDebt] Lỗi xử lý dữ liệu:', error);
      Swal.fire('Lỗi', 'Không thể tải dữ liệu.', 'error');
    }
  },

  /**
   * Helper Nội bộ: Tạo Container thống kê và Nút bấm
   */
  _setupActionContainer(cost, paid, debt, typeHtml) {
    // Xóa action-container cũ nếu có
    const oldContainer = getE('sup-action-container');
    if (oldContainer) oldContainer.remove();

    // Tạo mới
    const container = document.createElement('div');
    container.id = 'sup-action-container';
    container.className = 'card shadow-sm border-primary mb-3';
    container.innerHTML = `
            <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div>
                    <h5 class="mb-1 fw-bold text-primary">Tổng kết Dịch vụ</h5>
                    <div class="mb-2">${typeHtml}</div>
                    <div class="d-flex gap-3 text-muted" style="font-size: 0.9rem;">
                        <span>Tổng tiền: <strong class="text-dark">${cost.toLocaleString()}</strong></span>
                        <span>Đã thanh toán: <strong class="text-success">${paid.toLocaleString()}</strong></span>
                        <span>Còn lại: <strong class="text-danger fs-6">${debt.toLocaleString()}</strong></span>
                    </div>
                </div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-outline-secondary" onclick="Op.Supplier.closeView()"><i class="fa-solid fa-arrow-left"></i> Đóng</button>
                    <button type="button" class="btn btn-warning" onclick="Op.Supplier.handleUpdateSync()"><i class="fa-solid fa-rotate"></i> Sync (Update)</button>
                    ${debt > 0 ? `<button type="button" class="btn btn-success fw-bold shadow-sm" onclick="Op.Supplier.handlePayAll()"><i class="fa-solid fa-money-check-dollar"></i> Thanh toán Hết (${debt.toLocaleString()})</button>` : ''}
                </div>
            </div>
        `;

    // Chèn vào trước bảng chi tiết
    const tableArea = getE('detail-tbody').closest('.card');
    if (tableArea) tableArea.parentNode.insertBefore(container, tableArea);
  },

  /**
   * BƯỚC 4: Nghiệp vụ Pay All (Lô)
   */
  async handlePayAll() {
    if (this.state.totalDebt <= 0) return Swal.fire('Thông báo', 'Không còn công nợ để thanh toán.', 'info');

    const fundAccountId = await this._promptFundAccount(`Thanh toán ${(this.state.totalDebt * 1000).toLocaleString()} đ`);
    if (!fundAccountId) return;

    try {
      const db = A.DB.db; // Giả định instance firestore
      const batch = writeBatch(db);

      // 1. Lấy thông tin Quỹ (Để trừ tiền)
      // const fundObj = HD.find(APP_DATA.fund_accounts, fundAccountId, 'id');
      // const fundRef = doc(db, 'fund_accounts', fundAccountId);
      // batch.update(fundRef, {
      //   balance: (fundObj.balance || 0) - this.state.totalDebt * 1000,
      //   updated_at: new Date(),
      // });

      // 2. Tạo Transaction (1 phiếu duy nhất)
      const txRef = doc(collection(db, 'transactions'));
      const entryIds = HD.pluck(this.state.entries, 'id').join(', ');

      batch.set(txRef, {
        id: txRef.id,
        transaction_date: new Date().toISOString(),
        type: 'OUT',
        amount: this.state.totalDebt * 1000,
        receiver: this.state.supplierId,
        category: 'PAY_SUPPLIER_BATCH',
        booking_id: 'BATCH_PAYMENT',
        description: `Thanh toán lô cho các dịch vụ: ${entryIds}`,
        status: 'Completed',
        fund_source: fundAccountId,
        created_by: CURRENT_USER?.name || 'Unknown',
        created_at: new Date().toISOString(),
      });

      // 3. Cập nhật các operator_entries (dept_balance về 0)
      this.state.entries.forEach((entry) => {
        if (entry.dept_balance > 0) {
          const entryRef = doc(db, 'operator_entries', entry.id);
          batch.update(entryRef, {
            paid_amount: Number(entry.paid_amount || 0) + Number(entry.dept_balance),
            dept_balance: 0,
            updated_at: new Date().toISOString(),
          });
        }
      });

      await batch.commit();
      logA('Đã thanh toán công nợ lô thành công!', 'success');
      this.closeView(); // Trả lại giao diện ban đầu
    } catch (error) {
      console.error('[SupplierDebt] Lỗi PayAll:', error);
      Swal.fire('Lỗi', 'Giao dịch thất bại. Hệ thống đã tự động Rollback!', 'error');
    }
  },

  /**
   * BƯỚC 5: Nghiệp vụ Update (Đồng bộ thiếu/đủ giữa Entries và Transactions)
   */
  async handleUpdateSync() {
    // Đảm bảo có transactions cache
    if (!APP_DATA.transactions) {
      APP_DATA.transactions = await A.DB.getCollection('transactions');
    }

    const fundAccountId = await this._promptFundAccount(`Cập nhật đồng bộ Dữ liệu. Vui lòng chọn Quỹ xử lý hạch toán thiếu:`);
    if (!fundAccountId) return;

    try {
      const db = A.DB.db;
      const batch = writeBatch(db);
      let totalMissingGenerated = 0;
      const fundObj = HD.find(APP_DATA.fund_accounts, fundAccountId, 'id');

      this.state.entries.forEach((entry) => {
        // Lọc các tx thuộc về entry này (Theo logAic của bạn: booking_id = entry.id)
        const txs = HD.filter(APP_DATA.transactions, entry.id, '==', 'booking_id');

        // Chỉ lấy các phiếu chi (OUT) Completed
        const validTxs = txs.filter((t) => t.type === 'OUT' && t.status === 'Completed');
        const txSum = HD.agg(validTxs, 'amount');

        // So sánh tổng phiếu chi với dept_amount (Ở đây tôi dùng paid_amount hiện tại để so sánh)
        // Nếu User nhập tay paid_amount = 1000, nhưng TX mới có 800 -> Thiếu 200, tạo TX bù vào.
        const missingAmount = (entry.paid_amount || 0) * 1000 - txSum;

        if (missingAmount > 0) {
          totalMissingGenerated += missingAmount;

          const txRef = doc(collection(db, 'transactions'));
          batch.set(txRef, {
            id: txRef.id,
            transaction_date: new Date().toISOString(),
            type: 'OUT',
            amount: missingAmount,
            receiver: this.state.supplierId,
            category: 'SYNC_CORRECTION',
            booking_id: entry.id,
            description: `[Auto-Sync] Bổ sung hạch toán thiếu cho dịch vụ ${entry.id}`,
            status: 'Completed',
            fund_source: fundAccountId,
            created_by: CURRENT_USER?.name || 'System Auto',
            created_at: new Date().toISOString(),
          });
        }
      });

      // Nếu có tạo giao dịch mới, phải trừ quỹ tổng
      // if (totalMissingGenerated > 0) {
      //   const fundRef = doc(db, 'fund_accounts', fundAccountId);
      //   batch.update(fundRef, {
      //     balance: (fundObj.balance || 0) - totalMissingGenerated,
      //     updated_at: new Date(),
      //   });
      // }

      await batch.commit();
      Swal.fire('Thành công', `Đã đồng bộ giao dịch. Phát sinh tự động bù trừ: ${totalMissingGenerated.toLocaleString()} đ`, 'success');
    } catch (error) {
      console.error('[SupplierDebt] Lỗi Sync:', error);
      Swal.fire('Lỗi', 'Lỗi đồng bộ dữ liệu.', 'error');
    }
  },

  /**
   * BƯỚC 6: Dọn dẹp và khôi phục UI
   */
  closeView() {
    const container = getE('sup-action-container');
    if (container) container.remove();

    const tbody = getE('detail-tbody');
    if (tbody) tbody.innerHTML = '';

    if (typeof toggleTemplate === 'function') toggleTemplate('booking-card');

    this.state = { entries: [], supplierId: null, totalDebt: 0 }; // Reset
  },

  /**
   * Helper Nội bộ: Popup chọn tài khoản quỹ bắt buộc
   */
  async _promptFundAccount(message) {
    const funds = APP_DATA?.fund_accounts || [];
    const options = {};
    Object.entries(funds).forEach(([key, f]) => {
      options[f.id] = f.name;
    });

    const { value: fundId } = await Swal.fire({
      title: 'Hạch toán Nguồn Tiền',
      text: message,
      input: 'select',
      inputOptions: options,
      inputPlaceholder: '-- Bắt buộc chọn Quỹ --',
      showCancelButton: true,
      confirmButtonColor: '#198754',
      confirmButtonText: 'Xác nhận',
      inputValidator: (value) => {
        if (!value) return 'Bạn phải chọn Nguồn tiền để sổ quỹ cân bằng!';
      },
    });
    return fundId;
  },
};
