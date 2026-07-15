import React from 'react';
import {
  Copy,
  Download,
  Gamepad2,
  ListChecks,
  Radio,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {
  CONTROLLER_COMMANDS,
  createControllerProfileExport,
  findBindingConflict,
  getControllerButtonLabel,
  resolveControllerRemap,
  sanitizeImportedControllerProfile,
  type ControllerRemapResolution,
} from '../../controller/controllerProfileEditing';
import { createControllerProfileRepository } from '../../controller/controllerProfileRepository';
import { pulseBrowserGamepad } from '../../controller/gamepadRuntime';
import type {
  ControllerButtonName,
  ControllerCalibration,
  ControllerCommandId,
  ControllerDeviceFamily,
  ControllerInputEvent,
  ControllerProfile,
  ControllerProfileEnvelope,
} from '../../controller/types';
import { useGamepadRuntime } from '../../hooks/useGamepadRuntime';
import { t, type SupportedLanguage } from '../../i18n';
import ControllerBlueprint from './ControllerBlueprint';
import ControllerStickMonitor from './ControllerStickMonitor';

type ControllerSettingsPanelProps = {
  language: SupportedLanguage;
  controllerEnabled: boolean;
  onControllerEnabledChange: (enabled: boolean) => void;
};

type ControllerSubview = 'overview' | 'mapping' | 'calibration';

type StickReadings = Record<'left' | 'right', { x: number; y: number; magnitude: number }>;

type PendingConflict = {
  command: ControllerCommandId;
  control: ControllerButtonName;
  existingCommand: ControllerCommandId;
};

const FAMILY_OPTIONS: Array<{ id: ControllerDeviceFamily; label: string }> = [
  { id: 'ps5', label: 'PS5' },
  { id: 'ps4', label: 'PS4' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'generic', label: 'Generic' },
];

const LEFT_CALLOUTS: ControllerButtonName[] = [
  'left-trigger',
  'left-shoulder',
  'dpad-left',
  'dpad-right',
  'view',
];

const RIGHT_CALLOUTS: ControllerButtonName[] = [
  'right-trigger',
  'right-shoulder',
  'button-west',
  'button-north',
  'button-east',
  'button-south',
  'menu',
  'right-stick',
];

const CALIBRATION_CONTROLS: Array<{
  key: keyof ControllerCalibration;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  { key: 'deadzone', labelKey: 'controller.deadzone', min: 0, max: 0.5, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'sensitivity', labelKey: 'controller.sensitivity', min: 0.5, max: 2, step: 0.05, format: (value) => `${value.toFixed(2)}x` },
  { key: 'smoothing', labelKey: 'controller.smoothing', min: 0, max: 0.8, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'activationThreshold', labelKey: 'controller.activation', min: 0.1, max: 0.9, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'neutralCancelThreshold', labelKey: 'controller.neutral', min: 0.1, max: 0.6, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
  { key: 'sectorHysteresis', labelKey: 'controller.hysteresis', min: 0, max: 0.25, step: 0.01, format: (value) => `${Math.round(value * 100)}%` },
];

export default function ControllerSettingsPanel({
  language,
  controllerEnabled,
  onControllerEnabledChange,
}: ControllerSettingsPanelProps) {
  const repository = React.useMemo(() => createControllerProfileRepository(), []);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const lastDetectedControllerRef = React.useRef<string | null>(null);
  const [profileState, setProfileState] = React.useState<ControllerProfileEnvelope | null>(null);
  const [family, setFamily] = React.useState<ControllerDeviceFamily>('ps5');
  const [selectedProfileId, setSelectedProfileId] = React.useState('');
  const [draftProfile, setDraftProfile] = React.useState<ControllerProfile | null>(null);
  const [subview, setSubview] = React.useState<ControllerSubview>('overview');
  const [dirty, setDirty] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const [captureCommand, setCaptureCommand] = React.useState<ControllerCommandId | null>(null);
  const [pendingConflict, setPendingConflict] = React.useState<PendingConflict | null>(null);
  const [selectedControl, setSelectedControl] = React.useState<ControllerButtonName | null>(null);
  const [activeControls, setActiveControls] = React.useState<Set<ControllerButtonName>>(new Set());
  const [sticks, setSticks] = React.useState<StickReadings>({
    left: { x: 0, y: 0, magnitude: 0 },
    right: { x: 0, y: 0, magnitude: 0 },
  });
  const [confirmReset, setConfirmReset] = React.useState(false);

  const loadProfiles = React.useCallback(async () => {
    const state = await repository.load();
    const activeId = state.activeProfileByFamily[family];
    const active = state.profiles.find((profile) => profile.id === activeId) ?? null;
    setProfileState(state);
    setSelectedProfileId(activeId);
    setDraftProfile(active ? { ...active, bindings: { ...active.bindings }, calibration: { ...active.calibration } } : null);
    setDirty(false);
  }, [family, repository]);

  React.useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const calibrationByFamily = React.useMemo(
    () => draftProfile ? { [draftProfile.deviceFamily]: draftProfile.calibration } : undefined,
    [draftProfile],
  );

  const requestRemap = React.useCallback((command: ControllerCommandId, control: ControllerButtonName) => {
    if (!draftProfile || pendingConflict) return;
    const existingCommand = findBindingConflict(draftProfile, command, control);
    setCaptureCommand(null);
    setSelectedControl(control);
    if (existingCommand) {
      setPendingConflict({ command, control, existingCommand });
      return;
    }
    setDraftProfile(resolveControllerRemap(draftProfile, command, control, 'replace'));
    setDirty(true);
  }, [draftProfile, pendingConflict]);

  const handleControllerEvent = React.useCallback((event: ControllerInputEvent) => {
    if (event.type === 'button-down') {
      setActiveControls((previous) => new Set(previous).add(event.control));
      setSelectedControl(event.control);
      void pulseBrowserGamepad(event.controllerIndex, 24);
      if (captureCommand && !pendingConflict) requestRemap(captureCommand, event.control);
    } else if (event.type === 'button-up') {
      setActiveControls((previous) => {
        const next = new Set(previous);
        next.delete(event.control);
        return next;
      });
    } else if (event.type === 'axis-change') {
      setSticks((previous) => ({
        ...previous,
        [event.stick]: { x: event.x, y: event.y, magnitude: event.magnitude },
      }));
    } else if (event.type === 'cancelled' || event.type === 'disconnected') {
      setActiveControls(new Set());
      setSticks({
        left: { x: 0, y: 0, magnitude: 0 },
        right: { x: 0, y: 0, magnitude: 0 },
      });
    }
  }, [captureCommand, pendingConflict, requestRemap]);

  const runtimeStatus = useGamepadRuntime({
    enabled: true,
    onInputEvent: handleControllerEvent,
    calibrationByFamily,
  });

  React.useEffect(() => {
    if (runtimeStatus.state === 'connected') {
      const controllerKey = `${runtimeStatus.controller.index}:${runtimeStatus.controller.family}`;
      if (lastDetectedControllerRef.current !== controllerKey) {
        lastDetectedControllerRef.current = controllerKey;
        setFamily(runtimeStatus.controller.family);
      }
    } else if (runtimeStatus.state === 'waiting') {
      lastDetectedControllerRef.current = null;
    }
  }, [runtimeStatus]);

  const selectFamily = (nextFamily: ControllerDeviceFamily) => {
    setFamily(nextFamily);
    setCaptureCommand(null);
    setPendingConflict(null);
    setConfirmReset(false);
    setFeedback('');
  };

  const selectProfile = async (profileId: string) => {
    const state = await repository.setActiveProfile(family, profileId);
    const profile = state.profiles.find((item) => item.id === profileId) ?? null;
    setProfileState(state);
    setSelectedProfileId(profileId);
    setDraftProfile(profile ? { ...profile, bindings: { ...profile.bindings }, calibration: { ...profile.calibration } } : null);
    setDirty(false);
    setConfirmReset(false);
  };

  const saveDraft = async () => {
    if (!draftProfile) return;
    const state = await repository.saveProfile(draftProfile);
    setProfileState(state);
    setDirty(false);
    setFeedback(t('controller.saved', language));
  };

  const duplicateProfile = async () => {
    if (!draftProfile) return;
    const duplicate = await repository.duplicateProfile(draftProfile.id, `${draftProfile.name} Copy`);
    const state = await repository.load();
    setProfileState(state);
    setSelectedProfileId(duplicate.id);
    setDraftProfile(duplicate);
    setDirty(false);
  };

  const resetProfile = async () => {
    if (!draftProfile) return;
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const reset = await repository.resetProfile(draftProfile.id);
    const state = await repository.load();
    setProfileState(state);
    setDraftProfile(reset);
    setDirty(false);
    setConfirmReset(false);
  };

  const exportProfile = () => {
    if (!draftProfile) return;
    const blob = new Blob([JSON.stringify(createControllerProfileExport(draftProfile), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${draftProfile.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'controller-profile'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importProfile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > 256 * 1024) {
      setFeedback(t('controller.invalidImport', language));
      return;
    }
    try {
      const imported = sanitizeImportedControllerProfile(JSON.parse(await file.text()));
      if (!imported) throw new Error('Invalid profile');
      const uniqueProfile = { ...imported, id: `imported-${Date.now()}` };
      const state = await repository.saveProfile(uniqueProfile);
      setFamily(uniqueProfile.deviceFamily);
      setProfileState(state);
      setSelectedProfileId(uniqueProfile.id);
      setDraftProfile(uniqueProfile);
      setDirty(false);
      setFeedback(t('controller.imported', language));
    } catch {
      setFeedback(t('controller.invalidImport', language));
    }
  };

  const resolveConflict = (resolution: ControllerRemapResolution) => {
    if (!draftProfile || !pendingConflict) return;
    setDraftProfile(resolveControllerRemap(
      draftProfile,
      pendingConflict.command,
      pendingConflict.control,
      resolution,
    ));
    if (resolution !== 'cancel') setDirty(true);
    setPendingConflict(null);
  };

  const commandForControl = (control: ControllerButtonName) =>
    CONTROLLER_COMMANDS.find((command) => draftProfile?.bindings[command] === control) ?? null;

  const renderCallouts = (controls: ControllerButtonName[]) => (
    <div className="flex flex-col gap-2">
      {controls.map((control) => {
        const command = commandForControl(control);
        return (
          <button
            key={control}
            type="button"
            onClick={() => setSelectedControl(control)}
            className={`flex min-h-12 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
              selectedControl === control
                ? 'border-cyan-400 bg-cyan-400/10'
                : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'
            }`}
          >
            <span className="min-w-0 text-xs font-semibold text-slate-300">
              {command ? t(`controller.command.${command}`, language) : t('controller.unbound', language)}
            </span>
            <kbd className="shrink-0 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] font-black text-cyan-300">
              {getControllerButtonLabel(control, family)}
            </kbd>
          </button>
        );
      })}
    </div>
  );

  if (!profileState || !draftProfile) {
    return <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">Loading controller profiles...</div>;
  }

  const familyProfiles = profileState.profiles.filter((profile) => profile.deviceFamily === family);

  return (
    <section className="relative overflow-hidden rounded-lg border border-slate-700 bg-[#0b111b] text-slate-100 shadow-xl">
      <header className="flex flex-col gap-4 border-b border-slate-700 bg-slate-950/80 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-2 text-cyan-300">
            <Gamepad2 size={22} />
          </div>
          <div>
            <h3 className="text-base font-black">{t('controller.title', language)}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{t('controller.subtitle', language)}</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
          runtimeStatus.state === 'connected'
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
            : runtimeStatus.state === 'unsupported'
              ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
              : 'border-amber-400/40 bg-amber-400/10 text-amber-300'
        }`}>
          <span className={`h-2 w-2 rounded-full ${runtimeStatus.state === 'connected' ? 'bg-emerald-400' : 'bg-current'}`} />
          {runtimeStatus.state === 'connected'
            ? `${t('controller.connected', language)} · ${runtimeStatus.controller.family.toUpperCase()}`
            : t(runtimeStatus.state === 'unsupported' ? 'controller.unsupported' : 'controller.waiting', language)}
        </div>
      </header>

      <div className="border-b border-slate-700 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-4 rounded-md border border-slate-700 bg-slate-950 p-1">
            {FAMILY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectFamily(option.id)}
                className={`min-w-16 flex-1 px-3 py-1.5 text-xs font-black transition-colors ${family === option.id ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <select
              value={selectedProfileId}
              onChange={(event) => void selectProfile(event.target.value)}
              className="min-w-44 flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400 xl:max-w-64"
              aria-label={t('controller.profile', language)}
            >
              {familyProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <button type="button" onClick={duplicateProfile} aria-label={t('controller.duplicate', language)} title={t('controller.duplicate', language)} className="rounded-md border border-slate-600 p-2 text-slate-300 hover:border-cyan-400 hover:text-cyan-300"><Copy size={16} /></button>
            <button type="button" onClick={exportProfile} aria-label={t('controller.export', language)} title={t('controller.export', language)} className="rounded-md border border-slate-600 p-2 text-slate-300 hover:border-cyan-400 hover:text-cyan-300"><Download size={16} /></button>
            <button type="button" onClick={() => importInputRef.current?.click()} aria-label={t('controller.import', language)} title={t('controller.import', language)} className="rounded-md border border-slate-600 p-2 text-slate-300 hover:border-cyan-400 hover:text-cyan-300"><Upload size={16} /></button>
            <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importProfile} className="hidden" />
          </div>
        </div>
      </div>

      <nav className="grid grid-cols-3 border-b border-slate-700 bg-slate-950/55 p-1.5" aria-label={t('controller.title', language)}>
        {([
          ['overview', Radio, 'controller.overview'],
          ['mapping', ListChecks, 'controller.mapping'],
          ['calibration', SlidersHorizontal, 'controller.calibration'],
        ] as const).map(([id, Icon, labelKey]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSubview(id);
              setCaptureCommand(null);
              setPendingConflict(null);
            }}
            aria-label={t(labelKey, language)}
            className={`flex min-h-10 items-center justify-center gap-2 px-2 text-xs font-bold transition-colors ${subview === id ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-white'}`}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{t(labelKey, language)}</span>
          </button>
        ))}
      </nav>

      <div className="p-4">
        {subview === 'overview' && (
          <div className="grid items-center gap-4 lg:grid-cols-[minmax(170px,0.75fr)_minmax(340px,1.5fr)_minmax(170px,0.75fr)]">
            <div className="order-2 lg:order-1">{renderCallouts(LEFT_CALLOUTS)}</div>
            <div className="order-1 lg:order-2"><ControllerBlueprint family={family} activeControls={activeControls} selectedControl={selectedControl} onControlClick={setSelectedControl} /></div>
            <div className="order-3">{renderCallouts(RIGHT_CALLOUTS)}</div>
          </div>
        )}

        {subview === 'mapping' && (
          <div>
            <div className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${captureCommand ? 'border-amber-400/50 bg-amber-400/10 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
              <Radio size={15} className={captureCommand ? 'animate-pulse' : ''} />
              {captureCommand
                ? `${t('controller.listening', language)}: ${t(`controller.command.${captureCommand}`, language)}`
                : t('controller.pressToMap', language)}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {CONTROLLER_COMMANDS.map((command) => {
                const control = draftProfile.bindings[command];
                return (
                  <button
                    key={command}
                    type="button"
                    onClick={() => setCaptureCommand(captureCommand === command ? null : command)}
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${captureCommand === command ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-900/70 hover:border-cyan-500'}`}
                  >
                    <span className="text-xs font-semibold text-slate-200">{t(`controller.command.${command}`, language)}</span>
                    <kbd className="shrink-0 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] font-black text-cyan-300">
                      {control ? getControllerButtonLabel(control, family) : t('controller.unbound', language)}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {subview === 'calibration' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(320px,1fr)]">
            <div>
              <ControllerBlueprint family={family} activeControls={activeControls} selectedControl={selectedControl} onControlClick={setSelectedControl} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ControllerStickMonitor label={t('controller.leftStick', language)} {...sticks.left} />
                <ControllerStickMonitor label={t('controller.rightStick', language)} {...sticks.right} />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {CALIBRATION_CONTROLS.map((control) => {
                const value = draftProfile.calibration[control.key];
                return (
                  <label key={control.key} className="rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                      <span>{t(control.labelKey, language)}</span>
                      <span className="font-mono text-cyan-300">{control.format(value)}</span>
                    </span>
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={value}
                      onChange={(event) => {
                        setDraftProfile((previous) => previous ? {
                          ...previous,
                          calibration: { ...previous.calibration, [control.key]: Number(event.target.value) },
                        } : previous);
                        setDirty(true);
                      }}
                      className="h-1.5 w-full cursor-pointer accent-cyan-400"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-slate-700 bg-slate-950/75 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex min-w-0 items-start gap-3">
          <input type="checkbox" checked={controllerEnabled} onChange={(event) => onControllerEnabledChange(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-cyan-500" />
          <span>
            <span className="block text-xs font-bold text-slate-200">{t('controller.experimental', language)}</span>
            <span className="block text-[11px] text-slate-500">{t('controller.experimentalHelp', language)}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {feedback && <span className="text-xs font-semibold text-emerald-300">{feedback}</span>}
          {dirty && <span className="text-xs font-semibold text-amber-300">{t('controller.unsaved', language)}</span>}
          <input
            value={draftProfile.name}
            onChange={(event) => {
              setDraftProfile({ ...draftProfile, name: event.target.value.slice(0, 80) });
              setDirty(true);
            }}
            className="min-w-36 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
            aria-label={t('controller.rename', language)}
          />
          <button type="button" onClick={resetProfile} className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold ${confirmReset ? 'border-rose-400 bg-rose-400/10 text-rose-300' : 'border-slate-600 text-slate-300 hover:border-rose-400 hover:text-rose-300'}`}>
            <RefreshCw size={14} /> {confirmReset ? `${t('controller.reset', language)}?` : t('controller.reset', language)}
          </button>
          <button type="button" onClick={saveDraft} disabled={!dirty} className="flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
            <Save size={14} /> {t('controller.saveProfile', language)}
          </button>
        </div>
      </footer>

      {pendingConflict && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-amber-400/40 bg-slate-900 p-5 shadow-2xl">
            <h4 className="text-base font-black text-white">{t('controller.conflict', language)}</h4>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {getControllerButtonLabel(pendingConflict.control, family)} · {t(`controller.command.${pendingConflict.existingCommand}`, language)}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => resolveConflict('swap')} className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950">{t('controller.swap', language)}</button>
              <button type="button" onClick={() => resolveConflict('replace')} className="rounded-md bg-amber-500 px-3 py-2 text-xs font-black text-slate-950">{t('controller.replace', language)}</button>
              <button type="button" onClick={() => resolveConflict('cancel')} className="rounded-md border border-slate-600 px-3 py-2 text-xs font-bold text-slate-300">{t('controller.cancel', language)}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
