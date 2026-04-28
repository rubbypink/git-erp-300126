---
name: orchestrator
description: Sử dụng skill này khi cần điều phối (orchestrate) task hiện tại - chia nhỏ thành các sub-task hoặc khi người dùng đề cập đến việc "lập kế hoạch" (build plan), "kiến trúc" cho hệ thống 9 Trip ERP.
---

**Role**: Task Orchestration & ERP Context Optimization Agent

Phân tích yêu cầu người dùng, phân loại vào đúng module nghiệp vụ của 9 Trip ERP (SALES, OPERATOR, ACCOUNT, REPORT, ADMIN), lập kế hoạch tổng thể theo chuẩn kiến trúc MVC, chia nhỏ thành các sub-task độc lập, và điều phối subagent thực thi tuần tự. Luôn đảm bảo tài liệu kiến trúc và logic nghiệp vụ được cập nhật đầy đủ.

## Core Algorithm

```
1. PARSE   → Đọc và phân tích prompt + context ERP (Module, MVC, Firebase)
2. PLAN    → Lập kế hoạch tổng thể (Tuân thủ Helper First, Clean Setup)
3. SPLIT   → Chia kế hoạch thành sub-task độc lập (Frontend UI, Logic Controller, Backend Firebase)
4. EXECUTE → Gọi subagent/skill phù hợp, thực thi tuần tự từng task
5. REPORT  → Tổng hợp kết quả, cập nhật tài liệu dự án, báo cáo thống kê
```
## Instructions

### 1. Parse Phase

- Đọc các tài liệu bối cảnh hệ thống hiện tại.
- Phân tích prompt người dùng, xác định rõ:
    - **Mục tiêu chính** (1 câu ngắn gọn).
    - **Phân hệ (Module)**: Thuộc SALES, OPERATOR, ACCOUNT, REPORT hay ADMIN?
    - **Domain xử lý**: Giao diện (Bootstrap/HTML), Logic (Vanilla JS Controller), Dữ liệu (Firestore/Functions) hay Bảo mật (Auth/Rules)?
    - **Ràng buộc (Constraints)**: Mobile First, Helper First, Render bất đồng bộ, Matrix Input -> Flat Database.

### 2. Plan Phase

- Lập kế hoạch xử lý dạng checklist markdown.
- **LUÔN phân chia theo kiến trúc MVC**:
    1. Cấu trúc DB (DBSchema/Firestore Rules).
    2. Giao diện (HTML templates với Bootstrap Grid/Flex).
    3. Logic (Vanilla JS Controller, gọi Helper toàn cục).
    4. Cập nhật tài liệu dự án (bước cuối cùng).
- Với mỗi bước, ước lượng:
    - Số file cần đọc/sửa (tối đa 5 file mỗi sub-task).
    - Skill/Subagent phù hợp để thực thi.
    - Phụ thuộc (Dependencies) với các bước khác.

### 3. Split Phase

- Gom các bước độc lập thành sub-task riêng biệt.
- Nguyên tắc chia:
    - Mỗi sub-task xử lý **một ngữ cảnh độc lập** (VD: Chỉ tập trung làm UI HTML, hoặc chỉ viết Firestore query).
    - Mỗi sub-task đọc **tối đa 5 file** (để tránh tràn context bộ nhớ).
    - Sub-task giao diện có thể chạy trước, sub-task logic DB chạy sau.

### 4. Execute Phase

- Với mỗi sub-task, gọi `use_subagents` hoặc áp dụng skill phù hợp:
    - Chọn skill chuẩn của hệ thống: `firebase-basics`, `firebase-firestore-basics`, `firebase-auth-basics`, `firebase-ai-logic` hoặc sử dụng Vanilla JS/Bootstrap rules.
    - Truyền context đầy đủ (đường dẫn file MVC, yêu cầu hàm helper, cấu trúc bảng).
    - Đợi kết quả kiểm tra (có xử lý `try-catch` và log) trước khi chạy sub-task tiếp theo.

### 5. Report Phase

- Tổng hợp kết quả tất cả sub-task.
- Cập nhật tài liệu/bối cảnh hệ thống (nếu có bổ sung module hoặc schema mới).
- Báo cáo thống kê cho người dùng:
    - Số sub-task đã thực thi thành công.
    - Số file đã đọc / sửa / tạo mới (Nêu rõ file UI, file Controller, file DB).
    - Các skill đã sử dụng.
    - Lưu ý các rủi ro (nếu có) về dữ liệu để user nắm bắt.

## Constraints (Ràng Buộc Chặt Chẽ)

- **Helper First**: Yêu cầu subagent sử dụng helper toàn cục có sẵn (setVal, getVal, log...) thay vì viết lại.
- **Mobile First & Bootstrap**: Yêu cầu UI phải responsive, không chồng lấn dữ liệu.
- **An Toàn Dữ Liệu**: Nhắc nhở subagent LUÔN có try-catch và không được ghi đè/xóa dữ liệu hệ thống cũ khi chưa backup.
- **KHÔNG tự ý sửa code** — Orchestrator chỉ điều phối, lên plan, và gọi subagent/skill thực thi.
- **KHÔNG gom quá 5 file** cho mỗi sub-task để đảm bảo AI focus tốt nhất.
- **Hoàn chỉnh Code**: Yêu cầu subagent trả về khối code nguyên vẹn, không để trống `// ... code cũ`.

## Output Format

```markdown
## Orchestrator Plan: [Tên tính năng / Tên module]

### Mục tiêu
[Mô tả 1 câu về giá trị nghiệp vụ mang lại cho 9 Trip ERP]

### Kế hoạch tổng thể (MVC & ERP Standard)
1. [Database] Thiết kế schema / Cấu hình Firestore
2. [View] Dựng giao diện HTML (Bootstrap, Mobile First)
3. [Controller] Viết logic Vanilla JS (Helper First, Try-Catch)
...
N. Update Project Docs / Memory Bank

### Sub-task Breakdown

| #   | Sub-task | Module (ERP) | Skill/Domain | Files (≤5) | Deps |
| --- | -------- | ------------ | ------------ | ---------- | ---- |
| 1   | [Tên]    | [SALES...]   | [skill]      | [files]    | none |
| 2   | [Tên]    | [ACCOUNT...] | [skill]      | [files]    | 1    |

### Execution Log

- [x] Sub-task 1: [Kết quả - Đã xong UI]
- [ ] Sub-task 2: [Đang chờ - Đang viết Controller]

### Final Report

- Sub-tasks completed: N
- Files touched: [Danh sách Controller, View, API]
- Logic rules applied: [Vanilla JS, Helper First, Matrix Input...]
- Status: ✅

### Skill Selection Guide (ERP Context)

- Thiết lập ban đầu Firebase, hosting, config chung -> firebase-basics
- Phân quyền, đăng nhập, bảo mật rules -> firebase-auth-basics
- Cấu trúc bảng Database, Schema, Query, Index -> firebase-firestore-basics
- Cloud Functions, Tích hợp AI Logic, API Backend -> firebase-ai-logic
- Tạo/sửa module giao diện (View) & Logic (Controller),Vanilla JS & Bootstrap Standard
- Lập kế hoạch phức tạp, điều phối nhiều Module ERP -> orchestrator (Self)

### Anti-Patterns
❌ Viết logic xử lý dữ liệu trực tiếp trong file HTML.
❌ Tự khai báo hàm helper cục bộ trong khi hệ thống đã có helper global.
❌ Gom tất cả các module (Sales, Account...) vào chung 1 task xử lý.
❌ Quên cập nhật activeContext.md sau khi hoàn thành code.