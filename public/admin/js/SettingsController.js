// public/admin/js/SettingsController.js
export class SettingsController {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    render() {
        this.container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h4 class="m-0 "><i class="fa-solid fa-sliders text-primary me-2"></i>Cấu hình & Template (Giai đoạn 5)</h4>
            </div>

            <div class="row g-4">
                <div class="col-12 col-lg-5">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bkg-light fw-bold py-3">Cấu hình Hệ thống (system_settings)</div>
                        <div class="card-body">
                            <form id="admin-settings-form">
                                <div class="mb-3">
                                    <label class="form-label text-muted small fw-bold">Trạng thái bảo trì App</label>
                                    <div class="form-check form-switch fs-5">
                                        <input class="form-check-input" type="checkbox" id="sys-maintenance-mode">
                                        <label class="form-check-label fs-6 mt-1" for="sys-maintenance-mode">Khóa App khách hàng</label>
                                    </div>
                                    <div class="form-text">Bật tính năng này sẽ hiển thị màn hình bảo trì cho tất cả nhân sự không có quyền Admin.</div>
                                </div>
                                
                                <button type="button" class="btn btn-primary w-100 mt-3" onclick="alert('Tính năng đang xây dựng')">
                                    <i class="fa-solid fa-save me-1"></i> Lưu Cấu Hình
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-7">
                    <div class="card border-0 shadow-sm h-100">
                        <div class="card-header bkg-light fw-bold py-3 d-flex justify-content-between align-items-center">
                            <span>Quản lý Mẫu in (system_templates)</span>
                            <button class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-plus"></i> Thêm mẫu</button>
                        </div>
                        <div class="card-body">
                            <div class="list-group">
                                <a href="#" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="mb-0">Mẫu Hợp Đồng Dịch Vụ</h6>
                                        <small class="text-muted">ID: tpl_contract_01</small>
                                    </div>
                                    <button class="btn btn-sm btn-light"><i class="fa-solid fa-pen"></i> Edit HTML</button>
                                </a>
                                <a href="#" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="mb-0">Mẫu Phiếu Thu (Invoice)</h6>
                                        <small class="text-muted">ID: tpl_invoice_vi</small>
                                    </div>
                                    <button class="btn btn-sm btn-light"><i class="fa-solid fa-pen"></i> Edit HTML</button>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
