/**
 * 9TRIP ERP - ADMIN APPLICATION CORE
 * Version: 2.0.0
 * Author: 9Trip Tech Lead
 */

import A from '/src/js/modules/core/app.js';
import { AdminDatabaseController } from './AdminDatabaseController.js';
import { IAMController } from './IAMController.js';
import { SettingsController } from './SettingsController.js';

class AdminRouter {
  constructor(contentElId) {
    this.contentElId = contentElId;
    this.contentEl = document.getElementById(contentElId);
    this.breadcrumbEl = document.getElementById('admin-breadcrumb');
    this.routes = {
      dashboard: { title: 'Tổng quan', icon: 'fa-chart-pie', render: this.renderDashboard.bind(this) },
      database: { title: 'Database', icon: 'fa-database', render: this.renderDatabase.bind(this) },
      iam: { title: 'Phân quyền (IAM)', icon: 'fa-users-gear', render: this.renderIAM.bind(this) },
      settings: { title: 'Cấu hình App', icon: 'fa-sliders', render: this.renderSettings.bind(this) },
    };
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.renderMenu();

    if (!window.location.hash) {
      window.location.hash = '#dashboard';
    } else {
      this.handleRoute();
    }
  }

  renderMenu() {
    const menuEl = document.getElementById('admin-menu');
    if (!menuEl) return;

    let html = '';
    // Grouping menu (ví dụ)
    html += `<div class="menu-group">Hệ thống</div>`;

    for (const [key, route] of Object.entries(this.routes)) {
      html += `
        <a class="nav-link" href="#${key}" data-route="${key}">
            <i class="fa-solid ${route.icon}"></i>
            <span>${route.title}</span>
        </a>
      `;
    }
    menuEl.innerHTML = html;
  }

  handleRoute() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const route = this.routes[hash];

    // 1. Update Active State
    document.querySelectorAll('#admin-menu .nav-link').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${hash}`);
    });

    // 2. Update Breadcrumb
    this.updateBreadcrumb(hash);

    // 3. Close Sidebar on Mobile
    this.closeSidebarMobile();

    // 4. Render Content
    if (route) {
      try {
        route.render();
      } catch (error) {
        console.error(`[Router] Error rendering ${hash}:`, error);
        this.contentEl.innerHTML = `<div class="alert alert-danger m-4">Lỗi khi tải module: ${error.message}</div>`;
      }
    } else {
      this.contentEl.innerHTML = `<div class="text-center py-5"><h3 class="text-danger">404 - Không tìm thấy Module</h3></div>`;
    }
  }

  updateBreadcrumb(hash) {
    if (!this.breadcrumbEl) return;
    const route = this.routes[hash];
    this.breadcrumbEl.innerHTML = `
      <li class="breadcrumb-item"><a href="#" class="text-decoration-none">Admin</a></li>
      <li class="breadcrumb-item active" aria-current="page">${route ? route.title : hash}</li>
    `;
  }

  closeSidebarMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth < 768) {
      sidebar?.classList.remove('show');
      overlay?.classList.remove('show');
    }
  }

  renderDashboard() {
    this.contentEl.innerHTML = `
      <div class="fade-in">
        <h4 class="mb-4 fw-bold">Tổng quan Hệ thống</h4>
        <div class="row g-4">
          <div class="col-md-3">
            <div class="card p-3 border-start border-primary border-4">
              <div class="text-muted small text-uppercase fw-bold">Người dùng</div>
              <div class="h3 fw-bold mb-0">1,250</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card p-3 border-start border-success border-4">
              <div class="text-muted small text-uppercase fw-bold">Doanh thu</div>
              <div class="h3 fw-bold mb-0">450M</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderDatabase() {
    this.contentEl.innerHTML = `<div id="admin-db-wrapper" class="fade-in"></div>`;
    const dbController = new AdminDatabaseController('admin-db-wrapper');
    dbController.render();
  }

  renderIAM() {
    this.contentEl.innerHTML = `<div id="admin-iam-wrapper" class="fade-in"></div>`;
    const iamController = new IAMController('admin-iam-wrapper');
    iamController.render();
  }

  renderSettings() {
    this.contentEl.innerHTML = `<div id="admin-settings-wrapper" class="fade-in"></div>`;
    const settingsController = new SettingsController('admin-settings-wrapper');
    settingsController.render();
  }
}

class AdminApplication {
  constructor() {
    this.currentUser = null;
  }

  async start() {
    // Chờ Application chính init
    const checkAuth = setInterval(() => {
      if (A.isReady()) {
        clearInterval(checkAuth);
        this.validateAdmin();
      }
    }, 100);
  }

  validateAdmin() {
    const user = A.getState('user');
    if (!user || (user.role !== 'admin' && user.level < 50)) {
      alert('Lỗi Bảo Mật: Bạn không có quyền truy cập Admin Manager!');
      window.location.href = '/';
      return;
    }

    this.currentUser = user;
    this.initUI();
  }

  initUI() {
    // Update User Info
    const nameEl = document.getElementById('admin-user-name');
    if (nameEl) nameEl.textContent = this.currentUser.displayName || this.currentUser.email.split('@')[0];

    // Sidebar Toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const overlay = document.getElementById('sidebar-overlay');

    toggleBtn?.addEventListener('click', () => {
      if (window.innerWidth < 768) {
        sidebar?.classList.toggle('show');
        overlay?.classList.toggle('show');
      } else {
        sidebar?.classList.toggle('collapsed');
        mainContent?.classList.toggle('expanded');
      }
    });

    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('show');
      overlay?.classList.remove('show');
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', (e) => {
      e.preventDefault();
      A.Auth.signOut();
    });

    // Start Router
    const router = new AdminRouter('admin-content');
    router.init();
  }
}

// Khởi chạy ứng dụng
document.addEventListener('DOMContentLoaded', () => {
  const adminApp = new AdminApplication();
  adminApp.start();
});
