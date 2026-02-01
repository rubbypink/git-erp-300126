// =========================================================================
// 1. GLOBAL UI VARIABLES (CHỈ KHAI BÁO BIẾN UI TẠI ĐÂY)
// =========================================================================
var APP_URL = {
baseUrl: 'https://script.google.com/macros/s/AKfycbyKK7O71jsyamCcBaeCMA0lio1YdQ_onGrUz1X1IYY/exec',
devUrl: 'https://script.google.com/macros/s/AKfycbyKK7O71jsyamCcBaeCMA0lio1YdQ_onGrUz1X1IYY/dev',
}
var APP_DATA = {};

var ROLE_DATA = {         
	'sale': 'booking_details',         
	'sale_sup': 'booking_details',
	'manager': 'booking_details',
	'op': 'operator_entries',
	'acc': 'operator_entries',
	'admin': 'booking_details'
};
var CR_COLLECTION = ''; // Collection hiện tại dựa trên role người dùng

var testValue;

// Cấu hình Retry
const MAX_RETRIES = 3;       // Số lần thử tối đa
const RETRY_DELAY = 2000;    // Thời gian chờ giữa các lần (ms) -> 2 giây
var retryCount = 0;          // Biến đếm số lần đã thử
var CURRENT_TABLE_KEY = '';
// Biến toàn cục tạm để lưu tham chiếu hàng đang được click chuột phải
// (Cần gán biến này khi sự kiện 'contextmenu' trên tr được kích hoạt)
var CURRENT_ROW_DATA = null;     // Data của hàng đang chọn


var GRID_COLS = []; 
var LAST_FILTER_SIGNATURE = null;

// Trạng thái phân trang
var PG_STATE = {
	data: [],       
	currentPage: 1, 
	limit: 50,      
	totalPages: 0
};

// Trạng thái sắp xếp
var SORT_STATE = { col: -1, dir: 'asc' };  

// =========================================================================
// CONFIG: DATA TABLE MAPPING
// Định nghĩa các bảng dữ liệu và tên hiển thị Tiếng Việt tương ứng
// =========================================================================
const TABLE_DISPLAY_MAP = {
	'bookings':  'Booking',          // Ưu tiên 2
	'booking_details':  'Chi Tiết Booking', // Ưu tiên 1
	'operator_entries': 'Booking NCC',
	'customers': 'Khách Hàng',
	'partners':  'Đối Tác'
};
const TABLE_HIDDEN_FIELDS = {
	'bookings':  ['created_at', 'customer_id'],
	'booking_details': ['id', 'booking_id'], 
	'operator_entries': ['id', 'booking_id', 'customer_name'], 
	'customers': ['created_at'],
	'partners':  ['created_at']
};

const TAB_INDEX_BY_ID = {
"tab-dashboard": 1,
"tab-form": 2,
"tab-list": 3,
"tab-sub-form": 4,
"tab-log": 5,
"tab-admin-dashboard": 6
};


/**
 * CẤU HÌNH CỘT NGÀY CHO TỪNG BẢNG (QUAN TRỌNG)
 * Key: Tên bảng (CURRENT_TABLE_KEY)
 * Value: Index của cột ngày (Bắt đầu từ 0). Nếu bảng không có cột ngày, để null.
 */
const TABLE_DATE_CONFIG = {
	'bookings': 6,    // Bảng Bookings: Ngày ở cột 6
	'booking_details': 5,   // Bảng Details: Ngày ở cột 5
	'operator_entries': 6,    
	'products': 2,  // Ví dụ bảng SP: Ngày nhập ở cột 2
	'customers': null // Bảng Khách hàng: Không lọc theo ngày
};

// Global State cho Context Menu
var CURRENT_CTX_ID = null;   // ID của dòng (SID)
var CURRENT_CTX_ROW = null;  // Element dòng (TR)

// =========================================================================
// 2. CORE RENDER ENGINE (LAZY LOAD)
// =========================================================================

