package service

import (
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"strings"
	"time"

	"github.com/google/uuid"
)

type UserProblemService struct {
	userProblemRepo *repository.UserProblemRepository
	problemRepo     *repository.ProblemRepository
	tagRepo         *repository.TagRepository
	reviewRepo      *repository.ReviewRepository
}

func NewUserProblemService() *UserProblemService {
	return &UserProblemService{
		userProblemRepo: repository.NewUserProblemRepository(),
		problemRepo:     repository.NewProblemRepository(),
		tagRepo:         repository.NewTagRepository(),
		reviewRepo:      repository.NewReviewRepository(),
	}
}

// CreateUserProblem 创建用户题目记录
func (s *UserProblemService) CreateUserProblem(req *models.CreateUserProblemRequest) (*models.UserProblem, error) {
	// 验证题目是否存在
	problem, err := s.problemRepo.GetProblemByID(req.ProblemID)
	if err != nil {
		return nil, fmt.Errorf("problem not found: %w", err)
	}

	// 如果没有指定状态，默认为 "Unpracticed"
	status := req.Status
	if status == "" {
		status = "Unpracticed"
	}

	progressStatus := req.ProgressStatus
	if progressStatus == "" {
		progressStatus = "Reviewing"
	}

	userProblem := &models.UserProblem{
		ID:                 uuid.New().String(),
		ProblemID:          req.ProblemID,
		Problem:            *problem,
		PersonalDifficulty: req.PersonalDifficulty,
		Status:             status,
		ProgressStatus:     progressStatus,
		Notes:              req.Notes,
		Code:               req.Code,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if err := s.userProblemRepo.CreateUserProblem(userProblem); err != nil {
		return nil, fmt.Errorf("failed to create user problem: %w", err)
	}
	s.ensureFirstPracticeReview(userProblem)

	return userProblem, nil
}

// GetUserProblem 获取用户题目记录
func (s *UserProblemService) GetUserProblem(id string) (*models.UserProblem, error) {
	return s.userProblemRepo.GetUserProblemByID(id)
}

// GetAllUserProblems 获取所有用户题目记录
func (s *UserProblemService) GetAllUserProblems() ([]models.UserProblem, error) {
	return s.userProblemRepo.GetAllUserProblems()
}

// GetUserProblemsByStatus 根据状态获取用户题目记录
func (s *UserProblemService) GetUserProblemsByStatus(status string) ([]models.UserProblem, error) {
	return s.userProblemRepo.GetUserProblemsByStatus(status)
}

// UpdateUserProblem 更新用户题目记录
func (s *UserProblemService) UpdateUserProblem(id string, req *models.UpdateUserProblemRequest) (*models.UserProblem, error) {
	userProblem, err := s.userProblemRepo.GetUserProblemByID(id)
	if err != nil {
		return nil, fmt.Errorf("user problem not found: %w", err)
	}

	userProblem.PersonalDifficulty = req.PersonalDifficulty
	userProblem.Status = req.Status
	if req.ProgressStatus != "" {
		userProblem.ProgressStatus = req.ProgressStatus
	}
	userProblem.Notes = req.Notes
	userProblem.Code = req.Code
	userProblem.UpdatedAt = time.Now()

	if err := s.userProblemRepo.UpdateUserProblem(userProblem); err != nil {
		return nil, fmt.Errorf("failed to update user problem: %w", err)
	}
	s.ensureFirstPracticeReview(userProblem)

	return userProblem, nil
}

// DeleteUserProblem 删除用户题目记录
func (s *UserProblemService) DeleteUserProblem(id string) error {
	return s.userProblemRepo.DeleteUserProblem(id)
}

// GetStats 获取统计数据
func (s *UserProblemService) GetStats() (*models.StatsResponse, error) {
	return s.userProblemRepo.GetStats()
}

// EnsureImportedProblemReviewing puts an imported solved question in the review queue.
func (s *UserProblemService) EnsureImportedProblemReviewing(problemID string) (bool, error) {
	return s.userProblemRepo.EnsureImportedProblemReviewing(problemID)
}

// UpsertUserProblemNotes 更新或插入用户题目笔记
func (s *UserProblemService) UpsertUserProblemNotes(id string, notes string) (*models.UserProblem, error) {
	return s.userProblemRepo.UpsertUserProblemNotes(id, notes)
}

// UpsertUserProblem 更新或插入用户题目记录（如果不存在则创建）
func (s *UserProblemService) UpsertUserProblem(id string, req *models.UpdateUserProblemRequest) (*models.UserProblem, error) {
	existing, err := s.userProblemRepo.GetUserProblemByID(id)
	if err == nil && existing != nil {
		existing.PersonalDifficulty = req.PersonalDifficulty
		existing.Status = req.Status
		if req.ProgressStatus != "" {
			existing.ProgressStatus = req.ProgressStatus
		}
		existing.Notes = req.Notes
		existing.Code = req.Code
		existing.UpdatedAt = time.Now()
		if err := s.userProblemRepo.UpdateUserProblem(existing); err != nil {
			return nil, err
		}
		s.ensureFirstPracticeReview(existing)
		return existing, nil
	}
	userProblem := &models.UserProblem{
		PersonalDifficulty: req.PersonalDifficulty,
		Status:             req.Status,
		ProgressStatus:     req.ProgressStatus,
		Notes:              req.Notes,
		Code:               req.Code,
	}
	created, err := s.userProblemRepo.UpsertUserProblem(id, userProblem)
	if err != nil {
		return nil, err
	}
	s.ensureFirstPracticeReview(created)
	return created, nil
}

// GetLatestReview 获取用户题目最近一条训练打卡记录；没有记录时返回 nil。
func (s *UserProblemService) GetLatestReview(userProblemID string) (*models.Review, error) {
	if strings.TrimSpace(userProblemID) == "" {
		return nil, nil
	}
	return s.reviewRepo.GetLatestReviewByUserProblemID(userProblemID)
}

// SyncLatestReview 将训练记录内容写回最近一条打卡；尚无打卡时补建一条。
// 用于「核心笔记」抽屉保存时编辑本次训练描述，不改变已有打卡的日期与代码快照。
func (s *UserProblemService) SyncLatestReview(userProblemID, comment, status, progressStatus string, personalDifficulty int) error {
	if strings.TrimSpace(userProblemID) == "" {
		return nil
	}
	latest, err := s.reviewRepo.GetLatestReviewByUserProblemID(userProblemID)
	if err != nil {
		return err
	}
	if latest == nil {
		if strings.TrimSpace(comment) == "" {
			return nil
		}
		now := time.Now()
		if strings.TrimSpace(status) == "" {
			status = "New"
		}
		if strings.TrimSpace(progressStatus) == "" {
			progressStatus = "Reviewing"
		}
		review := &models.Review{
			ID:                 uuid.New().String(),
			UserProblemID:      userProblemID,
			ReviewDate:         now,
			Status:             status,
			ProgressStatus:     progressStatus,
			PersonalDifficulty: personalDifficulty,
			Comment:            comment,
			CreatedAt:          now,
		}
		if err := s.reviewRepo.CreateReview(review); err != nil {
			return err
		}
		_ = s.userProblemRepo.IncrementReviewCount(userProblemID)
		if userProblem, err := s.userProblemRepo.GetUserProblemByID(userProblemID); err == nil && userProblem != nil {
			userProblem.LastReview = &now
			userProblem.UpdatedAt = now
			_ = s.userProblemRepo.UpdateUserProblem(userProblem)
		}
		return nil
	}

	latest.Comment = comment
	if strings.TrimSpace(status) != "" {
		latest.Status = status
	}
	if strings.TrimSpace(progressStatus) != "" {
		latest.ProgressStatus = progressStatus
	}
	latest.PersonalDifficulty = personalDifficulty
	return s.reviewRepo.UpdateReview(latest)
}

// ensureFirstPracticeReview 首次产生练习痕迹（笔记、代码、掌握程度或手感）时，
// 自动补一条训练打卡记录，避免「已经做过但训练记录为空」。
func (s *UserProblemService) ensureFirstPracticeReview(userProblem *models.UserProblem) {
	if userProblem == nil || userProblem.ID == "" {
		return
	}
	hasPractice := strings.TrimSpace(userProblem.Notes) != "" ||
		strings.TrimSpace(userProblem.Code) != "" ||
		(strings.TrimSpace(userProblem.Status) != "" && userProblem.Status != "Unpracticed") ||
		userProblem.PersonalDifficulty > 0
	if !hasPractice {
		return
	}
	count, err := s.reviewRepo.GetReviewCountByUserProblemID(userProblem.ID)
	if err != nil || count > 0 {
		return
	}

	now := time.Now()
	status := userProblem.Status
	if strings.TrimSpace(status) == "" {
		status = "New"
	}
	progressStatus := userProblem.ProgressStatus
	if strings.TrimSpace(progressStatus) == "" {
		progressStatus = "Reviewing"
	}
	review := &models.Review{
		ID:                 uuid.New().String(),
		UserProblemID:      userProblem.ID,
		ReviewDate:         now,
		Status:             status,
		ProgressStatus:     progressStatus,
		PersonalDifficulty: userProblem.PersonalDifficulty,
		Comment:            "首次练习自动记录",
		Code:               userProblem.Code,
		CreatedAt:          now,
	}
	if err := s.reviewRepo.CreateReview(review); err != nil {
		return
	}
	userProblem.ReviewCount++
	userProblem.LastReview = &now
	userProblem.UpdatedAt = now
	_ = s.userProblemRepo.UpdateUserProblem(userProblem)
}

// GetUserProblemByProblemID 根据 problem_id 获取用户题目记录
func (s *UserProblemService) GetUserProblemByProblemID(problemID string) (*models.UserProblem, error) {
	return s.userProblemRepo.GetUserProblemByProblemID(problemID)
}

func formatPassRateCreated(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "0%"
	}
	if strings.HasSuffix(s, "%") {
		return s
	}
	return s + "%"
}

// GetActivityDayCreatedProblems 指定自然日新录入题库的题目（user_problems.created_at）
func (s *UserProblemService) GetActivityDayCreatedProblems(date string) ([]models.ActivityDayProblem, error) {
	rows, err := s.userProblemRepo.GetProblemsCreatedOnDate(date)
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
			PassRate:           formatPassRateCreated(row.PassRate),
			Frequency:          row.Frequency,
			PersonalDifficulty: row.PersonalDifficulty,
			Status:             row.Status,
			ReviewCount:        0,
		})
	}
	return out, nil
}
