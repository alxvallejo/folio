mod config;
mod editor;
mod fs;
mod navigation;
mod open;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(navigation::guard())
        .manage(open::PendingOpen::default())
        .manage(watch::Watchers::default())
        .setup(|app| {
            open::deliver(app.handle(), open::paths_from_args(std::env::args().skip(1)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs::read_file,
            fs::list_tree,
            watch::watch_file,
            watch::watch_folder,
            config::read_config,
            config::write_config,
            config::watch_config,
            open::frontend_ready,
            editor::open_in_editor,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Folio");

    app.run(|handle, event| {
        // Finder double-click, Dock drop, `open -a Folio x.md`, including at cold start.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            let paths = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            open::deliver(handle, paths);
        }
    });
}
