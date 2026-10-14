use std::ffi::OsStr;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

/// Arguments for the relaunched Folio: the open document, if it still exists.
pub fn relaunch_args(path: Option<&str>) -> Vec<String> {
    match path {
        Some(p) if Path::new(p).is_file() => vec![p.to_string()],
        _ => Vec::new(),
    }
}

/// `/Applications/Folio.app` for `/Applications/Folio.app/Contents/MacOS/folio`; None outside a bundle (`tauri dev`).
pub fn bundle_root(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let root = contents.parent()?;
    let is_bundle = macos.file_name()? == OsStr::new("MacOS")
        && contents.file_name()? == OsStr::new("Contents")
        && root.extension()? == OsStr::new("app");
    is_bundle.then_some(root)
}

/// Starts a fresh Folio (the version just installed) on `path`, then quits this one.
/// The new instance gets `path` as a command-line argument, so it opens through `paths_from_args`.
#[tauri::command]
pub fn relaunch(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let exe = tauri::process::current_binary(&app.env()).map_err(|e| e.to_string())?;
    let args = relaunch_args(path.as_deref());
    match bundle_root(&exe) {
        // Through LaunchServices, as Tauri's own restart does, so launchd owns the new process
        // instead of it inheriting the stdio of this one, which is about to exit.
        Some(root) => {
            let out = Command::new("/usr/bin/open")
                .arg("-n")
                .arg(root)
                .arg("--args")
                .args(&args)
                .stdin(Stdio::null())
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
            }
        }
        None => {
            Command::new(&exe)
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_path_gives_no_args() {
        assert!(relaunch_args(None).is_empty());
    }

    #[test]
    fn missing_file_or_directory_gives_no_args() {
        let dir = tempfile::tempdir().unwrap();
        let gone = dir.path().join("deleted.md");
        assert!(relaunch_args(Some(gone.to_str().unwrap())).is_empty());
        assert!(relaunch_args(Some(dir.path().to_str().unwrap())).is_empty());
    }

    #[test]
    fn existing_file_is_the_only_arg_even_with_spaces() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("Two-ink printing.md");
        std::fs::write(&file, "x").unwrap();
        let path = file.to_str().unwrap();
        assert_eq!(relaunch_args(Some(path)), vec![path.to_string()]);
    }

    #[test]
    fn finds_the_app_bundle() {
        let exe = Path::new("/Applications/Folio.app/Contents/MacOS/folio");
        assert_eq!(bundle_root(exe), Some(Path::new("/Applications/Folio.app")));
    }

    #[test]
    fn no_bundle_for_dev_builds_or_lookalikes() {
        assert_eq!(bundle_root(Path::new("/repo/src-tauri/target/debug/folio")), None);
        assert_eq!(bundle_root(Path::new("/tmp/Folio/Contents/MacOS/folio")), None);
        assert_eq!(bundle_root(Path::new("folio")), None);
    }
}
