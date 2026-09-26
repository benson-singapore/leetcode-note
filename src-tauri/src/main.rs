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

/// 哨兵 URL scheme：注入的工具栏按钮通过导航到该 scheme 触发 Rust 端
/// on_navigation 拦截，从而用系统浏览器打开页面（无需 IPC / 远程域授权）。
const OPEN_SENTINEL_SCHEME: &str = "lcn-open";

/// 注入到内嵌页面的悬浮工具栏（documentStart 用户脚本，每次导航都会重新注入）。
/// 在页面右上角挂一个「默认浏览器打开」按钮；点击时导航到哨兵 scheme，
/// 由 Rust 端拦截该导航并调用系统默认浏览器。
const EMBED_TOOLBAR_SCRIPT: &str = r#"(function () {
  if (window.__LCN_TOOLBAR_INJECTED__) return;
  window.__LCN_TOOLBAR_INJECTED__ = true;

  var SCHEME = 'lcn-open';

  function createToolbar() {
    if (document.getElementById('lcn-embed-toolbar') || !document.body) return;
    var bar = document.createElement('div');
    bar.id = 'lcn-embed-toolbar';
    bar.style.cssText = 'position:fixed;top:64px;right:14px;z-index:2147483647;'
      + 'display:flex;align-items:center;gap:6px;'
      + 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;';

    var btn = document.createElement('button');
    btn.textContent = '默认浏览器打开 ↗';
    btn.title = '使用系统默认浏览器打开当前页面';
    btn.style.cssText = 'height:30px;padding:0 14px;border:none;border-radius:15px;'
      + 'background:#16a34a;color:#fff;font-size:12px;font-weight:600;cursor:pointer;'
      + 'box-shadow:0 4px 12px rgba(22,163,74,.35);white-space:nowrap;opacity:.85;'
      + 'transition:opacity .15s,transform .1s;';
    btn.onmouseenter = function () { btn.style.opacity = '1'; };
    btn.onmouseleave = function () { btn.style.opacity = '.85'; };
    btn.onmousedown = function () { btn.style.transform = 'scale(0.95)'; };
    btn.onmouseup = function () { btn.style.transform = ''; };
    btn.onclick = function () {
      window.location.href = SCHEME + '://open?u=' + encodeURIComponent(window.location.href);
    };
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  // documentStart 时 body 尚未就绪，轮询挂载；之后低频自愈（SPA 重建 body 时自动补回）
  var timer = setInterval(function () {
    createToolbar();
  }, 800);
  setTimeout(function () { clearInterval(timer); }, 15000);
  document.addEventListener('DOMContentLoaded', createToolbar);
})();"#;

/// 打开内嵌 LeetCode 浏览器窗口：webview 顶层直接加载目标页面（第一方
/// 上下文，与登录窗口共用默认 Cookie 存储，因此已登录），并通过注入的
/// 用户脚本在页面右上角挂「默认浏览器打开」悬浮按钮。
#[tauri::command]
fn open_embedded_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| format!("无效 URL: {e}"))?;

    // 已打开则复用：直接导航到新地址并聚焦
    if let Some(win) = app.get_webview_window(EMBED_BROWSER_WINDOW) {
        win.navigate(parsed).map_err(|e| e.to_string())?;
        win.show().ok();
        win.set_focus().ok();
        return Ok(());
    }

    let app_handle = app.clone();

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        EMBED_BROWSER_WINDOW,
        tauri::WebviewUrl::External(parsed),
    )
    .title("LeetCode 内嵌浏览")
    .inner_size(1000.0, 760.0)
    .min_inner_size(480.0, 480.0)
    .initialization_script(EMBED_TOOLBAR_SCRIPT)
    .on_navigation(move |nav_url| {
        // 拦截工具栏按钮触发的哨兵导航：取消导航并改用系统浏览器打开
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
    })
    .build()
    .map_err(|e| format!("创建内嵌浏览器窗口失败: {e}"))?;

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
            // 点关闭按钮隐藏到托盘而不是退出
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
