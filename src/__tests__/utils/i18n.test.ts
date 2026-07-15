import { describe, it, expect } from 'vitest';
import { t } from '../../i18n';

describe('i18n t() function', () => {
  it('should return Thai text for known key with th language', () => {
    const result = t('app.title', 'th');
    expect(result).toBe('SportScout');
  });

  it('should return English text for known key with en language', () => {
    const result = t('app.title', 'en');
    expect(result).toBe('SportScout');
  });

  it('should return the key itself for unknown key', () => {
    const result = t('nonexistent.key', 'th');
    expect(result).toBe('nonexistent.key');
  });

  it('should default to Thai when no language specified', () => {
    const result = t('input.team');
    expect(result).toBe('ทีม');
  });

  // Verify key critical translations have both languages
  it.each([
    'dashboard.totalEvents',
    'table.no',
    'table.event',
    'table.title',
    'table.search',
    'table.showing',
    'table.exportFilteredCsv',
    'table.noMatches',
    'table.jumpToTime',
    'keyMoments.title',
    'keyMoments.openReplay',
    'keyMoments.savedToast',
    'input.team',
    'input.skill',
    'input.area',
    'input.result',
    'input.saveEvent',
    'input.pass',
    'input.yes',
    'input.out',
    'settings.title',
    'settings.language',
    'video.loadLocal',
    'video.loadYoutube',
    'video.playbackFailed',
    'video.errorBrowserBlocked',
    'workspace.activeProject',
    'workspace.myProjects',
  ])('should have both TH and EN for key: %s', (key) => {
    const th = t(key, 'th');
    const en = t(key, 'en');
    // Neither should fall back to the key itself
    expect(th).not.toBe(key);
    expect(en).not.toBe(key);
    // Both should be non-empty strings
    expect(th.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
  });
});
