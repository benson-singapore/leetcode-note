import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  History,
  Menu,
  NotebookPen,
  Puzzle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";

const LanguageContext = createContext({ language: "zh", setLanguage: () => {} });
const englishCopy = {
  "首页": "Home", "功能介绍": "Features", "应用预览": "App Preview", "版本与下载": "Download", "更新日志": "Changelog",
  "获取应用": "Get the App", "关闭导航": "Close navigation", "打开导航": "Open navigation", "主导航": "Main navigation",
  "按你的学习节奏，逐项了解": "Explore at your own pace", "查看全部功能": "View all features",
  "写下思路，记住方法，然后继续向前。": "Capture the idea. Keep the method. Move forward.", "为每一次认真练习": "For every thoughtful practice session",
  "版权所有": "Copyright", "（欢迎创意引用）": "(Creative references welcome)", "把刷题过程，变成自己的知识": "Turn practice into lasting knowledge",
  "让每一次练习": "Make every practice session", "都 ": "", "留下来。": "count.",
  "少一点重复整理，多一点真正理解。": "Spend less time organizing and more time understanding.", "了解版本与下载": "Explore the release", "探索功能": "Explore features",
  "数据本地保存": "Your data stays local", "题目和笔记一起管理": "Problems and notes, together", "AI 能力按需配置": "Configure AI your way",
  "练习进度": "Practice progress", "在自己的节奏中持续积累": "Build momentum at your own pace", "解题笔记": "Solution notes", "每道题都有自己的上下文": "Context for every problem",
  "从一道题开始，": "Start with one problem,", "让思考继续发生。": "and keep the thinking going.", "做题、记录、复习各自有空间，也自然地衔接起来。": "Practice, notes, and review each have their place—and work naturally together.",
  "带回练习记录": "Bring in your progress", "连接账号并整理已解决题目": "Connect your account and import solved problems", "留下自己的解法": "Keep your own solutions", "标注难度、写下思路和代码": "Rate difficulty and save ideas and code",
  "回来重新练习": "Practice again", "抽取旧题，记下每轮掌握情况": "Draw past problems and track each review", "看见长期积累": "See your progress over time", "沿着日历回顾每日练习轨迹": "Review daily practice on the calendar",
  "把算法的每一步，": "Make every step of an algorithm", "变得看得见。": "visible.", "基于题目与实际代码生成": "Generated from the problem and your code", "编辑并预览交互式 HTML": "Edit and preview interactive HTML", "与解题方案一起保存": "Saved with your solution",
  "了解 AI 代码演示": "Explore AI walkthroughs", "从你现在需要的功能开始。": "Start with what you need today.", "全部 8 项功能": "All 8 features", "下一次练习，": "Your next practice session,", "从一题开始。": "starts with one problem.",
  "看看 LeetCode 笔记如何陪你记录、理解和复习。": "See how LeetCode Notes helps you capture, understand, and review.", "查看真实应用截图": "View app screenshots", "了解功能详情": "Explore feature",
  "围绕每一次练习，": "Built around every practice session,", "把需要的能力放在一起。": "with the tools you need.", "八项功能，各自清晰。选择一个你最关心的环节，了解它如何融入完整的刷题流程。": "Eight focused features. Choose what matters most and see how it fits into your practice workflow.",
  "每一项功能，都服务于下一次更从容的练习。": "Every feature helps make your next session more confident.", "先看看应用截图": "Take a look inside", "让练习之后，": "After each practice session,", "还有下一步。": "there is a next step.",
  "浏览全部功能": "Browse all features", "上一项": "Previous", "下一项": "Next", "全部功能": "All features", "一个地方，": "One place to", "看见完整的学习过程。": "see your whole learning journey.",
  "从个人题库、AI 代码演示到复习热力图，逐张浏览 LeetCode 笔记的真实界面。": "Browse real LeetCode Notes screens, from your problem library and AI walkthroughs to the review calendar.", "全部为当前应用实际截图": "All screenshots are from the current app", "按功能了解产品": "Explore features",
  "一点点完善，": "Refined one step at a time,", "让练习越来越顺手。": "so practice feels more natural.", "查看当前预览版已经包含的功能，以及近期学习流程的改进。": "See what is included in the current preview and what has improved recently.",
  "当前版本": "Current version", "版本记录为官网预览内容，正式发布后会持续更新。": "These release notes are a website preview and will be updated with each release.",
  "官网预览页面暂未配置安装包下载地址。正式发布后会在这里提供对应平台的版本。 ": "Download packages are not available yet. Platform builds will appear here when released.", "为下一次练习，": "Get your study space ready", "准备好你的学习桌面。": "for your next session.",
  "LeetCode 笔记当前处于预览阶段。了解版本状态、支持平台和本地开发方式。": "LeetCode Notes is currently in preview. Check the release status, supported platforms, and how to run it locally.", "桌面学习助手 · 预览版": "Desktop study companion · Preview", "预览": "Preview", "桌面框架": "Desktop framework", "数据存储": "Data storage", "本地 SQLite": "Local SQLite",
  "现在就从源码开始。": "Run it from source.", "准备 Node.js、Go 和 Rust 工具链，在项目根目录启动桌面预览。": "Set up Node.js, Go, and Rust, then launch the desktop preview from the project root.", "安装包发布准备中；目前可以从源码运行桌面应用，具体步骤见下方开发指南。 ": "Installers are in preparation. You can run the desktop app from source using the guide below.",
  "获取预览版": "Get the preview", "阅读更新日志": "Read the changelog", "先了解产品功能": "Explore product features", "Tauri 项目支持按目标平台构建；正式安装包和下载渠道将在发布后补充。": "Tauri can build for supported target platforms. Installers and download links will be added at release.", "这一页暂时找不到。": "This page could not be found.", "返回首页": "Back to home",
};

function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  const t = (text) => (language === "en" ? englishCopy[text] ?? text : text);
  return { language, setLanguage, t };
}

function getFeature(feature, language) {
  if (language !== "en") return feature;
  const copy = featureEnglish[feature.id];
  return {
    ...feature,
    ...copy,
    metrics: feature.metrics.map((metric, index) => ({
      ...metric,
      value: copy.metricValues?.[index] ?? metric.value,
      label: copy.metrics[index],
    })),
    shotCaptions: copy.shotCaptions,
  };
}

import appLogo from "../../public/logo.png";
import dashboard from "../../docs/image/iShot_2026-09-30_15.54.00.png";
import calendar from "../../docs/image/iShot_2026-09-30_15.55.57.png";
import problems from "../../docs/image/iShot_2026-09-30_15.54.09.png";
import notes from "../../docs/image/iShot_2026-09-30_15.54.48.png";
import code from "../../docs/image/iShot_2026-09-30_15.54.53.png";
import ai from "../../docs/image/iShot_2026-09-30_15.55.00.png";
import aiDemo from "../../docs/image/iShot_2026-09-30_15.55.17.png";
import review from "../../docs/image/iShot_2026-09-30_15.55.40.png";
import settings from "../../docs/image/iShot_2026-09-30_15.56.13.png";
import aiSettings from "../../docs/image/iShot_2026-09-30_15.56.18.png";
import syncSettings from "../../docs/image/iShot_2026-09-30_15.56.24.png";
import plugin from "../../docs/image/iShot_2026-09-30_15.56.31.png";
import leetcodeSettings from "../../docs/image/iShot_2026-09-30_15.56.36.png";
import reviewQueue from "../../docs/image/iShot_2026-09-30_15.55.07.png";
import reviewList from "../../docs/image/iShot_2026-09-30_15.55.49.png";
import detail from "../../docs/image/iShot_2026-09-30_15.54.24.png";

