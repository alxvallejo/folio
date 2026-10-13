use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

use crate::watch::{watch_file_with, Watchers};

pub fn config_path() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
    home.join(".config").join("folio").join("config.json")
}

pub fn read_config_at(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(crate::fs::decode(&bytes))),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// `std::fs::write` follows symlinks, so a config.json that links into a
/// dotfiles repo stays a link and the target gets the new contents.
pub fn write_config_at(path: &Path, text: &str) -> Result<(), String> {
    let is_link = std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink());
    if !is_link {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(path, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_config() -> Result<Option<String>, String> {
    read_config_at(&config_path())
}

#[tauri::command]
pub fn write_config(text: String) -> Result<(), String> {
    write_config_at(&config_path(), &text)
}

#[tauri::command]
pub fn watch_config(app: AppHandle, watchers: State<'_, Watchers>) -> Result<(), String> {
    let path = config_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // watch_file_with canonicalizes, so a symlinked config is watched at its target.
    let watcher = watch_file_with(&path, move |_| {
        let _ = app.emit("config-changed", ());
    })
    .map_err(|e| e.to_string())?;
    *watchers.config.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_reads_as_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_config_at(&dir.path().join("config.json")).unwrap(), None);
    }

    #[test]
    fn write_creates_parent_dirs_and_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".config/folio/config.json");
        write_config_at(&path, "{\"fontSize\": 20}\n").unwrap();
        assert_eq!(read_config_at(&path).unwrap().as_deref(), Some("{\"fontSize\": 20}\n"));
    }

    #[test]
    fn write_through_symlink_preserves_the_link() {
        let dotfiles = tempfile::tempdir().unwrap();
        let target = dotfiles.path().join("folio.json");
        std::fs::write(&target, "{}").unwrap();
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("config.json");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        write_config_at(&link, "{\"theme\": \"nord\"}").unwrap();

        assert!(std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "{\"theme\": \"nord\"}");
        assert_eq!(read_config_at(&link).unwrap().as_deref(), Some("{\"theme\": \"nord\"}"));
    }

    #[test]
    fn config_path_is_under_dot_config() {
        assert!(config_path().ends_with(".config/folio/config.json"));
    }
}
