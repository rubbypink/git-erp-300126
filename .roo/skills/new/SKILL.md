---
name: new
description: Khi xây dựng module mới và cần tạo các file code mới.
modeSlugs:
  - code
  - architect
---

# New

## Instructions

Bạn phải tuân thủ nghiêm ngặt các quy tắc dưới đây khi tương tác với dữ liệu của 9Trip ERP:

## 1. SINGLE SOURCE OF TRUTH (DBSchema.js)

- **Validation:** Trước khi viết hàm lưu dữ liệu, phải đối chiếu với `DB_SCHEMA`. Ví dụ: Booking ID phải khớp pattern `^BK\d{4,}$`.
- **UI Generation:** Luôn sử dụng metadata từ schema (displayName, type, placeholder) để render form. Không tự ý hard-code nhãn hoặc kiểu input.
- **Initial Values:** Khi tạo object mới, phải lấy giá trị từ trường `initial` trong schema (ví dụ: `initial: 'today'` hoặc `initial: 1`).

## 2. DATA ACCESS & PERSISTENCE (DBManager.js)

- **Single Point of Write:** TUYỆT ĐỐI KHÔNG dùng trực tiếp `db.collection().add()` hay `set()`. Mọi thao tác ghi/xóa phải đi qua hàm `firestoreCRUD(collection, action, id, data)` của module DBManager bằng cách gọi qua global object của DBManager là A.DB (ví dụ gọi A.DB.tên hàm như saveRecord, batchSave, deleteRecord, getCollection...).
- **Client-Side Sorting:** Khi lấy dữ liệu, KHÔNG dùng `orderBy` của Firestore vì sẽ bị mất document thiếu field. Luôn để `DBManager` xử lý `postSort` sau khi hydrate dữ liệu.
- **History Tracking:** Lưu ý rằng các collection `bookings`, `booking_details`, `transactions` đã được cấu hình tự động ghi History. Khi cập nhật các bảng này, hệ thống sẽ tự động ghi vết vào `bookings.history`.
- **Indexing:** Sử dụng `INDEX_CONFIG` trong DBManager để truy cập nhanh các dữ liệu nhóm (ví dụ: lấy tất cả `booking_details` theo `booking_id`).

## 3. STATE & CACHE MANAGEMENT

- **Cache Priority:** Hiểu rằng `DBManager` ưu tiên IndexedDB (72h). Nếu cần dữ liệu mới nhất ngay lập tức, phải sử dụng cơ chế `syncDelta` hoặc `loadCollections` với tham số `forceNew = true`.
- **Variable Consistency:** Luôn giữ đúng tên biến snake_case như định nghĩa trong Schema (ví dụ: `customer_full_name`, không được đổi thành `customerFullName`).

## 4. CRITICAL LOGIC

- Khi thực hiện CRUD, luôn bọc trong `try-catch` và sử dụng `log()` của hệ thống để theo dõi.
- Nếu chỉnh sửa liên quan đến tiền tệ, phải dùng hàm format từ `utils.js` phối hợp với trường `total_amount` trong Schema.
