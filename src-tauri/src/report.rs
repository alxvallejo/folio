use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};

pub const CANCELLED: &str = "cancelled";
/// How much of the command's error output a failure message carries.
const ERROR_LINES: usize = 2;
const ERROR_CHARS: usize = 300;

/// The process group of the running report command, so Cancel stops it and everything it started.
#[derive(Default)]
pub struct RunningReport(Mutex<Option<u32>>);

/// Runs the report command through the user's login shell, like the editor command, and returns
/// the Markdown file it names on the last line of its output. `started` gets the process group id.
pub fn run(command: &str, started: impl FnOnce(u32)) -> Result<PathBuf, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("no report command set".into());
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let child = Command::new(shell)
        .arg("-lc")
        .arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
        .map_err(|e| e.to_string())?;
    started(child.id());
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.signal().is_some() {
        return Err(CANCELLED.into());
    }
    if !output.status.success() {
        return Err(last_lines(&stderr).unwrap_or_else(|| format!("`{command}` exited with {}", output.status)));
    }
    let home = std::env::var_os("HOME").map(PathBuf::from);
    report_path(&String::from_utf8_lossy(&output.stdout), home.as_deref())
        .ok_or_else(|| last_lines(&stderr).unwrap_or_else(|| format!("`{command}` didn't print the path of a Markdown file")))
}

/// The last non-blank line of `stdout`, if it is an existing Markdown file. `~/` means `home`.
pub fn report_path(stdout: &str, home: Option<&Path>) -> Option<PathBuf> {
    let line = stdout.lines().map(str::trim).filter(|l| !l.is_empty()).last()?;
    let path = match (line.strip_prefix("~/"), home) {
        (Some(rest), Some(home)) => home.join(rest),
        _ => PathBuf::from(line),
    };
    let markdown = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"));
    if !path.is_absolute() || !markdown || !path.is_file() {
        return None;
    }
    std::fs::canonicalize(&path).ok()
}

/// The command's last few lines of error output, shortened, for a one-line message.
fn last_lines(stderr: &str) -> Option<String> {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    if lines.is_empty() {
        return None;
    }
    let text = lines[lines.len().saturating_sub(ERROR_LINES)..].join(" ");
    let mut chars = text.chars();
    let short: String = chars.by_ref().take(ERROR_CHARS).collect();
    Some(if chars.next().is_some() { format!("{short}…") } else { short })
}

/// Stops a report command and everything it started.
pub fn stop(group: u32) {
    if let Ok(group) = i32::try_from(group) {
        unsafe { libc::kill(-group, libc::SIGTERM) };
    }
}

#[tauri::command]
pub async fn run_report(app: AppHandle, command: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let running = app.state::<RunningReport>();
        let result = run(&command, |group| *running.0.lock().unwrap() = Some(group));
        *running.0.lock().unwrap() = None;
        result.map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_report(running: State<RunningReport>) {
    if let Some(group) = *running.0.lock().unwrap() {
        stop(group);
    }
}

/// The bundled "Build your own daily report" guide.
#[tauri::command]
pub fn report_guide(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .resolve("guides/daily-report.md", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    fn report_in(dir: &Path, name: &str) -> PathBuf {
        let file = dir.join(name);
        std::fs::write(&file, "# Report").unwrap();
        std::fs::canonicalize(file).unwrap()
    }

    #[test]
    fn returns_the_file_printed_last() {
        let dir = tempfile::tempdir().unwrap();
        let file = report_in(dir.path(), "2026-10-29.md");
        let command = format!("echo 'collecting…'; echo 'wrote it' >&2; echo '{}'", file.display());
        assert_eq!(run(&command, |_| {}).unwrap(), file);
    }

    #[test]
    fn reports_the_error_output_when_the_command_fails() {
        let err = run("echo 'one' >&2; echo 'claude: command not found' >&2; exit 127", |_| {}).unwrap_err();
        assert_eq!(err, "one claude: command not found");
    }

    #[test]
    fn explains_a_failure_with_no_error_output() {
        assert_eq!(run("exit 3", |_| {}).unwrap_err(), "`exit 3` exited with exit status: 3");
    }

    #[test]
    fn says_why_when_no_report_was_written() {
        let err = run("echo 'daily-report: no activity, nothing written' >&2", |_| {}).unwrap_err();
        assert_eq!(err, "daily-report: no activity, nothing written");
        assert_eq!(run("true", |_| {}).unwrap_err(), "`true` didn't print the path of a Markdown file");
    }

    #[test]
    fn rejects_a_blank_command() {
        assert!(run("  ", |_| {}).is_err());
    }

    #[test]
    fn cancelling_stops_the_command_and_what_it_started() {
        let (tx, rx) = mpsc::channel();
        let started = Instant::now();
        let handle = std::thread::spawn(move || run("sleep 30 & wait", move |group| tx.send(group).unwrap()));
        stop(rx.recv().unwrap());
        assert_eq!(handle.join().unwrap().unwrap_err(), CANCELLED);
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn report_path_takes_only_an_existing_markdown_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = report_in(dir.path(), "report.md");
        let notes = dir.path().join("notes.txt");
        std::fs::write(&notes, "x").unwrap();
        assert_eq!(report_path(&format!("{}\n\n", file.display()), None), Some(file.clone()));
        assert_eq!(report_path(&notes.to_string_lossy(), None), None);
        assert_eq!(report_path(&dir.path().join("missing.md").to_string_lossy(), None), None);
        assert_eq!(report_path("report.md", None), None);
        assert_eq!(report_path("", None), None);
    }

    #[test]
    fn report_path_expands_home() {
        let dir = tempfile::tempdir().unwrap();
        let file = report_in(dir.path(), "Report.MARKDOWN");
        assert_eq!(report_path("~/Report.MARKDOWN", Some(dir.path())), Some(file));
    }

    #[test]
    fn long_error_output_is_shortened() {
        let message = last_lines(&"x".repeat(500)).unwrap();
        assert_eq!(message.chars().count(), ERROR_CHARS + 1);
        assert!(message.ends_with('…'));
    }
}
