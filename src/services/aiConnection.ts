export type AIConnectionCode =
  | 'CONNECTED'
  | 'AI_OFFLINE'
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'ENDPOINT_NOT_CONFIGURED'
  | 'MIXED_CONTENT'
  | 'NETWORK_ERROR'
  | 'BROWSER_SECURITY_BLOCKED'
  | 'CSP_BLOCKED';

export interface AIConnectionSnapshot {
  code: AIConnectionCode;
  connected: boolean;
  endpoint: string | null;
}

export interface ResolveAiConnectionOptions {
  pageUrl?: string;
  configuredEndpoint?: string | null;
}

const DEFAULT_LOOPBACK_ENDPOINT = 'http://127.0.0.1:8000';

const messages: Record<Exclude<AIConnectionCode, 'CONNECTED'>, string> = {
  AI_OFFLINE: 'AI service is offline.',
  AUTH_REQUIRED: 'AI service authentication is required.',
  AUTH_FAILED: 'AI service authentication failed.',
  ENDPOINT_NOT_CONFIGURED: 'AI service endpoint is not configured.',
  MIXED_CONTENT: 'AI service connection is blocked by browser security.',
  NETWORK_ERROR: 'AI service network connection failed.',
  BROWSER_SECURITY_BLOCKED: 'AI service connection is blocked by browser security.',
  CSP_BLOCKED: 'AI service connection is blocked by browser security policy.',
};

export class AIConnectionError extends Error {
  public readonly code: Exclude<AIConnectionCode, 'CONNECTED'>;

  public constructor(code: Exclude<AIConnectionCode, 'CONNECTED'>, _unsafeDetail?: string) {
    super(messages[code]);
    this.name = 'AIConnectionError';
    this.code = code;
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function normalizeEndpoint(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readBrowserPageUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.href;
}

function readConfiguredEndpoint(): string | undefined {
  const configured = import.meta.env.VITE_SPORTSCOUT_AI_ENDPOINT;
  return typeof configured === 'string' && configured.trim() ? configured : undefined;
}

export function resolveAiConnection(options: ResolveAiConnectionOptions = {}): AIConnectionSnapshot {
  const pageUrl = options.pageUrl ?? readBrowserPageUrl();
  const configuredEndpoint = options.configuredEndpoint ?? readConfiguredEndpoint();
  const endpoint = configuredEndpoint ? normalizeEndpoint(configuredEndpoint) : null;

  if (configuredEndpoint && !endpoint) {
    return { code: 'ENDPOINT_NOT_CONFIGURED', connected: false, endpoint: null };
  }

  if (endpoint) {
    if (pageUrl) {
      try {
        const page = new URL(pageUrl);
        if (page.protocol === 'https:' && new URL(endpoint).protocol === 'http:') {
          return { code: 'MIXED_CONTENT', connected: false, endpoint };
        }
      } catch {
        return { code: 'ENDPOINT_NOT_CONFIGURED', connected: false, endpoint: null };
      }
    }
    return { code: 'CONNECTED', connected: true, endpoint };
  }

  if (pageUrl) {
    try {
      if (isLoopbackHost(new URL(pageUrl).hostname)) {
        return { code: 'CONNECTED', connected: true, endpoint: DEFAULT_LOOPBACK_ENDPOINT };
      }
    } catch {
      return { code: 'ENDPOINT_NOT_CONFIGURED', connected: false, endpoint: null };
    }
  }

  return { code: 'ENDPOINT_NOT_CONFIGURED', connected: false, endpoint: null };
}

export function toWebSocketUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/telemetry';
  url.search = '';
  url.hash = '';
  return url.toString();
}
