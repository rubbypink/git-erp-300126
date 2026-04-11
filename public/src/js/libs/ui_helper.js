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
    const _cfg = A.getState(`table.resizers.${tableId}`);
    if (_cfg) {
      const existingInstance = _cfg;
      const dom = document.getElementById(tableId);
      if (dom && existingInstance) {
        existingInstance.table = dom;
        return existingInstance;
      }
    }

    // 2. Nếu chưa có, mới thực hiện khởi tạo lần đầu
    this.tableId = tableId;
    this.table = document.getElementById(tableId);
    // ... các thiết lập mặc định khác ...

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
      nextRowIndex: -1,
    };

    // Ghi nhớ kích thước cột
    this.columnWidths = {};

    this.config = {
      handleSize: 8, // pixel
      handleColor: '#999',
      handleHoverColor: '#333',
    };

    // ✅ Bind method refs 1 lần duy nhất (tránh .bind() mỗi lần gọi → memory leak)
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    // Trong constructor của TableResizeManager
    A.setState(`table.resizers.${tableId}`, this);
  }

  /**
   * Khởi tạo resize functionality
   */
  init() {
    if (!this.table) return;

    // Apply base styles
    this._applyBaseStyles();

    // Áp dụng lại kích thước đã lưu (nếu có)
    this._applySavedWidths();

    // Add column resize handles to all rows in tbody
    this._addColumnResizeHandles();

    // Add row resize handles to first column
    // this._addRowResizeHandles();
  }

  /**
   * Áp dụng lại kích thước cột đã lưu
   * @private
   */
  _applySavedWidths() {
    Object.entries(this.columnWidths).forEach(([colIndex, width]) => {
      const cells = this._getColumnCells(parseInt(colIndex));
      cells.forEach((cell) => {
        cell.style.width = width + 'px';
        cell.style.minWidth = width + 'px';
      });
    });
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
                right: -2px;
                top: 0;
                bottom: 0;
                width: 4px;
                cursor: col-resize;
                background: transparent;
                z-index: 10;
                user-select: none;
                transition: background 0.2s;
            }
            
            #${this.tableId} .resize-handle-col:hover {
                background: rgba(0, 123, 255, 0.5);
            }
            
            #${this.tableId} .resize-handle-row {
                position: absolute;
                left: 0;
                right: 0;
                bottom: -0.4rem;
                height: 0.8rem;
                cursor: default;
                background: transparent;
                z-index: 11;
                user-select: none;
            }
            
            #${this.tableId} tr:hover .resize-handle-row {
                cursor: row-resize;
            }
        `;
    document.head.appendChild(style);
  }

  /**
   * Thêm column resize handles vào tất cả các hàng trong tbody
   * @private
   */
  _addColumnResizeHandles() {
    const tbody = this.table.querySelector('tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;

    rows.forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      cells.forEach((td, colIndex) => {
        // Skip last column (không resize được)
        if (colIndex === cells.length - 1) return;

        // Thiết lập position relative để handle bám theo ô
        td.style.position = 'relative';

        const handle = document.createElement('div');
        handle.className = 'resize-handle-col';
        td.appendChild(handle);

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
    this._getColumnCells(colIndex).forEach((cell) => {
      cell.classList.add('resizing');
    });

    // Mouse move & up (dùng bound ref đã lưu)
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
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

    // Mouse move & up (dùng bound ref đã lưu)
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
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
    this._getColumnCells(this.resizeState.columnIndex).forEach((cell) => {
      cell.style.width = newWidth + 'px';
      cell.style.minWidth = newWidth + 'px';
    });

    // Lưu lại kích thước mới
    this.columnWidths[this.resizeState.columnIndex] = newWidth;

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
      this._getColumnCells(this.resizeState.columnIndex).forEach((cell) => {
        cell.classList.remove('resizing');
      });
    } else if (this.resizeState.resizeType === 'row') {
      const rows = this.table.querySelectorAll('tbody tr');
      rows[this.resizeState.rowIndex].classList.remove('resizing');
    }

    // Reset state
    this.resizeState.isResizing = false;
    this.resizeState.resizeType = null;

    // Remove listeners (dùng đúng ref đã lưu → removeEventListener khớp)
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
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
    cells.forEach((cell) => {
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
    cells.forEach((cell) => {
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
      rows.forEach((row) => {
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
    // Remove event listeners (dùng đúng ref đã lưu)
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);

    // Remove handles
    this.table.querySelectorAll('.resize-handle-col, .resize-handle-row').forEach((handle) => {
      handle.remove();
    });

    console.log(`✅ TableResizeManager destroyed for #${this.tableId}`);
  }
}