const UI_RENDERER = {
	renderedTemplates: {}, 
	currentSaveHandler: null,
	COMPONENT_PATH: './src/components/',
	htmlCache: {},

	// Render Dashboard & Load Data
	init: async function() {
		await this.renderMainLayout();
		await this.renderTemplate('body', 'tpl_all.html', false, '.app-container');
		initSettings();
	},
	renderMainLayout: async function(source = 'main_layout.html', containerSelector = '#main-app') {
		let finalSourcePath = source;

		// Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
		if (source.endsWith('.html') && !source.includes('/')) {
			finalSourcePath = this.COMPONENT_PATH + source;
		}
        const container = document.querySelector(containerSelector);
        if (!container) {
            console.error("❌ Không tìm thấy container: " + containerSelector);
            return;
        }

        try {    
			container.innerHTML = ''; // Xóa nội dung cũ nếu có        
            // 1. Lấy nội dung template (Sử dụng cache nếu đã tải)
            let html;
            if (this.htmlCache[finalSourcePath]) {
                html = this.htmlCache[finalSourcePath];
            } else {
                const response = await fetch(finalSourcePath);
                if (!response.ok) throw new Error(`Không thể tải template tại ${finalSourcePath}: HTTP ${response.status}`);
                html = await response.text();
                this.htmlCache[finalSourcePath] = html; // Lưu cache
            }

            // 2. Chèn vào đầu container (afterbegin)
            // 'afterbegin' giúp layout chính (Sidebar/Header) luôn nằm trên cùng 
            // trước khi các module Sales/Op render dữ liệu vào bên trong.
            container.insertAdjacentHTML('afterbegin', html);
            
            log("✅ Đã render Main Layout thành công", "success");
            
        } catch (error) {
            log("🔥 Lỗi Render Layout: " + error.message, "danger");
        } finally {
            showLoading(false);
        }
    },	

	/**
	 * HÀM RENDER ĐA NĂNG (SMART RENDER)
	 * @param {string} targetId - ID của container cha (hoặc 'body')
	 * @param {string} source - Có thể là DOM ID ('tmpl-form') HOẶC File Path ('form.html')
	 * @param {boolean} force - True: Bắt buộc render lại (xóa cũ)
	 * @param {string} positionRef - Selector của phần tử mốc để chèn (dùng khi insertAdjacent)
	 * @param {string} mode - 'replace' (ghi đè), 'append' (nối đuôi), 'prepend' (lên đầu)
	 */
	renderTemplate: async function(targetId, source, force = false, positionRef = null, mode = 'replace') {
		// 1. CHUẨN HÓA SOURCE KEY (QUAN TRỌNG NHẤT)
		// Phải xác định unique key ngay từ đầu để check và save thống nhất
		let finalSourcePath = source;

		// Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
		if (source.endsWith('.html') && !source.includes('/')) {
			finalSourcePath = this.COMPONENT_PATH + source;
		}

		// 2. Guard Clause: Kiểm tra dựa trên FINAL PATH
		if (this.renderedTemplates[finalSourcePath] && !force && mode === 'replace') {
			console.log(`⚡ Skipped render: ${finalSourcePath} (Already exists)`);
			return true; // Trả về true giả lập là đã xong
		}

		// 3. Xác định nội dung (Content)
		let contentFragment = null;

		// CASE A: Source là File Path (.html)
		if (finalSourcePath.endsWith('.html')) {
			try {
				let htmlString = '';
				
				// Kiểm tra Cache RAM (Nội dung file)
				if (this.htmlCache[finalSourcePath]) {
					htmlString = this.htmlCache[finalSourcePath];
				} else {
					// Fetch Network
					const response = await fetch(finalSourcePath);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					htmlString = await response.text();
					this.htmlCache[finalSourcePath] = htmlString; // Lưu cache nội dung
				}

				// 1. Tạo div ảo để chứa HTML
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = htmlString;

				// 2. Tạo Fragment để chứa kết quả
				contentFragment = document.createDocumentFragment();

				// 3. Chuyển TOÀN BỘ nội dung từ tempDiv sang Fragment
				// Cách này sẽ giữ nguyên mọi thứ: div, span, và cả thẻ <template>
				while (tempDiv.firstChild) {
					contentFragment.appendChild(tempDiv.firstChild);
				}

			} catch (e) {
				console.error(`❌ Lỗi tải file ${finalSourcePath}:`, e);
				return false;
			}
		} 
		// CASE B: Source là DOM ID (<template id="...">)
		else {
			const templateEl = document.getElementById(source); // ID thì dùng source gốc
			if (!templateEl) {
				console.error(`❌ Không tìm thấy Template ID: ${source}`);
				return false;
			}
			contentFragment = templateEl.content.cloneNode(true);
			// Với ID, ta dùng ID làm key lưu trữ
			finalSourcePath = source; 
		}

		// 4. Security Check & Container Handling
		let container;
		
		// Đảm bảo SECURITY_MANAGER tồn tại trước khi gọi
		// if (typeof SECURITY_MANAGER !== 'undefined') {
		//     SECURITY_MANAGER.cleanDOM(contentFragment);
		// }

		// --- SCENARIO 1: Render vào BODY ---
		if (targetId === 'body') {
			container = document.body;
			
			if (positionRef) {
				const refElement = container.querySelector(positionRef);
				if (refElement) {
					refElement.parentNode.insertBefore(contentFragment, refElement.nextSibling);
				} else {
					container.appendChild(contentFragment);
				}
			} else {
				// Chèn trước script đầu tiên để tránh lỗi JS loading
				const firstScript = container.querySelector('script');
				container.insertBefore(contentFragment, firstScript || container.lastChild);
			}
		} 
		// --- SCENARIO 2: Render vào Container ID ---
		else {
			container = document.getElementById(targetId);
			if (!container) {
				console.warn(`⚠️ Container not found: ${targetId}`);
				return false;
			}

			if (mode === 'replace') {
				container.innerHTML = '';
				container.appendChild(contentFragment);
			} else if (mode === 'prepend') {
				container.insertBefore(contentFragment, container.firstChild);
			} else { // append
				container.appendChild(contentFragment);
			}
		}

		// 5. Đánh dấu Flag (Sử dụng KEY ĐÃ CHUẨN HÓA)
		this.renderedTemplates[finalSourcePath] = true;
		console.log(`✅ Rendered: ${finalSourcePath} -> #${targetId}`);
		
		return true;
	},
	// Hàm được gọi khi bấm chuyển Tab (Hoặc Init)
	lazyLoad: function(tabId) {
		const tmplId = tabId.replace('tab-', 'tmpl-');
		
		// 1. Luôn đảm bảo HTML được render trước
		this.renderTemplate(tabId, tmplId, false);

		// 2. Logic khởi tạo Component (Chạy ngay cả khi chưa có Data)
		// Ví dụ: Tạo Datepicker, Gán sự kiện click nút update...
		if (tabId === 'tab-dashboard') {
				// Setup tháng, ngày lọc... (Cần chạy ngay để user thấy form lọc)
				if(typeof initDashboard === 'function') initDashboard();
		}
		if (tabId === 'tab-form') {
			setupMainFormUI(APP_DATA.lists);
			setupTableKeyboardNav();
			setTimeout(() => {
			setupContextMenu('detail-tbody');
			}, 1000); 

		}
		
		if (tabId === 'tab-list') {
				// Vào tab list thì check xem có data chưa để vẽ bảng
				const tbody = document.getElementById('grid-body');
				if (APP_DATA && APP_DATA.bookings && tbody && tbody.innerHTML.trim() === "") {
					renderTableByKey('bookings'); 
				}
		} else if (tabId === 'tab-sub-form') {
			// Khi tab log vừa được render xong -> Lấy dữ liệu từ LS đắp vào
			const list = APP_DATA.lists.source;
			if (list) fillSelect('Ext_CustSource', list);
		} else if (tabId === 'tab-log') {
			// Khi tab log vừa được render xong -> Lấy dữ liệu từ LS đắp vào
			if (typeof restoreLogsFromStorage === 'function') {
					restoreLogsFromStorage();
			}
		}

	},

	/**
	 * Hàm thiết lập hành động cho nút Save của Modal
	 * @param {Function} newActionFunc - Hàm logic bạn muốn chạy khi bấm Save
	 */
	bindBtnEvent: function(newActionFunc, btnId, btnText = null) {
		let btn = getE(btnId);
		
		if (!btn) {
			log(`Không tìm thấy nút nào của ${btnId} trong DOM!`, 'error');
			return;
		}

		// Gỡ bỏ event handler cũ nếu có
		const newBtn = btn.cloneNode(true);
		btn.parentNode.replaceChild(newBtn, btn);
		btn = newBtn;
		if (btnText) btn.textContent = btnText;

		// 2. SETUP: Gán hàm mới
		// Lưu ý: Ta nên bọc hàm logic trong 1 khối try-catch để an toàn
		this.currentSaveHandler = async function(e) {
			// Prevent Default nếu nút nằm trong form
			e.preventDefault(); 
			
			// Disable nút để tránh bấm liên tục (Double Submit)
			btn.disabled = true;
			const currentBtnHTML = btn.innerHTML;
			btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

			try {
				// Chạy hàm logic được truyền vào
				await newActionFunc(e); 
			} catch (err) {
				logError("Lỗi hàm bindBtnEvent: ", err);
				logA("Có lỗi xảy ra: " + err.message);
			} finally {
				// Mở lại nút sau khi xong (hoặc tùy logic đóng modal của bạn)
				btn.disabled = false;
				btn.innerHTML = currentBtnHTML;
			}
		};

		btn.addEventListener('click', this.currentSaveHandler);
		log("Đã gán sự kiện mới cho Btn Save Modal.");
	},
	resetForm: function(e) {
		const form = e.target.closest('form') || $('form', getE('dynamic-modal-body'));
		if (form) {
			form.reset();
		}
	},
	renderModal: function(tmplId, title, btnSaveHandler = null, btnResetHandler = null, modalId='dynamic-modal') {  
		try {

			this.renderTemplate('body', 'tmpl-dynamic-modal', true, '.app-container');

			const modalEl = getE(modalId);
			const modalTitleEl = $('.modal-title', modalEl);
			const modalBody = $('#dynamic-modal-body', modalEl) || getE('dynamic-modal-body');
			if (modalBody) {
				this.renderTemplate('dynamic-modal-body', tmplId, true);
			}
			if (modalTitleEl && title) {
				modalTitleEl.innerText = title;
			}
			if (btnSaveHandler) {
				this.bindBtnEvent(btnSaveHandler, 'btn-save-modal');
			}
			if (typeof btnResetHandler === 'function') {
					this.bindBtnEvent(btnResetHandler, 'btn-reset-modal');
			} else this.bindBtnEvent(this.resetForm, 'btn-reset-modal');
			const modal = new bootstrap.Modal(modalEl);
			// modal.handleUpdate();
			// modal.show();
			return modal;
		} catch (e) {
			logError("Lỗi trong renderModal: ", e);
		}
	}
};

