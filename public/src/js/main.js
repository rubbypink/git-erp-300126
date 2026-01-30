
  /**
   * Handler xử lý logic chính (Phiên bản tối ưu với requestAPI)
   */
  function handleServerAction(e) {
    e.preventDefault(); // Chặn hành vi mặc định của thẻ 'a'
    
    const target = e.currentTarget;
    
    // 1. Lấy dữ liệu từ data-attributes
    const funcName = target.dataset.func;
    const argsRaw = target.dataset.args;
    const confirmMsg = target.dataset.confirm;
    const confirmType = target.dataset.confirmType || 'warning';

    if (!funcName) {
      log("Thiếu data-func trên nút:", target);
      return;
    }

    // 2. Parse arguments (nếu có)
    let args = null;
    if (argsRaw) {
      try {
        args = JSON.parse(argsRaw);
      } catch (err) {
        // Dùng Banner báo lỗi cho đẹp thay vì logA
        showNotify('Lỗi cấu trúc tham số (JSON) trên nút bấm!', false);
        return;
      }
    }
    // 3. Định nghĩa hành động (Core Runner)
    // QUAN TRỌNG: Vẫn phải giữ nó là một function () => { ... }
    // Để nó không chạy ngay lập tức, mà chờ được gọi.
    const runAction = async () => {
      
      if (args) {
          await requestAPI(funcName, args);
      } else {
          await requestAPI(funcName);
      }
    };

    // 4. Logic điều hướng: Hỏi hay Chạy luôn?
    if (confirmMsg) {
      // Dùng logA làm Confirm Dialog. 
      // Khi user bấm OK -> logA sẽ gọi hàm runAction() ở trên.
      logA(confirmMsg, confirmType, runAction);
    } else {
      // Không cần hỏi -> Chạy luôn
      runAction();
    }
  }

  // ==========================================
  // MODULE: CONTEXT MENU (RIGHT CLICK)
  // ==========================================

  /**
   * 1. Hàm khởi tạo Context Menu
   * @param {string|Element} elementOrId - ID hoặc Element của TBODY cần gắn sự kiện
   */
  function setupContextMenu(elementOrId = 'detail-tbody') {
      const target = getE(elementOrId);
      const menu = getE('myContextMenu');
      const btnCopyData = getE('ctx-copyData');
      const btnPasteData = getE('ctx-paste');
      const btnCopy = getE('ctx-copy');
      const btnDelete = getE('ctx-delete');
      const btnDeleteBooking = getE('ctx-delete-bk');
      const btnSaveOne = getE('ctx-save-one');
      let details = CURRENT_USER.role === 'op' ? 'operator_entries' : 'booking_details';

      if (!menu) return;

      // A. Sự kiện Click chuột phải (Mở Menu)
      onEvent(elementOrId,'contextmenu', function(e) {
          // Tìm dòng tr gần nhất
          const isCtrl = e.ctrlKey || e.metaKey;
          if(isCtrl) return; // Bỏ qua nếu có Ctrl (dành cho multi-select sau này)
          const row = e.target.closest('tr');
          if (!row) return;

          e.preventDefault(); // Chặn menu mặc định của trình duyệt

          // Lưu trạng thái Global
          CURRENT_CTX_ROW = row;
          let collection;
          if (CURRENT_TABLE_KEY === 'bookings' || elementOrId === 'detail-tbody') {
              collection = details;
          }
          CURRENT_ROW_DATA = getRowData(collection, CURRENT_CTX_ROW, target);          
          // Lấy SID từ ô input có class .d-sid
          const sidInput = row.querySelector('.d-sid');
          CURRENT_CTX_ID = sidInput ? sidInput.value : '';

          // Định vị Menu ngay tại con trỏ chuột
          menu.style.top = `${e.clientY}px`;
          menu.style.left = `${e.clientX}px`;
          menu.style.display = 'block';
      }, true);

      // B. Sự kiện Click ra ngoài (Đóng Menu)
      document.addEventListener('click', function() {
          menu.style.display = 'none';
          CURRENT_CTX_ROW = null;
          CURRENT_CTX_ID = null;
          CURRENT_ROW_DATA = null;
      });
      if (btnCopyData) {
          btnCopyData.onclick = async function (e) {
              e.preventDefault();
              
              try {

                // Clone data ra biến mới để xử lý
                const dataToCopy = { ...CURRENT_ROW_DATA };
                
                // Convert sang JSON String
                const jsonString = JSON.stringify(dataToCopy);
        
                // API Copy
                await navigator.clipboard.writeText(jsonString);
        
                // Ẩn menu
                document.getElementById('myContextMenu').style.display = 'none';
                
                // Thông báo (Thay bằng Toast của bạn nếu có)
                logA("9Trip: Copied data", dataToCopy);
        
            } catch (err) {
                console.error("9Trip Error Copy:", err);
                alert("Lỗi: Trình duyệt không cho phép Copy.");
            }
          };
      }
        if (btnPasteData) {
            btnPasteData.onclick = (e) => {
                e.preventDefault();
                clipboardToRow();
            }
        };

      // C. Gắn sự kiện cho các nút trong Menu
      // Nút Copy
      if (btnCopy) {
          btnCopy.onclick = (e) => {
              e.preventDefault();
              if (CURRENT_CTX_ROW) {
                // Gọi hàm xử lý copy hàng hiện tại
                copyRow(CURRENT_CTX_ROW); 
              }
          };
      }

      btnSaveOne.addEventListener('click', async function (e) {
        e.preventDefault();
        if (CURRENT_CTX_ROW && CURRENT_ROW_DATA) {
            const res =await DB_MANAGER.saveRecord(
                CURRENT_TABLE_KEY === 'bookings' || elementOrId === 'detail-tbody' ? 
                (CURRENT_USER.role === 'op' ? 'operator_entries' : 'booking_details') : 
                CURRENT_TABLE_KEY, 
                CURRENT_ROW_DATA
            );
            if (res.success) {
                logA("Lưu thành công!", 'success');
            }
         } 
     });

      // Nút Delete
      if (btnDelete) {
          btnDelete.onclick = (e) => {
              e.preventDefault();
              if (CURRENT_CTX_ID) {
                  // Gọi hàm xóa item
                  deleteItem(CURRENT_CTX_ID, details); 
              } else {
                  // Nếu chưa có ID (dòng mới chưa lưu), chỉ xóa trên giao diện
                  logA("Dòng này chưa lưu vào Database. Bạn muốn xóa khỏi giao diện?", 'info', () => {
                      CURRENT_CTX_ROW.remove();
                      if(typeof calcGrandTotal === 'function') calcGrandTotal();
                  });
              }
          };
      }
            // Nút Delete
      if (btnDeleteBooking) {
          btnDeleteBooking.onclick = (e) => {
              e.preventDefault();
              if (CURRENT_CTX_ID) {
                  // Gọi hàm xóa item
                  deleteItem(getVal('BK_ID'), 'bookings'); 
              } else {
                  // Nếu chưa có ID (dòng mới chưa lưu), chỉ xóa trên giao diện
                  logA("Dòng này chưa lưu vào Database. Bạn muốn xóa khỏi giao diện?", 'info', () => {
                      CURRENT_CTX_ROW.remove();
                      if(typeof calcGrandTotal === 'function') calcGrandTotal();
                  });
              }
          };
      }
  }

  /**
 * MODULE: CLIPBOARD ACTIONS
 * Chuyên xử lý Copy/Paste cho hệ thống ERP
 */

