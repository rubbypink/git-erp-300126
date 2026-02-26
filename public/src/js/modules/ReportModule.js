
/**
 * MODULE REPORT - 9 TRIP ERP (ES6)
 * UPDATED: Multi-source Data, Matrix Reports, Financial Analysis
 * Format: ES6 Module
 */

// --- STATE ---
let currentData = {
    bookings: [],
    details: [],     // New: booking_details
    operators: [],   // operator_entries
    transactions: [], // New: transactions for sync checks
    tableExport: { headers: [], rows: [] },
    syncErrorsForFix: [] // Lưu lỗi để sửa
};
let charts = { main: null, pie: null };

// --- CONSTANTS ---
const FMT = new Intl.NumberFormat('vi-VN');
const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js';

// =========================================================================
// =========================================================================
// 1. INIT & SETUP
// =========================================================================


    function init() {
        if (ReportModule._initialized) {
            console.warn('[EventManager] Đã khởi tạo rồi, bỏ qua...');
            return;
        }
        console.log("🚀 Report Module Init...");
        if (typeof Chart === 'undefined') {
            const script = document.createElement('script');
            script.src = CHART_CDN;
            script.onload = () => _renderUI();
            document.head.appendChild(script);
        } else {
            _renderUI();
        }
        ReportModule._initialized = true;
    }

    async function _renderUI() {
        // 1. Load Template vào Modal
        const modal = document.querySelector('at-modal-full');
        const resp = await fetch('./src/components/report_dashboard.html');
        if (resp.ok) {
            const htmlText = await resp.text();
            modal.render(htmlText, 'BÁO CÁO & THỐNG KÊ');
            modal.setFooter(false); // Ẩn nút footer
        } else {
            alert("Không thể tải giao diện báo cáo: " + resp.statusText);
            return;
        }
        
        // Fix Date: Default to Current Month
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        
        document.getElementById('rpt-date-to').value = _fmtDateValue(now);
        document.getElementById('rpt-date-from').value = _fmtDateValue(firstDay);

        refreshData();
    }

    function _fmtDateValue(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // =========================================================================
    // 2. DATA FETCHING
    // =========================================================================

    async function refreshData() {
        try {
            showLoading(true);
            
            const dateField = document.getElementById('rpt-date-field').value;
            const dFrom = document.getElementById('rpt-date-from').value;
            const dTo = document.getElementById('rpt-date-to').value;
            const reportType = document.getElementById('rpt-type-select').value;

            // --- 1. Fetch All Collections Needed ---
            // Lấy thêm booking_details và transactions để phục vụ báo cáo chi tiết
            const [bkRes, opRes, dtRes, txRes] = await Promise.all([
                A.DB.db.collection('bookings').get().then(snap => snap.docs.map(doc => doc.data())),
                A.DB.db.collection('operator_entries').get().then(snap => snap.docs.map(doc => doc.data())),
                A.DB.db.collection('booking_details').get().then(snap => snap.docs.map(doc => doc.data())),
                A.DB.db.collection('transactions').get().then(snap => snap.docs.map(doc => doc.data())).catch(() => [])  // Fallback nếu không có collection
            ]);

            // --- 2. Filter Bookings by Date (Only for normal reports, not error reports) ---
            const isErrorReport = ['ERROR_PAYMENT', 'ERROR_SYNC_SA', 'ERROR_BOOKING_DETAILS', 'ERROR_SYNC_SO', 'ERROR_CANCELLED_BOOKING'].includes(reportType);
            if (!isErrorReport) {
                currentData.bookings = _filterByDate(bkRes, dateField, dFrom, dTo);
            } else {
                // Error reports: Use ALL bookings (no date filter)
                currentData.bookings = bkRes;
            }
            
            // --- 3. Filter Related Data by Valid Booking IDs ---
            const validBkIds = new Set(currentData.bookings.map(b => b.id));
            
            currentData.operators = opRes.filter(op => validBkIds.has(op.booking_id));
            currentData.details = dtRes.filter(d => validBkIds.has(d.booking_id));
            currentData.transactions = txRes; // Store all transactions for sync checks

            // --- 4. Routing Logic ---
            console.log(`Processing Report: ${reportType}`);
            switch (reportType) {
                // SALES
                case 'SALES_GENERAL': _processSalesGeneral(); break;
                case 'SALES_SERVICES': _processSalesServices(); break;
                case 'SALES_MATRIX_STAFF': _processSalesMatrixStaff(); break;
                
                // OPERATOR
                case 'OP_GENERAL': _processOperatorGeneral(); break;
                case 'OP_DEBT_DETAIL': _processOperatorDebtDetail(); break;
                
                // FINANCIAL
                case 'FIN_GENERAL': _processFinancialGeneral(); break;
                case 'FIN_BY_TYPE': _processFinancialByType(); break;
                
                // ERROR REPORTS - MANAGEMENT
                case 'ERROR_PAYMENT': _processErrorPayment(); break;
                case 'ERROR_SYNC_SA': _processErrorSyncSalesAccounting(); break;
                case 'ERROR_BOOKING_DETAILS': _processErrorBookingDetails(); break;
                case 'ERROR_SYNC_SO': _processErrorSyncSalesOperator(); break;
                case 'ERROR_CANCELLED_BOOKING': _processErrorCancelledBooking(); break;
                
                default: _processSalesGeneral();
            }

        } catch (e) {
            console.error("Report Error:", e);
            alert("Lỗi tải báo cáo: " + e.message);
        } finally {
            showLoading(false);
        }
    }

    /**
     * Bộ lọc ngày tháng với hỗ trợ đa format
     * Xử lý: ISO (2026-02-24T...), DD/MM/YYYY, Timestamp, Date object
     * 
     * @param {Array} data - Mảng dữ liệu cần lọc
     * @param {string} field - Tên field chứa date (default: 'created_at')
     * @param {string} from - Ngày bắt đầu YYYY-MM-DD (default: lấy từ DOM)
     * @param {string} to - Ngày kết thúc YYYY-MM-DD (default: lấy từ DOM)
     * @returns {Array} Dữ liệu đã lọc
     */
    function _filterByDate(data, field, from, to) {
        // Validate input
        if (!Array.isArray(data)) return data;
        
        // Get params from DOM if not provided
        if (!field) field = getVal('rpt-date-field') || 'created_at';
        if (!from) from = getVal('rpt-date-from') || '';
        if (!to) to = getVal('rpt-date-to') || '';
        if (!from && !to) return data;
        
        // Normalize from/to to YYYY-MM-DD format
        from = _normalizeDate(from);
        to = _normalizeDate(to);
        if (!from && !to) return data; // If both invalid, return all
        
        return data.filter(item => {
            if (!item || typeof item !== 'object') return false;
            if (!item[field]) return false;
            
            // Normalize item date to YYYY-MM-DD
            const itemDateStr = _normalizeDate(item[field]);
            if (!itemDateStr) return false;
            
            // Compare: Both from/to or only one
            if (from && to) {
                return itemDateStr >= from && itemDateStr <= to;
            } else if (from) {
                return itemDateStr >= from;
            } else if (to) {
                return itemDateStr <= to;
            }
            return true;
        });
    }
    
    /**
     * Helper: Chuyển đổi date sang format YYYY-MM-DD
     * Hỗ trợ: ISO, DD/MM/YYYY, Timestamp, Date object
     * 
     * @param {string|number|Date} dateVal - Giá trị ngày
     * @returns {string} YYYY-MM-DD hoặc '' nếu invalid
     */
    function _normalizeDate(dateVal) {
        if (!dateVal) return '';
        
        let dateObj = null;
        
        // Case 1: Đã là YYYY-MM-DD (hoặc YYYY-MM-DD T...)
        if (typeof dateVal === 'string') {
            dateVal = dateVal.trim();
            
            // Nếu là ISO format (YYYY-MM-DD T...), lấy phần trước T
            if (dateVal.includes('T')) {
                const isoDate = dateVal.split('T')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
                // Nếu không match, tiếp tục xử lý
                dateVal = isoDate;
            }
            
            // Nếu đã là YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
            
            // Case 2: DD/MM/YYYY format
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateVal)) {
                const [day, month, year] = dateVal.split('/');
                const d = String(day).padStart(2, '0');
                const m = String(month).padStart(2, '0');
                return `${year}-${m}-${d}`;
            }
            
            // Case 3: Thử parse thành Date object
            dateObj = new Date(dateVal);
        } 
        // Case 4: Timestamp (milliseconds - số lớn hoặc seconds)
        else if (typeof dateVal === 'number') {
            // 1000000000000 là khoảng năm 2001 (ms), 1000000000 là 2001 (s)
            const timeVal = dateVal > 1000000000000 ? dateVal : dateVal * 1000;
            dateObj = new Date(timeVal);
        }
        // Case 5: Date object
        else if (dateVal instanceof Date) {
            dateObj = dateVal;
        }
        
        // Convert Date to YYYY-MM-DD
        if (dateObj && !isNaN(dateObj.getTime())) {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
        
        return ''; // Invalid date
    }

    // =========================================================================
    // 3. LOGIC XỬ LÝ CHI TIẾT
    // =========================================================================

    // --- GROUP 1: SALES REPORTS ---

    function _processSalesGeneral() {
        // Logic cũ của Sales
        const data = currentData.bookings;
        const totalRev = data.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
        const totalDebt = data.reduce((sum, r) => sum + (Number(r.balance_amount) || 0), 0);
        
        _updateKPI('Doanh Thu', totalRev, '---', 'Phải Thu', totalDebt, '', 'Số Bookings', data.length, '', 'Đã Thu', totalRev - totalDebt, '');

        // Chart & Table (giữ nguyên logic cũ)
        const revenueByDate = {};
        data.forEach(r => {
            const d = (r.created_at || '').split('T')[0];
            revenueByDate[d] = (revenueByDate[d] || 0) + (Number(r.total_amount) || 0);
        });
        _renderLineChart(Object.keys(revenueByDate).sort(), Object.values(revenueByDate), 'Doanh thu ngày');

        const headers = ['Mã BK', 'Ngày', 'Khách Hàng', 'NV Sale', 'Doanh Thu', 'Còn Lại', 'Trạng Thái'];
        const rows = data.map(r => [
            r.id, r.created_at?.split('T')[0], r.customer_full_name, r.staff_id, 
            FMT.format(r.total_amount), 
            FMT.format(r.balance_amount),
            r.status
        ]);
        
        currentData.tableExport = { headers, rows };
        _renderTable(headers, rows); // Bản view đơn giản
    }

    function _processSalesServices() {
        // Báo cáo chi tiết theo từng dịch vụ (lấy từ booking_details)
        const details = currentData.details;
        const bookings = currentData.bookings;
        
        // Map booking info vào detail để hiển thị ngày/khách
        const bkMap = {};
        bookings.forEach(b => bkMap[b.id] = b);

        // Group by Service Name
        const serviceStats = {};

        details.forEach(d => {
            // Logic: Nếu là Hotel -> dùng hotel_name, khác -> dùng service_name
            let svName = d.service_type === 'Hotel' ? (d.hotel_name || 'Khách sạn chưa tên') : (d.service_name || 'DV Khác');
            if(!svName) svName = 'N/A';

            if (!serviceStats[svName]) serviceStats[svName] = { qty: 0, amount: 0, count: 0, type: d.service_type };
            
            serviceStats[svName].count += 1;
            serviceStats[svName].qty += (Number(d.quantity) || 0);
            serviceStats[svName].amount += (Number(d.total) || 0); // Sử dụng field tổng tiền của detail
        });

        // Convert to Array & Sort
        const sorted = Object.entries(serviceStats)
            .map(([name, stat]) => ({ name, ...stat }))
            .sort((a, b) => b.amount - a.amount);

        // KPIs
        const totalRev = sorted.reduce((sum, i) => sum + i.amount, 0);
        const totalQty = sorted.reduce((sum, i) => sum + i.qty, 0);
        _updateKPI('Tổng Doanh Thu DV', totalRev, '', 'Tổng Số Lượng', totalQty, '', 'Số Dịch Vụ', sorted.length, '', '', '', '');

        // Charts
        const top10 = sorted.slice(0, 10);
        _renderBarChart(top10.map(i => i.name), top10.map(i => i.amount), 'Top 10 Dịch vụ (Doanh thu)');

        // Table
        const headers = ['Tên Dịch Vụ / KS', 'Loại DV', 'Số Lần Bán', 'Tổng Số Lượng', 'Tổng Doanh Thu'];
        const rows = sorted.map(i => [
            i.name, i.type, i.count, FMT.format(i.qty), FMT.format(i.amount)
        ]);
        
        currentData.tableExport = { headers, rows };
        _renderTable(headers, rows);
    }

    function _processSalesMatrixStaff() {
        // Ma trận: Hàng = Nhân viên, Cột = Loại dịch vụ
        const bookings = currentData.bookings;
        const details = currentData.details;
        
        // 1. Xác định danh sách Nhân viên và Loại dịch vụ (Columns & Rows)
        const staffSet = new Set();
        const typeSet = new Set();
        const matrix = {}; // Key: staff_id, Value: { type: amount }

        // Map booking staff cho detail
        const bkStaffMap = {};
        bookings.forEach(b => {
            if(b.staff_id) bkStaffMap[b.id] = b.staff_id;
        });
        let totalAmount = 0;

        details.forEach(d => {
            const staff = bkStaffMap[d.booking_id] || 'N/A';
            const type = d.service_type || 'Other';
            
            staffSet.add(staff);
            typeSet.add(type);

            if (!matrix[staff]) matrix[staff] = {};
            matrix[staff][type] = (matrix[staff][type] || 0) + (Number(d.total) || 0);
            totalAmount += (Number(d.total) || 0);
        });

        const sortedStaff = Array.from(staffSet).sort();
        const sortedTypes = Array.from(typeSet).sort();

        // KPIs
        _updateKPI('Số Nhân Viên', sortedStaff.length, '', 'Số Loại DV', sortedTypes.length, '', 'Tổng Doanh Thu', totalAmount, '', '', '', '');
        
        // Chart: Stacked Bar Chart theo Staff
        // (Logic chart phức tạp hơn chút, tạm thời dùng pie cho tổng loại dv)
        const typeTotal = {};
        details.forEach(d => {
             const t = d.service_type || 'Other';
             typeTotal[t] = (typeTotal[t] || 0) + (Number(d.total) || 0);
        });
        _renderPieChart(Object.keys(typeTotal), Object.values(typeTotal), 'Cơ cấu theo Loại DV');


        // Table Matrix
        const headers = ['Nhân Viên', ...sortedTypes, 'TỔNG CỘNG'];
        const rows = sortedStaff.map(staff => {
            let rowTotal = 0;
            const rowData = [staff];
            
            sortedTypes.forEach(type => {
                const val = matrix[staff][type] || 0;
                rowTotal += val;
                rowData.push(val === 0 ? '-' : FMT.format(val));
            });
            
            rowData.push(FMT.format(rowTotal));
            return rowData;
        });

        currentData.tableExport = { headers, rows };
        _renderTable(headers, rows);
    }

    // --- GROUP 2: OPERATOR REPORTS ---

    function _processOperatorGeneral() {
        // Giống logic cũ
        _processOperatorBase(); 
    }

    function _processOperatorDebtDetail() {
        const ops = currentData.operators;
        
        // Group by Supplier + Service Name
        // Yêu cầu: Báo cáo công nợ chi tiết theo nhà cung cấp
        // Fields: NCC, Dịch vụ, Người lớn, Giá NL, Trẻ em, Giá TE, Phụ phí, Giảm giá, Tổng tiền, Đã trả, Còn nợ
        
        const headers = ['Nhà Cung Cấp', 'Dịch Vụ (Mã BK)', 'Ngày Đi', 'Người Lớn', 'Giá NL', 'Trẻ Em', 'Giá TE', 'Phụ Phí', 'Giảm Giá', 'Tổng Chi Phí', 'Đã TT', 'Công Nợ'];
        const rows = ops.map(op => {
            const debt = Number(op.debt_balance) || 0;
            // Nếu type = "Phòng" thì dùng hotel_name, ngược lại dùng service_name
            const svName = op.service_type === 'Phòng' ? (op.hotel_name || op.service_name) : op.service_name;
            return [
                op.supplier || 'N/A',
                `${svName} (${op.booking_id})`,
                op.check_in || '',
                op.adults || 0,
                FMT.format(op.cost_adult || 0),
                op.children || 0,
                FMT.format(op.cost_child || 0),
                FMT.format(op.surcharge || 0),
                FMT.format(op.discount || 0),
                FMT.format(op.total_cost),
                FMT.format(op.paid_amount),
                debt > 0 ? `<span class="text-danger fw-bold">${FMT.format(debt)}</span>` : 0
            ];
        });

        // Sort by Supplier
        rows.sort((a,b) => a[0].localeCompare(b[0]));
        
        // Calc Totals for KPI
        const totalDebt = ops.reduce((sum, r) => sum + (Number(r.debt_balance) || 0), 0);
        const totalPaid = ops.reduce((sum, r) => sum + (Number(r.paid_amount) || 0), 0);
        const totalCost = ops.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
        _updateKPI('Tổng Giá Vốn', totalCost, '', 'Đã Thanh Toán', totalPaid, '', 'Công Nợ NCC', totalDebt, '', 'Số NCC', new Set(ops.map(o=>o.supplier)).size, '');

        // Export data needs raw values (remove HTML spans)
        const exportRows = ops.map(op => {
            const svName = op.service_type === 'Phòng' ? (op.hotel_name || op.service_name) : op.service_name;
            return [
                op.supplier || 'N/A', 
                `${svName} (${op.booking_id})`, 
                op.check_in || '',
                op.adults || 0,
                op.cost_adult || 0,
                op.children || 0,
                op.cost_child || 0,
                op.surcharge || 0,
                op.discount || 0,
                op.total_cost, 
                op.paid_amount, 
                op.debt_balance
            ];
        });
        currentData.tableExport = { headers, rows: exportRows };

        _renderTable(headers, rows);
    }
    
    // Hàm base dùng chung cho Operator
    function _processOperatorBase() {
        const ops = currentData.operators;
        const totalCost = ops.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
        const totalPaid = ops.reduce((sum, r) => sum + (Number(r.paid_amount) || 0), 0);
        const totalDebt = ops.reduce((sum, r) => sum + (Number(r.debt_balance) || 0), 0);

        _updateKPI('Tổng Giá Vốn', totalCost, '', 'Đã Thanh Toán', totalPaid, '', 'Công Nợ NCC', totalDebt, '', 'Số Dịch Vụ', ops.length, '');

        const bySupplier = {};
        ops.forEach(r => {
            const s = r.supplier || 'N/A';
            bySupplier[s] = (bySupplier[s] || 0) + (Number(r.total_cost) || 0);
        });
        const sorted = Object.entries(bySupplier).sort((a,b) => b[1] - a[1]).slice(0, 10);
        _renderBarChart(sorted.map(x=>x[0]), sorted.map(x=>x[1]), 'Top NCC (Chi phí)');

        // Table Summary
        const headers = ['Mã BK', 'Dịch Vụ', 'Check-in', 'Tổng Gốc', 'Đã TT', 'Công Nợ', 'Nhà Cung Cấp'];
        const rows = ops.map(r => [
            r.booking_id, r.service_name, r.check_in,
            FMT.format(r.total_cost), FMT.format(r.paid_amount), FMT.format(r.debt_balance), r.supplier || 'N/A'
        ]);
        currentData.tableExport = { headers, rows };
        _renderTable(headers, rows);
    }


    // --- GROUP 3: FINANCIAL REPORTS ---

    function _processFinancialGeneral() {
        // Tương tự Accountant cũ
        const bks = currentData.bookings;
        const ops = currentData.operators;
        
        // Map Cost to Booking
        const costMap = {};
        ops.forEach(op => costMap[op.booking_id] = (costMap[op.booking_id] || 0) + (Number(op.total_cost) || 0));

        const totalRev = bks.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
        const totalCost = Object.values(costMap).reduce((sum, v) => sum + v, 0);
        const profit = totalRev - totalCost;
        const margin = totalRev ? ((profit / totalRev) * 100).toFixed(1) : 0;

        _updateKPI('Tổng Doanh Thu', totalRev, '', 'Tổng Chi Phí', totalCost, '', 'Lợi Nhuận Gộp', profit, `Margin: ${margin}%`, 'Số BK', bks.length, '');
        _renderPieChart(['Lợi Nhuận', 'Chi Phí'], [profit, totalCost], 'Cơ cấu Lợi nhuận');

        const headers = ['Mã BK', 'Ngày', 'Doanh Thu', 'Giá Vốn', 'Lợi Nhuận', '%'];
        const rows = bks.map(r => {
            const rev = Number(r.total_amount) || 0;
            const cost = costMap[r.id] || 0;
            const p = rev - cost;
            const m = rev ? ((p/rev)*100).toFixed(1) : 0;
            return [r.id, formatDateVN(r.created_at), FMT.format(rev), FMT.format(cost), FMT.format(p), m + '%'];
        });
        
        // Export raw
        currentData.tableExport = { headers, rows };
        
        // View colored
        const viewRows = rows.map(r => {
            const p = parseInt(r[4].replace(/\./g,''));
            return [r[0], r[1], r[2], r[3], `<span class="${p>=0?'text-success fw-bold':'text-danger'}">${r[4]}</span>`, r[5]];
        });
        _renderTable(headers, viewRows);
    }

    function _processFinancialByType() {
        // Báo cáo doanh thu, chi phí, lợi nhuận theo SERVICE TYPE
        // Đây là phần khó nhất vì operator_entries cần map với booking_details
        
        const details = currentData.details;
        const operators = currentData.operators;
        
        const stats = {}; // Key: Service Type

        // 1. Calc Revenue from Details
        details.forEach(d => {
            const type = d.service_type || 'Other';
            if (!stats[type]) stats[type] = { rev: 0, cost: 0 };
            stats[type].rev += (Number(d.total) || 0);
        });

        // 2. Calc Cost from Operators
        // Challenge: Operator entries thường không có field service_type trực tiếp.
        // Solution: Map qua service_name hoặc check logic. 
        // Giả định: Ta cần map operator về detail tương ứng. Nhưng 1 booking có nhiều detail.
        // Simple logic: Group operator theo 'service_name' rồi map tên đó thuộc type nào từ details?
        // Better logic: Nếu operator_entries không có service_type, ta sẽ lấy type của detail đầu tiên trong booking đó có cùng service_name.
        
        // Tạo map: BookingID + ServiceName -> Type
        const mappingKey = (bkId, svName) => `${bkId}_${svName}`;
        const serviceTypeMap = {};
        
        details.forEach(d => {
             serviceTypeMap[mappingKey(d.booking_id, d.service_name)] = d.service_type;
             // Fallback cho khách sạn (vì operator có thể lưu tên ks ở field supplier hoặc service_name)
             if(d.service_type === 'Phòng') serviceTypeMap[mappingKey(d.booking_id, d.hotel_name)] = 'Phòng';
        });

        operators.forEach(op => {
            // Cố gắng tìm type
            let type = serviceTypeMap[mappingKey(op.booking_id, op.service_name)];
            if (!type) type = 'Other'; // Hoặc 'Uncategorized'
            
            if (!stats[type]) stats[type] = { rev: 0, cost: 0 };
            stats[type].cost += (Number(op.total_cost) || 0);
        });

        const sorted = Object.entries(stats).map(([type, val]) => ({
            type, ...val, profit: val.rev - val.cost
        })).sort((a,b) => b.profit - a.profit);

        // Chart Profit by Type
        _renderBarChart(sorted.map(s=>s.type), sorted.map(s=>s.profit), 'Lợi nhuận theo Loại DV');

        const headers = ['Loại Dịch Vụ', 'Doanh Thu', 'Chi Phí (Giá Vốn)', 'Lợi Nhuận', '% Margin'];
        const rows = sorted.map(s => {
            const m = s.rev ? ((s.profit/s.rev)*100).toFixed(1) : 0;
            return [
                s.type, 
                FMT.format(s.rev), 
                FMT.format(s.cost), 
                FMT.format(s.profit),
                m + '%'
            ];
        });
        
        currentData.tableExport = { headers, rows };
        
        const viewRows = rows.map(r => {
             const p = parseInt(r[3].replace(/\./g,''));
             return [r[0], r[1], r[2], `<span class="${p>=0?'text-success fw-bold':'text-danger'}">${r[3]}</span>`, r[4]];
        });

        _renderTable(headers, viewRows);
    }

    // --- GROUP 4: ERROR REPORTS - MANAGEMENT ---

    /**
     * Báo cáo Lỗi Thanh Toán
     * Tìm danh sách booking có balance_amount > 0 và ngày về < hôm nay
     * Sắp xếp theo ngày về mới nhất lên trước
     */
    function _processErrorPayment() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        today.setDate(today.getDate()); // Ensure it's today at 00:00

        const overduePayments = currentData.bookings
            .filter(bk => {
                const balance = Number(bk.balance_amount) || 0;
                const endDate = bk.end_date ? new Date(bk.end_date) : null;
                return balance > 0 && endDate && endDate < today;
            })
            .sort((a, b) => new Date(b.end_date) - new Date(a.end_date)); // Mới nhất lên trước

        const totalOverdue = overduePayments.reduce((sum, bk) => sum + (Number(bk.balance_amount) || 0), 0);
        const daysOverdueSamples = overduePayments.slice(0, 5).map(bk => {
            const endDate = new Date(bk.end_date);
            const daysOver = Math.floor((today - endDate) / (86400 * 1000));
            return daysOver;
        });

        _updateKPI('Số BK Quá Hạn', overduePayments.length, '', 'Tổng Tiền Phải Thu', totalOverdue, '', 'BK Có Dữ Liệu', currentData.bookings.length, '', 'Avg Ngày Trễ', daysOverdueSamples.length > 0 ? Math.round(daysOverdueSamples.reduce((a, b) => a + b, 0) / daysOverdueSamples.length) : 0, 'ngày');

        const headers = ['Mã BK', 'Khách Hàng', 'Ngày Về', 'Đã Quá Hạn', 'Số Ngày', 'Tiền Còn Nợ', 'Trạng Thái'];
        const rows = overduePayments.map(bk => {
            const endDate = new Date(bk.end_date);
            const daysOver = Math.floor((today - endDate) / (86400 * 1000));
            return [
                bk.id,
                bk.customer_full_name || 'N/A',
                formatDateVN(bk.end_date),
                'Có',
                daysOver + ' ngày',
                FMT.format(Number(bk.balance_amount) || 0),
                bk.status || 'N/A'
            ];
        });

        currentData.tableExport = { headers, rows };
        _renderTable(headers, rows);
    }

    /**
     * Báo cáo Lỗi Sync Sales - Accounting
     * So sánh deposit_amount trong bookings và tổng amount từ transactions
     * Chỉ xử lý 1000 bookings gần nhất
     */
    function _processErrorSyncSalesAccounting() {
        // Lấy 1000 bookings gần nhất
        let recentBookings = currentData.bookings
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 1000);

        const transactions = currentData.transactions || [];
        const txMap = {}; // Key: booking_id, Value: sum amount

        transactions.forEach(tx => {
            if (tx.booking_id) {
                txMap[tx.booking_id] = (txMap[tx.booking_id] || 0) + (Number(tx.amount) || 0);
            }
        });

        const syncErrors = [];
        const syncOk = [];

        recentBookings.forEach(bk => {
            const depositAmount = Number(bk.deposit_amount) || 0;
            const txAmount = txMap[bk.id] /1000 || 0;
            const diff = Math.abs(depositAmount - txAmount);
            const isCanceled = bk.status === 'Hủy';

            if (diff > 0.01 && !isCanceled) { // Tolerance for rounding errors
                syncErrors.push({
                    id: bk.id,
                    customer: bk.customer_full_name,
                    deposit: depositAmount,
                    transaction: txAmount,
                    diff: diff,
                    created: bk.created_at,
                    staffId: bk.staff_id // Thêm staff_id để tạo transaction
                });
            } else {
                syncOk.push(bk.id);
            }
        });

        const errorRate = recentBookings.length > 0 ? ((syncErrors.length / recentBookings.length) * 100).toFixed(2) : 0;

        _updateKPI('Số BK Check', recentBookings.length, '', 'Lỗi Sync', syncErrors.length, `${errorRate}%`, 'Đúng', syncOk.length, '', 'Tổng Chênh Lệch', syncErrors.reduce((sum, e) => sum + e.diff, 0) || 0, 'VND');

        const headers = ['Mã BK', 'Khách Hàng', 'Booking Deposit', 'Transaction Total', 'Chênh Lệch', 'Ngày Tạo'];
        const rows = syncErrors
            .sort((a, b) => b.diff - a.diff)
            .map(err => [
                err.id,
                err.customer || 'N/A',
                FMT.format(err.deposit),
                FMT.format(err.transaction),
                `<span class="text-danger fw-bold">${FMT.format(err.diff)}</span>`,
                formatDateVN(err.created)
            ]);

        currentData.tableExport = { headers, rows: syncErrors.map(e => [e.id, e.customer, e.deposit, e.transaction, e.diff, e.created]) };
        _renderTable(headers, rows);
    }

    /**
     * Báo Cáo Lỗi Booking Details
     * Tìm các item trong booking_details có:
     * - booking_id rỗng hoặc
     * - booking_id không tồn tại trong bookings
     */
    function _processErrorBookingDetails() {
        const details = currentData.details;
        const validBkIds = new Set(currentData.bookings.map(b => b.id));

        const errors = details.filter(d => {
            const bkId = d.booking_id;
            return !bkId || !validBkIds.has(bkId);
        });

        const stats = {
            emptyBookingId: errors.filter(d => !d.booking_id || !d.booking_id.trim()).length,
            invalidBookingId: errors.filter(d => d.booking_id && d.booking_id.trim() && !validBkIds.has(d.booking_id)).length,
            totalDetails: details.length,
            validDetails: details.length - errors.length
        };

        _updateKPI('Chi Tiết Lỗi', errors.length, `${((errors.length / details.length) * 100).toFixed(2)}%`, 'ID Trống', stats.emptyBookingId, '', 'ID Không Tồn Tại', stats.invalidBookingId, '', 'Chi Tiết Đúng', stats.validDetails, '');

        const headers = ['Mã Detail', 'Booking ID', 'Dịch Vụ', 'Loại Lỗi', 'Số Tiền', 'Ngày Tạo'];
        const rows = errors.map(d => {
            let errorType = '';
            if (!d.booking_id || !d.booking_id.trim()) {
                errorType = '<span class="badge bg-warning">Trống ID</span>';
            } else if (!validBkIds.has(d.booking_id)) {
                errorType = '<span class="badge bg-danger">ID Không Tồn Tại</span>';
            }

            return [
                d.id || 'N/A',
                d.booking_id || '<span class="text-danger">---</span>',
                d.service_name || d.service_type || 'N/A',
                errorType,
                FMT.format(Number(d.total) || 0),
                formatDateVN(d.created_at),
            ];
        });

        currentData.tableExport = {
            headers,
            rows: errors.map(d => [d.id || 'N/A', d.booking_id || '', d.service_name || d.service_type || 'N/A', d.booking_id && validBkIds.has(d.booking_id) ? 'OK' : 'ERROR', Number(d.total) || 0, d.created_at])
        };
        _renderTable(headers, rows);
    }

    /**
     * Báo Cáo Lỗi Sync Sales - Operator
     * Tìm booking_details không có item tương ứng trong operator_entries
     * (So sánh id hoặc booking_id + service_name)
     */
    function _processErrorSyncSalesOperator() {
        const details = currentData.details;
        const operators = currentData.operators;

        // Tạo set operators theo ID để dễ lookup
        const opIds = new Set(operators.map(op => op.id));

        // Thay pháp: Cũng có thể group operators theo booking_id + service_name
        // để kiểm tra tương ứng
        const opByBookingService = {};
        operators.forEach(op => {
            const key = `${op.booking_id}_${op.service_name || op.hotel_name || 'N/A'}`;
            opByBookingService[key] = true;
        });

        const errors = details.filter(d => {
            // Method 1: Check by direct ID (nếu booking_details có field id matching operator_entries)
            if (opIds.has(d.id)) return false;

            // Method 2: Check by booking_id + service_name
            const key = `${d.booking_id}_${d.service_name || d.hotel_name || 'N/A'}`;
            return !opByBookingService[key];
        });

        const syncOk = details.length - errors.length;
        const syncRate = details.length > 0 ? ((syncOk / details.length) * 100).toFixed(2) : 0;

        _updateKPI('Chi Tiết Cần O/E', details.length, '', 'Chi Tiết Lỗi', errors.length, `${((errors.length / details.length) * 100).toFixed(2)}%`, 'Đã O/E', syncOk, `${syncRate}%`, 'O/E Có', operators.length, '');

        const headers = ['Mã Detail', 'Mã BK', 'Dịch Vụ', 'Khách Sạn', 'Ngày Nhập', 'Số Tiền', 'Trạng Thái'];
        const rows = errors.map(d => [
            d.id || 'N/A',
            d.booking_id || 'N/A',
            d.service_name || 'N/A',
            d.hotel_name || 'N/A',
            formatDateVN(d.created_at),
            FMT.format(Number(d.total) || 0),
            '<span class="badge bg-warning">Chưa O/E</span>'
        ]);

        currentData.tableExport = {
            headers,
            rows: errors.map(d => [d.id || 'N/A', d.booking_id || 'N/A', d.service_name || 'N/A', d.hotel_name || 'N/A', d.created_at, Number(d.total) || 0, 'Not Synced'])
        };
        _renderTable(headers, rows);
    }

    /**
     * Báo Cáo Lỗi: Booking Đã Hủy Nhưng Chưa Cập Nhật total_amount = 0
     * Tìm các booking có status="Hủy" và total_amount > 0
     */
    function _processErrorCancelledBooking() {
        const cancelledErrors = currentData.bookings.filter(bk => {
            const status = bk.status || '';
            const totalAmount = Number(bk.total_amount) || 0;
            return status.includes('Hủy') && totalAmount > 0;
        });

        const totalAmountNotZeroed = cancelledErrors.reduce((sum, bk) => sum + (Number(bk.total_amount) || 0), 0);

        _updateKPI('Booking Hủy Lỗi', cancelledErrors.length, '', 'Tổng Tiền Chưa Xóa', totalAmountNotZeroed, 'VND', 'BK Hủy Đúng', currentData.bookings.filter(bk => (bk.status || '').includes('Hủy') && (Number(bk.total_amount) || 0) === 0).length, '', 'Tổng BK Hủy', currentData.bookings.filter(bk => (bk.status || '').includes('Hủy')).length, '');

        const headers = ['Mã BK', 'Khách Hàng', 'Trạng Thái', 'Tổng Tiền', 'Ngày Hủy', 'Ghi Chú'];
        const rows = cancelledErrors
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .map(bk => [
                bk.id,
                bk.customer_full_name || 'N/A',
                '<span class="badge bg-danger">Hủy</span>',
                FMT.format(Number(bk.total_amount) || 0),
                formatDateVN(bk.updated_at || bk.created_at),
                bk.notes || 'N/A'
            ]);

        // Lưu dữ liệu lỗi để sửa
        currentData.syncErrorsForFix = cancelledErrors.map(bk => ({
            id: bk.id,
            customer: bk.customer_full_name,
            total_amount: Number(bk.total_amount) || 0,
            status: bk.status,
            created: bk.created_at,
            updated: bk.updated_at,
            staffId: bk.staff_id
        }));

        currentData.tableExport = {
            headers,
            rows: cancelledErrors.map(bk => [bk.id, bk.customer_full_name || 'N/A', 'Hủy', Number(bk.total_amount) || 0, bk.updated_at || bk.created_at, bk.notes || ''])
        };
        _renderTable(headers, rows);
    }



    // =========================================================================
    // 4. HELPER UI & EXPORT (Updated for Global Func)
    // =========================================================================

