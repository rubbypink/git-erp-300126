import localDB from './db/DBLocalStorage.js';
import ATable from './core/ATable.js';

/**
 * MODULE REPORT - 9 TRIP ERP (ES6 Class-based)
 * Tối ưu hóa: Sử dụng ATable cho bảng dữ liệu, Mobile Responsive, Clean Code.
 */
class ReportModule {
  constructor() {
    this.state = {
      data: {
        bookings: [],
        details: [],
        operators: [],
        transactions: [],
      },
      syncErrorsForFix: [],
      charts: { main: null, pie: null },
    };
    this.table = null;
    this.autoInit = false;
    this._initialized = false;
    this.FMT = new Intl.NumberFormat('vi-VN');
    this.CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js';
  }

  /**
   * Khởi tạo Module
   */
  init() {
    try {
      L._('🚀 Report Module Init...');
      if (typeof Chart === 'undefined') {
        const script = document.createElement('script');
        script.src = this.CHART_CDN;
        script.onload = () => this._renderUI();
        document.head.appendChild(script);
      } else {
        this._renderUI();
      }
      this._initialized = true;
    } catch (e) {
      Opps('Lỗi khởi tạo ReportModule: ' + e.message);
    }
  }

  /**
   * Render giao diện Dashboard
   */
  async _renderUI() {
    try {
      const modal = document.querySelector('at-modal-full');
      const resp = await fetch('/src/components/report_dashboard.html');
      if (!resp.ok) throw new Error('Không thể tải giao diện báo cáo');

      const htmlText = await resp.text();
      modal.render(htmlText, 'BÁO CÁO & THỐNG KÊ');
      modal.setFooter(false);

      // Set mặc định khoảng ngày: Tháng hiện tại
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

      setVal('rpt-date-to', formatDateISO(now));
      setVal('rpt-date-from', formatDateISO(firstDay));

      this.refreshData();
    } catch (e) {
      Opps(e.message, e);
    }
  }

  /**
   * Khởi tạo lại ATable instance để reset hoàn toàn state (Header, Cột, Phân trang)
   */
  _initTable(options = {}) {
    // Xóa nội dung cũ trong container
    const container = getE('rpt-table-container');
    if (container) container.innerHTML = '';

    // Khởi tạo instance mới
    this.table = new ATable('rpt-table-container', {
      pageSize: 50,
      header: false,
      footer: true,
      sorter: true,
      draggable: true,
      ...options,
    });
  }

  /**
   * Làm mới dữ liệu báo cáo
   */
  async refreshData() {
    try {
      showLoading(true);

      const reportType = getVal('rpt-type-select');
      const dFrom = getVal('rpt-date-from');
      const dTo = getVal('rpt-date-to');
      const dateType = getVal('rpt-date-type') || 'created_at';

      L._(`Processing Report: ${reportType} from ${dFrom} to ${dTo} by ${dateType}`);

      // 1. Truy vấn dữ liệu trực tiếp từ IndexedDB (Dexie)
      await this._fetchDataFromIDB(dFrom, dTo, reportType, dateType);

      // 2. Routing logic xử lý báo cáo
      this._routeReport(reportType);
    } catch (e) {
      console.error('Report Error:', e);
      Opps('Lỗi tải báo cáo: ' + e.message);
    } finally {
      showLoading(false);
    }
  }

