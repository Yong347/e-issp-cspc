// frontend/src/views/admin/Narrative/OrganizationalOutcomes.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getOutcomes, 
  createOutcome, 
  deleteOutcome 
} from "../../../api/admin";
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  GraduationCap, 
  BookOpen, 
  Search, 
  Save,
  HelpCircle,
  Layers,
  Tag,
  Info,
  Filter,
  X
} from "lucide-react";

export default function OrganizationalOutcomes() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Data States
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form State
  const [outcomeName, setOutcomeName] = useState("");
  const [typeLabel, setTypeLabel] = useState("Organizational Outcome");
  const [description, setDescription] = useState("");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("All");

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = user?.token || localStorage.getItem("access_token") || "";

  const fetchOutcomes = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOutcomes(token, activeCycle);
      setOutcomes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load organizational outcomes directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchOutcomes();
    }
  }, [token, activeCycle]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!outcomeName.trim()) {
      setError("Outcome name or program title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        outcome_name: outcomeName.trim(),
        type_label: typeLabel.trim() || "Organizational Outcome",
        description: description.trim() || null
      };

      await createOutcome(token, payload);

      setSuccess(`Program Outcome '${outcomeName}' registered successfully.`);
      setOutcomeName("");
      setDescription("");
      await fetchOutcomes();
    } catch (err) {
      setError(err.message || "Failed to create program outcome.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(
      `Confirm Deletion: Permanently remove '${name}'?\n\n` +
      `Note: If any strategic concerns (Part II.A) or department proposals (Part IV.A) ` +
      `are linked to this outcome, the system will block deletion to preserve DICT Singularity provenance.`
    )) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      await deleteOutcome(token, id);
      setSuccess(`Outcome category '${name}' purged successfully.`);
      await fetchOutcomes();
    } catch (err) {
      setError(err.message || "Failed to delete program outcome.");
    }
  };

  // Summary Metrics
  const totalCount = outcomes.length;
  const ooCount = outcomes.filter(o => (o.type_label || "").includes("Organizational Outcome")).length;
  const soCount = outcomes.filter(o => (o.type_label || "").includes("Strategic Objective")).length;
  const mfoCount = outcomes.filter(o => (o.type_label || "").includes("Major Final Output")).length;

  // Filtered Results Pipeline
  const filteredOutcomes = outcomes.filter(o => {
    const q = searchQuery.toLowerCase().trim();
    const name = (o.outcome_name || o.program_name || "").toLowerCase();
    const type = (o.type_label || "").toLowerCase();
    const desc = (o.description || "").toLowerCase();

    const matchesSearch = q === "" || name.includes(q) || type.includes(q) || desc.includes(q);
    const matchesFilter = selectedTypeFilter === "All" || o.type_label === selectedTypeFilter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Part I.A.4: Organizational Outcomes & Program Structure (Rule 6)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure institutional statutory program categories (OO for NGAs, SO for GOCCs, MFO for SUCs/LGUs). These categories anchor strategic concerns and department procurement proposals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded font-bold font-mono text-blue-700 dark:text-blue-400 uppercase tracking-wider">
            Cycle: FY {activeCycle || "2026-2028"}
          </span>
          <button
            onClick={fetchOutcomes}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh outcomes directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Outcomes</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalCount} Programs</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Organizational Outcomes (OO)</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{ooCount} OOs</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Strategic Objectives (SO)</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{soCount} SOs</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Major Final Outputs (MFO)</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{mfoCount} MFOs</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-lg flex items-center gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-lg flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creation Form Column */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 h-fit shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Configure Outcome Category</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Classification Type (DICT A.4)
            </label>
            <select
              value={typeLabel}
              onChange={e => setTypeLabel(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500"
            >
              <option value="Organizational Outcome">Organizational Outcome (OO - National Government Agencies)</option>
              <option value="Strategic Objective">Strategic Objective (SO - Government-Owned & Controlled Corporations)</option>
              <option value="Major Final Output">Major Final Output (MFO - State Universities & LGUs)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Outcome / Program Name
            </label>
            <input
              type="text"
              placeholder="e.g. Citizen Frontline Public Services Program"
              value={outcomeName}
              onChange={e => setOutcomeName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Strategic Description / Objectives
            </label>
            <textarea
              placeholder="Describe the program objectives, statutory service targets, and operational mandate..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white h-32 resize-none leading-relaxed outline-none focus:border-blue-500"
            />
          </div>

          {/* Harmonized Non-Glaring Slate Card (NO BLINDING WHITE BOX) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Relational Anchor:</strong> Department users will map hardware outlays, subscriptions, and needs assessments directly to this category (Rule 6).
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Preserving..." : "Save Program Outcome"}</span>
          </button>
        </form>

        {/* Directory Output Grid Column */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search outcomes or descriptions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedTypeFilter}
                onChange={e => setSelectedTypeFilter(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-700 dark:text-slate-300 outline-none text-[11px] cursor-pointer"
              >
                <option value="All">All Classifications</option>
                <option value="Organizational Outcome">Organizational Outcome (OO)</option>
                <option value="Strategic Objective">Strategic Objective (SO)</option>
                <option value="Major Final Output">Major Final Output (MFO)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <BookOpen className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading outcome configurations...</span>
              </div>
            ) : filteredOutcomes.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50 dark:bg-slate-955">
                    <th className="py-2.5 px-3 w-1/4">Classification</th>
                    <th className="py-2.5 px-3 w-1/3">Outcome Title</th>
                    <th className="py-2.5 px-3">Strategic Description</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredOutcomes.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-3 align-top">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                          (o.type_label || "").includes("Organizational Outcome")
                            ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 font-mono"
                            : (o.type_label || "").includes("Strategic Objective")
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-mono"
                        }`}>
                          {o.type_label || "Organizational Outcome"}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-200 align-top">
                        <div className="flex items-start gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500 shrink-0 mt-0.5" />
                          <span>{o.outcome_name || o.program_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm break-words align-top">
                        {o.description || <span className="text-slate-400 dark:text-slate-500 italic">No description provided.</span>}
                      </td>
                      <td className="py-3 px-3 text-right align-top">
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleDelete(o.id, o.outcome_name || o.program_name)}
                            className="p-1.5 bg-slate-50 dark:bg-slate-950 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded cursor-pointer transition-colors"
                            title="Delete Program Outcome"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
                No outcomes found matching your query.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
