# Task 1 Review Package - Revision 2
## Commit
5413afe416313dd80aace019d36823e49fd9d69a
## Status
 M e2e/workstation.spec.ts
 M src/App.tsx
 M src/components/hud/ProAreaCommandPad.tsx
 M src/index.css
?? .superpowers/
?? e2e/hud-area.spec.ts
?? src/__tests__/utils/proAreaLayout.test.ts
?? src/components/workstation/WorkstationInspector.tsx
?? src/utils/proAreaLayout.ts
## Tracked Diff
diff --git a/e2e/workstation.spec.ts b/e2e/workstation.spec.ts
index 94def53..450b263 100644
--- a/e2e/workstation.spec.ts
+++ b/e2e/workstation.spec.ts
@@ -1,23 +1,113 @@
 import { expect, test } from '@playwright/test';
 
-test('enables the opt-in Workstation and switches functional presets', async ({ page }) => {
+async function enableWorkstation(page: import('@playwright/test').Page, language: 'th' | 'en' = 'th') {
   await page.goto('/');
-  await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).click();
-  await page.getByTestId('workspace-menu-toggle').click();
-  await page.getByRole('button', { name: 'SPORTSCOUT Pilot - Football', exact: true }).click();
-
+  if (await page.getByRole('navigation', { name: /Workstation modes/i }).count()) {
+    await page.getByRole('button', { name: /Settings|ตั้งค่า/i }).first().click();
+    await page.getByRole('button', { name: /Classic/i }).click();
+    await page.getByRole('button', { name: /ปิดการตั้งค่า|Close settings/i }).click();
+  }
+  const canLoadPilot = await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).count();
+  if (canLoadPilot) {
+    await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).click();
+    await page.getByTestId('workspace-menu-toggle').click();
+    await page.getByRole('button', { name: 'SPORTSCOUT Pilot - Football', exact: true }).click();
+  }
+  if (language === 'en') await page.getByTitle('Toggle Language').click();
   await page.getByTitle('Settings').click();
   await page.getByRole('button', { name: /Workstation Beta/i }).click();
   await page.getByRole('button', { name: /ปิดการตั้งค่า|Close settings/i }).click();
+}
+
+async function expectNoInspectorOverflow(
+  page: import('@playwright/test').Page,
+  inspector: import('@playwright/test').Locator,
+) {
+  await expect.poll(() => inspector.evaluate(
+    element => element.scrollWidth <= element.clientWidth + 1,
+  )).toBe(true);
+  await expect.poll(() => page.evaluate(
+    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
+  )).toBe(true);
+}
+
+test('enables the opt-in Workstation and switches functional presets', async ({ page }) => {
+  await enableWorkstation(page);
 
   await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toBeVisible();
+  await expect(page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i })).toBeVisible();
+  await expect(page.getByText(/Waiting for input|รอเลือกข้อมูล/i)).toBeVisible();
   await page.getByRole('button', { name: /Review|ทบทวน/i }).first().click();
   await expect(page.getByRole('tab', { name: /ตารางเหตุการณ์|Events Table/i })).toHaveAttribute('aria-selected', 'true');
   await expect(page.getByText(/Workstation Beta/i).first()).toBeVisible();
 });
 
