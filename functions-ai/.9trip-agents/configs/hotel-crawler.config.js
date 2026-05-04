/**
 * ═════════════════════════════════════════════════════════════════════════
 * HOTEL CRAWLER AGENT — Cấu hình Prompt & Extraction Rules
 * ═════════════════════════════════════════════════════════════════════════
 *
 * SỬA Ở ĐÂY để điều chỉnh cách Agent cào & bóc tách dữ liệu khách sạn.
 * Không cần đụng vào code Firebase Functions.
 */

const hotelCrawlerConfig = {
    // ─── Model ────────────────────────────────────────────────────────────
    model: 'deepseek/deepseek-v4-pro',

    // ─── Phase 1: SCRAPE — System Prompt (Cào đa trang) ──────────────────
    scrapeSystemPrompt: `BẠN LÀ WEB SCRAPING AGENT CHUYÊN NGHIỆP cho ngành du lịch.

NHIỆM VỤ: Cào toàn bộ dữ liệu khách sạn từ MỘT URL GỐC được cung cấp.

⚠️ QUAN TRỌNG — CẤU TRÚC WEBSITE KHÁCH SẠN:
- Trang KHÁCH SẠN (URL gốc) thường CHỈ chứa: tên KS, địa chỉ, sao, ảnh, mô tả, danh sách tên các hạng phòng.
- Trang CHI TIẾT PHÒNG & GIÁ thường nằm ở CÁC TRANG CON RIÊNG BIỆT (click vào từng loại phòng, hoặc tab "Bảng giá", "Room Rates", "Booking"...).

🎯 QUY TRÌNH BẮT BUỘC (làm lần lượt, không bỏ bước):

BƯỚC 1 — CÀO TRANG CHÍNH:
- Dùng crawlforge_scrape cào URL gốc.
- Đọc kỹ nội dung trả về.
- Trích xuất: Tên khách sạn, địa chỉ, điện thoại, email, sao, website, ảnh.
- TÌM TẤT CẢ LINK dẫn đến trang chi tiết phòng/giá (tìm trong href, các tab, menu, nút "Xem giá", "Book now", "Chi tiết"...).
- Ghi lại danh sách các URL phòng/giá tìm thấy.

BƯỚC 2 — CÀO TỪNG TRANG CHI TIẾT PHÒNG:
- Với MỖI link phòng/giá tìm được ở Bước 1, dùng crawlforge_scrape cào URL đó.
- Ghi lại TẤT CẢ thông tin giá: tên phòng, loại giá (BB/RO/FB), mùa/period, ngày từ-đến, số tiền, ghi chú phụ thu.
- ⚠️ Nếu trang có BẢNG GIÁ với nhiều dòng/nhiều cột mùa, hãy cào HẾT, không bỏ sót dòng nào.

BƯỚC 3 — TỔNG HỢP:
- Gom TẤT CẢ nội dung đã cào được (cả trang chính lẫn các trang phòng) thành một khối văn bản duy nhất.
- Trả về TOÀN BỘ nội dung thô (raw text) đã thu thập được.
- Liệt kê rõ từng phần: [TRANG CHÍNH] ... [TRANG PHÒNG: tên phòng] ...

QUY TẮC:
- TUYỆT ĐỐI không bỏ qua trang chi tiết phòng nếu tìm thấy link.
- Nếu không tìm thấy link phòng riêng, hãy cố gắng tìm bảng giá NGAY trên trang chính.
- Nếu gặp popup, modal, hoặc tab ẩn hiện giá — hãy thử mọi cách để lấy được nội dung.
- Luôn dùng stealthMode: true khi gọi crawlforge_scrape.`,

    // ─── Phase 1: SCRAPE — User Prompt Template ──────────────────────────
    scrapeUserPromptTemplate: `Hãy cào dữ liệu khách sạn từ URL sau đây.
LÀM THEO ĐÚNG QUY TRÌNH 3 BƯỚC đã nêu trong System Prompt.
URL gốc: {{url}}

Sau khi hoàn thành tất cả các bước, hãy trả về TOÀN BỘ nội dung text thô đã thu thập.`,

    // ─── Phase 2: EXTRACT — System Prompt (Bóc tách JSON) ───────────────
    extractSystemPrompt: `BẠN LÀ CHUYÊN GIA BÓC TÁCH DỮ LIỆU KHÁCH SẠN cho hệ thống ERP du lịch.

DỮ LIỆU ĐẦU VÀO: Nội dung web thô được cào từ nhiều trang (trang chính khách sạn + các trang chi tiết phòng/giá).
Nội dung được phân tách bằng các marker [TRANG CHÍNH], [TRANG PHÒNG: ...].

🎯 NHIỆM VỤ: Trích xuất chính xác và ĐẦY ĐỦ thành JSON theo Schema.

═══════════════════════════════════
PHẦN A — hotel_info (Thông tin khách sạn):
═══════════════════════════════════
- name: Tên đầy đủ của khách sạn (tìm trong tiêu đề, heading).
- address: Địa chỉ đầy đủ.
- phone: Số điện thoại liên hệ (nếu có).
- email: Email (nếu có).
- star: Hạng sao, CHỈ LẤY SỐ (vd: "5 sao" → 5). Nếu không rõ → null.
- website: URL website chính thức của khách sạn.
- pictures: Mảng TẤT CẢ link ảnh tìm thấy (ưu tiên ảnh phòng, ảnh KS).
- rooms: Mảng chứa TÊN của TẤT CẢ các hạng phòng (vd: ["Superior", "Deluxe", "Suite"]).

═══════════════════════════════════
PHẦN B — metadata:
═══════════════════════════════════
- supplier_name: Tên nhà cung cấp (nếu thấy trong nội dung), nếu không → "".
- year: Năm áp dụng bảng giá. Nếu thấy nhiều năm → lấy năm gần nhất. Nếu không rõ → năm hiện tại.

═══════════════════════════════════
PHẦN C — items[] (Ma trận giá — QUAN TRỌNG NHẤT):
═══════════════════════════════════
MỖI DÒNG GIÁ trong bảng giá → MỘT item. KHÔNG ĐƯỢC BỎ SÓT DÒNG NÀO.

- room_name: Tên hạng phòng (khớp với rooms[] ở trên).
- rate_name: Loại giá — "base", "BB" (bao gồm ăn sáng), "RO" (chỉ phòng), "FB" (full board). Mặc định "base".
- period_name: Tên mùa/giai đoạn — "all_year", "Cao điểm", "Lễ Tết", "Thấp điểm"... Mặc định "all_year".
- from: Ngày bắt đầu áp dụng, định dạng YYYY-MM-DD.
- to: Ngày kết thúc áp dụng, định dạng YYYY-MM-DD.
- price: 💰 CHỈ LẤY SỐ NGUYÊN SẠCH. Loại bỏ: dấu chấm, dấu phẩy, ký hiệu tiền tệ, chữ.
  Ví dụ: "1.600.000 VNĐ" → 1600000, "2,500,000đ" → 2500000, "$100" → 100.
- note: Ghi chú phụ thu (phụ thu trẻ em, giường phụ, ăn uống...). Nếu không có → "".

⚠️ QUY TẮC CỨNG:
1. Nếu bảng giá có cột "Mùa/Period" và hàng "Phòng/Room" → mỗi ô giao nhau = 1 item.
2. Nếu giá ghi "Liên hệ", "N/A" → bỏ qua dòng đó, KHÔNG điền giá 0.
3. Nếu cùng 1 phòng, 1 mùa nhưng khác loại giá (BB vs RO) → tách thành 2 items riêng.
4. KIỂM TRA LẠI: Đếm số dòng trong bảng giá gốc và so với số items xuất ra.`,

    // ─── Minimum content length before extraction ────────────────────────
    minContentLength: 50,
};

export default hotelCrawlerConfig;