use notify_debouncer_mini::{
    new_debouncer,
    notify::{self, RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer,
};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::fs::{is_ignored, is_markdown};

pub const DEBOUNCE: Duration = Duration::from_millis(100);

pub type Watcher = Debouncer<RecommendedWatcher>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileEvent {
    Changed,
    Removed,
}

#[derive(Default)]
pub struct Watchers {
    pub(crate) file: Mutex<Option<Watcher>>,
    pub(crate) folder: Mutex<Option<Watcher>>,
    pub(crate) config: Mutex<Option<Watcher>>,
}

/// Canonical form of `path`, even when the file itself doesn't exist yet.
pub fn resolve(path: &Path) -> PathBuf {
    if let Ok(p) = std::fs::canonicalize(path) {
        return p;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => std::fs::canonicalize(parent)
            .map(|p| p.join(name))
            .unwrap_or_else(|_| path.to_path_buf()),
        _ => path.to_path_buf(),
    }
}

/// Watches `path` through its parent directory so editors that save by writing
/// a temp file and renaming it over the original keep triggering events.
pub fn watch_file_with<F>(path: &Path, on_event: F) -> notify::Result<Watcher>
where
    F: Fn(FileEvent) + Send + 'static,
{
    let target = resolve(path);
    let parent = target.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("/"));
    let watched = target.clone();
    let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        if events.iter().any(|e| e.path == watched) {
            on_event(if watched.exists() { FileEvent::Changed } else { FileEvent::Removed });
        }
    })?;
    debouncer.watcher().watch(&parent, RecursiveMode::NonRecursive)?;
    Ok(debouncer)
}

pub fn watch_folder_with<F>(root: &Path, on_change: F) -> notify::Result<Watcher>
where
    F: Fn() + Send + 'static,
{
    let root = resolve(root);
    let base = root.clone();
    let mut debouncer = new_debouncer(DEBOUNCE, move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        if events.iter().any(|e| affects_tree(&base, &e.path)) {
            on_change();
        }
    })?;
    debouncer.watcher().watch(&root, RecursiveMode::Recursive)?;
    Ok(debouncer)
}

/// True for changes to Markdown files or directories outside ignored dirs.
/// Paths that no longer exist count, since a deleted dir or file may change the tree.
fn affects_tree(root: &Path, path: &Path) -> bool {
    let rel = path.strip_prefix(root).unwrap_or(path);
    let hidden = rel
        .components()
        .any(|c| matches!(c, Component::Normal(n) if is_ignored(&n.to_string_lossy())));
    !hidden && (is_markdown(path) || !path.is_file())
}

#[tauri::command]
pub fn watch_file(app: AppHandle, watchers: State<'_, Watchers>, path: String) -> Result<(), String> {
    let payload = path.clone();
    let watcher = watch_file_with(Path::new(&path), move |event| {
        let name = match event {
            FileEvent::Changed => "file-changed",
            FileEvent::Removed => "file-removed",
        };
        let _ = app.emit(name, &payload);
    })
    .map_err(|e| e.to_string())?;
    *watchers.file.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn watch_folder(app: AppHandle, watchers: State<'_, Watchers>, root: String) -> Result<(), String> {
    let payload = root.clone();
    let watcher = watch_folder_with(Path::new(&root), move || {
        let _ = app.emit("tree-changed", &payload);
    })
    .map_err(|e| e.to_string())?;
    *watchers.folder.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Receiver};
    use std::thread::sleep;

    const SETTLE: Duration = Duration::from_millis(300);
    const WAIT: Duration = Duration::from_secs(3);
    const QUIET: Duration = Duration::from_millis(600);

    fn drain<T>(rx: &Receiver<T>) {
        while rx.try_recv().is_ok() {}
    }

    fn file_watch(path: &Path) -> (Watcher, Receiver<FileEvent>) {
        let (tx, rx) = channel();
        let watcher = watch_file_with(path, move |event| {
            let _ = tx.send(event);
        })
        .unwrap();
        sleep(SETTLE);
        drain(&rx);
        (watcher, rx)
    }

    #[test]
    fn reports_in_place_writes() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.md");
        std::fs::write(&file, "one").unwrap();
        sleep(SETTLE);
        let (_w, rx) = file_watch(&file);

        std::fs::write(&file, "two").unwrap();
        assert_eq!(rx.recv_timeout(WAIT).unwrap(), FileEvent::Changed);
    }

    #[test]
    fn survives_atomic_saves() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.md");
        std::fs::write(&file, "one").unwrap();
        sleep(SETTLE);
        let (_w, rx) = file_watch(&file);

        for text in ["two", "three"] {
            let tmp = dir.path().join(".doc.md.swp");
            std::fs::write(&tmp, text).unwrap();
            std::fs::rename(&tmp, &file).unwrap();
            assert_eq!(rx.recv_timeout(WAIT).unwrap(), FileEvent::Changed, "save {text}");
            sleep(SETTLE);
            drain(&rx);
        }
    }

    #[test]
    fn reports_removal() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.md");
        std::fs::write(&file, "one").unwrap();
        sleep(SETTLE);
        let (_w, rx) = file_watch(&file);

        std::fs::remove_file(&file).unwrap();
        assert_eq!(rx.recv_timeout(WAIT).unwrap(), FileEvent::Removed);
    }

    #[test]
    fn ignores_sibling_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.md");
        std::fs::write(&file, "one").unwrap();
        sleep(SETTLE);
        let (_w, rx) = file_watch(&file);

        std::fs::write(dir.path().join("other.md"), "x").unwrap();
        assert!(rx.recv_timeout(QUIET).is_err());
    }

    #[test]
    fn coalesces_bursts() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("doc.md");
        std::fs::write(&file, "0").unwrap();
        sleep(SETTLE);
        let (_w, rx) = file_watch(&file);

        for i in 0..20 {
            std::fs::write(&file, i.to_string()).unwrap();
        }
        assert_eq!(rx.recv_timeout(WAIT).unwrap(), FileEvent::Changed);
        let mut extra = 0;
        while rx.recv_timeout(QUIET).is_ok() {
            extra += 1;
        }
        // 20 writes must collapse to one event (FSEvents may occasionally split a burst once).
        assert!(extra <= 1, "got {} events for one burst", extra + 1);
    }

    #[test]
    fn folder_watch_reports_markdown_changes_but_not_ignored_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        sleep(SETTLE);

        let (tx, rx) = channel();
        let _w = watch_folder_with(root, move || {
            let _ = tx.send(());
        })
        .unwrap();
        sleep(SETTLE);
        drain(&rx);

        std::fs::write(root.join(".git/HEAD"), "x").unwrap();
        std::fs::write(root.join("node_modules/readme.md"), "x").unwrap();
        assert!(rx.recv_timeout(QUIET).is_err(), "ignored paths must not refresh the tree");

        std::fs::write(root.join("sub/new.md"), "# new").unwrap();
        assert!(rx.recv_timeout(WAIT).is_ok());
    }
}