+test('shows the Inspector empty, incomplete, and valid states in both languages', async ({ page }) => {
+  await page.setViewportSize({ width: 1366, height: 768 });
+  await enableWorkstation(page);
+
+  const inspector = page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i });
+  await expect(inspector).toHaveAttribute('data-inspector-state', 'empty');
+  await expect(inspector).toContainText(/Waiting for input|รอเลือกข้อมูล/i);
+
+  await page.locator('[data-scout-group="team"]').first().click();
+  const thaiPlayerNumber = '99-หมายเลขผู้เล่นยาวมากเพื่อทดสอบพื้นที่แคบ';
+  const thaiPlayerName = 'ชื่อผู้เล่นภาษาไทยที่ยาวมากสำหรับการทดสอบ Inspector โดยไม่ให้เอกสารล้นแนวนอน';
+  await page.getByPlaceholder(/e\.g\. 7/i).fill(thaiPlayerNumber);
+  await page.getByPlaceholder(/ชื่อผู้เล่น|Player Name/i).fill(thaiPlayerName);
+  await expect(inspector).toHaveAttribute('data-inspector-state', 'incomplete');
+
+  await page.locator('[data-scout-group="skill"]').first().click();
+  await page.locator('[data-scout-group="result"]').first().click();
+  await page.locator('[data-scout-group="area"]').first().click();
+  await expect(inspector).toHaveAttribute('data-inspector-state', 'valid');
+  await expect(inspector).toContainText(thaiPlayerName);
+  await expectNoInspectorOverflow(page, inspector);
+  await expect(inspector).toContainText(/Ready to save this event|ข้อมูลพร้อมบันทึกเหตุการณ์/i);
+
+  await enableWorkstation(page, 'en');
+  const englishInspector = page.getByRole('complementary', { name: 'Inspector' });
+  await expect(englishInspector).toHaveAttribute('data-inspector-state', 'empty');
+  await expect(englishInspector).toContainText('Waiting for input');
+
+  const englishPlayerNumber = '101-LONG-PLAYER-NUMBER-FOR-NARROW-INSPECTOR';
+  const englishPlayerName = 'Extremely Long English Player Name Used To Verify Inspector And Document Horizontal Overflow';
+  await page.locator('[data-scout-group="team"]').first().click();
+  await page.getByPlaceholder(/e\.g\. 7/i).fill(englishPlayerNumber);
+  await page.getByPlaceholder(/Player Name/i).fill(englishPlayerName);
+  await page.locator('[data-scout-group="skill"]').first().click();
+  await page.locator('[data-scout-group="result"]').first().click();
+  await page.locator('[data-scout-group="area"]').first().click();
+  await expect(englishInspector).toHaveAttribute('data-inspector-state', 'valid');
+  await expect(englishInspector).toContainText(englishPlayerName);
+  await expectNoInspectorOverflow(page, englishInspector);
+});
+
+test('keeps the Inspector desktop-only without changing the 7/5 Workstation layout', async ({ page }) => {
+  await page.setViewportSize({ width: 1279, height: 768 });
+  await enableWorkstation(page);
+
+  await expect(page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i })).toHaveCount(0);
+  await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toBeVisible();
+});
+
+for (const viewport of [
+  { width: 1366, height: 768 },
+  { width: 1920, height: 1080 },
+]) {
+  test(`keeps the Inspector Workstation free of horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
+    await page.setViewportSize(viewport);
+    await enableWorkstation(page);
+
+    await expect(page.getByRole('complementary', { name: /Inspector|ตัวตรวจสอบ/i })).toBeVisible();
+    await expect.poll(() => page.evaluate(
+      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
+    )).toBe(true);
+  });
+}
+
 test('keeps the Classic interface on phone landscape', async ({ page }) => {
   await page.setViewportSize({ width: 844, height: 390 });
   await page.goto('/');
   await expect(page.getByRole('navigation', { name: /Workstation modes/i })).toHaveCount(0);
 });
diff --git a/src/App.tsx b/src/App.tsx
index ff4c444..fafedfe 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -16,20 +16,21 @@ import {
   getPresetForAnalysisTab,
   resolveWorkspaceExperience,
   type WorkbenchPresetId,
 } from './workstation/workstationModel';
 import {
   WorkstationCommandBar,
   WorkstationStatusBar,
   WorkstationToolRail,
   WorkstationTopBar,
 } from './components/workstation/WorkstationChrome';
+import WorkstationInspector from './components/workstation/WorkstationInspector';
 
 const Dashboard = React.lazy(() => import('./components/Dashboard'));
 const BookmarksPanel = React.lazy(() => import('./components/BookmarksPanel'));
 const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
 const VideoPlayer = React.lazy(() => import('./components/VideoPlayer'));
 const InputPanel = React.lazy(() => import('./components/InputPanel'));
 const ScoutingTable = React.lazy(() => import('./components/ScoutingTable'));
 const KeyboardShortcutsModal = React.lazy(() => import('./components/KeyboardShortcutsModal'));
 const MatchInfoModal = React.lazy(() => import('./components/MatchInfoModal'));
 
@@ -434,28 +435,28 @@ function AppContent() {
             <WorkstationToolRail
               language={settings.uiLanguage}
               activePreset={activePreset}
               onPresetChange={handleWorkstationPreset}
             />
           )}
           {/* Main scouting workspace */}
           <div className={`flex-1 grid grid-cols-1 lg:grid-cols-12 lg:h-full lg:overflow-hidden ${isWorkstation ? 'gap-px bg-[#263642] p-px' : 'gap-4 lg:gap-6'}`}>
             
             {/* Top/Left Workspace: Video Player */}
-            <section className={`coach-panel ${isWorkstation ? 'lg:col-span-7' : 'lg:col-span-5'} flex flex-col gap-4 p-2 sm:p-3 pb-2 lg:h-full lg:overflow-y-auto custom-scrollbar`}>
+            <section className={`coach-panel ${isWorkstation ? 'lg:col-span-7 xl:col-span-6' : 'lg:col-span-5'} flex flex-col gap-4 p-2 sm:p-3 pb-2 lg:h-full lg:overflow-y-auto custom-scrollbar`}>
               <React.Suspense fallback={<div className="w-full aspect-video bg-gray-800 animate-pulse rounded-lg flex items-center justify-center text-gray-400">Loading Player...</div>}>
                 <VideoPlayer />
               </React.Suspense>
             </section>
 
             {/* Top/Right Workspace: Tabs Interface */}
-            <section className={`${isWorkstation ? 'lg:col-span-5 bg-[#0c1721] p-2' : 'lg:col-span-7'} flex flex-col gap-4 lg:h-full lg:overflow-hidden`}>
+            <section className={`${isWorkstation ? 'lg:col-span-5 xl:col-span-4 bg-[#0c1721] p-2' : 'lg:col-span-7'} flex flex-col gap-4 lg:h-full lg:overflow-hidden`}>
               {/* Modern tabs navigation */}
               <div className="coach-panel-flat flex p-1 gap-1 shrink-0" role="tablist" aria-label={settings.uiLanguage === 'th' ? 'มุมมองการวิเคราะห์' : 'Analysis views'} onKeyDown={handleTablistKeyDown}>
                 <button
                   id="analysis-tab-input"
                   role="tab"
                   aria-selected={activeTab === 'input'}
                   aria-controls="analysis-panel-input"
                   onClick={() => setActiveTab('input')}
                   onPointerDown={() => setActiveTab('input')}
                   className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${
@@ -542,20 +543,26 @@ function AppContent() {
                   </section>
                 )}
                 {activeTab === 'bookmarks' && (
                   <section className="coach-panel p-4">
                     <BookmarksPanel />
                   </section>
                 )}
               </div>
             </section>
 
+            {isWorkstation && (
+              <div className="hidden min-w-0 xl:col-span-2 xl:block">
+                <WorkstationInspector />
+              </div>
+            )}
+
           </div>
         </main>
       )}
 
       {isWorkstation && activeProjectId && (
         <WorkstationStatusBar
           language={settings.uiLanguage}
           projectTitle={activeProject?.title || 'Untitled'}
           sport={matchInfo.sportType}
           eventCount={events.length}
diff --git a/src/components/hud/ProAreaCommandPad.tsx b/src/components/hud/ProAreaCommandPad.tsx
index 430a382..29658ef 100644
--- a/src/components/hud/ProAreaCommandPad.tsx
+++ b/src/components/hud/ProAreaCommandPad.tsx
@@ -1,18 +1,24 @@
 import React, { useRef, useEffect, useMemo, useState } from "react";
 import { Action, Area, SportType, Team, AreaSelectionPayload, OutZoneType } from "../../types";
 import { useScoutContext } from "../../context/ScoutContext";
 import { getAreaDisplay } from "../../utils/areaHelper";
 import { buildAreaPreviewGrid, mapAreaViewPointToFullCourt, resolveAreaSelectionFromPoint } from "../../utils/areaGeometry";
 import { OUT_ZONE_LABELS } from "../../sports";
 import SportCourtSurface from "../area/SportCourtSurface";
 import { resolveCourtTeamPresentation } from "../../utils/courtPresentation";
+import {
+  getProAreaLayoutMetrics,
+  getProAreaOutLaneSize,
+  getProAreaOutZoneLayout,
+  type ProAreaOutZoneItem,
+} from "../../utils/proAreaLayout";
 
 type ProAreaCommandPadProps = {
   sportType: SportType;
   areas: Area[];
   currentAction: Action;
   teams: Team[];
   onSelectArea: (payload: AreaSelectionPayload) => void;
   active: boolean;
   pointerX: number;
   pointerY: number;
@@ -64,37 +70,38 @@ export default function ProAreaCommandPad({
   }, [active]);
 
   // Radial aim: derive the virtual court point from pointer direction around the pad center.
   const [localRx, setLocalRx] = useState(0.5);
   const [localRy, setLocalRy] = useState(0.5);
   const [hoveredPayload, setHoveredPayload] = useState<AreaSelectionPayload | null>(null);
 
   useEffect(() => {
     if (!active || !containerRect) return;
 
-    const centerX = containerRect.left + containerRect.width / 2;
-    const centerY = containerRect.top + containerRect.height / 2;
+    const activeRect = containerRef.current?.getBoundingClientRect() ?? containerRect;
+    const centerX = activeRect.left + activeRect.width / 2;
+    const centerY = activeRect.top + activeRect.height / 2;
     const dx = pointerX - centerX;
     const dy = pointerY - centerY;
     const distance = Math.sqrt(dx * dx + dy * dy);
-    const deadZone = Math.max(28, Math.min(containerRect.width, containerRect.height) * 0.07);
+    const deadZone = Math.max(28, Math.min(activeRect.width, activeRect.height) * 0.07);
 
     if (!pointerX || !pointerY || distance < deadZone) {
       setLocalRx(0.5);
       setLocalRy(0.5);
       setHoveredPayload(null);
       onHoverArea(null);
       return;
     }
 
-    const rangeX = Math.max(120, containerRect.width * 0.5);
-    const rangeY = Math.max(120, containerRect.height * 0.5);
+    const rangeX = Math.max(120, activeRect.width * 0.5);
+    const rangeY = Math.max(120, activeRect.height * 0.5);
     const nextPoint = {
       rx: Math.max(0, Math.min(1, 0.5 + dx / rangeX / 2)),
       ry: Math.max(0, Math.min(1, 0.5 + dy / rangeY / 2)),
     };
 
     const canonicalPoint = mapAreaViewPointToFullCourt(
       sportType,
       nextPoint,
       settings?.areaCourtViewMode || "auto",
     );
@@ -134,40 +141,87 @@ export default function ProAreaCommandPad({
     return labelObj ? (isThai ? labelObj.thaiLabel : labelObj.label) : zone;
   };
 
   const isThai = settings?.uiLanguage === "th";
   const teamPresentation = resolveCourtTeamPresentation({
     teams,
     sportType,
     flipCourtSide,
     courtViewMode: settings?.areaCourtViewMode || "auto",
   });
+  const layoutMetrics = getProAreaLayoutMetrics(sportType);
+  const outLaneSize = getProAreaOutLaneSize(sportType);
+  const outZoneLayout = getProAreaOutZoneLayout(sportType);
 
   // Helper to determine if an area/zone in our pad is selected
   const isCodeSelected = (code: string, courtSide?: string, outZone?: string) => {
     return (
       currentAction.areaCode === code &&
       (!courtSide || currentAction.courtSide === courtSide) &&
       (!outZone || currentAction.outZone === outZone)
     );
   };
 
   // Helper to determine if an area/zone in our pad is hovered currently
   const isCodeHovered = (code: string, courtSide?: string, outZone?: string) => {
     const payload = hoveredArea !== undefined ? hoveredArea : hoveredPayload;
     return (
       payload?.areaCode === code &&
       (!courtSide || payload?.courtSide === courtSide) &&
       (!outZone || payload?.outZone === outZone)
     );
   };
 
+  const renderOutZoneStrip = (
+    zones: ProAreaOutZoneItem[],
+    edge: "top" | "bottom" | "left" | "right",
+  ) => {
+    const horizontal = edge === "top" || edge === "bottom";
+
+    return zones.map((zone, index) => {
+      const isLast = index === zones.length - 1;
+      const selected = isCodeSelected("OUT", "neutral", zone.outZone);
+      const hovered = isCodeHovered("OUT", "neutral", zone.outZone);
+      const label = zone.shortLabel
+        ? (isThai ? zone.shortLabel.th : zone.shortLabel.en)
+        : getOutZoneLabel(zone.outZone);
+      const divider = horizontal
+        ? `${edge === "top" ? "border-b" : "border-t"}${isLast ? "" : " border-r"}`
+        : `${edge === "left" ? "border-r" : "border-l"}${isLast ? "" : " border-b"}`;
+
+      return (
+        <div
+          key={zone.id}
+          data-pro-area-layout-id={zone.id}
+          data-pro-area-edge={edge}
+          data-scout-hover-area="OUT"
+          data-scout-hover-court-side="neutral"
+          data-scout-hover-out-zone={zone.outZone}
+          style={{
+            flex: zone.weight ?? 1,
+            minWidth: horizontal ? layoutMetrics.minimumTapTargetPx : undefined,
+            minHeight: horizontal ? undefined : layoutMetrics.minimumTapTargetPx,
+          }}
+          className={`min-w-0 flex items-center justify-center ${divider} border-dashed border-white/5 p-1 text-center text-[9px] font-bold uppercase transition-all ${
+            hovered
+              ? "bg-red-500/20 text-red-400"
+              : selected
+                ? "bg-red-500 text-white font-extrabold"
+                : "text-white/20"
+          }`}
+        >
+          {label}
+        </div>
+      );
+    });
+  };
+
   // Render individual zone block
   const renderZoneBlock = (code: string, label: string, courtSide?: "teamA" | "teamB" | "neutral", className = "") => {
     const isSelected = isCodeSelected(code, courtSide);
     const isHovered = isCodeHovered(code, courtSide);
 
     return (
       <div
         data-scout-hover-area={code}
         data-scout-hover-court-side={courtSide || "neutral"}
         className={`flex-1 flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-150 select-none ${
@@ -192,116 +246,50 @@ export default function ProAreaCommandPad({
       settings?.areaCourtViewMode || "auto",
       settings?.uiLanguage,
     ),
     [flipCourtSide, settings?.areaCourtViewMode, settings?.areaPrecisionMode, settings?.uiLanguage, sportType],
   );
 
   return (
     <div
       ref={containerRef}
       data-controller-wheel="area"
+      data-out-lane-min-target={layoutMetrics.minimumTapTargetPx}
       className={`relative w-full aspect-[4/3] sm:aspect-[1.4/1] bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between overflow-hidden select-none`}
     >
       {/* Pointer Highlight */}
       <div 
         className="absolute w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-400/60 pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.5)] backdrop-blur-[2px]"
         style={{ left: `${localRx * 100}%`, top: `${localRy * 100}%` }}
       >
         <div className="w-1 h-1 bg-amber-300 rounded-full" />
       </div>
       {/* 1. OUT OF BOUNDS - TOP EDGE */}
-      <div className="absolute top-0 left-0 right-0 h-[5%] flex">
-        {enableOutOfBoundsZones ? (
-          sportType === "volleyball" ? (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="opp_back_left" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "opp_back_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "opp_back_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("opp_back_left")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="opp_back_right" className={`flex-1 flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "opp_back_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "opp_back_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("opp_back_right")}
-              </div>
-            </>
-          ) : sportType === "football" ? (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="corner_left" className={`w-[20%] flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "corner_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "corner_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("corner_left")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="opp_endline" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "opp_endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "opp_endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("opp_endline")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="corner_right" className={`w-[20%] flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "corner_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "corner_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("corner_right")}
-              </div>
-            </>
-          ) : sportType === "badminton" ? (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="opp_back_out" className={`flex-1 flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "opp_back_out") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "opp_back_out") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("opp_back_out")}
-              </div>
-            </>
-          ) : (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="baseline_left" className={`flex-1 flex items-center justify-center border-b border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "baseline_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "baseline_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("baseline_left")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="baseline_right" className={`flex-1 flex items-center justify-center border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "baseline_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "baseline_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("baseline_right")}
-              </div>
-            </>
-          )
-        ) : (
+      <div className="absolute top-0 left-0 right-0 flex" style={{ height: outLaneSize }}>
+        {enableOutOfBoundsZones ? renderOutZoneStrip(outZoneLayout.top, "top") : (
           <div className="w-full h-full flex items-center justify-center bg-zinc-950/20 text-white/5 font-extrabold text-[10px] tracking-widest uppercase">
             {isThai ? "ขอบสนามนอก (OOB)" : "OUT OF BOUNDS"}
           </div>
         )}
       </div>
 
       {/* 2. INNER COURT ROW (Contains LEFT EDGE | COURT CONTAINER | RIGHT EDGE) */}
-      <div className="flex-1 w-full flex my-[5%]">
+      <div
+        className="absolute left-0 right-0 flex"
+        style={{ top: outLaneSize, bottom: outLaneSize }}
+      >
         {/* LEFT EDGE */}
-        <div className="w-[5%] h-full flex flex-col overflow-hidden">
+        <div className="h-full flex flex-col overflow-hidden" style={{ width: outLaneSize }}>
           {enableOutOfBoundsZones ? (
-            sportType === "volleyball" ? (
-              <>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left_far" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left_far") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left_far") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ซ้ายไกล" : "L Far"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left_near" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left_near") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left_near") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ซ้ายใกล้" : "L Near"}
-                </div>
-              </>
-            ) : sportType === "football" ? (
-              <>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_touchline_att" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_touchline_att") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_touchline_att") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ซ้ายรุก" : "L Att"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_touchline_mid" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_touchline_mid") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_touchline_mid") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ซ้ายกลาง" : "L Mid"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_touchline_def" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_touchline_def") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_touchline_def") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ซ้ายรับ" : "L Def"}
-                </div>
-              </>
-            ) : sportType === "badminton" ? (
-              <>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left_far" className={`flex-1 flex items-center justify-center border-r border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left_far") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left_far") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ไกล" : "Far"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_left_near" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_left_near") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_left_near") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ใกล้" : "Near"}
-                </div>
-              </>
-            ) : (
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="left_sideline" className={`flex-1 flex items-center justify-center border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "left_sideline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "left_sideline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("left_sideline")}
-              </div>
-            )
+            <>
+              {renderOutZoneStrip(outZoneLayout.left, "left")}
+</>
           ) : (
             <div className="w-full h-full border-r border-white/5"></div>
           )}
         </div>
 
         {/* CENTER ACTIVE COURT GRID */}
         <div className="flex-1 h-full relative bg-black/40 border border-white/10 rounded-xl overflow-hidden">
           <SportCourtSurface sport={sportType}>
             <div className="relative h-full p-2">
               {teamPresentation.orientation === "vertical" ? (
@@ -376,98 +364,37 @@ export default function ProAreaCommandPad({
                   </React.Fragment>
                 );
               })}
             </div>
           )}
             </div>
           </SportCourtSurface>
         </div>
 
         {/* RIGHT EDGE */}
-        <div className="w-[5%] h-full flex flex-col overflow-hidden">
+        <div className="h-full flex flex-col overflow-hidden" style={{ width: outLaneSize }}>
           {enableOutOfBoundsZones ? (
-            sportType === "volleyball" ? (
-              <>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right_far" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right_far") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right_far") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ขวาไกล" : "R Far"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right_near" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right_near") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right_near") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ขวาใกล้" : "R Near"}
-                </div>
-              </>
-            ) : sportType === "football" ? (
-              <>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_touchline_att" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_touchline_att") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_touchline_att") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ขวารุก" : "R Att"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_touchline_mid" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_touchline_mid") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_touchline_mid") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ขวากลาง" : "R Mid"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_touchline_def" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] text-center p-1 uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_touchline_def") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_touchline_def") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ขวารับ" : "R Def"}
-                </div>
-              </>
-            ) : sportType === "badminton" ? (
-              <>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right_far" className={`flex-1 flex items-center justify-center border-l border-b border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right_far") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right_far") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ไกล" : "Far"}
-                </div>
-                <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="side_right_near" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "side_right_near") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "side_right_near") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                  {isThai ? "ใกล้" : "Near"}
-                </div>
-              </>
-            ) : (
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="right_sideline" className={`flex-1 flex items-center justify-center border-l border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "right_sideline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "right_sideline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("right_sideline")}
-              </div>
-            )
+            <>
+              {renderOutZoneStrip(outZoneLayout.right, "right")}
+</>
           ) : (
             <div className="w-full h-full border-l border-white/5"></div>
           )}
         </div>
       </div>
 
       {/* 3. OUT OF BOUNDS - BOTTOM EDGE */}
-      <div className="absolute bottom-0 left-0 right-0 h-[5%] flex">
+      <div className="absolute bottom-0 left-0 right-0 flex" style={{ height: outLaneSize }}>
         {enableOutOfBoundsZones ? (
-          sportType === "volleyball" ? (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="own_back_out" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "own_back_out") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "own_back_out") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("own_back_out")}
-              </div>
-            </>
-          ) : sportType === "football" ? (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="own_endline" className={`flex-1 flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "own_endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "own_endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("own_endline")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="goal_kick" className={`flex-[1.2] flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "goal_kick") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "goal_kick") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("goal_kick")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="own_endline" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "own_endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "own_endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("own_endline")}
-              </div>
-            </>
-          ) : sportType === "badminton" ? (
-            <>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_left" className={`flex-1 flex items-center justify-center border-t border-r border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_left") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_left") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("back_left")}
-              </div>
-              <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="back_right" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "back_right") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "back_right") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-                {getOutZoneLabel("back_right")}
-              </div>
-            </>
-          ) : (
-            <div data-scout-hover-area="OUT" data-scout-hover-court-side="neutral" data-scout-hover-out-zone="endline" className={`flex-1 flex items-center justify-center border-t border-dashed border-white/5 text-[9px] uppercase font-bold transition-all ${isCodeHovered("OUT", "neutral", "endline") ? "bg-red-500/20 text-red-400" : isCodeSelected("OUT", "neutral", "endline") ? "bg-red-500 text-white font-extrabold" : "text-white/20"}`}>
-              {getOutZoneLabel("endline")}
-            </div>
-          )
+          <>
+            {renderOutZoneStrip(outZoneLayout.bottom, "bottom")}
+</>
         ) : (
           <div className="w-full h-full flex items-center justify-center bg-zinc-950/20 text-white/5 font-extrabold text-[10px] tracking-widest uppercase">
             {isThai ? "ขอบสนามนอก (OOB)" : "OUT OF BOUNDS"}
           </div>
         )}
       </div>
     </div>
   );
 }
 
