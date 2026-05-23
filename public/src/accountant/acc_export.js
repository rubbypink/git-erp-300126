/**
 * AccExport.js - Export module for Accountant (CSV/Excel + PDF)
 * Exports currently filtered transaction data
 */

export class AccExport {
    constructor(accountantCtrl) {
        this.ctrl = accountantCtrl;
    }

    /**
     * Export currently filtered transactions to CSV with Vietnamese headers
     */
    exportCSV() {
        const data = this._getFilteredData();
        if (!data || data.length === 0) {
            logA('Không có dữ liệu để xuất', 'warning', 'toast');
            return;
        }

        const headers = [
            'ID Giao Dịch',
            'Loại',
            'Ngày CT',
            'Số tiền',
            'Diễn giải',
            'Hạng mục',
            'Booking ID',
            'Quỹ',
            'Trạng thái',
            'Người tạo',
        ];

        const rows = data.map((item) => [
            item.id || '',
            item.type || '',
            item.transaction_date ? item.transaction_date.substring(0, 10) : '',
            item.amount || 0,
            (item.description || '').replace(/"/g, '""'),
            item.category || '',
            item.booking_id || '',
            item.fund_source || '',
            item.status || '',
            item.created_by || '',
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map((row) =>
                row
                    .map((cell) => {
                        const str = String(cell);
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return `"${str}"`;
                        }
                        return str;
                    })
                    .join(',')
            ),
        ].join('\r\n');

        // UTF-8 BOM for Excel Vietnamese support
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const entity = this.ctrl.currentEntity || '9trip';
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `GiaoDich_${entity}_${dateStr}.csv`;

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        logA(`Đã xuất ${data.length} giao dịch ra CSV`, 'success', 'toast');
    }

    /**
     * Export currently filtered transactions to PDF via browser print
     */
    exportPDF() {
        const data = this._getFilteredData();
        if (!data || data.length === 0) {
            logA('Không có dữ liệu để xuất', 'warning', 'toast');
            return;
        }

        const entity = this.ctrl.currentEntity === 'thenice' ? 'The Nice Hotel' : '9 Trip ERP';
        const filterSummary = this._getFilterSummary();
        const totals = this._calculateTotals(data);

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            logA('Trình duyệt đã chặn cửa sổ mới. Vui lòng cho phép popup.', 'warning', 'toast');
            return;
        }

        const rowsHtml = data
            .map(
                (item) => `
            <tr>
                <td>${item.id || ''}</td>
                <td class="text-center">${item.type === 'IN' ? '📥 Thu' : '📤 Chi'}</td>
                <td class="text-center">${item.transaction_date ? item.transaction_date.substring(0, 10) : ''}</td>
                <td class="text-end ${item.type === 'IN' ? 'text-success' : 'text-danger'}">${item.type === 'IN' ? '+' : '-'} ${formatMoney(item.amount || 0)}</td>
                <td>${this._escapeHtml(item.description || '')}</td>
                <td>${item.category || ''}</td>
                <td>${item.booking_id || '-'}</td>
                <td>${item.fund_source || ''}</td>
                <td class="text-center">${item.status || ''}</td>
                <td>${item.created_by || ''}</td>
            </tr>
        `
            )
            .join('');

        const html = `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Báo Cáo Giao Dịch - ${entity}</title>
                <style>
                    @media print {
                        body { margin: 0; padding: 10mm; }
                        .no-print { display: none !important; }
                    }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        font-size: 12px;
                        color: #333;
                        line-height: 1.4;
                        padding: 20px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                        border-bottom: 2px solid #0d6efd;
                        padding-bottom: 15px;
                    }
                    .header h2 { margin: 0 0 5px 0; color: #0d6efd; }
                    .header .meta { color: #666; font-size: 11px; }
                    .summary {
                        display: flex;
                        gap: 20px;
                        margin-bottom: 20px;
                        justify-content: center;
                    }
                    .summary-box {
                        padding: 10px 20px;
                        border-radius: 8px;
                        text-align: center;
                        min-width: 120px;
                    }
                    .summary-box.in { background: #d1f2e1; color: #0f5132; }
                    .summary-box.out { background: #f8d7da; color: #842029; }
                    .summary-box.net { background: #cff4fc; color: #055160; }
                    .summary-box .label { font-size: 10px; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
                    .summary-box .value { font-size: 14px; font-weight: bold; }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    th, td {
                        border: 1px solid #dee2e6;
                        padding: 6px 8px;
                        text-align: left;
                    }
                    th {
                        background: #f8f9fa;
                        font-weight: 600;
                        font-size: 11px;
                        text-transform: uppercase;
                        color: #495057;
                    }
                    tr:nth-child(even) { background: #f8f9fa; }
                    .text-center { text-align: center; }
                    .text-end { text-align: right; }
                    .text-success { color: #198754; }
                    .text-danger { color: #dc3545; }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        font-size: 10px;
                        color: #999;
                    }
                    .btn-print {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        padding: 10px 20px;
                        background: #0d6efd;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                </style>
            </head>
            <body>
                <button class="no-print btn-print" onclick="window.print()">🖨️ In / Lưu PDF</button>
                
                <div class="header">
                    <h2>BÁO CÁO GIAO DỊCH</h2>
                    <div class="meta">${entity}</div>
                    <div class="meta">${filterSummary}</div>
                    <div class="meta">Tổng số: ${data.length} giao dịch</div>
                </div>

                <div class="summary">
                    <div class="summary-box in">
                        <div class="label">Tổng Thu</div>
                        <div class="value">+${formatMoney(totals.totalIn)}</div>
                    </div>
                    <div class="summary-box out">
                        <div class="label">Tổng Chi</div>
                        <div class="value">-${formatMoney(totals.totalOut)}</div>
                    </div>
                    <div class="summary-box net">
                        <div class="label">Chênh lệch</div>
                        <div class="value">${totals.net >= 0 ? '+' : '-'}${formatMoney(Math.abs(totals.net))}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>ID GD</th>
                            <th>Loại</th>
                            <th>Ngày CT</th>
                            <th>Số tiền</th>
                            <th>Diễn giải</th>
                            <th>Hạng mục</th>
                            <th>Booking ID</th>
                            <th>Quỹ</th>
                            <th>Trạng thái</th>
                            <th>Người tạo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="footer">
                    Xuất bởi ${CURRENT_USER?.name || 'Hệ thống'} | ${new Date().toLocaleString('vi-VN')}
                </div>

                <script>
                    // Auto-trigger print after styles load
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 300);
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    }

    /**
     * Get currently filtered transaction data
     */
    _getFilteredData() {
        // Prefer stored filtered array from controller
        if (this.ctrl.filteredTransactions && this.ctrl.filteredTransactions.length > 0) {
            return this.ctrl.filteredTransactions;
        }
        // Fallback: return all controller transactions
        if (this.ctrl.transactions) {
            return this.ctrl.transactions;
        }
        return [];
    }

    /**
     * Calculate totals from data
     */
    _calculateTotals(data) {
        let totalIn = 0,
            totalOut = 0;
        data.forEach((item) => {
            const amount = parseFloat(item.amount || 0);
            if (item.type === 'IN') totalIn += amount;
            else if (item.type === 'OUT') totalOut += amount;
        });
        return {
            totalIn,
            totalOut,
            net: totalIn - totalOut,
        };
    }

    /**
     * Build filter summary string for PDF header
     */
    _getFilterSummary() {
        const state = this.ctrl.filterState || {};
        const periodMap = {
            today: 'Hôm nay',
            week: 'Tuần này',
            month: 'Tháng này',
            last_month: 'Tháng trước',
            quarter: 'Quý này',
            year: 'Năm nay',
            all: 'Tất cả',
            custom: 'Tùy chọn',
        };
        const periodText = periodMap[state.period] || state.period || 'Tháng này';
        let summary = `Giai đoạn: ${periodText}`;
        if (state.keyword) summary += ` | Từ khóa: ${state.keyword}`;
        if (state.status && state.status !== 'all') summary += ` | Trạng thái: ${state.status}`;
        return summary;
    }

    /**
     * Escape HTML special characters
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
