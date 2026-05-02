---
name: clone-web-data
description: Workflow sao chép dữ liệu từ web qua FireCrawl MCP, chuẩn hóa theo schema Firestore hiện tại, và gửi tới ERP Cloud Functions. Sử dụng prompt-engineer để tối ưu prompt và orchestrator để định dạng dữ liệu.
---

# Clone Web Data Workflow

**Role**: Web Data Sync Orchestrator

Quy trình tự động lấy dữ liệu từ URL bên ngoài, chuyển đổi sang cấu trúc chuẩn của hệ thống 9Trip B2C, và đồng bộ lên Firestore qua ERP Cloud Functions.

## Workflow Overview

```
USER_URL → [Prompt Optimizer] → [FireCrawl MCP] → [Orchestrator Format] → [ERP Endpoint]
```

## Prerequisites

- FireCrawl MCP server đã kết nối (cung cấp `firecrawl_scrape`, `firecrawl_map`, `firecrawl_search`)
- User cung cấp URL nguồn dữ liệu
- Xác định rõ loại service cần clone (Tour, Hotel, Room, Activity, Car, Rental, Location)

## Execution Steps

### Bước 1: Xác Định Schema Mục Tiêu

Hỏi user xác định loại dữ liệu cần clone. Mỗi loại service có schema khác nhau trong Firestore:

**Danh sách service types hợp lệ:**

- `tour` — Tour du lịch
- `hotel` — Khách sạn
- `room` — Phòng khách sạn (cần `hotelId`)
- `activity` — Hoạt động/trải nghiệm
- `car` — Xe/ phương tiện di chuyển
- `rental` — Dịch vụ cho thuê
- `location` — Địa điểm/điểm đến

Nếu user chưa cung cấp service type, **bắt buộc hỏi lại** trước khi tiếp tục.

### Bước 2: Tối Ưu Prompt Với Prompt-Engineer

Sử dụng `prompt-engineer` skill để tạo prompt tối ưu cho FireCrawl MCP:

1. **Xác định service type** → map tới schema chuẩn bên dưới
2. **Inject schema context** vào prompt FireCrawl — chỉ include schema của service type được chọn
3. **Áp dụng prompt patterns**:
    - **Structured System Prompt**: Role = "9Trip Data Extractor", Context = schema fields, Output Format = JSON matching schema
    - **Few-Shot Examples**: Cung cấp 2-3 example documents đúng format
    - **Negative Instructions**: Nêu rõ những field KHÔNG được thêm vào (không tự ý thêm field ngoài schema)
4. **Output requirement**: JSON array of objects, mỗi object map chính xác vào schema

### Bước 3: Gọi FireCrawl MCP

Sử dụng `firecrawl_scrape` hoặc `firecrawl_map` + `firecrawl_scrape` để lấy dữ liệu:

- **Single page**: Dùng `firecrawl_scrape` với format `json` và schema đã tối ưu
- **Multiple pages**: Dùng `firecrawl_map` để discovery URLs → sau đó scrape từng page
- **Search mode**: Dùng `firecrawl_search` nếu cần tìm kiếm trước khi scrape

**Importan**: Luôn dùng `jsonOptions` với `prompt` và `schema` tối ưu từ Bước 2.

### Bước 4: Định Dạng Dữ Liệu Với Orchestrator

Sau khi nhận data từ FireCrawl MCP, gọi `orchestrator` skill để:

1. **Validate** — Kiểm tra từng document có đủ required fields không
2. **Transform** — Chuẩn hóa field names, data types, formats:
    - `slug`: Tự động generate từ `title`/`name` nếu thiếu (lowercase, hyphenated)
    - `pricing.basePrice`: Đảm bảo là number
    - `pricing.currency`: Mặc định "VND" nếu thiếu
    - `rating`: number 1-5, mặc định 0 nếu thiếu
    - `reviewCount`: number, mặc định 0
    - `featured`: boolean, mặc định false
    - `status`: string, mặc định "active"
    - `createdAt`/`updatedAt`: ISO timestamp hiện tại
    - `gallery[]`/`images[]`: Đảm bảo là array of URL strings
    - `amenities[]`/`features[]`/`categories[]`/`tags[]`: Đảm bảo là array
3. **Clean** — Loại bỏ field thừa (không có trong schema)
4. **Report** — Báo cáo số lượng documents đã xử lý, field đã transform, field bị loại bỏ

### Bước 5: Gửi Dữ Liệu Tới ERP Cloud Functions

Gửi dữ liệu đã chuẩn hóa tới endpoint:

