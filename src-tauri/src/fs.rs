use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct FileContents {
    pub text: String,
    pub size: u64,
    /// True when the file wasn't valid UTF-8, so saving this text back would change bytes.
    pub lossy: bool,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Serialize)]
pub struct Tree {
    pub root: TreeNode,
    pub truncated: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_depth: usize,
    pub max_files: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self { max_depth: 10, max_files: 5_000 }
    }
}

/// Lossy UTF-8 decode with any leading BOM removed.
pub fn decode(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.strip_prefix('\u{feff}').unwrap_or(&text).to_string()
}

pub fn read_text(path: &Path) -> Result<FileContents, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(FileContents {
        size: bytes.len() as u64,
        lossy: std::str::from_utf8(&bytes).is_err(),
        text: decode(&bytes),
    })
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
}

pub fn is_ignored(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Paths in the tree are canonical, so they compare equal to the canonical posts folder even when
/// the root was opened through a symlink. The root keeps the name it was opened by.
pub fn build_tree(root: &Path, limits: Limits) -> Result<Tree, String> {
    // Surface an unreadable root as an error; unreadable subdirs are skipped silently.
    std::fs::read_dir(root).map_err(|e| e.to_string())?;
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path_string(root));
    let root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    let mut walk = Walk { limits, files: 0, truncated: false };
    let children = walk.dir(&root, 1);
    Ok(Tree {
        root: TreeNode { name, path: path_string(&root), is_dir: true, children },
        truncated: walk.truncated,
    })
}

struct Walk {
    limits: Limits,
    files: usize,
    truncated: bool,
}

impl Walk {
    /// Entries of `dir` sit at `depth` (the root's children are depth 1).
    fn dir(&mut self, dir: &Path, depth: usize) -> Vec<TreeNode> {
        let Ok(read) = std::fs::read_dir(dir) else { return Vec::new() };
        let mut entries: Vec<_> = read.filter_map(Result::ok).collect();
        entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());

        let mut dirs = Vec::new();
        let mut files = Vec::new();
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_ignored(&name) {
                continue;
            }
            let path = entry.path();
            // DirEntry::file_type does not follow symlinks, so symlinked dirs are never walked.
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                if depth >= self.limits.max_depth {
                    self.truncated = true;
                    continue;
                }
                let children = self.dir(&path, depth + 1);
                if !children.is_empty() {
                    dirs.push(TreeNode { name, path: path_string(&path), is_dir: true, children });
                }
            } else if (kind.is_file() || (kind.is_symlink() && path.is_file())) && is_markdown(&path) {
                if self.files >= self.limits.max_files {
                    self.truncated = true;
                    break;
                }
                self.files += 1;
                files.push(TreeNode { name, path: path_string(&path), is_dir: false, children: Vec::new() });
            }
        }
        dirs.extend(files);
        dirs
    }
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<FileContents, String> {
    read_text(Path::new(&path))
}

#[tauri::command]
pub async fn list_tree(root: String) -> Result<Tree, String> {
    build_tree(Path::new(&root), Limits::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn touch(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "# x").unwrap();
    }

    fn names(node: &TreeNode) -> Vec<&str> {
        node.children.iter().map(|c| c.name.as_str()).collect()
    }

    #[test]
    fn decode_strips_bom_and_replaces_invalid_utf8() {
        assert_eq!(decode(b"\xEF\xBB\xBFhello"), "hello");
        assert_eq!(decode(b"a\xFFb"), "a\u{FFFD}b");
    }

    #[test]
    fn read_text_flags_lossy_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let bad = dir.path().join("bad.md");
        std::fs::write(&bad, [0xff, b'a']).unwrap();
        assert!(read_text(&bad).unwrap().lossy);
        let good = dir.path().join("good.md");
        std::fs::write(&good, "héllo").unwrap();
        assert!(!read_text(&good).unwrap().lossy);
    }

    #[test]
    fn read_text_reports_byte_size() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        std::fs::write(&file, "héllo").unwrap();
        let contents = read_text(&file).unwrap();
        assert_eq!(contents.text, "héllo");
        assert_eq!(contents.size, 6);
    }

    #[test]
    fn tree_keeps_markdown_prunes_empty_dirs_and_sorts_dirs_first() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("b.md"));
        touch(&root.join("A.markdown"));
        std::fs::write(root.join("notes.txt"), "x").unwrap();
        std::fs::create_dir_all(root.join("empty")).unwrap();
        touch(&root.join("docs/c.md"));
        std::fs::create_dir_all(root.join("images")).unwrap();
        std::fs::write(root.join("images/x.png"), "x").unwrap();

        let tree = build_tree(root, Limits::default()).unwrap();
        assert_eq!(names(&tree.root), vec!["docs", "A.markdown", "b.md"]);
        assert!(tree.root.children[0].is_dir);
        assert_eq!(names(&tree.root.children[0]), vec!["c.md"]);
        assert!(!tree.truncated);
    }

    #[test]
    fn tree_skips_dot_entries_and_node_modules() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join(".git/x.md"));
        touch(&root.join(".github/README.md"));
        touch(&root.join(".hidden.md"));
        touch(&root.join("node_modules/pkg/readme.md"));
        touch(&root.join("keep.md"));

        let tree = build_tree(root, Limits::default()).unwrap();
        assert_eq!(names(&tree.root), vec!["keep.md"]);
    }

    #[test]
    fn tree_skips_symlinked_dirs_but_keeps_symlinked_files() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        touch(&outside.path().join("other.md"));
        let root = dir.path();
        std::os::unix::fs::symlink(outside.path(), root.join("linked-dir")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("other.md"), root.join("linked.md")).unwrap();

        let tree = build_tree(root, Limits::default()).unwrap();
        assert_eq!(names(&tree.root), vec!["linked.md"]);
    }

    #[test]
    fn tree_of_a_symlinked_root_lists_canonical_paths_under_the_link_name() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("Blog");
        touch(&real.join("drafts/a.md"));
        let link = dir.path().join("Writing");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let canonical = std::fs::canonicalize(&real).unwrap();

        let tree = build_tree(&link, Limits::default()).unwrap();
        assert_eq!(tree.root.name, "Writing");
        assert_eq!(tree.root.path, path_string(&canonical));
        assert_eq!(tree.root.children[0].children[0].path, path_string(&canonical.join("drafts/a.md")));
    }

    #[test]
    fn tree_stops_descending_at_depth_limit() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("a/shallow.md"));
        touch(&root.join("a/b/deep.md"));

        let tree = build_tree(root, Limits { max_depth: 2, max_files: 100 }).unwrap();
        assert_eq!(names(&tree.root), vec!["a"]);
        assert_eq!(names(&tree.root.children[0]), vec!["shallow.md"]);
        assert!(tree.truncated);
    }

    #[test]
    fn tree_stops_at_file_limit() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["1.md", "2.md", "3.md", "4.md", "5.md"] {
            touch(&dir.path().join(name));
        }
        let tree = build_tree(dir.path(), Limits { max_depth: 10, max_files: 3 }).unwrap();
        assert_eq!(names(&tree.root), vec!["1.md", "2.md", "3.md"]);
        assert!(tree.truncated);
    }

    #[test]
    fn tree_reports_unreadable_root() {
        assert!(build_tree(Path::new("/definitely/not/here"), Limits::default()).is_err());
    }

    #[test]
    fn is_markdown_is_case_insensitive() {
        assert!(is_markdown(Path::new("/a/README.MD")));
        assert!(is_markdown(Path::new("/a/x.markdown")));
        assert!(!is_markdown(Path::new("/a/x.mdx")));
    }
}