var isSetupTabForm = false;
const setupMainFormUI = function(lists) {
	if(isSetupTabForm) {log('Đã SetupTabForm - Pass!'); return;}
	log('setupMainFormUI running');

	if (!lists) return;

	// 1. Helper điền Select
	const fillSelect = (elmId, dataArray) => {
	const el = getE(elmId);
	if (!el) return;
	el.innerHTML = '<option value="">--Chọn--</option>';
	if (Array.isArray(dataArray)) {
		dataArray.forEach(item => {
		let opt = document.createElement('option');
		opt.value = item;
		opt.text = item;
		el.appendChild(opt);
		});
	}
	};

	// 2. Helper điền DataList
	const fillDataList = (elmId, dataArray) => {
	const el = getE(elmId);
	if (!el) return;
	var uniqueData = [...new Set(dataArray)];
	el.innerHTML = uniqueData.map(item => `<option value="${item}">`).join('');
	};

	// --- THỰC THI ---
	fillSelect('BK_Staff', lists.staff);
	fillSelect('Cust_Source', lists.source);
	fillSelect('BK_PayType', lists.payment);
	
	fillDataList('list-tours', lists.tours);

	// --- SỬA LỖI READING 1 TẠI ĐÂY ---
	const customers = window.APP_DATA.customers_obj || window.APP_DATA.customers || [];
	if (customers.length > 0) {
		let phones = [];
		let names = [];

		// Kiểm tra format: object hay array
		if (typeof customers[0] === 'object' && !Array.isArray(customers[0])) {
			// ✅ Object format (new)
			phones = customers.map(r => r.phone).filter(Boolean);
			names = customers.map(r => r.full_name).filter(Boolean);
		} else {
		// Array format (legacy)
			const validCustomers = customers.filter(r => r && r.length > 2);
			phones = validCustomers.map(r => r[1]).filter(Boolean);
			names = validCustomers.map(r => r[2]).filter(Boolean);
		}

		fillDataList('list-cust-phones', phones.reverse().slice(0, 500));
		fillDataList('list-cust-names', names.reverse().slice(0, 500));
	}

	// --- RENDER HEADER CHO TABLE TBL-BOOKING-FORM ---
	const tblBookingForm = document.getElementById('tbl-booking-form');
	if (tblBookingForm) {
		const thead = tblBookingForm.querySelector('thead');
		if (thead) {
		// Xác định collection dựa trên role
		const collectionName = (CURRENT_USER && (CURRENT_USER.role === 'op' || CURRENT_USER.role === 'acc')) 
			? 'operator_entries' 
			: 'booking_details';

		const headerHtml = renderHeaderHtml(collectionName);
		if (headerHtml) {
			thead.innerHTML = headerHtml;
			log(`[Form] Rendered header cho [${collectionName}]`);
			}
		} else {
			log(`[Form] Không lấy được header cho [${collectionName}]`, 'warning');
		} 
	}

	isSetupTabForm = true;
	};

// =========================================================================
// 3. TAB & CONTEXT HELPERS
// =========================================================================



function activateTab(targetTabId) {
	selectTab(targetTabId);

	// 4. Xử lý các nút chức năng (Lưu, Xóa...)
	toggleContextUI(targetTabId);
}

/**
 * Hàm bật tắt các thành phần UI dựa trên data-ontabs
 * @param {string|number} targetTabIdOrIndex - ID của tab (vd: 'tab-form') hoặc Index (vd: 2)
 */
function toggleContextUI(targetTabIdOrIndex) {
try {
	// 1. Xác định Active Index chuẩn hóa
	const activeTabIndex =
	typeof targetTabIdOrIndex === "number"
		? targetTabIdOrIndex
		: TAB_INDEX_BY_ID[String(targetTabIdOrIndex)];

	// Log để debug xem đang vào tab nào
	// console.log(`[UI] Switching to tab: ${targetTabIdOrIndex} (Index: ${activeTabIndex})`);

	// 2. Quét tất cả các element có thuộc tính data-ontabs
	const els = document.querySelectorAll('[data-ontabs]');
	
	if (!activeTabIndex) {
	// Trường hợp không tìm thấy index hợp lệ, ẩn tất cả để an toàn
	els.forEach(el => el.classList.add('d-none'));
	return;
	}

	// 3. Xử lý Ẩn/Hiện
	els.forEach(el => {
	// Lấy giá trị data-ontabs, ví dụ: "2 3" -> mảng [2, 3]
	const allowedTabs = (el.dataset.ontabs || "")
		.trim()
		.split(/\s+/)       // Tách bằng khoảng trắng
		.filter(Boolean)    // Loại bỏ giá trị rỗng
		.map(Number);       // Chuyển thành số

	// Kiểm tra xem Index hiện tại có nằm trong danh sách cho phép không
	const shouldShow = allowedTabs.includes(activeTabIndex);
	
	// Toggle class d-none (Nếu shouldShow = true -> bỏ d-none. Nếu false -> thêm d-none)
	el.classList.toggle('d-none', !shouldShow);      
	});

	// 4. Xử lý Logic riêng cho Tab Form (Index = 2)
	// SỬA LỖI Ở ĐÂY: Dùng activeTabIndex để so sánh, không dùng tabId
	if (activeTabIndex === TAB_INDEX_BY_ID['tab-form']) {
		// Chỉ set default nếu đang ở chế độ tạo mới (Start rỗng)
		CURRENT_TABLE_KEY = 'bookings';
		if (typeof setMany === 'function' && typeof getVal === 'function') {
			if (getVal('BK_Start') === '') {
				setMany(['BK_Date', 'BK_Start', 'BK_End'], new Date());
			}
		}
	} else if (typeof window.prepareCreateCustomer === 'function' && activeTabIndex === TAB_INDEX_BY_ID['tab-sub-form']) {
		window.prepareCreateCustomer();
	} else if (activeTabIndex === TAB_INDEX_BY_ID['tab-list']) {
	// Khi tab log vừa được render xong -> Lấy dữ liệu từ LS đắp vào
	// getE('btn-data-filter').click();
	} else if (activeTabIndex === TAB_INDEX_BY_ID['tab-dashboard']) {
	// Khi tab log vừa được render xong -> Lấy dữ liệu từ LS đắp vào
	getE('btn-dash-update').click();
}

} catch (e) {
	logError("Lỗi trong toggleContextUI: ", e);
}
}

