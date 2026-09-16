// frontend/src/views/admin/Analytics/ComplianceAnalytics.jsx
import React, { useState, useEffect, useMemo } from "react";
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
  X
} from "lucide-react";

export default function ComplianceAnalytics() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  const fetchAnalytics = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/department-analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to fetch analytics data.");
      }
      const data = await res.json();
      setAnalytics(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Network error fetching compliance metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAnalytics();
    }
  }, [token, activeCycle]);

  const totalDepts = analytics.length;
  const flaggedDepts = analytics.filter(d => d.requires_review_abuse).length;
  const compliantDepts = totalDepts - flaggedDepts;
  const totalMissingCanvases = analytics.reduce((sum, d) => sum + (d.missing_canvas_count || 0), 0);

  const filteredAnalytics = useMemo(() => {
    return analytics.filter(dept => {
      if (filterStatus === "flagged" && !dept.requires_review_abuse) return false;
      if (filterStatus === "compliant" && dept.requires_review_abuse) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (dept.department_name || "").toLowerCase();
        return name.includes(q);
      }
      return true;
    });
  }, [analytics, filterStatus, searchQuery]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <BarChart2 className="text-blue-600 dark:text-blue-400 w-5 h-5" />
              <span>Compliance Analytics &amp; Specification Abuse Index</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Real-time monitoring of non-standard procurement. Flags departments exceeding the statutory 20% limit for custom requests or lacking quotation proofs.
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Diagnostics</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Aggregate Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Monitored Offices</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalDepts} Divisions</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Fully Compliant</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{compliantDepts} Departments</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Flagged Abuse (&gt;20%)</span>
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">{flaggedDepts} Departments</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <FileWarning className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Missing Canvas Proofs</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{totalMissingCanvases} Proposals</h3>
          </div>
        </div>
      </div>

      {/* Standards Info Banner */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl flex items-start gap-3 shadow-xs">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          <strong className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[10px]">
            DBM Smart Procurement Standard &bull; Specification Abuse Threshold
          </strong>
          <p>
            Departments are required to select standardized equipment from the <strong>Price Reference Catalog</strong>. When custom requests exceed <strong>20.0%</strong> of a department's total proposals, the compliance engine automatically flags the department for administrative scrutiny.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-xs">
        <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 self-start">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
              filterStatus === "all" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            All ({totalDepts})
          </button>
          <button
            onClick={() => setFilterStatus("flagged")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              filterStatus === "flagged" ? "bg-rose-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Flagged ({flaggedDepts})</span>
          </button>
          <button
            onClick={() => setFilterStatus("compliant")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              filterStatus === "compliant" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>Compliant ({compliantDepts})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search department name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Clean Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredAnalytics.map((dept) => {
          const hasAbuse = dept.requires_review_abuse;
          const customRatio = parseFloat(dept.custom_ratio_percent || 0);

          return (
            <div 
              key={dept.department_id} 
              className={`p-6 rounded-2xl border transition-all space-y-4 shadow-xs ${
                hasAbuse 
                  ? "bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-900/60 border-l-4 border-l-rose-500" 
                  : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800"
              }`}
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{dept.department_name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Unit ID: #{dept.department_id}</p>
                </div>

                {hasAbuse ? (
                  <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-full font-bold text-[9px] uppercase font-mono tracking-wider">
                    Flagged for Review
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-full font-bold text-[9px] uppercase font-mono tracking-wider">
                    Compliant
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 font-mono text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 block uppercase font-bold">Total Proposals</span>
                  <span className="text-slate-900 dark:text-white font-bold text-sm">{dept.total_proposals}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 block uppercase font-bold">Custom Items</span>
                  <span className="text-slate-900 dark:text-white font-bold text-sm">{dept.custom_proposals}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800">
                  <span className="text-[9px] text-slate-400 block uppercase font-bold">Custom Ratio</span>
                  <span className={`font-bold text-sm ${hasAbuse ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {dept.custom_ratio_percent}%
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">Custom Ratio:</span>
                  <span className={`font-mono font-bold ${hasAbuse ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {customRatio}% {hasAbuse ? "(Exceeds 20.0% Threshold)" : "(Within Limit)"}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${hasAbuse ? "bg-rose-500" : "bg-blue-600"}`} 
                    style={{ width: `${Math.min(customRatio, 100)}%` }} 
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10.5px]">
                <span className="text-slate-500">
                  Missing Canvas: <strong className={dept.missing_canvas_count > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}>{dept.missing_canvas_count} items</strong>
                </span>
                <button
                  onClick={() => navigate(`/admin/queue?dept_id=${dept.department_id}`)}
                  className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer"
                >
                  <span>Inspect Queue</span>
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
