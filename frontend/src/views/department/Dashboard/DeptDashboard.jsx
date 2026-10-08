// frontend/src/views/department/Dashboard/DeptDashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { getBudgetSummary, getExpiringCanvasAlerts } from "../../../api/dept";
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
  ClipboardList,
  Database,
  Archive,
  CheckCircle2,
  Coins,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info
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
  const [showAlertDetails, setShowAlertDetails] = useState(false);

  const deptName = user?.department_name || "Department Planning Office";

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fetchData = useCallback(async () => {
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
  }, [user?.token]);

  const fetchExpirationAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const data = await getExpiringCanvasAlerts(user?.token);
      setAlerts(data || { expiring_standard_items: [], expiring_custom_proposals: [] });
    } catch (err) {
      console.warn("Notice: Failed to load quotation canvas alerts:", err);
    } finally {
      setLoadingAlerts(false);
    }
  }, [user?.token]);

  useEffect(() => {
    if (user?.token) {
      fetchData();
      fetchExpirationAlerts();
    }
  }, [user?.token, activeCycle, fetchData, fetchExpirationAlerts]);

  // Financial Metrics Breakdown
  const subCeiling = parseFloat(headroom?.sub_ceiling || 0);
  const totalSpent = parseFloat(headroom?.total_spent || 0);
  const allocatedCapex = parseFloat(headroom?.allocated_capex || 0);
  const spentCapex = parseFloat(headroom?.current_spent_capex || 0);
  const allocatedMooe = parseFloat(headroom?.allocated_mooe || 0);
  const spentMooe = parseFloat(headroom?.current_spent_mooe || 0);

  const overallSpentPercent = subCeiling > 0 ? (totalSpent / subCeiling) * 100 : 0;
  const capexPercent = allocatedCapex > 0 ? (spentCapex / allocatedCapex) * 100 : 0;
  const mooePercent = allocatedMooe > 0 ? (spentMooe / allocatedMooe) * 100 : 0;

  // Pre-Flight Dry Run Evaluation
  const draftDryRun = headroom?.draft_dry_run;
  const isSubCeilingExceeded = draftDryRun?.sub_ceiling_exceeded || false;
  const totalDrafted = parseFloat(draftDryRun?.total_drafted || 0);
  const projectedTotalSpent = parseFloat(draftDryRun?.projected_total_spent || totalSpent);

  // Expiration Alerts Computation
  const standardAlerts = alerts.expiring_standard_items || [];
  const customAlerts = alerts.expiring_custom_proposals || [];
  const totalActiveAlerts = standardAlerts.length + customAlerts.length;

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none font-sans max-w-7xl mx-auto transition-colors duration-200">
      
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Departmental Budget Headroom &amp; Progress Monitor</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              {deptName} &bull; FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Tracking active Capital Outlay (CapEx) and Operating Services (MOOE) commitments against your authorized planning sub-ceilings. All figures adhere to statutory DBM capitalization rules (&ge; ₱50,000 threshold).
          </p>
        </div>
        <button
          type="button"
          onClick={() => { fetchData(); fetchExpirationAlerts(); }}
          disabled={loading || loadingAlerts}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer font-bold disabled:opacity-50 transition-colors shadow-xs shrink-0 text-xs"
          title="Synchronize balances"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(loading || loadingAlerts) ? "animate-spin" : ""}`} />
          <span>Sync Balances</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Real-time Draft Headroom Dry-Run Notice */}
      {draftDryRun && isSubCeilingExceeded && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/30 border border-rose-300 dark:border-rose-900/60 rounded-2xl flex items-start gap-3 shadow-xs animate-fadeIn text-rose-950 dark:text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1 text-xs leading-relaxed flex-1">
            <h4 className="font-bold text-sm text-rose-900 dark:text-rose-300">
              Projected Sub-Ceiling Overage Alert (Pre-Flight Dry Run)
            </h4>
            <p>
              Your department has <strong>{formatPHP(totalDrafted)}</strong> in active draft proposals. Submitting your current drafts would bring your total commitments to <strong>{formatPHP(projectedTotalSpent)}</strong>, exceeding your authorized sub-ceiling limit of <strong>{formatPHP(subCeiling)}</strong> by <strong>{formatPHP(projectedTotalSpent - subCeiling)}</strong>.
            </p>
            <div className="pt-1">
              <Link 
                to="/dept/proposals" 
                className="text-rose-700 dark:text-rose-400 font-bold hover:underline inline-flex items-center gap-1 text-[11px]"
              >
                <span>Adjust draft quantities or mark non-replacement items as Expansion</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quotation Canvas Validity Alert (Sanitized Statutory Wording) */}
      {totalActiveAlerts > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/20 border border-amber-300 dark:border-amber-900/60 rounded-2xl space-y-2.5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold">
              <Clock className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Quotation Validity Advisory: {totalActiveAlerts} Canvas Document(s) Expiring Soon</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAlertDetails(!showAlertDetails)}
                className="text-amber-800 dark:text-amber-300 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer text-[10.5px] font-mono"
              >
                <span>{showAlertDetails ? "Hide Item Details" : "View Expiring Items"}</span>
                {showAlertDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
            Market quotations deposited in the <strong>Official Procurement Archive</strong> carry a statutory validity window. Items with expired quotations are locked against submission until an updated quotation canvas is attached.
          </p>

          {showAlertDetails && (
            <div className="pt-2 border-t border-amber-200 dark:border-amber-900/40 space-y-2 font-mono text-[10.5px]">
              {customAlerts.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[9px] uppercase font-bold text-amber-800 dark:text-amber-400 block font-sans">
                    Custom Department Proposals Requiring Updated Canvass:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customAlerts.map((ca, idx) => (
                      <div key={idx} className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800 flex justify-between items-center">
                        <span className="truncate pr-2 font-bold text-slate-800 dark:text-slate-200 font-sans">{ca.item_name}</span>
                        <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">{ca.days_remaining}d remaining</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {standardAlerts.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[9px] uppercase font-bold text-slate-500 block font-sans">
                    Catalog Items with Expiring Central Office Proof:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {standardAlerts.map((sa, idx) => (
                      <div key={idx} className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <span className="truncate pr-2 text-slate-700 dark:text-slate-300 font-sans">{sa.display_name}</span>
                        <span className="text-slate-500 shrink-0">{sa.days_remaining}d remaining</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-1">
            <button 
              type="button"
              onClick={() => navigate("/dept/proposals")}
              className="text-amber-800 dark:text-amber-300 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer text-xs"
            >
              <span>Review proposals and attach updated canvas proofs</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Progress Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Total Sub-Ceiling Utilization */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Landmark className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Total Sub-Ceiling</span>
            </span>
            <span className={overallSpentPercent > 100 ? "text-rose-600 font-bold" : "text-purple-600 dark:text-purple-400"}>
              {overallSpentPercent.toFixed(1)}%
            </span>
          </div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
            {formatPHP(totalSpent)} <span className="text-xs font-normal text-slate-400">/ {formatPHP(subCeiling)}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                overallSpentPercent > 100 ? "bg-rose-500" : overallSpentPercent >= 80 ? "bg-amber-500" : "bg-purple-600"
              }`} 
              style={{ width: `${Math.min(overallSpentPercent, 100)}%` }} 
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>Remaining Headroom:</span>
            <strong className={`font-bold ${subCeiling - totalSpent < 0 ? "text-rose-600" : "text-slate-700 dark:text-slate-300"}`}>
              {formatPHP(Math.max(0, subCeiling - totalSpent))}
            </strong>
          </div>
        </div>

        {/* Capital Outlay Limit (CapEx) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Capital Outlay (CapEx)</span>
            </span>
            <span className={capexPercent > 100 ? "text-rose-600 font-bold" : "text-blue-600 dark:text-blue-400"}>
              {capexPercent.toFixed(1)}%
            </span>
          </div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
            {formatPHP(spentCapex)} <span className="text-xs font-normal text-slate-400">/ {formatPHP(allocatedCapex)}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                capexPercent > 100 ? "bg-rose-500" : capexPercent >= 80 ? "bg-amber-500" : "bg-blue-600"
              }`} 
              style={{ width: `${Math.min(capexPercent, 100)}%` }} 
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>Remaining CapEx:</span>
            <strong className={`font-bold ${allocatedCapex - spentCapex < 0 ? "text-rose-600" : "text-slate-700 dark:text-slate-300"}`}>
              {formatPHP(Math.max(0, allocatedCapex - spentCapex))}
            </strong>
          </div>
        </div>

        {/* Operating Services Limit (MOOE) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Operating Services (MOOE)</span>
            </span>
            <span className={mooePercent > 100 ? "text-rose-600 font-bold" : "text-emerald-600 dark:text-emerald-400"}>
              {mooePercent.toFixed(1)}%
            </span>
          </div>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white">
            {formatPHP(spentMooe)} <span className="text-xs font-normal text-slate-400">/ {formatPHP(allocatedMooe)}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                mooePercent > 100 ? "bg-rose-500" : mooePercent >= 80 ? "bg-amber-500" : "bg-emerald-600"
              }`} 
              style={{ width: `${Math.min(mooePercent, 100)}%` }} 
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <span>Remaining MOOE:</span>
            <strong className={`font-bold ${allocatedMooe - spentMooe < 0 ? "text-rose-600" : "text-slate-700 dark:text-slate-300"}`}>
              {formatPHP(Math.max(0, allocatedMooe - spentMooe))}
            </strong>
          </div>
        </div>

      </div>

      {/* Quick Action Navigation Tiles (4-Way Partition: Proposals vs Systems vs Needs vs Vault) */}
      <div className="space-y-3 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono block">
          Department Procurement &amp; Planning Workspaces
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Resource Proposals (Part IV.A) */}
          <div 
            onClick={() => navigate("/dept/proposals")}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500/50 transition-all cursor-pointer flex flex-col justify-between shadow-xs group"
          >
            <div className="space-y-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-955 text-blue-600 dark:text-blue-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <FolderKanban className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Resource Proposals (Part IV.A)</h4>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                Budget for hardware equipment, packaged software licenses, and cloud subscriptions.
              </p>
            </div>
            <div className="pt-3 flex items-center justify-between text-blue-600 dark:text-blue-400 font-bold text-xs">
              <span>Open Proposals Ledger</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Propose a System (Part III.D) */}
          <div 
            onClick={() => navigate("/dept/proposed-systems")}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-500/50 transition-all cursor-pointer flex flex-col justify-between shadow-xs group"
          >
            <div className="space-y-2">
              <div className="p-3 bg-purple-50 dark:bg-purple-955 text-purple-600 dark:text-purple-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <Database className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Propose a System (Part III.D)</h4>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                Propose new multi-user software platforms, citizen portals, or platform upgrades.
              </p>
            </div>
            <div className="pt-3 flex items-center justify-between text-purple-600 dark:text-purple-400 font-bold text-xs">
              <span>Open Systems Studio</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: Needs Assessment (Section 8.0) */}
          <div 
            onClick={() => navigate("/dept/needs")}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-500/50 transition-all cursor-pointer flex flex-col justify-between shadow-xs group"
          >
            <div className="space-y-2">
              <div className="p-3 bg-teal-50 dark:bg-teal-955 text-teal-600 dark:text-teal-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <ClipboardList className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Needs Assessment (Sec 8.0)</h4>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                Document operational bottlenecks and problem statements for MIS Admin review.
              </p>
            </div>
            <div className="pt-3 flex items-center justify-between text-teal-600 dark:text-teal-400 font-bold text-xs">
              <span>Document Technical Needs</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 4: Department Vault & Archives */}
          <div 
            onClick={() => navigate("/dept/vault")}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500/50 transition-all cursor-pointer flex flex-col justify-between shadow-xs group"
          >
            <div className="space-y-2">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-955 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit group-hover:scale-105 transition-transform">
                <Archive className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">Official Document Vault</h4>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                Access departmental sub-ceiling certificates, export proposals to CSV, and print reports.
              </p>
            </div>
            <div className="pt-3 flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold text-xs">
              <span>Access Vault Records</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}