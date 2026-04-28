/**
 * @module CrawlerController
 * @description Xử lý logic ném Link lên Cloud và lắng nghe kết quả trả về
 */
import { getFirestore, collection, addDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { AUTH_MANAGER } from 'LoginModule.js'; // Đường dẫn file config của bro

const db = getFirestore(AUTH_MANAGER.app); // Khởi tạo Firestore với app đã config trong LoginModule

const CrawlerController = (function () {
    // Khởi tạo quy trình Cào
    const startScraping = async (targetUrl, scrapingType = 'hotel') => {
        if (!targetUrl) {
            Swal.fire('Lỗi', 'Vui lòng nhập URL cần cào!', 'warning');
            return;
        }

        try {
            // UI: Bật màn hình Loading không cho tắt
            Swal.fire({
                title: 'AI đang làm việc...',
                html: 'Vui lòng không tắt trình duyệt. Đang khởi tạo bộ máy cào web... <b></b>',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                },
            });

            // 1. Tạo 1 Task (Document) mới trên Firestore
            const tasksRef = collection(db, 'ai_crawler_tasks');
            const newTaskRef = await addDoc(tasksRef, {
                url: targetUrl,
                type: scrapingType, // 'hotel' hoặc 'tour'
                status: 'pending',
                created_by: CURRENT_USER.name,
                created_at: serverTimestamp(),
            });

            // 2. Lắng nghe (Listen) sự thay đổi của chính Document vừa tạo
            const unsubscribe = onSnapshot(doc(db, 'ai_crawler_tasks', newTaskRef.id), (docSnap) => {
                if (!docSnap.exists()) return;

                const data = docSnap.data();
                const swalHtml = Swal.getHtmlContainer();

                // Cập nhật câu chữ trên UI cho nó sinh động
                if (data.status === 'processing' && swalHtml) {
                    swalHtml.querySelector('b').textContent = '(Đang vượt tường lửa và bóc tách dữ liệu...)';
                }

                // 3. Nhận Kết Quả Thành Công
                if (data.status === 'completed') {
                    unsubscribe(); // Hủy lắng nghe để tiết kiệm bộ nhớ
                    Swal.fire('Thành công!', 'Đã bóc tách xong ma trận giá!', 'success');

                    // TODO: Đẩy data.result_data (Cục JSON) này vào giao diện Matrix Input của bro
                    console.log('Dữ liệu cào được:', data.result_data);
                    // UI_PriceManager.renderMatrix(data.result_data);
                }

                // 4. Nhận Kết Quả Lỗi
                if (data.status === 'error') {
                    unsubscribe();
                    Swal.fire('Lỗi Cào Dữ Liệu', data.error_message, 'error');
                }
            });
        } catch (error) {
            console.error('Lỗi khởi tạo Crawler:', error);
            Swal.fire('Lỗi Hệ Thống', 'Không thể kết nối đến máy chủ AI.', 'error');
        }
    };

    return {
        // Gắn vào nút bấm ở FE
        init: function () {
            const btnScrape = document.getElementById('btn-start-scrape');
            const inputUrl = document.getElementById('input-scrape-url');

            if (btnScrape && inputUrl) {
                btnScrape.addEventListener('click', () => {
                    startScraping(inputUrl.value.trim(), 'hotel');
                });
            }
        },
    };
})();

// Khởi chạy
document.addEventListener('DOMContentLoaded', CrawlerController.init);
