import { ChatMessage } from '../types/chat';

class ChatbotService {
    async sendMessage(message: string, context?: any): Promise<ChatMessage> {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock response logic
        let responseText = "I understand. Can you provide more details?";
        if (message.toLowerCase().includes('analyze')) {
            responseText = "I'm analyzing the data now. Please wait a moment.";
        }

        return {
            id: Date.now().toString(),
            role: 'assistant',
            message: responseText,
            timestamp: new Date(),
            confidence: 0.95,
            responseTimeMs: 800
        };
    }
}

export default new ChatbotService();
