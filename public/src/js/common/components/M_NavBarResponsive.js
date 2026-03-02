/**
 * @class NavBarMenuController
 * @description Trình khởi tạo Nav Tabs động A-Z. Hỗ trợ Desktop ngang, Mobile Dropdown.
 *              Tích hợp hiệu ứng chuyển tab theo hướng (trái/phải) dựa vào vị trí tab.
 */
class NavBarMenuController {
  /**
   * @param {string} containerId - ID của thẻ <div> trống sẽ chứa menu
   * @param {Array} tabsData - Mảng Object chứa cấu hình các tab
   */
  constructor(containerId, tabsData) {
    this.containerId = containerId;
    this.tabsData = tabsData || [];
    this.container = document.getElementById(this.containerId);
    /** @type {number} Index của tab đang active, dùng để tính hướng animation */
    this.currentIndex = 0;

    this.init();
  }

  init() {
    try {
      if (!this.container) {
        console.warn(`[ResponsiveTabManager] Không tìm thấy vùng chứa #${this.containerId}`);
        return;
      }
      if (!this.tabsData || this.tabsData.length === 0) {
        console.warn(`[ResponsiveTabManager] Dữ liệu truyền vào rỗng cho #${this.containerId}`);
        return;
      }

      this._render();
      this._bindEvents();

      console.log(`[ResponsiveTabManager] Khởi tạo thành công menu tại #${this.containerId}`);
    } catch (error) {
      console.error(`[ResponsiveTabManager] Lỗi khởi tạo #${this.containerId}:`, error);
    }
  }

  _render() {
    try {
      // Xác định tab mặc định (ưu tiên isDefault: true, nếu không lấy phần tử đầu tiên)
      const defaultTab = this.tabsData.find((tab) => tab.isDefault) || this.tabsData[0];
      // Ghi nhớ index mặc định để tính hướng animation đúng
      this.currentIndex = this.tabsData.indexOf(defaultTab);

      let html = `
                <div class="rtm-container mb-3">
                    <button class="btn btn-outline-primary d-md-none align-items-center rtm-toggle-btn" type="button">
                        <span class="rtm-active-text fw-bold">
                            ${defaultTab.iconHtml || ''} ${defaultTab.title}
                        </span>
                        <i class="fa-solid fa-chevron-down rtm-chevron ms-2"></i>
                    </button>

                    <ul class="nav nav-tabs rtm-tabs-list" role="tablist">
            `;

      // Duyệt data để sinh thẻ HTML tương ứng
      this.tabsData.forEach((tab) => {
        const isActive = tab.id === defaultTab.id;
        const liClass = tab.liClass ? tab.liClass : ''; // Ví dụ: 'admin-only'
        const btnClass = tab.customClass ? tab.customClass : ''; // Ví dụ: 'fw-bold small'
        const onClickAttr = tab.onClickAttr ? `onclick="${tab.onClickAttr}"` : ''; // Ví dụ: onclick="selectTab('...')"
        const iconHtml = tab.iconHtml ? tab.iconHtml : '';

        html += `
                    <li class="nav-item ${liClass}" role="presentation">
                        <button 
                            class="nav-link ${btnClass} ${isActive ? 'active' : ''}" 
                            id="${tab.id}" 
                            data-bs-target="${tab.targetId}" 
                            data-bs-toggle="tab"
                            type="button" 
                            role="tab" 
                            aria-selected="${isActive}"
                            ${onClickAttr}
                        >
                            ${iconHtml}${tab.title}
                        </button>
                    </li>
                `;
      });

      html += `
                    </ul>
                </div>
            `;

      // Bơm HTML vào container
      this.container.innerHTML = html;

      // Gán các Element vào biến nội bộ của Class để xử lý sự kiện
      this.toggleBtn = this.container.querySelector('.rtm-toggle-btn');
      this.activeTextSpan = this.container.querySelector('.rtm-active-text');
      this.chevronIcon = this.container.querySelector('.rtm-chevron');
      this.tabList = this.container.querySelector('.rtm-tabs-list');
      this.tabLinks = this.container.querySelectorAll('.nav-link');
    } catch (error) {
      console.error(`[ResponsiveTabManager] Lỗi render DOM tại #${this.containerId}:`, error);
    }
  }

