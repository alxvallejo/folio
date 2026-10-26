use serde_json::{Map, Value};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

use crate::{config, fs, watch};

const FOLDER_KEY: &str = "postsFolder";
const TOO_BROAD: &str = "Pick a more specific folder for posts.";
const OUTSIDE: &str = "Folio only writes posts in your posts folder.";
const BOM: &[u8] = b"\xEF\xBB\xBF";

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

/// The configured posts folder with `~` expanded; not checked against the disk.
pub fn posts_folder_in(config_text: &str, home: &Path) -> Option<PathBuf> {
    let value: Value = serde_json::from_str(config_text).ok()?;
    let raw = value.get(FOLDER_KEY)?.as_str()?.trim();
    if raw.is_empty() {
        return None;
    }
    if raw == "~" {
        return Some(home.to_path_buf());
    }
    match raw.strip_prefix("~/") {
        Some(rest) => Some(home.join(rest)),
        None => Some(PathBuf::from(raw)),
    }
}

/// Canonical `path`, unless it is too broad to be a posts folder: `/`, the
/// home folder, or a top-level folder such as `/Users`.
pub fn check_folder(path: &Path, home: &Path) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    let home = std::fs::canonicalize(home).unwrap_or_else(|_| home.to_path_buf());
    let top_level = canonical.parent().is_none_or(|p| p.parent().is_none());
    if top_level || canonical == home {
        return Err(TOO_BROAD.to_string());
    }
    Ok(canonical)
}

/// The Markdown file `path` really is (symlinks and `..` resolved), provided it
/// sits inside `folder`. Every write goes through this.
pub fn resolve_post(folder: &Path, path: &Path) -> Result<PathBuf, String> {
    let folder = std::fs::canonicalize(folder).map_err(|e| e.to_string())?;
    let target = watch::resolve(path);
    if fs::is_markdown(&target) && target.starts_with(&folder) {
        Ok(target)
    } else {
        Err(OUTSIDE.to_string())
    }
}