/**
 * ==============================================================================
 * 9TRIP HELPER: DRAG & DROP SYSTEM (OPTIMIZED & MODULED)
 * Bao gồm:
 * 1. FloatDraggable: Dùng cho Modal, Widget tự do.
 * 2. Sortable: Dùng để sắp xếp list, table.
 * 3. indexAfterDrag: Global Helper cập nhật lại Index/ID sau khi sort.
 * * Lưu ý: Các Class sử dụng A.Event.on để quản lý sự kiện an toàn, chống rác RAM.
 * ==============================================================================
 */

/**
 * Hàm Helper chạy tự động sau khi Drag xong dành riêng cho 9Trip ERP.
 * Cập nhật data-row và định dạng lại id của thẻ nếu cần.
 * * @param {Array} sortedData - Mảng trả về từ onSortEnd của Sortable
 * @param {Object} opts - Tùy chọn để tùy biến attribute cần cập nhật
 */
const indexAfterDrag = (sortedData, opts = { indexAttr: 'data-row' }) => {
  try {
    sortedData.forEach((data, index) => {
      const el = data.element;

      // 1. Cập nhật data-row (hoặc thuộc tính tùy chọn)
      el.setAttribute(opts.indexAttr, index);

      // 2. Xử lý chuẩn hóa ID của dòng (Row ID)
      if (el.id) {
        // Nếu id có chứa 'row-x' (vd: service-row-2), thì update số cuối cùng
        if (/row-\d+/.test(el.id)) {
          el.id = el.id.replace(/row-\d+/, `row-${index}`);
        }
      } else {
        // Nếu chưa có ID thì gán mặc định
        el.id = `row-${index}`;
      }
    });
    // Log nhẹ để trace debug nếu cần
    console.log(`indexAfterDrag: Updated ${sortedData.length} items`);
  } catch (error) {
    console.error('indexAfterDrag: Lỗi trong quá trình cập nhật index', error);
  }
};

/**
 * 1. FLOAT DRAGGABLE (Modal, Card UI)
 * Sử dụng 100% Native Event để đạt 60fps mượt mà và tránh conflict với EventManager.
 */
class FloatDraggable {
  constructor(elementId, options = { targetSelector: '.modal-dialog', handleSelector: '.modal-header' }) {
    try {
      this.wrapper = typeof elementId === 'string' ? getE(elementId) : elementId;
      if (!this.wrapper) return;

      this.target = options.targetSelector ? this.wrapper.querySelector(options.targetSelector) : this.wrapper;
      this.handle = options.handleSelector ? this.wrapper.querySelector(options.handleSelector) : this.target;

      if (!this.target || !this.handle) return;

      this.isDragging = false;
      this.currentX = 0;
      this.currentY = 0;
      this.initialX = 0;
      this.initialY = 0;
      this.xOffset = 0;
      this.yOffset = 0;
      this.rafId = null;

      this.dragStart = this.dragStart.bind(this);
      this.dragMove = this.dragMove.bind(this);
      this.dragEnd = this.dragEnd.bind(this);
      this.resetPosition = this.resetPosition.bind(this);

      this.init();
    } catch (error) {
      console.error(`FloatDraggable: Lỗi khởi tạo`, error);
    }
  }

  init() {
    this.handle.style.cursor = 'move';
    this.target.style.willChange = 'transform';

    // Sử dụng Native Event an toàn tuyệt đối
    this.handle.addEventListener('mousedown', this.dragStart);
    this.handle.addEventListener('touchstart', this.dragStart, { passive: false });

    this.wrapper.addEventListener('dblclick', (e) => {
      if (e.ctrlKey || e.metaKey) this.resetPosition();
    });
  }

