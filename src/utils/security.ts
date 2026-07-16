const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function sanitizeUserText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string' || maxLength <= 0) return '';
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeIdentifier(value: unknown, maxLength = 80): string {
  return sanitizeUserText(value, maxLength * 2)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, maxLength);
}

export function sanitizeFileName(value: unknown, fallback = 'sportscout-export.json'): string {
  const safe = sanitizeUserText(value, 180)
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\-_]+/, '')
    .replace(/-+\./g, '.')
    .replace(/[.\-_]+$/g, '');
  return safe || fallback;
}

export function neutralizeSpreadsheetFormula(value: unknown): string {
  const text = String(value ?? '');
  return /^\s*[=+@-]/.test(text) ? `'${text}` : text;
}
