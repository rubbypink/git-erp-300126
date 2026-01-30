/**
 * UI RENDERER MODULE (v2)
 * Nhiệm vụ: Thao tác DOM, vẽ HTML, xử lý Modal/Table.
 * Nguyên tắc: Không chứa logic nghiệp vụ, chỉ nhận data và vẽ.
 */

import { APP_CONFIG } from './app-config.js';
import { ComponentLoader } from './loader.js';

export const Renderer = {

    /**
     * 1. RENDER TEMPLATE (Từ thẻ <template id="..."> có sẵn trong DOM)
     * @param {string} templateId - ID của thẻ template
     * @param {string} targetId - ID container đích
     * @param {string} mode - 'replace' | 'append' | 'prepend'
     */
    renderTemplate(templateId, targetId, mode = 'replace') {
        const template = document.getElementById(templateId);
        const container = document.getElementById(targetId);

        if (!template || !container) {
            console.warn(`[Renderer] Template (${templateId}) or Container (${targetId}) not found.`);
            return;
        }

        // Clone nội dung
        const content = template.content.cloneNode(true);

        if (mode === 'replace') {
            container.innerHTML = '';
            container.appendChild(content);
        } else if (mode === 'prepend') {
            container.insertBefore(content, container.firstChild);
        } else {
            container.appendChild(content);
        }
    },

    /**
     * 2. GENERATE GRID COLS (Tự động tạo cấu hình cột từ Object)
     * Dựa trên keyword để đoán định dạng (Date, Money)
     */
    generateGridColsFromObject(dataRow) {
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
    },

    /**
     * 3. RENDER TABLE RESPONSIVE
     * @param {Array} data - Mảng dữ liệu
     * @param {string} targetId - ID container
     * @param {Array} customCols - (Optional) Cấu hình cột tùy chỉnh
     * @param {Function} onRowClick - (Optional) Callback khi click dòng
     */
    renderTable(data, targetId, customCols = null, onRowClick = null) {
        const container = document.getElementById(targetId);
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="alert alert-light text-center border">Không có dữ liệu hiển thị</div>';
            return;
        }

        // A. Xác định cột
        const cols = customCols || this.generateGridColsFromObject(data[0]);

        // B. Xây dựng HTML (Sử dụng CSS Mobile First của v2)
        // Table responsive wrapper
        let html = `<div class="table-responsive bg-white shadow-sm rounded">
            <table class="table table-hover table-nowrap align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="text-center" style="width: 50px;">#</th>`;
        
        // Render Header
        cols.forEach(c => {
            if (!c.hidden) html += `<th class="${c.align} fw-bold text-secondary small text-uppercase" style="white-space:nowrap">${c.title}</th>`;
        });
        
        html += `   </tr>
                </thead>
                <tbody>`;

        // Render Body
        data.forEach((row, idx) => {
            // Row Click Event: add data-id để delegate event sau này hoặc onclick inline
            // Lưu ý: data-id cần lấy từ row.id (nếu có)
            const rowId = row.id || idx;
            
            html += `<tr style="cursor: pointer;" onclick="${onRowClick ? `window['${onRowClick}']('${rowId}')` : ''}" data-id="${rowId}">
                        <td class="text-center text-muted small">${idx + 1}</td>`;
            
            cols.forEach(c => {
                if (!c.hidden) {
                    let val = row[c.key];
                    
                    // Format dữ liệu dùng Utils Global
                    if (val === undefined || val === null) val = '-';
                    else if (c.fmt === 'money' && window.formatMoney) val = window.formatMoney(val);
                    else if (c.fmt === 'date' && window.formatDateVN) val = window.formatDateVN(val);
                    
                    // Highlight trạng thái (Optional logic)
                    let textClass = '';
                    if (c.fmt === 'money' && c.key.includes('balance') && val !== '0') textClass = 'text-danger fw-bold';

                    html += `<td class="${c.align} ${textClass}">${val}</td>`;
                }
            });
            html += `</tr>`;
        });

        html += `   </tbody>
            </table>
        </div>`;
        
        // C. Inject vào DOM
        container.innerHTML = html;
    },

    /**
     * 4. RENDER MODAL (Dynamic)
     * @param {string} title - Tiêu đề Modal
     * @param {string} bodyHtml - Nội dung HTML hoặc ID template
     * @param {string} modalId - ID modal (Mặc định 'dynamic-modal')
     */
    renderModal(title, bodyHtml, modalId = 'dynamic-modal') {
        // 1. Tìm hoặc render vỏ modal nếu chưa có
        // Giả sử modal shell đã có sẵn trong components/common/overlays.html
        // Nếu chưa có, ta phải inject nó trước (logic loader)
        
        const modalEl = document.getElementById(modalId);
        if (!modalEl) {
            console.error(`[Renderer] Modal #${modalId} not found in DOM.`);
            return null;
        }

        // 2. Set Title & Body
        const titleEl = modalEl.querySelector('.modal-title');
        const bodyEl = modalEl.querySelector('.modal-body');
        
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) {
            // Nếu bodyHtml là ID template -> Clone content
            if (bodyHtml.startsWith('#') || document.getElementById(bodyHtml)) {
                const tmplId = bodyHtml.replace('#', '');
                this.renderTemplate(tmplId, bodyEl.id, 'replace'); // bodyEl cần có ID, hoặc ta dùng querySelector bên trong renderTemplate
                // Fix nhanh: clear html và append template content thủ công ở đây cho an toàn
                bodyEl.innerHTML = '';
                const tmpl = document.getElementById(tmplId);
                if(tmpl) bodyEl.appendChild(tmpl.content.cloneNode(true));
            } else {
                // String HTML thuần
                bodyEl.innerHTML = bodyHtml;
            }
        }

        // 3. Reset Form bên trong (nếu có)
        const form = modalEl.querySelector('form');
        if (form) form.reset();

        // 4. Show Modal (Bootstrap 5 API)
        // Yêu cầu: bootstrap phải được load global ở index.html
        const modalInstance = new bootstrap.Modal(modalEl, {
            backdrop: 'static',
            keyboard: false
        });
        modalInstance.show();

        return modalInstance; // Trả về để controller có thể hide()
    }
};