use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const SIDECAR_NAME: &str = "leetcode-note-server";
const SERVER_HOST: &str = "127.0.0.1";
/// 默认端口：浏览器调试时 Vite 代理固定指向它；被占用时自动向后寻找
const SERVER_PORT_BASE: u16 = 17877;

/// 侧车进程句柄（退出时统一回收）
struct SidecarChild(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// 服务端信息（暴露给前端）
#[derive(Serialize, Clone)]
struct ServerInfo {
    port: u16,
    base_url: String,
}

#[tauri::command]
fn get_server_info(state: tauri::State<ServerInfo>) -> ServerInfo {
    state.inner().clone()
}

/// 打开 LeetCode 登录窗口：用户在窗口内正常登录，
/// 成功跳转回主站后自动抓取 Cookie，通过事件 `leetcode-login-result` 回传给主窗口
/// region: "cn" 力扣中国 (leetcode.cn)，"com" 国际站 (leetcode.com)，默认 cn
#[tauri::command]
fn open_leetcode_login(app: tauri::AppHandle, region: Option<String>) -> Result<(), String> {
    // 若已存在登录窗口则直接聚焦复用
    if let Some(win) = app.get_webview_window("leetcode-login") {
        win.show().ok();
        win.set_focus().ok();
        return Ok(());
    }

    let is_com = matches!(region.as_deref(), Some("com"));
    let domain: &str = if is_com { "leetcode.com" } else { "leetcode.cn" };
    let login_url: tauri::Url = if is_com {
        "https://leetcode.com/accounts/login/"
    } else {
        "https://leetcode.cn/accounts/login/"
    }
    .parse()
    .map_err(|e| format!("无效 URL: {e}"))?;

    let app_handle = app.clone();
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        "leetcode-login",
        tauri::WebviewUrl::External(login_url),
    )
    .title("登录 LeetCode")
    .inner_size(1000.0, 720.0)
    .center()
    .on_navigation(move |url| {
        // 登录成功后 LeetCode 会跳转回主站；此时 csrftoken / LEETCODE_SESSION 已写入
        let is_leetcode_domain = url.domain() == Some(domain);
        let is_logged_in = is_leetcode_domain
            && url.path() != "/accounts/login/"
            && url.path() != "/accounts/signup/";

        if is_logged_in {
            let app = app_handle.clone();
            let url = url.clone();
            // 放到后台线程执行，避免阻塞导航回调
            tauri::async_runtime::spawn(async move {
                emit_login_cookies(&app, &url.to_string());
            });
        }
        // 返回 true 允许导航继续
        true
    })
    .build()
    .map_err(|e| format!("创建登录窗口失败: {e}"))?;

    let _ = window;

    Ok(())
}

#[derive(Serialize, Clone)]
struct LoginResultPayload {
    success: bool,
    cookie: String,
    url: String,
    message: String,
}

/// 通过 cookie store 读取 leetcode.cn 的全部 Cookie（含 HttpOnly 的 LEETCODE_SESSION）并 emit 给主窗口
fn emit_login_cookies(app: &tauri::AppHandle, url: &str) {
    let Some(win) = app.get_webview_window("leetcode-login") else {
        return;
    };

    // 等待 Cookie 写盘完成
    std::thread::sleep(Duration::from_millis(1500));

    let parsed_url: tauri::Url = url.parse().unwrap_or_else(|_| "https://leetcode.cn/".parse().unwrap());
    let cookies = match win.cookies_for_url(parsed_url) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[login] 获取 Cookie 失败: {e}");
            return;
        }
    };

    let cookie_string = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");

    let has_session = cookies.iter().any(|c| c.name() == "LEETCODE_SESSION");
    let payload = LoginResultPayload {
        success: has_session,
        cookie: cookie_string,
        url: url.to_string(),
        message: if has_session {
            "登录成功，Cookie 已获取".to_string()
        } else {
            "未能读取到登录 Cookie，请重试".to_string()
        },
    };
    let _ = tauri::Emitter::emit(app, "leetcode-login-result", payload);

    // 成功后自动关闭登录窗口
    if has_session {
        if let Some(win) = app.get_webview_window("leetcode-login") {
            let _ = win.close();
        }
    }
}

/// 手动从登录窗口抓取 Cookie（供前端「已登录但未自动触发」时使用）
#[tauri::command]
fn capture_login_cookie(app: tauri::AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window("leetcode-login") else {
        return Err("登录窗口未打开".to_string());
    };
    let url = win.url().map_err(|e| e.to_string())?;
    emit_login_cookies(&app, &url.to_string());
    Ok(())
}

