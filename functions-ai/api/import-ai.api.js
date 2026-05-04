import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'genkit';
import { gemini } from '../ai/index.js';

export const processDocumentAI = onCall(
    {
        maxInstances: 10,
        memory: '512MiB',
        timeoutSeconds: 300,
        region: 'asia-southeast1',
        cors: true,
    },
    async (request) => {
        try {
            if (!request.auth) throw new HttpsError('unauthenticated', 'Vui lòng đăng nhập.');

            const { fileBase64, mimeType, importType, fileName } = request.data;
            if (!fileBase64 || !mimeType) throw new HttpsError('invalid-argument', 'Data trống.');

            console.log(`[AI Import] Đang xử lý file: ${fileName} | Type: ${importType}`);

            let systemPrompt = '';
            let targetSchema = null;

            // ==========================================
            // SCHEMA 1: HOTEL PRICE
            // ==========================================
            if (importType === 'hotel_price') {
                systemPrompt = `Bạn là chuyên gia Hệ thống ERP ngành Du lịch (9Trip Tech Lead).
Nhiệm vụ: Phân tích tài liệu báo giá khách sạn và trích xuất dữ liệu. Tài liệu hiện tại: ${fileName} (Gợi ý format: Tên KS - Tên ĐT - Năm).

QUY TẮC TRÍCH XUẤT:
Phần A. Thông tin Khách sạn: Tìm tên khách sạn, địa chỉ, số điện thoại, email, website. Hạng sao (star) chỉ lấy số. Trích xuất mảng link ảnh (nếu có). Trích xuất mảng 'rooms' chứa tên TẤT CẢ các hạng phòng.
Phần B. Bảng giá & Giai đoạn:
1. "Phẳng hóa" (flatten) ma trận giá thành danh sách các dòng (items).
2. Lấy Tên nhà cung cấp (supplier_name) và Năm (year) từ ngữ cảnh.
3. Giai đoạn (period_name): Tên mùa (Cao điểm, Lễ Tết...). Không rõ thì ghi "all_year".
4. Ngày tháng (from / to): Định dạng YYYY-MM-DD. Nếu file chỉ có DD/MM, tự động ghép với năm báo giá.
5. Gói giá (rate_name): (BB, RO, FB). Không rõ ghi "base".
6. Giá (price): CHỈ LẤY SỐ NGUYÊN sạch, loại bỏ dấu phẩy, chữ (vd: "1.600.000 VNĐ" -> 1600000).
7. note: Ghi lại phụ thu, chính sách trẻ em...`;

                targetSchema = z.object({
                    hotel_info: z.object({
                        name: z.string().default(''),
                        address: z.string().default(''),
                        phone: z.string().default(''),
                        email: z.string().default(''),
                        star: z.number().nullable(),
                        website: z.string().default(''),
                        pictures: z.array(z.string()),
                        rooms: z.array(z.string()),
                    }),
                    metadata: z.object({
                        supplier_name: z.string().default(''),
                        year: z.number(),
                    }),
                    items: z.array(
                        z.object({
                            room_name: z.string(),
                            rate_name: z.string().default('base'),
                            period_name: z.string().default('all_year'),
                            from: z.string(),
                            to: z.string(),
                            price: z.number(),
                            note: z.string().default(''),
                        })
                    ),
                });
            }
            // ==========================================
            // SCHEMA 2: SERVICE PRICE
            // ==========================================
            else if (importType === 'service_price') {
                systemPrompt = `Bạn là chuyên gia trích xuất dữ liệu ERP cho ngành du lịch. File: ${fileName}.
QUY TẮC TRÍCH XUẤT:
1. Tìm "Tên nhà cung cấp" và "Năm áp dụng" từ tên file (Format: NCC - Năm).
2. Đối tượng: Người lớn (adl), Trẻ em (chd).
3. Định dạng ngày: YYYY-MM-DD. Nếu không có, set từ ngày đầu đến ngày cuối năm.
4. Giá: Số nguyên sạch. Độ tin cậy thấp thì ghi vào note.`;

                targetSchema = z.object({
                    metadata: z.object({ supplier_name: z.string().nullable(), year: z.number() }),
                    items: z.array(
                        z.object({
                            type: z.string(),
                            name: z.string(),
                            from: z.string(),
                            to: z.string(),
                            adl: z.number(),
                            chd: z.number(),
                            note: z.string().default(''),
                        })
                    ),
                });
            }

            if (!targetSchema) throw new HttpsError('invalid-argument', 'Loại import chưa hỗ trợ.');

            // Gọi AI
            const multimodalPrompt = [{ text: 'Phân tích tài liệu đính kèm này.' }, { media: { url: `data:${mimeType};base64,${fileBase64}` } }];

            const extractResult = await gemini.extractJSON(multimodalPrompt, targetSchema, systemPrompt);
            if (!extractResult.success) throw new HttpsError('internal', `Lỗi AI: ${extractResult.error}`);

            return { success: true, data: extractResult.data };
        } catch (error) {
            console.error('[ERROR]', error);
            throw new HttpsError('internal', error.message);
        }
    }
);
