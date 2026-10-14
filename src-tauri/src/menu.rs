use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuEvent, SubmenuBuilder, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Runtime};

pub const CHECK_FOR_UPDATES: &str = "check-for-updates";

/// Tauri's default macOS menu, minus File and Help, plus Check for Updates… in the app menu.
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
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
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
    MenuBuilder::new(app).items(&[&folio, &edit, &view, &window]).build()
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id().0 == CHECK_FOR_UPDATES {
        let _ = app.emit("menu-check-for-updates", ());
    }
}
