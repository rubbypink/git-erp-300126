/**
 * PnLReport.js - Profit & Loss Report for Accountant Module
 * Calculates revenue vs cost per booking using ATable
 */

export class PnLReport {
    constructor(accountantCtrl) {
        this.ctrl = accountantCtrl;
        this.table = null;
        this.currentFilter = 'all';
        this.allData = [];
    }

    async show() {
        try {
            // Load data from APP_DATA via controller
            const bookings = await this.ctrl.getData('bookings');
            const operators = await this.ctrl.getData('operator_entries');

            // Calculate P&L per booking
            this.allData = this.calculatePnL(bookings, operators);

            // Render modal
            const html = this.renderTemplate();
            A.Modal.render(html, 'Báo Cáo P&L');
            A.Modal.show();

            // Bind filter buttons
            this._bindFilterEvents();

            // Initialize ATable
            this._initTable(this.allData);

            // Render totals
            this.renderTotals(this.allData);
        } catch (error) {
            console.error('PnL Report Error:', error);
            Opps('Lỗi tải báo cáo P&L: ' + error.message);
        }
    }

    calculatePnL(bookings, operators) {
        // Group operator entries by booking_id and sum total_cost
        const costMap = {};
        for (const op of operators) {
            const bkId = op.booking_id;
            if (!bkId) continue;
            if (!costMap[bkId]) costMap[bkId] = 0;
            costMap[bkId] += parseFloat(op.total_cost || 0);
        }

        // Calculate P&L for each booking
        const result = [];
        for (const bk of bookings) {
            const revenue = parseFloat(bk.total_amount || 0);
            if (revenue <= 0) continue; // Skip bookings without revenue

            const cost = costMap[bk.id] || 0;
            const profit = revenue - cost;
            const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

            result.push({
                booking_id: bk.id,
                customer_name: bk.customer_full_name || '-',
                start_date: bk.start_date || '',
                revenue: revenue,
                cost: cost,
                profit: profit,
                margin: parseFloat(margin),
            });
        }

        // Sort by start_date descending (newest first)
        return result.sort((a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0));
    }

    renderTemplate() {
        return `
            <div id="pnl-report-container" style="max-height: calc(100vh - 250px); overflow-y: auto;">
                <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div class="btn-group" role="group" id="pnl-filter-group">
                        <button class="btn btn-sm btn-outline-primary active" data-filter="all">Tất cả</button>
                        <button class="btn btn-sm btn-outline-success" data-filter="profitable">Có lãi</button>
                        <button class="btn btn-sm btn-outline-danger" data-filter="loss">Lỗ</button>
                    </div>
                    <div id="pnl-totals" class="text-end small"></div>
                </div>
                <div id="pnl-table-container"></div>
            </div>
        `;
    }

    _bindFilterEvents() {
        const group = document.getElementById('pnl-filter-group');
        if (!group) return;

        group.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-filter]');
            if (!btn) return;

            // Update active state
            group.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            this.currentFilter = filter;

            let filtered = this.allData;
            if (filter === 'profitable') {
                filtered = this.allData.filter((item) => item.profit > 0);
            } else if (filter === 'loss') {
                filtered = this.allData.filter((item) => item.profit < 0);
            }

            if (this.table) {
                this.table.updateData(filtered);
            }
            this.renderTotals(filtered);
        });
    }

    _initTable(data) {
        const container = document.getElementById('pnl-table-container');
        if (!container) return;

        this.table = new ATable('pnl-table-container', {
            columns: [
                { field: 'booking_id', header: 'Mã BK', width: '90px', sortable: true },
                { field: 'customer_name', header: 'Khách Hàng', minWidth: '150px', sortable: true },
                {
                    field: 'start_date',
                    header: 'Ngày Đi',
                    width: '100px',
                    sortable: true,
                    renderer: (v) => (v ? v.substring(0, 10) : '-'),
                },
                {
                    field: 'revenue',
                    header: 'Doanh Thu',
                    width: '130px',
                    align: 'right',
                    sortable: true,
                    renderer: (v) => `<span class="text-success fw-semibold">${formatMoney(v)}</span>`,
                },
                {
                    field: 'cost',
                    header: 'Giá Vốn',
                    width: '130px',
                    align: 'right',
                    sortable: true,
                    renderer: (v) => `<span class="text-danger fw-semibold">${formatMoney(v)}</span>`,
                },
                {
                    field: 'profit',
                    header: 'Lợi Nhuận',
                    width: '130px',
                    align: 'right',
                    sortable: true,
                    renderer: (v) => {
                        const color = v >= 0 ? 'text-success' : 'text-danger';
                        const sign = v >= 0 ? '+' : '';
                        return `<span class="fw-bold ${color}">${sign}${formatMoney(v)}</span>`;
                    },
                },
                {
                    field: 'margin',
                    header: '% Margin',
                    width: '90px',
                    align: 'right',
                    sortable: true,
                    renderer: (v) => {
                        const color = v >= 0 ? 'text-success' : 'text-danger';
                        return `<span class="fw-semibold ${color}">${v}%</span>`;
                    },
                },
            ],
            pageSize: 50,
            sorter: true,
            header: true,
            footer: false,
        });

        this.table.setData(data);
    }

    renderTotals(data) {
        const el = document.getElementById('pnl-totals');
        if (!el) return;

        const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
        const totalCost = data.reduce((sum, item) => sum + item.cost, 0);
        const totalProfit = totalRevenue - totalCost;
        const totalMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

        el.innerHTML = `
            <div class="d-flex flex-wrap gap-3 justify-content-end">
                <span>Doanh Thu: <strong class="text-success">${formatMoney(totalRevenue)}</strong></span>
                <span>Giá Vốn: <strong class="text-danger">${formatMoney(totalCost)}</strong></span>
                <span>Lợi Nhuận: <strong class="${totalProfit >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(totalProfit)}</strong></span>
                <span>Margin: <strong>${totalMargin}%</strong></span>
            </div>
        `;
    }
}
