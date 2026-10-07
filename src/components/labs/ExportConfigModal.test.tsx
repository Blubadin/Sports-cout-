import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExportConfigModal from './ExportConfigModal';
import { trackingSessionApi } from '../../services/trackingSessionApi';

vi.mock('../../services/trackingSessionApi', () => ({
  trackingSessionApi: {
    startSessionExport: vi.fn(),
    getExportStatus: vi.fn(),
    cancelExport: vi.fn(),
    getExportDownloadUrl: vi.fn((id: string) => `http://127.0.0.1:8000/api/tracking/exports/${id}/download`),
  },
}));

describe('ExportConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders presets and overlay configuration when opened', () => {
    render(
      <ExportConfigModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="sess_test_123"
        language="en"
      />
    );

    expect(screen.getByText(/Export Analysis Package/i)).toBeInTheDocument();
    expect(screen.getByText('CLEAN')).toBeInTheDocument();
    expect(screen.getByText('ANALYSIS')).toBeInTheDocument();
    expect(screen.getByText('DEBUG')).toBeInTheDocument();
    expect(screen.getByText(/Court Polygon Overlay/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Export/i)).toBeInTheDocument();
  });

  it('switches to CLEAN preset and disables overlays', () => {
    render(
      <ExportConfigModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="sess_test_123"
        language="en"
      />
    );

    const cleanButton = screen.getByText('CLEAN');
    fireEvent.click(cleanButton);

    const courtCheckbox = screen.getByLabelText(/Court Polygon Overlay/i) as HTMLInputElement;
    expect(courtCheckbox.checked).toBe(false);
  });

  it('starts export and polls status until completion', async () => {
    vi.mocked(trackingSessionApi.startSessionExport).mockResolvedValueOnce({
      exportId: 'exp_abc123',
      sessionId: 'sess_test_123',
      status: 'QUEUED',
      preset: 'ANALYSIS',
      options: {},
    });

    vi.mocked(trackingSessionApi.getExportStatus)
      .mockResolvedValueOnce({
        exportId: 'exp_abc123',
        sessionId: 'sess_test_123',
        status: 'PROCESSING',
        stage: 'RENDERING_VIDEO',
        progress: 35,
        detail: 'Rendering frames...',
      })
      .mockResolvedValueOnce({
        exportId: 'exp_abc123',
        sessionId: 'sess_test_123',
        status: 'COMPLETED',
        stage: 'COMPLETED',
        progress: 100,
        detail: 'Export complete',
        archiveSizeBytes: 5242880,
      });

    render(
      <ExportConfigModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="sess_test_123"
        language="en"
      />
    );

    const startBtn = screen.getByText(/Start Export/i);
    fireEvent.click(startBtn);

    await waitFor(
      () => {
        expect(trackingSessionApi.startSessionExport).toHaveBeenCalledWith(
          'sess_test_123',
          expect.objectContaining({
            preset: 'ANALYSIS',
            court: true,
            shuttle: true,
          })
        );
      },
      { timeout: 3000 }
    );

    await waitFor(
      () => {
        expect(screen.getByText(/Download Analysis Package/i)).toBeInTheDocument();
        expect(screen.getByText(/5.00 MB/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('handles cancellation properly', async () => {
    vi.mocked(trackingSessionApi.startSessionExport).mockResolvedValueOnce({
      exportId: 'exp_cancel123',
      sessionId: 'sess_test_123',
      status: 'QUEUED',
      preset: 'ANALYSIS',
      options: {},
    });

    vi.mocked(trackingSessionApi.getExportStatus).mockResolvedValue({
      exportId: 'exp_cancel123',
      sessionId: 'sess_test_123',
      status: 'PROCESSING',
      stage: 'RENDERING_VIDEO',
      progress: 20,
      detail: 'Rendering...',
    });

    vi.mocked(trackingSessionApi.cancelExport).mockResolvedValueOnce({
      exportId: 'exp_cancel123',
      status: 'CANCEL_REQUESTED',
    });

    render(
      <ExportConfigModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="sess_test_123"
        language="en"
      />
    );

    fireEvent.click(screen.getByText(/Start Export/i));

    await waitFor(
      () => {
        expect(screen.getByText(/Cancel Export/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    fireEvent.click(screen.getByText(/Cancel Export/i));

    await waitFor(
      () => {
        expect(trackingSessionApi.cancelExport).toHaveBeenCalledWith('exp_cancel123');
      },
      { timeout: 3000 }
    );
  });
});

