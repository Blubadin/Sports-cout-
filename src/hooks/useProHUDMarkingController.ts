import { useState, useEffect, useRef, useCallback } from "react";
import { AppSettings, Team, AreaSelectionPayload } from "../types";
import type { HudCommandMenu } from "../utils/hudCommandBindings";
import {
  getHudMenuForKeyboardCode,
} from "../utils/hudCommandBindings";
import {
  dispatchCoachCommand,
  resolveCoachInputContext,
  resolveKeyboardCoachCommand,
  type CoachCommand,
} from "../utils/coachCommands";
import { resolveVolleyballGrade } from "../volleyball/volleyballSkillGrades";

export type MarkingMenuType = "none" | "team" | "skill" | "area" | "result" | "foul";

export interface HoveredArea extends AreaSelectionPayload {
  code: string;
}

export interface HoveredDescriptor {
  groupId: string;
  optionCode: string;
}

interface UseProHUDMarkingControllerProps {
  settings: AppSettings;
  teams: Team[];
  selectedSkill: string | null;
  updateActionField: (field: string, value: any, extraId?: any) => void;
  commitSkillSelection: (payload: { skillCode: string; descriptorGroupId?: string; descriptorCode?: string }) => void;
  commitResult: (resultCode: string, fastMode?: boolean, resultDetailCode?: string) => void;
  onCloseHUD: () => void;
  layout: any;
  selectArea?: (payload: AreaSelectionPayload) => void;
  selectFoul?: (foul: any) => void;
  sportTemplate?: any;
}

