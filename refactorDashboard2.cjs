const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/Dashboard.tsx');
let content = fs.readFileSync(file, 'utf8');

// Update DashboardProps
content = content.replace(
  "variant?: 'classic' | 'workstation';",
  "variant?: 'classic' | 'workstation' | 'report';"
);

// The marker strings to split on
const s1 = '<div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">';
const s2 = '<div className="flex gap-4 overflow-x-auto pb-2 mb-6 hide-scrollbar">';
const s3 = '{stats.total > 0 ? (';
const s4 = '<Suspense fallback={<div className="p-8 text-center text-gray-500">Loading charts...</div>}>';
const s5 = '<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">';
const s6 = '{/* Detailed Points won/lost breakdown */}';
const s7 = '<div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl lg:col-span-3 flex flex-col gap-4">'; // team comparison
const s8 = '{/* Fouls & Violations Section */}';
const s9 = '<div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl lg:col-span-3 flex flex-col items-center">'; // field map
const s10 = '</Suspense>';
const s11 = ') : (';

// Extract the blocks
const headToDataQuality = content.substring(0, content.indexOf(s1));
const dataQuality = content.substring(content.indexOf(s1), content.indexOf(s2));
const atAGlance = content.substring(content.indexOf(s2), content.indexOf(s3));

const suspToGrid = content.substring(content.indexOf(s4) + s4.length, content.indexOf(s5)); // SportSpecificKPIs
const gridToPoints = content.substring(content.indexOf(s5) + s5.length, content.indexOf(s6)); // SkillFreq, ResultDist, Radar
const pointsBreakdown = content.substring(content.indexOf(s6), content.indexOf(s7));
const teamComp = content.substring(content.indexOf(s7), content.indexOf(s8));
const fouls = content.substring(content.indexOf(s8), content.indexOf(s9));
const fieldMap = content.substring(content.indexOf(s9), content.indexOf(s10));

const emptyStateStart = content.indexOf(s11);

const charts = gridToPoints; // The 3 charts before points breakdown

const renderFunctions = `
  const renderDataQuality = () => (
    <>
      ` + dataQuality + `
    </>
  );

  const renderAtAGlance = () => (
    <>
      ` + atAGlance + `
    </>
  );

  const renderPointsBreakdown = () => (
    <>
      ` + pointsBreakdown + `
    </>
  );

  const renderTeamComparison = () => (
    <>
      ` + teamComp + `
    </>
  );

  const renderFouls = () => (
    <>
      ` + fouls + `
    </>
  );

  const renderFieldMap = () => (
    <>
      ` + fieldMap + `
    </>
  );

  const renderCharts = () => (
    <>
      ` + suspToGrid + `
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        ` + charts + `
      </div>
    </>
  );
`;

const renderFuncInjectionPoint = headToDataQuality.indexOf('return (');
let newContent = headToDataQuality.slice(0, renderFuncInjectionPoint) + renderFunctions + '\\n  ' + headToDataQuality.slice(renderFuncInjectionPoint);

