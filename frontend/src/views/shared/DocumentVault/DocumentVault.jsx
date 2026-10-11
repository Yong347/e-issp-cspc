// frontend/src/views/shared/DocumentVault/DocumentVault.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getNarrative, 
  getTaskStatus, 
  triggerDocumentGeneration, 
  exportBudgetBlob 
} from "../../../api/admin";
import { 
  ShieldCheck, 
  FileText, 
  Download, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  ExternalLink, 
  Coins, 
  Activity, 
  X, 
  FileSpreadsheet, 
  ArrowRight, 
  Archive, 
  Server, 
  FileCheck, 
  FolderKanban, 
  ClipboardCheck, 
  Info, 
  Printer, 
  Edit3 
} from "lucide-react";

const getApiUrl = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    const { hostname, origin, port } = window.location;
    if (
      port !== "5173" &&
      port !== "3000" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1"
    ) {
      return origin;
    }
  }
  const rawRoot = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  return rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;
};

const API_BASE_URL = getApiUrl();

const parseErrorMessage = (errData, fallbackMsg = "Operation failed") => {
  if (!errData) return fallbackMsg;
  if (typeof errData.detail === "string") return errData.detail;
  if (Array.isArray(errData.detail)) {
    return errData.detail
      .map(e => (e.loc ? `[${e.loc.filter(p => p !== "body").join(" -> ")}]: ` : "") + (e.msg || JSON.stringify(e)))
      .join(" | ");
  }
  if (typeof errData.detail === "object" && errData.detail !== null) {
    if (Array.isArray(errData.detail.violations)) {
      return `${errData.detail.error || "Integrity Violation"}:\n• ${errData.detail.violations.join("\n• ")}`;
    }
    return JSON.stringify(errData.detail);
  }
  if (Array.isArray(errData.violations)) {
    return `${errData.error || "Integrity Violation"}:\n• ${errData.violations.join("\n• ")}`;
  }
  if (errData.message) return errData.message;
  return fallbackMsg;
};

const COMPILATION_STAGES = [
  { step: 1, percent: 15, name: "Singularity DAG Audit", desc: "Traversing legal mandate, outcomes, concerns, systems & project linkages" },
  { step: 2, percent: 30, name: "4-Way Parity Verification", desc: "Reconciling Tables B.1, B.2, B.3 & B.4 to the exact centavo" },
  { step: 3, percent: 45, name: "Artifact Extraction", desc: "Extracting certified schematics, inventory, cybersecurity controls & DRBCP" },
  { step: 4, percent: 65, name: "DICT v.2026 Compilation", desc: "Building semantic document structure, roman numerals & page layouts" },
  { step: 5, percent: 80, name: "Layout Engine Rendering", desc: "Dual-pass document layout engine formatting official pagination" },
  { step: 6, percent: 95, name: "Vault Archival", desc: "Committing binary to permanent secure institutional storage" },
  { step: 7, percent: 100, name: "Certified Document Finalized", desc: "Official document certified, signed and ready for submission" }
];

