import React, { useEffect } from 'react';
import { APP_NAME, APP_VERSION, SCOUT_EXPORT_SCHEMA_VERSION } from '../appMetadata';

export default function DiagnosticLogs() {
  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    console.log(
      `%c[${APP_NAME} Diagnostics] Starting localStorage scan (${APP_NAME} ${APP_VERSION}, export schema ${SCOUT_EXPORT_SCHEMA_VERSION})...`,
      'color: #0284c7; font-weight: bold; font-size: 14px;',
    );

    const expectedKeys = [
      'scout_settings',
      'scout_match_info',
      'scout_teams',
      'scout_events',
      'scout_projects',
      'active_scout_project_id'
    ];

    let overallHealthy = true;

    expectedKeys.forEach(key => {
      const item = localStorage.getItem(key);
      if (item === null) {
        console.log(`%cℹ️ Key [${key}] is currently not set (empty/cleared).`, 'color: #64748b;');
        return;
      }

      console.log(`%c📦 Key [${key}] found. Raw size: ${item.length} characters.`, 'color: #475569;');

      // 1. JSON parsing check
      let parsed: any;
      try {
        parsed = JSON.parse(item);
      } catch (err: any) {
        overallHealthy = false;
        console.error(
          `%c🚨 CRITICAL INVALID JSON: Key [${key}] failed to parse!\n` +
          `Error: ${err.message}\n` +
          `Raw Value: "${item}"`,
          'background: #fee2e2; color: #991b1b; padding: 4px; border-radius: 4px; font-weight: bold;'
        );
        return;
      }

      // 2. Structural validation check
      let keyHealthy = true;
      let issues: string[] = [];

      switch (key) {
        case 'scout_settings':
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            keyHealthy = false;
            issues.push(`Expected non-null object, got: ${typeof parsed}`);
          }
          break;

        case 'scout_match_info':
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            keyHealthy = false;
            issues.push(`Expected non-null object, got: ${typeof parsed}`);
          }
          break;

        case 'scout_teams':
          if (!Array.isArray(parsed)) {
            keyHealthy = false;
            issues.push(`Expected array, got: ${typeof parsed}`);
          } else {
            parsed.forEach((team, idx) => {
              if (typeof team !== 'object' || team === null) {
                keyHealthy = false;
                issues.push(`Item at index ${idx} is null or not an object`);
              } else if (!team.id || !team.code) {
                keyHealthy = false;
                issues.push(`Item at index ${idx} is missing required team properties (id or code)`);
              }
            });
          }
          break;

        case 'scout_events':
          if (!Array.isArray(parsed)) {
            keyHealthy = false;
            issues.push(`Expected array, got: ${typeof parsed}`);
          } else {
            parsed.forEach((evt, idx) => {
              if (typeof evt !== 'object' || evt === null) {
                keyHealthy = false;
                issues.push(`Item at index ${idx} is null or not an object`);
              }
            });
          }
          break;

        case 'scout_projects':
          if (!Array.isArray(parsed)) {
            keyHealthy = false;
            issues.push(`Expected array, got: ${typeof parsed}`);
          } else {
            parsed.forEach((proj, idx) => {
              if (typeof proj !== 'object' || proj === null) {
                keyHealthy = false;
                issues.push(`Item at index ${idx} is null or not an object`);
              } else if (!proj.id || !proj.title) {
                keyHealthy = false;
                issues.push(`Item at index ${idx} is missing required project properties (id or title)`);
              }
            });
          }
          break;

        case 'active_scout_project_id':
          if (parsed !== null && typeof parsed !== 'string') {
            keyHealthy = false;
            issues.push(`Expected string or null, got: ${typeof parsed}`);
          }
          break;
      }

      if (keyHealthy) {
        console.log(`%c✅ Key [${key}] schema is valid.`, 'color: #16a34a;');
      } else {
        overallHealthy = false;
        console.error(
          `%c🚨 SCHEMA MISMATCH: Key [${key}] contains invalid or corrupted structure!\n` +
          `Issues:\n${issues.map(iss => `  - ${iss}`).join('\n')}\n` +
          `Parsed Value:`, parsed,
          'background: #fef3c7; color: #92400e; padding: 4px; border-radius: 4px; font-weight: bold;'
        );
      }
    });

    if (overallHealthy) {
      console.log('%c✨ [Sports Scout Diagnostics] Scan complete. All local structures are structurally sound!', 'color: #16a34a; font-weight: bold; font-size: 13px;');
    } else {
      console.warn('%c⚠️ [Sports Scout Diagnostics] Scan complete with structural warnings or parse errors. Check the logs above for detailed culprits.', 'color: #ea580c; font-weight: bold; font-size: 13px;');
    }
  }, []);

  return null;
}
