/**
 * =========================================================================
 * TABLE RESIZE MANAGER
 * Purpose: Thiết lập tính năng resize cột/hàng cho table
 * =========================================================================
 * 
 * Usage:
 * const resizer = new TableResizeManager('tableId');
 * resizer.init();
 * 
 * Features:
 * - Resize columns (bằng drag handle trên thead)
 * - Resize rows (bằng drag handle trên cột đầu tiên)
 * - Double-click để fit-content
 * - Maintain tổng kích thước table
 */

class TableResizeManager {
    constructor(tableId) {
        this.tableId = tableId;
        this.table = document.getElementById(tableId);

        if (!this.table) {
            console.error(`❌ Table với id "${tableId}" không tìm thấy`);
            return;
        }

        this.resizeState = {
            isResizing: false,
            resizeType: null, // 'column' hoặc 'row'
            startX: 0,
            startY: 0,
            startWidth: 0,
            startHeight: 0,
            columnIndex: -1,
            rowIndex: -1,
            nextColumnIndex: -1,
            nextRowIndex: -1
        };

        this.config = {
            handleSize: 8, // pixel
            handleColor: '#999',
            handleHoverColor: '#333'
        };
    }

    /**
     * Khởi tạo resize functionality
     */
    init() {
        if (!this.table) return;

        // Apply base styles
        this._applyBaseStyles();

        // Add column resize handles to thead
        this._addColumnResizeHandles();

        // Add row resize handles to first column
        this._addRowResizeHandles();

        console.log(`✅ TableResizeManager initialized for #${this.tableId}`);
    }

