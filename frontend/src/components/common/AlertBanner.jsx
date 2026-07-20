import React from 'react';
export default function AlertBanner({ text, type = "info" }) {
  const styles = {
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    danger: "bg-rose-50 border-rose-200 text-rose-800",
    info: "bg-blue-50 border-blue-200 text-blue-800"
  };
  return (
    <div className={`p-4 border rounded-lg text-xs leading-relaxed ${styles[type]}`}>
      {text}
    </div>
  );
}