/// 关闭登录窗口（用户手动取消时）
#[tauri::command]
fn close_leetcode_login(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("leetcode-login") {
        let _ = win.close();
    }
}

// ===== 内嵌 LeetCode 浏览器 =====

const EMBED_BROWSER_WINDOW: &str = "leetcode-embed";

/// 哨兵 URL scheme：顶部按钮通过导航到该 scheme 触发 Rust 端 on_navigation，
/// 将当前题目页交给系统默认浏览器打开。
const OPEN_SENTINEL_SCHEME: &str = "lcn-open";

#[derive(Serialize)]
struct EmbeddedApiResponse {
    status: u16,
    response_text: String,
}

/// 通过本机 sidecar 转发内嵌 LeetCode 页面的笔记 API，绕过站点 CSP/CORS。
#[tauri::command]
fn embedded_local_api_request(
    state: tauri::State<ServerInfo>,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<EmbeddedApiResponse, String> {
    if path.bytes().any(|byte| byte <= 0x20 || byte == 0x7f) {
        return Err("本地 API 路径包含非法字符".to_string());
    }
    let valid_path = [
        ("GET", "/api/v1/leetcode/user-problem/detail"),
        ("POST", "/api/v1/leetcode/user-problem/save-v2"),
        ("GET", "/api/v1/leetcode/user-synced-code"),
    ]
    .iter()
    .any(|(allowed_method, endpoint)| {
        method.eq_ignore_ascii_case(allowed_method)
            && (path == *endpoint || path.starts_with(&format!("{endpoint}?")))
    });
    if !valid_path {
        return Err("不允许访问此本地 API 路径".to_string());
    }
    let method = method.to_ascii_uppercase();
    if !matches!(method.as_str(), "GET" | "POST") {
        return Err("不支持的本地 API 请求方法".to_string());
    }

    let payload = body.unwrap_or_default();
    let mut stream = TcpStream::connect((SERVER_HOST, state.port)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(8)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(8)))
        .map_err(|e| e.to_string())?;
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {SERVER_HOST}:{}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        state.port,
        payload.as_bytes().len()
    );
    stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|e| e.to_string())?;

    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "本地 API 返回了无效 HTTP 响应".to_string())?;
    let headers = String::from_utf8_lossy(&response[..split]);
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "无法读取本地 API 响应状态".to_string())?;
    let raw_body = &response[split + 4..];
    let decoded_body = if headers
        .lines()
        .any(|line| line.eq_ignore_ascii_case("transfer-encoding: chunked"))
    {
        decode_chunked_body(raw_body)?
    } else {
        raw_body.to_vec()
    };

    Ok(EmbeddedApiResponse {
        status,
        response_text: String::from_utf8_lossy(&decoded_body).into_owned(),
    })
}

fn decode_chunked_body(mut input: &[u8]) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    loop {
        let line_end = input
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or_else(|| "本地 API 分块响应格式无效".to_string())?;
        let size_text = std::str::from_utf8(&input[..line_end])
            .map_err(|e| e.to_string())?
            .split(';')
            .next()
            .unwrap_or("");
        let size = usize::from_str_radix(size_text.trim(), 16).map_err(|e| e.to_string())?;
        input = &input[line_end + 2..];
        if size == 0 {
            break;
        }
        if input.len() < size + 2 || &input[size..size + 2] != b"\r\n" {
            return Err("本地 API 分块响应长度无效".to_string());
        }
        output.extend_from_slice(&input[..size]);
        input = &input[size + 2..];
    }
    Ok(output)
}

/// 内嵌浏览器窗口的自定义顶部栏高度（与隐藏后的 macOS 标题栏高度接近）。
const EMBED_TOPBAR_HEIGHT: u32 = 32;

