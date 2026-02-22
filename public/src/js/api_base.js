

  /**
   * Hàm khởi động lại App và chuyển chế độ (Chỉ dành cho Admin)
   * @param {string} modeCode - Mã Role muốn chuyển: 'SALE', 'OPERATOR', 'ACC'
   */
    function reloadSystemMode(modeCode) {
        const roleData = {
            realRole: CURRENT_USER.role,
            maskedRole: modeCode
        };
        localStorage.setItem('erp-mock-role', JSON.stringify(roleData));
        log('🎭 Chuyển chế độ thành công sang: ' + Object.values(roleData).join(' -> ') + '. Đang tải lại trang...');
        window.location.reload();
    }

  function handleServerError(err) {
    logError("Lỗi kết nối: " + err.message);
    handleRetry("Lỗi kết nối: " + err.message);
  }

  /**
   * Logic quyết định Thử lại hay Dừng
   */
  function handleRetry(reason) {

    if (retryCount < MAX_RETRIES) {
        retryCount++;
        // Chờ 2s rồi gọi lại hàm load
        log('handleRetry run lần: ', retryCount);
        setTimeout(loadDataFromFirebase, RETRY_DELAY);
    } else {
        // Đã thử hết số lần cho phép -> Báo lỗi chết (Fatal Error)
        showLoading(false);
        const errorMsg = `Không thể kết nối Server sau ${MAX_RETRIES} lần thử.\nNguyên nhân: ${reason}\n\nVui lòng nhấn F5 để tải lại trang.`;
        log("FATAL ERROR: " + reason, "error");
    }
  }


  // ⏱️ Throttle variable cho handleSearchClick (max 1 lần/giây)
  let _lastSearchClickTime = 0;
  const SEARCH_THROTTLE_MS = 500;

  /**
   * ✨ TỐI ƯU: Tìm kiếm bookings và hiển thị datalist
   * - Tìm trong APP_DATA.bookings_obj (3 field: id, customer_name, customer_phone)
   * - Trả về max 10 hàng mới nhất (sắp xếp theo start_date)
   * - Hiển thị datalist với format "id - customer_name"
   * - Gọi onGridRowClick khi chọn item
   * ⏱️ Giới hạn: Chỉ chạy 1 lần mỗi 1 giây (throttle)
   */
  function handleSearchClick() {
    // ⏱️ THROTTLE: Kiểm tra thời gian kể từ lần gọi cuối
    const now = Date.now();
    if (now - _lastSearchClickTime < SEARCH_THROTTLE_MS) {
      return; // Bỏ qua nếu chưa đủ 0.5 giây
    }
    _lastSearchClickTime = now;

    const searchInput = getE('global-search');
    const kRaw = searchInput?.value;
    const k = String(kRaw ?? '').trim();
    
    if (!k) { 
      logA("Vui lòng nhập từ khóa (ID, Tên, SĐT)!"); 
      return; 
    }

    try {
        // Lấy dữ liệu bookings_obj
        const bookingsObj = (window.APP_DATA && Array.isArray(APP_DATA.bookings_obj)) 
            ? APP_DATA.bookings_obj 
            : [];
        
        if (!bookingsObj || bookingsObj.length === 0) {
            logA('Chưa có dữ liệu bookings để tìm kiếm!', 'warning');
            return;
        }

        // Chuẩn hóa từ khóa
        const normText = (s) => String(s ?? '').toLowerCase().trim();
        const normPhone = (s) => String(s ?? '').replace(/\D+/g, '');
        const kText = normText(k);
        const kPhone = normPhone(k);

        // Tìm kiếm trong 3 field: id, customer_name, customer_phone
        const results = bookingsObj.filter(row => {
            if (!row) return false;
            
            const id = normText(row.id || '');
            const name = normText(row.customer_name || '');
            const phone = normPhone(row.customer_phone || '');
            
            return id.includes(kText) || 
                   name.includes(kText) || 
                   (kPhone && phone.includes(kPhone));
        });

        if (results.length === 0) {
            logA('Không tìm thấy booking phù hợp!', 'warning');
            return;
        }

        // Sắp xếp theo start_date giảm dần (mới nhất trước)
        const sorted = results.sort((a, b) => {
            const dateA = new Date(a.start_date || 0);
            const dateB = new Date(b.start_date || 0);
            return dateB - dateA;
        });

        // Tối đa 10 kết quả
        const topResults = sorted.slice(0, 10);

        // ✨ TỐI ƯU: Nếu chỉ có 1 kết quả -> Hỏi người dùng có load luôn không
        if (topResults.length === 1) {
            const result = topResults[0];
            const confirmMsg = `Tìm thấy 1 kết quả:\n\nID: ${result.id}\nTên: ${result.customer_name || 'N/A'}\n\nLoad dữ liệu booking này không?`;
            
            logA(confirmMsg, 'info', async () => {
                if (typeof onGridRowClick === 'function') {
                    onGridRowClick(result.id);
                    log(`✅ Mở booking: ${result.id}`, 'success');
                }
                // Clear input sau khi chọn
                searchInput.value = '';
            });
            return; // Dừng tại đây, không populate datalist
        }

        // Populate datalist nếu có > 1 kết quả
        _populateSearchDatalist(topResults, searchInput);
        log(`🔍 Tìm thấy ${topResults.length} kết quả`, 'info');

    } catch (error) {
        console.error("Lỗi search:", error);
        logError("Lỗi tìm kiếm: " + error.message);
    }
  }

  /**
   * Helper: Populate HTML5 datalist với kết quả tìm kiếm
   * @param {Array} results - Danh sách booking objects
   * @param {HTMLElement} inputElement - Input element để attach datalist
   */
  function _populateSearchDatalist(results, inputElement) {
    if (!inputElement) return;

    // Tìm hoặc tạo datalist
    let datalist = document.getElementById('search-bookings-datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'search-bookings-datalist';
        document.body.appendChild(datalist);
        inputElement.setAttribute('list', 'search-bookings-datalist');
    }

    // Xóa danh sách cũ
    datalist.innerHTML = '';

    // Populate với kết quả (dạng "id - customer_name")
    results.forEach(row => {
        const option = document.createElement('option');
        option.value = row.id;
        option.textContent = `${row.id} - ${row.customer_name || 'N/A'}`;
        datalist.appendChild(option);
    });

    // Thêm event listener cho việc chọn option
    // Sử dụng 'change' event để detect khi user chọn từ datalist
    inputElement.onchange = function() {
        const selectedValue = this.value;
        const selectedRow = results.find(r => r.id === selectedValue);
        
        if (selectedRow) {
            // Gọi onGridRowClick với id
            if (typeof onGridRowClick === 'function') {
                onGridRowClick(selectedValue);
                log(`✅ Mở booking: ${selectedValue}`, 'success');
            }
            // Clear input sau khi chọn
            this.value = '';
        }
    };
  }

  /**
   * 2. Hàm Xóa Item trong Database
   * @param {string} id - ID của item cần xóa
   * @param {string} dataSource - Tên bảng (bookings, booking_details, customer...), mặc định 'booking_details'
   */
  async function deleteItem(id, dataSource = 'booking_details') {
      if (!id) {
          logA("Không tìm thấy ID để xóa.", "warning");
          return;
      }

      const msg = `CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn dòng dữ liệu (ID: ${id}) ở cả SALES & OPERATION.\n\nBạn có chắc chắn không?`;

      // Sử dụng logA dạng confirm (Callback)
      logA(msg, 'danger', async () => {
        const res = await A.DB.deleteRecord(dataSource, id);
        if (res) {    
            logA(`Đã xóa thành công dòng ID: ${id} từ "${dataSource}".`, "success");        
            // Xóa dòng khỏi giao diện ngay lập tức (UX tối ưu)
            if (CURRENT_CTX_ROW) {
                CURRENT_CTX_ROW.remove();
                CURRENT_CTX_ROW = null; // Reset
                CURRENT_CTX_ID = null;
            }    
            // Tính lại tổng tiền nếu có hàm tính toán
            if(typeof Sales.calcGrandTotal === 'function' && dataSource === 'booking_details') Sales.calcGrandTotal();
        }          
      });
  }

  /**
   * HÀM KHỞI TẠO GIAO DIỆN (UI INIT)
   * Tên giữ nguyên theo yêu cầu.
   */
  function handleServerData(data) {
      showLoading(false);
      
      // 1. Kiểm tra an toàn lần cuối
      if (!data || !data.currentUser) {
          logA("Lỗi hiển thị: Dữ liệu chưa sẵn sàng.", "error");
          return;
      }

      const sourceIcon = data.source === "FIREBASE" ? "⚡ FIREBASE" : "🐢 LIVE SHEET";
      log(`Bắt đầu dựng giao diện từ nguồn: ${sourceIcon}`, "info");

      // 3. KHỞI TẠO CÁC FORM CHỌN & SỰ KIỆN
      try {
          // Init Dropdown Lists
          if (typeof initBtnSelectDataList === 'function') {
              initBtnSelectDataList(data); 
          }       
          
          // --- XỬ LÝ SỰ KIỆN CHUYỂN BẢNG ---
          const selectElem = getE('btn-select-datalist');
          if (selectElem) {
              // Clone Node để xóa event cũ tránh gán chồng
              const newSelect = selectElem.cloneNode(true); 
              selectElem.parentNode.replaceChild(newSelect, selectElem);
              
              newSelect.addEventListener('change', function() {
                  const selectedKey = this.value;
                  CURRENT_TABLE_KEY = selectedKey; 
                  // renderTableByKey là hàm cũ của bạn, nó sẽ tự switch case 
                  // để chọn APP_DATA.booking_details hay APP_DATA.bookings
                  renderTableByKey(selectedKey); 
              });

              // Render mặc định: Ưu tiên hiển thị bảng Bookings
              renderTableByKey(newSelect.value || 'bookings');
          } else {
              // Fallback nếu không có nút chọn
              renderTableByKey('bookings');
          }

      } catch(e) { 
          console.error("Lỗi UI Init:", e);
      }

      // 4. KHỞI TẠO BỘ LỌC CỘT (Filter Header)
      if (typeof initFilterUI === 'function') initFilterUI();
      
      // 5. VẼ DASHBOARD (Nếu đang ở tab Dashboard)
      // Dùng hàm runFnByRole mà ta đã tối ưu trước đó
      if (typeof runFnByRole === 'function') {
          runFnByRole('renderDashboard');
      }
  }

  async function loadDataFromFirebase() {
    // 1. UI: Hiển thị trạng thái tải
    if (retryCount > 0) showLoading(true, `Đang thử lại (${retryCount}/${MAX_RETRIES})...`);

    const startTime = Date.now();

    try {
        let role = CURRENT_USER.role;

        await A.DB.loadAllData();
        setTimeout(() => {}, 250); // Đợi một chút để đảm bảo dữ liệu đã sẵn sàng

        // 3. Safety Check: Kiểm tra dữ liệu rỗng
        if (!APP_DATA || Object.keys(APP_DATA).length === 0) {
            console.error("❌ APP_DATA rỗng hoặc undefined");
            handleRetry("Server trả về dữ liệu rỗng.");
            return; 
        }

        // ============================================================
        // 🛡️ STEP 4: DATA CLEANING (LỌC BỎ TRẠNG THÁI HỦY NGAY TẠI ĐÂY)
        // ✅ Support both array and object formats
        // ============================================================
        
        // A. Lọc Bookings (Giả định cột trạng thái là Index 11)
        // let validIdSet = new Set();
        
        // // Check if we have object format
        // if (APP_DATA.bookings_obj && APP_DATA.bookings_obj.length > 0) {
        //     // Object format
        //     const validBookingsRows = APP_DATA.bookings_obj.filter(row => {
        //         const status = String(row.status || "").trim().toLowerCase();
        //         return status !== 'hủy' && status !== 'cancelled';
        //     });
        //     APP_DATA.bookings_obj = validBookingsRows;
        //     validIdSet = new Set(validBookingsRows.map(row => String(row.id)));
        //     log(`🧹 Data Cleaned (object): Giữ lại ${validBookingsRows.length} booking.`);
        // }
        // // Fallback to array format
        // else if (APP_DATA.bookings && APP_DATA.bookings.length > 1) {
        //     const mHeader = APP_DATA.bookings[0];
        //     const mRows = APP_DATA.bookings.slice(1);

        //     const validBookingsRows = mRows.filter(row => {
        //         const status = String(row[11] || "").trim().toLowerCase();
        //         return status !== 'hủy' && status !== 'cancelled';
        //     });

        //     APP_DATA.bookings = [mHeader, ...validBookingsRows];
        //     validIdSet = new Set(validBookingsRows.map(row => String(row[0])));
        //     log(`🧹 Data Cleaned (array): Giữ lại ${validBookingsRows.length}/${mRows.length} booking.`);
        // }

        // C. Mapping Details theo Role
        const userRole = role;
        const targetSourceKey = (userRole === 'op') ? 'operator_entries' : 'booking_details';
        
        // [OPTIONAL] Vẫn tạo Alias activeDetails để code mới sau này dùng cho tiện
        APP_DATA.activeDetails = (userRole === 'op') ? 
            (APP_DATA.operator_entries_obj || APP_DATA.operator_entries) : 
            (APP_DATA.details_obj || APP_DATA.booking_details);

        log(`👤 User: ${userRole} - Data Loaded: ${APP_DATA.activeDetails.length} rows`);
        log(`✅ Tải xong sau: ${Date.now() - startTime}ms`, "success");

        // 6. GỌI HÀM KHỞI TẠO UI
        handleServerData(APP_DATA);

        retryCount = 0; 

    } catch (error) {
        console.error("Lỗi loadDataFromFirebase:", error);
        handleServerError(error);
    }
  }

  /**
 * Hàm tải Module Kế toán (Lazy Loading)
 */