function selectTab(targetTabId) {
	UI_RENDERER.lazyLoad(targetTabId);

	// 2. Tìm nút bấm trên Header
	const navBtn = document.querySelector(`button[data-bs-target="#${targetTabId}"]`) 
				|| document.querySelector(`.nav-link[data-bs-target="#${targetTabId}"]`);
	
	// 3. Kích hoạt chuyển tab bằng Bootstrap API
	if (navBtn) {
		// Dùng getOrCreateInstance để tránh lỗi Illegal invocation
		const tabTrigger = bootstrap.Tab.getOrCreateInstance(navBtn);
		tabTrigger.show();
	}
	const tabEl = getE(targetTabId);
	setClass($('.modal-footer', getE('dynamic-modal')), "d-none", false);
	if (targetTabId === 'tab-theme-content') {
		setClass($(targetTabId), 'd-none', false);
		setClass($('#tab-shortcut-content'), 'd-none', true);
		setClass($('#tab-users-content'), 'd-none', true);
		setClass($('#tab-users-content'), 'admin-only', false); 
		UI_RENDERER.bindBtnEvent(saveSettings, 'btn-save-modal', 'Áp Dụng Theme');
		UI_RENDERER.bindBtnEvent(resetSettings, 'btn-reset-modal'); 
	} else if (targetTabId === 'tab-shortcut-content') {
		setClass($(targetTabId), 'd-none', false);
		setClass($('#tab-theme-content'), 'd-none', true);
		setClass($('#tab-users-content'), 'd-none', true);  
		setClass($('#tab-users-content'), 'admin-only', false);            
		UI_RENDERER.bindBtnEvent(saveShortcutsConfig, 'btn-save-modal', 'Lưu Phím Tắt'); 
	} else if (targetTabId === 'tab-users-content') {
		setClass($(targetTabId), 'd-none', false);
		setClass($('#tab-theme-content'), 'd-none', true);
		setClass($('#tab-shortcut-content'), 'd-none', true);              
		renderUsersConfig();
		UI_RENDERER.bindBtnEvent(AUTH_MANAGER.saveUser, 'btn-save-modal', 'Lưu User');
		UI_RENDERER.bindBtnEvent(() => {
			document.getElementById('users-form').reset();
			document.getElementById('form-created-at').valueAsDate = new Date();                    
		}, 'btn-reset-modal', 'Nhập Lại');    
	}
	// Thêm delay nhỏ để đảm bảo DOM ready
	setTimeout(() => {
		const input = tabEl?.querySelector('input:not([disabled])');
		if (input && input.offsetParent !== null) { // Kiểm tra input visible
			input.focus();
		}
	}, 100);
}

// =========================================================================
// 4. DATA TABLE RENDERING LOGIC (Object-based + Array-based support)

/**
 * NEW: Generate grid columns from object properties
 * Supports both array (legacy) and object (new) formats
 */
function generateGridColsFromObject(collectionName) {
	const headerObj = createHeaderFromFields(collectionName);
	if (!headerObj || typeof headerObj !== 'object') {
		GRID_COLS = []; return;
	}

	const FORMAT_KEYWORDS = {
		date:  ['ngày', 'hạn', 'date', 'dob', 'checkin', 'checkout', 'deadline', 'start', 'end'],
		money: ['tiền', 'giá', 'cọc', 'thu', 'chi', 'total', 'amount', 'price', 'deposit', 'revenue', 'cost', 'profit', 'balance']
	};

	const matches = (text, type) => {
		const str = String(text).toLowerCase();
		return FORMAT_KEYWORDS[type].some(key => str.includes(key));
	};

	const translate = (t) => (typeof translateHeaderName === 'function' ? translateHeaderName(t) : t);

	// 3. Xử lý chính: Convert object keys to columns
	GRID_COLS = Object.entries(headerObj).map(([fieldName, fieldValue], index) => {
		const vnTitle = translate(fieldName);
		let format = 'text'; 
		
		if (matches(vnTitle, 'date') || matches(fieldName, 'date')) {
			format = 'date';
		} 
		else if (matches(vnTitle, 'money') || matches(fieldName, 'money')) {
			format = 'money';
		}
		let res  = { 
			i: fieldName,      // ✅ NEW: Use field name instead of index
			key: fieldName,    // Field name for object access
			t: vnTitle,        // Display title
			fmt: format, 
			align: format === 'money' ? "text-end" : "text-center"
		};

		if (TABLE_HIDDEN_FIELDS[collectionName] && TABLE_HIDDEN_FIELDS[collectionName].includes(fieldName)) {
			res.hidden = true;
		}
		return res;
	});

	console.log("Auto-generated Grid Cols (Object):", GRID_COLS);
}

function renderHeaderHtml(collectionName) {
	generateGridColsFromObject(collectionName);
	// Render header row
	if (GRID_COLS && GRID_COLS.length > 0) {
		let headerHTML = '<th style="width:50px" class="text-center">#</th>';
		headerHTML += GRID_COLS.map(col => 
			`<th class="${col.hidden ? 'd-none ' : 'text-center'}" data-field="${col.key}" style="white-space: nowrap;">${col.t}</th>`
		).join('');
		return headerHTML;
	} else {
		return '<th>Không có cấu hình cột</th>';
	}
}

function generateGridCols(headerRow) {
	if (!headerRow || !Array.isArray(headerRow)) {
		GRID_COLS = []; return;
	}

	// 1. Cấu hình từ khóa nhận diện định dạng (Config Pattern)
	const FORMAT_KEYWORDS = {
		date:  ['ngày', 'hạn', 'date', 'dob', 'checkin', 'checkout', 'deadline', 'start', 'end'],
		money: ['tiền', 'giá', 'cọc', 'thu', 'chi', 'total', 'amount', 'price', 'deposit', 'revenue', 'cost', 'profit', 'balance']
	};

	const matches = (text, type) => {
		const str = String(text).toLowerCase();
		return FORMAT_KEYWORDS[type].some(key => str.includes(key));
	};

	const translate = (t) => (typeof translateHeaderName === 'function' ? translateHeaderName(t) : t);

	// 3. Xử lý chính
	GRID_COLS = headerRow.map((rawTitle, index) => {
		const vnTitle = translate(rawTitle);
		let format = 'text'; 
		
		if (matches(vnTitle, 'date') || matches(rawTitle, 'date')) {
			format = 'date';
		} 
		else if (matches(vnTitle, 'money') || matches(rawTitle, 'money')) {
			format = 'money';
		}
		
		return { 
			i: index, 
			key: rawTitle,
			t: vnTitle,
			fmt: format, 
			align: format === 'money' ? "text-end" : "text-center"
		};
	});

	console.log("Auto-generated Grid Cols:", GRID_COLS);
}