/// 注入到内嵌页面的自定义顶部 header 栏（documentStart 用户脚本，每次导航都会重新注入）。
/// 该栏固定在页面最顶部，充当窗口标题栏：左侧留出 macOS 红绿灯位置，
/// 右侧放「默认浏览器打开」按钮（点击后导航到哨兵 scheme，由 Rust 端拦截并交给系统浏览器）。
/// 同时给 <html> 增加等高内边距，把页面内容整体下移，避免遮挡 LeetCode 页面。
const EMBED_TOPBAR_SCRIPT: &str = r#"(function () {
  if (window.__LCN_TOPBAR_INJECTED__) return;
  window.__LCN_TOPBAR_INJECTED__ = true;

  var SCHEME = 'lcn-open';
  var BAR_ID = 'lcn-embed-topbar';
  var STYLE_ID = 'lcn-embed-topbar-style';
  var BAR_HEIGHT = __LCN_TOPBAR_HEIGHT__;

  var CSS = [
    'html.lcn-has-topbar{padding-top:' + BAR_HEIGHT + 'px!important;box-sizing:border-box!important;}',
    '#' + BAR_ID + '{position:fixed;top:0;left:0;right:0;height:' + BAR_HEIGHT + 'px;',
    'z-index:2147483647;display:flex;align-items:center;justify-content:flex-end;',
    'padding:0 12px 0 84px;background:rgba(250,251,252,.9);',
    '-webkit-backdrop-filter:saturate(180%) blur(12px);backdrop-filter:saturate(180%) blur(12px);',
    'border-bottom:1px solid rgba(15,23,42,.08);',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
    'user-select:none;-webkit-user-select:none;}',
    '#' + BAR_ID + ' .lcn-topbar-title{position:absolute;left:50%;top:50%;',
    'transform:translate(-50%,-50%);font-size:11px;font-weight:600;color:#64748b;',
    'letter-spacing:.3px;pointer-events:none;white-space:nowrap;}',
    '#' + BAR_ID + ' .lcn-open-btn{position:relative;display:inline-flex;align-items:center;gap:5px;',
    'height:22px;padding:0 10px;border:1px solid #d7e0ea;border-radius:7px;background:#fff;',
    'color:#334155;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;',
    'box-shadow:0 1px 2px rgba(15,23,42,.06);transition:background .15s,border-color .15s,transform .1s;}',
    '#' + BAR_ID + ' .lcn-open-btn:hover{background:#f1f5f9;border-color:#c3cfdd;}',
    '#' + BAR_ID + ' .lcn-open-btn:active{transform:scale(.96);}',
    '#' + BAR_ID + ' .lcn-open-btn svg{width:11px;height:11px;}'
  ].join('');

  function injectTopbarStyle() {
    if (!document.getElementById(STYLE_ID)) {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    if (document.documentElement) {
      document.documentElement.classList.add('lcn-has-topbar');
    }
  }

  function createTopbar() {
    if (document.getElementById(BAR_ID) || !document.body) return;
    injectTopbarStyle();

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    // "deep"：整条栏（除可点击元素外）都可拖动窗口
    bar.setAttribute('data-tauri-drag-region', 'deep');

    var title = document.createElement('span');
    title.className = 'lcn-topbar-title';
    title.textContent = 'LeetCode 内嵌浏览';
    bar.appendChild(title);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lcn-open-btn';
    btn.title = '使用系统默认浏览器打开当前页面';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
      + 'stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>'
      + '<polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>'
      + '<span>默认浏览器打开</span>';
    btn.onclick = function () {
      window.location.href = SCHEME + '://open?u=' + encodeURIComponent(window.location.href);
    };
    bar.appendChild(btn);

    document.body.appendChild(bar);
  }

  // documentStart 时 body 尚未就绪，轮询挂载；之后低频自愈（SPA 重建 body 时自动补回）
  var timer = setInterval(createTopbar, 800);
  setTimeout(function () { clearInterval(timer); }, 15000);
  document.addEventListener('DOMContentLoaded', createTopbar);
})();"#;

