// frontend/src/components/common/AlertBanner.jsx
import React, { useMemo } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  X,
  ChevronRight
} from "lucide-react";

/**
 * Parses and extracts human-readable error messages, Pydantic arrays, 
 * DAG violation envelopes, and handles Error objects without producing '[object Object]' or raw tracebacks.
 */
function extractErrorDetails(input) {
  if (!input) return { heading: null, items: [] };

  // 1. Error instance handling (JSON.stringify(new Error()) is {} in JS)
  if (input instanceof Error) {
    if (Array.isArray(input.violations) && input.violations.length > 0) {
      return {
        heading: input.message?.includes(":") ? input.message.split(":")[0] : "Integrity Verification Failed",
        items: input.violations
      };
    }
    return extractErrorDetails(input.data || input.message);
  }

  // 2. Direct Array parsing
  if (Array.isArray(input)) {
    const items = input.map(item => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        if (item.msg) {
          const field = item.loc ? item.loc.filter(p => p !== "body").join(" -> ") : "";
          return field ? `${field}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      }
      return String(item);
    }).filter(Boolean);
    return { heading: null, items };
  }

  // 3. Object parsing (FastAPI / Pydantic / Singularity DAG envelopes)
  if (typeof input === "object" && input !== null) {
    // Singularity Graph violation array
    if (Array.isArray(input.violations) && input.violations.length > 0) {
      return {
        heading: input.error || input.heading || "Compliance Integrity Failure",
        items: input.violations
      };
    }
    // Nested detail violations object
    if (input.detail && typeof input.detail === "object" && Array.isArray(input.detail.violations)) {
      return {
        heading: input.detail.error || "Compliance Integrity Failure",
        items: input.detail.violations
      };
    }
    // Pydantic array in detail
    if (Array.isArray(input.detail)) {
      const items = input.detail.map(err => {
        if (err.msg) {
          const field = err.loc ? err.loc.filter(p => p !== "body").join(" -> ") : "";
          return field ? `${field}: ${err.msg}` : err.msg;
        }
        return typeof err === "string" ? err : JSON.stringify(err);
      });
      return { heading: "Validation Error", items };
    }
    // String in detail or message
    if (typeof input.detail === "string") {
      return extractErrorDetails(input.detail);
    }
    if (typeof input.message === "string") {
      return extractErrorDetails(input.message);
    }
    if (typeof input.error === "string") {
      return extractErrorDetails(input.error);
    }
    
    // Fallback serialization avoiding empty object representation
    const str = JSON.stringify(input);
    return { heading: null, items: str === "{}" ? ["An unexpected error occurred."] : [str] };
  }

  // 4. String parsing
  if (typeof input === "string") {
    let raw = input.trim();
    if (raw === "[object Object]") {
      return { heading: null, items: ["An unexpected error occurred. Please verify your connection or inspect logs."] };
    }

    // Strip raw Python tracebacks down to the final meaningful exception line
    if (raw.includes("Traceback (most recent call last)")) {
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
      const lastLine = lines[lines.length - 1] || "Internal server exception intercepted";
      return { heading: "Server Exception Intercepted", items: [lastLine] };
    }

    // Bulleted lists: \n• or \n-
    if (raw.includes("\n•") || raw.includes("\n-")) {
      const lines = raw.split(/\n[•-]\s*/).map(l => l.trim()).filter(Boolean);
      const heading = lines.length > 1 ? lines[0].replace(/:$/, "") : null;
      const items = lines.length > 1 ? lines.slice(1) : lines;
      return { heading, items };
    }

    // Pipe-delimited messages: "field1: msg1 | field2: msg2"
    if (raw.includes(" | ")) {
      const segments = raw.split(" | ").map(s => s.trim()).filter(Boolean);
      let heading = null;
      let items = segments;
      if (segments[0].includes(": ")) {
        const [prefix, firstItem] = segments[0].split(/:\s*(.+)/);
        heading = prefix;
        items = [firstItem, ...segments.slice(1)];
      }
      return { heading, items };
    }

    // Standard newlines
    if (raw.includes("\n")) {
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const heading = lines[0].endsWith(":") ? lines[0].slice(0, -1) : null;
        const items = heading ? lines.slice(1) : lines;
        return { heading, items };
      }
    }

    return { heading: null, items: [raw] };
  }

  return { heading: null, items: [String(input)] };
}

/**
 * Enhanced Statutory AlertBanner Component
 *
 * Supports single-line notifications, rich titles, and multi-violation checklists.
 * Automatically parses pipe-delimited (`|`), newline-delimited (`\n` or `•`),
 * and Pydantic validation envelopes into an itemized, human-readable compliance checklist.
 *
 * @param {string|string[]|object|Error} text - Alert message, string array, error object, or Error instance
 * @param {string} [title] - Optional bold title header
 * @param {string} [type="info"] - "info" | "success" | "warning" | "danger" | "error"
 * @param {string[]} [violations] - Optional explicit array of violation strings
 * @param {function} [onDismiss] - Optional dismiss callback
 * @param {React.ReactNode} [action] - Optional actionable button/link
 * @param {string} [className] - Additional wrapper CSS classes
 * @param {React.ReactNode} [children] - Optional custom child content
 */
export default function AlertBanner({ 
  text, 
  title = null,
  type = "info", 
  violations = null,
  onDismiss = null,
  action = null,
  className = "",
  children = null
}) {
  const normalizedType = type === "error" ? "danger" : type;

  const configs = {
    success: {
      style: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
    },
    warning: {
      style: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200",
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
    },
    danger: {
      style: "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200",
      icon: <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
    },
    info: {
      style: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200",
      icon: <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
    }
  };

  const { style, icon } = configs[normalizedType] || configs.info;

  // Process and sanitize input into clean heading and checklist items
  const parsedData = useMemo(() => {
    // 1. Explicit violations array passed via prop
    if (Array.isArray(violations) && violations.length > 0) {
      return {
        heading: title || "Compliance Verification Checklist",
        items: violations
      };
    }

    const extracted = extractErrorDetails(text);
    return {
      heading: title || extracted.heading,
      items: extracted.items
    };
  }, [text, title, violations]);

  // Don't render an empty banner if there is no text/items and no children
  if (parsedData.items.length === 0 && !children && !parsedData.heading) {
    return null;
  }

  return (
    <div 
      role="alert"
      className={`p-4 border rounded-2xl text-xs leading-relaxed flex items-start justify-between gap-3 shadow-xs animate-fadeIn ${style} ${className}`}
    >
      <div className="flex items-start gap-3 flex-1">
        <span className="mt-0.5">{icon}</span>
        
        <div className="space-y-1.5 flex-1">
          {parsedData.heading && (
            <div className="font-bold text-xs uppercase tracking-wide font-sans">
              {parsedData.heading}
            </div>
          )}

          {parsedData.items.length > 1 ? (
            <ul className="space-y-1.5 pt-0.5">
              {parsedData.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5 font-mono text-[11px] leading-snug">
                  <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0 mt-0.5" />
                  <span className="break-words">{item}</span>
                </li>
              ))}
            </ul>
          ) : parsedData.items.length === 1 ? (
            <div className="font-medium whitespace-pre-wrap leading-relaxed break-words font-sans text-xs">
              {parsedData.items[0]}
            </div>
          ) : null}

          {children}

          {action && (
            <div className="pt-2">
              {action}
            </div>
          )}
        </div>
      </div>

      {onDismiss && (
        <button 
          type="button"
          onClick={onDismiss} 
          className="text-current opacity-60 hover:opacity-100 transition-opacity p-1 rounded-lg cursor-pointer shrink-0"
          aria-label="Dismiss alert"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}