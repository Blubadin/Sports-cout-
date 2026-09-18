import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { trackingSessionApi } from '../../services/trackingSessionApi';
import { aiTrackingService } from '../../services/aiTrackingService';

describe('Phase 2 — Legacy HUD Tracking Removal & Boundary Isolation', () => {
  const srcRoot = path.resolve(__dirname, '../../');

  describe('1. HUD Component Cleanliness & Decoupling', () => {
    it('verifies ScoutHUDMode does NOT import or mount AIVideoTrackingOverlay', () => {
      const hudFile = path.join(srcRoot, 'components/hud/ScoutHUDMode.tsx');
      const content = fs.readFileSync(hudFile, 'utf-8');

      expect(content).not.toContain('AIVideoTrackingOverlay');
      expect(content).not.toContain('<AIVideoTrackingOverlay');
    });

    it('verifies AIVideoTrackingOverlay and useAITracking files have been removed from source', () => {
      const overlayFile = path.join(srcRoot, 'components/hud/AIVideoTrackingOverlay.tsx');
      const hookFile = path.join(srcRoot, 'hooks/useAITracking.ts');

      expect(fs.existsSync(overlayFile)).toBe(false);
      expect(fs.existsSync(hookFile)).toBe(false);
    });

    it('verifies HUDTopStatsBar contains no AI tracking controls or toggles', () => {
      const statsBarFile = path.join(srcRoot, 'components/hud/HUDTopStatsBar.tsx');
      const content = fs.readFileSync(statsBarFile, 'utf-8');

      expect(content).not.toContain('useAITracking');
      expect(content).not.toContain('AI Video Tracking');
      expect(content).not.toContain('startMarkingMode');
      expect(content).not.toContain('isMarkingMode');
    });

    it('verifies HUDMiniCourtSelector and ProAreaCommandPad do not use useAITracking or aiPlayers', () => {
      const miniCourtFile = path.join(srcRoot, 'components/hud/HUDMiniCourtSelector.tsx');
      const miniCourtContent = fs.readFileSync(miniCourtFile, 'utf-8');
      expect(miniCourtContent).not.toContain('useAITracking');
      expect(miniCourtContent).not.toContain('aiPlayers');

      const commandPadFile = path.join(srcRoot, 'components/hud/ProAreaCommandPad.tsx');
      const commandPadContent = fs.readFileSync(commandPadFile, 'utf-8');
      expect(commandPadContent).not.toContain('useAITracking');
      expect(commandPadContent).not.toContain('aiPlayers');
    });

    it('verifies BadmintonTouchCourt does not accept or render aiPlayers', () => {
      const courtFile = path.join(srcRoot, 'components/badminton/BadmintonTouchCourt.tsx');
      const courtContent = fs.readFileSync(courtFile, 'utf-8');

      expect(courtContent).not.toContain('aiPlayers?:');
      expect(courtContent).not.toContain('ai-players-layer');
    });

    it('verifies SettingsModal does not contain legacy AI tracking toggles', () => {
      const settingsFile = path.join(srcRoot, 'components/SettingsModal.tsx');
      const settingsContent = fs.readFileSync(settingsFile, 'utf-8');

      expect(settingsContent).not.toContain('aiTrackingEnabled');
      expect(settingsContent).not.toContain('aiTrackingMode');
      expect(settingsContent).not.toContain('เปิดใช้งาน AI Auto-Tracking ผู้เล่น');
    });
  });

  describe('2. Canonical trackingSessionApi Client Contracts', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      trackingSessionApi.setBaseUrl('http://127.0.0.1:8000');
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('handles checkBackendHealth correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      } as any);

      const isHealthy = await trackingSessionApi.checkBackendHealth();
      expect(isHealthy).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/status',
        expect.any(Object)
      );
    });

    it('creates tracking session through canonical API', async () => {
      const mockSessionResponse = {
        sessionId: 'test-session-123',
        status: 'created',
        gameType: 'doubles',
        createdAt: '2026-09-18T04:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSessionResponse,
      } as any);

      const res = await trackingSessionApi.createSession('doubles', 'upload', {
        projectId: 'project-1',
        trackedPlayerCount: 4,
      });

      expect(res.sessionId).toBe('test-session-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/tracking/sessions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_source: 'upload',
            game_type: 'doubles',
            project_id: 'project-1',
            video_fingerprint: null,
            device: 'auto',
            tracked_player_count: 4,
            processing_config: null,
          }),
        })
      );
    });

    it('uploads video to session endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 1920, height: 1080 }),
      } as any);

      const fakeFile = new File(['dummy video'], 'match.mp4', { type: 'video/mp4' });
      const result = await trackingSessionApi.uploadSessionVideo('session-xyz', fakeFile);

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/tracking/sessions/session-xyz/video',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('calibrates session court corners', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as any);

      const corners = [[0, 0], [100, 0], [100, 200], [0, 200]];
      await trackingSessionApi.calibrateSession('session-xyz', corners, 'singles');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/tracking/sessions/session-xyz/calibration',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ corners, game_type: 'singles' }),
        })
      );
    });

    it('fetches session status and results', async () => {
      const mockStatus = {
        sessionId: 'session-xyz',
        status: 'completed',
        progressPct: 100,
        currentFrame: 300,
        totalFrames: 300,
        fps: 30,
        error: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStatus,
      } as any);

      const status = await trackingSessionApi.getSessionStatus('session-xyz');
      expect(status.status).toBe('completed');
      expect(status.progressPct).toBe(100);
    });
  });

  describe('3. Elimination of In-Browser Simulation Engine & Fake Strokes', () => {
    it('ensures aiTrackingService does not have an active browser timer or simulation loop', () => {
      expect(aiTrackingService.getStatus()).toBe('disconnected');
      expect(aiTrackingService.getLatestFrame()).toBeNull();
      expect(aiTrackingService.getLatestTelemetryV1()).toBeNull();
    });

    it('ensures no fake stroke recognition classifications are generated', () => {
      // The legacy service contained hardcoded SMASH / DROP / NET_SHOT / CLEAR keywords.
      // Verify aiTrackingService does not export fake stroke methods.
      expect((aiTrackingService as any).simulatePlayersMovement).toBeUndefined();
      expect((aiTrackingService as any).detectStroke).toBeUndefined();
      expect((aiTrackingService as any).detectOpticalMotionCentroids).toBeUndefined();
    });
  });
});
