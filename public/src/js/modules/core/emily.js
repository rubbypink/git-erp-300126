/**
 * @class EmilyChatUI
 * @description All-in-One Chatbot Component (Bao gồm cả HTML, CSS và Logic)
 */

export default class EmilyChatUI {
    constructor() {
        this.isInitialized = false;

        // --- CẬP NHẬT LOGIC LƯU SESSION VÀO TRÌNH DUYỆT ---
        let savedSession = localStorage.getItem('emily_session_id');
        if (!savedSession) {
            // Nếu khách mới tinh, tạo ID mới và lưu lại
            savedSession = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
            localStorage.setItem('emily_session_id', savedSession);
        }
        this.sessionId = savedSession;
    }

    /**
     * @method init
     * @description Khởi chạy toàn bộ hệ thống của Emily
     */
    init() {
        if (this.isInitialized) return;

        this.injectCSS(); // 1. Bơm Style
        this.injectHTML(); // 2. Bơm Giao diện
        this.cacheDOM(); // 3. Quét lấy Elements
        this.bindEvents(); // 4. Gắn sự kiện (Toggle, Send...)

        this.isInitialized = true;
        console.log('👧 Emily Chatbot v2.0 - All-in-One Ready!');
    }

    // ==========================================
    // 1. INJECT CSS TRỰC TIẾP VÀO HEAD
    // ==========================================
    injectCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            #emily-widget-container { z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; }
            #emily-chat-window { width: 350px; height: 500px; border-radius: 15px; overflow: hidden; margin-bottom: 15px; transition: all 0.3s ease; }
            .emily-hidden { opacity: 0; transform: translateY(20px); pointer-events: none; position: absolute; visibility: hidden; }
            .emily-visible { opacity: 1; transform: translateY(0); pointer-events: auto; position: relative; visibility: visible; }
            #emily-chat-box::-webkit-scrollbar { width: 6px; }
            #emily-chat-box::-webkit-scrollbar-thumb { background-color: #ccc; border-radius: 10px; }
            .chat-msg { animation: fadeIn 0.3s ease-in-out; word-wrap: break-word; font-size: 0.8rem; max-width: 85%; padding: 10px; margin-bottom: 10px; }
            .user-msg { background-color: #0d6efd; color: white; align-self: flex-end; border-radius: 15px 15px 0 15px; }
            .emily-msg { background-color: #ffffff; color: #333; align-self: flex-start; border-radius: 15px 15px 15px 0; border: 1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @media (max-width: 576px) { #emily-chat-window { width: calc(100vw - 30px); height: calc(100vh - 120px); } }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // 2. INJECT HTML TRỰC TIẾP VÀO BODY
    // ==========================================
    injectHTML() {
        const htmlContent = `
            <div id="emily-widget-container" class="position-fixed bottom-0 end-0 m-4">
                <div id="emily-chat-window" class="card shadow-lg emily-hidden bg-white">
                    <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center p-3">
                        <div class="d-flex align-items-center">
                            <div class="bg-white rounded-circle d-flex justify-content-center align-items-center fw-bold text-primary me-2" style="width: 35px; height: 35px;">E</div>
                            <h6 class="m-0 fw-bold">Emily - 9Trip Assistant</h6>
                        </div>
                        <button type="button" class="btn-close btn-close-white" id="btn-close-emily" aria-label="Close"></button>
                    </div>
                    <div class="card-body bg-light overflow-auto p-3" id="emily-chat-box" style="display: flex; flex-direction: column;">
                        <div class="chat-msg emily-msg">
                            <strong>👧 Emily:</strong> Xin chào! Em là trợ lý ảo của 9Trip. Anh/chị cần hỗ trợ gì ạ?
                        </div>
                    </div>
                    <div class="card-footer bg-white p-2">
                        <div class="input-group">
                            <input type="text" id="emily-input" class="form-control" placeholder="Nhập câu hỏi..." style="border-radius: 20px 0 0 20px;">
                            <button class="btn btn-primary" id="btn-send-emily" style="border-radius: 0 20px 20px 0;">Gửi</button>
                        </div>
                    </div>
                </div>
                <button id="btn-toggle-emily" class="btn btn-primary rounded-circle shadow-lg fw-bold fs-4 d-flex justify-content-center align-items-center" style="width: 60px; height: 60px; align-self: flex-end;">
                    💬
                </button>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', htmlContent);
    }

    // ==========================================
    // 3. DOM ELEMENTS CACHING
    // ==========================================
    cacheDOM() {
        this.dom = {
            window: document.getElementById('emily-chat-window'),
            btnToggle: document.getElementById('btn-toggle-emily'),
            btnClose: document.getElementById('btn-close-emily'),
            btnSend: document.getElementById('btn-send-emily'),
            input: document.getElementById('emily-input'),
            chatBox: document.getElementById('emily-chat-box'),
        };
    }

    // ==========================================
    // 4. BIND EVENTS (GẮN LOGIC)
    // ==========================================
    bindEvents() {
        // Mở / Đóng Chat
        const toggleChat = () => {
            const isHidden = this.dom.window.classList.contains('emily-hidden');
            if (isHidden) {
                this.dom.window.classList.remove('emily-hidden');
                this.dom.window.classList.add('emily-visible');
                this.dom.input.focus();
            } else {
                this.dom.window.classList.remove('emily-visible');
                this.dom.window.classList.add('emily-hidden');
            }
        };

        this.dom.btnToggle.addEventListener('click', toggleChat);
        this.dom.btnClose.addEventListener('click', toggleChat);

        // Gửi tin nhắn
        this.dom.btnSend.addEventListener('click', () => this.sendMessage());
        this.dom.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    // ==========================================
    // 5. CORE LOGIC CHAT
    // ==========================================
    appendMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${sender === 'emily' ? 'emily-msg' : 'user-msg'}`;
        msgDiv.innerHTML = text; // Hỗ trợ HTML
        this.dom.chatBox.appendChild(msgDiv);
        this.dom.chatBox.scrollTop = this.dom.chatBox.scrollHeight;
    }

    async sendMessage() {
        const text = this.dom.input.value.trim();
        if (!text) return;

        // Kiểm tra xem user có yêu cầu đổi model qua cú pháp không (Ví dụ: /gpt4 nội dung...)
        let targetModel = null;
        let cleanText = text;
        if (text.startsWith('/')) {
            const parts = text.split(' ');
            const cmd = parts[0].toLowerCase();
            // Dòng 155-162: sửa các targetModel
            if (cmd === '/openai' || cmd === '/gpt4') targetModel = 'openai';
            else if (cmd === '/deepseek') targetModel = 'deepseek';
            else if (cmd === '/gemini' || cmd === '/flash') targetModel = 'emily';
            else if (cmd === '/pro') targetModel = 'gemini';

            // Dòng 190: sửa default model

            if (targetModel) {
                cleanText = parts.slice(1).join(' ');
                if (!cleanText) {
                    this.appendMessage('emily', `<strong>👧 Emily:</strong><br>Vui lòng nhập nội dung sau lệnh điều hướng model.`);
                    this.dom.input.value = '';
                    return;
                }
            }
        }

        // Khóa UI
        this.dom.input.value = '';
        this.dom.input.disabled = true;
        this.dom.btnSend.disabled = true;

        // In lời thoại User
        this.appendMessage('user', `<strong>👤 Bạn:</strong><br>${text}`);

        // In Loading
        const typingId = `typing-${Date.now()}`;
        this.appendMessage('emily', `<div id="${typingId}"><em>Đang suy nghĩ... ⏳</em></div>`);

        try {
            // Gọi Backend Firebase Functions
            const response = await A.DB.callFunction('chatWithEmily', {
                sessionId: this.sessionId,
                message: cleanText,
                model: targetModel || 'emily',
            });

            // Xóa Loading & In kết quả
            document.getElementById(typingId).parentNode.remove();
            this.appendMessage('emily', `<strong>👧 Emily:</strong><br>${response.reply.replace(/\n/g, '<br>')}`);
        } catch (error) {
            console.error('[Emily Error]:', error);
            document.getElementById(typingId).innerHTML = "<span class='text-danger'>Hệ thống AI đang bảo trì 😢</span>";
        } finally {
            // Mở khóa UI
            this.dom.input.disabled = false;
            this.dom.btnSend.disabled = false;
            this.dom.input.focus();
        }
    }
}
