use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

pub const CHECK_FOR_UPDATES: &str = "check-for-updates";
const QUIT: &str = "quit";
/// How long a hung webview gets to acknowledge a quit request before Rust exits anyway.
const QUIT_ACK_TIMEOUT: Duration = Duration::from_secs(3);

/// Whether the webview has acknowledged the latest quit request. Once it has, the frontend owns
/// the quit (it may be showing a Leave/Stay dialog) and calls `quit` itself.
#[derive(Default)]
pub struct QuitRequest(AtomicBool);

impl QuitRequest {
    fn begin(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
    fn acknowledged(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[tauri::command]
pub fn quit_acknowledged(request: State<QuitRequest>) {
    request.0.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

/// The menu ids the frontend handles, forwarded as `menu-action` events.
pub fn action_for(id: &str) -> Option<&'static str> {
    match id {
        "new-post" => Some("new-post"),
        "open-posts" => Some("open-posts"),
        "copy-for-substack" => Some("copy-for-substack"),
        "daily-report" => Some("daily-report"),
        "daily-report-guide" => Some("daily-report-guide"),
        QUIT => Some("quit"),
        _ => None,
    }
}

/// Tauri's default macOS menu, plus Check for Updates… in the app menu, a File menu for posts and the
/// daily report, and a Help menu with Folio's guides.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        ..Default::default()
    };
    let folio = SubmenuBuilder::new(app, "Folio")
        .about(Some(about))
        .separator()
        .text(CHECK_FOR_UPDATES, "Check for Updates…")
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&MenuItemBuilder::with_id(QUIT, "Quit Folio").accelerator("CmdOrCtrl+Q").build(app)?)
        .build()?;
    let new_post = MenuItemBuilder::with_id("new-post", "New Post").accelerator("CmdOrCtrl+N").build(app)?;
    let open_posts = MenuItemBuilder::with_id("open-posts", "Open Posts…").accelerator("CmdOrCtrl+Shift+P").build(app)?;
    let daily_report = MenuItemBuilder::with_id("daily-report", "Daily Report").accelerator("CmdOrCtrl+Shift+R").build(app)?;
    let file = SubmenuBuilder::new(app, "File").item(&new_post).item(&open_posts).separator().item(&daily_report).build()?;
    let copy_for_substack = MenuItemBuilder::with_id("copy-for-substack", "Copy for Substack").accelerator("CmdOrCtrl+Shift+C").build(app)?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&copy_for_substack)
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    // The window-menu id lets macOS list open windows in it.
    let window = SubmenuBuilder::with_id(app, WINDOW_SUBMENU_ID, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    // The help-menu id gives it macOS's menu search field.
    let help = SubmenuBuilder::with_id(app, HELP_SUBMENU_ID, "Help").text("daily-report-guide", "Build a Daily Report").build()?;
    MenuBuilder::new(app).items(&[&folio, &file, &edit, &view, &window, &help]).build()
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id().0 == CHECK_FOR_UPDATES {
        let _ = app.emit("menu-check-for-updates", ());
    } else if let Some(action) = action_for(&event.id().0) {
        let _ = app.emit("menu-action", action);
        if action == QUIT {
            start_quit_fallback(app);
        }
    }
}

/// The webview saves the open post and then calls `quit`. If it never even acknowledges the
/// request, exit so a hung webview can't block quitting.
fn start_quit_fallback<R: Runtime>(app: &AppHandle<R>) {
    app.state::<QuitRequest>().begin();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_ACK_TIMEOUT);
        if !app.state::<QuitRequest>().acknowledged() {
            app.exit(0);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_menu_actions() {
        assert_eq!(action_for("new-post"), Some("new-post"));
        assert_eq!(action_for("open-posts"), Some("open-posts"));
        assert_eq!(action_for("copy-for-substack"), Some("copy-for-substack"));
        assert_eq!(action_for("daily-report"), Some("daily-report"));
        assert_eq!(action_for("daily-report-guide"), Some("daily-report-guide"));
        assert_eq!(action_for("quit"), Some("quit"));
        assert_eq!(action_for("check-for-updates"), None);
    }
}
