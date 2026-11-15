import { describe, expect, it, vi } from 'vitest';
import { importProjectJsonFile } from '../../utils/projectImport';
import { MAX_IMPORT_FILE_BYTES } from '../../utils/importSafety';

describe('importProjectJsonFile shared helper', () => {
  it('rejects oversized files with localized toast feedback', async () => {
    const oversized = {
      size: MAX_IMPORT_FILE_BYTES + 1,
      text: vi.fn(),
    } as unknown as File;
    const importProject = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn();

    await expect(
      importProjectJsonFile({ file: oversized, uiLanguage: 'en', importProject, showToast }),
    ).resolves.toBe(false);

    expect(importProject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/smaller/i));
  });

  it('appends (Imported) to single project imports and leaves bundle exports untouched', async () => {
    const singleFile = new File([JSON.stringify({ title: 'Finals', events: [] })], 'finals.json', {
      type: 'application/json',
    });
    const importProject = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn();

    await expect(
      importProjectJsonFile({ file: singleFile, uiLanguage: 'en', importProject, showToast }),
    ).resolves.toBe(true);

    expect(importProject).toHaveBeenCalledWith({ title: 'Finals (Imported)', events: [] });
    expect(showToast).toHaveBeenCalledWith('Imported: Finals');

    const bundlePayload = { type: 'projects', projects: [{ title: 'P1', events: [] }] };
    const bundleFile = new File([JSON.stringify(bundlePayload)], 'bundle.json', {
      type: 'application/json',
    });

    await expect(
      importProjectJsonFile({ file: bundleFile, uiLanguage: 'th', importProject, showToast }),
    ).resolves.toBe(true);

    expect(importProject).toHaveBeenLastCalledWith(bundlePayload);
    expect(showToast).toHaveBeenLastCalledWith('นำเข้าโครงการสำเร็จ');
  });

  it('shows localized error toast for malformed JSON', async () => {
    const badFile = new File(['{not valid json'], 'broken.json', { type: 'application/json' });
    const importProject = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn();

    await expect(
      importProjectJsonFile({ file: badFile, uiLanguage: 'th', importProject, showToast }),
    ).resolves.toBe(false);

    expect(importProject).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('ไม่สามารถอ่านไฟล์ JSON ได้');
  });
});
