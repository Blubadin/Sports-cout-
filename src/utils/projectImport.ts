import { MAX_IMPORT_FILE_BYTES, validateImportFileSize } from './importSafety';
import type { SupportedLanguage } from '../i18n';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read import file'));
    reader.readAsText(file);
  });
}

function withImportedTitleSuffix(
  payload: unknown,
  fallbackTitle: string,
): { payload: unknown; label: string; isSingleProject: boolean } {
  if (
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && !('type' in payload)
    && !('indexedDbProjects' in payload)
    && !('localStorage' in payload)
  ) {
    const record = payload as Record<string, unknown>;
    const originalTitle = typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : fallbackTitle;
    return {
      payload: {
        ...record,
        title: `${originalTitle} (Imported)`,
      },
      label: originalTitle,
      isSingleProject: true,
    };
  }
  return { payload, label: fallbackTitle, isSingleProject: false };
}

export async function importProjectJsonFile(options: {
  file: File;
  uiLanguage: SupportedLanguage;
  importProject: (project: unknown) => Promise<boolean>;
  showToast: (msg: string) => void;
}): Promise<boolean> {
  const { file, uiLanguage, importProject, showToast } = options;
  const isThai = uiLanguage === 'th';

  if (!validateImportFileSize(file.size)) {
    showToast(
      isThai
        ? `ไฟล์ใหญ่เกินไป ต้องไม่เกิน ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`
        : `Import file must be ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB or smaller`,
    );
    return false;
  }

  try {
    const content = await readFileAsText(file);
    const parsed: unknown = JSON.parse(content);
    const { payload, label, isSingleProject } = withImportedTitleSuffix(parsed, 'Imported Project');
    const success = await importProject(payload);
    if (success) {
      if (isSingleProject) {
        showToast(isThai ? `นำเข้าแล้ว: ${label}` : `Imported: ${label}`);
      } else {
        showToast(isThai ? 'นำเข้าโครงการสำเร็จ' : 'Projects imported');
      }
    }
    return success;
  } catch {
    showToast(isThai ? 'ไม่สามารถอ่านไฟล์ JSON ได้' : 'Failed to parse JSON');
    return false;
  }
}
