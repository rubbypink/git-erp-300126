import { collection, doc, writeBatch } from 'firebase/firestore';

/**
 * =========================================================================
 * 9TRIP ERP - OPERATOR MODULE (Class-based)
 * Chuyên gia quản lý Điều hành, Công nợ Nhà cung cấp và Thanh toán
 * Cấu trúc chuẩn hóa MVC tương tự SalesModule
 * =========================================================================
 */

class OperatorController {
  // ─── 1. CONFIGURATION ──────────────────────────────────────────────
  static Config = {
    collections: ['operator_entries', 'suppliers', 'transactions', 'fund_accounts'],
    storageKeyLogs: '9trip_operator_logs',
  };

  // ─── 2. STATE ──────────────────────────────────────────────────────
  static State = {
    entries: [],
    supplierId: null,
    totalDebt: 0,
    isInitialized: false,
  };

  /**
   * Khởi tạo module
   */
  static async init() {
    if (this.State.isInitialized) return;
    try {
      if (typeof L !== 'undefined') L._('OperatorController: Initializing...');
      // Logic sync state khởi tạo có thể thêm ở đây nếu cần thiết
      this.State.isInitialized = true;
    } catch (e) {
      if (typeof L !== 'undefined') L.log('OperatorController.init Error:', e);
    }
  }

