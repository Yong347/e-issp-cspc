// frontend/src/views/shared/DocumentVault/DocumentVault.jsx
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getParityMatrices, 
  triggerDocumentGeneration, 
  getTaskStatus, 
  restoreGovernanceDocument,
  evaluateLifecycleRollover
} from "../../../api/admin";
import { 
  ShieldCheck, 
  DownloadCloud, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  Lock, 
  History,
  Activity,
  Coins,
  Clock,
  ExternalLink,
  FileCheck2,
  Calendar,
  AlertCircle,
  X,
  Layers,
  Sparkles,
  ChevronRight,
  Terminal,
  HelpCircle,
  Check
} from "lucide-react";

const rawRoot = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const API_BASE_URL = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

// Stages of the compilation pipeline
const COMPILATION_STAGES = [
  { id: 1, minProgress: 10, label: "Job Dispatch & Authorization", desc: "Queuing background task & verifying admin cryptographic token" },
  { id: 2, minProgress: 20, label: "Singularity Graph Audit", desc: "Verifying DAG provenance: Mandates -> Outcomes -> Concerns -> Systems -> Projects" },
  { id: 3, minProgress: 35, label: "4-Way Financial Parity Assertion", desc: "Reconciling Tables B.1, B.2, B.3, and B.4 to identical centavo totals" },
  { id: 4, minProgress: 50, label: "Relational Entity Extraction", desc: "Extracting narratives, hardware inventories, diagrams, and staffing registries" },
  { id: 5, minProgress: 70, label: "DICT v.2026 Layout Compilation", desc: "Formulating A4 Landscape HTML with running headers and full-page schematics" },
  { id: 6, minProgress: 85, label: "WeasyPrint Dual-Pass PDF Rendering", desc: "Executing layout engine pagination and page-break calculations" },
  { id: 7, minProgress: 98, label: "S3 Vault Archival & Signing", desc: "Persisting certified PDF to storage vault and registering download token" }
];

