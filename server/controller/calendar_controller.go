package controller

import (
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type CalendarController struct {
	calendarService *service.CalendarService
}

func NewCalendarController() *CalendarController {
	return &CalendarController{calendarService: service.NewCalendarService()}
}

// GetDay returns new questions, review check-ins and daily goal details for one date.
// @Summary 按日期获取题目与复习详情
// @Description 返回当日新建题目的完整题面、用户代码与核心笔记，当日复习题及打卡内容；若当天有每日目标，也返回目标题目的完整数据。
// @Tags Calendar
// @Produce json
// @Param date query string true "日期 YYYY-MM-DD"
// @Success 200 {object} utils.Response{data=models.CalendarDayDetails}
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /calendar/day [get]
func (c *CalendarController) GetDay(ctx *gin.Context) {
	date := strings.TrimSpace(ctx.Query("date"))
	if date == "" {
		utils.BadRequest(ctx, "date is required; expected YYYY-MM-DD")
		return
	}
	parsed, err := time.ParseInLocation("2006-01-02", date, time.Local)
	if err != nil || parsed.Format("2006-01-02") != date {
		utils.BadRequest(ctx, "invalid date; expected YYYY-MM-DD")
		return
	}

	data, err := c.calendarService.GetDay(date)
	if err != nil {
		utils.InternalError(ctx, "获取日期详情失败: "+err.Error())
		return
	}
	utils.Success(ctx, data)
}
