const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { chatbotFlow } = require('../ai/flows/chatbot.flow');

exports.chatWithEmily = onCall(
    {
        region: 'asia-southeast1',
        maxInstances: 10,
    },
    async (request) => {
        try {
            const { sessionId, message, model } = request.data;
            if (!message) throw new HttpsError('invalid-argument', 'Tin nhắn không được để trống.');

            const reply = await chatbotFlow({
                sessionId: sessionId || 'default-session',
                message,
                model,
            });
            return { success: true, reply: reply };
        } catch (error) {
            console.error('[ERROR Emily Chat]:', error);
            // Log chi tiết lỗi ra console của Firebase để dễ debug
            if (error instanceof Error) {
                console.error('Stack Trace:', error.stack);
            }
            throw new HttpsError('internal', 'Emily đang bận, vui lòng thử lại sau.');
        }
    }
);
