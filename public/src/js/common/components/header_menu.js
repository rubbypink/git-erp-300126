/**
 * Module: ErpHeaderMenu
 * Chức năng: Quản lý Header của hệ thống (Logo, NavTabs, Global Search, User, Settings, Notifications)
 * Cơ chế: Tự động dàn layout Desktop/Mobile và ẩn/hiện element theo Role.
 */
export default class ErpHeaderMenu {
    constructor(containerId = 'nav-container') {
        this.containerId = containerId;
        this.currentRole = 'sale';
        this.config = { height: '60px', zIndex: '1040', bgColor: '#0d6efd' };

        // [SỬA LỖI]: Bơm HTML ngay lập tức (Đồng bộ) để giữ chỗ ID cho Firebase Auth bắn dữ liệu vào
        this._injectStyles();
        this._renderLayout();
    }

    async init(userRole = 'sale') {
        try {
            this.currentRole = userRole.toLowerCase();
            this._applyRoleFilters(); // Chỉ chạy CSS filter sau khi đã có Role
            
            console.log(`[9 Trip ERP] Header Menu initialized for role: ${this.currentRole}`);
        } catch (error) {
            console.error('[9 Trip ERP] Lỗi khởi tạo Header Menu:', error);
        }
    }

    /**
     * (Private) Bơm CSS độc lập để xử lý Responsive chuẩn xác
     */
    _injectStyles() {
        if (document.getElementById('erp-header-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'erp-header-styles';
        style.innerHTML = `
            /* [FIX] Nâng toàn bộ container gốc lên tầng trên cùng */
            #${this.containerId} {
                position: relative; /* Hoặc 'sticky' với top: 0 nếu bạn muốn header trượt theo màn hình */
                z-index: 1050; 
                display: block;
            }
            .erp-header-wrapper {
                width: 100%;
                background-color: ${this.config.bgColor};
                z-index: ${this.config.zIndex};
                position: relative;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .erp-header-inner {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.5rem 1rem;
                height: 100%;
            }
            
            /* -- Nhóm Custom cho Scrollbar của Notification -- */
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }

            /* -- Responsive Rules -- */
            @media (min-width: 992px) {
                .erp-mobile-menu-trigger { display: none !important; }
                .erp-desktop-nav { display: flex !important; flex: 1; align-items: center; justify-content: space-between; }
            }
            
            @media (max-width: 991px) {
                .erp-desktop-nav { display: none !important; }
                .erp-mobile-menu-trigger { display: flex !important; }
                
                /* Tối ưu dropdown menu trên mobile để dễ touch (chạm) */
                .erp-mobile-dropdown-menu {
                    width: 250px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                    border: none;
                    border-radius: 8px;
                }
                .erp-mobile-dropdown-menu .dropdown-item {
                    padding: 12px 20px;
                    border-bottom: 1px solid #f8f9fa;
                }
                /* [FIX] Chống bóp méo icon, chỉ áp dụng cho Dropdown Mobile */
                .erp-mobile-dropdown-menu .dropdown-item i,
                .erp-mobile-dropdown-menu .dropdown-item svg {
                    width: 24px !important;
                    height: auto !important; /* Quan trọng cho SVG */
                    text-align: center;
                    flex-shrink: 0 !important; /* Khóa tỷ lệ, cấm giảm cân */
                    display: inline-block;
                }
                /* 1. Tạo lớp kính mờ cho toàn bộ khung Panel */
                #notificationPanel {
                    background-color: rgba(255, 255, 255, 0.85) !important; /* Nền trắng trong suốt 85% */
                    backdrop-filter: blur(16px); /* Làm nhòe nội dung bên dưới (Glassmorphism) */
                    -webkit-backdrop-filter: blur(16px); /* Hỗ trợ Safari */
                    border: 1px solid rgba(0, 0, 0, 0.08) !important; /* Viền siêu mỏng */
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12) !important; /* Bóng đổ mềm mại */
                }
    
                /* 2. Tẩy trắng các mảng màu Bootstrap cũ (Header, Footer, Danh sách) */
                #notificationPanel,
                #notificationPanel .notification-footer,
                #notificationPanel .bg-secondary,
                #notificationPanel .bg-light,
                #notificationList {
                    background-color: transparent !important; /* Ép trong suốt hoàn toàn */
                    border-color: rgba(0, 0, 0, 0.06) !important; /* Viền phân cách mềm đi */
                }
    
                /* 3. Tăng tối đa độ tương phản cho Text để dễ đọc */
                #notificationPanel h6, 
                #notificationPanel .text-dark {
                    color: #1a1d20 !important; /* Chữ đen đậm nét */
                    font-weight: 700 !important;
                }
                #notificationPanel .text-muted {
                    color: #5c636a !important; /* Chữ phụ chú xám rõ ràng hơn */
                }
    
                /* 4. Tương tác mượt mà khi di chuột vào thông báo (chuẩn bị cho Data sau này) */
                #notificationList .notification-item {
                    transition: background-color 0.2s ease;
                }
                #notificationList .notification-item:hover {
                    background-color: rgba(0, 0, 0, 0.04) !important; /* Phủ xám cực nhẹ khi hover */
                }
            }
        `;
        document.head.appendChild(style);
    }

    _renderLayout() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <nav class="navbar navbar-dark p-0 erp-header-wrapper">
                <div class="erp-header-inner w-100 d-flex align-items-center">
                    
                    <a class="navbar-brand m-0 p-0 me-auto" href="javascript:void(0);">
                        <img id="main-logo" src="https://9tripvietnam.com/wp-content/uploads/2019/05/Logo-9-trip.png.webp" 
                            class="bg-transparent rounded-circle main-logo" alt="9Trip Logo" onclick="reloadPage()" 
                            style="height: 40px; width: auto; object-fit: contain;">
                    </a>

                    <div class="erp-desktop-tabs d-none d-lg-flex align-items-center flex-grow-1 px-3">
                        ${this._getNavTabsHTML()}
                        <h5 id="module-title" class="m-0 fw-bold text-uppercase text-white ms-auto d-none d-xl-block" style="letter-spacing: 1px; font-size: 1.1rem;">
                            ADMIN MANAGEMENT
                        </h5>
                    </div>

                    <div class="d-flex align-items-center gap-1 gap-sm-2">
                        
                        <div class="d-none d-md-block">
                            ${this._getSearchAndFiltersHTML()}
                        </div>

                        ${this._getUserMenuHTML()}
                        
                        ${this._getSettingsMenuHTML()}
                        
                        ${this._getNotificationWidgetHTML()}

                        <div class="dropdown d-lg-none ms-1">
                            <button class="btn btn-light btn-sm d-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" style="width: 36px; height: 36px; border-radius: 8px;">
                                <i class="fa-solid fa-bars text-primary"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end mt-2 shadow-lg border-0">
                                <li class="dropdown-header fw-bold text-primary">CHUYỂN TRANG</li>
                                <li><button class="dropdown-item py-2" data-bs-target="#tab-dashboard" onclick="activateTab('tab-dashboard')"><i class="fa-solid fa-chart-line text-warning w-20px"></i> Dashboard</button></li>
                                <li><button class="dropdown-item py-2" data-bs-target="#tab-form" onclick="activateTab('tab-form')"><i class="fa-solid fa-file-pen text-secondary w-20px"></i> Booking</button></li>
                                <li><button class="dropdown-item py-2" data-bs-target="#tab-list" onclick="activateTab('tab-list')"><i class="fa-solid fa-list text-secondary w-20px"></i> Danh sách</button></li>
                                <li class="d-none" data-ontabs="4"><button class="dropdown-item py-2 text-info" data-bs-target="#tab-sub-form" onclick="activateTab('tab-sub-form')"><i class="fa-solid fa-user-tag w-20px"></i> Khách hàng</button></li>
                                <li class="admin-only"><button class="dropdown-item py-2" data-bs-target="#tab-log" onclick="activateTab('tab-log')"><i class="fa-solid fa-history text-secondary w-20px"></i> Admin Log</button></li>
                                <li class="admin-only"><button class="dropdown-item py-2 text-danger fw-bold" data-bs-target="#tab-admin-dashboard" onclick="activateTab('tab-admin-dashboard')"><i class="fa-solid fa-user-shield w-20px"></i> Admin Dashboard</button></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </nav>
        `;
    }

    _getSearchAndFiltersHTML() {
        return `
            <div class="d-flex align-items-center gap-2">
                <div class="d-none" id="datalist-select" data-ontabs="3">
                    <select id="btn-select-datalist" class="form-select form-select-sm border-0 shadow-sm" style="max-width: 120px;"></select>
                </div>
                
                <div class="dropdown d-none" id="btn-group-download" data-ontabs="3">
                    <button class="btn btn-warning btn-sm dropdown-toggle shadow-sm" type="button" data-bs-toggle="dropdown" id="download-menu">
                        <i class="fa-solid fa-download"></i> Tải File
                    </button>
                    <div class="dropdown-menu border-0 shadow-sm" aria-labelledby="download-menu">
                        <button class="dropdown-item py-2" type="button" onclick="downloadData()"><i class="fa-solid fa-file-excel text-success w-20px"></i> File Excel</button>
                        <button class="dropdown-item py-2" type="button" onclick="downloadData('pdf')"><i class="fa-solid fa-file-pdf text-danger w-20px"></i> File PDF</button>
                    </div>
                </div>

                <form class="form-inline m-0">
                    <div class="input-group input-group-sm flex-center gap-0 bg-white rounded overflow-hidden shadow-sm">
                        <input type="text" id="global-search" class="form-control border-0" placeholder="Tìm kiếm..." oninput="if(typeof handleSearchClick === 'function') handleSearchClick()" style="box-shadow: none; width: 150px;">
                        <button class="btn btn-light text-primary border-0" type="button" onclick="if(typeof handleSearchClick === 'function') handleSearchClick()">
                            <i class="fa-solid fa-search"></i>
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    // --- CÁC HÀM TRÍCH XUẤT HTML THÀNH PHẦN (Giữ nguyên ID và Class cũ) ---

    _getNavTabsHTML() {
        return `
            <ul class="nav nav-tabs border-0" id="mainTabs" role="tablist">
                <li class="nav-item">
                    <button class="nav-link active fw-bold border-0 bg-transparent text-white" data-bs-target="#tab-dashboard" onclick="activateTab('tab-dashboard')">
                        <i class="fa-solid fa-chart-line text-warning"></i> Dashboard
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link border-0 bg-transparent text-white-50" data-bs-target="#tab-form" onclick="activateTab('tab-form')">Booking</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link border-0 bg-transparent text-white-50" data-bs-target="#tab-list" onclick="activateTab('tab-list')">Danh sách</button>
                </li>
                <li class="nav-item d-none" data-ontabs="4">
                    <button class="nav-link text-info border-0 bg-transparent" data-bs-target="#tab-sub-form" onclick="activateTab('tab-sub-form')">
                        <i class="fa-solid fa-user-tag"></i> Khách hàng
                    </button>
                </li>
                <li class="nav-item admin-only">
                    <button class="nav-link border-0 bg-transparent text-white-50" data-bs-target="#tab-log" onclick="activateTab('tab-log')">Admin Log</button>
                </li>
                <li class="nav-item admin-only">
                    <button class="nav-link text-warning border-0 bg-transparent" data-bs-target="#tab-admin-dashboard" onclick="activateTab('tab-admin-dashboard')">
                        <i class="fa-solid fa-user-shield"></i> Admin
                    </button>
                </li>
            </ul>
        `;
    }

    _getUserMenuHTML() {
        return `
            <div class="user-menu dropdown">
                <button class="btn btn-light btn-sm dropdown-toggle d-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" style="width: 32px; height: 32px; border-radius: 50%;">
                    <i class="fa-solid fa-user text-primary"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm mt-2" id="user-menu">
                    <li id="user-info-card" class="px-3 py-2 border-bottom bg-light">
                        <div class="text-dark small">
                            <div><strong id="user-menu-name">Guest</strong></div>
                            <div id="user-menu-email" class="text-muted" style="font-size: 0.85rem;"></div>
                        </div>
                    </li>
                    <li><button class="dropdown-item btn-sm py-2" id="btn-login-menu" onclick="A.Auth.showChoiceScreen()"><i class="fa-solid fa-sign-in-alt text-primary w-20px"></i> Đăng Nhập</button></li>
                    <li><button class="dropdown-item btn-sm py-2" id="btn-logout-menu" onclick="A.Auth.signOut()" style="display:none;"><i class="fa-solid fa-sign-out-alt text-danger w-20px"></i> Đăng Xuất</button></li>
                    <li class="manager-only">
                        <hr class="dropdown-divider">
                        <div class="px-3 py-1">
                            <select id="btn-select-masked-role" class="form-select form-select-sm fw-bold text-primary" onchange="if(typeof reloadSystemMode === 'function') reloadSystemMode(this.value);">
                                <option id="user-menu-role" value="" selected>-- Chọn Role --</option>
                                <option value="sale">Sales Mode</option>
                                <option value="op">Operator Mode</option>
                            </select>
                        </div>
                    </li>
                </ul>
            </div>
        `;
    }

    _getSettingsMenuHTML() {
        return `
            <div class="dropdown">
                <button class="btn btn-light btn-sm d-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" style="width: 32px; height: 32px; border-radius: 50%;">
                    <i class="fa-solid fa-gear text-secondary"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm mt-2">
                    <li><button class="dropdown-item btn-sm py-2" onclick="reloadPage()"><i class="fa-solid fa-rotate text-primary w-20px"></i> Reload ERP</button></li>
                    <li><button class="dropdown-item btn-sm py-2" onclick="if(typeof A.DB.syncDelta === 'function') A.DB.syncDelta()"><i class="fa-solid fa-cloud-arrow-down text-info w-20px"></i> Cập Nhật Dữ Liệu</button></li>
                    <li><button class="dropdown-item btn-sm py-2" onclick="if(typeof toggleFullScreen === 'function') toggleFullScreen()"><i class="fa-solid fa-expand text-secondary w-20px"></i> Toàn Màn Hình</button></li>
                    <li><hr class="dropdown-divider"></li>
                    <li class="admin-only"><button class="dropdown-item btn-sm py-2 text-success fw-bold bg-light" onclick="if(typeof openSettingsModal === 'function') openSettingsModal()"><i class="fa-solid fa-sliders w-20px"></i> Cài Đặt</button></li>
                    <li class="admin-only"><a class="dropdown-item btn-sm py-2" href="#" target="_blank"><i class="fa-solid fa-database text-primary w-20px"></i> Operator DB</a></li>
                    <li class="admin-only border-top mt-1 pt-1"><button class="dropdown-item btn-sm py-2 text-warning" onclick="if(typeof clearLocalCache === 'function') clearLocalCache()"><i class="fa-solid fa-trash w-20px"></i> Xóa Cache</button></li>
                </ul>
            </div>
        `;
    }

    _getNotificationWidgetHTML() {
        return `
            <div class="notification-widget dropdown position-relative mx-2">
                <button class="btn btn-warning btn-sm dropdown-toggle d-flex align-items-center justify-content-center position-relative shadow-sm border-0" type="button" id="notificationBellBtn" data-bs-toggle="dropdown" data-bs-auto-close="outside" style="width: 35px; height: 35px; border-radius: 50%;">
                    <i class="fa-solid fa-bell text-white" style="font-size: 1.2rem;"></i>
                    <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger shadow-sm d-none" id="notificationBadge" style="font-size: 0.65rem; border: 2px solid white;">0</span>
                </button>
                <div class="dropdown-menu dropdown-menu-end shadow-lg border-0 mt-2" id="notificationPanel" style="width: 340px; max-height: 80vh; overflow: hidden; border-radius: 12px; z-index: 1050;">
                    <div class="px-3 py-3 border-bottom bg-light d-flex justify-content-between align-items-center">
                        <h6 class="m-0 fw-bold text-dark">Thông báo <span class="badge bg-primary ms-1" id="notificationHeaderCount">0</span></h6>
                    </div>
                    <div id="notificationList" class="notification-list custom-scrollbar" style="max-height: 350px; overflow-y: auto;">
                        <div id="notificationEmptyState" class="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                            <i class="fa-regular fa-bell-slash fa-2x mb-2 opacity-50"></i>
                            <p class="small mb-0">Không có thông báo mới</p>
                        </div>
                    </div>
                    <div class="border-top bg-light p-2 d-flex justify-content-between">
                        <button class="btn btn-sm btn-link text-decoration-none text-muted" id="markAllReadBtn"><i class="fa-solid fa-check-double"></i> Đã đọc</button>
                        <button class="btn btn-sm btn-link text-decoration-none text-danger" id="clearAllBtn">Xóa tất cả</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * (Private) Logic ẩn hiện các phần tử dựa trên cấu hình Role
     */
    _applyRoleFilters() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Map class phân quyền
        const roleClassMap = {
            'sale': '.sales-only',
            'op': '.op-only',
            'acc': '.acc-only',
            'admin': '.admin-only',
            'manager': '.manager-only'
        };

        // 1. Ẩn tất cả các element có dính class phân quyền (reset trạng thái)
        Object.values(roleClassMap).forEach(selector => {
            const elements = container.querySelectorAll(selector);
            elements.forEach(el => {
                // Sử dụng !important thông qua style để đè lên các class d-flex nếu có
                el.style.setProperty('display', 'none', 'important'); 
            });
        });

        // 2. Mở lại các element thuộc quyền của user hiện tại
        if (this.currentRole === 'admin') {
            // Admin thấy tất cả
            Object.values(roleClassMap).forEach(selector => {
                const elements = container.querySelectorAll(selector);
                elements.forEach(el => {
                    el.style.removeProperty('display'); 
                });
            });
        } else {
            // User thường chỉ thấy role của mình
            const allowedSelector = roleClassMap[this.currentRole];
            if (allowedSelector) {
                const elements = container.querySelectorAll(allowedSelector);
                elements.forEach(el => {
                    el.style.removeProperty('display');
                });
            }
        }
    }
}