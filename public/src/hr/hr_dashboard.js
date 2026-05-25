export class HrDashboard {
    constructor(controller) {
        this.controller = controller;
    }

    init() {
        console.log('[HR-Dashboard] init()');
    }

    async render() {
        console.log('[HR-Dashboard] render()');
        const container = document.getElementById('hr-dashboard-content');
        if (!container) {
            console.warn('[HR-Dashboard] render(): container #hr-dashboard-content not found');
            return;
        }

        container.innerHTML = `
            <div class="p-3">
                <h5 class="fw-bold mb-3">Tổng Quan Nhân Sự</h5>
                <div class="row g-3 mb-4">
                    <div class="col-12 col-md-6">
                        <div class="card border-0 shadow-sm bg-light hr-dashboard-card h-100">
                            <div class="card-body text-center p-4">
                                <h6 class="text-muted mb-2">Tổng Nhân Viên</h6>
                                <h3 class="fw-bold text-primary mb-0" id="hr-total-employees"><i class="fas fa-spinner fa-spin"></i></h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-12 col-md-6">
                        <div class="card border-0 shadow-sm bg-light hr-dashboard-card h-100">
                            <div class="card-body text-center p-4">
                                <h6 class="text-muted mb-2">Chấm Công Hôm Nay</h6>
                                <h3 class="fw-bold text-success mb-0" id="hr-today-attendance"><i class="fas fa-spinner fa-spin"></i></h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-12 col-md-6">
                        <div class="card border-0 shadow-sm bg-light hr-dashboard-card h-100">
                            <div class="card-body text-center p-4">
                                <h6 class="text-muted mb-2">Lương Tháng Này</h6>
                                <h3 class="fw-bold text-warning mb-0" id="hr-monthly-salary"><i class="fas fa-spinner fa-spin"></i></h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-12 col-md-6">
                        <div class="card border-0 shadow-sm bg-light hr-dashboard-card h-100">
                            <div class="card-body text-center p-4">
                                <h6 class="text-muted mb-2">Thưởng Tháng Này</h6>
                                <h3 class="fw-bold text-danger mb-0" id="hr-monthly-bonus"><i class="fas fa-spinner fa-spin"></i></h3>
                            </div>
                        </div>
                    </div>
                </div>

                <h5 class="fw-bold mb-3 mt-4">Thao Tác Nhanh</h5>
                <div class="d-flex flex-wrap gap-2 mb-4">
                    <button class="btn btn-primary" id="hr-dash-btn-add-employee">
                        <i class="fas fa-user-plus me-1"></i> Thêm Nhân Viên
                    </button>
                    <button class="btn btn-success" id="hr-dash-btn-attendance">
                        <i class="fas fa-calendar-check me-1"></i> Chấm Công
                    </button>
                    <button class="btn btn-info text-white" id="hr-dash-btn-view-salary">
                        <i class="fas fa-file-invoice-dollar me-1"></i> Xem Bảng Lương
                    </button>
                </div>

                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white border-bottom-0 pt-3 pb-0">
                        <h6 class="fw-bold mb-0">Hoạt Động Gần Đây</h6>
                    </div>
                    <div class="card-body">
                        <ul class="list-group list-group-flush" id="hr-recent-activity">
                            <li class="list-group-item px-0 text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Đang tải...</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
        await this.loadData();
    }

    async getCollection(colName) {
        // 1. Check APP_DATA first
        if (window.APP_DATA && window.APP_DATA[colName]) {
            const data = window.APP_DATA[colName];
            return Array.isArray(data) ? data : Object.values(data);
        }
        // 2. Fallback to IndexedDB (use getAllAsObject for consistency with other HR modules)
        if (window.A && window.A.DB && window.A.DB.local) {
            try {
                const obj = await window.A.DB.local.getAllAsObject(colName);
                if (obj && Object.keys(obj).length > 0) {
                    return Object.values(obj);
                }
            } catch (e) {
                console.error(`[HR-Dashboard] Error loading ${colName}:`, e);
                return [];
            }
        }
        return [];
    }

    async loadData() {
        console.log('[HR-Dashboard] loadData()');
        try {
            const [employees, attendance, salary_records, bonuses] = await Promise.all([
                this.getCollection('employees'),
                this.getCollection('attendance'),
                this.getCollection('salary_records'),
                this.getCollection('bonuses')
            ]);

            // Store for quick-action helpers
            this._employees = employees || [];
            this._attendanceRecords = attendance || [];

            const activeEmployees = employees.filter(e => e.status === 'active' || e.status === 'probation');
            const totalEmployees = activeEmployees.length;

            const today = new Date();
            const todayStr = today.toLocaleDateString('en-CA');
            const todayAttendance = attendance.filter(a => a.date === todayStr);
            const presentCount = todayAttendance.filter(a => a.status === 'present' || a.status === 'late').length;

            const currentMonth = today.getMonth() + 1;
            const currentYear = today.getFullYear();
            const currentSalaries = salary_records.filter(s => parseInt(s.month) === currentMonth && parseInt(s.year) === currentYear);
            const totalSalary = currentSalaries.reduce((sum, s) => sum + (parseFloat(s.net_salary) || 0), 0);

            const currentMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
            const currentBonuses = bonuses.filter(b => b.date && b.date.startsWith(currentMonthPrefix));
            const totalBonus = currentBonuses.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

            const formatVND = (val) => new Intl.NumberFormat('vi-VN').format(val);

            const elTotalEmp = document.getElementById('hr-total-employees');
            if (elTotalEmp) elTotalEmp.innerText = totalEmployees;

            const elTodayAtt = document.getElementById('hr-today-attendance');
            if (elTodayAtt) elTodayAtt.innerText = `${presentCount}/${totalEmployees}`;

            const elSalary = document.getElementById('hr-monthly-salary');
            if (elSalary) elSalary.innerText = formatVND(totalSalary);

            const elBonus = document.getElementById('hr-monthly-bonus');
            if (elBonus) elBonus.innerText = formatVND(totalBonus);

            const elActivity = document.getElementById('hr-recent-activity');
            if (elActivity) {
                elActivity.innerHTML = this.renderRecentActivity(employees, attendance, salary_records, bonuses);
            }
        } catch (err) {
            console.error('HrDashboard loadData error:', err);
        }
    }

    renderRecentActivity(employees, attendance, salary_records, bonuses) {
        let activities = [];
        
        const sortedAtt = [...attendance].sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0)).slice(0, 3);
        sortedAtt.forEach(a => {
            const emp = employees.find(e => e.id === a.employee_id);
            const statusMap = { 'present': 'Có Mặt', 'absent': 'Vắng', 'late': 'Đi Trễ', 'leave': 'Nghỉ Phép' };
            activities.push({
                date: a.created_at || a.date,
                text: `Chấm công: ${emp ? emp.full_name : a.employee_id} - ${statusMap[a.status] || a.status}`,
                icon: 'fa-calendar-check',
                color: 'text-success'
            });
        });

        const sortedEmp = [...employees].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 2);
        sortedEmp.forEach(e => {
            activities.push({
                date: e.created_at || '',
                text: `Nhân viên mới: ${e.full_name}`,
                icon: 'fa-user-plus',
                color: 'text-primary'
            });
        });

        const sortedBonuses = [...bonuses].sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0)).slice(0, 2);
        sortedBonuses.forEach(b => {
            const emp = employees.find(e => e.id === b.employee_id);
            activities.push({
                date: b.created_at || b.date,
                text: `Thưởng: ${emp ? emp.full_name : b.employee_id} - ${new Intl.NumberFormat('vi-VN').format(b.amount)}`,
                icon: 'fa-gift',
                color: 'text-danger'
            });
        });

        activities.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        activities = activities.slice(0, 5);

        if (activities.length === 0) {
            return `<li class="list-group-item px-0 text-muted">Chưa có hoạt động nào</li>`;
        }

        return activities.map(act => `
            <li class="list-group-item px-0 d-flex align-items-center border-bottom">
                <div class="bg-light rounded-circle p-2 me-3 ${act.color}" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                    <i class="fas ${act.icon}"></i>
                </div>
                <div>
                    <p class="mb-0 text-dark fw-medium">${act.text}</p>
                    <small class="text-muted">${act.date || ''}</small>
                </div>
            </li>
        `).join('');
    }

    bindEvents() {
        const btnAddEmployee = document.getElementById('hr-dash-btn-add-employee');
        if (btnAddEmployee) {
            btnAddEmployee.addEventListener('click', () => {
                if (this.controller.employee && typeof this.controller.employee.renderForm === 'function') {
                    this.controller.employee.renderForm(null);
                }
            });
        }

        const btnAttendance = document.getElementById('hr-dash-btn-attendance');
        if (btnAttendance) {
            btnAttendance.addEventListener('click', async () => {
                const available = this.#getAvailableEmployees();
                if (available.length === 0) {
                    Swal.fire({ icon: 'info', title: 'Thông báo', text: 'Tất cả nhân viên đã chấm công hôm nay.' });
                    return;
                }
                const inputOptions = {};
                available.forEach(emp => { inputOptions[emp.id] = emp.full_name; });
                const { value: employeeId } = await Swal.fire({
                    title: 'Chấm Công',
                    input: 'select',
                    inputOptions,
                    inputPlaceholder: '--- Chọn nhân viên ---',
                    showCancelButton: true,
                    confirmButtonText: 'Check-in',
                    inputValidator: (value) => !value && 'Bạn cần chọn một nhân viên!',
                });
                if (employeeId) {
                    await this.controller.attendance.checkIn(employeeId);
                }
            });
        }

        const btnViewSalary = document.getElementById('hr-dash-btn-view-salary');
        if (btnViewSalary) {
            btnViewSalary.addEventListener('click', async () => {
                const employees = (this.controller.employee?._employees || []).filter(
                    emp => !emp.status || emp.status === 'active' || emp.status === 'probation'
                );
                if (employees.length === 0) {
                    Swal.fire({ icon: 'info', title: 'Thông báo', text: 'Chưa có nhân viên nào.' });
                    return;
                }
                const inputOptions = {};
                employees.forEach(emp => { inputOptions[emp.id] = emp.full_name; });
                const { value: employeeId } = await Swal.fire({
                    title: 'Xem Bảng Lương',
                    input: 'select',
                    inputOptions,
                    inputPlaceholder: '--- Chọn nhân viên ---',
                    showCancelButton: true,
                    confirmButtonText: 'Xem',
                    inputValidator: (value) => !value && 'Bạn cần chọn một nhân viên!',
                });
                if (employeeId) {
                    const html = this.#renderSalaryDetail(employeeId);
                    Swal.fire({ html, width: 700, showCloseButton: true, showConfirmButton: false });
                }
            });
        }
    }

    #getAvailableEmployees() {
        const employees = (this.controller.employee?._employees || []).filter(
            emp => !emp.status || emp.status === 'active' || emp.status === 'probation'
        );
        const attendance = this.controller.attendance?.records || [];
        const today = new Date().toLocaleDateString('en-CA');
        const checkedInIds = new Set(
            attendance.filter(a => a.date === today && a.check_in).map(a => a.employee_id)
        );
        return employees.filter(emp => !checkedInIds.has(emp.id));
    }

    #renderSalaryDetail(employeeId) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const result = this.controller.salary.calculateSalary(employeeId, month, year);
        if (!result) {
            return '<div class="text-danger text-center p-3">Không thể tính lương cho nhân viên này.</div>';
        }
        const employee = (this.controller.employee?._employees || []).find(e => e.id === employeeId);
        const empName = employee ? employee.full_name : employeeId;
        const attendance = this.controller.attendance?.records || [];
        const workDays = attendance.filter(a => {
            if (a.employee_id !== employeeId) return false;
            if (!a.date) return false;
            const d = new Date(a.date);
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        }).length;
        const formatVND = (val) => new Intl.NumberFormat('vi-VN').format(val);
        return `
            <h5 class="mb-3">Bảng Lương - ${empName}</h5>
            <p class="text-muted mb-3">Tháng ${month}/${year}</p>
            <table class="table table-bordered">
                <tr><td class="fw-bold">Lương CB</td><td class="text-end">${formatVND(result.base_salary)} VNĐ</td></tr>
                <tr><td class="fw-bold">Ngày công</td><td class="text-end">${workDays} ngày</td></tr>
                <tr><td class="fw-bold">Giờ công</td><td class="text-end">${result.ot_hours} giờ</td></tr>
                <tr><td class="fw-bold">Thưởng</td><td class="text-end text-success">${formatVND(result.bonus_total)} VNĐ</td></tr>
                <tr><td class="fw-bold">Phạt/Khấu trừ</td><td class="text-end text-danger">${formatVND(result.deduction_total)} VNĐ</td></tr>
                <tr class="table-primary"><td class="fw-bold">Thực nhận</td><td class="text-end fw-bold">${formatVND(result.net_salary)} VNĐ</td></tr>
            </table>
        `;
    }
}
