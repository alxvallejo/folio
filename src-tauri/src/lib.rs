mod fs;
mod watch;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(watch::Watchers::default())
        .invoke_handler(tauri::generate_handler![
            fs::read_file,
            fs::list_tree,
            watch::watch_file,
            watch::watch_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}
