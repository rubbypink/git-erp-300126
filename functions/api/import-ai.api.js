/**
 * =========================================================================
 * IMPORT_AI.API.JS - Backend Firebase V9
 * Chức năng: Nhận file Base64 từ Client -> Gọi Gemini API -> Trả về JSON
 * Người cập nhật: 9Trip Tech Lead
 * =========================================================================
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// CẢNH BÁO: Đang hardcode API Key để test nhanh.
// Khuyến nghị: Sử dụng process.env.GEMINI_API_KEY khi lên Production.
const GEMINI_API_KEY = 'AIzaSyCnvdiSMMcD2LH57FRmqJcMHnhDgC4nYz0';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

exports.processDocumentAI = onCall(
  {
    maxInstances: 10,
    memory: '512MiB',
    timeoutSeconds: 200, // Tăng lên 200s phòng trường hợp file PDF nặng hoặc Model Pro phản hồi lâu
    region: 'asia-southeast1',
  },
  async (request) => {
    try {
      // 1. Kiểm tra Auth (Bảo mật - Block những request không từ user đã đăng nhập)
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập để sử dụng tính năng này.');
      }

      const { fileBase64, mimeType, importType, fileName } = request.data;

      // Kiểm tra tính hợp lệ của dữ liệu đầu vào
      if (!fileBase64 || !mimeType) {
        throw new HttpsError('invalid-argument', 'Dữ liệu file không hợp lệ hoặc bị trống.');
      }

      console.log(`[AI Import] Bắt đầu xử lý file: ${fileName} | Type: ${importType} | Mime: ${mimeType}`);

      // 2. Xây dựng System Prompt dựa trên loại Import
      let systemPrompt = '';

      if (importType === 'hotel_price') {
        systemPrompt = `Bạn là chuyên gia Hệ thống ERP ngành Du lịch (9Trip Tech Lead).
Nhiệm vụ: Phân tích tài liệu/hình ảnh báo giá khách sạn và trích xuất dữ liệu thành một cấu trúc JSON chính xác, đầy đủ cho cơ sở dữ liệu.

Tài liệu hiện tại có tên: ${fileName} (Gợi ý format tên file thường bao gồm: Tên khách sạn - Tên đối tác - Năm áp dụng).

QUY TẮC TRÍCH XUẤT:
Phần A. Thông tin Khách sạn (Dành cho Collection 'hotels'):
1. Tìm và trích xuất các thông tin cơ bản: name (Tên khách sạn), address (Địa chỉ), phone (Số điện thoại), email, website. Nếu không có, để chuỗi rỗng "".
2. star (Hạng sao): Định dạng số (ví dụ: 3, 4, 5). Nếu không rõ, để null.
3. pictures: Nếu trong file có dạng đường link ảnh, đưa vào mảng chuỗi. Nếu không, trả về mảng rỗng [].
4. rooms: Mảng chứa tên TẤT CẢ các hạng phòng xuất hiện trong báo giá (ví dụ: ["Superior", "Deluxe", "Suite"]).

Phần B. Bảng giá & Giai đoạn (Dành cho Collection 'hotel_price_schedules'):
1. "Phẳng hóa" (flatten) ma trận giá thành danh sách các dòng (items).
2. Tên nhà cung cấp (supplier_name) và Năm (year): Lấy từ ngữ cảnh hoặc tên file.
3. Giai đoạn (period_name): Tên mùa (Mùa cao điểm, Lễ Tết...). Nếu không rõ, ghi "all_year".
4. Ngày tháng (from / to): Định dạng chuẩn YYYY-MM-DD. Nếu file chỉ có DD/MM, tự động ghép với năm của báo giá.
5. Gói giá (rate_name): Ví dụ BB (Bed & Breakfast), RO (Room Only), FB (Full Board). Nếu không rõ, ghi "base".
6. Giá (price): CHỈ LẤY SỐ NGUYÊN sạch, loại bỏ dấu phẩy, chữ (ví dụ: "1.600.000 VNĐ" -> 1600000).
7. note: Ghi lại phụ thu, chính sách trẻ em, hoặc các thông tin mờ/không chắc chắn liên quan đến dòng giá đó.

ĐỊNH DẠNG TRẢ VỀ (JSON BẮT BUỘC):
{
  "hotel_info": {
    "name": "...",
    "address": "...",
    "phone": "...",
    "email": "...",
    "star": 5,
    "website": "...",
    "pictures": [],
    "rooms": ["...", "..."]
  },
  "metadata": {
    "supplier_name": "Tên NCC hoặc chuỗi rỗng",
    "year": 2026
  },
  "items": [
    {
      "room_name": "Tên hạng phòng",
      "rate_name": "Tên gói",
      "period_name": "Tên giai đoạn",
      "from": "YYYY-MM-DD",
      "to": "YYYY-MM-DD",
      "price": 1600000,
      "note": "Ghi chú phụ thu..."
    }
  ]
}

TUYỆT ĐỐI CHỈ TRẢ VỀ CHUỖI JSON HỢP LỆ, KHÔNG KÈM THEO BẤT KỲ ĐOẠN TEXT GIẢI THÍCH NÀO BÊN NGOÀI.`;
      } else if (importType === 'service_price') {
        // Giữ nguyên logic cũ của service_price để không phá vỡ tính năng hiện tại
        systemPrompt = `Bạn là chuyên gia trích xuất dữ liệu ERP cho ngành du lịch (9Trip Tech Lead).
Nhiệm vụ: Phân tích hình ảnh bảng giá dịch vụ (vé, ăn uống, phụ thu) và chuyển đổi thành JSON.

QUY TẮC TRÍCH XUẤT:
1. Thông tin chung: Tìm kiếm "Tên nhà cung cấp" (supplier_name) và "Năm áp dụng" (year) từ tên file (được format thứ tự supplier name/year và được ngăn cách bởi dấu '-'. Ví dụ "Công ty B - 2026.png").
2. Đối tượng: Người lớn (adl), Trẻ em (chd).
3. Định dạng ngày: YYYY-MM-DD. Nếu không có thông tin về ngày, thiết lập từ ngày đầu tiên đến ngày cuối cùng của năm cho field "from" và "to".
4. Giá: Số sạch.
5. Độ tin cậy: Nếu không chắc chắn, tạo nội dung cho field "note".

ĐỊNH DẠNG TRẢ VỀ (JSON):
{
  "metadata": {
    "supplier_name": "Tên NCC hoặc null",
    "year": 2026
  },
  "items": [
    {
      "type": "Loại dịch vụ (ví dụ: Vé/Ăn uống/Xe/Tour/DV Khác...)",
      "name": "Tên dịch vụ cụ thể",
      "from": "YYYY-MM-DD",
      "to": "YYYY-MM-DD",
      "adl": 100000,
      "chd": 50000,
      "note": "Ghi chú"
    }
  ]
}

CHỈ TRẢ VỀ JSON, KHÔNG CÓ VĂN BẢN GIẢI THÍCH.`;
      } else {
        systemPrompt = 'Trích xuất thông tin từ tài liệu thành JSON Object. CHỈ TRẢ VỀ JSON.';
      }

      // 3. Khởi tạo Model AI
      // Ghi chú: Có thể đổi thành 'gemini-1.5-pro' nếu bảng giá quá phức tạp và cần độ chính xác ma trận cao hơn.
      const model = genAI.getGenerativeModel({
        model: 'gemini-flash-latest',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1, // Để temperature thấp giúp AI tập trung vào fact, ít sáng tạo linh tinh
        },
      });

      // 4. Chuẩn bị Payload
      const userPrompt = `Tên file gốc: ${fileName || 'Không rõ'}. Hãy trích xuất dữ liệu tuân thủ nghiêm ngặt theo JSON schema đã yêu cầu.`;

      const imageParts = [
        {
          inlineData: {
            data: fileBase64,
            mimeType: mimeType, // Hỗ trợ image/jpeg, image/png, application/pdf
          },
        },
      ];

      // 5. Gọi AI Model xử lý
      console.log(`[AI Import] Đang gửi request tới Gemini API...`);
      const result = await model.generateContent([systemPrompt, userPrompt, ...imageParts]);
      const responseText = result.response.text();

      // 6. Làm sạch và Parse JSON
      // Loại bỏ markdown code block nếu AI vô tình trả về (dù đã set responseMimeType)
      const cleanJson = responseText
        .replace(/^```json/m, '')
        .replace(/^```/m, '')
        .replace(/```$/m, '')
        .trim();

      let parsedData = null;
      try {
        parsedData = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error('[AI Import] Lỗi Parse JSON:', cleanJson);
        throw new HttpsError('internal', 'AI phân tích dữ liệu thành công nhưng định dạng JSON bị lỗi. Vui lòng thử lại.');
      }

      console.log(`[AI Import] Trích xuất thành công! Tìm thấy ${parsedData.items?.length || 0} dòng giá.`);

      return {
        success: true,
        data: parsedData,
      };
    } catch (error) {
      console.error('[AI Import] Lỗi nghiệp vụ:', error);

      // Nếu là lỗi của Firebase Function (đã throw HttpsError) thì throw thẳng
      if (error instanceof HttpsError) {
        throw error;
      }

      // Lỗi từ Google API (ví dụ: quá dung lượng, sai key...)
      throw new HttpsError('internal', `Lỗi xử lý AI: ${error.message}`);
    }
  }
);
