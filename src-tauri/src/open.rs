use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Paths the OS asked us to open. Finder can deliver them before the webview
/// has registered its listener (cold start), so they wait here until it is ready.
#[derive(Default)]
pub struct PendingOpen(Mutex<Pending>);

#[derive(Default)]
struct Pending {
    ready: bool,
    paths: Vec<String>,
}

impl PendingOpen {
    /// Queues `paths` while the frontend isn't listening; otherwise hands them back for immediate delivery.
    pub fn push(&self, paths: Vec<String>) -> Vec<String> {
        let mut pending = self.0.lock().unwrap();
        if pending.ready {
            paths
        } else {
            pending.paths.extend(paths);
            Vec::new()
        }
    }

    pub fn mark_ready(&self) -> Vec<String> {
        let mut pending = self.0.lock().unwrap();
        pending.ready = true;
        std::mem::take(&mut pending.paths)
    }
}

/// Existing files named on the command line, canonicalized. Flags and dirs are ignored.
pub fn paths_from_args(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-') && Path::new(a).is_file())
        .filter_map(|a| std::fs::canonicalize(&a).ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

pub fn deliver(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    for path in app.state::<PendingOpen>().push(paths) {
        let _ = app.emit("open-path", path);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn frontend_ready(pending: State<'_, PendingOpen>) -> Vec<String> {
    pending.mark_ready()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queues_paths_until_frontend_ready() {
        let pending = PendingOpen::default();
        assert!(pending.push(vec!["/a.md".into()]).is_empty());
        assert!(pending.push(vec!["/b.md".into()]).is_empty());
        assert_eq!(pending.mark_ready(), vec!["/a.md".to_string(), "/b.md".to_string()]);
    }

    #[test]
    fn delivers_immediately_once_ready() {
        let pending = PendingOpen::default();
        assert!(pending.mark_ready().is_empty());
        assert_eq!(pending.push(vec!["/c.md".into()]), vec!["/c.md".to_string()]);
        assert!(pending.mark_ready().is_empty());
    }

    #[test]
    fn args_keep_only_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("notes.md");
        std::fs::write(&file, "x").unwrap();
        let args = vec![
            "-psn_0_12345".to_string(),
            file.to_string_lossy().into_owned(),
            "/nope/missing.md".to_string(),
            dir.path().to_string_lossy().into_owned(),
        ];
        let paths = paths_from_args(args);
        assert_eq!(paths.len(), 1);
        assert!(paths[0].ends_with("notes.md"));
    }
}
