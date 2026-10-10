// frontend/src/views/admin/Analytics/ComplianceAnalytics.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  BarChart2, 
  AlertCircle,
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  Search, 
  Building, 
  FileWarning, 
  ArrowUpRight,
  Info,
  X,
  SlidersHorizontal,
  CheckCircle2,
  FileCheck
} from "lucide-react";
import { getDepartmentAnalytics } from "../../../api/admin";

export default function ComplianceAnalytics() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // 'all' | 'flagged' | 'compliant'
  const [sortBy, setSortBy] = useState("ratio-desc"); // 'ratio-desc' | 'canvas-desc' | 'proposals-desc' | 'name-asc'

  // Dynamic self-resolving API URL for production Azure & local development
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
    const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
    return rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  };
  const apiUrl = getApiUrl();

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "") || "";

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      let data;
      try {
        data = await getDepartmentAnalytics(token);
      } catch (clientErr) {
        // Fallback direct fetch if client-side API helper encounters an environment issue
        const res = await fetch(`${apiUrl}/api/admin/department-analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || clientErr.message || "Failed to fetch analytics data.");
        }
        data = await res.json();
      }

      setAnalytics(Array.isArray(data) ? data : []);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setError(err.message || "Network error fetching compliance metrics.");
    } finally {
      setLoading(false);
    }
  }, [token, apiUrl]);

  useEffect(() => {
    if (token) {
      fetchAnalytics();
    }
  }, [token, activeCycle, fetchAnalytics]);

  // Aggregate Metrics Calculations
  const totalDepts = analytics.length;
  const flaggedDepts = analytics.filter(d => d.requires_review_abuse).length;
  const compliantDepts = totalDepts - flaggedDepts;
  const totalProposals = analytics.reduce((sum, d) => sum + (d.total_proposals || 0), 0);
  const totalCustomProposals = analytics.reduce((sum, d) => sum + (d.custom_proposals || 0), 0);
  const totalMissingCanvases = analytics.reduce((sum, d) => sum + (d.missing_canvas_count || 0), 0);
  const overallCatalogAdoption = totalProposals > 0 
    ? (((totalProposals - totalCustomProposals) / totalProposals) * 100).toFixed(1)
    : "100.0";

  // Filter and Sort Pipeline
  const filteredAndSortedAnalytics = useMemo(() => {
    return analytics
      .filter(dept => {
        if (filterStatus === "flagged" && !dept.requires_review_abuse) return false;
        if (filterStatus === "compliant" && dept.requires_review_abuse) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const name = (dept.department_name || "").toLowerCase();
          const idStr = String(dept.department_id || "");
          return name.includes(q) || idStr.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "ratio-desc") {
          return (b.custom_ratio_percent || 0) - (a.custom_ratio_percent || 0);
        }
        if (sortBy === "canvas-desc") {
          return (b.missing_canvas_count || 0) - (a.missing_canvas_count || 0);
        }
        if (sortBy === "proposals-desc") {
          return (b.total_proposals || 0) - (a.total_proposals || 0);
        }
        if (sortBy === "name-asc") {
          return (a.department_name || "").localeCompare(b.department_name || "");
        }
        return 0;
      });
  }, [analytics, filterStatus, searchQuery, sortBy]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans pb-12 transition-colors duration-200">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <BarChart2 className="text-blue-600 dark:text-blue-400 w-5 h-5" />
              <span>Compliance Analytics &amp; Specification Abuse Index</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Statutory monitoring of non-standard procurement. Flags offices exceeding the <strong>20.0%</strong> limit for custom requests or lacking quotation proofs.
          </p>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
          {lastSyncTime && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden md:inline-block">
              Synced: {lastSyncTime}
            </span>
          )}
          <button
            type="button"
            onClick={fetchAnalytics}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600 dark:text-blue-400" : ""}`} />
            <span>{loading ? "Auditing..." : "Sync Diagnostics"}</span>
          </button>
        </div>
      </div>

      {/* Dismissible Error Alert */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="space-y-0.5">
              <span className="font-bold">Diagnostics Error</span>
              <p className="text-[11px] leading-relaxed">{error}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setError(null)} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1"
            title="Dismiss Alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Aggregate Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Monitored Offices</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {totalDepts} Divisions
            </h3>
            <span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 block">
              {totalProposals} Total Proposals
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Fully Compliant</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {compliantDepts} Departments
            </h3>
            <span className="text-[10.5px] text-emerald-600/80 dark:text-emerald-400/80 font-mono mt-0.5 block">
              {overallCatalogAdoption}% Catalog Adoption
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Flagged Abuse (&gt;20%)</span>
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
              {flaggedDepts} Departments
            </h3>
            <span className="text-[10.5px] text-rose-500/80 dark:text-rose-400/80 font-mono mt-0.5 block">
              {totalCustomProposals} Custom Items
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <FileWarning className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Missing Canvas Proofs</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {totalMissingCanvases} Items
            </h3>
            <span className="text-[10.5px] text-amber-600/80 dark:text-amber-400/80 font-mono mt-0.5 block">
              Action Required (COA Rule)
            </span>
          </div>
        </div>
      </div>

      {/* Standards Info Banner */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl flex items-start gap-3 shadow-xs">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          <strong className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px] font-mono">
            Government Procurement Reform Standard &bull; Specification Abuse Threshold
          </strong>
          <p>
            Offices are mandated to select standardized ICT equipment and software from the administrative <strong>Price Reference Catalog</strong>. When custom specifications exceed <strong>20.0%</strong> of a unit&apos;s total line items, or when market quotations are absent, the compliance engine automatically flags the department for review prior to Part IV.A consolidation.
          </p>
        </div>
      </div>

      {/* Filter, Sort and Search Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                filterStatus === "all" 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              All ({totalDepts})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("flagged")}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                filterStatus === "flagged" 
                  ? "bg-rose-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Flagged ({flaggedDepts})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("compliant")}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                filterStatus === "compliant" 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Compliant ({compliantDepts})</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-955 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10.5px]">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[9px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="ratio-desc" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Highest Abuse %</option>
              <option value="canvas-desc" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Most Missing Canvases</option>
              <option value="proposals-desc" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Total Outlay Items</option>
              <option value="name-asc" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">Office Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Search Field */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search office name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {filteredAndSortedAnalytics.length === 0 && !loading && (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
          <h4 className="font-bold text-slate-900 dark:text-white text-sm">No Department Anomalies Found</h4>
          <p className="text-slate-500 dark:text-slate-400 text-xs max-w-md mx-auto">
            {searchQuery 
              ? `No office records matching query "${searchQuery}".` 
              : "All evaluated departments conform to the DICT standard catalog threshold and canvas verification requirements."}
          </p>
        </div>
      )}

      {/* Analytics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredAndSortedAnalytics.map((dept) => {
          const hasAbuse = Boolean(dept.requires_review_abuse);
          const customRatio = parseFloat(dept.custom_ratio_percent || 0);
          const total = parseInt(dept.total_proposals || 0, 10);
          const custom = parseInt(dept.custom_proposals || 0, 10);
          const catalogCount = Math.max(total - custom, 0);
          const missingCanvas = parseInt(dept.missing_canvas_count || 0, 10);

          return (
            <div 
              key={dept.department_id} 
              className={`p-5 rounded-2xl border transition-all space-y-4 shadow-xs bg-white dark:bg-slate-900 ${
                hasAbuse 
                  ? "border-rose-300 dark:border-rose-900/60 border-l-4 border-l-rose-500" 
                  : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              {/* Card Header */}
              <div className="flex justify-between items-start gap-3">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{dept.department_name}</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    Department Code: #{dept.department_id}
                  </span>
                </div>

                {hasAbuse ? (
                  <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-full font-bold text-[9px] uppercase font-mono tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>Review Required</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-full font-bold text-[9px] uppercase font-mono tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Catalog Compliant</span>
                  </span>
                )}
              </div>

              {/* Statistical KPI Row */}
              <div className="grid grid-cols-4 gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3.5 font-mono text-center">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[8.5px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Total Items</span>
                  <span className="text-slate-900 dark:text-white font-bold text-xs">{total}</span>
                </div>

                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[8.5px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Standard</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">{catalogCount}</span>
                </div>

                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[8.5px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Custom</span>
                  <span className="text-slate-900 dark:text-white font-bold text-xs">{custom}</span>
                </div>

                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[8.5px] text-slate-400 dark:text-slate-500 block uppercase font-bold">Custom %</span>
                  <span className={`font-bold text-xs ${hasAbuse ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {dept.custom_ratio_percent}%
                  </span>
                </div>
              </div>

              {/* Ratio Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 font-sans">
                    <span>Non-Catalog Item Index:</span>
                    <strong className="text-slate-700 dark:text-slate-300 font-mono">{customRatio}%</strong>
                  </span>
                  <span className={`font-mono font-bold ${hasAbuse ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {hasAbuse ? "Threshold Breached (>20.0%)" : "Within Allowable Limit"}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden relative">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      hasAbuse ? "bg-rose-500" : "bg-blue-600 dark:bg-blue-500"
                    }`} 
                    style={{ width: `${Math.min(customRatio, 100)}%` }} 
                  />
                  {/* Visual limit marker at 20% */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-400/80 dark:bg-slate-500 z-10" 
                    style={{ left: "20%" }} 
                    title="20% Statutory Specification Limit" 
                  />
                </div>
              </div>

              {/* Audit Proof Tag & Navigation Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap justify-between items-center gap-2 text-[10.5px]">
                <div>
                  {missingCanvas > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 font-mono font-bold text-[10px]">
                      <FileWarning className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{missingCanvas} item(s) lacking quotation proof</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>All quotes attached</span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/admin/queue?dept_id=${dept.department_id}`)}
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-bold cursor-pointer transition-colors"
                >
                  <span>Inspect Office Proposals</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}