  // ─── 3. UI RENDERERS ───────────────────────────────────────────────
  static UI = {
    /**
     * BƯỚC 1: Hiển thị form lọc bằng SweetAlert2
     */
    openFilterDialog: async () => {
      try {
        const { value: filterParams } = await Swal.fire({
          title: '<h5 class="fw-bold mb-0 text-primary">Tra cứu Công nợ NCC</h5>',
          html: `
            <div class="text-start mt-3">
                <div class="mb-3">
                    <label class="form-label fw-bold small text-dark mb-1">Nhà cung cấp <span class="text-danger">*</span></label>
                    <select id="swal-supplier" class="smart-select form-select shadow-sm border-primary" data-source="suppliers"></select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold small text-dark mb-1">Giai đoạn</label>
                    <select id="swal-date-preset" class="form-select form-select-sm mb-2 shadow-sm border-primary">
                        <option value="">-- Chọn mốc thời gian --</option>
                        <option value="Tháng Này">Tháng Này</option>
                        <option value="Tháng Trước">Tháng Trước</option>
                        <option value="Tháng Sau">Tháng Sau</option>
                        <option value="Quý 1">Quý 1</option>
                        <option value="Quý 2">Quý 2</option>
                        <option value="Quý 3">Quý 3</option>
                        <option value="Quý 4">Quý 4</option>
                        <option value="Năm Nay">Năm Nay</option>
                        <option value="Tất Cả">Tất Cả</option>
                        <option value="Tùy chọn">Tùy chọn</option>
                    </select>
                    <div class="row g-2">
                        <div class="col-6"><input type="date" id="swal-start-date" class="form-control form-control-sm" placeholder="Từ ngày"></div>
                        <div class="col-6"><input type="date" id="swal-end-date" class="form-control form-control-sm" placeholder="Đến ngày"></div>
                    </div>
                </div>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: 'Tra cứu',
          cancelButtonText: 'Hủy',
          customClass: { confirmButton: 'btn btn-primary px-4', cancelButton: 'btn btn-secondary px-4' },
          buttonsStyling: false,
          didOpen: () => {
            const presetEl = getE('swal-date-preset');
            if (presetEl) {
              presetEl.addEventListener('change', function (e) {
                if (typeof getDateRange === 'function') {
                  const range = getDateRange(e.target.value);
                  if (range && range.start && range.end) {
                    setVal('swal-start-date', typeof formatDateForInput === 'function' ? formatDateForInput(range.start) : range.start);
                    setVal('swal-end-date', typeof formatDateForInput === 'function' ? formatDateForInput(range.end) : range.end);
                  }
                }
              });
            }
          },
          preConfirm: () => {
            const supplier = getVal('swal-supplier');
            const start = getVal('swal-start-date');
            const end = getVal('swal-end-date');

            if (!supplier) {
              Swal.showValidationMessage('Vui lòng chọn Nhà cung cấp!');
              return false;
            }
            return { supplier, start, end };
          },
        });

        if (filterParams) {
          await OperatorController.Logic.processData(filterParams);
        }
      } catch (error) {
        console.error('[OperatorController.UI.openFilterDialog] Lỗi khởi tạo filter:', error);
      }
    },

    /**
     * Helper Nội bộ: Tạo Container thống kê và Nút bấm
     */
    setupActionContainer: (cost, paid, debt, typeHtml) => {
      try {
        const oldContainer = getE('sup-action-container');
        if (oldContainer) oldContainer.remove();

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
                    <button type="button" class="btn btn-outline-secondary" onclick="OperatorController.UI.closeView()"><i class="fa-solid fa-arrow-left"></i> Đóng</button>
                    <button type="button" class="btn btn-warning" onclick="OperatorController.DB.handleUpdateSync()"><i class="fa-solid fa-rotate"></i> Sync (Update)</button>
                    ${debt > 0 ? `<button type="button" class="btn btn-success fw-bold shadow-sm" onclick="OperatorController.DB.handlePayAll()"><i class="fa-solid fa-money-check-dollar"></i> Thanh toán Hết (${debt.toLocaleString()})</button>` : ''}
                </div>
            </div>
        `;

        const tbody = getE('detail-tbody');
        if (tbody) {
          const tableArea = tbody.closest('.card');
          if (tableArea && tableArea.parentNode) {
            tableArea.parentNode.insertBefore(container, tableArea);
          }
        }
      } catch (e) {
        console.error('[OperatorController.UI.setupActionContainer] Error:', e);
      }
    },

    /**
     * BƯỚC 6: Dọn dẹp và khôi phục UI
     */
    closeView: () => {
      try {
        const container = getE('sup-action-container');
        if (container) container.remove();

        const tbody = getE('detail-tbody');
        if (tbody) tbody.innerHTML = '';

        if (typeof toggleTemplate === 'function') toggleTemplate('booking-card');

        OperatorController.State = { entries: [], supplierId: null, totalDebt: 0, isInitialized: true };
      } catch (e) {
        console.error('[OperatorController.UI.closeView] Error:', e);
      }
    },

    /**
     * Helper Nội bộ: Popup chọn tài khoản quỹ bắt buộc
     */
    promptFundAccount: async (message) => {
      try {
        const funds = window.APP_DATA?.fund_accounts || [];
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
      } catch (e) {
        console.error('[OperatorController.UI.promptFundAccount] Error:', e);
        return null;
      }
    },
  };

  // ─── 4. LOGIC HANDLERS ─────────────────────────────────────────────
  static Logic = {
    /**
     * BƯỚC 2 & 3: Lấy dữ liệu, tính toán thống kê và Render UI
     */
    processData: async ({ supplier, start, end }) => {
      try {
        if (typeof showLoading === 'function') showLoading(true, 'Đang xử lý dữ liệu...');
        else if (window.Swal) Swal.showLoading();

        // 2.1 Load Dữ liệu
        let sourceData = await window.A?.DB?.local?.getCollection('operator_entries');
        if (!sourceData || sourceData.length === 0) {
          sourceData = await window.A?.DB?.getCollection('operator_entries');
          if (window.APP_DATA) window.APP_DATA.operator_entries = sourceData;
        }

        let suppliers = await window.A?.DB?.getCollection('suppliers');
        let supData = HD.find(suppliers, supplier, 'id') || HD.find(suppliers, supplier, 'name') || { name: supplier };

        // 2.2 Lọc dữ liệu
        let filtered = HD.filter(sourceData, supData.name, '==', 'supplier') || HD.filter(sourceData, supplier, '==', 'supplier');
        if (typeof L !== 'undefined') L._(`🔍 Filtered supplier:`, supData);

        if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          filtered = Object.values(filtered).filter((item) => {
            const checkInDate = new Date(typeof formatDateISO === 'function' ? formatDateISO(item.check_in) : item.check_in);
            return checkInDate >= startDate && checkInDate <= endDate;
          });
          if (typeof L !== 'undefined') L._(`🔍 Filtered ${filtered.length} entries by date range: ${start} - ${end}`);
        }

        OperatorController.State.entries = filtered;
        OperatorController.State.supplierId = supplier;

        if (filtered.length === 0) {
          if (typeof showLoading === 'function') showLoading(false);
          else if (window.Swal) Swal.close();

          if (typeof logA === 'function') logA('Không có dữ liệu công nợ trong giai đoạn này.', 'info');
          else Swal.fire('Thông báo', 'Không có dữ liệu công nợ trong giai đoạn này.', 'info');
          return;
        }

        // 2.3 Thống kê
        const totalCost = HD.agg(filtered, 'total_cost');
        const totalPaid = HD.agg(filtered, 'paid_amount');
        const totalDebt = HD.agg(filtered, 'dept_balance') || totalCost - totalPaid;
        OperatorController.State.totalDebt = totalDebt;

        const statsAdults = {};
        filtered.forEach((item) => {
          const type = item.service_type || 'Khác';
          statsAdults[type] = (statsAdults[type] || 0) + (Number(item.adults) || 0);
        });
        let typeHtml = Object.entries(statsAdults)
          .map(([type, qty]) => `<span class="badge bg-info me-1">${type}: ${qty} lượt</span>`)
          .join('');

        // 2.4 Render UI
        OperatorController.UI.setupActionContainer(totalCost, totalPaid, totalDebt, typeHtml);

        const tbody = getE('detail-tbody');
        if (tbody) tbody.innerHTML = '';

        filtered.forEach((rowData) => {
          // Dynamic binding cho hàm thêm dòng tùy thuộc ngữ cảnh file chạy
          if (window.Op && typeof Op.UI?.addDetailRow === 'function') {
            Op.UI.addDetailRow(rowData);
          } else if (typeof addDetailRow === 'function') {
            addDetailRow(rowData);
          }
        });

        if (typeof toggleTemplate === 'function') toggleTemplate('booking-card');

        if (typeof showLoading === 'function') showLoading(false);
        else if (window.Swal) Swal.close();
      } catch (error) {
        if (typeof showLoading === 'function') showLoading(false);
        console.error('[OperatorController.Logic.processData] Error:', error);
        if (typeof logA === 'function') logA('Không thể tải dữ liệu.', 'error');
        else Swal.fire('Lỗi', 'Không thể tải dữ liệu.', 'error');
      }
    },
  };

  // ─── 5. DATABASE ACTIONS ───────────────────────────────────────────
  static DB = {
    /**
     * BƯỚC 4: Nghiệp vụ Pay All (Lô)
     */
    handlePayAll: async () => {
      if (OperatorController.State.totalDebt <= 0) {
        if (typeof logA === 'function') return logA('Không còn công nợ để thanh toán.', 'info');
        return Swal.fire('Thông báo', 'Không còn công nợ để thanh toán.', 'info');
      }

      const fundAccountId = await OperatorController.UI.promptFundAccount(`Thanh toán ${(OperatorController.State.totalDebt * 1000).toLocaleString()} đ`);
      if (!fundAccountId) return;

      try {
        if (typeof showLoading === 'function') showLoading(true, 'Đang thanh toán lô...');
        const db = window.A?.DB?.db;
        if (!db) throw new Error('Lỗi mất kết nối CSDL (A.DB.db)');

        const batch = writeBatch(db);
        const txRef = doc(collection(db, 'transactions'));
        const entryIds = HD.pluck(OperatorController.State.entries, 'id').join(', ');

        batch.set(txRef, {
          id: txRef.id,
          transaction_date: new Date().toISOString(),
          type: 'OUT',
          amount: OperatorController.State.totalDebt * 1000,
          receiver: OperatorController.State.supplierId,
          category: 'PAY_SUPPLIER_BATCH',
          booking_id: 'BATCH_PAYMENT',
          description: `Thanh toán lô cho các dịch vụ: ${entryIds}`,
          status: 'Completed',
          fund_source: fundAccountId,
          created_by: window.CURRENT_USER?.name || 'Unknown',
          created_at: new Date().toISOString(),
        });

        OperatorController.State.entries.forEach((entry) => {
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

        if (typeof showLoading === 'function') showLoading(false);
        if (typeof logA === 'function') logA('Đã thanh toán công nợ lô thành công!', 'success');
        else Swal.fire('Thành công', 'Đã thanh toán công nợ lô thành công!', 'success');

        OperatorController.UI.closeView();
      } catch (error) {
        if (typeof showLoading === 'function') showLoading(false);
        console.error('[OperatorController.DB.handlePayAll] Error:', error);
        if (typeof logA === 'function') logA('Giao dịch thất bại. Hệ thống đã tự động Rollback!', 'error');
        else Swal.fire('Lỗi', 'Giao dịch thất bại. Hệ thống đã tự động Rollback!', 'error');
      }
    },

    /**
     * BƯỚC 5: Nghiệp vụ Update (Đồng bộ thiếu/đủ)
     */
    handleUpdateSync: async () => {
      if (!window.APP_DATA?.transactions) {
        window.APP_DATA.transactions = await window.A?.DB?.getCollection('transactions');
      }

      const fundAccountId = await OperatorController.UI.promptFundAccount(`Cập nhật đồng bộ Dữ liệu. Vui lòng chọn Quỹ xử lý hạch toán thiếu:`);
      if (!fundAccountId) return;

      try {
        if (typeof showLoading === 'function') showLoading(true, 'Đang đồng bộ...');
        const db = window.A?.DB?.db;
        if (!db) throw new Error('Lỗi mất kết nối CSDL (A.DB.db)');

        const batch = writeBatch(db);
        let totalMissingGenerated = 0;

        OperatorController.State.entries.forEach((entry) => {
          const txs = HD.filter(window.APP_DATA.transactions, entry.id, '==', 'booking_id');
          const validTxs = txs.filter((t) => t.type === 'OUT' && t.status === 'Completed');
          const txSum = HD.agg(validTxs, 'amount');

          const missingAmount = (entry.paid_amount || 0) * 1000 - txSum;

          if (missingAmount > 0) {
            totalMissingGenerated += missingAmount;

            const txRef = doc(collection(db, 'transactions'));
            batch.set(txRef, {
              id: txRef.id,
              transaction_date: new Date().toISOString(),
              type: 'OUT',
              amount: missingAmount,
              receiver: OperatorController.State.supplierId,
              category: 'SYNC_CORRECTION',
              booking_id: entry.id,
              description: `[Auto-Sync] Bổ sung hạch toán thiếu cho dịch vụ ${entry.id}`,
              status: 'Completed',
              fund_source: fundAccountId,
              created_by: window.CURRENT_USER?.name || 'System Auto',
              created_at: new Date().toISOString(),
            });
          }
        });

        await batch.commit();
        if (typeof showLoading === 'function') showLoading(false);

        const msg = `Đã đồng bộ giao dịch. Phát sinh tự động bù trừ: ${totalMissingGenerated.toLocaleString()} đ`;
        if (typeof logA === 'function') logA(msg, 'success');
        else Swal.fire('Thành công', msg, 'success');
      } catch (error) {
        if (typeof showLoading === 'function') showLoading(false);
        console.error('[OperatorController.DB.handleUpdateSync] Error:', error);
        if (typeof logA === 'function') logA('Lỗi đồng bộ dữ liệu.', 'error');
        else Swal.fire('Lỗi', 'Lỗi đồng bộ dữ liệu.', 'error');
      }
    },
  };
}

// ─── EXPOSE TO GLOBAL FOR HTML COMPATIBILITY ────────────────────────
window.OperatorController = OperatorController;
// Export bí danh cho phép tương thích hoàn toàn với các tệp hiện tại đang gọi "SupplierPayment"
export const SupplierPayment = OperatorController;
export default OperatorController;
