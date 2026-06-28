import React, { useState, useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useScoutContext } from '../context/ScoutContext';
import { Folder, Plus, Save, ChevronDown, Trash2, Copy, Edit2, Download, Upload } from 'lucide-react';
import { classNames } from '../utils';
import { ScoutProject, SportType } from '../types';

export default function WorkspaceMenu() {
  const { projects, activeProjectId, createNewProject, openProject, saveCurrentProject, deleteProject, duplicateProject, renameProject, importProject } = useWorkspace();
  const { matchInfo, showToast } = useScoutContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isRenamingId, setIsRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const { settings } = useScoutContext();

  const handleCreate = () => {
    const title = `New Match ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    createNewProject(title, matchInfo.sportType);
    setIsOpen(false);
  };

  const handleRenameSubmit = (id: string) => {
    if (renameText.trim()) {
      renameProject(id, renameText.trim());
    }
    setIsRenamingId(null);
  };

  const handleExport = (proj: ScoutProject) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(proj, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${proj.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_scout.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    document.body.removeChild(dlAnchorElem);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content) as Partial<ScoutProject>;
        
        // Validation
        if (!imported.id || !imported.title || !Array.isArray(imported.events) || !imported.sportType) {
          showToast('Invalid Project JSON format');
          return;
        }

        const newId = Date.now().toString();
        const newProj: ScoutProject = {
          ...(imported as ScoutProject),
          id: newId,
          title: `${imported.title} (Imported)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        importProject(newProj);
        showToast(`Imported: ${newProj.title}`);
      } catch (err) {
        showToast('Failed to parse JSON');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="relative z-50">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors shadow-sm"
        >
          <Folder size={16} className="text-sky-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate max-w-[120px] sm:max-w-[200px]">
            {activeProject ? activeProject.title : (settings.uiLanguage === 'th' ? 'ไม่มีโครงการ' : 'No Project')}
          </span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>
        
        <button
          onClick={handleCreate}
          className="p-1.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-800/50 transition-colors"
          title="New Scout Project"
        >
          <Plus size={18} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[70vh]">
          <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {settings.uiLanguage === 'th' ? 'คลังโครงการ (Workspace Library)' : 'Workspace Library'}
            </h3>
            <label className="cursor-pointer p-1 text-gray-500 hover:text-sky-600 transition-colors" title="Import Project JSON">
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
              projects.map(proj => (
                <div 
                  key={proj.id} 
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
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => {
                        setIsRenamingId(proj.id);
                        setRenameText(proj.title);
                      }} className="p-1 text-gray-400 hover:text-sky-600 rounded">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => duplicateProject(proj.id)} className="p-1 text-gray-400 hover:text-blue-600 rounded">
                        <Copy size={12} />
                      </button>
                      <button onClick={() => handleExport(proj)} className="p-1 text-gray-400 hover:text-green-600 rounded">
                        <Download size={12} />
                      </button>
                      <button onClick={() => {
                        deleteProject(proj.id);
                      }} className="p-1 text-gray-400 hover:text-red-600 rounded">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  
                  {!isRenamingId && (
                    <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                      <span>{proj.events.length} {settings.uiLanguage === 'th' ? 'เหตุการณ์ (actions)' : 'actions'}</span>
                      <span>{new Date(proj.updatedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
