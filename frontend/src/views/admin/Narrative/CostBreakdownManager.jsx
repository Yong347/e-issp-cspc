// frontend/src/views/admin/Narrative/CostBreakdownManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getAnnualCosts,
  createAnnualCost,
  deleteAnnualCost
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Coins,
  Search,
  Filter,
  AlertCircle,
  CheckCircle,
  Calculator,
  CalendarDays,
  Layers
} from "lucide-react";

export default function CostBreakdownManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    project_key: "LMS",
    cost_type: "CapEx",
    item_description: "",
    unit_cost: ""
  });
  const [yearlyQty, setYearlyQty] = useState({});

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCostType, setFilterCostType] = useState("All");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Synchronize yearly quantity input fields whenever planning years adjust
  useEffect(() => {
    if (planningYears && planningYears.length > 0) {
      const initialQtys = {};
      planningYears.forEach(year => {
        initialQtys[String(year)] = 0;
      });
      setYearlyQty(initialQtys);
    }
  }, [planningYears]);

  const fetchCostsList = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAnnualCosts(user.token, activeCycle);
      setCosts(data);
    } catch (err) {
      setError(err.message || "Failed to load cost breakdown ledger.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchCostsList();
    }
  }, [user, activeCycle]);

  const handleQtyChange = (year, value) => {
    const valInt = parseInt(value, 10);
    setYearlyQty(prev => ({
      ...prev,
      [String(year)]: isNaN(valInt) || valInt < 0 ? 0 : valInt
    }));
  };

  const validateForm = () => {
    if (!form.item_description.trim()) return "Item description is required.";
    const costNum = parseFloat(form.unit_cost);
    if (isNaN(costNum) || costNum < 0) return "Unit cost must be a non-negative number.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        project_key: form.project_key,
        cost_type: form.cost_type,
        item_description: form.item_description.trim(),
        unit_cost: parseFloat(form.unit_cost),
        yearly_quantities: yearlyQty
      };

      await createAnnualCost(user.token, activeCycle, payload);
      setSuccess("Cost line item recorded successfully.");

      // Reset Form fields
      setForm({
        project_key: "LMS",
        cost_type: "CapEx",
        item_description: "",
        unit_cost: ""
      });
      
      // Reset quantities back to zeros
      const resetQtys = {};
      planningYears.forEach(year => {
        resetQtys[String(year)] = 0;
      });
      setYearlyQty(resetQtys);

      fetchCostsList();
    } catch (err) {
      setError(err.message || "Failed to record annual cost mapping.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this cost item allocation?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteAnnualCost(user.token, id);
      setSuccess("Cost line item successfully removed.");
      fetchCostsList();
    } catch (err) {
      setError(err.message || "Failed to delete cost allocation entry.");
    }
  };

  // Live calculation of item subtotal for active form editing
  const getFormSubtotal = () => {
    const cost = parseFloat(form.unit_cost) || 0;
    const totalQty = Object.values(yearlyQty).reduce((sum, qty) => sum + qty, 0);
    return cost * totalQty;
  };

  const filteredCosts = costs.filter(c => {
    const matchesSearch = 
      c.item_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.project_key.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterCostType === "All" || c.cost_type === filterCostType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-500" />
            <span>Part V.D & Annex A-5: Detailed Cost Breakdown Matrix</span>
          </h2>
          <p className="text-slate-400 mt-1">Record Multi-Year cost estimates, MOOE software licenses, and continuing SUC operational budgets.</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 bg-emerald-950/40 border border-emerald-900 rounded font-bold font-mono text-emerald-400 uppercase tracking-wider">
          Cycle: {activeCycle || "Unassigned"}
        </span>
      </div>

      {error && (
        <div className="p-4 bg-red-955/20 border border-red-900 text-red-400 font-bold rounded-lg flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-800 text-emerald-400 font-bold rounded-lg flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Plus className="w-4 h-4 text-emerald-500" />
            <span>Map Cost Item Allocation</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Associated Strategic Project</label>
            <select
              value={form.project_key}
              onChange={e => setForm({ ...form, project_key: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono"
            >
              <option value="LMS">LMS - Deployment of Moodle LMS</option>
              <option value="WiFi">WIFI - Upgrading and Expansion of WiFi Network</option>
              <option value="VOIP">VOIP - Upgrade SUC PABX to Unified Voice Pipelines</option>
              <option value="Portal">PORTAL - SUC Student & Enrollment Portal Integration</option>
              <option value="Security">SECURITY - Deployment of SUC Next-Gen Firewall Modules</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Expenditure Category</label>
            <select
              value={form.cost_type}
              onChange={e => setForm({ ...form, cost_type: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-bold text-emerald-400"
            >
              <option value="CapEx">CapEx (Capital Outlay / Hardware)</option>
              <option value="MOOE">MOOE (Software / Dynamic Licenses)</option>
              <option value="Continuing">Continuing SUC Operational Costs</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Item Description</label>
            <input
              type="text"
              placeholder="e.g. Enterprise Access Point Layer 3"
              value={form.item_description}
              onChange={e => setForm({ ...form, item_description: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unit Rate (PHP ₱)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={form.unit_cost}
              onChange={e => setForm({ ...form, unit_cost: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono font-bold"
              required
            />
          </div>

          {/* Dynamic Yearly Allocations */}
          <div className="space-y-3 p-4 bg-slate-950 rounded-xl border border-slate-850">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
              <span>Multi-Year Deployment Quantities</span>
            </span>
            <div className="space-y-2">
              {planningYears.map(year => (
                <div key={year} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Fiscal Year {year}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={yearlyQty[String(year)] || 0}
                    onChange={e => handleQtyChange(year, e.target.value)}
                    className="w-20 p-2 bg-slate-900 border border-slate-800 text-center rounded-lg text-white font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Estimated Item Total */}
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-center justify-between">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Calculator className="w-4 h-4 text-emerald-500" />
              <span>Projected Line Total:</span>
            </span>
            <span className="font-mono text-sm font-bold text-emerald-400">
              ₱{getFormSubtotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Preserving..." : "Save Cost Item"}</span>
          </button>
        </form>

        {/* Cost Matrix Register Output */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls bar */}
          <div className="flex flex-col md:flex-row gap-3 justify-between items-center border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search allocations or project keys..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Type:</span>
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-850">
                {["All", "CapEx", "MOOE", "Continuing"].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterCostType(type)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      filterCostType === type 
                        ? "bg-emerald-600 text-white" 
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Directory Listings */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <Coins className="w-6 h-6 animate-pulse mx-auto mb-2 text-emerald-500" />
                <span>Reading budget matrices...</span>
              </div>
            ) : filteredCosts.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2">Project</th>
                    <th className="py-2.5 px-2">Item Description</th>
                    <th className="py-2.5 px-2">Category</th>
                    <th className="py-2.5 px-2">Unit Cost</th>
                    <th className="py-2.5 px-2">Deployment Schedule</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredCosts.map(c => {
                    const totalQty = Object.values(c.yearly_quantities || {}).reduce((sum, q) => sum + q, 0);
                    const calculatedTotalCost = parseFloat(c.unit_cost) * totalQty;

                    return (
                      <tr key={c.id} className="hover:bg-slate-955/20 transition-colors">
                        <td className="py-3 px-2">
                          <span className="font-mono font-bold text-blue-400 bg-blue-950/40 border border-blue-900/60 px-2 py-0.5 rounded text-[10px]">
                            {c.project_key}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-bold text-slate-200">{c.item_description}</td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            c.cost_type === "CapEx"
                              ? "bg-blue-955/40 border border-blue-900 text-blue-300"
                              : c.cost_type === "MOOE"
                              ? "bg-purple-955/40 border border-purple-900 text-purple-300"
                              : "bg-amber-955/40 border border-amber-900 text-amber-300"
                          }`}>
                            {c.cost_type}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-mono text-slate-300">
                          ₱{parseFloat(c.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex gap-2 items-center text-[10px] text-slate-400 font-mono">
                            {Object.entries(c.yearly_quantities || {}).map(([yr, qty]) => (
                              <span key={yr} className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-850" title={`FY ${yr}`}>
                                {yr}: <strong className="text-slate-200">{qty}</strong>
                              </span>
                            ))}
                            <span className="font-bold text-emerald-400 border-l border-slate-800 pl-2">
                              ₱{calculatedTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                            title="Remove Allocation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No cost breakdown allocations mapped for cycle period '{activeCycle}'.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}