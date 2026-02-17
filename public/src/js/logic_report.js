
/**
 * MODULE REPORT - 9 TRIP ERP
 * UPDATED: Multi-source Data, Matrix Reports, Financial Analysis
 */

window.ReportModule = (function() {
    // --- STATE ---
    let currentData = {
        bookings: [],
        details: [],     // New: booking_details
        operators: [],   // operator_entries
        tableExport: { headers: [], rows: [] }
    };
    let charts = { main: null, pie: null };

    // --- CONSTANTS ---
    const FMT = new Intl.NumberFormat('vi-VN');
    const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js';

    // =========================================================================
    // 1. INIT & SETUP
    // =========================================================================

    function init() {
        console.log("🚀 Report Module Init...");
        if (typeof Chart === 'undefined') {
            const script = document.createElement('script');
            script.src = CHART_CDN;
            script.onload = () => _renderUI();
            document.head.appendChild(script);
        } else {
            _renderUI();
        }
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
            // Lấy thêm booking_details để phục vụ báo cáo chi tiết
            const [bkRes, opRes, dtRes] = await Promise.all([
                A.DB.db.collection('bookings').get().then(snap => snap.docs.map(doc => doc.data())),
                A.DB.db.collection('operator_entries').get().then(snap => snap.docs.map(doc => doc.data())),
                A.DB.db.collection('booking_details').get().then(snap => snap.docs.map(doc => doc.data()))           
            ]);

            // --- 2. Filter Bookings by Date ---
            currentData.bookings = _filterByDate(bkRes, dateField, dFrom, dTo);
            
            // --- 3. Filter Related Data by Valid Booking IDs ---
            const validBkIds = new Set(currentData.bookings.map(b => b.id));
            
            currentData.operators = opRes.filter(op => validBkIds.has(op.booking_id));
            currentData.details = dtRes.filter(d => validBkIds.has(d.booking_id));

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
                
                default: _processSalesGeneral();
            }

        } catch (e) {
            console.error("Report Error:", e);
            alert("Lỗi tải báo cáo: " + e.message);
        } finally {
            showLoading(false);
        }
    }

    function _filterByDate(data, field, from, to) {
        return data.filter(item => {
            if (!item[field]) return false;
            const dStr = item[field].split('T')[0];
            return dStr >= from && dStr <= to;
        });
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
            r.id, r.created_at?.split('T')[0], r.customer_name, r.staff_id, 
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

    // =========================================================================
    // 4. HELPER UI & EXPORT (Updated for Global Func)
    // =========================================================================

    function _renderTable(headers, rows) {
        document.querySelector('#rpt-table thead').innerHTML = '<tr class="text-center table-secondary">' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
        document.querySelector('#rpt-table tbody').innerHTML = rows.map(row => '<tr>' + row.map(c => c === 'status' ? `<td><at-badge status="${c}">${c}</at-badge></td>` : `<td>${c}</td>`).join('') + '</tr>').join('');
        document.getElementById('rpt-row-count').innerText = rows.length;
    }

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

    // --- PUBLIC METHODS ---
    return {
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
        }
    };
})();