/// Replaces an existing post atomically (temp file in the same folder, then
/// rename). A missing file is an error so autosave can't resurrect a deleted
/// post. `fs::decode` drops a leading BOM on read, so it is restored here.
pub fn write_post_at(folder: &Path, path: &Path, text: &str) -> Result<(), String> {
    let target = resolve_post(folder, path)?;
    let meta = std::fs::metadata(&target).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(OUTSIDE.to_string());
    }
    let existing = std::fs::read(&target).map_err(|e| e.to_string())?;
    let had_bom = existing.starts_with(BOM);

    let name = target.file_name().ok_or(OUTSIDE)?.to_string_lossy().into_owned();
    // Never replace bytes that the lossy decode on read couldn't represent.
    if std::str::from_utf8(&existing).is_err() {
        return Err(format!("{name} isn't valid UTF-8, so Folio won't save over it."));
    }
    let tmp = target.with_file_name(format!(".{name}.folio-tmp"));
    let result = (|| -> std::io::Result<()> {
        // Clear a stale or planted temp name first; create_new then refuses to follow a symlink.
        let _ = std::fs::remove_file(&tmp);
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        if had_bom {
            file.write_all(BOM)?;
        }
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::set_permissions(&tmp, meta.permissions())?;
        std::fs::rename(&tmp, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result.map_err(|e| e.to_string())
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn post_file_name(title: &str) -> String {
    let safe = title.trim().replace(['/', ':'], "-");
    let name = collapse_whitespace(safe.trim_start_matches('.'));
    format!("{}.md", if name.is_empty() { "Untitled" } else { &name })
}

/// Creates `Name.md` (or `Name 2.md`, ...) holding a draft stub. Never
/// overwrites: `create_new` fails if the name is taken.
pub fn create_post_at(folder: &Path, title: &str) -> Result<PathBuf, String> {
    let heading = collapse_whitespace(title);
    let heading = if heading.is_empty() { "Untitled" } else { &heading };
    let contents = format!("---\nstatus: draft\n---\n\n# {heading}\n");
    let base = post_file_name(title);
    let stem = base.strip_suffix(".md").unwrap_or(&base);
    for n in 1u32.. {
        let name = if n == 1 { base.clone() } else { format!("{stem} {n}.md") };
        let path = folder.join(name);
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
                return Ok(path);
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    unreachable!()
}

fn render(map: &Map<String, Value>) -> Result<String, String> {
    let mut out = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    out.push('\n');
    Ok(out)
}

/// New config text with `postsFolder` set or removed; other keys keep their order.
pub fn set_posts_folder_in(config_text: Option<&str>, value: Option<&str>) -> Result<String, String> {
    let mut map = match config_text.map(str::trim).filter(|t| !t.is_empty()) {
        None => Map::new(),
        Some(text) => match serde_json::from_str::<Value>(text).map_err(|e| e.to_string())? {
            Value::Object(map) => map,
            _ => return Err("Config is not a JSON object.".to_string()),
        },
    };
    match value {
        Some(v) => {
            map.insert(FOLDER_KEY.to_string(), Value::String(v.to_string()));
        }
        None => {
            map.shift_remove(FOLDER_KEY);
        }
    }
    render(&map)
}

/// For `write_config`: the webview may save settings but never changes where
/// posts are written, so `postsFolder` always comes from what is on disk.
pub fn keep_posts_folder(incoming: &str, on_disk: Option<&str>) -> String {
    let Ok(Value::Object(mut map)) = serde_json::from_str::<Value>(incoming) else {
        return incoming.to_string();
    };
    let kept = on_disk
        .and_then(|t| serde_json::from_str::<Value>(t).ok())
        .and_then(|v| v.get(FOLDER_KEY).cloned());
    match kept {
        Some(v) => {
            map.insert(FOLDER_KEY.to_string(), v);
        }
        None => {
            map.shift_remove(FOLDER_KEY);
        }
    }
    render(&map).unwrap_or_else(|_| incoming.to_string())
}

/// The configured folder, if it is set, exists and is specific enough.
fn current_folder() -> Result<PathBuf, String> {
    let home = home_dir();
    let text = config::read_config_at(&config::config_path())?.unwrap_or_default();
    let folder = posts_folder_in(&text, &home).ok_or("Choose a posts folder first.")?;
    check_folder(&folder, &home)
}

fn save_folder(value: Option<&str>) -> Result<(), String> {
    let path = config::config_path();
    let text = config::read_config_at(&path)?;
    config::write_config_at(&path, &set_posts_folder_in(text.as_deref(), value)?)
}

#[tauri::command]
pub fn posts_folder() -> Option<String> {
    current_folder().ok().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn choose_posts_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else { return Ok(None) };
    let picked = picked.into_path().map_err(|e| e.to_string())?;
    let home = home_dir();
    let canonical = check_folder(&picked, &home)?;
    let canonical_home = std::fs::canonicalize(&home).unwrap_or(home);
    let stored = match canonical.strip_prefix(&canonical_home) {
        Ok(rest) => format!("~/{}", rest.to_string_lossy()),
        Err(_) => canonical.to_string_lossy().into_owned(),
    };
    save_folder(Some(&stored))?;
    Ok(Some(canonical.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn clear_posts_folder() -> Result<(), String> {
    save_folder(None)
}

#[tauri::command]
pub fn write_post(path: String, text: String) -> Result<(), String> {
    write_post_at(&current_folder()?, Path::new(&path), &text)
}

#[tauri::command]
pub fn create_post(title: String) -> Result<String, String> {
    let path = create_post_at(&current_folder()?, &title)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn refuses_root_home_and_top_level() {
        let home = tempfile::tempdir().unwrap();
        let blog = home.path().join("Blog");
        std::fs::create_dir(&blog).unwrap();
        assert!(check_folder(Path::new("/"), home.path()).is_err());
        assert!(check_folder(home.path(), home.path()).is_err());
        assert_eq!(
            check_folder(Path::new("/Users"), home.path()).unwrap_err(),
            "Pick a more specific folder for posts."
        );
        assert!(check_folder(&blog, home.path()).is_ok());
    }

    #[test]
    fn resolve_refuses_outside_dotdot_symlink_and_non_markdown() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("posts");
        let outside = root.path().join("outside");
        std::fs::create_dir_all(folder.join("sub")).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("x.md"), "x").unwrap();
        std::fs::write(root.path().join("x.md"), "x").unwrap();
        std::fs::write(folder.join("a.txt"), "x").unwrap();
        std::fs::write(folder.join("sub/a.md"), "x").unwrap();
        std::os::unix::fs::symlink(outside.join("x.md"), folder.join("link.md")).unwrap();

        let msg = "Folio only writes posts in your posts folder.";
        assert_eq!(resolve_post(&folder, &folder.join("../x.md")).unwrap_err(), msg);
        assert_eq!(resolve_post(&folder, &folder.join("link.md")).unwrap_err(), msg);
        assert_eq!(resolve_post(&folder, &folder.join("a.txt")).unwrap_err(), msg);
        assert!(resolve_post(&folder, &folder.join("sub/a.md")).is_ok());
    }

    #[test]
    fn write_is_atomic_and_keeps_bom() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        std::fs::write(&file, "\u{feff}# a\r\n").unwrap();
        write_post_at(dir.path(), &file, "# b\r\n").unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), b"\xEF\xBB\xBF# b\r\n");
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.md"]);
    }

    #[test]
    fn write_ignores_planted_temp_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let victim = outside.path().join("victim.txt");
        std::fs::write(&victim, "safe").unwrap();
        let file = dir.path().join("post.md");
        std::fs::write(&file, "# a").unwrap();
        std::os::unix::fs::symlink(&victim, dir.path().join(".post.md.folio-tmp")).unwrap();
        write_post_at(dir.path(), &file, "# b").unwrap();
        assert_eq!(std::fs::read_to_string(&victim).unwrap(), "safe");
        assert!(std::fs::symlink_metadata(&file).unwrap().file_type().is_file());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "# b");
    }

    #[test]
    fn write_refuses_invalid_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("bad.md");
        std::fs::write(&file, [0xff, b'a']).unwrap();
        assert!(write_post_at(dir.path(), &file, "x").is_err());
        assert_eq!(std::fs::read(&file).unwrap(), [0xff, b'a']);
    }

    #[test]
    fn write_refuses_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("gone.md");
        assert!(write_post_at(dir.path(), &file, "x").is_err());
        assert!(!file.exists());
    }

    #[test]
    fn names_posts() {
        assert_eq!(post_file_name(" Slow software "), "Slow software.md");
        assert_eq!(post_file_name("a/b: c"), "a-b- c.md");
        assert_eq!(post_file_name(".hidden"), "hidden.md");
        assert_eq!(post_file_name("  "), "Untitled.md");
    }

    #[test]
    fn create_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("Hello.md"), "mine").unwrap();
        let made = create_post_at(dir.path(), "Hello").unwrap();
        assert_eq!(made, dir.path().join("Hello 2.md"));
        assert_eq!(std::fs::read_to_string(dir.path().join("Hello.md")).unwrap(), "mine");
        assert_eq!(std::fs::read_to_string(&made).unwrap(), "---\nstatus: draft\n---\n\n# Hello\n");
    }

    #[test]
    fn write_config_keeps_disk_posts_folder() {
        let parse = |s: &str| serde_json::from_str::<serde_json::Value>(s).unwrap();
        let kept = keep_posts_folder(
            r#"{"fontSize":20,"postsFolder":"/"}"#,
            Some(r#"{"postsFolder":"~/Blog"}"#),
        );
        assert_eq!(parse(&kept), parse(r#"{"fontSize":20,"postsFolder":"~/Blog"}"#));
        let removed = keep_posts_folder(r#"{"fontSize":20,"postsFolder":"/"}"#, Some("{}"));
        assert_eq!(parse(&removed), parse(r#"{"fontSize":20}"#));
        let none = keep_posts_folder(r#"{"postsFolder":"/"}"#, None);
        assert_eq!(parse(&none), parse("{}"));
    }

    #[test]
    fn set_posts_folder_preserves_order() {
        let out = set_posts_folder_in(Some("{\n  \"b\": 1,\n  \"a\": 2\n}\n"), Some("~/Blog")).unwrap();
        assert_eq!(out, "{\n  \"b\": 1,\n  \"a\": 2,\n  \"postsFolder\": \"~/Blog\"\n}\n");
        let cleared = set_posts_folder_in(Some(&out), None).unwrap();
        assert_eq!(cleared, "{\n  \"b\": 1,\n  \"a\": 2\n}\n");
    }

    #[test]
    fn reads_and_expands_posts_folder() {
        let home = Path::new("/home/me");
        assert_eq!(posts_folder_in(r#"{"postsFolder":"~/Blog"}"#, home), Some(home.join("Blog")));
        assert_eq!(posts_folder_in(r#"{"postsFolder":"/abs"}"#, home), Some(Path::new("/abs").to_path_buf()));
        assert_eq!(posts_folder_in("{}", home), None);
        assert_eq!(posts_folder_in("nope", home), None);
    }
}
