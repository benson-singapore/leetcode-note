package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"leetcode-note-sidecar/routes"

	"github.com/gin-gonic/gin"
)

type swaggerDoc struct {
	Swagger             string                          `json:"swagger"`
	Info                map[string]interface{}          `json:"info"`
	BasePath            string                          `json:"basePath"`
	Tags                []map[string]string             `json:"tags"`
	Consumes            []string                        `json:"consumes,omitempty"`
	Produces            []string                        `json:"produces"`
	Paths               map[string]map[string]operation `json:"paths"`
	SecurityDefinitions map[string]securityDefinition   `json:"securityDefinitions"`
}

type operation struct {
	Tags        []string              `json:"tags"`
	Summary     string                `json:"summary"`
	OperationID string                `json:"operationId"`
	Consumes    []string              `json:"consumes,omitempty"`
	Parameters  []parameter           `json:"parameters,omitempty"`
	Responses   map[string]response   `json:"responses"`
	Security    []map[string][]string `json:"security,omitempty"`
}

type parameter struct {
	Name        string                 `json:"name"`
	In          string                 `json:"in"`
	Required    bool                   `json:"required"`
	Description string                 `json:"description,omitempty"`
	Type        string                 `json:"type,omitempty"`
	Schema      map[string]interface{} `json:"schema,omitempty"`
}

type response struct {
	Description string                 `json:"description"`
	Schema      map[string]interface{} `json:"schema,omitempty"`
}

type securityDefinition struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	In          string `json:"in"`
	Description string `json:"description"`
}

var pathParameter = regexp.MustCompile(`:([^/]+)`)

func main() {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	routes.RegisterRoutes(router, nil)

	doc := generate(router.Routes())
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		fatal(err)
	}
	data = append(data, '\n')
	if err := os.WriteFile("docs/swagger.json", data, 0644); err != nil {
		fatal(err)
	}
	fmt.Printf("Generated docs/swagger.json with %d API paths\n", len(doc.Paths))
}

func generate(routesList gin.RoutesInfo) swaggerDoc {
	doc := swaggerDoc{
		Swagger:  "2.0",
		Info:     map[string]interface{}{"title": "LeetCode Note API", "version": "1.0.0", "description": "LeetCode Note Go 服务 API。外部 API 服务默认关闭，开启后 API 请求需在 Authorization 请求头中携带 Bearer 令牌。"},
		BasePath: "/",
		Produces: []string{"application/json"},
		Paths:    map[string]map[string]operation{},
		SecurityDefinitions: map[string]securityDefinition{
			"BearerAuth": {Type: "apiKey", Name: "Authorization", In: "header", Description: "输入 Bearer 后接空格和设置页显示的 API 令牌，例如：Bearer eyJ..."},
		},
	}
	tagNames := map[string]bool{}
	for _, route := range routesList {
		if !strings.HasPrefix(route.Path, "/api/v1/") {
			continue
		}
		tag := strings.Split(strings.TrimPrefix(route.Path, "/api/v1/"), "/")[0]
		tagNames[tag] = true
		path := pathParameter.ReplaceAllString(route.Path, `{$1}`)
		method := strings.ToLower(route.Method)
		parameters := make([]parameter, 0)
		for _, match := range pathParameter.FindAllStringSubmatch(route.Path, -1) {
			parameters = append(parameters, parameter{Name: match[1], In: "path", Required: true, Type: "string"})
		}
		op := operation{
			Tags:        []string{tag},
			Summary:     humanizeHandler(route.Handler),
			OperationID: operationID(route.Method, route.Handler),
			Parameters:  parameters,
			Responses: map[string]response{
				"200": {Description: "Successful response", Schema: map[string]interface{}{"type": "object"}},
				"400": {Description: "Invalid request"},
				"401": {Description: "Missing or invalid Bearer API token"},
				"500": {Description: "Internal server error"},
			},
			Security: []map[string][]string{{"BearerAuth": {}}},
		}
		if route.Method == "POST" || route.Method == "PUT" || route.Method == "PATCH" {
			if strings.HasSuffix(route.Path, "/images/upload") {
				op.Consumes = []string{"multipart/form-data"}
				parameters = append(parameters, parameter{Name: "file", In: "formData", Required: true, Type: "file"})
				op.Parameters = parameters
			} else {
				op.Consumes = []string{"application/json"}
				op.Parameters = append(parameters, parameter{Name: "body", In: "body", Required: true, Schema: map[string]interface{}{"type": "object", "additionalProperties": true}})
			}
		}
		if doc.Paths[path] == nil {
			doc.Paths[path] = map[string]operation{}
		}
		doc.Paths[path][method] = op
	}
	for tag := range tagNames {
		doc.Tags = append(doc.Tags, map[string]string{"name": tag})
	}
	sort.Slice(doc.Tags, func(i, j int) bool { return doc.Tags[i]["name"] < doc.Tags[j]["name"] })
	return doc
}

func operationID(_ string, handler string) string {
	handler = strings.TrimSuffix(handler, "-fm")
	parts := strings.Split(handler, ".")
	method := parts[len(parts)-1]
	receiver := ""
	if len(parts) > 1 {
		receiver = strings.Trim(parts[len(parts)-2], "()*")
	}
	var builder strings.Builder
	for _, r := range method + receiver {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			builder.WriteRune(r)
		}
	}
	id := builder.String()
	if id == "" {
		return "operation"
	}
	runes := []rune(id)
	runes[0] = unicode.ToLower(runes[0])
	return string(runes)
}

func humanizeHandler(handler string) string {
	handler = strings.TrimSuffix(handler, "-fm")
	if index := strings.LastIndex(handler, "."); index >= 0 {
		handler = handler[index+1:]
	}
	var words []string
	for i, r := range handler {
		if i > 0 && unicode.IsUpper(r) {
			words = append(words, " ")
		}
		words = append(words, string(unicode.ToLower(r)))
	}
	return strings.ToUpper(string([]rune(strings.Join(words, ""))[0:1])) + strings.Join(words, "")[1:]
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