  /**
   * Truy vấn dữ liệu từ IndexedDB
   */
  async _fetchDataFromIDB(dFrom, dTo, reportType, dateType = 'created_at') {
    const isErrorReport = ['ERROR_PAYMENT', 'ERROR_SYNC_SA', 'ERROR_BOOKING_DETAILS', 'ERROR_SYNC_SO', 'ERROR_CANCELLED_BOOKING'].includes(reportType);

    // Xác định field lọc cho Bookings
    let bkDateField = dateType; // Mặc định là created_at hoặc start_date từ UI
    if (dateType === 'start_date') {
      // Theo yêu cầu: Ngày Đi mặc định là check_in riêng với bookings thì ngày đi là field start_date
      // Tuy nhiên trong DB bookings thường dùng start_date, check_in thường dùng cho details/operators
      // Ở đây ta ưu tiên start_date cho bookings nếu chọn Ngày Đi
      bkDateField = 'start_date';
    }

    // Lấy Bookings
    let bkQuery = localDB.db.bookings;
    if (!isErrorReport && dFrom && dTo) {
      // Kiểm tra xem field có tồn tại trong index không, nếu không dùng created_at làm fallback
      const validBkFields = ['created_at', 'start_date', 'end_date'];
      const actualBkField = validBkFields.includes(bkDateField) ? bkDateField : 'created_at';

      this.state.data.bookings = await bkQuery
        .where(actualBkField)
        .between(dFrom, dTo + 'T23:59:59', true, true)
        .toArray();
    } else {
      this.state.data.bookings = await bkQuery.toArray();
    }

    const validBkIds = new Set(this.state.data.bookings.map((b) => b.id));

    // Xác định field lọc cho Transactions
    let txDateField = 'created_at';
    if (dateType === 'created_at') {
      txDateField = 'transaction_date'; // Theo yêu cầu: Ngày Tạo mặc định là created_at riêng với transactions thì là field transaction_date
    }

    // Lấy Details, Operators, Transactions (Lọc theo validBkIds để tối ưu)
    const [details, operators, transactions] = await Promise.all([
      localDB.db.booking_details
        .where('booking_id')
        .anyOf([...validBkIds])
        .toArray(),
      localDB.db.operator_entries
        .where('booking_id')
        .anyOf([...validBkIds])
        .toArray(),
      localDB.db.transactions.toArray(),
    ]);

    // Lọc transactions theo ngày nếu cần (vì transactions thường không có booking_id trực tiếp trong index để anyOf hiệu quả như details)
    let filteredTransactions = transactions;
    if (!isErrorReport && dFrom && dTo) {
      const actualTxField = txDateField === 'transaction_date' ? 'transaction_date' : 'created_at';
      filteredTransactions = transactions.filter((tx) => {
        const val = tx[actualTxField];
        return val >= dFrom && val <= dTo + 'T23:59:59';
      });
    }

    this.state.data.details = details;
    this.state.data.operators = operators;
    this.state.data.transactions = filteredTransactions;
  }

  /**
   * Điều hướng xử lý theo loại báo cáo
   */
  _routeReport(type) {
    switch (type) {
      case 'SALES_GENERAL':
        this._processSalesGeneral();
        break;
      case 'SALES_SERVICES':
        this._processSalesServices();
        break;
      case 'SALES_MATRIX_STAFF':
        this._processSalesMatrixStaff();
        break;
      case 'OP_GENERAL':
        this._processOperatorGeneral();
        break;
      case 'OP_DEBT_DETAIL':
        this._processOperatorDebtDetail();
        break;
      case 'FIN_GENERAL':
        this._processFinancialGeneral();
        break;
      case 'FIN_BY_TYPE':
        this._processFinancialByType();
        break;
      case 'ERROR_PAYMENT':
        this._processErrorPayment();
        break;
      case 'ERROR_SYNC_SA':
        this._processErrorSyncSalesAccounting();
        break;
      case 'ERROR_BOOKING_DETAILS':
        this._processErrorBookingDetails();
        break;
      case 'ERROR_SYNC_SO':
        this._processErrorSyncSalesOperator();
        break;
      case 'ERROR_CANCELLED_BOOKING':
        this._processErrorCancelledBooking();
        break;
      default:
        this._processSalesGeneral();
    }
  }

  // --- LOGIC XỬ LÝ CHI TIẾT ---

  _processSalesGeneral() {
    const data = this.state.data.bookings;
    const totalRev = data.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    const totalDebt = data.reduce((sum, r) => sum + (Number(r.balance_amount) || 0), 0);

    this._updateKPI('Doanh Thu', totalRev, '---', 'Phải Thu', totalDebt, '', 'Số Bookings', data.length, '', 'Đã Thu', totalRev - totalDebt, '');

    const revenueByDate = {};
    const dateType = getVal('rpt-date-type') || 'created_at';
    const dateField = dateType === 'start_date' ? 'start_date' : 'created_at';

    data.forEach((r) => {
      const d = (r[dateField] || '').split('T')[0];
      if (d) revenueByDate[d] = (revenueByDate[d] || 0) + (Number(r.total_amount) || 0);
    });

    this._renderLineChart(Object.keys(revenueByDate).sort(), Object.values(revenueByDate), 'Doanh thu ngày');

    // Render ATable
    if (!this.table) this._initTable({ colName: 'report_sales_general', header: true, data: data });
    else this.table.init(data, 'report_sales_general');
  }