    /**
     * Apply base styles cho resize handles (không ảnh hưởng đến table style)
     * @private
     */
    _applyBaseStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #${this.tableId} .resize-handle-col {
                position: absolute;
                right: -0.5rem;
                top: 0;
                bottom: 0;
                width: 1rem;
                cursor: default;
                background: transparent;
                z-index: 10;
                user-select: none;
            }
            
            #${this.tableId} th:hover .resize-handle-col {
                cursor: col-resize;
            }
            
            #${this.tableId} .resize-handle-row {
                position: absolute;
                left: 0;
                right: 0;
                bottom: -0.4rem;
                height: 0.8rem;
                cursor: default;
                background: transparent;
                z-index: 10;
                user-select: none;
            }
            
            #${this.tableId} tr:hover .resize-handle-row {
                cursor: row-resize;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Thêm column resize handles vào thead
     * @private
     */
    _addColumnResizeHandles() {
        const thead = this.table.querySelector('thead');
        if (!thead) return;

        const headerCells = thead.querySelectorAll('th');

        headerCells.forEach((th, colIndex) => {
            // Skip last column (không resize được)
            if (colIndex === headerCells.length - 1) return;

            // Thiết lập padding-right để có chỗ cho handle
            th.style.paddingRight = '12px';

            const handle = document.createElement('div');
            handle.className = 'resize-handle-col';
            th.appendChild(handle);

            // Mouse down
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this._startColumnResize(e, colIndex);
            });

            // Double click - fit content
            handle.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._fitColumnContent(colIndex);
            });
        });
    }

    /**
     * Thêm row resize handles vào cột đầu tiên
     * @private
     */
    _addRowResizeHandles() {
        const tbody = this.table.querySelector('tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');

        rows.forEach((tr, rowIndex) => {
            // Skip last row (không resize được)
            if (rowIndex === rows.length - 1) return;

            const firstCell = tr.querySelector('td');
            if (!firstCell) return;

            // Thiết lập padding-bottom để có chỗ cho handle
            firstCell.style.paddingBottom = '12px';

            const handle = document.createElement('div');
            handle.className = 'resize-handle-row';
            firstCell.appendChild(handle);

            // Mouse down
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this._startRowResize(e, rowIndex);
            });

            // Double click - fit content
            handle.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._fitRowContent(rowIndex);
            });
        });
    }

    /**
     * Bắt đầu resize cột
     * Lưu width của TẤT CẢ các cột để lock chúng khi dragging
     * Chỉ cột được resize thay đổi, các cột khác giữ nguyên width
     * @private
     */
    _startColumnResize(e, colIndex) {
        this.resizeState.isResizing = true;
        this.resizeState.resizeType = 'column';
        this.resizeState.startX = e.clientX;
        this.resizeState.columnIndex = colIndex;

        // Get current width of resizing column
        const colCell = this._getColumnCells(colIndex)[0];
        if (colCell) {
            this.resizeState.startWidth = colCell.offsetWidth;
        }

        // ✅ Lock width của TẤT CẢ các cột khác
        // Điều này ngăn browser co lại các cột khác
        this.resizeState.allColumnWidths = {};
        const thead = this.table.querySelector('thead');
        if (thead) {
            const headerCells = thead.querySelectorAll('th');
            headerCells.forEach((th, idx) => {
                const width = th.offsetWidth;
                this.resizeState.allColumnWidths[idx] = width;
                // Set explicit width cho tất cả cột (lock width)
                th.style.width = width + 'px';
            });
        }

        // Add active class
        this._getColumnCells(colIndex).forEach(cell => {
            cell.classList.add('resizing');
        });

        // Mouse move & up
        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('mouseup', this._onMouseUp.bind(this));
    }

    /**
     * Bắt đầu resize hàng
     * @private
     */
    _startRowResize(e, rowIndex) {
        this.resizeState.isResizing = true;
        this.resizeState.resizeType = 'row';
        this.resizeState.startY = e.clientY;
        this.resizeState.rowIndex = rowIndex;
        this.resizeState.nextRowIndex = rowIndex + 1;

        // Get current heights
        const rows = this.table.querySelectorAll('tbody tr');
        const row = rows[rowIndex];
        const nextRow = rows[rowIndex + 1];

        if (row && nextRow) {
            this.resizeState.startHeight = row.offsetHeight;
            this.resizeState.nextHeight = nextRow.offsetHeight;
        }

        // Add active class
        row.classList.add('resizing');

        // Mouse move & up
        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('mouseup', this._onMouseUp.bind(this));
    }

    /**
     * Handle mouse move during resize
     * @private
     */
    _onMouseMove(e) {
        if (!this.resizeState.isResizing) return;

        if (this.resizeState.resizeType === 'column') {
            this._resizeColumn(e);
        } else if (this.resizeState.resizeType === 'row') {
            this._resizeRow(e);
        }
    }

    /**
     * Resize column
     * ✅ Chỉ cột đang resize thay đổi
     * Tất cả các cột khác giữ nguyên width (fixed)
     * @private
     */
    _resizeColumn(e) {
        const delta = e.clientX - this.resizeState.startX;
        const minWidth = 50; // Minimum width

        const newWidth = Math.max(minWidth, this.resizeState.startWidth + delta);

        // Update cột đang resize
        this._getColumnCells(this.resizeState.columnIndex).forEach(cell => {
            cell.style.width = newWidth + 'px';
            cell.style.minWidth = newWidth + 'px';
        });

        // ✅ Ensure tất cả các cột khác giữ nguyên width (prevent shrinking)
        // Loop qua allColumnWidths và set width cố định cho tất cả
        if (this.resizeState.allColumnWidths) {
            const thead = this.table.querySelector('thead');
            if (thead) {
                const headerCells = thead.querySelectorAll('th');
                headerCells.forEach((th, idx) => {
                    // Cột đang resize thì bỏ qua (đã update ở trên)
                    if (idx === this.resizeState.columnIndex) return;

                    // Cột khác: set width = original width (lock nó)
                    const originalWidth = this.resizeState.allColumnWidths[idx];
                    if (originalWidth) {
                        th.style.width = originalWidth + 'px';
                        th.style.minWidth = originalWidth + 'px';
                    }
                });
            }
        }
    }

    /**
     * Resize row
     * @private
     */
    _resizeRow(e) {
        const delta = e.clientY - this.resizeState.startY;
        const minHeight = 30; // Minimum height

        const newHeight = Math.max(minHeight, this.resizeState.startHeight + delta);
        const newNextHeight = Math.max(minHeight, this.resizeState.nextHeight - delta);

        // Apply height to current row
        const rows = this.table.querySelectorAll('tbody tr');
        const row = rows[this.resizeState.rowIndex];
        const nextRow = rows[this.resizeState.nextRowIndex];

        if (row) {
            row.style.height = newHeight + 'px';
            row.style.minHeight = newHeight + 'px';
        }

        if (nextRow) {
            nextRow.style.height = newNextHeight + 'px';
            nextRow.style.minHeight = newNextHeight + 'px';
        }
    }

    /**
     * Handle mouse up (end resize)
     * @private
     */
    _onMouseUp(e) {
        if (!this.resizeState.isResizing) return;

        // Remove active class
        if (this.resizeState.resizeType === 'column') {
            this._getColumnCells(this.resizeState.columnIndex).forEach(cell => {
                cell.classList.remove('resizing');
            });
        } else if (this.resizeState.resizeType === 'row') {
            const rows = this.table.querySelectorAll('tbody tr');
            rows[this.resizeState.rowIndex].classList.remove('resizing');
        }

        // Reset state
        this.resizeState.isResizing = false;
        this.resizeState.resizeType = null;

        // Remove listeners
        document.removeEventListener('mousemove', this._onMouseMove.bind(this));
        document.removeEventListener('mouseup', this._onMouseUp.bind(this));
    }

    /**
     * Fit column width theo content
     * Set width của cột thành fit-content (co lại tối đa)
     * Table giãn ra nếu cần (horizontal scroll)
     * Các cột khác không bị ảnh hưởng
     * @private
     */
    _fitColumnContent(colIndex) {
        const cells = this._getColumnCells(colIndex);
        if (cells.length === 0) return;

        let maxWidth = 50; // minimum

        // Đo content width từ mỗi cell
        cells.forEach(cell => {
            // ✅ Reset để đo chính xác - BỎ step restore originalWidth
            // Vì originalWidth có thể là width từ drag resize trước
            cell.style.width = 'min-content';
            cell.style.minWidth = 'auto';
            cell.style.maxWidth = 'none';

            // Lấy content width - không cộng 20px vì scrollWidth đã là chính xác
            const contentWidth = cell.scrollWidth;
            maxWidth = Math.max(maxWidth, contentWidth);

        });

        // Apply width = fit-content (co lại, không giãn)
        // ✅ Chỉ set width, KHÔNG set minWidth/maxWidth
        // Điều này cho phép cột co nhỏ lại mà không bị khóa
        cells.forEach(cell => {
            cell.style.width = maxWidth + 'px';
            // ❌ Bỏ minWidth - nó sẽ khóa không cho co lại
            // ❌ Bỏ maxWidth - không cần thiết
        });
    }

    /**
     * Fit row height theo content
     * @private
     */
    _fitRowContent(rowIndex) {
        const rows = this.table.querySelectorAll('tbody tr');
        const row = rows[rowIndex];

        if (!row) return;

        // Restore auto height để measure
        row.style.height = 'auto';
        row.style.minHeight = 'auto';

        const contentHeight = row.scrollHeight;

        // Apply new height
        row.style.height = contentHeight + 'px';
        row.style.minHeight = contentHeight + 'px';
    }

    /**
     * Get tất cả cells trong 1 column
     * @private
     */
    _getColumnCells(colIndex) {
        const cells = [];

        // Thead cells
        const thead = this.table.querySelector('thead');
        if (thead) {
            const headerCells = thead.querySelectorAll('th');
            if (headerCells[colIndex]) {
                cells.push(headerCells[colIndex]);
            }
        }

        // Tbody cells
        const tbody = this.table.querySelector('tbody');
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const tds = row.querySelectorAll('td');
                if (tds[colIndex]) {
                    cells.push(tds[colIndex]);
                }
            });
        }

        return cells;
    }

    /**
     * Destroy & cleanup
     */
    destroy() {
        // Remove event listeners
        document.removeEventListener('mousemove', this._onMouseMove.bind(this));
        document.removeEventListener('mouseup', this._onMouseUp.bind(this));

        // Remove handles
        this.table.querySelectorAll('.resize-handle-col, .resize-handle-row').forEach(handle => {
            handle.remove();
        });

        console.log(`✅ TableResizeManager destroyed for #${this.tableId}`);
    }
}

