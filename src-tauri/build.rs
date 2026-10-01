fn main() {
    // 声明应用自身的命令清单。Tauri v2 对于「远程来源」（内嵌 LeetCode 页面）
    // 只允许调用在 ACL 清单中登记过、且被 capability 授予权限的命令，
    // 否则会以 "Command xxx not allowed by ACL" 拒绝。
    // 登记后即可在 src-tauri/capabilities/*.json 中用 allow-<command> 授权。
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_server_info",
            "open_leetcode_login",
            "capture_login_cookie",
            "close_leetcode_login",
            "open_leetcode_cloudflare_verification",
            "capture_leetcode_cloudflare_cookies",
            "embedded_local_api_request",
            "open_embedded_browser",
            "close_embedded_browser",
            "open_in_system_browser",
        ]),
    ))
    .expect("failed to run tauri-build");
}
