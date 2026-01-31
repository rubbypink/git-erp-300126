

import {PriceController} from './modules/M_HotelPrice.js';
import {SalesPricing} from './modules/M_SalesPricing.js';

// --- 3. MAIN CONTROLLER ---
async function initApp() {
    try {
          log('🚀 [INIT] Bắt đầu khởi tạo...' + CURRENT_USER.role);
          // Khởi tạo Firebase trước
          await initFirebase();
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

function test() {
  const val = getVal('test-input');
  
  if (!val) {
    logA('Vui lòng nhập mã lệnh hoặc tên hàm', 'warning');
    return;
  }
  
  try {
    // Cách 1: Thử chạy val như một function call/expression (ví dụ: myFunc(arg1, arg2))
    const fn1 = new Function(`return (${val.trim()})`);
    fn1();
  } catch (e1) {
    try {
      // Cách 2: Nếu cách 1 thất bại, thử tạo function mới với nội dung là val
      const fn2 = new Function(val.trim());
      fn2();
    } catch (e2) {
      logA(`Lỗi khi thực thi: ${e2.message}`, 'danger');
    }
  }
}

// 2. Lắng nghe sự kiện DOM Ready
//   document.addEventListener('DOMContentLoaded', initApp);


window.addEventListener('load', async function() {
    try {
          UI_RENDERER.renderTemplate('body', 'tpl_all.html', false, '.app-container');
          await initApp();
          onEvent('btn-admin-test', 'click', (e) => {test()});
           // Xoá modal full cũ nếu có
           if (CURRENT_USER.role === 'op') {
            const modal = document.querySelector('at-modal-full');
            const pc = new PriceController('dynamic-modal-full-body');
            modal.show();
           }

          
    } catch (e) {
        console.error("Critical Error:", e);
        document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
    }
});