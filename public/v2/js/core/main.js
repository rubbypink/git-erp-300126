/**
 * MAIN CONTROLLER V2
 * Orchestrates the app startup
 */

// Import các module cần thiết (nếu chúng hỗ trợ ES6 module)
// Hiện tại firebase, utils đang là global, nên ta dùng trực tiếp

export const MainController = {
    
    init: async function() {
        console.log("🚀 System v2 Starting...");
        
        // 1. Init Firebase (Tái sử dụng code cũ nhưng viết gọn lại)
        if (!firebase.apps.length) firebase.initializeApp(APP_CONFIG.firebase);
        window.db = firebase.firestore(); // Gán vào window để các file cũ dùng được
        window.auth = firebase.auth();

        // 2. Load Shell Components (Header, Footer, Overlays)
        // Chạy song song để nhanh
        await Promise.all([
            ComponentLoader.render('region-header', APP_CONFIG.components.header),
            ComponentLoader.render('region-footer', APP_CONFIG.components.footer),
            ComponentLoader.render('region-overlays', APP_CONFIG.components.overlays)
        ]);

        // 3. Auth Check
        auth.onAuthStateChanged(async (user) => {
            const appRoot = document.getElementById('app-root');
            
            if (user) {
                console.log("🔓 User Authenticated:", user.email);
                
                // 3.1 Load User Profile (Logic cũ)
                // Giả lập gọi hàm fetchUserProfile từ login_module cũ
                // Ở bước sau ta sẽ refactor login_module thành module chuẩn
                // Tạm thời hiển thị Dashboard
                
                this.loadModuleContext(); 

                appRoot.style.opacity = 1;
            } else {
                console.warn("🔒 User not logged in");
                // Load Login Form Modal
                ComponentLoader.render('region-overlays', APP_CONFIG.components.login, 'append');
                // Trigger mở modal (Bootstrap logic)
                // const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
                // loginModal.show();
            }
        });
    },

    /**
     * Logic fake role / switch module
     */
    loadModuleContext: async function() {
        // Check localStorage xem admin đã chọn module nào chưa
        const savedModule = localStorage.getItem('ACTIVE_MODULE_CONTEXT') || 'SALES';
        const moduleConfig = APP_CONFIG.modules[savedModule];

        console.log(`📦 Loading Context: ${moduleConfig.name}`);

        // Load Main Content của Module đó
        // Ví dụ: Load Dashboard của Sales
        const container = document.getElementById('region-main');
        container.innerHTML = `<h3 class="p-3">Module: ${moduleConfig.name}</h3>`;
        
        // Load Scripts riêng của module (Load logic cũ)
        if (moduleConfig.scripts && moduleConfig.scripts.length) {
            for (const scriptSrc of moduleConfig.scripts) {
                await this.loadScript(scriptSrc);
            }
        }
    },

    loadScript: function(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
};