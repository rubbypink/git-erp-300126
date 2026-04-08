/**
 * =========================================================================
 * 9TRIP ERP - SALES MODULE (Class-based)
 * Chuyên gia quản lý Booking, Khách hàng và Dịch vụ chi tiết cho bộ phận Sales.
 * =========================================================================
 */

import DB_MANAGER from '/src/js/modules/db/DBManager.js';

class SalesModule {
  // ─── 1. CONFIGURATION ──────────────────────────────────────────────
  static Config = {
    typeOrder: ['Vé MB', 'Vé Tàu', 'Phòng', 'Xe'],
    minRows: 5,
    pdfCompactModeClass: 'pdf-compact-mode',
    storageKeyLogs: '9trip_sales_logs',
    draftKeyPrefix: '9trip_draft_',
    maxDrafts: 3,
  };
  static autoInit = false;

  // ─── 2. STATE ──────────────────────────────────────────────────────
  static State = {
    detailRowCount: 0,
    currentBookingData: null,
    lang: 'vi',
    mode: 'service', // 'service' | 'tour'
    showPrice: true,
    services: null,
    locations: null,
    hotels: null,
    lists: null,
  };

  // ─── 3. UI RENDERERS ───────────────────────────────────────────────
  static UI = {
    /**
     * Hiển thị dữ liệu Booking lên Form
     */
    loadBookingToUI: async (bkData, customerData, detailsData) => {
      if (!bkData) return;

      if (window.StateProxy) {
        StateProxy.clearSession();
        StateProxy.suppressAutoBinding();
      }

      try {
        // Chuẩn hóa bkData: Nếu là object chứa các record (key là ID) thì lấy record đầu tiên
        let finalBkData = bkData;
        if (bkData && typeof bkData === 'object' && !Array.isArray(bkData)) {
          const keys = Object.keys(bkData);
          // Nếu object không có các field chính nhưng có key chứa object con -> lấy object con đầu tiên
          if (!bkData.id && !bkData.customer_id && keys.length > 0) {
            const firstVal = bkData[keys[0]];
            if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal)) {
              finalBkData = firstVal;
              L._('SalesModule.UI.loadBookingToUI: Extracted record from wrapped bkData', { id: finalBkData.id });
            }
          }
        }

        const isBkObj = finalBkData && typeof finalBkData === 'object' && !Array.isArray(finalBkData);

        if (!getE('main-form')) activateTab('tab-form');
        if (isBkObj) HD.setFormData('sub-booking-form', finalBkData);

        let tbody = getE('detail-tbody');
        if (!tbody) {
          activateTab('tab-form');
          tbody = getE('detail-tbody');
        }

        if (tbody) {
          tbody.innerHTML = '';
          tbody.style.display = 'none';
        } else {
          L._('SalesModule.UI.loadBookingToUI: Ko tìm thấy detail-tbody', 'error');
          return;
        }

        // Chuẩn hóa customerData tương tự bkData
        let finalCustData = customerData;
        if (customerData && typeof customerData === 'object' && !Array.isArray(customerData)) {
          if (!customerData.id && !customerData.phone && !customerData.full_name) {
            const cKeys = Object.keys(customerData);
            if (cKeys.length > 0 && typeof customerData[cKeys[0]] === 'object') {
              finalCustData = customerData[cKeys[0]];
            }
          }
        }

        if (finalCustData) {
          SalesModule.Logic.findCustByPhone(finalCustData);
        }

        SalesModule.State.detailRowCount = 0;

        const detailsArr = Array.isArray(detailsData) ? detailsData : detailsData && typeof detailsData === 'object' ? Object.values(detailsData) : [];

        if (detailsArr.length > 0) {
          const sortedDetails = SalesModule.Logic.sortDetailsData(detailsArr);
          // Tối ưu: Gọi addDetailRow một lần với mảng dữ liệu
          await SalesModule.UI.addDetailRow(sortedDetails);
        }

        tbody.style.display = 'table-row-group';
        SalesModule.Logic.calcGrandTotal();

        try {
          const tabTrigger = document.querySelector('#mainTabs button[data-bs-target="#tab-form"]');
          if (tabTrigger) bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
          if (typeof toggleContextUI === 'function') toggleContextUI('tab-form');
        } catch (e) {
          L.log('SalesModule.UI.loadBookingToUI: LỖI khi chuyển tab', e);
        }
      } catch (e) {
        L.log('SalesModule.UI.loadBookingToUI Error:', e);
      } finally {
        if (window.StateProxy) StateProxy.resumeAutoBinding();
        if (typeof showLoading === 'function') showLoading(false);
      }
    },

    /**
     * Thêm một hoặc nhiều dòng dịch vụ chi tiết
     * @param {Object|Array} data - Object dữ liệu hàng đơn lẻ hoặc Mảng các object dữ liệu
     */
    addDetailRow: async (data = null) => {
      try {
        const tbody = getE('detail-tbody');
        if (!tbody) return;

        const isArray = Array.isArray(data);
        const dataList = isArray ? data : [data];
        const fragment = document.createDocumentFragment();
        const lists = SalesModule.State.lists || (await A.DB.local.getList('app_config', 'lists'));
        const locations = SalesModule.State.locations || (await SalesModule.UI.getLocationList());
        const optsType = Object.values(lists.types || {})
          .map((x) => `<option value="${x}">${x}</option>`)
          .join('');

        // Mảng chứa các promise xử lý logic phụ trợ sau khi append
        const postProcessTasks = [];

        for (const rowData of dataList) {
          SalesModule.State.detailRowCount++;
          const idx = SalesModule.State.detailRowCount;

          const tr = document.createElement('tr');
          tr.id = `row-${idx}`;
          tr.setAttribute('data-row', idx);
          tr.innerHTML = `
            <td class="text-center text-muted align-middle">${idx} <input type="hidden" data-field="id"></td>
            <td>
              <select class="form-select form-select-sm" data-field="service_type" onchange="SalesModule.Logic.onTypeChange(this)">
              <option value="">-</option>${optsType}
              </select>
            </td>
            <td>
              <select data-source="SalesModule.State.locations" data-searchable="true" class="smart-select form-select form-select-sm" data-field="hotel_name" onchange="SalesModule.Logic.onLocationChange(this)">
                <option value="">-</option>
              </select>
            </td>
            <td>
              <select class="form-select form-select-sm" data-field="service_name">
                <option value="">-</option>
              </select>
            </td>
            <td><input type="date" class="form-control form-control-sm" data-field="check_in" onchange="SalesModule.Logic.autoSetOrCalcDate(this.value, ${idx})" style="cursor:pointer"></td>
            <td><input type="date" class="form-control form-control-sm" data-field="check_out" onchange="SalesModule.Logic.calcRow(${idx})"></td>
            <td><input type="number" class="form-control form-control-sm number bg-light text-center" data-field="nights" readonly></td>
            <td><input type="number" class="form-control form-control-sm number" data-field="quantity" value="1"></td>
            <td>
              <div class="input-group input-group-sm">
                <input type="number" class="form-control number" data-field="unit_price" placeholder="-">
                <button class="btn btn-outline-secondary px-1" type="button" onclick="SalesModule.Logic.lookupPrice(${idx})" title="Tra cứu giá">
                  <i class="bi bi-search"></i>
                </button>
              </div>
            </td>
            <td><input type="number" class="form-control form-control-sm number" data-field="child_qty" placeholder="-"></td>
            <td><input type="number" class="form-control form-control-sm number" data-field="child_price" placeholder="-"></td>
            <td><input type="number" class="form-control form-control-sm number" data-field="surcharge" placeholder="-"></td>
            <td><input type="number" class="form-control form-control-sm number" data-field="discount" placeholder="-"></td>
            <td><input type="text" class="form-control form-control-sm number fw-bold text-end" data-field="total" readonly data-val="0"></td>
            <td><input type="text" class="form-control form-control-sm" data-field="ref_code"></td>
            <td><input type="text" class="form-control form-control-sm" data-field="note"></td>
            <td class="text-center align-middle"><i class="fa-solid fa-times text-danger" style="cursor:pointer" onclick="SalesModule.UI.removeRow(${idx})"></i></td>
          `;

          fragment.appendChild(tr);

          // Chuẩn bị task xử lý dữ liệu cho hàng này
          const task = (async (currentRow, currentIdx, currentData) => {
            try {
              // 1. Luôn update danh sách khách sạn/địa điểm trước
              // await SalesModule.UI.updateHotelSelect(currentRow);

              if (currentData) {
                const detailId = currentData.id || '';
                setVal('[data-field="id"]', detailId, currentRow);
                if (detailId) currentRow.setAttribute('data-item', detailId);

                // 2. Gán select
                setVal('[data-field="service_type"]', currentData.service_type, currentRow);
                setVal('[data-field="hotel_name"]', currentData.hotel_name, currentRow);

                // 4. Update danh sách dịch vụ (phòng hoặc dịch vụ khác)
                await SalesModule.UI.updateServiceSelect(currentRow);
                // 5. Gán service_name
                setVal('[data-field="service_name"]', currentData.service_name, currentRow);

                // 6. Gán các trường còn lại
                setVal('[data-field="check_in"]', currentData.check_in, currentRow);
                setVal('[data-field="check_out"]', currentData.check_out, currentRow);
                setVal('[data-field="nights"]', currentData.nights, currentRow);
                setVal('[data-field="quantity"]', currentData.quantity, currentRow);
                setVal('[data-field="unit_price"]', currentData.unit_price, currentRow);
                setVal('[data-field="child_qty"]', currentData.child_qty, currentRow);
                setVal('[data-field="child_price"]', currentData.child_price, currentRow);
                setVal('[data-field="surcharge"]', currentData.surcharge, currentRow);
                setVal('[data-field="discount"]', currentData.discount, currentRow);
                setVal('[data-field="ref_code"]', currentData.ref_code, currentRow);
                setVal('[data-field="note"]', currentData.note, currentRow);

                SalesModule.Logic.calcRow(currentIdx);

                currentRow.querySelectorAll('input, select').forEach((el) => {
                  el.setAttribute('data-initial', el.value);
                });
              } else if (currentIdx === 1) {
                setVal('[data-field="service_type"]', 'Phòng', currentRow);
                // Đối với dòng mới (trống), vẫn cần trigger change để auto-fill
                await SalesModule.Logic.onTypeChange(currentRow, true);
              }
            } catch (err) {
              L.log(`SalesModule.UI.addDetailRow Task Error (Row ${currentIdx}):`, err);
            }
          })(tr, idx, rowData);

          postProcessTasks.push(task);
        }

        // Append toàn bộ fragment vào DOM một lần duy nhất
        tbody.appendChild(fragment);

        // Thực thi các logic phụ trợ sau khi đã append vào DOM
        await Promise.all(postProcessTasks);
      } catch (e) {
        L.log('SalesModule.UI.addDetailRow Error:', e);
      }
    },

    removeRow: (idx) => {
      try {
        const row = getE(`row-${idx}`);
        if (row) row.remove();
        SalesModule.Logic.calcGrandTotal();
      } catch (e) {
        L.log('SalesModule.UI.removeRow Error:', e);
      }
    },

    getLocationList: async () => {
      if (SalesModule.State.locations && SalesModule.State?.locations?.length > 0) {
        return SalesModule.State.locations;
      }
      let uniqueLocs = [];
      const lists = SalesModule.State?.lists || (await A.DB.local.get('app_config', 'lists')) || window.APP_DATA?.lists || {};
      const hotels = SalesModule.State?.hotels || (await A.DB.local.getCollection('hotels')) || [];
      if (!SalesModule.State.hotels || SalesModule.State.hotels.length === 0) SalesModule.State.hotels = hotels;
      const others = Object.values(lists.locOther || {}) || [];
      // Chuẩn hóa dữ liệu: hotels thường là object {id, name}, others có thể là string hoặc object
      const normalizedOthers = others.map((x) => (typeof x === 'string' ? { id: x, name: x } : x));
      const allLocs = [...hotels, ...normalizedOthers];
      // Loại bỏ trùng lặp dựa trên ID
      const map = new Map();
      for (let item of allLocs) {
        // 1. Xử lý trường hợp item là object có key là index (0, 1, 2...)
        // Nếu item là object và không có id/name nhưng có các key dạng số
        if (item && typeof item === 'object' && !item.id && !item.name) {
          const values = Object.values(item);
          if (values.length > 0) {
            const val = values[0]; // Lấy giá trị đầu tiên (ví dụ: "Phú Quốc")
            item = { id: val, name: val }; // Ghi đè item thành object chuẩn
          }
        }

        // 2. Xác định ID để kiểm tra trùng lặp
        const id = item && typeof item === 'object' ? item.id : item;

        // 3. Kiểm tra và push vào danh sách duy nhất
        if (id && !map.has(id)) {
          map.set(id, true);

          // Đảm bảo item được push vào luôn là object có id và name
          const finalItem = typeof item === 'object' ? { id: item.id || id, name: item.name || id } : { id: item, name: item };

          uniqueLocs.push(finalItem);
        }
      }

      if (uniqueLocs.length > 0) SalesModule.State.locations = uniqueLocs;
      L._(`[getLocationList] 🔍 Found ${uniqueLocs}`);
      return uniqueLocs;
    },

    updateHotelSelect: async (el) => {
      return;
      try {
        let uniqueLocs = [];
        if (SalesModule.State.locations && SalesModule.State.locations.length > 0) {
          uniqueLocs = SalesModule.State.locations;
        } else {
          uniqueLocs = await SalesModule.UI.getLocationList();
        }

        const tr = el.closest('tr');
        if (!tr) return;
        const elLoc = tr.querySelector('[data-field="hotel_name"]');
        if (!elLoc) return;

        let currentVal = getVal(elLoc);
        elLoc.innerHTML = '<option value="">-</option>' + uniqueLocs.map((x) => `<option value="${x.id || x}">${x.name || x}</option>`).join('');

        if (currentVal) setVal(elLoc, currentVal);
      } catch (e) {
        L.log('SalesModule.UI.updateHotelSelect Error:', e);
      }
    },

    updateServiceSelect: async (tr, el) => {
      try {
        if (!tr) {
          tr = el.closest('tr');
        }
        const type = getVal('[data-field="service_type"]', tr);
        const loc = getVal('[data-field="hotel_name"]', tr);
        const elName = $('[data-field="service_name"]', tr);
        if (!elName) return;
        let options = [];
        if (type.trim() === 'Phòng') {
          let hotels = SalesModule.State.hotels?.length > 0 ? SalesModule.State.hotels : await SalesModule.UI.getLocationList();
          L._(`[updateServiceSelect] 🔍 Location: ${loc} - Type: ${type} - Hotels: ${hotels}`);
          let hotel = hotels.filter((h) => h.id === loc || h.name === loc)[0];
          L._(`[updateServiceSelect] 🔍 Found hotel: ${hotel}`);
          if (hotel && hotel.rooms) {
            options = Array.isArray(hotel.rooms) ? hotel.rooms : Object.values(hotel.rooms);
            L._(`[SalesModule] 🔍 Found ${options} rooms for hotel ${loc}`);
          }
        } else if (SalesModule.State.services && SalesModule.State.services.length > 0) {
          options = SalesModule.State.services.filter((r) => r[0] === type).map((r) => r[1]);
        } else {
          const svcMatrix = Object.values(window.APP_DATA?.lists?.serviceMatrix || {}) || [];
          options = svcMatrix.filter((r) => r[0] === type).map((r) => r[1]);
          SalesModule.State.services = svcMatrix;
        }

        let currentVal = getVal('[data-field="service_name"]', tr);
        let isId;
        let isName;
        elName.innerHTML =
          '<option value="">-</option>' +
          options
            .map((x) => {
              const val = x.id || x;
              const name = x.name || x;
              isId = x.id === currentVal || x === currentVal;
              isName = x.name === currentVal ? x.id : null;
              return `<option value="${val}">${name}</option>`;
            })
            .join('');

        // 2. Nếu tìm thấy, lấy id của option đó (fallback về name hoặc chính nó) và gán vào form
        if (isId || isName) {
          setVal('[data-field="service_name"]', isId ? isId : isName, tr);
        }
      } catch (e) {
        L.log('SalesModule.UI.updateServiceSelect Error:', e);
      }
    },

    fillFormFromSearch: (res) => {
      if (typeof showLoading === 'function') showLoading(false);
      if (!res) {
        L.log('SalesModule.UI.fillFormFromSearch: Không tìm thấy dữ liệu phù hợp!');
        return;
      }
      try {
        const bkData = res.bookings;
        const detailsData = res.booking_details;
        const customerData = res.customer;
        SalesModule.UI.loadBookingToUI(bkData, customerData, detailsData);
      } catch (e) {
        L.log('SalesModule.UI.fillFormFromSearch Error:', e);
      }
    },
    checkAndLoadTemplate: async () => {
      try {
        const tempName = getVal('BK_TourName');
        if (!tempName) return;
        const template = await requestAPI('getBookingTemplateAPI', tempName);
        if (template?.found) {
          const ok = await logA(`Hệ thống tìm thấy Template mẫu cho tour "${tempName}". Bạn có muốn tải vào không?`, 'question', 'confirm');
          if (ok) {
            const start = getVal('BK_Start');
            const end = getVal('BK_End');
            const adult = getVal('BK_Adult');
            if (!start || !end || !adult) {
              logA('Vui lòng điền đầy đủ: Ngày Đi, Ngày Về và Số người lớn!', 'warning');
              return;
            }
            await SalesModule.Logic.processAndFillTemplate(template.booking_details, template.anchorDate, start, adult);
          }
        }
      } catch (e) {
        L.log('SalesModule.checkAndLoadTemplate Error:', e);
      }
    },
    saveCurrentTemplate: async () => {
      try {
        const tempName = getVal('BK_TourName');
        const newDate = getVal('BK_Start');
        if (!tempName || !newDate) return logA('Vui lòng nhập Tên Tour và Ngày Đi!', 'warning');

        const details = [];
        document.querySelectorAll('#detail-tbody tr').forEach((tr) => {
          const gV = (f) => getVal(`[data-field="${f}"]`, tr);
          details.push({
            service_type: gV('service_type'),
            hotel_name: gV('hotel_name'),
            service_name: gV('service_name'),
            check_in: gV('check_in'),
            check_out: gV('check_out'),
            nights: gV('nights'),
            quantity: gV('quantity'),
            unit_price: gV('unit_price'),
            child_qty: gV('child_qty'),
            child_price: gV('child_price'),
            surcharge: gV('surcharge'),
            discount: gV('discount'),
            total: tr.querySelector('[data-field="total"]')?.dataset.val || 0,
            ref_code: gV('ref_code'),
            note: gV('note'),
          });
        });

        if (details.length === 0) return logA('Bảng chi tiết đang trống!', 'warning');
        if (typeof showLoading === 'function') showLoading(true, 'Đang lưu Template...');
        const res = await requestAPI('saveBookingTemplateAPI', tempName, details, newDate);
        if (res && typeof logA === 'function') logA(res?.message || 'Đã lưu Template thành công.', 'success');
      } catch (e) {
        L.log('SalesModule.saveCurrentTemplate Error:', e);
      } finally {
        if (typeof showLoading === 'function') showLoading(false);
      }
    },

    /**
     * Render danh sách bản nháp vào dropdown menu
     */
    renderDraftsMenu: () => {
      try {
        const container = getE('drafts-list');
        if (!container) return;
        container.innerHTML = '';

        const prefix = SalesModule.Config.draftKeyPrefix;
        const drafts = [];
        for (let i = 1; i <= SalesModule.Config.maxDrafts; i++) {
          const key = prefix + i;
          const dataStr = localStorage.getItem(key);
          if (dataStr) {
            try {
              const data = JSON.parse(dataStr);
              drafts.push({ key, data });
            } catch (e) {
              L.log(`SalesModule.UI.renderDraftsMenu: Lỗi parse draft ${key}`, e);
            }
          }
        }

        if (drafts.length > 0) {
          drafts.forEach((d) => {
            const b = d.data.bookings || {};
            const label = `${b.customer_full_name || 'No Name'}: ${b.start_date || '?'} - ${b.end_date || '?'} - ${d.key}`;
            const li = document.createElement('li');
            li.innerHTML = `<a class="dropdown-item small text-info" href="javascript:void(0)" onclick="SalesModule.Logic.loadDraft('${d.key}')">
                <i class="fa-solid fa-file-import me-2"></i> ${label}
              </a>`;
            container.appendChild(li);
          });
        }
      } catch (e) {
        L.log('SalesModule.UI.renderDraftsMenu Error:', e);
      }
    },
  };

  // ─── 4. LOGIC HANDLERS ─────────────────────────────────────────────
  static Logic = {
    onTypeChange: async (el, resetChildren = true) => {
      try {
        const tbody = getE('detail-tbody');

        const tr = el.closest('tr');
        if (!tr) return;

        if (resetChildren) {
          setVal('[data-field="hotel_name"]', '', tr);
          await SalesModule.UI.updateServiceSelect(tr);
          SalesModule.Logic.autoFillRowData(idx);
        } else {
          await SalesModule.UI.updateServiceSelect(tr);
        }
      } catch (e) {
        L.log('SalesModule.Logic.onTypeChange Error:', e);
      }
    },
    onLocationChange: async (el, resetName = true) => {
      try {
        const tr = el.closest('tr');
        L._(`[onLocationChange] 🔍 Location: ${getVal('[data-field="hotel_name"]', tr)} - el ${getVal(el)}`);
        if (!tr) return;
        const type = getVal('[data-field="service_type"]', tr);
        if (type === 'Phòng') {
          await SalesModule.UI.updateServiceSelect(tr, el);
          if (resetName) setVal('[data-field="service_name"]', '', tr);
        }
      } catch (e) {
        L.log('SalesModule.Logic.onLocationChange Error:', e);
      }
    },

    autoFillRowData: (idx) => {
      try {
        const tr = getE(`row-${idx}`);
        if (!tr) return;
        const type = getVal('[data-field="service_type"]', tr);
        const mainAdults = getNum('BK_Adult') || 1;
        const mainChild = getNum('BK_Child') || 0;
        const mainStart = getVal('BK_Start') || new Date();
        const mainEnd = getVal('BK_End') || new Date();

        let newQtyA = 0;
        let newQtyC = 0;
        if (type === 'Phòng') {
          newQtyA = Math.ceil(mainAdults / 2);
          newQtyC = mainChild;
        } else if (['Xe', 'HDV'].includes(type)) {
          newQtyA = 1;
          newQtyC = 0;
        } else {
          newQtyA = mainAdults;
          newQtyC = mainChild;
        }
        setVal('[data-field="quantity"]', newQtyA, tr);
        setVal('[data-field="child_qty"]', newQtyC, tr);

        let newIn = '';
        let newOut = '';
        const prevRow = tr.previousElementSibling;
        let prevOutDate = '';
        let prevInDate = '';
        let preType = '';
        if (prevRow && prevRow.querySelector('[data-field="check_out"]')) {
          prevOutDate = getVal('[data-field="check_out"]', prevRow);
          prevInDate = getVal('[data-field="check_in"]', prevRow);
          preType = getVal('[data-field="service_type"]', prevRow);
        }

        if (['Vé MB', 'Vé Tàu'].includes(type)) {
          newIn = mainStart;
          newOut = mainEnd;
        } else if (type === 'Phòng') {
          newIn = prevOutDate ? prevOutDate : mainStart;
          newOut = mainEnd;
        } else {
          let refDate;
          if (['Phòng', 'Vé MB', 'Vé Tàu'].includes(preType)) {
            refDate = prevInDate ? prevInDate : mainStart;
          } else {
            refDate = prevOutDate ? prevOutDate : mainStart;
          }
          newIn = refDate;
          newOut = refDate;
        }
        if (newIn) setVal('[data-field="check_in"]', newIn, tr);
        if (newOut) setVal('[data-field="check_out"]', newOut, tr);
        SalesModule.Logic.calcRow(idx);
      } catch (e) {
        L.log('SalesModule.Logic.autoFillRowData Error:', e);
      }
    },

    calcRow: (idx) => {
      try {
        if (getVal('BK_Status') === 'Hủy') return;
        const tr = getE(`row-${idx}`);
        if (!tr) return;
        const gV = (f) => getVal(`[data-field="${f}"]`, tr);
        const gN = (f) => getNum(`[data-field="${f}"]`, tr);
        const sV = (f, val) => setVal(`[data-field="${f}"]`, val, tr);
        const sN = (f, val) => setNum(`[data-field="${f}"]`, val, tr);

        const dInStr = gV('check_in');
        const dOutStr = gV('check_out');
        const type = gV('service_type');

        let night = 0;
        if (dInStr && dOutStr) {
          const dIn = new Date(dInStr);
          const dOut = new Date(dOutStr);
          const diff = (dOut - dIn) / 86400000;
          if (type !== 'Phòng' || diff <= 0) {
            night = 1;
          } else {
            night = diff;
          }
        }
        sN('nights', night);

        const qtyA = gN('quantity');
        const priA = gN('unit_price');
        const qtyC = gN('child_qty');
        const priC = gN('child_price');
        const sur = gN('surcharge');
        const disc = gN('discount');
        const multiplier = type === 'Phòng' ? Math.max(1, night) : 1;
        const total = (qtyA * priA + qtyC * priC) * multiplier + sur - disc;
        sN('total', total);
        SalesModule.Logic.calcGrandTotal();
      } catch (e) {
        L.log('SalesModule.Logic.calcRow Error:', e);
      }
    },

    calcGrandTotal: () => {
      try {
        if (getVal('BK_Status') === 'Hủy') return;
        let grandTotal = 0;
        let transportTotal = 0;
        let transportA = 0;
        let transportC = 0;
        let landChildTotal = 0;

        $$('[data-field="total"]', getE('detail-tbody')).forEach((elTotal) => {
          const rowTotal = getNum(elTotal);
          grandTotal += rowTotal;

          const tr = elTotal.closest('tr');
          if (tr) {
            const type = getVal('[data-field="service_type"]', tr);
            if (type === 'Vé MB' || type === 'Vé Tàu') {
              const qtyA = getNum('[data-field="quantity"]', tr);
              const priA = getNum('[data-field="unit_price"]', tr);
              const qtyC = getNum('[data-field="child_qty"]', tr);
              const priC = getNum('[data-field="child_price"]', tr);
              const sur = getNum('[data-field="surcharge"]', tr);
              const disc = getNum('[data-field="discount"]', tr);
              transportA += qtyA * priA + sur - disc;
              transportC += priC * qtyC;
              transportTotal += rowTotal;
            } else {
              const qtyC = getNum('[data-field="child_qty"]', tr);
              const priC = getNum('[data-field="child_price"]', tr);
              const nightVal = getNum('[data-field="nights"]', tr) || 1;
              const multiplier = type === 'Phòng' ? Math.max(1, nightVal) : 1;
              landChildTotal += qtyC * priC * multiplier;
            }
          }
        });

        const elBkTotal = $('BK_Total');
        if (elBkTotal) {
          setNum(elBkTotal, grandTotal);
        }

        const countAdult = getNum('BK_Adult') || 1;
        const countChild = getNum('BK_Child') || 0;

        const avgChildPrice = countChild > 0 ? landChildTotal / countChild : 0;
        const landTotal = grandTotal - transportTotal;
        const landAdultTotal = landTotal - landChildTotal;
        const avgAdultPrice = countAdult > 0 ? landAdultTotal / countAdult : 0;
        const transAdultPrice = countAdult > 0 ? transportA / countAdult : 0;
        const transChildPrice = countChild > 0 ? transportC / countChild : 0;

        setHTML('Stats_AvgAdult', formatNumber(Math.round(avgAdultPrice)));
        setHTML('Stats_AvgChild', formatNumber(Math.round(avgChildPrice)));
        setHTML('Stats_TransportAdult', formatNumber(Math.round(transAdultPrice)));
        setHTML('Stats_TransportChild', formatNumber(Math.round(transChildPrice)));

        const balance = grandTotal - getNum('BK_Deposit');
        setNum('BK_Balance', balance);
        SalesModule.Logic.updateBkStatus();
      } catch (e) {
        L.log('SalesModule.Logic.calcGrandTotal Error:', e);
      }
    },

    updateBkStatus: (force = false) => {
      try {
        let curStatus = getVal('BK_Status');
        let bkId = getVal('BK_ID');
        let grandTotal = getNum('BK_Total');
        let deposit = getNum('BK_Deposit');
        const startDate = new Date(getVal('BK_Start'));
        const today = new Date();
        let stt = curStatus || 'Đặt Lịch';
        if (!curStatus || curStatus !== 'Hủy' || force) {
          if (grandTotal === 0 && bkId && deposit === 0) stt = 'Hủy';
          else if (startDate <= today && deposit === grandTotal) stt = 'Xong BK';
          else if (deposit === grandTotal && grandTotal > 0) stt = 'Thanh Toán';
          else if (startDate < today && deposit < grandTotal) stt = 'Công nợ';
          else if (deposit > 0) stt = 'Đặt Cọc';
          else stt = 'Đặt Lịch';
        }
        setVal('BK_Status', stt);
        return stt;
      } catch (e) {
        L.log('SalesModule.Logic.updateBkStatus Error:', e);
        return '';
      }
    },

    autoSetOrCalcDate: (start, end) => {
      try {
        if (!start) return;

        // Nếu end là số (idx)
        if (typeof end === 'number' || !isNaN(Number(end))) {
          const idx = Number(end);
          const tr = getE(`row-${idx}`);
          if (tr) {
            const elOut = tr.querySelector('[data-field="check_out"]');
            if (elOut) {
              elOut.value = start;
              SalesModule.Logic.calcRow(idx);
            }
          }
          return;
        }

        const targetElement = getE(end);
        if (targetElement) {
          targetElement.value = start;
        } else {
          const startDate = new Date(start);
          const endDate = new Date(end);
          if (!isNaN(endDate.getTime())) {
            const diffTime = endDate - startDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
          }
        }
      } catch (e) {
        L.log('SalesModule.Logic.autoSetOrCalcDate Error:', e);
      }
    },

    lookupPrice: async (idx) => {
      try {
        const tr = getE(`row-${idx}`);
        if (!tr) return;

        const type = getVal('[data-field="service_type"]', tr);
        const hotel = getVal('[data-field="hotel_name"]', tr);
        const service = getVal('[data-field="service_name"]', tr);
        const checkIn = getVal('[data-field="check_in"]', tr);
        let checkOut = getVal('[data-field="check_out"]', tr);

        if (!checkIn) return logA('Vui lòng chọn ngày sử dụng/check-in', 'warning', 'toast');

        // Tự động tính Check-out (mặc định +1 đêm) nếu Sales quên nhập hoặc nhập trùng Check-in
        if (type === 'Phòng' && (!checkOut || checkOut === checkIn)) {
          const d = new Date(checkIn);
          d.setDate(d.getDate() + 1);
          checkOut = d.toISOString().split('T')[0];
          setVal('[data-field="check_out"]', checkOut, tr);
        }

        const CostManager = (await import('./prices/M_CostManager.js')).default;
        let result;

        if (type === 'Phòng') {
          if (!hotel) return logA('Vui lòng chọn Khách sạn', 'warning', 'toast');
          if (!service) return logA('Vui lòng nhập Tên/Mã phòng vào cột Dịch vụ', 'warning', 'toast');

          // =========================================================================
          // 🚀 HIỂN THỊ FORM CHỌN GÓI GIÁ & LOẠI GIÁ (THAY VÌ SET MẶC ĐỊNH)
          // =========================================================================

          // 1. Kéo dữ liệu cấu hình từ Cache của hệ thống
          const rawPackages = window.APP_DATA?.lists?.pkg_hotel_price || [
            { id: 'base', name: 'Giá NET (Mặc định)' },
            { id: 'contract', name: 'Giá Hợp Đồng' },
            { id: 'commit', name: 'Giá Commit' },
          ];
          const rawRateTypes = window.APP_DATA?.lists?.price_type || [
            { id: 'BB', name: 'Ăn sáng (BB)' },
            { id: 'BX', name: 'Ăn sáng Vui Chơi (BX)' },
            { id: 'FB', name: 'Ăn 3 bữa (FB)' },
            { id: 'FX', name: 'Ăn 3 bữa Vui Chơi (FX)' },
          ];

          // Hàm Helper normalize để đảm bảo data luôn là Array (đề phòng lưu dạng Map)
          const normalizeList = (list) => (Array.isArray(list) ? list : Object.values(list || {}));

          const packages = normalizeList(rawPackages);
          const rateTypes = normalizeList(rawRateTypes);

          // 2. Build HTML cho 2 thẻ Dropdown Select
          const pkgOptions = packages.map((p) => `<option value="${p.id}">${p.name || p.id}</option>`).join('');
          const rateOptions = rateTypes.map((r) => `<option value="${r.id}">${r.name || r.id}</option>`).join('');

          // 3. Lấy giá trị cũ trên hàng này (nếu Sales đã chọn trước đó) để gán làm mặc định
          const currentPkg = getVal('[data-field="package_id"]', tr) || 'base';
          const currentRate = getVal('[data-field="rate_type"]', tr) || 'BB';

          // 4. Hiển thị Popup bằng SweetAlert2
          if (!window.Swal) return logA('Thư viện hiển thị form (Swal) chưa sẵn sàng!', 'error');

          const { value: formValues } = await Swal.fire({
            title: '<h5 class="fw-bold mb-0 text-primary"><i class="bi bi-search me-2"></i>Tùy chọn tra cứu giá</h5>',
            html: `
              <div class="mt-3 text-start">
                <label class="form-label fw-bold text-dark small mb-1">Gói giá áp dụng</label>
                <select id="swal-pkg-id" class="form-select form-select-sm shadow-sm border-primary">
                  ${pkgOptions}
                </select>
              </div>
              <div class="mt-3 text-start">
                <label class="form-label fw-bold text-dark small mb-1">Loại giá (Rate Type)</label>
                <select id="swal-rate-type" class="form-select form-select-sm shadow-sm border-primary">
                  ${rateOptions}
                </select>
              </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Tra cứu ngay',
            cancelButtonText: 'Hủy bỏ',
            customClass: { confirmButton: 'btn btn-primary px-4', cancelButton: 'btn btn-secondary px-4' },
            buttonsStyling: false,
            didOpen: () => {
              // Đẩy giá trị cũ vào select box khi form vừa mở lên
              const pkgSelect = document.getElementById('swal-pkg-id');
              const rateSelect = document.getElementById('swal-rate-type');
              if (pkgSelect) pkgSelect.value = packages.find((p) => p.id === currentPkg) ? currentPkg : packages[0].id;
              if (rateSelect) rateSelect.value = rateTypes.find((r) => r.id === currentRate) ? currentRate : rateTypes[0].id;
            },
            preConfirm: () => {
              return {
                pkgId: document.getElementById('swal-pkg-id').value,
                rateType: document.getElementById('swal-rate-type').value,
              };
            },
          });

          // Nếu Sales bấm "Hủy bỏ" hoặc click ra ngoài -> Dừng quy trình
          if (!formValues) return;

          const { pkgId, rateType } = formValues;

          // 5. Lưu (hoặc update) lựa chọn ngược lại vào row để lần sau nhớ luôn
          // (Lưu ý: Bạn có thể thêm input hidden data-field="package_id" vào file HTML bảng sales để hứng data)
          setVal('[data-field="package_id"]', pkgId, tr);
          setVal('[data-field="rate_type"]', rateType, tr);

          // 6. Tiến hành gọi Database tra cứu
          if (typeof showLoading === 'function') showLoading(true, 'Đang tìm giá rẻ nhất...');
          result = await CostManager.getHotelPrice(hotel, checkIn, checkOut, service, rateType, pkgId);
        } else {
          // XỬ LÝ CHO CÁC DỊCH VỤ KHÁC (TOUR, VÉ...)
          if (!service) return logA('Vui lòng chọn Dịch vụ', 'warning', 'toast');
          if (typeof showLoading === 'function') showLoading(true, 'Đang tra cứu giá...');
          result = await CostManager.getServicePrice(service, checkIn);
        }

        if (typeof showLoading === 'function') showLoading(false);

        // =========================================================================
        // 🚀 XỬ LÝ KẾT QUẢ TRẢ VỀ
        // =========================================================================
        if (result.success) {
          let price = 0;
          let childPrice = 0;
          let confirmMsg = '';

          if (type === 'Phòng') {
            price = result.price;
            confirmMsg = `<div class="text-start">
                            <b class="text-primary">TÌM THẤY GIÁ PHÒNG:</b><br/>
                            - Đơn giá bình quân: <b class="text-danger">${formatNumber(price)} /đêm</b><br/>
                            - Tổng ${result.nightCount} đêm: <b>${formatNumber(result.totalPrice)}</b><br/><br/>
                            <b>Chi tiết từng đêm:</b><br/>
                            <div class="small text-muted p-2 bg-light border rounded" style="max-height: 120px; overflow-y: auto;">
                                ${result.details_price.replace(/\n/g, '<br/>')}
                            </div><br/>
                            <i class="text-secondary">Bạn có muốn áp dụng giá này vào form không?</i>
                          </div>`;
          } else {
            price = result.price.adl;
            childPrice = result.price.chd || 0;
            confirmMsg = `<div class="text-start">
                            <b class="text-primary">TÌM THẤY GIÁ DỊCH VỤ:</b><br/>
                            - Người lớn: <b class="text-danger">${formatNumber(price)}</b><br/>
                            - Trẻ em: <b>${formatNumber(childPrice)}</b><br/><br/>
                            <i class="text-secondary">Bạn có muốn áp dụng giá này vào form không?</i>
                          </div>`;
          }

          const ok = await logA(confirmMsg, 'question', 'confirm');

          if (ok) {
            setVal('[data-field="unit_price"]', price, tr);

            if (type === 'Phòng') {
              setVal('[data-field="quantity"]', result.nightCount, tr);
            } else if (childPrice > 0) {
              setVal('[data-field="child_price"]', childPrice, tr);
            }

            if (window.SalesModule && SalesModule.Logic && typeof SalesModule.Logic.calcRow === 'function') {
              SalesModule.Logic.calcRow(idx);
            }
            logA('Đã áp dụng giá thành công!', 'success', 'toast');
          }
        } else {
          logA(result.error || 'Không tìm thấy giá phù hợp', 'warning', 'toast');
        }
      } catch (e) {
        if (typeof showLoading === 'function') showLoading(false);
        console.error('[lookupPrice] Lỗi:', e);
        logA('Có lỗi xảy ra khi tra cứu giá!', 'error', 'toast');
      }
    },

    sortDetailsData: (detailsData) => {
      if (!Array.isArray(detailsData) || detailsData.length === 0) return detailsData;
      const typeOrder = SalesModule.Config.typeOrder;
      const getTypePriority = (serviceType) => {
        const idx = typeOrder.indexOf(serviceType);
        return idx >= 0 ? idx : typeOrder.length;
      };
      return detailsData.sort((a, b) => {
        const aPriority = getTypePriority(a?.service_type || '');
        const bPriority = getTypePriority(b?.service_type || '');
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aDate = a?.check_in ? new Date(a.check_in).getTime() : 0;
        const bDate = b?.check_in ? new Date(b.check_in).getTime() : 0;
        return aDate - bDate;
      });
    },

    findCustByPhone: async (customerData = null) => {
      try {
        let custFieldset = document.querySelector('fieldset[name="customers"]') || document.querySelector('fieldset#fs_customer_info');
        if (!custFieldset) return;

        const phoneEl = custFieldset.querySelector('[data-field="customer_phone"]');
        const nameEl = custFieldset.querySelector('[data-field="customer_full_name"]');
        let phoneInput = getVal(phoneEl);
        phoneInput = phoneInput.replace(/\D/g, '');
        const nameInput = getVal(nameEl).trim() || '';

        if (!customerData && phoneInput.length < 3 && nameInput.length < 3) return;

        const customers = APP_DATA ? APP_DATA.customers : {};
        let found = customerData;

        if (!found) {
          if (phoneInput.length >= 3) {
            found = HD.find(customers, phoneInput, 'phone');
          }
          if (!found && nameInput.length >= 3) {
            found = HD.find(customers, nameInput, 'full_name');
          }
        }

        if (found) {
          const custData = {
            id: found.id || found[0] || '',
            full_name: found.full_name || found.customer_full_name || found[1] || '',
            phone: found.phone || found.customer_phone || found[6] || '',
            email: found.email || found.customer_email || found[7] || '',
            id_card: found.id_card || found.cccd || found[3] || '',
            id_card_date: found.id_card_date || found.cccd_date || found[4] || '',
            dob: found.dob || found.date_of_birth || found[2] || '',
            address: found.address || found[5] || '',
            source: found.source || found.customer_source || found[8] || '',
          };

          Object.keys(custData).forEach((key) => {
            const fieldName = 'customer_' + key;
            const el = custFieldset.querySelector(`[data-field="${fieldName}"]`);
            if (el && custData[key]) setVal(el, custData[key]);
          });
          if (!getVal('[data-field="customer_total_spend"]')) SalesModule.DB.loadCustSpend(custData.id);
        }
      } catch (e) {
        L.log('SalesModule.Logic.findCustByPhone Error:', e);
      }
    },

    processAndFillTemplate: async (booking_details, anchorDateStr, newStartStr, newAdult) => {
      try {
        const parseDate = (dStr) => (dStr instanceof Date ? dStr : new Date(dStr));
        const bkId = getVal('BK_ID');
        const dOld = parseDate(anchorDateStr);
        const dNew = parseDate(newStartStr);
        const diffTime = dNew.getTime() - dOld.getTime();

        const tbody = getE('detail-tbody');
        if (tbody) tbody.innerHTML = '';
        SalesModule.State.detailRowCount = 0;

        const rowDataList = booking_details.map((row) => {
          let shiftedIn = '';
          let shiftedOut = '';
          if (row.in || row.check_in) {
            const rIn = parseDate(row.in || row.check_in);
            shiftedIn = new Date(rIn.getTime() + diffTime).toISOString().split('T')[0];
          }
          if (row.out || row.check_out) {
            const rOut = parseDate(row.out || row.check_out);
            shiftedOut = new Date(rOut.getTime() + diffTime).toISOString().split('T')[0];
          }

          let type = row.type || row.service_type;
          let finalQtyA = row.qtyA || row.quantity;
          if (!['Xe', 'HDV', 'Tàu', 'Ca nô'].includes(type)) {
            finalQtyA = type === 'Phòng' ? Math.ceil(newAdult / 2) : newAdult;
          }

          return {
            id: '',
            booking_id: bkId,
            service_type: type,
            hotel_name: row.location || row.hotel_name,
            service_name: row.name || row.service_name,
            check_in: shiftedIn,
            check_out: shiftedOut,
            nights: '',
            quantity: finalQtyA,
            unit_price: row.priA || row.unit_price,
            child_qty: row.qtyC || row.child_qty,
            child_price: row.priC || row.child_price,
            surcharge: row.sur || row.surcharge,
            discount: row.disc || row.discount,
            total: '',
            ref_code: row.code || row.ref_code,
            note: row.note,
          };
        });

        // Tối ưu: Gọi addDetailRow một lần với mảng dữ liệu
        await SalesModule.UI.addDetailRow(rowDataList);

        if (typeof logA === 'function') logA('Đã tải Template và cập nhật ngày tháng thành công!', 'success');
      } catch (e) {
        L.log('SalesModule.Logic.processAndFillTemplate Error:', e);
      }
    },

    /**
     * Copy toàn bộ chi tiết từ một Booking cũ sang Booking hiện tại
     * @param {string} bkId - ID của booking nguồn
     */
    copyBooking: async (bkId) => {
      try {
        if (!bkId) {
          const coll = prompt(`📥 Nhập Mã Booking muốn tạo form:\n\n(Để trống để hủy)`);
          if (!coll) return '';
          bkId = coll;
        }
        if (!bkId) return logA('Vui lòng cung cấp mã Booking nguồn!', 'warning');

        let sourceDetails = null;
        const allDetails = window.APP_DATA?.booking_details_by_booking || {};
        sourceDetails = allDetails[bkId];

        // Nếu không tìm thấy trong local, thử tìm trong archived_bookings & archived_booking_details
        if (!sourceDetails || (Array.isArray(sourceDetails) && sourceDetails.length === 0)) {
          if (typeof showLoading === 'function') showLoading(true, 'Đang tìm kiếm trong kho lưu trữ...');
          try {
            // Kiểm tra xem booking có tồn tại trong archived_bookings không
            const bkRes = await DB_MANAGER.runQuery('archived_bookings', 'id', '==', bkId);
            if (bkRes && bkRes.length > 0) {
              // Nếu có, lấy chi tiết từ archived_booking_details
              const detailsRes = await DB_MANAGER.runQuery('archived_booking_details', 'booking_id', '==', bkId);
              if (detailsRes && detailsRes.length > 0) {
                sourceDetails = detailsRes;
              }
            }
          } catch (err) {
            L.log('SalesModule.Logic.copyBooking: Lỗi truy vấn archived data', err);
          } finally {
            if (typeof showLoading === 'function') showLoading(false);
          }
        }

        if (!sourceDetails || (Array.isArray(sourceDetails) && sourceDetails.length === 0)) {
          return logA(`Không tìm thấy chi tiết cho Booking: ${bkId}`, 'warning');
        }

        const detailsArr = Array.isArray(sourceDetails) ? sourceDetails : Object.values(sourceDetails);

        // Lấy thông tin từ các input hiện tại
        const currentBkId = getVal('BK_ID');
        const newStartStr = getVal('BK_Start');
        const newAdult = getNum('BK_Adult') || 1;
        const newChild = getNum('BK_Child') || 0;

        if (!newStartStr) return logA('Vui lòng nhập Ngày Đi (BK_Start) trước khi copy!', 'warning');

        // Tìm ngày bắt đầu của booking nguồn để tính diffTime
        const parseDate = (dStr) => (dStr instanceof Date ? dStr : new Date(dStr));
        let minSourceIn = null;
        detailsArr.forEach((d) => {
          const dIn = parseDate(d.check_in || d.in);
          if (!minSourceIn || dIn < minSourceIn) minSourceIn = dIn;
        });

        const dNew = parseDate(newStartStr);
        const diffTime = minSourceIn ? dNew.getTime() - minSourceIn.getTime() : 0;

        const tbody = getE('detail-tbody');
        if (tbody) tbody.innerHTML = '';
        SalesModule.State.detailRowCount = 0;

        const rowDataList = detailsArr.map((row) => {
          let shiftedIn = '';
          let shiftedOut = '';
          if (row.check_in || row.in) {
            const rIn = parseDate(row.check_in || row.in);
            shiftedIn = new Date(rIn.getTime() + diffTime).toISOString().split('T')[0];
          }
          if (row.check_out || row.out) {
            const rOut = parseDate(row.check_out || row.out);
            shiftedOut = new Date(rOut.getTime() + diffTime).toISOString().split('T')[0];
          }

          let type = row.service_type || row.type;
          let finalQtyA = row.quantity || row.qtyA;
          let finalQtyC = row.child_qty || row.qtyC;

          // Logic cập nhật số lượng dựa theo input mới
          if (!['Xe', 'HDV', 'Tàu', 'Ca nô'].includes(type)) {
            finalQtyA = type === 'Phòng' ? Math.ceil(newAdult / 2) : newAdult;
            finalQtyC = newChild;
          }

          return {
            id: '',
            booking_id: currentBkId ?? '',
            service_type: type,
            hotel_name: row.hotel_name || row.location,
            service_name: row.service_name || row.name,
            check_in: shiftedIn,
            check_out: shiftedOut,
            nights: '',
            quantity: finalQtyA,
            unit_price: row.unit_price || row.priA,
            child_qty: finalQtyC,
            child_price: row.child_price || row.priC,
            surcharge: 0,
            discount: 0,
            total: 0,
            ref_code: '',
            note: '',
          };
        });

        // Tối ưu: Gọi addDetailRow một lần với mảng dữ liệu
        await SalesModule.UI.addDetailRow(rowDataList);

        if (typeof logA === 'function') logA(`Đã copy thành công ${detailsArr.length} dịch vụ từ Booking ${bkId}`, 'success');
      } catch (e) {
        L.log('SalesModule.Logic.copyBooking Error:', e);
      }
    },

    createContract: async () => {
      try {
        // 1. Kiểm tra dữ liệu cơ bản
        if (typeof SalesModule.DB.getBkFormData !== 'function') return;

        const { bookings, customer, booking_details } = await SalesModule.DB.getBkFormData();

        // 2. Lấy dữ liệu mở rộng từ Tab Customer
        let extendedCust = null;

        if (typeof SalesModule.DB.getCustomerData === 'function') {
          extendedCust = await SalesModule.DB.getCustomerData();
        }

        // Guard: nếu không lấy được dữ liệu khách hàng, không thể tạo hợp đồng
        if (!extendedCust) {
          logA('Vui lòng điền đầy đủ thông tin khách hàng (Tên, SĐT) trước khi tạo hợp đồng!', 'warning');
          return;
        }

        const payload = {
          bookings: bookings,
          booking_details: booking_details,
          customer: extendedCust,
        };
        setBtnLoading('btn-create-contract', true, 'Creating...');
        let mess;
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
                      <hr />
                      <button class="btn btn-sm btn-link text-secondary text-decoration-none"
                               onclick="requestDeleteFile('${res.docId}')">
                        <i class="fa-solid fa-trash"></i> Xóa file này
                      </button>
                  </div>
                  `
              : `
                </div>
              `);
          mess = `Link Hợp Đồng: ${res.docUrl || 'Không có'}`;
          setVal('BK_Note', mess); // Gán URL vào BK_Note
          showAlert(htmlContent, 'success', 'Tạo Thành Công');
        } else {
          L.log('Lỗi: ' + (res?.message || 'Không thể tạo hợp đồng. Vui lòng thử lại.'));
        }
        setBtnLoading('btn-create-contract', false);
      } catch (e) {
        L.log('Catch Lỗi: ' + e.message, e);
      } finally {
        setBtnLoading('btn-create-contract', false);
      }
    },
    requestDeleteFile: async (fileId) => {
      showConfirm('Bạn chắc chắn muốn xóa file hợp đồng vừa tạo khỏi Google Drive?', async () => {
        // Đổi nút bấm thành đang xóa...
        showLoading(true);
        const res = await requestAPI('deleteGeneratedFile', fileId);

        showLoading(false);
        if (res) {
          logA(res.message || 'Done', 'success');
          closeSubModal(); // Đóng modal sau khi xóa
        } else {
          L.log('Lỗi: ' + (res?.message || 'Không thể xóa file. Vui lòng thử lại.'));
        }
      });
    },

    /**
     * Lưu bản nháp hiện tại vào localStorage (FIFO 3 bản)
     */
    saveDraft: async () => {
      try {
        const formData = await SalesModule.DB.getBkFormData();
        if (!formData) return;

        const prefix = SalesModule.Config.draftKeyPrefix;
        const max = SalesModule.Config.maxDrafts;

        // FIFO Logic: 1->2, 2->3, 3->New (Hoặc đơn giản là xoay vòng)
        // Ở đây ta dùng cách: Đẩy 1->2, 2->3, và lưu mới vào 1 (LIFO hiển thị nhưng FIFO lưu trữ)
        // Hoặc theo yêu cầu: FIFO queue with keys prefixed 1-3.
        // Nghĩa là: 1 là cũ nhất, 3 là mới nhất. Khi thêm mới: 1 xóa, 2->1, 3->2, New->3.

        const d1 = localStorage.getItem(prefix + '1');
        const d2 = localStorage.getItem(prefix + '2');
        const d3 = localStorage.getItem(prefix + '3');

        if (d1) localStorage.removeItem(prefix + '1');
        if (d2) localStorage.setItem(prefix + '1', d2);
        if (d3) localStorage.setItem(prefix + '2', d3);

        localStorage.setItem(prefix + '3', JSON.stringify(formData));

        logA('Đã lưu bản nháp thành công (Tối đa 3 bản gần nhất).', 'success', 'toast');
        SalesModule.UI.renderDraftsMenu();
      } catch (e) {
        L.log('SalesModule.Logic.saveDraft Error:', e);
      }
    },

    /**
     * Tải dữ liệu từ bản nháp localStorage
     */
    loadDraft: (key) => {
      try {
        const dataStr = localStorage.getItem(key);
        if (!dataStr) return logA('Không tìm thấy dữ liệu bản nháp!', 'warning');

        const data = JSON.parse(dataStr);
        const { bookings, customer, booking_details } = data;

        // Đảm bảo id không bị ghi đè nếu đang tạo mới (nháp thường không có ID hoặc ID cũ)
        // Tuy nhiên yêu cầu nói "ensuring the 'id' field is not overwritten"
        // có thể hiểu là nếu form đang có ID thì không được ghi đè bằng ID trống từ nháp.
        const currentBkId = getVal('BK_ID');
        if (currentBkId && !bookings.id) {
          bookings.id = currentBkId;
        }

        SalesModule.UI.loadBookingToUI(bookings, customer, booking_details);
        logA(`Đã tải bản nháp: ${key}`, 'success', 'toast');
      } catch (e) {
        L.log('SalesModule.Logic.loadDraft Error:', e);
      }
    },
  };

  // ─── 5. DATABASE ACTIONS ───────────────────────────────────────────
  static DB = {
    getBkFormData: async (update = false) => {
      try {
        const bookings = {
          id: getVal('BK_ID'),
          customer_id: getVal('Cust_Id'),
          customer_full_name: getVal('Cust_Name'),
          customer_phone: typeof formatPhone === 'function' ? formatPhone(getVal('Cust_Phone')) : getVal('CustPhone'),
          start_date: getVal('BK_Start'),
          end_date: getVal('BK_End'),
          adults: getVal('BK_Adult'),
          children: getVal('BK_Child'),
          total_amount: getVal('BK_Total'),
          deposit_amount: getVal('BK_Deposit'),
          balance_amount: 0,
          payment_method: getVal('BK_PayType'),
          payment_due_date: getVal('BK_PayDue'),
          note: getVal('BK_Note'),
          staff_id: getVal('BK_Staff') || window.CURRENT_USER?.name || '',
          status: '',
          source: getVal('Cust_Source'),
          created_at: getVal('BK_Date'),
        };

        bookings.balance_amount = Number(bookings.total_amount) - Number(bookings.deposit_amount);
        bookings.status = SalesModule.Logic.updateBkStatus();
        if (getVal('BK_TourName')) bookings.tour_name = getVal('BK_TourName');

        const customer = {
          id: getVal('[data-field="customer_id"]') || '',
          full_name: getVal('[data-field="customer_full_name"]'),
          dob: getVal('[data-field="customer_dob"]'),
          id_card: getVal('[data-field="customer_id_card"]'),
          id_card_date: getVal('[data-field="customer_id_card_date"]'),
          address: getVal('[data-field="customer_address"]'),
          phone: typeof formatPhone === 'function' ? formatPhone(getVal('[data-field="customer_phone"]')) : getVal('[data-field="customer_phone"]'),
          source: getVal('[data-field="customer_source"]'),
          email: getVal('[data-field="customer_email"]'),
          total_spend: getVal('[data-field="customer_total_spend"]') || 0,
        };

        const booking_details = [];
        const detailRows = document.querySelectorAll('#detail-tbody tr');
        for (let i = 0; i < detailRows.length; i++) {
          let tr = detailRows[i];
          let rowId = getVal('[data-field="id"]', tr) || tr.dataset.item || '';

          booking_details.push({
            id: (String(rowId) || '').trim(),
            booking_id: bookings.id,
            service_type: getVal('[data-field="service_type"]', tr),
            hotel_name: getVal('[data-field="hotel_name"]', tr),
            service_name: getVal('[data-field="service_name"]', tr),
            check_in: getVal('[data-field="check_in"]', tr),
            check_out: getVal('[data-field="check_out"]', tr),
            nights: getVal('[data-field="nights"]', tr),
            quantity: getVal('[data-field="quantity"]', tr),
            unit_price: getVal('[data-field="unit_price"]', tr),
            child_qty: getVal('[data-field="child_qty"]', tr),
            child_price: getVal('[data-field="child_price"]', tr),
            surcharge: getVal('[data-field="surcharge"]', tr),
            discount: getVal('[data-field="discount"]', tr),
            total: getVal('[data-field="total"]', tr),
            ref_code: getVal('[data-field="ref_code"]', tr),
            note: getVal('[data-field="note"]', tr),
          });
        }

        if (!update) return { bookings, customer, booking_details };

        const [bookingChanges, hasBookingChanges] = await HD.filterUpdatedData('fs_booking_info');
        const [customerChanges, hasCustomerChanges] = await HD.filterUpdatedData('fs_customer_info');
        const changedDetails = [];

        for (let i = 0; i < detailRows.length; i++) {
          const tr = detailRows[i];
          const detailData = booking_details[i];
          const isNewRow = !tr.id || detailData.id.startsWith('dt_');
          if (isNewRow) {
            changedDetails.push(detailData);
            continue;
          }
          const [rowChanges, hasRowChanges] = await HD.filterUpdatedData(tr.id, $('#detail-tbody'));
          if (hasRowChanges > 0) changedDetails.push(detailData);
        }

        if (!hasBookingChanges && !hasCustomerChanges && changedDetails.length === 0) {
          L._('SalesModule.DB.getBkFormData: Không có dữ liệu thay đổi', 'warning');
          return null;
        }

        return {
          bookings: hasBookingChanges ? bookings : { id: bookings.id },
          customer: hasCustomerChanges ? customer : { id: customer.id },
          booking_details: changedDetails,
        };
      } catch (e) {
        L.log('SalesModule.DB.getBkFormData Error:', e);
        return null;
      }
    },

    saveForm: async (update = false) => {
      try {
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', true, 'Saving...');
        const formData = await SalesModule.DB.getBkFormData(update);
        if (!formData) {
          if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', false);
          return;
        }

        const { bookings, booking_details } = formData;
        const bookingId = bookings?.id;

        if (!bookingId) {
          const missing = [];
          if (!bookings.customer_id) missing.push('customer_id');
          if (!bookings.customer_full_name) missing.push('customer_name');
          if (!bookings.customer_phone) missing.push('customer_phone');
          if (missing.length > 0) {
            L.log(`Thiếu thông tin khách hàng: ${missing.join(', ')}`);
            if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', false);
            return;
          }
        }

        let saveResult = null;
        if (Object.keys(bookings || {}).filter((k) => k !== 'id').length > 0) {
          saveResult = await DB_MANAGER.saveRecord('bookings', bookings);
          if (saveResult?.success && bookings.status !== 'Hủy') {
            if (!bookingId && window.A?.NotificationManager) {
              window.NotificationManager.sendToAll('NEW BOOKING', `Booking mới: ${saveResult.id} - ${bookings.staff_id}`);
              setVal('BK_ID', saveResult.id);
            }

            if (Array.isArray(booking_details) && booking_details.length > 0) {
              const resolvedBkId = saveResult?.id || bookings.id;
              const details = booking_details.map((d) => {
                if (!d.booking_id) d.booking_id = resolvedBkId;
                return Object.values(d);
              });
              await DB_MANAGER.batchSave('booking_details', details);
            }

            await SalesModule.DB.saveCustomer();
            if (window.StateProxy) await StateProxy.commitSession();

            const btnDashUpdate = getE('btn-dash-update');
            if (btnDashUpdate && window.A?.Event) window.A.Event.trigger(btnDashUpdate, 'click');

            if (typeof logA === 'function') logA('Lưu dữ liệu thành công!', 'success');
            handleBookingSearch(saveResult?.id || bookings.id);
          }
        }
      } catch (e) {
        if (window.StateProxy) StateProxy.rollbackSession();
        L.log('SalesModule.DB.saveForm Error:', e);
      } finally {
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-group', false);
      }
    },

    cancelBooking: async () => {
      try {
        const bkId = getVal('BK_id');
        if (!bkId) return logA('Vui lòng chọn một Booking!');
        if (getVal('BK_Status') === 'Hủy') return logA('Booking này đã bị hủy!');

        if (typeof showLoading === 'function') showLoading(true, 'Đang hủy...');
        setVal('BK_Status', 'Hủy');
        setVal('BK_Total', '0');
        const elNote = $('BK_Note');
        if (elNote) elNote.value = `[Hủy lúc ${new Date().toLocaleTimeString()}] ` + elNote.value;

        await SalesModule.DB.saveForm(false);
        if (window.A?.NotificationManager) {
          window.NotificationManager.sendToOperator('HỦY BOOKING', `Booking Đã Hủy: ${bkId} - ${window.CURRENT_USER?.name}`);
        }
      } catch (e) {
        L.log('SalesModule.DB.cancelBooking Error:', e);
      } finally {
        if (typeof showLoading === 'function') showLoading(false);
      }
    },

    saveCustomer: async () => {
      try {
        SalesModule.DB.loadCustSpend();
        const data = await SalesModule.DB.getCustomerData(true);
        if (!data) return;

        if (!data.id && data.phone && window.APP_DATA?.customers) {
          const found = Object.values(window.APP_DATA.customers).find((c) => (c?.phone || c?.customer_phone) === data.phone);
          if (found?.id) {
            data.id = found.id;
            setVal('[data-field="customer_id"]', found.id);
          }
        }

        if (typeof showLoading === 'function') showLoading(true, 'Đang lưu khách hàng...');
        const res = await DB_MANAGER.saveRecord('customers', data);
        if (res?.id) {
          const oldId = getVal('[data-field="customer_id"]');
          if (!oldId || oldId != res.id) setVal('[data-field="customer_id"]', res.id);
        }
      } catch (e) {
        L.log('SalesModule.DB.saveCustomer Error:', e);
      } finally {
        if (typeof showLoading === 'function') showLoading(false);
      }
    },

    getCustomerData: async (update = false) => {
      try {
        let custFieldset = document.querySelector('fieldset[name="customers"]') || document.querySelector('fieldset#fs_customer_info');
        if (!custFieldset) return null;

        if (update) {
          const [changes, hasChanges] = await HD.filterUpdatedData(custFieldset);
          if (hasChanges) {
            const normalized = {};
            Object.entries(changes).forEach(([k, v]) => (normalized[k.replace(/^customer_/, '')] = v));
            return normalized;
          }
        }

        const data = {};
        custFieldset.querySelectorAll('input, select, textarea').forEach((el) => {
          if (el.hasAttribute('data-field')) {
            let fieldName = el.getAttribute('data-field').replace(/^customer_/, '');
            data[fieldName] = getVal(el);
          }
        });

        if (!data.full_name || !data.phone) {
          if (typeof logA === 'function') logA('Vui lòng nhập Tên và Số điện thoại!', 'warning');
          return null;
        }
        return data;
      } catch (e) {
        L.log('SalesModule.DB.getCustomerData Error:', e);
        return null;
      }
    },

    loadCustSpend: (custId) => {
      try {
        if (!custId) custId = getVal('[data-field="customer_id"]');
        if (!custId) return 0;
        const data = HD.filter(APP_DATA.bookings, custId, '==', 'customer_id');
        const sum = HD.agg(data, 'total_amount');
        setVal('[data-field="customer_total_spend"]', sum);
        return sum;
      } catch (e) {
        L.log('SalesModule.DB.loadCustSpend Error:', e);
        return 0;
      }
    },

    updateDeposit: async () => {
      try {
        const bkId = getVal('BK_ID');
        if (!bkId) return 0;
        const result = await DB_MANAGER.runQuery('transactions', 'booking_id', '==', bkId);
        if (!result || !Array.isArray(result)) {
          setVal('BK_Deposit', 0);
          return 0;
        }
        L._('Transactions for Booking ID', bkId, result);
        const total = HD.agg(result, 'amount') / 1000;
        setNum('BK_Deposit', total);
        SalesModule.Logic.calcGrandTotal();
        return total;
      } catch (e) {
        L.log('SalesModule.DB.updateDeposit Error:', e);
        return 0;
      }
    },

    saveBatchDetails: async () => {
      try {
        const booking_details = {};
        const rows = document.querySelectorAll('#detail-tbody tr');
        rows.forEach((tr, index) => {
          const getRowNum = (fieldName) => getNum(tr.querySelector(`[data-field="${fieldName}"]`));
          const getRowVal = (fieldName) => getVal(tr.querySelector(`[data-field="${fieldName}"]`));
          booking_details[index] = [getRowVal('id'), getRowVal('service_type'), getRowVal('hotel_name'), getRowVal('service_name'), getRowVal('check_in'), getRowVal('check_out'), getRowNum('nights'), getRowNum('quantity'), getRowNum('unit_price'), getRowNum('child_qty'), getRowNum('child_price'), getRowNum('surcharge'), getRowNum('discount'), getRowNum('total'), getRowVal('ref_code'), getRowVal('note')];
        });

        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-batch', true);
        const res = await DB_MANAGER.batchSave('booking_details', booking_details);
        if (typeof setBtnLoading === 'function') setBtnLoading('btn-save-batch', false);

        if (res) {
          if (typeof logA === 'function') logA('Lưu thành công!', 'success');
          if (typeof loadDataFromFirebase === 'function') loadDataFromFirebase();
          if (typeof refreshForm === 'function') refreshForm();
          if (typeof activateTab === 'function') activateTab('tab-form');
        }
      } catch (e) {
        L.log('SalesModule.DB.saveBatchDetails Error:', e);
      }
    },
  };

  // ─── 6. CONFIRMATION MODULE ────────────────────────────────────────
  static Confirmation = {
    DICT: {
      vi: {
        title: 'XÁC NHẬN ĐẶT DỊCH VỤ',
        ref: 'Mã Booking:',
        confirm_date: 'Ngày xác nhận:',
        cust_info: 'THÔNG TIN KHÁCH HÀNG',
        cust_name: 'Khách hàng:',
        cust_email: 'Email:',
        cust_phone: 'Điện thoại:',
        cust_add: 'Địa chỉ:',
        adult: 'Người lớn:',
        child: 'Trẻ em:',
        svc_details: 'CHI TIẾT DỊCH VỤ',
        col_desc: 'Dịch vụ / Diễn giải',
        col_date: 'Ngày sử dụng',
        col_out: 'Ngày về',
        col_qty: 'SL',
        col_price: 'Đơn giá',
        col_total: 'Thành tiền',
        note: 'GHI CHÚ:',
        lbl_total: 'TỔNG CỘNG:',
        lbl_paid: 'ĐÃ THANH TOÁN:',
        lbl_due: 'CÒN LẠI:',
        sign_cust: 'KHÁCH HÀNG',
        sign_comp: 'CÔNG TY TNHH 9 TRIP PHÚ QUỐC',
        signature: '(Ký tên)',
        sign_status: '(Đã xác nhận)',
      },
      en: {
        title: 'SERVICE CONFIRMATION',
        ref: 'Booking ID:',
        confirm_date: 'Date:',
        cust_info: 'CUSTOMER INFORMATION',
        cust_name: 'Customer:',
        cust_email: 'Email:',
        cust_phone: 'Phone:',
        cust_add: 'Address:',
        adult: 'Adults:',
        child: 'Children:',
        svc_details: 'SERVICE DETAILS',
        col_desc: 'Service Name',
        col_date: 'Check-In',
        col_out: 'Check-Out',
        col_qty: 'Qty',
        col_price: 'Price',
        col_total: 'Amount',
        note: 'NOTES / POLICY:',
        lbl_total: 'TOTAL AMOUNT:',
        lbl_paid: 'DEPOSIT / PAID:',
        lbl_due: 'BALANCE DUE:',
        sign_cust: 'CUSTOMER',
        sign_comp: '9 TRIP PHU QUOC CO., LTD',
        signature: '(Signature)',
        sign_status: '(Confirmed)',
      },
    },

    openModal: async (bookingId) => {
      try {
        if (!bookingId) bookingId = getVal('BK_ID');
        if (!bookingId) return logA('Không có mã Booking!', 'warning');

        const res = typeof findBookingInLocal === 'function' ? await findBookingInLocal(bookingId) : null;
        if (res?.success) {
          SalesModule.State.currentBookingData = res;
          const formEl = getE('tmpl-confirmation-modal');
          if (formEl && window.A?.Modal) {
            const form = formEl.content.cloneNode(true);
            window.A.Modal.render(form, `Xác nhận dịch vụ - Booking ID: ${bookingId}`);
            await SalesModule.Confirmation.renderUI();
            window.A.Modal.show();
          }
        } else {
          L.log(`Không tìm thấy Booking ID: ${bookingId}`);
        }
      } catch (e) {
        L.log('SalesModule.Confirmation.openModal Error:', e);
      }
    },

    renderUI: async () => {
      try {
        const data = SalesModule.State.currentBookingData;
        const m = data.bookings;
        const c = data.customer;

        setVal('conf-id', m.id || m[0]);
        setVal('conf-date', typeof formatDateVN === 'function' ? formatDateVN(m.created_at) : m[1]);
        setVal('print-time', new Date().toLocaleString());
        setVal('conf-cust-adult', m.adults || m[6]);
        setVal('conf-cust-child', m.children || m[7]);
        setVal('conf-cust-name', m.customer_full_name || c[1]);
        setVal('conf-cust-phone', m.customer_phone || c[6]);
        setVal('conf-cust-email', c?.email || '');
        setVal('conf-cust-add', c?.address || '');
        setVal('conf-staff', 'Sales Executive');

        await SalesModule.Confirmation.renderTable();

        setVal('conf-total', formatNumber(m.total_amount * 1000));
        setVal('conf-paid', formatNumber(m.deposit_amount * 1000));
        setVal('conf-balance', formatNumber(m.balance_amount * 1000));

        SalesModule.Confirmation.applySettings();
        if (window.A?.UI) window.A.UI.renderTemplate('body', 'tmpl-download-pdf');
      } catch (e) {
        L.log('SalesModule.Confirmation.renderUI Error:', e);
      }
    },

    renderTable: async () => {
      try {
        const details = SalesModule.State.currentBookingData.booking_details || [];
        const tbodySvc = getE('conf-tbody-service');
        const tbodyTour = getE('conf-tbody-tour');
        if (!tbodySvc || !tbodyTour) return;

        tbodySvc.innerHTML = '';
        tbodyTour.innerHTML = '';

        details.forEach((d, i) => {
          let name = d.name || d.service_name || d[4] || '';
          let loc = d.location || d.hotel_name || d[3] || '';
          let cin = d.in || d.check_in || d[5] || '';
          let cout = d.out || d.check_out || d[6] || '';
          let pri = Number(d.unit_price || d.price || d[9] || 0);
          let tot = Number(d.total || d.total_amount || d[14] || 0);
          let note = d.note || d[16] || '';

          const row = `<tr><td class="text-center">${i + 1}</td><td><div class="fw-bold">${name}</div><div class="text-muted fst-italic small">${loc}${note ? ' (' + note + ')' : ''}</div></td><td class="text-center">${typeof formatDateVN === 'function' ? formatDateVN(cin) : cin}</td><td class="text-center">${typeof formatDateVN === 'function' ? formatDateVN(cout) : cout}</td><td class="text-end col-price">${formatNumber(pri * 1000)}</td><td class="text-end fw-bold col-price">${formatNumber(tot * 1000)}</td></tr>`;
          tbodySvc.insertAdjacentHTML('beforeend', row);
        });

        const qtyA = parseInt(SalesModule.State.currentBookingData.bookings.adults) || 0;
        const qtyC = parseInt(SalesModule.State.currentBookingData.bookings.children) || 0;
        const pTourA = Number(getVal('Stats_AvgAdult')) * 1000;
        const pTourC = Number(getVal('Stats_AvgChild')) * 1000;
        const pTransA = Number(getVal('Stats_TransportAdult')) * 1000;
        const pTransC = Number(getVal('Stats_TransportChild')) * 1000;

        let transName = 'Vé vận chuyển';
        if (
          details.some((d) =>
            String(d.service_type || d[2])
              .toLowerCase()
              .includes('vé mb')
          )
        )
          transName = 'Vé máy bay';
        else if (
          details.some((d) =>
            String(d.service_type || d[2])
              .toLowerCase()
              .includes('vé tàu')
          )
        )
          transName = 'Vé tàu cao tốc';

        let tourRows = [];
        if (qtyA > 0 && pTourA > 0) tourRows.push({ name: 'Người lớn', qty: qtyA, price: pTourA, total: qtyA * pTourA });
        if (qtyC > 0 && pTourC > 0) tourRows.push({ name: 'Trẻ em', qty: qtyC, price: pTourC, total: qtyC * pTourC });
        if (qtyA > 0 && pTransA > 0) tourRows.push({ name: `${transName} (Người lớn)`, qty: qtyA, price: pTransA, total: qtyA * pTransA });
        if (qtyC > 0 && pTransC > 0) tourRows.push({ name: `${transName} (Trẻ em)`, qty: qtyC, price: pTransC, total: qtyC * pTransC });

        tourRows.forEach((r) => {
          const html = `<tr><td><span class="fw-bold">${r.name}</span></td><td class="text-center">${r.qty}</td><td class="text-end col-price">${formatNumber(r.price)}</td><td class="text-end fw-bold col-price">${formatNumber(r.total)}</td></tr>`;
          tbodyTour.insertAdjacentHTML('beforeend', html);
        });

        for (let i = tourRows.length; i < SalesModule.Config.minRows; i++) {
          tbodyTour.insertAdjacentHTML('beforeend', `<tr><td><span class="fw-bold">&nbsp;</span></td><td class="text-center"></td><td class="text-end col-price"></td><td class="text-end fw-bold col-price"></td></tr>`);
        }
      } catch (e) {
        L.log('SalesModule.Confirmation.renderTable Error:', e);
      }
    },

    setLang: (lang) => {
      SalesModule.State.lang = lang;
      const btnVN = getE('btn-lang-vn');
      const btnEN = getE('btn-lang-en');
      if (btnVN) btnVN.classList.toggle('active', lang === 'vi');
      if (btnEN) btnEN.classList.toggle('active', lang === 'en');
      SalesModule.Confirmation.applySettings();
    },

    togglePrice: () => {
      const chk = getE('btn-check-price');
      SalesModule.State.showPrice = chk ? chk.checked : true;
      SalesModule.Confirmation.applySettings();
    },

    setMode: (mode) => {
      SalesModule.State.mode = mode;
      const tblSvc = getE('tbl-mode-service');
      const tblTour = getE('tbl-mode-tour');
      if (mode === 'service') {
        if (tblSvc) tblSvc.classList.remove('d-none');
        if (tblTour) tblTour.classList.add('d-none');
      } else {
        if (tblSvc) tblSvc.classList.add('d-none');
        if (tblTour) tblTour.classList.remove('d-none');
      }
    },

    applySettings: () => {
      try {
        const dict = SalesModule.Confirmation.DICT[SalesModule.State.lang];
        document.querySelectorAll('[data-i18n]').forEach((el) => {
          const key = el.dataset.i18n;
          if (dict[key]) el.textContent = dict[key];
        });
        document.querySelectorAll('.col-price').forEach((el) => {
          el.style.display = SalesModule.State.showPrice ? '' : 'none';
        });
      } catch (e) {
        L.log('SalesModule.Confirmation.applySettings Error:', e);
      }
    },

    exportPDF: async () => {
      try {
        if (typeof loadLibraryAsync === 'function') await loadLibraryAsync('html2pdf');
        const element = getE('print-area');
        if (!element) return;
        element.classList.add(SalesModule.Config.pdfCompactModeClass);
        const bookingId = SalesModule.State.currentBookingData?.bookings?.id || 'Booking';
        const opt = { margin: [5, 5, 5, 5], filename: `Booking_${bookingId}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, scrollY: 0, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['css', 'legacy'] } };
        await html2pdf().set(opt).from(element).save();
        element.classList.remove(SalesModule.Config.pdfCompactModeClass);
      } catch (e) {
        L.log('SalesModule.Confirmation.exportPDF Error:', e);
      }
    },

    sendEmail: async () => {
      try {
        const email = getVal('conf-cust-email');
        if (!email || email.length < 5) return logA('Booking này chưa có Email khách hàng.', 'warning');
        const subject = `[9 TRIP] XÁC NHẬN ĐẶT DỊCH VỤ - CODE ${getVal('conf-id')}`;
        const data = await SalesModule.DB.getBkFormData();
        data.type = SalesModule.State.mode;
        data.showPrice = SalesModule.State.showPrice;
        data.stats = { avgA: getNum('Stats_AvgAdult'), avgC: getNum('Stats_AvgChild'), transA: getNum('Stats_TransportAdult'), transC: getNum('Stats_TransportChild') };
        const res = await requestAPI('sendConfirmationEmailAPI', email, subject, data);
        if (res && typeof logA === 'function') logA('Đã gửi email!', 'success');
      } catch (e) {
        L.log('SalesModule.Confirmation.sendEmail Error:', e);
      }
    },
  };
}

// ─── EXPOSE TO GLOBAL FOR HTML COMPATIBILITY ────────────────────────
window.SalesModule = SalesModule;

// Tự động render menu nháp khi module được load (nếu DOM đã sẵn sàng)
document.addEventListener('DOMContentLoaded', () => {
  if (getE('drafts-list')) SalesModule.UI.renderDraftsMenu();
});

export default SalesModule;