  /**
   * Tìm phần tử .tab-content tương ứng với các tab trong menu này.
   * Dựa vào data-bs-target của tab đầu tiên để định vị container cha.
   *
   * @returns {HTMLElement|null} Phần tử .tab-content hoặc null nếu không tìm thấy.
   */
  _findTabContent() {
    if (!this.tabsData.length) return null;
    const firstTargetId = this.tabsData[0].targetId;
    const firstPane = document.querySelector(firstTargetId);
    return firstPane?.closest('.tab-content') || firstPane?.parentElement || null;
  }

  /**
   * Đóng dropdown mobile và reset trạng thái chevron icon.
   */
  _closeDropdown() {
    this.tabList.classList.remove('show');
    this.toggleBtn.classList.remove('open');
  }

  _bindEvents() {
    try {
      // ─── 1. TOGGLE DROPDOWN (Mobile) ─────────────────────────────────────────
      this.toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = this.tabList.classList.toggle('show');
        // Xoay chevron theo trạng thái mở/đóng
        this.toggleBtn.classList.toggle('open', isOpen);
      });

      // ─── 2. ĐÓNG DROPDOWN KHI CLICK RA NGOÀI ────────────────────────────────
      document.addEventListener('click', (e) => {
        if (
          this.tabList &&
          this.tabList.classList.contains('show') &&
          !this.container.contains(e.target)
        ) {
          this._closeDropdown();
        }
      });

      // ─── 3. ANIMATION CHUYỂN TAB (tất cả thiết bị) ──────────────────────────
      // Dùng sự kiện `show.bs.tab` của Bootstrap — fires TRƯỚC khi tab được kích hoạt,
      // cho phép gắn direction trước khi pane trở nên visible.
      this.tabList.addEventListener('show.bs.tab', (e) => {
        const newLink = e.target; // Tab sắp được kích hoạt
        const oldLink = e.relatedTarget; // Tab hiện đang active

        // Lần đầu load không có relatedTarget → bỏ qua animation
        if (!oldLink) return;

        const links = [...this.tabLinks];
        const newIndex = links.findIndex((l) => l === newLink);
        const oldIndex = links.findIndex((l) => l === oldLink);

        if (newIndex === oldIndex || newIndex === -1 || oldIndex === -1) return;

        // Xác định hướng: tiến (sang phải) hay lùi (sang trái)
        const dir = newIndex > oldIndex ? 'forward' : 'backward';
        const tabContent = this._findTabContent();

        if (tabContent) {
          tabContent.setAttribute('data-rtm-dir', dir);

          // Dọn dẹp attribute sau khi animation kết thúc
          const targetPaneId = newLink.getAttribute('data-bs-target');
          const targetPane = document.querySelector(targetPaneId);
          if (targetPane) {
            targetPane.addEventListener(
              'animationend',
              () => tabContent.removeAttribute('data-rtm-dir'),
              { once: true }
            );
          }
        }

        this.currentIndex = newIndex;
      });

      // ─── 4. CẬP NHẬT LABEL MOBILE KHI CHỌN TAB ──────────────────────────────
      this.tabLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
          const selectedBtn = e.currentTarget;

          // Cập nhật giao diện nút Mobile bằng chính nội dung của Tab vừa chọn
          if (this.activeTextSpan) {
            this.activeTextSpan.innerHTML = selectedBtn.innerHTML;
          }

          // Đóng dropdown sau khi chọn
          this._closeDropdown();
        });
      });
    } catch (error) {
      console.error(`[ResponsiveTabManager] Lỗi gán sự kiện tại #${this.containerId}:`, error);
    }
  }
}

export default NavBarMenuController;