async function loadModule_Accountant() {
    try {
        console.log("System: Loading Accountant Module...");
        
        // BƯỚC 1: HIỂN THỊ LOADING (Optional but recommended)
        const appContent = document.querySelector('.app-content');
        if (appContent) {
            appContent.innerHTML = '<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-3x text-primary"></i><br>Đang tải dữ liệu kế toán...</div>';
        }

        // BƯỚC 2: TẢI HTML TEMPLATE
        // Sử dụng UI_RENDERER hoặc fetch thuần
        const response = await fetch('/accountant/tpl_accountant.html');
        if (!response.ok) throw new Error("Không thể tải giao diện Kế toán");
        const html = await response.text();
        
        // Inject vào DOM
        if (appContent) {
            appContent.innerHTML = html;
        }

        // BƯỚC 3: TẢI CSS (Tránh trùng lặp)
        if (!document.getElementById('css-accountant')) {
            const link = document.createElement('link');
            link.id = 'css-accountant';
            link.rel = 'stylesheet';
            link.href = '/accountant/accountant.css';
            document.head.appendChild(link);
        }

        // BƯỚC 4: IMPORT CONTROLLER & INIT
        // Import động (Dynamic Import)
        const module = await import('/accountant/controller_accountant.js');
        
        // Lấy instance từ default export
        const ctrl = module.default;
        
        if (ctrl && typeof ctrl.init === 'function') {
            await ctrl.init(); // <--- ĐÂY LÀ LÚC CONTROLLER BẮT ĐẦU CHẠY
        } else {
            console.error("Accountant Controller không có hàm init()");
        }

    } catch (error) {
        console.error("Lỗi tải module Accountant:", error);
        alert("Không thể tải module Kế toán. Vui lòng kiểm tra console.");
    }
}

