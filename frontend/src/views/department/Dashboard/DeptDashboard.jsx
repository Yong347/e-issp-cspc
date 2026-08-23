// frontend/src/views/department/Dashboard/DeptDashboard.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { getBudgetSummary } from "../../../api/dept";
import { 
  LayoutDashboard, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Landmark, 
  ShieldCheck,
  FileText,
  Clock
} from "lucide-react";

export default function DeptDashboard() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [headroom, setHeadroom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Expiration warning metrics
  const [alerts, setAlerts] = useState({ expiring_standard_items: [], expiring_custom_proposals: [] });
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBudgetSummary();
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
        headers: { Authorization: `Bearer ${user.token}` }
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

  if (loading && !headroom) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span>Syncing budget headroom metrics...</span>
      </div>
    );
  }

  // Safe fallback defaults to prevent rendering exceptions on empty responses
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
    <div className="space-y-6 text-xs text-slate-100 select-none">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-sky-400" />
            <span>Departmental Budget Headroom Monitor</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Real-time tracking of active CapEx (Hardware) and MOOE (Software) spent balances against your allocated sub-ceiling.
          </p>
        </div>
        <button
          onClick={() => {
            fetchData();
            fetchExpirationAlerts();
          }}
          disabled={loading || loadingAlerts}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 text-xs cursor-pointer disabled:opacity-50 transition-all self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(loading || loadingAlerts) ? "animate-spin" : ""}`} />
          <span>Sync Balances</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Expiration Warning Alert Banner */}
      {totalActiveAlerts > 0 && (
        <div className="p-4 bg-amber-95/20 border border-amber-900/50 rounded-xl space-y-3 animate-fadeIn">
          <div className="flex items-center gap-2 text-amber-400 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0 animate-pulse" />
            <span>Validity Alert: Expiring Quotation Canvases Detected</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            The market quotation proof for the items below will expire soon. To maintain regulatory compliance, please re-evaluate and upload an updated canvas PDF before submission.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {alerts.expiring_standard_items?.map((item, idx) => (
              <div key={`std-${idx}`} className="p-2.5 bg-slate-950 border border-slate-850 rounded flex justify-between items-center">
                <span className="font-semibold text-slate-300">{item.display_name}</span>
                <span className="font-mono text-amber-500 font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Expires in {item.days_remaining} Days</span>
                </span>
              </div>
            ))}
            {alerts.expiring_custom_proposals?.map((item, idx) => (
              <div key={`cust-${idx}`} className="p-2.5 bg-slate-955 border border-slate-850 rounded flex justify-between items-center">
                <span className="font-semibold text-slate-300">{item.item_name} (Custom Proposal)</span>
                <span className="font-mono text-amber-500 font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Expires in {item.days_remaining} Days</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Budget Progress Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Consolidated Sub-Ceiling Limit */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Landmark className="w-4 h-4 text-purple-400" />
            <span>Consolidated Sub-Ceiling</span>
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Total Spent:</span>
              <span className="font-bold text-slate-200">₱{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Allocated Limit:</span>
              <span className="font-bold text-slate-200">₱{subCeiling.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="w-full bg-slate-950 border border-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(overallSpentPercent, 100)}%` }} 
              />
            </div>
            <span className="text-[10px] text-slate-500 block">
              Department is utilizing {overallSpentPercent.toFixed(1)}% of total allocated sub-ceiling.
            </span>
          </div>
        </div>

        {/* CapEx Hardware Progress */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span>Capital Outlay (CapEx) Limit</span>
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Approved Spent:</span>
              <span className="font-bold text-slate-200">₱{spentCapex.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">CapEx Limit:</span>
              <span className="font-bold text-slate-200">₱{allocatedCapex.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="w-full bg-slate-950 border border-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(capexPercent, 100)}%` }} 
              />
            </div>
            <span className="text-[10px] text-slate-500 block">
              Hardware spending is at {capexPercent.toFixed(1)}% of the CapEx allotment.
            </span>
          </div>
        </div>

        {/* MOOE Software Progress */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>Operating Services (MOOE) Limit</span>
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Approved Spent:</span>
              <span className="font-bold text-slate-200">₱{spentMooe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">MOOE Limit:</span>
              <span className="font-bold text-slate-200">₱{allocatedMooe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="w-full bg-slate-950 border border-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(mooePercent, 100)}%` }} 
              />
            </div>
            <span className="text-[10px] text-slate-500 block">
              Licensing spending is at {mooePercent.toFixed(1)}% of the MOOE allotment.
            </span>
          </div>
        </div>

      </div>

      {/* Pre-flight Dry-Run validation banners */}
      {headroom?.draft_dry_run && (
        <div className={`p-5 border rounded-xl flex items-start gap-4 leading-relaxed ${
          headroom.draft_dry_run.dry_run_validation_passed 
            ? "bg-emerald-950/20 border-emerald-800/80 text-emerald-300"
            : "bg-red-955/20 border-red-900/80 text-red-300"
        }`}>
          {headroom.draft_dry_run.dry_run_validation_passed ? (
            <>
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Pre-Flight Dry Run Successful</h4>
                <p className="mt-1 text-slate-400 text-xs">
                  Your drafted hardware items and software subscriptions fit within your department's remaining headroom. Ready for submission.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Budget Headroom Overrun Alert</h4>
                <p className="mt-1 text-slate-400 text-xs">
                  Submitting your active drafts would cause total expenditures to exceed your sub-ceiling allocations by <strong>₱{Math.abs((headroom.remaining_headroom || 0) - (headroom.draft_dry_run.total_drafted || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>. Adjust drafted quantities or unit rates before attempting submission.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}