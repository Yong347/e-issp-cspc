// frontend/src/views/admin/Audit/AuditTrails.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  History, 
  RefreshCw, 
  AlertCircle, 
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
  ChevronRight 
} from "lucide-react";

export default function AuditTrails() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();
  
  const [logs, setLogs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedModule, setSelectedModule] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dateSpan, setDateSpan] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [selectedLog, setSelectedLog] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("Could not load departments dictionary for audit view:", e);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load audit logs from the security ledger.");
      }
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Network error loading audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLogs();
      fetchDepartments();
    }
  }, [token, activeCycle]);

  const handleDeepLinkRedirect = (log) => {
    setSelectedLog(null);
    const targetId = log.proposal_id;
    if (targetId) {
      navigate("/admin/queue", { 
        state: { 
          highlightId: targetId
        } 
      });
    }
  };

  const getDepartmentName = (deptId) => {
    if (!deptId) return null;
    const d = departments.find(dept => (dept.department_id || dept.id) === deptId);
    return d ? (d.department_name || d.name) : `Department ID: ${deptId}`;
  };

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

  const totalLogs = logs.length;
  const authCount = logs.filter(l => (l.module || "").toUpperCase() === "AUTHENTICATION" || (l.action || "").includes("LOGIN") || (l.action || "").includes("USER")).length;
  const proposalCount = logs.filter(l => (l.module || "").toUpperCase() === "PROPOSALS" || (l.action || "").includes("PROPOSAL") || (l.action || "").includes("STATE")).length;
  const governanceCount = logs.filter(l => (l.module || "").toUpperCase() === "GOVERNANCE" || (l.action || "").includes("BUDGET") || (l.action || "").includes("CYCLE") || (l.action || "").includes("CEILING")).length;

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
        if (catLower === "budget") {
          matchesCategory = (log.action || "").toLowerCase().includes("budget") || (log.action || "").includes("ceiling");
        } else if (catLower === "state") {
          matchesCategory = (log.action || "").toLowerCase().includes("state") || (log.action || "").includes("submit") || (log.action || "").includes("approve");
        } else if (catLower === "override") {
          matchesCategory = (log.action || "").toLowerCase().includes("override");
        } else if (catLower === "user") {
          matchesCategory = (log.action || "").toLowerCase().includes("user") || (log.action || "").includes("login");
        } else if (catLower === "inventory") {
          matchesCategory = (log.module || "").toUpperCase() === "INVENTORY" || (log.action || "").toLowerCase().includes("inventory");
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
          matchesDate = logDate >= boundaryDate;
        } else if (dateSpan === "Month") {
          boundaryDate.setMonth(boundaryDate.getMonth() - 1);
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
  }, [logs, searchTerm, selectedModule, selectedCategory, dateSpan, startDate, endDate, departments]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages) || 1;
  const paginatedLogs = filteredLogs.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  const renderPayload = (payload, isOld = false) => {
    if (!payload || (typeof payload === "object" && Object.keys(payload).length === 0)) {
      return <span className="text-slate-400 italic font-mono text-[10px]">No parameters recorded</span>;
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
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer font-bold shadow-xs self-start sm:self-auto text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Ledger</span>
        </button>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl">
            <History className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Audit Events</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalLogs} Entries</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Authentication Events</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{authCount} Logins</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Proposal Modifications</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{proposalCount} Actions</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Governance &amp; Ceilings</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{governanceCount} Events</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-2xl flex items-start gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
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
              placeholder="Search action, email, IP, module..."
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
                <option value="user">User Activities</option>
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
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none cursor-pointer font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">End Date</label>
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
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
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
                        <div className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                        {log.ip_address && (
                          <div className="flex items-center gap-1 text-[9.5px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span>{log.ip_address}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-4 align-top">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${badge.style}`}>
                          {badge.label}
                        </span>
                        {deptTitle && (
                          <span className="block text-[9px] text-slate-400 mt-1 truncate max-w-[140px]" title={deptTitle}>
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
            <div className="text-center py-20 text-slate-400 italic">
              No matching immutable security ledger records found.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-between items-center p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 bg-slate-50/50 dark:bg-slate-955/50">
            <span>
              Showing page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong> ({filteredLogs.length} total entries)
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* COA AUDIT RECORD INSPECTION MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-sm">COA Immutable Audit Record Inspection</h3>
                <span className="text-[9.5px] font-mono text-slate-500 uppercase">LOG ENTRY ID: #{selectedLog.id}</span>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Executed By</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-800 dark:text-slate-200">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold">{selectedLog.operator_email || "System/Cron"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Access Scope</span>
                  <span className="block font-bold text-blue-600 dark:text-blue-400 font-mono uppercase text-xs">
                    {selectedLog.operator_role || "SYSTEM"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Module</span>
                  <span className="block font-bold text-slate-800 dark:text-slate-200 font-mono text-xs">
                    {selectedLog.module || "GOVERNANCE"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Source Client IP</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-xs flex items-center gap-1">
                    <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{selectedLog.ip_address || "Internal Loopback"}</span>
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Department</span>
                  <span className="block font-bold text-slate-800 dark:text-slate-200 text-xs truncate" title={getDepartmentName(selectedLog.department_id)}>
                    {getDepartmentName(selectedLog.department_id) || "Universal / Central"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Action Identifier</span>
                  <span className="block font-bold text-slate-900 dark:text-slate-100 font-mono uppercase text-xs">
                    {selectedLog.action}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Log Timestamp</span>
                  <span className="block text-slate-700 dark:text-slate-300 font-mono text-xs">
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] text-rose-600 dark:text-rose-400 uppercase font-bold tracking-wider block">
                    Previous State Parameters
                  </span>
                  {renderPayload(selectedLog.old_value, true)}
                </div>
                <div className="space-y-1.5">
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider block">
                    Updated State Parameters
                  </span>
                  {renderPayload(selectedLog.new_value, false)}
                </div>
              </div>

              {selectedLog.proposal_id && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm text-xs"
                  >
                    <span>Inspect Target Proposal in Master Queue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
