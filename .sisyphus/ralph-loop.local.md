---
active: true
iteration: 1
max_iterations: 500
completion_promise: "VERIFIED"
initial_completion_promise: "DONE"
started_at: "2026-05-23T07:18:07.760Z"
session_id: "ses_1ac531a41ffeb3ORmO2q0if2kN"
ultrawork: true
verification_pending: true
strategy: "continue"
message_count_at_start: 0
---
Phân tích code module accountant trong @public\src\accountant/  sau đó tối ưu code xử lý giao diện front end dựa theo các tiêu chí sau:
1. Navbar menu chỉ hiển thị tab Dashboard, Bảng Data, Giá Tour/Combo và Admin Dashboard (nếu là admin).
2. Fix lỗi hiển thị 2 thẻ card hiển thị stats: đang bị che khuất bởi các phần tử phía dưới.
- thêm tính năng collapse cho card
3. Cập nhật hàm gán với button Làm mới dữ liệu ở footer menu: khi chạy thì xóa dữ liệu ở localDB và tạo mới hoàn toàn từ firestore data. đảm bảo số lượng document của các collection phải trùng khớp giữa firestore và localDB.
4. Tạo và chạy 1 script cập nhật collection transactions:
B1: tìm tất cả document có id không phải dạng PT- hoặc PC-
B2: clone data để tạo các document mới từ các document vừa tìm được trừ giá trị field id (để tạo mới đúng chuẩn). Giá trị cũ của field id lưu vào field old_id để đối chiếu.
B3: sắp xếp các document mới theo thứ tự dựa theo field transaction_date rồi tạo giá trị docId và field id lần lượt theo đúng format.
B4: lưu các document mới với field id đúng chuẩn vào firestore -> đồng thời xóa document có id = giá trị field old_id.
**YÊU CẦU QUAN TRỌNG** script cần chạy dạng atomic transactions cho tất cả document. Hủy bỏ nếu có document lỗi -> log lỗi chi tiết.
