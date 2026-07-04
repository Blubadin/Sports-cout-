const fs = require('fs');

let code = fs.readFileSync('src/context/ScoutContext.tsx', 'utf-8');

// 1. Add history states and undo/redo functions to ScoutContextType
code = code.replace(
`  commitResult: (resultCode: string, isFastMode?: boolean) => void;
}`,
`  commitResult: (resultCode: string, isFastMode?: boolean) => void;
  canUndoEventAction: boolean;
  canRedoEventAction: boolean;
  undoEventAction: () => void;
  redoEventAction: () => void;
}`);

// 2. Add implementation inside ScoutProvider
code = code.replace(
`  const [toastMessage, setToastMessage] = useState<string | null>(null);`,
`  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [pastEvents, setPastEvents] = useState<EventRow[][]>([]);
  const [futureEvents, setFutureEvents] = useState<EventRow[][]>([]);

  const canUndoEventAction = pastEvents.length > 0;
  const canRedoEventAction = futureEvents.length > 0;

  const undoEventAction = () => {
    if (pastEvents.length === 0) return;
    const previous = pastEvents[pastEvents.length - 1];
    setPastEvents(prev => prev.slice(0, -1));
    setFutureEvents(prev => [events, ...prev]);
    setEvents(previous);
  };

  const redoEventAction = () => {
    if (futureEvents.length === 0) return;
    const next = futureEvents[0];
    setFutureEvents(prev => prev.slice(1));
    setPastEvents(prev => [...prev, events]);
    setEvents(next);
  };

  const saveEventsWithHistory = (newEventsUpdater: React.SetStateAction<EventRow[]>) => {
    setEvents(prev => {
      const next = typeof newEventsUpdater === 'function' ? (newEventsUpdater as any)(prev) : newEventsUpdater;
      const renumbered = next.map((e: EventRow, index: number) => ({ ...e, no: index + 1 }));
      setPastEvents(p => [...p, prev].slice(-20));
      setFutureEvents([]);
      return renumbered;
    });
  };`);

// 3. Update changeSportType
code = code.replace(
`  const changeSportType = (newSport: SportType, force: boolean = false) => {
    const hasPending = currentActions.length > 0 || Object.keys(currentAction).some(k => k !== 'videoTime' && k !== 'teamCode');
    const isThai = settings.uiLanguage === 'th';
    if (hasPending && !force) {
      const confirmChange = window.confirm(
        isThai 
          ? 'การเปลี่ยนกีฬาอาจล้าง action ที่กำลังเลือก ต้องการเปลี่ยนหรือไม่' 
          : 'Changing the sport may clear your current action. Do you want to proceed?'
      );
      if (!confirmChange) return;
    }`,
`  const changeSportType = (newSport: SportType, force: boolean = false) => {
    const isThai = settings.uiLanguage === 'th';
    if (events.length > 0 && !force) {
      showToast(
        isThai
          ? 'ไม่สามารถเปลี่ยนชนิดกีฬาได้ เพราะมีข้อมูลที่บันทึกไว้แล้ว หากต้องการเปลี่ยนกีฬา กรุณาสร้างโปรเจคใหม่'
          : 'Sport type is locked because events have already been recorded. Create a new project to change sport.'
      );
      return;
    }
    const hasPending = currentActions.length > 0 || Object.keys(currentAction).some(k => k !== 'videoTime' && k !== 'teamCode');
    if (hasPending && !force) {
      const confirmChange = window.confirm(
        isThai 
          ? 'การเปลี่ยนกีฬาอาจล้าง action ที่กำลังเลือก ต้องการเปลี่ยนหรือไม่' 
          : 'Changing the sport may clear your current action. Do you want to proceed?'
      );
      if (!confirmChange) return;
    }`);

