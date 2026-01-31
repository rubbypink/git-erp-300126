

import './common/components/modal_full.js';
import {PriceController} from './modules/M_HotelPrice.js';
import {PriceManager} from './modules/M_PriceManager.js';
import {ServicePriceController} from './modules/M_ServicePrice.js';
import {DynamicDataManager} from './modules/M_DynamicTableFB.js';



// --- 3. MAIN CONTROLLER ---
async function initApp() {
    try {
          log('🚀 [INIT] Bắt đầu khởi tạo...' + CURRENT_USER.role);
          setTimeout(async () => {
            await initFirebase();
          }, 500);
          // Khởi tạo Firebase trước
          
          // Bắt đầu lắng nghe Auth -> Logic sẽ chảy về AUTH_MANAGER
          // AUTH_MANAGER.monitorAuth(); 
          // B1. UI FIRST: Render khung sườn Dashboard (chưa có số liệu)
          await UI_RENDERER.init(); 
          
          // B2. EVENTS: Gán sự kiện
          setupStaticEvents();
          initShortcuts();
          showLoading(false);

    } catch (e) {
        logError("Lỗi khởi động!", e);
    }
}

// 2. Lắng nghe sự kiện DOM Ready
//   document.addEventListener('DOMContentLoaded', initApp);
window.addEventListener('load', async function() {
    try {
          UI_RENDERER.renderTemplate('body', 'tpl_all.html', false, '.app-container');
          await initApp();
          
    } catch (e) {
        console.error("Critical Error:", e);
        document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
    }
});