/**
 * acc_charts.js - Biểu đồ tài chính cho module Kế toán
 * Chart.js từ CDN, 3 biểu đồ: xu hướng Thu/Chi, phân bổ hạng mục, số dư quỹ
 */

export class FinancialCharts {
    constructor(accountantCtrl) {
        this.ctrl = accountantCtrl;
        this.chartInstances = [];
    }

    async show() {
        try {
            await this._loadChartJs();

            const transactions = this.ctrl.transactions || [];
            const funds = this.ctrl.funds || [];

            const html = this._renderHtml(transactions.length === 0, funds.length === 0);
            A.Modal.render(html, 'Biểu Đồ Tài Chính');
            A.Modal.show();

            this._destroyExistingCharts();

            if (transactions.length > 0) {
                this._renderTrendChart(transactions);
                this._renderCategoryChart(transactions);
            }
            if (funds.length > 0) {
                this._renderFundChart(funds);
            }
        } catch (error) {
            Opps('Lỗi tải biểu đồ: ' + error.message);
        }
    }

    _loadChartJs() {
        if (window.Chart) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => resolve(window.Chart);
            script.onerror = () => reject(new Error('Không thể tải Chart.js'));
            document.head.appendChild(script);
        });
    }

    _destroyExistingCharts() {
        this.chartInstances.forEach((chart) => chart.destroy());
        this.chartInstances = [];
    }

    _renderHtml(noTrans, noFunds) {
        const emptyState = (icon, msg) => `
            <div class="text-center text-muted py-4">
                <i class="fas ${icon} mb-2 fs-4"></i>
                <div class="small">${msg}</div>
            </div>
        `;

        return `
            <div style="max-height: calc(100vh - 200px); overflow-y: auto;">
                <div class="mb-4">
                    <div class="d-flex align-items-center mb-2">
                        <div class="bg-success bg-opacity-10 p-1 rounded-circle me-2 d-flex">
                            <i class="fas fa-chart-line text-success small"></i>
                        </div>
                        <h6 class="fw-bold text-muted mb-0">Xu hướng Thu / Chi theo ngày</h6>
                    </div>
                    ${noTrans ? emptyState('fa-chart-line', 'Chưa có dữ liệu giao dịch') : `<canvas id="acc-chart-trend" style="max-height: 260px;"></canvas>`}
                </div>
                <div class="row g-3">
                    <div class="col-md-5">
                        <div class="d-flex align-items-center mb-2">
                            <div class="bg-warning bg-opacity-10 p-1 rounded-circle me-2 d-flex">
                                <i class="fas fa-chart-pie text-warning small"></i>
                            </div>
                            <h6 class="fw-bold text-muted mb-0">Phân bổ theo hạng mục</h6>
                        </div>
                        ${noTrans ? emptyState('fa-chart-pie', 'Chưa có dữ liệu phân loại') : `<canvas id="acc-chart-category" style="max-height: 240px;"></canvas>`}
                    </div>
                    <div class="col-md-7">
                        <div class="d-flex align-items-center mb-2">
                            <div class="bg-info bg-opacity-10 p-1 rounded-circle me-2 d-flex">
                                <i class="fas fa-chart-bar text-info small"></i>
                            </div>
                            <h6 class="fw-bold text-muted mb-0">Số dư các quỹ</h6>
                        </div>
                        ${noFunds ? emptyState('fa-chart-bar', 'Chưa có dữ liệu quỹ') : `<canvas id="acc-chart-fund" style="max-height: 240px;"></canvas>`}
                    </div>
                </div>
            </div>
        `;
    }

    _renderTrendChart(transactions) {
        const dateMap = {};
        transactions.forEach((t) => {
            const date = t.transaction_date ? t.transaction_date.substring(0, 10) : t.created_at ? t.created_at.substring(0, 10) : '';
            if (!date) return;
            if (!dateMap[date]) dateMap[date] = { IN: 0, OUT: 0 };
            const amount = parseFloat(t.amount || 0);
            if (t.type === 'IN') dateMap[date].IN += amount;
            else if (t.type === 'OUT') dateMap[date].OUT += amount;
        });

        const labels = Object.keys(dateMap).sort();
        if (labels.length === 0) return;

        const inData = labels.map((d) => dateMap[d].IN);
        const outData = labels.map((d) => dateMap[d].OUT);

        const ctx = document.getElementById('acc-chart-trend');
        if (!ctx) return;

        const chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.map((d) => {
                    const [, m, day] = d.split('-');
                    return `${day}/${m}`;
                }),
                datasets: [
                    {
                        label: 'Thu (IN)',
                        data: inData,
                        borderColor: '#198754',
                        backgroundColor: 'rgba(25, 135, 84, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#198754',
                    },
                    {
                        label: 'Chi (OUT)',
                        data: outData,
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#dc3545',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                label += formatMoney(context.raw);
                                return label;
                            },
                        },
                    },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                                return value;
                            },
                        },
                    },
                },
            },
        });

        this.chartInstances.push(chart);
    }

    _renderCategoryChart(transactions) {
        const categories = {};
        transactions.forEach((t) => {
            const cat = t.category || 'Khác';
            const key = cat + (t.type === 'IN' ? ' (Thu)' : ' (Chi)');
            const amount = parseFloat(t.amount || 0);
            categories[key] = (categories[key] || 0) + amount;
        });

        const labels = Object.keys(categories);
        const data = labels.map((k) => categories[k]);

        // Màu xanh cho Thu, đỏ cho Chi
        const bgColors = labels.map((k) => (k.includes('(Thu)') ? 'rgba(25, 135, 84, 0.8)' : 'rgba(220, 53, 69, 0.8)'));
        const borderColors = labels.map((k) => (k.includes('(Thu)') ? '#198754' : '#dc3545'));

        const ctx = document.getElementById('acc-chart-category');
        if (!ctx) return;

        const chart = new window.Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [
                    {
                        data,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } },
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.label}: ${formatMoney(context.raw)}`,
                        },
                    },
                },
            },
        });

        this.chartInstances.push(chart);
    }

    _renderFundChart(funds) {
        const labels = funds.map((f) => f.name || f.id || 'Quỹ');
        const data = funds.map((f) => parseFloat(f.balance || 0));

        const ctx = document.getElementById('acc-chart-fund');
        if (!ctx) return;

        const chart = new window.Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Số dư',
                        data,
                        backgroundColor: data.map((v) => (v >= 0 ? 'rgba(13, 110, 253, 0.8)' : 'rgba(220, 53, 69, 0.8)')),
                        borderRadius: 4,
                    },
                ],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => 'Số dư: ' + formatMoney(context.raw),
                        },
                    },
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                                return value;
                            },
                        },
                    },
                    y: { grid: { display: false } },
                },
            },
        });

        this.chartInstances.push(chart);
    }
}
