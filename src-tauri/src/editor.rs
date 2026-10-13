use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const GRACE: Duration = Duration::from_secs(3);

/// Runs `<command> "<path>"` through the user's login shell, so a GUI launch
/// sees the same PATH as Terminal (where `code`, `zed`, `subl` live).
/// The path is passed as `$1`, never interpolated into the script.
pub fn launch(command: &str, path: &str) -> Result<(), String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("no editor command set".into());
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = Command::new(shell)
        .arg("-lc")
        .arg(format!("{command} \"$1\""))
        .arg("folio")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;

    let deadline = Instant::now() + GRACE;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) if status.success() => return Ok(()),
            Some(status) => return Err(format!("`{command}` exited with {status}")),
            None if Instant::now() >= deadline => {
                // Still running (e.g. `code --wait`): treat as launched, reap it in the background.
                thread::spawn(move || {
                    let _ = child.wait();
                });
                return Ok(());
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    }
}

#[tauri::command]
pub async fn open_in_editor(path: String, command: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch(&command, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn succeeds_for_a_working_command() {
        assert!(launch("true", "/tmp/x.md").is_ok());
    }

    #[test]
    fn fails_for_a_missing_command() {
        assert!(launch("folio-no-such-editor", "/tmp/x.md").is_err());
    }

    #[test]
    fn rejects_a_blank_command() {
        assert!(launch("   ", "/tmp/x.md").is_err());
    }

    #[test]
    fn passes_paths_with_spaces_as_one_argument() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("my notes.md");
        std::fs::write(&file, "x").unwrap();
        assert!(launch("test -f", file.to_str().unwrap()).is_ok());
    }

    #[test]
    fn never_evaluates_the_path() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("pwned");
        let evil = format!("{}/x$(touch {}).md", dir.path().display(), marker.display());
        let _ = launch("test -f", &evil);
        assert!(!marker.exists());
    }
}
