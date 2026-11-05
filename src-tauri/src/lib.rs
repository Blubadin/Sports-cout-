use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct AppState {
    ai_process: Mutex<Option<Child>>,
}

fn is_server_listening() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8000));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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

            // Check if AI service is already running on port 8000 before spawning
            if is_server_listening() {
                log::info!("AI backend service is already listening on 127.0.0.1:8000; skipping spawn.");
                return Ok(());
            }

            // Resolve python runtime and server script from strict, deterministic paths
            let (python_exe, server_script, working_dir, web_dist) = if cfg!(debug_assertions) {
                let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                let repo_root = manifest_dir.parent().unwrap_or(&manifest_dir).to_path_buf();

                let python_candidates = [
                    repo_root.join("payload").join("python").join("python.exe"),
                    repo_root
                        .join(".local-services")
                        .join("python")
                        .join("Scripts")
                        .join("python.exe"),
                ];
                let resolved_python = python_candidates.into_iter().find(|p| p.is_file());
                let script = repo_root.join("ai_service").join("server.py");
                let dist = repo_root.join("dist");
                let dist_dir = if dist.join("index.html").is_file() {
                    Some(dist)
                } else {
                    None
                };
                (resolved_python, script, repo_root, dist_dir)
            } else {
                let resource_dir = app.path().resource_dir().unwrap_or_default();
                let python_candidates = [
                    resource_dir.join("payload").join("python").join("python.exe"),
                    resource_dir.join("python").join("python.exe"),
                ];
                let resolved_python = python_candidates.into_iter().find(|p| p.is_file());
                let script = resource_dir.join("ai_service").join("server.py");
                let dist = resource_dir.join("dist");
                let dist_dir = if dist.join("index.html").is_file() {
                    Some(dist)
                } else {
                    None
                };
                (resolved_python, script, resource_dir, dist_dir)
            };

            let state = app.state::<AppState>();
            if let Some(python) = python_exe {
                if server_script.is_file() {
                    let mut cmd = Command::new(&python);
                    cmd.arg(&server_script);
                    cmd.current_dir(&working_dir);
                    cmd.env("SPORTSCOUT_AI_HOST", "127.0.0.1");
                    if let Some(dist) = web_dist {
                        cmd.env("SPORTSCOUT_WEB_DIST", dist);
                    }

                    #[cfg(target_os = "windows")]
                    {
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        cmd.creation_flags(CREATE_NO_WINDOW);
                    }

                    match cmd.spawn() {
                        Ok(child) => {
                            log::info!(
                                "Started AI backend sidecar (PID {}) from {}",
                                child.id(),
                                python.display()
                            );
                            if let Ok(mut lock) = state.ai_process.lock() {
                                *lock = Some(child);
                            }
                        }
                        Err(err) => {
                            log::error!("Failed to spawn AI backend sidecar: {err}");
                        }
                    }
                } else {
                    log::warn!(
                        "AI backend script not found at {}; skipping sidecar spawn.",
                        server_script.display()
                    );
                }
            } else {
                log::warn!("No isolated Python runtime found in app resources or dev paths; skipping sidecar spawn (PATH fallback disabled).");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Terminate background AI process tree cleanly
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut lock) = state.ai_process.lock() {
                        if let Some(mut child) = lock.take() {
                            let pid = child.id();
                            log::info!("Terminating AI backend process tree (PID {pid})...");
                            #[cfg(target_os = "windows")]
                            {
                                const CREATE_NO_WINDOW: u32 = 0x08000000;
                                let _ = Command::new("taskkill")
                                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                                    .creation_flags(CREATE_NO_WINDOW)
                                    .status();
                            }
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