/**
 * 9TRIP HELPER: UNIVERSAL DRAGGABLE SETUP
 * Áp dụng cho: Bootstrap Modal, Card UI, Widget, Floating Elements
 * Tối ưu: GPU Acceleration (translate3d), Dynamic Events, Mobile Support
 */
class DraggableSetup {
    // ✅ Static: Lưu all instances và flag để set event 1 lần
    static instances = [];
    static isDblClickListenerAdded = false;
    static isTouchDoubleTapListenerAdded = false;

    /**
     * @param {string} elementId - ID của phần tử gốc chứa đối tượng cần kéo
     * @param {Object} options - Cấu hình linh hoạt (targetSelector, handleSelector)
     */
    constructor(elementId, options = { targetSelector: '.modal-dialog', handleSelector: '.modal-header' }) {
        try {
            this.wrapper = $(elementId);
            if (!this.wrapper) return;

            // 1. Xác định CÁI GÌ SẼ DI CHUYỂN (Target)
            // Nếu là Modal thì truyền vào '.modal-dialog', nếu là Widget thì không cần truyền (tự lấy wrapper)
            this.target = options.targetSelector ? this.wrapper.querySelector(options.targetSelector) : this.wrapper;

            // 2. Xác định NẮM VÀO ĐÂU ĐỂ KÉO (Handle)
            // Thường là '.modal-header' hoặc '.card-header'. Mặc định là cầm vào đâu cũng kéo được.
            this.handle = options.handleSelector ? this.wrapper.querySelector(options.handleSelector) : this.target;

            if (!this.target || !this.handle) {
                console.warn(`DraggableSetup: Không tìm thấy target hoặc handle cho #${elementId}`);
                return;
            }

            // State quản lý tọa độ
            this.isDragging = false;
            this.currentX = 0; this.currentY = 0;
            this.initialX = 0; this.initialY = 0;
            this.xOffset = 0; this.yOffset = 0;

            // ★ Lưu initial offset (vị trí center ban đầu khi mở modal)
            this.initialCenterOffsetX = 0;
            this.initialCenterOffsetY = 0;
            this.hasInitialOffset = false; // Flag để đánh dấu lần đầu set offset

            // ✅ RAF throttle - Tránh schedule RAF liên tục trên mỗi mousemove
            this.rafId = null;
            this.pendingX = 0;
            this.pendingY = 0;

            // ✅ Touch double-tap detection (mobile support)
            this.lastTouchTime = 0;
            this.lastTouchX = 0;
            this.lastTouchY = 0;

            // Bind context
            this.dragStart = this.dragStart.bind(this);
            this.dragMove = this.dragMove.bind(this);
            this.dragEnd = this.dragEnd.bind(this);

            // Thêm instance vào static list
            DraggableSetup.instances.push(this);

            this.init();
        } catch (error) {
            console.error(`DraggableSetup: Lỗi khởi tạo cho #${elementId}`, error);
        }
    }