const screenshots = [
  {
    src: dashboard,
    title: "今天的学习进度",
    caption: "数据看板 · 刷题概览与每日活动",
    tag: "OVERVIEW",
  },
  {
    src: problems,
    title: "把练过的题目整理好",
    caption: "个人题库 · 按难度、标签和状态筛选",
    tag: "PROBLEM LIBRARY",
  },
  {
    src: detail,
    title: "一题一页，完整记录",
    caption: "题目详情 · 内容、个人状态与解题方案",
    tag: "PROBLEM DETAIL",
  },
  {
    src: notes,
    title: "把思路和踩坑写下来",
    caption: "题目笔记 · Markdown 与代码记录",
    tag: "NOTES",
  },
  {
    src: code,
    title: "回到代码，重新理解",
    caption: "方案阅读 · 浏览保存的解法",
    tag: "CODE",
  },
  {
    src: ai,
    title: "让 AI 陪你一起拆解",
    caption: "AI 助手 · 流式对话与学习记录",
    tag: "AI ASSISTANT",
  },
  {
    src: aiDemo,
    title: "逐步看见算法如何运行",
    caption: "交互演示 · AI 根据题目和代码生成 HTML",
    tag: "AI VISUALIZATION",
  },
  {
    src: review,
    title: "现在就开始一轮复习",
    caption: "随机抽题 · 回顾需要再次练习的题目",
    tag: "REVIEW",
  },
  {
    src: reviewQueue,
    title: "查看你的复习节奏",
    caption: "复习安排 · 按掌握情况继续练习",
    tag: "REVIEW PLAN",
  },
  {
    src: reviewList,
    title: "从题库筛出复习目标",
    caption: "状态筛选 · 找到还不熟悉的题目",
    tag: "PRACTICE",
  },
  {
    src: calendar,
    title: "把坚持变成可见的轨迹",
    caption: "学习日历 · 每日刷题与复习记录",
    tag: "ACTIVITY",
  },
  {
    src: settings,
    title: "常用偏好，一处管理",
    caption: "应用设置 · 为自己的练习习惯配置",
    tag: "PREFERENCES",
  },
  {
    src: aiSettings,
    title: "连接合适的 AI 模型",
    caption: "AI 配置 · API 与本机命令行 Provider",
    tag: "AI SETTINGS",
  },
  {
    src: syncSettings,
    title: "选择账号与同步方式",
    caption: "账号设置 · 管理 LeetCode 连接",
    tag: "SYNC",
  },
  {
    src: plugin,
    title: "在 LeetCode 页面直接记录",
    caption: "Tampermonkey · 同步笔记和训练打卡",
    tag: "BROWSER PLUGIN",
  },
  {
    src: leetcodeSettings,
    title: "连接你的 LeetCode 账号",
    caption: "账号绑定 · 查看统计并导入已解题目",
    tag: "ACCOUNT",
  },
];