function renderGrid(dataList, table) {
	let nohide = false;
	if(!table) {table = document.getElementById('tbl-container-tab2');}
	if(!table) return;
	if(table.id === 'tbl-container-tab2') nohide = true;
	const tbody = table.querySelector('tbody');
	const header = table.querySelector('thead');
	if (!tbody || !header) return;

	tbody.innerHTML = '';
	header.innerHTML = '';

	// A. HEADER
	if (!GRID_COLS || GRID_COLS.length === 0) {
		header.innerHTML = '<th>Không có cấu hình cột</th>';
	} else {
		let headerHTML = '<th style="width:50px" class="text-center">#</th>';
		headerHTML += GRID_COLS.map(c => 
			`<th class="${nohide ? "" : (c.hidden ? "d-none" : "text-center")}" data-field="${c.key}" style="white-space: nowrap;">${c.t}</th>`
		).join('');
		header.innerHTML = headerHTML;
	}

	// B. BODY
	if (!dataList || dataList.length === 0) {
		const colCount = (GRID_COLS ? GRID_COLS.length : 0) + 1;
		tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center p-4 text-muted fst-italic">Không có dữ liệu hiển thị</td></tr>`;
		return;
	}

	const docFrag = document.createDocumentFragment();
	dataList.forEach((row, idx) => {
		const tr = document.createElement('tr');
		tr.className = "align-middle";
		
		// Cột STT (Tính theo trang nếu có phân trang)
		let stt = idx + 1;
		if(typeof PG_STATE !== 'undefined') stt = ((PG_STATE.currentPage - 1) * PG_STATE.limit) + idx + 1;

		let html = `<td class="text-center fw-bold text-secondary">${stt}</td>`;
		
		html += GRID_COLS.map(col => {
			// ✅ NEW: Support both array (col.i is number) and object (col.i is string) access
			let val;
			if (typeof col.i === 'string') {
				// Object-based access (new)
				val = row[col.i];
			} else {
				// Array-based access (legacy)
				val = row[col.i];
			}
			
			if (val === undefined || val === null) val = "";

			if (col.fmt === 'money' && typeof formatMoney === 'function') val = formatMoney(val);
			if (col.fmt === 'date' && typeof formatDateVN === 'function') val = formatDateVN(val);
			
			const hiddenClass = nohide ? "" : (col.hidden ? " d-none" : "");
			return `<td class="${col.align}${hiddenClass}" style="white-space: nowrap;">${val}</td>`;
		}).join('');
		
		tr.innerHTML = html;
		tr.style.cursor = "pointer";
		
		// ✅ NEW: Get row ID - support both array and object
		let rowId;
		if (typeof row === 'object' && !Array.isArray(row)) {
			// Object format
			rowId = row.id || row.booking_id;
		} else {
			// Array format (legacy)
			rowId = row[0];
			if (CURRENT_TABLE_KEY === "booking_details" || CURRENT_TABLE_KEY === "operator_entries") rowId = row[1]; // Details lấy cột 1 (BK_ID)
		}
		
		tr.onclick = (e) => {
			const isCtrl = e.ctrlKey || e.metaKey;
			if(!isCtrl) return; // Phải có Ctrl mới mở chi tiết
			if(typeof onGridRowClick === 'function') onGridRowClick(rowId);
		};
		
		tr.onmouseover = function() { this.classList.add('table-active'); };
		tr.onmouseout = function() { this.classList.remove('table-active'); };

		docFrag.appendChild(tr);
	});

	tbody.appendChild(docFrag);
}

// =========================================================================
// 5. PAGINATION LOGIC
// =========================================================================

function initPagination(sourceData, table) {
	if (!Array.isArray(sourceData)) sourceData = [];
	PG_STATE.data = sourceData;
	PG_STATE.currentPage = 1;
	PG_STATE.totalPages = Math.ceil(sourceData.length / PG_STATE.limit);
	renderCurrentPage(table);
}

function renderCurrentPage(table) {
if (!table) table = document.getElementById('tbl-container-tab2');
const total = PG_STATE.data.length;
const pagination = table.querySelector('#pagination');
const gridCount = table.querySelector('#grid-count');

if (total === 0) {
	renderGrid([], table);
	pagination.innerHTML = '';
	gridCount.innerText = 'Không có dữ liệu';
	return;
}

const startIndex = (PG_STATE.currentPage - 1) * PG_STATE.limit;
const endIndex = Math.min(startIndex + PG_STATE.limit, total);
const pageData = PG_STATE.data.slice(startIndex, endIndex);

renderGrid(pageData, table);
renderPaginationControls(pagination);
gridCount.innerText = `Hiển thị ${startIndex + 1} - ${endIndex} trên tổng ${total} dòng`;
}

function changePage(page) {
	if (page === 'prev') {
		if (PG_STATE.currentPage > 1) PG_STATE.currentPage--;
	} else if (page === 'next') {
		if (PG_STATE.currentPage < PG_STATE.totalPages) PG_STATE.currentPage++;
	} else {
		PG_STATE.currentPage = Number(page);
	}
	renderCurrentPage(); // Vẽ lại
}


function renderPaginationControls(container) {
	const { currentPage, totalPages } = PG_STATE;
	let html = '<ul class="pagination pagination-sm m-0">';

	// Nút Prev
	html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage('prev')">&laquo;</a></li>`;

	// Logic rút gọn số trang
	let startPage = Math.max(1, currentPage - 2);
	let endPage = Math.min(totalPages, currentPage + 2);

	if (startPage > 1) {
		html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="changePage(1)">1</a></li>`;
		if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
	}

	for (let i = startPage; i <= endPage; i++) {
		html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage(${i})">${i}</a></li>`;
	}

	if (endPage < totalPages) {
		if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
		html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
	}

	// Nút Next
	html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="javascript:void(0)" onclick="changePage('next')">&raquo;</a></li>`;
	html += '</ul>';

	container.innerHTML = html;
}

// =========================================================================
// 6. RENDER DATA (Main Entry for List Tab)
// =========================================================================

function renderTableByKey(key, tblId) {
	CURRENT_TABLE_KEY = key; 
	let table = tblId ? document.getElementById(tblId) : document.getElementById('tbl-container-tab2');
	
	if(!table) return;
	let tblEl = table.querySelector('table');
	tblEl.dataset.collection = key;

	const tbody = table.querySelector('tbody');
	if(tbody) tbody.innerHTML = '<tr><td colspan="100%" class="text-center p-3">Đang tải...</td></tr>';

	try {
		// ✅ FIX: Improved data selection logic - try object first, then array
		let dataToRender = null;
		let dataKey = key;
		let useObjectFormat = false;
		
		// 1. Check for object-based data (new)
		if (APP_DATA[key + '_obj'] && Array.isArray(APP_DATA[key + '_obj']) && APP_DATA[key + '_obj'].length > 0) {
			dataToRender = [...APP_DATA[key + '_obj']];
			dataKey = key + '_obj';
			useObjectFormat = true;
			log(`[GRID] Using object-based data for [${key}]`);
		}
		// 2. Fallback to array-based data (legacy)
		else if (APP_DATA[key] && Array.isArray(APP_DATA[key]) && APP_DATA[key].length > 0) {
			dataToRender = [...APP_DATA[key]];
			// For array data with header, extract data rows
			if (dataToRender.length > 0 && Array.isArray(dataToRender[0]) && dataToRender[0][0] && typeof dataToRender[0][0] === 'string') {
				const headerRow = dataToRender.shift();
				generateGridCols(headerRow);
			} else {
				// Data is already without header or in object format
				generateGridCols(dataToRender[0]);
			}
		}
		
		if (dataToRender && dataToRender.length > 0) {
			// For object-based data
			if (useObjectFormat) {
				generateGridColsFromObject(key);
				log(`[GRID] Hiển thị [${key}] (object): ${dataToRender.length} dòng.`);
			}
			
			// Render grid with data
			if (typeof initPagination === 'function') {
				initPagination(dataToRender, table);
			} else {
				renderGrid(dataToRender, table);
			}
			initFilterUI();

		} else {
			log(`[GRID] Không có dữ liệu cho [${key}]`, 'warning');
			if (tbody) {
				const colCount = (GRID_COLS ? GRID_COLS.length : 0) + 1;
				tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center p-4 text-muted">Không có dữ liệu</td></tr>`;
			}
		}
	} catch(e) {
		logError(`Lỗi hiển thị bảng [${key}]: ${e.message}`);
	}
}

// =========================================================================
// 7. FILTERS & OPTIONS UI
// =========================================================================

function initFilterUI() {
	const select = document.getElementById('filter-col');
	if (!select) return;

	select.innerHTML = '';

	if (GRID_COLS && GRID_COLS.length > 0) {
		GRID_COLS.forEach(col => {
			const opt = document.createElement('option');
			opt.value = col.i; 
			opt.textContent = col.t;
			select.appendChild(opt);
		});
		if(GRID_COLS.length > 1) select.selectedIndex = 0; 
	} else {
		select.innerHTML = '<option value="-1">...</option>';
	}
	onEvent('filter-col', 'change', updateFilterOptions);
	updateFilterOptions();
}

