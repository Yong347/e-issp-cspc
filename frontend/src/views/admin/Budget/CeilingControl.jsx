// frontend/src/views/admin/Budget/CeilingControl.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { getBudgetCeilings, updateBudgetCeiling } from "../../../api/admin";
import { 
  TrendingUp, ShieldCheck, RefreshCw, AlertCircle, CheckCircle, 
  Landmark, ShieldAlert, Award, Edit2, Settings 
} from "lucide-react";

export default function CeilingControl() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [ceilings, setCeilings] = useState([]);
  const [globalCeiling, setGlobalCeiling] = useState("200000000.00");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Pre-flight Dry Run state
  const [validationResult, setValidationResult] = useState(null);

  // Edit Modal State
  const [activeDept, setActiveDept] = useState(null);
  const [subCeilingInput, setSubCeilingInput] = useState("");
  const [capexInput, setCapexInput] = useState("");
  const [mooeInput, setMooeInput] = useState("");
  const [useDefaultSplit, setUseDefaultSplit] = useState(true);

  // Robust backend host URL fallback
  const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;
  const token = user?.token || user?.accessToken;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBudgetCeilings(token);
      setCeilings(data);
      if (data.length > 0) {
        setGlobalCeiling(String(data[0].global_ceiling || "200000000.00"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, activeCycle]);

  // Update overall institutional budget cap
  const handleUpdateGlobalCeiling = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/global-budget-ceiling`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          global_ceiling: parseFloat(globalCeiling) || 0.0
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update global ceiling limit.");
      }

      setSuccess("Institutional Global Budget Ceiling updated successfully.");
      fetchData();
    } catch (err) {
      setError(err.message);
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
      const res = await fetch(`${apiUrl}/api/admin/budget-validation`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error("Pre-flight validation check failed to complete.");
      }
      const data = await res.json();
      setValidationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const openEditModal = (dept) => {
    setActiveDept(dept);
    const subCeil = dept.sub_ceiling || 0;
    const cap = dept.allocated_capex || 0;
    const mooe = dept.allocated_mooe || 0;

    setSubCeilingInput(String(subCeil));
    setCapexInput(String(cap));
    setMooeInput(String(mooe));

    // Determine if the existing budget matches the 70/30 split rule
    const expectedCap = Math.round(subCeil * 0.70);
    const isDefaultSplit = (cap === expectedCap) && (mooe === subCeil - expectedCap);
    setUseDefaultSplit(isDefaultSplit);
  };

  const handleSaveDepartmentCeiling = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    let capexVal = parseFloat(capexInput) || 0.0;
    let mooeVal = parseFloat(mooeInput) || 0.0;
    const subCeilingVal = parseFloat(subCeilingInput) || 0.0;

    // Apply the standard 70/30 CapEx/MOOE split if selected
    if (useDefaultSplit) {
      capexVal = Math.round(subCeilingVal * 0.70);
      mooeVal = subCeilingVal - capexVal;
    }

    try {
      await updateBudgetCeiling(token, {
        department_id: activeDept.department_id,
        allocated_capex: capexVal,
        allocated_mooe: mooeVal,
        sub_ceiling: subCeilingVal
      });

      setSuccess(`Budget allocation updated for '${activeDept.department_name}'.`);
      setActiveDept(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 select-none">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Landmark className="w-5 h-5 text-purple-500" />
            <span>Sub-Ceiling Allocation Monitor</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Enforce spending limits and balance allocations between Capital Outlay (CapEx) and MOOE budgets for the cycle.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runValidationCheck}
            disabled={validating}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ShieldCheck className={`w-4 h-4 text-emerald-400 ${validating ? "animate-pulse" : ""}`} />
            <span>Pre-flight Dry Run Check</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5 text-xs">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Real-time Dry Run validation banners */}
      {validationResult && (
        <div className={`p-5 border rounded-xl flex items-start gap-4 leading-relaxed ${
          validationResult.validation_passed 
            ? "bg-emerald-950/20 border-emerald-800/80 text-emerald-300"
            : "bg-red-955/20 border-red-900/80 text-red-300"
        }`}>
          {validationResult.validation_passed ? (
            <>
              <Award className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Dry Run Validation Successful</h4>
                <p className="mt-1 text-slate-400">
                  Consolidated departmental spending is completely balanced and cleared. Your figures fall within the active sub-ceilings.
                </p>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 animate-bounce" />
              <div className="space-y-2 flex-grow">
                <h4 className="font-bold text-sm">Budget Ceiling Overage Detected</h4>
                <p className="text-slate-400">
                  The following departments have exceeded their allocated CapEx or MOOE limits. These overages must be adjusted before document compilation:
                </p>
                <div className="space-y-1 bg-slate-950/50 p-3 rounded-lg border border-red-900/40 max-w-xl font-mono">
                  {validationResult.breaches?.map((b, idx) => (
                    <div key={idx} className="flex justify-between gap-4 text-xs">
                      <span>{b.department_name}</span>
                      <span className="font-bold text-red-400">
                        Overage: +₱{Number(b.budget_overage_php || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form Panel: Global Cap Settings */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4">
          <h3 className="text-white font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span>Global Ceiling Settings</span>
          </h3>

          <form onSubmit={handleUpdateGlobalCeiling} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Global Institutional Budget Cap (PHP)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={globalCeiling}
                onChange={(e) => setGlobalCeiling(e.target.value)}
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono outline-none focus:ring-1 focus:ring-purple-600 transition-all text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full p-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>{submitting ? "Updating..." : "Save Global Limit"}</span>
            </button>
          </form>
        </div>

        {/* Right Dashboard Board: Department sub-ceilings and progress meters */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-5">
          <h3 className="text-white font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-3">
            Active Cycle Department Allocations
          </h3>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
              <span>Fetching departmental profiles...</span>
            </div>
          ) : ceilings.length > 0 ? (
            <div className="space-y-5">
              {ceilings.map((dept) => {
                const totalSpent = Number(dept.current_spent || 0);
                const subCeiling = Number(dept.sub_ceiling || 0);
                const capexAllocated = Number(dept.allocated_capex || 0);
                const mooeAllocated = Number(dept.allocated_mooe || 0);

                const subCeilingSpentPercent = subCeiling > 0 ? Math.min((totalSpent / subCeiling) * 100, 100) : 0;
                
                return (
                  <div key={dept.department_id} className="p-4 bg-slate-955/40 rounded-xl border border-slate-850 space-y-3.5 hover:border-slate-800 transition-all">
                    {/* Department Header */}
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-slate-200 text-sm">{dept.department_name}</h4>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID mapping: {dept.department_id}</p>
                      </div>
                      <button
                        onClick={() => openEditModal(dept)}
                        className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-purple-400 rounded-md transition-colors cursor-pointer"
                        title="Configure Allotments"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Allotment stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-slate-900 pt-3">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Consolidated Cap</span>
                        <div className="font-mono font-bold text-slate-300 text-xs mt-0.5">
                          ₱{subCeiling.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">CapEx / Hardware Cap</span>
                        <div className="font-mono text-slate-400 text-xs mt-0.5">
                          ₱{capexAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">MOOE / Software Cap</span>
                        <div className="font-mono text-slate-400 text-xs mt-0.5">
                          ₱{mooeAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* Progress tracking bar */}
                    <div className="space-y-1 pt-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Utilization Rate</span>
                        <span className={`font-bold ${totalSpent > subCeiling ? "text-red-400" : "text-slate-300"}`}>
                          ₱{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({subCeilingSpentPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-850">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            totalSpent > subCeiling ? "bg-red-500 animate-pulse" : "bg-purple-500"
                          }`}
                          style={{ width: `${subCeilingSpentPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500">
              No departmental sub-ceilings configured for this cycle. Set up allocations using the tools.
            </div>
          )}
        </div>
      </div>

      {/* Edit Department Allocation Modal */}
      {activeDept && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white">Adjust Department Allocations</h3>
              <button 
                onClick={() => setActiveDept(null)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveDepartmentCeiling} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-955 rounded-lg border border-slate-850 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Department</span>
                <p className="font-bold text-slate-200">{activeDept.department_name}</p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Consolidated Sub-Ceiling Limit (PHP)
                </label>
                <input
                  type="number"
                  required
                  disabled={!useDefaultSplit}
                  value={subCeilingInput}
                  onChange={(e) => {
                    const total = parseFloat(e.target.value) || 0;
                    setSubCeilingInput(e.target.value);
                    if (useDefaultSplit) {
                      const cap = Math.round(total * 0.70);
                      setCapexInput(String(cap));
                      setMooeInput(String(total - cap));
                    }
                  }}
                  placeholder="0.00"
                  className={`w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono outline-none ${
                    !useDefaultSplit ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-955/50 p-3 rounded-lg border border-slate-850/80">
                <input
                  type="checkbox"
                  id="split_toggle"
                  checked={useDefaultSplit}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseDefaultSplit(checked);
                    if (checked) {
                      const total = parseFloat(subCeilingInput) || 0;
                      const cap = Math.round(total * 0.70);
                      setCapexInput(String(cap));
                      setMooeInput(String(total - cap));
                    }
                  }}
                  className="w-3.5 h-3.5 accent-purple-600 rounded cursor-pointer"
                />
                <label htmlFor="split_toggle" className="text-[10px] font-semibold text-slate-300 cursor-pointer select-none">
                  Apply Standard 70/30 CapEx/MOOE split automatically
                </label>
              </div>

              {!useDefaultSplit && (
                <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      Manual CapEx / Hardware Allotment (PHP)
                    </label>
                    <input
                      type="number"
                      required
                      value={capexInput}
                      onChange={(e) => {
                        const cap = parseFloat(e.target.value) || 0;
                        setCapexInput(e.target.value);
                        setSubCeilingInput(String(cap + (parseFloat(mooeInput) || 0)));
                      }}
                      placeholder="0.00"
                      className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      Manual MOOE / Software Allotment (PHP)
                    </label>
                    <input
                      type="number"
                      required
                      value={mooeInput}
                      onChange={(e) => {
                        const mooe = parseFloat(e.target.value) || 0;
                        setMooeInput(e.target.value);
                        setSubCeilingInput(String((parseFloat(capexInput) || 0) + mooe));
                      }}
                      placeholder="0.00"
                      className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full p-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all mt-4 cursor-pointer"
              >
                <span>{submitting ? "Updating Allocations..." : "Save Allotments"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}