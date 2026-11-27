use std::path::Path;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE,
    },
    PrintToPdfCompletedHandler,
};
use windows_core::{Interface, HSTRING};

pub async fn save(window: &tauri::WebviewWindow, suggested_name: &str) -> Result<bool, String> {
    let name = Path::new(suggested_name)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Ongeldige PDF-bestandsnaam.")?;
    let file = rfd::AsyncFileDialog::new()
        .set_parent(window)
        .set_title("Elementblad als PDF opslaan")
        .set_file_name(name)
        .add_filter("PDF-document", &["pdf"])
        .save_file()
        .await;
    let Some(file) = file else { return Ok(false) };
    let destination = file.path();
    let parent = destination.parent().ok_or("Ongeldige doelmap.")?;
    // Release the temporary file handle so WebView2 can open the path exclusively.
    let temporary = tempfile::Builder::new()
        .suffix(".pdf")
        .tempfile_in(parent)
        .map_err(|e| e.to_string())?
        .into_temp_path();
    let path = HSTRING::from(temporary.as_os_str());
    let (report, mut result) = tauri::async_runtime::channel(1);

    window
        .with_webview(move |view| {
            let completed = report.clone();
            let handler = PrintToPdfCompletedHandler::create(Box::new(move |status, saved| {
                let outcome = status.map_err(|e| e.to_string()).and_then(|()| {
                    if saved {
                        Ok(())
                    } else {
                        Err("WebView2 kon het elementblad niet schrijven.".into())
                    }
                });
                let _ = completed.try_send(outcome);
                Ok(())
            }));
            // COM interfaces and the print callback run on the WebView's UI thread.
            let start = || unsafe {
                let browser: ICoreWebView2_7 = view.controller().CoreWebView2()?.cast()?;
                let environment: ICoreWebView2Environment6 = view.environment().cast()?;
                let settings = environment.CreatePrintSettings()?;
                settings.SetPageWidth(210.0 / 25.4)?;
                settings.SetPageHeight(297.0 / 25.4)?;
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE)?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                browser.PrintToPdf(&path, &settings, &handler)
            };
            if let Err(error) = start() {
                let _ = report.try_send(Err(error.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;

    result.recv().await.ok_or("PDF-export onderbroken.")??;
    temporary
        .persist(destination)
        .map_err(|e| e.error.to_string())?;
    Ok(true)
}