function updateFilterOptions() {
	const rawCol = String(getE('filter-col')?.value ?? '').trim();
	const datalist = getE('filter-datalist');
	if (!datalist || rawCol === '-1' || rawCol === '') return;

	datalist.innerHTML = '';

	// Helpers
	const isNumericString = (s) => typeof s === 'string' && /^\d+$/.test(s.trim());
	const stripHeaderIfAny = (arr) => {
		if (!Array.isArray(arr)) return [];
		if (arr.length === 0) return [];
		const first = arr[0];
		if (Array.isArray(first) && typeof first[0] === 'string' && (first[0].toLowerCase() === 'id' || first[0].toLowerCase() === 'số thứ tự')) {
			return arr.slice(1);
		}
		return arr;
	};
	const resolveColConfig = (raw) => {
		if (!GRID_COLS || !Array.isArray(GRID_COLS)) return null;
		const rawStr = String(raw ?? '').trim();
		return GRID_COLS.find(c => String(c?.i) === rawStr || String(c?.key) === rawStr) || null;
	};

	// Lấy data nguồn từ APP_DATA thay vì PG_STATE để filter trên toàn bộ
	let sourceData = [];
	
	// ✅ NEW: Support both array and object formats
	const objectKey = CURRENT_TABLE_KEY + '_obj';
	
	if (APP_DATA[objectKey] && Array.isArray(APP_DATA[objectKey])) {
		// Object-based format (new)
		sourceData = APP_DATA[objectKey];
	} else if (APP_DATA[CURRENT_TABLE_KEY] && Array.isArray(APP_DATA[CURRENT_TABLE_KEY])) {
		// Array-based format (legacy)
		sourceData = stripHeaderIfAny(APP_DATA[CURRENT_TABLE_KEY].slice());
	}

	if(sourceData.length === 0) return;

	const distinctValues = new Set();
	const colCfg = resolveColConfig(rawCol);
	const fieldName = colCfg?.key || colCfg?.i || rawCol;
	const arrayIdx = isNumericString(rawCol) ? Number(rawCol) : (typeof colCfg?.i === 'number' ? colCfg.i : -1);
	sourceData.forEach(row => {
		let val;
		
		// ✅ FIX: Handle both array and object row formats
		if (typeof row === 'object' && !Array.isArray(row)) {
			// Object format - use field name
			val = row[fieldName];
		} else {
			// Array format (legacy) - use index
			val = (arrayIdx >= 0) ? row[arrayIdx] : undefined;
		}
		
		if (val) distinctValues.add(String(val).trim());
	});

	const sortedValues = [...distinctValues].sort((a, b) => b.localeCompare(a));
	const limit = 500;
	setDataList('filter-datalist', sortedValues.slice(0, limit));
	setVal('filter-val', "");
}

function initBtnSelectDataList(data) {
	if (!data) data = APP_DATA;
	const selectElem = document.getElementById('btn-select-datalist');
	if (!selectElem) return;

	selectElem.innerHTML = '';
	let hasOption = false;

	for (const [key, label] of Object.entries(TABLE_DISPLAY_MAP)) { 
		if (data && data[key] && Array.isArray(data[key])) {
			// ✅ Role-based filtering
			// Skip booking_details if user is op or acc
			if ((CURRENT_USER?.role === 'op' || CURRENT_USER?.role === 'acc') && key === 'booking_details') {
				continue;
			}
			
			// Skip operator_entries if user role is not op/acc AND level < 5
			if (key === 'operator_entries' && 
				!(CURRENT_USER?.role === 'op' || CURRENT_USER?.role === 'acc' || CURRENT_USER?.role === 'admin') &&
				(CURRENT_USER?.level || 0) < 5) {
				continue;
			}
			
			const opt = document.createElement('option');
			opt.value = key; 
			opt.textContent = label;
			selectElem.appendChild(opt);
			hasOption = true;
		}
	}

	if (!hasOption) {
		selectElem.innerHTML = '<option>-- Trống --</option>';
		selectElem.disabled = true;
	} else {
		selectElem.disabled = false;
		if (data['bookings']) selectElem.value = 'bookings';
	}
}

// =========================================================================
// 8. DASHBOARD RENDERER (Logic vẽ biểu đồ)
// =========================================================================

function initDashboard() {
	const today = new Date();
	setVal('dash-filter-from', new Date(today.getFullYear(), today.getMonth(), 1));
	setVal('dash-filter-to', new Date(today.getFullYear(), today.getMonth() + 1, 0));
	
	setupMonthSelector(); // Cần hàm setupMonthSelector (giữ lại từ code cũ)
	
	// Gán sự kiện Update Dashboard
	const dashBtn = document.getElementById('btn-dash-update');
	if (dashBtn) dashBtn.onclick = () => runFnByRole('renderDashboard');
}

function renderDashboard() {
	if (!APP_DATA || !APP_DATA.bookings || !APP_DATA.booking_details) return;
	
	// Render các bảng con
	renderDashTable1();
	renderDashTable2();
	renderDashTable3();
	renderAggregates(); // Gom logic bảng 3,4 vào đây
}