  _processSalesServices() {
    const { details } = this.state.data;
    const serviceStats = {};

    details.forEach((d) => {
      let svName = d.service_type === 'Phòng' ? d.hotel_name || 'Khách sạn chưa tên' : d.service_name || 'DV Khác';
      if (!svName) svName = 'N/A';

      if (!serviceStats[svName]) serviceStats[svName] = { check_in: d.check_in, name: svName, qty: 0, amount: 0, count: 0, type: d.service_type };

      serviceStats[svName].count += 1;
      serviceStats[svName].qty += Number(d.quantity) || 0;
      serviceStats[svName].amount += Number(d.total) || 0;
    });

    const sorted = Object.values(serviceStats).sort((a, b) => b.amount - a.amount);

    const totalRev = sorted.reduce((sum, i) => sum + i.amount, 0);
    const totalQty = sorted.reduce((sum, i) => sum + i.qty, 0);
    this._updateKPI('Tổng Doanh Thu DV', totalRev, '', 'Tổng Số Lượng', totalQty, '', 'Số Dịch Vụ', sorted.length, '', '', '', '');

    const top10 = sorted.slice(0, 10);
    this._renderBarChart(
      top10.map((i) => i.name),
      top10.map((i) => i.amount),
      'Top 10 Dịch vụ (Doanh thu)'
    );

    // Render ATable
    if (!this.table) this._initTable({ colName: 'report_sales_services', header: true, data: sorted });
    else this.table.init(sorted, 'report_sales_services');
  }

  _processSalesMatrixStaff() {
    const { bookings, details } = this.state.data;
    const staffSet = new Set();
    const typeSet = new Set();
    const matrix = {};

    const bkStaffMap = {};
    bookings.forEach((b) => {
      if (b.staff_id) bkStaffMap[b.id] = b.staff_id;
    });

    let totalAmount = 0;
    details.forEach((d) => {
      const staff = bkStaffMap[d.booking_id] || 'N/A';
      const type = d.service_type || 'Other';

      staffSet.add(staff);
      typeSet.add(type);

      if (!matrix[staff]) matrix[staff] = {};
      matrix[staff][type] = (matrix[staff][type] || 0) + (Number(d.total) || 0);
      totalAmount += Number(d.total) || 0;
    });

    const sortedStaff = Array.from(staffSet).sort();
    const sortedTypes = Array.from(typeSet).sort();

    this._updateKPI('Số Nhân Viên', sortedStaff.length, '', 'Số Loại DV', sortedTypes.length, '', 'Tổng Doanh Thu', totalAmount, '', '', '', '');

    const typeTotal = {};
    details.forEach((d) => {
      const t = d.service_type || 'Other';
      typeTotal[t] = (typeTotal[t] || 0) + (Number(d.total) || 0);
    });
    this._renderPieChart(Object.keys(typeTotal), Object.values(typeTotal), 'Cơ cấu theo Loại DV');

    // Matrix report đặc thù, ATable tự nhận diện fields từ data
    const rows = sortedStaff.map((staff) => {
      let rowTotal = 0;
      const rowData = { 'Nhân Viên': staff };
      sortedTypes.forEach((type) => {
        const val = matrix[staff][type] || 0;
        rowTotal += val;
        rowData[type] = val;
      });
      rowData['TỔNG CỘNG'] = rowTotal;
      return rowData;
    });
    if (!this.table) this._initTable({ colName: '', header: true, data: rows });
    else this.table.init(rows);
  }

