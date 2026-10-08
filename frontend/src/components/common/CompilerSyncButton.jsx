// frontend/src/components/common/CompilerSyncButton.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { verifyCompilerSync } from "../../api/admin";
import { 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  X, 
  Check, 
  AlertCircle, 
  ArrowRight,
  Sparkles,
  FileCheck
} from "lucide-react";

// Friendly mapping of internal module keys to official DICT ISSP sections
const MODULE_DISPLAY_NAMES = {
  outcomes: "Part I.A.4: Organizational Outcomes",
  organizational_outcomes: "Part I.A.4: Organizational Outcomes",
  concerns: "Part II.A: Strategic Concerns for ICT Use",
  strategic_concerns: "Part II.A: Strategic Concerns for ICT Use",
  systems: "Parts II.C & III.D: Information Systems Register",
  information_systems: "Parts II.C & III.D: Information Systems Register",
  projects: "Part III.E: ICT Projects Portfolio",
  ict_projects: "Part III.E: ICT Projects Portfolio",
  cross_projects: "Part III.E.2: Cross-Agency ICT Projects",
  metrics: "Part III.F: Performance Measurement Framework (PMF)",
  performance_metrics: "Part III.F: Performance Measurement Framework (PMF)",
  budget: "Part IV: Resource Deployments & Ceilings",
  parity: "Part IV.B: Four-Way Financial Parity Ledger",
  ceilings: "Budget Sub-Ceilings & Policy",
  inventory: "Annex 1: Master ICT Asset Inventory",
  annex1: "Annex 1: Master ICT Asset Inventory",
  framework: "Compliance Framework & Checklists",
  checklists: "Compliance Framework & Checklists",
  glossary: "Definition of Terms (Glossary)",
  definitions: "Definition of Terms (Glossary)",
  diagrams: "Official Document Schematics Vault",
  vault: "Official Document Schematics Vault"
};

/**
 * Universal Compiler Verification Button
 *
 * Executes automated pre-flight checks against the active database state,
 * asserting that the module's relational graph linkages and statutory constraints
 * meet the prerequisites for DICT ISSP v.2026 WeasyPrint PDF compilation.
 *
 * @param {string} moduleName - Canonical key matching backend audit router
 * @param {string} activeCycle - Active planning cycle (e.g. "2026-2028")
 * @param {string|null} token - Optional JWT token override
 * @param {Function|null} onSaveAndSync - Optional pre-verification callback (e.g., save form, refresh state)
 * @param {string} label - Button display text
 * @param {string} variant - "primary" | "secondary" | "compact" | "outline"
 * @param {string} className - Additional CSS classes
 * @param {boolean} showVaultLink - If true, displays shortcut to Document Vault on certification
 */
