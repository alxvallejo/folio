//! Making Folio the default app for Markdown files, through NSWorkspace.
use block2::RcBlock;
use objc2::rc::Retained;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSError, NSString, NSURL};
use objc2_uniform_type_identifiers::UTType;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use tauri::{AppHandle, Manager};

pub const MARKDOWN_TYPE: &str = "net.daringfireball.markdown";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultApp {
    /// The default app's name, e.g. "Warp"; None when nothing opens Markdown.
    name: Option<String>,
    is_folio: bool,
    /// Whether this copy may become the default (see `is_installed_location`).
    can_set: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MakeDefault {
    Made,
    Declined,
}

/// What AppKit's completion handler reported, copied out of the NSError.
pub struct ErrorInfo {
    pub domain: String,
    pub code: isize,
    pub underlying: Option<(String, isize)>,
    pub message: String,
}

/// Whether macOS should remember this bundle as the default: not the mounted DMG,
/// not the App Translocation copy macOS runs an unopened download from.
pub fn is_installed_location(bundle: &Path) -> bool {
    let path = bundle.to_string_lossy();
    !path.starts_with("/Volumes/") && !path.contains("/AppTranslocation/")
}

/// The user declined the macOS dialog: `userCanceledErr` (-128), directly or under NSCocoaErrorDomain 256.
pub fn is_user_cancel(domain: &str, code: isize, underlying: Option<(&str, isize)>) -> bool {
    let cancel = |d: &str, c: isize| d == "NSOSStatusErrorDomain" && c == -128;
    cancel(domain, code) || underlying.is_some_and(|(d, c)| cancel(d, c))
}

pub fn outcome(error: Option<ErrorInfo>) -> Result<MakeDefault, String> {
    match error {
        None => Ok(MakeDefault::Made),
        Some(e) if is_user_cancel(&e.domain, e.code, e.underlying.as_ref().map(|(d, c)| (d.as_str(), *c))) => {
            Ok(MakeDefault::Declined)
        }
        Some(e) => Err(e.message),
    }
}

fn markdown_type() -> Result<Retained<UTType>, String> {
    UTType::typeWithIdentifier(&NSString::from_str(MARKDOWN_TYPE)).ok_or_else(|| format!("macOS doesn't know {MARKDOWN_TYPE}"))
}

/// This copy's `.app` bundle; None for `tauri dev`.
fn this_bundle(app: &AppHandle) -> Option<PathBuf> {
    let exe = tauri::process::current_binary(&app.env()).ok()?;
    crate::relaunch::bundle_root(&exe).map(Path::to_path_buf)
}

/// Whether this copy can be updated in place or made the default: a real install, not the DMG or a dev build.
#[tauri::command]
pub fn is_installed(app: AppHandle) -> bool {
    this_bundle(&app).as_deref().is_some_and(is_installed_location)
}

#[tauri::command]
pub fn default_markdown_app(app: AppHandle) -> Result<DefaultApp, String> {
    let ty = markdown_type()?;
    let current = NSWorkspace::sharedWorkspace()
        .URLForApplicationToOpenContentType(&ty)
        .and_then(|url| url.path())
        .map(|path| PathBuf::from(path.to_string()));
    let bundle = this_bundle(&app);
    Ok(DefaultApp {
        name: current.as_deref().and_then(Path::file_stem).map(|s| s.to_string_lossy().into_owned()),
        is_folio: current.is_some() && current == bundle,
        can_set: bundle.as_deref().is_some_and(is_installed_location),
    })
}

/// Shows the macOS "change the default app" dialog and waits for the user's answer.
#[tauri::command]
pub async fn make_default_markdown_app(app: AppHandle) -> Result<MakeDefault, String> {
    let bundle = this_bundle(&app)
        .filter(|b| is_installed_location(b))
        .ok_or_else(|| "Folio isn't installed in Applications".to_string())?;
    let (tx, rx) = mpsc::channel::<Option<ErrorInfo>>();
    // AppKit is called on the main thread; its answer arrives on another queue once the user clicks.
    app.run_on_main_thread(move || ask_macos(&bundle, tx)).map_err(|e| e.to_string())?;
    let answer = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "macOS didn't answer".to_string())?;
    outcome(answer)
}

fn ask_macos(bundle: &Path, tx: mpsc::Sender<Option<ErrorInfo>>) {
    let ty = match markdown_type() {
        Ok(ty) => ty,
        Err(message) => {
            let _ = tx.send(Some(ErrorInfo { domain: String::new(), code: 0, underlying: None, message }));
            return;
        }
    };
    let url = NSURL::fileURLWithPath(&NSString::from_str(&bundle.to_string_lossy()));
    let handler = RcBlock::new(move |err: *mut NSError| {
        // SAFETY: AppKit passes null on success, or an NSError that is valid for this call.
        let info = unsafe { err.as_ref() }.map(|e| ErrorInfo {
            domain: e.domain().to_string(),
            code: e.code(),
            underlying: e.underlyingErrors().firstObject().map(|u| (u.domain().to_string(), u.code())),
            message: e.localizedDescription().to_string(),
        });
        let _ = tx.send(info);
    });
    NSWorkspace::sharedWorkspace().setDefaultApplicationAtURL_toOpenContentType_completionHandler(&url, &ty, Some(&handler));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(domain: &str, code: isize, underlying: Option<(&str, isize)>) -> Option<ErrorInfo> {
        Some(ErrorInfo {
            domain: domain.into(),
            code,
            underlying: underlying.map(|(d, c)| (d.into(), c)),
            message: "The file couldn’t be opened.".into(),
        })
    }

    #[test]
    fn installed_locations() {
        assert!(is_installed_location(Path::new("/Applications/Folio.app")));
        assert!(is_installed_location(Path::new("/Users/reader/Applications/Folio.app")));
    }

    #[test]
    fn dmg_and_translocated_copies_are_not_installed() {
        assert!(!is_installed_location(Path::new("/Volumes/Folio/Folio.app")));
        assert!(!is_installed_location(Path::new(
            "/private/var/folders/xy/abc123/T/AppTranslocation/0F1E2D3C/d/Folio.app"
        )));
    }

    #[test]
    fn recognizes_a_declined_dialog() {
        assert!(is_user_cancel("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -128))));
        assert!(is_user_cancel("NSOSStatusErrorDomain", -128, None));
        assert!(!is_user_cancel("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -54))));
        assert!(!is_user_cancel("NSCocoaErrorDomain", -128, None));
    }

    #[test]
    fn outcomes() {
        assert_eq!(outcome(None), Ok(MakeDefault::Made));
        assert_eq!(
            outcome(error("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -128)))),
            Ok(MakeDefault::Declined)
        );
        assert_eq!(
            outcome(error("NSCocoaErrorDomain", 256, Some(("NSOSStatusErrorDomain", -54)))),
            Err("The file couldn’t be opened.".to_string())
        );
    }
}
