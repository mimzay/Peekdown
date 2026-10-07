use rfd::FileDialog;
use serde::Serialize;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

const MAX_SCANNED_ENTRIES: usize = 5_000;
const SKIP_DIRS: &[&str] = &[
    ".git",
    ".idea",
    ".venv",
    ".vscode",
    "__pycache__",
    "node_modules",
    "target",
    "venv",
];

#[derive(Debug, Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderTree {
    pub root: String,
    pub root_name: String,
    pub children: Vec<TreeNode>,
    pub truncated: bool,
}

pub fn pick_folder() -> Option<PathBuf> {
    FileDialog::new().pick_folder()
}

pub fn build_tree(root: &Path) -> io::Result<FolderTree> {
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Selected path is not a directory",
        ));
    }

    let mut scanned = 0usize;
    let mut truncated = false;
    let children = scan_dir(root, &mut scanned, &mut truncated)?;

    let root_name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    Ok(FolderTree {
        root: root.to_string_lossy().to_string(),
        root_name,
        children,
        truncated,
    })
}

fn scan_dir(dir: &Path, scanned: &mut usize, truncated: &mut bool) -> io::Result<Vec<TreeNode>> {
    let mut nodes = Vec::new();

    for entry_result in fs::read_dir(dir)? {
        if *scanned >= MAX_SCANNED_ENTRIES {
            *truncated = true;
            break;
        }
        *scanned += 1;

        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        // Do not follow symlinks/junction-like links into recursive loops.
        if file_type.is_symlink() {
            continue;
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }

            // Permission errors in a child folder should not kill the whole tree.
            if let Ok(children) = scan_dir(&path, scanned, truncated) {
                if !children.is_empty() {
                    nodes.push(TreeNode {
                        name,
                        path: path.to_string_lossy().to_string(),
                        kind: "dir",
                        children,
                    });
                }
            }
        } else if file_type.is_file() && is_supported_file(&path) {
            nodes.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                kind: "file",
                children: Vec::new(),
            });
        }
    }

    nodes.sort_by(|a, b| {
        let a_dir = a.kind == "dir";
        let b_dir = b.kind == "dir";

        b_dir
            .cmp(&a_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(nodes)
}

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.iter().any(|skip| name.eq_ignore_ascii_case(skip))
}

fn is_supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            ext.eq_ignore_ascii_case("md")
                || ext.eq_ignore_ascii_case("markdown")
                || ext.eq_ignore_ascii_case("txt")
        })
        .unwrap_or(false)
}
