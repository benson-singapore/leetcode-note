package ai

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"leetcode-note-sidecar/config"
)

// AISession AI 会话
type AISession struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	ProblemID *string    `json:"problemId,omitempty"`
	Provider  string     `json:"provider"`
	Model     string     `json:"model"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	Messages  []AIMessage `json:"messages,omitempty"`
}

// AIMessage AI 消息
type AIMessage struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"sessionId"`
	Role       string    `json:"role"`
	Content    string    `json:"content"`
	Provider   string    `json:"provider,omitempty"`
	Model      string    `json:"model,omitempty"`
	TokensUsed int       `json:"tokensUsed,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

func scanSession(scan func(dest ...any) error) (*AISession, error) {
	s := &AISession{}
	var problemID sql.NullString
	var createdAt, updatedAt string
	if err := scan(&s.ID, &s.Title, &problemID, &s.Provider, &s.Model, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	if problemID.Valid {
		s.ProblemID = &problemID.String
	}
	s.CreatedAt, _ = parseTime(createdAt)
	s.UpdatedAt, _ = parseTime(updatedAt)
	return s, nil
}

func parseTime(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02 15:04:05", "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("无法解析时间: %s", s)
}

// ListSessions 会话列表（不含消息）
func ListSessions() ([]AISession, error) {
	rows, err := config.DB.Query(`
		SELECT id, title, problem_id, provider, model, created_at, updated_at
		FROM ai_sessions ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []AISession
	for rows.Next() {
		s, err := scanSession(rows.Scan)
		if err != nil {
			continue
		}
		sessions = append(sessions, *s)
	}
	return sessions, nil
}

// GetSession 会话详情（含全部消息）
func GetSession(id string) (*AISession, error) {
	row := config.DB.QueryRow(`
		SELECT id, title, problem_id, provider, model, created_at, updated_at
		FROM ai_sessions WHERE id = ?`, id)
	s, err := scanSession(row.Scan)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("会话不存在")
	}
	if err != nil {
		return nil, err
	}

	msgs, err := ListMessages(id)
	if err != nil {
		return nil, err
	}
	s.Messages = msgs
	return s, nil
}

// CreateSession 创建会话
func CreateSession(title string, problemID *string) (*AISession, error) {
	if title == "" {
		title = "新对话"
	}
	s := &AISession{ID: uuid.NewString(), Title: title, ProblemID: problemID, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	_, err := config.DB.Exec(`
		INSERT INTO ai_sessions(id, title, problem_id, provider, model) VALUES(?, ?, ?, '', '')
	`, s.ID, s.Title, problemID)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// UpdateSession 更新会话标题/元信息
func UpdateSession(id, title string, provider, model string) error {
	res, err := config.DB.Exec(`
		UPDATE ai_sessions SET title = ?, provider = ?, model = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`, title, provider, model, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("会话不存在")
	}
	return nil
}

// DeleteSession 删除会话（级联删除消息）
func DeleteSession(id string) error {
	_, err := config.DB.Exec(`DELETE FROM ai_sessions WHERE id = ?`, id)
	return err
}

// AppendMessage 追加消息
func AppendMessage(sessionID, role, content, provider, model string) (*AIMessage, error) {
	m := &AIMessage{
		ID:        uuid.NewString(),
		SessionID: sessionID,
		Role:      role,
		Content:   content,
		Provider:  provider,
		Model:     model,
	}
	_, err := config.DB.Exec(`
		INSERT INTO ai_messages(id, session_id, role, content, provider, model) VALUES(?, ?, ?, ?, ?, ?)
	`, m.ID, m.SessionID, m.Role, m.Content, m.Provider, m.Model)
	if err != nil {
		return nil, err
	}
	m.CreatedAt = time.Now()
	return m, nil
}

// ListMessages 会话内全部消息
func ListMessages(sessionID string) ([]AIMessage, error) {
	rows, err := config.DB.Query(`
		SELECT id, session_id, role, content, provider, model, tokens_used, created_at
		FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []AIMessage
	for rows.Next() {
		var m AIMessage
		var provider, model sql.NullString
		var createdAt string
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &provider, &model, &m.TokensUsed, &createdAt); err != nil {
			continue
		}
		m.Provider = provider.String
		m.Model = model.String
		m.CreatedAt, _ = parseTime(createdAt)
		msgs = append(msgs, m)
	}
	return msgs, nil
}

// BuildChatRequest 从会话历史构建 ChatRequest
func BuildChatRequest(systemPrompt string, msgs []AIMessage) *ChatRequest {
	req := &ChatRequest{SystemPrompt: systemPrompt}
	for _, m := range msgs {
		if m.Role == "user" || m.Role == "assistant" || m.Role == "system" {
			req.Messages = append(req.Messages, ChatMessage{Role: m.Role, Content: m.Content})
		}
	}
	return req
}

// MarshalIndent JSON 序列化（用于调试端点）
func (s *AISession) JSON() string {
	data, _ := json.MarshalIndent(s, "", "  ")
	return strings.TrimSpace(string(data))
}