diff --git a/src/index.css b/src/index.css
index c2b7153..914f606 100644
--- a/src/index.css
+++ b/src/index.css
@@ -325,20 +325,98 @@
 .workstation-shell .coach-panel,
 .workstation-shell .coach-panel-flat {
   border-radius: 3px;
   border-color: var(--ws-border);
   background: var(--ws-surface);
   box-shadow: none;
 }
 .workstation-shell .coach-tab { border-radius: 2px; }
 .workstation-shell .coach-tab-active { background: #0b3042; box-shadow: inset 0 -2px var(--ws-accent); }
 
+.workstation-inspector {
+  height: 100%;
+  display: flex;
+  flex-direction: column;
+  min-width: 0;
+  border-left: 1px solid var(--ws-border);
+  background: #09141d;
+  color: var(--ws-text);
+}
+.workstation-inspector > header {
+  display: grid;
+  gap: 12px;
+  padding: 14px 12px;
+  border-bottom: 1px solid var(--ws-border);
+}
+.workstation-inspector > header > div { min-width: 0; }
+.workstation-inspector > header span:first-child {
+  display: block;
+  color: var(--ws-muted);
+  font-size: 11px;
+  font-weight: 700;
+}
+.workstation-inspector h2 { margin: 2px 0 0; font-size: 16px; line-height: 24px; font-weight: 750; }
+.workstation-inspector-state {
+  display: inline-flex;
+  align-items: center;
+  gap: 6px;
+  width: fit-content;
+  color: #9fb0bc;
+  font-size: 12px;
+  font-weight: 700;
+}
+.workstation-inspector-state.is-valid { color: #62dfa0; }
+.workstation-inspector-state.is-invalid { color: #fbbf6b; }
+.workstation-inspector-fields { display: grid; }
+.workstation-inspector-fields > div {
+  display: grid;
+  grid-template-columns: minmax(58px, .7fr) minmax(0, 1.3fr);
+  gap: 8px;
+  align-items: center;
+  min-height: 42px;
+  padding: 7px 12px;
+  border-bottom: 1px solid #1d2b36;
+}
+.workstation-inspector-fields span { color: var(--ws-muted); font-size: 12px; }
+.workstation-inspector-fields strong {
+  overflow: hidden;
+  color: #dbe8ef;
+  font-size: 13px;
+  font-weight: 700;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+.workstation-inspector-validation {
+  display: flex;
+  gap: 8px;
+  margin: 14px 12px;
+  padding: 10px;
+  border: 1px solid #5b4326;
+  background: #231b11;
+  color: #fbbf6b;
+}
+.workstation-inspector-validation.is-valid { border-color: #1f5a42; background: #0d251b; color: #62dfa0; }
+.workstation-inspector-validation div { min-width: 0; display: grid; gap: 2px; }
+.workstation-inspector-validation strong { font-size: 12px; }
+.workstation-inspector-validation span { color: #b8c6cf; font-size: 12px; line-height: 1.45; }
+.workstation-inspector > footer {
+  display: flex;
+  align-items: center;
+  gap: 7px;
+  margin-top: auto;
+  padding: 10px 12px;
+  border-top: 1px solid var(--ws-border);
+  color: var(--ws-muted);
+  font-size: 12px;
+}
+.workstation-inspector > footer code { margin-left: auto; color: #dbe8ef; font-size: 12px; }
+
 .workstation-statusbar {
   min-height: 34px;
   display: flex;
   align-items: center;
   gap: 28px;
   padding: 0 16px;
   border-top: 1px solid var(--ws-border);
   background: #071018;
   color: var(--ws-muted);
   font-size: 12px;
## New File: e2e/hud-area.spec.ts
import { expect, test } from '@playwright/test';

async function openSportHud(page: import('@playwright/test').Page, sportName: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /Pilot.*4|4.*Pilot/i }).click();
  await page.getByTestId('workspace-menu-toggle').click();
  await page.getByRole('button', { name: `SPORTSCOUT Pilot - ${sportName}`, exact: true }).click();
  await page.getByRole('button', { name: 'YouTube', exact: true }).click();
  await page.getByPlaceholder('YouTube URL...').fill('https://www.youtube.com/watch?v=kejGdB0Y2c4');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'HUD Mode', exact: true }).click();
}

const sportCases = [
  { name: 'Volleyball', outZoneCount: 7 },
  { name: 'Football', outZoneCount: 12 },
  { name: 'Badminton', outZoneCount: 7 },
  { name: 'Basketball', outZoneCount: 5 },
] as const;

for (const sport of sportCases) {
  test(`keeps ${sport.name} Pro HUD out-of-court zones visible and usable`, async ({ page }) => {
    await openSportHud(page, sport.name);

    await page.keyboard.down('w');
    const areaPad = page.locator('[data-controller-wheel="area"]');
    await expect(areaPad).toBeVisible();
    await expect(areaPad).toHaveAttribute('data-out-lane-min-target', '44');

    const result = await areaPad.evaluate((element) => {
      const pad = element.getBoundingClientRect();
      const zones = Array.from(element.querySelectorAll<HTMLElement>('[data-scout-hover-out-zone]'));
      return {
        zoneCount: zones.length,
        layoutIds: zones.map((zone) => zone.dataset.proAreaLayoutId),
        allInside: zones.every((zone) => {
          const rect = zone.getBoundingClientRect();
          return rect.left >= pad.left - 1 && rect.right <= pad.right + 1
            && rect.top >= pad.top - 1 && rect.bottom <= pad.bottom + 1;
        }),
        targetSizing: zones.map((zone) => {
          const rect = zone.getBoundingClientRect();
          const edge = zone.dataset.proAreaEdge;
          const horizontal = edge === 'top' || edge === 'bottom';
          const vertical = edge === 'left' || edge === 'right';
          return {
            edge,
            width: rect.width,
            height: rect.height,
            valid: (horizontal && rect.width >= 44 && rect.height >= 44)
              || (vertical && rect.height >= 44 && rect.width >= 44),
          };
        }),
      };
    });

    expect(result.zoneCount).toBe(sport.outZoneCount);
    expect(result.layoutIds.every(Boolean)).toBe(true);
    expect(result.allInside).toBe(true);
    expect(result.targetSizing).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge: expect.stringMatching(/^(top|bottom|left|right)$/) }),
    ]));
    expect(result.targetSizing.filter(target => !target.valid)).toEqual([]);
    await page.keyboard.up('w');
  });
}

