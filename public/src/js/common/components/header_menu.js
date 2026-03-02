/**
 * Module: ErpHeaderMenu
 * Chức năng: Quản lý Header của hệ thống (Logo, NavTabs, Global Search, User, Settings, Notifications)
 * Cơ chế: Tự động dàn layout Desktop/Mobile và ẩn/hiện element theo Role.
 */
export default class ErpHeaderMenu {
  constructor(containerId = 'nav-container') {
    this.containerId = containerId;
    this.currentRole = CURRENT_USER.realrole ? CURRENT_USER.realrole : CURRENT_USER.role || 'guest';
    this.config = { height: '60px', zIndex: '1040', bgColor: '#0d6efd' };
    this._initialized = false;

    // [SỬA LỖI]: Bơm HTML ngay lập tức (Đồng bộ) để giữ chỗ ID cho Firebase Auth bắn dữ liệu vào
    this._injectStyles();
    this._renderLayout();
    this._initClickOutside();
    this.init();
  }

  async init() {
    if (this._initialized) {
      console.warn('[ERP Header Menu] Đã khởi tạo rồi, bỏ qua...');
      return;
    }
    this._initialized = true;
    try {
      if (!this.currentRole || this.currentRole === 'guest') {
        this.currentRole = CURRENT_USER.realrole
          ? CURRENT_USER.realrole
          : CURRENT_USER.role || 'sale';
        this._applyRoleFilters(); // Chỉ chạy CSS filter sau khi đã có Role
      }
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
                
                /* Mobile: Reorder elements bằng flexbox order - ĐẶT 1 HÀNG */
                .erp-header-inner {
                    flex-wrap: nowrap;
                    padding: 0.5rem 1.5rem;
                }
                .erp-header-inner > div:nth-child(1) { /* Logo */
                    order: 1;
                    flex-shrink: 0;
                }
                .erp-header-inner > div:nth-child(3) { /* Content wrapper - Settings + Notification + Hamburger */
                    order: 2;
                    width: auto;
                    display: flex !important;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 0.5rem;
                    flex-shrink: 0;
                }
                
                /* Reorder inside content wrapper */
                .erp-header-inner > div:nth-child(3) > div:nth-child(1) { /* Search - ẩn */
                    display: none !important;
                }
                .erp-header-inner > div:nth-child(3) > div:nth-child(2) { /* Settings menu */
                    order: 1;
                }
                .erp-header-inner > div:nth-child(3) > div:nth-child(3) { /* Notification widget */
                    order: 3;
                }
                .erp-header-inner > div:nth-child(3) > div:nth-child(4) { /* Hamburger menu */
                    order: 2;
                }
                
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
                            class="bg-transparent rounded-circle main-logo" alt="9Trip Logo" onclick="A.DB.stopNotificationsListener(); reloadPage();"
                            style="height: 40px; width: auto; object-fit: contain;">
                    </a>

                    <div class="erp-desktop-tabs d-none d-lg-flex align-items-center flex-grow-1 px-3">
                        ${this._getNavTabsHTML()}
                        <h5 id="module-title" class="m-0 fw-bold text-uppercase text-white ms-auto d-none d-xl-block" style="letter-spacing: 1px; font-size: 1.1rem;">
                            ADMIN MANAGEMENT
                        </h5>
                    </div>

                    <div class="d-flex align-items-center justify-content-between gap-2">
                        
                        <div class="d-none d-md-block">
                            ${this._getSearchAndFiltersHTML()}
                        </div>

                        
                        ${this._getSettingsMenuHTML()}
                        
                        ${this._getNotificationWidgetHTML()}

                        <div class="erp-header flex-center d-lg-none ms-1">
                            <button class="btn btn-light btn-sm d-flex align-items-center justify-content-center" type="button" data-bs-toggle="dropdown" style="width: 36px; height: 36px; border-radius: 50%;">
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
                    <select id="btn-select-datalist" class="form-select form-select-sm border-0 shadow-sm" style="width: 8rem;"></select>
                </div>
                
                
                <div class="dropdown d-none" id="btn-group-download" data-ontabs="3">
                    <button class="btn btn-warning btn-sm dropdown-toggle shadow-sm" type="button" data-bs-toggle="dropdown" id="download-menu">
                        <i class="fa-solid fa-download"></i> Tải...
                    </button>
                    <div class="dropdown-menu border-0 shadow-sm" aria-labelledby="download-menu">
                        <button class="dropdown-item py-2" type="button" onclick="downloadData()"><i class="fa-solid fa-file-excel text-success w-20px"></i> File Excel</button>
                        <button class="dropdown-item py-2" type="button" onclick="downloadData('pdf')"><i class="fa-solid fa-file-pdf text-danger w-20px"></i> File PDF</button>
                        <button id="btn-reload-collection" class="dropdown-item py-2" type="button"><i class="fa-solid fa-sync-alt"></i> Cập Nhật Dữ Liệu</button>
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

  _getSettingsMenuHTML() {
    return `
            <div class="erp-header d-flex justify-content-end shadow-sm">
                <button id="erp-menu-trigger" class="chrome-trigger-btn" aria-label="Menu" title="Menu">
                <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
                
                <div id="erp-menu-container" class="erp-menu-dropdown d-none">
                    </div>
            </div>
            <style>
            /* ==========================================
            2. CSS: CHROME UI, DARK THEME & MOBILE RESPONSIVE
             ========================================== */
             :root {
                 --erp-menu-bg: #e9e7e7;
                 --erp-menu-text: #333333;
                 --erp-menu-hover: #f1f3f4;
                 --erp-menu-divider: #e8eaed;
                 --erp-icon-color: #a7991e;
             }
             
             body.dark-theme {
                 --erp-menu-bg: #282a2d;
                 --erp-menu-text: #e8eaed;
                 --erp-menu-hover: #3c4043;
                 --erp-menu-divider: #4a4d51;
                 --erp-icon-color: #9aa0a6;
             }
             
             /* Nút Trigger 3 chấm */
             .chrome-trigger-btn {
                 background-color: var(--erp-menu-bg);
                 border: 1px solid var(--erp-menu-divider);
                 width: 36px;
                 min-width: 36px;
                 height: 36px;
                 border-radius: 50%;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 color: var(--erp-icon-color);
                 font-size: 22px;
                 cursor: pointer;
                 transition: background-color 0.2s ease;
             }
             .chrome-trigger-btn:hover, .chrome-trigger-btn:focus {
                 background-color: var(--erp-menu-hover); 
                 outline: none;
             }
             body.dark-theme .chrome-trigger-btn:hover {
                 background-color: rgba(255, 255, 255, 0.1); 
             }
             
             /* Khung Menu Chính */
             .erp-menu-dropdown {
                 position: absolute;
                 top: 50px;
                 right: 15px;
                 background-color: var(--erp-menu-bg);
                 border: 1px solid var(--erp-menu-divider);
                 border-radius: 8px;
                 box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                 width: 260px;
                 padding: 8px 0;
                 z-index: 1000;
                 font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                 font-size: 0.85rem;
                 color: var(--erp-menu-text);
             }
             
             /* Item cơ bản */
             .erp-menu-item {
                 display: flex;
                 align-items: center;
                 padding: 6px 16px;
                 font-size: 0.8rem;
                 cursor: pointer;
                 transition: background-color 0.2s;
                 text-decoration: none;
                 color: inherit;
             }
             .erp-menu-item:hover {
                 background-color: var(--erp-menu-hover);
             }
             .erp-menu-item i.menu-icon {
                 font-size: 0.8rem;
                 width: 24px; 
                 text-align: center;
                 margin-right: 12px;
                 color: var(--erp-icon-color);
             }
             .erp-menu-divider {
                 height: 1px;
                 background-color: var(--erp-menu-divider);
                 margin: 6px 0;
             }
             
             /* Box điều khiển Zoom */
             .chrome-zoom-controls {
                 display: flex;
                 align-items: center;
                 border: 1px solid var(--erp-menu-divider);
                 border-radius: 4px;
                 overflow: hidden;
             }
             .chrome-zoom-controls button {
                 background: transparent;
                 border: none;
                 color: var(--erp-menu-text);
                 padding: 2px 5px;
                 cursor: pointer;
             }
             .chrome-zoom-controls button:hover {
                 background-color: var(--erp-menu-hover);
             }
             .chrome-zoom-controls span {
                 padding: 0 8px;
                 font-weight: 500;
             }
             
             /* Submenu & Hiệu ứng mũi tên */
             .erp-submenu {
                 position: relative;
             }
             .submenu-arrow {
                 transition: transform 0.2s ease;
             }
             
             /* Màn hình lớn: Desktop Hover sang trái */
             @media (min-width: 769px) {
                 .erp-submenu-content {
                     display: none;
                     position: absolute;
                     top: -8px;
                     right: 100%;
                     background-color: var(--erp-menu-bg);
                     border: 1px solid var(--erp-menu-divider);
                     border-radius: 8px;
                     box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                     width: 250px;
                     padding: 8px 0;
                     z-index: 1001;
                 }
                 .erp-submenu:hover > .erp-submenu-content {
                     display: block;
                 }
             }
             
             /* Màn hình nhỏ: Mobile Accordion xổ dọc */
             @media (max-width: 768px) {
                 .erp-submenu-content {
                     display: none;
                     position: static;
                     width: 100%;
                     box-shadow: inset 0 3px 6px rgba(0,0,0,0.04);
                     border: none;
                     border-radius: 0;
                     background-color: var(--erp-menu-hover);
                     padding-left: 15px;
                     margin-top: 4px;
                 }
                 .erp-submenu.active > .erp-submenu-content {
                     display: block;
                 }
                 .erp-submenu.active > .erp-menu-item .submenu-arrow {
                     transform: rotate(90deg);
                 }
             }
            </style>
        `;
  }

  _getNotificationWidgetHTML() {
    return `
            <div class="notification-widget dropdown position-relative me-2">
                <button class="btn btn-warning btn-sm dropdown-toggle d-flex align-items-center justify-content-center position-relative shadow-sm border-0" type="button" id="notificationBellBtn" data-bs-toggle="dropdown" data-bs-auto-close="outside" style="width: 36px; height: 36px; border-radius: 50%;">
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
   * (Private) Đăng ký event click-outside để đóng tất cả custom dropdown trong header.
   * Xử lý:
   *   1. Toggle #erp-menu-container khi click #erp-menu-trigger
   *   2. Accordion submenu (.erp-submenu) trên mobile
   *   3. Click ngoài vùng menu → ẩn tất cả + disable pointer-events
   */
  _initClickOutside() {
    // ── Handler duy nhất — 3 case xử lý tuần tự, return sớm để tránh chồng lấn ──
    const handler = (e) => {
      const trigger = document.getElementById('erp-menu-trigger');
      const menu = document.getElementById('erp-menu-container');

      // ── 1. Toggle settings menu ──
      if (trigger && trigger.contains(e.target)) {
        const isHidden = menu.classList.contains('d-none');
        menu.classList.toggle('d-none', !isHidden);
        menu.style.pointerEvents = isHidden ? 'auto' : 'none';
        return;
      }

      // ── 2. Mobile accordion cho .erp-submenu ──
      const submenuTrigger = e.target.closest('.erp-submenu > .erp-menu-item');
      if (submenuTrigger && menu && menu.contains(submenuTrigger)) {
        const submenu = submenuTrigger.closest('.erp-submenu');
        menu.querySelectorAll('.erp-submenu.active').forEach((el) => {
          if (el !== submenu) el.classList.remove('active');
        });
        submenu.classList.toggle('active');
        return;
      }

      // ── 3. Click ngoài → đóng settings menu ──
      if (menu && !menu.classList.contains('d-none')) {
        const wrapper = document.querySelector('.erp-header');
        if (!wrapper || !wrapper.contains(e.target)) {
          menu.classList.add('d-none');
          menu.style.pointerEvents = 'none';
          menu
            .querySelectorAll('.erp-submenu.active')
            .forEach((el) => el.classList.remove('active'));
        }
      }
    };

    // Dùng A.Event.on để được auto-cleanup + dedup qua _listenerRegistry.
    // Fallback về native nếu A chưa khởi tạo (trường hợp header render trước app boot).
    if (typeof window.A?.Event?.on === 'function') {
      A.Event.on(document, 'click', handler, true);
    } else {
      document.addEventListener('click', handler);
    }
  }

  /**
   * (Private) Logic ẩn hiện các phần tử dựa trên cấu hình Role
   */
  _applyRoleFilters() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Map class phân quyền
    const roleClassMap = {
      sale: '.sales-only',
      op: '.op-only',
      acc: '.acc-only',
      admin: '.admin-only',
      manager: '.manager-only',
    };

    // 1. Ẩn tất cả các element có dính class phân quyền (reset trạng thái)
    Object.values(roleClassMap).forEach((selector) => {
      const elements = container.querySelectorAll(selector);
      elements.forEach((el) => {
        // Sử dụng !important thông qua style để đè lên các class d-flex nếu có
        el.style.setProperty('display', 'none', 'important');
      });
    });

    // 2. Mở lại các element thuộc quyền của user hiện tại
    if (this.currentRole === 'admin') {
      // Admin thấy tất cả
      Object.values(roleClassMap).forEach((selector) => {
        const elements = container.querySelectorAll(selector);
        elements.forEach((el) => {
          el.style.removeProperty('display');
        });
      });
    } else {
      // User thường chỉ thấy role của mình
      const allowedSelector = roleClassMap[this.currentRole];
      if (allowedSelector) {
        const elements = container.querySelectorAll(allowedSelector);
        elements.forEach((el) => {
          el.style.removeProperty('display');
        });
      }
    }
  }
}
