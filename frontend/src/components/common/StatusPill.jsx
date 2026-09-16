// frontend/src/components/common/StatusPill.jsx
import React from 'react';

export default function StatusPill({ status }) {
  const normalized = (status || "Draft").toString().trim();
  
  const styles = {
    Approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    Submitted: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    Returned: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
    Draft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    Operational: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    "For Development": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    "For Enhancement": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    Functional: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    Condemned: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
    "Needs Repair": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  };

  const currentStyle = styles[normalized] || styles.Draft;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[9.5px] font-bold border rounded-full font-mono uppercase tracking-wider ${currentStyle}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{normalized}</span>
    </span>
  );
}