const finalLayout = `
      {variant === 'report' ? (
        <div className="w-full h-full flex flex-col bg-gray-50/50 dark:bg-gray-900/50 p-2 sm:p-4 md:p-6 lg:p-8">
          <CoachPrintSummary
            language={settings.uiLanguage}
            sportLabel={filterSport === 'ALL' ? 'ALL' : SPORT_TEMPLATES[filterSport].name}
            teams={teams}
            analytics={analyticsSummary}
            dataQuality={dataQuality}
            isStandalone={true}
          />
        </div>
      ) : variant === 'workstation' ? (
        <>
          {renderAtAGlance()}
          {stats.total > 0 && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {renderPointsBreakdown()}
             </div>
          )}
          {renderDataQuality()}
          {stats.total > 0 ? (
            <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading charts...</div>}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {renderFieldMap()}
              </div>
              {renderCharts()}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                {renderTeamComparison()}
                {renderFouls()}
              </div>
            </Suspense>
          ) : (
            <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl mb-8 mt-4">
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {t('dashboard.noEvents', settings.uiLanguage)}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {renderDataQuality()}
          {renderAtAGlance()}
          {stats.total > 0 ? (
            <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading charts...</div>}>
              {renderCharts()}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                {renderPointsBreakdown()}
                {renderTeamComparison()}
                {renderFouls()}
                {renderFieldMap()}
              </div>
            </Suspense>
          ) : (
            <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl mb-8 mt-4">
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {t('dashboard.noEvents', settings.uiLanguage)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DataQualityCard({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'amber' | 'gray' | 'sky' }) {
  const tones = {
    green: 'bg-green-50/50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200/50 dark:border-green-800',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    gray: 'bg-gray-50 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400 border-sky-200 dark:border-sky-800'
  };
  return (
    <div className={\`flex flex-col items-center justify-center p-3 rounded-lg border \${tones[tone]}\`}>
      <span className="text-[10px] font-bold uppercase text-gray-500 text-center leading-tight mb-1">{label}</span>
      <span className="text-2xl font-black">{value}</span>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  return (
    <div className={\`\${color} p-4 rounded-xl min-w-[140px] flex-1 flex flex-col justify-between\`}>
      <h3 className="text-xs font-bold uppercase opacity-80 mb-2">{title}</h3>
      <span className="text-2xl font-black">{value}</span>
    </div>
  );
}

export function CoachPrintSummary({
  language,
  sportLabel,
  teams,
  analytics,
  dataQuality,
  isStandalone,
}: {
  language: 'th' | 'en';
  sportLabel: string;
  teams: Team[];
  analytics: AnalyticsSummary;
  dataQuality: DataQualityReport;
  isStandalone?: boolean;
}) {
  const topSkills = Object.entries(analytics.skillCounts).sort((left, right) => right[1] - left[1]).slice(0, 5);
  const topAreas = Object.entries(analytics.areaCounts).sort((left, right) => right[1] - left[1]).slice(0, 5);

  return (
    <section className={\`coach-print-summary \${isStandalone ? 'standalone-report p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 w-full max-w-4xl mx-auto block' : 'hidden'}\`} aria-hidden={!isStandalone}>
      <header>
        <h1>SPORTSCOUT · {t('dashboard.coachSummary', language)}</h1>
        <p>{sportLabel} · {teams.map(team => team.code).join(' vs ') || '-'}</p>
      </header>
      <div className="coach-print-metrics">
        <div><strong>{analytics.totalEvents}</strong><span>{t('dashboard.totalEvents', language)}</span></div>
        <div><strong>{analytics.totalActions}</strong><span>{t('dashboard.totalActions', language)}</span></div>
        <div><strong>{analytics.derivedOutcomePoints.total}</strong><span>{t('dashboard.derivedPoints', language)}</span></div>
        <div><strong>{dataQuality.incompleteEvents}</strong><span>{t('dashboard.incomplete', language)}</span></div>
      </div>
      <p className="coach-print-note">{t('dashboard.derivedPointsHelp', language)}</p>
      <div className="coach-print-columns">
        <div><h2>{language === 'th' ? 'ทักษะที่พบบ่อย' : 'Top Skills'}</h2>{topSkills.map(([key, value]) => <p key={key}>{key}<strong>{value}</strong></p>)}</div>
        <div><h2>{language === 'th' ? 'พื้นที่ที่พบบ่อย' : 'Top Areas'}</h2>{topAreas.map(([key, value]) => <p key={key}>{key}<strong>{value}</strong></p>)}</div>
        <div><h2>{t('dashboard.dataQuality', language)}</h2><p>{t('dashboard.valid', language)}<strong>{dataQuality.validEvents}</strong></p><p>{t('dashboard.warnings', language)}<strong>{dataQuality.warnings}</strong></p><p>{t('dashboard.legacy', language)}<strong>{dataQuality.legacyEvents}</strong></p></div>
      </div>
    </section>
  );
}
`;

newContent += finalLayout;

fs.writeFileSync(file, newContent);
console.log("Refactoring and report variant applied.");
