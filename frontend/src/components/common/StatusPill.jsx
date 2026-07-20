import React from 'react';
export default function StatusPill({ status }) {
  const styles = {
    Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Returned: "bg-rose-50 text-rose-700 border-rose-200",
    Submitted: "bg-blue-50 text-blue-700 border-blue-200",
    Draft: "bg-slate-50 text-slate-700 border-slate-200"
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold border rounded uppercase ${styles[status] || styles.Draft}`}>
      {status}
    </span>
  );
}
