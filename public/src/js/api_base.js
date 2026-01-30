

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


      
  function handleSearchClick() {
    const kRaw = getE('global-search')?.value;
    const k = String(kRaw ?? '').trim();
    if (!k) { logA("Vui lòng nhập từ khóa (ID, Tên, SĐT)!"); return; }

    showLoading(true);
    try {
        // Prefer object format if available
        const bookingsObj = (window.APP_DATA && Array.isArray(APP_DATA.bookings_obj)) ? APP_DATA.bookings_obj : null;
        let bookingsArr = (window.APP_DATA && Array.isArray(APP_DATA.bookings)) ? APP_DATA.bookings : null;

        const isObjList = (list) => Array.isArray(list) && list[0] && typeof list[0] === 'object' && !Array.isArray(list[0]);
        const stripHeaderIfAny = (arr) => {
            if (!Array.isArray(arr)) return [];
            if (arr.length === 0) return [];
            const first = arr[0];
            if (Array.isArray(first) && typeof first[0] === 'string' && (first[0].toLowerCase() === 'id' || first[0].toLowerCase() === 'stt')) {
                return arr.slice(1);
            }
            return arr;
        };

        const source = (bookingsObj && bookingsObj.length > 0) ? bookingsObj : stripHeaderIfAny(bookingsArr || []);
        if (!source || source.length === 0) {
            logA('Chưa có dữ liệu bookings để tìm kiếm!', 'warning');
            return;
        }

        const isDigitsOnly = /^\d+$/.test(k);
        const normText = (s) => String(s ?? '').toLowerCase().trim();
        const normPhone = (s) => String(s ?? '').replace(/\D+/g, '');
        const kText = normText(k);
        const kPhone = normPhone(k);

        // Array index fallback
        const IDX_ID = (typeof COL_INDEX !== 'undefined' && COL_INDEX.M_ID !== undefined) ? COL_INDEX.M_ID : 0;
        const IDX_NAME = (typeof COL_INDEX !== 'undefined' && COL_INDEX.M_CUST !== undefined) ? COL_INDEX.M_CUST : 4;
        const IDX_PHONE = (typeof COL_INDEX !== 'undefined' && COL_INDEX.M_PHONE !== undefined) ? COL_INDEX.M_PHONE : 5;

        const getField = (row, fieldOrIdx) => {
            if (!row) return '';
            if (typeof row === 'object' && !Array.isArray(row)) return row[fieldOrIdx];
            if (Array.isArray(row)) return row[fieldOrIdx];
            return '';
        };

        const getId = (row) => {
            if (!row) return '';
            if (typeof row === 'object' && !Array.isArray(row)) return row.id;
            return row[IDX_ID];
        };

        const getName = (row) => {
            if (!row) return '';
            if (typeof row === 'object' && !Array.isArray(row)) return row.customer_name;
            return row[IDX_NAME];
        };

        const getPhone = (row) => {
            if (!row) return '';
            if (typeof row === 'object' && !Array.isArray(row)) return row.customer_phone;
            return row[IDX_PHONE];
        };

        let hit = null;
        if (isDigitsOnly) {
            // 1) id exact
            hit = source.find(r => String(getId(r) ?? '') === k) || null;
            // 2) customer_phone contains digits
            if (!hit && kPhone) {
                hit = source.find(r => normPhone(getPhone(r)).includes(kPhone)) || null;
            }
        } else {
            // 1) customer_name contains
            hit = source.find(r => normText(getName(r)).includes(kText)) || null;
            // 2) customer_phone contains (raw text or digits)
            if (!hit) {
                hit = source.find(r => {
                    const p = String(getPhone(r) ?? '');
                    return normText(p).includes(kText) || (kPhone && normPhone(p).includes(kPhone));
                }) || null;
            }
        }

        if (!hit) {
            logA('Không tìm thấy booking phù hợp trong APP_DATA!', 'warning');
            return;
        }

        const foundId = String(getId(hit) ?? '').trim();
        if (!foundId) {
            logA('Booking tìm thấy nhưng thiếu id!', 'warning');
            return;
        }

        const res = (typeof findBookingInLocal === 'function') ? findBookingInLocal(foundId) : null;
        if (res && typeof fillFormFromSearch === 'function') {
            fillFormFromSearch(res);
        } else {
            log("Không tìm thấy hàm fillFormFromSearch trong Form con./Lỗi SV");
        }
    } finally {
        showLoading(false);
    }
  }

  /**
   * 2. Hàm Xóa Item trong Database
   * @param {string} id - ID của item cần xóa
   * @param {string} dataSource - Tên bảng (bookings, booking_details, customer...), mặc định 'booking_details'
   */
  function deleteItem(id, dataSource = 'booking_details') {
      if (!id) {
          logA("Không tìm thấy ID để xóa.", "warning");
          return;
      }

      const msg = `CẢNH BÁO: Hành động này sẽ xóa vĩnh viễn dòng dữ liệu (ID: ${id}) ở cả SALES & OPERATION.\n\nBạn có chắc chắn không?`;

      // Sử dụng logA dạng confirm (Callback)
      logA(msg, 'danger', async () => {
        const res = await DB_MANAGER.deleteRecord(dataSource, id);
        if (res && res.success) {    
            logA(`Đã xóa thành công dòng ID: ${id} từ "${dataSource}".`, "success");        
            // Xóa dòng khỏi giao diện ngay lập tức (UX tối ưu)
            if (CURRENT_CTX_ROW) {
                CURRENT_CTX_ROW.remove();
                CURRENT_CTX_ROW = null; // Reset
                CURRENT_CTX_ID = null;
            }    
            // Tính lại tổng tiền nếu có hàm tính toán
            if(typeof calcGrandTotal === 'function') calcGrandTotal();
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
    if (retryCount === 0) showLoading(true, "Đang tải dữ liệu...");
    else showLoading(true, `Đang thử lại (${retryCount}/${MAX_RETRIES})...`);

    const startTime = Date.now();

    try {
        let role = CURRENT_USER.role;

        await DB_MANAGER.loadAllData();

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
        let validIdSet = new Set();
        
        // Check if we have object format
        if (APP_DATA.bookings_obj && APP_DATA.bookings_obj.length > 0) {
            // Object format
            const validBookingsRows = APP_DATA.bookings_obj.filter(row => {
                const status = String(row.status || "").trim().toLowerCase();
                return status !== 'hủy' && status !== 'cancelled';
            });
            APP_DATA.bookings_obj = validBookingsRows;
            validIdSet = new Set(validBookingsRows.map(row => String(row.id)));
            log(`🧹 Data Cleaned (object): Giữ lại ${validBookingsRows.length} booking.`);
        }
        // Fallback to array format
        else if (APP_DATA.bookings && APP_DATA.bookings.length > 1) {
            const mHeader = APP_DATA.bookings[0];
            const mRows = APP_DATA.bookings.slice(1);

            const validBookingsRows = mRows.filter(row => {
                const status = String(row[11] || "").trim().toLowerCase();
                return status !== 'hủy' && status !== 'cancelled';
            });

            APP_DATA.bookings = [mHeader, ...validBookingsRows];
            validIdSet = new Set(validBookingsRows.map(row => String(row[0])));
            log(`🧹 Data Cleaned (array): Giữ lại ${validBookingsRows.length}/${mRows.length} booking.`);
        }

        // C. Mapping Details theo Role
        const userRole = role;
        const targetSourceKey = (userRole === 'op') ? 'operator_entries' : 'booking_details';
        
        // Check object format first
        if (APP_DATA[targetSourceKey + '_obj'] && APP_DATA[targetSourceKey + '_obj'].length > 0) {
            const validDetailRows = APP_DATA[targetSourceKey + '_obj'].filter(row => 
                validIdSet.has(String(row.booking_id))
            );
            APP_DATA[targetSourceKey + '_obj'] = validDetailRows;
            log(`🧹 Details Cleaned (object): ${validDetailRows.length} rows`);
        }
        // Fallback to array format
        else if (APP_DATA[targetSourceKey] && APP_DATA[targetSourceKey].length > 1) {
            const dHeader = APP_DATA[targetSourceKey][0];
            const dRows = APP_DATA[targetSourceKey].slice(1);
            const validDetailRows = dRows.filter(row => validIdSet.has(String(row[1])));
            
            if (userRole === 'op') {
                APP_DATA.operator_entries = [dHeader, ...validDetailRows];
            } else {
                APP_DATA.booking_details = [dHeader, ...validDetailRows];
            }
            log(`🧹 Details Cleaned (array): ${validDetailRows.length} rows`);
        } else {
            APP_DATA.booking_details = [];
            APP_DATA.operator_entries = [];
        }

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

