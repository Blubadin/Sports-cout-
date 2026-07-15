import { Gamepad2 } from 'lucide-react';
import { getControllerButtonLabel } from '../../controller/controllerProfileEditing';
import type { ControllerHudMode } from '../../controller/controllerHudBridge';
import type { ControllerProfile } from '../../controller/types';
import type { GamepadRuntimeStatus } from '../../hooks/useGamepadRuntime';

type Prompt = { control: string; label: string };

export default function HUDControllerPrompts({
  status,
  profile,
  mode,
  language,
}: {
  status: GamepadRuntimeStatus;
  profile: ControllerProfile | null;
  mode: ControllerHudMode;
  language: 'th' | 'en';
}) {
  if (status.state === 'disabled') return null;
  const isThai = language === 'th';

  if (status.state !== 'connected' || !profile) {
    return (
      <div className="pointer-events-none absolute bottom-28 left-3 z-50 flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] font-semibold text-white/65 backdrop-blur-md">
        <Gamepad2 size={15} />
        {status.state === 'unsupported'
          ? (isThai ? 'เบราว์เซอร์นี้ไม่รองรับจอย' : 'Controller is unavailable')
          : (isThai ? 'รอจอย: กดปุ่มใดก็ได้เพื่อเชื่อมต่อ' : 'Controller ready: press any button to connect')}
      </div>
    );
  }

  const button = (command: keyof ControllerProfile['bindings']) => {
    const control = profile.bindings[command];
    return control ? getControllerButtonLabel(control, profile.deviceFamily) : '—';
  };
  let prompts: Prompt[];
  if (mode === 'active-wheel') {
    prompts = [
      { control: 'LS', label: isThai ? 'เล็ง' : 'Aim' },
      { control: isThai ? 'ปล่อยปุ่ม' : 'Release', label: isThai ? 'เลือก' : 'Select' },
      { control: isThai ? 'แกนกลาง' : 'Neutral', label: isThai ? 'ยกเลิก' : 'Cancel' },
    ];
  } else if (mode === 'history') {
    prompts = [
      { control: 'D-pad', label: isThai ? 'แท็บ / รายการ' : 'Tabs / Items' },
      { control: button('confirm'), label: isThai ? 'เปิด Replay' : 'Open Replay' },
      { control: button('openResult'), label: isThai ? 'กลับ' : 'Back' },
    ];
  } else if (mode === 'replay') {
    prompts = [
      { control: button('confirm'), label: isThai ? 'เล่น / หยุด' : 'Play / Pause' },
      { control: button('saveEvent'), label: 'Loop' },
      { control: `${button('seekBackward')} / ${button('seekForward')}`, label: isThai ? 'กรอ' : 'Seek' },
      { control: button('openResult'), label: isThai ? 'ปิด Replay' : 'Close Replay' },
    ];
  } else {
    prompts = [
      { control: button('openSkill'), label: isThai ? 'ทักษะ' : 'Skill' },
      { control: button('openArea'), label: isThai ? 'พื้นที่' : 'Area' },
      { control: button('openResult'), label: isThai ? 'ผลลัพธ์' : 'Result' },
      { control: button('saveEvent'), label: isThai ? 'บันทึก' : 'Save' },
      { control: button('toggleHistory'), label: isThai ? 'ประวัติ' : 'History' },
      { control: button('cancel'), label: isThai ? 'ออก HUD' : 'Exit HUD' },
    ];
  }

  return (
    <div className="pointer-events-none absolute bottom-28 left-3 z-50 max-w-[calc(100%-1.5rem)] rounded-md border border-sky-400/20 bg-slate-950/82 px-2 py-1.5 shadow-lg backdrop-blur-md">
      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        <span className="flex shrink-0 items-center gap-1 border-r border-white/10 pr-2 text-[10px] font-bold text-emerald-300">
          <Gamepad2 size={14} />
          {profile.deviceFamily.toUpperCase()}
        </span>
        {prompts.map((prompt) => (
          <span key={`${prompt.control}-${prompt.label}`} className="flex shrink-0 items-center gap-1 text-[10px] text-white/70">
            <kbd className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-black text-white">
              {prompt.control}
            </kbd>
            <span>{prompt.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
