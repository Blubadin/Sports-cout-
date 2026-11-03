use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct AppState {
    ai_process: Mutex<Option<Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            ai_process: Mutex::new(None),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn background Python AI service if available and not already listening
            let state = app.state::<AppState>();
            let python_candidates = [
                "payload/python/python.exe",
                ".local-services/python/Scripts/python.exe",
                "python.exe",
                "python",
            ];

            for candidate in python_candidates {
                let mut cmd = Command::new(candidate);
                cmd.arg("ai_service/server.py");

                #[cfg(target_os = "windows")]
                {
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                if let Ok(child) = cmd.spawn() {
                    log::info!("Started AI backend via {}", candidate);
                    if let Ok(mut lock) = state.ai_process.lock() {
                        *lock = Some(child);
                    }
                    break;
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Terminate background AI process cleanly
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut lock) = state.ai_process.lock() {
                        if let Some(mut child) = lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
