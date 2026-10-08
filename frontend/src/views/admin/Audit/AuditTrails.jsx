// frontend/src/views/admin/Audit/AuditTrails.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { getAuditLogs, getDepartments } from "../../../api/admin";
import { 
  History, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  Search, 
  ArrowRight, 
  Shield, 
  Filter, 
  Calendar, 
  Eye, 
  User, 
  X, 
  Clock, 
  Layers, 
  Globe, 
  Lock, 
  Coins, 
  ChevronLeft, 
  ChevronRight,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Database,
  Tag,
  Building,
  Key
} from "lucide-react";

export default function AuditTrails() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();
  
  const [logs, setLogs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedModule, setSelectedModule] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dateSpan, setDateSpan] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Detailed Modal Inspection State
  const [selectedLog, setSelectedLog] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "") || "";

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard navigation for inspection modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedLog) {
        setSelectedLog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLog]);

  const fetchDepartmentsList = useCallback(async () => {
    if (!token) return;
    try {
      let data = null;
      try {
        data = await getDepartments(token);
      } catch {
        const res = await fetch(`${apiUrl}/api/admin/departments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          data = await res.json();
        }
      }
      setDepartments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("Could not load departments dictionary for audit view:", e);
    }
  }, [apiUrl, token]);

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      let data = null;
      if (typeof getAuditLogs === "function") {
        data = await getAuditLogs(token, { limit: 1000 });
      } else {
        const res = await fetch(`${apiUrl}/api/admin/audit-logs?limit=1000`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to load audit logs from the security ledger.");
        }
        data = await res.json();
      }
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Network error loading audit logs.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token]);

  useEffect(() => {
    if (token) {
      fetchLogs();
      fetchDepartmentsList();
    }
  }, [token, activeCycle, fetchLogs, fetchDepartmentsList]);

  const getDepartmentName = useCallback((deptId) => {
    if (!deptId) return null;
    const d = departments.find(dept => (dept.department_id || dept.id) === deptId);
    return d ? (d.department_name || d.name) : `Department ID: ${deptId}`;
  }, [departments]);

  // Context-Aware Routing for Deep Linking
  const handleDeepLinkRedirect = (log) => {
    setSelectedLog(null);
    const targetId = log.proposal_id;
    const mod = (log.module || "").toUpperCase();
    const act = (log.action || "").toUpperCase();

    if (targetId) {
      navigate("/admin/queue", { 
        state: { 
          highlightId: targetId
        } 
      });
      return;
    }

    if (mod === "SYSTEMS" || act.includes("SYSTEM")) {
      navigate("/admin/systems");
      return;
    }

    if (mod === "PROJECTS" || act.includes("PROJECT")) {
      navigate("/admin/projects/internal");
      return;
    }

    if (mod === "INVENTORY" || act.includes("INVENTORY") || act.includes("IIRUP")) {
      navigate("/supply/inventory");
      return;
    }

    if (mod === "AUTHENTICATION" || act.includes("USER") || act.includes("LOGIN")) {
      navigate("/admin/users");
      return;
    }

    if (mod === "GOVERNANCE" && (act.includes("CEILING") || act.includes("BUDGET"))) {
      navigate("/admin/budget");
      return;
    }

    if (mod === "GOVERNANCE" && (act.includes("OUTCOME") || act.includes("CONCERN"))) {
      navigate("/admin/outcomes");
      return;
    }
  };

  // Maps all official modules to high-contrast badges
  const getModuleBadge = (moduleName) => {
    const mod = (moduleName || "GOVERNANCE").toUpperCase();
    switch (mod) {
      case "AUTHENTICATION":
        return {
          label: "Authentication",
          style: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
        };
      case "PROPOSALS":
        return {
          label: "Resource Outlays",
          style: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
        };
      case "SYSTEMS":
        return {
          label: "Information Systems",
          style: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20"
        };
      case "PROJECTS":
        return {
          label: "ICT Projects",
          style: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20"
        };
      case "INVENTORY":
        return {
          label: "Annex 1 Inventory",
          style: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
        };
      case "GOVERNANCE":
      default:
        return {
          label: "ISSP Governance",
          style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
        };
    }
  };

  // Macro Metrics Calculations
  const totalLogs = logs.length;
  const authCount = logs.filter(l => (l.module || "").toUpperCase() === "AUTHENTICATION" || (l.action || "").toUpperCase().includes("LOGIN") || (l.action || "").toUpperCase().includes("USER")).length;
  const proposalCount = logs.filter(l => (l.module || "").toUpperCase() === "PROPOSALS" || (l.action || "").toUpperCase().includes("PROPOSAL") || (l.action || "").toUpperCase().includes("STATE")).length;
  const governanceCount = logs.filter(l => (l.module || "").toUpperCase() === "GOVERNANCE" || (l.action || "").toUpperCase().includes("BUDGET") || (l.action || "").toUpperCase().includes("CYCLE") || (l.action || "").toUpperCase().includes("CEILING")).length;

  // Filter Pipeline
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const query = searchTerm.toLowerCase().trim();
      const action = (log.action || "").toLowerCase();
      const operator = (log.operator_email || "").toLowerCase();
      const targetId = String(log.proposal_id || "").toLowerCase();
      const ip = String(log.ip_address || "").toLowerCase();
      const moduleStr = String(log.module || "").toLowerCase();
      const deptName = String(getDepartmentName(log.department_id) || "").toLowerCase();

      const matchesSearch = query === "" || 
        action.includes(query) || 
        operator.includes(query) || 
        targetId.includes(query) ||
        ip.includes(query) ||
        moduleStr.includes(query) ||
        deptName.includes(query) ||
        String(log.id).includes(query);

      let matchesModule = true;
      if (selectedModule !== "All") {
        matchesModule = (log.module || "GOVERNANCE").toUpperCase() === selectedModule.toUpperCase();
      }

      let matchesCategory = true;
      if (selectedCategory !== "All") {
        const catLower = selectedCategory.toLowerCase();
        const actionLower = (log.action || "").toLowerCase();
        const moduleUpper = (log.module || "").toUpperCase();

        if (catLower === "budget") {
          matchesCategory = actionLower.includes("budget") || actionLower.includes("ceiling");
        } else if (catLower === "state") {
          matchesCategory = actionLower.includes("state") || actionLower.includes("submit") || actionLower.includes("approve") || actionLower.includes("return");
        } else if (catLower === "override") {
          matchesCategory = actionLower.includes("override");
        } else if (catLower === "user") {
          matchesCategory = actionLower.includes("user") || actionLower.includes("login") || moduleUpper === "AUTHENTICATION";
        } else if (catLower === "inventory") {
          matchesCategory = moduleUpper === "INVENTORY" || actionLower.includes("inventory");
        } else if (catLower === "system") {
          matchesCategory = moduleUpper === "SYSTEMS" || actionLower.includes("system");
        }
      }

      let matchesDate = true;
      if (dateSpan !== "All") {
        const logDate = new Date(log.timestamp);
        const boundaryDate = new Date();
        if (dateSpan === "Today") {
          boundaryDate.setHours(0, 0, 0, 0);
          matchesDate = logDate >= boundaryDate;
        } else if (dateSpan === "Week") {
          boundaryDate.setDate(boundaryDate.getDate() - 7);
          boundaryDate.setHours(0, 0, 0, 0);
          matchesDate = logDate >= boundaryDate;
        } else if (dateSpan === "Month") {
          boundaryDate.setMonth(boundaryDate.getMonth() - 1);
          boundaryDate.setHours(0, 0, 0, 0);
          matchesDate = logDate >= boundaryDate;
        } else if (dateSpan === "Custom") {
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          if (start) {
            start.setHours(0, 0, 0, 0);
            matchesDate = matchesDate && logDate >= start;
          }
          if (end) {
            end.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && logDate <= end;
          }
        }
      }

      return matchesSearch && matchesModule && matchesCategory && matchesDate;
    });
  }, [logs, searchTerm, selectedModule, selectedCategory, dateSpan, startDate, endDate, getDepartmentName]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages) || 1;
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredLogs.length);
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Reliable Blob-based COA Compliance CSV Exporter
  const handleExportCsv = () => {
    if (!filteredLogs.length) return;
    try {
      const headers = [
        "Log ID", 
        "Timestamp UTC", 
        "Functional Module", 
        "Action Identifier", 
        "Operator Email", 
        "Operator Role", 
        "Client IP Address", 
        "Department", 
        "Target Entity UUID", 
        "Previous State", 
        "Updated State"
      ];

      const rows = filteredLogs.map(l => {
        const timeIso = l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString();
        return [
          l.id,
          timeIso,
          l.module || "GOVERNANCE",
          l.action,
          l.operator_email || "System/Cron",
          l.operator_role || "SYSTEM",
          l.ip_address || "127.0.0.1",
          getDepartmentName(l.department_id) || "Universal / Central Office",
          l.proposal_id || "SYSTEM_ENVIRONMENT",
          JSON.stringify(l.old_value || {}).replace(/"/g, '""'),
          JSON.stringify(l.new_value || {}).replace(/"/g, '""')
        ];
      });

      const csvContent = [
        headers.join(","),
        ...rows.map(r => r.map(f => `"${f}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute("download", `COA_Audit_Security_Ledger_${activeCycle || "Cycle"}_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess("COA security ledger exported successfully to CSV.");
    } catch (err) {
      setError(`Failed to export CSV: ${err.message}`);
    }
  };

  const renderPayload = (payload, isOld = false) => {
    if (!payload || (typeof payload === "object" && Object.keys(payload).length === 0)) {
      return <span className="text-slate-400 dark:text-slate-500 italic font-mono text-[10px]">No parameters recorded</span>;
    }
    if (typeof payload === "string") {
      return <span className="font-mono text-[10px] break-all text-slate-700 dark:text-slate-300">{payload}</span>;
    }
    
    return (
      <div className="space-y-1.5 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800 max-h-56 overflow-y-auto w-full">
        {Object.entries(payload).map(([key, val]) => {
          let displayVal = val;
          if (typeof val === "object" && val !== null) {
            displayVal = JSON.stringify(val);
          } else if (typeof val === "number" && (key.toLowerCase().includes("cost") || key.toLowerCase().includes("ceiling") || key.toLowerCase().includes("amount"))) {
            displayVal = `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          } else if (val === null || val === undefined) {
            displayVal = "null";
          }
          return (
            <div key={key} className="flex flex-col text-[10px] font-mono leading-tight">
              <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[8.5px] font-bold">
                {key.replace(/_/g, " ")}:
              </span>
              <span className={`font-semibold break-all text-xs ${
                isOld 
                  ? "text-rose-600 dark:text-rose-400" 
                  : "text-emerald-600 dark:text-emerald-400"
              }`}>
                {String(displayVal)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <History className="text-amber-500 w-5 h-5" />
            <span>COA Immutable Audit Security Trails &amp; Global Governance Ledger</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Tamper-proof chronological security ledger. Captures user authentications, client IP addresses, parameter overrides, budget reallocations, and inventory mutations.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer font-bold shadow-xs text-xs"
            title="Export filtered audit entries to CSV for COA compliance audits"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer font-bold shadow-xs text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Ledger</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl">
            <History className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Total Audit Events</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalLogs} Entries</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Authentication Events</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{authCount} Logins</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Proposal Modifications</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{proposalCount} Actions</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Governance &amp; Ceilings</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{governanceCount} Events</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-2xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="whitespace-pre-wrap leading-relaxed">{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-2xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Advanced Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Search action, email, IP, module, target ID..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none placeholder-slate-400 text-xs focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedModule}
                onChange={(e) => { setSelectedModule(e.target.value); setCurrentPage(1); }}
                className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs font-semibold"
              >
                <option value="All">All Functional Modules</option>
                <option value="AUTHENTICATION">Authentication &amp; Logins</option>
                <option value="PROPOSALS">Part IV.A Proposals</option>
                <option value="SYSTEMS">Information Systems (Parts II.C &amp; III.D)</option>
                <option value="PROJECTS">ICT Projects Portfolio (Part III.E)</option>
                <option value="INVENTORY">Annex 1 Master Inventory</option>
                <option value="GOVERNANCE">Governance &amp; Ceilings</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs font-semibold"
              >
                <option value="All">All Action Categories</option>
                <option value="state">Status Transitions</option>
                <option value="override">Admin Overrides</option>
                <option value="budget">Ceiling Reallocations</option>
                <option value="user">User &amp; Auth Activities</option>
                <option value="system">Systems &amp; Platform Intake</option>
                <option value="inventory">Inventory Updates</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={dateSpan}
                onChange={(e) => { setDateSpan(e.target.value); setCurrentPage(1); }}
                className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs font-semibold"
              >
                <option value="All">All Time Horizons</option>
                <option value="Today">Today Only</option>
                <option value="Week">Past 7 Days</option>
                <option value="Month">Past 30 Days</option>
                <option value="Custom">Custom Date Range</option>
              </select>
            </div>
          </div>
        </div>

        {dateSpan === "Custom" && (
          <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800 animate-fadeIn max-w-md">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none cursor-pointer font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none cursor-pointer font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Querying COA immutable security records...</span>
            </div>
          ) : paginatedLogs.length > 0 ? (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] font-mono">
                  <th className="p-4 w-44">Timestamp &amp; Source</th>
                  <th className="p-4 w-36">Module</th>
                  <th className="p-4 w-48">Operator Identity</th>
                  <th className="p-4">Action Taken</th>
                  <th className="p-4">Target Entity</th>
                  <th className="p-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {paginatedLogs.map((log) => {
                  const badge = getModuleBadge(log.module);
                  const isSystem = !log.proposal_id;
                  const targetId = log.proposal_id || "SYSTEM_ENVIRONMENT";
                  const deptTitle = getDepartmentName(log.department_id);

                  return (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-955/30 transition-colors group cursor-pointer"
                    >
                      <td className="p-4 align-top">
                        <div className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                        {log.ip_address && (
                          <div className="flex items-center gap-1 text-[9.5px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                            <Globe className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                            <span>{log.ip_address}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${badge.style}`}>
                          {badge.label}
                        </span>
                        {deptTitle && (
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 mt-1 truncate max-w-[140px]" title={deptTitle}>
                            {deptTitle}
                          </span>
                        )}
                      </td>

                      <td className="p-4 align-top space-y-1">
                        <div className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]" title={log.operator_email || "System"}>
                          {log.operator_email || "Automated System"}
                        </div>
                        <span className="inline-block px-1.5 py-0.2 text-[8px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-semibold text-slate-500 dark:text-slate-400 font-mono uppercase">
                          {log.operator_role || "SYSTEM"}
                        </span>
                      </td>

                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                          {isSystem && <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span>{log.action.replace(/_/g, " ")}</span>
                        </div>
                        {log.new_value && typeof log.new_value === "object" && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate max-w-xs" title={JSON.stringify(log.new_value)}>
                            {Object.entries(log.new_value).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top">
                        <span className={`font-mono text-[9.5px] font-bold select-all ${isSystem ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {targetId}
                        </span>
                      </td>

                      <td className="p-4 align-top text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>Inspect</span>
                          <Eye className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
              No matching immutable security ledger records found.
            </div>
          )}
        </div>

        {/* Dynamic Pagination Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-955/50 gap-3">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong>{filteredLogs.length > 0 ? startIndex + 1 : 0}</strong> to <strong>{endIndex}</strong> of <strong>{filteredLogs.length}</strong> total events
            </span>

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Rows:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="p-1 px-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-[10px] outline-none cursor-pointer font-mono"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="p-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono font-bold text-slate-700 dark:text-slate-300">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages || filteredLogs.length === 0}
              className="p-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* COA AUDIT RECORD INSPECTION MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-500" />
                  <span>COA Immutable Audit Record Inspection</span>
                </h3>
                <span className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 uppercase">LOG ENTRY ID: #{selectedLog.id}</span>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Executed By</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-800 dark:text-slate-200">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold">{selectedLog.operator_email || "System/Cron"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Access Scope</span>
                  <span className="block font-bold text-blue-600 dark:text-blue-400 font-mono uppercase text-xs">
                    {selectedLog.operator_role || "SYSTEM"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Module</span>
                  <span className="block font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">
                    {selectedLog.module || "GOVERNANCE"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Source Client IP</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{selectedLog.ip_address || "Internal Loopback"}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Department</span>
                  <span className="block font-bold text-slate-800 dark:text-slate-200 text-xs truncate" title={getDepartmentName(selectedLog.department_id)}>
                    {getDepartmentName(selectedLog.department_id) || "Universal / Central Office"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Action Identifier</span>
                  <span className="block font-bold text-slate-900 dark:text-slate-100 font-mono uppercase text-xs">
                    {selectedLog.action}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Log Timestamp</span>
                  <span className="block text-slate-700 dark:text-slate-300 font-mono text-xs">
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] text-rose-600 dark:text-rose-400 uppercase font-bold tracking-wider block font-mono">
                    Previous State Parameters
                  </span>
                  {renderPayload(selectedLog.old_value, true)}
                </div>
                <div className="space-y-1.5">
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider block font-mono">
                    Updated State Parameters
                  </span>
                  {renderPayload(selectedLog.new_value, false)}
                </div>
              </div>

              {/* Context-Aware Deep Link Action Button */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                {selectedLog.proposal_id ? (
                  <button
                    type="button"
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
                  >
                    <span>Inspect Target Proposal in Master Queue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (selectedLog.module === "SYSTEMS" || (selectedLog.action || "").toUpperCase().includes("SYSTEM")) ? (
                  <button
                    type="button"
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
                  >
                    <span>Inspect in Information Systems Register</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (selectedLog.module === "INVENTORY" || (selectedLog.action || "").toUpperCase().includes("INVENTORY")) ? (
                  <button
                    type="button"
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
                  >
                    <span>Inspect in Master Asset Inventory</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (selectedLog.module === "AUTHENTICATION" || (selectedLog.action || "").toUpperCase().includes("USER")) ? (
                  <button
                    type="button"
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
                  >
                    <span>Inspect in User Whitelisting &amp; Access Control</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (selectedLog.module === "GOVERNANCE" && ((selectedLog.action || "").toUpperCase().includes("CEILING") || (selectedLog.action || "").toUpperCase().includes("BUDGET"))) ? (
                  <button
                    type="button"
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
                  >
                    <span>Inspect in Budget Sub-Ceilings &amp; Policy Control</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedLog(null)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl cursor-pointer transition-all text-xs"
                  >
                    Close Inspection
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}