  _processOperatorGeneral() {
    const ops = this.state.data.operators;
    const totalCost = ops.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
    const totalPaid = ops.reduce((sum, r) => sum + (Number(r.paid_amount) || 0), 0);
    const totalDebt = ops.reduce((sum, r) => sum + (Number(r.debt_balance) || 0), 0);

    this._updateKPI('Tổng Giá Vốn', totalCost, '', 'Đã Thanh Toán', totalPaid, '', 'Công Nợ NCC', totalDebt, '', 'Số Dịch Vụ', ops.length, '');

    const bySupplier = {};
    ops.forEach((r) => {
      const s = r.supplier || 'N/A';
      bySupplier[s] = (bySupplier[s] || 0) + (Number(r.total_cost) || 0);
    });
    const sorted = Object.entries(bySupplier)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    this._renderBarChart(
      sorted.map((x) => x[0]),
      sorted.map((x) => x[1]),
      'Top NCC (Chi phí)'
    );

    // Sử dụng schema gốc operator_entries
    if (!this.table) this._initTable({ colName: 'operator_entries', header: true, data: ops });
    else this.table.init(ops, 'operator_entries');
  }

  _processOperatorDebtDetail() {
    const ops = this.state.data.operators;
    const totalDebt = ops.reduce((sum, r) => sum + (Number(r.debt_balance) || 0), 0);
    const totalPaid = ops.reduce((sum, r) => sum + (Number(r.paid_amount) || 0), 0);
    const totalCost = ops.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
    this._updateKPI('Tổng Giá Vốn', totalCost, '', 'Đã Thanh Toán', totalPaid, '', 'Công Nợ NCC', totalDebt, '', 'Số NCC', new Set(ops.map((o) => o.supplier)).size, '');

    const data = ops.map((op) => {
      const svName = op.service_type === 'Phòng' ? op.hotel_name || op.service_name : op.service_name;
      const debt = Number(op.debt_balance) || 0;
      return {
        ...op,
        service_display: `${svName} (${op.booking_id})`,
        debt_display: debt > 0 ? this.FMT.format(debt) : '0',
      };
    });
    if (!this.table) this._initTable({ colName: 'report_op_debt_detail', groupBy: true, groupByField: 'supplier', header: true, data: data });
    else this.table.init(data, 'report_op_debt_detail');
    this._initTable({ colName: 'report_op_debt_detail', groupBy: true, groupByField: 'supplier', header: true });
    this.table.init(data);
  }

  _processFinancialGeneral() {
    const { bookings: bks, operators: ops } = this.state.data;
    const costMap = {};
    ops.forEach((op) => (costMap[op.booking_id] = (costMap[op.booking_id] || 0) + (Number(op.total_cost) || 0)));

    const totalRev = bks.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
    const totalCost = Object.values(costMap).reduce((sum, v) => sum + v, 0);
    const profit = totalRev - totalCost;
    const margin = totalRev ? ((profit / totalRev) * 100).toFixed(1) : 0;

    this._updateKPI('Tổng Doanh Thu', totalRev, '', 'Tổng Chi Phí', totalCost, '', 'Lợi Nhuận Gộp', profit, `Margin: ${margin}%`, 'Số BK', bks.length, '');
    this._renderPieChart(['Lợi Nhuận', 'Chi Phí'], [profit, totalCost], 'Cơ cấu Lợi nhuận');

    const data = bks.map((r) => {
      const rev = Number(r.total_amount) || 0;
      const cost = costMap[r.id] || 0;
      const p = rev - cost;
      const m = rev ? ((p / rev) * 100).toFixed(1) : 0;
      return {
        id: r.id,
        created_at: r.created_at,
        start_date: r.start_date,
        rev,
        cost,
        profit: p,
        profit_display: `<span class="${p >= 0 ? 'text-success fw-bold' : 'text-danger'}">${this.FMT.format(p)}</span>`,
        margin: m + '%',
      };
    });
    if (!this.table) this._initTable({ colName: 'report_fin_general', header: true, data: data });
    else this.table.init(data, 'report_fin_general');
  }

