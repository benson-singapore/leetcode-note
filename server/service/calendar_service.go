package service

import (
	"database/sql"
	"errors"
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
)

// CalendarService builds the full date-scoped payload used by external clients.
type CalendarService struct {
	problemRepo     *repository.ProblemRepository
	userProblemRepo *repository.UserProblemRepository
	reviewRepo      *repository.ReviewRepository
	goalService     *DailyGoalService
}

func NewCalendarService() *CalendarService {
	return &CalendarService{
		problemRepo:     repository.NewProblemRepository(),
		userProblemRepo: repository.NewUserProblemRepository(),
		reviewRepo:      repository.NewReviewRepository(),
		goalService:     NewDailyGoalService(),
	}
}

// GetDay returns problems created on the date, review check-ins from the date,
// and the daily goal with its full question and user-answer data when present.
func (s *CalendarService) GetDay(date string) (*models.CalendarDayDetails, error) {
	result := &models.CalendarDayDetails{
		Date:     date,
		Problems: []models.CalendarQuestionDetail{},
		Reviews:  []models.CalendarReviewDetail{},
	}

	createdKeys, err := s.userProblemRepo.GetProblemKeysCreatedOnDate(date)
	if err != nil {
		return nil, fmt.Errorf("读取当日新建题目失败: %w", err)
	}
	for _, key := range createdKeys {
		detail, err := s.questionDetail(key.ProblemID, key.UserProblemID, date)
		if err != nil {
			return nil, err
		}
		result.Problems = append(result.Problems, detail)
	}

	reviewKeys, err := s.reviewRepo.GetProblemKeysReviewedOnDate(date)
	if err != nil {
		return nil, fmt.Errorf("读取当日复习题目失败: %w", err)
	}
	for _, key := range reviewKeys {
		detail, err := s.questionDetail(key.ProblemID, key.UserProblemID, date)
		if err != nil {
			return nil, err
		}
		if detail.UserProblem == nil {
			continue
		}
		result.Reviews = append(result.Reviews, models.CalendarReviewDetail{
			Problem:     detail.Problem,
			UserProblem: *detail.UserProblem,
			CheckIn:     detail.CheckIn,
		})
	}

	goal, err := s.goalService.GetByDate(date)
	if err != nil {
		return nil, fmt.Errorf("读取当日目标失败: %w", err)
	}
	if goal != nil {
		goalDetails := &models.DailyGoalDetails{
			ID:        goal.ID,
			GoalDate:  goal.GoalDate,
			Title:     goal.Title,
			Config:    goal.Config,
			Total:     goal.Total,
			Completed: goal.Completed,
			Items:     []models.DailyGoalItemDetail{},
			CreatedAt: goal.CreatedAt,
			UpdatedAt: goal.UpdatedAt,
		}
		for _, item := range goal.Items {
			detail, err := s.questionDetail(item.ProblemID, item.UserProblemID, date)
			if err != nil {
				return nil, err
			}
			goalDetails.Items = append(goalDetails.Items, models.DailyGoalItemDetail{
				Item:        item,
				Problem:     detail.Problem,
				UserProblem: detail.UserProblem,
				CheckIn:     detail.CheckIn,
			})
		}
		result.DailyGoal = goalDetails
	}

	return result, nil
}

func (s *CalendarService) questionDetail(problemID, userProblemID, date string) (models.CalendarQuestionDetail, error) {
	problem, err := s.problemRepo.GetProblemByID(problemID)
	if err != nil {
		return models.CalendarQuestionDetail{}, fmt.Errorf("读取题目 %s 失败: %w", problemID, err)
	}

	var userProblem *models.UserProblem
	if userProblemID != "" {
		userProblem, err = s.userProblemRepo.GetUserProblemByID(userProblemID)
	} else {
		userProblem, err = s.userProblemRepo.GetUserProblemByProblemID(problemID)
	}
	if errors.Is(err, sql.ErrNoRows) {
		userProblem = nil
	} else if err != nil {
		return models.CalendarQuestionDetail{}, fmt.Errorf("读取题目 %s 的答题记录失败: %w", problemID, err)
	}

	var checkIn *models.Review
	if userProblem != nil {
		checkIn, err = s.reviewRepo.GetLatestReviewByUserProblemOnDate(userProblem.ID, date)
		if err != nil {
			return models.CalendarQuestionDetail{}, fmt.Errorf("读取题目 %s 的当日复习记录失败: %w", problemID, err)
		}
	}

	return models.CalendarQuestionDetail{
		Problem:     *problem,
		UserProblem: toUserProblemAnswer(userProblem),
		CheckIn:     checkIn,
	}, nil
}

func toUserProblemAnswer(userProblem *models.UserProblem) *models.UserProblemAnswer {
	if userProblem == nil {
		return nil
	}
	return &models.UserProblemAnswer{
		ID:                 userProblem.ID,
		ProblemID:          userProblem.ProblemID,
		PersonalDifficulty: userProblem.PersonalDifficulty,
		Status:             userProblem.Status,
		ProgressStatus:     userProblem.ProgressStatus,
		ReviewCount:        userProblem.ReviewCount,
		Notes:              userProblem.Notes,
		Code:               userProblem.Code,
		LastReview:         userProblem.LastReview,
		CreatedAt:          userProblem.CreatedAt,
		UpdatedAt:          userProblem.UpdatedAt,
		HasHtmlDemo:        userProblem.HasHtmlDemo,
	}
}
