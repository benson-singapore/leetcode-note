package service

import (
	"errors"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"strings"
)

const maxSchemeDemoBytes = 5 << 20 // 5 MiB

var ErrSchemeNotFound = errors.New("solution scheme not found")

// SolutionSchemeService 解题方案业务逻辑
type SolutionSchemeService struct {
	repo *repository.SolutionSchemeRepository
}

func NewSolutionSchemeService() *SolutionSchemeService {
	return &SolutionSchemeService{repo: repository.NewSolutionSchemeRepository()}
}

// List 列出题目下的所有方案
func (s *SolutionSchemeService) List(problemID string) ([]models.SolutionScheme, error) {
	return s.repo.ListByProblemID(problemID)
}

// Create 新增方案
func (s *SolutionSchemeService) Create(problemID string, req *models.SaveSolutionSchemeRequest) (*models.SolutionScheme, error) {
	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	code := ""
	if req.Code != nil {
		code = *req.Code
	}
	return s.repo.Create(problemID, name, code)
}

// Update 更新方案（nil 字段表示不修改）
func (s *SolutionSchemeService) Update(problemID, schemeID string, req *models.SaveSolutionSchemeRequest) (*models.SolutionScheme, error) {
	scheme, err := s.repo.GetByID(schemeID)
	if err != nil {
		return nil, ErrSchemeNotFound
	}
	if scheme.ProblemID != problemID {
		return nil, ErrSchemeNotFound
	}
	if req.Html != nil && len(*req.Html) > maxSchemeDemoBytes {
		return nil, errors.New("HTML exceeds max size (5 MiB)")
	}

	name := scheme.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	code := scheme.Code
	if req.Code != nil {
		code = *req.Code
	}
	var html *string
	if req.Html != nil {
		html = req.Html
	}
	return s.repo.Update(schemeID, name, code, html)
}

// Delete 删除方案
func (s *SolutionSchemeService) Delete(problemID, schemeID string) error {
	scheme, err := s.repo.GetByID(schemeID)
	if err != nil {
		return ErrSchemeNotFound
	}
	if scheme.ProblemID != problemID {
		return ErrSchemeNotFound
	}
	return s.repo.Delete(schemeID)
}
