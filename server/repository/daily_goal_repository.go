package repository

import (
	"database/sql"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
	"strings"
	"time"

	"github.com/google/uuid"
)

type DailyGoalRepository struct {
	db *sql.DB
}

func NewDailyGoalRepository() *DailyGoalRepository {
	return &DailyGoalRepository{db: config.DB}
}

// dailyGoalItemCompleted 计算目标题是否完成：
// 1. 已精通视为完成；2. 目标生成后完成状态发生变化；3. 当天有训练/复习记录。
func dailyGoalItemCompleted(current, baseline string, reviewedToday bool) bool {
	if current == "" {
		current = "Unpracticed"
	}
	if current == "Mastered" {
		return true
	}
	if current == "Unpracticed" {
		return false
	}
	return reviewedToday || (baseline != "" && current != baseline)
}

// GetByDate 获取指定自然日的目标及其题目（完成状态联表 user_problems）
func (r *DailyGoalRepository) GetByDate(date string) (*models.DailyGoal, error) {
	var goal models.DailyGoal
	err := r.db.QueryRow(`
		SELECT id, goal_date, COALESCE(title, '今日目标'), COALESCE(config, '{}'), created_at, updated_at
		FROM daily_goals WHERE goal_date = ?
	`, date).Scan(&goal.ID, &goal.GoalDate, &goal.Title, &goal.Config, &goal.CreatedAt, &goal.UpdatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := r.db.Query(`
		SELECT
			dgp.id, dgp.goal_id, dgp.problem_id, dgp.sort_order,
			p.lc_id, COALESCE(p.lc_frontend_id, 0), p.title, COALESCE(p.translated_title, ''),
			p.difficulty, COALESCE(p.topic_tags, ''),
			COALESCE(up.id, ''), COALESCE(up.status, ''),
			COALESCE(NULLIF(up.progress_status, ''), 'Unpracticed'),
			COALESCE(up.personal_difficulty, 0),
			COALESCE(dgp.baseline_status, 'Unpracticed'),
			EXISTS(
				SELECT 1 FROM reviews r
				WHERE r.user_problem_id = up.id AND date(r.review_date) = date(?)
			)
		FROM daily_goal_problems dgp
		JOIN problems p ON p.id = dgp.problem_id
		LEFT JOIN user_problems up ON up.problem_id = p.id
		WHERE dgp.goal_id = ?
		ORDER BY dgp.sort_order ASC, dgp.created_at ASC
	`, date, goal.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.DailyGoalItem{}
	for rows.Next() {
		var item models.DailyGoalItem
		var reviewedToday bool
		if err := rows.Scan(
			&item.ID, &item.GoalID, &item.ProblemID, &item.SortOrder,
			&item.LcID, &item.LcFrontendID, &item.Title, &item.TranslatedTitle,
			&item.Difficulty, &item.TopicTags,
			&item.UserProblemID, &item.Status, &item.ProgressStatus,
			&item.PersonalDifficulty,
			&item.BaselineStatus, &reviewedToday,
		); err != nil {
			return nil, err
		}
		item.Completed = dailyGoalItemCompleted(item.ProgressStatus, item.BaselineStatus, reviewedToday)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	goal.Items = items
	goal.Total = len(items)
	for _, item := range items {
		if item.Completed {
			goal.Completed++
		}
	}
	return &goal, nil
}

// Replace 覆盖写入某天的目标题目。同一自然日重复生成时保留一条 goal 记录。
// baselines 用于追加场景保留已有题目的完成基线，缺失时读取 user_problems 当前状态。
func (r *DailyGoalRepository) Replace(date, title, configJSON string, problemIDs []string, baselines map[string]string) (*models.DailyGoal, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := time.Now().Format("2006-01-02 15:04:05")
	if strings.TrimSpace(title) == "" {
		title = "今日目标"
	}

	var goalID string
	err = tx.QueryRow(`SELECT id FROM daily_goals WHERE goal_date = ?`, date).Scan(&goalID)
	switch {
	case err == sql.ErrNoRows:
		goalID = uuid.New().String()
		if _, err = tx.Exec(`
			INSERT INTO daily_goals (id, goal_date, title, config, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`, goalID, date, title, configJSON, now, now); err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		if _, err = tx.Exec(`
			UPDATE daily_goals SET title = ?, config = ?, updated_at = ? WHERE id = ?
		`, title, configJSON, now, goalID); err != nil {
			return nil, err
		}
		if _, err = tx.Exec(`DELETE FROM daily_goal_problems WHERE goal_id = ?`, goalID); err != nil {
			return nil, err
		}
	}

	for i, problemID := range problemIDs {
		baseline := ""
		if baselines != nil {
			baseline = baselines[problemID]
		}
		if baseline == "" {
			baseline = "Unpracticed"
			_ = tx.QueryRow(`
				SELECT COALESCE(NULLIF(progress_status, ''), 'Unpracticed')
				FROM user_problems WHERE problem_id = ? LIMIT 1
			`, problemID).Scan(&baseline)
		}
		if _, err = tx.Exec(`
			INSERT INTO daily_goal_problems (id, goal_id, problem_id, sort_order, baseline_status, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`, uuid.New().String(), goalID, problemID, i, baseline, now); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetByDate(date)
}

// DeleteByDate 清空某天的目标。
func (r *DailyGoalRepository) DeleteByDate(date string) error {
	_, err := r.db.Exec(`DELETE FROM daily_goals WHERE goal_date = ?`, date)
	return err
}

// ListCandidates 根据难度与知识点筛选可选题库题目，优先未练习 / 复习中题目。
// tags 采用“命中任意一个”的语义，便于 AI 在多个专题中自由组合。
func (r *DailyGoalRepository) ListCandidates(difficulties, tags []string, limit int) ([]models.DailyGoalCandidate, error) {
	if limit <= 0 {
		limit = 120
	}

	clauses := []string{"1=1", "COALESCE(p.is_paid_only, 0) = 0"}
	args := []interface{}{}

	if len(difficulties) > 0 {
		placeholders := make([]string, 0, len(difficulties))
		for _, d := range difficulties {
			d = strings.TrimSpace(d)
			if d == "" {
				continue
			}
			placeholders = append(placeholders, "?")
			args = append(args, d)
		}
		if len(placeholders) > 0 {
			clauses = append(clauses, "p.difficulty IN ("+strings.Join(placeholders, ",")+")")
		}
	}

	if len(tags) > 0 {
		placeholders := make([]string, 0, len(tags))
		for _, tag := range tags {
			tag = strings.TrimSpace(tag)
			if tag == "" {
				continue
			}
			placeholders = append(placeholders, "?")
			args = append(args, tag)
		}
		if len(placeholders) > 0 {
			clauses = append(clauses,
				"p.id IN (SELECT problem_id FROM problem_tags WHERE tag IN ("+strings.Join(placeholders, ",")+"))")
		}
	}

	args = append(args, limit)
	rows, err := r.db.Query(`
		SELECT
			p.id, p.lc_id, COALESCE(p.lc_frontend_id, 0), p.title,
			COALESCE(p.translated_title, ''), p.difficulty, COALESCE(p.topic_tags, ''),
			COALESCE(NULLIF(up.progress_status, ''), 'Unpracticed')
		FROM problems p
		LEFT JOIN user_problems up ON up.problem_id = p.id
		WHERE `+strings.Join(clauses, " AND ")+`
		ORDER BY
			CASE WHEN p.id IN (SELECT problem_id FROM daily_goal_problems) THEN 1 ELSE 0 END ASC,
			CASE COALESCE(NULLIF(up.progress_status, ''), 'Unpracticed')
				WHEN 'Unpracticed' THEN 0
				WHEN 'Reviewing' THEN 1
				WHEN 'Mastered' THEN 2
				ELSE 3
			END ASC,
			COALESCE(p.frequency, 0) DESC,
			COALESCE(p.lc_frontend_id, 999999) ASC
		LIMIT ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.DailyGoalCandidate{}
	for rows.Next() {
		var c models.DailyGoalCandidate
		if err := rows.Scan(
			&c.ProblemID, &c.LcID, &c.LcFrontendID, &c.Title,
			&c.TranslatedTitle, &c.Difficulty, &c.TopicTags, &c.ProgressStatus,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// EnsureUserProblem 保证题库中的题目有一条 user_problems 记录，避免今日目标与题库状态断链。
// 已存在的记录不会被覆盖。
func (r *DailyGoalRepository) EnsureUserProblem(problemID string) error {
	var exists bool
	if err := r.db.QueryRow(`SELECT COUNT(1) > 0 FROM user_problems WHERE problem_id = ?`, problemID).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	now := time.Now()
	_, err := r.db.Exec(`
		INSERT INTO user_problems (id, problem_id, personal_difficulty, status, progress_status, review_count, created_at, updated_at)
		VALUES (?, ?, 3, 'New', 'Unpracticed', 0, ?, ?)
	`, uuid.New().String(), problemID, now, now)
	return err
}

// EnsurePracticeReviews 为当天目标中已有练习痕迹但尚无打卡记录的题目补一条训练记录。
// 用于兼容在自动打卡逻辑上线前已经保存过笔记 / 代码的题目。
func (r *DailyGoalRepository) EnsurePracticeReviews(date string) error {
	rows, err := r.db.Query(`
		SELECT up.id, COALESCE(NULLIF(up.status, ''), 'New'),
			COALESCE(NULLIF(up.progress_status, ''), 'Reviewing'),
			COALESCE(up.personal_difficulty, 0), COALESCE(up.code, '')
		FROM daily_goal_problems dgp
		JOIN daily_goals dg ON dg.id = dgp.goal_id
		JOIN user_problems up ON up.problem_id = dgp.problem_id
		WHERE dg.goal_date = ?
			AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_problem_id = up.id)
			AND (
				trim(COALESCE(up.notes, '')) <> ''
				OR trim(COALESCE(up.code, '')) <> ''
				OR up.status IN ('Confused', 'Struggling', 'Relearning', 'Stable', 'Mastered')
			)
	`, date)
	if err != nil {
		return err
	}
	type candidate struct {
		userProblemID      string
		status             string
		progressStatus     string
		personalDifficulty int
		code               string
	}
	candidates := []candidate{}
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.userProblemID, &c.status, &c.progressStatus, &c.personalDifficulty, &c.code); err != nil {
			rows.Close()
			return err
		}
		candidates = append(candidates, c)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if len(candidates) == 0 {
		return nil
	}

	now := time.Now()
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, c := range candidates {
		if _, err := tx.Exec(`
			INSERT INTO reviews (id, user_problem_id, review_date, status, progress_status, personal_difficulty, comment, code, code_language, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)
		`, uuid.New().String(), c.userProblemID, now.Format("2006-01-02"), c.status, c.progressStatus,
			c.personalDifficulty, "首次练习自动记录", c.code, now.UTC().Format("2006-01-02 15:04:05.999999999")); err != nil {
			return err
		}
		if _, err := tx.Exec(`
			UPDATE user_problems
			SET review_count = COALESCE(review_count, 0) + 1, last_review = ?, updated_at = ?
			WHERE id = ?
		`, now, now.Format("2006-01-02 15:04:05"), c.userProblemID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// LibraryStats 题库基础信息（今日目标页左侧展示）
func (r *DailyGoalRepository) LibraryStats() (map[string]int, error) {
	out := map[string]int{"total": 0, "mastered": 0, "reviewing": 0, "unpracticed": 0}
	var total int
	if err := r.db.QueryRow(`SELECT COUNT(1) FROM problems`).Scan(&total); err != nil {
		return nil, err
	}
	out["total"] = total
	rows, err := r.db.Query(`
		SELECT COALESCE(NULLIF(progress_status, ''), 'Unpracticed') AS status, COUNT(1)
		FROM user_problems GROUP BY status
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		switch status {
		case "Mastered":
			out["mastered"] = count
		case "Reviewing":
			out["reviewing"] = count
		default:
			out["unpracticed"] += count
		}
	}
	if out["unpracticed"] < out["total"] {
		// 题库中存在但还没有 user_problems 记录的题目同样视为未练习
		out["unpracticed"] = out["total"] - out["mastered"] - out["reviewing"]
		if out["unpracticed"] < 0 {
			out["unpracticed"] = 0
		}
	}
	return out, rows.Err()
}
