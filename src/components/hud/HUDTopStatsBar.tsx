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
  Clock,
  EyeOff,
  Bot,
  Crosshair,
} from "lucide-react";
import { formatPreciseTime } from "../../utils";
import { useAITracking } from "../../hooks/useAITracking";

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

  const {
    isConnected: isAIConnected,
    isConnecting: isAIConnecting,
    players: aiPlayers,
    toggleConnect,
    gameType,
    toggleGameType,
    isMarkingMode,
    markingStep,
    totalMarkingSteps,
    startMarkingMode,
    cancelMarkingMode,
  } = useAITracking();

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
      bg: "bg-sky-600",
    },
    { id: "football", code: "FOOT", label: "Football", bg: "bg-green-600" },
    { id: "badminton", code: "BAD", label: "Badminton", bg: "bg-sky-600" },
    { id: "basketball", code: "BASK", label: "BASK", bg: "bg-amber-600" },
  ];
  const currentSport =
    sportsList.find((s) => s.id === matchInfo.sportType) || sportsList[0];

  const isLocked = events.length > 0;

  React.useEffect(() => {
    if (isLocked && showSportSelector) {
      setShowSportSelector(false);
    }
  }, [isLocked, showSportSelector]);

  return (
    <div className="flex items-center justify-between text-white drop-shadow-md w-full gap-2 relative">
      {/* Left: Stats */}
      <div className="flex items-center gap-2 text-xs font-medium flex-1 overflow-visible relative">
        <button
          onClick={() => !isLocked && setShowSportSelector(!showSportSelector)}
          disabled={isLocked}
          className={`flex items-center gap-1 ${currentSport.bg}/80 hover:opacity-90 active:scale-95 backdrop-blur px-2.5 sm:px-3 py-1.5 rounded-full border border-white/20 shadow-md transition-all font-black uppercase text-xs tracking-wider ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isLocked ? (settings.uiLanguage === 'th' ? `ล็อกกีฬาไว้แล้วเพราะมีข้อมูลบันทึกอยู่ ${events.length} รายการ ต้องการเปลี่ยนกีฬา ให้สร้างโปรเจคใหม่` : `Sport locked because ${events.length} events are recorded. Create a new project to change sport.`) : "Change Sport"}
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
      <div className="flex flex-col items-center justify-center flex-1 pointer-events-auto">
        {settings.hudShowVideoTime !== false ? (
          <button
            type="button"
            onClick={() =>
              setSettings((s) => ({ ...s, hudShowVideoTime: false }))
            }
            className="group relative flex items-center gap-1.5 font-mono text-sm sm:text-xl font-bold tracking-wider drop-shadow-lg text-center px-2.5 py-0.5 rounded-lg hover:bg-black/50 border border-transparent hover:border-white/20 active:scale-95 transition-all cursor-pointer"
            title={
              settings.uiLanguage === "th"
                ? "คลิกเพื่อซ่อนเวลาคลิป (สามารถคลิกเปิดคืนได้ตลอดเวลา หรือในหน้าตั้งค่า)"
                : "Click to hide video time (can re-enable anytime or in settings)"
            }
          >
            <span>{formatPreciseTime(videoControls.getCurrentTime())}</span>
            <EyeOff
              size={14}
              className="text-white/40 group-hover:text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              setSettings((s) => ({ ...s, hudShowVideoTime: true }))
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white bg-black/40 hover:bg-black/60 px-2.5 py-1 rounded-full border border-white/15 active:scale-95 transition-all shadow-sm cursor-pointer"
            title={
              settings.uiLanguage === "th"
                ? "คลิกเพื่อแสดงเวลาคลิป"
                : "Click to show video timestamp"
            }
          >
            <Clock size={13} className="text-sky-400" />
            <span className="text-[11px] font-sans">
              {settings.uiLanguage === "th" ? "แสดงเวลาคลิป" : "Show Time"}
            </span>
          </button>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 flex-1 pointer-events-auto">
        {/* AI Auto-Tracking Buttons (Badminton) */}
        {matchInfo.sportType === "badminton" && (
          <>
            {/* Badminton Game Type: Singles (2P) vs Doubles (4P) Toggle */}
            <button
              type="button"
              onClick={toggleGameType}
              className={`px-2 sm:px-2.5 py-1.5 rounded-full backdrop-blur transition-all text-[11px] sm:text-xs font-bold tracking-wider flex items-center gap-1 shadow-md active:scale-95 border cursor-pointer ${
                gameType === "singles"
                  ? "bg-amber-600/85 hover:bg-amber-500 border-amber-400 text-white shadow-amber-500/20"
                  : "bg-indigo-600/85 hover:bg-indigo-500 border-indigo-400 text-white shadow-indigo-500/20"
              }`}
              title={
                settings.uiLanguage === "th"
                  ? `รูปแบบการเล่น: ${gameType === "singles" ? "ประเภทเดี่ยว (Singles 2 คน)" : "ประเภทคู่ (Doubles 4 คน)"} คลิกเพื่อสลับ`
                  : `Format: ${gameType === "singles" ? "Singles (2 Players)" : "Doubles (4 Players)"}. Click to toggle.`
              }
            >
              <span>{gameType === "singles" ? "🏸 1v1 เดี่ยว" : "🏸 2v2 คู่"}</span>
            </button>

            <button
              type="button"
              onClick={toggleConnect}
              className={`px-2.5 py-1.5 rounded-full backdrop-blur transition-all text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-md active:scale-95 border cursor-pointer ${
                isAIConnected
                  ? "bg-emerald-600/90 hover:bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/30"
                  : isAIConnecting
                  ? "bg-amber-600/90 hover:bg-amber-500 border-amber-400 text-white animate-pulse"
                  : "bg-black/40 hover:bg-white/20 border-white/20 text-white/70 hover:text-white"
              }`}
              title={
                settings.uiLanguage === "th"
                  ? isAIConnected
                    ? `AI Video Tracking: กำลังทำงาน (${aiPlayers.length} คน) คลิกเพื่อปิด`
                    : isAIConnecting
                    ? "AI Video Tracking: กำลังเริ่มระบบ..."
                    : `AI Video Tracking: คลิกเพื่อเปิดแทร็กผู้เล่น ${gameType === "singles" ? "2 คน (เดี่ยว)" : "4 คน (คู่)"} ทับบนวิดีโอทันที`
                  : isAIConnected
                  ? `AI Tracking: Active (${aiPlayers.length} players). Click to stop.`
                  : isAIConnecting
                  ? "AI Tracking: Starting..."
                  : `AI Tracking: Click to start ${gameType === "singles" ? "2-player singles" : "4-player doubles"} tracking overlay directly on video`
              }
            >
              <Bot size={12} className={isAIConnected ? "text-emerald-200" : "text-gray-400"} />
              <span className="hidden xs:inline">
                {isAIConnected ? `AI (${aiPlayers.length || (gameType === "singles" ? 2 : 4)})` : isAIConnecting ? "AI..." : "AI"}
              </span>
            </button>

            {/* Click-to-Mark Players Button */}
            <button
              type="button"
              onClick={() => {
                if (isMarkingMode) {
                  cancelMarkingMode();
                } else {
                  startMarkingMode();
                }
              }}
              className={`px-2.5 py-1.5 rounded-full backdrop-blur transition-all text-xs font-bold tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 border cursor-pointer ${
                isMarkingMode
                  ? "bg-amber-500 hover:bg-amber-400 border-amber-300 text-slate-950 font-black animate-pulse shadow-amber-500/40"
                  : "bg-black/40 hover:bg-white/20 border-white/20 text-white/80 hover:text-white"
              }`}
              title={
                settings.uiLanguage === "th"
                  ? isMarkingMode
                    ? `โหมดมาร์กจุด: กำลังมาร์กผู้เล่นที่ ${markingStep + 1}/${totalMarkingSteps} (คลิกเพื่อยกเลิก)`
                    : "คลิกเพื่อมาร์กจุดตัวนักกีฬาบนคลิปวิดีโอ (Click to mark player positions on video)"
                  : isMarkingMode
                  ? `Marking Mode: Player ${markingStep + 1}/${totalMarkingSteps} (Click to cancel)`
                  : "Click to mark player positions on video"
              }
            >
              <Crosshair size={13} className={isMarkingMode ? "text-slate-950 animate-spin" : "text-amber-400"} />
              <span className="hidden xs:inline">
                {isMarkingMode
                  ? settings.uiLanguage === "th"
                    ? `มาร์ก ${markingStep + 1}/${totalMarkingSteps}`
                    : `Mark ${markingStep + 1}/${totalMarkingSteps}`
                  : settings.uiLanguage === "th"
                  ? "มาร์กจุด"
                  : "Mark"}
              </span>
            </button>
          </>
        )}

        {/* Interaction Mode Button */}
        <button
          onClick={() => {
            setSettings((prev) => ({
              ...prev,
              hudInteractionStyle:
                prev.hudInteractionStyle === "hold" ? "click" : "hold",
            }));
          }}
          className={`px-2.5 py-1.5 rounded-full backdrop-blur transition-all text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-md active:scale-95 border ${
            settings.hudInteractionStyle === "hold"
              ? "bg-sky-600/90 hover:bg-sky-500 border-sky-400 text-white"
              : "bg-green-600/90 hover:bg-green-500 border-green-400 text-white"
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
          className="px-2.5 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 active:scale-95 active:bg-sky-700 backdrop-blur transition-colors text-xs font-bold tracking-wider uppercase flex items-center gap-1 shadow-md"
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
          <span className="hidden sm:inline text-xs uppercase">
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