function renderDashTable1() {
	// Logic vẽ Booking mới (7 ngày)
	log("renderDash1 done");
	const tbody = document.querySelector('#tbl-dash-new-bk tbody');
	if(!tbody) return;
	tbody.innerHTML = '';

	const bookings = APP_DATA.bookings.reverse();
	const limitDate = new Date(); limitDate.setDate(limitDate.getDate() - 14);
	let count = 0;

	bookings.forEach(row => {
		// Cột 1 là CreatedAt (COL_INDEX.M_CREATED)
		const dStr = row[COL_INDEX.M_CREATED] || row[COL_INDEX.M_START];
		const dCreated = new Date(dStr);
		const balClass = row[COL_INDEX.M_DEPOSIT] > 0 ? 'text-danger fw-bold' : 'text-success';
		if (dCreated >= limitDate) {
			count++;
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td class="text-center">${row[COL_INDEX.M_ID]}</td>
				<td class="fw-bold text-primary text-center">${row[COL_INDEX.M_CUST]}</td>
				<td class="text-center">${formatDateVN(row[COL_INDEX.M_START])}</td>
				<td class="text-center text-success">${formatMoney(row[COL_INDEX.M_TOTAL])}</td>
				<td class="text-center ${balClass}">${formatMoney(row[COL_INDEX.M_DEPOSIT])}</td>
				<td class="small text-center">${row[COL_INDEX.M_STATUS]}</td>
				<td class="small text-center">${row[COL_INDEX.M_STAFF]}</td>
			`;
			tr.style.cursor = 'pointer';
			tr.onclick = (e) => {
				const isCtrl = e.ctrlKey || e.metaKey;
				if(!isCtrl) return;
				handleDashClick(row[COL_INDEX.M_ID], false);
			} 
			tbody.appendChild(tr);
		}
	});
	setVal('badge-new-bk', count);
}

function renderDashTable2() {
	// Logic vẽ Missing Code
	const tbody = document.querySelector('#tbl-dash-missing tbody');
	if(!tbody) return;
	tbody.innerHTML = '';
	
	// Tạo map tên khách
	const bookingsMap = {};
	if (APP_DATA.bookings) APP_DATA.bookings.forEach(r => { if(r[0]) bookingsMap[r[0]] = r[COL_INDEX.M_CUST]; });

	const today = new Date(); today.setHours(0,0,0,0);
	const raw = APP_DATA.booking_details;
	
	const list = raw.filter(r => {
		const type = r[COL_INDEX.D_TYPE];
		const code = r[COL_INDEX.D_CODE];
		const dIn = new Date(r[COL_INDEX.D_IN]);
		return (!type || type.trim() === 'Phòng') && !code && dIn >= today;
	}).sort((a,b) => new Date(a[COL_INDEX.D_IN]) - new Date(b[COL_INDEX.D_IN]));

	list.forEach(r => {
		const custName = bookingsMap[r[COL_INDEX.D_BKID]] || '---';
		const tr = document.createElement('tr');
		tr.innerHTML = `
			<td>${r[COL_INDEX.D_SID]}</td>
			<td class="fw-bold text-primary text-truncate" style="max-width:120px" title="${custName}">${custName}</td>
			<td>${r[COL_INDEX.D_HOTEL]}</td>
			<td>${r[COL_INDEX.D_SERVICE]}</td>
			<td class="text-center">${formatDateVN(r[COL_INDEX.D_IN])}</td>
		`;
		tr.style.cursor = 'pointer';
		tr.onclick = (e) => {
			const isCtrl = e.ctrlKey || e.metaKey;
			if(!isCtrl) return;
			handleDashClick(r[COL_INDEX.D_SID], true);
		} 

		tbody.appendChild(tr);
	});
	setVal('badge-missing-code', list.length);
}

function renderDashTable3() {
	// Booking sắp đến
	const tbody = document.querySelector('#tbl-dash-arrival-bk tbody');
	if(!tbody) return;
	tbody.innerHTML = '';
	
	const bookings = APP_DATA.bookings.reverse();
	const today = new Date();
	const limit = new Date(); limit.setDate(limit.getDate() + 30);
	let count = 0;
	
	bookings.forEach(row => {
		const dStart = new Date(row[COL_INDEX.M_START]);
		const balClass = row[COL_INDEX.M_DEPOSIT] > 0 ? 'text-danger fw-bold' : 'text-success';
		if (dStart >= today && dStart <= limit) {
			count++;
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td class="text-center">${row[COL_INDEX.M_ID]}</td>
				<td class="fw-bold text-primary text-center">${row[COL_INDEX.M_CUST]}</td>
				<td class="text-center">${formatDateVN(row[COL_INDEX.M_START])}</td>
				<td class="text-center">${formatMoney(row[COL_INDEX.M_TOTAL])}</td>
				<td class="text-center">${formatMoney(row[COL_INDEX.M_DEPOSIT])}</td>
				<td class="text-center fw-bold ${balClass}">${formatMoney(row[COL_INDEX.M_BALANCE])}</td>
				<td class="small text-center">${row[COL_INDEX.M_STAFF]}</td>
			`;
			tr.style.cursor = 'pointer';
			tr.onclick = (e) => {
				const isCtrl = e.ctrlKey || e.metaKey;
				if(!isCtrl) return;
				handleDashClick(row[COL_INDEX.M_ID], false);
			} 
			tbody.appendChild(tr);
		}
	});
	
	setVal('badge-arrival-bk', count);
}

function renderAggregates() {
	// Logic Bảng Công nợ Staff
	const dFrom = new Date(getVal('dash-filter-from'));
	const dTo = new Date(getVal('dash-filter-to'));
	const aggStaff = {};
	
	const bookings = APP_DATA.bookings;
	bookings.forEach(row => {
		const dIn = new Date(row[COL_INDEX.M_START]);
		if (dIn >= dFrom && dIn <= dTo) {
			const total = Number(String(row[COL_INDEX.M_TOTAL]).replace(/[^0-9-]/g, '')) || 0;
			const paid = Number(String(row[COL_INDEX.M_DEPOSIT]).replace(/[^0-9-]/g, '')) || 0;
			const bal = total - paid;
			
			let staff = row[COL_INDEX.M_STAFF] || 'Chưa có NV';
			if (!aggStaff[staff]) aggStaff[staff] = { total: 0, paid: 0, bal: 0 };
			
			aggStaff[staff].total += total;
			aggStaff[staff].paid += paid;
			aggStaff[staff].bal += bal;
		}
	});

	renderAggTable('tbl-dash-staff', aggStaff, 'sum-staff-bal');
}

function renderAggTable(tblId, dataObj, sumId) {
	const tbody = document.querySelector(`#${tblId} tbody`);
	if(!tbody) return;
	tbody.innerHTML = '';
	
	let totalBal = 0;
	const keys = Object.keys(dataObj).sort((a,b) => dataObj[b].bal - dataObj[a].bal);

	keys.forEach(k => {
		const item = dataObj[k];
		const bal = Number(String(item.bal).replace(/[^0-9-]/g, '')) || 0;
		totalBal += bal;
		const tr = document.createElement('tr');
		const balClass = bal > 0 ? 'text-danger fw-bold' : 'text-success';
		tr.innerHTML = `
			<td>${k}</td>
			<td class="text-end text-muted">${formatMoney(item.total)}</td>
			<td class="text-end text-muted">${formatMoney(item.paid)}</td>
			<td class="text-end ${balClass}">${formatMoney(item.bal)}</td>
		`;
		// Gán sự kiện click lọc theo nhân viên (Batch Edit)
		tr.style.cursor = 'pointer';
		tr.onclick = (e) => {
			const isCtrl = e.ctrlKey || e.metaKey;
			if(!isCtrl) return;
			if(typeof handleAggClick === 'function') handleAggClick(k, 'staff');
		};
		tbody.appendChild(tr);
	});
	if(document.getElementById(sumId)) setVal(sumId, formatMoney(totalBal));
}

// =========================================================================
// 9. HELPER UI (Month Selector)
// =========================================================================
function setupMonthSelector(id = 'dash-month-select') {
	const sel = document.getElementById(id);
	if(!sel) return;
	let html = '<option value="-1">-- Tùy chỉnh --</option>';
	for(let i=1; i<=12; i++) html += `<option value="${i-1}">Tháng ${i}</option>`;
	sel.innerHTML = html;
	sel.value = new Date().getMonth();

	sel.addEventListener('change', function() {
		if(this.value == -1) return;
		const y = new Date().getFullYear();
		const m = parseInt(this.value);
		setVal('dash-filter-from', new Date(y, m, 1));
		setVal('dash-filter-to', new Date(y, m+1, 0));
		runFnByRole('renderDashboard');
	});
}

/**
 * 2. Hàm Render chính (Điều phối)
 */
