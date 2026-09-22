package service

import (
	"encoding/json"
	"fmt"
	"log"
)

// GraphQLData 是 GraphQL 返回的完整数据结构
type GraphQLData struct {
	LanguageList []Language   `json:"languageList"`
	StatusList   []Status     `json:"statusList"`
	Question     *ProblemData `json:"question"`
}

type Language struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	VerboseName string `json:"verboseName"`
}

type Status struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// ParseGraphQLResponse 解析 GraphQL 响应数据
func ParseGraphQLResponse(data json.RawMessage) (*ProblemData, error) {
	log.Printf("[Parser] 开始解析 GraphQL 响应\n")

	var graphqlData GraphQLData
	if err := json.Unmarshal(data, &graphqlData); err != nil {
		log.Printf("[Parser] 解析失败: %v\n", err)
		return nil, err
	}

	if graphqlData.Question == nil {
		log.Printf("[Parser] 错误: question 字段为空\n")
		return nil, fmt.Errorf("question 字段为空")
	}

	log.Printf("[Parser] 成功解析题目: %s (ID: %s)\n", graphqlData.Question.Title, graphqlData.Question.QuestionID)

	return graphqlData.Question, nil
}
