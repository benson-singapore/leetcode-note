package service

import (
	"encoding/json"
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"time"

	"github.com/google/uuid"
)

type ProblemService struct {
	problemRepo *repository.ProblemRepository
	tagRepo     *repository.TagRepository
}

func NewProblemService() *ProblemService {
	return &ProblemService{
		problemRepo: repository.NewProblemRepository(),
		tagRepo:     repository.NewTagRepository(),
	}
}

// CreateProblem 创建题目
func (s *ProblemService) CreateProblem(req *models.CreateProblemRequest) (*models.Problem, error) {
	// 检查题目是否已存在
	existing, _ := s.problemRepo.GetProblemByLcID(req.LcID)
	if existing != nil {
		return existing, nil
	}

	// 序列化 examples 和 constraints
	examplesJSON, _ := json.Marshal([]interface{}{})
	constraintsJSON, _ := json.Marshal([]interface{}{})

	if req.Examples != "" {
		examplesJSON, _ = json.Marshal(req.Examples)
	}
	if req.Constraints != "" {
		constraintsJSON, _ = json.Marshal(req.Constraints)
	}

	problem := &models.Problem{
		ID:          uuid.New().String(),
		LcID:        req.LcID,
		Title:       req.Title,
		Difficulty:  req.Difficulty,
		PassRate:    req.PassRate,
		Frequency:   req.Frequency,
		Description: req.Description,
		Examples:    string(examplesJSON),
		Constraints: string(constraintsJSON),
		CreatedAt:   time.Now().Format("2006-01-02 15:04:05"),
		UpdatedAt:   time.Now().Format("2006-01-02 15:04:05"),
	}

	if err := s.problemRepo.CreateProblem(problem); err != nil {
		return nil, fmt.Errorf("failed to create problem: %w", err)
	}

	// 添加标签
	for _, tag := range req.Tags {
		tagModel := &models.ProblemTag{
			ID:        uuid.New().String(),
			ProblemID: problem.ID,
			Tag:       tag,
			CreatedAt: time.Now(),
		}
		s.tagRepo.CreateTag(tagModel)
	}

	return problem, nil
}

// GetProblemDetail 获取题目详情（含 user_problems 和复习统计）
func (s *ProblemService) GetProblemDetail(id string) (*models.ProblemDetail, error) {
	return s.problemRepo.GetProblemDetail(id)
}

// GetProblem 获取题目
func (s *ProblemService) GetProblem(id string) (*models.Problem, error) {
	return s.problemRepo.GetProblemByID(id)
}

// GetProblemByTitleSlug 根据 titleSlug 获取题目
func (s *ProblemService) GetProblemByTitleSlug(titleSlug string) (*models.Problem, error) {
	return s.problemRepo.GetProblemByTitleSlug(titleSlug)
}

// GetAllProblems 获取所有题目
func (s *ProblemService) GetAllProblems() ([]models.Problem, error) {
	return s.problemRepo.GetAllProblems()
}

// UpdateProblem 更新题目
func (s *ProblemService) UpdateProblem(id string, req *models.CreateProblemRequest) (*models.Problem, error) {
	problem, err := s.problemRepo.GetProblemByID(id)
	if err != nil {
		return nil, fmt.Errorf("problem not found: %w", err)
	}

	problem.Title = req.Title
	problem.Difficulty = req.Difficulty
	problem.PassRate = req.PassRate
	problem.Frequency = req.Frequency
	problem.Description = req.Description
	problem.UpdatedAt = time.Now().Format("2006-01-02 15:04:05")

	if err := s.problemRepo.UpdateProblem(problem); err != nil {
		return nil, fmt.Errorf("failed to update problem: %w", err)
	}

	return problem, nil
}

// DeleteProblem 删除题目
func (s *ProblemService) DeleteProblem(id string) error {
	// 删除相关标签
	s.tagRepo.DeleteTagsByProblemID(id)
	return s.problemRepo.DeleteProblem(id)
}