  dragStart(e) {
    if (e.target !== this.handle && !this.handle.contains(e.target)) return;

    const isTouch = e.type === 'touchstart';
    this.initialX = (isTouch ? e.touches[0].clientX : e.clientX) - this.xOffset;
    this.initialY = (isTouch ? e.touches[0].clientY : e.clientY) - this.yOffset;

    this.isDragging = true;
    this.target.classList.add('is-moving');
    this.oldTransition = window.getComputedStyle(this.target).transition;
    this.target.style.transition = 'none';

    // Lắng nghe trên document bằng Native API
    document.addEventListener('mousemove', this.dragMove);
    document.addEventListener('touchmove', this.dragMove, { passive: false });
    document.addEventListener('mouseup', this.dragEnd);
    document.addEventListener('touchend', this.dragEnd, { passive: false });
  }

  dragMove(e) {
    if (!this.isDragging) return;
    if (e.type === 'touchmove') e.preventDefault();

    const pendingX = (e.type === 'touchmove' ? e.touches[0].clientX : e.clientX) - this.initialX;
    const pendingY = (e.type === 'touchmove' ? e.touches[0].clientY : e.clientY) - this.initialY;

    if (this.rafId) return;

    this.rafId = requestAnimationFrame(() => {
      this.currentX = pendingX;
      this.currentY = pendingY;
      this.xOffset = this.currentX;
      this.yOffset = this.currentY;

      this.target.style.transform = `translate3d(${this.currentX}px, ${this.currentY}px, 0)`;
      this.rafId = null;
    });
  }

  dragEnd() {
    if (!this.isDragging) return;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.initialX = this.currentX;
    this.initialY = this.currentY;
    this.isDragging = false;

    this.target.classList.remove('is-moving');
    this.target.style.transition = this.oldTransition;

    // Xóa Native Events
    document.removeEventListener('mousemove', this.dragMove);
    document.removeEventListener('touchmove', this.dragMove);
    document.removeEventListener('mouseup', this.dragEnd);
    document.removeEventListener('touchend', this.dragEnd);
  }

  resetPosition() {
    const prevTransition = this.target.style.transition;
    this.target.style.transition = 'transform 0.3s ease-out';

    const rect = this.target.getBoundingClientRect();
    this.xOffset += window.innerWidth / 2 - (rect.left + rect.width / 2);
    this.yOffset += window.innerHeight / 2 - (rect.top + rect.height / 2);
    this.currentX = this.xOffset;
    this.currentY = this.yOffset;

    this.target.style.transform = `translate3d(${this.xOffset}px, ${this.yOffset}px, 0)`;

    setTimeout(() => {
      this.target.style.transition = prevTransition;
    }, 300);
  }
}

class Sortable {
  // ✅ BỘ QUẢN LÝ BỘ NHỚ (Memory Registry)
  // Dùng Map để liên kết chính xác 1 DOM Element với 1 Instance
  static registry = new Map();

  /**
   * Lấy instance đang hoạt động của một container (nếu cần truy xuất từ bên ngoài)
   * @param {string|Element} containerSelector
   * @returns {Sortable|undefined}
   */
  static getInstance(containerSelector) {
    const el = typeof containerSelector === 'string' ? getE(containerSelector) : containerSelector;
    return Sortable.registry.get(el);
  }
  /**
   * @param {string|Element} containerSelector - ID container vd '#my-tbody'
   * @param {Function} onSortEnd - Callback trả về dữ liệu mảng sau khi thả
   * @param {Object} opts - Tùy chọn (itemSelector, handleSelector, itemId)
   */
  constructor(containerSelector, onSortEnd, opts = {}) {
    try {
      // Khởi tạo container
      this.container = typeof containerSelector === 'string' ? getE(containerSelector) : containerSelector;
      if (!this.container) return;
      this.containerId = this.container.id;

      // ✅ TỐI ƯU OVERLOAD PARAMETERS:
      // Nếu tham số thứ 2 là một Object (không phải null, không phải Array, không phải Function)
      // Thì hiểu đó chính là opts, và onSortEnd không được truyền.
      if (onSortEnd && typeof onSortEnd === 'object' && !Array.isArray(onSortEnd)) {
        opts = onSortEnd;
        opts.handleSelector = '.drag-handle';
        onSortEnd = indexAfterDrag;
      }

      // Merge default options
      this.opts = Object.assign(
        {
          itemSelector: 'tr, li',
          handleSelector: null,
          itemId: 'id',
          stateBtn: null,
        },
        opts || {}
      ); // Dự phòng opts rỗng

      this.onSortEnd = onSortEnd;
      this.draggedItem = null;
      this.isEnabled = false;
      this.eventCleaners = [];
      this.stateCheckbox = null; // Biến lưu DOM của nút toggle

      // Render UI nút bật tắt (nếu có)
      this._setupStateToggle();

      this.enable();
      Sortable.registry.set(this.containerId, this);
    } catch (error) {
      console.error(`Sortable: Lỗi khởi tạo`, error);
    }
  }

