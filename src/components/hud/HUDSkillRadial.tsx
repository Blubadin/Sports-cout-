import React from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import HUDSkillWheel from './HUDSkillWheel';
import { useHUDDeviceLayout } from '../../hooks/useHUDDeviceLayout';

interface Props {
  isActive: boolean;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onClick?: () => void;
  onDone?: () => void;
  phase?: 'skill' | 'descriptor';
  onPhaseChange?: (phase: 'skill' | 'descriptor') => void;
}

export default function HUDSkillRadial({ isActive, onPointerDown, onPointerUp, onClick, onDone, phase = 'skill', onPhaseChange }: Props) {
  const { currentAction, updateActionField, sportTemplate } = useScoutContext();
  const layout = useHUDDeviceLayout();

  const handleSelectSkill = (skillCode: string) => {
    updateActionField('skillCode', skillCode);
    const hasDesc = sportTemplate.descriptors && (sportTemplate.descriptors[skillCode] || sportTemplate.descriptors["ALL"] || []).length > 0;
    if (hasDesc && onPhaseChange) {
      onPhaseChange('descriptor');
    }
  };

  const handleDescriptorSelect = (groupId: string, value: string) => {
    updateActionField('descriptors' as any, value, groupId);
  };

  const currentSkillGroups = currentAction.skillCode && sportTemplate.descriptors ? (sportTemplate.descriptors[currentAction.skillCode] || sportTemplate.descriptors["ALL"] || []) : [];

  return (
    <div 
      className={`transition-all duration-300 transform origin-bottom-right ${isActive ? 'scale-100 opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'scale-[0.8] opacity-70 hover:opacity-100'}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <div className={`bg-black/60 backdrop-blur-xl rounded-full border ${isActive ? 'border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'border-white/10 shadow-2xl p-4'} relative flex items-center justify-center min-w-[64px] min-h-[64px]`}>
        <HUDSkillWheel
          skills={sportTemplate.skills}
          selectedSkill={currentAction.skillCode}
          onSelectSkill={handleSelectSkill}
          descriptors={currentSkillGroups}
          selectedDescriptors={currentAction.descriptors}
          onSelectDescriptor={handleDescriptorSelect}
          active={isActive}
          compact={!isActive}
          size={layout.skillWheelSize}
          onDone={onDone}
        />
      </div>
    </div>
  );
}
