package service

import (
	"sync"
	"time"
)

type CachedProblem struct {
	Data      *ProblemData
	ExpiresAt time.Time
}

type LeetCodeCache struct {
	cache map[string]*CachedProblem
	mu    sync.RWMutex
	ttl   time.Duration
}

func NewLeetCodeCache(ttl time.Duration) *LeetCodeCache {
	cache := &LeetCodeCache{
		cache: make(map[string]*CachedProblem),
		ttl:   ttl,
	}

	// 定期清理过期缓存
	go cache.cleanupExpired()

	return cache
}

// Get 获取缓存的题目数据
func (c *LeetCodeCache) Get(titleSlug string) (*ProblemData, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	cached, exists := c.cache[titleSlug]
	if !exists {
		return nil, false
	}

	// 检查是否过期
	if time.Now().After(cached.ExpiresAt) {
		return nil, false
	}

	return cached.Data, true
}

// Set 设置缓存
func (c *LeetCodeCache) Set(titleSlug string, data *ProblemData) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.cache[titleSlug] = &CachedProblem{
		Data:      data,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}

// Clear 清空所有缓存
func (c *LeetCodeCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.cache = make(map[string]*CachedProblem)
}

// cleanupExpired 定期清理过期缓存
func (c *LeetCodeCache) cleanupExpired() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, cached := range c.cache {
			if now.After(cached.ExpiresAt) {
				delete(c.cache, key)
			}
		}
		c.mu.Unlock()
	}
}

// GetSize 获取缓存大小
func (c *LeetCodeCache) GetSize() int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return len(c.cache)
}