const features = [
  {
    id: "account",
    path: "/features/account",
    label: "账号同步",
    icon: RefreshCw,
    number: "01",
    tone: "green",
    eyebrow: "YOUR PROGRESS, IN ONE PLACE",
    title: "练习过的题，\n自动整理进你的题库。",
    summary:
      "连接力扣中国站或 LeetCode 国际站。查看个人资料和刷题统计，再把已解决题目导入本地题库，建立完整的练习起点。",
    card: "连接账号后查看个人资料与刷题统计，并可一键导入已解决题目。",
    points: [
      "支持 leetcode.cn 与 leetcode.com",
      "查看已解决、未完成和失败统计",
      "分批导入已解决题目，实时显示进度",
    ],
    metrics: [
      { value: "2", label: "LeetCode 站点" },
      { value: "1 次", label: "启动题库导入" },
      { value: "本机", label: "保存练习档案" },
    ],
    shots: [leetcodeSettings, dashboard],
    shotCaptions: ["账号连接设置", "刷题数据看板"],
    outcome: "把散落在平台里的练习记录，变成可以继续整理和复习的题库。",
  },
  {
    id: "notes",
    path: "/features/notes",
    label: "题库与笔记",
    icon: NotebookPen,
    number: "02",
    tone: "blue",
    eyebrow: "MAKE EVERY SOLUTION YOURS",
    title: "每道题都有记录，\n每次思考都有回响。",
    summary:
      "不仅记下是否通过，也记录个人难度、掌握情况、代码、不同解法和 Markdown 笔记。下一次打开题目，就能接着上次的思路往下走。",
    card: "用个人评分、掌握状态、标签、代码方案和 Markdown 笔记积累解题经验。",
    points: [
      "为题目设置个人难度与掌握状态",
      "使用标签、筛选和搜索管理题库",
      "保存解题代码、Markdown 笔记与多个方案",
    ],
    metrics: [
      { value: "1–5", label: "个人难度评分" },
      { value: "Markdown", label: "笔记格式" },
      { value: "多方案", label: "代码归档" },
    ],
    shots: [problems, notes],
    shotCaptions: ["可筛选的个人题库", "题解笔记与代码"],
    outcome:
      "把一次做题留下的判断和经验，整理成以后能检索、能复习的个人知识库。",
  },
  {
    id: "review",
    path: "/features/review",
    label: "随机复习",
    icon: History,
    number: "03",
    tone: "amber",
    eyebrow: "PRACTICE UNTIL IT STICKS",
    title: "把做过的题，\n变成真正会做的题。",
    summary:
      "从自己的题库里抽取题目，再次尝试、回看笔记并记录本轮掌握程度。让复习回到熟悉的解题场景，而不是只翻看一个通过状态。",
    card: "从题库随机抽题，保存每一轮练习的掌握情况、代码和训练记录。",
    points: [
      "从已记录题目中随机抽取复习目标",
      "按批次安排练习数量",
      "每轮保存掌握状态、代码和训练笔记",
    ],
    metrics: [
      { value: "3 / 5 / 8 / 10", label: "每轮题目数" },
      { value: "逐轮", label: "保存复习记录" },
      { value: "随时", label: "再次练习" },
    ],
    shots: [review, reviewQueue],
    shotCaptions: ["随机复习入口", "查看复习安排"],
    outcome: "从“曾经做对”走向“现在还能独立做出来”，让复习记录有实际意义。",
  },
  {
    id: "ai",
    path: "/features/ai",
    label: "AI 学习助手",
    icon: BrainCircuit,
    number: "04",
    tone: "violet",
    eyebrow: "A THOUGHTFUL STUDY PARTNER",
    title: "卡住的时候，\n多一个拆解问题的角度。",
    summary:
      "在应用中连接常用 AI 服务或本机工具，用对话梳理复杂逻辑、追问边界情况、整理笔记。会话按题目和模型留存，之后还能接着回顾。",
    card: "配置 API 或本机 AI 工具，通过流式问答理解代码并整理学习思路。",
    points: [
      "支持 OpenAI 兼容接口和 Anthropic API",
      "可接入 Codex、Claude 等本地 CLI",
      "流式回复并保留会话记录",
    ],
    metrics: [
      { value: "API", label: "OpenAI 兼容 / Anthropic" },
      { value: "CLI", label: "本机命令行工具" },
      { value: "SSE", label: "流式回复" },
    ],
    shots: [aiSettings, ai],
    shotCaptions: ["Provider 与模型配置", "AI 学习对话"],
    outcome:
      "按自己的模型和工作方式配置助手，把提问与复盘放在题目学习的上下文里。",
  },
  {
    id: "visualization",
    path: "/features/visualization",
    label: "AI 代码演示",
    icon: Sparkles,
    number: "05",
    tone: "violet",
    eyebrow: "SEE THE ALGORITHM MOVE",
    title: "让代码一步步运行，\n让抽象过程看得见。",
    summary:
      "选择一道题和一个代码方案，让 AI 基于题目与实现生成可交互的 HTML 算法演示。编辑、预览和保存后，可在题目学习流程中再次打开。",
    card: "基于题目内容和代码生成逐步执行演示，可编辑、预览并保存。",
    points: [
      "根据题目、示例和代码构建演示提示",
      "AI 流式生成单文件 HTML 页面",
      "编辑后预览并保存到对应的解题方案",
    ],
    metrics: [
      { value: "代码", label: "演示输入" },
      { value: "逐步", label: "查看执行过程" },
      { value: "HTML", label: "可编辑演示" },
    ],
    shots: [aiDemo, code],
    shotCaptions: ["交互式算法页面", "对应的代码方案"],
    outcome: "把数据结构变化和代码执行顺序放到同一页面，方便对照着理解。",
  },
  {
    id: "browser",
    path: "/features/browser",
    label: "内置浏览器",
    icon: BookOpenCheck,
    number: "06",
    tone: "cyan",
    eyebrow: "STAY IN YOUR STUDY FLOW",
    title: "不用离开应用，\n直接打开 LeetCode 练习。",
    summary:
      "从题库进入 LeetCode 页面，在内置浏览器里打开题目并使用应用提供的笔记和训练打卡入口。浏览题目和回顾记录，不必在多个窗口之间来回寻找。",
    card: "在应用内打开 LeetCode，使用集成的笔记和训练打卡入口。",
    points: [
      "从本地题库直接打开对应 LeetCode 题目",
      "支持内置窗口或系统默认浏览器",
      "内置浏览器可注入笔记与打卡功能",
    ],
    metrics: [
      { value: "应用内", label: "打开题目页面" },
      { value: "共享", label: "登录状态" },
      { value: "同步", label: "本地记录" },
    ],
    shots: [syncSettings, reviewList],
    shotCaptions: ["浏览器行为设置", "从题库继续练习"],
    outcome: "把打开题目、练习和留下记录连在一处，减少切换带来的中断。",
  },
  {
    id: "tampermonkey",
    path: "/features/tampermonkey",
    label: "Tampermonkey 插件",
    icon: Puzzle,
    number: "07",
    tone: "rose",
    eyebrow: "NOTES WHERE YOU SOLVE",
    title: "就在 LeetCode 页面，\n顺手完成记录。",
    summary:
      "使用应用生成的 Tampermonkey 脚本，在外部浏览器的题目页面打开笔记抽屉，保存代码、笔记和掌握程度，并把训练打卡写回本地题库。",
    card: "在 leetcode.cn 或 leetcode.com 页面记录题解，并同步至本地应用。",
    points: [
      "从设置中复制已匹配站点和本机地址的脚本",
      "在题目页面记录代码、笔记与状态",
      "将训练打卡和复习数据保存到应用数据库",
    ],
    metrics: [
      { value: "2 站", label: "国内站 / 国际站" },
      { value: "本机 API", label: "数据传输目标" },
      { value: "免切页", label: "网页侧记录" },
    ],
    shots: [plugin, notes],
    shotCaptions: ["插件安装与配置", "同步到应用的笔记"],
    outcome: "仍然在熟悉的网页刷题，同时让练习记录进入同一个个人题库。",
  },
  {
    id: "calendar",
    path: "/features/calendar",
    label: "学习日历",
    icon: CalendarDays,
    number: "08",
    tone: "green",
    eyebrow: "A RECORD OF SHOWING UP",
    title: "每一次练习，\n都会留下时间的坐标。",
    summary:
      "用热力图回顾每天新增题目和复习活动，点选日期查看当日记录。设置每日学习与复习目标，让长期投入不再只是模糊的感觉。",
    card: "用热力图查看学习历史，按日回顾新增题目与复习内容。",
    points: [
      "汇总每日练习和复习活动",
      "点击日期查看当天对应题目",
      "设置每日学习与复习目标",
    ],
    metrics: [
      { value: "365 天", label: "年度学习视图" },
      { value: "按日", label: "回顾题目记录" },
      { value: "目标", label: "学习与复习" },
    ],
    shots: [calendar, dashboard],
    shotCaptions: ["年度学习热力图", "汇总今日学习"],
    outcome: "回看自己如何逐日积累，也更容易决定接下来要复习什么。",
  },
];

const updates = [
  {
    date: "2026.09",
    version: "v0.1.0",
    title: "LeetCode 笔记预览版",
    items: [
      "账号绑定、刷题统计与已解决题目导入",
      "个人题库、解题笔记和重复复习记录",
      "AI 学习助手与交互式代码演示",
      "学习热力图、内置浏览器与 Tampermonkey 同步",
    ],
  },
  {
    date: "2026.09",
    version: "v0.0.9",
    title: "学习流程完善",
    items: [
      "增加插件侧训练打卡",
      "加入按日学习与复习历史",
      "完善题库筛选与题目详情",
    ],
  },
];

