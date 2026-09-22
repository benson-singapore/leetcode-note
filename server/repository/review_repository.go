package repository

import (
	"database/sql"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
)

type ReviewRepository struct {
	db *sql.DB
}

func NewReviewRepository() *ReviewRepository {
	return &ReviewRepository{db: config.DB}
}

// CreateReview 创建复习记录
func (r *ReviewRepository) CreateReview(review *models.Review) error {
	_, err := r.db.Exec(`
		INSERT INTO reviews (id, user_problem_id, review_date, status, comment, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, review.ID, review.UserProblemID, review.ReviewDate, review.Status, review.Comment, review.CreatedAt)
	return err
}

// GetReviewByID 根据 ID 获取复习记录
func (r *ReviewRepository) GetReviewByID(id string) (*models.Review, error) {
	var review models.Review
	err := r.db.QueryRow(`
		SELECT id, user_problem_id, review_date, status, comment, created_at
		FROM reviews WHERE id = ?
	`, id).Scan(&review.ID, &review.UserProblemID, &review.ReviewDate, &review.Status, &review.Comment, &review.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &review, nil
}

// GetReviewsByUserProblemID 根据用户题目 ID 获取复习记录
func (r *ReviewRepository) GetReviewsByUserProblemID(userProblemID string) ([]models.Review, error) {
	rows, err := r.db.Query(`
		SELECT id, user_problem_id, review_date, status, comment, created_at
		FROM reviews WHERE user_problem_id = ? ORDER BY review_date DESC
	`, userProblemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []models.Review
	for rows.Next() {
		var review models.Review
		err := rows.Scan(&review.ID, &review.UserProblemID, &review.ReviewDate, &review.Status, &review.Comment, &review.CreatedAt)
		if err != nil {
			return nil, err
		}
		reviews = append(reviews, review)
	}
	return reviews, rows.Err()
}

// DeleteReview 删除复习记录
func (r *ReviewRepository) DeleteReview(id string) error {
	_, err := r.db.Exec("DELETE FROM reviews WHERE id = ?", id)
	return err
}

// UpdateReview 更新复习记录
func (r *ReviewRepository) UpdateReview(review *models.Review) error {
	_, err := r.db.Exec(`
		UPDATE reviews SET status = ?, comment = ? WHERE id = ?
	`, review.Status, review.Comment, review.ID)
	return err
}

// GetDailyReviewStatsBetween 按自然日统计区间内复习涉及题目数（按 user_problem_id 去重）
// 返回 reviewCounts[day]=当日至少有一条复习的不同 user_problem 数；problemCounts[day]=当日新创建的题目数（从 problems 表）
func (r *ReviewRepository) GetDailyReviewStatsBetween(startDate, endDate string) (reviewCounts map[string]int, problemCounts map[string]int, err error) {
	// 查询复习记录统计（按 user_problem_id 去重）
	rows, err := r.db.Query(`
		SELECT strftime('%Y-%m-%d', created_at, 'localtime') AS day,
		       COUNT(DISTINCT user_problem_id) AS cnt
		FROM reviews
		GROUP BY strftime('%Y-%m-%d', created_at, 'localtime')
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	reviewCounts = make(map[string]int)
	for rows.Next() {
		var day string
		var cnt int
		if err := rows.Scan(&day, &cnt); err != nil {
			return nil, nil, err
		}
		reviewCounts[day] = cnt
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// 查询题目创建统计
	rows2, err := r.db.Query(`
		SELECT strftime('%Y-%m-%d', created_at, 'localtime') AS day,
		       COUNT(1) AS cnt
		FROM problems
		GROUP BY strftime('%Y-%m-%d', created_at, 'localtime')
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows2.Close()

	problemCounts = make(map[string]int)
	for rows2.Next() {
		var day string
		var cnt int
		if err := rows2.Scan(&day, &cnt); err != nil {
			return nil, nil, err
		}
		problemCounts[day] = cnt
	}
	return reviewCounts, problemCounts, rows2.Err()
}

// ProblemReviewedOnDateRow 某日有复习记录的用户题目 + 题目信息（聚合行）
type ProblemReviewedOnDateRow struct {
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
	ReviewCount        int
}

// GetProblemsReviewedOnDate 指定自然日有过复习的题目列表：按 user_problem_id 去重，当日该 user_problem 的复习次数合计
func (r *ReviewRepository) GetProblemsReviewedOnDate(date string) ([]ProblemReviewedOnDateRow, error) {
	rows, err := r.db.Query(`
		SELECT
			p.id,
			up.id,
			p.lc_id,
			p.title,
			COALESCE(p.translated_title, ''),
			p.difficulty,
			p.pass_rate,
			p.frequency,
			up.personal_difficulty,
			up.status,
			COUNT(r.id) AS review_count
		FROM reviews r
		INNER JOIN user_problems up ON r.user_problem_id = up.id
		INNER JOIN problems p ON up.problem_id = p.id
		WHERE strftime('%Y-%m-%d', r.created_at, 'localtime') = ?
		GROUP BY r.user_problem_id
		ORDER BY review_count DESC, p.lc_id ASC
	`, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ProblemReviewedOnDateRow
	for rows.Next() {
		var row ProblemReviewedOnDateRow
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
			&row.ReviewCount,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// GetReviewCountByUserProblemID 返回指定 user_problem_id 的复习次数（reviews 行数）。
func (r *ReviewRepository) GetReviewCountByUserProblemID(userProblemID string) (int, error) {
	if userProblemID == "" {
		return 0, nil
	}
	var cnt int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM reviews WHERE user_problem_id = ?`, userProblemID).Scan(&cnt)
	if err != nil {
		return 0, err
	}
	return cnt, nil
}
