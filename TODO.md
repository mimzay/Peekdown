Notes:
1. New (Ctrl+n) toggle ADD: + new page | issue: currently only shows recent files | add + new page to the top of recent file list
2. Issue: the markdown view window is restricted by width | so when there is only one file open in a maximuzed window | the view pane is ~50% of the total window | Fix: allow it to auto adjust to ~90% of the availible display window.
3. Issue: (Ctrl+Shift+B) does not function | Can we map key stokes to split window markdown-view vscode style | We have a split-button & markdown-view-button.

PS C:\Source\Apps\Peekdown> Get-Content .\src\main.rs -TotalCount 35
#![windows_subsystem = "windows"]

use std::borrow::Cow;
use std::io::Read;
use std::sync::{Arc, Mutex};
use tao::{
    dpi::{LogicalPosition, LogicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOZORDER};
use wry::{WebViewBuilder, WebViewBuilderExtWindows, WebViewExtWindows};

mod file_ops;
mod ipc;
mod state;
mod window_state;

const INDEX_HTML: &str = include_str!("frontend/index.html");
const STYLE_CSS: &str = include_str!("frontend/style.css");
const APP_JS: &str = include_str!("frontend/app.js");
const EDITOR_JS: &str = include_str!("frontend/editor.js");
const PREVIEW_JS: &str = include_str!("frontend/preview.js");
const TABS_JS: &str = include_str!("frontend/tabs.js");
const MARKED_JS: &str = include_str!("frontend/marked.min.js");
const HLJS: &str = include_str!("frontend/highlight.min.js");

#[derive(Debug)]
enum UserEvent {
    IpcMessage(String),
}

fn main() {
PS C:\Source\Apps\Peekdown> Get-Content .\src\main.rs | Select-Object -Skip 232 -First 30
                event: WindowEvent::CloseRequested,
                ..
            } => {
                let inner_size = window.inner_size();
                let outer_pos = window.outer_position().unwrap_or_default();
                window_state::save_window_state(
                    (outer_pos.x, outer_pos.y),
                    (inner_size.width, inner_size.height),
                );
                *control_flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}

fn escape_for_script_tag(js: &str) -> String {
    // Prevent "</script" in JS from prematurely closing the <script> tag
    js.replace("</script", "<\\/script")
}

fn build_html() -> String {
    // Build script tags with escaped content
    let scripts = format!(
        "<script>{}</script>\n<script>{}</script>\n<script>{}</script>\n<script>{}</script>\n<script>{}</script>\n<script>{}</script>",
        escape_for_script_tag(HLJS),
        escape_for_script_tag(MARKED_JS),
        escape_for_script_tag(PREVIEW_JS),
        escape_for_script_tag(TABS_JS),
        escape_for_script_tag(EDITOR_JS),