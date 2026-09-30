package service

import (
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ReviewService struct {
	reviewRepo      *repository.ReviewRepository
	userProblemRepo *repository.UserProblemRepository
}

func NewReviewService() *ReviewService {
	return &ReviewService{
		reviewRepo:      repository.NewReviewRepository(),
		userProblemRepo: repository.NewUserProblemRepository(),
	}
}

// CreateReview 创建复习记录
func (s *ReviewService) CreateReview(req *models.CreateReviewRequest) (*models.Review, error) {
	review := &models.Review{
		ID:                 uuid.New().String(),
		UserProblemID:      req.UserProblemID,
		ReviewDate:         time.Now(),
		Status:             req.Status,
		ProgressStatus:     req.ProgressStatus,
		PersonalDifficulty: req.PersonalDifficulty,
		Comment:            req.Comment,
		Code:               req.Code,
		CodeLanguage:       req.CodeLanguage,
		CreatedAt:          time.Now(),
	}

	if err := s.reviewRepo.CreateReview(review); err != nil {
		return nil, fmt.Errorf("failed to create review: %w", err)
	}
	_ = s.userProblemRepo.IncrementReviewCount(req.UserProblemID)

	// 尝试更新用户题目的最后复习时间和状态
	userProblem, err := s.userProblemRepo.GetUserProblemByID(req.UserProblemID)
	if err == nil && userProblem != nil {
		userProblem.LastReview = &time.Time{}
		*userProblem.LastReview = time.Now()
		userProblem.Status = req.Status
		if req.ProgressStatus != "" {
			userProblem.ProgressStatus = req.ProgressStatus
		}
		if req.PersonalDifficulty > 0 {
			userProblem.PersonalDifficulty = req.PersonalDifficulty
		}
		if req.Code != "" {
			userProblem.Code = req.Code
		}
		userProblem.UpdatedAt = time.Now()
		s.userProblemRepo.UpdateUserProblem(userProblem)
	}

	return review, nil
}

// GetReview 获取复习记录
func (s *ReviewService) GetReview(id string) (*models.Review, error) {
	return s.reviewRepo.GetReviewByID(id)
}

// GetReviewsByUserProblem 获取用户题目的复习记录
func (s *ReviewService) GetReviewsByUserProblem(userProblemID string) ([]models.Review, error) {
	return s.reviewRepo.GetReviewsByUserProblemID(userProblemID)
}

// DeleteReview 删除复习记录
func (s *ReviewService) DeleteReview(id string) error {
	return s.reviewRepo.DeleteReview(id)
}

// UpdateReview 更新复习记录
func (s *ReviewService) UpdateReview(review *models.Review) error {
	return s.reviewRepo.UpdateReview(review)
}

const heatmapRollingDays = 365

// ActivityHeatmapResponse 滑动窗口热力图（以今天为结束日，向前共 heatmapRollingDays 天，含首尾）
type ActivityHeatmapResponse struct {
	StartDate     string         `json:"startDate"`
	EndDate       string         `json:"endDate"`
	Days          int            `json:"days"`
	Counts        map[string]int `json:"counts"`        // 当日复习涉及的不重复 user_problem 数（着色用）
	ProblemCounts map[string]int `json:"problemCounts"` // 当日新创建的题目数（从 problems 表，与「今日题目」一致）
	Total         int            `json:"total"`         // 窗口内 counts 按日相加（同一 user_problem 跨多日会重复计入）
}

// GetActivityHeatmapRolling 以本地日期的「今天」为窗口最后一天，向前推算共 365 天
func (s *ReviewService) GetActivityHeatmapRolling() (*ActivityHeatmapResponse, error) {
	loc := time.Local
	now := time.Now().In(loc)
	end := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	start := end.AddDate(0, 0, -(heatmapRollingDays - 1))

	startStr := start.Format("2006-01-02")
	endStr := end.Format("2006-01-02")

	reviewCounts, _, err := s.reviewRepo.GetDailyReviewStatsBetween(startStr, endStr)
	if err != nil {
		return nil, err
	}

	problemCounts, err := s.userProblemRepo.GetDailyCreatedProblemCountsBetween(startStr, endStr)
	if err != nil {
		return nil, err
	}

	total := 0
	for _, c := range reviewCounts {
		total += c
	}

	return &ActivityHeatmapResponse{
		StartDate:     startStr,
		EndDate:       endStr,
		Days:          heatmapRollingDays,
		Counts:        reviewCounts,
		ProblemCounts: problemCounts,
		Total:         total,
	}, nil
}

func formatPassRateForDisplay(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "0%"
	}
	if strings.HasSuffix(s, "%") {
		return s
	}
	return s + "%"
}

// GetActivityDayProblems 返回指定自然日有过复习的题目列表（按 user_problem_id 去重）
func (s *ReviewService) GetActivityDayProblems(date string) ([]models.ActivityDayProblem, error) {
	rows, err := s.reviewRepo.GetProblemsReviewedOnDate(date)
	if err != nil {
		return nil, err
	}
	out := make([]models.ActivityDayProblem, 0, len(rows))
	for _, row := range rows {
		out = append(out, models.ActivityDayProblem{
			ID:                 row.ProblemID,
			UserProblemID:      row.UserProblemID,
			LcID:               row.LcID,
			Title:              row.Title,
			TranslatedTitle:    row.TranslatedTitle,
			Difficulty:         row.Difficulty,
			PassRate:           formatPassRateForDisplay(row.PassRate),
			Frequency:          row.Frequency,
			PersonalDifficulty: row.PersonalDifficulty,
			Status:             row.Status,
			ReviewCount:        row.ReviewCount,
		})
	}
	return out, nil
}
