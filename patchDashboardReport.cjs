const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/Dashboard.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update DashboardProps
content = content.replace(
  "variant?: 'classic' | 'workstation';",
  "variant?: 'classic' | 'workstation' | 'report';"
);

// Update variant rendering logic in Dashboard.tsx
// It currently has `{variant === 'workstation' ? (`
// We can wrap the whole body in a check for variant === 'report'
const bodyStart = content.indexOf('{variant === \'workstation\' ? (');
const bodyEnd = content.indexOf('</div>\\n  );\\n}\\n\\nfunction DataQualityCard');

if (bodyStart !== -1 && bodyEnd !== -1) {
  const originalBody = content.substring(bodyStart, bodyEnd);
  const newBody = `
      {variant === 'report' ? (
        <div className="w-full h-full flex flex-col">
          <CoachPrintSummary
            language={settings.uiLanguage}
            sportLabel={filterSport === 'ALL' ? 'ALL' : SPORT_TEMPLATES[filterSport].name}
            teams={teams}
            analytics={analyticsSummary}
            dataQuality={dataQuality}
            isStandalone={true}
          />
        </div>
      ) : (
        <>
          ${originalBody}
        </>
      )}
  `;
  content = content.substring(0, bodyStart) + newBody + content.substring(bodyEnd);
} else {
  console.log("Could not find body to replace.");
}

// Export CoachPrintSummary and add isStandalone
content = content.replace(
  'function CoachPrintSummary({',
  'export function CoachPrintSummary({'
);

content = content.replace(
  '  dataQuality,\n}: {\n',
  '  dataQuality,\n  isStandalone,\n}: {\n'
);

content = content.replace(
  '  dataQuality: DataQualityReport;\n}) {',
  '  dataQuality: DataQualityReport;\n  isStandalone?: boolean;\n}) {'
);

content = content.replace(
  '<section className="coach-print-summary hidden" aria-hidden="true">',
  '<section className={`coach-print-summary ${isStandalone ? \'standalone-report p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-full max-w-4xl mx-auto block\' : \'hidden\'}`} aria-hidden={!isStandalone}>'
);

fs.writeFileSync(file, content);
console.log("Dashboard updated with report variant.");
