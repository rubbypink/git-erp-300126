/**
 * Lớp Định Tuyến (SPA Router) cho 9 Trip ERP
 * Tự động khởi tạo, quản lý URL, Role và các Route cơ bản
 */
class AppRouter {
  constructor() {
    this.routes = [];
    this.currentPath = null;

    // Đăng ký các route cơ bản ngay khi khởi tạo
    this._registerBaseRoutes();

    // Khởi chạy router
    this.init();
  }

  add(path, handler) {
    const regexPath = path.replace(/:\w+/g, '([^\\/]+)');
    const regex = new RegExp(`^${regexPath}$`);
    this.routes.push({ path, regex, handler });
    return this;
  }

  navigate(path) {
    if (this.currentPath === path) return;
    window.history.pushState(null, '', path);
    this.resolve();
  }

  /**
   * Trích xuất và cập nhật Role từ tham số URL (VD: ?role=admin)
   */
  _checkAndApplyUrlRole() {
    const urlParams = new URLSearchParams(window.location.search);
    const roleOverride = urlParams.get('role');

    if (roleOverride) {
      // Giả sử CURRENT_USER là biến global (window.CURRENT_USER)
      window.CURRENT_USER = window.CURRENT_USER || {};
      window.CURRENT_USER.role = roleOverride.toLowerCase();
      L._(`🔥 [Router] Đã ghi đè Role từ URL thành: ${window.CURRENT_USER.role}`);
    }
  }

  /**
   * Đăng ký các đường dẫn cơ bản của hệ thống
   * (Các module khác có thể import router và dùng router.add() để thêm route sau)
   */
  _registerBaseRoutes() {
    this.add('/admin', () => {
      if (window.A && A.AdminConsole) A.AdminConsole.openAdminSettings();
    })
      .add('/settings', () => {
        if (typeof openSettingsModal === 'function') openSettingsModal();
      })
      .add('/login', () => {
        A.Auth.auth.signOut().then(() => {
          A.DB.stopNotificationsListener(); // Hủy tất cả subscription khi logout
          StateProxy.clearSession(); // Xóa session API
          A.Auth.showLoginForm();
        });
      })
      .add('/logout', () => {
        if (typeof A.Auth.signOut === 'function') A.Auth.signOut();
        else if (window.firebase) firebase.auth().signOut();
      })
      .add('/flight', () => {
        window.open('https://flight.9tripvietnam.com', '_blank');

        // (Tùy chọn) Đưa user quay lại trang trước đó trong ERP để URL không bị kẹt ở /flight
        window.history.back();
      })
      .add('/', () => {
        // Route mặc định có thể để trống hoặc redirect đến dashboard
        // this.navigate('/dashboard');
      });
  }

  resolve() {
    // 1. Luôn quét tham số URL để cập nhật role trước khi render
    this._checkAndApplyUrlRole();

    const targetPath = window.location.pathname;

    // 🔥 CHỐT CHẶN VÒNG LẶP VÔ HẠN (ANTI-INFINITE LOOP)
    // Nếu đường dẫn (pathname) không thay đổi (chỉ do Modal đẩy hash hoặc Iframe load)
    // thì tuyệt đối KHÔNG chạy lại route handler để tránh render đè liên tục.
    if (this.currentPath === targetPath) {
      // L._('⏸️ Bỏ qua render do pathname không đổi:', targetPath);
      return;
    }

    // Cập nhật lại currentPath mới
    this.currentPath = targetPath;
    let matchFound = false;

    for (const route of this.routes) {
      const match = this.currentPath.match(route.regex);
      if (match) {
        matchFound = true;
        const params = match.slice(1);
        L._(`✅ Route matched: ${route.path} → Handler: ${route.handler.name || 'anonymous'}`);
        try {
          route.handler(...params);
        } catch (error) {
          console.error(`❌ Lỗi render route ${route.path}:`, error);
        }
        break;
      }
    }

    if (!matchFound && this.currentPath !== '/') {
      console.warn('⚠️ Route 404:', this.currentPath);
    }
  }

  init() {
    window.addEventListener('popstate', () => this.resolve());

    document.body.addEventListener('click', (e) => {
      const target = e.target.closest('a[data-link]');
      if (target) {
        e.preventDefault();
        this.navigate(target.getAttribute('href'));
      }
    });
    L._('🚀 Router đã khởi tạo và lắng nghe sự kiện popstate cũng như click trên các link [data-link]');

    // Chạy resolve ngay lần đầu load trang
    // Dùng setTimeout để đảm bảo các biến global (như CURRENT_USER, A) đã kịp khởi tạo
    setTimeout(() => this.resolve(), 0);
  }
}

// KHỞI TẠO NGAY LẬP TỨC: Export instance đã được new
// Mọi xử lý sẽ tự động chạy ngầm mà app.js không cần gọi lại
const Router = new AppRouter();
export default Router;
