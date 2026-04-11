/**
 * 9TRIP ERP - ADMIN DATABASE CONTROLLER
 * Version: 2.0.0
 * Author: 9Trip Tech Lead
 */

import A from '/src/js/modules/core/app.js';
import ATable from '/src/js/modules/core/ATable.js';

export class AdminDatabaseController {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.currentCollection = '';
    this.aTableInstance = null;
    this.Modal = A.Modal;
    this.tbConfig = {
      colName: this.currentCollection,
      title: A.Lang?.t(this.currentCollection) || this.currentCollection,
      pageSize: 50,
      sorter: true,
      header: true,
      groupBy: true,
      footer: true,
      search: true,
      zoom: true,
      editable: true,
    };
  }

  async render() {
    try {
      // Lấy danh sách bảng từ Schema
      const archivedCollections = ['archived_bookings', 'archived_booking_details', 'archived_operator_entries', 'archived_transactions'];
      const collectionsMap = A.DB.schema.getCollectionNames() || {};
      archivedCollections.forEach((key) => {
        collectionsMap[key] = key;
      });
      const collectionKeys = Object.keys(collectionsMap);

      if (collectionKeys.length === 0) {
        this.container.innerHTML = `<div class="alert alert-warning m-4">Chưa có cấu hình Collection nào trong DBSchema!</div>`;
        return;
      }

      this.currentCollection = collectionKeys[0];

      // Khung UI chuyên nghiệp
      this.container.innerHTML = `
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
            <div>
                <h4 class="m-0 text-dark fw-bold"><i class="fa-solid fa-database text-primary me-2"></i>Quản trị Dữ liệu</h4>
                <p class="text-muted small mb-0">Quản lý trực tiếp các collection trong hệ thống</p>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <div class="input-group shadow-sm" style="width: auto;">
                    <span class="input-group-text bg-white border-end-0"><i class="fa-solid fa-filter text-muted"></i></span>
                    <select id="admin-collection-selector" class="form-select border-start-0 ps-0" style="min-width: 200px; font-weight: 500;">
                        ${collectionKeys.map((key) => `<option value="${key}">${collectionsMap[key]}</option>`).join('')}
                    </select>
                </div>
                <button id="btn-admin-force-new" class="btn btn-sm btn-warning border shadow-sm">
                <i class="fa-solid fa-refresh"></i>Server Load
                </button>
                <button id="btn-admin-add-record" class="btn btn-sm btn-primary shadow-sm fw-bold px-3">
                    <i class="fa-solid fa-plus me-1"></i> Thêm mới
                </button>
                <button id="btn-admin-refresh" class="btn btn-sm btn-light border shadow-sm">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
        </div>
        
        <div class="card border-0 shadow-sm">
            <div class="card-body p-0" id="admin-atable-container" style="min-height: 60vh;">
                <!-- Table will be injected here -->
            </div>
        </div>
      `;

      // Event Listeners
      document.getElementById('admin-collection-selector').addEventListener('change', async (e) => {
        this.currentCollection = e.target.value;
        if (!this.aTableInstance) return this.loadTableData();
        let dataArray = await A.DB.local.getCollection(this.currentCollection);
        if (!dataArray) dataArray = await A.DB.getCollection(this.currentCollection);
        await new ATable('admin-atable-container', { ...this.tbConfig, data: dataArray });
      });

      document.getElementById('btn-admin-add-record').addEventListener('click', () => {
        A.UI?.renderForm(this.currentCollection);
      });
      document.getElementById('btn-admin-force-new').addEventListener('click', () => {
        this.loadTableData(true);
      });

      document.getElementById('btn-admin-refresh').addEventListener('click', () => {
        this.loadTableData();
      });

      // Event Delegation cho Table Actions
      const tableContainer = document.getElementById('admin-atable-container');
      tableContainer.addEventListener('click', (e) => {
        if (e.key !== 'Ctrl') return;
        const row = e.target.closest('tr');
        if (row && (row.id || row.dataset.id)) {
          A.UI?.renderForm(this.currentCollection, row.id || row.dataset.id);
        }
      });

      // Load dữ liệu lần đầu
      await this.loadTableData();
    } catch (error) {
      console.error('[AdminDatabaseController] Render Error:', error);
      this.container.innerHTML = `<div class="alert alert-danger m-4">Lỗi khởi tạo: ${error.message}</div>`;
    }
  }

  async loadTableData(forceNew = false) {
    const tableContainer = document.getElementById('admin-atable-container');
    if (!tableContainer) return;
    try {
      // Lấy dữ liệu từ DBManager (Firestore -> IndexedDB -> Local)
      let dataArray = [];
      if (forceNew) dataArray = await A.DB.getCollection(this.currentCollection);
      else await A.DB.local.getCollection(this.currentCollection);
      // Cấu hình ATable tối ưu cho Admin
      this.aTableInstance = new ATable('admin-atable-container', {
        data: dataArray,
        colName: this.currentCollection,
        title: A.Lang?.t(this.currentCollection) || this.currentCollection,
        pageSize: 50,
        sorter: true,
        header: true,
        draggable: true,
        contextMenu: true,
        groupBy: true,
        footer: true,
        search: true,
        zoom: true,
        style: 'danger',
        editable: true,
        fs: 0.7,
      });
    } catch (error) {
      console.error(`[Admin DB] Load Error (${this.currentCollection}):`, error);
      tableContainer.innerHTML = `
            <div class="p-5 text-center">
                <i class="fa-solid fa-circle-exclamation text-danger fs-1 mb-3"></i>
                <h5 class="text-danger">Lỗi tải dữ liệu</h5>
                <p class="text-muted small">${error.message}</p>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="location.reload()">Thử lại</button>
            </div>
        `;
    }
  }
}