  _processFinancialByType() {
    const { details, operators } = this.state.data;
    const stats = {};

    details.forEach((d) => {
      const type = d.service_type || 'Other';
      if (!stats[type]) stats[type] = { type, rev: 0, cost: 0 };
      stats[type].rev += Number(d.total) || 0;
    });

    const mappingKey = (bkId, svName) => `${bkId}_${svName}`;
    const serviceTypeMap = {};
    details.forEach((d) => {
      serviceTypeMap[mappingKey(d.booking_id, d.service_name)] = d.service_type;
      if (d.service_type === 'Phòng') serviceTypeMap[mappingKey(d.booking_id, d.hotel_name)] = 'Phòng';
    });

    operators.forEach((op) => {
      let type = serviceTypeMap[mappingKey(op.booking_id, op.service_name)];
      if (!type) type = 'Other';
      if (!stats[type]) stats[type] = { type, rev: 0, cost: 0 };
      stats[type].cost += Number(op.total_cost) || 0;
    });

    const sorted = Object.values(stats)
      .map((s) => {
        const p = s.rev - s.cost;
        const m = s.rev ? ((p / s.rev) * 100).toFixed(1) : 0;
        return {
          ...s,
          profit: p,
          // profit_display: `<span class="${p >= 0 ? 'text-success fw-bold' : 'text-danger'}">${this.FMT.format(p)}</span>`,
          margin: m + '%',
        };
      })
      .sort((a, b) => b.profit - a.profit);

    this._renderBarChart(
      sorted.map((s) => s.type),
      sorted.map((s) => s.profit),
      'Lợi nhuận theo Loại DV'
    );
    if (!this.table) this._initTable({ colName: '', header: true, data: sorted });
    else this.table.init(sorted);
  }

  // --- ERROR REPORTS ---

  _processErrorPayment() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overduePayments = this.state.data.bookings
      .filter((bk) => {
        const balance = Number(bk.balance_amount) || 0;
        const endDate = bk.end_date ? new Date(bk.end_date) : null;
        return balance > 0 && endDate && endDate < today;
      })
      .sort((a, b) => new Date(b.end_date) - new Date(a.end_date));

    const totalOverdue = overduePayments.reduce((sum, bk) => sum + (Number(bk.balance_amount) || 0), 0);
    this._updateKPI('Số BK Quá Hạn', overduePayments.length, '', 'Tổng Tiền Phải Thu', totalOverdue, '', 'BK Có Dữ Liệu', this.state.data.bookings.length, '', 'Avg Ngày Trễ', 0, 'ngày');

