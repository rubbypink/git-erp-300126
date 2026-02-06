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
        animationDuration: 300 // ms
    },

    // 2. INIT
    init: function() {
        // Render giao diện ngay khi khởi tạo
        if (!document.getElementById(this.config.containerId)) {
            this.renderUI();
            this.attachEvents();
            this.trackLastInput();
            this.initDragDrop();
        }
    },

    // 3. UI: Render HTML (Bootstrap + Vanilla JS)
    renderUI: function() {
        const html = `
            <div id="${this.config.containerId}" class="shadow-lg desktop-only" style="position: fixed; bottom: 20px; right: 50px; width: 300px; z-index: 9999; background: #fff; border-radius: 12px; display: none; border: 1px solid #e0e0e0; opacity: 0; transition: opacity ${this.config.animationDuration}ms ease;">
                
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
    attachEvents: function() {
        const self = this;
        const widgetEl = document.getElementById(this.config.containerId);
        const toggleBtn = document.getElementById('btn-toggle-calc');
        const collapseBtn = document.getElementById('btn-collapse-calc');
        const pasteBtn = document.getElementById('btn-paste-calc');
        const calcBtns = document.querySelectorAll('.calc-btn');

        // Click các nút máy tính (sử dụng event delegation)
        calcBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
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
        document.addEventListener('keydown', function(e) {
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
            }else if (key === 'Enter' || key === '=') {
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
    trackLastInput: function() {
        document.addEventListener('focus', (e) => {
            const el = e.target;
            // Theo dõi các input text/number (ngoại trừ display của calc)
            if ((el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) 
                && el.id !== 'calc-display') {
                this.config.lastFocusedInput = el;
            }
        }, true); // Sử dụng capture phase
    },

    // 6. ACTION: Xử lý nút bấm
    append: function(val) {
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
    calculate: function() {
        const display = document.getElementById('calc-display');
        const historyEl = document.getElementById('calc-history');
        const expression = display.value;

        try {
            // Security Check: Chỉ cho phép số và dấu toán học
            if (/[^0-9+\-*/().]/.test(expression)) {
                throw new Error("Invalid Input");
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
            setTimeout(() => { display.value = ''; }, 1000);
        }
    },

    // 8. ERP FEATURE: Dán kết quả vào form
    pasteToInput: function() {
        this.calculate(); // Tính toán trước khi dán
        const result = document.getElementById('calc-display').value;
        const target = this.config.lastFocusedInput;

        if (target  && result !== 'Error') {
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
    toggle: function() {
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

    // 10. DRAG & DROP: Xử lý kéo thả button với smooth movement
    initDragDrop: function() {
        const self = this;
        const btn = document.getElementById('btn-toggle-calc');
        
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startBottom = 0;
        
        // Bắt đầu kéo - Tắt hết transitions để icon di chuyển mượt
        btn.addEventListener('mousedown', function(e) {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // Lấy vị trí hiện tại
            const rect = btn.getBoundingClientRect();
            startLeft = rect.left;
            startBottom = window.innerHeight - rect.bottom;
            
            // Tắt animations ngay lập tức để icon follow cursor mượt mà
            btn.style.transition = 'none';
            btn.style.cursor = 'grabbing';
            btn.style.userSelect = 'none';
        });

        // Kéo thả - Icon di chuyển realtime theo cursor
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            
            // Tính toán khoảng cách di chuyển trên cả X và Y
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // Cập nhật vị trí mới - NO TRANSITION, SMOOTH FOLLOW
            const newLeft = startLeft + deltaX;
            const newBottom = Math.max(20, startBottom - deltaY);
            
            // Cập nhật position trực tiếp (không có delay)
            btn.style.left = newLeft + 'px';
            btn.style.bottom = newBottom + 'px';
            btn.style.right = 'auto';
        });

        // Kết thúc kéo - Snap vào cạnh gần nhất với animation
        btn.addEventListener('mouseup', function(e) {
            // Kiểm tra xem có phải là click thực sự hay drag
            const isMiniClick = Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5;
            
            if (!isDragging) return;
            
            isDragging = false;
            btn.style.cursor = 'pointer';
            btn.style.userSelect = 'auto';
            
            // Nếu là click nhỏ, toggle calculator
            if (isMiniClick) {
                btn.style.transition = '';
                self.toggle();
                return;
            }
            
            // Nếu là drag, snap vào cạnh gần nhất
            const rect = btn.getBoundingClientRect();
            const distanceToLeft = rect.left;
            const distanceToRight = window.innerWidth - rect.right;
            
            // Bật animation để snap mượt mà
            btn.style.transition = `all ${self.config.animationDuration}ms ease`;
            
            // Tự động dính vào cạnh gần nhất
            if (distanceToLeft < distanceToRight) {
                // Dính vào cạnh trái
                btn.style.left = '20px';
                btn.style.right = 'auto';
            } else {
                // Dính vào cạnh phải
                btn.style.right = '20px';
                btn.style.left = 'auto';
            }
            
            // Xóa transition sau khi animation hoàn thành
            setTimeout(() => {
                btn.style.transition = '';
            }, self.config.animationDuration);
        });
    }
};

// =========================================================================
// EXPORT & INITIALIZATION
// =========================================================================
// Attach to global scope (không dùng ES Module để tương thích với v1 legacy code)
if (typeof window !== 'undefined') {
    window.CalculatorWidget = CalculatorWidget;
}

// Khởi chạy khi load trang (Hoặc gọi trong file main.js)
// CalculatorWidget.init();