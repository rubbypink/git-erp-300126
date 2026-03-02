// const { default: DB_MANAGER } = require("./db_manager");

// 3. Hàm Save Booking (Front-end Validation & Confirm)
async function saveForm() {
  try {
    setBtnLoading('btn-save-form', true, 'Saving...');
    await saveCustomer();
    var data = await getFormData(true);
    const { bookings, booking_details, customer } = data;
    const bookingId = bookings.id;
    // Validate đủ thông tin khách hàng trước khi lưu
    const missingFields = [];
    if (!bookings.customer_id) missingFields.push('customer_id');
    if (!bookings.customer_full_name) missingFields.push('customer_name');
    if (!bookings.customer_phone) missingFields.push('customer_phone');
    if (missingFields.length > 0) {
      const msg = `Thiếu thông tin khách hàng: ${missingFields.join(', ')}`;
      logA(msg, 'error');
      return { success: false, message: msg };
    }

    // Kiểm tra xem có dữ liệu cần lưu không (ngoài field 'id')
    const hasBookingChanges = Object.keys(bookings || {}).filter((k) => k !== 'id').length > 0;

    const hasDetails = Array.isArray(booking_details) && booking_details.length > 0;

    if (!hasBookingChanges && !hasDetails) {
      logA('Không có dữ liệu thay đổi để lưu.', 'warning');
      return;
    }

    try {
      // =========================================================================
      // LƯU BOOKINGS (bỏ qua nếu chỉ chứa field 'id')
      // =========================================================================
      let newBk = null;
      if (hasBookingChanges) {
        // Truyền thẳng object để saveRecord giữ đúng field 'id' (không qua array conversion)
        newBk = await A.DB.saveRecord('bookings', bookings);
        if (newBk && !bookingId) {
          A.NotificationManager.sendToAll(
            'NEW BOOKING',
            `Booking mới đã được tạo với ID: ${newBk.id} - ${newBk.staff_id}`
          );
        }
      }

      // =========================================================================
      // CẬP NHẬT BOOKING_ID CHO TẤT CẢ BOOKING_DETAILS NẾU CHƯA CÓ GIÁ TRỊ
      // =========================================================================
      if (hasDetails) {
        const resolvedBkId = newBk?.id ?? bookings.id;
        const updatedDetails = booking_details.map((detail) => {
          if (!detail.booking_id) {
            detail.booking_id = resolvedBkId;
          }
          return detail;
        });

        var details = updatedDetails.map((d) => Object.values(d));
        await A.DB.batchSave('booking_details', details);
      }
      if (window.StateProxy) StateProxy.commitSession(); // advance baseline, flush history
      const btnDashUpdate = getE('btn-dash-update');
      if (btnDashUpdate) {
        A.Event.trigger(btnDashUpdate, 'click');
      }

      const btnSelectDatalist = getE('btn-select-datalist');
      if (btnSelectDatalist) {
        btnSelectDatalist.dispatchEvent(new Event('change'));
      }
      logA('Lưu dữ liệu thành công!', true);
    } catch (e) {
      if (window.StateProxy) StateProxy.rollbackSession(); // revert to baseline
      logError(e);
      return;
    }
  } catch (e) {
    logError('Lỗi hàm try: ', e);
  } finally {
    setBtnLoading('btn-save-form', false);
  }
}
// =========================================================================
// DELETE / CANCEL BOOKING HANDLER
// =========================================================================
async function deleteForm() {
  // 1. Lấy ID Booking hiện tại
  const bkId = getE('BK_ID')?.value;
  const currentStatus = getE('BK_Status')?.value;
  // 2. Validation cơ bản
  if (!bkId) {
    logA('Vui lòng chọn một Booking để thực hiện thao tác này!');
    return;
  }
  if (currentStatus === 'Hủy') {
    logA('Booking này đã bị hủy trước đó rồi!');
    return;
  }

  // 4. Gọi Server xử lý
  logA(`Đang yêu cầu hủy Booking: ${bkId}...`);
  showLoading(true);
  const res = await requestAPI('cancelBookingHandler', bkId);
  if (res) {
    loadDataFromFirebase();
    // B. Cập nhật giao diện ngay lập tức (Phản hồi tức thì)
    // Không cần load lại form, chỉ cần đổi trạng thái để user thấy
    const elStatus = getE('BK_Status');
    const elTotal = getE('BK_Total');
    const elBalance = getE('BK_Balance');
    const elNote = getE('BK_Note');
    if (elStatus) {
      elStatus.value = 'Hủy';
      elStatus.className =
        'form-control form-control-sm fw-bold text-danger bg-danger bg-opacity-10'; // Đổi màu đỏ
    }
    // Backend đã reset tiền về 0, Frontend cũng nên hiện về 0
    if (elTotal) elTotal.value = '0';
    if (elBalance) elBalance.value = '0'; // Giả định hủy là hoàn cọc hoặc mất cọc tùy nghiệp vụ, ở đây về 0 theo logic backend
    // C. Ghi chú thêm vào Note (Optional)
    if (elNote) {
      const time = new Date().toLocaleTimeString('vi-VN');
      elNote.value = `[Hủy lúc ${time}] ` + elNote.value;
    }
  }
}

