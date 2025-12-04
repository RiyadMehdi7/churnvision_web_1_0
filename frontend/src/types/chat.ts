export interface ChatMessage {
  id?: string | number;
  sessionId: string;
  userId?: number;
  employeeId?: string;
  message: string; // Note: chatbot.ts sendMessage uses 'content', maybe unify?
  role: 'user' | 'assistant' | 'system';
  intent?: string;
  confidence?: number;
  timestamp?: Date;
  isBot?: boolean;
}

export interface ChatResponse {
  success: boolean;
  userMessageId: string;
  botMessageId: string;
  response: {
    message: string;
    intent?: string;
    confidence?: number;
    responseTime: number;
    structuredData?: Record<string, any>; // Structured JSON for frontend renderers
  };
} 