// frontend/src/components/common/AlertBanner.jsx
import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from "lucide-react";

export default function AlertBanner({ text, type = "info", onDismiss = null }) {
  const configs = {
    success: {
      style: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-955/30 dark:border-emerald-900/60 dark:text-emerald-300",
      icon: <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
    },
    warning: {
      style: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-955/30 dark:border-amber-900/60 dark:text-amber-300",
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
    },
    danger: {
      style: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-955/30 dark:border-rose-900/60 dark:text-rose-300",
      icon: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
    },
    info: {
      style: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-955/30 dark:border-blue-900/60 dark:text-blue-300",
      icon: <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
    }
  };

  const { style, icon } = configs[type] || configs.info;

  return (
    <div className={`p-3.5 border rounded-xl text-xs leading-relaxed flex items-start justify-between gap-3 shadow-2xs ${style}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">{icon}</span>
        <span>{text}</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-current opacity-60 hover:opacity-100 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
