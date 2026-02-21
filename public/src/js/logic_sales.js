
    // =========================================================================
    // 1. BIẾN & INIT

    // =========================================================================
    var detailRowCount = 0;

    window.loadBookingToUI = function(bkData, customerData, detailsData) {
      if (!bkData) return;
      try {
        log("Loading Booking...:", bkData);

        // --- NEW LOGIC: TÌM CUSTOMER SOURCE ---
        let custSource = "";

        // Helper: đọc booking theo cả array/object format
        const isBkObj = (bkData && typeof bkData === 'object' && !Array.isArray(bkData));
        const bk = (idx) => {
          const field = FIELD_MAP?.bookings?.[idx];
          return isBkObj ? (bkData[field] ?? bkData[idx]) : bkData[idx];
        };

        // Ưu tiên dùng customerData truyền vào (nếu có), rồi mới fallback tìm trong APP_DATA
        if (customerData && typeof customerData === 'object') {
          custSource = customerData.source || customerData.customer_source || custSource;
        }

        // Xử lý số điện thoại từ Bookings
        const phoneRaw = bk(COL_INDEX.M_PHONE);
        const phone = phoneRaw ? String(phoneRaw).replace(/^'/, "").trim() : "";

        let custRow = null;

        // 4. Tìm thông tin Customer (Hỗ trợ cả array format và object format)
        if (!custSource && phone !== "" && window.APP_DATA) {
          // Ưu tiên danh sách object (customers_obj) nếu có, fallback sang legacy array (customers)
          const customerList = (Array.isArray(window.APP_DATA.customers_obj) && window.APP_DATA.customers_obj.length)
            ? window.APP_DATA.customers_obj
            : window.APP_DATA.customers;

          if (Array.isArray(customerList)) {
            custRow = customerList.find(r => {
              if (!r) return false;

              let rPhone = '';
              if (typeof r === 'object' && !Array.isArray(r)) {
                rPhone = r.phone || r.customer_phone || '';
              } else if (Array.isArray(r)) {
                rPhone = r[COL_INDEX.C_PHONE] || '';
              } else {
                return false;
              }

              const cleanRPhone = String(rPhone).replace(/^'/, "").replace(/[^0-9]/g, "");
              const cleanPhone = String(phone).replace(/[^0-9]/g, "");
              if (!cleanRPhone || !cleanPhone) return false;

              // So sánh dạng contains để hỗ trợ trường hợp số bị lưu thiếu/khác prefix
              return cleanRPhone.includes(cleanPhone) || cleanPhone.includes(cleanRPhone);
            });

            if (!custRow) {
              log("Local search: Không tìm thấy khách theo SĐT");
            } else {
              if (typeof custRow === 'object' && !Array.isArray(custRow)) {
                custSource = custRow.source || custRow.customer_source || '';
              } else {
                custSource = custRow[COL_INDEX.C_SOURCE] || '';
              }
            }
          }
        }
        if (!getE('main-form')) activateTab('tab-form');
        if (isBkObj) HD.setFormData('sub-booking-form', bkData);
        else {
          log('Data booking ko phải object, sử dụng method setVal thủ công theo index');
          setVal('BK_ID', bk(COL_INDEX.M_ID));
          setVal('BK_Date', bk(COL_INDEX.M_CREATED));
          setVal('Cust_Phone', bk(COL_INDEX.M_PHONE));
          setVal('Cust_Name', bk(COL_INDEX.M_CUST));
          setVal('Cust_Source', custSource);
          setVal('BK_Start', bk(COL_INDEX.M_START));
          setVal('BK_End', bk(COL_INDEX.M_END));
          setVal('BK_Adult', bk(COL_INDEX.M_ADULT));
          setVal('BK_Child', bk(COL_INDEX.M_CHILD));
          // Tiền tệ & Trạng thái
          setVal('BK_Status', bk(COL_INDEX.M_STATUS));
          setVal('BK_PayType', bk(COL_INDEX.M_PAYTYPE));
          setVal('BK_PayDue', bk(COL_INDEX.M_PAYDUE));
          setNum('BK_Total', bk(COL_INDEX.M_TOTAL));
          setNum('BK_Deposit', bk(COL_INDEX.M_DEPOSIT));
          setVal('BK_Note', bk(COL_INDEX.M_NOTE));
          setVal('BK_Staff', bk(COL_INDEX.M_STAFF));
        }

        

        let tbody = getE('detail-tbody');
        if(tbody) {
            tbody.innerHTML = '';
            tbody.style.display = 'none'; // Ẩn tạm thời để tăng tốc render
        } else {
          activateTab('tab-form');
          tbody = getE('detail-tbody');
          if(tbody) {
            tbody.innerHTML = '';
            tbody.style.display = 'none'; // Ẩn tạm thời để tăng tốc render
          } else {
            log("Ko tìm thấy detail-tbody","error");
            return;
          }
        }
        
        
        detailRowCount = 0;
        
        if (Array.isArray(detailsData)) {
          // Sắp xếp chi tiết theo thứ tự service_type và check_in
          const sortedDetails = sortDetailsData(detailsData);
          sortedDetails.forEach(row => {
              // Gọi hàm thêm dòng
              addDetailRow(row);
          });
        }

        if(tbody) tbody.style.display = 'table-row-group'; // Hiện lại
        
        calcGrandTotal();

        // 4. Chuyển Tab về Form (nếu cần thiết)
        try {
            const tabTrigger = document.querySelector('#mainTabs button[data-bs-target="#tab-form"]');
            if(tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
            toggleContextUI('tab-form');
        } catch(e){ log("error", e.message);}
      } catch (e) {
        log("LỖI hàm loadBookingToUI", e.message, "error");
      } finally {
        showLoading(false);
      }
    };
    // =========================================================================
    // 2. LOGIC CHI TIẾT (ROW)
    // =========================================================================

    function addDetailRow(data = null) {
      detailRowCount++;
      const idx = detailRowCount;
      const lists = window.APP_DATA.lists;
      // Dropdown Loại DV (NR_LIST_TYPE)
      const optsType = (lists.types || []).map(x => `<option value="${x}">${x}</option>`).join('');
      // Dropdown Địa điểm (Hotel + Other)
      // Lưu ý: Ta sẽ fill data vào Location sau khi tạo row xong để dễ xử lý logic
      const tr = document.createElement('tr');
      tr.id = `row-${idx}`;
      tr.setAttribute('data-row', idx);
      tr.innerHTML = `
        <td class="text-center text-muted align-middle">${idx} <input type="hidden" class="d-sid" data-field="id"></td>
        <td>
          <select class="form-select form-select-sm d-type" data-field="service_type" onchange="onTypeChange(${idx})">
            <option value="">-</option>${optsType}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm d-loc" data-field="hotel_name" onchange="onLocationChange(${idx})">
            <option value="">-</option>
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm d-name" data-field="service_name">
            <option value="">-</option>
          </select>
        </td>
        <td><input type="date" class="form-control form-control-sm d-in" data-field="check_in" onchange="autoSetOrCalcDate(this.value, $('.d-out', $('#row-${idx}')))" style="cursor:pointer"></td>
        <td><input type="date" class="form-control form-control-sm d-out" data-field="check_out" onchange="calcRow(${idx})"></td>
        <td><input type="number" class="form-control form-control-sm d-night number bg-light text-center" data-field="nights" readonly value="1"></td>
        <td><input type="number" class="form-control form-control-sm d-qty number" data-field="quantity" value="1"></td>
        <td><input type="number" class="form-control form-control-sm d-pri number" data-field="unit_price" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-qtyC number" data-field="child_qty" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-priC number" data-field="child_price" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-sur number" data-field="surcharge" placeholder="-"></td>
        <td><input type="number" class="form-control form-control-sm d-disc number" data-field="discount" placeholder="-"></td>
        <td><input type="text" class="form-control form-control-sm d-total number fw-bold text-end" data-field="total" readonly value="0" data-val="0"></td>
        <td><input type="text" class="form-control form-control-sm d-code" data-field="ref_code"></td>
        <td><input type="text" class="form-control form-control-sm d-note" data-field="note"></td>
        <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="removeRow(${idx})"></i></td>
            `;
      getE('detail-tbody').appendChild(tr);
      // Init Data cho Row mới
      updateLocationList(idx); // Fill Location List ngay khi tạo
      if(data) {
        const detailId = data[FIELD_MAP.booking_details[COL_INDEX.D_SID]] || data[COL_INDEX.D_SID] || '';
        setVal('.d-sid', detailId, tr);
        // Cập nhật data-item với ID thực của detail row
        if(detailId) tr.setAttribute('data-item', detailId);
        setVal('.d-type', data[FIELD_MAP.booking_details[COL_INDEX.D_TYPE]] || data[COL_INDEX.D_TYPE], tr);
        // Trigger logic sau khi set Type
        onTypeChange(idx, false); // false = không reset con
        setVal('.d-loc', data[FIELD_MAP.booking_details[COL_INDEX.D_HOTEL]] || data[COL_INDEX.D_HOTEL], tr);
        // Trigger logic sau khi set Location
        onLocationChange(idx, false);
        setVal('.d-name', data[FIELD_MAP.booking_details[COL_INDEX.D_SERVICE]] || data[COL_INDEX.D_SERVICE], tr); // Set tên DV/Hạng phòng
        setVal('.d-in', data[FIELD_MAP.booking_details[COL_INDEX.D_IN]] || data[COL_INDEX.D_IN], tr);
        setVal('.d-out', data[FIELD_MAP.booking_details[COL_INDEX.D_OUT]] || data[COL_INDEX.D_OUT], tr);
        setVal('.d-qty', data[FIELD_MAP.booking_details[COL_INDEX.D_QTY]] || data[COL_INDEX.D_QTY], tr);
        setVal('.d-pri', data[FIELD_MAP.booking_details[COL_INDEX.D_PRICE]] || data[COL_INDEX.D_PRICE], tr);
        setVal('.d-qtyC', data[FIELD_MAP.booking_details[COL_INDEX.D_CHILD]] || data[COL_INDEX.D_CHILD], tr);
        setVal('.d-priC', data[FIELD_MAP.booking_details[COL_INDEX.D_PRICEC]] || data[COL_INDEX.D_PRICEC], tr);
        setVal('.d-sur', data[FIELD_MAP.booking_details[COL_INDEX.D_SUR]] || data[COL_INDEX.D_SUR], tr);
        setVal('.d-disc', data[FIELD_MAP.booking_details[COL_INDEX.D_DISC]] || data[COL_INDEX.D_DISC], tr);
        setVal('.d-code', data[FIELD_MAP.booking_details[COL_INDEX.D_CODE]] || data[COL_INDEX.D_CODE], tr);
        setVal('.d-note', data[FIELD_MAP.booking_details[COL_INDEX.D_NOTE]] || data[COL_INDEX.D_NOTE], tr);
        calcRow(idx);
      }
      if (idx === 1 && !data) {
        setVal('.d-type', 'Phòng', tr);
        tr.querySelector('.d-type').dispatchEvent(new Event('change'));
      }
    }

    function removeRow(idx) {
      const row = getE(`row-${idx}`);
      if(row) row.remove();
      calcGrandTotal();
    }

    /**
     * sortDetailsData: Sắp xếp dữ liệu chi tiết theo thứ tự service_type và check_in
     * Thứ tự ưu tiên: Vé MB -> Vé Tàu -> Phòng -> Xe -> Các loại khác
     * Nếu cùng type, sắp xếp theo check_in (ngày sớm trước)
     * @param {Array} detailsData - Dữ liệu chi tiết cần sắp xếp
     * @returns {Array} Mảng đã sắp xếp
     */
    function sortDetailsData(detailsData) {
      if (!Array.isArray(detailsData) || detailsData.length === 0) return detailsData;

      const typeOrder = ['Vé MB', 'Vé Tàu', 'Phòng', 'Xe'];

      // Helper: Lấy service_type (hỗ trợ cả array và object format)
      const getServiceType = (row) => {
        if (!row) return '';
        if (typeof row === 'object' && !Array.isArray(row)) {
          return row.service_type || row[COL_INDEX.D_TYPE] || '';
        }
        return row[COL_INDEX.D_TYPE] || '';
      };

      // Helper: Lấy check_in date (hỗ trợ cả array và object format)
      const getCheckInDate = (row) => {
        if (!row) return 0;
        let checkIn = '';
        if (typeof row === 'object' && !Array.isArray(row)) {
          checkIn = row.check_in || row[COL_INDEX.D_IN] || '';
        } else {
          checkIn = row[COL_INDEX.D_IN] || '';
        }
        return checkIn ? new Date(checkIn).getTime() : 0;
      };

      // Helper: Lấy priority của service_type
      const getTypePriority = (serviceType) => {
        const idx = typeOrder.indexOf(serviceType);
        return idx >= 0 ? idx : typeOrder.length; // Các loại khác được priority cao nhất
      };

      return detailsData.sort((a, b) => {
        // 1. Sắp xếp theo type priority
        const aPriority = getTypePriority(getServiceType(a));
        const bPriority = getTypePriority(getServiceType(b));

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // 2. Nếu cùng type, sắp xếp theo check_in date (sớm trước)
        const aDate = getCheckInDate(a);
        const bDate = getCheckInDate(b);

        return aDate - bDate;
      });
    }
      /**
     * copyRow: Lấy dữ liệu từ dòng cuối cùng và tạo dòng mới
     * Logic:
     * 1. Tìm dòng cuối cùng trong bảng.
     * 2. Extract giá trị từ các input/select.
     * 3. Reset ID (để tránh trùng lặp khi lưu).
     * 4. Gọi addDetailRow để render.
     */
    function copyRow(sourceRow, addToEnd = true) {
      const tbody = getE('detail-tbody');
      const rows = tbody.querySelectorAll('tr');

      // Guard clause: Nếu chưa có dòng nào thì không copy được -> Thêm mới dòng trắng
      if (rows.length === 0) {
        log("Copy Row: Bảng trống, thực hiện thêm mới.");
        addDetailRow(); 
        return;
      }

      // 1. Lấy dòng cuối cùng (Source Row)
      const lastRow = sourceRow ? sourceRow : rows[rows.length - 1];
      
      // Helper nội bộ: Lấy value an toàn từ row cụ thể
      const getVal = (cls) => {
        const el = lastRow.querySelector('.' + cls);
        return el ? el.value : '';
      };

      // 2. Chuẩn bị Data Array theo đúng index của addDetailRow
      // Mapping dựa trên code addDetailRow bạn cung cấp:
      // [0]:sid, [2]:type, [3]:loc, [4]:name, [5]:in, [6]:out, 
      // [8]:qty, [9]:pri, [10]:qtyC, [11]:priC, [12]:sur, [13]:disc, [15]:code, [16]:note
      
      const rowData = [];
      
      // [Quan trọng] Index 0: SID phải để rỗng để hệ thống hiểu là dòng mới (Insert)
      rowData[0]  = ""; 
      
      rowData[2]  = getVal('d-type');
      rowData[3]  = getVal('d-loc');
      rowData[4]  = getVal('d-name');
      rowData[5]  = getVal('d-in');
      rowData[6]  = getVal('d-out');
      
      // Index 7 là Night (số đêm) - tự động tính toán, không cần truyền
      
      rowData[8]  = getVal('d-qty');
      rowData[9]  = getVal('d-pri');
      rowData[10] = getVal('d-qtyC');
      rowData[11] = getVal('d-priC');
      rowData[12] = getVal('d-sur');
      rowData[13] = getVal('d-disc');
      
      // Index 14 là Total - tự động tính toán
      
      rowData[15] = getVal('d-code');
      rowData[16] = getVal('d-note');

      log("Copy Row: Sao chép dữ liệu từ dòng " + lastRow.id);

      // 3. Gọi hàm tạo dòng với data đã chuẩn bị
      if (addToEnd) {
      addDetailRow(rowData);
      } else {
        return rowData;
      }
    }
    // =========================================================================
    // 3. LOGIC MA TRẬN & PHỤ THUỘC (DEPENDENT DROPDOWN)
    // =========================================================================
    // A. Khi đổi Loại DV -> Cập nhật list Tên & Tự động điền Số lượng/Ngày
    function onTypeChange(idx, resetChildren = true) {
      const tr = getE(`row-${idx}`);
      if (!tr) return;
      // 1. Logic cũ: Reset Location & Name
      if (resetChildren) {
        tr.querySelector('.d-loc').value = "";
        // Gọi hàm updateServiceNameList (như đã làm ở bước trước)
        updateServiceNameList(idx);
        // 2. LOGIC MỚI: Tự động điền dữ liệu thông minh
        autoFillRowData(idx);
      } else {
        updateServiceNameList(idx);
      }
    }
    function autoFillRowData(idx) {
      const tr = getE(`row-${idx}`);
      const type = tr.querySelector('.d-type').value; // Loại DV
      // Lấy dữ liệu chung từ Header Form
      const mainAdults = Number(getE('BK_Adult').value) || 1;
      const mainChild = Number(getE('BK_Child').value) || 0;
      const mainStart = getE('BK_Start').value || new Date();
      const mainEnd = getE('BK_End').value || new Date();
      // ---------------------------------------------------------
      // 1. XỬ LÝ SỐ LƯỢNG (QTY)
      // ---------------------------------------------------------
      let newQtyA = 0; // SL Lớn
      let newQtyC = 0; // SL Bé
      if (type === 'Phòng') {
          // Phòng = Người lớn / 2 (Làm tròn lên, ví dụ 3 người -> 2 phòng)
          newQtyA = Math.ceil(mainAdults / 2);
          newQtyC = mainChild; // Trẻ em giữ nguyên
      }
      else if (['Xe', 'HDV'].includes(type)) {
          // Xe, HDV -> Mặc định 1
          newQtyA = 1;
          newQtyC = 0; // Trẻ em = 0
      }
      else {
          // Các loại khác (Vé, Ăn uống...) -> Bằng số người
          newQtyA = mainAdults;
          newQtyC = mainChild;
      }
      // Gán giá trị vào ô input
      tr.querySelector('.d-qty').value = newQtyA;
      tr.querySelector('.d-qtyC').value = newQtyC;
      // ---------------------------------------------------------
      // 2. XỬ LÝ NGÀY ĐI / NGÀY VỀ (DATE IN/OUT)
      // ---------------------------------------------------------
      let newIn = "";
      let newOut = "";
      // Tìm hàng phía trên (Previous Row) để lấy tham chiếu
      // Dùng previousElementSibling để lấy đúng hàng hiển thị bên trên (bất kể ID là gì)
      const prevRow = tr.previousElementSibling;
      let prevOutDate = "";
      let prevInDate = "";
      let preType = "";
      // Kiểm tra xem hàng trên có phải là data row không (hay là header/trống)
      if (prevRow && prevRow.querySelector('.d-out')) {
          prevOutDate = prevRow.querySelector('.d-out').value;
          prevInDate = prevRow.querySelector('.d-in').value;
          preType = prevRow.querySelector('.d-type').value;
      }
      // Logic ngày tháng
      if (['Vé MB', 'Vé Tàu'].includes(type)) {
          // Giống ngày đi/về chung
          newIn = mainStart;
          newOut = mainEnd;
      }
      else if (type === 'Phòng') {
          // Check In: Nếu có hàng trên -> lấy ngày Check Out của hàng trên. Nếu không (hàng đầu) -> Lấy ngày đi chung
          newIn = prevOutDate ? prevOutDate : mainStart;
          // Check Out: Luôn bằng ngày về chung (Mặc định check out cuối tour)
          newOut = mainEnd;
      }
      else {
          // Các dạng khác (Ăn, Tour ngày...):
          // Ngày đi & về = Ngày về hàng trên (nối tiếp).
          // Nếu là hàng đầu -> Bằng ngày đi chung.
          let refDate;
          if (['Phòng', 'Vé MB', 'Vé Tàu'].includes(preType)) {
            refDate = prevInDate ? prevInDate : mainStart;
          } else {
            refDate = prevOutDate ? prevOutDate : mainStart;
          }
          newIn = refDate;
          newOut = refDate;
      }
      // Gán giá trị vào ô input
      if(newIn) tr.querySelector('.d-in').value = newIn;
      if(newOut) tr.querySelector('.d-out').value = newOut;
      // ---------------------------------------------------------
      // 3. TÍNH TOÁN LẠI (Trigger Calc)
      // ---------------------------------------------------------
      // Vì số lượng và ngày thay đổi, cần tính lại Đêm và Thành tiền ngay lập tức
      calcRow(idx);
    }
    // B. Khi đổi Location -> Nếu Type=Phòng -> Cập nhật Hạng Phòng
    function onLocationChange(idx, resetName = true) {
      const tr = getE(`row-${idx}`);
      const type = tr.querySelector('.d-type').value;
      if (type === 'Phòng') {
        updateServiceNameList(idx); // Load hạng phòng của KS này
        if(resetName) tr.querySelector('.d-name').value = "";
      }
    }
    // C. Hàm Fill Location (Gộp Hotel Matrix Col 1 + Other)
    function updateLocationList(idx) {
      const lists = window.APP_DATA.lists;
      // Lấy tên các KS từ Matrix (Cột 0)
      const hotels = (lists.hotelMatrix || []).map(r => r[0]);
      const others = lists.locOther || [];
      // Gộp và loại trùng
      const allLocs = [...new Set([...hotels, ...others])];
      const elLoc = getE(`row-${idx}`).querySelector('.d-loc');
      let currentVal = elLoc.value;
      elLoc.innerHTML = '<option value="">-</option>' + allLocs.map(x => `<option value="${x}">${x}</option>`).join('');
      elLoc.value = currentVal;
    }
    // D. Hàm Fill Service Name / Room Type (CORE LOGIC)
    function updateServiceNameList(idx) {
      const tr = getE(`row-${idx}`);
      const type = tr.querySelector('.d-type').value;
      const loc = tr.querySelector('.d-loc').value;
      const elName = tr.querySelector('.d-name');
      let options = [];
      if (type === 'Phòng') {
          // Tra cứu trong Matrix
          const matrix = window.APP_DATA.lists.hotelMatrix || [];
          // Tìm dòng có tên KS khớp với Location
          const hotelRow = matrix.find(r => r[0] === loc);
          if (hotelRow) {
            // Lấy từ cột 3 đến hết (Index 2 trở đi trong mảng JS - vì JS start 0)
            // Excel: Cột A(0)=Tên. Cột C(2) -> L(11) là hạng phòng.
            // Chú ý: getMatrixData trả về mảng giá trị của row.
            // Ta lấy các ô có dữ liệu từ index 2 trở đi
            options = hotelRow.slice(2).filter(c => c !== "" && c !== null);
          }
      } else {
          const svcMatrix = window.APP_DATA.lists.serviceMatrix || [];
          options = svcMatrix
              .filter(r => r[0] === type) // Cột 0 là Loại
              .map(r => r[1]);            // Cột 1 là Tên
      }
      const currentVal = elName.value;
      elName.innerHTML = '<option value="">-</option>' + options.map(x => `<option value="${x}">${x}</option>`).join('');
      // Cố gắng giữ lại giá trị cũ nếu có trong list mới
      if(options.includes(currentVal)) elName.value = currentVal;
    }
    // =========================================================================
    // 4. TÍNH TOÁN (CALCULATION)
    // =========================================================================
    // 1. Cập nhật hàm calcRow (Fix lỗi tính Đêm)
    function calcRow(idx) {
      if(getVal('BK_Status') === "Hủy") return;
      const tr = getE(`row-${idx}`);
      if(!tr) return;
      const dInStr = tr.querySelector('.d-in').value;
      const dOutStr = tr.querySelector('.d-out').value;
      const type = tr.querySelector('.d-type').value;
      // --- FIX LOGIC ĐÊM ---
      let night = 0;
      if (dInStr && dOutStr) {
          const dIn = new Date(dInStr);
          const dOut = new Date(dOutStr);
          const diff = (dOut - dIn) / 86400000;
          // Yêu cầu: Loại khác Phòng HOẶC Ngày đi = Ngày về => Đêm = 1
          if (type !== 'Phòng' || diff <= 0) {
              night = 1;
          } else {
              night = diff;
          }
      }
      tr.querySelector('.d-night').value = night;
      // ---------------------
      // Tính tiền (Giữ nguyên logic nhân night cho 'Phòng')
      const getNum = (cls) => Number(tr.querySelector('.' + cls).value) || 0;
      const qtyA = getNum('d-qty');
      const priA = getNum('d-pri');
      const qtyC = getNum('d-qtyC');
      const priC = getNum('d-priC');
      const sur = getNum('d-sur');
      const disc = getNum('d-disc');
      // Nếu là Phòng thì nhân số đêm, Dịch vụ khác thì night=1 (đã set ở trên) nên nhân 1 cũng đúng
      // Tuy nhiên để an toàn logic hiển thị:
      // Nếu type=Phòng, multiplier = night. Nếu khác, multiplier = 1 (vì bản chất dịch vụ tính theo lượt)
      const multiplier = (type === 'Phòng') ? Math.max(1, night) : 1;
      const total = ((qtyA * priA) + (qtyC * priC)) * multiplier + sur - disc;
      const elTotal = tr.querySelector('.d-total');
      elTotal.value = formatMoney(total);
      elTotal.dataset.val = total;
      calcGrandTotal();
    }

    // =========================================================================
    // CẬP NHẬT: calcGrandTotal (Tính Tổng & Phân tích giá TB)
    // =========================================================================
    function calcGrandTotal() {
      if(getVal('BK_Status') === "Hủy") return;
      let grandTotal = 0;
      
      // Các biến tích lũy để tính AVG
      let transportTotal = 0; // Tổng tiền Vé MB + Tàu
      let transportA = 0;
      let transportC = 0;
      let landChildTotal = 0; // Tổng tiền Landtour của Trẻ em
      
      // 1. Quét qua tất cả các ô Thành tiền (.d-total)
      document.querySelectorAll('.d-total').forEach(elTotal => {
          const rowTotal = Number(elTotal.dataset.val) || 0;
          grandTotal += rowTotal;

          // --- Logic Phân Tách AVG ---
          const tr = elTotal.closest('tr');
          if (tr) {
              const type = tr.querySelector('.d-type').value;
              
              // Nhóm 1: Vé MB hoặc Vé Tàu -> Gom vào Transport
              if (type === 'Vé MB' || type === 'Vé Tàu') {
                    const qtyA = getVal('.d-qty', tr) ? Number(getVal('.d-qty', tr)) : 0;
                    const priA = getVal('.d-pri', tr) ? Number(getVal('.d-pri', tr)) : 0;
                    const qtyC = getVal('.d-qtyC', tr) ? Number(getVal('.d-qtyC', tr)) : 0;
                    const priC = getVal('.d-priC', tr) ? Number(getVal('.d-priC', tr)) : 0;
                    const sur = getVal('.d-sur', tr) ? Number(getVal('.d-sur', tr)) : 0;
                    const disc = getVal('.d-disc', tr) ? Number(getVal('.d-disc', tr)) : 0;
                    transportA += (qtyA * priA + sur - disc);
                    transportC += (priC * qtyC);
                    transportTotal += rowTotal;
              } 
              // Nhóm 2: Landtour -> Tính tách chi phí Trẻ em
              else {
                  const qtyC = getVal('.d-qtyC', tr) ? Number(getVal('.d-qtyC', tr)) : 0;
                  const priC = getVal('.d-priC', tr) ? Number(getVal('.d-priC', tr)) : 0;
                  
                  // Xác định hệ số nhân (Multiplier) giống logic calcRow
                  // Nếu là Phòng thì nhân số đêm, loại khác nhân 1
                  const nightVal = getVal('.d-night', tr) || 1;
                  const multiplier = (type === 'Phòng') ? Math.max(1, nightVal) : 1;
                  
                  // Cộng dồn chi phí trẻ em dòng này
                  landChildTotal += (qtyC * priC * multiplier);
              }
          }
      });

      // 2. Cập nhật UI Tổng tiền Booking
      const elBkTotal = getE('BK_Total');
      if(elBkTotal) {
          elBkTotal.value = formatMoney(grandTotal);
          elBkTotal.dataset.val = grandTotal;
      }

      // 3. Tính toán Giá Bình Quân (AVG Stats)
      const countAdult = getNum('BK_Adult') || 1; // Tránh chia cho 0
      const countChild = getNum('BK_Child') || 1; 

      // A. Giá TB Trẻ em (Landtour) = Tổng tiền land TE / Số TE
      // Nếu logic của bạn chỉ cần Tổng tiền thì bỏ đoạn chia countChild
      const avgChildPrice = (countChild > 0) ? (landChildTotal / countChild) : 0;
      
      // B. Giá TB Người lớn (Landtour)
      // = (Tổng Booking - Tiền Transport - Tiền Land Trẻ em) / Số NL
      const landTotal = grandTotal - transportTotal;
      const landAdultTotal = landTotal - landChildTotal;
      const avgAdultPrice = (countAdult > 0) ? (landAdultTotal / countAdult) : 0;
      const transAdultPrice = (countAdult > 0) ? (transportA / countAdult) : 0;
      const transChildPrice = (countChild > 0) ? (transportC / countChild) : 0;

      // 4. Hiển thị lên thẻ Stats
      const elStatsA = getE('Stats_AvgAdult');
      const elStatsC = getE('Stats_AvgChild');
      const elStatsTA = getE('Stats_TransportAdult');
      const elStatsTC = getE('Stats_TransportChild');
      
      if (elStatsA) elStatsA.innerText = formatMoney(Math.round(avgAdultPrice)); // Dùng innerText cho thẻ Span/Div
      if (elStatsC) setVal(elStatsC, formatMoney(Math.round(avgChildPrice)));
      if (elStatsTA) setVal(elStatsTA, formatMoney(transAdultPrice));
      if (elStatsTC) setVal(elStatsTC, formatMoney(transChildPrice));

      const balance = grandTotal - getNum('BK_Deposit');
      setNum('BK_Balance', balance);
      
    }

    async function updateDeposit() {
      try {
        const bkId = getVal('BK_ID');
        if (!bkId) {
          log('⚠️ Booking ID trống, không thể tải Deposit', 'warning');
          return 0;
        }
        
        // Firestore operator: '==' (không phải '=')
        const result = await A.DB.runQuery('transactions', 'booking_id', '==', bkId);
        
        if (!result || !Array.isArray(result)) {
          log('⚠️ Không tìm thấy giao dịch cho booking này', 'warning');
          setVal('BK_Deposit', 0);
          return 0;
        }
        
        const total = result.reduce((sum, tx) => sum + (tx.amount || 0), 0) / 1000;
        setVal('BK_Deposit', total);
        trigger('BK_Deposit', 'change'); // Trigger event để cập nhật UI liên quan (nếu có)
        return total;
      } catch (e) {
        log(`❌ Lỗi cập nhật Deposit: ${e.message}`, 'error');
        return 0;
      }
    }

    function updateBkStatus () {
      // Auto Status
      let curStatus = getVal('BK_Status');
      let grandTotal = getNum('BK_Total');
      let deposit = getNum('BK_Deposit');
      const startDate = new Date(getVal('BK_Start'));
      const today = new Date(); // YYYY-MM-DD
      let stt;
      if (curStatus !== 'Hủy') {
        if (grandTotal === 0) stt = 'Hủy';
        else if (startDate <= today && deposit === grandTotal) stt =  'Xong BK';
        else if (deposit === grandTotal && grandTotal > 0) stt = 'Thanh Toán';
        else if (startDate < today && deposit < grandTotal) stt =  'Công nợ';
        else if (deposit > 0) stt = 'Đặt Cọc';
        else stt =  'Đặt Lịch';
      }
      setVal('BK_Status', stt);
      return stt;
    }

    function autoSetOrCalcDate(start, end) {
      // Kiểm tra đầu vào
      if (!start) return; 

      // Bước 1: Thử tìm xem end có phải là ID của một element trong DOM không
      const targetElement = getE(end);

      if (targetElement) {
        // --- TRƯỜNG HỢP: end LÀ ID ---
        // Gán giá trị start cho element tìm thấy
        targetElement.value = start;
        log(`Đã gán giá trị ${start} vào element có id="${end}"`);
        
      } else {
        // --- TRƯỜNG HỢP: end KHÔNG PHẢI ID (Giả định là Ngày tháng) ---
        // Chuyển đổi sang đối tượng Date để tính toán
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Kiểm tra xem end có phải là ngày hợp lệ không
        if (!isNaN(endDate.getTime())) {
          // Tính hiệu số mili-giây
          const diffTime = endDate - startDate; 
          
          // Chuyển mili-giây sang số ngày (chia cho 1000ms * 60s * 60m * 24h)
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          log(`Khoảng cách là: ${diffDays} ngày`);
          return diffDays;
        } else {
          log("Tham số 'end' không phải là ID tồn tại, cũng không phải ngày hợp lệ.", 'error');
        }
      }
    }
    /**
     * HÀM TRÍCH XUẤT DỮ LIỆU: Được BaseForm gọi khi nhấn nút SAVE
     * Nhiệm vụ: Gom toàn bộ dữ liệu trên Form thành JSON để gửi về Server
     */
    window.getFormData = function() {
      try {
        // 1. Bookings Data
        const bookings = {
          id: getVal('BK_ID'),
          customer_id: getVal('BK_CustID') || '',
          customer_name: getVal('Cust_Name'),
          customer_phone: formatPhone(getVal('Cust_Phone')),
          startDate: getVal('BK_Start'),
          endDate: getVal('BK_End'),
          adults: getVal('BK_Adult'),
          children: getVal('BK_Child'),
          total: getVal('BK_Total'), // Lấy giá trị thô
          deposit: getVal('BK_Deposit'),
          balance: 0, // Sẽ tính lại ở server hoặc dòng dưới
          payType: getVal('BK_PayType'),
          payDue: getVal('BK_PayDue'),          
          note: getVal('BK_Note'),
          staff: getVal('BK_Staff') || CURRENT_USER.name || '',
          status: '',          
          bkDate: getVal('BK_Date'),
          tourName: getVal('BK_TourName'), // Thêm Tour Name          
        };

        bookings.balance = Number(bookings.total) - Number(bookings.deposit);
        bookings.status = updateBkStatus();
        
        // 2. Customer Data
        const customer = {
          full_name: getVal('Cust_Name'),
          phone: formatPhone(getVal('Cust_Phone')),
          source: getVal('Cust_Source')
        };

        // 3. Details Data
        const booking_details = [];
        document.querySelectorAll('#detail-tbody tr').forEach(tr => {
          booking_details.push({
            sid: getVal('.d-sid', tr),
            booking_id: bookings.id,
            type: getVal('.d-type', tr),
            location: getVal('.d-loc', tr),
            name: getVal('.d-name', tr),
            in: getVal('.d-in', tr),
            out: getVal('.d-out', tr),
            night: getVal('.d-night', tr),
            qtyA: getVal('.d-qty', tr),
            priA: getVal('.d-pri', tr),
            qtyC: getVal('.d-qtyC', tr),
            priC: getVal('.d-priC', tr),
            sur: getVal('.d-sur', tr),
            disc: getVal('.d-disc', tr),
            total: getVal('.d-total', tr),
            code: getVal('.d-code', tr),
            note: getVal('.d-note', tr)
          });
        });
        log("Dữ liệu trích xuất từ Form OK!");
        return { bookings, customer, booking_details }; 
      } catch (error) {
        logError("Lỗi khi trích xuất dữ liệu từ Form: " + error.message);
        return null;
      }
    };

    /**
     * Hàm này được BaseForm gọi sau khi Server trả về kết quả tìm kiếm
     * @param {Object} res - Kết quả từ server { success, booking, booking_details, message }
     */
    function fillFormFromSearch(res) {
      showLoading(false);
      // 1. Kiểm tra lỗi từ Server
      if (!res) {     
          logError("Không tìm thấy dữ liệu phù hợp! - Lỗi biến res");
          return;
      }
      
      try {
        // log("FillForm running");
        const bkData = res.bookings;
        log(Object.values(bkData));
        const detailsData = res.booking_details;
        const customerData = res.customer;
        // THÊM: Đồng bộ sang Tab Khách hàng
        // if (typeof window.updateCustomerTab === 'function' && getE('tab-sub-form')) {
        //     // res.customer là dữ liệu full lấy từ searchBookingAPI (bước trước ta đã làm)
        //     const syncData = {
        //         full_name: res.bookings[4] || res.bookings.customer_name, // Name từ Booking Bookings
        //         phone: res.bookings[5] || res.bookings.customer_phone, // Phone từ Booking Bookings
        //         source: "", // Sẽ lấy từ fullRaw
        //         fullRaw: res.customer // Data lấy từ DB_CUSTOMER
        //     };

        //     window.updateCustomerTab(syncData);
        // }

        if (typeof loadBookingToUI === 'function') {
            loadBookingToUI(bkData, customerData, detailsData);
            // Log thông báo
            const sourceMsg = res.source === 'local' ? ' (⚡ Local)' : ' (🐢 Database)';
            log(`Đã tải Booking: ${bkData[0]} - ${bkData.id} ${sourceMsg}`, "success");
        } else {
            logA("Lỗi hệ thống: Không thể hiển thị dữ liệu lên Form.", "error");
        }
        // log("FillForm end");
      } catch (e) {
        log("Lỗi:", e.message, "error");
      } finally {
        showLoading(false);
      }
    }
    
    function findCustByPhone(e) {
      const phoneInput = getE('Cust_Phone').value.trim();
      const nameInput = getE('Cust_Name').value.trim();
      
      if (phoneInput.length < 3 && nameInput.length < 3) return;
      
      const customers = window.APP_DATA ? window.APP_DATA.customers : [];
      
      let found = null;
      
      // --- BƯỚC 1: TÌM THEO SỐ ĐIỆN THOẠI ---
      if (phoneInput.length >= 3) {
      found = customers.find(c => {
        if (!c) return false;
        
        // Object format: c.phone hoặc c.customer_phone
        if (typeof c === 'object' && !Array.isArray(c)) {
        const phone = c.phone || c.customer_phone || '';
        return String(phone).includes(phoneInput);
        }
        
        // Array format: c[1]
        if (Array.isArray(c)) {
        return c[6] && String(c[6]).includes(phoneInput);
        }
        
        return false;
      });
      }
      
      // --- BƯỚC 2: NẾU CHƯA TÌM THẤY => TÌM THEO TÊN ---
      if (!found && nameInput.length >= 3) {
      found = customers.find(c => {
        if (!c) return false;
        
        // Object format: c.name hoặc c.customer_name
        if (typeof c === 'object' && !Array.isArray(c)) {
        const name = c.name || c.customer_name || '';
        return String(name).toLowerCase().includes(nameInput.toLowerCase());
        }
        
        // Array format: c[1]
        if (Array.isArray(c)) {
        return c[1] && String(c[1]).toLowerCase().includes(nameInput.toLowerCase());
        }
        
        return false;
      });
      }

      if (found) {
      // Lấy dữ liệu theo format
      let custName = '';
      let custPhone = '';
      let custSource = '';
      
      if (typeof found === 'object' && !Array.isArray(found)) {
        // Object format
        custName = found.full_name || found.customer_name || '';
        custPhone = found.phone || found.customer_phone || '';
        custSource = found.source || found.customer_source || '';
      } else if (Array.isArray(found)) {
        // Array format
        custName = found[1] || '';
        custPhone = found[6] || '';
        custSource = found[8] || '';
      }
      
      // Cập nhật form
      getE('Cust_Name').value = custName;
      getE('Cust_Phone').value = custPhone;
      if (custSource) getE('Cust_Source').value = custSource;
      log("Tìm thấy khách:", found);
      }
    }

    /**
     * CORE LOGIC: Xử lý dữ liệu Template (Tịnh tiến ngày)
     * @param {Array} booking_details - Dữ liệu thô từ template
     * @param {string} anchorDateStr - Ngày gốc của template (YYYY-MM-DD hoặc Date obj)
     * @param {string} newStartStr - Ngày đi mới (YYYY-MM-DD)
     * @param {number} newAdult - Số người lớn mới
     */
    function processAndFillTemplate(booking_details, anchorDateStr, newStartStr, newAdult) {
      log("run processAndFillTemplate");
      // A. Tính toán Offset (Độ lệch ngày)
      // Chuyển đổi an toàn sang Date Object
      // Lưu ý: new Date("YYYY-MM-DD") mặc định là UTC. Ta cần xử lý cẩn thận để tránh lệch múi giờ.
      // Cách an toàn nhất: Set giờ về 12:00 trưa để tránh lệch ngày
      const parseDate = (dStr) => {
          if(!dStr) return null;
          if(dStr instanceof Date) return dStr;
          return new Date(dStr);
      };

      const dOld = parseDate(anchorDateStr);
      const dNew = parseDate(newStartStr);
      // Tính độ lệch theo mili-giây
      const diffTime = dNew.getTime() - dOld.getTime();
      // B. Xóa bảng cũ
      getE('detail-tbody').innerHTML = '';
      detailRowCount = 0;
      // C. Duyệt từng dòng và add vào bảng
      booking_details.forEach(row => {
        // 1. Xử lý Ngày (Date Shifting)
        let shiftedIn = "";
        let shiftedOut = "";
        if (row.in) {
            const rIn = parseDate(row.in);
            const newInDate = new Date(rIn.getTime() + diffTime);
            shiftedIn = newInDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
        }
        if (row.out) {
            const rOut = parseDate(row.out);
            const newOutDate = new Date(rOut.getTime() + diffTime);
            shiftedOut = newOutDate.toISOString().split('T')[0];
        }
        // 2. Xử lý Số lượng (Scale theo người lớn)
        // Logic: Nếu Template set số lượng == 0 hoặc 1 thì giữ nguyên? 
        // Hay là override bằng số khách hiện tại?
        // Theo yêu cầu: "Cập nhật ngày... yêu cầu điền thông tin 3 ô (Start, End, Adult)..."
        // => Ngầm hiểu là cần update số lượng theo Adult mới.
        let finalQtyA = row.qtyA;
        let finalQtyC = row.qtyC; // Trẻ em thường giữ nguyên theo template hoặc set 0
        // Logic thông minh: 
        // Nếu là Phòng: Có thể giữ nguyên logic chia phòng hoặc lấy từ template
        // Nếu là Ăn/Vé/Tour: Thường bằng số khách.
        // Ở đây ta ưu tiên logic: Sử dụng hàm autoFillRowData có sẵn hoặc gán trực tiếp.
        // Phương án an toàn: Gán theo số người lớn mới nều loại DV không phải là Xe/HDV (thường cố định).
        if (['Xe', 'HDV', 'Tàu', 'Ca nô'].includes(row.type)) {
            // Giữ nguyên số lượng trong template (vì có thể là 1 xe, 1 tàu)
        } else {
            // Các loại khác (Vé, Ăn, Phòng...) -> Update theo số khách mới
            // Tuy nhiên nếu là Phòng, logic chia 2 có thể áp dụng.
            // Để đơn giản và chính xác theo yêu cầu: Ta gán lại row.qtyA = newAdult
            if (row.type === 'Phòng') {
                finalQtyA = Math.ceil(newAdult / 2); // Logic chia đôi
            } else {
                finalQtyA = newAdult;
            }
        }
        // 3. Construct Data Array cho hàm addDetailRow
        // Mapping lại format mảng mà addDetailRow mong đợi:
        // [sid, null, type, loc, name, in, out, null, qty, pri, qtyC, priC, sur, disc, null, code, note]
        const rowData = [
            "", // 0: SID (Mới nên rỗng)
            "", // 1: Blank
            row.type,     // 2
            row.location, // 3
            row.name,     // 4
            shiftedIn,    // 5: Date In (Đã tịnh tiến)
            shiftedOut,   // 6: Date Out (Đã tịnh tiến)
            "",           // 7: Time/Note
            finalQtyA,    // 8: Qty A (Đã update)
            row.priA,     // 9: Price A (Giữ nguyên)
            row.qtyC,     // 10: Qty C
            row.priC,     // 11: Price C
            row.sur,      // 12
            row.disc,     // 13
            "",           // 14: Total (Tự tính lại)
            row.code,     // 15
            row.note      // 16
        ];
        // Gọi hàm có sẵn để render lên UI
        addDetailRow(rowData);
      });
      logA("Đã tải Template và cập nhật ngày tháng thành công!", "success");
    }

    // =========================================================================
    // LOGIC CUSTOMER TAB
    // =========================================================================

    /**
     * Hàm này được gọi từ BookingForm hoặc BaseForm khi có dữ liệu khách hàng
     * @param {Object} custData - { name, phone, email, ... }
     */
    window.updateCustomerTab = function(custData) {
      if(!custData && getE('tab-sub-form')) {
        // 1. Đồng bộ dữ liệu cơ bản từ Booking Form
        getE('Ext_CustName') ? setVal('Ext_CustName', getVal('Cust_Name')) : null;
        getE('Ext_CustPhone') ? setVal('Ext_CustPhone', getVal('Cust_Phone')) : null;
        getE('Ext_CustSource') ? setVal('Ext_CustSource', getVal('Cust_Source')) : null;
        return;
      }

      // 1. Đồng bộ dữ liệu cơ bản từ Booking Form
      setVal('Ext_CustName', getVal('Cust_Name'));
      setVal('Ext_CustPhone', getVal('Cust_Phone'));
      setVal('Ext_CustSource', getVal('Cust_Source'));

      // 2. Điền dữ liệu chi tiết (nếu lấy từ DB)
      // Map theo index cột của DB_CUSTOMER hoặc Object trả về từ searchBookingAPI
      // Giả sử searchBookingAPI trả về mảng customer full: [ID, Phone, Name, Email, Addr, Note, Type, Source, ...]
      
      if (custData.fullRaw) {
          const raw = custData.fullRaw;

          setVal('Ext_CustEmail', raw.email || raw[7] || ""); 
          setVal('Ext_CustAddr', raw.address || raw[5] || "");
          setVal('Ext_CustCCCDDate', raw.id_card_date || raw[4] || "");
          setVal('Ext_CustDOB', raw.dob || raw[2] || "");
          setVal('Ext_CustCCCD', raw.id_card || raw[3] || "");
      }
    };

    /**
     * Hàm lấy dữ liệu đầy đủ từ Tab này để phục vụ Export
     */
    window.getExtendedCustomerData = function() {
      try {
        // Ưu tiên lấy từ Tab 4, nếu Tab 4 trống thì fallback về Tab 1
        const phone = getVal('Ext_CustPhone') || getVal('Cust_Phone');

        let custRow = null;
          
        // Tìm thông tin Customer (Hỗ trợ cả array và object format)
        if (phone !== "" && window.APP_DATA) {
          // Hỗ trợ cả format cũ (array) và format mới (object)
          const customerList = window.APP_DATA.customers_obj || window.APP_DATA.customers || [];
          
          custRow = customerList.find(r => {
            if (!r) return false;

            // Xử lý object format (mới)
            if (typeof r === 'object' && !Array.isArray(r)) {
              const rPhone = r.phone || r.customer_phone || '';
              return String(rPhone).includes(phone);
            }

            // Xử lý array format (cũ)
            if (Array.isArray(r)) {
              const rPhone = r[6] || ''; // Index 6 cho array format
              return String(rPhone).includes(phone);
            }

            return false;
          });
          
          if (!custRow) {
            log("Local search: Không tìm thấy khách theo SĐT");
          }
        }

        const formSource = getVal('Cust_Source') || getVal('Ext_CustSource');
        
        if (custRow) {
          log('Thấy cust row', custRow);
          
          // Lấy dữ liệu từ object hoặc array
          let dbSource = "";
          let custEmail = "";
          let custCCCD = "";
          let custAddress = "";
          let custCCCDDate = "";
          let custDOB = "";

          if (typeof custRow === 'object' && !Array.isArray(custRow)) {
            // Object format (mới)
            dbSource = custRow.source || custRow.customer_source || "";
            custEmail = custRow.email || custRow.customer_email || "";
            custCCCD = custRow.id_card || custRow.cccd || "";
            custAddress = custRow.address || custRow.customer_address || "";
            custCCCDDate = custRow.id_card_date || custRow.cccd_date || "";
            custDOB = custRow.dob || custRow.customer_dob || "";
          } else if (Array.isArray(custRow)) {
            // Array format (cũ) - Index mapping
            // Giả định: [0]=ID, [6]=Phone, [1]=Name, [2]=DOB, [5]=Address, [3]=CCCD, [4]=CCCD_Date, [7]=Email, [8]=Source
            dbSource = custRow[8] || "";
            custEmail = custRow[7] || "";
            custCCCD = custRow[3] || "";
            custAddress = custRow[5] || "";
            custCCCDDate = custRow[4] || "";
            custDOB = custRow[2] || "";
          }

          return {
            full_name: getVal('Ext_CustName') !== "" ? getVal('Ext_CustName') : getVal('Cust_Name'),
            phone: phone,        
            email: custEmail !== "" ? custEmail : "",
            id_card: custCCCD !== "" ? custCCCD : "",
            address: custAddress !== "" ? custAddress : "",
            id_card_date: custCCCDDate !== "" ? custCCCDDate : "",
            dob: custDOB !== "" ? custDOB : "",
            source: dbSource !== "" ? dbSource : formSource
          };
        } else {
          log('Chưa có khách hàng => sẽ tạo mới!');
          return {
            full_name: getVal('Ext_CustName') || getVal('Cust_Name'),
            phone: phone,        
            email: getVal('Ext_CustEmail') || "",
            id_card: getVal('Ext_CustCCCD') || "",
            address: getVal('Ext_CustAddr') || "",
            id_card_date: getVal('Ext_CustCCCDDate') || "",
            dob: getVal('Ext_CustDOB') || "",
            source: formSource
          };
        }
      } catch (e) {
        log("Lỗi hàm getExtendedCustomerData", e.message, 'error');
        return null;
      }
    };

    window.prepareCreateCustomer = function() {
      // A. Chuyển sang Tab Customer
      // B. Reset form về rỗng
      const customerForm = getE('customer-extended-form');
      if (customerForm) customerForm.reset();
      
      // C. Mở khóa (Unlock) các trường Readonly (Tên & SĐT)
      const elName = getE('Ext_CustName');
      const elPhone = getE('Ext_CustPhone');
      
      if (elName) {
        elName.readOnly = false;
        elName.classList.remove('bg-light');
        elName.placeholder = "Nhập tên khách mới...";
        elName.focus();
      }

      if (elPhone) {
        elPhone.readOnly = false;
        elPhone.classList.remove('bg-light');
        elPhone.placeholder = "Nhập số điện thoại...";
      }

      // D. Hiển thị nút Lưu
      const btnSave = getE('btn-save-customer');
      if (btnSave) btnSave.classList.remove('d-none');
    };

    /**
     * 1. Xử lý khi click vào dòng trong Bảng Tổng hợp (Bảng 3, 4)
     * @param {string} key - Giá trị khóa (Tên Supplier hoặc Tên Type)
     * @param {string} filterType - Loại lọc ('staff' hoặc 'type')
     */
    function handleAggClick(key, filterType) {
        log(`📂 Mở chế độ Batch Edit: [${filterType}] ${key}`);

        // 1. CHỈNH SỬA: Đổi nguồn dữ liệu sang APP_DATA.booking_details
        const source = APP_DATA.booking_details.slice(); 

        // 2. CHUẨN BỊ DỮ LIỆU TRA CỨU (Lookup Map)
        // Mục đích: Tạo bảng nối nhanh giữa ID Booking và Tên Staff để không phải loop qua bookings nhiều lần
        const staffMap = new Map();
        
        if (filterType === 'staff') {
            const bookings = APP_DATA.bookings.slice();
            bookings.forEach(mRow => {
                const mId = mRow[COL_INDEX.M_ID];     // ID trong Bookings
                const mStaff = mRow[COL_INDEX.M_STAFF]; // Tên Staff
                // Lưu vào Map: Key là ID (chuyển về string cho chắc chắn), Value là Staff
                staffMap.set(String(mId), mStaff);
            });
        }

        // 3. Lọc dữ liệu
        const dFrom = new Date(getVal('dash-filter-from')); dFrom.setHours(0,0,0,0);
        const dTo = new Date(getVal('dash-filter-to')); dTo.setHours(23,59,59,999);
        
        const batchData = source.filter(row => {
            // A. Check Ngày (Check-in) - Giữ nguyên
            const dIn = row[COL_INDEX.D_IN] ? new Date(row[COL_INDEX.D_IN]) : null;
            if (!dIn || dIn < dFrom || dIn > dTo) return false;

            // B. Check Key theo Staff (Logic Mới)
            if (filterType === 'staff') {
                // Lấy ID booking từ dòng chi tiết hiện tại
                const bkId = row[COL_INDEX.D_BKID]; 
                
                // Tìm tên Staff tương ứng từ Map đã tạo ở trên
                // Nếu không tìm thấy trong Map (booking cũ/lỗi data), coi như rỗng
                let staffName = staffMap.get(String(bkId));
                
                // Xử lý dữ liệu null/undefined để so sánh chính xác với key
                if (staffName === undefined || staffName === null) staffName = "";

                // So sánh
                return String(staffName) === String(key);
            }
            
            // (Giữ lại logic cũ cho supplier/type nếu bạn vẫn dùng, nếu không có thể xóa đoạn else if này)
            else if (filterType === 'supplier') {
                let v = row[COL_INDEX.D_SUPPLIER];
                if (!v || String(v).trim() === '') v = "(Chưa gán NCC)";
                return String(v) === String(key);
            } 
            else if (filterType === 'type') {
                let t = row[COL_INDEX.D_TYPE] || "Khác";
                return String(t) === String(key);
            }

            return false;
        });

        if (batchData.length === 0) {
            // logA là hàm thông báo (giả định)
            if (typeof logA === 'function') {
                logA("Không có dữ liệu chi tiết trong khoảng thời gian này.", "warning");
            } else {
                console.warn("Không có dữ liệu chi tiết trong khoảng thời gian này.");
            }
            return;
        }

        // 4. Mở giao diện Edit
        openBatchEdit(batchData, key);
    }


    /**
     * MODULE: CONFIRMATION RENDERER
     * Nhiệm vụ: Xử lý logic hiển thị mẫu xác nhận, in ấn và đa ngôn ngữ.
     */
    const ConfirmationModule = (function() {
      
      // 1. CONFIG & STATE
      let _currentData = null; // Dữ liệu Booking đang xem
      let _lang = 'vi';        // Ngôn ngữ hiện tại
      let _mode = 'service';   // Chế độ xem: 'service' (chi tiết) hoặc 'tour' (rút gọn)
      let _showPrice = true;   // Cờ hiển thị giá

      // Từ điển ngôn ngữ
      const DICT = {
        vi: {
          title: "XÁC NHẬN ĐẶT DỊCH VỤ",
          ref: "Mã Booking:",
          confirm_date: "Ngày xác nhận:",
          cust_info: "THÔNG TIN KHÁCH HÀNG",
          cust_name: "Khách hàng:", cust_email: "Email:", cust_phone: "Điện thoại:", cust_add: "Địa chỉ:",
          adult: "Người lớn:", child: "Trẻ em:",
          svc_details: "CHI TIẾT DỊCH VỤ",
          col_desc: "Dịch vụ / Diễn giải", col_date: "Ngày sử dụng", col_out: "Ngày về", col_qty: "SL", col_price: "Đơn giá", col_total: "Thành tiền",
          note: "GHI CHÚ:",
          lbl_total: "TỔNG CỘNG:", lbl_paid: "ĐÃ THANH TOÁN:", lbl_due: "CÒN LẠI:",
          sign_cust: "KHÁCH HÀNG", sign_comp: "CÔNG TY TNHH 9 TRIP PHÚ QUỐC", signature: "(Ký tên)", sign_status: "(Đã xác nhận)"
        },
        en: {
          title: "SERVICE CONFIRMATION",
          ref: "Booking ID:",
          confirm_date: "Date:",
          cust_info: "CUSTOMER INFORMATION",
          cust_name: "Customer:", cust_email: "Email:", cust_phone: "Phone:", cust_add: "Address:",
          adult: "Adults:", child: "Children:",
          svc_details: "SERVICE DETAILS",
          col_desc: "Service Name", col_date: "Check-In", col_out: "Check-Out", col_qty: "Qty", col_price: "Price", col_total: "Amount",
          note: "NOTES / POLICY:",
          lbl_total: "TOTAL AMOUNT:", lbl_paid: "DEPOSIT / PAID:", lbl_due: "BALANCE DUE:",
          sign_cust: "CUSTOMER", sign_comp: "9 TRIP PHU QUOC CO., LTD", signature: "(Signature)", sign_status: "(Confirmed)"
        }
      };

      // 2. CORE FUNCTIONS
      
      // Hàm mở Modal (Entry Point)
      async function openModal(bookingId) {
        if (!bookingId) return logA("Không có mã Booking!", "warning");

        try {
          // Gọi API lấy dữ liệu chi tiết
          // Sử dụng lại searchBookingAPI của Server để đảm bảo nhất quán
          const res = findBookingInLocal(bookingId);
          
          if (res && res.success) {
            _currentData = res;
            const formEl = getE('tmpl-confirmation-modal');
            const form = formEl.content.cloneNode(true);
            if (formEl) {
              A.Modal.render(form, `Xác nhận dịch vụ New - Booking ID: ${bookingId}`);
              await _renderUI();
              A.Modal.show();
            }
          } else {
            logA(`Không tìm thấy Booking ID: ${bookingId}`, "error");
          }        
          
        } catch (e) {
          logError(e);
          logA(`Lỗi: ${e.message}`, "error");
        }
      }

      // Hàm render giao diện chính
      async function _renderUI() {
        // 1. Load Template
        // A.UI.renderTemplate('dynamic-modal-body', 'tmpl-confirmation-modal', true);
        
        // 2. Điền dữ liệu Header & Customer
        const m = _currentData.bookings; // [ID, Date, Email, CID, Name, Phone, Start...]
        const c = _currentData.customer; // Thông tin full khách hàng (nếu có)
        
        setVal('conf-id', m.id || m[0]); // ID Booking
        setVal('conf-date', typeof formatDateVN === 'function' ? formatDateVN(m.created_at) : m[1]); // Ngày đặt
        setVal('print-time', new Date().toLocaleString());
        setVal('conf-cust-adult', m.adults || m[COL_INDEX.M_ADULT]); // Số người lớn
        setVal('conf-cust-child', m.children || m[COL_INDEX.M_CHILD]); // Số trẻ em
        setVal('conf-cust-name', m.customer_name || c[1]);
        setVal('conf-cust-phone', m.customer_phone || c[6]);
        setVal('conf-cust-email', (c && c.email) ? c.email : ""); // Email từ bảng Customer
        setVal('conf-cust-add', (c && c.address) ? c.address : "");   // Địa chỉ
        setVal('conf-staff', "Sales Executive"); // Nhân viên

        // 3. Điền bảng dữ liệu (Table)
        await _renderTable();

        // 4. Điền Tổng tiền
        setVal('conf-total', formatMoney(m.total_amount * 1000));
        setVal('conf-paid', formatMoney(m.deposit_amount * 1000));
        setVal('conf-balance', formatMoney(m.balance_amount * 1000));
        
        // Cập nhật ngôn ngữ và mode
        _applySettings();
        A.UI.renderTemplate('body', 'tmpl-download-pdf');
      }

      // Hàm render bảng chi tiết (Xử lý 2 chế độ: Service & Tour)
      async function _renderTable() {

          const booking_details = _currentData.booking_details || [];
          const tbodySvc = document.getElementById('conf-tbody-service');
          const tbodyTour = document.getElementById('conf-tbody-tour');
          
          // Reset
          tbodySvc.innerHTML = '';
          tbodyTour.innerHTML = '';

          // ============================================================
          // MODE 1: SERVICE LIST (Chi tiết - Giữ nguyên logic của bạn)
          // ============================================================
                booking_details.forEach((d, i) => {
                  // Xử lý cả array và object format
                  let serviceName = '';
                  let location = '';
                  let checkIn = '';
                  let checkOut = '';
                  let price = 0;
                  let total = 0;
                  let note = '';

                  if (typeof d === 'object' && !Array.isArray(d)) {
                    // Object format
                    serviceName = d.name || d.service_name || '';
                    location = d.location || d.hotel_name || '';
                    checkIn = d.in || d.check_in || '';
                    checkOut = d.out || d.check_out || '';
                    price = Number(d.unit_price || d.price || 0);
                    total = Number(d.total || d.total_amount || 0);
                    note = d.note || '';
                  } else if (Array.isArray(d)) {
                    // Array format (legacy)
                    serviceName = d[4] || '';
                    location = d[3] || '';
                    checkIn = d[5] || '';
                    checkOut = d[6] || '';
                    price = Number(d[9] || 0);
                    total = Number(d[14] || 0);
                    note = d[16] || '';
                  }

                  const rowHtml = `
                  <tr>
                    <td class="text-center">${i + 1}</td>
                    <td>
                    <div class="fw-bold">${serviceName}</div>
                    <div class="text-muted fst-italic small">${location}${note ? ' (' + note + ')' : ''}</div>
                    </td>
                    <td class="text-center">${checkIn ? formatDateVN(checkIn) : ''}</td>
                    <td class="text-center">${checkOut ? formatDateVN(checkOut) : ''}</td>
                    <td class="text-end col-price">${formatMoney(price * 1000)}</td>
                    <td class="text-end fw-bold col-price">${formatMoney(total * 1000)}</td>
                  </tr>
                  `;
                  tbodySvc.insertAdjacentHTML('beforeend', rowHtml);
                });      // ============================================================
          // MODE 2: TOUR / COMBO (Logic Mới: Dựa trên Stats)
          // ============================================================
          
          // Lưu ý: _currentData phải có field adults/children. Nếu không có thì lấy từ giao diện.
          const qtyAdult = parseInt(_currentData.bookings[COL_INDEX.M_ADULT]) || getVal('BK_Adult') || 0; 
          const qtyChild = parseInt(_currentData.bookings[COL_INDEX.M_CHILD]) || getVal('BK_Child') || 0;
          const priceTourA = getNum(getVal('Stats_AvgAdult')) * 1000;      // Giá Tour/Combo NL
          const priceTourC = getNum(getVal('Stats_AvgChild')) * 1000;      // Giá Tour/Combo TE
          const priceTransA = getNum(getVal('Stats_TransportAdult')) * 1000; // Giá Vận chuyển NL
          const priceTransC = getNum(getVal('Stats_TransportChild')) * 1000; // Giá Vận chuyển TE

          // 3. Xác định tên loại vận chuyển (Máy bay hay Tàu?)
          // Quét nhẹ qua list detail để xem có từ khóa nào
          let transName = "Vé vận chuyển";
          const hasFlight = booking_details.some(d => String(d.service_type).toLowerCase().includes('vé mb') || String(d.service_name).toLowerCase().includes('bay'));
          const hasTrain = booking_details.some(d => String(d.service_type).toLowerCase().includes('vé tàu') || String(d.service_name).toLowerCase().includes('tàu'));
          
          if (hasFlight && !hasTrain) transName = "Vé máy bay";
          else if (!hasFlight && hasTrain) transName = "Vé tàu cao tốc";
          else if (hasFlight && hasTrain) transName = "Vé máy bay & Tàu cao tốc";

          // 4. Tạo mảng các dòng hiển thị
          let tourRows = [];

          // --- Dòng 1: Tour/Combo Người lớn ---
          if (qtyAdult > 0 && priceTourA > 0) {
              tourRows.push({
                  name: `Người lớn`,
                  qty: qtyAdult,
                  price: priceTourA,
                  total: qtyAdult * priceTourA
              });
          }

          // --- Dòng 2: Tour/Combo Trẻ em ---
          if (qtyChild > 0 && priceTourC > 0) {
              tourRows.push({
                  name: `Trẻ em`,
                  qty: qtyChild,
                  price: priceTourC,
                  total: qtyChild * priceTourC
              });
          }

          // --- Dòng 3: Vé vận chuyển Người lớn ---
          if (qtyAdult > 0 && priceTransA > 0) {
              tourRows.push({
                  name: `${transName} (Người lớn)`,
                  qty: qtyAdult,
                  price: priceTransA,
                  total: qtyAdult * priceTransA
              });
          }

          // --- Dòng 4: Vé vận chuyển Trẻ em ---
          if (qtyChild > 0 && priceTransC > 0) {
              tourRows.push({
                  name: `${transName} (Trẻ em)`,
                  qty: qtyChild,
                  price: priceTransC,
                  total: qtyChild * priceTransC
              });
          }
          log("Tour Rows:", tourRows[0]);

          // 5. Render ra HTML
          // Xóa nội dung cũ
          tbodyTour.innerHTML = ''; 

          const MIN_ROWS = 5;
          const dataCount = tourRows.length;

          // Bước A: Render dữ liệu thật (nếu có)
          tourRows.forEach(r => {
              const html = `
                <tr>
                  <td><span class="fw-bold">${r.name}</span></td>
                  <td class="text-center">${r.qty}</td>
                  <td class="text-end col-price">${formatMoney(r.price)}</td>
                  <td class="text-end fw-bold col-price">${formatMoney(r.total)}</td>
                </tr>`;
              tbodyTour.insertAdjacentHTML('beforeend', html);
          });

          // Bước B: Render dòng trống cho đủ 5 dòng
          // Vòng lặp chạy từ số lượng hiện tại đến 5
          for (let i = dataCount; i < MIN_ROWS; i++) {
              let rowContent = '';
              
              // Tùy chọn: Nếu hoàn toàn không có dữ liệu (i=0), dòng đầu tiên hiện thông báo
              if (i === 0 && dataCount === 0) {
                  rowContent = `<td colspan="4" class="text-center text-muted fst-italic">Chưa có dữ liệu tính giá</td>`;
              } else {
                  // Các dòng còn lại để trống (dùng &nbsp; để giữ chiều cao dòng không bị xẹp)
                  rowContent = `
                      <td><span class="fw-bold">&nbsp;</span></td>
                      <td class="text-center"></td>
                      <td class="text-end col-price"></td>
                      <td class="text-end fw-bold col-price"></td>                      
                  `;
              }
              
              tbodyTour.insertAdjacentHTML('beforeend', `<tr>${rowContent}</tr>`);
          }
      }

      // 3. ACTIONS & HELPERS

      function setLang(lang) {
        _lang = lang;
        document.getElementById('btn-lang-vn').classList.toggle('active', lang === 'vi');
        document.getElementById('btn-lang-en').classList.toggle('active', lang === 'en');
        _applySettings();
      }

      function togglePrice() {
        const chk = document.getElementById('btn-check-price');
        _showPrice = chk ? chk.checked : true;
        _applySettings();
      }

      function setMode(mode) {
        _mode = mode;
        if(mode === 'service') {
            document.getElementById('tbl-mode-service').classList.remove('d-none');
            document.getElementById('tbl-mode-tour').classList.add('d-none');
        } else {
            document.getElementById('tbl-mode-service').classList.add('d-none');
            document.getElementById('tbl-mode-tour').classList.remove('d-none');
        }
      }
      /**
       * Helper: Lấy HTML sạch để gửi email
       * - Xóa các phần tử ẩn
       * - Inline CSS cho các cột Grid
       */
      function _applySettings() {
        // 1. Translate
        const dict = DICT[_lang];
        document.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.dataset.i18n;
          if (dict[key]) el.textContent = dict[key];
        });

        // 2. Toggle Price Column
        document.querySelectorAll('.col-price').forEach(el => {
          el.style.display = _showPrice ? '' : 'none';
        });
      }

      async function exportPDF() {
          await loadLibraryAsync('html2pdf');
          const btnExport = event.currentTarget;
          const oldText = btnExport.innerHTML;
          btnExport.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Đang xử lý...';
          btnExport.disabled = true;

          // Lấy vùng in
          const element = document.getElementById('print-area');
          
          // --- BƯỚC QUAN TRỌNG: KÍCH HOẠT CHẾ ĐỘ COMPACT ---
          // Thêm class để CSS ở trên có tác dụng (thu nhỏ chữ, giảm lề)
          element.classList.add('pdf-compact-mode');

          // Tên file
          const bookingId = (typeof _currentData !== 'undefined' && _currentData.bookings) ? _currentData.bookings[0] : 'Booking';
          const fileName = `Booking_${bookingId}.pdf`;

          const opt = {
              margin:       [5, 5, 5, 5], // Lề cực nhỏ: 5mm
              filename:     fileName,
              image:        { type: 'jpeg', quality: 0.98 },
              html2canvas:  { 
                  scale: 2,       
                  useCORS: true, // Vẫn giữ, nhưng khuyến khích dùng Base64 cho Logo
                  scrollY: 0,
                  logging: false
              },
              jsPDF:        { 
                  unit: 'mm', 
                  format: 'a4', 
                  orientation: 'landscape' 
              },
              // Tắt ngắt trang tự động để ép dồn (hoặc dùng avoid-all nếu muốn đẹp)
              // Ở đây ta đã thu nhỏ nội dung nên khả năng cao sẽ vừa 1 trang
              pagebreak: { mode: ['css', 'legacy'] } 
          };

          try {
              await html2pdf().set(opt).from(element).save();
          } catch (e) {
              console.error(e);
              alert("Lỗi: " + e.message);
          } finally {
              // --- HOÀN TÁC: TRẢ LẠI GIAO DIỆN CŨ ---
              // Gỡ class compact để trên màn hình web nhìn vẫn to rõ
              element.classList.remove('pdf-compact-mode');
              
              btnExport.innerHTML = oldText;
              btnExport.disabled = false;
          }
      }
      
      async function sendEmail() {
        
        const email = document.getElementById('conf-cust-email').textContent || "9tripphuquoc@gmail.com";
        if(!email || email.length < 5) return logA("Booking này chưa có Email khách hàng.", "warning");

        const subject = `[9 TRIP] XÁC NHẬN ĐẶT DỊCH VỤ - CODE ${document.getElementById('conf-id').textContent}`;
        var data = getFormData();
        data.type = _mode;
        data.showPrice = _showPrice;
        const statVals = {
          avgA: getNum(getVal('Stats_AvgAdult')),
          avgC: getNum(getVal('Stats_AvgChild')),
          transA: getNum(getVal('Stats_TransportAdult')),
          transC: getNum(getVal('Stats_TransportChild')),
        };
        data.stats = statVals;

        // Gọi Server
        const res = await requestAPI('sendConfirmationEmailAPI', email, subject, data);
        if(res) logA("Đã gửi email!", "success");
      }

      // Public Methods
      return {
        openModal, setLang, togglePrice, setMode, exportPDF, sendEmail
      };

    })();

    // Gán sự kiện cho nút "Tạo Hợp Đồng" (hoặc tạo nút mới "Xác nhận")
    function createConfirmation(bkId) {
        if (!bkId) bkId = getVal('BK_ID');
        if(!bkId) return logA("Vui lòng chọn Booking trước.", "warning");
        ConfirmationModule.openModal(bkId);
    }    

