package service

import (
	"errors"
	"fmt"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/repository"
	"os"
	"path/filepath"
	"strings"
)

const maxSolutionDemoBytes = 5 << 20 // 5 MiB

// ErrSolutionDemoNotFound is returned when there is no non-empty HTML file.
var ErrSolutionDemoNotFound = errors.New("solution demo not found")

// SolutionDemoService stores HTML demos as files under html-demos/.
type SolutionDemoService struct {
	repo           *repository.ProblemRepository
	userProblemRepo *repository.UserProblemRepository
}

func NewSolutionDemoService() *SolutionDemoService {
	return &SolutionDemoService{
		repo:            repository.NewProblemRepository(),
		userProblemRepo: repository.NewUserProblemRepository(),
	}
}

func sanitizeFileSegment(s string) string {
	if s == "" {
		return "unknown"
	}
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '/', '\\', ':', '\x00', '<', '>', '|', '"', '*', '?':
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), " .")
	if out == "" || out == "." || out == ".." {
		return "unknown"
	}
	return out
}

func (s *SolutionDemoService) demoPath(lcID, titleSlug string) (string, error) {
	dir, err := config.SolutionDemoDir()
	if err != nil {
		return "", err
	}
	base := sanitizeFileSegment(lcID) + "_" + sanitizeFileSegment(titleSlug) + ".html"
	return filepath.Join(dir, base), nil
}

// GetHTML returns raw file bytes as string, or ErrSolutionDemoNotFound.
func (s *SolutionDemoService) GetHTML(problemID string) (string, error) {
	if err := config.EnsureSolutionDemoDir(); err != nil {
		return "", err
	}
	p, err := s.repo.GetProblemByID(problemID)
	if err != nil {
		return "", err
	}
	path, err := s.demoPath(p.LcID, p.TitleSlug)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			_ = s.repo.UpdateProblemHasHtmlDemo(problemID, 0)
			if s.userProblemRepo != nil {
				_ = s.userProblemRepo.UpdateHasHtmlDemoByProblemID(problemID, 0)
			}
			return "", ErrSolutionDemoNotFound
		}
		return "", err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		_ = s.repo.UpdateProblemHasHtmlDemo(problemID, 0)
		if s.userProblemRepo != nil {
			_ = s.userProblemRepo.UpdateHasHtmlDemoByProblemID(problemID, 0)
		}
		return "", ErrSolutionDemoNotFound
	}
	if p.HasHtmlDemo == 0 {
		_ = s.repo.UpdateProblemHasHtmlDemo(problemID, 1)
		if s.userProblemRepo != nil {
			_ = s.userProblemRepo.UpdateHasHtmlDemoByProblemID(problemID, 1)
		}
	}
	return string(b), nil
}

// SaveHTML writes HTML to disk and updates problems.has_html_demo.
func (s *SolutionDemoService) SaveHTML(problemID string, html string) error {
	if len(html) > maxSolutionDemoBytes {
		return fmt.Errorf("HTML exceeds max size (%d bytes)", maxSolutionDemoBytes)
	}
	if err := config.EnsureSolutionDemoDir(); err != nil {
		return err
	}
	p, err := s.repo.GetProblemByID(problemID)
	if err != nil {
		return err
	}
	path, err := s.demoPath(p.LcID, p.TitleSlug)
	if err != nil {
		return err
	}
	if strings.TrimSpace(html) == "" {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		if err := s.repo.UpdateProblemHasHtmlDemo(problemID, 0); err != nil {
			return err
		}
		if s.userProblemRepo != nil {
			_ = s.userProblemRepo.UpdateHasHtmlDemoByProblemID(problemID, 0)
		}
		return nil
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(html), 0644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := s.repo.UpdateProblemHasHtmlDemo(problemID, 1); err != nil {
		return err
	}
	if s.userProblemRepo != nil {
		_ = s.userProblemRepo.UpdateHasHtmlDemoByProblemID(problemID, 1)
	}
	return nil
}
