# 外部 API：日历与每日目标

外部 API 服务在应用「设置 → API 服务」中开启。请求都需要携带设置页显示的令牌：

```http
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

本机默认地址为 `http://127.0.0.1:17878`，局域网设备请使用设置页列出的地址。以下示例用 `BASE_URL` 表示服务根地址。

## 按日期读取题目、复习和每日目标详情

```http
GET /api/v1/calendar/day?date=2026-10-20
```

`date` 必填，格式为 `YYYY-MM-DD`。接口会返回：

- `problems`：该本地自然日新建的题目（按 `problems.created_at` 归档）。每项的 `problem` 包含完整题面；`user_problem.code` 是当前答题代码，`user_problem.notes` 是核心笔记。
- `reviews`：该本地日期有复习打卡的题目。每项的 `check_in` 是当天最新的一条打卡记录，包含 `status`、`progress_status`、`comment`、`code` 和 `code_language`。
- `daily_goal`：当天存在每日目标时返回目标摘要及 `items`。每项目标详情包含 `item`（排序和完成状态）、完整 `problem`、当前 `user_problem`（答题代码和核心笔记）；当天有复习打卡时才附带最新的 `check_in`。当天没有目标时为 `null`。

响应统一使用 `{ "code": 0, "message": "success", "data": ... }`：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "date": "2026-10-20",
    "problems": [
      {
        "problem": {
          "id": "problem-id",
          "lc_id": "35",
          "title": "Search Insert Position",
          "content": "题目正文……",
          "translated_content": "题目中文正文……"
        },
        "user_problem": {
          "id": "user-problem-id",
          "problem_id": "problem-id",
          "code": "class Solution { ... }",
          "notes": "二分查找核心笔记……"
        }
      }
    ],
    "reviews": [
      {
        "problem": { "id": "problem-id", "title": "题目标题" },
        "user_problem": { "id": "user-problem-id", "code": "当前代码", "notes": "核心笔记" },
        "check_in": {
          "id": "review-id",
          "user_problem_id": "user-problem-id",
          "status": "Solved",
          "progress_status": "Reviewing",
          "comment": "本次复习总结",
          "code": "本次提交的代码",
          "code_language": "java",
          "created_at": "2026-10-20T08:30:00Z"
        }
      }
    ],
    "daily_goal": null
  }
}
```

没有当日新题或复习题时，`problems`、`reviews` 分别为空数组；题目尚无用户答题记录时 `user_problem` 不返回。`problem` 对象会包含题库中的完整字段（例如题面、示例、约束和代码模板），上例仅展示常用字段。

`check_in` 仅在该题当天确有复习记录时返回，且只包含最新一条打卡；没有当天复习记录的题目不会返回此字段。

有目标时，`daily_goal` 使用如下结构（题目和答题字段与上面的对象相同）：

```json
{
  "id": "goal-id",
  "goal_date": "2026-10-20",
  "title": "今日目标",
  "config": "{\"count\":1}",
  "total": 1,
  "completed": 0,
  "items": [
    {
      "item": { "problem_id": "problem-id", "completed": false },
      "problem": { "id": "problem-id", "content": "完整题目正文……" },
      "user_problem": { "id": "user-problem-id", "code": "当前答案代码", "notes": "核心笔记" }
    }
  ],
  "created_at": "2026-10-20 08:00:00",
  "updated_at": "2026-10-20 08:00:00"
}
```

调用示例：

```bash
curl --get "$BASE_URL/api/v1/calendar/day" \
  --data-urlencode "date=2026-10-20" \
  -H "Authorization: Bearer $API_TOKEN"
```

日期缺失或格式错误返回 HTTP 400；令牌缺失或错误返回 HTTP 401。

## 按题号生成每日目标

```http
POST /api/v1/daily-goals
```

`problem_numbers` 可传 LeetCode 题号或题目 slug。题库中没有的题目会尝试从 LeetCode 同步。`date` 可选，默认服务端本地今天；`title` 可选；`append` 为 `true` 时将题目追加到当天目标并去重，省略或设为 `false` 时替换当天已有目标。

请求示例：

```json
{
  "problem_numbers": ["35", "two-sum", "LC 14"],
  "date": "2026-10-20",
  "title": "今日目标",
  "append": false
}
```

响应 HTTP 201，`data` 为生成后的目标及题目摘要：

```bash
curl -X POST "$BASE_URL/api/v1/daily-goals" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"problem_numbers":["35","two-sum"],"date":"2026-10-20","append":false}'
```

## 查询每日目标

```http
GET /api/v1/daily-goals/today?date=2026-10-20
```

`date` 可选，默认服务端本地今天。该接口返回目标配置、完成数量和目标题目摘要。若要同时读取题目正文、用户代码、核心笔记和当天复习打卡，请使用上面的 `/api/v1/calendar/day`，从响应的 `daily_goal.items` 获取详情。
