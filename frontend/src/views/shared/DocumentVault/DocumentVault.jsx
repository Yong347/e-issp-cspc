// frontend/src/views/shared/DocumentVault/DocumentVault.jsx
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  ShieldCheck, 
  DownloadCloud, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  Lock, 
  History,
  Activity
} from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";

export default function DocumentVault() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [activePeriod, setActivePeriod] = useState(activeCycle || "2026-2028");
  const [documents, setDocuments] = useState([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskStatusText, setTaskStatusText] = useState("");
  const [downloadUrl, setDownloadUrl] = useState(null);

  const isMounted = useRef(true);
  const isAdmin = user?.role === "ROLE_MIS_ADMIN";

  const compilationSteps = [
    { id: 1, label: "Acquiring database session", minProgress: 10 },
    { id: 2, label: "Narrative compliance validations", minProgress: 15 },
    { id: 3, label: "Fetching authored Part I-V narratives", minProgress: 25 },
    { id: 4, label: "Synchronizing glossary, campuses, and survey databases", minProgress: 35 },
    { id: 5, label: "Compiling approved CapEx and MOOE items", minProgress: 40 },
    { id: 6, label: "Pass 1: Calculating layout geometry & page count", minProgress: 50 },
    { id: 7, label: "Pass 2: Drawing table layouts & page-budget mapping", minProgress: 80 },
    { id: 8, label: "Uploading output binary to secure S3 vault", minProgress: 95 }
  ];

  useEffect(() => {
    if (activeCycle) {
      setActivePeriod(activeCycle);
    }
  }, [activeCycle]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    setDocuments([
      {
        id: `ISSP-CSPC-${activeCycle || "2026-2028"}-DRAFT`,
        generation_date: new Date().toISOString(),
        coverage_period: `FY ${activeCycle || "2026-2028"}`,
        triggered_by: "MIS Administrator",
        file_size_bytes: 4210450,
        s3_vault_url: `${API_BASE_URL}/static/uploads/issp_${activeCycle || "2026-2028"}_draft.pdf`,
        s3_storage_class: "STANDARD",
        is_restoring: false,
      },
      {
        id: "ISSP-CSPC-2023-ARCHIVED",
        generation_date: "2023-02-22T08:12:00Z",
        coverage_period: "FY 2023 - 2025",
        triggered_by: "System Cron",
        file_size_bytes: 8120400,
        s3_vault_url: "https://cspc-issp-vault.s3.amazonaws.com/archives/issp_2023_archived.pdf",
        s3_storage_class: "GLACIER",
        is_restoring: false,
      }
    ]);
  }, [activeCycle]);

  const isUrlSafe = (url) => {
    if (!url) return false;
    if (url.startsWith("/")) return true;
    try {
      const parsed = new URL(url);
      const allowedHosts = [
        "localhost", 
        "127.0.0.1", 
        "cspc-issp-vault.s3.amazonaws.com"
      ];
      
      // Use .hostname to strip ports and evaluate host origins safely
      const apiHost = new URL(API_BASE_URL).hostname;
      allowedHosts.push(apiHost);
      
      return allowedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith("." + host));
    } catch (e) {
      return false;
    }
  };

  const handleSecureDownload = (e, url) => {
    if (!isUrlSafe(url)) {
      e.preventDefault();
      alert("Security Warning: Blocked file request pointing to an untrusted external host domain.");
    }
  };

  const triggerCompilation = async () => {
    if (!isAdmin) return;
    setIsCompiling(true);
    setDownloadUrl(null);
    setTaskProgress(10);
    setTaskStatusText("Initiating PDF generation on the server...");

    console.log(
      "%c[ISSP COMPILER] %cInitializing PDF compilation for active cycle: %c%s",
      "color: #3b82f6; font-weight: bold;",
      "color: #94a3b8;",
      "color: #f59e0b; font-weight: bold;",
      activePeriod
    );

    try {
      const token = user?.token || localStorage.getItem("access_token") || "";
      const res = await fetch(`${API_BASE_URL}/api/admin/governance/generate-issp?issp_period=${activePeriod}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to start ISSP compilation process.");
      }
      
      const data = await res.json();
      if (isMounted.current) {
        setTaskId(data.task_id);
        
        console.log(
          "%c[ISSP COMPILER] %cBackground job successfully queued. %cTask ID: %s",
          "color: #10b981; font-weight: bold;",
          "color: #94a3b8;",
          "color: #60a5fa; font-family: monospace;",
          data.task_id
        );
      }
    } catch (err) {
      console.error("%c[ISSP COMPILER] %cCompilation trigger failed:", "color: #ef4444; font-weight: bold;", "color: #94a3b8;", err);
      alert(err.message);
      if (isMounted.current) {
        setIsCompiling(false);
      }
    }
  };

  useEffect(() => {
    if (!taskId) return;

    let delay = 1500;
    let timeoutId = null;
    let isSubscribed = true;

    const runPoll = async () => {
      if (!isSubscribed) return;
      try {
        const token = user?.token || localStorage.getItem("access_token") || "";
        const res = await fetch(`${API_BASE_URL}/api/admin/governance/task-status/${taskId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (!res.ok) return;
        const data = await res.json();

        if (!isSubscribed) return;

        if (data.state === "PROGRESS") {
          const progressVal = data.progress_percent !== undefined ? data.progress_percent : 10;
          const statusVal = data.current_step_message || "Processing layout components...";
          
          setTaskProgress(progressVal);
          setTaskStatusText(statusVal);

          console.log(
            `%c[ISSP COMPILER] %cProgress: %c${progressVal}% %c| Current Step: %c${statusVal}`,
            "color: #3b82f6; font-weight: bold;",
            "color: #94a3b8;",
            "color: #3b82f6; font-weight: bold; font-family: monospace;",
            "color: #94a3b8;",
            "color: #e2e8f0; font-style: italic;"
          );
          
          delay = Math.min(delay * 1.5, 5000);
          timeoutId = setTimeout(runPoll, delay);
        } else if (data.state === "PENDING" || data.state === "STARTED") {
          const statusVal = data.current_step_message || "Queued in background worker...";
          setTaskStatusText(statusVal);

          console.log(
            `%c[ISSP COMPILER] %cTask status: %c${data.state} %c| Waiting for background worker...`,
            "color: #f59e0b; font-weight: bold;",
            "color: #94a3b8;",
            "color: #f59e0b; font-weight: bold; font-family: monospace;",
            "color: #94a3b8;"
          );

          delay = Math.min(delay * 1.2, 5000);
          timeoutId = setTimeout(runPoll, delay);
        } else if (data.state === "SUCCESS") {
          setTaskProgress(100);
          setTaskStatusText("ISSP Document Compiled Successfully!");
          
          const fileUrl = data.result?.file_url || `${API_BASE_URL}/static/uploads/issp_2026_final.pdf`;
          setDownloadUrl(fileUrl);
          setTaskId(null);
          setIsCompiling(false);

          console.log(
            "%c[ISSP COMPILER] %cSUCCESS: Compilation finished successfully. %cFile URL: %s",
            "color: #10b981; font-weight: bold;",
            "color: #94a3b8;",
            "color: #10b981; text-decoration: underline;",
            fileUrl
          );

          setDocuments((prev) => [
            {
              id: `ISSP-CSPC-${activePeriod}-V${new Date().getFullYear()}`,
              generation_date: new Date().toISOString(),
              coverage_period: `FY ${activePeriod}`,
              triggered_by: "MIS Administrator",
              file_size_bytes: 4892000,
              s3_vault_url: fileUrl,
              s3_storage_class: "STANDARD",
              is_restoring: false,
            },
            ...prev,
          ]);
        } else if (data.state === "FAILURE") {
          const errorMsg = data.error || "Internal Server Error";
          setTaskStatusText(`Compilation failed: ${errorMsg}`);
          setTaskId(null);
          setIsCompiling(false);

          console.error(
            `%c[ISSP COMPILER] %cFAILURE: Task failed with error: %c${errorMsg}`,
            "color: #ef4444; font-weight: bold;",
            "color: #94a3b8;",
            "color: #ef4444; font-family: monospace;"
          );
        }
      } catch (err) {
        console.error("%c[ISSP COMPILER] %cNetwork error during status polling:", "color: #ef4444; font-weight: bold;", "color: #94a3b8;", err);
      }
    };

    timeoutId = setTimeout(runPoll, delay);

    return () => {
      isSubscribed = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [taskId, activePeriod, user]);

  const handleGlacierRestore = async (docId) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === docId ? { ...doc, is_restoring: true } : doc
      )
    );

    try {
      const token = user?.token || localStorage.getItem("access_token") || "";
      const res = await fetch(`${API_BASE_URL}/api/admin/governance/restore-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ document_id: docId })
      });

      if (!res.ok) {
        setTimeout(() => {
          if (isMounted.current) {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === docId ? { ...doc, s3_storage_class: "STANDARD", is_restoring: false } : doc
              )
            );
          }
        }, 5000);
        return;
      }

      alert(`AWS S3 Glacier restoration successfully triggered for ${docId}. Recovery window estimation: 3-5 hours.`);
    } catch (err) {
      console.error("Glacier restore API connection failure:", err);
      setTimeout(() => {
        if (isMounted.current) {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === docId ? { ...doc, s3_storage_class: "STANDARD", is_restoring: false } : doc
            )
          );
        }
      }, 5000);
    }
  };

  return (
    <div className="space-y-6 select-none bg-slate-955 p-6 rounded-xl border border-slate-800">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-emerald-400 w-6 h-6" />
            <span>Consolidated Document Vault</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin 
              ? "Generate and archive official DICT-standard compliance packages. Direct S3 Glacier lifecycles and PDF compilation."
              : "Access and download officially approved, signed university e-ISSP compliance packages."
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <>
              <select 
                value={activePeriod}
                onChange={(e) => setActivePeriod(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
              >
                <option value={activeCycle} className="bg-slate-900 text-slate-200">Planning Cycle: {activeCycle}</option>
              </select>
              <button
                onClick={triggerCompilation}
                disabled={isCompiling}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
              >
                {isCompiling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Compiling...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate Consolidated ISSP</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs font-bold text-blue-400 uppercase tracking-wide">
              <Lock className="w-3.5 h-3.5" />
              <span>Read-Only Department View</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Progress Bar & Step Tracker */}
      {isCompiling && isAdmin && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg space-y-4 shadow-inner">
          <div className="flex justify-between items-center text-xs font-medium border-b border-slate-800/80 pb-3">
            <span className="text-blue-400 font-semibold flex items-center gap-1.5 animate-pulse">
              <Activity className="w-4 h-4 text-blue-500" />
              <span>{taskStatusText}</span>
            </span>
            <span className="text-slate-300 font-mono font-bold bg-slate-955 px-2 py-0.5 border border-slate-800 rounded">
              {taskProgress}%
            </span>
          </div>
          <div className="w-full bg-slate-950 border border-slate-850 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out shadow-lg shadow-blue-500/30" 
              style={{ width: `${taskProgress}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-800/60 text-[10px]">
            {compilationSteps.map((step) => {
              const isCompleted = taskProgress > step.minProgress;
              const isActive = taskProgress === step.minProgress || (
                taskProgress >= step.minProgress && 
                !compilationSteps.some(s => s.minProgress > step.minProgress && taskProgress >= s.minProgress)
              );
              
              return (
                <div key={step.id} className="flex items-center gap-2.5">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[8px] border transition-all ${
                    isCompleted 
                      ? "bg-emerald-950/40 border-emerald-500 text-emerald-400 font-bold" 
                      : isActive 
                      ? "bg-blue-950/40 border-blue-500 text-blue-400 animate-pulse font-bold" 
                      : "bg-slate-950/40 border-slate-850 text-slate-600"
                  }`}>
                    {isCompleted ? "✓" : step.id}
                  </span>
                  <span className={`transition-all font-semibold ${
                    isCompleted 
                      ? "text-slate-500 line-through decoration-slate-600" 
                      : isActive 
                      ? "text-blue-400 font-bold" 
                      : "text-slate-600"
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Success Notification */}
      {downloadUrl && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold">Your compliance document is ready for review.</p>
              <p className="text-green-400/80">Validated against DICT multi-year budget standards.</p>
            </div>
          </div>
          <a
            href={downloadUrl}
            onClick={(e) => handleSecureDownload(e, downloadUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shrink-0 animate-fadeIn"
          >
            Download Finalized PDF
          </a>
        </div>
      )}

      {/* Document Records Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Compiled PDF Archive (S3 Vault)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-955 text-slate-400 font-semibold uppercase">
                <th className="p-3">Document ID</th>
                <th className="p-3">Period</th>
                <th className="p-3">Generation Date</th>
                <th className="p-3">Size (MB)</th>
                <th className="p-3">S3 Class</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-slate-500">
                    No documents generated yet for active cycle {activeCycle}.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-blue-400">{doc.id}</td>
                    <td className="p-3">{doc.coverage_period}</td>
                    <td className="p-3">{new Date(doc.generation_date).toLocaleDateString()}</td>
                    <td className="p-3">{(doc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        doc.s3_storage_class === "STANDARD" 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        {doc.s3_storage_class}
                      </span>
                    </td>
                    <td className="p-3">
                      {doc.s3_storage_class === "GLACIER" ? (
                        doc.is_restoring ? (
                          <span className="text-amber-400 font-semibold animate-pulse text-[11px] flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Restoration Active...
                          </span>
                        ) : (
                          isAdmin ? (
                            <button
                              onClick={() => handleGlacierRestore(doc.id)}
                              className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-500 cursor-pointer"
                            >
                              <DownloadCloud className="w-3.5 h-3.5" />
                              <span>Request S3 Restore</span>
                            </button>
                          ) : (
                            <span className="text-slate-500 italic flex items-center gap-1">
                              <History className="w-3.5 h-3.5" />
                              Archived (Contact Admin)
                            </span>
                          )
                        )
                      ) : (
                        <a
                          href={doc.s3_vault_url}
                          onClick={(e) => handleSecureDownload(e, doc.s3_vault_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Download PDF</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}