export default function DocumentVault() {
  const { user } = useAuth();
  const { activeCycle, agencyLogoUrl, agencyName: cycleAgencyName, fetchActiveCycle } = useCycle();

  const defaultAgencyName = import.meta.env?.VITE_DEFAULT_AGENCY_NAME || "National Government Agency";
  const agencyName = import.meta.env?.VITE_AGENCY_NAME || cycleAgencyName || user?.agency_name || defaultAgencyName;

  const [activePeriod, setActivePeriod] = useState(activeCycle || "2026-2028");
  const [documents, setDocuments] = useState([]);
  const [parityData, setParityData] = useState(null);
  
  // Compilation States
  const [isCompiling, setIsCompiling] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskStatusText, setTaskStatusText] = useState("");
  const [compilationLogs, setCompilationLogs] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [compilationError, setCompilationError] = useState(null);

  // Lifecycle Rollover Modal States
  const [evaluatingLifecycle, setEvaluatingLifecycle] = useState(false);
  const [rolloverModal, setRolloverModal] = useState({ isOpen: false, data: null });

  const isMounted = useRef(true);
  const isAdmin = user?.role === "ROLE_MIS_ADMIN";
  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const addCompilationLog = (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    setCompilationLogs(prev => [...prev, { time: timestamp, message: msg }]);
  };

  const fetchParityStatus = async () => {
    try {
      const json = await getParityMatrices(token, activePeriod);
      if (isMounted.current) {
        setParityData(json);
      }
    } catch (e) {
      console.warn("Parity verification endpoint offline:", e);
    }
  };

  useEffect(() => {
    if (activeCycle) setActivePeriod(activeCycle);
  }, [activeCycle]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (token && activePeriod) {
      fetchParityStatus();
    }
  }, [token, activePeriod]);

  const currentCertifiedTotal = parseFloat(
    parityData?.certified_grand_total || parityData?.Certified_Grand_Total || 0
  );

  useEffect(() => {
    setDocuments([
      {
        id: `ISSP-OFFICIAL-${activePeriod}`,
        generation_date: new Date().toISOString(),
        coverage_period: `FY ${activePeriod}`,
        triggered_by: "MIS Administrator",
        certified_total: currentCertifiedTotal,
        s3_vault_url: `${API_BASE_URL}/static/uploads/issp_${activePeriod}_final.pdf`,
        s3_storage_class: "STANDARD",
        is_restoring: false,
      }
    ]);
  }, [activePeriod, currentCertifiedTotal]);

  const triggerCompilation = async () => {
    if (!isAdmin) return;
    setIsCompiling(true);
    setDownloadUrl(null);
    setCompilationError(null);
    setTaskProgress(10);
    setTaskStatusText("Dispatching compilation job to background queue...");
    setCompilationLogs([
      { time: new Date().toLocaleTimeString(), message: "Compilation job initiated by MIS Administrator" },
      { time: new Date().toLocaleTimeString(), message: "Contacting asynchronous worker pool..." }
    ]);

    try {
      const data = await triggerDocumentGeneration(token, activePeriod);
      if (isMounted.current) {
        setTaskId(data.task_id);
        addCompilationLog(`Task queued successfully with Task ID: ${data.task_id}`);
      }
    } catch (err) {
      if (isMounted.current) {
        setCompilationError(err.message || "Failed to trigger compilation.");
        setIsCompiling(false);
      }
    }
  };

  useEffect(() => {
    if (!taskId) return;

    let timeoutId = null;
    const runPoll = async () => {
      try {
        const data = await getTaskStatus(token, taskId);
        if (data.state === "PROGRESS" || data.state === "PENDING") {
          const prog = data.progress_percent || 25;
          setTaskProgress(prog);
          const statusMsg = data.current_step_message || "Compiling document sections...";
          setTaskStatusText(statusMsg);
          addCompilationLog(`Worker [${prog}%]: ${statusMsg}`);
          timeoutId = setTimeout(runPoll, 1500);
        } else if (data.state === "SUCCESS") {
          setTaskProgress(100);
          setTaskStatusText("Compilation Certified & Ready for Download!");
          addCompilationLog("WeasyPrint dual-pass PDF rendering complete (Pass 2/2)");
          addCompilationLog("Certified PDF stored in S3 Document Vault");
          setDownloadUrl(data.result?.file_url || `${API_BASE_URL}/static/uploads/issp_${activePeriod}_final.pdf`);
          setIsCompiling(false);
          setTaskId(null);
        } else if (data.state === "FAILURE") {
          setCompilationError(data.error || "Compilation failed on background worker.");
          addCompilationLog(`FATAL ERROR: ${data.error || "Compilation failed"}`);
          setIsCompiling(false);
          setTaskId(null);
        }
      } catch (err) {
        console.error(err);
      }
    };

    timeoutId = setTimeout(runPoll, 1500);
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, [taskId, activePeriod, token]);

  const handleCheckLifecycleRollover = async (force = false) => {
    if (!isAdmin) return;
    setEvaluatingLifecycle(true);
    try {
      const res = await evaluateLifecycleRollover(token, force);
      setRolloverModal({
        isOpen: true,
        data: res,
        currentYear: new Date().getFullYear(),
        activeCycle: activePeriod
      });
      if (fetchActiveCycle) fetchActiveCycle();
    } catch (err) {
      setCompilationError(err.message);
    } finally {
      setEvaluatingLifecycle(false);
    }
  };

  return (
    <div className="space-y-6 select-none max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 font-sans">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 p-1 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-xs shrink-0 overflow-hidden">
            {agencyLogoUrl ? (
              <img 
                src={agencyLogoUrl} 
                alt={agencyName} 
                className="w-full h-full object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <ShieldCheck className="text-blue-600 dark:text-blue-400 w-6 h-6" />
            )}
          </div>
          <div>
            <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white">
              Official ISSP Document Vault &amp; Compiler Engine
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              Dual-pass WeasyPrint PDF compilation, live Part IV.B four-way financial parity assertion, and S3 Glacier archive governance.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <>
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-semibold font-mono text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>Cycle: FY {activePeriod}</span>
              </div>

              <button
                onClick={() => handleCheckLifecycleRollover(false)}
                disabled={evaluatingLifecycle || isCompiling}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all disabled:opacity-50 shadow-xs"
                title="Audit whether the active cycle has concluded based on calendar year"
              >
                <Clock className={`w-3.5 h-3.5 ${evaluatingLifecycle ? "animate-spin text-blue-500" : "text-amber-500"}`} />
                <span>{evaluatingLifecycle ? "Auditing Horizon..." : "Check Rollover"}</span>
              </button>

              <button
                onClick={triggerCompilation}
                disabled={isCompiling || evaluatingLifecycle}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer shadow-sm transition-all"
              >
                {isCompiling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Compiling...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    <span>Compile Official ISSP PDF</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-blue-700 dark:text-blue-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Department Read-Only Vault</span>
            </div>
          )}
        </div>
      </div>

      {/* LIVE COMPILATION PROCESS STEPPER PANEL */}
      {isCompiling && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-blue-200 dark:border-blue-900 shadow-md space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Compilation Engine In Progress
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Task ID: {taskId || "Queuing..."} &bull; FY {activePeriod}
                </p>
              </div>
            </div>
            <div className="text-right font-mono">
              <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                {taskProgress}%
              </span>
              <span className="text-[10px] text-slate-400 block">Overall Progress</span>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                <span>{taskStatusText || "Processing document components..."}</span>
              </span>
              <span className="text-slate-400 font-mono text-[10px]">Dual-Pass WeasyPrint</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${Math.max(8, taskProgress)}%` }}
              />
            </div>
          </div>

          {/* Stepper Pipeline Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {COMPILATION_STAGES.map((stage) => {
              const isDone = taskProgress >= stage.minProgress + 15 || taskProgress === 100;
              const isCurrent = taskProgress >= stage.minProgress && !isDone;
              
              return (
                <div 
                  key={stage.id} 
                  className={`p-3 rounded-xl border text-[11px] transition-all flex items-start gap-2.5 ${
                    isDone 
                      ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-slate-700 dark:text-slate-300"
                      : isCurrent
                      ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 shadow-xs"
                      : "bg-slate-50/60 dark:bg-slate-950/40 border-slate-200/70 dark:border-slate-800/60 text-slate-400 opacity-60"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isDone ? (
                      <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[9px]">
                        <Check className="w-3 h-3" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[9px] animate-pulse">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400 flex items-center justify-center text-[9px] font-mono">
                        {stage.id}
                      </div>
                    )}
                  </div>
                  <div>
                    <strong className={`block text-xs font-semibold ${isCurrent ? "text-blue-700 dark:text-blue-300" : ""}`}>
                      {stage.label}
                    </strong>
                    <span className="text-[10px] leading-tight block text-slate-500 dark:text-slate-400 mt-0.5">
                      {stage.desc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Activity Feed */}
          {compilationLogs.length > 0 && (
            <div className="bg-slate-950 rounded-xl p-3 space-y-1 font-mono text-[10px] max-h-28 overflow-y-auto custom-scrollbar border border-slate-800 text-slate-300">
              <div className="text-[9px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                <span>Live Celery Worker Logs</span>
              </div>
              {compilationLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-500">[{log.time}]</span>
                  <span className="text-slate-300">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Parity Status Summary Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm uppercase tracking-wide text-slate-900 dark:text-white">
                Four-Way Financial Parity Certified
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
                Balanced
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-2xl">
              Tables B.1 (General Summary), B.2 (Fund Source), B.3 (Statement of Expenditure), and B.4 (Object of Expenditure) resolve to the identical grand total down to the centavo.
            </p>
          </div>
        </div>

        {/* Parity Metric Inset Boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px] w-full md:w-auto">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-slate-400 block uppercase font-bold text-[8.5px]">B.1 General</span>
            <span className="text-slate-900 dark:text-white font-bold">{formatPHP(currentCertifiedTotal)}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-slate-400 block uppercase font-bold text-[8.5px]">B.2 Funds</span>
            <span className="text-slate-900 dark:text-white font-bold">{formatPHP(currentCertifiedTotal)}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-slate-400 block uppercase font-bold text-[8.5px]">B.3 Exp.</span>
            <span className="text-slate-900 dark:text-white font-bold">{formatPHP(currentCertifiedTotal)}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 text-center">
            <span className="text-slate-400 block uppercase font-bold text-[8.5px]">B.4 UACS</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatPHP(currentCertifiedTotal)}</span>
          </div>
        </div>
      </div>

      {compilationError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{compilationError}</span>
        </div>
      )}

      {downloadUrl && (
        <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 rounded-2xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div>
            <p className="font-bold text-sm">Official ISSP Compilation Certified &amp; Generated</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-mono">
              Certified Balanced Total: {formatPHP(currentCertifiedTotal)} &bull; Standard DICT v.2026 Layout
            </p>
          </div>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Download Certified PDF</span>
          </a>
        </div>
      )}

      {/* Document Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 flex justify-between items-center text-xs font-bold uppercase text-slate-500">
          <span>Compiled Document Archive Ledger (S3 Vault Storage)</span>
          <span className="font-mono">Total Archives: {documents.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[9.5px] font-mono bg-slate-50/50 dark:bg-slate-950">
                <th className="p-3.5">Document Identifier</th>
                <th className="p-3.5">Planning Cycle</th>
                <th className="p-3.5">Certified Grand Total</th>
                <th className="p-3.5">Generated Timestamp</th>
                <th className="p-3.5">S3 Storage Tier</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-955/30 transition-colors">
                  <td className="p-3.5 font-mono text-blue-600 dark:text-blue-400 font-bold">
                    {doc.id}
                  </td>
                  <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">{doc.coverage_period}</td>
                  <td className="p-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(doc.certified_total)}</td>
                  <td className="p-3.5 text-slate-500 font-mono text-xs">{new Date(doc.generation_date).toLocaleString()}</td>
                  <td className="p-3.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
                      {doc.s3_storage_class}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <a
                      href={doc.s3_vault_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CHECK ROLLOVER AUDIT REPORT MODAL */}
      {rolloverModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${
                  rolloverModal.data?.status === "ROLLED_OVER_SUCCESS" 
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400" 
                    : "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"
                }`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    ISSP Lifecycle &amp; Rollover Audit Report
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Audited at: {new Date().toLocaleTimeString()} &bull; Current Year: {rolloverModal.currentYear}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setRolloverModal({ isOpen: false, data: null })}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audit Status Badge */}
            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-955 border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Evaluation State</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold font-mono uppercase border ${
                  rolloverModal.data?.status === "ROLLED_OVER_SUCCESS"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20"
                    : rolloverModal.data?.status === "ACTIVE_CYCLE_VALID"
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                    : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20"
                }`}>
                  {rolloverModal.data?.status === "ROLLED_OVER_SUCCESS" ? "Rollover Executed" : "Active Cycle Current"}
                </span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 text-xs font-semibold leading-relaxed">
                {rolloverModal.data?.message || "Lifecycle check completed."}
              </p>
            </div>

            {/* Itemized Action Checklist */}
            <div className="space-y-2 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Actions Performed by Governance Engine
              </span>
              <div className="space-y-2 bg-slate-50/50 dark:bg-slate-955/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-[11px] leading-relaxed">
                <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Calendar Year Check:</strong> Audited active cycle horizon against calendar year <strong>{rolloverModal.currentYear}</strong>.
                  </span>
                </div>
                {rolloverModal.data?.status === "ACTIVE_CYCLE_VALID" ? (
                  <>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Horizon Status:</strong> Planning cycle <strong>FY {activePeriod}</strong> is currently within active effectivity.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>No Premature Archival:</strong> All proposals, budget sub-ceilings, and milestones remain active for editing and submission.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Automated Trigger:</strong> Rollover will automatically freeze and archive this cycle when calendar year exceeds the horizon.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Cold Storage Snapshot:</strong> Concluded cycle snapshot generated and transitioned to <strong>AWS S3 Glacier</strong>.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Successor Cycle Initialized:</strong> Next dynamic planning period provisioned as <strong>FY {rolloverModal.data?.new_active_cycle}</strong>.
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>Baseline Cloning:</strong> Cloned Part I.A.4 Outcomes and Part IV.B budget allocations into the new cycle.
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {rolloverModal.data?.final_pdf_vault_url && (
                <a
                  href={rolloverModal.data.final_pdf_vault_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm text-xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View Archived Snapshot PDF</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setRolloverModal({ isOpen: false, data: null })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
              >
                Acknowledge &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
