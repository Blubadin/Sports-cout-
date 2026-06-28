import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function ResultDistributionChart({ data }: { data: any[] }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl flex flex-col items-center">
      <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase w-full text-left">Result Distribution</h3>
      <div className="h-48 w-full flex justify-center items-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} stroke="none" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
