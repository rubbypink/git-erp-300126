import { createFormBySchema, loadFormDataSchema } from '/src/js/modules/db/DBSchema.js';
// import ATable from './ATable.js';
const _viCollator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
const _numRegex = /[^0-9.-]+/g;
var _htmlCache = {};
const UI_RENDERER = {
    renderedTemplates: {},
    currentSaveHandler: null,
    COMPONENT_PATH: '/src/components/',
    htmlCache: {},
    table: null,
    // ✅ Cache để tránh fetch lặp lại

    // Render Dashboard & Load Data
    init: async function () {
        await Promise.all([]);
        const user = A.getState('user');
        const role = user ? user.role : CURRENT_USER.role;
        L._('UI: User Role:', role);
        if (!['acc', 'acc_thenice', 'ketoan'].includes(role)) {
            const [headerModule, footerModule] = await Promise.all([A.load('ErpHeaderMenu'), A.load('ErpFooterMenu'), this.renderTemplate('body', 'tpl_all.html', true, '.app-container')]);
            // if (headerModule && !headerModule.initialized) new headerModule();
            // const mainErpFooter = new footerModule('erp-main-footer');
            // mainErpFooter.init();
        } else {
            const [headerModule, chromeMenu] = await Promise.all([A.load('ErpHeaderMenu'), this.renderTemplate('body', 'tpl_all.html', true, '.app-container')]);
            // if (headerModule && !headerModule.initialized) new headerModule();
        }

        L._('[UI MODULE]✅ UI Initialization completed.');
        if (A.AdminConsole && CURRENT_USER.role === 'admin') {
            await A.AdminConsole.init();
        } else if (CURRENT_USER.role === 'admin') {
            await A.load('AdminConsole');
            await A.AdminConsole.init();
        }
    },

    renderMainLayout: async function (source = 'main_layout.html', containerSelector = '#main-app') {
        let finalSourcePath = source;

        // Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
        if (source?.endsWith('.html') && !source.includes('/')) {
            finalSourcePath = this.COMPONENT_PATH + source;
        }
        const container = document.querySelector(containerSelector);
        if (!container) {
            console.error('❌ Không tìm thấy container: ' + containerSelector);
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

            L._('✅ Đã render Main Layout thành công', 'success');
        } catch (error) {
            L._('🔥 Lỗi Render Layout: ' + error.message, 'danger');
        } finally {
            this.showLoading(false);
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
    renderTemplate: async function (targetId, source, force = false, positionRef = null, mode = 'replace') {
        // 1. CHUẨN HÓA SOURCE KEY (QUAN TRỌNG NHẤT)
        // Phải xác định unique key ngay từ đầu để check và save thống nhất
        let finalSourcePath = source;

        // Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
        if (source?.endsWith('.html') && !source.includes('/')) {
            finalSourcePath = this.COMPONENT_PATH + source;
        }

        // 2. Guard Clause: Kiểm tra dựa trên FINAL PATH
        if (this.renderedTemplates[finalSourcePath] && !force && mode === 'replace') {
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
                    // 1. Fetch Network với validations
                    const response = await fetch(finalSourcePath);

                    // 1a. Kiểm tra HTTP Status
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} - Không tìm thấy file: ${finalSourcePath}`);
                    }

                    // 1b. Kiểm tra Content-Type (phải là HTML)
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
                        console.warn(`⚠️ Content-Type không phải HTML: ${contentType} cho file ${finalSourcePath}`);
                    }

                    htmlString = await response.text();

                    // 1c. Xác nhận không phải fallback index.html
                    // Note: SPA thường return index.html với status 200 để xử lý routing
                    const isIndexFallback = htmlString.includes('id="app-launcher"') || htmlString.includes('id="main-app"') || (htmlString.includes('<!DOCTYPE html>') && !htmlString.includes('<template') && !htmlString.includes('tpl-'));

                    if (isIndexFallback) {
                        throw new Error(`Fallback index.html (SPA) thay vì template component: ${finalSourcePath}`);
                    }

                    // 1d. Xác nhận nội dung không rỗng
                    if (!htmlString.trim()) {
                        throw new Error(`File trống: ${finalSourcePath}`);
                    }

                    this.htmlCache[finalSourcePath] = htmlString; // Lưu cache nội dung
                }

                // 2. Tạo div ảo để chứa HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlString;

                // 3. Tạo Fragment để chứa kết quả
                contentFragment = document.createDocumentFragment();

                // 4. Chuyển TOÀN BỘ nội dung từ tempDiv sang Fragment
                // Cách này sẽ giữ nguyên mọi thứ: div, span, và cả thẻ <template>
                while (tempDiv.firstChild) {
                    contentFragment.appendChild(tempDiv.firstChild);
                }
            } catch (e) {
                console.error(`❌ Lỗi tải file ${finalSourcePath}:`, e.message);
                return false;
            }
        }
        // CASE B: Source là DOM ID (<template id="...">)
        else {
            const templateEl = document.getElementById(source); // ID thì dùng source gốc
            if (!templateEl) {
                return false;
            }
            contentFragment = templateEl.content.cloneNode(true);
            // Với ID, ta dùng ID làm key lưu trữ
            finalSourcePath = source;
        }

        // 4. Security Check & Container Handling
        let container;

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
                return contentFragment;
            }

            if (mode === 'replace') {
                container.innerHTML = '';
                container.appendChild(contentFragment);
            } else if (mode === 'prepend') {
                container.insertBefore(contentFragment, container.firstChild);
            } else {
                // append
                container.appendChild(contentFragment);
            }
        }
        // 5. Đánh dấu Flag (Sử dụng KEY ĐÃ CHUẨN HÓA)
        this.renderedTemplates[finalSourcePath] = true;
        return true;
    },
    // Hàm được gọi khi bấm chuyển Tab (Hoặc Init)
    lazyLoad: function (tabId) {
        const tabEl = getE(tabId);
        if (!tabEl) {
            L._(`Không tìm thấy Tab ID: ${tabId}`, 'error');
            return;
        }
        if (tabEl.dataset.isLoaded === 'true' && tabEl.innerHTML.trim() !== '') {
            return;
        }
        const tmplId = tabId.replace('tab-', 'tmpl-');

        // 1. Luôn đảm bảo HTML được render trước
        this.renderTemplate(tabId, tmplId, false);

        // 2. Logic khởi tạo Component (Chạy ngay cả khi chưa có Data)
        // Ví dụ: Tạo Datepicker, Gán sự kiện click nút update...
        if (tabId === 'tab-dashboard') {
            // Setup tháng, ngày lọc... (Cần chạy ngay để user thấy form lọc)
            if (typeof UI_DASH.initDashboard === 'function') UI_DASH.initDashboard();
        }
        if (tabId === 'tab-form') {
            this.setupMainFormUI(APP_DATA.lists);
            this.initTableResizer('detail-tbody');
        }
        // if (tabId === 'tab-price-pkg') {
        //   // Vào tab list thì check xem có data chưa để vẽ bảng
        //   const tbody = document.getElementById('grid-body');
        //   if (APP_DATA && Object.values(APP_DATA.bookings) && tbody && tbody.innerHTML.trim() === '') {
        //     renderTableByKey('bookings');
        //   }
        // }

        tabEl.dataset.isLoaded = 'true';
    },

    /**
     * Hàm thiết lập hành động cho nút Save của Modal
     * @param {Function} newActionFunc - Hàm logic bạn muốn chạy khi bấm Save
     */
    bindBtnEvent: function (newActionFunc, btnId, btnText = null) {
        let btn = getE(btnId);

        if (!btn) {
            L._(`Không tìm thấy nút nào của ${btnId} trong DOM!`, 'error');
            return;
        }

        // Gỡ bỏ event handler cũ nếu có
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        btn = newBtn;
        if (btnText) btn.textContent = btnText;

        // 2. SETUP: Gán hàm mới
        // Lưu ý: Ta nên bọc hàm logic trong 1 khối try-catch để an toàn
        this.currentSaveHandler = async function (e) {
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
                Opps('Lỗi hàm bindBtnEvent: ', err);
                UI_HELP.logA('Có lỗi xảy ra: ' + err.message);
            } finally {
                // Mở lại nút sau khi xong (hoặc tùy logic đóng modal của bạn)
                btn.disabled = false;
                btn.innerHTML = currentBtnHTML;
            }
        };

        btn.addEventListener('click', this.currentSaveHandler);
        L._('Đã gán sự kiện mới cho Btn Save Modal.');
    },

    initBtnSelectDataList: async function (data) {
        const selectElem = getE('btn-select-datalist');
        if (!data) data = APP_DATA;
        if (!selectElem) return;
        selectElem.innerHTML = '';
        let hasOption = false;
        const userRole = CURRENT_USER?.role || 'sale',
            allowedCollections = COLL_MANIFEST?.[userRole] || [],
            mappedKeys = A.DB.schema.getCollectionNames();
        let options = {};
        allowedCollections.forEach((key) => {
            options[key] = mappedKeys?.[key] || key;
        });
        return options;
    },

    initTableResizer: function (tableId) {
        if (typeof TableResizeManager === 'undefined') return;

        if (!this._debouncedResizer) {
            this._debouncedResizer = debounce((tid) => {
                try {
                    const resizer = new TableResizeManager(tid);
                    resizer.init();
                } catch (e) {
                    console.warn('[UI_RENDERER] Resizer init failed:', e);
                }
            }, 300);
        }
        this._debouncedResizer(tableId);
    },
    isSetupTabForm: false,
    setupMainFormUI: function (lists) {
        if (this.isSetupTabForm) {
            L._('Đã SetupTabForm - Pass!');
            return;
        }
        L._('setupMainFormUI running');

        if (!lists) return;

        const fillSelect = (elmId, dataArray) => {
            const el = getE(elmId);
            if (!el) return;
            el.innerHTML = '<option value="">--Chọn--</option>';
            if (!Array.isArray(dataArray) && typeof dataArray === 'object') {
                dataArray = Object.entries(dataArray).map(([key, value]) => ({ id: key, name: value }));
            }
            if (Array.isArray(dataArray)) {
                dataArray.forEach((item) => {
                    let opt = document.createElement('option');
                    opt.value = item.name ? item.name : item.id || item;
                    opt.text = item.name ? item.name : item;
                    el.appendChild(opt);
                });
            }
        };
        const fillDataList = (elmId, dataArray) => {
            const el = getE(elmId);
            if (!el) return;
            if (typeof dataArray === 'object') {
                let uniqueData = [...new Set(Object.values(dataArray))];
                el.innerHTML = uniqueData.map((item) => `<option value="${item}">`).join('');
            } else {
                let uniqueData = [...new Set(dataArray)];
                el.innerHTML = uniqueData.map((item) => `<option value="${item}">`).join('');
            }
        };

        fillSelect('BK_Staff', lists.staff);
        fillSelect('Cust_Source', lists.source);
        fillSelect('BK_PayType', lists.payment);
        fillDataList('list-tours', lists.tours);

        const customers = Object.values(APP_DATA.customers ?? {});
        if (customers.length > 0) {
            let phones = [];
            let names = [];
            if (typeof customers[0] === 'object' && !Array.isArray(customers[0])) {
                phones = customers.map((r) => r.phone).filter(Boolean);
                names = customers.map((r) => r.full_name).filter(Boolean);
            } else {
                const validCustomers = customers.filter((r) => r && r.length > 2);
                phones = validCustomers.map((r) => r[1]).filter(Boolean);
                names = validCustomers.map((r) => r[2]).filter(Boolean);
            }
            fillDataList('list-cust-phones', phones.slice(0, 500));
            fillDataList('list-cust-names', names.slice(0, 500));
        }

        const tblBookingForm = getE('tbl-booking-form');
        if (tblBookingForm) {
            const thead = tblBookingForm.querySelector('thead');
            if (thead) {
                const collectionName = CURRENT_USER && CURRENT_USER.role === 'op' ? 'operator_entries' : 'booking_details';
                const headerHtml = this.renderHeaderHtml(collectionName);
                if (headerHtml) thead.innerHTML = headerHtml;
            }
        }
        this.isSetupTabForm = true;
    },

    // =========================================================================
    // 3. TAB & CONTEXT HELPERS
    // =========================================================================

    activateTab: function (targetTabId) {
        this.selectTab(targetTabId);
        this.toggleContextUI(targetTabId);
    },

    toggleContextUI: function (targetTabIdOrIndex) {
        try {
            const activeTabIndex = isNaN(Number(targetTabIdOrIndex)) ? TAB_INDEX_BY_ID[String(targetTabIdOrIndex)] : Number(targetTabIdOrIndex);
            const els = document.querySelectorAll('[data-ontabs]');
            if (!activeTabIndex) {
                els.forEach((el) => el.classList.add('d-none'));
                return;
            }
            els.forEach((el) => {
                const allowedTabs = (el.dataset.ontabs || '').trim().split(/\s+/).filter(Boolean).map(Number) || el.dataset.ontabs === targetTabIdOrIndex;
                el.classList.toggle('d-none', !allowedTabs.includes(activeTabIndex));
            });

            if (activeTabIndex === TAB_INDEX_BY_ID['tab-form']) {
                CURRENT_TABLE_KEY = 'bookings';
                if (typeof setMany === 'function' && typeof getVal === 'function') {
                    if (getE('BK_Start') === '' || getVal('BK_Date') === '') {
                        setMany(['BK_Date', 'BK_Start', 'BK_End'], new Date());
                        setVal('BK_Staff', CURRENT_USER.uid);
                    }
                }
            } else if (activeTabIndex === TAB_INDEX_BY_ID['tab-dashboard']) {
                A.Event?.trigger('btn-dash-update', 'click');
            }
        } catch (e) {
            Opps('Lỗi trong toggleContextUI: ', e);
        }
    },

    selectTab: function (targetTabId) {
        this.lazyLoad(targetTabId);
        const navBtn = document.querySelector(`button[data-bs-target="#${targetTabId}"]`) || document.querySelector(`.nav-link[data-bs-target="#${targetTabId}"]`);
        if (navBtn) bootstrap.Tab.getOrCreateInstance(navBtn).show();
        const tabEl = getE(targetTabId);
        switch (targetTabId) {
            case 'tab-theme-content':
                setClass($(targetTabId), 'd-none', false);
                setClass($('#tab-shortcut-content'), 'd-none', true);
                A.Modal.setSaveHandler(saveThemeSettings, 'Áp Dụng Theme');
                A.Modal.setResetHandler(THEME_MANAGER.resetToDefault, 'Đặt Lại');
                break;
            case 'tab-shortcut-content':
                setClass($(targetTabId), 'd-none', false);
                setClass($('#tab-theme-content'), 'd-none', true);
                A.ShortKey.renderSettingsForm();
                A.Modal.setFooter(false);
                break;
            case 'tab-adm-users':
                setClass($(targetTabId), 'd-none', false);
                A.AdminConsole.modal.setFooter(true);
                A.AdminConsole.modal.setSaveHandler(A.AdminConsole?.saveUser, 'Lưu User');
                A.AdminConsole.modal.setResetHandler(() => {
                    getE('users-form').reset();
                    getE('form-created-at').valueAsDate = new Date();
                }, 'Nhập Lại');
                A.AdminConsole.loadUsersData();
                break;
            case 'tab-data-tbl':
                if (getE('tbl-tab-data-tbl')) break;

                this.createTable('tab-data-tbl', {
                    colName: 'bookings',
                    data: APP_DATA['bookings'] || [],
                    header: true,
                    headerExtra: [
                        `<div class="btn btn-sm btn-warning shadow-sm p-0" id="datalist-select"">
        <select id="btn-select-datalist" data-creatable="${CURRENT_USER.role === 'admin' ? 'true' : 'false'}" data-source="A.UI.initBtnSelectDataList"  data-onchange="A.UI.updateTableData();" class="smart-select form-select form-select-sm border-0" style="min-width: 6rem;">
        </select>
      </div>`,
                    ],
                    contextMenu: false,
                    draggable: true,
                    pageSize: 50,
                    zoom: true,
                    sorter: true,
                    title: `DANH SÁCH DATA`,
                    footer: true,
                    groupBy: true,
                    fs: 0.7,
                });
                setTimeout(() => {
                    getE('btn-select-datalist')
                        .querySelectorAll('options')
                        .forEach((opt) => {
                            if (opt.value && opt.value === 'bookings') {
                                opt.selected = true;
                                getE('btn-select-datalist').dispatchEvent(new Event('change'));
                            }
                        });
                }, 500);
                break;
            case 'tab-price-pkg':
                if (A.PriceManager) {
                    A.PriceManager.init('tab-price-pkg');
                }
                break;
            case 'tab-tour-price':
                if (A.TourPrice) {
                    A.TourPrice.init();
                }
                break;
            case 'tab-adm-app-config':
                A.AdminConsole.modal.setFooter(false);
                break;
            default:
                setClass($(targetTabId), 'd-none', false);
        }
        setTimeout(() => {
            const input = tabEl?.querySelector('input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]):not([readonly])');
            if (input && input.offsetParent !== null) input.focus();
            document.dispatchEvent(new CustomEvent('tabchange', { detail: { tabId: targetTabId } }));
        }, 100);
    },

    generateGridColsFromObject: function (collectionName) {
        const headerObj = A.DB.schema.createHeaderFromFields(collectionName);
        if (!headerObj || typeof headerObj !== 'object') {
            GRID_COLS = [];
            return;
        }
        const FORMAT_KEYWORDS = {
            date: ['ngày', 'hạn', 'date', 'dob', 'checkin', 'checkout', 'deadline', 'start', 'end'],
            money: ['tiền', 'giá', 'cọc', 'thu', 'chi', 'total', 'amount', 'price', 'deposit', 'revenue', 'cost', 'profit', 'balance'],
        };
        const matches = (text, type) =>
            String(text)
                .toLowerCase()
                .split(' ')
                .some((word) => FORMAT_KEYWORDS[type].some((key) => word.includes(key)));
        const translate = (t) => (A.Lang ? A.Lang.t(t) : t);

        GRID_COLS = Object.entries(headerObj).map(([fieldName, fieldValue], index) => {
            const vnTitle = fieldValue || translate(fieldName);
            let format = matches(vnTitle, 'date') || matches(fieldName, 'date') ? 'date' : matches(vnTitle, 'money') || matches(fieldName, 'money') ? 'money' : 'text';
            let res = { i: fieldName, key: fieldName, t: vnTitle, fmt: format, align: format === 'money' ? 'text-end' : 'text-center' };
            if (TABLE_HIDDEN_FIELDS[collectionName]?.includes(fieldName)) res.hidden = true;
            return res;
        });
    },

    renderHeaderHtml: function (collectionName) {
        this.generateGridColsFromObject(collectionName);
        if (GRID_COLS?.length > 0) {
            return '<th style="width:50px" class="text-center">#</th>' + GRID_COLS.map((col) => `<th class="${col.hidden ? 'd-none ' : 'text-center'}" data-field="${col.key}">${col.t}</th>`).join('');
        }
        return '<th>Không có cấu hình cột</th>';
    },

    stableSort: function (data, currentTable, sort) {
        if (!currentTable) currentTable = GRID_STATE.currentTable;
        if (!sort) sort = GRID_STATE.sort;
        if (!data) data = GRID_STATE.filteredData;

        if (!data || data.length === 0) return [];

        let sorted = [...data];
        const modifier = sort.dir === 'asc' ? 1 : -1;
        const DATE_PRIORITY = ['start_date', 'check_in', 'transaction_date', 'created_at', 'updated_at'];

        // Tối ưu hàm toNum: Bỏ qua ép kiểu/regex nếu nó ĐÃ LÀ SỐ
        const toNum = (v) => {
            if (typeof v === 'number') return v;
            if (!v) return 0;
            if (typeof getNum === 'function') return getNum(v);
            return Number(String(v).replace(_numRegex, '')) || 0;
        };

        // Hàm so sánh lõi
        const _compare = (va, vb, fmt) => {
            if (fmt === 'date') return parseDateVal(va) - parseDateVal(vb);
            if (fmt === 'money' || fmt === 'number') {
                return toNum(va) - toNum(vb);
            }
            // Dùng Collator tốc độ cao thay cho localeCompare
            return _viCollator.compare(String(va ?? ''), String(vb ?? ''));
        };

        if (sort.column) {
            // Resolve cấu hình cột 1 LẦN DUY NHẤT ở ngoài vòng lặp sort
            const resolveColConfig = (raw) => GRID_COLS?.find((c) => String(c?.i) === raw || String(c?.key) === raw) || null;
            const colConfig = resolveColConfig(sort.column);
            const fieldName = colConfig?.key || colConfig?.i || sort.column;
            const format = colConfig?.fmt ?? 'text';

            const isSecondary = A.DB?.schema?.[currentTable]?.isSecondaryIndex === true;
            const groupByField = isSecondary ? (A.DB.schema[currentTable]?.groupBy ?? 'id') : null;

            // Đưa _stableSort vào trong if (sort.column) để gom chung fieldName & format
            const _stableSort = (a, b) => {
                let cmp = _compare(a?.[fieldName] ?? '', b?.[fieldName] ?? '', format) * modifier;
                if (cmp !== 0) return cmp;

                // Vòng lặp ưu tiên ngày tháng
                for (let i = 0; i < DATE_PRIORITY.length; i++) {
                    const f = DATE_PRIORITY[i];
                    if (f === fieldName) continue;

                    const valA = a?.[f],
                        valB = b?.[f];
                    if (valA || valB) {
                        const dateCmp = (parseDateVal(valA) - parseDateVal(valB)) * modifier;
                        if (dateCmp !== 0) return dateCmp;
                    }
                }

                // Fallback cuối cùng bằng ID (Dùng toán tử thô < > siêu tốc, bỏ localeCompare)
                const idA = String(a?.id || '');
                const idB = String(b?.id || '');
                return idA === idB ? 0 : idA < idB ? -modifier : modifier;
            };

            if (isSecondary) {
                sorted.sort((a, b) => {
                    const ga = String(a?.[groupByField] ?? '');
                    const gb = String(b?.[groupByField] ?? '');
                    // Dùng Collator thay cho localeCompare
                    const groupCmp = _viCollator.compare(ga, gb) * modifier;
                    if (groupCmp !== 0) return groupCmp;
                    return _stableSort(a, b);
                });
            } else {
                sorted.sort(_stableSort);
            }
        }

        return sorted;
    },
    resetForm: function (e) {
        const form = e.target.closest('form') || $('form', getE('dynamic-modal-body'));
        if (form) {
            form.reset();
        }
    },
    renderModal: async function (tmplId, title, btnSaveHandler = null, btnResetHandler = null, opts = {}) {
        try {
            const modalContent = await this.renderTemplate(null, tmplId);

            A.Modal.render(modalContent, title, opts);
            if (btnSaveHandler) {
                A.Modal.setSaveHandler(btnSaveHandler, 'Lưu');
            }
            if (btnResetHandler) {
                A.Modal.setResetHandler(btnResetHandler);
            } else A.Modal.setResetHandler(this.resetForm, 'Đặt Lại');
            return A.Modal;
        } catch (e) {
            Opps('Lỗi trong renderModal: ', e);
        }
    },
    renderForm: async function (collectionName, dataorId = null, title = null, opts = {}) {
        const html = await createFormBySchema(collectionName);
        if (!title) title = `Chỉnh sửa ${A.Lang?.t(collectionName)} ${dataorId ? '(ID: ' + dataorId + ')' : ''}`;
        A.Modal.render(html, title, opts); // Có thể tùy chỉnh title theo collection hoặc formId nếu muốn
        A.Modal.show();
        if (dataorId) {
            const formId = `${collectionName}-schema-form`;
            // Tải dữ liệu vào form trước khi render modal
            await loadFormDataSchema(formId.toString(), dataorId);
        }
        A.Modal.setFooter(false);
    },
    renderBtn(label, action = '', color = 'primary', icon = '', isSmall = true) {
        const sizeClass = isSmall ? 'btn-sm' : '';
        const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i> ` : '';

        return `
			<button 
				type="button" 
				class="btn btn-${color} ${sizeClass} d-inline-flex align-items-center gap-2"
				onclick="${action}"
				aria-label="${label}"
			>
				${iconHtml}
				<span>${label}</span>
			</button>`;
    },
    renderFormInput(label, id, type = 'text', value = '', isSmall = true, placeholder = '') {
        const sizeClass = isSmall ? 'form-control-sm' : '';
        return `
		  <div class="mb-2">
			<label for="${id}" class="form-label fw-bold mb-0 ${isSmall ? 'small' : ''}">${label}</label>
			<input 
			  type="${type}" 
			  class="form-control ${sizeClass}" 
			  id="${id}" 
			  value="${value}" 
			  placeholder="${placeholder}"
			>
		  </div>`;
    },

    /**
     * TẠO BẢNG HIỂN THỊ DỮ LIỆU NHANH (DYNAMIC TABLE)
     * @param {string} containerId - ID của container chứa bảng
     * @param {Object|Array} data - Dữ liệu object hoặc mảng object
     * @param {Object} opts - Tùy chọn: { mode: 'replace', colName: '', contextMenu: false, pageSize: 25, sorter: false, fs: 14, header: false, title: '', footer: false, groupBy: false }
     */

    createTable: async function (containerId, opts = {}) {
        try {
            if (CURRENT_USER.role === 'admin') {
                opts.hiddenField = true;
            }
            if (!this.table) this.table = (await import('./ATable.js')).default;
            new this.table(containerId, opts);
        } catch (error) {
            Opps(`[UI_RENDERER] createTable lỗi: ${error.message}`, error);
        }
    },

    updateTableData: async function () {
        const collection = getVal('btn-select-datalist');
        L._(`[UI_RENDERER] updateTableData: ${collection}`);
        const fullData = APP_DATA?.[collection] || (await A.DB.local.getCollection(collection));
        A.UI.createTable('tab-data-tbl', { colName: collection, data: fullData });
    },

    toggleFullScreen: function () {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                Opps(`Lỗi khi bật Fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    },
    /**
     * 9 TRIP ERP HELPER: ELASTIC ELEMENT
     * Chức năng: Ép element co lại để luôn nằm trong Viewport, tự sinh scroll nội bộ.
     * @param {string|HTMLElement} target - ID hoặc Element cần xử lý
     * @param {number} padding - Khoảng cách an toàn đáy (mặc định 20px cho Mobile)
     */
    fitToViewport: function (target, padding = 20) {
        try {
            const el = typeof target === 'string' ? document.getElementById(target) : target;
            if (!el) return;

            // --- BƯỚC 1: FIT SIZE (Giữ nguyên logic Resize tối ưu) ---
            const vH = window.innerHeight || document.documentElement.clientHeight;
            const vW = window.innerWidth || document.documentElement.clientWidth;

            // Reset để đo kích thước thực
            el.style.maxHeight = 'none';
            el.style.maxWidth = 'none';

            // Lấy kích thước hiện tại
            let rect = el.getBoundingClientRect();

            // Xử lý quá khổ chiều cao
            if (rect.height > vH - padding * 2) {
                el.style.maxHeight = `${vH - padding * 2}px`;
                el.style.overflowY = 'auto';
            }

            // Xử lý quá khổ chiều rộng
            if (rect.width > vW - padding * 2) {
                el.style.maxWidth = `${vW - padding * 2}px`;
                el.style.overflowX = 'auto';
            }

            // Đo lại sau khi resize
            rect = el.getBoundingClientRect();

            // --- BƯỚC 2: TÍNH TOÁN ĐỘ LỆCH (DELTA CALCULATION) ---

            let deltaX = 0;
            let deltaY = 0;

            // Kiểm tra trục dọc (Y)
            if (rect.top < padding) {
                // Lệch lên trên -> Cần dịch xuống
                deltaY = padding - rect.top;
            } else if (rect.bottom > vH - padding) {
                // Lệch xuống dưới -> Cần dịch lên (số âm)
                deltaY = vH - padding - rect.bottom;
            }

            // Kiểm tra trục ngang (X)
            if (rect.left < padding) {
                // Lệch sang trái -> Cần dịch phải
                deltaX = padding - rect.left;
            } else if (rect.right > vW - padding) {
                // Lệch sang phải -> Cần dịch trái
                deltaX = vW - padding - rect.right;
            }

            // Nếu không lệch gì cả thì thoát
            if (deltaX === 0 && deltaY === 0) return;

            L._(`9 Trip UI: Điều chỉnh vị trí element. X: ${deltaX}, Y: ${deltaY}`);

            // --- BƯỚC 3: DI CHUYỂN ELEMENT (APPLY MOVEMENT) ---

            const computedStyle = window.getComputedStyle(el);
            const position = computedStyle.position;

            if (position === 'fixed' || position === 'absolute') {
                // Trường hợp 1: Element có định vị (Modal, Tooltip, Dropdown)
                // Ta cộng độ lệch vào tọa độ hiện tại

                // Lấy giá trị top/left hiện tại (lưu ý trường hợp 'auto')
                const currentTop = parseFloat(computedStyle.top) || 0;
                const currentLeft = parseFloat(computedStyle.left) || 0;

                el.style.top = `${currentTop + deltaY}px`;
                el.style.left = `${currentLeft + deltaX}px`;

                // Xóa bottom/right để tránh xung đột CSS
                el.style.bottom = 'auto';
                el.style.right = 'auto';
            } else {
                // Trường hợp 2: Element tĩnh (Static)
                // Dùng Transform để dịch chuyển hình ảnh mà không làm vỡ layout xung quanh
                // Lưu ý: Cách này chỉ dịch chuyển hình ảnh hiển thị (Visual), vị trí DOM vẫn giữ nguyên.

                // Lấy giá trị transform hiện tại (nếu có)
                const currentTransform = new WebKitCSSMatrix(computedStyle.transform);
                const currentX = currentTransform.m41;
                const currentY = currentTransform.m42;

                el.style.transform = `translate3d(${currentX + deltaX}px, ${currentY + deltaY}px, 0)`;
            }
        } catch (error) {
            console.error('9 Trip Critical Error [moveElementIntoView]:', error);
        }
    },

    showLoading: function (show, text = 'Loading...') {
        let el = getE('loading-overlay');
        if (!el) {
            if (!show) return;
            el = document.createElement('div');
            el.id = 'loading-overlay';
            el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
            el.innerHTML = `<div class="spinner-border text-warning" role="status" style="width: 2.5rem; height: 2.5rem;"></div><div id="loading-text" class="mt-3 fw-bold text-primary small">${text}</div>`;
            document.body.appendChild(el);
        }
        const textEl = getE('loading-text');
        if (textEl) textEl.innerText = text;
        el.style.display = show ? 'flex' : 'none';
    },

    setBtnLoading: function (btnSelector, isLoading, loadingText = 'Đang lưu...') {
        const btn = typeof btnSelector === 'string' ? getE(btnSelector) : btnSelector;
        if (!btn) {
            warn('setBtnLoading', `Button not found:`, btnSelector);
            return;
        }

        if (isLoading) {
            if (!btn.dataset.original) btn.dataset.original = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm text-danger me-2" role="status" aria-hidden="true"></span>${loadingText}`;
        } else {
            btn.disabled = false;
            if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
        }
    },

    /**
     * Chuyển đổi trạng thái của một Element giữa DOM và Template.
     * - Nếu Element đang hiển thị: Bọc nó vào <template> (Ẩn khỏi DOM).
     * - Nếu Element đang trong <template>: Đưa nó trở lại DOM.
     * @param {string} targetId - ID của element cần toggle (không phải ID của template).
     * @returns {HTMLElement|null} - Trả về Element nếu vừa unwrap, hoặc null nếu vừa wrap.
     */
    toggleTemplate: function (targetId) {
        try {
            const tmplId = 'tmpl-' + targetId;

            // Trường hợp 1: Element đang "Sống" trên DOM -> Cần đưa vào Template
            const activeElement = getE(targetId);
            if (!activeElement) {
                L._(`⚠️ Element #${targetId} không tồn tại trên DOM. Kiểm tra lại ID hoặc trạng thái hiện tại.`);
                return null;
            }

            if (activeElement && activeElement.tagName.toLowerCase() !== 'template') {
                // 1. Tạo thẻ template
                const template = document.createElement('template');
                template.id = tmplId;
                const htmlString = activeElement.outerHTML; // Lấy HTML của element (bao gồm chính nó)

                // 2. Chèn template vào ngay trước element để giữ vị trí
                activeElement.parentNode.insertBefore(template, activeElement);

                // 3. Chuyển element vào trong template content
                // Lưu ý: appendChild sẽ di chuyển node từ DOM vào Fragment
                template.content.appendChild(activeElement);

                L._(`[Utils] Đã ẩn element #${targetId} vào template #${tmplId}`);
                return htmlString;
            }

            // Trường hợp 2: Element đang "Ngủ" trong Template -> Cần đánh thức dậy
            const templateElement = getE(tmplId);

            if (templateElement) {
                // 1. Lấy nội dung từ template (DocumentFragment)
                const content = templateElement.content;

                // Tìm lại element gốc bên trong để return
                const originalElement = content.querySelector('#' + targetId) || content.firstElementChild;

                // 2. Đưa nội dung ra ngoài (chèn vào chỗ của thẻ template)
                templateElement.parentNode.insertBefore(content, templateElement);

                // 3. Xóa thẻ template đi (vì element đã ra ngoài rồi)
                templateElement.remove();

                L._(`[Utils] Đã khôi phục element #${targetId} từ template`);
                return originalElement;
            }

            console.warn(`[Utils] Không tìm thấy Element #${targetId} hoặc Template #${tmplId}`);
            return null;
        } catch (error) {
            console.error(`[Utils] Lỗi trong toggleTemplate('${targetId}'):`, error);
            return null;
        }
    },
};

const UI_HELP = {
    /**
     * @param {string}               message            Nội dung (hỗ trợ HTML và \n).
     * @param {string}               [type='info']      'info'|'success'|'warning'|'error'|'danger'
     * @param {Function|string|null} [modeOrCallback]   Chế độ hoặc OK callback (xem trên).
     * @param {Function|Object|*}    rest[0]        Deny callback (nếu là Function → 3-button) HOẶC object tùy chọn Swal (confirm/alert mode).
     *                                                  object tùy chọn Swal (confirm/alert mode).
     *                                                  Object hỗ trợ: `onConfirm`, `onDeny`, `onCancel` (alias).
     * @returns {void|Promise<boolean>}  toast → void;  alert → Promise<void>;
     *                                   confirm/callback → Promise<boolean>  (true = isConfirmed)
     */
    logA: function (message, type = 'info', modeOrCallback = null, ...rest) {
        if (typeof L !== 'undefined' && typeof L._ === 'function') L._(message, null, type);

        // ── Xác định mode ───────────────────────────────────────────────────────
        const isCallbackMode = typeof modeOrCallback === 'function';
        const mode = isCallbackMode ? 'confirm' : String(modeOrCallback ?? 'toast').toLowerCase(); // 'toast' | 'alert' | 'confirm'

        // ── Tách deny callback và args ──────────────────────────────────────────
        let confirmCallback = null;
        let denyCallback = null;
        let cbArgs = [];
        let swalExtra = {};

        if (isCallbackMode) {
            if (typeof rest[0] === 'function') {
                denyCallback = rest[0];
                cbArgs = rest.slice(1);
            } else {
                cbArgs = rest;
            }
        } else {
            if (rest.length === 1 && rest[0] && typeof rest[0] === 'object') {
                const { onConfirm: _onConfirm, onDeny: _onDeny, onCancel: _onCancel, mode: _mode, ...remaining } = rest[0];
                confirmCallback = typeof _onConfirm === 'function' ? _onConfirm : null;
                denyCallback = typeof _onDeny === 'function' ? _onDeny : typeof _onCancel === 'function' ? _onCancel : null;
                swalExtra = remaining;
            }
        }

        const isDenyMode = denyCallback !== null;

        // ── Lookup tables ────────────────────────────────────────────────────────
        const iconMap = {
            info: 'info',
            success: 'success',
            warning: 'warning',
            error: 'error',
            danger: 'error',
            question: 'question',
            true: 'success',
            false: 'error',
        };
        const titleMap = {
            info: 'Thông báo',
            success: 'Thành công',
            warning: 'Cảnh báo',
            error: 'Lỗi',
            danger: 'Lỗi',
            true: 'Thành công',
            false: 'Thất bại',
        };
        const btnVariantMap = {
            info: 'primary',
            success: 'success',
            warning: 'warning',
            error: 'danger',
            danger: 'danger',
        };

        const norm = String(type ?? 'info').toLowerCase();
        const icon = iconMap[norm] || 'info';
        const autoTitle = titleMap[norm] || 'Thông báo';
        const variant = btnVariantMap[norm] || 'primary';
        const isDangerous = norm === 'warning' || norm === 'error' || norm === 'danger';
        const htmlBody = String(message).replace(/\n/g, '<br>');

        // ── Fallback khi Swal chưa load ─────────────────────────────────────────
        const _Swal = window.Swal || (typeof Swal !== 'undefined' ? Swal : null);

        if (!_Swal) {
            console.warn('[logA] SweetAlert2 (Swal) is not loaded.');
            if (mode === 'toast') {
                console.info('[logA] Toast fallback to console:', message);
                return;
            }
            if (mode === 'alert') {
                alert(message);
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const ok = window.confirm(message);
                if (ok && isCallbackMode) modeOrCallback(...cbArgs);
                else if (!ok && denyCallback) denyCallback();
                resolve(ok);
            });
        }

        const c = typeof _bsBtnColors === 'function' ? _bsBtnColors() : {};

        const basePopup = {
            position: 'center',
            draggable: false,
            toast: false,
            timer: undefined,
            timerProgressBar: false,
            background: c.bodyBg || '',
            color: c.bodyColor || '',
            buttonsStyling: false,
            allowOutsideClick: false,
            customClass: {
                popup: 'shadow rounded-3',
                title: 'fw-semibold fs-5',
                htmlContainer: 'text-start',
            },
        };

        // ── Toast: hiển thị góc phải trên, tự ẩn sau 3.5s ───────────────────────
        if (mode === 'toast') {
            _Swal.fire({
                toast: true,
                position: 'top-end',
                icon,
                title: String(message),
                showConfirmButton: false,
                timer: (typeof A !== 'undefined' && typeof A.getConfig === 'function' ? A.getConfig('toast_duration') : null) || 3500,
                timerProgressBar: true,
                didOpen: (toast) => {
                    toast.onmouseenter = _Swal.stopTimer;
                    toast.onmouseleave = _Swal.resumeTimer;
                },
            });
            return;
        }

        // ── Alert modal: chính giữa, 1 nút Đóng, không tự ẩn ───────────────────
        if (mode === 'alert') {
            const { title: customTitle, ...extraSwal } = swalExtra;
            return _Swal.fire({
                ...basePopup,
                allowOutsideClick: true,
                draggable: true,
                icon,
                title: customTitle || autoTitle,
                html: htmlBody,
                confirmButtonText: 'Đóng',
                showCancelButton: false,
                focusConfirm: true,
                confirmButtonColor: c[variant] || c.primary || '#0d6efd',
                customClass: { ...basePopup.customClass, confirmButton: `btn btn-${variant} px-4` },
                ...extraSwal,
            });
        }

        // ── Confirm modal: 2 nút (Xác nhận | Hủy) hoặc 3 nút (Xác nhận | Từ chối | Hủy) ──
        const { title: customTitle = '', confirmText = 'Xác nhận', denyText = 'Từ chối', cancelText = 'Hủy', confirmBtn: okVariant = variant, denyBtn: denyVariant = 'danger', cancelBtn: noVariant = 'secondary', ...extraSwal } = swalExtra;
        const confirmTitle = customTitle || (autoTitle === 'Thông báo' ? 'Xác nhận' : autoTitle);

        return _Swal
            .fire({
                ...basePopup,
                allowOutsideClick: false,
                icon,
                draggable: true,
                title: confirmTitle,
                html: htmlBody,
                showCancelButton: true,
                showDenyButton: isDenyMode,
                confirmButtonText: confirmText,
                ...(isDenyMode && { denyButtonText: denyText }),
                cancelButtonText: cancelText,
                confirmButtonColor: c[okVariant] || c.primary || '#0d6efd',
                ...(isDenyMode && { denyButtonColor: c[denyVariant] || c.danger || '#dc3545' }),
                cancelButtonColor: c[noVariant] || c.secondary || '#6c757d',
                focusConfirm: !isDangerous,
                focusCancel: isDangerous && !isDenyMode,
                focusDeny: isDangerous && isDenyMode,
                reverseButtons: false,
                customClass: {
                    ...basePopup.customClass,
                    confirmButton: `btn btn-${okVariant} px-4`,
                    ...(isDenyMode && { denyButton: `btn btn-${denyVariant} px-4` }),
                    cancelButton: `btn btn-${noVariant} px-4`,
                    actions: 'gap-2',
                },
                ...extraSwal,
            })
            .then((result) => {
                if (result.isConfirmed) {
                    if (isCallbackMode) modeOrCallback(...cbArgs);
                    else if (confirmCallback) confirmCallback();
                } else if (result.isDenied) {
                    if (denyCallback) denyCallback();
                }
                return result.isConfirmed;
            });
    },

    // =========================================================================
    // DIALOG UTILITIES — SweetAlert2 replacements for alert() / confirm()
    // =========================================================================

    /**
     * Đọc CSS variables Bootstrap / ThemeManager từ :root tại thời điểm gọi.
     * Kết quả phản ánh theme đang active mà không cần import ThemeManager.
     * @private
     * @returns {{ primary, secondary, success, danger, warning, info, bodyBg, bodyColor }}
     */
    _bsBtnColors: function () {
        const s = getComputedStyle(document.documentElement);
        const v = (name) => s.getPropertyValue(name).trim();
        return {
            primary: v('--bs-primary') || v('--primary-color') || '#0d6efd',
            secondary: v('--bs-secondary') || v('--secondary-color') || '#6c757d',
            success: v('--bs-success') || '#198754',
            danger: v('--bs-danger') || '#dc3545',
            warning: v('--bs-warning') || '#ffc107',
            info: v('--bs-info') || '#0dcaf0',
            bodyBg: v('--bs-body-bg') || v('--bg-primary') || '#ffffff',
            bodyColor: v('--bs-body-color') || v('--text-primary') || '#212529',
        };
    },
    showAlert: function (message, type = 'info', title = 'Thông Báo', options = {}) {
        return UI_HELP.logA(message, type, 'alert', title ? { title, ...options } : options);
    },

    showConfirm: function (message, okFnOrOpts, denyFn, opts = {}) {
        let finalOpts = {};
        if (typeof okFnOrOpts === 'function') {
            finalOpts = { ...opts, onConfirm: okFnOrOpts, onDeny: denyFn };
        } else {
            finalOpts = { ...okFnOrOpts };
        }
        return UI_HELP.logA(message, 'warning', 'confirm', finalOpts);
    },

    /**
     * Tải nội dung HTML từ file tĩnh (local/Firebase Hosting)
     * ✅ Optimized: Cache, timeout, path validation, retry
     *
     * @param {string} url - Tên file (vd: 'tpl_all.html') hoặc đường dẫn đầy đủ
     * @param {Object} options - { useCache: true, timeout: 5000, retry: 1 }
     * @returns {Promise<string>} - HTML content
     */
    loadHtmlFile: async (url, options = {}) => {
        let useCache = options === false || !options?.useCache ? false : true;
        let timeout = options?.timeout ?? 5000;
        let retry = options?.retry ?? 1;
        let containerId = options?.containerId ?? null;

        return new Promise((resolve, reject) => {
            let finalSourcePath = url;
            // 1. ✅ PATH VALIDATION: Chặn path traversal & absolute path
            // Bỏ các ký tự nguy hiểm để tránh injection
            if (url.includes('..') || url.startsWith('/')) {
                reject(new Error(`❌ Invalid path: ${url} (Path traversal detected)`));
                return;
            }

            // 2. Nếu là file HTML ngắn gọn (vd: 'tpl_all.html'), tự động thêm path
            if (url.endsWith('.html') && !url.includes('/')) {
                finalSourcePath = './src/components/' + url;
            }

            // 3. ✅ CHECK CACHE TRƯỚC
            if (useCache && _htmlCache?.[finalSourcePath]) {
                L._(`⚡ HTML cached (from: ${finalSourcePath})`, 'info');
                resolve(_htmlCache[finalSourcePath]);
                return;
            }

            // 4. ✅ FETCH WITH TIMEOUT + RETRY LOGIC
            const fetchWithTimeout = (path, attempt = 1) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                fetch(path, {
                    signal: controller.signal,
                    method: 'GET',
                    cache: 'no-store', // Mấu chốt 1: Lệnh cho browser không được dùng cache
                    headers: {
                        'Cache-Control': 'no-cache', // Mấu chốt 2: Ép server trả bản mới nhất
                        Pragma: 'no-cache', // Hỗ trợ các trình duyệt đời cổ
                    },
                })
                    .then((response) => {
                        clearTimeout(timeoutId);
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }

                        return response.text();
                    })
                    .then((html) => {
                        const isIndexFallback = html.includes('id="app-launcher"') || html.includes('id="main-app"') || (html.includes('<!DOCTYPE html>') && !html.includes('<template') && !html.includes('tpl-'));

                        if (isIndexFallback) {
                            throw new Error(`Fallback index.html (SPA) thay vì template component: ${finalSourcePath}`);
                        }

                        // 1d. Xác nhận nội dung không rỗng
                        if (!html.trim()) {
                            throw new Error(`File trống: ${finalSourcePath}`);
                        }
                        // ✅ CACHE RESULT
                        if (useCache) {
                            _htmlCache[finalSourcePath] = html;
                        }
                        // 2. Tạo div ảo để chứa HTML
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = html;

                        // 3. Tạo Fragment để chứa kết quả
                        const contentFragment = document.createDocumentFragment();

                        // 4. Chuyển TOÀN BỘ nội dung từ tempDiv sang Fragment
                        // Cách này sẽ giữ nguyên mọi thứ: div, span, và cả thẻ <template>
                        while (tempDiv.firstChild) {
                            contentFragment.appendChild(tempDiv.firstChild);
                        }
                        if (containerId) getE(containerId).appendChild(contentFragment);

                        L._(`✅ HTML loaded from: ${finalSourcePath}`, 'success');
                        resolve(html);
                    })
                    .catch((err) => {
                        clearTimeout(timeoutId);

                        // ✅ RETRY LOGIC
                        if (attempt < retry) {
                            L._(`⚠️ HTML fetch failed (attempt ${attempt}/${retry}), retrying...`, 'warning');
                            setTimeout(() => fetchWithTimeout(path, attempt + 1), 500);
                        } else {
                            Opps(`❌ Failed to load HTML from: ${finalSourcePath} (${err.message})`);
                            reject(err);
                        }
                    });
            };
            fetchWithTimeout(finalSourcePath);
        });
    },

    /**
     * Clear HTML cache (nếu cần reload)
     */
    clearHtmlCache: function (urlPattern = null) {
        if (!urlPattern) {
            Object.keys(_htmlCache).forEach((key) => delete _htmlCache[key]);
            L._('🗑️ HTML cache cleared', 'info');
        } else {
            if (_htmlCache[urlPattern]) {
                delete _htmlCache[urlPattern];
                L._(`🗑️ HTML cache cleared for: ${urlPattern}`, 'info');
            }
        }
    },

    addDynamicCSS: function (cssCode, styleId = 'app-dynamic-styles') {
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
        }
        styleTag.textContent += '\n' + cssCode;
    },
};
UI_RENDERER.HELP = UI_HELP;
window.showLoading = UI_RENDERER.showLoading;
window.logA = UI_HELP.logA;
window.setBtnLoading = UI_RENDERER.setBtnLoading;
window.toggleTemplate = UI_RENDERER.toggleTemplate;
window.showAlert = UI_HELP.showAlert;
window.showConfirm = UI_HELP.showConfirm;
window.loadHtmlFile = UI_HELP.loadHtmlFile;
window.addDynamicCSS = UI_HELP.addDynamicCSS;
export const { logA, showAlert, showConfirm, loadHtmlFile, addDynamicCSS } = UI_HELP;
export default UI_RENDERER;