// 2. Hàm PASTE: Đọc Clipboard và đổ vào hàng hiện tại
async function clipboardToRow() {
    if (!CURRENT_CTX_ROW) {
        alert("Lỗi: Vui lòng chọn một dòng để dán.");
        return;
    }
    try {
        // API Paste: Đọc text từ clipboard
        const textFromClipboard = await navigator.clipboard.readText();

        if (!textFromClipboard) {
            alert("Clipboard trống!");
            return;
        }
        // Parse JSON
        let pastedData;
        try {
            pastedData = JSON.parse(textFromClipboard);
            setRowDataByField(
                CURRENT_TABLE_KEY === 'bookings' || CURRENT_TABLE_KEY === 'booking_details' ? 
                (CURRENT_USER.role === 'op' ? 'operator_entries' : 'booking_details') : 
                CURRENT_TABLE_KEY, 
                pastedData, 
                CURRENT_CTX_ROW
            );
        } catch (e) {
            alert("Lỗi: Dữ liệu trong clipboard không hợp lệ (Không phải cấu trúc JSON của ERP).");
            return;
        }

    } catch (err) {
        console.error("9Trip Error Paste:", err);
        // Lưu ý: Chrome yêu cầu user cấp quyền 'Read Clipboard' lần đầu tiên
        alert("Lỗi: Không thể đọc từ Clipboard. Vui lòng kiểm tra quyền trình duyệt.");
    }
}
  
  // ==========================================
  // MODULE: TABLE KEYBOARD NAVIGATION (Advanced)
  // ==========================================

  /**
   * Hàm cài đặt điều hướng bàn phím nâng cao
   * - Enter: Xuống dòng/Tạo dòng
   * - Ctrl + Arrows: Điều hướng 4 chiều (Lên/Xuống/Trái/Phải)
   * - Ctrl + D: Copy dữ liệu dòng trên
   */
  function setupTableKeyboardNav() {
      // Lắng nghe sự kiện trên toàn bộ tbody (Event Delegation)
      onEvent('#detail-tbody', 'keydown', function(e) {
          
          // 1. Định nghĩa các phím tắt
          // Hỗ trợ cả Ctrl (Windows) và Meta/Command (Mac)
          const isCtrl = e.ctrlKey || e.metaKey;
          const isShift = e.shiftKey;
          
          const isEnter = e.key === 'Enter';
          const isDown = e.key === 'ArrowDown';
          const isUp = e.key === 'ArrowUp';
          const isLeft = e.key === 'ArrowLeft';
          const isRight = e.key === 'ArrowRight';
          const isD = (e.key === 'd' || e.key === 'D');

          // Chỉ xử lý nếu có Enter hoặc đang giữ Ctrl
          if (!isEnter && !isCtrl) return;

          // 2. Xác định ô đang focus
          const currentInput = e.target;
          // Chỉ áp dụng cho Input và Select
          if (currentInput.tagName !== 'INPUT' && currentInput.tagName !== 'SELECT') return;

          const currentTr = currentInput.closest('tr');
          if (!currentTr) return;

          // Lấy danh sách các ô nhập liệu trong dòng hiện tại
          const allInputs = Array.from(currentTr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select'));
          const inputIndex = allInputs.indexOf(currentInput);
          
          if (inputIndex === -1) return;

          // --- A. XUỐNG DÒNG (Enter hoặc Ctrl + Down) ---
          if (isEnter || (isCtrl && isDown)) {
              e.preventDefault(); // Chặn hành vi mặc định (tăng giảm số hoặc xuống dòng textarea)

              let nextTr = currentTr.nextElementSibling;

              // Nếu không có dòng dưới -> Tạo mới
              if (!nextTr) {
                  // Chỉ tạo mới khi dùng Enter hoặc Ctrl+Down ở dòng cuối
                  if (typeof copyRow === 'function') {
                      copyRow(); 
                  } else if (typeof addDetailRow === 'function') {
                      addDetailRow();
                  }
                  nextTr = tbody.lastElementChild;
              }

              // Focus vào ô cùng cột ở dòng dưới
              focusCell(nextTr, inputIndex);
          }

          // --- B. LÊN DÒNG (Ctrl + Up) ---
          else if (isCtrl && isUp) {
              e.preventDefault(); 
              const prevTr = currentTr.previousElementSibling;
              if (prevTr) {
                  focusCell(prevTr, inputIndex);
              }
          }

          // --- C. SANG TRÁI (Ctrl + Left) ---
          else if (isCtrl && isLeft) {
              e.preventDefault();
              // Focus vào ô có index nhỏ hơn 1 đơn vị
              if (inputIndex > 0) {
                  const targetInput = allInputs[inputIndex - 1];
                  if (targetInput) {
                      targetInput.focus();
                      if (targetInput.select) targetInput.select();
                  }
              }
          }

          // --- D. SANG PHẢI (Ctrl + Right) ---
          else if (isCtrl && isRight) {
              e.preventDefault();
              // Focus vào ô có index lớn hơn 1 đơn vị
              if (inputIndex < allInputs.length - 1) {
                  const targetInput = allInputs[inputIndex + 1];
                  if (targetInput) {
                      targetInput.focus();
                      if (targetInput.select) targetInput.select();
                  }
              }
          }

          // --- E. COPY TRÊN XUỐNG (Ctrl + D) ---
          else if (isCtrl && isD) {
              e.preventDefault(); // Chặn Bookmark trình duyệt
              const prevTr = currentTr.previousElementSibling;

              if (prevTr) {
                  const prevInputs = Array.from(prevTr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select'));
                  const sourceInput = prevInputs[inputIndex];

                  if (sourceInput) {
                      copyValueSmart(sourceInput, currentInput);
                      
                      // Hiệu ứng visual
                      currentInput.classList.add('bg-success', 'bg-opacity-10');
                      setTimeout(() => currentInput.classList.remove('bg-success', 'bg-opacity-10'), 200);
                  }
              }
          }
      }, true);

      onEvent('#main-form', 'focus', function(e) {
          // 2. Xác định ô đang focus
          const currentInput = e.target;
          // Chỉ áp dụng cho Input và Select
          if (currentInput.tagName !== 'INPUT' && currentInput.tagName !== 'SELECT' && currentInput.tagName !== 'TEXTAREA') return;
          currentInput.select();
      }, true);
  }

  // (Giữ nguyên các hàm helper bên dưới không thay đổi)
  function focusCell(tr, index) {
      if (!tr) return;
      const inputs = Array.from(tr.querySelectorAll('input:not([type="hidden"]):not([readonly]):not([disabled]), select'));
      const target = inputs[index];
      if (target) {
          target.focus();
          if (target.select) target.select(); 
      }
  }

  function copyValueSmart(sourceEl, targetEl) {
      targetEl.value = sourceEl.value;
      if (sourceEl.dataset.val !== undefined) {
          targetEl.dataset.val = sourceEl.dataset.val;
      } else {
          delete targetEl.dataset.val;
      }
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Hàm tập trung tất cả các sự kiện tĩnh của trang
   * Giúp dễ quản lý, debug và bảo trì sau này
   */
  var isEventsInitialized = false;
  async function setupStaticEvents() {
    // 1. Gắn sự kiện cho nhiều nút cùng lúc (Class) -> onEvent tự lo việc lặp
    if (isEventsInitialized) return;

    // 1. CÁC NÚT SERVER ACTION (Giữ nguyên - Đã dùng Delegation = true)
    onEvent('.btn-server-action', 'click', function(e, target) {
        handleServerAction(e, target);
    }, true);

    // 2. CÁC SỰ KIỆN TRONG TAB LIST (Phải dùng Delegation vì tab này render sau)
    // Tham số cuối cùng là TRUE để bật chế độ Delegation
    
    // Nút Lọc & Ô nhập Filter
    onEvent('#btn-data-filter', 'click', function() { 
        if(typeof applyGridFilter === 'function') applyGridFilter(); 
    }, true); // <--- True: Chờ element xuất hiện mới bắt
    
    onEvent('#filter-val', 'change', function() { 
        if(typeof applyGridFilter === 'function') applyGridFilter(); 
    }, true);

    // Nút Sắp xếp
    onEvent('#btn-data-sort', 'click', function() {
        if(typeof applyGridSorter === 'function') applyGridSorter();
    }, true);

    // 3. CÁC SỰ KIỆN TRONG HEADER (Header có sẵn nên ko cần Delegation cũng được, nhưng dùng luôn cho đồng bộ)
    onEvent('#global-search', 'keyup', function(e) { 
        if(e.key === 'Enter') handleSearchClick(); 
    }, true);

    // 4. CÁC SỰ KIỆN TRONG FORM BOOKING (Cũng render sau -> Cần Delegation)
    // Ví dụ: Khi thay đổi ngày đi -> Tự tính ngày về/hạn thanh toán
    onEvent('#BK_Start', 'change', function(e, target) {
        if(typeof autoSetOrCalcDate === 'function') autoSetOrCalcDate(target.value, 'BK_PayDue');
        const startDate = new Date(target.value);
        const endDate = new Date(getVal('BK_End'));
        if (startDate && endDate && endDate < startDate) {
            // Nếu ngày kết thúc nhỏ hơn ngày bắt đầu, tự động đặt lại ngày kết thúc
            setVal('BK_End', formatDateForInput(target.value));
        }
    }, true);
    
    onEvent('#BK_Deposit', 'change', function(e) {
        const el = e.target;
        setTimeout(() => {
            const grandTotal = getNum('BK_Total');
            const deposit = getNum('BK_Deposit');
            const balance = grandTotal - deposit;
            setNum('BK_Balance', balance);
        }, 1250);
    }, true);

    // 3. Các hàm logic khác
    // Gọi hàm setup sau khi DOM đã render

    setupTableKeyboardNav();
    
    // Selector gộp: Chọn input type number HOẶC class chứa 'number' HOẶC class chứa 'number-only'
    const numberInputSelector = 'input:not([type="hidden"]):not([disabled]), input.number, input.number-only';

    onEvent(numberInputSelector, 'input', function(e, target) {
        
        // 1. XÓA TIMER CŨ (Nếu người dùng gõ tiếp trong vòng 1s thì hủy lệnh trước đó)
        if (target._debounceTimer) {
            clearTimeout(target._debounceTimer);
        }

        // 2. THIẾT LẬP TIMER MỚI (Đợi 1000ms = 1s)
        target._debounceTimer = setTimeout(function() {
            // A. LÀM SẠCH DỮ LIỆU (CLEAN DATA)
            let rawValue = target.value;
            // Chỉ giữ lại số, dấu chấm (.), và dấu trừ (-)
            // Nếu bạn muốn chỉ số nguyên thì dùng /[^0-9-]/g
            let cleanValue = rawValue.replace(/[^0-9-]/g, '');

            // B. CẬP NHẬT DATASET
            // Luôn lưu giá trị chuẩn (số thực) vào dataset để tính toán sau này
            // Sử dụng parseFloat để đảm bảo là số, nếu rỗng thì là 0
            let numericVal = parseFloat(cleanValue);
            target.dataset.val = isNaN(numericVal) ? 0 : numericVal;
            
            const tr = target.closest('tr');
            if (tr && tr.id && typeof calcRow === 'function') {
                const rowId = tr.id.replace('row-', '');
                calcRow(rowId);
            }

            // Xóa timer referrence sau khi chạy xong
            delete target._debounceTimer;

        }, 1000); // Thời gian delay: 1000ms = 1s
    }, true);

    onEvent('input.number, input.number-only', 'click', function(e) {
      const el = e.target;
      log(`[AUTO-PROCESS] Đang xử lý input mousedown: ${el.id || 'no-id'}`);
      if (getVal(el) > 0) return;
      e.preventDefault();
      el.select();
    }, true);

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

  // --- 3. MAIN CONTROLLER ---
  async function initApp() {
      try {
            log('🚀 [INIT] Bắt đầu khởi tạo...' + CURRENT_USER.role);
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
            await initFirebase();
            
      } catch (e) {
          console.error("Critical Error:", e);
          document.body.innerHTML = `<h3 class="text-danger p-3">Lỗi kết nối hệ thống: ${e.message}</h3>`;
      }
  });
