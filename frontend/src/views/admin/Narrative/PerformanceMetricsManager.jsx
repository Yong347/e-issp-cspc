// frontend/src/views/admin/Narrative/PerformanceMetricsManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getPerformanceMetrics,
  createPerformanceMetric,
  deletePerformanceMetric
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Search,
  X,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Target,
  Database,
  User,
  GitBranch,
  Filter
} from "lucide-react";

export default function PerformanceMetricsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    project_title: "",
    result_hierarchy: "Immediate outcome",
    indicator: "",
    baseline: "",
    target: "",
    collection_method: "",
    responsibility: ""
  });

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterHierarchy, setFilterHierarchy] = useState("All");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchMetricsList = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPerformanceMetrics(user.token, activeCycle);
      setMetrics(data);
    } catch (err) {
      setError(err.message || "Failed to load Performance Measurement Framework metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchMetricsList();
    }
  }, [user, activeCycle]);

  const validateForm = () => {
    if (!form.project_title.trim()) return "Associated Project Title is required.";
    if (!form.indicator.trim()) return "Verifiable Indicator description is required.";
    if (!form.baseline.trim()) return "Baseline benchmarking data is required.";
    if (!form.target.trim()) return "Target outcome description is required.";
    if (!form.collection_method.trim()) return "Data collection method is required.";
    if (!form.responsibility.trim()) return "Responsible SUC office/unit is required.";
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
        project_title: form.project_title.trim(),
        result_hierarchy: form.result_hierarchy,
        indicator: form.indicator.trim(),
        baseline: form.baseline.trim(),
        target: form.target.trim(),
        collection_method: form.collection_method.trim(),
        responsibility: form.responsibility.trim()
      };

      await createPerformanceMetric(user.token, activeCycle, payload);
      setSuccess("Performance indicator documented successfully.");

      // Reset form (except project_title to assist in multi-metric registering)
      setForm(prev => ({
        ...prev,
        indicator: "",
        baseline: "",
        target: "",
        collection_method: "",
        responsibility: ""
      }));
      fetchMetricsList();
    } catch (err) {
      setError(err.message || "Failed to save framework metric.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this performance metric from the framework?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deletePerformanceMetric(user.token, id);
      setSuccess("Framework metric removed successfully.");
      fetchMetricsList();
    } catch (err) {
      setError(err.message || "Failed to delete framework metric.");
    }
  };

  const filteredMetrics = metrics.filter(m => {
    const matchesSearch = 
      m.project_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.indicator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.responsibility.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesHierarchy = filterHierarchy === "All" || m.result_hierarchy === filterHierarchy;

    return matchesSearch && matchesHierarchy;
  });

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Header Banner */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            <span>Part III.C: Performance Measurement Framework (PMF)</span>
          </h2>
          <p className="text-slate-400 mt-1">Configure and manage performance indicators, outcome targets, data audits, and responsible units for all standard projects.</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 bg-indigo-950/40 border border-indigo-900 rounded font-bold font-mono text-indigo-400 uppercase tracking-wider">
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
        {/* Metric Form Registration */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Plus className="w-4 h-4 text-indigo-500" />
            <span>Register Framework Metric</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Associated Project Title</label>
            <input
              type="text"
              placeholder="e.g. Deployment of Moodle LMS"
              value={form.project_title}
              onChange={e => setForm({ ...form, project_title: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-semibold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">PMF Result Hierarchy</label>
            <select
              value={form.result_hierarchy}
              onChange={e => setForm({ ...form, result_hierarchy: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
            >
              <option value="Immediate outcome">Immediate outcome</option>
              <option value="Intermediate outcome">Intermediate outcome</option>
              <option value="Outputs">Outputs</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Verifiable Indicator (OVI)</label>
            <input
              type="text"
              placeholder="e.g. Percentage of courses active inside LMS"
              value={form.indicator}
              onChange={e => setForm({ ...form, indicator: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Baseline Data</label>
              <input
                type="text"
                placeholder="e.g. 10% adoption"
                value={form.baseline}
                onChange={e => setForm({ ...form, baseline: e.target.value })}
                className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Target Outcome</label>
              <input
                type="text"
                placeholder="e.g. 100% adoption"
                value={form.target}
                onChange={e => setForm({ ...form, target: e.target.value })}
                className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono font-bold text-emerald-400"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Collection Method / Data Source</label>
            <input
              type="text"
              placeholder="e.g. LMS system logs audits"
              value={form.collection_method}
              onChange={e => setForm({ ...form, collection_method: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">SUC Responsibility Unit</label>
            <input
              type="text"
              placeholder="e.g. MICT Office / Deans"
              value={form.responsibility}
              onChange={e => setForm({ ...form, responsibility: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? "Preserving..." : "Save PMF Metric"}</span>
          </button>
        </form>

        {/* Framework Grid Display */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row gap-3 justify-between items-center border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search projects or indicators..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Hierarchy:</span>
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-850">
                {["All", "Immediate outcome", "Intermediate outcome", "Outputs"].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setFilterHierarchy(h)}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                      filterHierarchy === h 
                        ? "bg-indigo-600 text-white" 
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {h === "All" ? "All" : h.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table display */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <TrendingUp className="w-6 h-6 animate-pulse mx-auto mb-2 text-indigo-500" />
                <span>Reading PMF framework listings...</span>
              </div>
            ) : filteredMetrics.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-[22%]">Project Title</th>
                    <th className="py-2.5 px-2 w-[15%]">Hierarchy</th>
                    <th className="py-2.5 px-2 w-[25%]">Indicator (OVI)</th>
                    <th className="py-2.5 px-2 w-[25%]">Target vs Baseline</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredMetrics.map(m => (
                    <tr key={m.id} className="hover:bg-slate-955/20 transition-colors text-[11px]">
                      <td className="py-3 px-2 font-bold text-slate-200">{m.project_title}</td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase ${
                          m.result_hierarchy === "Outputs"
                            ? "bg-blue-950/40 border border-blue-850 text-blue-300"
                            : m.result_hierarchy === "Intermediate outcome"
                            ? "bg-purple-950/40 border border-purple-850 text-purple-300"
                            : "bg-indigo-950/40 border border-indigo-850 text-indigo-300"
                        }`}>
                          {m.result_hierarchy.replace(" outcome", "")}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-300 leading-relaxed break-words">{m.indicator}</td>
                      <td className="py-3 px-2 space-y-1.5 font-mono">
                        <div className="flex items-center gap-1 text-emerald-400 font-bold text-xs">
                          <Target className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Tgt: {m.target}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                          <Database className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          <span>Base: {m.baseline}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                          <User className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          <span className="font-sans">Resp: {m.responsibility}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                          title="Purge Metric"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No matching performance target metrics logged for cycle period '{activeCycle}'.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}