// frontend/src/components/common/Modal.jsx
import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  subtitle = null,
  size = "md",
  children,
  footer = null
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    "2xl": "max-w-6xl"
  }[size] || "max-w-lg";

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div 
        className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full ${sizeClasses} flex flex-col max-h-[90vh] overflow-hidden text-xs text-slate-800 dark:text-slate-100 font-sans`}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h3>
            {subtitle && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
