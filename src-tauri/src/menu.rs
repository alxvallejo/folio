use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Runtime};

pub const CHECK_FOR_UPDATES: &str = "check-for-updates";

/// The menu ids the frontend handles, forwarded as `menu-action` events.
pub fn action_for(id: &str) -> Option<&'static str> {
    match id {
        "new-post" => Some("new-post"),
        "open-posts" => Some("open-posts"),
        "copy-for-substack" => Some("copy-for-substack"),
        _ => None,
    }
}

/// Tauri's default macOS menu, minus Help, plus Check for Updates… in the app menu and a File menu for posts.
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
        .quit()
        .build()?;
    let new_post = MenuItemBuilder::with_id("new-post", "New Post").accelerator("CmdOrCtrl+N").build(app)?;
    let open_posts = MenuItemBuilder::with_id("open-posts", "Open Posts…").accelerator("CmdOrCtrl+Shift+P").build(app)?;
    let file = SubmenuBuilder::new(app, "File").item(&new_post).item(&open_posts).build()?;
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
    MenuBuilder::new(app).items(&[&folio, &file, &edit, &view, &window]).build()
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id().0 == CHECK_FOR_UPDATES {
        let _ = app.emit("menu-check-for-updates", ());
    } else if let Some(action) = action_for(&event.id().0) {
        let _ = app.emit("menu-action", action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_menu_actions() {
        assert_eq!(action_for("new-post"), Some("new-post"));
        assert_eq!(action_for("open-posts"), Some("open-posts"));
        assert_eq!(action_for("copy-for-substack"), Some("copy-for-substack"));
        assert_eq!(action_for("check-for-updates"), None);
    }
}
