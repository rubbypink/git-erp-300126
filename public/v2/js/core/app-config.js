/**
 * APP CONFIGURATION V2
 * Centralized configuration for 9Trip ERP
 */

const APP_CONFIG = {
    env: 'production',
    version: '2.0.0-beta',
    rootContainer: "#app-root",

    // 1. FIREBASE CONFIG (Lấy từ login_module.js cũ)
    firebase: {
        apiKey: "AIzaSyAhBOSEAGKN5_8_lfWSPLzQ5gBBd33Jzdc",
        authDomain: "trip-erp-923fd.firebaseapp.com",
        projectId: "trip-erp-923fd",
        storageBucket: "trip-erp-923fd.firebasestorage.app",
        messagingSenderId: "600413765548",
        appId: "1:600413765548:web:bc644e1e58f7bead5d8409",
        measurementId: "G-BG2ECM4R89"
    },

    // 2. API ENDPOINTS (Lấy từ index.html cũ)
    api: {
        gasUrl: "https://script.google.com/macros/s/AKfycby_54qWXvDLG3Jm6s-jAH75S6dO1L6X1rmHrnqJ5I2CQBw4QQa1t3u4QKcEA98kI8qV/exec",
        sheetSales: "https://docs.google.com/spreadsheets/d/1E54Ibp0WvH2c4fFEbXdneuxSLK_qc6ClV2qwQM7AFMw/edit",
        sheetOp: "https://docs.google.com/spreadsheets/d/176ik2ueN6UvUFbjrmrIag2tJY18hgbAqUPhDInG7cdo/edit"
    },

    // 3. COMPONENT PATHS (Cho Loader)
    rootPath: '.', 

    // Helper để tạo đường dẫn chuẩn
    path: function(relPath) {
        // Loại bỏ dấu ./ hoặc / ở đầu để tránh trùng lặp
        const cleanPath = relPath.replace(/^(\.\/|\/)/, '');
        return `${this.rootPath}/${cleanPath}`;
    },

    // 2. COMPONENT PATHS (Dùng hàm path ở trên)
    components: {
        header: 'components/layout/header.html',
        footer: 'components/layout/footer.html',
        overlays: 'components/common/overlays.html',
        login: 'components/auth/login-modal.html',
    },

    // 4. MODULE DEFINITIONS
    modules: {
        currentId: null, // Đặt động khi user chọn module
        BASE: {
            views: {
                dashboard: `js/modules/${this.currentId}/views/dashboard.html`,
                form: `js/modules/${this.currentId}/views/main-form.html`
            },
            scripts: [`js/modules/${this.currentId}/${this.currentId}.controller.js`, `js/modules/${this.currentId}/${this.currentId}.config.js`]
        },
        SALES: {
            id: 'sales', name: 'Kinh Doanh',
            views: {
                customer_form: `js/modules/sales/views/customer-form.html`,
                confirmation_form: `js/modules/sales/views/confirmation-form.html`
            },

        },
        OPERATOR: {
            id: 'operator',
            name: 'Điều Hành',
        },
        ACCOUNT: {
            id: 'account',
            name: 'Kế Toán',
        },
        ADMIN: {
            id: 'admin',
            name: 'Quản Trị',
        }
    }
};

// Export global để các file cũ (utils, renderer) có thể đọc được nếu cần
window.APP_CONFIG = APP_CONFIG;