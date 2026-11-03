import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDesktopApp,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
  pickVideoFileNative,
} from '../../utils/desktopApp';

// Setup stable mock instances
const mockMinimize = vi.fn();
const mockToggleMaximize = vi.fn();
const mockClose = vi.fn();
const mockGetCurrentWindow = vi.fn(() => ({
  minimize: mockMinimize,
  toggleMaximize: mockToggleMaximize,
  close: mockClose,
}));

const mockOpen = vi.fn();
const mockConvertFileSrc = vi.fn();

// Mock Tauri window API module
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockGetCurrentWindow(),
}));

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => mockConvertFileSrc(p),
}));

describe('utils/desktopApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI__;
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    mockMinimize.mockResolvedValue(undefined);
    mockToggleMaximize.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockConvertFileSrc.mockImplementation((p: string) => `asset://localhost/${p}`);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI__;
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  describe('isDesktopApp', () => {
    it('should return false when neither __TAURI__ nor __TAURI_INTERNALS__ exists', () => {
      expect(isDesktopApp()).toBe(false);
    });

    it('should return true when __TAURI__ exists', () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      expect(isDesktopApp()).toBe(true);
    });

    it('should return true when __TAURI_INTERNALS__ exists', () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(isDesktopApp()).toBe(true);
    });

    it('should return true when both exist', () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(isDesktopApp()).toBe(true);
    });
  });

  describe('minimizeDesktopWindow', () => {
    it('should return immediately without doing anything when not in desktop environment', async () => {
      await minimizeDesktopWindow();
      expect(mockGetCurrentWindow).not.toHaveBeenCalled();
      expect(mockMinimize).not.toHaveBeenCalled();
    });

    it('should call getCurrentWindow().minimize() when in desktop environment', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      await minimizeDesktopWindow();
      expect(mockGetCurrentWindow).toHaveBeenCalled();
      expect(mockMinimize).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully when getCurrentWindow throws an exception', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockGetCurrentWindow.mockImplementationOnce(() => {
        throw new Error('Window API crash');
      });
      await expect(minimizeDesktopWindow()).resolves.not.toThrow();
    });

    it('should handle errors gracefully when minimize throws', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockMinimize.mockRejectedValueOnce(new Error('Minimize failed'));
      await expect(minimizeDesktopWindow()).resolves.not.toThrow();
    });
  });

  describe('toggleMaximizeDesktopWindow', () => {
    it('should return immediately without doing anything when not in desktop environment', async () => {
      await toggleMaximizeDesktopWindow();
      expect(mockGetCurrentWindow).not.toHaveBeenCalled();
      expect(mockToggleMaximize).not.toHaveBeenCalled();
    });

    it('should call getCurrentWindow().toggleMaximize() when in desktop environment', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      await toggleMaximizeDesktopWindow();
      expect(mockGetCurrentWindow).toHaveBeenCalled();
      expect(mockToggleMaximize).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully when toggleMaximize throws an exception', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockToggleMaximize.mockRejectedValueOnce(new Error('Toggle failed'));
      await expect(toggleMaximizeDesktopWindow()).resolves.not.toThrow();
    });
  });

  describe('closeDesktopWindow', () => {
    it('should return immediately without doing anything when not in desktop environment', async () => {
      await closeDesktopWindow();
      expect(mockGetCurrentWindow).not.toHaveBeenCalled();
      expect(mockClose).not.toHaveBeenCalled();
    });

    it('should call getCurrentWindow().close() when in desktop environment', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      await closeDesktopWindow();
      expect(mockGetCurrentWindow).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully when close throws an exception', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockClose.mockRejectedValueOnce(new Error('Close failed'));
      await expect(closeDesktopWindow()).resolves.not.toThrow();
    });
  });

  describe('pickVideoFileNative', () => {
    it('should return null when not in desktop environment', async () => {
      const result = await pickVideoFileNative();
      expect(result).toBeNull();
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('should return NativeVideoFileInfo with correct file path, name, and asset URL when user selects a file', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockOpen.mockResolvedValueOnce('C:\\Videos\\MatchFinals.mp4');

      const result = await pickVideoFileNative();
      expect(result).toEqual({
        filePath: 'C:\\Videos\\MatchFinals.mp4',
        fileName: 'MatchFinals.mp4',
        assetUrl: 'asset://localhost/C:\\Videos\\MatchFinals.mp4',
      });
      expect(mockOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          multiple: false,
          directory: false,
        }),
      );
    });

    it('should handle Unix-style file paths correctly', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockOpen.mockResolvedValueOnce('/home/user/matches/game.mov');

      const result = await pickVideoFileNative();
      expect(result).toEqual({
        filePath: '/home/user/matches/game.mov',
        fileName: 'game.mov',
        assetUrl: 'asset://localhost//home/user/matches/game.mov',
      });
    });

    it('should return null when user cancels dialog (open returns null)', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockOpen.mockResolvedValueOnce(null);

      const result = await pickVideoFileNative();
      expect(result).toBeNull();
    });

    it('should handle open dialog errors gracefully', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockOpen.mockRejectedValueOnce(new Error('Dialog canceled by system'));

      const result = await pickVideoFileNative();
      expect(result).toBeNull();
    });

    it('should handle asset URL conversion error gracefully by keeping assetUrl undefined', async () => {
      (window as unknown as Record<string, unknown>).__TAURI__ = {};
      mockOpen.mockResolvedValueOnce('C:\\Videos\\clip.mp4');
      mockConvertFileSrc.mockImplementationOnce(() => {
        throw new Error('Asset conversion unsupported');
      });

      const result = await pickVideoFileNative();
      expect(result).toEqual({
        filePath: 'C:\\Videos\\clip.mp4',
        fileName: 'clip.mp4',
        assetUrl: undefined,
      });
    });
  });
});
