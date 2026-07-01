import React from "react";
import { useScoutContext } from "../../context/ScoutContext";
import {
  Maximize,
  Minimize,
  X,
  Activity,
  RotateCcw,
  History,
  Hand,
  MousePointerClick,
} from "lucide-react";
import { formatPreciseTime } from "../../utils";

interface Props {
  videoControls: any;
  onClose: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  layoutMode: "auto" | "portrait" | "landscape";
  onToggleLayoutMode: () => void;
  onOpenHistoryDrawer: () => void;
}

export default function HUDTopStatsBar({
  videoControls,
  onClose,
  isFullscreen,
  toggleFullscreen,
  layoutMode,
  onToggleLayoutMode,
  onOpenHistoryDrawer,
}: Props) {
  const {
    events,
    currentActions,
    matchInfo,
    changeSportType,
    settings,
    setSettings,
  } = useScoutContext();

  const totalEvents = events.length;
  const currentRallyLength = currentActions.length;

  // Calculate Success Rate
  let successCount = 0;
  let errorCount = 0;
  events.forEach((e) => {
    if (e.resultText === "+1") successCount++;
    if (e.resultText === "-1") errorCount++;
  });
  const totalWithResult = successCount + errorCount;
  const successRate =
    totalWithResult > 0
      ? Math.round((successCount / totalWithResult) * 100)
      : 0;

  const lastEvent = events[0];
  const lastResult = lastEvent
    ? lastEvent.resultText === "+1"
      ? "Yes"
      : lastEvent.resultText === "-1"
        ? "Out"
        : "Pass"
    : "-";

  const [showSportSelector, setShowSportSelector] = React.useState(false);
  const sportsList = [
    {
      id: "volleyball",
      code: "VOLL",
      label: "Volleyball",
      bg: "bg-indigo-600",
    },
    { id: "football", code: "FOOT", label: "Football", bg: "bg-green-600" },
    { id: "badminton", code: "BAD", label: "Badminton", bg: "bg-teal-600" },
    { id: "basketball", code: "BASK", label: "BASK", bg: "bg-amber-600" },
  ];
  const currentSport =
    sportsList.find((s) => s.id === matchInfo.sportType) || sportsList[0];

  return (
    <div className="flex items-center justify-between text-white drop-shadow-md w-full gap-2 relative">
      {/* Left: Stats */}
      <div className="flex items-center gap-2 text-[10px] sm:text-xs font-medium flex-1 overflow-visible relative">
        <button
          onClick={() => setShowSportSelector(!showSportSelector)}
          className={`flex items-center gap-1 ${currentSport.bg}/80 hover:opacity-90 active:scale-95 backdrop-blur px-2.5 sm:px-3 py-1.5 rounded-full border border-white/20 shadow-md transition-all font-black uppercase text-[9px] sm:text-[10px] tracking-wider`}
          title="Change Sport"
        >
          <span>{currentSport.code}</span>
        </button>

        {showSportSelector && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowSportSelector(false)}
            />
            <div className="absolute top-10 left-0 bg-gray-950/95 border border-white/15 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 z-50 min-w-[120px] backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
              {sportsList.map((sport) => (
                <button
                  key={sport.id}
                  onClick={() => {
                    changeSportType(sport.id as any);
                    setShowSportSelector(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-between ${
                    matchInfo.sportType === sport.id
                      ? "bg-white/15 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>{sport.label}</span>
                  <span className={`w-2 h-2 rounded-full ${sport.bg}`} />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-1 sm:gap-2 bg-black/40 backdrop-blur px-2 sm:px-3 py-1.5 rounded-full border border-white/10 whitespace-nowrap">
          <Activity size={12} className="text-sky-400 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">Events: {totalEvents}</span>
          <span className="sm:hidden">{totalEvents} Evt</span>
          <span className="text-white/30">|</span>
          <span className="hidden sm:inline">Rally: {currentRallyLength}</span>
          <span className="sm:hidden">R: {currentRallyLength}</span>
        </div>

        <div className="hidden md:flex items-center gap-2 bg-black/40 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 whitespace-nowrap">
          <span className="text-green-400 font-bold">SR: {successRate}%</span>
          <span className="text-white/30">|</span>
          <span className="text-gray-300">Last: {lastResult}</span>
        </div>
      </div>

      {/* Center: Time & Speed */}
      <div className="flex flex-col items-center justify-center flex-1 pointer-events-none">
        <div className="font-mono text-sm sm:text-xl font-bold tracking-wider drop-shadow-lg text-center">
          {formatPreciseTime(videoControls.getCurrentTime())}
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 flex-1 pointer-events-auto">
        {/* Interaction Mode Button */}
        <button
          onClick={() => {
            setSettings((prev) => ({
              ...prev,
              hudInteractionStyle:
                prev.hudInteractionStyle === "hold" ? "click" : "hold",
            }));
          }}
          className={`px-2.5 py-1.5 rounded-full backdrop-blur transition-all text-[10px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-md active:scale-95 border ${
            settings.hudInteractionStyle === "hold"
              ? "bg-purple-600/90 hover:bg-purple-500 border-purple-400 text-white"
              : "bg-emerald-600/90 hover:bg-emerald-500 border-emerald-400 text-white"
          }`}
          title={
            settings.uiLanguage === "th"
              ? settings.hudInteractionStyle === "hold"
                ? "โหมดตอบสนอง: กดค้างลาก (คลิกเพื่อเปลี่ยนเป็น จิ้มเลือก)"
                : "โหมดตอบสนอง: จิ้มเลือกเปิดค้าง (คลิกเพื่อเปลี่ยนเป็น กดค้างลาก)"
              : settings.hudInteractionStyle === "hold"
                ? "Mode: Hold & Drag (Click to switch to Tap)"
                : "Mode: Tap & Select (Click to switch to Hold)"
          }
        >
          {settings.hudInteractionStyle === "hold" ? (
            <>
              <Hand size={12} />
              <span className="hidden xs:inline">HOLD</span>
            </>
          ) : (
            <>
              <MousePointerClick size={12} />
              <span className="hidden xs:inline">TAP</span>
            </>
          )}
        </button>

        {/* Sequence History Drawer Button */}
        <button
          onClick={onOpenHistoryDrawer}
          className="px-2.5 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 active:scale-95 active:bg-sky-700 backdrop-blur transition-colors text-[10px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-md"
          title="Open Sequence History Drawer"
        >
          <History size={12} />
          <span>SEQ</span>
        </button>

        {/* Rotate Layout Button */}
        <button
          onClick={onToggleLayoutMode}
          className={`p-1.5 sm:p-2 rounded-full backdrop-blur transition-all flex items-center gap-1.5 text-xs font-bold active:scale-95 ${
            layoutMode !== "auto"
              ? "bg-amber-500 text-black font-extrabold hover:bg-amber-400 active:bg-amber-600"
              : "bg-black/40 text-white hover:bg-white/20 active:bg-white/30"
          }`}
          title={`Layout Mode: ${layoutMode} (Click to toggle)`}
        >
          <RotateCcw size={14} className="animate-spin-slow" />
          <span className="hidden sm:inline text-[9px] uppercase">
            {layoutMode}
          </span>
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 sm:p-2 rounded-full bg-black/40 hover:bg-white/20 active:scale-95 active:bg-white/30 backdrop-blur transition-colors"
          title="Fullscreen"
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button
          onClick={onClose}
          className="p-1.5 sm:p-2 rounded-full bg-red-500/80 hover:bg-red-500 active:scale-95 active:bg-red-600 backdrop-blur transition-colors shadow-lg"
          title="Exit HUD Mode (Esc)"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