test('uses W hold, aim, and release to select an area and Escape to cancel', async ({ page }) => {
  await openSportHud(page, 'Volleyball');

  const areaPad = page.locator('[data-controller-wheel="area"]');
  const firstTarget = page.locator('[data-scout-hover-area="LB"][data-scout-hover-court-side="teamA"]');
  const secondTarget = page.locator('[data-scout-hover-area="RB"][data-scout-hover-court-side="teamB"]');
  const movePointer = (relativeX: number, relativeY: number) => areaPad.evaluate(
    (element, point) => {
      const rect = element.getBoundingClientRect();
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: rect.left + rect.width * point.relativeX,
        clientY: rect.top + rect.height * point.relativeY,
      }));
    },
    { relativeX, relativeY },
  );
  const aimAt = async (relativeX: number, relativeY: number, target: typeof firstTarget) => {
    await expect.poll(async () => {
      await movePointer(0.5, 0.5);
      await movePointer(relativeX, relativeY);
      return target.evaluate(element => element.className.includes('bg-amber-500/25'));
    }).toBe(true);
  };
  const neutralizeAim = async () => {
    await expect.poll(async () => {
      await movePointer(0.5, 0.5);
      return areaPad.locator('[data-scout-hover-area]').evaluateAll(
        targets => targets.every(target => !target.className.includes('bg-red-500/20')
          && !target.className.includes('bg-amber-500/25')),
      );
    }).toBe(true);
  };

  await page.keyboard.down('w');
  await expect(areaPad).toBeVisible();
  await aimAt(0.18, 0.2, firstTarget);
  await expect(firstTarget).toHaveClass(/bg-amber-500\/25/);
  await page.keyboard.up('w');
  await expect(areaPad).toHaveCount(0);

  await page.keyboard.down('w');
  await expect(areaPad).toBeVisible();
  await neutralizeAim();
  await expect(firstTarget).toHaveClass(/bg-amber-500 border-amber-400/);
  await aimAt(0.82, 0.2, secondTarget);
  await expect(secondTarget).toHaveClass(/bg-amber-500\/25/);
  await page.keyboard.press('Escape');
  await page.keyboard.up('w');
  await expect(areaPad).toHaveCount(0);

  await page.keyboard.down('w');
  await expect(areaPad).toBeVisible();
  await neutralizeAim();
  await expect(firstTarget).toHaveClass(/bg-amber-500 border-amber-400/);
  await expect(secondTarget).not.toHaveClass(/bg-amber-500 border-amber-400/);
  await page.keyboard.up('w');
});

