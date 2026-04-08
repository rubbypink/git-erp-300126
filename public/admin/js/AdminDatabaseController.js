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
  }

  async render() {
    try {
      // Lấy danh sách bảng từ Schema
      const collectionsMap = A.DB.schema.getCollectionNames() || {};
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
                <button id="btn-admin-add-record" class="btn btn-primary shadow-sm fw-bold px-3">
                    <i class="fa-solid fa-plus me-1"></i> Thêm mới
                </button>
                <button id="btn-admin-refresh" class="btn btn-light border shadow-sm">
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
        await this.aTableInstance?.init(dataArray, this.currentCollection);
      });

      document.getElementById('btn-admin-add-record').addEventListener('click', () => {
        A.UI?.renderForm(this.currentCollection);
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

  async loadTableData() {
    const tableContainer = document.getElementById('admin-atable-container');
    if (!tableContainer) return;

    tableContainer.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center py-5">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <div class="text-muted small fw-medium">Đang tải dữ liệu [${this.currentCollection}]...</div>
        </div>
    `;

    try {
      // Lấy dữ liệu từ DBManager (Firestore -> IndexedDB -> Local)
      let dataArray = await A.DB.local.getCollection(this.currentCollection);
      if (!dataArray) dataArray = await A.DB.getCollection(this.currentCollection);

      tableContainer.innerHTML = ''; // Clear loader

      // Cấu hình ATable tối ưu cho Admin
      this.aTableInstance = new ATable('admin-atable-container', {
        data: dataArray,
        colName: this.currentCollection,
        title: A.Lang?.t(this.currentCollection) || this.currentCollection,
        pageSize: 20,
        sorter: true,
        header: true,
        footer: true,
        search: true,
        editable: true,
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

  // async handleSaveRecord(recordId) {
  //   const saveBtn = document.getElementById('btn-save-record');
  //   try {
  //     // 1. Thu thập dữ liệu từ Form (A.DB.schema.getFormData tự động xử lý theo Schema)
  //     const formData = A.DB.schema.getFormData(this.currentCollection);

  //     // 2. Validation cơ bản (DBSchema đã có rules)
  //     if (!formData) {
  //       A.UI.toast('Dữ liệu không hợp lệ, vui lòng kiểm tra lại!', 'warning');
  //       return;
  //     }

  //     // 3. Hiển thị Loading
  //     A.UI.setBtnLoading(saveBtn, true, 'Đang lưu...');

  //     // 4. Thực hiện lưu vào Firestore qua DBManager
  //     // Nếu recordId có giá trị -> Update, ngược lại -> Add
  //     let result;
  //     if (recordId) {
  //       result = await A.DB.updateRecord(this.currentCollection, recordId, formData);
  //     } else {
  //       result = await A.DB.addRecord(this.currentCollection, formData);
  //     }

  //     if (result) {
  //       A.UI.toast('Đã lưu dữ liệu thành công!', 'success');
  //       A.Modal.hide();
  //       // Reload bảng để cập nhật UI
  //       await this.loadTableData();
  //     } else {
  //       throw new Error('Không nhận được phản hồi từ hệ thống lưu trữ.');
  //     }
  //   } catch (error) {
  //     console.error('[Admin DB] Save Error:', error);
  //     A.UI.toast(`Lỗi khi lưu: ${error.message}`, 'danger');
  //   } finally {
  //     A.UI.setBtnLoading(saveBtn, false);
  //   }
  // }
}