function _renderTable(headers, rows) {
    document.querySelector('#rpt-table thead').innerHTML = '<tr class="text-center table-secondary">' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    document.querySelector('#rpt-table tbody').innerHTML = rows.map(row => '<tr>' + row.map(c => c === 'status' ? `<td><at-status status="${c}">${c}</at-status></td>` : `<td>${c}</td>`).join('') + '</tr>').join('');
    document.getElementById('rpt-row-count').innerText = rows.length;
    
    // Thêm nút "Sửa Lỗi" vào tfoot nếu có dữ liệu lỗi
    const tfoot = document.querySelector('#rpt-table tfoot') || document.createElement('tfoot');
    const reportType = document.getElementById('rpt-type-select').value;
    const isErrorReport = ['ERROR_PAYMENT', 'ERROR_SYNC_SA', 'ERROR_BOOKING_DETAILS', 'ERROR_SYNC_SO', 'ERROR_CANCELLED_BOOKING'].includes(reportType);
    
    if (isErrorReport && rows.length > 0) {
        const btnHtml = `<tr class="table-info"><td colspan="${headers.length}" class="text-center p-2">
            <button class="btn btn-warning btn-sm admin-only" onclick="ReportModule.fixData()">
                <i class="fas fa-tools"></i> Sửa Lỗi (${rows.length})
            </button>
        </td></tr>`;
        tfoot.innerHTML = btnHtml;
        if (!document.querySelector('#rpt-table tfoot')) {
            document.querySelector('#rpt-table').appendChild(tfoot);
        }
    } else {
        if (tfoot.parentNode) tfoot.remove();
    }
}

