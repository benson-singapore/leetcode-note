package ai

import (
	"leetcode-note-sidecar/config"
)

// AI 设置存储直接复用 config 的 settings 表读写
// config 包不依赖本包，因此无循环引用

func getSettingValue(key string) (string, error) {
	return config.GetSetting(key)
}

func setSettingValue(key, value string) error {
	return config.SetSetting(key, value)
}