  /**
   * @private Render nút toggle dạng Bootstrap Switch
   */
  _setupStateToggle() {
    if (!this.opts.stateBtn) return;
    const btnContainer = typeof this.opts.stateBtn === 'string' ? getE(this.opts.stateBtn) : this.opts.stateBtn;
    if (!btnContainer) return;

    // Tạo ID ngẫu nhiên để thẻ label trỏ đúng vào thẻ input
    const uniqueId = 'drag-toggle-' + Math.random().toString(36).substr(2, 9);

    // Render UI chuẩn Bootstrap 5
    btnContainer.innerHTML = `
            <div class="form-check form-switch d-flex align-items-center mb-0 sortable-toggle-wrapper">
                <input class="form-check-input me-2 shadow-none" type="checkbox" id="${uniqueId}" style="cursor: pointer;">
                <label class="form-check-label user-select-none" for="${uniqueId}" style="cursor: pointer; font-size: 0.9rem; font-weight: 500;">
                    <i class="bi bi-arrows-move me-1"></i>Sắp xếp
                </label>
            </div>
        `;

    this.stateCheckbox = btnContainer.querySelector('.form-check-input');

    // Gắn event listener khi user tự click thay đổi trạng thái
    A.Event.on(
      this.stateCheckbox,
      'change',
      (e) => {
        if (e.target.checked) {
          this.enable();
        } else {
          this.disable();
        }
      },
      false,
      true
    );
  }

  enable() {
    if (this.isEnabled) return;
    // ✅ KIỂM SOÁT ZOMBIE INSTANCE:
    // Nếu DOM này đã có 1 Sortable đang chạy, tự động tiêu diệt nó trước khi tạo mới
    if (Sortable.registry.has(this.containerId)) {
      console.warn(`Sortable: Đã tồn tại instance cho container này. Đang auto-destroy bản cũ để giải phóng RAM...`);
      Sortable.registry.get(this.containerId).destroy();
    }
    this.isEnabled = true;

    // ✅ Đồng bộ UI: Đảm bảo checkbox hiện ON
    if (this.stateCheckbox && !this.stateCheckbox.checked) {
      this.stateCheckbox.checked = true;
    }

    // Xử lý Handle Hack: Nếu có chỉ định chỗ cầm nắm (Editable Table an toàn)
    if (this.opts.handleSelector) {
      const handles = this.container.querySelectorAll(this.opts.handleSelector);
      handles.forEach((handle) => (handle.style.cursor = 'grab'));
      this.eventCleaners.push(
        // Khi chuột ấn vào tay cầm -> gán thuộc tính draggable cho thẻ <tr>
        A.Event.on(
          this.container,
          'mousedown touchstart',
          (e) => {
            const handle = e.target.closest(this.opts.handleSelector);
            if (handle) {
              const item = handle.closest(this.opts.itemSelector);
              if (item) item.setAttribute('draggable', 'true');
            }
          },
          false,
          true
        ), // params: (target, event, handler, options=true để Delegate, allowMultiple=true)

        // Hủy draggable khi thả tay hoặc rời chuột
        A.Event.on(
          this.container,
          'mouseup mouseleave touchend',
          (e) => {
            if (!this.draggedItem) {
              // Chỉ gỡ nếu không đang trong quá trình Drag thực sự
              const items = this.container.querySelectorAll(this.opts.itemSelector);
              items.forEach((el) => el.removeAttribute('draggable'));
            }
          },
          false,
          true
        )
      );
    } else {
      // Bật toàn bộ draggable nếu không dùng tay cầm
      const items = this.container.querySelectorAll(this.opts.itemSelector);
      items.forEach((item) => {
        item.setAttribute('draggable', 'true');
        item.style.cursor = 'grab';
      });
    }

    // --- Core Drag & Drop Events (Dùng Event Delegation vào Container) ---
    this.eventCleaners.push(A.Event.on(this.container, 'dragstart', this.onDragStart.bind(this), false, true), A.Event.on(this.container, 'dragover', this.onDragOver.bind(this), false, true), A.Event.on(this.container, 'drop', this.onDrop.bind(this), false, true), A.Event.on(this.container, 'dragend', this.onDragEnd.bind(this), false, true));
  }

  disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;

    // ✅ Đồng bộ UI: Đảm bảo checkbox hiện OFF
    if (this.stateCheckbox && this.stateCheckbox.checked) {
      this.stateCheckbox.checked = false;
    }

    // Chạy auto-cleanup xóa toàn bộ listener của class này
    this.eventCleaners.forEach((clean) => clean());
    this.eventCleaners = [];

    // Gỡ DOM CSS
    const items = this.container.querySelectorAll(this.opts.itemSelector);
    items.forEach((item) => {
      item.removeAttribute('draggable');
      item.style.cursor = '';
    });
    if (this.opts.handleSelector) {
      const handles = this.container.querySelectorAll(this.opts.handleSelector);
      handles.forEach((handle) => (handle.style.cursor = ''));
    }
  }

  destroy() {
    try {
      this.disable(); // Tắt tính năng và xóa event

      if (this.opts.stateBtn) {
        const btnContainer = typeof this.opts.stateBtn === 'string' ? getE(this.opts.stateBtn) : this.opts.stateBtn;
        if (btnContainer) {
          const toggle = btnContainer.querySelector('.sortable-toggle-wrapper');
          if (toggle) toggle.remove();
        }
      }

      // Xóa khỏi sổ đăng ký
      Sortable.registry.delete(this.containerId);

      // Ép rác (Garbage Collector friendly)
      this.container = null;
      this.onSortEnd = null;
    } catch (error) {
      console.error('Sortable: Lỗi khi destroy instance', error);
    }
  }

  // -- Handlers --
  onDragStart(e) {
    const item = e.target.closest(this.opts.itemSelector);
    if (!item || !item.hasAttribute('draggable')) return;

    this.draggedItem = item;
    setTimeout(() => (this.draggedItem.style.opacity = '0.4'), 0); // Làm mờ bản gốc

    // Fallback bắt buộc của HTML5 D&D (đặc biệt Firefox)
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.innerHTML);
  }

  onDragOver(e) {
    e.preventDefault(); // Phải có mới drop được
    const targetItem = e.target.closest(this.opts.itemSelector);
    if (!targetItem || targetItem === this.draggedItem) return;

    const bounding = targetItem.getBoundingClientRect();
    const offset = bounding.y + bounding.height / 2;

    this.cleanupStyles();

    // Check tọa độ Y để quyết định nhét lên trên hay xuống dưới
    if (e.clientY > offset) {
      targetItem.style.borderBottom = '2px solid #0d6efd';
      this.container.insertBefore(this.draggedItem, targetItem.nextSibling);
    } else {
      targetItem.style.borderTop = '2px solid #0d6efd';
      this.container.insertBefore(this.draggedItem, targetItem);
    }
  }

  onDrop(e) {
    e.preventDefault();
    this.cleanupStyles();
  }

  onDragEnd() {
    if (!this.draggedItem) return;
    this.draggedItem.style.opacity = '1';
    this.cleanupStyles();

    // Trả DOM về trạng thái ban đầu nếu dùng handle
    if (this.opts.handleSelector) {
      this.draggedItem.removeAttribute('draggable');
    }

    this.draggedItem = null;
    this.triggerUpdate(); // Gọi callback
  }

  cleanupStyles() {
    const items = this.container.querySelectorAll(this.opts.itemSelector);
    items.forEach((el) => {
      el.style.borderTop = '';
      el.style.borderBottom = '';
    });
  }

  triggerUpdate() {
    if (typeof this.onSortEnd !== 'function') return;

    const currentItems = Array.from(this.container.querySelectorAll(this.opts.itemSelector));
    const sortedData = currentItems.map((item, index) => {
      // Lấy ID: ưu tiên attribute opts.itemId -> id -> data-id
      let finalId = item.getAttribute(this.opts.itemId) || item.id || item.getAttribute('data-id') || null;

      return {
        element: item,
        index: index,
        id: finalId,
      };
    });

    this.onSortEnd(sortedData);
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

    if (e.type === 'touchstart') {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
    } else {
      this.startX = e.clientX;
      this.startY = e.clientY;
    }

    // Linh hoạt gắn sự kiện vào document (Giống FreeMover)
    document.addEventListener('mousemove', this.resizeMove);
    document.addEventListener('touchmove', this.resizeMove, { passive: false });
    document.addEventListener('mouseup', this.resizeEnd);
    document.addEventListener('touchend', this.resizeEnd);

    this.target.classList.add('is-resizing');
  }

  resizeMove(e) {
    if (!this.isResizing) return;
    e.preventDefault();

    let currentX, currentY;
    if (e.type === 'touchmove') {
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
    document.removeEventListener('mousemove', this.resizeMove);
    document.removeEventListener('touchmove', this.resizeMove);
    document.removeEventListener('mouseup', this.resizeEnd);
    document.removeEventListener('touchend', this.resizeEnd);
  }
}