    init() {
        // Chỉ gắn sự kiện vào vùng tay cầm (handle)
        this.handle.addEventListener("mousedown", this.dragStart);
        this.handle.addEventListener("touchstart", this.dragStart, { passive: false });

        // CSS báo hiệu cho người dùng
        this.handle.style.cursor = "move";
        this.target.style.willChange = "transform"; // Gợi ý trình duyệt tối ưu GPU trước

        // ★ Lưu initial center offset lần đầu (vị trí mặc định khi modal mở)
        if (!this.hasInitialOffset) {
            this.initialCenterOffsetX = this.xOffset;
            this.initialCenterOffsetY = this.yOffset;
            this.hasInitialOffset = true;
        }

        // ✅ Set event dblclick TOÀN giao diện - chỉ 1 lần cho toàn bộ class (Desktop)
        // Kiểm tra event.target nằm trong phạm vi element nào để reset
        if (!DraggableSetup.isDblClickListenerAdded) {
            document.addEventListener('dblclick', (e) => {
                // Tìm instance nào chứa event target
                DraggableSetup.instances.forEach(instance => {
                    // Kiểm tra xem click target có nằm trong element này không
                    if (instance.wrapper.contains(e.target)) {
                        // Chỉ reset nếu element này header bị khuất
                        if (instance._isHeaderHidden()) {
                            instance._centerElement();
                        }
                    }
                });
            });
            DraggableSetup.isDblClickListenerAdded = true;
        }

        // ✅ Set event touchend TOÀN giao diện - chỉ 1 lần cho toàn bộ class (Mobile - Double Tap)
        // Detect touch double-tap: 2 tap < 300ms, di chuyển < 20px
        if (!DraggableSetup.isTouchDoubleTapListenerAdded) {
            document.addEventListener('touchend', (e) => {
                const currentTime = Date.now();
                const currentX = e.changedTouches[0]?.clientX || 0;
                const currentY = e.changedTouches[0]?.clientY || 0;

                // Tính khoảng cách từ tap cuối cùng
                const dx = currentX - DraggableSetup._lastTapX;
                const dy = currentY - DraggableSetup._lastTapY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Kiểm tra: time < 300ms và khoảng cách < 20px
                const isDoubleTap = (currentTime - DraggableSetup._lastTapTime) < 300 && distance < 20 && window.innerWidth < 991; // Chỉ áp dụng trên mobile

                if (isDoubleTap) {
                    // Tìm instance nào chứa event target
                    DraggableSetup.instances.forEach(instance => {
                        if (instance.wrapper.contains(e.target)) {
                            if (instance._isHeaderHidden()) {
                                instance._centerElement();
                            }
                        }
                    });

                    // Reset lastTap để tránh trigger 3x tap
                    DraggableSetup._lastTapTime = 0;
                } else {
                    // Lưu lại tap hiện tại
                    DraggableSetup._lastTapTime = currentTime;
                    DraggableSetup._lastTapX = currentX;
                    DraggableSetup._lastTapY = currentY;
                }
            }, { passive: true });

            // Initialize static tap tracking
            DraggableSetup._lastTapTime = 0;
            DraggableSetup._lastTapX = 0;
            DraggableSetup._lastTapY = 0;
            DraggableSetup.isTouchDoubleTapListenerAdded = true;
        }
    }

