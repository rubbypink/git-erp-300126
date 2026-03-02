/**
 * MODULE: FLOATING CALCULATOR (Vanilla JS)
 * Chức năng: Máy tính bỏ túi hỗ trợ tính giá nhanh
 * Tech Lead: 9 Trip ERP Assistant
 */

const CalculatorWidget = {
  // 1. CONFIG
  config: {
    containerId: 'erp-calculator-widget',
    lastFocusedInput: null, // Lưu vết ô input người dùng đang gõ
    animationDuration: 300, // ms
  },
  _initialized: true, // Cờ để tránh khởi tạo nhiều lần
  // 2. INIT
  init: function () {
    if (this._autoInitDone) {
      console.warn('[Calculator Widget] Đã khởi tạo rồi, bỏ qua...');
      return;
    }
    this._autoInitDone = true;
    // Render giao diện ngay khi khởi tạo
    if (!document.getElementById(this.config.containerId)) {
      this.renderUI();
      this.attachEvents();
      this.trackLastInput();
      this.initDragDrop();
    }
  },

  // 3. UI: Render HTML (Bootstrap + Vanilla JS)
  renderUI: function () {
    const html = `
            <div id="${this.config.containerId}" class="shadow-lg" style="position: fixed; bottom: 4vh; right: 50px; width: 300px; z-index: 9999; background: #fff; border-radius: 12px; display: none; border: 1px solid #e0e0e0; opacity: 0; transition: opacity ${this.config.animationDuration}ms ease;">
                
                <div class="d-flex justify-content-between align-items-center p-2 bg-primary text-white" style="border-radius: 12px 12px 0 0;">
                    <small><i class="fa-solid fa-calculator me-1"></i> Quick Calc (Ctrl + Enter để dán nhanh!)</small>
                    <button class="btn btn-sm btn-link text-white p-0" id="btn-collapse-calc">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                </div>

                <div class="p-3 bg-light">
                    <input type="text" id="calc-display" class="form-control text-end fs-4 fw-bold mb-2" placeholder="0" readonly style="background: #fff;">
                    <div class="text-end text-muted small" style="height: 20px;" id="calc-history"></div>
                </div>

                <div class="p-2">
                    <div class="row g-2">
                        <div class="col-3"><button class="btn btn-light w-100 calc-btn" data-val="AC">AC</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 calc-btn" data-val="DEL"><i class="fa-solid fa-backspace"></i></button></div>
                        <div class="col-3"><button class="btn btn-light w-100 calc-btn" data-val="/">/</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 calc-btn" data-val="*">x</button></div>

                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="7">7</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="8">8</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="9">9</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 calc-btn" data-val="-">-</button></div>

                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="4">4</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="5">5</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="6">6</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 calc-btn" data-val="+">+</button></div>

                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="1">1</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="2">2</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="3">3</button></div>
                        <div class="col-3"><button class="btn btn-primary w-100 calc-btn" data-val="=">=</button></div>

                        <div class="col-6"><button class="btn btn-light w-100 fw-bold calc-btn" data-val="0">0</button></div>
                        <div class="col-3"><button class="btn btn-light w-100 fw-bold calc-btn" data-val=".">.</button></div>
                        <div class="col-3"><button class="btn btn-success w-100" id="btn-paste-calc" title="Dán vào ô nhập liệu"><i class="fa-solid fa-paste"></i></button></div>
                    </div>
                </div>
            </div>
            
            <button id="btn-toggle-calc" class="btn btn-primary rounded-circle shadow" title="Ctrl + Shift + I để mở nhanh" 
                style="position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px; z-index: 9998; opacity: 1; transition: opacity ${this.config.animationDuration}ms ease;">
                <i class="fa-solid fa-calculator"></i>
            </button>
        `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  // 4. EVENTS: Xử lý sự kiện bàn phím + click
  attachEvents: function () {
    const self = this;
    const widgetEl = document.getElementById(this.config.containerId);
    const toggleBtn = document.getElementById('btn-toggle-calc');
    const collapseBtn = document.getElementById('btn-collapse-calc');
    const pasteBtn = document.getElementById('btn-paste-calc');
    const calcBtns = document.querySelectorAll('.calc-btn');

    // Click các nút máy tính (sử dụng event delegation)
    calcBtns.forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const val = this.getAttribute('data-val');
        if (val === '=') {
          self.calculate();
        } else {
          self.append(val);
        }
      });
    });

    // Click nút bật/tắt
    // toggleBtn.addEventListener('click', () => self.toggle());
    collapseBtn.addEventListener('click', () => self.toggle());

    // Click nút dán
    pasteBtn.addEventListener('click', () => self.pasteToInput());

    // Xử lý sự kiện bàn phím
    document.addEventListener('keydown', function (e) {
      // Chỉ bắt phím khi máy tính đang hiện
      if (widgetEl.style.display === 'none') return;

      const key = e.key;

      // Xử lý các phím số và phép tính
      if (/[0-9]/.test(key)) {
        self.append(key);
      } else if (['+', '-', '*', '/', '.'].includes(key)) {
        self.append(key);
      } else if (key === 'Enter' && e.ctrlKey) {
        e.preventDefault(); // Chặn submit form nếu có
        self.pasteToInput();
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault(); // Chặn submit form nếu có
        self.calculate();
      } else if (key === 'Backspace') {
        self.append('DEL');
      } else if (key === 'Escape') {
        self.toggle(); // Đóng máy tính
      } else if (key.toLowerCase() === 'c') {
        self.append('AC'); // Clear All
      }
    });
  },

  // 5. LOGIC: Theo dõi ô input người dùng đang focus
  trackLastInput: function () {
    document.addEventListener(
      'focus',
      (e) => {
        const el = e.target;
        // Theo dõi các input text/number (ngoại trừ display của calc)
        if (
          el.tagName === 'INPUT' &&
          (el.type === 'text' || el.type === 'number') &&
          el.id !== 'calc-display'
        ) {
          this.config.lastFocusedInput = el;
        }
      },
      true
    ); // Sử dụng capture phase
  },

  // 6. ACTION: Xử lý nút bấm
  append: function (val) {
    const display = document.getElementById('calc-display');
    let current = display.value;

    if (val === 'AC') {
      display.value = '';
      document.getElementById('calc-history').textContent = '';
    } else if (val === 'DEL') {
      display.value = current.slice(0, -1);
    } else {
      // Validate sơ bộ: Không cho nhập 2 dấu liên tiếp
      if (['+', '-', '*', '/'].includes(val) && ['+', '-', '*', '/'].includes(current.slice(-1))) {
        return;
      }
      display.value = current + val;
    }
  },

  // 7. CORE: Tính toán (An toàn)
  calculate: function () {
    const display = document.getElementById('calc-display');
    const historyEl = document.getElementById('calc-history');
    const expression = display.value;

    try {
      // Security Check: Chỉ cho phép số và dấu toán học
      if (/[^0-9+\-*/().]/.test(expression)) {
        throw new Error('Invalid Input');
      }

      // Sử dụng Function constructor thay vì eval trực tiếp (An toàn hơn)
      // Logic: new Function('return ' + '1+1')() -> 2
      const result = new Function('return ' + expression)();

      // Format số đẹp (nếu lẻ)
      const finalResult = Number.isInteger(result) ? result : result.toFixed(2);

      historyEl.textContent = expression + ' =';
      display.value = finalResult;
    } catch (e) {
      display.value = 'Error';
      setTimeout(() => {
        display.value = '';
      }, 1000);
    }
  },

  // 8. ERP FEATURE: Dán kết quả vào form
  pasteToInput: function () {
    this.calculate(); // Tính toán trước khi dán
    const result = document.getElementById('calc-display').value;
    const target = this.config.lastFocusedInput;

    if (target && result !== 'Error') {
      target.value = result;
      // Kích hoạt sự kiện change để các hàm tính toán khác trong ERP chạy
      target.dispatchEvent(new Event('change', { bubbles: true }));

      // Hiệu ứng Visual báo thành công
      target.classList.add('bg-warning');
      setTimeout(() => target.classList.remove('bg-warning'), 500);
    } else {
      logA('Chọn 1 ô nhập liệu rồi mới dán kết quả được nhé!', 'warning');
    }
  },

  // 9. Helper: Bật tắt widget với animation
  toggle: function () {
    const widget = document.getElementById(this.config.containerId);
    const btn = document.getElementById('btn-toggle-calc');
    const isVisible = widget.style.display !== 'none';

    if (isVisible) {
      // Ẩn widget
      widget.style.opacity = '0';
      setTimeout(() => {
        widget.style.display = 'none';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }, this.config.animationDuration);
    } else {
      // Hiển thị widget
      widget.style.display = 'block';
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none';
      setTimeout(() => {
        widget.style.opacity = '1';
      }, 10); // Trigger reflow
    }
  },

  // 10. DRAG & DROP: Xử lý kéo thả button với smooth movement (Mouse + Touch)
  initDragDrop: function () {
    const self = this;
    const btn = document.getElementById('btn-toggle-calc');

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startBottom = 0;

    // ── Helper: lấy tọa độ từ cả mouse event và touch event ──
    function getClientPos(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    // ── Helper: bắt đầu kéo ──
    function onDragStart(e) {
      const pos = getClientPos(e);
      isDragging = true;
      startX = pos.x;
      startY = pos.y;

      const rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;

      btn.style.transition = 'none';
      btn.style.cursor = 'grabbing';
      btn.style.userSelect = 'none';
    }

    // ── Helper: trong khi kéo ──
    function onDragMove(e) {
      if (!isDragging) return;
      // Ngăn scroll trang khi đang kéo trên mobile
      e.preventDefault();

      const pos = getClientPos(e);
      const deltaX = pos.x - startX;
      const deltaY = pos.y - startY;

      const newLeft = startLeft + deltaX;
      const newBottom = Math.max(20, startBottom - deltaY);

      btn.style.left = newLeft + 'px';
      btn.style.bottom = newBottom + 'px';
      btn.style.right = 'auto';
    }

    // ── Helper: kết thúc kéo ──
    function onDragEnd(e) {
      const pos = getClientPos(e);
      const isMiniClick = Math.abs(pos.x - startX) < 5 && Math.abs(pos.y - startY) < 5;

      if (!isDragging) return;

      isDragging = false;
      btn.style.cursor = 'pointer';
      btn.style.userSelect = 'auto';

      if (isMiniClick) {
        btn.style.transition = '';
        self.toggle();
        return;
      }

      const rect = btn.getBoundingClientRect();
      const distanceToLeft = rect.left;
      const distanceToRight = window.innerWidth - rect.right;

      btn.style.transition = `all ${self.config.animationDuration}ms ease`;

      if (distanceToLeft < distanceToRight) {
        btn.style.left = '20px';
        btn.style.right = 'auto';
      } else {
        btn.style.right = '20px';
        btn.style.left = 'auto';
      }

      setTimeout(() => {
        btn.style.transition = '';
      }, self.config.animationDuration);
    }

    // ── Mouse events ──
    btn.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    btn.addEventListener('mouseup', onDragEnd);

    // ── Touch events (mobile) ──
    // passive: false để cho phép preventDefault() ngăn scroll
    btn.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('touchmove', onDragMove, { passive: false });
    btn.addEventListener('touchend', onDragEnd, { passive: false });
  },
};

// =========================================================================
// EXPORT & INITIALIZATION
// =========================================================================
// ✅ Support cả ES6 module + Global script loading
(function (globalObject) {
  // ES6 Module export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalculatorWidget;
  }

  // CommonJS export
  if (typeof exports !== 'undefined') {
    exports.CalculatorWidget = CalculatorWidget;
  }

  // Global window export (for <script> tag loading)
  if (typeof globalObject !== 'undefined') {
    globalObject.CalculatorWidget = CalculatorWidget;
  }
})(
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : typeof self !== 'undefined'
        ? self
        : this
);

// ⚠️ Khỏi tạo chỉ nếu DOM sẵn sàng
// Người dùng có thể gọi CalculatorWidget.init() thủ công nếu cần
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    CalculatorWidget.init();
  });
} else {
  // DOM đã ready
  CalculatorWidget.init();
}
