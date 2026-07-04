const fs = require('fs');
let code = fs.readFileSync('src/components/WorkspaceMenu.tsx', 'utf-8');

// Add import
if (!code.includes('CreateProjectWizard')) {
  code = code.replace(
    `import { motion, AnimatePresence } from 'motion/react';`,
    `import { motion, AnimatePresence } from 'motion/react';\nimport CreateProjectWizard from './CreateProjectWizard';`
  );
}

// Remove handleCreateConfirm entirely since it's going to the wizard
code = code.replace(
  `  const handleCreateConfirm = () => {
    const title = \`New Match \${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\`;
    createNewProject(title, selectedSport);
    setIsCreateModalOpen(false);
  };`,
  `  const handleWizardCreate = (title: string, sportType: any, matchInfo: any, teams: any) => {
    createNewProject(title, sportType, matchInfo, teams);
    setIsCreateModalOpen(false);
  };`
);

// Replace the AnimatePresence block for isCreateModalOpen
code = code.replace(
  /<AnimatePresence>([\s\S]*?){isCreateModalOpen && \([\s\S]*?<\/motion\.div>\s*<\/div>\s*\)}\s*<\/AnimatePresence>/m,
  `<CreateProjectWizard 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onCreate={handleWizardCreate} 
      />`
);

fs.writeFileSync('src/components/WorkspaceMenu.tsx', code);