    dragStart(e) {
        if (e.type === "touchstart") {
            this.initialX = e.touches[0].clientX - this.xOffset;
            this.initialY = e.touches[0].clientY - this.yOffset;
        } else {
            this.initialX = e.clientX - this.xOffset;
            this.initialY = e.clientY - this.yOffset;
        }

        // Kiểm tra xem có đúng là click vào handle không (tránh click vào input bên trong)
        if (e.target === this.handle || this.handle.contains(e.target)) {
            // Không chặn sự kiện mặc định ở đây để user vẫn click được input/button nếu có

            this.isDragging = true;
            this.target.classList.add('is-moving');

            // Lưu lại transition cũ để khôi phục sau khi kéo xong
            this.oldTransition = window.getComputedStyle(this.target).transition;
            this.target.style.transition = "none";

            document.addEventListener("mousemove", this.dragMove);
            document.addEventListener("touchmove", this.dragMove, { passive: false });
            document.addEventListener("mouseup", this.dragEnd);
            document.addEventListener("touchend", this.dragEnd, { passive: false });
        }
    }

    dragMove(e) {
        if (!this.isDragging) return;

        if (e.type === "touchmove") {
            e.preventDefault();
            this.pendingX = e.touches[0].clientX - this.initialX;
            this.pendingY = e.touches[0].clientY - this.initialY;
        } else {
            this.pendingX = e.clientX - this.initialX;
            this.pendingY = e.clientY - this.initialY;
        }

        // ✅ RAF throttle: Chỉ schedule RAF một lần, không mỗi event
        if (this.rafId) return; // RAF đã scheduled, bỏ qua

        this.rafId = requestAnimationFrame(() => {
            this.currentX = this.pendingX;
            this.currentY = this.pendingY;
            this.xOffset = this.currentX;
            this.yOffset = this.currentY;

            this.target.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0)`;
            this.rafId = null; // Clear flag để RAF tiếp theo được schedule
        });
    }

    dragEnd() {
        if (!this.isDragging) return;

        // ✅ Cancel RAF nếu còn pending
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        this.initialX = this.currentX;
        this.initialY = this.currentY;
        this.isDragging = false;

        this.target.classList.remove('is-moving');

        // Khôi phục lại transition mặc định của Bootstrap/CSS
        this.target.style.transition = this.oldTransition;

        document.removeEventListener("mousemove", this.dragMove);
        document.removeEventListener("touchmove", this.dragMove);
        document.removeEventListener("mouseup", this.dragEnd);
        document.removeEventListener("touchend", this.dragEnd);
    }

    /**
     * Kiểm tra header có bị khuất khỏi viewport không
     * @private
     */
    _isHeaderHidden() {
        const header = this.target.querySelector('.modal-header') || this.target.querySelector('header');
        if (!header) return false;

        const rect = header.getBoundingClientRect();
        // Header bị khuất nếu: top < 0 (kéo lên quá) hoặc top > window.innerHeight (kéo xuống quá)
        return rect.top < 0 || rect.top > window.innerHeight;
    }

    /**
     * Reset element về giữa màn hình
     * ✅ Được gọi khi dblclick vào element này mà header bị khuất
     * @private
     */
    _centerElement() {
        // ★ Restore về vị trí center ban đầu (khi modal lần đầu mở)
        // Không tính toán lại - chỉ restore initial offset đã lưu
        this.xOffset = this.initialCenterOffsetX;
        this.yOffset = this.initialCenterOffsetY;
        this.currentX = this.initialCenterOffsetX;
        this.currentY = this.initialCenterOffsetY;

        // Apply transform
        this.target.style.transform = `translate3d(${this.initialCenterOffsetX}px, ${this.initialCenterOffsetY}px, 0)`;
        console.log(`[DraggableSetup] 🎯 Restored to initial center offset`);
    }
}

/**
 * 9TRIP HELPER: UNIVERSAL RESIZABLE
 * Tương thích hoàn hảo với FreeMover và Bootstrap
 */
class Resizable {
    constructor(elementId, options = { targetSelector: '.modal-dialog', handleSelector: '.modal-header' }) {
        try {
            this.wrapper = $(elementId);
            if (!this.wrapper) return;
            log(`Resizable: Đang khởi tạo cho #${elementId}`);

            // Target thực sự cần thay đổi kích thước (Ví dụ: .modal-content thay vì cả cái modal)
            this.target = options.targetSelector ? this.wrapper.querySelector(options.targetSelector) : this.wrapper;
            if (!this.target) return;

            // Cấu hình giới hạn kích thước
            this.minWidth = options.minWidth || 250;
            this.minHeight = options.minHeight || 150;

            // State
            this.isResizing = false;
            this.initialWidth = 0;
            this.initialHeight = 0;
            this.startX = 0;
            this.startY = 0;

            // ✅ RAF throttle - Tránh schedule RAF liên tục trên mỗi mousemove
            this.rafId = null;
            this.pendingWidth = 0;
            this.pendingHeight = 0;

            // Bind context
            this.resizeStart = this.resizeStart.bind(this);
            this.resizeMove = this.resizeMove.bind(this);
            this.resizeEnd = this.resizeEnd.bind(this);

            this.init();
        } catch (error) {
            console.error(`Resizable: Lỗi khởi tạo cho #${elementId}`, error);
        }
    }

