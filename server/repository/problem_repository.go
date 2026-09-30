package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
	"strings"
	"time"
)

type ProblemRepository struct {
	db *sql.DB
}

func NewProblemRepository() *ProblemRepository {
	return &ProblemRepository{db: config.DB}
}

// CreateProblem 创建题目
func (r *ProblemRepository) CreateProblem(problem *models.Problem) error {
	_, err := r.db.Exec(`
		INSERT INTO problems (id, lc_id, lc_frontend_id, title, title_slug, translated_title, difficulty, content, translated_content, category_title, topic_tags, code_snippets, example_testcases, sample_test_case, likes, dislikes, is_paid_only, stats, pass_rate, frequency, description, examples, constraints, similar_questions, position_level_tags, has_html_demo, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, problem.ID, problem.LcID, problem.LcFrontendID, problem.Title, problem.TitleSlug, problem.TranslatedTitle, problem.Difficulty, problem.Content, problem.TranslatedContent, problem.CategoryTitle, problem.TopicTags, problem.CodeSnippets, problem.ExampleTestcases, problem.SampleTestCase, problem.Likes, problem.Dislikes, problem.IsPaidOnly, problem.Stats, problem.PassRate, problem.Frequency, problem.Description, problem.Examples, problem.Constraints, problem.SimilarQuestions, problem.PositionLevelTags, problem.HasHtmlDemo, problem.CreatedAt, problem.UpdatedAt)
	return err
}

// GetProblemByID 根据 ID 获取题目
func (r *ProblemRepository) GetProblemByID(id string) (*models.Problem, error) {
	var problem models.Problem
	err := r.db.QueryRow(`
		SELECT id, lc_id, lc_frontend_id, title, title_slug, translated_title, difficulty, content, translated_content, category_title, topic_tags, code_snippets, example_testcases, sample_test_case, likes, dislikes, is_paid_only, stats, pass_rate, frequency, description, examples, constraints, COALESCE(similar_questions, ''), COALESCE(position_level_tags, ''), COALESCE(has_html_demo, 0), created_at, updated_at
		FROM problems WHERE id = ?
	`, id).Scan(&problem.ID, &problem.LcID, &problem.LcFrontendID, &problem.Title, &problem.TitleSlug, &problem.TranslatedTitle, &problem.Difficulty, &problem.Content, &problem.TranslatedContent, &problem.CategoryTitle, &problem.TopicTags, &problem.CodeSnippets, &problem.ExampleTestcases, &problem.SampleTestCase, &problem.Likes, &problem.Dislikes, &problem.IsPaidOnly, &problem.Stats, &problem.PassRate, &problem.Frequency, &problem.Description, &problem.Examples, &problem.Constraints, &problem.SimilarQuestions, &problem.PositionLevelTags, &problem.HasHtmlDemo, &problem.CreatedAt, &problem.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &problem, nil
}

// GetProblemDetail 获取题目详情（含 user_problems 和复习统计）
func (r *ProblemRepository) GetProblemDetail(id string) (*models.ProblemDetail, error) {
	var d models.ProblemDetail
	var userProblemID, notes, code, status, progressStatus sql.NullString
	var personalDifficulty sql.NullInt64
	var lastReview sql.NullTime
	var reviewCount sql.NullInt64

	err := r.db.QueryRow(`
		SELECT
			p.id, p.lc_id, p.lc_frontend_id, p.title, p.title_slug, p.translated_title,
			p.difficulty, p.content, p.translated_content, p.category_title, p.topic_tags,
			p.code_snippets, p.example_testcases, p.sample_test_case, p.likes, p.dislikes,
			p.is_paid_only, p.stats, p.pass_rate, p.frequency, p.description, p.examples,
			p.constraints, COALESCE(p.similar_questions, ''), COALESCE(p.position_level_tags, ''), COALESCE(p.has_html_demo, 0), p.created_at, p.updated_at,
		 up.id, up.personal_difficulty, up.status, COALESCE(up.progress_status, 'Unpracticed'), up.notes, up.code, up.last_review,
			COALESCE(up.review_count, 0) AS review_count
		FROM problems p
		LEFT JOIN user_problems up ON up.problem_id = p.id
		WHERE p.id = ?
	`, id).Scan(
		&d.ID, &d.LcID, &d.LcFrontendID, &d.Title, &d.TitleSlug, &d.TranslatedTitle,
		&d.Difficulty, &d.Content, &d.TranslatedContent, &d.CategoryTitle, &d.TopicTags,
		&d.CodeSnippets, &d.ExampleTestcases, &d.SampleTestCase, &d.Likes, &d.Dislikes,
		&d.IsPaidOnly, &d.Stats, &d.PassRate, &d.Frequency, &d.Description, &d.Examples,
		&d.Constraints, &d.SimilarQuestions, &d.PositionLevelTags, &d.HasHtmlDemo, &d.CreatedAt, &d.UpdatedAt,
		&userProblemID, &personalDifficulty, &status, &progressStatus, &notes, &code, &lastReview, &reviewCount,
	)
	if err != nil {
		return nil, err
	}

	d.UserProblemID = userProblemID.String
	d.PersonalDifficulty = int(personalDifficulty.Int64)
	d.Status = status.String
	d.ProgressStatus = progressStatus.String
	d.Notes = notes.String
	d.Code = code.String
	if lastReview.Valid {
		d.LastReview = &lastReview.Time
	}
	d.ReviewCount = int(reviewCount.Int64)

	return &d, nil
}

func (r *ProblemRepository) GetProblemByLcID(lcID string) (*models.Problem, error) {
	var problem models.Problem
	err := r.db.QueryRow(`
		SELECT id, lc_id, lc_frontend_id, title, title_slug, translated_title, difficulty, content, translated_content, category_title, topic_tags, code_snippets, example_testcases, sample_test_case, likes, dislikes, is_paid_only, stats, pass_rate, frequency, description, examples, constraints, COALESCE(similar_questions, ''), COALESCE(position_level_tags, ''), COALESCE(has_html_demo, 0), created_at, updated_at
		FROM problems WHERE lc_id = ?
	`, lcID).Scan(&problem.ID, &problem.LcID, &problem.LcFrontendID, &problem.Title, &problem.TitleSlug, &problem.TranslatedTitle, &problem.Difficulty, &problem.Content, &problem.TranslatedContent, &problem.CategoryTitle, &problem.TopicTags, &problem.CodeSnippets, &problem.ExampleTestcases, &problem.SampleTestCase, &problem.Likes, &problem.Dislikes, &problem.IsPaidOnly, &problem.Stats, &problem.PassRate, &problem.Frequency, &problem.Description, &problem.Examples, &problem.Constraints, &problem.SimilarQuestions, &problem.PositionLevelTags, &problem.HasHtmlDemo, &problem.CreatedAt, &problem.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &problem, nil
}

// GetProblemByTitleSlug 根据 titleSlug 获取题目
func (r *ProblemRepository) GetProblemByTitleSlug(titleSlug string) (*models.Problem, error) {
	var problem models.Problem
	err := r.db.QueryRow(`
		SELECT id, lc_id, lc_frontend_id, title, title_slug, translated_title, difficulty, content, translated_content, category_title, topic_tags, code_snippets, example_testcases, sample_test_case, likes, dislikes, is_paid_only, stats, pass_rate, frequency, description, examples, constraints, COALESCE(similar_questions, ''), COALESCE(position_level_tags, ''), COALESCE(has_html_demo, 0), created_at, updated_at
		FROM problems WHERE title_slug = ?
	`, titleSlug).Scan(&problem.ID, &problem.LcID, &problem.LcFrontendID, &problem.Title, &problem.TitleSlug, &problem.TranslatedTitle, &problem.Difficulty, &problem.Content, &problem.TranslatedContent, &problem.CategoryTitle, &problem.TopicTags, &problem.CodeSnippets, &problem.ExampleTestcases, &problem.SampleTestCase, &problem.Likes, &problem.Dislikes, &problem.IsPaidOnly, &problem.Stats, &problem.PassRate, &problem.Frequency, &problem.Description, &problem.Examples, &problem.Constraints, &problem.SimilarQuestions, &problem.PositionLevelTags, &problem.HasHtmlDemo, &problem.CreatedAt, &problem.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &problem, nil
}

// GetAllProblems 获取所有题目
func (r *ProblemRepository) GetAllProblems() ([]models.Problem, error) {
	rows, err := r.db.Query(`
		SELECT id, lc_id, lc_frontend_id, title, title_slug, translated_title, difficulty, content, translated_content, category_title, topic_tags, code_snippets, example_testcases, sample_test_case, likes, dislikes, is_paid_only, stats, pass_rate, frequency, description, examples, constraints, COALESCE(similar_questions, ''), COALESCE(position_level_tags, ''), COALESCE(has_html_demo, 0), created_at, updated_at
		FROM problems
		ORDER BY lc_frontend_id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var problems []models.Problem
	for rows.Next() {
		var problem models.Problem
		err := rows.Scan(&problem.ID, &problem.LcID, &problem.LcFrontendID, &problem.Title, &problem.TitleSlug, &problem.TranslatedTitle, &problem.Difficulty, &problem.Content, &problem.TranslatedContent, &problem.CategoryTitle, &problem.TopicTags, &problem.CodeSnippets, &problem.ExampleTestcases, &problem.SampleTestCase, &problem.Likes, &problem.Dislikes, &problem.IsPaidOnly, &problem.Stats, &problem.PassRate, &problem.Frequency, &problem.Description, &problem.Examples, &problem.Constraints, &problem.SimilarQuestions, &problem.PositionLevelTags, &problem.HasHtmlDemo, &problem.CreatedAt, &problem.UpdatedAt)
		if err != nil {
			return nil, err
		}
		problems = append(problems, problem)
	}
	return problems, rows.Err()
}

func (r *ProblemRepository) buildProblemsDisplayWhereClauses(searchQuery, difficulty string, tags []string, args *[]interface{}) string {
	clauses := []string{"1=1"}

	if searchQuery != "" {
		// 前端逻辑：title（不区分大小写包含） 或 lcId（包含）
		*args = append(*args, "%"+strings.ToLower(searchQuery)+"%")
		*args = append(*args, "%"+searchQuery+"%")
		clauses = append(clauses, "(LOWER(p.title) LIKE ? OR p.lc_id LIKE ?)")
	}

	if difficulty != "" && difficulty != "All" {
		*args = append(*args, difficulty)
		clauses = append(clauses, "p.difficulty = ?")
	}

	if len(tags) > 0 {
		placeholders := make([]string, 0, len(tags))
		for range tags {
			placeholders = append(placeholders, "?")
		}
		// 要求：problem_tags 中包含 selectedTags 的“全部标签”
		// 通过 HAVING COUNT(DISTINCT tag)=len(tags) 实现。
		clauses = append(
			clauses,
			fmt.Sprintf(
				"p.id IN (SELECT problem_id FROM problem_tags WHERE tag IN (%s) GROUP BY problem_id HAVING COUNT(DISTINCT tag)=?)",
				strings.Join(placeholders, ","),
			),
		)
		for _, t := range tags {
			*args = append(*args, t)
		}
		*args = append(*args, len(tags))
	}

	return strings.Join(clauses, " AND ")
}

func (r *ProblemRepository) CountProblemsForDisplayList(searchQuery, difficulty string, tags []string) (int64, error) {
	args := make([]interface{}, 0)
	where := r.buildProblemsDisplayWhereClauses(searchQuery, difficulty, tags, &args)

	var total int64
	err := r.db.QueryRow(`
		SELECT COUNT(1)
		FROM problems p
		WHERE `+where+`
	`, args...).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

// GetProblemsForDisplayList 获取题库列表（用于前端“表格”展示：简化版字段 + SQL 级分页）
func (r *ProblemRepository) GetProblemsForDisplayList(page, pageSize int, searchQuery, difficulty string, tags []string, sortMode, sortDirection string) ([]models.Problem, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 10
	}

	args := make([]interface{}, 0)
	where := r.buildProblemsDisplayWhereClauses(searchQuery, difficulty, tags, &args)

	dir := "DESC"
	if strings.ToLower(sortDirection) == "asc" {
		dir = "ASC"
	}

	orderBy := ""
	switch sortMode {
	case "difficulty":
		orderBy = fmt.Sprintf(`
			CASE p.difficulty
				WHEN 'Easy' THEN 1
				WHEN 'Medium' THEN 2
				WHEN 'Hard' THEN 3
				ELSE 99
			END %s, CAST(p.lc_id AS INTEGER) %s, p.id %s
		`, dir, dir, dir)
	case "createdAt":
		orderBy = fmt.Sprintf(`p.created_at %s, CAST(p.lc_id AS INTEGER) %s, p.id %s`, dir, dir, dir)
	default:
		// lcId / 兜底
		orderBy = fmt.Sprintf(`CAST(p.lc_id AS INTEGER) %s, p.created_at %s, p.id %s`, dir, dir, dir)
	}

	offset := (page - 1) * pageSize
	args = append(args, pageSize, offset)

	rows, err := r.db.Query(`
		SELECT
			p.id,
			p.lc_id,
			p.lc_frontend_id,
			p.title,
			p.title_slug,
			p.translated_title,
			p.difficulty,
			p.pass_rate,
			p.frequency,
			COALESCE(p.has_html_demo, 0),
			p.created_at
		FROM problems p
		WHERE `+where+`
		`+`ORDER BY `+orderBy+`
		LIMIT ? OFFSET ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Problem
	for rows.Next() {
		var p models.Problem
		if err := rows.Scan(
			&p.ID,
			&p.LcID,
			&p.LcFrontendID,
			&p.Title,
			&p.TitleSlug,
			&p.TranslatedTitle,
			&p.Difficulty,
			&p.PassRate,
			&p.Frequency,
			&p.HasHtmlDemo,
			&p.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetRandomReviewingProblemsForDisplay 获取“复习中”的随机题目（简化版字段 + 数量限制）。
func (r *ProblemRepository) GetRandomReviewingProblemsForDisplay(count int, searchQuery, difficulty string, tags []string) ([]models.Problem, error) {
	if count < 1 {
		count = 10
	}

	args := make([]interface{}, 0)
	where := r.buildProblemsDisplayWhereClauses(searchQuery, difficulty, tags, &args)

	// RANDOM() 是 SQLite 函数。
	// 为了贴近前端“优先 reviewCount 小的，再在相同 reviewCount 内随机”，这里采用：
	// ORDER BY review_count ASC, RANDOM() LIMIT count
	args = append(args, count)

	rows, err := r.db.Query(`
		SELECT
			p.id,
			p.lc_id,
			p.lc_frontend_id,
			p.title,
			p.title_slug,
			p.translated_title,
			p.difficulty,
			p.pass_rate,
			p.frequency,
			COALESCE(p.has_html_demo, 0),
			p.created_at
		FROM problems p
		INNER JOIN user_problems up ON up.problem_id = p.id
		WHERE COALESCE(NULLIF(up.progress_status, ''), 'Unpracticed') = 'Reviewing'
		  AND `+where+`
		ORDER BY up.review_count ASC, RANDOM()
		LIMIT ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Problem
	for rows.Next() {
		var p models.Problem
		if err := rows.Scan(
			&p.ID,
			&p.LcID,
			&p.LcFrontendID,
			&p.Title,
			&p.TitleSlug,
			&p.TranslatedTitle,
			&p.Difficulty,
			&p.PassRate,
			&p.Frequency,
			&p.HasHtmlDemo,
			&p.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpdateProblem 更新题目
func (r *ProblemRepository) UpdateProblem(problem *models.Problem) error {
	problem.UpdatedAt = time.Now().Format("2006-01-02 15:04:05")
	_, err := r.db.Exec(`
		UPDATE problems SET lc_frontend_id = ?, title = ?, title_slug = ?, translated_title = ?, difficulty = ?, content = ?, translated_content = ?, category_title = ?, code_snippets = ?, example_testcases = ?, sample_test_case = ?, likes = ?, dislikes = ?, is_paid_only = ?, stats = ?, pass_rate = ?, frequency = ?, description = ?, examples = ?, constraints = ?, updated_at = ?
		WHERE id = ?
	`, problem.LcFrontendID, problem.Title, problem.TitleSlug, problem.TranslatedTitle, problem.Difficulty, problem.Content, problem.TranslatedContent, problem.CategoryTitle, problem.CodeSnippets, problem.ExampleTestcases, problem.SampleTestCase, problem.Likes, problem.Dislikes, problem.IsPaidOnly, problem.Stats, problem.PassRate, problem.Frequency, problem.Description, problem.Examples, problem.Constraints, problem.UpdatedAt, problem.ID)
	return err
}

// DeleteProblem 删除题目
func (r *ProblemRepository) DeleteProblem(id string) error {
	_, err := r.db.Exec("DELETE FROM problems WHERE id = ?", id)
	return err
}

// ParseExamples 解析 examples JSON
func (r *ProblemRepository) ParseExamples(examplesJSON string) ([]map[string]interface{}, error) {
	var examples []map[string]interface{}
	if err := json.Unmarshal([]byte(examplesJSON), &examples); err != nil {
		return nil, err
	}
	return examples, nil
}

// UpdateProblemHasHtmlDemo sets problems.has_html_demo (0 or 1).
func (r *ProblemRepository) UpdateProblemHasHtmlDemo(problemID string, has int) error {
	ts := time.Now().Format("2006-01-02 15:04:05")
	_, err := r.db.Exec(`UPDATE problems SET has_html_demo = ?, updated_at = ? WHERE id = ?`, has, ts, problemID)
	return err
}

// ParseConstraints 解析 constraints JSON
func (r *ProblemRepository) ParseConstraints(constraintsJSON string) ([]string, error) {
	var constraints []string
	if err := json.Unmarshal([]byte(constraintsJSON), &constraints); err != nil {
		return nil, err
	}
	return constraints, nil
}
