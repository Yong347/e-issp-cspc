// frontend/src/views/department/Dashboard/DeptDashboard.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { getBudgetSummary } from "../../../api/dept";
import { 
  LayoutDashboard, 
  TrendingUp, 
  AlertTriangle, 
  RefreshCw, 
  Landmark, 
  FileText, 
  Clock, 
  ArrowRight, 
  FolderKanban, 
  ClipboardList 
} from "lucide-react";

export default function DeptDashboard() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();
  
  const [headroom, setHeadroom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [alerts, setAlerts] = useState({ expiring_standard_items: [], expiring_custom_proposals: [] });
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBudgetSummary(user?.token);
      setHeadroom(data);
    } catch (err) {
      setError(err.message || "Failed to retrieve budget summary balances.");
    } finally {
      setLoading(false);
    }
  };

  const fetchExpirationAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const res = await fetch(`${apiUrl}/api/dept/catalog/expiring-alerts`, {
        headers: { Authorization: `Bearer ${user?.token}` }
      });
      if (res.ok) {
        setAlerts(await res.json());
      }
    } catch (err) {
      console.error("Failed to load catalog canvas alerts:", err);
    } finally {
      setLoadingAlerts(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchData();
      fetchExpirationAlerts();
    }
  }, [user, activeCycle]);

  const subCeiling = headroom?.sub_ceiling || 0;
  const totalSpent = headroom?.total_spent || 0;
  const allocatedCapex = headroom?.allocated_capex || 0;
  const spentCapex = headroom?.current_spent_capex || 0;
  const allocatedMooe = headroom?.allocated_mooe || 0;
  const spentMooe = headroom?.current_spent_mooe || 0;

  const overallSpentPercent = subCeiling > 0 ? (totalSpent / subCeiling) * 100 : 0;
  const capexPercent = allocatedCapex > 0 ? (spentCapex / allocatedCapex) * 100 : 0;
  const mooePercent = allocatedMooe > 0 ? (spentMooe / allocatedMooe) * 100 : 0;

  const totalActiveAlerts = (alerts.expiring_standard_items?.length || 0) + (alerts.expiring_custom_proposals?.length || 0);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none font-sans">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Departmental Budget Headroom &amp; Progress Monitor</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Tracking active CapEx (Hardware) and MOOE (Software) expenditure balances against your allocated sub-ceiling for <strong>FY {activeCycle}</strong>.
          </p>
        </div>
        <button
          onClick={() => { fetchData(); fetchExpirationAlerts(); }}
          disabled={loading || loadingAlerts}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer font-bold disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(loading || loadingAlerts) ? "animate-spin" : ""}`} />
          <span>Sync Balances</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2.5 shadow-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Expiration Alert Notice */}
      {totalActiveAlerts > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900/60 rounded-2xl space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Validity Alert: {totalActiveAlerts} Quotation Canvases Expiring Soon</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
            Market quotations expire after their set validity window. Update them in your proposals before submitting to the review queue.
          </p>
          <button 
            onClick={() => navigate("/dept/quotations")}
            className="text-amber-700 dark:text-amber-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer pt-1"
          >
            <span>Review &amp; Attach Updated Quotations</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Total Sub-Ceiling */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-purple-500" />
              <span>Total Sub-Ceiling</span>
            </span>
            <span className="font-mono">{overallSpentPercent.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
            ₱{totalSpent.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ ₱{subCeiling.toLocaleString()}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-purple-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(overallSpentPercent, 100)}%` }} 
            />
          </div>
          <span className="text-[10px] text-slate-400 block">
            Remaining: ₱{Math.max(0, subCeiling - totalSpent).toLocaleString()}
          </span>
        </div>

        {/* CapEx Limit */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span>Capital Outlay (CapEx)</span>
            </span>
            <span className="font-mono">{capexPercent.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
            ₱{spentCapex.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ ₱{allocatedCapex.toLocaleString()}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(capexPercent, 100)}%` }} 
            />
          </div>
          <span className="text-[10px] text-slate-400 block">
            Remaining: ₱{Math.max(0, allocatedCapex - spentCapex).toLocaleString()}
          </span>
        </div>

        {/* MOOE Limit */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span>Operating Services (MOOE)</span>
            </span>
            <span className="font-mono">{mooePercent.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
            ₱{spentMooe.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ ₱{allocatedMooe.toLocaleString()}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(mooePercent, 100)}%` }} 
            />
          </div>
          <span className="text-[10px] text-slate-400 block">
            Remaining: ₱{Math.max(0, allocatedMooe - spentMooe).toLocaleString()}
          </span>
        </div>

      </div>

      {/* Quick Action Navigation Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div 
          onClick={() => navigate("/dept/proposals")}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 transition-all cursor-pointer flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Draft &amp; Manage Resource Proposals</h4>
              <p className="text-slate-400 text-[11px] mt-0.5">Submit hardware outlays and software subscriptions for MIS review</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>

        <div 
          onClick={() => navigate("/dept/needs")}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-teal-400 transition-all cursor-pointer flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 rounded-xl">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Log Needs Assessment (Sec 8.0)</h4>
              <p className="text-slate-400 text-[11px] mt-0.5">Document operational bottlenecks for MIS Admin aggregation</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>
      </div>

    </div>
  );
}