    init() {
        if (this._initialized) {
            console.warn('[Resizable] Đã khởi tạo rồi, bỏ qua...');
            return;
        }
        this._initialized = true;
        // Tự động tạo một cái "tay cầm" (handle) ở góc dưới cùng bên phải nếu chưa có
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'erp-resize-handle';
        this.target.appendChild(this.resizeHandle);
        this.target.style.position = 'relative'; // Cần thiết để handle bám vào góc

        // Gắn sự kiện mousedown / touchstart
        this.resizeHandle.addEventListener('mousedown', this.resizeStart);
        this.resizeHandle.addEventListener('touchstart', this.resizeStart, { passive: false });
    }

    resizeStart(e) {
        e.preventDefault(); // Ngăn hành vi kéo text mặc định
        e.stopPropagation(); // Ngăn sự kiện lan lên FreeMover (nếu có)

        this.isResizing = true;

        // Lấy kích thước hiện tại của phần tử
        const rect = this.target.getBoundingClientRect();
        this.initialWidth = rect.width;
        this.initialHeight = rect.height;

        if (e.type === "touchstart") {
            this.startX = e.touches[0].clientX;
            this.startY = e.touches[0].clientY;
        } else {
            this.startX = e.clientX;
            this.startY = e.clientY;
        }

        // Linh hoạt gắn sự kiện vào document (Giống FreeMover)
        document.addEventListener("mousemove", this.resizeMove);
        document.addEventListener("touchmove", this.resizeMove, { passive: false });
        document.addEventListener("mouseup", this.resizeEnd);
        document.addEventListener("touchend", this.resizeEnd);

        this.target.classList.add('is-resizing');
    }

