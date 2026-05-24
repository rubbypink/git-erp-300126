import { HrEmployee } from './hr_employee.js';
import { HrAttendance } from './hr_attendance.js';
import { HrSalary } from './hr_salary.js';
import { HrBonus } from './hr_bonus.js';
import { HrDashboard } from './hr_dashboard.js';
import './hr.css';

class HumanController {
    static autoInit = false;

    constructor() {
        this.employee = new HrEmployee(this);
        this.attendance = new HrAttendance(this);
        this.salary = new HrSalary(this);
        this.bonus = new HrBonus(this);
        this.dashboard = new HrDashboard(this);
        this._initialized = false;
        this._tabHandler = null;
        this._headerListeners = [];
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;
        
        this.employee.init();
        this.attendance.init();
        this.salary.init();
        this.bonus.init();
        this.dashboard.init();

        this._waitForDom();
    }

    _waitForDom() {
        const checkEl = document.getElementById('hr-main-content');
        if (checkEl) {
            this._setupTabListeners();
            this.render();
        } else {
            setTimeout(() => this._waitForDom(), 300);
        }
    }

    _setupTabListeners() {
        if (this._tabHandler) return;

        const tabMap = {
            '#hr-dashboard-content': () => this.dashboard.render(),
            '#hr-employee-content': () => this.employee.render(),
            '#hr-attendance-content': () => this.attendance.render(),
            '#hr-salary-content': () => this.salary.render(),
            '#hr-bonus-content': () => this.bonus.render(),
        };

        this._tabHandler = (event) => {
            const target = event.target;
            if (!target.matches('[data-bs-target^="#hr-"]')) return;
            const bsTarget = target.getAttribute('data-bs-target');
            if (tabMap[bsTarget]) {
                tabMap[bsTarget]();
            }
        };

        document.addEventListener('shown.bs.tab', this._tabHandler);
    }

    render() {
        this.renderHeaderActions();
        this.dashboard.render();
    }

    renderHeaderActions() {
        const headerActions = document.getElementById('hr-header-actions');
        if (!headerActions) return;

        this._cleanupHeaderListeners();

        headerActions.innerHTML = `
            <button class="btn btn-light btn-sm fw-bold" id="hr-btn-dashboard">
                <i class="fa-solid fa-chart-pie me-1"></i>Tổng Quan
            </button>
            <button class="btn btn-light btn-sm fw-bold" id="hr-btn-employee">
                <i class="fa-solid fa-user-group me-1"></i>Nhân Viên
            </button>
            <button class="btn btn-light btn-sm fw-bold" id="hr-btn-attendance">
                <i class="fa-solid fa-calendar-check me-1"></i>Chấm Công
            </button>
            <button class="btn btn-light btn-sm fw-bold" id="hr-btn-salary">
                <i class="fa-solid fa-money-bill-wave me-1"></i>Bảng Lương
            </button>
            <button class="btn btn-light btn-sm fw-bold" id="hr-btn-bonus">
                <i class="fa-solid fa-gift me-1"></i>Thưởng/Phạt
            </button>
        `;

        this._bindHeaderAction('hr-btn-dashboard', () => this.dashboard.render());
        this._bindHeaderAction('hr-btn-employee', () => this.employee.render());
        this._bindHeaderAction('hr-btn-attendance', () => this.attendance.render());
        this._bindHeaderAction('hr-btn-salary', () => this.salary.render());
        this._bindHeaderAction('hr-btn-bonus', () => this.bonus.render());
    }

    _bindHeaderAction(id, handler) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', handler);
        this._headerListeners.push({ el, handler });
    }

    _cleanupHeaderListeners() {
        this._headerListeners.forEach(({ el, handler }) => {
            el.removeEventListener('click', handler);
        });
        this._headerListeners = [];
    }

    destroy() {
        if (this._tabHandler) {
            document.removeEventListener('shown.bs.tab', this._tabHandler);
            this._tabHandler = null;
        }
        this._cleanupHeaderListeners();
        this._initialized = false;
    }
}

const HumanModule = new HumanController();
export default HumanModule;
