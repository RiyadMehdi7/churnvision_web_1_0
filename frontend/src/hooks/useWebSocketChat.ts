import { useState, useCallback, useEffect, useRef } from 'react';
import { authService } from '@/services/authService';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebSocketMessage {
  type: 'token' | 'done' | 'error' | 'context' | 'thinking';
  content?: string;
  error?: string;
  context?: Record<string, unknown>;
}

interface ChatMessage {
  message: string;
  session_id: string;
  employee_id?: string;
}

interface UseWebSocketChatOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

interface UseWebSocketChatReturn {
  // Connection state
  status: ConnectionStatus;
  isConnected: boolean;
  isStreaming: boolean;

  // Streaming content
  streamingContent: string;
  fullResponse: string;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: string, sessionId: string, employeeId?: string) => void;
  clearContent: () => void;

  // Error state
  error: string | null;
}

const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

export function useWebSocketChat(options: UseWebSocketChatOptions = {}): UseWebSocketChatReturn {
  const {
    autoConnect = false,
    reconnectAttempts = 3,
    reconnectDelay = 2000,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [fullResponse, setFullResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearContent = useCallback(() => {
    setStreamingContent('');
    setFullResponse('');
    setError(null);
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);

      switch (data.type) {
        case 'token':
          // Append token to streaming content
          setStreamingContent(prev => prev + (data.content || ''));
          break;

        case 'thinking':
          // Show thinking indicator
          setStreamingContent(data.content || 'Thinking...');
          break;

        case 'context':
          // Context data received (e.g., employee info)
          // Can be used for UI enrichment
          break;

        case 'done':
          // Streaming complete
          setFullResponse(prev => {
            const finalContent = prev || streamingContent;
            return finalContent;
          });
          setIsStreaming(false);
          break;

        case 'error':
          setError(data.error || 'An error occurred');
          setIsStreaming(false);
          onError?.(data.error || 'An error occurred');
          break;
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  }, [streamingContent, onError]);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    setError(null);

    const token = authService.getAccessToken();
    if (!token) {
      setStatus('error');
      setError('Not authenticated');
      return;
    }

    try {
      // Connect with token as query parameter
      const wsUrl = `${WS_BASE_URL}/api/v1/intelligent-chat/ws?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        setError(null);
        reconnectCountRef.current = 0;
        onConnect?.();
      };

      socket.onmessage = handleMessage;

      socket.onerror = () => {
        setStatus('error');
        setError('Connection error');
      };

      socket.onclose = (event) => {
        socketRef.current = null;
        setStatus('disconnected');
        setIsStreaming(false);
        onDisconnect?.();

        // Auto reconnect on unexpected close
        if (!event.wasClean && reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };
    } catch (e) {
      setStatus('error');
      setError('Failed to create WebSocket connection');
      console.error('WebSocket connection error:', e);
    }
  }, [handleMessage, onConnect, onDisconnect, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close(1000, 'User disconnected');
      socketRef.current = null;
    }

    setStatus('disconnected');
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback((message: string, sessionId: string, employeeId?: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError('Not connected');
      return;
    }

    // Clear previous content when sending new message
    setStreamingContent('');
    setFullResponse('');
    setError(null);
    setIsStreaming(true);

    const payload: ChatMessage = {
      message,
      session_id: sessionId,
      employee_id: employeeId,
    };

    socketRef.current.send(JSON.stringify(payload));
  }, []);

  // Auto connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Update fullResponse when streaming completes
  useEffect(() => {
    if (!isStreaming && streamingContent) {
      setFullResponse(streamingContent);
    }
  }, [isStreaming, streamingContent]);

  return {
    status,
    isConnected: status === 'connected',
    isStreaming,
    streamingContent,
    fullResponse,
    connect,
    disconnect,
    sendMessage,
    clearContent,
    error,
  };
}

// Convenience hook for fallback to HTTP when WebSocket is unavailable
export function useWebSocketChatWithFallback(options: UseWebSocketChatOptions = {}) {
  const wsChat = useWebSocketChat(options);
  const [useFallback, setUseFallback] = useState(false);

  // If WebSocket fails after all reconnect attempts, switch to fallback mode
  useEffect(() => {
    if (wsChat.status === 'error' && wsChat.error) {
      setUseFallback(true);
    }
  }, [wsChat.status, wsChat.error]);

  return {
    ...wsChat,
    useFallback,
    resetFallback: () => setUseFallback(false),
  };
}
