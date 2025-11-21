import { AIInsight } from './aiIntegrationManager';

export interface CacheConfig {
  defaultTTL: number;
  maxSize: number;
  enablePersistence: boolean;
  backgroundRefreshInterval: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  expiresAt: Date;
  key: string;
  accessCount: number;
  lastAccessed: Date;
  priority: 'high' | 'medium' | 'low';
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  memoryUsage: number;
}

class AICacheManager {
  private static instance: AICacheManager;
  private cache = new Map<string, CacheEntry<any>>();
  private stats = { hits: 0, misses: 0 };
  private backgroundRefreshTimer?: NodeJS.Timeout;
  private refreshCallbacks = new Map<string, () => Promise<any>>();
  
  private config: CacheConfig = {
    defaultTTL: 15 * 60 * 1000, // 15 minutes
    maxSize: 200,
    enablePersistence: true,
    backgroundRefreshInterval: 5 * 60 * 1000 // 5 minutes
  };

  private constructor() {
    this.loadFromStorage();
    this.startBackgroundRefresh();
  }

  public static getInstance(): AICacheManager {
    if (!AICacheManager.instance) {
      AICacheManager.instance = new AICacheManager();
    }
    return AICacheManager.instance;
  }

  // Core cache operations
  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.stats.hits++;

