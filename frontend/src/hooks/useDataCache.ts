import { useState, useEffect } from 'react';

const CACHE_PREFIX = 'page_data_';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 4.5 * 1024 * 1024; // 4.5MB safety limit
const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB per chunk

interface CacheItem<T> {
  data: T;
  timestamp: number;
  size: number;
  chunks?: number;
}

interface ChunkedCacheItem {
  chunk: any;
  index: number;
  total: number;
  timestamp: number;
}

// Simple compression by removing unnecessary whitespace and minimizing data
function compressData(data: any): any {
  if (Array.isArray(data)) {
    return data.map(item => compressData(item));
  }
  if (typeof data === 'object' && data !== null) {
    const compressed: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip null or undefined values
      if (value == null) continue;
      // Skip empty strings
      if (value === '') continue;
      // Skip empty arrays
      if (Array.isArray(value) && value.length === 0) continue;
      // Skip empty objects
      if (typeof value === 'object' && Object.keys(value).length === 0) continue;
      
      compressed[key] = compressData(value);
    }
    return compressed;
  }
  return data;
}

function splitIntoChunks(data: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function getStorageEstimate(): number {
  let total = 0;
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) {
      const value = sessionStorage.getItem(key);
      if (value) {
        total += value.length * 2; // Approximate size in bytes (UTF-16)
      }
    }
  }
  return total;
}

function cleanupOldCache() {
  const now = Date.now();
  const keysToRemove: string[] = [];

  // First, remove expired items
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      try {
        const item = JSON.parse(sessionStorage.getItem(key) || '');
        if (now - item.timestamp > CACHE_EXPIRY) {
          keysToRemove.push(key);
        }
      } catch (e) {
        keysToRemove.push(key);
      }
    }
  }

  // Remove expired items
  keysToRemove.forEach(key => sessionStorage.removeItem(key));

  // If still need more space, remove oldest items
  if (getStorageEstimate() > MAX_CACHE_SIZE) {
    const cacheItems: { key: string; timestamp: number }[] = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        try {
          const item = JSON.parse(sessionStorage.getItem(key) || '');
          cacheItems.push({ key, timestamp: item.timestamp });
        } catch (e) {
          sessionStorage.removeItem(key);
        }
      }
    }

    // Sort by timestamp (oldest first) and remove until under limit
    cacheItems.sort((a, b) => a.timestamp - b.timestamp);
    while (getStorageEstimate() > MAX_CACHE_SIZE && cacheItems.length) {
      const item = cacheItems.shift();
      if (item) {
        sessionStorage.removeItem(item.key);
      }
    }
  }
}

function safeSetCache<T>(key: string, data: T): void {
  try {
    // Compress the data first
    const compressedData = compressData(data);
    const serializedData = JSON.stringify({
      data: compressedData,
      timestamp: Date.now(),
      size: 0 // Will be calculated after compression
    });

    // If the compressed data is small enough, store it directly
    if (serializedData.length * 2 <= MAX_CACHE_SIZE) {
      try {
        sessionStorage.setItem(key, serializedData);
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          cleanupOldCache();
          try {
            sessionStorage.setItem(key, serializedData);
            return;
          } catch (retryError) {
            // Fall through to chunked storage
          }
        }
      }
    }

    // If we get here, try chunked storage
    const chunks = splitIntoChunks(serializedData);
    if (chunks.length * CHUNK_SIZE > MAX_CACHE_SIZE) {
      console.warn('Data too large even after chunking, skipping cache');
      return;
    }

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `${key}_chunk_${i}`;
      const chunkData: ChunkedCacheItem = {
        chunk: chunks[i],
        index: i,
        total: chunks.length,
        timestamp: Date.now()
      };
      
      try {
        sessionStorage.setItem(chunkKey, JSON.stringify(chunkData));
      } catch (e) {
        // If any chunk fails, clean up all chunks and abort
        for (let j = 0; j < i; j++) {
          sessionStorage.removeItem(`${key}_chunk_${j}`);
        }
        console.warn('Failed to store chunked data');
        return;
      }
    }

    // Store chunk info in main key
    const chunkInfo = {
      isChunked: true,
      chunks: chunks.length,
      timestamp: Date.now(),
      size: serializedData.length * 2
    };
    sessionStorage.setItem(key, JSON.stringify(chunkInfo));
  } catch (e) {
    console.warn('Error preparing data for cache:', e);
  }
}

function getChunkedData(key: string): any {
  const info = JSON.parse(sessionStorage.getItem(key) || '{}');
  if (!info.isChunked) return null;

  const chunks: string[] = [];
  for (let i = 0; i < info.chunks; i++) {
    const chunkKey = `${key}_chunk_${i}`;
    const chunkData = JSON.parse(sessionStorage.getItem(chunkKey) || '{}');
    if (!chunkData.chunk || chunkData.timestamp !== info.timestamp) {
      // If any chunk is missing or timestamps don't match, data is invalid
      return null;
    }
    chunks.push(chunkData.chunk);
  }

  try {
    return JSON.parse(chunks.join(''));
  } catch (e) {
    return null;
  }
}

export function useDataCache<T>(
  key: string,
  fetchData: () => Promise<T>,
  enabled: boolean = true
): {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const cacheKey = `${CACHE_PREFIX}${key}`;

  const loadData = async (force: boolean = false) => {
    try {
      setError(null);
      
      // Check cache first
      if (!force && enabled) {
        try {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsedCache = JSON.parse(cached);
            
            // Handle chunked data
            if (parsedCache.isChunked) {
              const chunkedData = getChunkedData(cacheKey);
              if (chunkedData && Date.now() - chunkedData.timestamp < CACHE_EXPIRY) {
                setData(chunkedData.data);
                setIsLoading(false);
                return;
              }
            } else {
              // Handle regular cached data
              const { data: cachedData, timestamp }: CacheItem<T> = parsedCache;
              if (Date.now() - timestamp < CACHE_EXPIRY) {
                setData(cachedData);
                setIsLoading(false);
                return;
              }
            }
          }
        } catch (e) {
          console.warn('Error reading from cache:', e);
        }
      }

      // Fetch fresh data
      setIsLoading(true);
      const freshData = await fetchData();
      
      // Update cache
      if (enabled) {
        safeSetCache(cacheKey, freshData);
      }
      
      setData(freshData);
    } catch (e) {
      setError(e as Error);
      console.error('Error fetching data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [key]); // Only reload when key changes

  const refetch = () => loadData(true);

  return { data, isLoading, error, refetch };
} 