    resizeMove(e) {
        if (!this.isResizing) return;
        e.preventDefault();

        let currentX, currentY;
        if (e.type === "touchmove") {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        } else {
            currentX = e.clientX;
            currentY = e.clientY;
        }

        // Tính toán độ lệch
        const dx = currentX - this.startX;
        const dy = currentY - this.startY;

        // Tính toán kích thước mới với giới hạn (minWidth, minHeight)
        this.pendingWidth = Math.max(this.initialWidth + dx, this.minWidth);
        this.pendingHeight = Math.max(this.initialHeight + dy, this.minHeight);

        // ✅ RAF throttle: Chỉ schedule RAF một lần
        if (this.rafId) return; // RAF đã scheduled, bỏ qua

        this.rafId = requestAnimationFrame(() => {
            this.target.style.width = `${this.pendingWidth}px`;
            this.target.style.height = `${this.pendingHeight}px`;
            this.target.style.flex = 'none'; // Ghi đè flex của bootstrap nếu có
            this.rafId = null; // Clear flag để RAF tiếp theo được schedule
        });
    }

    resizeEnd() {
        if (!this.isResizing) return;

        // ✅ Cancel RAF nếu còn pending
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        this.isResizing = false;
        this.target.classList.remove('is-resizing');

        // Dọn dẹp sự kiện
        document.removeEventListener("mousemove", this.resizeMove);
        document.removeEventListener("touchmove", this.resizeMove);
        document.removeEventListener("mouseup", this.resizeEnd);
        document.removeEventListener("touchend", this.resizeEnd);
    }
}

/**
 * 9TRIP HELPER: UNIVERSAL WINDOW MINIMIZER
 * Tạo hiệu ứng thu nhỏ cửa sổ xuống Taskbar ảo
 * ✅ Tối ưu: Tự động loại bỏ modal-dialog-centered để tránh xung đột với DraggableSetup
 * 
 * @param {string} elementId - ID của modal hoặc cửa sổ cần minimize
 * @param {Object} options - Cấu hình
 *   - options.title (string) - Tên hiển thị trong taskbar (auto-detect nếu không có)
 *   - options.btnSelector (string) - Selector của nút minimize (default: '.btn-minimize')
 *   - options.removeCenteredClass (boolean) - Loại bỏ modal-dialog-centered khi minimize (default: true)
 * 
 * @example
 * const minimizer = new WindowMinimizer('#myModal', { 
 *   title: 'My Window',
 *   removeCenteredClass: true
 * });
 */
