import ATable from '/src/js/modules/core/ATable.js';

/**
 * SupplierDebtDashboard - Bảng điều khiển công nợ nhà cung cấp
 * Hiển thị tổng hợp công nợ theo NCC, phân loại aging 30/60/90+ ngày
 */
export class SupplierDebtDashboard {
    constructor(accountantCtrl) {
        this.ctrl = accountantCtrl;
        this.table = null;
    }

    _fmt(v) {
        return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0 }).format(v);
    }

    async show() {
        await this.ctrl.refreshData();
        const operators = await this.ctrl.getData('operator_entries');
        const suppliers = await this.ctrl.getData('suppliers');

        const debtData = this.calculateSupplierDebt(operators, suppliers);

        const html = `
            <div id="supplier-debt-container">
                <div class="row g-3 mb-3">
                    <div class="col-md-3">
                        <div class="card bg-danger bg-opacity-10 border-danger">
                            <div class="card-body text-center">
                                <div class="text-danger fw-bold">Tổng Nợ</div>
                                <div class="fs-4 fw-bold text-danger" id="sd-total-debt">0</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-warning bg-opacity-10 border-warning">
                            <div class="card-body text-center">
                                <div class="text-warning fw-bold">Nợ 30-60 ngày</div>
                                <div class="fs-4 fw-bold text-warning" id="sd-debt-30">0</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-orange bg-opacity-10 border-orange">
                            <div class="card-body text-center">
                                <div class="fw-bold" style="color: #fd7e14">Nợ 60-90 ngày</div>
                                <div class="fs-4 fw-bold" style="color: #fd7e14" id="sd-debt-60">0</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-dark bg-opacity-10 border-dark">
                            <div class="card-body text-center">
                                <div class="text-dark fw-bold">Nợ >90 ngày</div>
                                <div class="fs-4 fw-bold text-dark" id="sd-debt-90">0</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="supplier-debt-table-container"></div>
            </div>
        `;

        A.Modal.render(html, 'Công Nợ Nhà Cung Cấp');
        A.Modal.show();

        this.table = new ATable('supplier-debt-table-container', {
            columns: [
                { field: 'supplier_name', header: 'Nhà Cung Cấp', minWidth: '200px' },
                { field: 'total_cost', header: 'Tổng Chi Phí', width: '130px', align: 'right', renderer: (v) => this._fmt(v) },
                { field: 'paid_amount', header: 'Đã TT', width: '130px', align: 'right', renderer: (v) => this._fmt(v) },
                { field: 'debt_balance', header: 'Còn Nợ', width: '130px', align: 'right', renderer: (v) => `<span class="fw-bold text-danger">${this._fmt(v)}</span>` },
                { field: 'aging_30', header: '30-60 ngày', width: '110px', align: 'right', renderer: (v) => this._fmt(v) },
                { field: 'aging_60', header: '60-90 ngày', width: '110px', align: 'right', renderer: (v) => this._fmt(v) },
                { field: 'aging_90', header: '>90 ngày', width: '100px', align: 'right', renderer: (v) => this._fmt(v) },
            ],
            pageSize: 50,
            sortable: true,
            header: true,
            footer: true,
        });

        this.table.init(debtData);
        this.renderSummary(debtData);
    }

    calculateSupplierDebt(operators, suppliers) {
        const supplierMap = {};
        const today = new Date();

        // Chuẩn hóa suppliers thành array nếu cần
        const supplierArray = Array.isArray(suppliers) ? suppliers : Object.values(suppliers || {});

        for (const op of operators) {
            const supplierId = op.supplier;
            if (!supplierId) continue;

            if (!supplierMap[supplierId]) {
                const supplier = supplierArray.find((s) => s.id === supplierId);
                supplierMap[supplierId] = {
                    supplier_id: supplierId,
                    supplier_name: supplier?.name || supplierId,
                    total_cost: 0,
                    paid_amount: 0,
                    debt_balance: 0,
                    aging_30: 0,
                    aging_60: 0,
                    aging_90: 0,
                };
            }

            const cost = parseFloat(op.total_cost || 0);
            const paid = parseFloat(op.paid_amount || 0);
            const debt = parseFloat(op.debt_balance || 0);

            supplierMap[supplierId].total_cost += cost;
            supplierMap[supplierId].paid_amount += paid;
            supplierMap[supplierId].debt_balance += debt;

            // Calculate aging based on check_in date
            if (op.check_in && debt > 0) {
                const checkIn = new Date(op.check_in);
                const daysDiff = Math.floor((today - checkIn) / (1000 * 60 * 60 * 24));

                if (daysDiff >= 30 && daysDiff < 60) {
                    supplierMap[supplierId].aging_30 += debt;
                } else if (daysDiff >= 60 && daysDiff < 90) {
                    supplierMap[supplierId].aging_60 += debt;
                } else if (daysDiff >= 90) {
                    supplierMap[supplierId].aging_90 += debt;
                }
            }
        }

        return Object.values(supplierMap).filter((s) => s.debt_balance > 0);
    }

    renderSummary(data) {
        const totalDebt = data.reduce((sum, s) => sum + s.debt_balance, 0);
        const debt30 = data.reduce((sum, s) => sum + s.aging_30, 0);
        const debt60 = data.reduce((sum, s) => sum + s.aging_60, 0);
        const debt90 = data.reduce((sum, s) => sum + s.aging_90, 0);

        const elTotal = document.getElementById('sd-total-debt');
        const el30 = document.getElementById('sd-debt-30');
        const el60 = document.getElementById('sd-debt-60');
        const el90 = document.getElementById('sd-debt-90');

        if (elTotal) elTotal.textContent = this._fmt(totalDebt);
        if (el30) el30.textContent = this._fmt(debt30);
        if (el60) el60.textContent = this._fmt(debt60);
        if (el90) el90.textContent = this._fmt(debt90);
    }
}
