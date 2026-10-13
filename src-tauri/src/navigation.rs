//! Keeps the webview on the app's own pages. Anything else that would navigate the
//! top-level frame (e.g. WKWebView's context-menu "Open Link") goes to the system instead.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

/// True for the origins that serve the bundled frontend: `tauri://localhost`,
/// `http://tauri.localhost`, and the Vite dev server at `http://localhost:1420`.
pub fn is_app_url(url: &Url) -> bool {
    match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) => true,
        ("http", Some("tauri.localhost"), None) => true,
        ("http", Some("localhost"), Some(1420)) => true,
        _ => false,
    }
}

fn should_open_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

pub fn guard<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("folio-navigation")
        .on_navigation(|webview, url| {
            if is_app_url(url) {
                return true;
            }
            if should_open_externally(url) {
                let _ = webview.app_handle().opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn allows_only_app_origins() {
        assert!(is_app_url(&url("tauri://localhost/")));
        assert!(is_app_url(&url("tauri://localhost/index.html")));
        assert!(is_app_url(&url("http://tauri.localhost/")));
        assert!(is_app_url(&url("http://localhost:1420/")));
    }

    #[test]
    fn denies_everything_else() {
        assert!(!is_app_url(&url("https://example.com/")));
        assert!(!is_app_url(&url("http://localhost:8080/")));
        assert!(!is_app_url(&url("https://tauri.localhost/")));
        assert!(!is_app_url(&url("file:///etc/passwd")));
        assert!(!is_app_url(&url("javascript:alert(1)")));
        assert!(!is_app_url(&url("tauri://evil/")));
    }

    #[test]
    fn hands_only_web_and_mail_urls_to_the_system() {
        assert!(should_open_externally(&url("https://example.com/")));
        assert!(should_open_externally(&url("mailto:a@b.co")));
        assert!(!should_open_externally(&url("file:///etc/passwd")));
        assert!(!should_open_externally(&url("javascript:alert(1)")));
    }
}
