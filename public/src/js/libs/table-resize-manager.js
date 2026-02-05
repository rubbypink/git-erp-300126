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

export default class TableResizeManager {
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

// Export for use
window.TableResizeManager = TableResizeManager;
