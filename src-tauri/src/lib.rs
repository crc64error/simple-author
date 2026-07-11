#![cfg_attr(mobile, tauri::mobile_entry_point)]

use tauri::menu::{AboutMetadata, MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::Emitter;

fn build_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    let about = AboutMetadata {
        name: Some("Simple Author".into()),
        version: Some("1.0.0".into()),
        copyright: Some("Copyright © 2026 Carey Scott Turner".into()),
        ..Default::default()
    };

    let app_submenu = SubmenuBuilder::new(handle, "Simple Author")
        .about(Some(about))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_item = MenuItem::with_id(handle, "new", "New", true, Some("CmdOrCtrl+N"))?;
    let open_item = MenuItem::with_id(handle, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let save_item = MenuItem::with_id(handle, "save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as_item = MenuItem::with_id(
        handle,
        "save-as",
        "Save As…",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;

    let file_submenu = SubmenuBuilder::new(handle, "File")
        .item(&new_item)
        .item(&open_item)
        .item(&save_item)
        .item(&save_as_item)
        .separator()
        .close_window()
        .build()?;

    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .select_all()
        .build()?;

    let toggle_view_item = MenuItem::with_id(
        handle,
        "toggle-view",
        "Toggle Markdown / Rendered",
        true,
        Some("CmdOrCtrl+P"),
    )?;
    let toggle_notes =
        MenuItem::with_id(handle, "toggle-notes", "Toggle Author Notes", true, None::<&str>)?;
    let toggle_marks = MenuItem::with_id(
        handle,
        "toggle-marks",
        "Toggle Formatting Marks",
        true,
        None::<&str>,
    )?;
    let toggle_outline =
        MenuItem::with_id(handle, "toggle-outline", "Toggle Outline", true, None::<&str>)?;

    let view_submenu = SubmenuBuilder::new(handle, "View")
        .item(&toggle_view_item)
        .separator()
        .item(&toggle_notes)
        .item(&toggle_marks)
        .item(&toggle_outline)
        .build()?;

    let publish_guide = MenuItem::with_id(
        handle,
        "publish-guide",
        "Publishing Guide…",
        true,
        None::<&str>,
    )?;
    let help_submenu = SubmenuBuilder::new(handle, "Help")
        .item(&publish_guide)
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&help_submenu)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            build_app_menu(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().0.clone());
        })
        .run(tauri::generate_context!())
        .expect("error while running Simple Author");
}