export default function DocumentVault() {
  const { user } = useAuth();
  const { 
    activeCycle, 
    agencyName: cycleAgencyName, 
    agencyLogoUrl, 
    planningYears 
  } = useCycle();
  const navigate = useNavigate();

  const isAdmin = user?.role === "ROLE_MIS_ADMIN";
  const defaultAgency = import.meta.env.VITE_DEFAULT_AGENCY_NAME || import.meta.env.VITE_AGENCY_NAME || "National Government Agency";
  const agencyName = cycleAgencyName || user?.agency_name || defaultAgency;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? (localStorage.getItem("access_token") || localStorage.getItem("token") || "") : "");

  const isMountedRef = useRef(true);
  const activePollIntervalRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activePollIntervalRef.current) {
        clearInterval(activePollIntervalRef.current);
      }
    };
  }, []);

  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [isCompiling, setIsCompiling] = useState(false);
  const [compiledFormat, setCompiledFormat] = useState("pdf");
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStepMessage, setCurrentStepMessage] = useState("");
  const [compilationLogs, setCompilationLogs] = useState([]);
  
  const [compiledPdfUrl, setCompiledPdfUrl] = useState(null);
  const [compiledDocxUrl, setCompiledDocxUrl] = useState(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);

  const addLog = useCallback((msg, type = "info") => {
    const timeStr = new Date().toLocaleTimeString();
    setCompilationLogs(prev => [...prev, { time: timeStr, text: msg, type }]);
  }, []);

  const fetchVaultDetails = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      let data = null;
      try {
        data = await getNarrative(token, activeCycle);
      } catch {
        const res = await fetch(`${API_BASE_URL}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });
        if (res.ok) {
          data = await res.json();
        }
      }

      if (data && isMountedRef.current) {
        setNarrative(data);
        if (data.final_pdf_vault_url) {
          setCompiledPdfUrl(data.final_pdf_vault_url);
        }
        if (data.final_docx_vault_url) {
          setCompiledDocxUrl(data.final_docx_vault_url);
        }
      }
    } catch (err) {
      console.warn("Could not load narrative metadata:", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [activeCycle, token]);

  useEffect(() => {
    if (isAdmin) {
      fetchVaultDetails();
    }
  }, [fetchVaultDetails, isAdmin]);

  // Robust, task-specific polling function that prevents old task cross-talk
  const startPollingTask = useCallback((activeTaskId, targetFormat) => {
    if (activePollIntervalRef.current) {
      clearInterval(activePollIntervalRef.current);
    }

    const formatLabel = targetFormat === "docx" ? "Word (.docx)" : "PDF";

    activePollIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) {
        clearInterval(activePollIntervalRef.current);
        return;
      }

      try {
        let data = null;
        try {
          data = await getTaskStatus(token, activeTaskId);
        } catch {
          const res = await fetch(`${API_BASE_URL}/api/admin/governance/task-status/${encodeURIComponent(activeTaskId)}`, {
            headers: { 
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          });
          if (res.ok) {
            data = await res.json();
          }
        }

        if (!data || !isMountedRef.current) return;

        if (data.state === "PROGRESS" || data.state === "PENDING") {
          const prog = data.progress_percent || 15;
          const msg = data.current_step_message || "Compiling layout packages and asserting 4-way parity...";
          setProgressPercent(prog);
          setCurrentStepMessage(msg);
          addLog(`WORKER [${prog}%]: ${msg}`);
        } else if (data.state === "SUCCESS") {
          setProgressPercent(100);
          setCurrentStepMessage(`Compilation Complete. Certified ${formatLabel} archived.`);
          setIsCompiling(false);
          
          const downloadUrl = data.result?.file_url || data.download_url || "";
          const isDocx = (data.result?.format === "docx") || downloadUrl.includes(".docx") || targetFormat === "docx";
          
          if (isDocx) {
            setCompiledDocxUrl(downloadUrl);
          } else {
            setCompiledPdfUrl(downloadUrl);
          }

          const label = isDocx ? "Word (.docx)" : "PDF";
          addLog(`SUCCESS: Final ${label} certified and stored in Official Document Vault.`, "success");
          setSuccess(`Official ISSP ${label} document compiled and certified successfully!`);
          fetchVaultDetails();
          clearInterval(activePollIntervalRef.current);
        } else if (data.state === "FAILURE") {
          setIsCompiling(false);
          const failureMsg = data.error || (data.result && data.result.error) || "Compilation failed during document generation.";
          setError(failureMsg);
          addLog(`ERROR: Compilation aborted: ${failureMsg}`, "error");
          clearInterval(activePollIntervalRef.current);
        }
      } catch (pollErr) {
        console.warn("Polling error:", pollErr);
      }
    }, 1800);
  }, [token, fetchVaultDetails, addLog]);

  // Trigger Asynchronous Document Compilation (PDF or Word DOCX)
  const handleTriggerCompilation = async (format = "pdf") => {
    if (!isAdmin) return;
    
    // Clear previous poll intervals and errors
    if (activePollIntervalRef.current) {
      clearInterval(activePollIntervalRef.current);
    }
    setError(null);
    setSuccess(null);
    setProgressPercent(5);
    setCompiledFormat(format);
    setIsCompiling(true);

    const formatLabel = format === "docx" ? "Word (.docx)" : "PDF";
    setCurrentStepMessage(`Submitting ${formatLabel} compilation job to worker queue...`);
    setCompilationLogs([{ time: new Date().toLocaleTimeString(), text: `INIT: Queueing ${formatLabel} compilation task for FY ${activeCycle}...`, type: "info" }]);

    try {
      let resData = null;
      try {
        resData = await triggerDocumentGeneration(token, activeCycle, format);
      } catch (err) {
        const res = await fetch(`${API_BASE_URL}/api/admin/governance/generate-issp?issp_period=${encodeURIComponent(activeCycle)}&export_format=${encodeURIComponent(format)}`, {
          method: "POST",
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(parseErrorMessage(errData, "Failed to trigger document compilation."));
        }
        resData = await res.json();
      }

      if (resData?.task_id && isMountedRef.current) {
        addLog(`QUEUED: Task registered with Worker ID ${resData.task_id} (Format: ${format.toUpperCase()})`, "info");
        // Start polling ONLY for this specific new task
        startPollingTask(resData.task_id, format);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setIsCompiling(false);
        setError(err.message || "Failed to initiate compilation.");
      }
    }
  };

  const handleExportDbmCsv = async () => {
    setExportingCsv(true);
    setError(null);
    try {
      let blob = null;
      try {
        blob = await exportBudgetBlob(token, activeCycle);
      } catch {
        const res = await fetch(`${API_BASE_URL}/api/admin/governance/export-budget-csv?issp_period=${encodeURIComponent(activeCycle)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error(`Export failed with HTTP ${res.status}`);
        }
        blob = await res.blob();
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `ISSP_${activeCycle}_Part_IV_A_DBM_Export.csv`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);

      if (isMountedRef.current) {
        setSuccess("DBM OSPS/NEP-compliant CSV budget spreadsheet exported successfully.");
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to download DBM CSV export.");
      }
    } finally {
      if (isMountedRef.current) {
        setExportingCsv(false);
      }
    }
  };

  const historicalCycles = useMemo(() => {
    return [
      {
        cycle: activeCycle || "2028-2030",
        label: "Current Active Planning Cycle",
        tier: "Official Document Vault",
        isConcluded: false,
        status: (compiledPdfUrl || compiledDocxUrl) ? "Certified & Available" : "Pending Compilation",
        pdfUrl: compiledPdfUrl,
        docxUrl: compiledDocxUrl,
        sizeMb: "4.8 MB"
      },
      {
        cycle: "2025-2027",
        label: "Concluded Plan Snapshot",
        tier: "Long-Term Procurement Archive",
        isConcluded: true,
        status: "Archived & Preserved",
        pdfUrl: `${API_BASE_URL}/static/uploads/issp_compiled/ISSP-2025-2027-FINAL.pdf`,
        docxUrl: null,
        sizeMb: "5.6 MB"
      }
    ];
  }, [activeCycle, compiledPdfUrl, compiledDocxUrl]);

  const currentStageIndex = useMemo(() => {
    if (!isCompiling && progressPercent === 100) return 7;
    for (let i = 0; i < COMPILATION_STAGES.length; i++) {
      if (progressPercent <= COMPILATION_STAGES[i].percent) {
        return i + 1;
      }
    }
    return 1;
  }, [isCompiling, progressPercent]);

  const coverDetails = useMemo(() => {
    const rawScope = String(narrative?.scope_choice || "Department-Wide").trim().toLowerCase().replace(/_/g, "-");
    const scopeJson = narrative?.scope_json || {};
    const hasReg = Boolean(scopeJson.with_regional_offices);
    const hasBur = Boolean(scopeJson.with_bureaus);
    const isAmend = Boolean(narrative?.is_amendment);
    const amendNum = narrative?.amendment_number || "1st";

    const isDeptWide = rawScope.includes("department-wide") || rawScope === "department" || rawScope === "dept-wide" || !rawScope;
    const isDeptCo = (rawScope.includes("central") || rawScope.includes("head-office") || rawScope.includes("head office")) && !isDeptWide;
    const isDeptCoOnly = isDeptCo && !hasReg && !hasBur;
    const isAgencyWide = rawScope.includes("agency");
    const isAgencyCoOnly = isAgencyWide && !hasReg;
    const isOtherGov = rawScope.includes("other");
    const isLgu = rawScope.includes("lgu");

    const startYr = narrative?.issp_period_from || (planningYears && planningYears[0]) || 2028;
    const endYr = narrative?.issp_period_to || (planningYears && planningYears[planningYears.length - 1]) || 2030;

    const rawCio = String(narrative?.cio_name || narrative?.signatory_prepared_by || "").trim();
    const cioSignatory = rawCio ? rawCio.toUpperCase() : "CHIEF INFORMATION OFFICER";

    const rawHead = String(narrative?.head_of_agency_name || narrative?.signatory_approved_by || "").trim();
    const headSignatory = rawHead 
      ? rawHead.toUpperCase() 
      : String(narrative?.agency_head_position || "HEAD OF AGENCY").toUpperCase();

    const agencyHeadTitle = narrative?.agency_head_position || "Agency Head";
    const websiteUrl = narrative?.agency_website_url || "www.agency.gov.ph";
    const emblemLogo = narrative?.agency_logo_url || agencyLogoUrl || null;

    const scopeVal = isDeptWide 
      ? "Department-Wide" 
      : isAgencyWide 
      ? "Agency-Wide" 
      : isLgu 
      ? "LGU" 
      : isOtherGov 
      ? "Other Government Entity" 
      : (narrative?.scope_choice || "Department-Wide");

    return {
      scopeVal,
      isDeptWide,
      isDeptCo,
      isDeptCoOnly,
      isAgencyWide,
      isAgencyCoOnly,
      isOtherGov,
      isLgu,
      hasReg,
      hasBur,
      isAmend,
      amendNum,
      startYr,
      endYr,
      cioSignatory,
      headSignatory,
      agencyHeadTitle,
      websiteUrl,
      emblemLogo
    };
  }, [narrative, agencyLogoUrl, planningYears]);

  const handlePrintCoverPage = () => {
    const el = document.getElementById("issp-cover-sheet-print-container");
    if (!el) {
      window.print();
      return;
    }
    const win = window.open("", "_blank", "width=1200,height=850");
    if (!win) {
      window.print();
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>ISSP Cover Page - ${agencyName} (${activeCycle})</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 15mm 15mm 15mm 15mm;
            }
            body {
              font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
              font-size: 9pt;
              line-height: 1.4;
              color: #0f172a;
              background: #ffffff;
              padding: 0;
              margin: 0;
            }
            .no-print, button {
              display: none !important;
            }
          </style>
        </head>
        <body>${el.innerHTML}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 350);
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none animate-fadeIn font-sans">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white">
              {user?.department_name || "Department"} Official Document Vault &amp; Procurement Ledgers
            </h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Download verified proposal rosters, needs assessment records, and budget allocations designated solely for your office. Full institutional compilations and permanent archives are managed by MIS Administrators.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Department Proposals Ledger</h3>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              Download all drafted and approved resource line items and procurement schedules in CSV format.
            </p>
            <Link
              to="/dept/proposals"
              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold hover:underline"
            >
              <span>View Department Proposals</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
            <ClipboardCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Section 8.0 Needs Assessments</h3>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              Audit operational problem statements and technical interventions submitted to the institutional intake pool.
            </p>
            <Link
              to="/dept/needs"
              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold hover:underline"
            >
              <span>Inspect Needs Assessments</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
            <Coins className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Department Budget Allocation</h3>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              Review authorized CapEx and MOOE sub-ceilings and committed spent balances for planning cycle FY {activeCycle}.
            </p>
            <Link
              to="/dept/dashboard"
              className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold hover:underline"
            >
              <span>Check Sub-Ceiling Balance</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-slate-600 dark:text-slate-400 text-xs">
              Looking for your full department allocation certificates and inventory rosters?
            </span>
          </div>
          <Link
            to="/dept/vault"
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-sm transition-all"
          >
            <span>Open Department Vault</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans transition-colors duration-200">
      
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Official ISSP Document Vault &amp; Submission Hub</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              FY {activeCycle || "2028-2030"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Certified compilation repository for DICT ISSP v.2026. Manage dual-pass PDF and Word (.docx) generation, preview official landscape coversheets, export DBM OSPS/NEP CSV ledgers, and access the Official Document Vault.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCoverPreviewOpen(true)}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs text-xs"
            title="Inspect official DICT landscape cover sheet"
          >
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Preview Cover Sheet</span>
          </button>

          <button
            onClick={handleExportDbmCsv}
            disabled={exportingCsv}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs text-xs"
            title="Download DBM-compliant OSPS/NEP spreadsheet (CSV format)"
          >
            <FileSpreadsheet className={`w-4 h-4 ${exportingCsv ? "animate-spin text-blue-500" : "text-emerald-600 dark:text-emerald-400"}`} />
            <span>{exportingCsv ? "Generating CSV..." : "Export DBM Budget CSV"}</span>
          </button>

          <button
            onClick={() => handleTriggerCompilation("pdf")}
            disabled={isCompiling}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all disabled:opacity-50"
            title="Compile official certified plan as PDF"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCompiling && compiledFormat === "pdf" ? "animate-spin" : ""}`} />
            <span>{isCompiling && compiledFormat === "pdf" ? "Compiling PDF..." : "Compile as PDF"}</span>
          </button>

          <button
            onClick={() => handleTriggerCompilation("docx")}
            disabled={isCompiling}
            className="px-3.5 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all disabled:opacity-50"
            title="Compile editable plan as Word (.docx)"
          >
            <Download className={`w-3.5 h-3.5 ${isCompiling && compiledFormat === "docx" ? "animate-spin" : ""}`} />
            <span>{isCompiling && compiledFormat === "docx" ? "Compiling Word..." : "Compile as Word (.docx)"}</span>
          </button>

          <button
            onClick={fetchVaultDetails}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Sync Vault Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Planning Cycle</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">FY {activeCycle || "2028-2030"}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Certified Plan Status</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${(compiledPdfUrl || compiledDocxUrl) ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {(compiledPdfUrl || compiledDocxUrl) ? "Certified & Available" : "Pending Compilation"}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">DBM OSPS Integration</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">CSV Ready</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-sky-50 dark:bg-slate-800 text-sky-600 dark:text-sky-400 rounded-xl shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Official Document Vault</span>
            <h3 className="text-base font-bold text-sky-600 dark:text-sky-400 font-mono mt-0.5">Active Records</h3>
          </div>
        </div>
      </div>

      {/* Error and Success Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-start justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="space-y-1">
              {typeof error === "string" ? (
                <span className="whitespace-pre-wrap leading-relaxed">{error}</span>
              ) : (
                error
              )}
            </div>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 7-STAGE COMPILATION STEPPER PIPELINE */}
      {(isCompiling || progressPercent > 0) && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 font-serif">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                <span>Compilation Pipeline ({compiledFormat === "docx" ? "Word .docx" : "PDF"})</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                Current Operation: <strong className="text-slate-800 dark:text-slate-200 font-mono">{currentStepMessage || "Processing layout..."}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{progressPercent}%</span>
              <span className="text-[10px] text-slate-400">Complete</span>
            </div>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                progressPercent === 100 ? "bg-emerald-500" : "bg-blue-600"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2 pt-1 font-sans">
            {COMPILATION_STAGES.map((stg) => {
              const isPast = progressPercent >= stg.percent;
              const isCurrent = currentStageIndex === stg.step && isCompiling;

              return (
                <div 
                  key={stg.step}
                  className={`p-3 rounded-xl border text-center space-y-1.5 transition-all ${
                    isPast
                      ? "bg-emerald-50/60 dark:bg-emerald-955/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300"
                      : isCurrent
                      ? "bg-blue-50 dark:bg-blue-955/40 border-blue-400 dark:border-blue-700 text-blue-900 dark:text-blue-300 ring-2 ring-blue-500/20"
                      : "bg-slate-50 dark:bg-slate-955 border-slate-200 dark:border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="flex justify-center">
                    {isPast ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                        ✓
                      </span>
                    ) : isCurrent ? (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] animate-pulse">
                        {stg.step}
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-mono text-[10px]">
                        {stg.step}
                      </span>
                    )}
                  </div>
                  <strong className="block text-[10px] font-bold uppercase truncate" title={stg.name}>
                    {stg.name}
                  </strong>
                  <span className="block text-[8.5px] text-slate-500 dark:text-slate-400 font-mono">
                    {stg.percent}% Stage
                  </span>
                </div>
              );
            })}
          </div>

          {compilationLogs.length > 0 && (
            <div className="bg-slate-955 text-slate-300 p-3.5 rounded-xl font-mono text-[9.5px] max-h-36 overflow-y-auto space-y-1 border border-slate-800">
              <span className="text-slate-500 block uppercase font-bold text-[8.5px] tracking-wider border-b border-slate-800 pb-1">
                Real-Time Worker Execution Diagnostics
              </span>
              {compilationLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  <span className="text-slate-500">[{log.time}]</span>{" "}
                  <span className={log.type === "error" ? "text-rose-400 font-bold" : log.type === "success" ? "text-emerald-400 font-bold" : "text-slate-300"}>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CURRENT ACTIVE PLAN CERTIFIED CARD */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[9px] font-bold font-mono uppercase">
                Active Cycle Document
              </span>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Republic of the Philippines &bull; {agencyName} ISSP ({activeCycle})
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              Official Information Systems Strategic Plan compiled strictly in accordance with DICT ISSP Guidelines v.2026.
            </p>
          </div>

          {/* DUAL EXPORT PERSISTENCE: INDEPENDENT DOWNLOAD BUTTONS */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportDbmCsv}
              disabled={exportingCsv}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-300 dark:border-slate-700 font-bold flex items-center gap-1.5 text-xs cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>DBM CSV</span>
            </button>

            {compiledPdfUrl && (
              <a
                href={compiledPdfUrl}
                download={`ISSP_${activeCycle}_FINAL.pdf`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm text-xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Certified PDF</span>
              </a>
            )}

            {compiledDocxUrl && (
              <a
                href={compiledDocxUrl}
                download={`ISSP_${activeCycle}_FINAL.docx`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm text-xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Word (.docx)</span>
              </a>
            )}

            {!compiledPdfUrl && !compiledDocxUrl && (
              <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px] font-semibold bg-amber-50 dark:bg-amber-955/40 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900">
                Awaiting Compilation
              </span>
            )}

            <button
              type="button"
              onClick={() => handleTriggerCompilation("pdf")}
              disabled={isCompiling}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1 text-xs cursor-pointer shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{compiledPdfUrl ? "Re-Compile PDF" : "Compile PDF"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerCompilation("docx")}
              disabled={isCompiling}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1 text-xs cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{compiledDocxUrl ? "Re-Compile Word" : "Compile Word"}</span>
            </button>
          </div>
        </div>

        {/* Narrative & Signatory Snapshot Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-955 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]">
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Prepared By (CIO)</span>
            <strong className="text-slate-800 dark:text-slate-200 block truncate">
              {coverDetails.cioSignatory}
            </strong>
            <span className="text-[9.5px] text-slate-400 block truncate">{narrative?.preparer_position || "Director, ICT Management Office"}</span>
          </div>

          <div>
            <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Approved By (Agency Head)</span>
            <strong className="text-slate-800 dark:text-slate-200 block truncate">
              {coverDetails.headSignatory}
            </strong>
            <span className="text-[9.5px] text-slate-400 block truncate">{coverDetails.agencyHeadTitle}</span>
          </div>

          <div>
            <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Storage Repository &amp; Scope</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold block">
              Official Document Vault
            </span>
            <span className="text-[9.5px] text-slate-400 block">Scope: {coverDetails.scopeVal}</span>
          </div>
        </div>
      </div>

      {/* HISTORICAL ISSP PLAN ARCHIVES & PERMANENT INSTITUTIONAL REPOSITORY */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 font-serif">
              <Archive className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Historical ISSP Plan Archives &amp; Permanent Institutional Repository</span>
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
              Certified snapshots of concluded planning cycles preserved in compliance with government records retention mandates.
            </p>
          </div>
          <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold">
            {historicalCycles.length} Indexed Plans
          </span>
        </div>

        <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <span>
            <strong>Official Records Preservation:</strong> When an active planning cycle concludes, the governance engine compiles and certifies the final document snapshot for permanent archival. Archived plans are retained for audit, longitudinal tracking, and regulatory inspection.
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 uppercase font-bold text-[9.5px] font-mono">
                <th className="p-3.5">ISSP Planning Cycle</th>
                <th className="p-3.5">Classification</th>
                <th className="p-3.5">Storage Repository</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Vault Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {historicalCycles.map((cycleItem) => (
                <tr key={cycleItem.cycle} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors font-mono">
                  <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                    FY {cycleItem.cycle}
                  </td>
                  <td className="p-3.5 font-sans text-slate-600 dark:text-slate-300">
                    {cycleItem.label}
                  </td>
                  <td className="p-3.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 text-[9px] font-bold flex items-center gap-1 w-fit">
                      <Archive className="w-3 h-3" />
                      <span>{cycleItem.tier}</span>
                    </span>
                  </td>
                  <td className="p-3.5 font-sans">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {cycleItem.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right font-sans">
                    <div className="flex items-center justify-end gap-1.5">
                      {cycleItem.pdfUrl && (
                        <a
                          href={cycleItem.pdfUrl}
                          download={`ISSP_${cycleItem.cycle}_FINAL.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-blue-600 dark:text-blue-400 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </a>
                      )}
                      {cycleItem.docxUrl && (
                        <a
                          href={cycleItem.docxUrl}
                          download={`ISSP_${cycleItem.cycle}_FINAL.docx`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-blue-700 dark:text-blue-300 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>Word</span>
                        </a>
                      )}
                      {!cycleItem.pdfUrl && !cycleItem.docxUrl && (
                        <span className="text-slate-400 text-xs italic">Pending</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DYNAMIC COVER PAGE LIVE PREVIEW & PRINT MODAL */}
      {isCoverPreviewOpen && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center bg-slate-50 dark:bg-slate-955 gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 font-serif">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Official DICT ISSP Document Cover Page Preview</span>
                </h3>
                <p className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                  Dynamic Form Layout &bull; Page 1 of Official Plan (DICT Form Guidelines v.2026)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setIsCoverPreviewOpen(false); navigate("/admin/narratives"); }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title="Configure Signatories, Emblem & Scope"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit in Narrative Studio</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintCoverPage}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 text-xs cursor-pointer shadow-sm transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Formal Cover Sheet</span>
                </button>

                <button 
                  type="button"
                  onClick={() => setIsCoverPreviewOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-955 flex justify-center">
              <div 
                id="issp-cover-sheet-print-container" 
                className="bg-white text-slate-900 rounded-xl border border-slate-300 p-8 shadow-xl max-w-4xl w-full font-serif my-auto"
                style={{
                  minHeight: "520px",
                  boxSizing: "border-box"
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "18px" }}>
                  {coverDetails.emblemLogo && (
                    <img 
                      src={coverDetails.emblemLogo} 
                      alt={agencyName} 
                      style={{ height: "110px", width: "110px", objectFit: "contain", margin: "0 auto 8px auto", display: "block" }} 
                    />
                  )}
                  <p style={{ fontSize: "8.5pt", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, color: "#475569", lineHeight: 1.35, fontFamily: "sans-serif" }}>
                    Republic of the Philippines<br />
                    <strong style={{ fontSize: "12pt", color: "#0f172a", fontFamily: "Palatino Linotype, Book Antiqua, Palatino, serif" }}>{agencyName.toUpperCase()}</strong><br />
                    <span style={{ fontSize: "8.5pt", color: "#64748b" }}>{narrative?.agency_address || ""}</span></p>
                </div>

                <div style={{ textAlign: "center", margin: "18px 0 16px 0" }}>
                  <h1 style={{ fontSize: "20pt", fontWeight: "bold", margin: "4px 0", color: "#0f172a", letterSpacing: "0.5px" }}>
                    INFORMATION SYSTEMS STRATEGIC PLAN (ISSP)
                  </h1>
                  <div style={{ fontSize: "9.5pt", fontWeight: "bold", margin: "6px 0", color: "#334155", fontFamily: "sans-serif" }}>
                    {coverDetails.isAmend ? "[ ]" : "[X]"} REGULAR ISSP &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    {coverDetails.isAmend ? "[X]" : "[ ]"} AMENDMENT &lt;{coverDetails.amendNum}&gt;
                  </div>
                  <p style={{ fontSize: "11pt", fontWeight: "bold", color: "#1e3a8a", margin: "4px 0" }}>
                    For the period {coverDetails.startYr} to {coverDetails.endYr}
                  </p>
                  <h2 style={{ fontSize: "12.5pt", fontWeight: "bold", textTransform: "uppercase", margin: "4px 0", color: "#0f172a" }}>
                    {agencyName}
                  </h2>
                  <p style={{ fontSize: "8.5pt", fontFamily: "monospace", color: "#64748b", margin: 0 }}>
                    {coverDetails.websiteUrl}
                  </p>
                </div>

                <table style={{ width: "100%", border: "none", marginTop: "28px", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ width: "52%", border: "none", verticalAlign: "top", paddingRight: "30px" }}>
                        <div style={{ marginBottom: "38px" }}>
                          <strong style={{ textTransform: "uppercase", fontSize: "8.5pt", display: "block", color: "#1e3a8a", fontFamily: "sans-serif" }}>
                            PREPARED BY:
                          </strong>
                          <div style={{ width: "92%", textAlign: "center", marginTop: "42px", borderTop: "1.5px solid #0f172a", paddingTop: "4px" }}>
                            <strong style={{ fontSize: "10pt", textTransform: "uppercase", display: "block" }}>
                              {coverDetails.cioSignatory}
                            </strong>
                            <span style={{ fontSize: "8pt", color: "#475569", display: "block" }}>
                              Name &amp; Signature of Chief Information Officer
                            </span>
                          </div>
                        </div>

                        <div>
                          <strong style={{ textTransform: "uppercase", fontSize: "8.5pt", display: "block", color: "#1e3a8a", fontFamily: "sans-serif" }}>
                            APPROVED BY:
                          </strong>
                          <div style={{ width: "92%", textAlign: "center", marginTop: "42px", borderTop: "1.5px solid #0f172a", paddingTop: "4px" }}>
                            <strong style={{ fontSize: "10pt", textTransform: "uppercase", display: "block" }}>
                              {coverDetails.headSignatory}
                            </strong>
                            <span style={{ fontSize: "8pt", color: "#475569", display: "block" }}>
                              Name &amp; Signature of Agency Head
                            </span>
                          </div>
                        </div>
                      </td>

                      <td style={{ width: "48%", border: "none", verticalAlign: "top" }}>
                        <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "12px 14px", fontSize: "8pt", lineHeight: 1.6, fontFamily: "sans-serif" }}>
                          <strong style={{ color: "#1e3a8a", textTransform: "uppercase", display: "block", marginBottom: "4px", borderBottom: "1px solid #e2e8f0", paddingBottom: "2px" }}>
                            Scope
                          </strong>
                          <div>{coverDetails.isDeptWide ? "[X]" : "[ ]"} Department-Wide</div>
                          <div style={{ marginLeft: "14px" }}>
                            {coverDetails.isDeptCo ? "[X]" : "[ ]"} Department - Central Office / Head Office
                          </div>
                          <div style={{ marginLeft: "28px" }}>
                            {coverDetails.isDeptCoOnly ? "[X]" : "[ ]"} Central Office only
                          </div>
                          <div style={{ marginLeft: "28px" }}>
                            {(coverDetails.isDeptCo && coverDetails.hasReg) ? "[X]" : "[ ]"} With Regional Offices / Field Offices &nbsp;&nbsp; 
                            {(coverDetails.isDeptCo && coverDetails.hasBur) ? "[X]" : "[ ]"} With Bureaus
                          </div>
                          <div>{coverDetails.isAgencyWide ? "[X]" : "[ ]"} Agency-Wide</div>
                          <div style={{ marginLeft: "28px" }}>
                            {coverDetails.isAgencyCoOnly ? "[X]" : "[ ]"} Central Office only
                          </div>
                          <div style={{ marginLeft: "28px" }}>
                            {(coverDetails.isAgencyWide && coverDetails.hasReg) ? "[X]" : "[ ]"} With Regional Offices / Field Offices
                          </div>
                          <div style={{ marginLeft: "28px" }}>
                            {coverDetails.isOtherGov ? "[X]" : "[ ]"} Other Government Entity
                          </div>
                          <div>{coverDetails.isLgu ? "[X]" : "[ ]"} LGU</div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}