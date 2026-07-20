import { CheckCircle2, CircleAlert, Clock3 } from 'lucide-react';
import { useScoutContext } from '../../context/ScoutContext';
import { formatWorkstationTimecode } from '../../workstation/workstationModel';

function valueOrDash(value?: string) {
  return value?.trim() || '—';
}

export default function WorkstationInspector() {
  const {
    currentAction,
    getMissingActionMessage,
    isActionComplete,
    settings,
    sportTemplate,
    teams,
    videoTime,
  } = useScoutContext();
  const language = settings.uiLanguage || 'th';
  const hasInput = Object.values(currentAction).some(value => value !== undefined && value !== '');
  const isValid = hasInput && isActionComplete(currentAction);
  const state = isValid ? 'valid' : hasInput ? 'incomplete' : 'empty';
  const missingMessage = hasInput ? getMissingActionMessage(currentAction) : null;
  const team = teams.find(item => item.code === currentAction.teamCode);
  const skill = sportTemplate.skills.find(item => item.code === currentAction.skillCode);
  const result = sportTemplate.results.find(item => item.code === currentAction.resultCode);
  const area = sportTemplate.areas.find(item => item.code === currentAction.areaCode);

  const fields = [
    { label: language === 'th' ? 'ทีม' : 'Team', value: team?.code || currentAction.teamCode },
    { label: language === 'th' ? 'ทักษะ' : 'Skill', value: skill?.code || currentAction.skillCode },
    {
      label: language === 'th' ? 'พื้นที่' : 'Area',
      value: currentAction.areaLabel || currentAction.outZone || area?.code || currentAction.areaCode,
    },
    { label: language === 'th' ? 'ผลลัพธ์' : 'Result', value: result?.code || currentAction.resultCode },
    {
      label: language === 'th' ? 'ผู้เล่น' : 'Player',
      value: [currentAction.playerNumber, currentAction.playerName].filter(Boolean).join(' '),
    },
  ];

  return (
    <aside
      className="workstation-inspector"
      aria-label={language === 'th' ? 'ตัวตรวจสอบ' : 'Inspector'}
      data-inspector-state={state}
    >
      <header>
        <div>
          <span>{language === 'th' ? 'รายการปัจจุบัน' : 'Current action'}</span>
          <h2>{language === 'th' ? 'ตัวตรวจสอบ' : 'Inspector'}</h2>
        </div>
        <span className={`workstation-inspector-state ${isValid ? 'is-valid' : hasInput ? 'is-invalid' : ''}`}>
          {isValid ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
          {isValid
            ? (language === 'th' ? 'พร้อมบันทึก' : 'Valid')
            : hasInput
              ? (language === 'th' ? 'ข้อมูลไม่ครบ' : 'Incomplete')
              : (language === 'th' ? 'รายการใหม่' : 'New event')}
        </span>
      </header>

      <div className="workstation-inspector-fields">
        {fields.map(field => (
          <div key={field.label}>
            <span>{field.label}</span>
            <strong>{valueOrDash(field.value)}</strong>
          </div>
        ))}
      </div>

      <div className={`workstation-inspector-validation ${isValid ? 'is-valid' : ''}`} role="status">
        {isValid ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
        <div>
          <strong>{language === 'th' ? 'การตรวจสอบ' : 'Validation'}</strong>
          <span>
            {isValid
              ? (language === 'th' ? 'ข้อมูลพร้อมบันทึกเหตุการณ์' : 'Ready to save this event')
              : missingMessage || (language === 'th' ? 'รอเลือกข้อมูล' : 'Waiting for input')}
          </span>
        </div>
      </div>

      <footer>
        <Clock3 size={14} />
        <span>{language === 'th' ? 'เวลาวิดีโอ' : 'Video time'}</span>
        <code>{formatWorkstationTimecode(videoTime)}</code>
      </footer>
    </aside>
  );
}
