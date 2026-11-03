/**
 * SportsScout Desktop Native Integration (Tauri v2)
 *
 * Provides safe bindings to Tauri window controls, native file dialogs,
 * local video streaming, and background process management.
 * Falls back gracefully when running in web browser.
 */

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export async function minimizeDesktopWindow(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  } catch (err) {
    console.error('[Desktop] Failed to minimize window:', err);
  }
}

export async function toggleMaximizeDesktopWindow(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  } catch (err) {
    console.error('[Desktop] Failed to toggle maximize window:', err);
  }
}

export async function closeDesktopWindow(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } catch (err) {
    console.error('[Desktop] Failed to close window:', err);
  }
}

export interface NativeVideoFileInfo {
  filePath: string;
  fileName: string;
  assetUrl?: string;
}

/**
 * Open a native Windows file dialog to choose a match video.
 * Returns the local file path, file name, and Tauri asset URL,
 * allowing instant streaming of multi-gigabyte 1080p/4K videos without copying into memory.
 */
export async function pickVideoFileNative(): Promise<NativeVideoFileInfo | null> {
  if (!isDesktopApp()) return null;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Video Files (*.mp4, *.mov, *.mkv, *.avi, *.webm)',
          extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'],
        },
        {
          name: 'All Files (*.*)',
          extensions: ['*'],
        },
      ],
      title: 'Select Match Video for SportsScout',
    });

    if (typeof selected === 'string') {
      const fileName = selected.split(/[\\/]/).pop() || 'match-video.mp4';
      let assetUrl: string | undefined;
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        assetUrl = convertFileSrc(selected);
      } catch (assetErr) {
        console.warn('[Desktop] Could not convert file path to asset URL:', assetErr);
      }
      return { filePath: selected, fileName, assetUrl };
    }
    return null;
  } catch (err) {
    console.warn('[Desktop] Native dialog unavailable, fallback to browser file input:', err);
    return null;
  }
}
