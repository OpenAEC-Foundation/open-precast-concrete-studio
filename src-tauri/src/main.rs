#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use std::path::Path;

#[cfg(windows)]
mod sheet_pdf;

#[tauri::command]
async fn save_document(
    window: tauri::WebviewWindow,
    kind: String,
    suggested_name: String,
    contents: String,
) -> Result<bool, String> {
    let (title, filter, extension) = match kind.as_str() {
        "ifc" => ("IFC4 exporteren", "IFC-model", "ifc"),
        "project" => ("Ontwerp opslaan", "Open Precast-ontwerp", "json"),
        "feedback" => ("Feedbackconcept opslaan", "Tekstbestand", "txt"),
        _ => return Err("Onbekend documenttype.".into()),
    };
    let name = Path::new(&suggested_name)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Ongeldige bestandsnaam.")?;
    let selected = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title(title)
        .set_file_name(name)
        .add_filter(filter, &[extension])
        .save_file()
        .await;
    let Some(file) = selected else {
        return Ok(false);
    };
    let path = file.path();
    let parent = path.parent().ok_or("Ongeldige doelmap.")?;
    // Replace the previous revision only after the complete new file is on disk.
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary
        .write_all(contents.as_bytes())
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    temporary.persist(path).map_err(|e| e.error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn open_feedback_issue(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "Ongeldige koppeling".to_string())?;
    if !url.starts_with("https://github.com/") || parsed.host_str() != Some("github.com") {
        return Err("Alleen GitHub-koppelingen kunnen worden geopend.".into());
    }
    open::that_detached(parsed.as_str()).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_supplier_source(url: String) -> Result<(), String> {
    const SOURCES: [&str; 3] = [
        "https://www.olbecon.nl/prefab/balkons-en-galerijplaten",
        "https://www.omgprefabbeton.be/",
        "https://www.vebo.nl/balkonconcept",
    ];
    if !SOURCES.contains(&url.as_str()) {
        return Err("Onbekende productspecificatie.".into());
    }
    open::that_detached(url).map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_sheet_pdf(
    window: tauri::WebviewWindow,
    suggested_name: String,
) -> Result<bool, String> {
    #[cfg(windows)]
    {
        sheet_pdf::save(&window, &suggested_name).await
    }
    #[cfg(not(windows))]
    {
        let _ = suggested_name;
        window.print().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_document,
            open_feedback_issue,
            open_supplier_source,
            export_sheet_pdf
        ])
        .run(tauri::generate_context!())
        .expect("Open Precast Concrete Studio kon niet starten");
}
