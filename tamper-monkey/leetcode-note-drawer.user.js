// ==UserScript==
// @name         LeetCode Note Drawer
// @namespace    http://tampermonkey.net/
// @version      2026-09-23.1
// @description  Add a note drawer to LeetCode problem pages
// @author       You
// @match        https://leetcode.cn/problems/**
// @icon         https://www.google.com/s2/favicons?sz=64&domain=leetcode.cn
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // ===== 配置参数 =====
    const API_HOST = 'http://127.0.0.1:17877';
    const API_BASE_URL = `${API_HOST}/api/v1`;
    /** 与后端 GetLeetCodeSyncedCode 一致，拉取力扣账号已同步到题库的代码 */
    const DEFAULT_LANG_SLUG = 'java';

    function getCurrentLangSlug() {
        const languageMap = {
            'C++': 'cpp', 'C': 'c', 'Java': 'java', 'Python': 'python', 'Python3': 'python3',
            'JavaScript': 'javascript', 'TypeScript': 'typescript', 'Go': 'golang', 'Rust': 'rust',
            'C#': 'csharp', 'Kotlin': 'kotlin', 'Swift': 'swift', 'Ruby': 'ruby', 'PHP': 'php'
        };
        const selected = Array.from(document.querySelectorAll('button,[role="button"]'))
            .map((element) => (element.innerText || element.textContent || '').trim())
            .find((text) => Object.prototype.hasOwnProperty.call(languageMap, text));
        return languageMap[selected] || DEFAULT_LANG_SLUG;
    }

    // 手感和状态枚举
    const PERSONAL_RATINGS = {
        1: { label: '秒杀', icon: '⚡' },
        2: { label: '拿捏', icon: '👌' },
        3: { label: '纠结', icon: '🤔' },
        4: { label: '烧脑', icon: '🤯' },
        5: { label: '地狱', icon: '💀' }
    };

    // 掌握程度（与前端 ReviewSection 对齐）
    const STATUS_MAP = {
        'Confused': { label: '一脸懵逼😳', icon: '😳' },
        'New': { label: '未掌握', icon: '📚' },
        'Struggling': { label: '半生不熟', icon: '🤷' },
        'Relearning': { label: '需重练', icon: '🔁' },
        'Stable': { label: '很稳', icon: '✅' },
        'Mastered': { label: '已精通', icon: '👑' }
    };

    // 完成状态（后端 progress_status）
    const PROGRESS_STATUS_MAP = {
        'Unpracticed': { label: '未开始', icon: '⏳' },
        'Reviewing': { label: '复习中', icon: '🔄' },
        'Mastered': { label: '已完成', icon: '🏁' }
    };

    // 等待页面加载完成
    function waitForElement(selector, callback) {
        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                callback(element);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 获取题目信息
    function getProblemInfo() {
        const url = new URL(window.location.href);
        const parts = url.pathname.split("/");
        const titleSlug = parts[2];
        const title = document.title.replace(' - 力扣（LeetCode）', '');

        // 尝试获取题号
        const titleElement = document.querySelector('[data-cy="question-title"]');
        let problemNumber = '';
        if (titleElement) {
            const match = titleElement.textContent.match(/^(\d+)\./);
            if (match) problemNumber = match[1];
        }

        return { titleSlug, title, problemNumber };
    }

    /**
     * 从本地后端拉取当前题目、指定语言在力扣上已同步的完整代码（不再从页面 .view-line 截取，避免虚拟滚动丢行）
     * @param {string} titleSlug 题目 slug
     * @param {string} [langSlug] 默认 java
     * @param {(code: string, timestamp: string, httpStatus: number) => void} onDone
     */
    function fetchUserSyncedCode(titleSlug, langSlug, onDone) {
        const lang = langSlug || DEFAULT_LANG_SLUG;
        const url = `${API_BASE_URL}/leetcode/user-synced-code?questionSlug=${encodeURIComponent(titleSlug)}&langSlug=${encodeURIComponent(lang)}`;
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload: (response) => {
                let code = '';
                let timestamp = '';
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.code === 0 && data.data) {
                        code = data.data.code || '';
                        timestamp = data.data.timestamp || '';
                    }
                } catch (e) {
                    console.error('[LeetCode Note] 解析 user-synced-code 响应失败:', e);
                }
                onDone(code, timestamp, response.status);
            },
            onerror: (err) => {
                console.error('[LeetCode Note] 请求 user-synced-code 失败:', err);
                onDone('', '', 0);
            }
        });
    }

    /**
     * 从 LeetCode 页面的 Monaco 编辑器获取当前默认代码
     * 优先通过 monaco 全局实例取完整代码（不受虚拟滚动丢行影响），
     * 失败时回退为解析 .view-lines 的可见行文本
     */
    function getPageEditorCode() {
        // 1) Monaco 实例方式
        try {
            const models = window.monaco && window.monaco.editor && window.monaco.editor.getModels && window.monaco.editor.getModels();
            if (models && models.length) {
                let best = '';
                for (const m of models) {
                    const v = (m.getValue && m.getValue()) || '';
                    if (v.trim() && v.length > best.length) best = v;
                }
                if (best) return best;
            }
        } catch (e) { /* ignore */ }

        // 2) DOM 视图行回退（nbsp 还原为空格）
        const viewLines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
        if (!viewLines.length) return '';
        return Array.from(viewLines)
            .map((line) => (line.textContent || '').replace(/\u00a0/g, ' '))
            .join('\n');
    }

    // 创建按钮
    function createButton(label = '笔记') {
        const button = document.createElement('button');
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span style="margin-left: 6px;">${label}</span>
        `;
        button.style.cssText = `
            display: flex;
            align-items: center;
            padding: 6px 12px;
            background: #2db55d;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            margin-left: 8px;
        `;
        button.onmouseover = () => button.style.background = '#27ae60';
        button.onmouseout = () => button.style.background = '#2db55d';

        return button;
    }

    function apiRequest(method, path, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url: `${API_BASE_URL}${path}`,
                headers: data ? { 'Content-Type': 'application/json' } : undefined,
                data: data ? JSON.stringify(data) : undefined,
                onload: (response) => {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (response.status >= 200 && response.status < 300 && result.code === 0) resolve(result.data);
                        else reject(new Error(result.msg || result.message || `请求失败 (${response.status})`));
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: () => reject(new Error('无法连接本地服务')),
            });
        });
    }

    function openReviewDialog(problemInfo) {
        document.getElementById('leetcode-review-overlay')?.remove();
        const codeSnapshot = getPageEditorCode();
        const codeLanguage = getCurrentLangSlug();
        const overlay = document.createElement('div');
        overlay.id = 'leetcode-review-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.48);display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
        const panel = document.createElement('div');
        panel.style.cssText = 'width:min(620px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:24px;box-shadow:0 24px 80px rgba(15,23,42,.3);color:#1e293b;';
        overlay.appendChild(panel);

        const heading = document.createElement('div');
        heading.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;';
        const headingText = document.createElement('div');
        const title = document.createElement('div');
        title.textContent = '训练打卡';
        title.style.cssText = 'font-size:18px;font-weight:700;';
        const subtitle = document.createElement('div');
        subtitle.textContent = problemInfo.title || problemInfo.titleSlug;
        subtitle.style.cssText = 'margin-top:5px;color:#64748b;font-size:12px;';
        headingText.append(title, subtitle);
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = 'border:0;background:#f1f5f9;border-radius:9px;width:32px;height:32px;font-size:22px;color:#64748b;cursor:pointer;';
        closeButton.onclick = () => overlay.remove();
        heading.append(headingText, closeButton);
        panel.appendChild(heading);

        const makeChoiceGroup = (label, choices, selectedValue, columns) => {
            const section = document.createElement('section');
            section.style.cssText = 'margin:18px 0;';
            const caption = document.createElement('div');
            caption.textContent = label;
            caption.style.cssText = 'font-size:12px;font-weight:650;color:#475569;margin-bottom:8px;';
            const grid = document.createElement('div');
            grid.style.cssText = `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:7px;`;
            let selected = selectedValue;
            const buttons = [];
            choices.forEach((choice) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = choice.label;
                button.style.cssText = 'border:1px solid #e2e8f0;background:#fff;color:#64748b;padding:9px 6px;border-radius:9px;font-size:11px;font-weight:600;cursor:pointer;';
                const paint = () => {
                    const active = selected === choice.value;
                    button.style.borderColor = active ? '#16a34a' : '#e2e8f0';
                    button.style.background = active ? '#f0fdf4' : '#fff';
                    button.style.color = active ? '#15803d' : '#64748b';
                };
                button.onclick = () => { selected = choice.value; buttons.forEach((paintButton) => paintButton()); };
                buttons.push(paint);
                paint();
                grid.appendChild(button);
            });
            section.append(caption, grid);
            panel.appendChild(section);
            return () => selected;
        };

        const getStatus = makeChoiceGroup('掌握程度', Object.entries(STATUS_MAP).map(([value, item]) => ({ value, label: item.label })), 'New', 3);
        const getProgressStatus = makeChoiceGroup('打卡状态', Object.entries(PROGRESS_STATUS_MAP).map(([value, item]) => ({ value, label: item.label })), 'Reviewing', 3);
        const getRating = makeChoiceGroup('手感评分', Object.entries(PERSONAL_RATINGS).map(([value, item]) => ({ value: Number(value), label: `${item.icon} ${item.label}` })), 0, 5);

        const commentLabel = document.createElement('label');
        commentLabel.textContent = '训练记录';
        commentLabel.style.cssText = 'display:block;margin:18px 0 8px;font-size:12px;font-weight:650;color:#475569;';
        const comment = document.createElement('textarea');
        comment.placeholder = '记录本次遇到的坑点或突破...';
        comment.style.cssText = 'width:100%;height:86px;resize:vertical;border:1px solid #e2e8f0;border-radius:10px;padding:11px;font-size:12px;outline:none;';
        panel.append(commentLabel, comment);

        const codeLabel = document.createElement('div');
        codeLabel.textContent = `本次代码快照 · ${codeLanguage}`;
        codeLabel.style.cssText = 'margin:16px 0 8px;font-size:12px;font-weight:650;color:#475569;';
        const code = document.createElement('pre');
        code.textContent = codeSnapshot || '没有读取到编辑器代码';
        code.style.cssText = 'max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:10px;font:11px/1.6 ui-monospace,SFMono-Regular,monospace;';
        panel.append(codeLabel, code);

        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:20px;';
        const cancel = document.createElement('button');
        cancel.textContent = '取消';
        cancel.style.cssText = 'border:1px solid #e2e8f0;background:#fff;color:#475569;padding:10px 16px;border-radius:9px;font-weight:600;cursor:pointer;';
        cancel.onclick = () => overlay.remove();
        const save = document.createElement('button');
        save.textContent = '保存打卡';
        save.style.cssText = 'border:0;background:#16a34a;color:#fff;padding:10px 18px;border-radius:9px;font-weight:650;cursor:pointer;';
        save.onclick = async () => {
            save.disabled = true;
            save.textContent = '保存中…';
            try {
                const existing = await apiRequest('GET', `/leetcode/user-problem/detail?titleSlug=${encodeURIComponent(problemInfo.titleSlug)}`);
                const savedProblem = await apiRequest('POST', '/leetcode/user-problem/save-v2', {
                    titleSlug: problemInfo.titleSlug,
                    notes: existing?.notes || '',
                    code: codeSnapshot,
                    personalDifficulty: getRating(),
                    status: getStatus(),
                    progressStatus: getProgressStatus(),
                });
                if (!savedProblem?.id) throw new Error('题目代码已保存，但没有取得题目记录编号');
                await apiRequest('POST', '/reviews', {
                    user_problem_id: savedProblem.id,
                    status: getStatus(),
                    progress_status: getProgressStatus(),
                    personal_difficulty: getRating(),
                    comment: comment.value.trim(),
                    code: codeSnapshot,
                    code_language: codeLanguage,
                });
                save.textContent = '已保存 ✓';
                window.setTimeout(() => overlay.remove(), 650);
            } catch (error) {
                console.error('[LeetCode Note] 保存训练打卡失败:', error);
                save.disabled = false;
                save.textContent = error.message || '保存失败，请重试';
            }
        };
        footer.append(cancel, save);
        panel.appendChild(footer);
        overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    // 创建 Drawer HTML
    function createDrawerHTML(problemInfo) {
        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LeetCode Note Pro Sidebar</title>
    <style>
        :root {
            --primary-green: #2db55d;
            --hover-green: #27ae60;
            --light-green: #f0f9f4;
            --text-dark: #262626;
            --text-muted: #8c8c8c;
            --border-color: #f0f0f0;
            --bg-side: #f7f9f8;
            --code-bg: #1e1e1e;
            --font-main: -apple-system, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
            --font-code: "Fira Code", "JetBrains Mono", "Cascadia Code", "Consolas", monospace;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--font-main);
            background: #ffffff;
            color: var(--text-dark);
            height: 100vh;
            overflow: hidden;
            -webkit-font-smoothing: antialiased;
        }

        #tm-sidebar {
            display: flex;
            width: 100%;
            height: 100vh;
            border-left: 1px solid var(--border-color);
            background: #fff;
        }

        .tm-main-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .tm-header {
            padding: 14px 20px 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .tm-title-area { flex: 1; }

        .tm-title-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 2px;
        }

        .tm-tag {
            background: var(--primary-green);
            color: white;
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 3px;
            font-weight: 800;
        }

        .tm-title-text {
            font-size: 15px;
            font-weight: 600;
            margin: 0;
        }

        .tm-slug-input {
            border: none;
            font-size: 11px;
            color: var(--text-muted);
        outline: none;
            width: 100%;
            padding: 2px 0;
            background: transparent;
        }

        .tm-tabs-wrapper {
            padding: 0 20px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            gap: 20px;
        }

        .tm-tab {
            padding: 10px 0;
            font-size: 13px;
            color: var(--text-muted);
            cursor: pointer;
            position: relative;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tm-tab svg { width: 13px; height: 13px; }

        .tm-tab.active {
            color: var(--primary-green);
            font-weight: 600;
        }

        .tm-tab.active::after {
            content: "";
            position: absolute;
            bottom: -1px;
            left: 0;
            width: 100%;
            height: 2px;
            background: var(--primary-green);
        }

        .tm-content {
            flex: 1;
            position: relative;
            overflow: hidden;
        }

        .tm-pane {
            position: absolute;
            inset: 0;
            padding: 16px 20px;
            display: flex;
            flex-direction: column;
            min-width: 0;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
        }

        .tm-pane.active {
            opacity: 1;
            pointer-events: auto;
        }

        .tm-textarea {
            width: 100%;
            flex: 1;
            min-height: 0;
            border: none;
            resize: none;
            outline: none;
            font-size: 13px;
            line-height: 1.6;
            color: var(--text-dark);
            background: transparent;
            font-family: inherit;
        }

        .tm-code-pane-inner {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            min-width: 0;
            width: 100%;
            gap: 8px;
        }

        .tm-code-pane-toolbar {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        }

        .tm-code-editor {
            font-family: var(--font-code);
            background: #282c34;
            color: #abb2bf;
            padding: 14px;
            border-radius: 8px;
            font-size: 12px;
            box-sizing: border-box;
            line-height: 1.5;
            flex: 1;
            min-height: 0;
            width: 100%;
        }

        .tm-side-col {
            width: 200px;
            background: var(--bg-side);
            border-left: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            padding: 14px;
            gap: 20px;
        }

        .tm-side-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .tm-side-label {
            font-size: 10px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .tm-rating-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }

        .tm-rate-card {
            background: white;
            border: 1px solid #e5e5e5;
            border-radius: 6px;
            padding: 8px 2px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tm-rate-card .emoji { font-size: 14px; display: block; margin-bottom: 2px; }
        .tm-rate-card .label { font-size: 10px; color: var(--text-muted); }

        .tm-rate-card:hover { border-color: var(--primary-green); background: #fdfdfd; }

        .tm-rate-card.active {
            background: var(--light-green);
            border-color: var(--primary-green);
            box-shadow: 0 2px 4px rgba(45, 181, 93, 0.1);
        }
        .tm-rate-card.active .label { color: var(--primary-green); font-weight: 600; }

        .tm-mastery-list {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .tm-mastery-btn {
            background: white;
            border: 1px solid #e5e5e5;
            padding: 8px;
            border-radius: 6px;
            font-size: 11px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            color: var(--text-dark);
        }

        .tm-mastery-btn:hover { border-color: var(--primary-green); }

        .tm-mastery-btn.active {
            background: var(--primary-green);
            color: white;
            border-color: var(--primary-green);
            font-weight: 600;
        }

        .tm-side-footer {
            margin-top: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .tm-btn-save {
            width: 100%;
            padding: 10px;
            background: var(--primary-green);
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(45, 181, 93, 0.2);
            transition: all 0.2s;
        }

        .tm-btn-save:hover {
            background: var(--hover-green);
            transform: translateY(-1px);
        }

        .tm-btn-reset {
            background: transparent;
            color: var(--text-muted);
            border: none;
            font-size: 11px;
            cursor: pointer;
            padding: 4px;
        }

        .tm-btn-reset:hover { color: #f5222d; text-decoration: underline; }

        .tm-close-top {
            align-self: flex-end;
            cursor: pointer;
            color: var(--text-muted);
            padding: 4px;
            transition: color 0.2s;
        }
        .tm-close-top:hover { color: var(--text-dark); }

        .tm-code-btn {
            padding: 6px 12px;
            background: var(--primary-green);
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 600;
        }

        .tm-code-btn:hover {
            background: var(--hover-green);
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 10px; }
    </style>
</head>
<body>
    <div id="tm-sidebar">
        <div class="tm-main-col">
            <div class="tm-header">
                <div class="tm-title-area">
                    <div class="tm-title-row">
                        <span class="tm-tag">#${problemInfo.problemNumber || '?'}</span>
                        <h2 class="tm-title-text">${problemInfo.title}</h2>
                    </div>
                    <input type="text" class="tm-slug-input" value="${problemInfo.titleSlug}" spellcheck="false" title="点击编辑 Slug">
                </div>
            </div>

            <div class="tm-tabs-wrapper">
                <div class="tm-tab active" data-target="pane-note">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    核心笔记
                </div>
                <div class="tm-tab" data-target="pane-code">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    代码实现
                </div>
            </div>

            <div class="tm-content">
                <div id="pane-note" class="tm-pane active">
                    <textarea class="tm-textarea" placeholder="在此记录思路、时空复杂度、解题陷阱..."></textarea>
                </div>
                <div id="pane-code" class="tm-pane">
                    <div class="tm-code-pane-inner">
                        <div class="tm-code-pane-toolbar">
                            <button class="tm-code-btn" id="load-code-btn">📋 加载代码</button>
                            <button class="tm-code-btn" id="reset-code-btn">↺ 恢复原始</button>
                        </div>
                        <textarea class="tm-textarea tm-code-editor" id="code-textarea" placeholder="// 粘贴核心代码片段或辅助类实现..." spellcheck="false"></textarea>
                    </div>
                </div>
            </div>
        </div>

        <div class="tm-side-col">
            <div class="tm-close-top" id="close-drawer" title="关闭插件">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </div>

            <div class="tm-side-section">
                <span class="tm-side-label">手感自评</span>
                <div class="tm-rating-grid" id="difficulty-grid">
                    <div class="tm-rate-card" data-val="1"><span class="emoji">⚡</span><span class="label">秒杀</span></div>
                    <div class="tm-rate-card" data-val="2"><span class="emoji">👌</span><span class="label">拿捏</span></div>
                    <div class="tm-rate-card" data-val="3"><span class="emoji">🤔</span><span class="label">纠结</span></div>
                    <div class="tm-rate-card" data-val="4"><span class="emoji">🤯</span><span class="label">烧脑</span></div>
                    <div class="tm-rate-card" style="grid-column: span 2;" data-val="5"><span class="emoji">💀</span><span class="label">地狱</span></div>
                </div>
            </div>

            <div class="tm-side-section">
                <span class="tm-side-label">掌握程度</span>
                <div class="tm-mastery-list" id="mastery-list">
                    <div class="tm-mastery-btn" data-val="Confused">😳 一脸懵逼😳</div>
                    <div class="tm-mastery-btn" data-val="New">📚 未掌握</div>
                    <div class="tm-mastery-btn" data-val="Struggling">🤷 半生不熟</div>
                    <div class="tm-mastery-btn" data-val="Relearning">🔁 需重练</div>
                    <div class="tm-mastery-btn" data-val="Stable">✅ 很稳</div>
                    <div class="tm-mastery-btn" data-val="Mastered">👑 已精通</div>
                </div>
            </div>

            <div class="tm-side-section">
                <span class="tm-side-label">完成状态</span>
                <div class="tm-mastery-list" id="progress-status-list">
                    <div class="tm-mastery-btn" data-val="Unpracticed">⏳ 未开始</div>
                    <div class="tm-mastery-btn" data-val="Reviewing">🔄 复习中</div>
                    <div class="tm-mastery-btn" data-val="Mastered">🏁 已完成</div>
                </div>
            </div>

            <div class="tm-side-footer">
                <button class="tm-btn-save">保存记录</button>
                <button class="tm-btn-reset">重置当前内容</button>
            </div>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * 在父页面（用户脚本）上下文中绑定 iframe 内交互。
     * srcdoc 内联脚本常被站点 CSP 拦截，导致 Tab / 自评等点击无响应。
     */
    function setupIframeUI(iframe, drawer, overlay, titleSlug) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        const iframeWin = iframe.contentWindow;
        if (!iframeDoc || !iframeWin || !iframeDoc.getElementById('tm-sidebar')) {
            console.warn('[LeetCode Note] setupIframeUI: iframe 文档未就绪');
            return;
        }

        const tabs = iframeDoc.querySelectorAll('.tm-tab');
        tabs.forEach((tab) => {
            tab.onclick = function () {
                const targetId = this.dataset.target;
                tabs.forEach((t) => t.classList.remove('active'));
                this.classList.add('active');
                iframeDoc.querySelectorAll('.tm-pane').forEach((p) => p.classList.remove('active'));
                const targetPane = iframeDoc.getElementById(targetId);
                if (targetPane) targetPane.classList.add('active');
            };
        });

        const difficultyGrid = iframeDoc.getElementById('difficulty-grid');
        if (difficultyGrid) {
            difficultyGrid.onclick = (e) => {
                const card = e.target.closest('.tm-rate-card');
                if (card) {
                    difficultyGrid.querySelectorAll('.tm-rate-card').forEach((c) => c.classList.remove('active'));
                    card.classList.add('active');
                }
            };
        }

        const masteryList = iframeDoc.getElementById('mastery-list');
        if (masteryList) {
            masteryList.onclick = (e) => {
                const btn = e.target.closest('.tm-mastery-btn');
                if (btn) {
                    masteryList.querySelectorAll('.tm-mastery-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            };
        }

        const progressStatusList = iframeDoc.getElementById('progress-status-list');
        if (progressStatusList) {
            progressStatusList.onclick = (e) => {
                const btn = e.target.closest('.tm-mastery-btn');
                if (btn) {
                    progressStatusList.querySelectorAll('.tm-mastery-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            };

            // 默认：复习中
            const active = progressStatusList.querySelector('.tm-mastery-btn.active');
            if (!active) {
                const def = progressStatusList.querySelector('[data-val="Reviewing"]');
                if (def) def.classList.add('active');
            }
        }

        const loadCodeBtn = iframeDoc.getElementById('load-code-btn');
        if (loadCodeBtn) {
            loadCodeBtn.onclick = () => {
                const prevText = loadCodeBtn.textContent;
                loadCodeBtn.textContent = '加载中…';
                loadCodeBtn.disabled = true;

                const finish = (code, source) => {
                    loadCodeBtn.textContent = prevText;
                    loadCodeBtn.disabled = false;
                    const codeTextarea = iframeDoc.querySelector('#pane-code .tm-code-editor');
                    if (codeTextarea) {
                        codeTextarea.value = code || '';
                        if (code) iframeWin.__originalCode = code;
                    }
                    if (!code) {
                        console.warn('[LeetCode Note] 未获取到代码（后端无已同步记录，页面编辑器也为空）');
                    } else {
                        console.log(`[LeetCode Note] 已加载代码（来源: ${source}，长度 ${code.length}）`);
                    }
                };

                // 1) 优先取本地后端的力扣已同步代码
                fetchUserSyncedCode(titleSlug, getCurrentLangSlug(), (code) => {
                    if (code) {
                        finish(code, '后端已同步');
                        return;
                    }
                    // 2) 回退：直接读取页面 Monaco 编辑器中的默认代码
                    const pageCode = getPageEditorCode();
                    finish(pageCode, '页面Monaco编辑器');
                });
            };
        }

        const resetCodeBtn = iframeDoc.getElementById('reset-code-btn');
        if (resetCodeBtn) {
            resetCodeBtn.onclick = () => {
                const codeTextarea = iframeDoc.querySelector('#pane-code .tm-code-editor');
                if (codeTextarea) codeTextarea.value = iframeWin.__originalCode || '';
            };
        }

        const closeBtn = iframeDoc.getElementById('close-drawer');
        if (closeBtn) {
            closeBtn.onclick = () => closeDrawer(drawer, overlay);
        }

        bindSaveEvent(iframe, titleSlug);
    }

    // 创建 Drawer 容器
    function createDrawer() {
        const overlay = document.createElement('div');
        overlay.id = 'leetcode-note-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const drawer = document.createElement('div');
        drawer.id = 'leetcode-note-drawer';
        drawer.style.cssText = `
            position: fixed;
            top: 0;
            right: -50%;
            width: 50%;
            height: 100vh;
            background: white;
            z-index: 9999;
            box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        const iframe = document.createElement('iframe');
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;

        drawer.appendChild(iframe);
        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        return { overlay, drawer, iframe };
    }

    // 用于避免“快速切换题目/重复打开抽屉”时出现回显竞态
    let latestLoadRequestId = 0;

    // 清空 iframe 内 note / code / active 状态，避免接口返回空时残留旧值
    function clearIframeContent(iframe) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        const noteTextarea = iframeDoc.querySelector('#pane-note .tm-textarea');
        if (noteTextarea) noteTextarea.value = '';

        const codeTextarea = iframeDoc.querySelector('#pane-code .tm-code-editor');
        if (codeTextarea) codeTextarea.value = '';

        const win = iframeDoc.defaultView || iframe.contentWindow;
        if (win) win.__originalCode = '';

        iframeDoc.querySelectorAll('.tm-rate-card.active').forEach((c) => c.classList.remove('active'));
        iframeDoc.querySelectorAll('.tm-mastery-btn.active').forEach((b) => b.classList.remove('active'));
    }

    // 打开 Drawer
    function openDrawer(drawer, overlay, iframe, titleSlug) {
        console.log('[LeetCode Note] 打开 Drawer，titleSlug:', titleSlug);

        const loadId = ++latestLoadRequestId;

        const problemInfo = getProblemInfo();
        const html = createDrawerHTML(problemInfo);

        overlay.style.display = 'block';
        setTimeout(() => overlay.style.opacity = '1', 10);

        drawer.style.right = '0';

        iframe.srcdoc = html;

        let iframeReadyDone = false;
        const runWhenIframeReady = () => {
            if (iframeReadyDone) return;
            const doc = iframe.contentDocument;
            if (!doc || !doc.getElementById('tm-sidebar')) return;

            // 如果这次打开已被更新请求覆盖，则不再绑定与回显
            if (loadId !== latestLoadRequestId) return;

            iframeReadyDone = true;
            console.log('[LeetCode Note] iframe 已就绪，绑定 UI');

            // 先清空，再回显（接口返回空时不应残留旧值）
            clearIframeContent(iframe);
            setupIframeUI(iframe, drawer, overlay, titleSlug);
            loadProblemData(iframe, titleSlug, loadId);
        };

        iframe.onload = () => {
            console.log('[LeetCode Note] iframe onload');
            runWhenIframeReady();
        };

        // 部分环境下 onload 不可靠，延迟再试一次（避免重复执行）
        setTimeout(runWhenIframeReady, 100);
        setTimeout(runWhenIframeReady, 500);
    }

    // 从 API 加载题目数据
    function loadProblemData(iframe, titleSlug, loadId) {
        const url = `${API_BASE_URL}/leetcode/user-problem/detail?titleSlug=${encodeURIComponent(titleSlug)}`;
        console.log('[LeetCode Note] 开始加载题目数据:', titleSlug);
        console.log('[LeetCode Note] 请求 URL:', url);

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: (response) => {
                console.log('[LeetCode Note] 收到响应:', response.status);
                console.log('[LeetCode Note] 响应内容:', response.responseText);
                try {
                    const data = JSON.parse(response.responseText);
                    console.log('[LeetCode Note] 解析数据:', data);

                    // 丢弃过期回显，避免覆盖新打开页面的内容
                    if (loadId !== latestLoadRequestId) {
                        console.log('[LeetCode Note] 忽略过期回显:', titleSlug);
                        return;
                    }

                    if (data.code === 0 && data.data) {
                        const problemData = data.data;
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                        console.log('[LeetCode Note] 填充数据到 iframe');

                        // 填充笔记
                        const noteTextarea = iframeDoc.querySelector('#pane-note .tm-textarea');
                        if (noteTextarea) {
                            noteTextarea.value = problemData.notes || '';
                            console.log('[LeetCode Note] 笔记已填充');
                        }

                        // 填充代码
                        const codeTextarea = iframeDoc.querySelector('#pane-code .tm-code-editor');
                        if (codeTextarea) {
                            const code = problemData.code || '';
                            codeTextarea.value = code;
                            iframeDoc.defaultView.__originalCode = code;
                            console.log('[LeetCode Note] 代码已填充');

                            // 本地未保存代码时，先从后端拉取力扣已同步完整代码，仍为空则读取页面编辑器默认代码
                            if (!code) {
                                fetchUserSyncedCode(titleSlug, getCurrentLangSlug(), (synced) => {
                                    const finalCode = synced || getPageEditorCode();
                                    if (!finalCode) return;
                                    const ta = iframeDoc.querySelector('#pane-code .tm-code-editor');
                                    if (ta) {
                                        ta.value = finalCode;
                                        iframeDoc.defaultView.__originalCode = finalCode;
                                        console.log('[LeetCode Note] 已自动填充默认代码（长度 %d，来源: %s）', finalCode.length, synced ? '后端已同步' : '页面Monaco编辑器');
                                    }
                                });
                            }
                        }

                        // 设置手感
                        if (problemData.personalDifficulty !== null && problemData.personalDifficulty !== undefined && problemData.personalDifficulty !== 0) {
                            const ratingCard = iframeDoc.querySelector(`[data-val="${problemData.personalDifficulty}"]`);
                            if (ratingCard) {
                                ratingCard.classList.add('active');
                                console.log('[LeetCode Note] 手感已设置:', problemData.personalDifficulty);
                            }
                        }

                        // 设置掌握程度
                        if (problemData.status && problemData.status !== '') {
                            const statusBtn = iframeDoc.querySelector(`#mastery-list [data-val="${problemData.status}"]`);
                            if (statusBtn) {
                                statusBtn.classList.add('active');
                                console.log('[LeetCode Note] 掌握程度已设置:', problemData.status);
                            }
                        }

                        // 设置完成状态（progressStatus）；默认复习中
                        // 注意：先清掉 setupIframeUI 里设置的默认高亮，避免双高亮
                        const progressList = iframeDoc.getElementById('progress-status-list');
                        if (progressList) {
                            progressList.querySelectorAll('.tm-mastery-btn.active').forEach((b) => b.classList.remove('active'));
                            const progressVal = problemData.progressStatus || 'Reviewing';
                            const progressBtn = progressList.querySelector(`[data-val="${progressVal}"]`) || progressList.querySelector('[data-val="Reviewing"]');
                            if (progressBtn) {
                                progressBtn.classList.add('active');
                                console.log('[LeetCode Note] 完成状态已设置:', progressVal);
                            }
                        }

                    } else {
                        console.log('[LeetCode Note] 数据为空或错误');
                        clearIframeContent(iframe);
                    }
                } catch (err) {
                    console.error('[LeetCode Note] 解析数据失败:', err);
                    console.error('[LeetCode Note] 原始响应:', response.responseText);

                    if (loadId === latestLoadRequestId) {
                        clearIframeContent(iframe);
                    }
                }
            },
            onerror: (err) => {
                console.error('[LeetCode Note] 加载题目数据失败:', err);

                if (loadId === latestLoadRequestId) {
                    clearIframeContent(iframe);
                }
            }
        });
    }

    // 绑定保存事件
    function bindSaveEvent(iframe, titleSlug) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const saveBtn = iframeDoc.querySelector('.tm-btn-save');

        if (saveBtn) {
            saveBtn.onclick = () => {
                const notes = iframeDoc.querySelector('#pane-note .tm-textarea').value;
                const code = iframeDoc.querySelector('#pane-code .tm-code-editor').value;
                const difficulty = iframeDoc.querySelector('.tm-rate-card.active')?.dataset.val || 0;
                const status = iframeDoc.querySelector('#mastery-list .tm-mastery-btn.active')?.dataset.val || '';
                const progressStatus = iframeDoc.querySelector('#progress-status-list .tm-mastery-btn.active')?.dataset.val || 'Reviewing';

                const payload = {
                    titleSlug,
                    notes,
                    code,
                    personalDifficulty: parseInt(difficulty),
                    status,
                    progressStatus
                };

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${API_BASE_URL}/leetcode/user-problem/save-v2`,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(payload),
                    onload: (response) => {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (data.code === 0) {
                                saveBtn.innerText = '已保存 ✓';
                                saveBtn.style.background = '#28a745';
                                setTimeout(() => {
                                    window.parent.postMessage({ type: 'closeDrawer' }, '*');
                                }, 1000);
                            }
                        } catch (err) {
                            console.error('解析响应失败:', err);
                        }
                    },
                    onerror: (err) => {
                        console.error('保存失败:', err);
                    }
                });
            };
        }

        const resetBtn = iframeDoc.querySelector('.tm-btn-reset');
        if (resetBtn) {
            resetBtn.onclick = () => {
                const noteTextarea = iframeDoc.querySelector('#pane-note .tm-textarea');
                const codeTextarea = iframeDoc.querySelector('#pane-code .tm-code-editor');
                if (noteTextarea) noteTextarea.value = '';
                if (codeTextarea) codeTextarea.value = '';
                iframeDoc.querySelectorAll('.tm-rate-card.active').forEach(c => c.classList.remove('active'));
                iframeDoc.querySelectorAll('.tm-mastery-btn.active').forEach(b => b.classList.remove('active'));
                const defaultProgress = iframeDoc.querySelector('#progress-status-list [data-val="Reviewing"]');
                if (defaultProgress) defaultProgress.classList.add('active');
            };
        }
    }

    function closeDrawer(drawer, overlay) {
        drawer.style.right = '-50%';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 300);
    }

    // 初始化
    function init() {
        // 查找最后一个按钮容器（问下 Leet 按钮的父容器）
        waitForElement('[aria-label="问下 Leet"]', (aiButton) => {
            const container = aiButton.closest('.relative.flex.rounded');
            if (!container) return;

            const problemInfo = getProblemInfo();

            // 创建按钮
            const button = createButton();
            container.parentNode.insertBefore(button, container.nextSibling);

            // 创建 Drawer
            const { overlay, drawer, iframe } = createDrawer();

            // 绑定事件
            button.onclick = () => openDrawer(drawer, overlay, iframe, problemInfo.titleSlug);
            overlay.onclick = () => closeDrawer(drawer, overlay);

            // 保存成功后 iframe 内仍通过 postMessage 请求关闭
            window.addEventListener('message', (event) => {
                if (event.data.type === 'closeDrawer') {
                    closeDrawer(drawer, overlay);
                }
            });
        });
    }

    // 启动脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