```
POST https://erp.9tripphuquoc.com/cloneWebData
Content-Type: application/json

{
  "serviceType": "<tour|hotel|room|activity|car|rental|location>",
  "documents": [
    { ... document đã format ... }
  ],
  "meta": {
    "sourceUrl": "<URL gốc>",
    "clonedAt": "<ISO timestamp>",
    "totalDocuments": <number>
  }
}
```

**Expected response**: `{ "success": true, "syncedCount": <number>, "errors": [] }`

## Collection Schema Reference

Chỉ inject schema của service type được chọn vào prompt FireCrawl:

### Tour Schema

```json
{
    "id": "string (auto-generated)",
    "slug": "string (URL-friendly, e.g. 'phu-quoc-3d2n')",
    "title": "string",
    "excerpt": "string (short description, max 200 chars)",
    "description": "string (full HTML description)",
    "featuredImage": "string (URL)",
    "gallery": ["string (URL array)"],
    "duration": "string (e.g. '3D2N')",
    "destinations": ["string (location names)"],
    "itinerary": [{ "day": "number", "title": "string", "description": "string", "meals": "string", "accommodation": "string" }],
    "inclusions": ["string"],
    "exclusions": ["string"],
    "pricing": { "basePrice": "number", "currency": "string (VND|USD|EUR, default: VND)", "discountPercent": "number (default: 0)", "discountLabel": "string", "maxPeople": "number" },
    "availability": { "startDates": ["string (ISO date)"], "calendar": [{ "date": "string (ISO date)", "available": "boolean", "price": "number" }] },
    "categories": ["string"],
    "tags": ["string"],
    "rating": "number (1-5, default: 0)",
    "reviewCount": "number (default: 0)",
    "featured": "boolean (default: false)",
    "status": "string (default: 'active')",
    "metaTitle": "string",
    "metaDescription": "string",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

### Hotel Schema

```json
{
    "id": "string (auto-generated)",
    "slug": "string",
    "name": "string",
    "excerpt": "string",
    "description": "string",
    "featuredImage": "string (URL)",
    "gallery": ["string (URL array)"],
    "address": { "street": "string", "city": "string", "country": "string", "lat": "number", "lng": "number" },
    "starRating": "number (1-5)",
    "amenities": ["string"],
    "policies": { "checkInTime": "string (e.g. '14:00')", "checkOutTime": "string (e.g. '12:00')", "cancellation": "string" },
    "rating": "number (1-5, default: 0)",
    "reviewCount": "number (default: 0)",
    "featured": "boolean (default: false)",
    "status": "string (default: 'active')",
    "metaTitle": "string",
    "metaDescription": "string",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

### Room Schema

```json
{
    "id": "string (auto-generated)",
    "hotelId": "string (required - reference to hotel)",
    "slug": "string",
    "name": "string",
    "description": "string",
    "images": ["string (URL array)"],
    "roomType": "string",
    "maxGuests": "number",
    "bedType": "string",
    "pricing": { "basePrice": "number", "currency": "string (default: VND)", "discountPercent": "number (default: 0)" },
    "amenities": ["string"],
    "availability": { "totalRooms": "number", "calendar": [{ "date": "string (ISO date)", "available": "boolean", "price": "number" }] },
    "status": "string (default: 'active')",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

### Activity Schema

```json
{
    "id": "string (auto-generated)",
    "slug": "string",
    "title": "string",
    "excerpt": "string",
    "description": "string",
    "featuredImage": "string (URL)",
    "gallery": ["string (URL array)"],
    "duration": "string",
    "location": "string",
    "pricing": { "basePrice": "number", "currency": "string (default: VND)", "discountPercent": "number (default: 0)" },
    "availability": { "startDates": ["string (ISO date)"], "calendar": [{ "date": "string (ISO date)", "available": "boolean", "price": "number" }] },
    "categories": ["string"],
    "rating": "number (1-5, default: 0)",
    "reviewCount": "number (default: 0)",
    "featured": "boolean (default: false)",
    "status": "string (default: 'active')",
    "metaTitle": "string",
    "metaDescription": "string",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

### Car Schema

```json
{
    "id": "string (auto-generated)",
    "slug": "string",
    "name": "string",
    "excerpt": "string",
    "description": "string",
    "images": ["string (URL array)"],
    "carType": "string",
    "transmission": "string (e.g. 'automatic', 'manual')",
    "seats": "number",
    "pricing": { "basePrice": "number", "currency": "string (default: VND)", "pricePerDay": "number", "discountPercent": "number (default: 0)" },
    "features": ["string"],
    "availability": { "calendar": [{ "date": "string (ISO date)", "available": "boolean", "price": "number" }] },
    "rating": "number (1-5, default: 0)",
    "reviewCount": "number (default: 0)",
    "featured": "boolean (default: false)",
    "status": "string (default: 'active')",
    "metaTitle": "string",
    "metaDescription": "string",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

### Rental Schema

```json
{
    "id": "string (auto-generated)",
    "slug": "string",
    "name": "string",
    "excerpt": "string",
    "description": "string",
    "images": ["string (URL array)"],
    "type": "string",
    "location": "string",
    "pricing": { "basePrice": "number", "currency": "string (default: VND)", "pricePerDay": "number", "discountPercent": "number (default: 0)" },
    "features": ["string"],
    "availability": { "calendar": [{ "date": "string (ISO date)", "available": "boolean", "price": "number" }] },
    "rating": "number (1-5, default: 0)",
    "reviewCount": "number (default: 0)",
    "featured": "boolean (default: false)",
    "status": "string (default: 'active')",
    "metaTitle": "string",
    "metaDescription": "string",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

### Location Schema

```json
{
    "id": "string (auto-generated)",
    "slug": "string",
    "name": "string",
    "type": "string (e.g. 'city', 'island', 'region')",
    "parentId": "string (optional)",
    "description": "string",
    "image": "string (URL)",
    "lat": "number",
    "lng": "number",
    "country": "string",
    "featured": "boolean (default: false)",
    "status": "string (default: 'active')",
    "createdAt": "string (ISO timestamp)",
    "updatedAt": "string (ISO timestamp)"
}
```

## FireCrawl Prompt Template

Khi gọi FireCrawl MCP, sử dụng template sau (đã được prompt-engineer tối ưu):

```
Role: You are a 9Trip B2C data extraction specialist. Your task is to extract structured data from the provided web page that matches the exact schema of our travel platform.

Context: The 9Trip platform manages {serviceType} data in Firestore with a strict schema. Every field in the output must conform to the schema below. Do NOT invent fields outside this schema.

Schema to follow:
{CHOSEN_SCHEMA_JSON}

Instructions:
1. Extract ALL {serviceType} items found on the page
2. For each item, map every available piece of information to the EXACT field names in the schema
3. Generate slug from name/title: lowercase, remove special chars, replace spaces with hyphens
4. Set pricing.currency to "VND" unless explicitly stated otherwise
5. Set rating to 0 and reviewCount to 0 if not available
6. Set featured to false and status to "active" as defaults
7. Set createdAt and updatedAt to the current ISO timestamp
8. For image fields, extract full absolute URLs only
9. For array fields (gallery, amenities, categories, tags), return proper JSON arrays

Constraints - DO NOT:
- Add any fields not in the schema
- Guess or fabricate missing data — leave as null or default value
- Change field names or structure from the schema
- Include HTML tags in text fields (strip HTML, keep plain text)
- Include markdown or commentary in the output

Output Format: Return a valid JSON array of objects. Each object must strictly follow the provided schema structure. No extra text, no markdown wrapping, just the raw JSON array.

Example of one correct output document:
{EXAMPLE_DOCUMENT}
```

## ERP Endpoint Specification

```
POST https://erp.9tripphuquoc.com/cloneWebData

Headers:
  Content-Type: application/json

Request Body:
{
  "serviceType": "tour",
  "documents": [
    {
      "slug": "phu-quoc-3d2n",
      "title": "Phú Quốc 3N2Đ",
      ...full document per schema
    }
  ],
  "meta": {
    "sourceUrl": "https://example.com/tours",
    "clonedAt": "2026-04-27T07:20:00.000Z",
    "totalDocuments": 5
  }
}

Success Response (200):
{
  "success": true,
  "syncedCount": 5,
  "errors": []
}

Error Response (4xx/5xx):
{
  "success": false,
  "error": "Error message",
  "errors": ["Document 2: Missing required field 'title'"]
}
```

## Constraints

- **KHÔNG tự ý thêm field** ngoài schema đã định nghĩa
- **KHÔNG gọi FireCrawl** khi chưa xác định rõ service type
- **KHÔNG bỏ qua bước validate** dữ liệu trước khi gửi ERP
- **Hỏi user** nếu thiếu context về schema (vd: Room cần hotelId)
- **DỪNG ngay** nếu API trả về lỗi — không retry

## Related Skills

Sử dụng cùng: `prompt-engineer` (tối ưu prompt FireCrawl), `orchestrator` (định dạng & validate dữ liệu), `firebase-ai-logic` (nếu cần xử lý AI backend)

## Triggers

Kích hoạt khi user:

- Đề cập đến "clone", "sao chép dữ liệu từ web", "lấy data từ URL"
- Muốn import dữ liệu từ website khác vào hệ thống 9Trip
- Yêu cầu "cloneWebData" hoặc "sync web data"
