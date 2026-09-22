package service

import (
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"time"

	"github.com/google/uuid"
)

type TagService struct {
	tagRepo *repository.TagRepository
}

func NewTagService() *TagService {
	return &TagService{
		tagRepo: repository.NewTagRepository(),
	}
}

// CreateTag 创建标签
func (s *TagService) CreateTag(problemID, tag string) (*models.ProblemTag, error) {
	tagModel := &models.ProblemTag{
		ID:        uuid.New().String(),
		ProblemID: problemID,
		Tag:       tag,
		CreatedAt: time.Now(),
	}

	if err := s.tagRepo.CreateTag(tagModel); err != nil {
		return nil, fmt.Errorf("failed to create tag: %w", err)
	}

	return tagModel, nil
}

// GetTagsByProblem 获取题目的标签
func (s *TagService) GetTagsByProblem(problemID string) ([]string, error) {
	tags, err := s.tagRepo.GetTagsByProblemID(problemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get tags: %w", err)
	}

	tagStrings := make([]string, len(tags))
	for i, tag := range tags {
		tagStrings[i] = tag.Tag
	}

	return tagStrings, nil
}

// GetAllTags 获取所有标签
func (s *TagService) GetAllTags() ([]string, error) {
	return s.tagRepo.GetAllTags()
}

// GetAllTagCounts 获取每个 tag 出现的题目数
func (s *TagService) GetAllTagCounts() (map[string]int, error) {
	return s.tagRepo.GetAllTagCounts()
}

// DeleteTag 删除标签
func (s *TagService) DeleteTag(id string) error {
	return s.tagRepo.DeleteTag(id)
}

// DeleteTagsByProblem 删除题目的所有标签
func (s *TagService) DeleteTagsByProblem(problemID string) error {
	return s.tagRepo.DeleteTagsByProblemID(problemID)
}