/// 打开内嵌 LeetCode 浏览器窗口：webview 顶层直接加载目标页面（第一方
/// 上下文，与登录窗口共用默认 Cookie 存储，因此已登录），并通过注入的
/// 用户脚本在窗口最顶部挂一条自定义 header 栏（含「默认浏览器打开」按钮与拖拽区）。
#[tauri::command]
fn open_embedded_browser(
    app: tauri::AppHandle,
    url: String,
    notes_enabled: Option<bool>,
    api_host: Option<String>,
) -> Result<(), String> {
    let notes_enabled = notes_enabled.unwrap_or(true);
    let api_host = api_host.unwrap_or_else(|| format!("http://{SERVER_HOST}:{SERVER_PORT_BASE}"));
    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| format!("无效 URL: {e}"))?;

    if !matches!(parsed.host_str(), Some("leetcode.cn") | Some("leetcode.com")) {
        return Err("内置浏览器只允许打开 LeetCode 站点".to_string());
    }

    // 已打开则复用：地址变化时导航，否则只聚焦（避免重复加载丢失页面状态）
    if let Some(win) = app.get_webview_window(EMBED_BROWSER_WINDOW) {
        let enabled = if notes_enabled { "true" } else { "false" };
        win.eval(&format!("sessionStorage.setItem('lcn-notes-enabled', '{enabled}')"))
            .map_err(|e| e.to_string())?;
        let same_page = win
            .url()
            .map(|current| {
                current.as_str().trim_end_matches('/') == parsed.as_str().trim_end_matches('/')
            })
            .unwrap_or(false);
        if !same_page {
            win.navigate(parsed).map_err(|e| e.to_string())?;
        }
        win.show().ok();
        win.set_focus().ok();
        return Ok(());
    }

    let app_handle = app.clone();

    let mut target = parsed;
    if notes_enabled {
        target.query_pairs_mut().append_pair("__lcn_notes", "1");
    }

    let api_host = api_host.trim_end_matches('/');
    let user_script = include_str!("../../tamper-monkey/leetcode-note-drawer.user.js")
        .replace(
            "const API_HOST = 'http://127.0.0.1:17877';",
            &format!("const API_HOST = '{}';", api_host.replace('\'', "")),
        );
    let notes_injection = format!(
        r#"(function() {{
          var u = new URL(location.href);
          var enabled = sessionStorage.getItem('lcn-notes-enabled') === 'true' || u.searchParams.get('__lcn_notes') === '1';
          if (u.searchParams.has('__lcn_notes')) {{
            u.searchParams.delete('__lcn_notes');
            history.replaceState(history.state, '', u.pathname + u.search + u.hash);
          }}
          sessionStorage.setItem('lcn-notes-enabled', enabled ? 'true' : 'false');
          // 题目页 /problems/... 与题库页 /problemset/... 都注入笔记插件；
          // 从题库页 SPA 进入具体题目时由用户脚本自行挂载入口并加载对应数据。
          if (!enabled || !/^\/problems(et)?\//.test(location.pathname)) return;
          window.GM_xmlhttpRequest = function(options) {{
            var tauri = window.__TAURI_INTERNALS__;
            if (!tauri || typeof tauri.invoke !== 'function') {{
              if (options.onerror) options.onerror(new Error('Tauri 本地 API 桥接不可用'));
              return;
            }}
            var requestUrl = new URL(options.url);
            tauri.invoke('embedded_local_api_request', {{
              method: options.method || 'GET',
              path: requestUrl.pathname + requestUrl.search,
              body: options.data === undefined ? null : options.data
            }}).then(function(response) {{
              if (options.onload) options.onload({{ status: response.status, responseText: response.response_text }});
            }}).catch(function(error) {{ if (options.onerror) options.onerror(error); }});
          }};
          {user_script}
        }})();"#
    );

    let topbar_script = EMBED_TOPBAR_SCRIPT
        .replace("__LCN_TOPBAR_HEIGHT__", &EMBED_TOPBAR_HEIGHT.to_string());

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        EMBED_BROWSER_WINDOW,
        tauri::WebviewUrl::External(target),
    )
    .title("LeetCode 内嵌浏览")
    .inner_size(1280.0, 860.0)
    .min_inner_size(720.0, 560.0)
    .center()
    // 先不显示，定位到与主窗口错开的位置后再显示，避免闪一下居中再跳位
    .visible(false)
    .initialization_script(&topbar_script)
    .initialization_script(&notes_injection)
    .on_navigation(move |nav_url| {
        // 拦截顶部栏按钮触发的哨兵导航：取消导航并改用系统浏览器打开
        if nav_url.scheme() == OPEN_SENTINEL_SCHEME {
            let target = nav_url
                .query_pairs()
                .find(|(k, _)| k == "u")
                .map(|(_, v)| v.to_string());
            if let Some(target) = target {
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let opener_app = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        use tauri_plugin_opener::OpenerExt;
                        if let Err(e) = opener_app.opener().open_url(target, None::<&str>) {
                            eprintln!("[embed] 用系统浏览器打开失败: {e}");
                        }
                    });
                });
            }
            return false;
        }
        true
    });

    // macOS：隐藏系统标题栏（保留红绿灯），由页面内注入的自定义顶部栏承担标题栏职责
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    let window = builder
        .build()
        .map_err(|e| format!("创建内嵌浏览器窗口失败: {e}"))?;

    // 相对主窗口错开显示（右下偏移），避免与主界面完全重叠
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(pos) = main.outer_position() {
            let scale = main.scale_factor().unwrap_or(1.0);
            let offset = (64.0 * scale) as i32;
            let _ = window.set_position(tauri::PhysicalPosition::new(pos.x + offset, pos.y + offset));
        }
    }
    let _ = window.show();

    // 用户通过标题栏原生关闭时，通知主窗口清理状态
    {
        use tauri::Emitter;
        let app_handle = window.app_handle().clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let _ = app_handle.emit_to("main", "leetcode-embed-closed", ());
            }
        });
    }

    let _ = window.set_focus();

    Ok(())
}