/**
 * 9TRIP HELPER: UNIVERSAL WINDOW MINIMIZER
 * Tạo hiệu ứng thu nhỏ cửa sổ xuống Taskbar ảo
 * ✅ Tối ưu: Tự động loại bỏ modal-dialog-centered để tránh xung đột với FloatDraggable
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
        this.minimizeBtn.addEventListener(
          'click',
          debounce((e) => {
            e.preventDefault();
            this.minimize();
          }, 300)
        );
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
      cloned.querySelectorAll('button, i, svg').forEach((el) => el.remove());

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
    if (!this.target || this.taskbar) return;
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
    const title = this._resolveTitle(); // Cập nhật title trước khi tạo task item

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
    this.initTaskbar(); // Đảm bảo Taskbar đã tồn tại
    this.taskItem = document.createElement('button');
    this.taskItem.className = 'btn btn-secondary btn-sm erp-task-item';
    this.taskItem.innerHTML = `<i class="fa-solid fa-window-restore me-2"></i>${title}`;
    this.taskItem.title = `Hiển thị: ${title}`;
    this.taskItem.dataset.targetId = this.target.id;
    // this.taskItem.style.cssText = 'position:relative; display:inline-flex; align-items:center;';

    this.taskItem.style.cssText = 'padding-right:1rem;'; // chừa chỗ cho nút X
    this.taskItem.addEventListener(
      'click',
      debounce(() => this.restore(), 300)
    );

    // ── Nút X đóng hẳn modal ──
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm';
    closeBtn.title = 'Đóng';
    closeBtn.style.cssText = ['position:absolute', 'top:-6px', 'right:-6px', 'width:16px', 'height:16px', 'padding:0', 'border-radius:50%', 'background:#dc3545', 'color:#fff', 'font-size:10px', 'line-height:1', 'display:flex', 'align-items:center', 'justify-content:center', 'opacity:0', 'transition:opacity 0.15s', 'z-index:10', 'border:none'].join(';');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    // Hiện/ẩn nút X khi hover vào task item
    this.taskItem.addEventListener('mouseenter', () => {
      closeBtn.style.opacity = '1';
    });
    this.taskItem.addEventListener('mouseleave', () => {
      closeBtn.style.opacity = '0';
    });

    // Click X → đóng Bootstrap modal (fire hidden.bs.modal → _resetContent tự dọn)
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Restore display trước để Bootstrap hide animation chạy đúng
      this.target.style.display = this.oldDisplay || '';
      const bsModal = typeof bootstrap !== 'undefined' ? bootstrap.Modal.getInstance(this.target) : null;
      if (bsModal) {
        bsModal.hide(); // fire hidden.bs.modal → _resetContent() xử lý autoRemove
      } else {
        // Fallback nếu không có Bootstrap instance (custom window, widget...)
        this.target.style.display = 'none';
      }
      // Xóa taskItem khỏi taskbar
      this.taskItem.remove();
      if (this.taskbar) {
        const remaining = this.taskbar.querySelectorAll('.erp-task-item');
        if (remaining.length === 0) {
          this.taskbar.remove();
          this.taskbar = null;
        }
      }
    });
    this.taskItem.appendChild(closeBtn);
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

export { FloatDraggable, Sortable, TableResizeManager, Resizable, WindowMinimizer };