// 4. Update getMissingActionMessage logic
code = code.replace(
`  const getMissingActionMessage = (action: Action): string | null => {
    const normalized = normalizeActionBeforeCommit(action);
    const isThai = settings.uiLanguage === 'th';

    if (sportTemplate.teamsEnabled && !normalized.teamCode) return isThai ? 'กรุณาเลือกทีมก่อน' : 'Please select a team first';
    if (!normalized.skillCode) return isThai ? 'กรุณาเลือกทักษะก่อน' : 'Please select a skill first';
    if (!normalized.resultCode) return isThai ? 'กรุณาเลือกผลลัพธ์ก่อน' : 'Please select a result first';

    const skill = getSkillByCode(normalized.skillCode);
    const req = skill?.areaRequirement || 'optionalWhenOut';

    const descGroup = sportTemplate.descriptors?.[normalized.skillCode];
    if (descGroup) {
      for (const group of descGroup) {
        if (group.required && (!normalized.descriptors || !normalized.descriptors[group.id])) {
          return isThai ? \`กรุณาเลือก \${group.thaiLabel}\` : \`Please select \${group.label}\`;
        }
      }
    }

    if (req === 'never' || req === 'optional') return null;

    if (normalized.resultCode !== 'Out') {
      const hasArea = normalized.areaCode || normalized.areaLabel || (normalized.gridX !== undefined && normalized.gridY !== undefined) || (normalized.pointX !== undefined && normalized.pointY !== undefined) || normalized.outZone;
      if (!hasArea) {
        return isThai ? 'กรุณาเลือกพื้นที่ในสนามก่อน' : 'Please select a court area first';
      }
    }

    return null;
  };`,
`  const getMissingActionMessage = (action: Action): string | null => {
    const normalized = normalizeActionBeforeCommit(action);
    const isThai = settings.uiLanguage === 'th';

    if (sportTemplate.teamsEnabled && !normalized.teamCode) return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';
    if (!normalized.skillCode) return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';
    if (!normalized.resultCode) return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกทีม ทักษะ พื้นที่ และผลลัพธ์ให้ครบ' : 'Cannot save yet. Please select team, skill, area, and result.';

    const skill = getSkillByCode(normalized.skillCode);
    const req = skill?.areaRequirement || 'optionalWhenOut';

    const descGroup = sportTemplate.descriptors?.[normalized.skillCode];
    if (descGroup) {
      for (const group of descGroup) {
        if (group.required && (!normalized.descriptors || !normalized.descriptors[group.id])) {
          return isThai ? \`ยังบันทึกไม่ได้ กรุณาเลือก \${group.thaiLabel}\` : \`Cannot save yet. Please select \${group.label}\`;
        }
      }
    }

    if (req === 'never' || req === 'optional') return null;

    const hasArea = normalized.areaCode || normalized.areaLabel || (normalized.gridX !== undefined && normalized.gridY !== undefined) || (normalized.pointX !== undefined && normalized.pointY !== undefined) || normalized.outZone;
    if (!hasArea && (req === 'always' || (req === 'optionalWhenOut' && normalized.resultCode !== 'Out'))) {
      return isThai ? 'ยังบันทึกไม่ได้ กรุณาเลือกพื้นที่ในสนาม' : 'Cannot save yet. Please select a court area.';
    }

    return null;
  };`);

// 5. Update deleteEventRow and updateEventRow
code = code.replace(
`  const deleteEventRow = (id: string) => {
    setEvents(prev => 
      prev
        .filter(e => e.id !== id)
        .map((e, index) => ({ ...e, no: index + 1 }))
    );
  };

  const updateEventRow = (id: string, updatedRow: EventRow) => {
    setEvents(prev => prev.map(e => (e.id === id ? updatedRow : e)));
  };`,
`  const deleteEventRow = (id: string) => {
    saveEventsWithHistory(prev => prev.filter(e => e.id !== id));
  };

  const updateEventRow = (id: string, updatedRow: EventRow) => {
    saveEventsWithHistory(prev => prev.map(e => (e.id === id ? updatedRow : e)));
  };`);

