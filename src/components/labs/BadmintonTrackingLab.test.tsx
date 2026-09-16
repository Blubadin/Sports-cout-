import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BadmintonTrackingLab from './BadmintonTrackingLab';
import { aiTrackingService } from '../../services/aiTrackingService';

vi.mock('../../context/ScoutContext', () => ({ useScoutContext: () => ({ matchInfo: { sportType: 'badminton' }, settings: { uiLanguage: 'en' }, videoSourceType: 'local', localFileName: 'rally.mp4', setLocalFileName: vi.fn(), setVideoSourceType: vi.fn(), showToast: vi.fn() }) }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ activeProjectId: 'p1', projects: [], updateProjectVideoCalibration: vi.fn() }) }));
vi.mock('../../utils/videoFileStore', () => ({ loadProjectVideoFileHandle: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/storage/trackingStorage', () => ({ listTrackingAnalyses: vi.fn().mockResolvedValue([]), getTrackingSampleChunks: vi.fn(), saveTrackingAnalysis: vi.fn(), downsampleAndChunkTrackingSamples: vi.fn() }));
vi.mock('../../services/aiTrackingService', () => ({ aiTrackingService: { checkBackendHealth: vi.fn(), createSession: vi.fn(), uploadSessionVideo: vi.fn(), calibrateSession: vi.fn(), startSessionAnalysis: vi.fn(), getSessionStatus: vi.fn(), deleteSession: vi.fn().mockResolvedValue(undefined) } }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(aiTrackingService.checkBackendHealth).mockResolvedValue(true); URL.createObjectURL = vi.fn(() => 'blob:video'); URL.revokeObjectURL = vi.fn(); });
afterEach(cleanup);
it('requires actual video bytes and four real court corners before analysis', async () => {
  render(<BadmintonTrackingLab />);
  await waitFor(() => expect(aiTrackingService.checkBackendHealth).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: /Run Movement Analysis/i })).toBeDisabled();
  expect(screen.getByLabelText('Select video file')).toBeInTheDocument();
  expect(aiTrackingService.createSession).not.toHaveBeenCalled();
});
it('does not offer or launch synthetic tracking when the backend is offline', async () => {
  vi.mocked(aiTrackingService.checkBackendHealth).mockResolvedValue(false);
  render(<BadmintonTrackingLab />);
  await screen.findByText('Local AI service offline');
  expect(screen.queryByText(/Use Simulation|In-Browser Engine/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run Movement Analysis/i })).toBeDisabled();
});