## New File: src/__tests__/utils/proAreaLayout.test.ts
import { describe, expect, it } from 'vitest';
import { resolveControllerHudIntent, type ControllerHudContext } from '../../controller/controllerHudBridge';
import { createDefaultControllerProfile } from '../../controller/controllerProfiles';
import type { ControllerButtonName, ControllerInputEvent } from '../../controller/types';
import type { SportType } from '../../types';
import { resolveAreaSelectionFromPoint } from '../../utils/areaGeometry';
import { resolveKeyboardCoachCommand } from '../../utils/coachCommands';
import { getProAreaLayoutMetrics, getProAreaOutZoneLayout } from '../../utils/proAreaLayout';

describe('Pro HUD area layout', () => {
  it.each(['volleyball', 'football', 'badminton', 'basketball'] as SportType[])(
    'keeps %s out-of-court lanes large enough for pointer and touch input',
    (sportType) => {
      const metrics = getProAreaLayoutMetrics(sportType);

      expect(metrics.minimumTapTargetPx).toBeGreaterThanOrEqual(44);
      expect(metrics.outLanePercent).toBeGreaterThanOrEqual(10);
      expect(metrics.outLanePercent).toBeLessThanOrEqual(14);
    },
  );

  it.each([
    ['volleyball', ['opp_back_left', 'opp_back_right', 'side_left_far', 'side_left_near', 'side_right_far', 'side_right_near', 'own_back_out']],
    ['football', ['corner_left', 'opp_endline', 'corner_right', 'left_touchline_att', 'left_touchline_mid', 'left_touchline_def', 'right_touchline_att', 'right_touchline_mid', 'right_touchline_def', 'own_endline', 'goal_kick', 'own_endline']],
    ['badminton', ['opp_back_out', 'side_left_far', 'side_left_near', 'side_right_far', 'side_right_near', 'back_left', 'back_right']],
    ['basketball', ['baseline_left', 'baseline_right', 'left_sideline', 'right_sideline', 'endline']],
  ] as const)('keeps %s out zones isolated in its own typed layout', (sportType, expectedZones) => {
    const layout = getProAreaOutZoneLayout(sportType);
    const items = [...layout.top, ...layout.left, ...layout.right, ...layout.bottom];

    expect(items.map(item => item.outZone)).toEqual(expectedZones);
    expect(items.every(item => item.id.startsWith(`${sportType}:`))).toBe(true);
  });

  it('uses globally unique UI ids across all sport layouts', () => {
    const ids = (['volleyball', 'football', 'badminton', 'basketball'] as SportType[])
      .flatMap(sportType => {
        const layout = getProAreaOutZoneLayout(sportType);
        return [...layout.top, ...layout.left, ...layout.right, ...layout.bottom].map(item => item.id);
      });

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the visible zone stable while flip court swaps its physical side', () => {
    const resolve = (flipCourtSide: boolean) => resolveAreaSelectionFromPoint({
      sportType: 'volleyball',
      point: { rx: 0.25, ry: 0.25 },
      flipCourtSide,
      enableOutOfBoundsZones: true,
      areaPrecisionMode: 'normal',
      uiLanguage: 'en',
    });

    expect(resolve(false)).toMatchObject({ areaCode: 'LB', courtSide: 'teamA' });
    expect(resolve(true)).toMatchObject({ areaCode: 'LB', courtSide: 'teamB' });
  });

  it('opens the area wheel through the shared keyboard and controller command paths', () => {
    expect(resolveKeyboardCoachCommand({ code: 'KeyW' }, 'hud-base'))
      .toEqual({ type: 'openMenu', menu: 'area' });

    const profile = createDefaultControllerProfile('xbox');
    const areaControl = profile.bindings.openArea;
    const context = (overrides: Partial<ControllerHudContext> = {}): ControllerHudContext => ({
      mode: 'hud-base',
      activeMenu: 'none',
      ...overrides,
    });
    const buttonEvent = (
      type: 'button-down' | 'button-up',
      control: ControllerButtonName,
    ): ControllerInputEvent => ({
      type,
      controllerIndex: 0,
      family: 'xbox',
      control,
      value: type === 'button-up' ? 0 : 1,
    });

    expect(resolveControllerHudIntent(buttonEvent('button-down', areaControl), profile, context()))
      .toEqual({ type: 'open-menu', menu: 'area', control: areaControl });
    expect(resolveControllerHudIntent(
      buttonEvent('button-up', areaControl),
      profile,
      context({ mode: 'active-wheel', activeMenu: 'area', activeMenuControl: areaControl }),
    )).toEqual({ type: 'release-menu', menu: 'area' });
  });
});