class WindowMinimizer {
    constructor(elementId, options = {}) {
        try {
            this.target = $(elementId);
            if (!this.target) return;

            // ✅ Configuration
            this.title = this._resolveTitle(options.title);
            this.minimizeBtn = this.target.querySelector(options.btnSelector || '.btn-minimize');
            this.removeCenteredClass = options.removeCenteredClass !== false; // Default true

            // ✅ Lưu trạng thái Bootstrap classes để restore nếu cần
            this.savedClasses = null;

            this.initTaskbar();

            if (this.minimizeBtn) {
                this.minimizeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.minimize();
                });
            }
        } catch (error) {
            console.error(`WindowMinimizer: Lỗi khởi tạo cho #${elementId}`, error);
        }
    }

    /**
     * Xác định title từ options hoặc từ DOM element
     * ✅ Tối ưu: Lấy text ngoài các thẻ button/icon
     * @private
     */
    _resolveTitle(providedTitle) {
        // Nếu có truyền title vào options thì dùng luôn
        if (providedTitle) return providedTitle;

        // Tự động tìm .modal-header hoặc header trong element
        const headerEl = this.target.querySelector('.modal-header') || this.target.querySelector('header');
        if (headerEl) {
            // ✅ Tối ưu: Clone element, xóa icons/buttons, lấy text
            const cloned = headerEl.cloneNode(true);
            cloned.querySelectorAll('button, i, svg').forEach(el => el.remove());

            const titleText = cloned.textContent?.trim();
            if (titleText) return titleText;
        }

        // Fallback: mặc định
        return 'Cửa sổ làm việc';
    }

    /**
     * ✅ Kiểm tra xem modal có class Bootstrap layout không
     * Để quyết định loại bỏ hay bảo tồn
     * @private
     */
    _getModalDialog() {
        // Tìm .modal-dialog (nếu là Bootstrap modal)
        return this.target.querySelector('.modal-dialog') || this.target;
    }

    /**
     * Khởi tạo Taskbar global (chỉ 1 lần)
     * @private
     */
    initTaskbar() {
        this.taskbarId = 'erp-global-taskbar';
        this.taskbar = document.getElementById(this.taskbarId);

        if (!this.taskbar) {
            this.taskbar = document.createElement('div');
            this.taskbar.id = this.taskbarId;
            this.taskbar.className = 'erp-taskbar';
            document.body.appendChild(this.taskbar);
        }
    }

    /**
     * Thu nhỏ cửa sổ
     * ✅ Tối ưu: Loại bỏ modal-dialog-centered để tránh xung đột khi drag
     */
    minimize() {
        // 1. Lưu display cũ để phục hồi
        this.oldDisplay = window.getComputedStyle(this.target).display;

        // 2. ✅ Loại bỏ modal-dialog-centered nếu có
        // Vì: Modal đã bị drag không cần centered, sẽ xung đột với transform
        const modalDialog = this._getModalDialog();
        if (this.removeCenteredClass && modalDialog) {
            if (modalDialog.classList.contains('modal-dialog-centered')) {
                // Lưu lại để có thể restore nếu cần (optional)
                this.hadCenteredClass = true;
                modalDialog.classList.remove('modal-dialog-centered');
            }
        }

        // 3. Ẩn cửa sổ
        this.target.style.display = 'none';

        // 4. Tạo nút trong Taskbar
        this.taskItem = document.createElement('button');
        this.taskItem.className = 'btn btn-primary btn-sm erp-task-item';
        this.taskItem.innerHTML = `<i class="fa-solid fa-window-restore me-2"></i>${this.title}`;
        this.taskItem.addEventListener('click', () => this.restore());

        this.taskbar.appendChild(this.taskItem);
    }

    /**
     * Khôi phục cửa sổ
     * ✅ Tối ưu: Có thể restore modal-dialog-centered nếu user chọn
     */
    restore() {
        // 1. Hiện lại cửa sổ
        this.target.style.display = this.oldDisplay;

        // 2. ✅ Restore modal-dialog-centered nếu nó đã bị loại bỏ
        // (Optional: Chỉ restore nếu cấu hình restoreCenteredClass = true)
        if (this.hadCenteredClass && this.removeCenteredClass) {
            const modalDialog = this._getModalDialog();
            if (modalDialog && !modalDialog.classList.contains('modal-dialog-centered')) {
                // ✅ Tối ưu: Không restore vì modal do drag không cần centered
                // Nếu user muốn restore, có thể thêm option: restoreCenteredClass
                // modalDialog.classList.add('modal-dialog-centered');
            }
        }

        // 3. Trigger animation popIn
        requestAnimationFrame(() => {
            this.target.style.animation = 'popIn 0.3s ease forwards';
        });

        // 4. Xóa nút khỏi Taskbar
        if (this.taskItem) {
            this.taskItem.remove();
        }

        // 5. ✅ Cleanup: Xóa Taskbar nếu không còn item nào
        if (this.taskbar) {
            const remainingItems = this.taskbar.querySelectorAll('.erp-task-item');
            if (remainingItems.length === 0) {
                this.taskbar.remove();
                this.taskbar = null;
            }
        }
    }
}

export { DraggableSetup, TableResizeManager, Resizable, WindowMinimizer };
window.DraggableSetup = DraggableSetup;
window.TableResizeManager = TableResizeManager;
window.Resizable = Resizable;
window.WindowMinimizer = WindowMinimizer;