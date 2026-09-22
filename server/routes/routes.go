package routes

import (
	"leetcode-note-sidecar/controller"

	"github.com/gin-gonic/gin"
)

// RegisterRoutes 注册所有路由
// 本地应用无登录态，全部接口仅监听 127.0.0.1 供 Tauri WebView 与油猴脚本调用
func RegisterRoutes(r *gin.Engine) {
	problemCtrl := controller.NewProblemController()
	userProblemCtrl := controller.NewUserProblemController()
	reviewCtrl := controller.NewReviewController()
	leetcodeCtrl := controller.NewLeetCodeController()
	displayCtrl := controller.NewProblemDisplayController()
	tagCtrl := controller.NewTagController()
	imageCtrl := controller.NewImageController()
	settingsCtrl := controller.NewSettingsController()
	aiCtrl := controller.NewAIController()

	v1 := r.Group("/api/v1")
	{
		// 设置路由（原 auth/leetcode-cookie 迁移至此）
		v1.GET("/settings", settingsCtrl.GetAllSettings)
		v1.PUT("/settings", settingsCtrl.UpdateSettings)
		v1.GET("/settings/:key", settingsCtrl.GetSetting)
		v1.PUT("/settings/:key", settingsCtrl.UpdateSetting)

		// 题目路由
		problems := v1.Group("/problems")
		{
			problems.POST("", problemCtrl.CreateProblem)
			problems.GET("", displayCtrl.GetAllProblems)
			problems.GET("/stats", displayCtrl.GetStats)
			problems.GET("/:id/solution-demo", displayCtrl.GetSolutionDemo)
			problems.PUT("/:id/solution-demo", displayCtrl.PutSolutionDemo)
			problems.GET("/:id", displayCtrl.GetProblemByID)
			problems.PUT("/:id", problemCtrl.UpdateProblem)
			problems.DELETE("/:id", problemCtrl.DeleteProblem)
		}

		// 标签（知识专题侧边栏）
		v1.GET("/tags", tagCtrl.GetTagSummary)

		// 用户题目路由
		userProblems := v1.Group("/user-problems")
		{
			userProblems.POST("", userProblemCtrl.CreateUserProblem)
			userProblems.GET("", userProblemCtrl.GetAllUserProblems)
			userProblems.GET("/stats", userProblemCtrl.GetStats)
			userProblems.GET("/status", userProblemCtrl.GetUserProblemsByStatus)
			userProblems.GET("/on-date", userProblemCtrl.GetActivityDayCreated)

			// 笔记路由必须在 /:id 之前定义
			userProblems.GET("/:id/notes", userProblemCtrl.GetUserProblemNotes)
			userProblems.PUT("/:id/notes", userProblemCtrl.UpdateUserProblemNotes)

			// 通用 ID 路由必须在最后
			userProblems.GET("/:id", userProblemCtrl.GetUserProblem)
			userProblems.PUT("/:id", userProblemCtrl.UpdateUserProblem)
			userProblems.DELETE("/:id", userProblemCtrl.DeleteUserProblem)
		}

		// 复习记录路由（具体路径须注册在 /:id 之前）
		reviews := v1.Group("/reviews")
		{
			reviews.POST("", reviewCtrl.CreateReview)
			reviews.GET("/activity-heatmap", reviewCtrl.GetActivityHeatmap)
			reviews.GET("/activity-day", reviewCtrl.GetActivityDay)
			reviews.GET("/user-problem/:userProblemId", reviewCtrl.GetReviewsByUserProblem)
			reviews.GET("/:id", reviewCtrl.GetReview)
			reviews.PUT("/:id", reviewCtrl.UpdateReview)
			reviews.DELETE("/:id", reviewCtrl.DeleteReview)
		}

		// 图床：文件上传与 URL 转存，成功响应 data.image.url
		images := v1.Group("/images")
		{
			images.POST("/upload", imageCtrl.UploadImage)
			images.POST("/upload-url", imageCtrl.UploadImageByURL)
		}

		// LeetCode 数据获取路由
		leetcode := v1.Group("/leetcode")
		{
			leetcode.GET("/fetch", leetcodeCtrl.FetchProblem)
			leetcode.GET("/user-synced-code", leetcodeCtrl.GetLeetCodeSyncedCode)

			// 油猴脚本数据端点（本地免鉴权）
			userProblem := leetcode.Group("/user-problem")
			{
				userProblem.GET("/detail", leetcodeCtrl.GetUserProblemDetail)
				userProblem.POST("/save", leetcodeCtrl.SaveUserProblem)
				userProblem.POST("/save-v2", leetcodeCtrl.SaveUserProblemV2)
			}

			// 缓存管理
			cache := leetcode.Group("/cache")
			{
				cache.POST("/clear", leetcodeCtrl.ClearCache)
				cache.GET("/stats", leetcodeCtrl.GetCacheStats)
			}
		}

		// AI 路由
		ai := v1.Group("/ai")
		{
			ai.GET("/providers", aiCtrl.ListProviders)
			ai.GET("/settings", aiCtrl.GetAISettings)
			ai.PUT("/settings", aiCtrl.UpdateAISettings)
			ai.POST("/chat", aiCtrl.Chat)            // SSE 流式对话
			ai.POST("/chat/cancel", aiCtrl.CancelChat) // 取消当前生成
			ai.GET("/sessions", aiCtrl.ListSessions)
			ai.POST("/sessions", aiCtrl.CreateSession)
			ai.GET("/sessions/:id", aiCtrl.GetSession)
			ai.PUT("/sessions/:id", aiCtrl.UpdateSession)
			ai.DELETE("/sessions/:id", aiCtrl.DeleteSession)
		}
	}
}
