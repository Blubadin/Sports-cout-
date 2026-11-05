import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock HTMLCanvasElement getContext and toDataURL to eliminate jsdom "Not implemented" warnings
if (typeof HTMLCanvasElement !== 'undefined') {
  const createMockContext2D = (canvas: HTMLCanvasElement): unknown => {
    const target: Record<string, unknown> = {
      canvas,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1.0,
      globalCompositeOperation: 'source-over',
      shadowBlur: 0,
      shadowColor: 'transparent',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      lineDashOffset: 0,
      filter: 'none',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
      direction: 'inherit',
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      measureText: vi.fn(() => ({
        width: 0,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0,
        fontBoundingBoxAscent: 0,
        fontBoundingBoxDescent: 0,
        emHeightAscent: 0,
        emHeightDescent: 0,
        hangingBaseline: 0,
        alphabeticBaseline: 0,
        ideographicBaseline: 0,
      })),
      isPointInPath: vi.fn(() => false),
      isPointInStroke: vi.fn(() => false),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createConicGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => null),
      getLineDash: vi.fn(() => []),
    };

    return new Proxy(target, {
      get(obj, prop: string) {
        if (prop in obj) {
          return obj[prop];
        }
        obj[prop] = vi.fn();
        return obj[prop];
      },
      set(obj, prop: string, value: unknown) {
        obj[prop] = value;
        return true;
      },
    });
  };

  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(function (this: HTMLCanvasElement, contextId: string) {
    if (contextId === '2d') {
      return createMockContext2D(this) as RenderingContext;
    }
    return null;
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
}