// 6. Fix setEvents in clearCurrentEvent? No, clearCurrentEvent doesn't call setEvents.
// Fix saveEvent pushing to events
code = code.replace(
`      if (finalActions.length > 1) {
        finalEventText = finalActions.map(a => getActionText(a)).join(' / ');
        finalExtendedText = finalActions.map(a => getExtendedActionText(a)).join(' / ');
        finalThaiMeaning = finalActions.map(a => getThaiMeaning(a)).join(' / ');
      }
      
      const newRow: EventRow = {
        id: \`\${Date.now()}-\${Math.random().toString(36).slice(2, 11)}\`,
        no: events.length + 1,
        sportType: matchInfo.sportType,
        point: matchInfo.currentPoint,
        eventText: finalEventText,
        extendedEventText: finalExtendedText,
        thaiMeaningText: finalThaiMeaning,
        resultText: actionToSave.resultCode === 'Yes' ? '+1' : actionToSave.resultCode === 'Out' ? '-1' : actionToSave.resultCode === 'Pass' ? '0' : '0',
        videoSourceType: videoSourceType,
        youtubeVideoId: videoSourceType === 'youtube' ? youtubeVideoId : undefined,
        videoTime: finalVideoTime,
        actions: finalActions,
        note: '',
        createdAt: new Date().toISOString(),
        sequenceStartTime,
        sequenceEndTime,
        duration,
      };

      setEvents(prev => [...prev, newRow]);`,
`      if (finalActions.length > 1) {
        finalEventText = finalActions.map(a => getActionText(a)).join(' / ');
        finalExtendedText = finalActions.map(a => getExtendedActionText(a)).join(' / ');
        finalThaiMeaning = finalActions.map(a => getThaiMeaning(a)).join(' / ');
      }
      
      const newRow: EventRow = {
        id: \`\${Date.now()}-\${Math.random().toString(36).slice(2, 11)}\`,
        no: events.length + 1,
        sportType: matchInfo.sportType,
        point: matchInfo.currentPoint,
        eventText: finalEventText,
        extendedEventText: finalExtendedText,
        thaiMeaningText: finalThaiMeaning,
        resultText: actionToSave.resultCode === 'Yes' ? '+1' : actionToSave.resultCode === 'Out' ? '-1' : actionToSave.resultCode === 'Pass' ? '0' : '0',
        videoSourceType: videoSourceType,
        youtubeVideoId: videoSourceType === 'youtube' ? youtubeVideoId : undefined,
        videoTime: finalVideoTime,
        actions: finalActions,
        note: '',
        createdAt: new Date().toISOString(),
        sequenceStartTime,
        sequenceEndTime,
        duration,
      };

      saveEventsWithHistory(prev => [...prev, newRow]);`);

// 7. Add export context variables
code = code.replace(
`      hudLastSavedText, hudLastSavedAt, updateActionField, selectArea, commitResult
    }}>`,
`      hudLastSavedText, hudLastSavedAt, updateActionField, selectArea, commitResult,
      canUndoEventAction, canRedoEventAction, undoEventAction, redoEventAction
    }}>`);

// 8. Add quota listener in useEffect
code = code.replace(
`  useEffect(() => {
    // Migration from old darkMode`,
`  useEffect(() => {
    const handleQuotaExceeded = (e: any) => {
      console.error('LocalStorage quota exceeded for key:', e.detail?.key);
      showToast(
        settings.uiLanguage === 'th' 
          ? 'พื้นที่จัดเก็บในเบราว์เซอร์ใกล้เต็ม กรุณา Export ข้อมูลและลบโปรเจคที่ไม่ใช้' 
          : 'Browser storage is almost full. Please export your data and remove unused projects.'
      );
    };
    window.addEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
    return () => window.removeEventListener('localStorageQuotaExceeded', handleQuotaExceeded);
  }, [settings.uiLanguage, showToast]);

  useEffect(() => {
    // Migration from old darkMode`);

fs.writeFileSync('src/context/ScoutContext.tsx', code);
