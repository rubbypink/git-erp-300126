# 9 TRIP AI AGENTS — QUY TẮC HÀNH VI BẮT BUỘC

## 0. Kim chỉ nam

**ĐỌC `prompts_master.js` TRƯỚC khi viết bất kỳ logic nào.**
Mọi thay đổi hành vi Agent → sửa config trong `.9trip-agents/configs/`, KHÔNG sửa code flow trực tiếp.

---

## 1. Helper First — TUYỆT ĐỐI không reinvent wheel

Khôg viết code mới khi helper đã có. Dùng đúng helper cho đúng việc:

| Helper | Dùng cho | File nguồn |
|--------|----------|------------|
| `getE(id)` | `document.getElementById` | `utils.js` |
| `$(selector)` | `querySelector` | `utils.js` |
| `getVal(id)` / `setVal(id, val)` | Đọc/giá trị input | `utils.js` |
| `HD.getFormData(root, col)` / `HD.setFormData(root, data, col)` | Form data 2 chiều | `db_helper.js` |
| `A.Event.on()` | Thay `addEventListener` — auto-cleanup + delegation | `EventManager.js` |
| `formatMoney()` / `formatDateVN()` / `formatDateForInput()` | Định dạng tiền/ngày | `utils.js` |
| `ATable` | Bảng dữ liệu filter/sort/group/inline-edit | Component |
| `Opps(error)` / `L.log()` | Error reporting | `utils.js` |
| `AiManager` | AI extractJSON / generateWithTools / chatWithMemory | `functions-ai/ai/ai.manager.js` |

---

## 2. Mobile First — Cho MỌI giao diện Dashboard AI

Mọi giao diện Dashboard AI và nội dung sinh ra phải tuân thủ:

- **Tiêu đề**: Dưới 60 ký tự, chứa 1 từ khóa chính tự nhiên. Không viết hoa toàn bộ.
- **Đoạn đầu (Hook)**: 1-2 câu lôi kéo. Không bắt đầu bằng lời chào vô nghĩa.
- **Đoạn văn**: Tối đa 3 câu. Câu không quá 25 chữ.
- **Xuống dòng**: 2-3 câu phải xuống dòng. Không viết khối chữ dày.
- **Emoji**: Tối đa 2-3 emoji cả bài. Không lạm dụng.

---

## 3. Matrix Input — Cho chấm điểm & duyệt nội dung

Khi xây dựng UI chấm điểm hoặc duyệt nội dung, DÙNG pattern **Matrix Input**:

- Mỗi tiêu chí = 1 hàng, mỗi mức độ = 1 cột
- Click cell để chọn combo (tiêu chí × mức độ)
- Auto-tính tổng điểm và hiển thị quyết định (Đạt/Không đạt)
- Mapping trực tiếp từ `phuQuocRelevance` scoring matrix trong `researcher.config.js`

```
┌──────────────────┬───────┬───────┬───────┬───────┐
│ Tiêu chí         │ 0-2   │ 3-5   │ 6-7   │ 8-10  │
├──────────────────┼───────┼───────┼───────┼───────┤
│ Phú Quốc keyword │  -2   │  +1   │  +2   │  +3   │
│ Du lịch VN       │  -1   │  0    │  +1   │  +2   │
│ Từ khóa tiêu cực │  -2   │  -1   │  0    │  0    │
└──────────────────┴───────┴───────┴───────┴───────┘
```

---

## 4. Quy tắc Content — 80% giá trị + 20% CTA nhẹ nhàng

- **Từ cấm**: đặt ngay, mua ngay, giảm giá sốc, khuyến mãi Hot, chạy ngay, click ngay, deal khủng, flash sale, săn sale, siêu ưu đãi, chốt deal, fomo — xem full list trong `writer.config.js`
- **CTA tốt**: gợi mở trải nghiệm, không ép mua tour.
- **Giọng văn**: Sống động, gần gũi, như kể chuyện với bạn.

---

## 5. Target Codebase — Chỉ聚焦 vào 2 thư mục

| Thư mục | Vai trò | Ghi chú |
|---------|---------|---------|
| `.9trip-agents/` | Linh hồn — Prompt, Config, Rules | Sửa hành vi Agent ở đây |
| `functions-ai/` | Hành động — Cloud Functions thực thi | Sử dụng Genkit + AiManager |

**KHÔNG VIẾT CODE AI MỚI vào `functions/`** — ERP Functions là codebase riêng.

---

## 6. Kiến trúc tách biệt

- `.9trip-agents/` chứa **tư duy** (Agent personality, prompts, scoring).
- `functions-ai/` chứa **hành động** (Cloud Functions, Genkit flows, AiManager).
- Sub-agents trong `.9trip-agents/sub-agents/` chỉ là **thin wrappers** — logic thật nằm trong `functions-ai/ai/flows/`.
- Config thay đổi → chỉ sửa file trong `.9trip-agents/configs/`, không đụng vào flow code.

---

## 7. Source Veracity & Data Loop

1. **Source Veracity**: Fetch Google Search thất bại → fallback Firecrawl.
2. **Data Loop**: Researcher chấm `phuQuocRelevance` > 8/10 → auto gợi ý lưu `training-data-vault`.
3. **Report Logging**: Mọi hành động Agent ghi log vào Firebase Realtime Database (`agent_reports/yyyy-mm-dd/`).
4. **Clean Code**: Luôn wrap I/O và DOM logic trong try-catch. Dùng `Opps(error)` hoặc `L.log()`.

---

## 8. Pipeline Multi-Agent

```
Researcher → Writer → MediaMaster → Publisher
   (Cào & Chấm)  (Viết)  (Chỉnh ảnh)  (Đăng)
```

| Bước | Agent | Model | Config |
|------|-------|-------|--------|
| 1 | Researcher | Gemini 1.5 Flash | `researcher.config.js` |
| 2 | Writer | DeepSeek V4 Pro | `writer.config.js` |
| 3 | MediaMaster | Gemini 1.5 Flash | `prompts_master.js` |
| 4 | Publisher | (chưa implement) | — |