import { describe, expect, it } from 'vitest';
import { sanitizeFileName, sanitizeUserText } from '../../utils/security';

describe('security text sanitizers', () => {
  it('removes control characters and caps imported user text', () => {
    expect(sanitizeUserText('  Coach\u0000 note\r\nline  ', 18)).toBe('Coach note\nline');
    expect(sanitizeUserText('x'.repeat(30), 12)).toBe('x'.repeat(12));
  });

  it('creates a safe portable filename without path traversal', () => {
    expect(sanitizeFileName('../Pilot: Match/01?.json')).toBe('Pilot-Match-01.json');
    expect(sanitizeFileName('   ')).toBe('sportscout-export.json');
  });
});
