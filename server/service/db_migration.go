package service

import (
	"database/sql"
	"leetcode-note-sidecar/config"
	"log"
)

// MigrateDatabase 执行数据库迁移
func MigrateDatabase() error {
	db := config.DB
	if db == nil {
		return nil
	}

	log.Println("[Migration] 开始检查数据库表结构...")

	// 创建鉴权用户表（本地应用已移除登录，迁移到 settings 表）
	if err := createSettingsTable(db); err != nil {
		log.Printf("[Migration] 创建 settings 表失败: %v\n", err)
	}

	// 检查 lc_frontend_id 是否需要转换类型
	if err := migrateLcFrontendIdType(db); err != nil {
		log.Printf("[Migration] 迁移 lc_frontend_id 类型失败: %v\n", err)
		// 继续执行其他迁移
	}

	// 检查并添加缺失的列
	columns := []struct {
		name     string
		dataType string
	}{
		{"lc_frontend_id", "INTEGER"},
		{"title_slug", "TEXT"},
		{"translated_title", "TEXT"},
		{"content", "TEXT"},
		{"translated_content", "TEXT"},
		{"category_title", "TEXT"},
		{"topic_tags", "TEXT"},
		{"code_snippets", "TEXT"},
		{"example_testcases", "TEXT"},
		{"sample_test_case", "TEXT"},
		{"likes", "INTEGER DEFAULT 0"},
		{"dislikes", "INTEGER DEFAULT 0"},
		{"is_paid_only", "BOOLEAN DEFAULT 0"},
		{"stats", "TEXT"},
		{"similar_questions", "TEXT"},
		{"position_level_tags", "TEXT"},
	}

	for _, col := range columns {
		if err := addColumnIfNotExists(db, "problems", col.name, col.dataType); err != nil {
			log.Printf("[Migration] 添加列 %s 失败: %v\n", col.name, err)
			// 继续处理其他列，不中断
		} else {
			log.Printf("[Migration] 列 %s 已添加或已存在\n", col.name)
		}
	}

	if err := addColumnIfNotExists(db, "problems", "has_html_demo", "INTEGER DEFAULT 0"); err != nil {
		log.Printf("[Migration] 添加 problems.has_html_demo 失败: %v\n", err)
	} else {
		log.Printf("[Migration] 列 problems.has_html_demo 已添加或已存在\n")
	}

	if err := addColumnIfNotExists(db, "user_problems", "has_html_demo", "INTEGER DEFAULT 0"); err != nil {
		log.Printf("[Migration] 添加 user_problems.has_html_demo 失败: %v\n", err)
	} else {
		log.Printf("[Migration] 列 user_problems.has_html_demo 已添加或已存在\n")
	}

	if err := addColumnIfNotExists(db, "user_problems", "progress_status", "TEXT DEFAULT 'Unpracticed'"); err != nil {
		log.Printf("[Migration] 添加 user_problems.progress_status 失败: %v\n", err)
	} else {
		log.Printf("[Migration] 列 user_problems.progress_status 已添加或已存在\n")
		// 尝试做一次旧数据回填：如果 progress_status 为空，则尽可能从 status 推导。
		_, _ = db.Exec(`
			UPDATE user_problems
			SET progress_status = CASE
			  WHEN status IN ('Unpracticed', 'Reviewing', 'Mastered') THEN status
			  ELSE 'Unpracticed'
			END
			WHERE progress_status IS NULL OR progress_status = ''
		`)
	}

	if err := addColumnIfNotExists(db, "user_problems", "review_count", "INTEGER DEFAULT 0"); err != nil {
		log.Printf("[Migration] 添加 user_problems.review_count 失败: %v\n", err)
	} else {
		log.Printf("[Migration] 列 user_problems.review_count 已添加或已存在\n")
		_, _ = db.Exec(`
			UPDATE user_problems
			SET review_count = (
				SELECT COUNT(1) FROM reviews r WHERE r.user_problem_id = user_problems.id
			)
		`)
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_user_problems_review_count ON user_problems(review_count)`); err != nil {
		log.Printf("[Migration] 创建索引 idx_user_problems_review_count 失败: %v\n", err)
	} else {
		log.Printf("[Migration] 索引 idx_user_problems_review_count 已添加或已存在\n")
	}

	if err := createSolutionSchemesTable(db); err != nil {
		log.Printf("[Migration] 创建 solution_schemes 表失败: %v\n", err)
	}

	log.Println("[Migration] 数据库迁移完成")
	return nil
}

func createSolutionSchemesTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS solution_schemes (
			id TEXT PRIMARY KEY,
			problem_id TEXT NOT NULL,
			name TEXT DEFAULT '',
			code TEXT,
			html_demo TEXT,
			sort_order INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
		);
	`)
	if err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_solution_schemes_problem_id ON solution_schemes(problem_id)`); err != nil {
		return err
	}
	return nil
}

func createSettingsTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	return err
}

// addColumnIfNotExists 如果列不存在则添加
func addColumnIfNotExists(db *sql.DB, tableName, columnName, dataType string) error {
	// 检查列是否存在
	var exists bool
	err := db.QueryRow(`
		SELECT COUNT(*) > 0 FROM pragma_table_info(?) WHERE name = ?
	`, tableName, columnName).Scan(&exists)

	if err != nil {
		return err
	}

	if exists {
		return nil // 列已存在
	}

	// 添加列
	query := "ALTER TABLE " + tableName + " ADD COLUMN " + columnName + " " + dataType
	_, err = db.Exec(query)
	return err
}

// migrateLcFrontendIdType 将 lc_frontend_id 从 TEXT 转换为 INTEGER
func migrateLcFrontendIdType(db *sql.DB) error {
	// 检查列是否存在
	var exists bool
	err := db.QueryRow(`
		SELECT COUNT(*) > 0 FROM pragma_table_info('problems') WHERE name = 'lc_frontend_id'
	`).Scan(&exists)

	if err != nil || !exists {
		return nil // 列不存在，无需迁移
	}

	// 检查列的类型
	var columnType string
	err = db.QueryRow(`
		SELECT type FROM pragma_table_info('problems') WHERE name = 'lc_frontend_id'
	`).Scan(&columnType)

	if err != nil {
		return err
	}

	// 如果已经是 INTEGER，无需迁移
	if columnType == "INTEGER" {
		log.Println("[Migration] lc_frontend_id 已是 INTEGER 类型")
		return nil
	}

	log.Printf("[Migration] 开始将 lc_frontend_id 从 %s 转换为 INTEGER\n", columnType)

	// SQLite 不支持直接修改列类型，需要重建表
	_, err = db.Exec(`
		BEGIN TRANSACTION;
		
		CREATE TABLE problems_new AS 
		SELECT 
			id, lc_id, 
			CAST(CASE WHEN lc_frontend_id = '' OR lc_frontend_id IS NULL THEN 0 ELSE lc_frontend_id END AS INTEGER) as lc_frontend_id,
			title, title_slug, translated_title, difficulty, content, translated_content, 
			category_title, topic_tags, code_snippets, example_testcases, sample_test_case, 
			likes, dislikes, is_paid_only, stats, pass_rate, frequency, description, 
			examples, constraints, similar_questions, position_level_tags, created_at, updated_at
		FROM problems;
		
		DROP TABLE problems;
		ALTER TABLE problems_new RENAME TO problems;
		
		COMMIT;
	`)

	if err != nil {
		log.Printf("[Migration] 转换失败: %v\n", err)
		return err
	}

	log.Println("[Migration] lc_frontend_id 类型转换完成")
	return nil
}
