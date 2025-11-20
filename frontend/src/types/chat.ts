export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    message: string;
    timestamp?: Date | string;
    intent?: string;
    confidence?: number;
    responseTimeMs?: number;
}