const featureEnglish = {
  account: {
    label: "Account sync", title: "Your solved problems,\norganized automatically.",
    summary: "Connect to LeetCode CN or the global site. View your profile and stats, then import solved problems into your local library to get started.",
    card: "Connect your account to view stats and import solved problems in one step.",
    points: ["Supports leetcode.cn and leetcode.com", "View solved, attempted, and failed counts", "Import solved problems in batches with live progress"],
    metricValues: ["2", "1 click", "Local"], metrics: ["LeetCode sites", "Start an import", "Practice archive"], shotCaptions: ["Account connection", "Practice dashboard"],
    outcome: "Turn practice scattered across platforms into a library you can organize and review.",
  },
  notes: {
    label: "Problem library & notes", title: "Every problem has a record.\nEvery idea has a place.",
    summary: "Track more than whether you passed: record your own difficulty rating, confidence, code, alternate solutions, and Markdown notes. Pick up where you left off next time.",
    card: "Build experience with personal ratings, status, tags, code, and Markdown notes.",
    points: ["Set a personal difficulty and confidence level", "Organize with tags, filters, and search", "Save code, Markdown notes, and multiple approaches"],
    metricValues: ["1–5", "Markdown", "Multiple"], metrics: ["Personal difficulty", "Note format", "Code archive"], shotCaptions: ["Filterable problem library", "Notes and code solutions"],
    outcome: "Turn each attempt into a personal knowledge base you can search and revisit.",
  },
  review: {
    label: "Random review", title: "Turn solved problems\ninto skills that stick.",
    summary: "Draw problems from your library, try them again, revisit your notes, and record how confident you feel. Review in the context of solving, not just by looking at a pass status.",
    card: "Pick random problems and save confidence, code, and training history for every round.",
    points: ["Draw review problems from your library", "Choose how many problems to practice", "Save confidence, code, and notes for each round"],
    metricValues: ["3 / 5 / 8 / 10", "Per round", "Anytime"], metrics: ["Problems per round", "Review history", "Practice again"], shotCaptions: ["Random review", "Review schedule"],
    outcome: "Move from “solved it once” to “can solve it again on my own.”",
  },
  ai: {
    label: "AI study assistant", title: "When you get stuck,\nfind another way through.",
    summary: "Connect popular AI services or local tools to unpack complex logic, ask about edge cases, and refine notes. Conversations are saved by problem and model, ready to revisit later.",
    card: "Configure an API or local AI tool to understand code and organize your thinking.",
    points: ["Supports OpenAI-compatible APIs and Anthropic", "Connect local CLIs such as Codex and Claude", "Stream responses and keep conversation history"],
    metricValues: ["API", "CLI", "SSE"], metrics: ["Compatible APIs", "Local command-line tools", "Streaming responses"], shotCaptions: ["Provider and model settings", "AI study chat"],
    outcome: "Choose the models and workflow that suit you, with every question grounded in the problem you are studying.",
  },
  visualization: {
    label: "AI code walkthroughs", title: "Watch code run step by step.\nMake abstract ideas visible.",
    summary: "Choose a problem and solution, then ask AI to create an interactive HTML walkthrough based on the prompt and implementation. Edit, preview, save, and reopen it while studying.",
    card: "Generate step-by-step walkthroughs from a problem and code; edit, preview, and save them.",
    points: ["Build prompts from problem statements, examples, and code", "Generate a standalone HTML page with streaming output", "Edit, preview, and save it with your solution"],
    metricValues: ["Code", "Step by step", "HTML"], metrics: ["Code input", "Execution steps", "Editable demo"], shotCaptions: ["Interactive algorithm page", "Related code solution"],
    outcome: "See data structure changes alongside execution order to understand how the code works.",
  },
  browser: {
    label: "Built-in browser", title: "Stay in the app.\nPractice on LeetCode directly.",
    summary: "Open LeetCode from your problem library in the built-in browser and use the app's notes and training check-in tools alongside the problem. Keep practice and history close without juggling windows.",
    card: "Open LeetCode in the app with integrated notes and training check-ins.",
    points: ["Open the matching LeetCode problem from your library", "Use the built-in window or your system browser", "Access notes and check-ins in the built-in browser"],
    metricValues: ["In app", "Shared", "Synced"], metrics: ["In-app problem pages", "Shared sign-in", "Synced records"], shotCaptions: ["Browser preferences", "Continue from your library"],
    outcome: "Keep opening, solving, and recording problems together to stay focused.",
  },
  tampermonkey: {
    label: "Tampermonkey plugin", title: "Capture your notes\nright on LeetCode.",
    summary: "Use the Tampermonkey script generated by the app to open a notes panel on LeetCode. Save code, notes, and confidence, then sync training check-ins to your local library.",
    card: "Record solutions on leetcode.cn or leetcode.com and sync them to the app.",
    points: ["Copy a script configured for your site and local address", "Save code, notes, and status on the problem page", "Write check-ins and review data to the app database"],
    metricValues: ["2 sites", "Local API", "In-page"], metrics: ["CN and global sites", "Local API target", "Record in-page"], shotCaptions: ["Plugin installation", "Notes synced to the app"],
    outcome: "Keep solving problems in the browser you know while bringing every record into one library.",
  },
  calendar: {
    label: "Study calendar", title: "Every practice session\nmarks your journey.",
    summary: "Review daily additions and practice activity in a heatmap, then select a date to see its records. Set daily goals for new problems and review so long-term effort becomes visible.",
    card: "Explore your study history in a heatmap and revisit problems by day.",
    points: ["Summarize daily practice and review", "Select a date to see its problems", "Set daily study and review goals"],
    metricValues: ["365 days", "Daily", "Goals"], metrics: ["Year at a glance", "Daily history", "Study and review goals"], shotCaptions: ["Annual study heatmap", "Today's learning summary"],
    outcome: "Look back on your daily progress and decide what to review next.",
  },
};

const screenshotEnglish = [
  ["Today's learning progress", "Dashboard · Practice overview and daily activity"],
  ["Organize the problems you have solved", "Problem library · Filter by difficulty, tags, and status"],
  ["A complete record for every problem", "Problem detail · Prompt, personal status, and solutions"],
  ["Capture your ideas and gotchas", "Problem notes · Markdown and code"],
  ["Return to the code and understand it again", "Solution viewer · Browse saved approaches"],
  ["Break it down with AI", "AI assistant · Streaming chat and study history"],
  ["Watch the algorithm run step by step", "Interactive demo · AI-generated HTML from your code"],
  ["Start a review session", "Random review · Revisit problems that need another try"],
  ["See your review rhythm", "Review plan · Practice based on your confidence"],
  ["Find your next review in the library", "Status filters · Find problems you are still learning"],
  ["Make your consistency visible", "Study calendar · Daily practice and review history"],
  ["Manage your preferences in one place", "App settings · Configure your study workflow"],
  ["Connect the right AI model", "AI settings · API and local command-line providers"],
  ["Choose your account and sync method", "Account settings · Manage your LeetCode connection"],
  ["Take notes right on LeetCode", "Tampermonkey · Sync notes and practice check-ins"],
  ["Connect your LeetCode account", "Account sync · View stats and import solved problems"],
];

const updateEnglish = [
  { title: "LeetCode Notes Preview", items: ["Account connection, practice stats, and solved problem import", "Personal library, solution notes, and repeat review history", "AI study assistant and interactive code walkthroughs", "Study heatmap, built-in browser, and Tampermonkey sync"] },
  { title: "A smoother study workflow", items: ["Added plugin-based training check-ins", "Added daily study and review history", "Improved library filters and problem details"] },
];

function PageReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const timeout = window.setTimeout(() => {
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (!target) return;
        const top = target.getBoundingClientRect().top + window.scrollY - 92;
        window.scrollTo({ top, behavior: "smooth" });
      }, 40);
      return () => window.clearTimeout(timeout);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash]);
  return null;
}

