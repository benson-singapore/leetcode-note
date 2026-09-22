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
}

func NewUserProblemService() *UserProblemService {
	return &UserProblemService{
		userProblemRepo: repository.NewUserProblemRepository(),
		problemRepo:     repository.NewProblemRepository(),
		tagRepo:         repository.NewTagRepository(),
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
		return existing, nil
	}
	userProblem := &models.UserProblem{
		PersonalDifficulty: req.PersonalDifficulty,
		Status:             req.Status,
		ProgressStatus:     req.ProgressStatus,
		Notes:              req.Notes,
		Code:               req.Code,
	}
	return s.userProblemRepo.UpsertUserProblem(id, userProblem)
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
