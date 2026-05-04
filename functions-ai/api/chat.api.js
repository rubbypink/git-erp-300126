import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { chatbotFlow } from '../ai/flows/chatbot.flow.js';

export const chatWithEmily = onCall(
    {
        region: 'asia-southeast1',
        maxInstances: 10,
        cors: ['https://erp.9tripphuquoc.com', 'erp.9tripphuquoc.com', '9tripphuquoc.com'],
        invoker: 'public',
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