    return entry.data as T;
  }

  public set<T>(
    key: string, 
    data: T, 
    ttl?: number, 
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): void {
    const now = new Date();
    const expirationTime = ttl || this.config.defaultTTL;

    // Evict if cache is full
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastUsed();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: new Date(now.getTime() + expirationTime),
      key,
      accessCount: 1,
      lastAccessed: now,
      priority
    };

    this.cache.set(key, entry);
    this.saveToStorage();
  }

  public invalidate(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.refreshCallbacks.delete(key);
    this.saveToStorage();
    return deleted;
  }

  public invalidatePattern(pattern: string): number {
    let count = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.includes(pattern) || key.match(new RegExp(pattern))) {
        keysToDelete.push(key);
        count++;
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.refreshCallbacks.delete(key);
    });

    this.saveToStorage();
    return count;
  }

  public clear(): void {
    this.cache.clear();
    this.refreshCallbacks.clear();
    this.stats = { hits: 0, misses: 0 };
    this.saveToStorage();
  }

  // Background refresh system
  public registerRefreshCallback(key: string, callback: () => Promise<any>): void {
    this.refreshCallbacks.set(key, callback);
  }

  public unregisterRefreshCallback(key: string): void {
    this.refreshCallbacks.delete(key);
  }

  private startBackgroundRefresh(): void {
    if (this.backgroundRefreshTimer) {
      clearInterval(this.backgroundRefreshTimer);
    }

    this.backgroundRefreshTimer = setInterval(() => {
      this.performBackgroundRefresh();
    }, this.config.backgroundRefreshInterval);
  }

  private async performBackgroundRefresh(): Promise<void> {
    const now = new Date();
    const refreshPromises: Promise<void>[] = [];

    for (const [key, entry] of this.cache.entries()) {
      // Refresh entries that are close to expiring (within 25% of TTL)
      const timeToExpiry = entry.expiresAt.getTime() - now.getTime();
      const originalTTL = entry.expiresAt.getTime() - entry.timestamp.getTime();
      
      if (timeToExpiry < originalTTL * 0.25 && this.refreshCallbacks.has(key)) {
        const refreshCallback = this.refreshCallbacks.get(key)!;
        
        refreshPromises.push(
          refreshCallback()
            .then(newData => {
              if (newData) {
                this.set(key, newData, originalTTL, entry.priority);
              }
            })
            .catch(error => {
              console.warn(`Background refresh failed for key ${key}:`, error);
            })
        );
      }
    }

    if (refreshPromises.length > 0) {
      await Promise.allSettled(refreshPromises);
    }
  }

  // Cache management
  private isExpired(entry: CacheEntry<any>): boolean {
    return entry.expiresAt < new Date();
  }

  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null;
    let lowestScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Skip high priority entries unless cache is critically full
      if (entry.priority === 'high' && this.cache.size < this.config.maxSize * 1.2) {
        continue;
      }

      // Calculate eviction score (lower = more likely to evict)
      const timeSinceAccess = Date.now() - entry.lastAccessed.getTime();
      const priorityWeight = entry.priority === 'high' ? 3 : entry.priority === 'medium' ? 2 : 1;
      const score = (entry.accessCount * priorityWeight) / (timeSinceAccess / 1000);

      if (score < lowestScore) {
        lowestScore = score;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
      this.refreshCallbacks.delete(leastUsedKey);
    }
  }

  // Persistence
  private saveToStorage(): void {
    if (!this.config.enablePersistence) return;

    try {
      const serializable = Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        data: entry.data,
        timestamp: entry.timestamp.toISOString(),
        expiresAt: entry.expiresAt.toISOString(),
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed.toISOString(),
        priority: entry.priority
      }));

      localStorage.setItem('ai-cache', JSON.stringify(serializable));
    } catch (error) {
      console.warn('Failed to save cache to storage:', error);
    }
  }

  private loadFromStorage(): void {
    if (!this.config.enablePersistence) return;

    try {
      const stored = localStorage.getItem('ai-cache');
      if (!stored) return;

      const data = JSON.parse(stored);
      const now = new Date();

      data.forEach((item: any) => {
        const expiresAt = new Date(item.expiresAt);
        
        // Only load non-expired entries
        if (expiresAt > now) {
          const entry: CacheEntry<any> = {
            key: item.key,
            data: item.data,
            timestamp: new Date(item.timestamp),
            expiresAt,
            accessCount: item.accessCount || 1,
            lastAccessed: new Date(item.lastAccessed || item.timestamp),
            priority: item.priority || 'medium'
          };

          this.cache.set(item.key, entry);
        }
      });
    } catch (error) {
      console.warn('Failed to load cache from storage:', error);
    }
  }

  // Statistics and monitoring
  public getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    
    return {
      totalEntries: this.cache.size,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private estimateMemoryUsage(): number {
    let size = 0;
    
    for (const entry of this.cache.values()) {
      // Rough estimation of memory usage
      size += JSON.stringify(entry.data).length * 2; // UTF-16 encoding
      size += 200; // Overhead for entry metadata
    }

    return size;
  }

  public getEntryInfo(key: string): Partial<CacheEntry<any>> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    return {
      timestamp: entry.timestamp,
      expiresAt: entry.expiresAt,
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
      priority: entry.priority
    };
  }

  // Configuration
  public updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.backgroundRefreshInterval) {
      this.startBackgroundRefresh();
    }
  }

  public getConfig(): CacheConfig {
    return { ...this.config };
  }

  // Cleanup
  public destroy(): void {
    if (this.backgroundRefreshTimer) {
      clearInterval(this.backgroundRefreshTimer);
    }
    this.clear();
  }

  // Specialized methods for AI insights
  public cacheAIInsight(insight: AIInsight, ttl?: number): void {
    const key = `ai-insight-${insight.type}-${insight.id}`;
    const priority = insight.priority === 'high' ? 'high' : 'medium';
    this.set(key, insight, ttl, priority);
  }

  public getAIInsight(type: string, id: string): AIInsight | null {
    const key = `ai-insight-${type}-${id}`;
    return this.get<AIInsight>(key);
  }

  public invalidateAIInsights(type?: string): number {
    const pattern = type ? `ai-insight-${type}` : 'ai-insight';
    return this.invalidatePattern(pattern);
  }

  public cacheEmployeeAnalysis(hrCode: string, analysis: any, ttl?: number): void {
    const key = `employee-analysis-${hrCode}`;
    this.set(key, analysis, ttl, 'high'); // Employee-specific data is high priority
  }

  public getEmployeeAnalysis(hrCode: string): any | null {
    const key = `employee-analysis-${hrCode}`;
    return this.get(key);
  }

  public invalidateEmployeeAnalysis(hrCode?: string): number {
    const pattern = hrCode ? `employee-analysis-${hrCode}` : 'employee-analysis';
    return this.invalidatePattern(pattern);
  }
}

export const aiCacheManager = AICacheManager.getInstance();