package ai

import (
	"sync"
	"time"
)

// DefaultChainEntry 系统默认模型链上的一项：某个助手下的某个模型
// 链上第一个元素为系统默认模型，请求失败时依次向后 failover
type DefaultChainEntry struct {
	AssistantID string `json:"assistantId"`
	Model       string `json:"model"`
}

// ModelCooldown 模型失败后的冷却时长：期间跳过该模型，到期后重新从链首尝试
const ModelCooldown = 10 * time.Minute

var (
	failureMu    sync.Mutex
	failureCache = map[string]time.Time{}
)

// chainKey 失败缓存的键：assistantID|model
func chainKey(assistantID, model string) string {
	return assistantID + "|" + model
}

// MarkChainFailure 记录一次模型调用失败，进入冷却期
func MarkChainFailure(assistantID, model string) {
	failureMu.Lock()
	defer failureMu.Unlock()
	failureCache[chainKey(assistantID, model)] = time.Now()
}

// ClearChainFailure 调用成功后清除失败记录
func ClearChainFailure(assistantID, model string) {
	failureMu.Lock()
	defer failureMu.Unlock()
	delete(failureCache, chainKey(assistantID, model))
}

// ChainCooldownRemaining 返回剩余冷却时长；未失败或已过期返回 0
func ChainCooldownRemaining(assistantID, model string) time.Duration {
	failureMu.Lock()
	defer failureMu.Unlock()
	failedAt, ok := failureCache[chainKey(assistantID, model)]
	if !ok {
		return 0
	}
	remaining := ModelCooldown - time.Since(failedAt)
	if remaining <= 0 {
		delete(failureCache, chainKey(assistantID, model))
		return 0
	}
	return remaining
}

// ClearAllChainFailures 清空全部失败缓存（默认模型链被修改时调用）
func ClearAllChainFailures() {
	failureMu.Lock()
	defer failureMu.Unlock()
	failureCache = map[string]time.Time{}
}

// PickChain 从默认模型链中按顺序挑出第一个可用（未处于冷却期）的模型；
// 全部处于冷却期时返回 nil
func PickChain(chain []DefaultChainEntry) *DefaultChainEntry {
	for _, e := range chain {
		if e.AssistantID == "" || e.Model == "" {
			continue
		}
		if ChainCooldownRemaining(e.AssistantID, e.Model) > 0 {
			continue
		}
		picked := e
		return &picked
	}
	return nil
}
