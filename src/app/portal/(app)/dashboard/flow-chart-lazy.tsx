"use client";

import dynamic from "next/dynamic";

// The chart library only loads when the chart is on screen, so the rest of the dashboard paints first.
export const FlowChart = dynamic(() => import("./flow-chart"), {
  ssr: false,
  loading: () => <div className="h-[17rem] w-full animate-pulse rounded-lg bg-slate-800/40" aria-label="Loading the chart" />,
});
