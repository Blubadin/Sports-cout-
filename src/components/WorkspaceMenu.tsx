import React, { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useScoutContext } from '../context/ScoutContext';
import { Folder, Plus, Save, ChevronDown, Trash2, Copy, Edit2, Download, Upload, X } from 'lucide-react';
import { classNames } from '../utils';
import { ScoutProject, SportType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import CreateProjectWizard from './CreateProjectWizard';
import CustomSelect from './ui/CustomSelect';
import { SPORT_TEMPLATES } from '../sports';
import { createProjectsExport } from '../utils/scoutData';
import { MAX_IMPORT_FILE_BYTES, validateImportFileSize } from '../utils/importSafety';

export default function WorkspaceMenu() {
  const {
    projects,
    activeProjectId,
    saveStatus,
    lastSavedAt,
    repositoryReady,
    createNewProject,
    openProject,
    saveCurrentProject,
    deleteProject,
    duplicateProject,
    renameProject,
    importProject,
  } = useWorkspace();
  const { matchInfo, showToast, settings } = useScoutContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedSport, setSelectedSport] = useState<SportType>(matchInfo.sportType || 'volleyball');
  const [isRenamingId, setIsRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const saveLabel = settings.uiLanguage === 'th'
    ? saveStatus === 'saving' ? 'กำลังบันทึก' : saveStatus === 'pending' ? 'รอบันทึก' : saveStatus === 'failed' ? 'บันทึกไม่สำเร็จ' : 'บันทึกแล้ว'
    : saveStatus === 'saving' ? 'Saving' : saveStatus === 'pending' ? 'Changes pending' : saveStatus === 'failed' ? 'Save failed' : 'Saved';
  const saveTitle = lastSavedAt && saveStatus === 'saved'
    ? `${saveLabel} ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : saveLabel;

  const sportOptions = Object.values(SPORT_TEMPLATES).map(t => ({
    value: t.id,
    label: t.name,
    subLabel: t.thaiName
  }));

  const openCreateModal = () => {
    setSelectedSport(matchInfo.sportType || 'volleyball');
    setIsCreateModalOpen(true);
    setIsOpen(false);
  };

  const handleWizardCreate = (
    title: string, 
    sportType: any, 
    matchInfo: any, 
    teams: any,
    settingsSnapshot?: any,
    videoMeta?: any
  ) => {
    createNewProject(title, sportType, matchInfo, teams, settingsSnapshot, videoMeta);
    setIsCreateModalOpen(false);
  };

  const handleRenameSubmit = (id: string) => {
    if (renameText.trim()) {
      renameProject(id, renameText.trim());
    }
    setIsRenamingId(null);
  };

  const handleExport = (proj: ScoutProject) => {
    const exportData = createProjectsExport([proj]);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${proj.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_scout.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    document.body.removeChild(dlAnchorElem);
  };

  const handleExportAll = () => {
    const exportData = createProjectsExport(projects);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `sports_scout_projects_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    document.body.removeChild(dlAnchorElem);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!validateImportFileSize(file.size)) {
      showToast(settings.uiLanguage === 'th'
        ? `ไฟล์ใหญ่เกินไป ต้องไม่เกิน ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`
        : `Import file must be ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB or smaller`);
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        
        const originalTitle = imported.title || 'Imported Project';
        imported.title = `${originalTitle} (Imported)`;

        const success = importProject(imported);
        if (success) {
          showToast(`Imported: ${originalTitle}`);
        } else {
          showToast('Invalid Project JSON format or schema');
        }
      } catch (err) {
        showToast('Failed to parse JSON');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="relative z-50" ref={menuRef}>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={!repositoryReady}
          data-testid="workspace-menu-toggle"
          className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Folder size={18} className="text-sky-500 shrink-0" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate max-w-[130px] sm:max-w-[240px]">
            {activeProject ? activeProject.title : (settings.uiLanguage === 'th' ? 'ไม่มีโครงการ' : 'No Project')}
          </span>
          <ChevronDown size={16} className="text-gray-400 shrink-0 ml-1" />
          <span
            className={classNames(
              "h-2 w-2 shrink-0 rounded-full",
              saveStatus === 'failed' ? 'bg-red-500' : saveStatus === 'saving' || saveStatus === 'pending' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500',
            )}
            title={saveTitle}
          />
        </button>

        <button
          type="button"
          onClick={() => void saveCurrentProject()}
          disabled={!activeProjectId || !repositoryReady || saveStatus === 'saving'}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          title={settings.uiLanguage === 'th' ? `บันทึกตอนนี้ - ${saveTitle}` : `Save now - ${saveTitle}`}
          aria-label={settings.uiLanguage === 'th' ? 'บันทึกโปรเจกต์ตอนนี้' : 'Save project now'}
        >
          <Save size={17} />
        </button>
        
        <button
          onClick={openCreateModal}
          disabled={!repositoryReady}
          className="p-1.5 sm:p-2 bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-200 dark:hover:bg-sky-800/60 transition-colors shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          title="New Scout Project"
        >
          <Plus size={20} />
        </button>
      </div>

      <CreateProjectWizard 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onCreate={handleWizardCreate} 
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={classNames(
              "absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[70vh] origin-top-right",
              !isOpen && "pointer-events-none"
            )}
          >
            <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {settings.uiLanguage === 'th' ? 'คลังโครงการ (Workspace Library)' : 'Workspace Library'}
            </h3>
            <button
              type="button"
              onClick={handleExportAll}
              disabled={projects.length === 0}
              className="cursor-pointer p-1 text-gray-500 hover:text-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={settings.uiLanguage === 'th' ? 'สำรองทุกโครงการ (Export All Projects)' : 'Export All Projects'}
            >
              <Download size={14} />
            </button>
            <label className="cursor-pointer p-1 text-gray-500 hover:text-sky-600 transition-colors" title={settings.uiLanguage === 'th' ? 'นำเข้าโปรเจกต์ (Restore Project)' : 'Restore Project (Import JSON)'}>
              <Upload size={14} />
              <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
            </label>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 flex flex-col gap-1">
            {projects.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                {settings.uiLanguage === 'th' ? 'ไม่พบโครงการ' : 'No projects found.'}
              </div>
            ) : (
              projects.map((proj, idx) => (
                <div 
                  key={`${proj.id}-${idx}`} 
                  className={classNames(
                    "flex flex-col p-2 rounded-lg transition-colors group",
                    activeProjectId === proj.id 
                      ? "bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500" 
                      : "hover:bg-gray-50 dark:hover:bg-gray-750 border-l-4 border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    {isRenamingId === proj.id ? (
                      <input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onBlur={() => handleRenameSubmit(proj.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(proj.id)}
                        className="flex-1 bg-white dark:bg-gray-900 border border-sky-300 rounded px-2 py-1 text-sm text-gray-800 dark:text-gray-100"
                      />
                    ) : (
                      <button 
                        onClick={() => {
                          openProject(proj.id);
                          setIsOpen(false);
                        }}
                        className="flex-1 text-left truncate text-sm font-medium text-gray-800 dark:text-gray-200"
                      >
                        {proj.title}
                      </button>
                    )}
                    
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => {
                        setIsRenamingId(proj.id);
                        setRenameText(proj.title);
                      }} className="p-2 md:p-1 text-gray-400 hover:text-sky-600 rounded-lg bg-gray-100 md:bg-transparent">
                        <Edit2 size={14} className="md:w-3 md:h-3" />
                      </button>
                      <button onClick={() => duplicateProject(proj.id)} className="p-2 md:p-1 text-gray-400 hover:text-sky-600 rounded-lg bg-gray-100 md:bg-transparent">
                        <Copy size={14} className="md:w-3 md:h-3" />
                      </button>
                      <button onClick={() => handleExport(proj)} className="p-2 md:p-1 text-gray-400 hover:text-green-600 rounded-lg bg-gray-100 md:bg-transparent" title={settings.uiLanguage === 'th' ? 'สำรองข้อมูลโปรเจกต์ (Backup Project)' : 'Backup Project (Export JSON)'}>
                        <Download size={14} className="md:w-3 md:h-3" />
                      </button>
                      <button onClick={() => {
                        const confirmMsg = settings.uiLanguage === 'th' ? 'ต้องการลบโปรเจคนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้' : 'Delete this project? This action cannot be undone.';
                        if (window.confirm(confirmMsg)) {
                          deleteProject(proj.id);
                        }
                      }} className="p-2 md:p-1 text-gray-400 hover:text-red-600 rounded-lg bg-gray-100 md:bg-transparent">
                        <Trash2 size={14} className="md:w-3 md:h-3" />
                      </button>
                    </div>
                  </div>
                  
                  {!isRenamingId && (
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                      <span>{proj.events.length} {settings.uiLanguage === 'th' ? 'เหตุการณ์ (actions)' : 'actions'}</span>
                      <span>{new Date(proj.updatedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