export default function CompilerSyncButton({ 
  moduleName, 
  activeCycle = "", 
  token = null, 
  onSaveAndSync = null, 
  label = "Save & Verify Compiler Pipeline",
  variant = "primary",
  className = "",
  showVaultLink = true
}) {
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState(null);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && report) {
        setReport(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [report]);

  const handleVerify = async () => {
    setVerifying(true);
    setReport(null);
    try {
      if (onSaveAndSync) {
        await onSaveAndSync();
      }
      const data = await verifyCompilerSync(token, moduleName, activeCycle);
      setReport(data);
    } catch (err) {
      const errorMsg = typeof err === "object" && err !== null 
        ? (err.message || JSON.stringify(err)) 
        : String(err);

      setReport({
        status: "DISCONNECT",
        compiler_ready: false,
        module: moduleName,
        issp_period: activeCycle || "Active Cycle",
        records_count: 0,
        message: errorMsg || "Failed to communicate with the compiler verification service.",
        checks: [],
        warnings: [errorMsg || "Compiler verification service unreachable."]
      });
    } finally {
      setVerifying(false);
    }
  };

  const moduleKey = (report?.module || moduleName || "").toLowerCase().trim();
  const moduleDisplayName = MODULE_DISPLAY_NAMES[moduleKey] || (moduleName || "GOVERNANCE").toUpperCase();
  const cycleDisplay = report?.issp_period || activeCycle || "Active Cycle";

  // Visual variant styling resolver
  const buttonStyle = useMemo(() => {
    if (className) return className;
    switch (variant) {
      case "secondary":
        return "px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl font-bold flex items-center gap-1.5 shadow-xs text-xs cursor-pointer transition-all shrink-0";
      case "compact":
        return "px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs text-[11px] cursor-pointer transition-all shrink-0";
      case "outline":
        return "px-3 py-2 bg-transparent hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-800 rounded-xl font-bold flex items-center gap-1.5 text-xs cursor-pointer transition-all shrink-0";
      case "primary":
      default:
        return "px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm text-xs cursor-pointer transition-all shrink-0";
    }
  }, [variant, className]);

  return (
    <>
      <button
        type="button"
        onClick={handleVerify}
        disabled={verifying}
        className={buttonStyle}
        title="Validates that this module's records satisfy the DICT Singularity Graph and are ready for PDF compilation"
      >
        <ShieldCheck className={`w-4 h-4 shrink-0 ${verifying ? "animate-spin text-white" : ""}`} />
        <span>{verifying ? "Auditing Pipeline..." : label}</span>
      </button>

      {/* Verification Status Modal */}
      {report && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReport(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                {report.compiler_ready ? (
                  <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-955/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <ShieldCheck className="w-5 h-5 shrink-0" />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-955/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                    <ShieldAlert className="w-5 h-5 shrink-0 animate-pulse" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    {report.compiler_ready 
                      ? "Module Certified for PDF Compilation" 
                      : "Compiler Pipeline Disconnect Detected"}
                  </h3>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block mt-0.5">
                    {moduleDisplayName} &bull; FY {cycleDisplay}
                  </span>
                </div>
              </div>
              
              <button 
                type="button"
                onClick={() => setReport(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5 text-xs leading-relaxed overflow-y-auto pr-1 flex-1">
              <p className="text-slate-700 dark:text-slate-300 font-medium">
                {report.message}
              </p>

              {/* Verified Pre-Flight Linkages List */}
              {report.checks && report.checks.length > 0 && (
                <div className="space-y-1.5 bg-emerald-50/70 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/40 p-3.5 rounded-xl font-mono text-[10.5px]">
                  <strong className="text-emerald-900 dark:text-emerald-300 uppercase font-bold text-[9px] block tracking-wider">
                    Verified Compiler Assertions:
                  </strong>
                  {report.checks.map((chk, idx) => (
                    <div key={idx} className="text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{chk}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actionable Disconnect Warnings List */}
              {report.warnings && report.warnings.length > 0 && (
                <div className="space-y-2 bg-rose-50/80 dark:bg-rose-955/30 border border-rose-200 dark:border-rose-900/60 p-3.5 rounded-xl font-mono text-[10.5px]">
                  <strong className="text-rose-800 dark:text-rose-300 text-[9.5px] uppercase block font-bold tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Action Required Prior to Document Generation:</span>
                  </strong>
                  <ul className="space-y-1.5 pl-1">
                    {report.warnings.map((warn, idx) => (
                      <li key={idx} className="text-rose-700 dark:text-rose-300 flex items-start gap-1.5 leading-snug">
                        <span className="text-rose-500 font-bold shrink-0">&bull;</span>
                        <span>{warn}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
              <span className="text-[10px] text-slate-400 font-mono">
                Records: <strong>{report.records_count ?? 0}</strong>
              </span>

              <div className="flex items-center gap-2">
                {report.compiler_ready && showVaultLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setReport(null);
                      navigate("/admin/vault");
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Proceed to Document Vault</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setReport(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs cursor-pointer transition-all border border-slate-200 dark:border-slate-700"
                >
                  {report.compiler_ready ? "Done" : "Acknowledge"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}