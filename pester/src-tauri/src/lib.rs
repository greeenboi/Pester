use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconEvent,
    Emitter, Manager, PhysicalPosition, Position,
};

use log::LevelFilter;

#[tauri::command]
fn update_tray_menu(app: tauri::AppHandle, recent_users: Vec<String>) -> Result<(), String> {
    log::debug!(
        "Updating tray menu with {} recent users",
        recent_users.len()
    );

    let tray = app.tray_by_id("main-tray").ok_or("Tray not found")?;

    let menu = Menu::new(&app).map_err(|e| e.to_string())?;

    let open = MenuItem::with_id(&app, "open", "Open Pester", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&open).map_err(|e| e.to_string())?;

    let sep1 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    menu.append(&sep1).map_err(|e| e.to_string())?;

    let new_contact = MenuItem::with_id(&app, "new_contact", "New Contact…", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&new_contact).map_err(|e| e.to_string())?;

    if !recent_users.is_empty() {
        let sep2 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
        menu.append(&sep2).map_err(|e| e.to_string())?;

        for user in &recent_users {
            let label = if user.len() > 12 {
                format!("{}…", &user[..12])
            } else {
                user.clone()
            };
            let item =
                MenuItem::with_id(&app, &format!("chat_{}", user), &label, true, None::<&str>)
                    .map_err(|e| e.to_string())?;
            menu.append(&item).map_err(|e| e.to_string())?;
        }
    }

    let sep3 = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    menu.append(&sep3).map_err(|e| e.to_string())?;

    let quit =
        MenuItem::with_id(&app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;
    menu.append(&quit).map_err(|e| e.to_string())?;

    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Configure logging based on build mode
    let mut log_builder = tauri_plugin_log::Builder::new();

    #[cfg(debug_assertions)]
    {
        // Dev mode: verbose logging to console
        log_builder = log_builder
            .level(LevelFilter::Debug)
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Stdout,
            ))
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Webview,
            ));
        log::info!("🔧 Running in DEBUG mode with verbose logging");
    }

    #[cfg(not(debug_assertions))]
    {
        // Production mode: errors only, to file
        log_builder = log_builder
            .level(LevelFilter::Error)
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::LogDir {
                    file_name: Some("pester".to_string()),
                },
            ));
    }

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(log_builder.build())
        .invoke_handler(tauri::generate_handler![update_tray_menu])
        .setup(|app| {
            let window = app.handle().get_webview_window("main").unwrap();

            // Position window near system tray (bottom-right on Windows)
            #[cfg(target_os = "windows")]
            {
                let monitor = window
                    .current_monitor()
                    .expect("Failed to get current monitor")
                    .expect("No monitor found");
                let size = window.outer_size().expect("Failed to get window size");
                let x = monitor.size().width as i32 - size.width as i32 - 10;
                let y = monitor.size().height as i32 - size.height as i32 - 50;
                window
                    .set_position(Position::Physical(PhysicalPosition { x, y }))
                    .expect("Failed to set window position on Windows");
            }

            #[cfg(target_os = "macos")]
            {
                window.center().expect("Failed to center window on macOS");
            }

            #[cfg(target_os = "linux")]
            {
                window
                    .set_position(Position::Physical(PhysicalPosition { x: 100, y: 100 }))
                    .expect("Failed to set window position on Linux");
            }

            window.show().expect("Failed to show window");

            // ── Prevent window close (hide instead) ───────────────
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Prevent the window from closing/exiting
                    api.prevent_close();
                    // Hide the window instead
                    window_clone.hide().ok();
                }
            });

            // ── System tray setup ──────────────────────────────────
            let handle = app.handle().clone();

            // Build initial tray menu
            let open_item = MenuItem::with_id(app, "open", "Open Pester", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let new_contact_item =
                MenuItem::with_id(app, "new_contact", "New Contact…", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open_item, &sep1, &new_contact_item, &sep2, &quit_item],
            )?;

            if let Some(tray) = app.tray_by_id("main-tray") {
                tray.set_menu(Some(menu))?;

                tray.on_menu_event(move |app_handle, event| {
                    let id = event.id.as_ref();
                    match id {
                        "open" => {
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        "new_contact" => {
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app_handle.emit("tray-action", "new_contact");
                        }
                        _ if id.starts_with("chat_") => {
                            let user_id = id.strip_prefix("chat_").unwrap_or("");
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app_handle.emit("tray-action", format!("chat:{}", user_id));
                        }
                        _ => {}
                    }
                });

                let handle_clone = handle.clone();
                tray.on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(w) = handle_clone.get_webview_window("main") {
                            let _ = w.show();
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
