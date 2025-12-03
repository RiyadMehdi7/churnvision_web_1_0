import { v4 as uuidv4 } from 'uuid';
// Remove the import for the HTTP api client if it's no longer needed for this service
import api from '@/services/api';
import { ChatMessage, ChatResponse } from '@/types/chat';

// --- Define window interface augmentation for Electron preload ---
// It's often better to put this in a dedicated types file (e.g., electron.d.ts)
// REMOVED local redeclaration to rely on global definition
/*
declare global {
  interface Window {
    electronApi?: {
      chatbot: {
        sendMessage: (payload: SendMessagePayload) => Promise<ChatResponse>;
        getHistory: (sessionId: string) => Promise<ChatMessage[]>;
        // Add other chatbot-related methods if exposed via preload
      };
      // Add other preload namespaces if needed
    };
  }
}
*/
// --- End window interface augmentation ---

// Keep existing interfaces like Message, ChatContext, etc.
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'system';
  timestamp: Date;
  custom?: any;
  lastInteractionTime?: Date;
  churnRisk?: number;
  shap_values?: any;
  language?: string;
  turnCount?: number;
}

export interface ChatContext {
  employeeId?: number;
  employeeName?: string;
  position?: string;
  department?: string;
  churnRisk?: number;
  shap_values?: any;
  language?: string;
  turnCount?: number;
}

export interface ChatAnalytics {
  averageResponseTime: number;
  totalInteractions: number;
  successfulInteractions: number;
  failedInteractions: number;
}

// Keep original SendMessagePayload if defined, or define here
interface SendMessagePayload {
  sessionId: string;
  employeeId?: string | number | null;
  content: string;
  // userId?: number; // Removed userId
}

class ChatbotService {
  private static instance: ChatbotService;

  public static getInstance(): ChatbotService {
    if (!ChatbotService.instance) {
      ChatbotService.instance = new ChatbotService();
    }
    return ChatbotService.instance;
  }

  private sessionId: string;
  private context: ChatContext = {};
  private turnCount: number = 0;
  private messageCache: Map<string, Message[]> = new Map();
  private analytics: ChatAnalytics = {
    averageResponseTime: 0,
    totalInteractions: 0,
    successfulInteractions: 0,
    failedInteractions: 0
  };
  private offlineQueue: Array<{ message: string; context?: ChatContext }> = [];

  constructor() {
    this.sessionId = this.loadOrCreateSessionId();
    this.loadPersistedData();
    this.setupOfflineSupport();
    this.setupPeriodicCleanup();
  }

