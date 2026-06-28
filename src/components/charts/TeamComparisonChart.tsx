import React, { useMemo } from 'react';
import { SportType } from '../../types';

export default function TeamComparisonChart({ events, team1, team2 }: { events: any[], team1: string, team2: string }) {
  const stats = useMemo(() => {
    let t1Yes = 0, t1Out = 0, t1Pass = 0, t1Total = 0;
    let t2Yes = 0, t2Out = 0, t2Pass = 0, t2Total = 0;

    events.forEach(e => {
      e.actions?.forEach((a: any) => {
        if (a.teamCode === team1) {
          t1Total++;
          if (a.resultCode === 'Yes') t1Yes++;
          else if (a.resultCode === 'Out') t1Out++;
          else t1Pass++;
        } else if (a.teamCode === team2) {
          t2Total++;
          if (a.resultCode === 'Yes') t2Yes++;
          else if (a.resultCode === 'Out') t2Out++;
          else t2Pass++;
        }
      });
    });

    return { t1Yes, t1Out, t1Pass, t1Total, t2Yes, t2Out, t2Pass, t2Total };
  }, [events, team1, team2]);

  if (!team1 || !team2) return <div className="text-sm text-gray-500 text-center py-4">ต้องการข้อมูล 2 ทีมเพื่อเปรียบเทียบ</div>;

  return (
    <div className="flex flex-col gap-4 w-full">
      <h3 className="text-xs font-bold text-gray-500 uppercase">Team Comparison</h3>
      <div className="grid grid-cols-3 gap-2 text-sm text-center">
        <div className="font-bold text-sky-600">{team1}</div>
        <div className="text-gray-400">vs</div>
        <div className="font-bold text-emerald-600">{team2}</div>
        
        <div>{stats.t1Total}</div>
        <div className="text-xs text-gray-500">Actions</div>
        <div>{stats.t2Total}</div>
        
        <div className="text-green-600">{stats.t1Yes} ({(stats.t1Yes/Math.max(1, stats.t1Total)*100).toFixed(0)}%)</div>
        <div className="text-xs text-gray-500">Success</div>
        <div className="text-green-600">{stats.t2Yes} ({(stats.t2Yes/Math.max(1, stats.t2Total)*100).toFixed(0)}%)</div>

        <div className="text-red-600">{stats.t1Out} ({(stats.t1Out/Math.max(1, stats.t1Total)*100).toFixed(0)}%)</div>
        <div className="text-xs text-gray-500">Errors</div>
        <div className="text-red-600">{stats.t2Out} ({(stats.t2Out/Math.max(1, stats.t2Total)*100).toFixed(0)}%)</div>
      </div>
    </div>
  );
}
