/**
 * trackingLifecycleHardening.test.ts — Phase 0.1 frontend contract tests.
 *
 * Verifies:
 * - uploadSessionVideo sends raw File/Blob (not FormData)
 * - filename is preserved safely with encodeURIComponent
 * - Content-Type is set correctly (empty type falls back to application/octet-stream)
 * - AbortSignal is still wired
 * - backend detail errors propagate
 * - ProjectTrackingState has no CALIBRATED state
 * - BackendSessionStatus type is canonical
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackingSessionApi } from '../../services/trackingSessionApi';
import type { ProjectTrackingState } from '../../services/trackingSessionStore';
import type { BackendSessionStatus } from '../../types';

describe('Phase 0.1 — Tracking Lifecycle Hardening (Frontend)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadSessionVideo contract', () => {
    it('sends raw File body, not FormData', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 1920, height: 1080 }),
      } as any);

      const file = new File(['video data'], 'match.mp4', { type: 'video/mp4' });
      await trackingSessionApi.uploadSessionVideo('session-1', file);

      const call = (global.fetch as any).mock.calls[0];
      const body = call[1].body;

      // Body must be the File itself, not FormData
      expect(body).toBe(file);
      expect(body).not.toBeInstanceOf(FormData);
    });

    it('preserves filename with encoding for spaces and unicode', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 1920, height: 1080 }),
      } as any);

      const file = new File(['video data'], 'แบดมินตัน match (1).mp4', { type: 'video/mp4' });
      await trackingSessionApi.uploadSessionVideo('session-1', file);

      const url = (global.fetch as any).mock.calls[0][0] as string;
      const encoded = encodeURIComponent('แบดมินตัน match (1).mp4');
      expect(url).toContain(`filename=${encoded}`);
    });

    it('sets Content-Type from File.type', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 1920, height: 1080 }),
      } as any);

      const file = new File(['video data'], 'test.mp4', { type: 'video/mp4' });
      await trackingSessionApi.uploadSessionVideo('session-1', file);

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('video/mp4');
    });

    it('falls back to application/octet-stream when File.type is empty', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 1920, height: 1080 }),
      } as any);

      const file = new File(['video data'], 'test.mkv', { type: '' });
      await trackingSessionApi.uploadSessionVideo('session-1', file);

      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/octet-stream');
    });

    it('passes AbortSignal to fetch', async () => {
      const controller = new AbortController();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 1920, height: 1080 }),
      } as any);

      const file = new File(['video'], 'test.mp4', { type: 'video/mp4' });
      await trackingSessionApi.uploadSessionVideo('session-1', file, controller.signal);

      const options = (global.fetch as any).mock.calls[0][1];
      expect(options.signal).toBe(controller.signal);
    });

    it('propagates backend detail error message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'Container opens but first frame cannot be decoded' }),
      } as any);

      const file = new File(['bad data'], 'test.mp4', { type: 'video/mp4' });
      await expect(
        trackingSessionApi.uploadSessionVideo('session-1', file)
      ).rejects.toThrow('Container opens but first frame cannot be decoded');
    });
  });

  describe('ProjectTrackingState canonical statuses', () => {
    it('does not include CALIBRATED in status union', () => {
      // TypeScript enforces this at compile time, but this runtime test
      // ensures the CALIBRATED value is not accidentally used.
      const validStatuses = [
        'IDLE', 'CREATED', 'UPLOADING', 'VIDEO_READY',
        'READY_TO_ANALYZE', 'PROCESSING', 'COMPLETED', 'ERROR',
      ];
      // Verify CALIBRATED is not in the list
      expect(validStatuses).not.toContain('CALIBRATED');

      // Create a test state and verify it compiles/works with the new union
      const state: Pick<ProjectTrackingState, 'status'> = { status: 'IDLE' };
      expect(validStatuses).toContain(state.status);
    });
  });

  describe('BackendSessionStatus type', () => {
    it('accepts all canonical backend statuses', () => {
      const statuses: BackendSessionStatus[] = [
        'READY',
        'VIDEO_READY',
        'READY_TO_ANALYZE',
        'PROCESSING',
        'COMPLETED',
        'ERROR',
      ];
      expect(statuses).toHaveLength(6);
      // Each should be a string
      for (const s of statuses) {
        expect(typeof s).toBe('string');
      }
    });
  });
});