/// 关闭内嵌浏览器窗口
#[tauri::command]
fn close_embedded_browser(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window(EMBED_BROWSER_WINDOW) {
        let _ = win.close();
    }
}

/// 用系统默认浏览器打开 URL
#[tauri::command]
fn open_in_system_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// 挑选端口：优先固定默认端口（便于浏览器调试），被占用则向后寻找
fn pick_free_port() -> std::io::Result<u16> {
    for offset in 0..20 {
        let port = SERVER_PORT_BASE + offset;
        if TcpListener::bind((SERVER_HOST, port)).is_ok() {
            return Ok(port);
        }
    }
    let listener = TcpListener::bind((SERVER_HOST, 0))?;
    let port = listener.local_addr()?.port();
    Ok(port)
}

/// 轮询等待 sidecar HTTP 服务就绪
fn wait_for_health(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(mut stream) = TcpStream::connect((SERVER_HOST, port)) {
            use std::io::Write;
            let req = format!("GET /health HTTP/1.1\r\nHost: {SERVER_HOST}:{port}\r\nConnection: close\r\n\r\n");
            if stream.write_all(req.as_bytes()).is_ok() {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn spawn_sidecar(app: &tauri::AppHandle, port: u16) -> tauri::Result<()> {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("无法获取应用数据目录");
    std::fs::create_dir_all(&data_dir).ok();

    let sidecar = app
        .shell()
        .sidecar(SIDECAR_NAME)
        .expect("sidecar 二进制未找到，请先执行构建脚本")
        .args(["--port", &port.to_string(), "--data-dir", &data_dir.to_string_lossy()]);

    let (mut rx, child) = sidecar.spawn().expect("启动 sidecar 失败");

    // 保存句柄用于退出时回收
    let state: tauri::State<SidecarChild> = app.state();
    *state.0.lock().unwrap() = Some(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[sidecar] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[sidecar] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[sidecar] 进程退出: {:?}", status);
                    break;
                }
                CommandEvent::Error(err) => {
                    eprintln!("[sidecar] 错误: {err}");
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn main() {
    let port = pick_free_port().expect("无法分配端口");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarChild(std::sync::Mutex::new(None)))
        .manage(ServerInfo {
            port,
            base_url: format!("http://{SERVER_HOST}:{port}"),
        })
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            open_leetcode_login,
            capture_login_cookie,
            close_leetcode_login,
            embedded_local_api_request,
            open_embedded_browser,
            close_embedded_browser,
            open_in_system_browser
        ])
        .setup(move |app| {
            // 系统托盘
            if let Some(tray) = app.tray_by_id("main-tray") {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::tray::TrayIconEvent;

                let show = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                let menu = MenuBuilder::new(app).item(&show).separator().item(&quit).build()?;
                let _ = tray.set_menu(Some(menu));

                tray.on_menu_event(|app_handle, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(win) = app_handle.get_webview_window("main") {
                            win.show().ok();
                            win.set_focus().ok();
                        }
                    }
                    "quit" => app_handle.exit(0),
                    _ => {}
                });

                tray.on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            win.show().ok();
                            win.set_focus().ok();
                        }
                    }
                });
            }

            // 启动 Go sidecar
            spawn_sidecar(app.handle(), port)?;

            std::thread::spawn(move || {
                if wait_for_health(port, Duration::from_secs(15)) {
                    println!("sidecar 服务已就绪: http://{SERVER_HOST}:{port}");
                } else {
                    eprintln!("sidecar 服务启动超时 (port {port})");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // 仅主窗口点关闭按钮时隐藏到托盘；登录窗口 / 内嵌浏览器
            // 必须真正关闭（否则关闭后无法再次打开）。
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.hide().ok();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // 退出时确保回收 sidecar 进程
                let state: tauri::State<SidecarChild> = app.state();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        });
}
