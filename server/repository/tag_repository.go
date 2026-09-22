package repository

import (
	"database/sql"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
	"time"
)

type TagRepository struct {
	db *sql.DB
}

func NewTagRepository() *TagRepository {
	return &TagRepository{db: config.DB}
}

// CreateTag 创建标签
func (r *TagRepository) CreateTag(tag *models.ProblemTag) error {
	if tag.CreatedAt.IsZero() {
		tag.CreatedAt = time.Now()
	}
	_, err := r.db.Exec(`
		INSERT OR IGNORE INTO problem_tags (id, problem_id, tag, created_at)
		VALUES (?, ?, ?, ?)
	`, tag.ID, tag.ProblemID, tag.Tag, tag.CreatedAt)
	return err
}

// GetTagsByProblemID 根据题目 ID 获取标签
func (r *TagRepository) GetTagsByProblemID(problemID string) ([]models.ProblemTag, error) {
	rows, err := r.db.Query(`
		SELECT id, problem_id, tag, created_at
		FROM problem_tags WHERE problem_id = ?
	`, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []models.ProblemTag
	for rows.Next() {
		var tag models.ProblemTag
		err := rows.Scan(&tag.ID, &tag.ProblemID, &tag.Tag, &tag.CreatedAt)
		if err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

// DeleteTag 删除标签
func (r *TagRepository) DeleteTag(id string) error {
	_, err := r.db.Exec("DELETE FROM problem_tags WHERE id = ?", id)
	return err
}

// DeleteTagsByProblemID 删除题目的所有标签
func (r *TagRepository) DeleteTagsByProblemID(problemID string) error {
	_, err := r.db.Exec("DELETE FROM problem_tags WHERE problem_id = ?", problemID)
	return err
}

// GetAllTags 获取所有标签
func (r *TagRepository) GetAllTags() ([]string, error) {
	rows, err := r.db.Query(`
		SELECT DISTINCT tag FROM problem_tags ORDER BY tag
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []string
	for rows.Next() {
		var tag string
		err := rows.Scan(&tag)
		if err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

// GetAllTagCounts 获取每个 tag 出现的题目数
func (r *TagRepository) GetAllTagCounts() (map[string]int, error) {
	rows, err := r.db.Query(`
		SELECT tag, COUNT(1) AS cnt
		FROM problem_tags
		GROUP BY tag
		ORDER BY tag
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]int)
	for rows.Next() {
		var tag string
		var cnt int
		if err := rows.Scan(&tag, &cnt); err != nil {
			return nil, err
		}
		out[tag] = cnt
	}
	return out, rows.Err()
}
