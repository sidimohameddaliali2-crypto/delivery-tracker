import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { bucketDeliveriesByHour } from './hourlyBucketing';

function getTodayWindow() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  return { rangeStart: startOfToday, rangeEnd: startOfTomorrow };
}

function DeliveryVarianceChart({ deliveries }) {
  const data = useMemo(() => bucketDeliveriesByHour(deliveries, getTodayWindow()), [deliveries]);

  return (
    <div className="col-span-12 lg:col-span-8 bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Delivery Variance (24h)</h3>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4B5563' }} interval={3} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#4B5563' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="early" name="Early" stroke="#EAB308" fill="#EAB308" fillOpacity={0.15} strokeWidth={2} />
            <Area type="monotone" dataKey="late" name="Late" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default DeliveryVarianceChart;