## New File: src/components/workstation/WorkstationInspector.tsx
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

## New File: src/utils/proAreaLayout.ts
import type { OutZoneType, SportType } from '../types';

export interface ProAreaLayoutMetrics {
  outLanePercent: number;
  minimumTapTargetPx: number;
  maximumOutLanePx: number;
}

export interface ProAreaOutZoneItem {
  id: string;
  outZone: OutZoneType;
  weight?: number;
  shortLabel?: { th: string; en: string };
}

export interface ProAreaOutZoneLayout {
  sportType: SportType;
  top: ProAreaOutZoneItem[];
  left: ProAreaOutZoneItem[];
  right: ProAreaOutZoneItem[];
  bottom: ProAreaOutZoneItem[];
}

const item = (
  sportType: SportType,
  id: string,
  outZone: OutZoneType,
  options: Omit<ProAreaOutZoneItem, 'id' | 'outZone'> = {},
): ProAreaOutZoneItem => ({ id: `${sportType}:${id}`, outZone, ...options });

const PRO_AREA_OUT_ZONE_LAYOUTS: Record<SportType, ProAreaOutZoneLayout> = {
  volleyball: {
    sportType: 'volleyball',
    top: [
      item('volleyball', 'opp-back-left', 'opp_back_left'),
      item('volleyball', 'opp-back-right', 'opp_back_right'),
    ],
    left: [
      item('volleyball', 'side-left-far', 'side_left_far', { shortLabel: { th: 'ซ้ายไกล', en: 'L Far' } }),
      item('volleyball', 'side-left-near', 'side_left_near', { shortLabel: { th: 'ซ้ายใกล้', en: 'L Near' } }),
    ],
    right: [
      item('volleyball', 'side-right-far', 'side_right_far', { shortLabel: { th: 'ขวาไกล', en: 'R Far' } }),
      item('volleyball', 'side-right-near', 'side_right_near', { shortLabel: { th: 'ขวาใกล้', en: 'R Near' } }),
    ],
    bottom: [item('volleyball', 'own-back-out', 'own_back_out')],
  },
  football: {
    sportType: 'football',
    top: [
      item('football', 'corner-left', 'corner_left', { weight: 0.7 }),
      item('football', 'opponent-endline', 'opp_endline'),
      item('football', 'corner-right', 'corner_right', { weight: 0.7 }),
    ],
    left: [
      item('football', 'left-touchline-attack', 'left_touchline_att', { shortLabel: { th: 'ซ้ายรุก', en: 'L Att' } }),
      item('football', 'left-touchline-midfield', 'left_touchline_mid', { shortLabel: { th: 'ซ้ายกลาง', en: 'L Mid' } }),
      item('football', 'left-touchline-defense', 'left_touchline_def', { shortLabel: { th: 'ซ้ายรับ', en: 'L Def' } }),
    ],
    right: [
      item('football', 'right-touchline-attack', 'right_touchline_att', { shortLabel: { th: 'ขวารุก', en: 'R Att' } }),
      item('football', 'right-touchline-midfield', 'right_touchline_mid', { shortLabel: { th: 'ขวากลาง', en: 'R Mid' } }),
      item('football', 'right-touchline-defense', 'right_touchline_def', { shortLabel: { th: 'ขวารับ', en: 'R Def' } }),
    ],
    bottom: [
      item('football', 'own-endline-left', 'own_endline'),
      item('football', 'goal-kick', 'goal_kick', { weight: 1.2 }),
      item('football', 'own-endline-right', 'own_endline'),
    ],
  },
  badminton: {
    sportType: 'badminton',
    top: [item('badminton', 'opponent-back-out', 'opp_back_out')],
    left: [
      item('badminton', 'side-left-far', 'side_left_far', { shortLabel: { th: 'ไกล', en: 'Far' } }),
      item('badminton', 'side-left-near', 'side_left_near', { shortLabel: { th: 'ใกล้', en: 'Near' } }),
    ],
    right: [
      item('badminton', 'side-right-far', 'side_right_far', { shortLabel: { th: 'ไกล', en: 'Far' } }),
      item('badminton', 'side-right-near', 'side_right_near', { shortLabel: { th: 'ใกล้', en: 'Near' } }),
    ],
    bottom: [
      item('badminton', 'back-left', 'back_left'),
      item('badminton', 'back-right', 'back_right'),
    ],
  },
  basketball: {
    sportType: 'basketball',
    top: [
      item('basketball', 'baseline-left', 'baseline_left'),
      item('basketball', 'baseline-right', 'baseline_right'),
    ],
    left: [item('basketball', 'left-sideline', 'left_sideline')],
    right: [item('basketball', 'right-sideline', 'right_sideline')],
    bottom: [item('basketball', 'endline', 'endline')],
  },
};

const PRO_AREA_LAYOUT_METRICS: Record<SportType, ProAreaLayoutMetrics> = {
  volleyball: { outLanePercent: 11, minimumTapTargetPx: 44, maximumOutLanePx: 56 },
  football: { outLanePercent: 12, minimumTapTargetPx: 44, maximumOutLanePx: 60 },
  badminton: { outLanePercent: 11, minimumTapTargetPx: 44, maximumOutLanePx: 56 },
  basketball: { outLanePercent: 12, minimumTapTargetPx: 44, maximumOutLanePx: 60 },
};

export function getProAreaLayoutMetrics(sportType: SportType): ProAreaLayoutMetrics {
  return PRO_AREA_LAYOUT_METRICS[sportType];
}

export function getProAreaOutZoneLayout(sportType: SportType): ProAreaOutZoneLayout {
  return PRO_AREA_OUT_ZONE_LAYOUTS[sportType];
}

export function getProAreaOutLaneSize(sportType: SportType): string {
  const metrics = getProAreaLayoutMetrics(sportType);
  return `clamp(${metrics.minimumTapTargetPx}px, ${metrics.outLanePercent}%, ${metrics.maximumOutLanePx}px)`;
}

