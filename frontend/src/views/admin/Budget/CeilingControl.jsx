// frontend/src/views/admin/Budget/CeilingControl.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getBudgetCeilings, 
  updateBudgetCeiling, 
  updateGlobalBudgetCeiling, 
  validateBudgetPreflight, 
  getParityMatrices 
} from "../../../api/admin";
import { 
  TrendingUp, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Landmark, 
  ShieldAlert, 
  Award, 
  Edit2, 
  Coins, 
  Search, 
  Filter, 
  ArrowUpRight, 
  Scale, 
  SlidersHorizontal,
  X,
  Layers,
  Info
} from "lucide-react";

export default function CeilingControl() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();

  // Core Data States
  const [ceilings, setCeilings] = useState([]);
  const [globalCeiling, setGlobalCeiling] = useState("200000000.00");
  const [parityData, setParityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Pre-flight Dry Run state
  const [validationResult, setValidationResult] = useState(null);

  // Filter and Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, over, near, normal

  // Edit Modal State (Independent CapEx & MOOE Allocation)
  const [activeDept, setActiveDept] = useState(null);
  const [subCeilingInput, setSubCeilingInput] = useState("");
  const [capexInput, setCapexInput] = useState("");
  const [mooeInput, setMooeInput] = useState("");
  const [splitPreset, setSplitPreset] = useState("custom"); // "custom", "70_30", "60_40", "50_50", "100_0", "0_100"

  // Global Ceiling Edit Modal State
  const [isEditingGlobal, setIsEditingGlobal] = useState(false);
  const [globalCeilingInput, setGlobalCeilingInput] = useState("200000000.00");

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Department Ceilings
      const data = await getBudgetCeilings(token);
      const ceilingsList = Array.isArray(data) ? data : [];
      setCeilings(ceilingsList);
      
      if (ceilingsList.length > 0 && ceilingsList[0].global_ceiling) {
        setGlobalCeiling(String(ceilingsList[0].global_ceiling));
        setGlobalCeilingInput(String(ceilingsList[0].global_ceiling));
      }

      // 2. Fetch Part IV.B Parity Matrix Data
      const pJson = await getParityMatrices(token, activeCycle).catch(() => null);
      if (pJson) {
        setParityData(pJson);
      }
    } catch (err) {
      setError(err.message || "Failed to load budget ceiling data.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCycle]);

  useEffect(() => {
    if (token && activeCycle) {
      fetchData();
    }
  }, [token, activeCycle, fetchData]);

  // Update overall institutional budget cap
  const handleUpdateGlobalCeiling = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload = {
        global_ceiling: parseFloat(globalCeilingInput) || 0.0
      };
      await updateGlobalBudgetCeiling(token, payload);

      setGlobalCeiling(globalCeilingInput);
      setIsEditingGlobal(false);
      setSuccess("Institutional Global Budget Ceiling updated successfully.");
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to update global ceiling.");
    } finally {
      setSubmitting(false);
    }
  };

  // Run Pre-flight Budget Dry-Run Validation Check
  const runValidationCheck = async () => {
    setValidating(true);
    setError(null);
    setValidationResult(null);
    try {
      const data = await validateBudgetPreflight(token, activeCycle);
      setValidationResult(data);
    } catch (err) {
      setError(err.message || "Pre-flight validation check failed.");
    } finally {
      setValidating(false);
    }
  };

  const openEditModal = (dept) => {
    setActiveDept(dept);
    const cap = Number(dept.allocated_capex || 0);
    const mooe = Number(dept.allocated_mooe || 0);
    const subCeil = Number(dept.sub_ceiling || (cap + mooe));

    setSubCeilingInput(String(subCeil));
    setCapexInput(String(cap));
    setMooeInput(String(mooe));

    // Detect preset if applicable
    if (subCeil > 0) {
      const roundCap70 = Math.round(subCeil * 0.70);
      const roundCap60 = Math.round(subCeil * 0.60);
      const roundCap50 = Math.round(subCeil * 0.50);

      if (cap === roundCap70 && mooe === subCeil - roundCap70) {
        setSplitPreset("70_30");
      } else if (cap === roundCap60 && mooe === subCeil - roundCap60) {
        setSplitPreset("60_40");
      } else if (cap === roundCap50 && mooe === subCeil - roundCap50) {
        setSplitPreset("50_50");
      } else if (cap === subCeil && mooe === 0) {
        setSplitPreset("100_0");
      } else if (cap === 0 && mooe === subCeil) {
        setSplitPreset("0_100");
      } else {
        setSplitPreset("custom");
      }
    } else {
      setSplitPreset("custom");
    }
  };

  // Handles applying split presets dynamically
  const applyPreset = (presetKey, currentSubCeiling) => {
    setSplitPreset(presetKey);
    const total = parseFloat(currentSubCeiling) || 0;
    if (presetKey === "70_30") {
      const cap = Math.round(total * 0.70);
      setCapexInput(String(cap));
      setMooeInput(String(total - cap));
    } else if (presetKey === "60_40") {
      const cap = Math.round(total * 0.60);
      setCapexInput(String(cap));
      setMooeInput(String(total - cap));
    } else if (presetKey === "50_50") {
      const cap = Math.round(total * 0.50);
      setCapexInput(String(cap));
      setMooeInput(String(total - cap));
    } else if (presetKey === "100_0") {
      setCapexInput(String(total));
      setMooeInput("0");
    } else if (presetKey === "0_100") {
      setCapexInput("0");
      setMooeInput(String(total));
    }
  };

  const handleSaveDepartmentCeiling = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const capexVal = parseFloat(capexInput) || 0.0;
    const mooeVal = parseFloat(mooeInput) || 0.0;
    const subCeilingVal = capexVal + mooeVal;

    try {
      await updateBudgetCeiling(token, {
        department_id: activeDept.department_id,
        allocated_capex: capexVal,
        allocated_mooe: mooeVal,
        sub_ceiling: subCeilingVal
      });

      setSuccess(`Budget allocation updated for '${activeDept.department_name}'. (CapEx: ${formatPHP(capexVal)} | MOOE: ${formatPHP(mooeVal)})`);
      setActiveDept(null);
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to persist department sub-ceiling.");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculations for Institutional Aggregates
  const totalAllocatedSubCeilings = ceilings.reduce((sum, d) => sum + Number(d.sub_ceiling || 0), 0);
  const totalActualSpent = ceilings.reduce((sum, d) => sum + Number(d.current_spent || 0), 0);
  const globalCapNum = parseFloat(globalCeiling) || 0;
  const unallocatedReserve = globalCapNum - totalAllocatedSubCeilings;
  const isAllocationOverGlobal = totalAllocatedSubCeilings > globalCapNum;
  const globalSpentPercent = globalCapNum > 0 ? (totalActualSpent / globalCapNum) * 100 : 0;

  // Parity Totals & Discrepancy Safe Resolution
  const certifiedGrandTotal = parseFloat(parityData?.certified_grand_total || parityData?.Certified_Grand_Total || 0);
  const isParityValid = parityData?.is_parity_valid !== undefined ? parityData.is_parity_valid : true;
  const discrepancy = parseFloat(parityData?.parity_discrepancy || 0);

  // Filter departments for listing
  const filteredCeilings = ceilings.filter(d => {
    const matchesSearch = (d.department_name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(d.department_id || "").includes(searchQuery);

    const spent = Number(d.current_spent || 0);
    const sub = Number(d.sub_ceiling || 0);
    const ratio = sub > 0 ? (spent / sub) : 0;

    let matchesStatus = true;
    if (filterStatus === "over") {
      matchesStatus = spent > sub;
    } else if (filterStatus === "near") {
      matchesStatus = spent <= sub && ratio >= 0.80;
    } else if (filterStatus === "normal") {
      matchesStatus = ratio < 0.80;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Sub-Ceiling Allocation &amp; 4-Way Parity Governance</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Configure independent CapEx and MOOE department allotments, audit global ceiling reserves, and certify four-way investment parity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate("/admin/parity-summary")}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs text-xs"
            title="Open Detailed Part IV.B Parity Matrix Viewer"
          >
            <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>4-Way Parity Ledger</span>
          </button>
          <button
            onClick={runValidationCheck}
            disabled={validating}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm text-xs"
          >
            <ShieldCheck className={`w-4 h-4 ${validating ? "animate-spin" : ""}`} />
            <span>{validating ? "Running Dry Run..." : "Pre-flight Dry Run Check"}</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Sync all database values"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Real-time Dry Run Validation Banner */}
      {validationResult && (
        <div className={`p-5 rounded-2xl border flex items-start gap-4 leading-relaxed animate-fadeIn shadow-xs ${
          validationResult.validation_passed 
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" 
            : "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-300"
        }`}>
          {validationResult.validation_passed ? (
            <>
              <Award className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm">Dry Run Validation Successful: All Expenditures Balanced</h4>
                  <button onClick={() => setValidationResult(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs">
                  All active department requests fit completely within their assigned sub-ceilings. No overages detected for planning cycle FY {activeCycle}.
                </p>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce mt-0.5" />
              <div className="space-y-2 flex-grow">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm">Budget Ceiling Overage Detected ({validationResult.total_violations_detected || 1} Departments)</h4>
                  <button onClick={() => setValidationResult(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs">
                  The following departments have submitted or drafted outlays exceeding their allocated sub-ceilings. These overages must be adjusted before document compilation:
                </p>
                <div className="space-y-1.5 bg-white dark:bg-slate-950 p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 max-w-2xl font-mono text-[11px]">
                  {validationResult.breaches?.map((b, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{b.department_name}</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        Overage: +{formatPHP(b.budget_overage_php || 0)} (Allocated: {formatPHP(b.allocated_sub_ceiling_php || 0)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 4 Macro Institutional Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Global Budget Ceiling */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-1 shadow-xs">
          <div className="flex justify-between items-center text-slate-500 font-bold uppercase text-[10px]">
            <span className="flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Global Budget Ceiling</span>
            </span>
            <button 
              onClick={() => setIsEditingGlobal(true)}
              className="p-1 hover:text-blue-600 text-slate-400 rounded-lg transition-colors cursor-pointer"
              title="Edit Global Limit"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
          <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">{formatPHP(globalCapNum)}</div>
          <span className="text-[10px] text-slate-400 block">Institutional Planning Cap</span>
        </div>

        {/* Card 2: Allocated Sub-Ceilings vs Reserve */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Sub-Ceilings Assigned</span>
          </span>
          <div className={`font-mono text-lg font-bold ${isAllocationOverGlobal ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
            {formatPHP(totalAllocatedSubCeilings)}
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Unallocated Reserve:</span>
            <span className={`font-mono font-bold ${unallocatedReserve < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatPHP(unallocatedReserve)}
            </span>
          </div>
        </div>

        {/* Card 3: Actual Committed Spending */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Total Actual Committed</span>
          </span>
          <div className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{formatPHP(totalActualSpent)}</div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Overall Utilization:</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{globalSpentPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Card 4: Four-Way Parity Monitor */}
        <div 
          onClick={() => navigate("/admin/parity-summary")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            isParityValid 
              ? "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 text-slate-900 dark:text-white" 
              : "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-300 animate-pulse"
          }`}
        >
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>4-Way Parity Status</span>
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="font-mono text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">
            {formatPHP(certifiedGrandTotal)}
          </div>
          <span className="text-[10px] text-slate-500 block">
            {isParityValid ? "★ Tables B.1 - B.4 Balanced" : `Discrepancy: ${formatPHP(discrepancy)}`}
          </span>
        </div>
      </div>

      {/* Main Grid: Management Console and Department List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Macro Allocation Rules & 4-Way Parity Ledger */}
        <div className="space-y-6">
          {/* Expenditure Class Allocation Principles Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Expenditure Class Principles</span>
            </h3>

            <div className="space-y-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                In compliance with DBM and DICT guidelines, department sub-ceilings are composed of independent expenditure classes:
              </p>
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between font-mono">
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Capital Outlay (CapEx)</span>
                  <span className="text-slate-500">&ge; ₱50k / Software</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-purple-600 dark:text-purple-400 font-bold">Operating Services (MOOE)</span>
                  <span className="text-slate-500">&lt; ₱50k, Subscriptions</span>
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Allotments can be set independently per department based on strategic procurement requirements (e.g., custom 60/40, 50/50, or 100% CapEx/MOOE).
                </span>
              </div>
            </div>
          </div>

          {/* Part IV.B Parity Reconciliation Widget */}
          {parityData && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-xs">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Part IV.B Parity Reconciliation</span>
                </span>
                <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-mono font-bold uppercase">
                  Certified
                </span>
              </h3>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">B.1 General Summary:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatPHP(parityData.b1_general_summary?.["GRAND TOTAL"]?.["Total"] || certifiedGrandTotal)}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">B.2 Fund Sources:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatPHP(parityData.b2_fund_source?.["GRAND TOTAL"]?.["Total"] || certifiedGrandTotal)}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">B.3 Statement of Exp.:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatPHP(parityData.b3_statement_of_expenditure?.["GRAND TOTAL"]?.["Total"] || certifiedGrandTotal)}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">B.4 Object of Exp. (UACS):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPHP(parityData.b4_object_of_expenditure?.["GRAND TOTAL"]?.["Total"] || certifiedGrandTotal)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Department Sub-Ceilings Directory */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider">
                Departmental Budget Allotments (FY {activeCycle})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Independent monitoring of CapEx and MOOE consumption per department</p>
            </div>

            {/* Search and Status Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter department..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer font-semibold"
              >
                <option value="all">All Departments</option>
                <option value="over">Over Ceiling (&gt;100%)</option>
                <option value="near">Near Limit (&ge;80%)</option>
                <option value="normal">Under Limit (&lt;80%)</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Loading department budget allotments...</span>
            </div>
          ) : filteredCeilings.length > 0 ? (
            <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
              {filteredCeilings.map((dept) => {
                const totalSpent = Number(dept.current_spent || 0);
                const subCeiling = Number(dept.sub_ceiling || 0);
                const capexAllocated = Number(dept.allocated_capex || 0);
                const mooeAllocated = Number(dept.allocated_mooe || 0);

                const isOver = totalSpent > subCeiling;
                const percentSpent = subCeiling > 0 ? Math.min((totalSpent / subCeiling) * 100, 100) : 0;
                const rawPercent = subCeiling > 0 ? (totalSpent / subCeiling) * 100 : 0;

                // Accurate CapEx / MOOE percentage breakdown
                const capexPct = subCeiling > 0 ? Math.round((capexAllocated / subCeiling) * 100) : 0;
                const mooePct = subCeiling > 0 ? Math.round((mooeAllocated / subCeiling) * 100) : 0;

                return (
                  <div 
                    key={dept.department_id} 
                    className={`p-4 rounded-2xl border transition-all space-y-3 shadow-xs ${
                      isOver 
                        ? "bg-rose-50/60 dark:bg-rose-955/20 border-rose-300 dark:border-rose-900/60 border-l-4 border-l-rose-500" 
                        : rawPercent >= 80 
                        ? "bg-amber-50/60 dark:bg-amber-955/20 border-amber-300 dark:border-amber-900/60" 
                        : "bg-slate-50 dark:bg-slate-955 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-xs">{dept.department_name}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">Department ID: #{dept.department_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOver ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 font-mono animate-pulse">
                            Over Ceiling (+{formatPHP(totalSpent - subCeiling)})
                          </span>
                        ) : rawPercent >= 80 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-mono">
                            Near Limit ({rawPercent.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono">
                            Within Budget
                          </span>
                        )}
                        <button
                          onClick={() => openEditModal(dept)}
                          className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer shadow-xs"
                          title="Configure Sub-Ceilings"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Allotments Matrix with Actual Computed Percentages */}
                    <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px] font-mono">
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Sub-Ceiling Cap</span>
                        <span className="text-slate-900 dark:text-white font-bold">{formatPHP(subCeiling)}</span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 block">
                          CapEx Allotment ({capexPct}%)
                        </span>
                        <span className="text-blue-700 dark:text-blue-300 font-bold">{formatPHP(capexAllocated)}</span>
                      </div>
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-purple-600 dark:text-purple-400 block">
                          MOOE Allotment ({mooePct}%)
                        </span>
                        <span className="text-purple-700 dark:text-purple-300 font-bold">{formatPHP(mooeAllocated)}</span>
                      </div>
                    </div>

                    {/* Progress Utilization Meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">
                          Committed: <strong className={isOver ? "text-rose-600 dark:text-rose-400 font-mono" : "text-slate-900 dark:text-white font-mono"}>{formatPHP(totalSpent)}</strong>
                        </span>
                        <span className="font-mono text-slate-400">{rawPercent.toFixed(1)}% of Sub-Ceiling</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOver ? "bg-rose-600 animate-pulse" : rawPercent >= 80 ? "bg-amber-500" : "bg-blue-600"
                          }`}
                          style={{ width: `${percentSpent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400 italic">
              No departmental sub-ceilings match your query.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: EDIT DEPARTMENT ALLOCATION (TWO-WAY INTERACTIVE PRESET SPLIT & RECALCULATION) */}
      {activeDept && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Configure Department Allotments</h3>
                <span className="text-[10px] text-slate-500 font-mono">Independent CapEx and MOOE Sub-Ceilings</span>
              </div>
              <button 
                onClick={() => setActiveDept(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartmentCeiling} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Target Department</span>
                <p className="font-bold text-slate-900 dark:text-white text-sm">{activeDept.department_name}</p>
              </div>

              {/* Editable Target Total Sub-Ceiling Input */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Target Total Sub-Ceiling (PHP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={subCeilingInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSubCeilingInput(val);
                    if (splitPreset !== "custom") {
                      applyPreset(splitPreset, val);
                    } else {
                      const total = parseFloat(val) || 0;
                      const currentCap = parseFloat(capexInput) || 0;
                      const currentMooe = parseFloat(mooeInput) || 0;
                      const oldSum = currentCap + currentMooe;
                      if (oldSum > 0) {
                        const ratio = currentCap / oldSum;
                        setCapexInput(String(Math.round(total * ratio)));
                        setMooeInput(String(total - Math.round(total * ratio)));
                      } else {
                        setCapexInput(String(total));
                        setMooeInput("0");
                      }
                    }
                  }}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* Allocation Presets Selector */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Quick Allocation Preset
                </label>
                <select
                  value={splitPreset}
                  onChange={(e) => applyPreset(e.target.value, subCeilingInput)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="custom">Custom / Independent Entry</option>
                  <option value="70_30">70% CapEx / 30% MOOE</option>
                  <option value="60_40">60% CapEx / 40% MOOE</option>
                  <option value="50_50">50% CapEx / 50% MOOE</option>
                  <option value="100_0">100% CapEx (0% MOOE)</option>
                  <option value="0_100">100% MOOE (0% CapEx)</option>
                </select>
              </div>

              {/* Independent CapEx and MOOE Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                    CapEx Allotment (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={capexInput}
                    onChange={(e) => {
                      const newCap = parseFloat(e.target.value) || 0;
                      setCapexInput(e.target.value);
                      setSplitPreset("custom");
                      const currentMooe = parseFloat(mooeInput) || 0;
                      setSubCeilingInput(String(newCap + currentMooe));
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 tracking-wider">
                    MOOE Allotment (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={mooeInput}
                    onChange={(e) => {
                      const newMooe = parseFloat(e.target.value) || 0;
                      setMooeInput(e.target.value);
                      setSplitPreset("custom");
                      const currentCap = parseFloat(capexInput) || 0;
                      setSubCeilingInput(String(currentCap + newMooe));
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 font-bold"
                  />
                </div>
              </div>

              {/* Automatically Computed Total Sub-Ceiling Box */}
              <div className="p-3 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">Computed Sub-Ceiling</span>
                  <span className="text-[9.5px] text-slate-400 font-mono">Natural Sum = CapEx + MOOE</span>
                </div>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                  {formatPHP((parseFloat(capexInput) || 0) + (parseFloat(mooeInput) || 0))}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Updating Allotments..." : "Save Department Allotments"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT GLOBAL CEILING */}
      {isEditingGlobal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Update Global Budget Ceiling</h3>
              <button 
                onClick={() => setIsEditingGlobal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateGlobalCeiling} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">
                  Institutional Budget Ceiling (PHP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={globalCeilingInput}
                  onChange={(e) => setGlobalCeilingInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Saving..." : "Update Global Ceiling"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}