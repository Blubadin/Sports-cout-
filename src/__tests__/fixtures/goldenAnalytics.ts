import type { Action, EventRow, SportType, Team } from "../../types";
import { SPORT_TEMPLATES } from "../../sports";

export const goldenTeams: Team[] = [
  { id: "gold-a", code: "A", name: "Alpha", thaiName: "อัลฟา", teamType: "club" },
  { id: "gold-b", code: "B", name: "Bravo", thaiName: "บราโว", teamType: "club" },
];

const SPORTS: SportType[] = ["volleyball", "football", "badminton", "basketball"];

function getDetailedArea(sport: SportType, fallback: string): string {
  if (sport === "football") return "F-1-2";
  if (sport === "volleyball") return `${fallback}-1`;
  return fallback;
}

export function createGoldenSportEvents(sport: SportType): EventRow[] {
  const template = SPORT_TEMPLATES[sport];
  const foulCode = template.fouls?.[0]?.code;
  const knownAreas = template.areas.filter(item => !["OUT", "UNKNOWN", "NET_ERR"].includes(item.code));

  return Array.from({ length: 20 }, (_, index) => {
    const resultCode = index % 4 < 2 ? "Yes" : index % 4 === 2 ? "Out" : "Pass";
    const resultText = resultCode === "Yes" ? "+1" : resultCode === "Out" ? "-1" : "0";
    const area = knownAreas[index % knownAreas.length]?.code ?? template.areas[0]?.code ?? "UNKNOWN";
    const action: Action = {
      id: `${sport}-action-${index + 1}`,
      teamCode: index % 2 === 0 ? "A" : "B",
      skillCode: template.skills[index % template.skills.length]?.code,
      resultCode,
      videoTime: index * 7 + 1,
    };

    if (index < 5) {
      Object.assign(action, {
        areaCode: area,
        pointX: 0.2 + index * 0.1,
        pointY: 0.3 + index * 0.05,
        areaMode: "point",
        areaResolution: "point",
      });
    } else if (index < 10) {
      Object.assign(action, {
        areaCode: getDetailedArea(sport, area),
        areaMode: "detailed",
        areaResolution: "detailed",
      });
    } else if (index < 15) {
      Object.assign(action, { areaCode: area, areaMode: "normal", areaResolution: "normal" });
    } else if (index < 18) {
      Object.assign(action, {
        areaCode: "OUT",
        outZone: sport === "football" ? "left_touchline_mid" : "side_left_near",
        areaResolution: "out-zone",
      });
    }

    if ((index === 4 || index === 9) && foulCode) {
      action.foulCode = foulCode;
      action.foulSeverity = template.fouls?.[0]?.severity;
    }

    return {
      id: `${sport}-event-${index + 1}`,
      no: index + 1,
      point: index + 1,
      sportType: sport,
      actions: [action],
      eventText: `${action.teamCode} / ${action.skillCode} / ${action.areaCode ?? ""} / ${resultCode}`,
      resultText,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      videoTime: index * 7,
    };
  });
}

export const goldenAnalyticsEvents: EventRow[] = SPORTS.flatMap(createGoldenSportEvents);