async function saveCustomer() {
  try {
    const data = window.getCustomerData(true);

    // Nếu data chưa có id, thử tra cứu trong APP_DATA theo phone
    if (!data.id && data.phone && APP_DATA?.customers) {
      const found = Object.values(APP_DATA.customers).find((c) => {
        if (!c) return false;
        const phone = c.phone || c.customer_phone || '';
        return phone === data.phone;
      });
      if (found?.id) {
        data.id = found.id;
        setVal('Cust_Id', found.id);
      }
    }

    // Lưu vào Firebase
    showLoading(true, 'Đang lưu thông tin khách hàng...');

    const res = await A.DB.saveRecord('customers', data);

    if (res && res.id) {
      const oldId = getE('Cust_Id')?.value;
      if (!oldId || oldId != res.id) {
        logA('New Customer ID: ' + res.id, 'success');
        const bkCustIdEl = getE('Cust_Id');
        if (bkCustIdEl) {
          setVal(bkCustIdEl, res.id);
        }
      }
    } else {
      logA('Lỗi khi lưu khách hàng: ' + (res?.message || 'Vui lòng thử lại'), 'error');
    }
  } catch (e) {
    logError(e);
    logA('Lỗi: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// =========================================================================
// HELPER: Tính tổng chi tiêu của khách hàng (từ các booking không bị hủy)
// =========================================================================
/**
 * Tính tổng chi tiêu của khách hàng từ tất cả booking không bị hủy.
 *
 * @param {string} custId - ID của khách hàng cần kiểm tra
 * @returns {number} - Tổng giá trị (total) của các booking, trả về 0 nếu không có
 *
 * @example
 * const spend = loadCustSpend('CUST_001'); // Returns 2500000
 */
function loadCustSpend(custId) {
  if (!custId)
    custId = $("[data-field='customer_id']", getE('main-form'))?.value || getVal('Cust_Id');

  const bookings = window.Object.values(APP_DATA.bookings) || [];
  let totalSpend = 0;

  bookings.forEach((booking) => {
    if (booking && booking.customer_id === custId && booking.status !== 'Hủy') {
      const total = booking.total_amount || 0;
      // Xử lý cả string (formatted) và number
      const numValue = typeof total === 'string' ? getRawVal(total) : Number(total);
      totalSpend += numValue;
    }
  });
  setVal('Cust_Total', totalSpend);

  return totalSpend;
}

// =========================================================================
// EXPORT FORM HANDLER
async function createContract() {
  try {
    // 1. Kiểm tra dữ liệu cơ bản
    if (typeof getFormData !== 'function') return;

    const { bookings, customer, booking_details } = await getFormData();

    // 2. Lấy dữ liệu mở rộng từ Tab Customer
    let extendedCust = null;

    if (typeof getCustomerData === 'function') {
      extendedCust = getCustomerData();
    }

    // Guard: nếu không lấy được dữ liệu khách hàng, không thể tạo hợp đồng
    if (!extendedCust) {
      logA(
        'Vui lòng điền đầy đủ thông tin khách hàng (Tên, SĐT) trước khi tạo hợp đồng!',
        'warning'
      );
      return;
    }

    // 3. Xác định Tab hiện tại
    // Tìm nút Tab đang có class 'active' để biết người dùng đang đứng ở đâu
    const activeTabEl = document.querySelector('#mainTabs button.nav-link.active');
    const activeTarget = activeTabEl ? activeTabEl.getAttribute('data-bs-target') : '';

    const payload = {
      bookings: bookings,
      booking_details: booking_details,
      customer: extendedCust,
    };
    setBtnLoading('btn-create-contract', true, 'Creating...');
    // showLoading(true);
    const res = await requestAPI('createBookingContract', payload);
    if (res) {
      // HTML nội dung (Giữ nguyên logic cũ của bạn)
      const htmlContent =
        `
            <div class="text-center p-2">
              <div class="mb-3 text-success"><i class="fa-solid ${res.docUrl ? 'fa-circle-check' : 'fa-circle-exclamation'} fa-3x"></i></div>
              <h5 class="fw-bold text-success">${res.message ? res.message : 'Có lỗi xảy ra'}</h5>
            ` +
        (res.docUrl
          ? `
              <p class="small text-muted">File đã lưu vào Drive.</p>
              <div class="d-grid gap-2 col-10 mx-auto mt-4">
                  <a href="${res.docUrl}" target="_blank" class="btn btn-primary">
                    <i class="fa-solid fa-file-word"></i> Mở Hợp Đồng
                  </a>
                  <a href="${res.pdfUrl}" target="_blank" class="btn btn-outline-danger">
                    <i class="fa-solid fa-file-pdf"></i> Tải PDF
                  </a>
                  <hr class="my-2">
                  <button class="btn btn-sm btn-link text-secondary text-decoration-none"
                          onclick="requestDeleteFile('${res.docId}')">
                    <i class="fa-solid fa-trash"></i> Xóa file này
                  </button>
              </div>
              `
          : `
            </div>
          `);
      // GỌI HÀM MỚI TẠI ĐÂY:
      logA(htmlContent, 'success', 'alert');
    } else {
      logA('Lỗi: ' + (res?.message || 'Không thể tạo hợp đồng. Vui lòng thử lại.'), 'error');
    }
    setBtnLoading('btn-create-contract', false);
  } catch (e) {
    logError('Catch Lỗi: ' + e.message, e);
  } finally {
    setBtnLoading('btn-create-contract', false);
  }
}
// Hàm xử lý xóa file (Nằm riêng ở client)
async function requestDeleteFile(fileId) {
  showConfirm('Bạn chắc chắn muốn xóa file hợp đồng vừa tạo khỏi Google Drive?', async () => {
    // Đổi nút bấm thành đang xóa...
    showLoading(true);
    const res = await requestAPI('deleteGeneratedFile', fileId);

    showLoading(false);
    if (res) {
      logA(res.message || 'Done', 'success');
      closeSubModal(); // Đóng modal sau khi xóa
    } else {
      logA('Lỗi: ' + (res?.message || 'Không thể xóa file. Vui lòng thử lại.'), 'error');
    }
  });
}
// =========================================================================
// 6. TEMPLATE LOGIC (NEW)
// =========================================================================
/**
 * Action: Lưu Template hiện tại
 */
async function saveCurrentTemplate() {
  log('run saveCurrentTemplate');
  const tempName = getVal('BK_TourName');
  const newDate = getVal('BK_Start');
  try {
    if (!tempName) {
      logA('Vui lòng nhập Tên Tour trước khi lưu Template.');
      return;
    }
    if (!newDate) {
      logA('Vui lòng chọn Ngày Đi để làm mốc thời gian.');
      return;
    }

    // 3. Details Data
    var booking_details = [];
    document.querySelectorAll('#detail-tbody tr').forEach((tr) => {
      const getRowVal = (cls) => tr.querySelector('.' + cls)?.value || '';
      const getRowRaw = (cls) => tr.querySelector('.' + cls)?.dataset.val || getRowVal(cls); // Ưu tiên lấy raw data nếu có
      booking_details.push({
        sid: tr.querySelector('.d-sid').value,
        type: getRowVal('d-type'),
        location: getRowVal('d-loc'),
        name: getRowVal('d-name'),
        in: getRowVal('d-in'),
        out: getRowVal('d-out'),
        night: getRowVal('d-night'),
        qtyA: getRowVal('d-qty'),
        priA: getRowVal('d-pri'),
        qtyC: getRowVal('d-qtyC'),
        priC: getRowVal('d-priC'),
        sur: getRowVal('d-sur'),
        disc: getRowVal('d-disc'),
        total: tr.querySelector('.d-total').dataset.val || 0,
        code: getRowVal('d-code'),
        note: getRowVal('d-note'),
      });
    });

    if (booking_details.length === 0) {
      logA('Bảng chi tiết đang trống. Không có gì để lưu!');
      return;
    }

    // if (!confirm(`Bạn muốn lưu chi tiết hiện tại thành Template cho tour: "${tempName}"?\n(Dữ liệu cũ của template này sẽ bị ghi đè)`)) return;

    showLoading(true, 'Đang lưu Template...');
  } catch (e) {
    logError(e?.message ?? String(e), e);
  }

  try {
    const res = await requestAPI('saveBookingTemplateAPI', tempName, booking_details, newDate);
    logA(res?.message ?? 'Đã lưu.', 'success');
  } catch (err) {
    logError(err?.message ?? String(err), err);
  } finally {
    showLoading(false);
  }
}

/**
 * Action: Trigger khi đổi tên Tour -> Hỏi load Template
 */
async function checkAndLoadTemplate() {
  try {
    const tempName = getVal('BK_TourName');
    if (!tempName) {
      logA('Lỗi Tour Name');
      return;
    }

    const template = await requestAPI('getBookingTemplateAPI', tempName);

    if (!template) {
      log('Server trả về null/undefined', 'error');
      return;
    }

    if (template && template.found) {
      askToLoadTemplate(template, tempName);
    } else {
      logA(template.message || 'Không có template', 'info');
    }
  } catch (e) {
    logError(e?.message ?? String(e), e);
  }
}

function askToLoadTemplate(res, tempName) {
  try {
    const msg = `Hệ thống tìm thấy Template mẫu cho tour "${tempName}".\nBạn có muốn tải dữ liệu mẫu vào không?`;
    // Sử dụng Confirm chuẩn hoặc Custom Overlay. Ở đây dùng confirm cho nhanh gọn
    if (confirm(msg)) {
      // 1. Kiểm tra điều kiện đầu vào bắt buộc
      const startDate = getE('BK_Start').value;
      const endDate = getE('BK_End').value;
      const adult = getE('BK_Adult').value;
      if (!startDate || !endDate || !adult) {
        logA(
          'Vui lòng điền đầy đủ: Ngày Đi, Ngày Về và Số người lớn trước khi load Template!',
          'warning'
        );
        // Focus vào ô còn thiếu
        if (!startDate) getE('BK_Start').focus();
        else if (!endDate) getE('BK_End').focus();
        else getE('BK_Adult').focus();
        return;
      }
      // 2. Tiến hành Load và Transform dữ liệu
      processAndFillTemplate(res.booking_details, res.anchorDate, startDate, adult);
    }
  } catch (e) {
    logError(e?.message ?? String(e), e);
  }
}
/**
 * 2. XỬ LÝ LƯU KHÁCH HÀNG (Gọi Server)
 */
window.handleSaveCustomer = async function () {
  try {
    const data = window.getCustomerData();

    // Validate Front-end
    if (!data.full_name || !data.phone) {
      logA('Vui lòng nhập Tên và Số điện thoại!');
      return;
    }
    showLoading(true, 'Đang lưu thông tin khách hàng...');

    const res = await A.DB.saveRecord('customers', data);
    if (res) {
      const newCust = res.customer;

      setVal('Cust_Name', newCust.full_name);
      setVal('Cust_Phone', newCust.phone);
      setVal('Cust_Source', newCust.source);

      // 3. Chuyển người dùng về lại Tab Booking để làm việc tiếp
      const tab1Btn = document.querySelector('button[data-bs-target="#tab-form"]');
      if (tab1Btn) bootstrap.Tab.getOrCreateInstance(tab1Btn).show();
    }
  } catch (e) {
    logError(e?.message ?? String(e), e);
  } finally {
    showLoading(false);
  }
};

/**
 * 2. Gửi dữ liệu về Server (Full Row)
 */
async function saveBatchDetails() {
  // --- HELPER 1: Lấy Text an toàn (Giữ nguyên logic của bạn) ---
  const getValSafe = (id) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`⚠️ Cảnh báo: Không tìm thấy ID HTML: "${id}"`);
      return '';
    }
    return el.value.trim(); // Thêm trim() để cắt khoảng trắng thừa
  };

  // --- HELPER 2: Lấy Số an toàn (FIX LỖI 1.000 -> 1 TẠI ĐÂY) ---
  // Hàm này sẽ ưu tiên lấy dataset.val, nếu không có thì lọc sạch dấu chấm phẩy
  const getNumSafe = (idOrEl) => {
    let el = idOrEl;
    // Nếu truyền vào là ID string thì tìm element
    if (typeof idOrEl === 'string') {
      el = document.getElementById(idOrEl);
    }

    if (!el) return 0;

    // Ưu tiên 1: Lấy từ dataset (SSOT) nếu đã lưu chuẩn
    if (el.dataset && el.dataset.val !== undefined && el.dataset.val !== '') {
      return Number(el.dataset.val);
    }

    // Ưu tiên 2: Parse từ value hiển thị (Quan trọng nhất bước này)
    // Regex: /[^0-9-]/g -> Xóa TẤT CẢ ký tự KHÔNG phải là số hoặc dấu trừ
    // Ví dụ: "1.200.000" -> "1200000"
    const cleanStr = String(el.value).replace(/[^0-9-]/g, '');
    return Number(cleanStr) || 0;
  };

  // 3. Details
  const booking_details = [];
  const currentTab = getE('tab-form');
  const rows = currentTab.querySelectorAll('#detail-tbody tr');

  rows.forEach((tr, index) => {
    // Helper cục bộ: Lấy số theo class trong dòng
    const getRowNum = (cls) => {
      const el = tr.querySelector('.' + cls);
      return getNumSafe(el); // Gọi lại hàm chuẩn ở trên
    };

    // Helper cục bộ: Lấy text theo class trong dòng
    const getRowVal = (cls) => {
      const el = tr.querySelector('.' + cls);
      return el ? el.value : '';
    };

    booking_details.push([
      getRowVal('.d-sid').value,
      getRowVal('d-type'),
      getRowVal('d-loc'),
      getRowVal('d-name'),
      getRowVal('d-in'),
      getRowVal('d-out'),
      getRowNum('d-night'),
      getRowNum('d-qty'),
      getRowNum('d-pri'),
      getRowNum('d-qtyC'),
      getRowNum('d-priC'),
      getRowNum('d-sur'),
      getRowNum('d-disc'),
      getRowNum('.d-total'),
      getRowVal('d-code'),
      getRowVal('d-note'),
    ]);
  });

  setBtnLoading('btn-save-batch', true);
  const res = await A.DB.batchSave('booking_details', booking_details);

  setBtnLoading('btn-save-batch', false);
  if (res) {
    logA('Lưu thành công!', 'success');
    // Quan trọng: Load lại data để đồng bộ
    loadDataFromFirebase();
    refreshForm();
    activateTab('tab-form');
  } else {
    logA('Lỗi: ' + res.message, 'error');
  }
}