/**
 * Sửa dữ liệu lỗi dựa trên loại báo cáo hiện tại
 */
async function fixData() {
    const reportType = document.getElementById('rpt-type-select').value;
    
    try {
        showLoading(true);
        
        if (reportType === 'ERROR_SYNC_SA') {
            await _fixErrorSyncSalesAccounting();
        } else if (reportType === 'ERROR_CANCELLED_BOOKING') {
            await _fixErrorCancelledBooking();
        } else {
            alert(`Chức năng sửa dữ liệu chưa được triển khai cho báo cáo này: ${reportType}`);
        }
        
    } catch (e) {
        console.error('Fix Error:', e);
        alert('Lỗi khi sửa dữ liệu: ' + e.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Sửa lỗi Sync Sales - Accounting
 * Tạo transactions mới cho các booking có chênh lệch
 */
async function _fixErrorSyncSalesAccounting() {
    const syncErrors = currentData.syncErrorsForFix;
    
    if (!syncErrors || syncErrors.length === 0) {
        alert('Không có dữ liệu lỗi để sửa. Vui lòng tạo lại báo cáo!');
        return;
    }
    
    const confirmed = confirm(`Sẽ tạo ${syncErrors.length} giao dịch mới. Tiếp tục?`);
    if (!confirmed) return;
    
    let successCount = 0;
    const errors = [];
    
    for (const syncErr of syncErrors) {
        try {
            // Tính toán diff từ lỗi sync
            const diff = syncErr.diff;
            
            const transactionData = {
                type: 'IN',
                transaction_date: syncErr.created,
                category: 'Tiền Tour/Combo',
                booking_id: syncErr.id,
                amount: Math.round(diff * 1000), // Chênh lệch * 1000
                fund_accounts: 'cash',
                created_by: syncErr.staffId || 'system',
                updated_at: new Date().toISOString(),
                status: 'completed',
                notes: `Auto fix sync booking ${syncErr.id} - Diff: ${FMT.format(diff)}`
            };
            
            // Lưu transaction vào Firestore
            if (typeof A !== 'undefined' && A.DB && A.DB.db) {
                // ✅ Tạo ID trước, route qua DBManager để đồng bộ notification
                transactionData.id = A.DB.db.collection('transactions').doc().id;
                await A.DB.saveRecord('transactions', transactionData);
                successCount++;
                console.log(`✓ Created transaction ${transactionData.id} for booking ${syncErr.id}`);
            } else {
                throw new Error('Firestore chưa khởi tạo');
            }
        } catch (e) {
            console.error(`✗ Error fixing booking ${syncErr.id}:`, e);
            errors.push(`${syncErr.id}: ${e.message}`);
        }
    }
    
    // Hiển thị kết quả
    let message = `✓ Đã tạo ${successCount}/${syncErrors.length} giao dịch mới.`;
    if (errors.length > 0) {
        message += `\n\n❌ Lỗi (${errors.length}):\n` + errors.join('\n');
    }
    
    alert(message);
    
    // Làm mới báo cáo
    if (successCount > 0) {
        setTimeout(() => refreshData(), 1500);
    }
}

/**
 * Sửa lỗi Booking Đã Hủy
 * Cập nhật total_amount = 0 cho các booking có status="Hủy" nhưng vẫn có total_amount > 0
 * Đồng thời cập nhật total = 0 cho các booking_details liên quan
 */
async function _fixErrorCancelledBooking() {
    const errors = currentData.syncErrorsForFix;
    
    if (!errors || errors.length === 0) {
        alert('Không có dữ liệu lỗi để sửa. Vui lòng tạo lại báo cáo!');
        return;
    }
    
    const confirmed = confirm(`Sẽ cập nhật ${errors.length} booking bị hủy và các booking_details liên quan. Tiếp tục?`);
    if (!confirmed) return;
    
    let bookingUpdated = 0;
    let detailsUpdated = 0;
    const errorLog = [];
    
    try {
        showLoading(true);
        
        // 1. Chuẩn bị danh sách booking IDs cần sửa
        const bookingIds = errors.map(e => e.id);
        const oldAmount = errors.length > 0 ? errors[0].total_amount : 0; // Lấy giá trị cũ từ record đầu tiên
        
        // 2. Cập nhật total_amount = 0 cho các booking bị hủy (chỉ những cái trong danh sách)
        try {
            if (typeof A !== 'undefined' && A.DB && A.DB.batchUpdateFieldData) {
                // Gọi batchUpdateFieldData với tham số ids để chỉ xử lý những booking trong danh sách lỗi
                const result = await A.DB.batchUpdateFieldData('bookings', 'total_amount', oldAmount, 0, bookingIds, false);
                bookingUpdated = result.count;
                console.log(`✓ Updated ${bookingUpdated} bookings: total_amount → 0`);
            } else {
                throw new Error('hàm batchUpdateFieldData chưa khởi tạo');
            }
        } catch (e) {
            console.error(`✗ Error updating bookings:`, e);
            errorLog.push(`bookings: ${e.message}`);
        }
        
        // 3. Cật nhật booking_details liên quan
        try {
            const relatedDetails = currentData.details.filter(d => bookingIds.includes(d.booking_id));
            
            if (relatedDetails.length > 0 && typeof A !== 'undefined' && A.DB && A.DB.batchUpdateFieldData) {
                // Lấy danh sách detail IDs cần sửa
                const detailIds = relatedDetails.map(d => d.id);
                const oldDetailTotal = relatedDetails.length > 0 ? relatedDetails[0].total : 0;
                
                // Gọi batchUpdateFieldData với detail IDs
                const result = await A.DB.batchUpdateFieldData('booking_details', 'total', oldDetailTotal, 0, detailIds, false);
                detailsUpdated = result.count;
                console.log(`✓ Updated ${detailsUpdated} booking_details: total → 0`);
            }
        } catch (e) {
            console.error('Error updating booking_details:', e);
            errorLog.push(`booking_details: ${e.message}`);
        }
        
        // 4. Hiển thị kết quả
        let message = `✓ Đã cập nhật:\n`;
        message += `  • ${bookingUpdated} booking: total_amount → 0\n`;
        message += `  • ${detailsUpdated} booking_details: total → 0`;
        
        if (errorLog.length > 0) {
            message += `\n\n⚠️ Lỗi (${errorLog.length}):\n` + errorLog.join('\n');
        }
        
        alert(message);
        
        // Làm mới báo cáo sau 1.5 giây
        if (bookingUpdated > 0 || detailsUpdated > 0) {
            setTimeout(() => refreshData(), 1500);
        }
        
    } catch (e) {
        console.error('Fatal error in _fixErrorCancelledBooking:', e);
        alert('Lỗi nghiêm trọng: ' + e.message);
    } finally {
        showLoading(false);
    }
}

// async function rollBackCollection(collectionName, fieldName) {
//     /**
//      * Khôi phục collection từ backup array (APP_DATA) - Đơn giản & an toàn
//      * Duyệt backup array, batch update trực tiếp lên Firestore
//      * 
//      * @param {string} collectionName - 'bookings' hoặc 'booking_details'
//      * @param {string} fieldName - 'total_amount' hoặc 'total'
//      */
    
//     try {
//         showLoading(true);
        
//         // 1. Xác định field index
//         let backupData = [];
//         let fieldIndex = -1;
        
//         if (collectionName === 'bookings') {
//             backupData = window.Object.values(APP_DATA.bookings) || [];
//             fieldIndex = 8; // total_amount luôn ở index 8
//         } else if (collectionName === 'booking_details') {
//             backupData = window.Object.values(APP_DATA.booking_details) || [];
//             fieldIndex = 14; // total luôn ở index 14
//         } else {
//             throw new Error(`Collection "${collectionName}" không được hỗ trợ`);
//         }
        
//         if (!backupData.length) {
//             throw new Error(`Không có dữ liệu backup cho ${collectionName}`);
//         }
        
//         // 2. Validate Firestore
//         if (!A.DB || !A.DB.db) {
//             throw new Error('Firestore chưa khởi tạo');
//         }
        
//         const db = A.DB.db;
        
//         console.log(`🔄 Bắt đầu roll back ${collectionName} - ${backupData.length} records`);
        
//         // 3. Duyệt backup array và batch update
//         let batch = db.batch();
//         let updateCount = 0;
//         let errorCount = 0;
//         const errors = [];
        
//         for (let i = 0; i < backupData.length; i++) {
//             const record = backupData[i];
            
//             // Validate record
//             if (!Array.isArray(record) || !record[0]) {
//                 continue; // Skip nếu không hợp lệ
//             }
            
//             const docId = String(record[0]).trim(); // Đảm bảo string
//             const backupValue = record[fieldIndex];
            
//             // Chỉ update nếu có giá trị hợp lệ
//             if (!docId || backupValue === null || backupValue === undefined) {
//                 continue;
//             }
            
//             try {
//                 // Tạo docRef và update trực tiếp trong loop
//                 const docRef = db.collection(collectionName).doc(docId);
                
//                 batch.update(docRef, {
//                     [fieldName]: backupValue,
//                     updated_at: new Date().toISOString(),
//                     updated_by: window.CURRENT_USER?.name || 'Rollback System'
//                 });
                
//                 updateCount++;
                
//                 // Commit batch khi đạt 490 updates
//                 if (updateCount >= 490) {
//                     await batch.commit();
//                     console.log(`✓ Batch committed: ${updateCount} updates`);
//                     batch = db.batch();
//                     updateCount = 0;
//                 }
                
//             } catch (e) {
//                 console.error(`⚠️ Error preparing ${docId}:`, e.message);
//                 errors.push(`${docId}: ${e.message}`);
//                 errorCount++;
//             }
//         }
        
//         // 4. Final commit
//         if (updateCount > 0) {
//             await batch.commit();
//             console.log(`✓ Final batch: ${updateCount} updates`);
//         }
        
//         // 5. Kết quả
//         const totalProcessed = updateCount + (updateCount > 0 ? 0 : errorCount);
//         let message = `✓ ROLLBACK ${collectionName} hoàn tất:\n`;
//         message += `  • Field: ${fieldName}\n`;
//         message += `  • Cập nhật: ${updateCount + errorCount - errorCount} records\n`;
        
//         if (errors.length > 0) {
//             message += `  • Lỗi: ${errors.length}\n\n`;
//             message += errors.slice(0, 5).join('\n');
//             if (errors.length > 5) {
//                 message += `\n... và ${errors.length - 5} lỗi khác`;
//             }
//         }
        
//         alert(message);
        
//         // Làm mới dữ liệu
//         setTimeout(() => refreshData(), 1500);
        
//     } catch (e) {
//         console.error('Fatal error in rollBackCollection:', e);
//         alert('❌ Lỗi: ' + e.message);
//     } finally {
//         showLoading(false);
//     }
// }

// // Export
// window.rollBackCollection = rollBackCollection;




function _updateKPI(t1, v1, s1, t2, v2, s2, t3, v3, s3, t4, v4, s4) {
        const setText = (id, val, sub) => {
             document.getElementById(id).innerText = (typeof val === 'number') ? FMT.format(val) : val;
             document.getElementById('kpi-sub-' + id.split('-')[1]).innerText = sub;
        };
        // Reset nội dung trước khi set để tránh hiện tượng cũ
        [1,2,3,4].forEach(i => { document.querySelector(`#kpi-${i}`).parentElement.querySelector('h6').innerText = ''; setText(`kpi-${i}`, 0, ''); });

        if(t1) { document.querySelector('#kpi-1').parentElement.querySelector('h6').innerText = t1; setText('kpi-1', v1, s1); }
        if(t2) { document.querySelector('#kpi-2').parentElement.querySelector('h6').innerText = t2; setText('kpi-2', v2, s2); }
        if(t3) { document.querySelector('#kpi-3').parentElement.querySelector('h6').innerText = t3; setText('kpi-3', v3, s3); }
        if(t4) { document.querySelector('#kpi-4').parentElement.querySelector('h6').innerText = t4; setText('kpi-4', v4, s4); }
    }
    
    // --- Chart Wrappers (Giữ nguyên như cũ) ---
    function _renderLineChart(labels, data, label) { _initChart('line', labels, data, label); }
    function _renderBarChart(labels, data, label) { _initChart('bar', labels, data, label); }
    function _renderPieChart(labels, data, label) { _initChart('doughnut', labels, data, label); }
    
function _initChart(type, labels, data, label) {
        const key = (type === 'doughnut' || type === 'pie') ? 'pie' : 'main';
        const canvasId = key === 'pie' ? 'rpt-chart-pie' : 'rpt-chart-main';
        
        if (charts[key]) { charts[key].destroy(); charts[key] = null; }
        
        const ctx = document.getElementById(canvasId).getContext('2d');
        const config = {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label, data: data,
                    backgroundColor: type === 'line' ? 'rgba(54, 162, 235, 0.2)' : (type==='bar'?'rgba(255, 159, 64, 0.6)': ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0']),
                    borderColor: type === 'line' ? 'rgba(54, 162, 235, 1)' : '#fff',
                    borderWidth: 1, fill: type === 'line'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        };
    charts[key] = new Chart(ctx, config);
}

// =========================================================================
// EXPORTS - ES6 Module
// =========================================================================

const ReportModule = {
        _initialized: false,
        init: init,
        refreshData: refreshData,
        changeReportType: () => refreshData(),
        
        filterTable: (keyword) => {
            const term = keyword.toLowerCase();
            document.querySelectorAll('#rpt-table tbody tr').forEach(r => {
                r.style.display = r.innerText.toLowerCase().includes(term) ? '' : 'none';
            });
        },
        toggleCharts: () => {
            const c = document.getElementById('rpt-chart-container');
            const i = document.getElementById('chart-toggle-icon');
            if(c.classList.contains('show')) { c.classList.remove('show'); c.style.display='none'; i.className='fas fa-chevron-down text-muted'; }
            else { c.classList.add('show'); c.style.display='block'; i.className='fas fa-chevron-up text-muted'; }
        },
        setQuickDate: (type) => {
            const now = new Date();
            let f, t;
            if(type==='last_month') { f=new Date(now.getFullYear(), now.getMonth()-1, 1); t=new Date(now.getFullYear(), now.getMonth(), 0); }
            else { f=new Date(now.getFullYear(), 0, 1); t=new Date(now.getFullYear(), 11, 31); }
            document.getElementById('rpt-date-from').value=_fmtDateValue(f); document.getElementById('rpt-date-to').value=_fmtDateValue(t);
            refreshData();
        },
        
        // Export đã chỉnh sửa khớp với Global Function của bạn
        exportData: (type) => {
            const { headers, rows } = currentData.tableExport;
            if (!rows || !rows.length) return alert("Không có dữ liệu!");
            
            const sel = document.getElementById('rpt-type-select');
            const rptName = sel.options[sel.selectedIndex].text.trim();
            const dRange = `${document.getElementById('rpt-date-from').value}_${document.getElementById('rpt-date-to').value}`;
            
            // Map Array Array -> Array Objects
            const dataForUtils = rows.map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    let val = row[i];
                    // Clean HTML
                    if (typeof val === 'string' && val.includes('<')) {
                        const div = document.createElement('div'); div.innerHTML = val; val = div.innerText;
                    }
                    obj[h] = val;
                });
                return obj;
            });
            
            if (typeof downloadTableData === 'function') {
                downloadTableData(dataForUtils, type, `Report_${dRange}`, `${rptName} (${dRange})`);
            } else {
                alert("Lỗi: Không tìm thấy hàm downloadTableData");
            }
        },
        fixData: fixData
    };

// Export cho global window (backward compatibility) và ES6
window.ReportModule = ReportModule;
export default ReportModule;