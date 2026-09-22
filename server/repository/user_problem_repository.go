package repository

import (
	"database/sql"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
	"time"

	"github.com/google/uuid"
)

type UserProblemRepository struct {
	db *sql.DB
}

func NewUserProblemRepository() *UserProblemRepository {
	return &UserProblemRepository{db: config.DB}
}

// CreateUserProblem 创建用户题目记录
func (r *UserProblemRepository) CreateUserProblem(userProblem *models.UserProblem) error {
	_, err := r.db.Exec(`
		INSERT INTO user_problems (id, problem_id, personal_difficulty, status, progress_status, review_count, notes, code, last_review, created_at, updated_at, has_html_demo)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userProblem.ID, userProblem.ProblemID, userProblem.PersonalDifficulty, userProblem.Status, userProblem.ProgressStatus, userProblem.ReviewCount,
		userProblem.Notes, userProblem.Code, userProblem.LastReview, userProblem.CreatedAt, userProblem.UpdatedAt, userProblem.HasHtmlDemo)
	return err
}

// GetUserProblemByID 根据 ID 获取用户题目记录
func (r *UserProblemRepository) GetUserProblemByID(id string) (*models.UserProblem, error) {
	var userProblem models.UserProblem
	err := r.db.QueryRow(`
		SELECT id, problem_id, personal_difficulty, status, COALESCE(progress_status, 'Reviewing'), COALESCE(review_count, 0), notes, code, last_review, created_at, updated_at, COALESCE(has_html_demo, 0)
		FROM user_problems WHERE id = ?
	`, id).Scan(&userProblem.ID, &userProblem.ProblemID, &userProblem.PersonalDifficulty, &userProblem.Status, &userProblem.ProgressStatus, &userProblem.ReviewCount,
		&userProblem.Notes, &userProblem.Code, &userProblem.LastReview, &userProblem.CreatedAt, &userProblem.UpdatedAt, &userProblem.HasHtmlDemo)
	if err != nil {
		return nil, err
	}
	return &userProblem, nil
}

// GetAllUserProblems 获取所有用户题目记录
func (r *UserProblemRepository) GetAllUserProblems() ([]models.UserProblem, error) {
	rows, err := r.db.Query(`
		SELECT id, problem_id, personal_difficulty, status, COALESCE(progress_status, 'Reviewing'), COALESCE(review_count, 0), notes, code, last_review, created_at, updated_at, COALESCE(has_html_demo, 0)
		FROM user_problems ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userProblems []models.UserProblem
	for rows.Next() {
		var up models.UserProblem
		err := rows.Scan(&up.ID, &up.ProblemID, &up.PersonalDifficulty, &up.Status, &up.ProgressStatus, &up.ReviewCount,
			&up.Notes, &up.Code, &up.LastReview, &up.CreatedAt, &up.UpdatedAt, &up.HasHtmlDemo)
		if err != nil {
			return nil, err
		}
		userProblems = append(userProblems, up)
	}
	return userProblems, rows.Err()
}

// GetUserProblemsByStatus 根据状态获取用户题目记录
func (r *UserProblemRepository) GetUserProblemsByStatus(status string) ([]models.UserProblem, error) {
	rows, err := r.db.Query(`
		SELECT id, problem_id, personal_difficulty, status, COALESCE(progress_status, 'Reviewing'), COALESCE(review_count, 0), notes, code, last_review, created_at, updated_at, COALESCE(has_html_demo, 0)
		FROM user_problems WHERE status = ? ORDER BY created_at DESC
	`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userProblems []models.UserProblem
	for rows.Next() {
		var up models.UserProblem
		err := rows.Scan(&up.ID, &up.ProblemID, &up.PersonalDifficulty, &up.Status, &up.ProgressStatus, &up.ReviewCount,
			&up.Notes, &up.Code, &up.LastReview, &up.CreatedAt, &up.UpdatedAt, &up.HasHtmlDemo)
		if err != nil {
			return nil, err
		}
		userProblems = append(userProblems, up)
	}
	return userProblems, rows.Err()
}

// UpdateUserProblem 更新用户题目记录
func (r *UserProblemRepository) UpdateUserProblem(userProblem *models.UserProblem) error {
	_, err := r.db.Exec(`
		UPDATE user_problems SET personal_difficulty = ?, status = ?, progress_status = ?, review_count = ?, notes = ?, code = ?, last_review = ?, updated_at = ?, has_html_demo = ?
		WHERE id = ?
	`, userProblem.PersonalDifficulty, userProblem.Status, userProblem.ProgressStatus, userProblem.ReviewCount, userProblem.Notes, userProblem.Code,
		userProblem.LastReview, userProblem.UpdatedAt, userProblem.HasHtmlDemo, userProblem.ID)
	return err
}

// DeleteUserProblem 删除用户题目记录
func (r *UserProblemRepository) DeleteUserProblem(id string) error {
	_, err := r.db.Exec("DELETE FROM user_problems WHERE id = ?", id)
	return err
}

// GetStats 获取统计数据
func (r *UserProblemRepository) GetStats() (*models.StatsResponse, error) {
	stats := &models.StatsResponse{}

	r.db.QueryRow("SELECT COUNT(*) FROM user_problems").Scan(&stats.Total)
	r.db.QueryRow("SELECT COUNT(*) FROM user_problems WHERE status = ?", "Mastered").Scan(&stats.Mastered)
	r.db.QueryRow("SELECT COUNT(*) FROM user_problems WHERE status = ?", "New").Scan(&stats.New)
	r.db.QueryRow("SELECT COUNT(*) FROM user_problems WHERE status = ?", "Struggling").Scan(&stats.Struggling)
	r.db.QueryRow("SELECT COUNT(*) FROM user_problems WHERE status = ?", "Reviewing").Scan(&stats.Reviewing)
	r.db.QueryRow("SELECT COUNT(*) FROM user_problems WHERE status = ?", "Confused").Scan(&stats.Confused)
	r.db.QueryRow("SELECT COUNT(*) FROM user_problems WHERE status = ?", "Unpracticed").Scan(&stats.Unpracticed)

	return stats, nil
}

// GetUserProblemByProblemID 根据 problem_id 获取用户题目记录
func (r *UserProblemRepository) GetUserProblemByProblemID(problemID string) (*models.UserProblem, error) {
	var userProblem models.UserProblem
	err := r.db.QueryRow(`
		SELECT id, problem_id, personal_difficulty, status, COALESCE(progress_status, 'Reviewing'), COALESCE(review_count, 0), notes, code, last_review, created_at, updated_at, COALESCE(has_html_demo, 0)
		FROM user_problems WHERE problem_id = ? LIMIT 1
	`, problemID).Scan(&userProblem.ID, &userProblem.ProblemID, &userProblem.PersonalDifficulty, &userProblem.Status, &userProblem.ProgressStatus, &userProblem.ReviewCount,
		&userProblem.Notes, &userProblem.Code, &userProblem.LastReview, &userProblem.CreatedAt, &userProblem.UpdatedAt, &userProblem.HasHtmlDemo)
	if err != nil {
		return nil, err
	}
	return &userProblem, nil
}

// UpsertUserProblemNotes 更新或插入用户题目笔记（如果不存在则创建）
func (r *UserProblemRepository) UpsertUserProblemNotes(id string, notes string) (*models.UserProblem, error) {
	// 先尝试获取现有记录
	userProblem, err := r.GetUserProblemByID(id)
	if err == nil && userProblem != nil {
		// 记录存在，更新笔记
		userProblem.Notes = notes
		userProblem.UpdatedAt = time.Now()
		if err := r.UpdateUserProblem(userProblem); err != nil {
			return nil, err
		}
		return userProblem, nil
	}

	// 记录不存在，创建新记录
	newUserProblem := &models.UserProblem{
		ID:                 id,
		ProblemID:          id, // 使用相同的 ID 作为 problem_id
		PersonalDifficulty: 3,
		Status:             "New",
		ReviewCount:        0,
		Notes:              notes,
		Code:               "",
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if err := r.CreateUserProblem(newUserProblem); err != nil {
		return nil, err
	}

	return newUserProblem, nil
}

// ProblemCreatedOnDateRow 某自然日新创建的题目（problems.created_at）对应的展示行
type ProblemCreatedOnDateRow struct {
	ProblemID          string
	UserProblemID      string
	LcID               string
	Title              string
	TranslatedTitle    string
	Difficulty         string
	PassRate           string
	Frequency          int
	PersonalDifficulty int
	Status             string
	HasHtmlDemo        int
}

// GetProblemsCreatedOnDate 按 problems 创建日期（自然日）列出题目
func (r *UserProblemRepository) GetProblemsCreatedOnDate(date string) ([]ProblemCreatedOnDateRow, error) {
	rows, err := r.db.Query(`
		SELECT
			p.id,
			COALESCE(up.id, ''),
			p.lc_id,
			p.title,
			COALESCE(p.translated_title, ''),
			p.difficulty,
			p.pass_rate,
			p.frequency,
			COALESCE(up.personal_difficulty, 3),
			COALESCE(up.status, 'New'),
			COALESCE(up.has_html_demo, 0)
		FROM problems p
		LEFT JOIN user_problems up ON p.id = up.problem_id
		WHERE strftime('%Y-%m-%d', p.created_at, 'localtime') = ?
		ORDER BY p.lc_id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ProblemCreatedOnDateRow
	for rows.Next() {
		var row ProblemCreatedOnDateRow
		if err := rows.Scan(
			&row.ProblemID,
			&row.UserProblemID,
			&row.LcID,
			&row.Title,
			&row.TranslatedTitle,
			&row.Difficulty,
			&row.PassRate,
			&row.Frequency,
			&row.PersonalDifficulty,
			&row.Status,
			&row.HasHtmlDemo,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// GetDailyCreatedProblemCountsBetween 按自然日统计区间内新创建的题目条数（从 problems 表）
func (r *UserProblemRepository) GetDailyCreatedProblemCountsBetween(startDate, endDate string) (map[string]int, error) {
	rows, err := r.db.Query(`
		SELECT strftime('%Y-%m-%d', created_at, 'localtime') AS day,
		       COUNT(1) AS cnt
		FROM problems
		WHERE strftime('%Y-%m-%d', created_at, 'localtime') >= ? AND strftime('%Y-%m-%d', created_at, 'localtime') <= ?
		GROUP BY day
		ORDER BY day
	`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]int)
	for rows.Next() {
		var day string
		var c int
		if err := rows.Scan(&day, &c); err != nil {
			return nil, err
		}
		out[day] = c
	}
	return out, rows.Err()
}

// UpsertUserProblem 更新或插入用户题目记录（根据 problem_id，如果不存在则创建）
func (r *UserProblemRepository) UpsertUserProblem(problemID string, userProblem *models.UserProblem) (*models.UserProblem, error) {
	// 先尝试根据 problem_id 获取现有记录
	existing, err := r.GetUserProblemByProblemID(problemID)
	if err == nil && existing != nil {
		// 记录存在，更新
		existing.PersonalDifficulty = userProblem.PersonalDifficulty
		existing.Status = userProblem.Status
		existing.Notes = userProblem.Notes
		existing.Code = userProblem.Code
		existing.UpdatedAt = time.Now()
		if err := r.UpdateUserProblem(existing); err != nil {
			return nil, err
		}
		return existing, nil
	}

	// 记录不存在，创建新记录
	userProblem.ID = uuid.New().String()
	userProblem.ProblemID = problemID
	userProblem.CreatedAt = time.Now()
	userProblem.UpdatedAt = time.Now()
	if err := r.CreateUserProblem(userProblem); err != nil {
		return nil, err
	}

	return userProblem, nil
}

// IncrementReviewCount 原子增加 user_problems.review_count。
func (r *UserProblemRepository) IncrementReviewCount(id string) error {
	_, err := r.db.Exec(`
		UPDATE user_problems
		SET review_count = COALESCE(review_count, 0) + 1, updated_at = ?
		WHERE id = ?
	`, time.Now(), id)
	return err
}

// UpdateHasHtmlDemoByProblemID 根据 problem_id 批量更新 has_html_demo 标记
func (r *UserProblemRepository) UpdateHasHtmlDemoByProblemID(problemID string, has int) error {
	_, err := r.db.Exec(`
		UPDATE user_problems
		SET has_html_demo = ?, updated_at = ?
		WHERE problem_id = ?
	`, has, time.Now(), problemID)
	return err
}
