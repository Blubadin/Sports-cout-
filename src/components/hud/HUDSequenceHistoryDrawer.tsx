import React, { useState, useMemo, useEffect, useRef } from "react";
import { EventRow, Action } from "../../types";
import { useScoutContext } from "../../context/ScoutContext";
import {
  X,
  Undo2,
  Trash2,
  Save,
  Play,
  Clock,
  Clapperboard,
  Copy,
  Filter,
  RotateCcw,
  Star,
} from "lucide-react";
import { formatPreciseTime } from "../../utils";
import BookmarkClipModal from "../BookmarkClipModal";
import type { ControllerHistoryCommand } from "../../controller/controllerHudBridge";
import { t } from "../../i18n";
import { getEventTimestamp } from "../../utils/eventQuery";

type HUDSequenceHistoryDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  events: EventRow[];
  currentActions: Action[];
  currentAction: Action;
  onUndo: () => void;
  onClearCurrent: () => void;
  onSaveCurrent: () => void;
  onGoToTime: (videoTime: number) => void;
  onReplaySegment: (event: EventRow) => void;
  onCopyEvent: (event: EventRow) => void;
  controllerCommand?: { id: number; command: ControllerHistoryCommand } | null;
};

export default function HUDSequenceHistoryDrawer({
  isOpen,
  onClose,
  events,
  currentActions,
  currentAction,
  onUndo,
  onClearCurrent,
  onSaveCurrent,
  onGoToTime,
  onReplaySegment,
  onCopyEvent,
  controllerCommand,
}: HUDSequenceHistoryDrawerProps) {
  const { getActionText, sportTemplate, teams, deleteEventRow, settings, videoTime, toggleEventBookmark, showToast } = useScoutContext();
  const [activeTab, setActiveTab] = useState<"rally" | "recent" | "bookmarks" | "filter">(
    "rally",
  );
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [replayClipEvent, setReplayClipEvent] = useState<EventRow | null>(null);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const eventListRef = useRef<HTMLDivElement>(null);
  const selectedEventRef = useRef<HTMLDivElement>(null);
  const lastControllerCommandIdRef = useRef<number | null>(null);

  // Format full sequence string with arrows
  const formatEventSequence = (event: EventRow) => {
    if (event.actions && event.actions.length > 0) {
      return event.actions
        .map((act) => {
          return [act.teamCode, act.skillCode, ...(act.descriptors ? Object.values(act.descriptors) : []), act.areaCode, act.resultCode, act.foulCode]
            .filter(Boolean)
            .join("/");
        })
        .join(" → ");
    }
    return event.eventText;
  };

  // Helper to determine score text
  const getEventPointLabel = (event: EventRow) => {
    if (event.point === 1 || event.point === 2) return "+1";
    if (event.point === -1) return "-1";
    return "0";
  };

  const getResultBadgeColor = (result?: string) => {
    if (!result) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    if (result === "Yes")
      return "bg-green-500/20 text-green-400 border-green-500/30";
    if (result === "Out") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-sky-500/20 text-sky-400 border-sky-500/30"; // Pass
  };

  const handleToggleBookmark = (event: EventRow) => {
    const willBookmark = !event.isBookmarked;
    toggleEventBookmark(event.id);
    showToast(
      willBookmark
        ? t('keyMoments.savedToast', settings.uiLanguage)
        : t('keyMoments.removedToast', settings.uiLanguage)
    );
  };

  // Memoized filters
  const filterOptions = useMemo(() => {
    const teamsList = teams || [];
    const t1 = teamsList[0]?.code || "TeamA";
    const t2 = teamsList[1]?.code || "TeamB";

    return [
      { id: "all", label: t('history.allEvents', settings.uiLanguage) },
      { id: "yes", label: `${t('input.result', settings.uiLanguage)}: Yes` },
      { id: "out", label: `${t('input.result', settings.uiLanguage)}: Out` },
      { id: "pass", label: `${t('input.result', settings.uiLanguage)}: Pass` },
      { id: `team-${t1}`, label: `${t('input.team', settings.uiLanguage)}: ${t1}` },
      { id: `team-${t2}`, label: `${t('input.team', settings.uiLanguage)}: ${t2}` },
      { id: "long-rally", label: t('history.longRally', settings.uiLanguage) },
      {
        id: "current-skill",
        label: `${t('input.skill', settings.uiLanguage)}: ${currentAction.skillCode || t('history.none', settings.uiLanguage)}`,
      },
      {
        id: "current-area",
        label: `${t('input.area', settings.uiLanguage)}: ${currentAction.areaCode || t('history.none', settings.uiLanguage)}`,
      },
    ];
  }, [teams, currentAction, settings.uiLanguage]);

  const filteredEvents = useMemo(() => {
    const sorted = [...events].reverse(); // Most recent first

    if (activeTab === "recent") {
      return sorted.slice(0, 20);
    }

    if (activeTab === "bookmarks") {
      return sorted.filter((e) => e.isBookmarked);
    }

    if (selectedFilter === "all") return sorted;
    if (selectedFilter === "yes")
      return sorted.filter(
        (e) => e.actions && e.actions.some((a) => a.resultCode === "Yes"),
      );
    if (selectedFilter === "out")
      return sorted.filter(
        (e) => e.actions && e.actions.some((a) => a.resultCode === "Out"),
      );
    if (selectedFilter === "pass")
      return sorted.filter(
        (e) => e.actions && e.actions.some((a) => a.resultCode === "Pass"),
      );

    if (selectedFilter.startsWith("team-")) {
      const tCode = selectedFilter.replace("team-", "");
      return sorted.filter(
        (e) => e.actions && e.actions.some((a) => a.teamCode === tCode),
      );
    }

    if (selectedFilter === "long-rally") {
      return sorted.filter((e) => e.actions && e.actions.length >= 3);
    }

    if (selectedFilter === "current-skill") {
      if (!currentAction.skillCode) return [];
      return sorted.filter(
        (e) =>
          e.actions &&
          e.actions.some((a) => a.skillCode === currentAction.skillCode),
      );
    }

    if (selectedFilter === "current-area") {
      if (!currentAction.areaCode) return [];
      return sorted.filter(
        (e) =>
          e.actions &&
          e.actions.some((a) => a.areaCode === currentAction.areaCode),
      );
    }

    return sorted;
  }, [events, activeTab, selectedFilter, currentAction]);

  useEffect(() => {
    setSelectedEventIndex((index) => Math.max(0, Math.min(index, filteredEvents.length - 1)));
  }, [filteredEvents.length]);

  useEffect(() => {
    if (!isOpen || !controllerCommand) return;
    if (lastControllerCommandIdRef.current === controllerCommand.id) return;
    lastControllerCommandIdRef.current = controllerCommand.id;
    const tabs: Array<typeof activeTab> = ["rally", "recent", "bookmarks", "filter"];
    const tabIndex = tabs.indexOf(activeTab);
    switch (controllerCommand.command) {
      case "previous-tab":
        setActiveTab(tabs[(tabIndex - 1 + tabs.length) % tabs.length]);
        setSelectedEventIndex(0);
        break;
      case "next-tab":
        setActiveTab(tabs[(tabIndex + 1) % tabs.length]);
        setSelectedEventIndex(0);
        break;
      case "previous-item":
        setSelectedEventIndex((index) => Math.max(0, index - 1));
        break;
      case "next-item":
        setSelectedEventIndex((index) => Math.min(Math.max(0, filteredEvents.length - 1), index + 1));
        break;
      case "confirm":
        if (activeTab === "rally") onSaveCurrent();
        else if (filteredEvents[selectedEventIndex]) onReplaySegment(filteredEvents[selectedEventIndex]);
        break;
      case "scroll-up":
        eventListRef.current?.scrollBy({ top: -140, behavior: "smooth" });
        break;
      case "scroll-down":
        eventListRef.current?.scrollBy({ top: 140, behavior: "smooth" });
        break;
      case "close":
        onClose();
        break;
    }
  }, [activeTab, controllerCommand, filteredEvents, isOpen, onClose, onReplaySegment, onSaveCurrent, selectedEventIndex]);

  useEffect(() => {
    selectedEventRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedEventIndex, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 z-[100] w-full max-w-[360px] md:max-w-[420px] bg-black/90 backdrop-blur-xl border-l border-white/10 flex flex-col pointer-events-auto text-white shadow-2xl animate-in slide-in-from-right duration-300 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-sky-400" />
          <h2 className="font-bold text-base uppercase tracking-wider">
            {t('history.title', settings.uiLanguage)}
          </h2>
          <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/70">
            {events.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors active:scale-90 active:bg-white/20"
          title={t('history.close', settings.uiLanguage)}
        >
          <X size={20} />
        </button>
      </div>

      {/* Tabs bar */}
      <div className="flex border-b border-white/10 bg-white/5 p-1 gap-1" role="tablist" aria-label={t('history.title', settings.uiLanguage)}>
        <button
          role="tab"
          aria-selected={activeTab === "rally"}
          onClick={() => setActiveTab("rally")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all relative active:scale-95 ${
            activeTab === "rally"
              ? "bg-sky-500 text-white shadow"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          {t('history.currentRally', settings.uiLanguage)}
          {currentActions.length > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 bg-amber-500 rounded-full animate-ping" />
          )}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "recent"}
          onClick={() => setActiveTab("recent")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 ${
            activeTab === "recent"
              ? "bg-sky-500 text-white shadow"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          {t('history.recent', settings.uiLanguage)} (20)
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "bookmarks"}
          onClick={() => setActiveTab("bookmarks")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 active:scale-95 ${
            activeTab === "bookmarks"
              ? "bg-amber-500 text-white shadow"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <Star size={12} />
          {t('keyMoments.title', settings.uiLanguage)}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "filter"}
          onClick={() => setActiveTab("filter")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 active:scale-95 ${
            activeTab === "filter"
              ? "bg-sky-500 text-white shadow"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <Filter size={12} />
          {t('history.filters', settings.uiLanguage)}
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "rally" && (
          <div className="space-y-4 flex flex-col h-full">
            {/* Rally list */}
            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              {currentActions.length === 0 &&
              !currentAction.teamCode &&
              !currentAction.skillCode &&
              !currentAction.areaCode ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-white/40 py-12 space-y-2">
                  <RotateCcw
                    size={32}
                    className="opacity-20 animate-spin-slow"
                  />
                  <p className="text-sm">{t('history.noCurrentSequence', settings.uiLanguage)}</p>
                  <p className="text-[11px]">
                    {t('history.buildSequence', settings.uiLanguage)}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1 flex justify-between items-center">
                    <span>{t('history.currentSequence', settings.uiLanguage)}</span>
                    {currentActions.length > 0 && currentActions[0].videoTime !== undefined && (
                      <span className="text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock size={10} />
                        {Math.max(0, videoTime - currentActions[0].videoTime).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  {currentActions.map((act, idx) => (
                    <div
                      key={`${act.id || ""}-${idx}`}
                      className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-sky-400 font-bold bg-sky-500/10 px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm tracking-wide">
                            {[
                              act.teamCode,
                              act.skillCode,
                              ...(act.descriptors ? Object.values(act.descriptors) : []),
                              act.areaCode,
                              act.resultCode, act.foulCode,
                            ]
                              .filter(Boolean)
                              .join(" / ")}
                          </span>
                          <button
                            type="button"
                            onClick={() => act.videoTime !== undefined && onGoToTime(act.videoTime)}
                            disabled={act.videoTime === undefined}
                            className="text-left text-xs text-white/40 font-mono hover:text-sky-300 disabled:cursor-default disabled:hover:text-white/40"
                            title={t('table.jumpToTime', settings.uiLanguage)}
                          >
                            {act.videoTime !== undefined
                              ? formatPreciseTime(act.videoTime)
                              : "00:00.00"}
                          </button>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full border border-white/20 bg-white/5 text-white/60">
                        {act.resultCode || "Pass"}
                      </span>
                    </div>
                  ))}

                  {/* Current ongoing composing action */}
                  {(currentAction.teamCode ||
                    currentAction.skillCode ||
                    currentAction.areaCode ||
                    currentAction.foulCode) && (
                    <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 space-y-2 animate-pulse">
                      <div className="text-xs uppercase font-bold text-sky-400">
                        {t('history.composing', settings.uiLanguage)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold ${currentAction.teamCode ? "bg-sky-500 text-white" : "bg-black/40 text-white/30 border border-white/5"}`}
                        >
                          {currentAction.teamCode || "Team"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold ${currentAction.skillCode ? "bg-sky-500 text-white" : "bg-black/40 text-white/30 border border-white/5"}`}
                        >
                          {currentAction.skillCode || "Skill"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold ${currentAction.areaCode ? "bg-sky-500 text-white" : "bg-black/40 text-white/30 border border-white/5"}`}
                        >
                          {currentAction.areaCode || "Area"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold ${currentAction.resultCode ? "bg-sky-500 text-white" : "bg-black/40 text-white/30 border border-white/5"}`}
                        >
                          {currentAction.resultCode || "Result"}
                        </span>
                        {currentAction.foulCode && (
                          <span
                            className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500 text-white shadow"
                          >
                            {currentAction.foulCode}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions Footer inside tab */}
            {(currentActions.length > 0 ||
              currentAction.teamCode ||
              currentAction.skillCode) && (
              <div className="pt-4 border-t border-white/10 grid grid-cols-3 gap-2">
                <button
                  onClick={onUndo}
                  className="py-2.5 px-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold flex flex-col items-center gap-1 hover:bg-white/10 active:scale-95 transition-all text-white/80 hover:text-white"
                  title={t('history.undoLast', settings.uiLanguage)}
                >
                  <Undo2 size={16} />
                  <span>{t('history.undoLast', settings.uiLanguage)}</span>
                </button>
                <button
                  onClick={onClearCurrent}
                  className="py-2.5 px-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold flex flex-col items-center gap-1 hover:bg-red-500/20 active:scale-95 transition-all text-red-400"
                  title={t('history.clearRally', settings.uiLanguage)}
                >
                  <Trash2 size={16} />
                  <span>{t('history.clearRally', settings.uiLanguage)}</span>
                </button>
                <button
                  onClick={onSaveCurrent}
                  className="py-2.5 px-2 bg-green-500/20 border border-green-500/30 rounded-lg text-xs font-bold flex flex-col items-center gap-1 hover:bg-green-500/30 active:scale-95 transition-all text-green-400"
                  title={t('input.saveEvent', settings.uiLanguage)}
                >
                  <Save size={16} />
                  <span>{t('input.saveEvent', settings.uiLanguage)}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {(activeTab === "recent" || activeTab === "bookmarks" || activeTab === "filter") && (
          <div className="space-y-4 flex flex-col h-full">
            {activeTab === "filter" && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1">
                  {t('history.filterEvents', settings.uiLanguage)}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-1 border border-white/5 rounded-lg bg-black/40">
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedFilter(opt.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                        selectedFilter === opt.id
                          ? "bg-sky-500 border-sky-400 text-white"
                          : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 active:bg-white/20"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={eventListRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="flex justify-between items-center text-xs uppercase tracking-wider text-white/50 font-bold mb-1">
                <span>
                  {activeTab === "filter"
                    ? t('history.filteredResults', settings.uiLanguage)
                    : activeTab === "bookmarks"
                      ? t('keyMoments.title', settings.uiLanguage)
                    : t('history.recentSaved', settings.uiLanguage)}
                </span>
                <span className="font-mono text-white/40">
                  ({filteredEvents.length})
                </span>
              </div>

              {filteredEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-white/40 py-12">
                  <p className="text-sm">{t('history.noData', settings.uiLanguage)}</p>
                </div>
              ) : (
                filteredEvents.map((evt, idx) => (
                  <div
                    key={`${evt.id}-${idx}`}
                    ref={idx === selectedEventIndex ? selectedEventRef : undefined}
                    data-controller-selected={idx === selectedEventIndex}
                    className={`rounded-xl p-3.5 space-y-3.5 transition-all hover:scale-[1.01] ${
                      idx === selectedEventIndex
                        ? "bg-sky-500/15 border-2 border-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.18)]"
                        : "bg-white/5 hover:bg-white/10 border border-white/10"
                    }`}
                  >
                    {/* Event top info */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold bg-white/10 text-white/80 px-1.5 py-0.5 rounded-lg">
                          No.{evt.no}
                        </span>
                        {(() => {
                          const lastAction =
                            evt.actions && evt.actions.length > 0
                              ? evt.actions[evt.actions.length - 1]
                              : null;
                          const rCode = lastAction
                             ? lastAction.resultCode
                            : evt.resultText === "+1"
                              ? "Yes"
                              : evt.resultText === "-1"
                                ? "Out"
                                : "Pass";
                          return (
                            <span
                              className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${getResultBadgeColor(rCode)}`}
                            >
                              {rCode || "Pass"}
                            </span>
                          );
                        })()}
                        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-lg">
                          Point: {getEventPointLabel(evt)}
                        </span>
                        {evt.isBookmarked && (
                          <span className="text-xs font-bold text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                            <Star size={10} fill="currentColor" />
                            {t('keyMoments.saved', settings.uiLanguage)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end text-xs font-mono">
                        {(evt.sequenceStartTime !== undefined && evt.sequenceEndTime !== undefined && evt.duration !== undefined) ? (
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1 text-sky-400">
                              <Clock size={12} />
                              <span>{formatPreciseTime(evt.sequenceStartTime)} - {formatPreciseTime(evt.sequenceEndTime)}</span>
                            </div>
                            <span className="text-[10px] text-white/40">Duration: {evt.duration.toFixed(2)}s</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-white/50">
                            <Clock size={12} />
                            <span>
                              {evt.videoTime !== undefined
                                ? formatPreciseTime(evt.videoTime)
                                : "00:00.00"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sequence code block */}
                    <div className="bg-black/30 p-2 rounded-lg border border-white/5 text-xs font-semibold leading-relaxed break-words whitespace-pre-wrap font-mono tracking-wide text-sky-200">
                      {formatEventSequence(evt)}
                    </div>

                    {evt.note && (
                      <p className="text-xs text-white/40 italic pl-1 border-l border-white/20">
                        Note: {evt.note}
                      </p>
                    )}

                    {/* Actions row */}
                    <div className="flex flex-wrap gap-1.5 justify-end pt-1">
                      {evt.videoSourceType === "local" && (
                        <button
                          onClick={() => setReplayClipEvent(evt)}
                          className="h-7 w-7 shrink-0 rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 active:scale-95 transition-all inline-flex items-center justify-center"
                          title={t('keyMoments.openReplay', settings.uiLanguage)}
                          aria-label={t('keyMoments.openReplay', settings.uiLanguage)}
                        >
                          <Clapperboard size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleBookmark(evt)}
                        className={`px-2 py-1.5 rounded-lg active:scale-95 transition-all inline-flex items-center gap-1 text-[11px] font-bold border ${
                          evt.isBookmarked
                            ? "bg-amber-500/25 text-amber-300 hover:bg-amber-500/40 border-amber-500/30"
                            : "bg-white/5 text-white/80 hover:bg-amber-500/15 hover:text-amber-300 border-white/10"
                        }`}
                        title={evt.isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
                      >
                        <Star size={10} fill={evt.isBookmarked ? "currentColor" : "none"} />
                        {evt.isBookmarked ? t('keyMoments.saved', settings.uiLanguage) : t('keyMoments.addShort', settings.uiLanguage)}
                      </button>
                      <button
                        onClick={() => onReplaySegment(evt)}
                        className="px-2 py-1.5 rounded-lg bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 active:scale-95 active:bg-sky-500/40 transition-all inline-flex items-center gap-1 text-[11px] font-bold"
                        title={t('keyMoments.openReplay', settings.uiLanguage)}
                      >
                        <Play size={10} className="fill-current" />
                        {t('keyMoments.play', settings.uiLanguage)}
                      </button>
                      <button
                        onClick={() => onGoToTime(getEventTimestamp(evt) ?? 0)}
                        className="px-2 py-1.5 rounded-lg bg-white/5 text-white/80 hover:bg-white/10 hover:text-white active:scale-95 active:bg-white/15 transition-all inline-flex items-center gap-1 text-[11px] font-bold"
                        title={t('table.jumpToTime', settings.uiLanguage)}
                      >
                        <Clock size={10} />
                        {t('history.time', settings.uiLanguage)}
                      </button>
                      <button
                        onClick={() => onCopyEvent(evt)}
                        className="px-2 py-1.5 rounded-lg bg-white/5 text-white/80 hover:bg-white/10 hover:text-white active:scale-95 active:bg-white/15 transition-all inline-flex items-center gap-1 text-[11px] font-bold"
                        title={t('history.copyEvent', settings.uiLanguage)}
                      >
                        <Copy size={10} />
                        {t('history.copy', settings.uiLanguage)}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(settings?.uiLanguage === 'th' ? `ต้องการลบซีเควนซ์ที่ ${evt.no} หรือไม่?` : `Do you want to delete sequence #${evt.no}?`)) {
                            deleteEventRow(evt.id);
                          }
                        }}
                        className="px-2 py-1.5 rounded-lg bg-red-500/25 text-red-300 hover:bg-red-500/40 active:scale-95 transition-all inline-flex items-center gap-1 text-[11px] font-bold border border-red-500/30 cursor-pointer"
                        title={t('history.deleteEvent', settings.uiLanguage)}
                      >
                        <Trash2 size={10} />
                        {t('history.delete', settings.uiLanguage)}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {replayClipEvent && (
        <BookmarkClipModal
          event={replayClipEvent}
          onClose={() => setReplayClipEvent(null)}
        />
      )}
    </div>
  );
}
