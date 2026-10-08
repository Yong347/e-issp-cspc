// frontend/src/views/admin/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Inbox, 
  CheckCheck, 
  Landmark, 
  Bolt, 
  Terminal, 
  RefreshCw, 
  Lock, 
  Download, 
  ArrowRight,
  X,
  Activity,
  Check,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Calendar,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import Modal from "../../../components/common/Modal";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");
  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  // Key Dashboard Statistics
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [budgetMetrics, setBudgetMetrics] = useState({
    global_ceiling: 200000000.00,
    total_spent: 0.00
  });

  // Table Data & Filter
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [statusFilterTab, setStatusFilterTab] = useState("Submitted"); // "Submitted" | "Approved" | "All"

  // Compiler Verification & Parity Audit State
  const [isVerifying, setIsVerifying] = useState(false);
  const [compilerAudit, setCompilerAudit] = useState(null);

  // Background Document Compilation State (Dual-Format Tracking: PDF vs Word .docx)
  const [isGenerating, setIsGenerating] = useState(false);
  const [compiledFormat, setCompiledFormat] = useState("pdf"); // "pdf" | "docx"
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatusMsg, setGenerationStatusMsg] = useState("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState("");
  const [docxDownloadUrl, setDocxDownloadUrl] = useState("");
  
  // Real-time Event Logger & Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [systemLogs, setSystemLogs] = useState(() => {
    const timeStr = new Date().toTimeString().split(" ")[0];
    return [
      { time: timeStr, text: "SYSTEM: Governance engine initialized for active planning cycle.", type: "text-emerald-400" },
      { time: timeStr, text: "AUDIT: Singularity graph and budget sub-ceilings online.", type: "text-blue-400" }
    ];
  });

  // Return Proposal Action Modal
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [returnRemark, setReturnRemark] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [alertError, setAlertError] = useState(null);
  const [alertSuccess, setAlertSuccess] = useState(null);

  const addSystemLog = (text, type = "") => {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    setSystemLogs(prev => [{ time: timeStr, text, type }, ...prev.slice(0, 49)]);
  };

  const getDeptName = (proposal) => {
    if (proposal.target_office_automated) return proposal.target_office_automated;
    if (proposal.department?.name) return proposal.department.name;
    const deptObj = departments.find(d => (d.department_id || d.id) === proposal.department_id);
    return deptObj ? (deptObj.department_name || deptObj.name) : "Central Office";
  };

  const fetchLiveProposals = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Department Roster
      const deptRes = await fetch(`${apiUrl}/api/admin/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null);

      if (deptRes && deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(Array.isArray(deptData) ? deptData : []);
      }

      // 2. Fetch Proposals Queue for active cycle
      const response = await fetch(`${apiUrl}/api/admin/proposals?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch database queue.");
      
      const payload = await response.json();
      const itemsList = Array.isArray(payload) ? payload : (payload.data || []);
      setProposals(itemsList);

      // 3. Fetch Master Dashboard Metrics
      const metricsResponse = await fetch(`${apiUrl}/api/admin/dashboard-metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setBudgetMetrics({
          global_ceiling: metricsData.global_ceiling || 200000000.00,
          total_spent: metricsData.total_spent || 0.00
        });
        setPendingCount(metricsData.pending_count ?? itemsList.filter(p => p.status === "Submitted").length);
        setApprovedCount(metricsData.approved_count ?? itemsList.filter(p => p.status === "Approved").length);
      } else {
        setPendingCount(itemsList.filter(p => p.status === "Submitted").length);
        setApprovedCount(itemsList.filter(p => p.status === "Approved").length);
      }

      // 4. Fetch Live COA Audit Logs
      const auditRes = await fetch(`${apiUrl}/api/admin/audit-logs?limit=15`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null);

      if (auditRes && auditRes.ok) {
        const auditData = await auditRes.json();
        if (Array.isArray(auditData)) {
          setAuditLogs(auditData);
        }
      }

      // 5. Fetch Active Master Narrative to hydrate pre-compiled vault URLs independently
      const narrRes = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null);

      if (narrRes && narrRes.ok) {
        const narrData = await narrRes.json();
        if (narrData.final_pdf_vault_url) {
          setPdfDownloadUrl(narrData.final_pdf_vault_url);
        }
        if (narrData.final_docx_vault_url) {
          setDocxDownloadUrl(narrData.final_docx_vault_url);
        }
      }
    } catch (err) {
      addSystemLog(`ERROR: Database connection failed. ${err.message}`, "text-rose-400");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, activeCycle]);

  useEffect(() => {
    if (token) {
      fetchLiveProposals();
    }
  }, [token, activeCycle, fetchLiveProposals]);

  // Compiler Verification Pipeline (Singularity Graph & 4-Way Parity)
  const runCompilerVerification = async () => {
    setIsVerifying(true);
    setAlertError(null);
    addSystemLog(`VERIFY: Auditing Singularity Graph and 4-way parity for cycle FY ${activeCycle}...`, "text-blue-400");

    try {
      const res = await fetch(`${apiUrl}/api/admin/governance/verify-compiler-sync?module=parity&issp_period=${encodeURIComponent(activeCycle)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let errMsg = err.detail || "Compiler sync verification failed.";
        if (typeof errMsg === "object" && errMsg !== null && errMsg.violations) {
          errMsg = `${errMsg.error || "Validation Failure"}: ${errMsg.violations.join(" | ")}`;
        }
        throw new Error(errMsg);
      }

      const data = await res.json();
      setCompilerAudit(data);

      if (data.compiler_ready) {
        addSystemLog("SUCCESS: Singularity Graph verified. 4-Way Parity confirmed across all cycle tables.", "text-emerald-400");
        setAlertSuccess("Compiler sync verified: Four-way financial parity is balanced and ready for compilation.");
      } else {
        addSystemLog(`WARNING: Parity or linkage disconnect detected: ${data.warnings?.join(" | ")}`, "text-amber-400");
      }
    } catch (err) {
      addSystemLog(`VERIFY FAILED: ${err.message}`, "text-rose-400");
      setAlertError(`Compiler verification failure: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // 1-Click Proposal Approval Action
  const handleApprove = async (id, itemName) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${id}/approve`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Approval transaction failed.");
      }
      
      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: "Approved" } : p));
      setPendingCount(prev => (prev > 0 ? prev - 1 : 0));
      setApprovedCount(prev => prev + 1);
      
      addSystemLog(`APPROVED: "${itemName}" approved.`, "text-emerald-400");
      setAlertSuccess(`"${itemName}" approved successfully.`);
    } catch (err) {
      addSystemLog(`ERROR: Approval failed - ${err.message}`, "text-rose-400");
      setAlertError(`Approval failed: ${err.message}`);
    }
  };

  // Return Proposal with Department Action Item Comment
  const submitReturnModal = async (e) => {
    e.preventDefault();
    if (!returnModalItem || !returnRemark.trim()) return;

    setIsSubmittingReturn(true);
    const { id, item_name: itemName } = returnModalItem;

    try {
      const returnRes = await fetch(`${apiUrl}/api/admin/proposals/${id}/return`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!returnRes.ok) {
        const errData = await returnRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Return state transition failed.");
      }

      await fetch(`${apiUrl}/api/dept/proposals/${id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          text: returnRemark.trim(),
          proposal_id: id,
          requires_department_action: true
        })
      });

      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: "Returned" } : p));
      setPendingCount(prev => (prev > 0 ? prev - 1 : 0));
      
      addSystemLog(`RETURNED: "${itemName}" returned to department with instructions.`, "text-amber-400");
      setReturnModalItem(null);
      setReturnRemark("");
      setAlertSuccess(`"${itemName}" returned to department.`);
    } catch (err) {
      setAlertError(`Return execution failed: ${err.message}`);
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Background Async Document Generation (Supports PDF and Word .docx independently)
  const triggerGeneration = async (exportFormat = "pdf") => {
    setIsGenerating(true);
    setCompiledFormat(exportFormat);
    setGenerationProgress(15);
    const formatLabel = exportFormat === "docx" ? "Word (.docx)" : "PDF";
    setGenerationStatusMsg(`Queuing background task (${formatLabel}) & verifying admin cryptographic token...`);
    addSystemLog(`INIT: Dispatching document trigger payload (${formatLabel}) to background compilation workers...`, "text-blue-400");

    try {
      const response = await fetch(`${apiUrl}/api/admin/governance/generate-issp?issp_period=${encodeURIComponent(activeCycle)}&export_format=${encodeURIComponent(exportFormat)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        let detailMsg = errData.detail;
        if (typeof detailMsg === "object" && detailMsg !== null && detailMsg.violations) {
          detailMsg = `${detailMsg.error || "Validation Failure"}:\n• ${detailMsg.violations.join("\n• ")}`;
        } else if (Array.isArray(detailMsg)) {
          detailMsg = detailMsg.map(e => e.msg || JSON.stringify(e)).join(" | ");
        }
        throw new Error(detailMsg || "Compilation queue registration failed.");
      }
      const data = await response.json();
      
      if (data.task_id) {
        addSystemLog(`SUCCESS: Worker task registered (Task ID: ${data.task_id}, Format: ${exportFormat.toUpperCase()})`, "text-emerald-400");
        pollTaskStatus(data.task_id, exportFormat);
      }
    } catch (err) {
      addSystemLog(`ERROR: Task dispatch failed: ${err.message}`, "text-rose-400");
      setAlertError(`Document compilation failed: ${err.message}`);
      setIsGenerating(false);
    }
  };

  const pollTaskStatus = async (taskId, exportFormat = "pdf") => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/governance/task-status/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.state === "PROGRESS" || data.state === "PENDING") {
        const prog = data.progress_percent || (data.meta && data.meta.progress) || 35;
        const msg = data.current_step_message || (data.meta && data.meta.step) || "Compiling layout packages and asserting 4-way parity...";
        setGenerationProgress(prog);
        setGenerationStatusMsg(msg);
        addSystemLog(`COMPILER [${prog}%]: ${msg}`, "text-slate-400");
        setTimeout(() => pollTaskStatus(taskId, exportFormat), 1500);
      } else if (data.state === "SUCCESS") {
        setGenerationProgress(100);
        const downloadUrl = data.result?.file_url || data.download_url || (typeof data.result === "string" ? data.result : "");
        const isDocx = (data.result?.format === "docx") || downloadUrl.includes(".docx") || exportFormat === "docx";
        const formatLabel = isDocx ? "Word (.docx)" : "PDF";

        if (isDocx) {
          setDocxDownloadUrl(downloadUrl);
        } else {
          setPdfDownloadUrl(downloadUrl);
        }

        setGenerationStatusMsg(`Official ISSP ${formatLabel} certified and archived successfully!`);
        setIsGenerating(false);
        addSystemLog(`SUCCESS: Official ISSP ${formatLabel} certified, timestamped, and archived.`, "text-emerald-400");
        setAlertSuccess(`Document compilation completed successfully! You can now download the certified ${formatLabel}.`);
        fetchLiveProposals();
      } else if (data.state === "FAILURE") {
        setIsGenerating(false);
        const errMsg = data.error || (data.result && data.result.error) || "Dual-pass compilation failed.";
        addSystemLog(`ERROR: Compilation failed: ${errMsg}`, "text-rose-400");
        setAlertError(`Document generation failed: ${errMsg}`);
      }
    } catch (e) {
      console.error("Task polling exception:", e);
      setIsGenerating(false);
      setAlertError(`Polling error: ${e.message}`);
    }
  };

  const utilizationPercent = budgetMetrics.global_ceiling > 0 
    ? (budgetMetrics.total_spent / budgetMetrics.global_ceiling) * 100 
    : 0;

  // Filter proposals displayed in quick review table
  const filteredProposals = proposals.filter(p => {
    if (statusFilterTab === "Submitted") return p.status === "Submitted";
    if (statusFilterTab === "Approved") return p.status === "Approved";
    return true;
  });

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 font-sans select-none">
      
      {/* Alert Notifications */}
      {alertError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-2xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="font-semibold whitespace-pre-wrap">{alertError}</span>
          </div>
          <button onClick={() => setAlertError(null)} className="text-current font-bold p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {alertSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-2xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold">{alertSuccess}</span>
          </div>
          <button onClick={() => setAlertSuccess(null)} className="text-current font-bold p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4-Card Governance KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Pending Intake Queue */}
        <div 
          onClick={() => navigate("/admin/queue?status_filter=Submitted")}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xs hover:border-amber-400 dark:hover:border-amber-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-50 dark:bg-amber-955/40 text-amber-600 dark:text-amber-400 rounded-xl group-hover:scale-105 transition-transform">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{pendingCount}</h3>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Pending Proposals</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Card 2: Approved Proposals Pool */}
        <div 
          onClick={() => navigate("/admin/queue?status_filter=Approved")}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xs hover:border-emerald-400 dark:hover:border-emerald-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-955/40 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
              <CheckCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{approvedCount}</h3>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Approved Pool</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Card 3: Active Planning Cycle */}
        <div 
          onClick={() => navigate("/admin/narratives")}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xs hover:border-blue-400 dark:hover:border-blue-500/50 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-50 dark:bg-blue-955/40 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold font-mono text-slate-900 dark:text-white">FY {activeCycle}</h3>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Active ISSP Horizon</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </div>

        {/* Card 4: Global Ceiling Utilization */}
        <div 
          onClick={() => navigate("/admin/budget")}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl space-y-2 shadow-xs hover:border-purple-400 dark:hover:border-purple-500/50 transition-all cursor-pointer"
        >
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            <span className="flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-purple-500" />
              <span>Ceiling Utilization</span>
            </span>
            <span className="font-mono">{utilizationPercent.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-sm font-bold text-slate-900 dark:text-white truncate">
            ₱{budgetMetrics.total_spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                utilizationPercent > 100 ? "bg-rose-500" : utilizationPercent > 80 ? "bg-amber-500" : "bg-blue-600"
              }`}
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }} 
            />
          </div>
        </div>

      </div>

      {/* Main Actionable Review Ledger */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        
        {/* Table Filter & Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/50 dark:bg-slate-955">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Actionable Proposals Queue (Part IV.A)</span>
            </h3>
            
            {/* Quick Status Pill Tabs */}
            <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setStatusFilterTab("Submitted")}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilterTab === "Submitted"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Submitted ({proposals.filter(p => p.status === "Submitted").length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilterTab("Approved")}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilterTab === "Approved"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Approved ({proposals.filter(p => p.status === "Approved").length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilterTab("All")}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilterTab === "All"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                All ({proposals.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={runCompilerVerification} 
              disabled={isVerifying}
              className="p-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 font-bold shadow-xs cursor-pointer disabled:opacity-50"
              title="Audit Singularity Graph and Four-Way Parity Balance"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
              <span>{isVerifying ? "Auditing..." : "Audit Parity"}</span>
            </button>

            <button 
              type="button"
              onClick={fetchLiveProposals} 
              disabled={loading}
              className="p-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 font-bold shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Verification Banner (if executed) */}
        {compilerAudit && (
          <div className={`p-3 px-4 border-b text-xs flex flex-col sm:flex-row justify-between sm:items-center gap-2 ${
            compilerAudit.compiler_ready
              ? "bg-emerald-50 dark:bg-emerald-955/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-50 dark:bg-amber-955/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300"
          }`}>
            <div className="flex items-center gap-2 font-mono">
              {compilerAudit.compiler_ready ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>
                <strong>Singularity Graph Status:</strong> {compilerAudit.message}
              </span>
            </div>
            <button
              onClick={() => navigate("/admin/parity-summary")}
              className="text-[11px] underline font-bold hover:opacity-80 flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>View Parity Matrices</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Proposals Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Resource Description</th>
                <th className="p-3.5">Project Provenance</th>
                <th className="p-3.5 text-center">Qty</th>
                <th className="p-3.5 font-mono">Unit Cost</th>
                <th className="p-3.5 font-mono">Total Outlay</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
              {filteredProposals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 italic">
                    No proposals match the current filter in cycle FY {activeCycle}.
                  </td>
                </tr>
              ) : (
                filteredProposals.slice(0, 10).map(p => {
                  const isProjectBound = Boolean(p.project_id);
                  const totalCostNum = Number(p.total_cost || (p.unit_cost * p.total_qty) || 0);
                  const isCapitalOutlay = totalCostNum >= 50000 || (p.uacs_object_code || "").toLowerCase().includes("(co)");
                  const isStandaloneOperational = [
                    "office productivity", 
                    "continuing costs/expenses", 
                    "continuing costs"
                  ].includes((p.strategic_category || "").toLowerCase().trim()) && !isCapitalOutlay;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-955/30 transition-colors">
                      <td className="p-3.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {getDeptName(p)}
                      </td>
                      <td className="p-3.5 max-w-xs">
                        <div className="font-semibold text-slate-900 dark:text-white truncate" title={p.item_name}>
                          {p.item_name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {p.category} &bull; {p.strategic_category}
                        </div>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        {isProjectBound ? (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded font-mono text-[9.5px] font-bold flex items-center gap-1 w-fit">
                            <Layers className="w-3 h-3" />
                            <span>Project-Bound</span>
                          </span>
                        ) : isStandaloneOperational ? (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded font-mono text-[9.5px] font-medium w-fit block">
                            Standalone OpEx
                          </span>
                        ) : p.status === "Approved" ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-955/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded font-mono text-[9.5px] font-bold w-fit block" title="Quarantined in Intake Pool until linked to an ICT Project">
                            Intake Pool (Needs Project Link)
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono italic">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-slate-900 dark:text-white">
                        {p.total_qty || 0}
                      </td>
                      <td className="p-3.5 font-mono text-slate-900 dark:text-white whitespace-nowrap">
                        ₱{Number(p.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        ₱{Number(p.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase ${
                          p.status === "Approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" :
                          p.status === "Returned" ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20" :
                          "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {p.status === "Submitted" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              type="button"
                              onClick={() => handleApprove(p.id, p.item_name)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition-colors cursor-pointer text-[10.5px] shadow-xs"
                            >
                              Approve
                            </button>
                            <button 
                              type="button"
                              onClick={() => { setReturnModalItem(p); setReturnRemark("Technical quotation or justification requires update."); }}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded font-bold transition-colors cursor-pointer text-[10.5px]"
                            >
                              Return
                            </button>
                          </div>
                        ) : p.status === "Approved" && !isProjectBound && !isStandaloneOperational ? (
                          <button
                            type="button"
                            onClick={() => navigate("/admin/projects/internal")}
                            className="text-[10.5px] text-blue-600 dark:text-blue-400 hover:underline font-bold font-mono flex items-center justify-end gap-1 cursor-pointer"
                          >
                            <span>Assign Project</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono font-bold uppercase flex items-center justify-end gap-1">
                            <Lock className="w-3 h-3" /> Locked
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* View All Link Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-955 flex justify-between items-center text-[11px]">
          <span className="text-slate-500 font-mono">
            Showing up to 10 actionable items for cycle FY {activeCycle}
          </span>
          <button
            type="button"
            onClick={() => navigate("/admin/queue")}
            className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Open Consolidated Master Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compiler Trigger & Dual-Stream Audit Feeds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Document Compilation Engine (Dual-Format Architecture: PDF vs Word DOCX) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between shadow-xs space-y-4">
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Bolt className="w-4 h-4 text-blue-500" />
              <span>ISSP Document Compilation Engine</span>
            </h4>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
              Dispatches dual-pass compilation with four-way financial parity assertion across Tables B.1 through B.4. Generates certified PDF or editable Word (.docx) formats with roman-numeral preliminary pagination and strict DICT v.2026 table styling.
            </p>

            {/* In-Progress Stepper View */}
            {isGenerating && (
              <div className="p-3.5 bg-blue-50/70 dark:bg-slate-955 rounded-xl border border-blue-200 dark:border-blue-900 space-y-2.5 animate-fadeIn">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    <span>{generationStatusMsg || "Compiling layout packages..."}</span>
                  </span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{generationProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(10, generationProgress)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            {/* Active Vault Download Links if either format has been compiled */}
            {(pdfDownloadUrl || docxDownloadUrl) && (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {pdfDownloadUrl && (
                  <a 
                    href={pdfDownloadUrl} 
                    download={`ISSP_${activeCycle}_FINAL.pdf`}
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 min-w-[170px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Certified PDF</span>
                  </a>
                )}
                {docxDownloadUrl && (
                  <a 
                    href={docxDownloadUrl} 
                    download={`ISSP_${activeCycle}_FINAL.docx`}
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex-1 min-w-[170px] py-2.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Word (.docx)</span>
                  </a>
                )}
              </div>
            )}

            {/* Compilation Action Triggers */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button 
                type="button"
                onClick={() => triggerGeneration("pdf")}
                disabled={isGenerating}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer shadow-sm transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating && compiledFormat === "pdf" ? "animate-spin" : ""}`} />
                <span>{isGenerating && compiledFormat === "pdf" ? "Compiling PDF..." : pdfDownloadUrl ? "Re-Compile PDF" : `Compile PDF (FY ${activeCycle})`}</span>
              </button>
              <button 
                type="button"
                onClick={() => triggerGeneration("docx")}
                disabled={isGenerating}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 disabled:opacity-50 font-bold rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer shadow-xs transition-all"
                title="Compile as editable Word document (.docx)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating && compiledFormat === "docx" ? "animate-spin" : ""}`} />
                <span>{isGenerating && compiledFormat === "docx" ? "Compiling Word..." : docxDownloadUrl ? "Re-Compile Word" : "Compile Word (.docx)"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live COA Audit Trail & System Log Feed */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xs">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-400" />
              <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[9.5px] font-mono">
                Statutory Audit &amp; Event Stream
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/admin/audit")}
              className="text-[10px] font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Full Audit Logs</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </div>

          <div className="p-4 flex-1">
            <div className="bg-slate-955 p-3 rounded-xl font-mono text-[9px] h-36 overflow-y-auto space-y-1.5 custom-scrollbar text-slate-200">
              {/* Combine live in-browser logs with database audit logs */}
              {systemLogs.map((log, i) => (
                <div key={`sys-${i}`} className="leading-relaxed">
                  <span className="text-slate-500">[{log.time}]</span> <span className={log.type}>{log.text}</span>
                </div>
              ))}
              {auditLogs.map((log) => {
                const time = log.timestamp ? new Date(log.timestamp).toTimeString().split(" ")[0] : "--:--:--";
                return (
                  <div key={`audit-${log.id}`} className="leading-relaxed border-t border-slate-800/60 pt-1">
                    <span className="text-slate-500">[{time}]</span>{" "}
                    <span className="text-purple-400 font-bold">{log.module}</span> &bull;{" "}
                    <span className="text-slate-300">{log.action}</span>{" "}
                    <span className="text-slate-500 text-[8.5px]">({log.operator_email || "Admin"})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Return Proposal Modal */}
      <Modal
        isOpen={Boolean(returnModalItem)}
        onClose={() => setReturnModalItem(null)}
        title="Return Proposal for Revision"
        subtitle={returnModalItem ? `Item: ${returnModalItem.item_name}` : ""}
      >
        <form onSubmit={submitReturnModal} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500">Department Action Items &amp; Instructions</label>
            <textarea
              rows={3}
              required
              value={returnRemark}
              onChange={e => setReturnRemark(e.target.value)}
              placeholder="Specify required corrections (e.g. Provide 3 valid canvas price quotations, reclassify under Capital Outlay)..."
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none focus:border-blue-500 text-xs font-sans leading-relaxed"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setReturnModalItem(null)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReturn}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmittingReturn ? "Returning..." : "Confirm Return"}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}