const pageSeo = {
  "/": {
    zh: {
      title: "LeetCode 笔记｜LeetCode 刷题记录、题解笔记与复习工具",
      description: "LeetCode 笔记是一款本地优先的 LeetCode 刷题学习助手：同步已解题目、整理题解与笔记、随机复习，并用 AI 代码演示和学习热力图持续积累算法能力。",
      keywords: "LeetCode 刷题工具, 力扣刷题记录, 算法题库, 刷题笔记, 算法复习工具, AI 代码演示, LeetCode 数据同步",
    },
    en: {
      title: "LeetCode Notes | Problem Tracker, Coding Notes & Review",
      description: "A local-first LeetCode study app to sync solved problems, keep solution notes, review with random practice, explore AI code walkthroughs, and track your learning calendar.",
      keywords: "LeetCode study app, LeetCode problem tracker, coding practice notes, algorithm review, spaced repetition, AI code walkthrough, study heatmap",
    },
  },
  "/features": {
    zh: { title: "功能介绍｜LeetCode 笔记", description: "了解 LeetCode 笔记的账号同步、个人题库、Markdown 题解、随机复习、AI 学习助手、代码演示、内置浏览器、Tampermonkey 插件和学习日历。", keywords: "LeetCode 功能, 刷题数据同步, 算法题库管理, 随机复习, AI 算法演示, LeetCode 插件, 刷题热力图" },
    en: { title: "Features | LeetCode Notes", description: "Explore LeetCode account sync, a personal problem library, Markdown notes, random review, AI assistance, code walkthroughs, a built-in browser, Tampermonkey sync, and a study calendar.", keywords: "LeetCode features, problem sync, coding notes, random review, AI algorithm visualization, Tampermonkey, coding study calendar" },
  },
  "/screenshots": {
    zh: { title: "应用截图｜LeetCode 笔记", description: "浏览 LeetCode 笔记桌面应用的真实界面，查看题库管理、解题笔记、AI 演示、随机复习、学习日历与账号同步。", keywords: "LeetCode 笔记截图, 刷题软件界面, 算法学习应用, LeetCode 题库管理" },
    en: { title: "App Screenshots | LeetCode Notes", description: "See the LeetCode Notes desktop app, including the problem library, solution notes, AI walkthroughs, random review, study calendar, and account sync.", keywords: "LeetCode Notes screenshots, coding practice app, algorithm study app, LeetCode problem library" },
  },
  "/updates": {
    zh: { title: "更新日志｜LeetCode 笔记", description: "查看 LeetCode 笔记预览版功能和学习流程更新，包括题目同步、复习记录、AI 演示和学习日历。", keywords: "LeetCode 笔记更新, 刷题工具版本, 算法学习应用更新" },
    en: { title: "Changelog | LeetCode Notes", description: "Read updates to the LeetCode Notes preview, including problem sync, review history, AI walkthroughs, and the study calendar.", keywords: "LeetCode Notes changelog, coding practice app updates, algorithm study software" },
  },
  "/download": {
    zh: { title: "版本与下载｜LeetCode 笔记", description: "了解 LeetCode 笔记桌面应用预览版本、Tauri 2 桌面框架、本地 SQLite 数据存储和开发运行方式。", keywords: "LeetCode 笔记下载, LeetCode 桌面应用, Tauri 刷题软件, 本地算法题库" },
    en: { title: "Download | LeetCode Notes", description: "Learn about the LeetCode Notes desktop preview, its Tauri 2 framework, local SQLite storage, and how to run it from source.", keywords: "LeetCode Notes download, LeetCode desktop app, Tauri coding practice, local problem library" },
  },
};

function SeoMetadata() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  useEffect(() => {
    const feature = features.find((item) => item.path === pathname);
    const localizedFeature = feature && getFeature(feature, language);
    const meta = feature
      ? {
          title: `${localizedFeature.label} | ${language === "en" ? "LeetCode Notes" : "LeetCode 笔记"}`,
          description: localizedFeature.summary,
          keywords: language === "en"
            ? `${localizedFeature.label}, LeetCode, coding practice, algorithm study, ${localizedFeature.points.join(", ")}`
            : `${localizedFeature.label}, LeetCode 刷题, 算法学习, ${localizedFeature.points.join("，")}`,
        }
      : pageSeo[pathname]?.[language] ?? pageSeo["/"][language];

    document.title = meta.title;
    const setMeta = (selector, attribute, key, content) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };
    setMeta('meta[name="description"]', "name", "description", meta.description);
    setMeta('meta[name="keywords"]', "name", "keywords", meta.keywords);
    setMeta('meta[property="og:title"]', "property", "og:title", meta.title);
    setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
    setMeta('meta[property="og:locale"]', "property", "og:locale", language === "en" ? "en_US" : "zh_CN");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);

    const schema = document.getElementById("site-schema");
    if (schema) {
      schema.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: language === "en" ? "LeetCode Notes" : "LeetCode 笔记",
        alternateName: language === "en" ? ["LeetCode 笔记", "LeetCode Study Notes"] : ["LeetCode Notes", "LeetCode 刷题笔记"],
        description: meta.description,
        inLanguage: language === "en" ? "en" : "zh-CN",
      });
    }
  }, [pathname, language]);
  return null;
}

function Brand({ footer = false }) {
  const { language } = useLanguage();
  return (
    <Link
      className={`brand${footer ? " brand-footer" : ""}`}
      to="/"
      aria-label={language === "en" ? "LeetCode Notes home" : "LeetCode 笔记首页"}
    >
      <img className="brand-mark" src={appLogo} alt="" />
      <span>
        LeetCode <b>{language === "en" ? "Notes" : "笔记"}</b>
      </span>
    </Link>
  );
}

