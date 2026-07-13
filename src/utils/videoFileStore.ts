import { get, set } from "idb-keyval";

export type VideoFilePermission = "granted" | "denied" | "prompt";

export type PersistentVideoFileHandle = {
  name?: string;
  getFile: () => Promise<File>;
  queryPermission?: (options: { mode: "read" }) => Promise<VideoFilePermission>;
  requestPermission?: (options: { mode: "read" }) => Promise<VideoFilePermission>;
};

export const getProjectVideoFileHandleKey = (projectId: string) =>
  `scout-video-handle:${projectId}`;

export const getLegacyVideoFileHandleKey = (fileName: string) =>
  `videoFileHandle-${fileName}`;

export async function saveProjectVideoFileHandle(
  projectId: string | null,
  fileName: string,
  handle: PersistentVideoFileHandle,
) {
  if (projectId) {
    await set(getProjectVideoFileHandleKey(projectId), handle);
    return;
  }

  await set(getLegacyVideoFileHandleKey(fileName), handle);
}

export async function loadProjectVideoFileHandle(
  projectId: string | null,
  fileName?: string | null,
): Promise<PersistentVideoFileHandle | null> {
  if (projectId) {
    const scopedHandle = await get<PersistentVideoFileHandle>(
      getProjectVideoFileHandleKey(projectId),
    );
    if (scopedHandle) return scopedHandle;
  }

  if (!fileName) return null;

  const legacyHandle = await get<PersistentVideoFileHandle>(
    getLegacyVideoFileHandleKey(fileName),
  );
  if (!legacyHandle) return null;

  if (projectId) {
    await set(getProjectVideoFileHandleKey(projectId), legacyHandle);
  }
  return legacyHandle;
}
