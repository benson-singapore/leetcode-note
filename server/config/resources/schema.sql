-- 题目表：存储 LeetCode 题目基本信息
CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  lc_id TEXT UNIQUE NOT NULL,
  lc_frontend_id INTEGER,
  title TEXT NOT NULL,
  title_slug TEXT,
  translated_title TEXT,
  difficulty TEXT NOT NULL,
  content TEXT,
  translated_content TEXT,
  category_title TEXT,
  topic_tags TEXT,
  code_snippets TEXT,
  example_testcases TEXT,
  sample_test_case TEXT,
  likes INTEGER DEFAULT 0,
  dislikes INTEGER DEFAULT 0,
  is_paid_only BOOLEAN DEFAULT 0,
  stats TEXT,
  pass_rate TEXT,
  frequency INTEGER DEFAULT 0,
  description TEXT,
  examples TEXT,
  constraints TEXT,
  has_html_demo INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户题目记录表：存储用户对每道题的学习状态
CREATE TABLE IF NOT EXISTS user_problems (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  personal_difficulty INTEGER DEFAULT 3,
  status TEXT DEFAULT 'New',
  progress_status TEXT DEFAULT 'Unpracticed',
  review_count INTEGER DEFAULT 0,
  notes TEXT,
  code TEXT,
  last_review DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
);

-- 题目标签表：存储题目的知识标签
CREATE TABLE IF NOT EXISTS problem_tags (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  UNIQUE(problem_id, tag)
);

-- 复习记录表：存储每次复习的详细信息
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_problem_id TEXT NOT NULL,
  review_date DATE NOT NULL,
  status TEXT NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_problem_id) REFERENCES user_problems(id) ON DELETE CASCADE
);

-- 解题方案表：一道题的多种解法（默认实现不落库，额外方案存此表）
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

-- 应用设置表：本地应用无需登录，KV 存储全局设置（如 LeetCode Cookie、AI 配置等）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI 会话表：AI 问答的会话列表
CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '新对话',
  problem_id TEXT,
  provider TEXT DEFAULT '',
  model TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE SET NULL
);

-- AI 消息表：会话内的消息记录（role: user / assistant / system）
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  provider TEXT DEFAULT '',
  model TEXT DEFAULT '',
  tokens_used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_user_problems_problem_id ON user_problems(problem_id);
CREATE INDEX IF NOT EXISTS idx_user_problems_status ON user_problems(status);
CREATE INDEX IF NOT EXISTS idx_user_problems_progress_status ON user_problems(progress_status);
CREATE INDEX IF NOT EXISTS idx_problem_tags_problem_id ON problem_tags(problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_tags_tag ON problem_tags(tag);
CREATE INDEX IF NOT EXISTS idx_reviews_user_problem_id ON reviews(user_problem_id);
CREATE INDEX IF NOT EXISTS idx_reviews_review_date ON reviews(review_date);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_solution_schemes_problem_id ON solution_schemes(problem_id);