window.renderDashboard_Op = function() {
	if (!APP_DATA || !APP_DATA.bookings || !APP_DATA.operator_entries) return;

	// Chuẩn bị dữ liệu ngày
	const dFrom = new Date(getVal('dash-filter-from'));
	const dTo = new Date(getVal('dash-filter-to'));

	// --- BẢNG 1: BOOKING MỚI (7 NGÀY QUA) ---
	renderDashTable1_Op();

	// --- BẢNG 2: MISSING SUPPLIER ---
	renderDashTable2_Op();

	// --- BẢNG 3 & 4: CÔNG NỢ (Lọc theo dFrom - dTo) ---
	// Gom nhóm dữ liệu trước để tối ưu
	const aggSupplier = {};
	const aggType = {};
	let totalSupplierBal = 0;
	let totalTypeBal = 0;

	const operatorEntries = APP_DATA.operator_entries_obj; // Bỏ header
	
	operatorEntries.forEach(row => {
		const dIn = row.check_in ? new Date(row.check_in) : row.start_date ? new Date(row.start_date) : null;
		
		// Điều kiện lọc ngày (Dựa theo Check-in)
		if (dIn && dIn >= dFrom && dIn <= dTo) {
			
			// Tính toán tiền
			const cost = row.total_cost ? getNum(row.total_cost) : 0;
			const paid = row.paid_amount ? getNum(row.paid_amount) : 0;
			
			const bal = getNum(cost) - getNum(paid);
			const sid = row.id;
			// 1. Group by Supplier
			let supplier = row.supplier;
			if (!supplier) supplier = "(Chưa có NCC)";
			
			if (!aggSupplier[supplier]) aggSupplier[supplier] = { cost: 0, paid: 0, bal: 0, list: [] };
			aggSupplier[supplier].cost += cost;
			aggSupplier[supplier].paid += paid;
			aggSupplier[supplier].bal += bal;
			// Lưu lại SID dòng đầu tiên để click nhảy tới (hoặc logic khác tùy bạn)
			aggSupplier[supplier].list.push(sid); 

			// 2. Group by Type
			const type = row.service_type || "Khác";
			if (!aggType[type]) aggType[type] = { cost: 0, paid: 0, bal: 0, list: [] };
			aggType[type].cost += cost;
			aggType[type].paid += paid;
			aggType[type].bal += bal;
			aggType[type].list.push(sid);
		}
	});
	renderAggTable_Op('tbl-dash-supplier', aggSupplier, 'sum-supplier-bal');
	renderAggTable_Op('tbl-dash-type', aggType, 'sum-type-bal');

}

/**
 * Render Bảng 1: Booking Mới
 */
function renderDashTable1_Op() {
	const tbody = document.querySelector('#tbl-dash-new-bk tbody');
	if(!tbody) {log("No tbody found for new bookings table"); return;}
	tbody.innerHTML = '';
	
	// Lấy giá trị lọc ngày từ form
	const dFromInput = getVal('dash-filter-from');
	const dToInput = getVal('dash-filter-to');
	const dFrom = dFromInput ? new Date(dFromInput) : null;
	const dTo = dToInput ? new Date(dToInput) : null;
	
	const bookings = APP_DATA.bookings_obj;
	
	let count = 0;
	let totalDeposit = 0;
	
	bookings.forEach(row => {
		// Kiểm tra điều kiện lọc theo ngày
		let passDateFilter = true;
		
		if (row.start_date) {
			const startDate = new Date(row.start_date);
			
			// Lọc nếu dFrom có giá trị: start_date >= dFrom
			if (dFrom && startDate < dFrom) {
				passDateFilter = false;
			}
			
			// Lọc nếu dTo có giá trị: start_date <= dTo
			if (dTo && startDate > dTo) {
				passDateFilter = false;
			}
		}
		
		// Chỉ hiển thị nếu thỏa điều kiện ngày VÀ có deposit
		if (passDateFilter && row.deposit_amount > 0 && row.deposit_amount < row.total_amount) {
			count++;
			totalDeposit += getNum(row.deposit_amount);
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td class="fw-bold text-primary">${row.id}</td>
				<td>${row.customer_name}</td>
				<td class="text-center">${formatDateVN(row.start_date)}</td>
				<td class="small">${row.status}</td>
				<td class="text-end">${formatMoney(row.total_amount)}</td>
				<td class="text-end">${formatMoney(row.deposit_amount)}</td>
				<td class="text-end">${formatMoney(row.total_amount - row.deposit_amount)}</td>
			`;
			tr.style.cursor = 'pointer';
			tr.onclick = (e) => {
				const isCtrl = e.ctrlKey || e.metaKey;
				if(!isCtrl) return;
				handleDashClick(row.id, false);
			};
			tbody.appendChild(tr);
		}
	});
	
	setVal('badge-new-bk', `Tổng: ${formatMoney(totalDeposit)} | Số BK: ${count}`);
}

/**
 * Render Bảng 2: Missing Supplier
 */
function renderDashTable2_Op() {
	const tbody = document.querySelector('#tbl-dash-missing tbody');
	if(!tbody) {log("No tbody found for missing supplier table"); return;}
	tbody.innerHTML = '';
	
	let details = APP_DATA.operator_entries_obj.filter(r => !r.supplier || String(r.supplier).trim() === '').sort((a, b) => new Date(b.check_in) - new Date(a.check_in));

	let count = 0;
	let total = 0;

	details.forEach(row => {
		// Điều kiện: Supplier rỗng hoặc null
		count++;
		total += getNum(row.total_cost);
		const tr = document.createElement('tr');
		tr.innerHTML = `
			<td>${row.id}</td>
			<td>${row.customer_name}</td>
			<td>${row.service_type}</td>
			<td>${row.service_name}</td>
			<td class="text-center">${formatDateVN(row.check_in)}</td>
			<td>${row.adults}</td>
			<td>${row.total_cost ? formatMoney(row.total_cost) : formatMoney(row.total_sales)}</td>
		`;
		tr.style.cursor = 'pointer';
		// True nghĩa là click vào Service ID -> Cần tìm Booking ID
		tr.onclick = (e) => {
			const isCtrl = e.ctrlKey || e.metaKey;
			if(!isCtrl) return;
			handleDashClick(row.id, true);
		};
		tbody.appendChild(tr);
		
	});
	setVal('badge-missing-supplier', `Tổng Phải Trả: ${formatMoney(total)} | Số Lượt: ${count}`);
}

/**
 * Hàm chung render bảng tổng hợp (Bảng 3 & 4)
 */
function renderAggTable_Op(tableId, dataObj, sumId) {
	const tbody = document.querySelector(`#${tableId} tbody`);
	if(!tbody) {log(`No tbody found for table ${tableId}`); return;}
	tbody.innerHTML = '';
	let totalBal = 0;

	// Chuyển object thành mảng để sort theo Balance giảm dần
	const sortedKeys = Object.keys(dataObj).sort((a,b) => dataObj[b].bal - dataObj[a].bal);

	sortedKeys.forEach(key => {
		const item = dataObj[key];
		totalBal += item.bal;

		const tr = document.createElement('tr');
		// Highlight nếu còn nợ nhiều
		const balClass = item.bal > 0 ? 'text-danger fw-bold' : 'text-success';
		
		tr.innerHTML = `
			<td>${key} <span class="text-muted small">(${item.list.length})</span></td>
			<td class="text-end text-muted">${formatMoney(item.cost)}</td>
			<td class="text-end text-muted">${formatMoney(item.paid)}</td>
			<td class="text-end ${balClass}">${formatMoney(item.bal)}</td>
		`;
		
		// Khi click vào dòng tổng hợp -> Gọi handleAggClick
		if(item.list.length > 0) {
			tr.style.cursor = 'pointer';
			
			// Xác định loại lọc dựa trên ID bảng
			const filterType = tableId === 'tbl-dash-supplier' ? 'supplier' : 'type';
			
			// Gán sự kiện
			tr.onclick = (e) => {
				const isCtrl = e.ctrlKey || e.metaKey;
				if(!isCtrl) return;
				if(typeof handleAggClick === 'function') {
					handleAggClick(key, filterType);
				}
			};
		}

		tbody.appendChild(tr);
	});

	if(getE(sumId)) setVal(sumId, formatMoney(totalBal));
}

