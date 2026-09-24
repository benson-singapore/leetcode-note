package repository

import (
	"database/sql"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
	"time"

	"github.com/google/uuid"
)

type SolutionSchemeRepository struct {
	db *sql.DB
}

func NewSolutionSchemeRepository() *SolutionSchemeRepository {
	return &SolutionSchemeRepository{db: config.DB}
}

// ListByProblemID 获取题目下的所有解题方案（按 sort_order, created_at 排序）
func (r *SolutionSchemeRepository) ListByProblemID(problemID string) ([]models.SolutionScheme, error) {
	rows, err := r.db.Query(`
		SELECT id, problem_id, COALESCE(name, ''), COALESCE(code, ''), COALESCE(html_demo, ''), COALESCE(sort_order, 0), created_at, updated_at
		FROM solution_schemes WHERE problem_id = ?
		ORDER BY COALESCE(sort_order, 0) ASC, created_at ASC
	`, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schemes []models.SolutionScheme
	for rows.Next() {
		var s models.SolutionScheme
		if err := rows.Scan(&s.ID, &s.ProblemID, &s.Name, &s.Code, &s.HtmlDemo, &s.SortOrder, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		schemes = append(schemes, s)
	}
	return schemes, rows.Err()
}

// GetByID 根据 ID 获取解题方案
func (r *SolutionSchemeRepository) GetByID(id string) (*models.SolutionScheme, error) {
	var s models.SolutionScheme
	err := r.db.QueryRow(`
		SELECT id, problem_id, COALESCE(name, ''), COALESCE(code, ''), COALESCE(html_demo, ''), COALESCE(sort_order, 0), created_at, updated_at
		FROM solution_schemes WHERE id = ?
	`, id).Scan(&s.ID, &s.ProblemID, &s.Name, &s.Code, &s.HtmlDemo, &s.SortOrder, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Create 创建解题方案（sort_order 取该题当前最大值 + 1）
func (r *SolutionSchemeRepository) Create(problemID, name, code string) (*models.SolutionScheme, error) {
	var maxOrder int
	_ = r.db.QueryRow(`
		SELECT COALESCE(MAX(COALESCE(sort_order, 0)), 0) FROM solution_schemes WHERE problem_id = ?
	`, problemID).Scan(&maxOrder)

	s := &models.SolutionScheme{
		ID:        uuid.New().String(),
		ProblemID: problemID,
		Name:      name,
		Code:      code,
		SortOrder: maxOrder + 1,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	_, err := r.db.Exec(`
		INSERT INTO solution_schemes (id, problem_id, name, code, html_demo, sort_order, created_at, updated_at)
		VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
	`, s.ID, s.ProblemID, s.Name, s.Code, s.SortOrder, s.CreatedAt, s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Update 更新解题方案（htmlDemo 为 nil 表示不修改演示 HTML）
func (r *SolutionSchemeRepository) Update(id, name, code string, htmlDemo *string) (*models.SolutionScheme, error) {
	if htmlDemo != nil {
		_, err := r.db.Exec(`
			UPDATE solution_schemes SET name = ?, code = ?, html_demo = ?, updated_at = ? WHERE id = ?
		`, name, code, *htmlDemo, time.Now(), id)
		if err != nil {
			return nil, err
		}
	} else {
		_, err := r.db.Exec(`
			UPDATE solution_schemes SET name = ?, code = ?, updated_at = ? WHERE id = ?
		`, name, code, time.Now(), id)
		if err != nil {
			return nil, err
		}
	}
	return r.GetByID(id)
}

// Delete 删除解题方案
func (r *SolutionSchemeRepository) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM solution_schemes WHERE id = ?`, id)
	return err
}