    const data = overduePayments.map((bk) => {
      const endDate = new Date(bk.end_date);
      const daysOver = Math.floor((today - endDate) / (86400 * 1000));
      return {
        id: bk.id,
        customer: bk.customer_full_name,
        end_date: bk.end_date,
        overdue: 'Có',
        days: daysOver + ' ngày',
        balance: bk.balance_amount,
        status: bk.status,
      };
    });
    if (!this.table) this._initTable({ colName: '', header: true, data: data });
    else this.table.init(data);
  }

  _processErrorSyncSalesAccounting() {
    const recentBookings = this.state.data.bookings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 1000);
    const transactions = this.state.data.transactions || [];
    const txMap = {};

    transactions.forEach((tx) => {
      if (tx.booking_id) {
        txMap[tx.booking_id] = (txMap[tx.booking_id] || 0) + (Number(tx.amount) || 0);
      }
    });

    const syncErrors = [];
    recentBookings.forEach((bk) => {
      const depositAmount = Number(bk.deposit_amount) || 0;
      const txAmount = (txMap[bk.id] || 0) / 1000;
      const diff = Math.abs(depositAmount - txAmount);
      if (diff > 0.01 && bk.status !== 'Hủy') {
        syncErrors.push({
          id: bk.id,
          customer: bk.customer_full_name,
          deposit: depositAmount,
          transaction: txAmount,
          diff,
          diff_display: `<span class="text-danger fw-bold">${this.FMT.format(diff)}</span>`,
          created: bk.created_at,
          staffId: bk.staff_id,
        });
      }
    });

    this._updateKPI(
      'Số BK Check',
      recentBookings.length,
      '',
      'Lỗi Sync',
      syncErrors.length,
      '',
      'Đúng',
      recentBookings.length - syncErrors.length,
      '',
      'Tổng Chênh Lệch',
      syncErrors.reduce((sum, e) => sum + e.diff, 0),
      'VND'
    );

    this.state.syncErrorsForFix = syncErrors;
    this._initTable({ colName: 'report_error_sync_sa', header: true });
    this.table.init(syncErrors.sort((a, b) => b.diff - a.diff));

    // Thêm nút Fix Data vào footer nếu có lỗi
    if (syncErrors.length > 0) {
      setTimeout(() => {
        const tfoot = document.querySelector(`#${this.table.containerId}-tfoot`);
        if (tfoot) {
          const fixRow = document.createElement('tr');
          fixRow.innerHTML = `<td colspan="100%" class="text-center p-2 bg-warning bg-opacity-10">
            <button class="btn btn-warning btn-sm admin-only" onclick="ReportModule.fixData()">
              <i class="fas fa-tools"></i> Sửa Lỗi Sync (${syncErrors.length})
            </button>
          </td>`;
          tfoot.appendChild(fixRow);
        }
      }, 100);
    }
  }

  _processErrorBookingDetails() {
    const { details, bookings } = this.state.data;
    const validBkIds = new Set(bookings.map((b) => b.id));

    const errors = details
      .filter((d) => !d.booking_id || !validBkIds.has(d.booking_id))
      .map((d) => ({
        ...d,
        error_type: !d.booking_id ? '<span class="badge bg-warning">Trống ID</span>' : '<span class="badge bg-danger">ID Không Tồn Tại</span>',
      }));

    this._updateKPI('Chi Tiết Lỗi', errors.length, '', 'ID Trống', errors.filter((d) => !d.booking_id).length, '', 'ID Không Tồn Tại', errors.filter((d) => d.booking_id && !validBkIds.has(d.booking_id)).length, '', 'Chi Tiết Đúng', details.length - errors.length, '');

    this._initTable({ colName: 'report_error_booking_details', header: true });
    this.table.init(errors);
  }

  _processErrorSyncSalesOperator() {
    const { details, operators } = this.state.data;
    const opByBookingService = {};
    operators.forEach((op) => {
      const key = `${op.booking_id}_${op.service_name || op.hotel_name || 'N/A'}`;
      opByBookingService[key] = true;
    });

    const errors = details
      .filter((d) => !opByBookingService[`${d.booking_id}_${d.service_name || d.hotel_name || 'N/A'}`])
      .map((d) => ({
        ...d,
        status_display: '<span class="badge bg-warning">Chưa O/E</span>',
      }));

    this._updateKPI('Chi Tiết Cần O/E', details.length, '', 'Chi Tiết Lỗi', errors.length, '', 'Đã O/E', details.length - errors.length, '', 'O/E Có', operators.length, '');

    this._initTable({ colName: 'report_error_sync_so', header: true });
    this.table.init(errors);
  }

  _processErrorCancelledBooking() {
    const cancelledErrors = this.state.data.bookings
      .filter((bk) => (bk.status || '').includes('Hủy') && (Number(bk.total_amount) || 0) > 0)
      .map((bk) => ({
        ...bk,
        status_display: '<span class="badge bg-danger">Hủy</span>',
      }));

    const totalAmountNotZeroed = cancelledErrors.reduce((sum, bk) => sum + (Number(bk.total_amount) || 0), 0);

    this._updateKPI('Booking Hủy Lỗi', cancelledErrors.length, '', 'Tổng Tiền Chưa Xóa', totalAmountNotZeroed, 'VND', 'BK Hủy Đúng', this.state.data.bookings.filter((bk) => (bk.status || '').includes('Hủy') && (Number(bk.total_amount) || 0) === 0).length, '', 'Tổng BK Hủy', this.state.data.bookings.filter((bk) => (bk.status || '').includes('Hủy')).length, '');

    this.state.syncErrorsForFix = cancelledErrors;
    this._initTable({ colName: 'report_error_cancelled_booking', header: true });
    this.table.init(cancelledErrors);

    if (cancelledErrors.length > 0) {
      setTimeout(() => {
        const tfoot = document.querySelector(`#${this.table.containerId}-tfoot`);
        if (tfoot) {
          const fixRow = document.createElement('tr');
          fixRow.innerHTML = `<td colspan="100%" class="text-center p-2 bg-danger bg-opacity-10">
            <button class="btn btn-danger btn-sm admin-only" onclick="ReportModule.fixData()">
              <i class="fas fa-tools"></i> Sửa Lỗi Booking Hủy (${cancelledErrors.length})
            </button>
          </td>`;
          tfoot.appendChild(fixRow);
        }
      }, 100);
    }
  }

  // --- HELPER UI ---

  _updateKPI(t1, v1, s1, t2, v2, s2, t3, v3, s3, t4, v4, s4) {
    const setTextKPI = (id, val, sub) => {
      const el = getE(id);
      if (el) el.innerText = typeof val === 'number' ? this.FMT.format(val) : val;
      const subEl = getE('kpi-sub-' + id.split('-')[1]);
      if (subEl) subEl.innerText = sub;
    };

    [1, 2, 3, 4].forEach((i) => {
      const titleEl = document.querySelector(`#kpi-${i}`)?.parentElement.querySelector('h6');
      if (titleEl) titleEl.innerText = '';
      setTextKPI(`kpi-${i}`, 0, '');
    });

    if (t1) {
      const title1 = document.querySelector('#kpi-1')?.parentElement.querySelector('h6');
      if (title1) title1.innerText = t1;
      setTextKPI('kpi-1', v1, s1);
    }
    if (t2) {
      const title2 = document.querySelector('#kpi-2')?.parentElement.querySelector('h6');
      if (title2) title2.innerText = t2;
      setTextKPI('kpi-2', v2, s2);
    }
    if (t3) {
      const title3 = document.querySelector('#kpi-3')?.parentElement.querySelector('h6');
      if (title3) title3.innerText = t3;
      setTextKPI('kpi-3', v3, s3);
    }
    if (t4) {
      const title4 = document.querySelector('#kpi-4')?.parentElement.querySelector('h6');
      if (title4) title4.innerText = t4;
      setTextKPI('kpi-4', v4, s4);
    }
  }

  _initChart(type, labels, data, label) {
    const key = type === 'doughnut' || type === 'pie' ? 'pie' : 'main';
    const canvasId = key === 'pie' ? 'rpt-chart-pie' : 'rpt-chart-main';

    if (this.state.charts[key]) {
      this.state.charts[key].destroy();
    }

    const ctx = getE(canvasId)?.getContext('2d');
    if (!ctx) return;

    this.state.charts[key] = new Chart(ctx, {
      type: type,
      data: {
        labels: labels,
        datasets: [
          {
            label: label,
            data: data,
            backgroundColor: type === 'line' ? 'rgba(54, 162, 235, 0.2)' : type === 'bar' ? 'rgba(255, 159, 64, 0.6)' : ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'],
            borderColor: type === 'line' ? 'rgba(54, 162, 235, 1)' : '#fff',
            borderWidth: 1,
            fill: type === 'line',
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  }

  _renderLineChart(labels, data, label) {
    this._initChart('line', labels, data, label);
  }
  _renderBarChart(labels, data, label) {
    this._initChart('bar', labels, data, label);
  }
  _renderPieChart(labels, data, label) {
    this._initChart('doughnut', labels, data, label);
  }

  // --- ACTIONS ---

  changeReportType() {
    this.refreshData();
  }

  setQuickDate() {
    const rangeVal = getVal('rpt-date-field');
    const range = getDateRange(rangeVal);
    if (range && range.start && range.end) {
      setVal('rpt-date-from', formatDateISO(range.start));
      setVal('rpt-date-to', formatDateISO(range.end));
    }
    this.refreshData();
  }

  filterTable(keyword) {
    if (this.table) this.table.filter(keyword);
  }

  toggleCharts() {
    const c = getE('rpt-chart-container');
    const i = getE('chart-toggle-icon');
    if (!c || !i) return;

    if (c.classList.contains('show')) {
      c.classList.remove('show');
      c.style.display = 'none';
      i.className = 'fas fa-chevron-down text-muted';
    } else {
      c.classList.add('show');
      c.style.display = 'block';
      i.className = 'fas fa-chevron-up text-muted';
    }
  }

  async fixData() {
    const reportType = getVal('rpt-type-select');
    try {
      showLoading(true);
      if (reportType === 'ERROR_SYNC_SA') {
        await this._fixErrorSyncSalesAccounting();
      } else if (reportType === 'ERROR_CANCELLED_BOOKING') {
        await this._fixErrorCancelledBooking();
      } else {
        logA(`Chức năng sửa dữ liệu chưa được triển khai cho báo cáo này: ${reportType}`, 'warning', 'alert');
      }
    } catch (e) {
      Opps('Lỗi khi sửa dữ liệu: ' + e.message);
    } finally {
      showLoading(false);
    }
  }

  async _fixErrorSyncSalesAccounting() {
    const syncErrors = this.state.syncErrorsForFix;
    if (!syncErrors.length) return Opps('Không có dữ liệu lỗi để sửa!');

    const confirmed = await showConfirm(`Sẽ tạo ${syncErrors.length} giao dịch mới. Tiếp tục?`);
    if (!confirmed) return;

    let successCount = 0;
    for (const err of syncErrors) {
      try {
        const transactionData = {
          type: 'IN',
          transaction_date: err.created,
          category: 'Tiền Tour/Combo',
          booking_id: err.id,
          amount: Math.round(err.diff * 1000),
          fund_accounts: 'cash',
          created_by: err.staffId || 'system',
          updated_at: new Date().toISOString(),
          status: 'completed',
          notes: `Auto fix sync booking ${err.id} - Diff: ${this.FMT.format(err.diff)}`,
        };
        await A.DB.saveRecord('transactions', transactionData);
        successCount++;
      } catch (e) {
        console.error(`Error fixing booking ${err.id}:`, e);
      }
    }
    logA(`✓ Đã tạo ${successCount}/${syncErrors.length} giao dịch mới.`, 'success');
    if (successCount > 0) setTimeout(() => this.refreshData(), 1500);
  }

  async _fixErrorSyncSalesOperator() {
    // Placeholder for future implementation
  }

  async _fixErrorCancelledBooking() {
    const errors = this.state.syncErrorsForFix;
    if (!errors.length) return Opps('Không có dữ liệu lỗi để sửa!');

    const confirmed = await showConfirm(`Sẽ cập nhật ${errors.length} booking bị hủy. Tiếp tục?`);
    if (!confirmed) return;

    let bookingUpdated = 0;
    const bookingIds = errors.map((e) => e.id);

    try {
      const result = await A.DB.batchUpdateFieldData('bookings', 'total_amount', errors[0].total_amount, 0, bookingIds, false);
      bookingUpdated = result.count;

      const relatedDetails = this.state.data.details.filter((d) => bookingIds.includes(d.booking_id));
      if (relatedDetails.length > 0) {
        await A.DB.batchUpdateFieldData(
          'booking_details',
          'total',
          relatedDetails[0].total,
          0,
          relatedDetails.map((d) => d.id),
          false
        );
      }
      logA(`✓ Đã cập nhật ${bookingUpdated} booking về 0.`, 'success');
      if (bookingUpdated > 0) setTimeout(() => this.refreshData(), 1500);
    } catch (e) {
      Opps('Lỗi fix booking hủy: ' + e.message);
    }
  }
}

// Singleton Instance
const reportModuleInstance = new ReportModule();

// Export cho global window (backward compatibility)
window.ReportModule = {
  init: () => reportModuleInstance.init(),
  refreshData: () => reportModuleInstance.refreshData(),
  changeReportType: (val) => reportModuleInstance.changeReportType(val),
  setQuickDate: () => reportModuleInstance.setQuickDate(),
  filterTable: (kw) => reportModuleInstance.filterTable(kw),
  toggleCharts: () => reportModuleInstance.toggleCharts(),
  fixData: () => reportModuleInstance.fixData(),
};

export default reportModuleInstance;
