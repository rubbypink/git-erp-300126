// public/admin/js/IAMController.js
import A from '/src/js/modules/core//app.js';
import ATable from '/src/js/modules/core/ATable.js';

export class IAMController {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.aTableInstance = null;

    // Cấu trúc ma trận quyền cơ bản (Sẽ mở rộng thêm)
    this.permissionMatrix = {
      bookings: ['read', 'create', 'update', 'delete', 'export'],
      users: ['read', 'create', 'update', 'delete'],
      hotels: ['read', 'create', 'update', 'delete'],
      system: ['manage_config', 'manage_templates'],
    };
  }

  async render() {
    // 1. Render UI Khung sườn
    this.container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <h4 class="m-0 text-dark"><i class="fa-solid fa-shield-halved text-primary me-2"></i>Quản trị Phân quyền (IAM)</h4>
                    <p class="text-muted mb-0 small">Quản lý quyền truy cập cấp cao và Custom Claims của hệ thống.</p>
                </div>
            </div>
            
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0" id="admin-iam-table" style="min-height: 60vh; width: 100%; overflow-x: auto;">
                    <div class="text-center p-5"><div class="spinner-border text-primary"></div></div>
                </div>
            </div>
        `;

    // 2. Lắng nghe Double Click trên ATable để mở UI Cấp quyền
    A.Event.on(document.getElementById('admin-iam-table'), 'dblclick', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;

      // Giả định ID của user nằm trong row.id hoặc row.dataset.id
      const userId = row.id || row.dataset.id;
      // Lấy email để hiển thị (từ một cột nào đó, giả định có class 'col-email' hoặc lấy từ data gốc)
      const userEmail = row.querySelector('[data-field="email"]')?.innerText || 'Nhân sự';

      if (userId) this.openPermissionModal(userId, userEmail);
    });

    // 3. Load danh sách User
    await this.loadUsers();
  }

  async loadUsers() {
    const tableContainer = document.getElementById('admin-iam-table');
    try {
      // Lấy danh sách users từ Firestore
      const usersData = await A.DB.getCollection('users');
      tableContainer.innerHTML = '';

      this.aTableInstance = new ATable('admin-iam-table', {
        data: usersData,
        colName: 'users',
        pageSize: 50,
        sorter: true,
        header: true,
      });
    } catch (error) {
      console.error('[IAM] Lỗi tải danh sách users:', error);
      tableContainer.innerHTML = `<div class="alert alert-danger m-3">Lỗi tải dữ liệu: ${error.message}</div>`;
    }
  }

  openPermissionModal(userId, userEmail) {
    // Tạo giao diện Checkbox Ma trận quyền
    let matrixHtml = `<div class="container-fluid p-0"><div class="row g-3">`;

    for (const [moduleName, actions] of Object.entries(this.permissionMatrix)) {
      matrixHtml += `
                <div class="col-12 col-md-6">
                    <div class="card border-0 bg-light">
                        <div class="card-header fw-bold text-uppercase bg-transparent border-bottom-0 pt-3 pb-1 text-primary">
                            <i class="fa-solid fa-cube me-1"></i> Module: ${moduleName}
                        </div>
                        <div class="card-body py-2 d-flex flex-wrap gap-3">
            `;

      actions.forEach((action) => {
        const checkboxId = `perm_${moduleName}_${action}`;
        matrixHtml += `
                    <div class="form-check form-switch">
                        <input class="form-check-input perm-checkbox" type="checkbox" id="${checkboxId}" data-module="${moduleName}" data-action="${action}">
                        <label class="form-check-label text-capitalize small" for="${checkboxId}">${action}</label>
                    </div>
                `;
      });

      matrixHtml += `</div></div></div>`;
    }
    matrixHtml += `</div></div>`;

    // Gọi A.Modal.show của hệ thống
    A.Modal.show(
      matrixHtml,
      `Phân quyền cho: <span class="text-primary">${userEmail}</span>`,
      () => this.savePermissions(userId), // Nút Save
      null // Nút Cancel (mặc định đóng Modal)
    );

    // TODO: Ở bước tiếp theo (Giao tiếp Cloud Functions), ta sẽ fetch quyền thực tế của User này và check vào các ô tương ứng.
    // Hiện tại để trống để render UI trước.
  }

  savePermissions(userId) {
    // Thu thập các checkbox đã check
    const checkedBoxes = document.querySelectorAll('.perm-checkbox:checked');
    const selectedPermissions = Array.from(checkedBoxes).map((cb) => {
      return `${cb.dataset.module}:${cb.dataset.action}`;
    });

    console.log(`Lưu quyền cho User ${userId}:`, selectedPermissions);

    // TODO: Gọi HTTPS Callable Function để lưu Custom Claims (Sẽ viết ở phần sau)
    A.Modal.hide();
    alert('Đã gửi yêu cầu lưu quyền (Chờ tích hợp Cloud Functions)');
  }
}