  private setupPeriodicCleanup(): void {
    // Clean up old messages every hour
    setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      this.messageCache.forEach((messages, sessionId) => {
        const filteredMessages = messages.filter(msg => msg.timestamp.getTime() > oneHourAgo);
        if (filteredMessages.length !== messages.length) {
          this.messageCache.set(sessionId, filteredMessages);
          this.persistData();
        }
      });
    }, 60 * 60 * 1000);
  }

  private loadOrCreateSessionId(): string {
    // Session ID is now independent of user login
    let sessionId = localStorage.getItem('chatbot_session_id');
    if (!sessionId) {
      // Generate a new session ID if none exists
      // Consider using a more robust UUID generation or strategy if needed
      sessionId = `anon-session-${uuidv4()}`;
      this.persistSession(sessionId);
    }
    return sessionId;
  }

  private persistSession(sessionId: string): void {
    localStorage.setItem('chatbot_session_id', sessionId);
  }

  private loadPersistedData(): void {
    try {
      const cachedData = localStorage.getItem(`chatbot_cache_${this.sessionId}`);
      if (cachedData) {
        // TODO: Add validation/parsing logic for cached data structure if needed
        // Example: Ensure timestamps are Date objects after parsing
        const parsedCache = JSON.parse(cachedData).map(([id, messages]: [string, any[]]) => [
          id,
          messages.map((msg: any) => ({ ...msg, timestamp: new Date(msg.timestamp) }))
        ]);
        this.messageCache = new Map(parsedCache);
      }

      const contextData = localStorage.getItem(`chatbot_context_${this.sessionId}`);
      if (contextData) {
        this.context = JSON.parse(contextData);
      }
    } catch (error) {
      // Error loading persisted data - logged silently in production
      // Optionally clear corrupted data
      // localStorage.removeItem(`chatbot_cache_${this.sessionId}`);
      // localStorage.removeItem(`chatbot_context_${this.sessionId}`);
    }
  }

  private setupOfflineSupport(): void {
    // Offline support might need rethinking if relying solely on Electron IPC
    // IPC calls won't work when offline. Maybe queue messages locally?
    // For now, keep handlers but understand IPC calls will fail offline.
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }

  private async handleOnline(): Promise<void> {
    // App is back online. Processing offline chat queue silently in production
    while (this.offlineQueue.length > 0) {
      const item = this.offlineQueue.shift();
      if (item) {
        try {
          // Sending queued message
          await this.sendMessage({
            content: item.message,
            sessionId: this.sessionId,
            // Add employeeId if relevant context was stored
          });
        } catch (error) {
          // Error sending offline message
          // Decide on error handling: re-queue, notify user, etc.
          this.offlineQueue.unshift(item); // Example: Re-queue on failure
          break; // Stop processing queue if one fails to avoid spamming
        }
      }
    }
  }

  private handleOffline(): void {
    // Application is offline, chat messages will be queued silently in production
    // Inform user that chat might be delayed?
  }

  private persistData(): void {
    try {
      // Convert Map to array for JSON serialization
      // Ensure Date objects are properly serialized (e.g., to ISO string)
      const serializableCache = Array.from(this.messageCache.entries()).map(([id, messages]) => [
        id,
        messages.map(msg => ({ ...msg, timestamp: msg.timestamp.toISOString() }))
      ]);
      localStorage.setItem(`chatbot_cache_${this.sessionId}`,
        JSON.stringify(serializableCache)
      );
      localStorage.setItem(`chatbot_context_${this.sessionId}`,
        JSON.stringify(this.context)
      );
      this.persistSession(this.sessionId);
    } catch (error) {
      // Error persisting data - logged silently in production
      // Handle potential storage quota errors
    }
  }

  async sendMessage(payload: SendMessagePayload): Promise<ChatResponse> {
    // Offline Handling: Queue the message if offline
    if (!navigator.onLine) {
      // Offline: Queuing message silently in production
      this.offlineQueue.push({ message: payload.content }); // Store necessary context if needed
      // Provide a pending/queued response structure if required by the UI
      // This is a placeholder response; adjust as needed.
      return {
        response: {
          message: "[Message queued - will send when online]",
          responseTime: 0 // Add dummy responseTime to match type
        },
        botMessageId: `queued-${uuidv4()}`,
        success: false, // Indicate message wasn't sent yet
        userMessageId: `queued-user-${uuidv4()}` // Add a placeholder user ID
      };
    }

    try {
      // Sending message via API
      const response = await api.post('/chatbot/chat', {
        message: payload.content,
        conversation_id: payload.sessionId === 'new' ? undefined : payload.sessionId,
        // Add other fields as expected by the backend
      });

      if (!response || !response.data) {
        // Log unexpected response structure
        throw new Error('Received invalid response structure from chatbot service.');
      }

      // Map backend response to ChatResponse format
      const chatResponse: ChatResponse = {
        response: {
          message: response.data.response,
          responseTime: 100 // Mock or calculate
        },
        botMessageId: response.data.id || uuidv4(),
        success: true,
        userMessageId: uuidv4()
      };

      return chatResponse;
    } catch (error: any) {
      // Chatbot API Error
      console.error('Chatbot API Error:', error);
      throw new Error(error.message || 'Failed to send message via chat service.');
    }
  }

  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    if (!sessionId) {
      return []; // Return empty if no session ID provided
    }

    // Backend expects integer conversation IDs, not client-generated UUIDs
    // If sessionId is a UUID (contains dashes), use cached messages instead
    if (sessionId.includes('-')) {
      return this.getCachedMessages(sessionId).map(msg => ({
        id: msg.id,
        sessionId: sessionId,
        message: msg.text,
        role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
        timestamp: msg.timestamp
      }));
    }

    try {
      // Fetching chat history via API for numeric conversation IDs
      const response = await api.get(`/chatbot/conversations/${sessionId}`);
      const conversation = response.data;

      // Map backend messages to frontend ChatMessage format
      if (conversation && Array.isArray(conversation.messages)) {
        return conversation.messages.map((msg: any) => ({
          id: msg.id,
          sessionId: sessionId,
          message: msg.content,
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          timestamp: new Date(msg.created_at),
        }));
      }

      return [];
    } catch (error: any) {
      console.error('Chat History API Error:', error);
      // Return empty array on error to avoid breaking UI
      return [];
    }
  }

  getAnalytics(): ChatAnalytics {
    // Analytics calculation might need adjustment if based on direct API calls previously
    return { ...this.analytics };
  }

  getCachedMessages(sessionId: string): Message[] {
    return this.messageCache.get(sessionId) || [];
  }

  clearCache(): void {
    this.messageCache.clear();
    localStorage.removeItem(`chatbot_cache_${this.sessionId}`);
    // Keep context clearing separate if needed
    // localStorage.removeItem(`chatbot_context_${this.sessionId}`); 
  }

  clearContext(): void {
    this.context = {
      turnCount: this.turnCount, // Preserve turn count or reset as needed
    };
    this.persistData();
  }
}

// Export the singleton instance
export default ChatbotService.getInstance(); 