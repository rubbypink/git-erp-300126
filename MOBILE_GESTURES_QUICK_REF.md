## 📱 QUICK REFERENCE: Mobile Gestures

### **Cấu hình hiện tại:**
```javascript
// EventManager.js (line 18-23)
this.touchState = {
    lastTapTime: {},
    doubleTapTimeout: 300,    // Double-tap detection window
    longPressTimeout: 500,    // Long-press hold duration
    touchStartX: 0,
    touchStartY: 0
};
```

---

### **Khi nào gesture kích hoạt?**
✅ Tự động khi: `window.matchMedia('(max-width: 768px)').matches === true`

---

### **Gesture Mapping:**

| Desktop | Mobile | Timeout |
|---------|--------|---------|
| Ctrl+Click (Dashboard) | Double-Tap | 300ms |
| Right-Click (Context Menu) | Long-Press | 500ms |

---

### **Cách thay đổi timeout?**

Sửa trong [EventManager.js](public/src/js/modules/EventManager.js#L19-L20):

```javascript
this.touchState = {
    lastTapTime: {},
    doubleTapTimeout: 250,    // ← Thay từ 300 thành 250
    longPressTimeout: 600,    // ← Thay từ 500 thành 600
    touchStartX: 0,
    touchStartY: 0
};
```

---

### **Vô hiệu hóa gesture?**

Xóa dòng này trong `init()` method (line 45):
```javascript
if (this.isMobile()) {
    this._setupMobileGestures();
    log('[EventManager] 📱 Mobile gestures enabled', 'info');
}
```

---

### **Test trên Desktop?**

DevTools → Ctrl+Shift+M → Chọn device → Thực hiện gesture

---

### **Method locations:**
- `constructor()`: Line 10-24
- `init()`: Line 26-52
- `_setupMobileGestures()`: Line 368-437
- `_setupFormEvents()` (Ctrl+Click handler): Line 266-308

---

**Last Updated**: Feb 5, 2026
