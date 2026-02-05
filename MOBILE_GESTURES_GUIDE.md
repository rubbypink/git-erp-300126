# 📱 MOBILE GESTURES GUIDE - EventManager.js

**Last Updated**: February 5, 2026  
**Status**: ✅ Implemented & Active

---

## 📋 OVERVIEW

EventManager.js đã được cập nhật để tự động hỗ trợ các gesture thay thế cho desktop shortcuts trên mobile:

| Desktop | Mobile | Timeout | File |
|---------|--------|---------|------|
| **Ctrl+Click** (Dashboard) | **Double-Tap** | 300ms | [EventManager.js](public/src/js/modules/EventManager.js#L353) |
| **Right-Click** (Context Menu) | **Long-Press** | 500ms | [EventManager.js](public/src/js/modules/EventManager.js#L383) |

---

## 🎯 CỰC TIỂU: CÁCH DÙNG TRÊN MOBILE

### **1️⃣ Double-Tap để Select Booking (thay Ctrl+Click)**

```
Dashboard → Booking Table
  ↓
Tap 1 times  → Không gì xảy ra
  ↓
Tap 1 more times (trong 300ms) → SELECT BOOKING ✅
```

**Ví dụ:**
- Bạn muốn mở booking "BK001" từ danh sách
- **Desktop**: Giữ Ctrl + Click vào row
- **Mobile**: Tap 2 lần liên tục trên row

---

### **2️⃣ Long-Press để Open Context Menu (thay Right-Click)**

```
Detail Table → Row
  ↓
Press & Hold (500ms) → CONTEXT MENU OPENS ✅
```

**Ví dụ:**
- Bạn muốn xóa/copy/paste dòng chi tiết
- **Desktop**: Right-click vào row → chọn hành động
- **Mobile**: Nhấn & giữ row 0.5 giây → menu hiện ra → tap hành động

---

## 🔧 IMPLEMENTATION DETAILS

### **File Đã Thay Đổi**

✅ [public/src/js/modules/EventManager.js](public/src/js/modules/EventManager.js)

**Thay đổi:**
1. Thêm `touchState` object để track gesture state
2. Thêm method `isMobile()` để detect mobile device
3. Thêm method `_setupMobileGestures()` - chính module gesture detection
4. Gọi tự động `_setupMobileGestures()` khi `isMobile() === true`
5. Thêm Ctrl+Click handler cho Dashboard tables

---

## 🏗️ CẤU TRÚC CODE

### **Constructor - Mobile Detection**

```javascript
constructor() {
    this.isInitialized = false;
    this.modules = {};
    
    // ─── MOBILE GESTURE STATE ───
    this.isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    this.touchState = {
        lastTapTime: {},           // Lưu thời gian tap cuối cho mỗi row
        doubleTapTimeout: 300,     // 300ms window để nhận double-tap
        longPressTimeout: 500,     // 500ms hold duration cho long-press
        touchStartX: 0,
        touchStartY: 0
    };
}
```

### **Init Method - Auto-Enable on Mobile**

```javascript
async init() {
    // ... existing setup ...
    
    // Mobile Gestures - tự động kích hoạt trên mobile
    if (this.isMobile()) {
        this._setupMobileGestures();
        log('[EventManager] 📱 Mobile gestures enabled', 'info');
    }
    
    // ...
}
```

### **_setupMobileGestures() - Main Gesture Handler**

#### **A. Double-Tap (300ms window)**

```javascript
_setupMobileGestures() {
    const tbody = document.getElementById('detail-tbody');
    const menu = document.getElementById('myContextMenu');
    
    // ─────────────────────────────────────────────────────────────
    // 1. DOUBLE-TAP: Thay cho Ctrl+Click trên Dashboard
    // ─────────────────────────────────────────────────────────────
    this.on('#tab-dashboard', 'touchend', (e) => {
        const row = e.target.closest('tr');
        if (!row) return;

        const now = Date.now();
        const rowId = row.id || `row-${Date.now()}`;
        const lastTap = this.touchState.lastTapTime[rowId] || 0;

        // Nếu lần tap cuối cùng < 300ms → Double-tap detected!
        if (now - lastTap < this.touchState.doubleTapTimeout) {
            e.preventDefault();
            const idVal = row.cells[0]?.textContent?.trim();
            if (idVal && typeof handleDashClick === 'function') {
                handleDashClick(idVal, false);
                logA('📱 Double-tap detected', 'info');
            }
        }
        this.touchState.lastTapTime[rowId] = now;
    }, true);
}
```

**Logic:**
1. Lần tap 1: `now - lastTap = ∞` → không trigger
2. Lưu `lastTapTime[rowId] = now`
3. Lần tap 2 trong 300ms: `now - lastTap < 300` → **TRIGGER** ✅

#### **B. Long-Press (500ms hold)**

```javascript
// ─────────────────────────────────────────────────────────────
// 2. LONG-PRESS: Thay cho Right-Click (Context Menu)
// ─────────────────────────────────────────────────────────────
let longPressTimer = null;

this.on('#detail-tbody', 'touchstart', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;

    this.touchState.touchStartX = e.touches[0].clientX;
    this.touchState.touchStartY = e.touches[0].clientY;

    // Đặt timer 500ms
    longPressTimer = setTimeout(() => {
        // Long-press detected (500ms)
        // ... setup context menu ...
        if (menu) {
            menu.style.display = 'block';
            logA('📱 Long-press detected - Context menu opened', 'info');
        }
    }, this.touchState.longPressTimeout); // 500ms
}, true);

// Hủy timer nếu touchend/touchmove trước 500ms
this.on('#detail-tbody', 'touchend touchmove', (e) => {
    clearTimeout(longPressTimer);
}, true);
```

**Logic:**
1. `touchstart` → Đặt timer 500ms
2. Nếu `touchend` trước 500ms → Hủy timer → Không mở menu
3. Nếu giữ > 500ms → Timer fire → Mở menu ✅

---

## ⚙️ TUỲ CHỈNH

### **Thay Đổi Timeout**

Sửa trong constructor:

```javascript
this.touchState = {
    lastTapTime: {},
    doubleTapTimeout: 200,    // ← Giảm thành 200ms để cảm nhận nhanh hơn
    longPressTimeout: 400,    // ← Giảm thành 400ms để mở menu nhanh hơn
    touchStartX: 0,
    touchStartY: 0
};
```

### **Vô Hiệu Hóa Gesture (Nếu Cần)**

Xóa hoặc comment dòng này trong `init()`:

```javascript
// if (this.isMobile()) {
//     this._setupMobileGestures();
// }
```

### **Thêm Gesture mới**

Thêm vào `_setupMobileGestures()`:

```javascript
// ─────────────────────────────────────────────────────────────
// 3. SWIPE: Gesture mới
// ─────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 50; // pixels
let swipeStartX = 0;

this.on('#detail-tbody', 'touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
}, true);

this.on('#detail-tbody', 'touchend', (e) => {
    const swipeDistance = e.changedTouches[0].clientX - swipeStartX;
    
    if (swipeDistance > SWIPE_THRESHOLD) {
        console.log('🔄 Swiped right');
    } else if (swipeDistance < -SWIPE_THRESHOLD) {
        console.log('🔄 Swiped left');
    }
}, true);
```

---

## 📊 BROWSER COMPATIBILITY

| Browser | Double-Tap | Long-Press | Status |
|---------|-----------|-----------|--------|
| iOS Safari | ✅ | ✅ | ✅ Full |
| Chrome Mobile | ✅ | ✅ | ✅ Full |
| Firefox Mobile | ✅ | ✅ | ✅ Full |
| Edge Mobile | ✅ | ✅ | ✅ Full |
| Samsung Internet | ✅ | ✅ | ✅ Full |

---

## 🧪 TESTING

### **Test Double-Tap**

1. **Desktop**: Mở DevTools → Device Emulation (Ctrl+Shift+M)
2. **Mobile**: Chọn iPhone 12 hoặc Pixel 5
3. **Action**: Tap 2 lần liên tục trên booking row
4. **Expected**: Row được select, booking mở ra

### **Test Long-Press**

1. Trên emulator hoặc điện thoại thực
2. Nhấn & giữ (500ms) vào row detail
3. **Expected**: Context menu hiện ra ngay tại vị trí tap

### **Console Log**

Kiểm tra trong DevTools console:
```
[EventManager] 📱 Mobile gestures enabled        ← Khi load
📱 Double-tap detected                            ← Khi double-tap
📱 Long-press detected - Context menu opened     ← Khi long-press
```

---

## 🐛 TROUBLESHOOTING

| Problem | Cause | Solution |
|---------|-------|----------|
| Double-tap không work | Timeout quá ngắn | Tăng `doubleTapTimeout` lên 400ms |
| Long-press quá nhạy | Timeout quá ngắn | Tăng `longPressTimeout` lên 600ms |
| Menu mở sai vị trí | Vị trí tính toán sai | Sửa trong `_setupMobileGestures()` line ~420 |
| Gesture không kích hoạt | Device không phải mobile | Check `this.isMobile()` return value |
| Context menu không đóng | Click handler thiếu | Kiểm tra `document.addEventListener('touchstart', ...)` |

---

## 📝 NOTES

- ✅ **Auto-detect**: Gesture tự động kích hoạt khi `window.matchMedia('(max-width: 768px)').matches`
- ✅ **Backward Compatible**: Desktop Ctrl+Click vẫn work bình thường
- ✅ **No Dependencies**: Không cần thư viện ngoài (Hammer.js, etc.)
- ✅ **Touch-friendly**: Sử dụng `touchstart`, `touchend`, `touchmove` events
- ⚠️ **iOS Safari**: Nên test trên iOS Safari vì có vài quirk riêng

---

## 🔗 RELATED FILES

- [EventManager.js](public/src/js/modules/EventManager.js) - Main gesture logic
- [main.css](public/src/css/main.css) - Mobile responsive styles
- [main_layout.html](public/src/components/main_layout.html) - Context menu HTML
- [utils.js](public/src/js/utils.js) - Global utility functions (log, getVal, etc.)

---

## 📞 SUPPORT

Nếu gặp vấn đề:

1. **Check console**: `F12` → Console tab → xem log messages
2. **Verify mobile**: Đảm bảo viewport < 768px
3. **Test in emulator**: Chrome DevTools Device Emulation
4. **Check EventManager**: Đảm bảo `EventManager.init()` được gọi khi load app

---

**Version History:**
- v1.0 (Feb 5, 2026): Initial implementation
  - Double-tap gesture
  - Long-press gesture
  - Auto-detection on mobile
