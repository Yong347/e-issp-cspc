// frontend/src/views/admin/Narrative/PerformanceMetricsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  RefreshCw,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Target,
  User,
  Filter,
  FolderKanban,
  Layers,
  Info,
  BookOpen,
  Network,
  X
} from "lucide-react";

export default function PerformanceMetricsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Data States
  const [metrics, setMetrics] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State (DICT PMF Hierarchy & F.1/F.2 Aligned)
  const [form, setForm] = useState({
    project_id: "",
    project_title: "",
    result_hierarchy: "Immediate Outcome",
    indicator: "",
    baseline: "",
    target: "",
    collection_method: "",
    responsibility: ""
  });

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSection, setFilterSection] = useState("All"); // "All", "F.1", "F.2"
  const [filterHierarchy, setFilterHierarchy] = useState("All"); // "All", "Immediate Outcome", "Intermediate Outcome", "Output"
  const [filterProject, setFilterProject] = useState("All");

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  // Helper: Resolve whether a metric belongs to F.1 (Internal) or F.2 (Cross-Agency)
  const getProjectCategory = useCallback((metric) => {
    if (metric.project_id) {
      const matched = projects.find(p => String(p.id) === String(metric.project_id));
      if (matched) return matched.project_category || "Internal ICT Projects";
    }
    if (metric.project_title) {
      const matched = projects.find(
        p => (p.project_title || "").toLowerCase().trim() === metric.project_title.toLowerCase().trim()
      );
      if (matched) return matched.project_category || "Internal ICT Projects";
    }
    return "Internal ICT Projects";
  }, [projects]);

  const isCrossAgencyMetric = useCallback((metric) => {
    const cat = getProjectCategory(metric) || "";
    return cat.toLowerCase().includes("cross");
  }, [getProjectCategory]);

  // Load Metrics and Projects
  const loadAllData = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Existing PMF Metrics
      const data = await getPerformanceMetrics(token, activeCycle);
      setMetrics(Array.isArray(data) ? data : []);

      // 2. Fetch Strategic ICT Projects to populate Project Provenance dropdown
      const projRes = await fetch(`${apiUrl}/api/admin/ict-projects?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(Array.isArray(projData) ? projData : (projData?.data || []));
      }
    } catch (err) {
      setError(err.message || "Failed to load Performance Measurement Framework metrics.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCycle, apiUrl]);

  useEffect(() => {
    if (token && activeCycle) {
      loadAllData();
    }
  }, [token, activeCycle, loadAllData]);

  // Separate Projects into F.1 and F.2 for Dropdown
  const internalProjects = projects.filter(p => !((p.project_category || "").toLowerCase().includes("cross")));
  const crossAgencyProjects = projects.filter(p => (p.project_category || "").toLowerCase().includes("cross"));

  // Handle Project Selection in Dropdown
  const handleProjectSelect = (e) => {
    const selectedVal = e.target.value;
    if (!selectedVal || selectedVal === "custom") {
      setForm(prev => ({
        ...prev,
        project_id: "",
        project_title: selectedVal === "custom" ? "" : prev.project_title
      }));
    } else {
      const selectedProj = projects.find(p => String(p.id) === String(selectedVal));
      if (selectedProj) {
        setForm(prev => ({
          ...prev,
          project_id: selectedProj.id,
          project_title: selectedProj.project_title
        }));
      }
    }
  };

  const validateForm = () => {
    if (!form.project_title.trim()) return "Associated Project Title is required.";
    if (!form.indicator.trim()) return "Verifiable Key Performance Indicator (KPI) is required.";
    if (!form.baseline.trim()) return "Baseline benchmarking data is required.";
    if (!form.target.trim()) return "Target outcome metric is required.";
    if (!form.collection_method.trim()) return "Data collection method is required.";
    if (!form.responsibility.trim()) return "Responsible office or division unit is required.";
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
        project_id: form.project_id || null,
        project_title: form.project_title.trim(),
        result_hierarchy: form.result_hierarchy,
        indicator: form.indicator.trim(),
        baseline: form.baseline.trim(),
        target: form.target.trim(),
        collection_method: form.collection_method.trim(),
        responsibility: form.responsibility.trim()
      };

      await createPerformanceMetric(token, activeCycle, payload);
      setSuccess(`Performance indicator for '${form.project_title}' registered successfully.`);

      // Reset specific fields while retaining project selection for bulk KPI logging
      setForm(prev => ({
        ...prev,
        indicator: "",
        baseline: "",
        target: "",
        collection_method: "",
        responsibility: ""
      }));

      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to save framework metric.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Permanently remove this PMF metric for '${title}'?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deletePerformanceMetric(token, id);
      setSuccess("Framework metric removed successfully.");
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to delete framework metric.");
    }
  };

  // Summary Metrics Breakdown (Including F.1 vs F.2)
  const totalMetricsCount = metrics.length;
  const f1Count = metrics.filter(m => !isCrossAgencyMetric(m)).length;
  const f2Count = metrics.filter(m => isCrossAgencyMetric(m)).length;
  const outputsCount = metrics.filter(m => (m.result_hierarchy || "").toLowerCase().includes("output")).length;
  const immediateCount = metrics.filter(m => (m.result_hierarchy || "").toLowerCase().includes("immediate")).length;
  const intermediateCount = metrics.filter(m => (m.result_hierarchy || "").toLowerCase().includes("intermediate")).length;

  // Filtered Results Pipeline
  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      // 1. Text Search Filter
      const q = searchQuery.toLowerCase().trim();
      const title = (m.project_title || "").toLowerCase();
      const ind = (m.indicator || m.kpi_indicator || "").toLowerCase();
      const resp = (m.responsibility || m.responsible_unit || "").toLowerCase();
      const targetVal = (m.target || m.target_metric || "").toLowerCase();

      const matchesSearch = q === "" || 
        title.includes(q) || 
        ind.includes(q) || 
        resp.includes(q) || 
        targetVal.includes(q);

      // 2. F.1 vs F.2 Section Filter
      const isCross = isCrossAgencyMetric(m);
      let matchesSection = true;
      if (filterSection === "F.1") matchesSection = !isCross;
      if (filterSection === "F.2") matchesSection = isCross;

      // 3. Hierarchy Filter
      const hier = (m.result_hierarchy || "").toLowerCase();
      let matchesHierarchy = true;
      if (filterHierarchy !== "All") {
        matchesHierarchy = hier.includes(filterHierarchy.toLowerCase().replace(" outcome", ""));
      }

      // 4. Project Filter
      const matchesProj = filterProject === "All" || m.project_title === filterProject;

      return matchesSearch && matchesSection && matchesHierarchy && matchesProj;
    });
  }, [metrics, searchQuery, filterSection, filterHierarchy, filterProject, isCrossAgencyMetric]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Part III.F: Performance Measurement Framework (PMF Scorecard)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Formulate measurable Key Performance Indicators (KPIs) grouped under <strong>F.1 Internal ICT Projects</strong> and <strong>F.2 Cross-Agency ICT Projects</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 rounded-full font-bold font-mono uppercase tracking-wider">
            Cycle: FY {activeCycle || "2026-2028"}
          </span>
          <button
            onClick={loadAllData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh PMF registry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Institutional Macro KPI Metrics Cards (Distinguishing F.1 vs F.2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total KPIs</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalMetricsCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">F.1 Internal KPIs</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{f1Count}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-teal-50 dark:bg-slate-800 text-teal-600 dark:text-teal-400 rounded-xl shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">F.2 Cross-Agency</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{f2Count}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outputs</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{outputsCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outcomes</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{immediateCount + intermediateCount}</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Registration Form Column */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Register Framework Indicator</span>
          </h3>

          {/* Project Selection Dropdown with F.1 vs F.2 Optgroups */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <FolderKanban className="w-3.5 h-3.5 text-blue-500" />
              <span>Target ICT Project (F.1 / F.2 Link)</span>
            </label>
            {projects.length > 0 ? (
              <select
                value={form.project_id || (form.project_title ? "custom" : "")}
                onChange={handleProjectSelect}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer focus:border-blue-500 text-xs font-medium"
              >
                <option value="">-- Choose Registered Project --</option>
                
                {internalProjects.length > 0 && (
                  <optgroup label="F.1. Internal ICT Projects" className="bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 font-bold">
                    {internalProjects.map(p => (
                      <option key={p.id} value={p.id} className="text-slate-800 dark:text-slate-200 font-normal">
                        [F.1] {p.project_title}
                      </option>
                    ))}
                  </optgroup>
                )}

                {crossAgencyProjects.length > 0 && (
                  <optgroup label="F.2. Cross-Agency ICT Projects" className="bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 font-bold">
                    {crossAgencyProjects.map(p => (
                      <option key={p.id} value={p.id} className="text-slate-800 dark:text-slate-200 font-normal">
                        [F.2] {p.project_title}
                      </option>
                    ))}
                  </optgroup>
                )}

                <option value="custom">-- Custom / Unregistered Project Title --</option>
              </select>
            ) : null}

            {/* Custom Project Title Input */}
            {(!form.project_id || projects.length === 0) && (
              <input
                type="text"
                required
                placeholder="Enter Project Title (e.g. Enterprise Portal Modernization & Cloud Migration)"
                value={form.project_title}
                onChange={e => setForm({ ...form, project_title: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs mt-1"
              />
            )}
          </div>

          {/* Result Hierarchy */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              PMF Result Hierarchy (DICT Pages 26–27)
            </label>
            <select
              value={form.result_hierarchy}
              onChange={e => setForm({ ...form, result_hierarchy: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 text-xs font-medium"
            >
              <option value="Immediate Outcome">Immediate Outcome (Institutional Capability Enhancement)</option>
              <option value="Intermediate Outcome">Intermediate Outcome (Stakeholder Behavior Change)</option>
              <option value="Output">Output (Direct Technical Deliverable)</option>
            </select>
          </div>

          {/* Verifiable Indicator */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Key Performance Indicator (KPI / OVI)
            </label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Percentage of citizen frontline transactions adopting digital online processing modules..."
              value={form.indicator}
              onChange={e => setForm({ ...form, indicator: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs resize-none leading-relaxed"
            />
          </div>

          {/* Baseline vs Target */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Baseline Data</label>
              <input
                type="text"
                required
                placeholder="e.g. 35% adoption"
                value={form.baseline}
                onChange={e => setForm({ ...form, baseline: e.target.value })}
                className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Target Metric</label>
              <input
                type="text"
                required
                placeholder="e.g. 100% adoption"
                value={form.target}
                onChange={e => setForm({ ...form, target: e.target.value })}
                className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Data Collection Method */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Data Collection Method / Source
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Automated system audit logs / APM analytics repository"
              value={form.collection_method}
              onChange={e => setForm({ ...form, collection_method: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
            />
          </div>

          {/* Responsible Unit */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Responsibility to Collect Data (Office / Division Unit)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. ICT Management Division / Operations and Planning Service"
              value={form.responsibility}
              onChange={e => setForm({ ...form, responsibility: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
            />
          </div>

          {/* Clean Inset Info Box */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>TOC Delineation:</strong> Metrics will automatically render under standalone chapters <strong>F.1 (Internal ICT Projects)</strong> or <strong>F.2 (Cross-Agency ICT Projects)</strong> in the compiled PDF.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Preserving..." : "Commit PMF Indicator"}</span>
          </button>
        </form>

        {/* Directory Output Column */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          
          {/* Controls Bar with F.1 vs F.2 Section Toggle */}
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            
            {/* Top Row: F.1 / F.2 Chapter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
                <button
                  type="button"
                  onClick={() => setFilterSection("All")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    filterSection === "All" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  All Sections ({metrics.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSection("F.1")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterSection === "F.1" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>F.1 Internal ICT Projects ({f1Count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSection("F.2")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterSection === "F.2" ? "bg-teal-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>F.2 Cross-Agency Projects ({f2Count})</span>
                </button>
              </div>

              {/* Hierarchy Filter Toggle */}
              <div className="flex bg-slate-100 dark:bg-slate-955 rounded-xl p-1 border border-slate-200 dark:border-slate-800 gap-1">
                {["All", "Immediate Outcome", "Intermediate Outcome", "Output"].map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setFilterHierarchy(h)}
                    className={`px-2 py-1 text-[9px] font-bold rounded-lg transition-all cursor-pointer ${
                      filterHierarchy === h 
                        ? "bg-blue-600 text-white shadow-xs" 
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    {h === "All" ? "All" : h.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Row: Text Search & Project Selector */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-1">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search indicator, project, or unit..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
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

              {projects.length > 0 && (
                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={filterProject}
                    onChange={e => setFilterProject(e.target.value)}
                    className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 outline-none text-[11px] cursor-pointer max-w-[220px] truncate font-semibold"
                  >
                    <option value="All">All Projects</option>
                    {internalProjects.length > 0 && (
                      <optgroup label="F.1 Internal Projects">
                        {internalProjects.map(p => (
                          <option key={p.id} value={p.project_title}>{p.project_title}</option>
                        ))}
                      </optgroup>
                    )}
                    {crossAgencyProjects.length > 0 && (
                      <optgroup label="F.2 Cross-Agency Projects">
                        {crossAgencyProjects.map(p => (
                          <option key={p.id} value={p.project_title}>{p.project_title}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}
            </div>

          </div>

          {/* Listing Cards with F.1 / F.2 Badging */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-20 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Synchronizing PMF indicator matrix...</span>
              </div>
            ) : filteredMetrics.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredMetrics.map(m => {
                  const isCross = isCrossAgencyMetric(m);
                  const hierLower = (m.result_hierarchy || "").toLowerCase();
                  
                  const badgeStyle = hierLower.includes("output")
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                    : hierLower.includes("intermediate")
                    ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";

                  return (
                    <div 
                      key={m.id}
                      className="p-4 rounded-2xl border bg-white dark:bg-slate-955 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3 shadow-xs"
                    >
                      {/* Header Row */}
                      <div className="flex justify-between items-start gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Distinct F.1 vs F.2 Chapter Tag */}
                            <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wider border font-mono flex items-center gap-1 ${
                              isCross 
                                ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20" 
                                : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                            }`}>
                              {isCross ? <Network className="w-3 h-3" /> : <FolderKanban className="w-3 h-3" />}
                              <span>{isCross ? "F.2 Cross-Agency" : "F.1 Internal"}</span>
                            </span>

                            {/* Result Hierarchy Badge */}
                            <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wider border font-mono ${badgeStyle}`}>
                              {m.result_hierarchy}
                            </span>

                            {/* Project Title */}
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1">
                              <span>{m.project_title}</span>
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(m.id, m.project_title)}
                          className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 text-slate-400 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Purge Metric Indicator"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Indicator Description */}
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block">
                          Key Performance Indicator (KPI / OVI)
                        </span>
                        <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-sans text-xs">
                          {m.indicator || m.kpi_indicator}
                        </p>
                      </div>

                      {/* Target, Baseline, and Audit Specs Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[10.5px] font-mono">
                        <div>
                          <span className="text-[8px] uppercase font-bold text-slate-400 block">Baseline Data</span>
                          <span className="text-slate-700 dark:text-slate-300 font-semibold">{m.baseline || m.baseline_data}</span>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold text-emerald-600 dark:text-emerald-500 block">Target Metric</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{m.target || m.target_metric}</span>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold text-slate-400 block">Collection Source</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate block" title={m.collection_method || m.data_collection_method}>
                            {m.collection_method || m.data_collection_method}
                          </span>
                        </div>
                      </div>

                      {/* Responsibility Unit Footer */}
                      <div className="flex items-center justify-between text-[9.5px] text-slate-500 font-sans pt-1 border-t border-slate-100 dark:border-slate-850">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Responsible Unit: <strong className="text-slate-700 dark:text-slate-300">{m.responsibility || m.responsible_unit}</strong></span>
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">ID: {m.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400 italic">
                No performance indicators found matching your active filter criteria.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}