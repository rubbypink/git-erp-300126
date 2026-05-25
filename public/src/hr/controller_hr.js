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
        console.log('[HR-Controller] init()');
        
        // Load template file to register templates in UI_Manager
        if (window.A && window.A.UI) {
            if (!document.getElementById('tmpl-human')) {
                await window.A.UI.renderTemplate('body', 'tpl_hr.html', true);
            }
        }

        // Sub-module init (some are async — await them)
        this.employee.init();
        await this.attendance.init();
        await this.salary.init();
        this.bonus.init();
        this.dashboard.init();

        this._waitForDom();
    }

    _waitForDom() {
        const checkEl = document.getElementById('hr-dashboard-content');
        if (checkEl) {
            console.log('[HR-Controller] _waitForDom() — DOM ready, setting up tabs');
            this._setupTabListeners();
            this.render();
        } else {
            console.log('[HR-Controller] _waitForDom() — DOM not ready, retrying in 300ms...');
            setTimeout(() => this._waitForDom(), 300);
        }
    }

    _setupTabListeners() {
        if (this._tabHandler) return;
        console.log('[HR-Controller] _setupTabListeners()');

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
        console.log('[HR-Controller] render()');
        this.renderHeaderActions();
        
        // Tìm tab đang active
        const activePane = document.querySelector('#hr-tab-content .tab-pane.active');
        if (activePane) {
            const id = activePane.id;
            if (id === 'hr-dashboard-content') this.dashboard.render();
            else if (id === 'hr-employee-content') this.employee.render();
            else if (id === 'hr-attendance-content') this.attendance.render();
            else if (id === 'hr-salary-content') this.salary.render();
            else if (id === 'hr-bonus-content') this.bonus.render();
        } else {
            this.dashboard.render();
        }
    }

    renderHeaderActions() {
        const headerActions = document.getElementById('hr-header-actions');
        if (!headerActions) return;

        this._cleanupHeaderListeners();

        // Xóa nội dung menu dư thừa
        headerActions.innerHTML = ``;
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
