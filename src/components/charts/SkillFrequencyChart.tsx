import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function SkillFrequencyChart({ data, teamAName = 'Team A', teamBName = 'Team B' }: { data: Array<{ name: string, teamA: number, teamB: number }>, teamAName?: string, teamBName?: string }) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase">Skill Frequency</h3>
        <div className="flex bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'chart' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            Chart
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${viewMode === 'table' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            Table
          </button>
        </div>
      </div>
      
      <div className="h-48 overflow-y-auto">
        {viewMode === 'chart' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: -20, right: 10, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: 8, fontSize: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="teamA" fill="#0ea5e9" name={teamAName} radius={[0,4,4,0]} />
              <Bar dataKey="teamB" fill="#f97316" name={teamBName} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/50 z-10">
              <tr className="text-gray-500">
                <th className="pb-2 font-medium">Skill</th>
                <th className="pb-2 font-medium text-right text-sky-600 dark:text-sky-400">{teamAName}</th>
                <th className="pb-2 font-medium text-right text-orange-600 dark:text-orange-400">{teamBName}</th>
                <th className="pb-2 font-medium text-right text-gray-700 dark:text-gray-300">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="py-2 font-medium text-gray-700 dark:text-gray-300">{row.name}</td>
                  <td className="py-2 text-right">{row.teamA}</td>
                  <td className="py-2 text-right">{row.teamB}</td>
                  <td className="py-2 text-right font-semibold text-gray-800 dark:text-gray-200">{row.teamA + row.teamB}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-500">No data available</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