function Header() {
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setFeatureMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setFeatureMenuOpen(false);
    };
    const closeEscape = (event) =>
      event.key === "Escape" && setFeatureMenuOpen(false);
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <button
          className="menu-toggle"
          type="button"
          aria-label={mobileMenuOpen ? t("关闭导航") : t("打开导航")}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav
          className={`main-nav${mobileMenuOpen ? " nav-open" : ""}`}
          aria-label={t("主导航")}
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "nav-active" : "")}
          >
            {t("首页")}
          </NavLink>
          <div className="feature-nav" ref={menuRef}>
            <button
              className={`feature-nav-trigger${location.pathname.startsWith("/features") ? " nav-active" : ""}`}
              type="button"
              aria-expanded={featureMenuOpen}
              onClick={() => setFeatureMenuOpen((open) => !open)}
            >
              {t("功能介绍")}{" "}
              <ChevronDown
                size={14}
                className={featureMenuOpen ? "chevron-open" : ""}
              />
            </button>
            {featureMenuOpen && (
              <div className="feature-menu">
                <div className="feature-menu-heading">
                  <span>EXPLORE FEATURES</span>
                  <b>{t("按你的学习节奏，逐项了解")}</b>
                </div>
                <div className="feature-menu-grid">
                  {features.map(
                    ({ id, icon: Icon, number, tone, ...feature }) => (
                      <Link
                        className={`feature-menu-item tone-${tone}`}
                        to={`/features#feature-${id}`}
                        key={id}
                        onClick={() => setFeatureMenuOpen(false)}
                      >
                        <span className="feature-menu-icon">
                          <Icon size={16} />
                        </span>
                        <span>
                          <small>FEATURE {number}</small>
                          <b>{getFeature({ id, ...feature }, language).label}</b>
                        </span>
                        <ArrowUpRight size={14} className="menu-item-arrow" />
                      </Link>
                    ),
                  )}
                </div>
                <Link
                  className="feature-menu-all"
                  to="/features"
                  onClick={() => setFeatureMenuOpen(false)}
                >
                  {t("查看全部功能")} <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
          <NavLink
            to="/screenshots"
            className={({ isActive }) => (isActive ? "nav-active" : "")}
          >
            {t("应用预览")}
          </NavLink>
          <NavLink
            to="/download"
            className={({ isActive }) => (isActive ? "nav-active" : "")}
          >
            {t("版本与下载")}
          </NavLink>
          <NavLink className="mobile-update-link" to="/updates">
            {t("更新日志")}
          </NavLink>
        </nav>
        <div className="header-actions">
          <div className="language-switch" role="group" aria-label={language === "en" ? "Language" : "语言切换"}>
            <button type="button" className={language === "zh" ? "language-active" : ""} aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中</button>
            <span aria-hidden="true">/</span>
            <button type="button" className={language === "en" ? "language-active" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { t, language } = useLanguage();
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <Brand footer />
        <span className="footer-motto">{t("写下思路，记住方法，然后继续向前。")}</span>
        <div className="footer-links">
          <Link to="/features">{t("功能介绍")}</Link>
          <Link to="/screenshots">{t("应用预览")}</Link>
          <Link to="/updates">{t("更新日志")}</Link>
        </div>
        <span className="footer-copy">
          © 2026 LeetCode {language === "en" ? "Notes" : "笔记"} <i /> {t("为每一次认真练习")} <i /> {t("版权所有")}{" "}
          <a
            className="footer-credit-link"
            href="https://benson.indevs.in"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={language === "en" ? "BENSON's homepage, opens in a new tab" : "BENSON 个人主页，在新标签页打开"}
          >
            BENSON
          </a>
          {t("（欢迎创意引用）")}
        </span>
      </div>
    </footer>
  );
}

function ButtonLink({ to, children, secondary = false, className = "" }) {
  return (
    <Link
      className={`button ${secondary ? "button-secondary" : "button-primary"} ${className}`}
      to={to}
    >
      {children}
    </Link>
  );
}

function HomePage() {
  const { language, t } = useLanguage();
  const featured = [features[0], features[2], features[4]].map((feature) =>
    getFeature(feature, language),
  );
  return (
    <main>
      <section className="home-hero page-shell">
        <div className="hero-grid-glow" />
        <div className="hero-copy">
          <Link to="/features" className="announcement">
            <span className="announcement-dot" />
            {t("把刷题过程，变成自己的知识")} <ArrowRight size={14} />
          </Link>
          <h1>
            {t("让每一次练习")}
            <br />{t("都 ")}<span>{t("留下来。")}</span>
          </h1>
          <p>
            {language === "en" ? "LeetCode Notes brings problems, solutions, and review history together." : "LeetCode 笔记把题目、解题思路与复习记录连在一起。"}
            <br className="desktop-break" />
            {t("少一点重复整理，多一点真正理解。")}
          </p>
          <div className="hero-actions">
            <ButtonLink to="/download" className="button-large">
              <Download size={17} />
              {t("了解版本与下载")} <ArrowRight size={16} />
            </ButtonLink>
            <ButtonLink to="/features" secondary className="button-large">
              {t("探索功能")} <ArrowUpRight size={16} />
            </ButtonLink>
          </div>
          <div className="hero-proof">
            <span>
              <Check size={14} />
              {t("数据本地保存")}
            </span>
            <span>
              <Check size={14} />
              {t("题目和笔记一起管理")}
            </span>
            <span>
              <Check size={14} />
              {t("AI 能力按需配置")}
            </span>
          </div>
        </div>
        <div className="hero-product">
          <div className="hero-product-glow" />
          <div className="product-window">
            <div className="product-window-bar">
              <span className="window-dots">
                <i />
                <i />
                <i />
              </span>
              <span>
                LEETCODE NOTE <em>/ YOUR PROBLEM LIBRARY</em>
              </span>
              <span className="window-status">
                <i /> LOCAL
              </span>
            </div>
            <img src={problems} alt={language === "en" ? "LeetCode Notes problem library screenshot" : "LeetCode 笔记题库页面截图"} />
          </div>
          <div className="hero-float-card float-sync">
            <span className="float-icon">
              <RefreshCw size={16} />
            </span>
            <span>
              <b>{t("练习进度")}</b>
              <small>{t("在自己的节奏中持续积累")}</small>
            </span>
            <span className="float-live" />
          </div>
          <div className="hero-float-card float-notes">
            <span className="float-icon purple">
              <NotebookPen size={16} />
            </span>
            <span>
              <b>{t("解题笔记")}</b>
              <small>{t("每道题都有自己的上下文")}</small>
            </span>
          </div>
          <div className="hero-coordinate">
            31°13'48.0"N <span>·</span> STUDY, REFLECT, REPEAT
          </div>
        </div>
        <div className="hero-side-index">
          <span>01</span>
          <i /> LEARN WITH INTENTION
        </div>
      </section>

      <section className="home-flow page-shell">
        <div className="flow-intro">
          <span className="eyebrow">
            <i /> A MORE CONNECTED WORKFLOW
          </span>
          <h2>
            {t("从一道题开始，")}
            <br />
            <span>{t("让思考继续发生。")}</span>
          </h2>
          <p>{t("做题、记录、复习各自有空间，也自然地衔接起来。")}</p>
        </div>
        <div className="flow-steps">
          {[
            {
              n: "01",
              icon: RefreshCw,
              title: t("带回练习记录"),
              text: t("连接账号并整理已解决题目"),
              to: "/features/account",
              tone: "green",
            },
            {
              n: "02",
              icon: NotebookPen,
              title: t("留下自己的解法"),
              text: t("标注难度、写下思路和代码"),
              to: "/features/notes",
              tone: "blue",
            },
            {
              n: "03",
              icon: History,
              title: t("回来重新练习"),
              text: t("抽取旧题，记下每轮掌握情况"),
              to: "/features/review",
              tone: "amber",
            },
            {
              n: "04",
              icon: CalendarDays,
              title: t("看见长期积累"),
              text: t("沿着日历回顾每日练习轨迹"),
              to: "/features/calendar",
              tone: "green",
            },
          ].map(({ n, icon: Icon, title, text, to, tone }) => (
            <Link className={`flow-step tone-${tone}`} to={to} key={n}>
              <span className="flow-step-top">
                <span className="flow-icon">
                  <Icon size={18} />
                </span>
                <small>{n}</small>
              </span>
              <b>{title}</b>
              <p>{text}</p>
              <ArrowUpRight size={15} className="flow-arrow" />
            </Link>
          ))}
        </div>
      </section>

      <section className="home-feature page-shell">
        <div className="home-feature-copy">
          <span className="eyebrow">
            <i /> A LITTLE MORE CLARITY
          </span>
          <span className="feature-large-number">
            02 <i /> 08
          </span>
          <h2>
            {t("把算法的每一步，")}
            <br />
            <span>{t("变得看得见。")}</span>
          </h2>
          <p>
            {language === "en" ? "Select a problem and solution, then let AI build an interactive walkthrough you can edit, preview, and save for later." : "选中题目和代码方案，让 AI 生成逐步执行的交互式页面。编辑、预览，保存为下次可以重看的解题演示。"}
          </p>
          <ul>
            <li>
              <Check size={15} />
              {t("基于题目与实际代码生成")}
            </li>
            <li>
              <Check size={15} />
              {t("编辑并预览交互式 HTML")}
            </li>
            <li>
              <Check size={15} />
              {t("与解题方案一起保存")}
            </li>
          </ul>
          <ButtonLink to="/features/visualization" secondary>
            {t("了解 AI 代码演示")} <ArrowRight size={15} />
          </ButtonLink>
        </div>
        <Link to="/features/visualization" className="home-feature-visual">
          <img src={aiDemo} alt={language === "en" ? "Interactive walkthrough generated by AI from algorithm code" : "AI 根据算法代码生成的交互式演示"} />
          <span className="visual-label">
            <Sparkles size={14} /> FROM CODE TO CLARITY
          </span>
          <span className="visual-open">
            <ArrowUpRight size={17} />
          </span>
        </Link>
      </section>

      <section className="home-featured page-shell">
        <div className="featured-heading">
          <div>
            <span className="eyebrow">
              <i /> CHOOSE YOUR NEXT STEP
            </span>
            <h2>{t("从你现在需要的功能开始。")}</h2>
          </div>
          <Link to="/features">
            {t("全部 8 项功能")} <ArrowRight size={15} />
          </Link>
        </div>
        <div className="featured-grid">
          {featured.map((feature) => (
            <FeatureCard feature={feature} key={feature.id} compact />
          ))}
        </div>
      </section>

      <section className="home-cta page-shell">
        <div>
          <span className="eyebrow">
            <i /> MADE FOR THE LONG RUN
          </span>
          <h2>
            {t("下一次练习，")}
            <br />
            {t("从一题开始。")}
          </h2>
          <p>{t("看看 LeetCode 笔记如何陪你记录、理解和复习。")}</p>
        </div>
        <div className="cta-actions">
          <ButtonLink to="/screenshots" secondary>
            {t("查看真实应用截图")} <ArrowRight size={15} />
          </ButtonLink>
          <ButtonLink to="/download">
            {t("版本与下载")} <ArrowUpRight size={15} />
          </ButtonLink>
        </div>
        <div className="cta-orbit">
          <img src={appLogo} alt="" />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ feature, compact = false }) {
  const { t } = useLanguage();
  const Icon = feature.icon;
  return (
    <Link
      className={`catalog-card tone-${feature.tone}${compact ? " catalog-card-compact" : ""}`}
      to={feature.path}
    >
      <div className="catalog-card-top">
        <span className="catalog-icon">
          <Icon size={19} />
        </span>
        <span className="feature-number">FEATURE {feature.number}</span>
      </div>
      <h3>{feature.label}</h3>
      <p>{feature.card}</p>
      <ul>
        {feature.points.map((point) => (
          <li key={point}>
            <Check size={13} />
            {point}
          </li>
        ))}
      </ul>
      <div className="catalog-card-footer">
        <span>{t("了解功能详情")}</span>
        <ArrowUpRight size={16} />
      </div>
    </Link>
  );
}

function FeaturesPage() {
  const { language, t } = useLanguage();
  const localizedFeatures = features.map((feature) => getFeature(feature, language));
  return (
    <main className="page-shell content-page catalog-page">
      <PageIntro
        eyebrow="FEATURE DIRECTORY"
        title={
          <>
            {t("围绕每一次练习，")}
            <br />
            <span>{t("把需要的能力放在一起。")}</span>
          </>
        }
        description={t("八项功能，各自清晰。选择一个你最关心的环节，了解它如何融入完整的刷题流程。")}
      />
      <div className="feature-overview-list">
        {localizedFeatures.map((feature) => (
          <FeatureOverviewSection feature={feature} key={feature.id} />
        ))}
      </div>
      <div className="catalog-bottom">
        <img src={appLogo} alt="" />
        <span>{t("每一项功能，都服务于下一次更从容的练习。")}</span>
        <Link to="/screenshots">
          {t("先看看应用截图")} <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}

function FeatureOverviewSection({ feature }) {
  const { t } = useLanguage();
  const Icon = feature.icon;
  return (
    <section
      className={`feature-overview feature-overview--${feature.id} tone-${feature.tone}`}
      id={`feature-${feature.id}`}
    >
      <div className="feature-overview-copy">
        <div className="feature-overview-kicker">
          <span className="catalog-icon"><Icon size={19} /></span>
          <span className="eyebrow"><i /> {feature.eyebrow}</span>
          <span className="feature-number">FEATURE {feature.number}</span>
        </div>
        <h2>{feature.label}</h2>
        <p className="feature-overview-summary">{feature.summary}</p>
        <div className="feature-overview-metrics">
          {feature.metrics.map(({ value, label }) => (
            <div className="metric-card" key={label}>
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <ul className="feature-overview-points">
          {feature.points.map((point) => (
            <li key={point}><Check size={14} />{point}</li>
          ))}
        </ul>
        <p className="feature-overview-outcome">{feature.outcome}</p>
        <Link className="text-link" to={feature.path}>
          {t("了解功能详情")} <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="feature-overview-shots">
        {feature.shots.map((src, index) => (
          <figure className={`overview-shot overview-shot-${index + 1}`} key={src}>
            <div className="shot-window">
              <div className="shot-window-bar">
                <span><i /><i /><i /></span>
                <small>LEETCODE NOTE / {feature.label.toUpperCase()}</small>
              </div>
              <img src={src} loading="lazy" alt={`${feature.label}: ${feature.shotCaptions[index]}`} />
            </div>
            <figcaption><span>0{index + 1}</span>{feature.shotCaptions[index]}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function PageIntro({ eyebrow, title, description, number }) {
  return (
    <div className="page-intro">
      <div className="page-intro-main">
        <span className="eyebrow">
          <i /> {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {number && (
        <div className="page-intro-number">
          <span>{number}</span>
          <small>
            FEATURE
            <br />
            OF YOUR STUDY FLOW
          </small>
        </div>
      )}
    </div>
  );
}

function FeaturePage({ feature }) {
  const { language, t } = useLanguage();
  feature = getFeature(feature, language);
  const Icon = feature.icon;
  return (
    <main className={`feature-detail-page tone-${feature.tone}`}>
      <div className="page-shell content-page">
        <div className="breadcrumb">
          <Link to="/">{t("首页")}</Link>
          <span>/</span>
          <Link to="/features">{t("功能介绍")}</Link>
          <span>/</span>
          <b>{feature.label}</b>
        </div>
        <PageIntro
          eyebrow={feature.eyebrow}
          title={feature.title.split("\n").map((line, lineIndex) => (
            <span key={line}>
              {lineIndex > 0 && <br />}
              {lineIndex === 1 ? <em>{line}</em> : line}
            </span>
          ))}
          description={feature.summary}
          number={feature.number}
        />
        <div className="feature-metrics">
          {feature.metrics.map(({ value, label }) => (
            <div className="metric-card" key={label}>
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="feature-content-grid">
          <div className="feature-story">
            <div className="story-icon">
              <Icon size={20} />
            </div>
            <span className="eyebrow">
              <i /> BUILT AROUND REAL PRACTICE
            </span>
            <h2>
              {t("让练习之后，")}
              <br />
              <span>{t("还有下一步。")}</span>
            </h2>
            <p>{feature.outcome}</p>
            <div className="story-list">
              {feature.points.map((point, pointIndex) => (
                <div key={point}>
                  <span>0{pointIndex + 1}</span>
                  <b>{point}</b>
                  <Check size={15} />
                </div>
              ))}
            </div>
            <Link className="text-link" to="/features">
              {t("浏览全部功能")} <ArrowRight size={15} />
            </Link>
          </div>
          <div className="feature-shots">
            {feature.shots.map((shot, shotIndex) => (
              <figure
                className={`feature-shot feature-shot-${shotIndex + 1}`}
                key={shot}
              >
                <div className="shot-window">
                  <div className="shot-window-bar">
                    <span>
                      <i />
                      <i />
                      <i />
                    </span>
                    <small>LEETCODE NOTE / {feature.label.toUpperCase()}</small>
                  </div>
                  <img
                    loading="lazy"
                    src={shot}
                    alt={`${feature.label}：${feature.shotCaptions[shotIndex]}`}
                  />
                </div>
                <figcaption>
                  <span>0{shotIndex + 1}</span>
                  {feature.shotCaptions[shotIndex]}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function ScreenshotCarousel() {
  const { language, t } = useLanguage();
  const [active, setActive] = useState(0);
  const originalShot = screenshots[active];
  const shot = language === "en"
    ? { ...originalShot, title: screenshotEnglish[active][0], caption: screenshotEnglish[active][1] }
    : originalShot;
  const step = (amount) =>
    setActive(
      (current) => (current + amount + screenshots.length) % screenshots.length,
    );
  return (
    <div className="gallery-viewer">
      <div className="gallery-frame">
        <div className="gallery-toolbar">
          <span className="window-dots">
            <i />
            <i />
            <i />
          </span>
          <span>
            <i className="live-dot" /> LEETCODE NOTE <em>/ {shot.tag}</em>
          </span>
          <span className="gallery-index">
            {String(active + 1).padStart(2, "0")}{" "}
            <small>/ {String(screenshots.length).padStart(2, "0")}</small>
          </span>
        </div>
        <div className="gallery-image">
          <img key={shot.src} src={shot.src} alt={shot.title} />
          <button
            type="button"
            aria-label={language === "en" ? "Previous screenshot" : "上一张截图"}
            onClick={() => step(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button type="button" aria-label={language === "en" ? "Next screenshot" : "下一张截图"} onClick={() => step(1)}>
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="gallery-caption">
          <div>
            <span>{shot.tag}</span>
            <h2>{shot.title}</h2>
            <p>{shot.caption}</p>
          </div>
          <span className="gallery-progress">
            <i
              style={{ width: `${((active + 1) / screenshots.length) * 100}%` }}
            />
          </span>
        </div>
      </div>
      <div className="gallery-thumbnails" aria-label={language === "en" ? "Choose an app screenshot" : "选择应用截图"}>
        {screenshots.map((item, index) => (
          <button
            type="button"
            className={active === index ? "thumbnail-active" : ""}
            key={item.src}
            onClick={() => setActive(index)}
            aria-label={`${index + 1}. ${language === "en" ? screenshotEnglish[index][0] : item.title}`}
            aria-current={index === active}
          >
            <img loading="lazy" src={item.src} alt="" />
            <span>{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ScreenshotsPage() {
  const { language, t } = useLanguage();
  return (
    <main className="page-shell content-page screenshots-page">
      <PageIntro
        eyebrow="INSIDE THE APP"
        title={
          <>
            {t("一个地方，")}
            <br />
            <span>{t("看见完整的学习过程。")}</span>
          </>
        }
        description={t("从个人题库、AI 代码演示到复习热力图，逐张浏览 LeetCode 笔记的真实界面。")}
      />
      <ScreenshotCarousel />
      <div className="gallery-note">
        <span>
          <Check size={14} />
          {t("全部为当前应用实际截图")}
        </span>
        <Link to="/features">
          {t("按功能了解产品")} <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}

function UpdatesPage() {
  const { language, t } = useLanguage();
  return (
    <main className="page-shell content-page updates-page">
      <PageIntro
        eyebrow="RELEASE NOTES"
        title={
          <>
            {t("一点点完善，")}
            <br />
            <span>{t("让练习越来越顺手。")}</span>
          </>
        }
        description={t("查看当前预览版已经包含的功能，以及近期学习流程的改进。")}
      />
      <div className="updates-timeline">
        {updates.map((update, index) => {
          const title = language === "en" ? updateEnglish[index].title : update.title;
          const items = language === "en" ? updateEnglish[index].items : update.items;
          return (
          <article className="update-card" key={update.version}>
            <div className="update-marker">
              <span>
                {index === 0 ? <Sparkles size={17} /> : <RefreshCw size={16} />}
              </span>
            </div>
            <div className="update-content">
              <div className="update-meta">
                <span>{update.date}</span>
                <b>{update.version}</b>
                {index === 0 && <i>{t("当前版本")}</i>}
              </div>
              <h2>{title}</h2>
              <ul>
                {items.map((item) => (
                  <li key={item}>
                    <Check size={15} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </article>
          );
        })}
      </div>
      <div className="updates-footnote">
        <span className="live-dot" />
        {t("版本记录为官网预览内容，正式发布后会持续更新。")}
      </div>
    </main>
  );
}

function DownloadPage() {
  const { language, t } = useLanguage();
  const [notice, setNotice] = useState(
    t("官网预览页面暂未配置安装包下载地址。正式发布后会在这里提供对应平台的版本。 "),
  );
  useEffect(() => {
    setNotice(t("官网预览页面暂未配置安装包下载地址。正式发布后会在这里提供对应平台的版本。 "));
  }, [language]);
  return (
    <main className="page-shell content-page download-page">
      <PageIntro
        eyebrow="GET STARTED"
        title={
          <>
            {t("为下一次练习，")}
            <br />
            <span>{t("准备好你的学习桌面。")}</span>
          </>
        }
        description={t("LeetCode 笔记当前处于预览阶段。了解版本状态、支持平台和本地开发方式。")}
      />
      <div className="release-card">
        <div className="release-product">
          <img src={appLogo} alt="" />
          <div>
            <span>LOCAL-FIRST STUDY APP</span>
            <h2>LeetCode {language === "en" ? "Notes" : "笔记"}</h2>
            <p>{t("桌面学习助手 · 预览版")}</p>
          </div>
          <div className="release-version">
            <b>0.1.0</b>
            <span>PREVIEW</span>
          </div>
        </div>
        <div className="release-specs">
          <div>
            <small>{t("当前版本")}</small>
            <b>
              v0.1.0 <span>{t("预览")}</span>
            </b>
          </div>
          <div>
            <small>{t("桌面框架")}</small>
            <b>Tauri 2</b>
          </div>
          <div>
            <small>{t("数据存储")}</small>
            <b>{t("本地 SQLite")}</b>
          </div>
          <div>
            <small>{language === "en" ? "Release date" : "版本日期"}</small>
            <b>2026.09</b>
          </div>
        </div>
        <div className="release-download-actions">
          <button
            type="button"
            className="button button-primary button-large"
            onClick={() =>
              setNotice(
                t("安装包发布准备中；目前可以从源码运行桌面应用，具体步骤见下方开发指南。 "),
              )
            }
          >
            <Download size={17} />
            {t("获取预览版")} <ArrowUpRight size={15} />
          </button>
          <Link className="button button-secondary button-large" to="/updates">
            {t("阅读更新日志")} <ArrowRight size={15} />
          </Link>
        </div>
        <p className="release-notice">
          <span className="live-dot" />
          {notice}
        </p>
      </div>
      <div className="dev-card">
        <div>
          <span className="eyebrow">
            <i /> RUN FROM SOURCE
          </span>
          <h2>{t("现在就从源码开始。")}</h2>
          <p>{t("准备 Node.js、Go 和 Rust 工具链，在项目根目录启动桌面预览。")}</p>
        </div>
        <div className="code-snippet">
          <span>
            <i />
            <i />
            <i /> &nbsp; TERMINAL
          </span>
          <code>
            npm install
            <br />
            <b>npm run tauri dev</b>
          </code>
          <Link to="/features">
            {t("先了解产品功能")} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
      <div className="download-platform-note">
        <Check size={15} />
        {t("Tauri 项目支持按目标平台构建；正式安装包和下载渠道将在发布后补充。")}
      </div>
    </main>
  );
}

function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <main className="page-shell content-page not-found">
      <span className="eyebrow">
        <i /> PAGE NOT FOUND
      </span>
      <h1>{t("这一页暂时找不到。")}</h1>
      <Link className="button button-primary" to="/">
        {t("返回首页")} <ArrowRight size={15} />
      </Link>
    </main>
  );
}

export default function Website() {
  const [language, setLanguage] = useState(() => {
    try {
      return window.localStorage.getItem("leetcode-note-website-language") === "en" ? "en" : "zh";
    } catch {
      return "zh";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    try {
      window.localStorage.setItem("leetcode-note-website-language", language);
    } catch {
      // Keep the current session language when storage is unavailable.
    }
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <PageReset />
      <SeoMetadata />
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        {features.map((feature) => (
          <Route
            path={feature.path}
            element={<FeaturePage feature={feature} />}
            key={feature.id}
          />
        ))}
        <Route path="/screenshots" element={<ScreenshotsPage />} />
        <Route path="/updates" element={<UpdatesPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Footer />
    </LanguageContext.Provider>
  );
}