export function useProHUDMarkingController({
  settings,
  teams,
  selectedSkill,
  updateActionField,
  commitSkillSelection,
  commitResult,
  onCloseHUD,
  layout,
  selectArea,
  selectFoul,
  sportTemplate,
}: UseProHUDMarkingControllerProps) {
  const [activeMenu, setActiveMenuState] = useState<MarkingMenuType>("none");
  const activeMenuRef = useRef<MarkingMenuType>("none");

  const [pointerPosition, setPointerPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  // Hover states as state for React re-renders, and refs for keyup lookup
  const [hoveredSkill, setHoveredSkillState] = useState<string | null>(null);
  const hoveredSkillRef = useRef<string | null>(null);

  const [hoveredDescriptor, setHoveredDescriptorState] =
    useState<HoveredDescriptor | null>(null);
  const hoveredDescriptorRef = useRef<HoveredDescriptor | null>(null);

  const [hoveredArea, setHoveredAreaState] = useState<HoveredArea | null>(null);
  const hoveredAreaRef = useRef<HoveredArea | null>(null);

  const [hoveredResult, setHoveredResultState] = useState<string | null>(null);
  const hoveredResultRef = useRef<string | null>(null);
  const [hoveredResultDetail, setHoveredResultDetailState] = useState<string | null>(null);
  const hoveredResultDetailRef = useRef<string | null>(null);

  const [hoveredTeam, setHoveredTeamState] = useState<string | null>(null);
  const hoveredTeamRef = useRef<string | null>(null);
  const [hoveredFoul, setHoveredFoulState] = useState<string | null>(null);
  const hoveredFoulRef = useRef<string | null>(null);

  const isHoldingKeyRef = useRef<{ [key: string]: boolean }>({});

  const setActiveMenu = useCallback((menu: MarkingMenuType) => {
    setActiveMenuState(menu);
    activeMenuRef.current = menu;
  }, []);

  const setHoveredSkill = useCallback((val: string | null) => {
    setHoveredSkillState(val);
    hoveredSkillRef.current = val;
  }, []);

  const setHoveredDescriptor = useCallback((val: HoveredDescriptor | null) => {
    setHoveredDescriptorState(val);
    hoveredDescriptorRef.current = val;
  }, []);

  const setHoveredArea = useCallback((val: AreaSelectionPayload | null) => {
    let finalVal: HoveredArea | null = null;
    if (val) {
      const codeValue = val.areaCode || (val as { code?: string }).code || "";
      finalVal = {
        ...val,
        code: codeValue,
        areaCode: val.areaCode || codeValue
      };
    }
    setHoveredAreaState(finalVal);
    hoveredAreaRef.current = finalVal;
  }, []);

  const setHoveredResult = useCallback((val: string | null) => {
    setHoveredResultState(val);
    hoveredResultRef.current = val;
  }, []);
  const setHoveredResultDetail = useCallback((val: string | null) => {
    setHoveredResultDetailState(val);
    hoveredResultDetailRef.current = val;
  }, []);

  const setHoveredTeam = useCallback((val: string | null) => {
    setHoveredTeamState(val);
    hoveredTeamRef.current = val;
  }, []);
  const setHoveredFoul = useCallback((val: string | null) => {
    setHoveredFoulState(val);
    hoveredFoulRef.current = val;
  }, []);

  // Compute previewSkill: hoveredSkill has priority over selectedSkill
  const previewSkill = hoveredSkill || selectedSkill;
  const previewSkillRef = useRef<string | null>(null);
  useEffect(() => {
    previewSkillRef.current = previewSkill;
  }, [previewSkill]);

  // Clean all hover states
  const clearHoverStates = useCallback(() => {
    setHoveredSkill(null);
    setHoveredDescriptor(null);
    setHoveredArea(null);
    setHoveredResult(null);
    setHoveredResultDetail(null);
    setHoveredTeam(null);
    setHoveredFoul(null);
  }, [
    setHoveredSkill,
    setHoveredDescriptor,
    setHoveredArea,
    setHoveredResult,
    setHoveredResultDetail,
    setHoveredTeam,
    setHoveredFoul,
  ]);

  const openMarkingMenu = useCallback(
    (menu: HudCommandMenu) => {
      if (activeMenuRef.current !== menu) {
        clearHoverStates();
      }
      setActiveMenu(menu);
    },
    [clearHoverStates, setActiveMenu],
  );

  const toggleMarkingMenu = useCallback(
    (menu: HudCommandMenu) => {
      const nextMenu = activeMenuRef.current === menu ? "none" : menu;
      if (nextMenu !== activeMenuRef.current) {
        clearHoverStates();
      }
      setActiveMenu(nextMenu);
    },
    [clearHoverStates, setActiveMenu],
  );

  // Determine effective interaction style
  const isHoldMode =
    layout.device === "phone"
      ? false
      : (layout.experienceMode === "pro" ? true : (settings.hudInteractionStyle === "hold"));

  const bindHoverItem = useCallback(
    (
      type: "skill" | "descriptor" | "area" | "result" | "team",
      value: string,
      extra?: any,
    ) => {
      switch (type) {
        case "skill":
          return { "data-scout-hover-skill": value };
        case "descriptor":
          return {
            "data-scout-hover-descriptor-group": extra?.groupId || "",
            "data-scout-hover-descriptor-option": value,
          };
        case "area":
          return {
            "data-scout-hover-area": value,
            "data-scout-hover-court-side": extra?.courtSide || "",
          };
        case "result":
          return { "data-scout-hover-result": value };
        case "team":
          return { "data-scout-hover-team": value };
        default:
          return {};
      }
    },
    [],
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      setPointerPosition({ x: clientX, y: clientY });

      if (activeMenuRef.current === "none") return;
      
      // Bypass elementFromPoint DOM hover tracking for geometry-based wheels
      if (
        activeMenuRef.current === "skill" ||
        activeMenuRef.current === "area" ||
        activeMenuRef.current === "result" || activeMenuRef.current === "foul"
      ) {
        return;
      }

      const element = document.elementFromPoint(clientX, clientY);
      if (!element) {
        clearHoverStates();
        return;
      }

      const hSkill =
        element.getAttribute("data-scout-hover-skill") ||
        element
          .closest("[data-scout-hover-skill]")
          ?.getAttribute("data-scout-hover-skill");
      const descGroup =
        element.getAttribute("data-scout-hover-descriptor-group") ||
        element
          .closest("[data-scout-hover-descriptor-group]")
          ?.getAttribute("data-scout-hover-descriptor-group");
      const descOption =
        element.getAttribute("data-scout-hover-descriptor-option") ||
        element
          .closest("[data-scout-hover-descriptor-option]")
          ?.getAttribute("data-scout-hover-descriptor-option");
      const hArea =
        element.getAttribute("data-scout-hover-area") ||
        element
          .closest("[data-scout-hover-area]")
          ?.getAttribute("data-scout-hover-area");
      const courtSide =
        element.getAttribute("data-scout-hover-court-side") ||
        element
          .closest("[data-scout-hover-court-side]")
          ?.getAttribute("data-scout-hover-court-side");
      const outZone =
        element.getAttribute("data-scout-hover-out-zone") ||
        element
          .closest("[data-scout-hover-out-zone]")
          ?.getAttribute("data-scout-hover-out-zone");
      const hResult =
        element.getAttribute("data-scout-hover-result") ||
        element
          .closest("[data-scout-hover-result]")
          ?.getAttribute("data-scout-hover-result");
      const hFoul =
        element.getAttribute("data-scout-hover-foul") ||
        element
          .closest("[data-scout-hover-foul]")
          ?.getAttribute("data-scout-hover-foul");
      const hTeam =
        element.getAttribute("data-scout-hover-team") ||
        element
          .closest("[data-scout-hover-team]")
          ?.getAttribute("data-scout-hover-team");

      if (hSkill) {
        setHoveredSkill(hSkill);
      } else {
        setHoveredSkill(null);
      }

      if (descGroup && descOption) {
        setHoveredDescriptor({ groupId: descGroup, optionCode: descOption });
      } else {
        setHoveredDescriptor(null);
      }

      if (hArea) {
        setHoveredArea({
          areaCode: hArea,
          courtSide: (courtSide as AreaSelectionPayload['courtSide']) || undefined,
          outZone: (outZone as AreaSelectionPayload['outZone']) || undefined,
        });
      } else {
        setHoveredArea(null);
      }

      if (hResult) {
        setHoveredResult(hResult);
      } else {
        setHoveredResult(null);
      }

      if (hFoul) {
        setHoveredFoul(hFoul);
      } else {
        setHoveredFoul(null);
      }
      if (hTeam) {
        setHoveredTeam(hTeam);
      } else {
        setHoveredTeam(null);
      }
    },
    [
      clearHoverStates,
      setHoveredSkill,
      setHoveredDescriptor,
      setHoveredArea,
      setHoveredResult,
      setHoveredTeam,
      setHoveredFoul,
    ],
  );

  const cancelMarking = useCallback(() => {
    setActiveMenu("none");
    clearHoverStates();
  }, [setActiveMenu, clearHoverStates]);

  const commitMarking = useCallback(
    (menu: MarkingMenuType) => {
      if (menu === "skill") {
        const hSkill = hoveredSkillRef.current;
        const hDesc = hoveredDescriptorRef.current;
        if (hSkill) {
          commitSkillSelection({
            skillCode: hSkill,
            descriptorGroupId: hDesc?.groupId,
            descriptorCode: hDesc?.optionCode
          });
        }
      } else if (menu === "area") {
        const hArea = hoveredAreaRef.current;
        if (hArea && selectArea) {
          selectArea(hArea);
        }
      } else if (menu === "foul") {
        const hFoul = hoveredFoulRef.current;
        if (hFoul) {
          const foulDef = sportTemplate?.fouls?.find((f: any) => f.code === hFoul);
          if (foulDef && typeof selectFoul === 'function') {
             selectFoul(foulDef);
          } else if (typeof updateActionField === 'function') {
             updateActionField("foulCode", hFoul);
          }
        }
      } else if (menu === "result") {
        const hDetail = hoveredResultDetailRef.current;
        const hResult = hoveredResultRef.current;
        const detail = resolveVolleyballGrade(selectedSkill ?? undefined, hDetail ?? undefined);
        if (detail) {
          commitResult(detail.resultCode, settings.fastMode, detail.code);
        } else if (hResult) {
          commitResult(hResult, settings.fastMode);
        }
      } else if (menu === "team") {
        const hTeam = hoveredTeamRef.current;
        if (hTeam) {
          updateActionField("teamCode", hTeam);
        }
      }
      setActiveMenu("none");
      clearHoverStates();
    },
    [
      settings.fastMode,
      updateActionField,
      commitResult,
      setActiveMenu,
      clearHoverStates,
      commitSkillSelection,
      selectArea,
      selectFoul,
      sportTemplate?.fouls,
      selectedSkill,
    ],
  );

  const commitActiveMarking = useCallback(() => {
    commitMarking(activeMenuRef.current);
  }, [commitMarking]);

  const handleCoachCommand = useCallback((command: CoachCommand) => {
    return dispatchCoachCommand(command, {
      selectTeam: (teamIndex) => {
        const team = teams[teamIndex];
        if (!team) return;
        updateActionField("teamCode", team.code);
        setHoveredTeam(team.code);
        setActiveMenu("none");
      },
      openMenu: (menu) => {
        if (isHoldMode) openMarkingMenu(menu);
        else toggleMarkingMenu(menu);
      },
      cancelContext: () => {
        if (activeMenuRef.current !== "none") cancelMarking();
        else onCloseHUD();
      },
    });
  }, [
    cancelMarking,
    isHoldMode,
    onCloseHUD,
    openMarkingMenu,
    setActiveMenu,
    setHoveredTeam,
    teams,
    toggleMarkingMenu,
    updateActionField,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLElement &&
        (activeEl.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName))
      ) {
        return;
      }
      if (Boolean(document.querySelector('[role="dialog"]')) || Boolean(document.querySelector('.modal'))) {
        return;
      }

      isHoldingKeyRef.current[e.code] = true;
      const command = resolveKeyboardCoachCommand(
        e,
        resolveCoachInputContext({ activeWheel: activeMenuRef.current !== "none", hudActive: true }),
      );
      if (command && ['selectTeam', 'openMenu', 'cancelContext'].includes(command.type)) {
        e.preventDefault();
        handleCoachCommand(command);
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code) && settings.enableArrowAreaNavigation) {
        if (activeMenuRef.current === "area") {
            e.preventDefault();
            const areaBtns = Array.from(document.querySelectorAll('[data-scout-hover-area]')) as HTMLElement[];
            if (areaBtns.length > 0) {
                const currentCode = hoveredAreaRef.current?.code;
                let targetIdx = 0;
                if (currentCode) {
                  const currentIdx = areaBtns.findIndex(b => b.getAttribute("data-scout-hover-area") === currentCode);
                  if (currentIdx !== -1) {
                      if (e.code === "ArrowRight" || e.code === "ArrowDown") targetIdx = (currentIdx + 1) % areaBtns.length;
                      if (e.code === "ArrowLeft" || e.code === "ArrowUp") targetIdx = (currentIdx - 1 + areaBtns.length) % areaBtns.length;
                  }
                }
                const targetBtn = areaBtns[targetIdx];
                if (targetBtn) {
                   const code = targetBtn.getAttribute("data-scout-hover-area")!;
                   const courtSide = targetBtn.getAttribute("data-scout-hover-court-side") || undefined;
                   setHoveredArea({ areaCode: code, courtSide: courtSide as AreaSelectionPayload['courtSide'] });
                   if (settings.areaAutoSelectOnArrow) {
                      if (selectArea) {
                        selectArea({ areaCode: code, courtSide: courtSide as AreaSelectionPayload['courtSide'] });
                      } else {
                        updateActionField("areaCode", code);
                        if (courtSide) updateActionField("courtSide", courtSide);
                      }
                   }
                }
            }
        }
      }

    },
    [
      handleCoachCommand,
      settings.enableArrowAreaNavigation,
      settings.areaAutoSelectOnArrow,
      selectArea,
      setHoveredArea,
    ],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      isHoldingKeyRef.current[e.code] = false;

      if (!isHoldMode) return;

      const commandMenu = getHudMenuForKeyboardCode(e.code);
      if (commandMenu && activeMenuRef.current === commandMenu) {
        commitMarking(commandMenu);
      }
    },
    [isHoldMode, commitMarking],
  );

  return {
    activeMenu,
    setActiveMenu,
    pointerPosition,
    hoveredSkill,
    hoveredDescriptor,
    hoveredArea,
    hoveredResult,
    hoveredResultDetail,
    hoveredTeam,
    hoveredFoul,
    setHoveredSkill,
    setHoveredDescriptor,
    setHoveredArea,
    setHoveredResult,
    setHoveredResultDetail,
    setHoveredTeam,
    setHoveredFoul,
    previewSkill,
    bindHoverItem,
    handleKeyDown,
    handleKeyUp,
    handlePointerMove,
    handleCoachCommand,
    cancelMarking,
    commitMarking,
    commitActiveMarking,
    isHoldMode,
  };
}
