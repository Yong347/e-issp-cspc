// frontend/src/views/admin/Narrative/PerformanceMetricsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getPerformanceMetrics,
  createPerformanceMetric,
  updatePerformanceMetric,
  deletePerformanceMetric,
  getIctProjects
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import {
  Save,
  Plus,
  Trash2,
  Edit3,
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
  X,
  Calendar,
  Building,
  ShieldAlert,
  Link,
  Check
} from "lucide-react";

export default function PerformanceMetricsManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();

  // Data States
  const [metrics, setMetrics] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit Mode State
  const [editingId, setEditingId] = useState(null);

  // Form State (DICT PMF Hierarchy & F.1/F.2/F.3 Multi-Year Aligned)
  const initialFormState = {
    project_id: "",
    project_title: "",
    result_hierarchy: "Immediate Outcome",
    indicator: "",
    baseline: "",
    target: "",
    annual_targets: {},
    collection_method: "",
    responsibility: "ICT Management Office"
  };
  const [form, setForm] = useState(initialFormState);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSection, setFilterSection] = useState("All"); // "All", "F.1", "F.2", "F.3"
  const [filterHierarchy, setFilterHierarchy] = useState("All"); // "All", "Immediate Outcome", "Intermediate Outcome", "Output"
  const [filterProject, setFilterProject] = useState("All");

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  // Dynamic Planning Horizon Sequence (Extracts cycle range dynamically; zero hardcoding)
  const activeYears = useMemo(() => {
    if (planningYears && planningYears.length > 0) return planningYears;
    if (activeCycle && activeCycle.includes("-")) {
      const parts = activeCycle.split("-");
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        const span = [];
        for (let y = start; y <= end; y++) span.push(y);
        return span;
      }
    }
    return [2026, 2027, 2028];
  }, [planningYears, activeCycle]);

  // Synchronize annual target keys with active planning years
  useEffect(() => {
    setForm(prev => {
      const updatedTargets = { ...(prev.annual_targets || {}) };
      activeYears.forEach(year => {
        if (updatedTargets[String(year)] === undefined) {
          updatedTargets[String(year)] = "";
        }
      });
      return { ...prev, annual_targets: updatedTargets };
    });
  }, [activeYears]);

  // Helper: Classify whether a metric belongs to F.1 (Internal), F.2 (Cross-Agency), or F.3 (Institutional Governance)
  const getMetricChapter = useCallback((metric) => {
    if (metric.project_id) {
      const matched = projects.find(p => String(p.id) === String(metric.project_id));
      if (matched) {
        const cat = (matched.project_category || "").toLowerCase();
        return cat.includes("cross") ? "F.2" : "F.1";
      }
    }
    if (metric.project_title) {
      const matched = projects.find(
        p => (p.project_title || "").toLowerCase().trim() === metric.project_title.toLowerCase().trim()
      );
      if (matched) {
        const cat = (matched.project_category || "").toLowerCase();
        return cat.includes("cross") ? "F.2" : "F.1";
      }
    }
    return "F.3"; // Standalone / Institutional ICT Governance KPI
  }, [projects]);

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
      let projList = [];
      try {
        const projData = await getIctProjects(token, activeCycle);
        projList = Array.isArray(projData) ? projData : (projData?.data || []);
      } catch {
        const projRes = await fetch(`${apiUrl}/api/admin/ict-projects?issp_period=${encodeURIComponent(activeCycle)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (projRes.ok) {
          const raw = await projRes.json();
          projList = Array.isArray(raw) ? raw : (raw?.data || []);
        }
      }
      setProjects(projList);
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

  // 1-Click Action to Pre-Fill KPI for a specific project
  const handleAddKpiForProject = useCallback((proj) => {
    setError(null);
    setSuccess(null);
    setEditingId(null);

    const initialTargets = {};
    activeYears.forEach(year => {
      initialTargets[String(year)] = "";
    });

    setForm({
      project_id: proj.id,
      project_title: proj.project_title,
      result_hierarchy: "Immediate Outcome",
      indicator: `100% Operational readiness and deployment of ${proj.project_title}`,
      baseline: "0%",
      target: "100%",
      annual_targets: initialTargets,
      collection_method: "System APM Performance Logs & UAT Audit Reports",
      responsibility: proj.implementing_unit || "ICT Management Office"
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeYears]);

  // Listen to navigation state from InternalProjectsManager or CrossProjectsManager
  useEffect(() => {
    if (location.state?.prefillProject) {
      handleAddKpiForProject(location.state.prefillProject);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, handleAddKpiForProject]);

  // Separate Projects into F.1 and F.2 for Dropdown
  const internalProjects = useMemo(() => {
    return projects.filter(p => !((p.project_category || "").toLowerCase().includes("cross")));
  }, [projects]);

  const crossAgencyProjects = useMemo(() => {
    return projects.filter(p => (p.project_category || "").toLowerCase().includes("cross"));
  }, [projects]);

  // Compiler Integrity Check: Identify registered projects that currently lack PMF KPIs
  const projectsMissingKpis = useMemo(() => {
    return projects.filter(p => {
      const pIdStr = String(p.id);
      const pTitle = (p.project_title || "").toLowerCase().trim();
      const hasMetric = metrics.some(m => 
        (m.project_id && String(m.project_id) === pIdStr) || 
        (m.project_title && m.project_title.toLowerCase().trim() === pTitle)
      );
      return !hasMetric;
    });
  }, [projects, metrics]);

  // Handle Project Selection in Dropdown
  const handleProjectSelect = (e) => {
    const selectedVal = e.target.value;
    if (!selectedVal || selectedVal === "custom") {
      setForm(prev => ({
        ...prev,
        project_id: "",
        project_title: selectedVal === "custom" ? "Institutional ICT Governance" : prev.project_title,
        responsibility: prev.responsibility || "ICT Management Office"
      }));
    } else {
      const selectedProj = projects.find(p => String(p.id) === String(selectedVal));
      if (selectedProj) {
        setForm(prev => ({
          ...prev,
          project_id: selectedProj.id,
          project_title: selectedProj.project_title,
          responsibility: selectedProj.implementing_unit || prev.responsibility || "ICT Management Office"
        }));
      }
    }
  };

  const handleAnnualTargetChange = (year, value) => {
    setForm(prev => ({
      ...prev,
      annual_targets: {
        ...(prev.annual_targets || {}),
        [String(year)]: value
      }
    }));
  };

  const handleTargetChange = (val) => {
    setForm(prev => {
      const updatedAnnual = { ...(prev.annual_targets || {}) };
      const finalYear = activeYears[activeYears.length - 1];
      if (finalYear && (!updatedAnnual[String(finalYear)] || updatedAnnual[String(finalYear)] === prev.target)) {
        updatedAnnual[String(finalYear)] = val;
      }
      return {
        ...prev,
        target: val,
        annual_targets: updatedAnnual
      };
    });
  };

  const handleStartEdit = (metric) => {
    setError(null);
    setSuccess(null);
    setEditingId(metric.id);

    let parsedAnnual = metric.annual_targets;
    if (typeof parsedAnnual === "string") {
      try {
        parsedAnnual = JSON.parse(parsedAnnual);
      } catch {
        parsedAnnual = {};
      }
    }
    parsedAnnual = (parsedAnnual && typeof parsedAnnual === "object") ? { ...parsedAnnual } : {};
    
    // Ensure all active planning years are present
    activeYears.forEach(year => {
      if (parsedAnnual[String(year)] === undefined) {
        parsedAnnual[String(year)] = "";
      }
    });

    setForm({
      project_id: metric.project_id || "",
      project_title: metric.project_title || "",
      result_hierarchy: metric.result_hierarchy || "Immediate Outcome",
      indicator: metric.indicator || "",
      baseline: metric.baseline || "",
      target: metric.target || "",
      annual_targets: parsedAnnual,
      collection_method: metric.collection_method || "",
      responsibility: metric.responsibility || "ICT Management Office"
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(initialFormState);
    setError(null);
  };

  const validateForm = () => {
    if (!form.project_title.trim()) return "Associated Project Title is required.";
    if (!form.indicator.trim()) return "Verifiable Key Performance Indicator (KPI) is required.";
    if (!form.baseline.trim()) return "Baseline benchmarking data is required.";
    if (!form.target.trim()) return "Overall target outcome metric is required.";
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
      // Build clean annual targets map spanning all active years with both year and ordinal keys
      const cleanAnnualTargets = {};
      activeYears.forEach((y, idx) => {
        const val = form.annual_targets?.[String(y)] || form.annual_targets?.[`Year ${idx + 1}`] || (idx === activeYears.length - 1 ? form.target : "");
        cleanAnnualTargets[String(y)] = val;
        cleanAnnualTargets[`Year ${idx + 1}`] = val;
      });

      const payload = {
        project_id: form.project_id || null,
        project_title: form.project_title.trim(),
        result_hierarchy: form.result_hierarchy,
        indicator: form.indicator.trim(),
        baseline: form.baseline.trim(),
        target: form.target.trim(),
        annual_targets: cleanAnnualTargets,
        collection_method: form.collection_method.trim(),
        responsibility: form.responsibility.trim()
      };

      if (editingId) {
        await updatePerformanceMetric(token, editingId, payload);
        setSuccess(`Performance indicator for '${form.project_title}' updated successfully.`);
      } else {
        await createPerformanceMetric(token, activeCycle, payload);
        setSuccess(`Performance indicator for '${form.project_title}' registered successfully.`);
      }

      handleCancelEdit();
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
      if (editingId === id) handleCancelEdit();
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to delete framework metric.");
    }
  };

  // Summary Metrics Breakdown (Including F.1, F.2, and F.3)
  const totalMetricsCount = metrics.length;
  const f1Count = metrics.filter(m => getMetricChapter(m) === "F.1").length;
  const f2Count = metrics.filter(m => getMetricChapter(m) === "F.2").length;
  const f3Count = metrics.filter(m => getMetricChapter(m) === "F.3").length;
  const outputsCount = metrics.filter(m => (m.result_hierarchy || "").toLowerCase().includes("output")).length;
  const immediateCount = metrics.filter(m => (m.result_hierarchy || "").toLowerCase().includes("immediate")).length;
  const intermediateCount = metrics.filter(m => (m.result_hierarchy || "").toLowerCase().includes("intermediate")).length;

  // Filtered Results Pipeline
  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      // 1. Text Search Filter
      const q = searchQuery.toLowerCase().trim();
      const title = (m.project_title || "").toLowerCase();
      const ind = (m.indicator || "").toLowerCase();
      const resp = (m.responsibility || "").toLowerCase();
      const targetVal = (m.target || "").toLowerCase();

      const matchesSearch = q === "" || 
        title.includes(q) || 
        ind.includes(q) || 
        resp.includes(q) || 
        targetVal.includes(q);

      // 2. F.1 / F.2 / F.3 Section Filter
      const chapter = getMetricChapter(m);
      let matchesSection = true;
      if (filterSection === "F.1") matchesSection = (chapter === "F.1");
      if (filterSection === "F.2") matchesSection = (chapter === "F.2");
      if (filterSection === "F.3") matchesSection = (chapter === "F.3");

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
  }, [metrics, searchQuery, filterSection, filterHierarchy, filterProject, getMetricChapter]);

  // Group filtered metrics strictly into F.1, F.2, and F.3 clusters
  const f1GroupedByProject = useMemo(() => {
    const groups = {};
    filteredMetrics.filter(m => getMetricChapter(m) === "F.1").forEach(m => {
      const key = m.project_title || "Internal ICT Project";
      if (!groups[key]) {
        const projObj = projects.find(p => String(p.id) === String(m.project_id) || (p.project_title || "").toLowerCase() === key.toLowerCase());
        groups[key] = {
          title: key,
          project: projObj,
          chapter: "F.1",
          items: []
        };
      }
      groups[key].items.push(m);
    });
    return Object.values(groups);
  }, [filteredMetrics, projects, getMetricChapter]);

  const f2GroupedByProject = useMemo(() => {
    const groups = {};
    filteredMetrics.filter(m => getMetricChapter(m) === "F.2").forEach(m => {
      const key = m.project_title || "Cross-Agency Collaborative Initiative";
      if (!groups[key]) {
        const projObj = projects.find(p => String(p.id) === String(m.project_id) || (p.project_title || "").toLowerCase() === key.toLowerCase());
        groups[key] = {
          title: key,
          project: projObj,
          chapter: "F.2",
          items: []
        };
      }
      groups[key].items.push(m);
    });
    return Object.values(groups);
  }, [filteredMetrics, projects, getMetricChapter]);

  const f3StandaloneMetrics = useMemo(() => {
    return filteredMetrics.filter(m => getMetricChapter(m) === "F.3");
  }, [filteredMetrics, getMetricChapter]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Part III.F: Performance Measurement Framework (PMF Scorecards)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Formulate and monitor measurable Key Performance Indicators (KPIs) strictly grouped under <strong>F.1 Internal ICT Projects</strong>, <strong>F.2 Cross-Agency ICT Projects</strong>, and <strong>F.3 Institutional Governance</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 rounded-full font-bold font-mono uppercase tracking-wider">
            Cycle: FY {activeCycle || "2026-2028"}
          </span>

          {/* Centralized Compiler Verification Button */}
          <CompilerSyncButton
            moduleName="metrics"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={loadAllData}
            label="Save &amp; Verify Compiler Pipeline"
          />

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

      {/* Proactive Compiler Readiness Guard: Missing KPIs Banner */}
      {projectsMissingKpis.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/30 border border-amber-300 dark:border-amber-900/60 rounded-2xl space-y-2 animate-fadeIn shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Compilation Prerequisites Notice: {projectsMissingKpis.length} ICT Project(s) Lack PMF Scorecard KPIs</span>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 font-mono font-bold uppercase">
              Compiler Blocker
            </span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            The DICT ISSP Singularity Engine strictly enforces that every project registered in Part III.E must have at least one measurable KPI in the PMF Scorecard. Click any project below to pre-fill and register a KPI:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {projectsMissingKpis.map(proj => (
              <button
                key={proj.id}
                type="button"
                onClick={() => handleAddKpiForProject(proj)}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 hover:border-blue-500 rounded-lg text-slate-800 dark:text-slate-200 text-[10px] font-mono flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02] transition-all"
                title={`Click to add a KPI for ${proj.project_title}`}
              >
                <Plus className="w-3 h-3 text-amber-600" />
                <span className="font-bold">{proj.project_title}</span>
                <span className="text-[9px] text-slate-400 font-sans">({proj.project_category?.includes("Cross") ? "F.2" : "F.1"})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Institutional Macro KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Indicators</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalMetricsCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">F.1 Internal KPIs</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{f1Count}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-teal-50 dark:bg-slate-800 text-teal-600 dark:text-teal-400 rounded-xl shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">F.2 Cross-Agency</span>
            <h3 className="text-base font-bold text-teal-600 dark:text-teal-400 font-mono mt-0.5">{f2Count}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outputs</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{outputsCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Target Outcomes</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{immediateCount + intermediateCount}</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Registration & Editing Form Column */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              {editingId ? (
                <>
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  <span>Update Framework Indicator</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Register Framework Indicator</span>
                </>
              )}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          {editingId && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 rounded-xl flex items-center justify-between text-[11px] font-mono">
              <span>Editing Indicator ID: #{String(editingId).slice(0, 8)}...</span>
              <button type="button" onClick={handleCancelEdit} className="font-bold underline text-[10px] cursor-pointer">
                Discard
              </button>
            </div>
          )}

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

                <option value="custom">-- Standalone / Institutional ICT Governance KPI (F.3) --</option>
              </select>
            ) : null}

            {/* Custom Project Title Input */}
            {(!form.project_id || projects.length === 0) && (
              <input
                type="text"
                required
                placeholder="Enter Initiative Title (e.g. Institutional ICT Governance)"
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
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Overall Target Metric</label>
              <input
                type="text"
                required
                placeholder="e.g. 100% adoption"
                value={form.target}
                onChange={e => handleTargetChange(e.target.value)}
                className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Annual Target Milestones Grid across Planning Horizon */}
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-[9.5px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5" />
                <span>Annual Targets ({activeYears.length} Years Horizon)</span>
              </span>
              <span className="text-[9px] text-slate-400 font-mono">Milestone Targets</span>
            </div>
            <div 
              className="grid gap-2"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(activeYears.length, 3)}, minmax(0, 1fr))`
              }}
            >
              {activeYears.map((yr, idx) => (
                <div key={yr} className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 block font-mono">
                    Year {idx + 1} ({yr}):
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. ${idx === 0 ? "50%" : idx === 1 ? "80%" : "100%"}`}
                    value={form.annual_targets?.[String(yr)] || ""}
                    onChange={e => handleAnnualTargetChange(yr, e.target.value)}
                    className="w-full p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-[11px] outline-none focus:border-blue-500 text-center"
                  />
                </div>
              ))}
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
              placeholder="e.g. ICT Management Office / Planning Division"
              value={form.responsibility}
              onChange={e => setForm({ ...form, responsibility: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
            />
          </div>

          {/* Info callout */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>TOC Delineation:</strong> Metrics automatically render under chapters <strong>F.1 (Internal ICT Projects)</strong>, <strong>F.2 (Cross-Agency ICT Projects)</strong>, or <strong>F.3 (Institutional Governance)</strong> in the compiled PDF.
            </span>
          </div>

          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`py-2.5 ${editingId ? "w-2/3 bg-amber-600 hover:bg-amber-500" : "w-full bg-blue-600 hover:bg-blue-500"} disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm text-xs`}
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? "Preserving..." : editingId ? "Save Indicator Changes" : "Commit PMF Indicator"}</span>
            </button>
          </div>
        </form>

        {/* Directory Output Column: Structured into F.1, F.2, and F.3 Chapters */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          
          {/* Controls Bar with Section Toggles */}
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            
            {/* Top Row: F.1 / F.2 / F.3 Chapter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
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
                  <span>F.1 Internal ({f1Count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSection("F.2")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterSection === "F.2" ? "bg-teal-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>F.2 Cross-Agency ({f2Count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSection("F.3")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterSection === "F.3" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>F.3 Governance ({f3Count})</span>
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

          {/* Directory Content Grouped by Chapter & Project */}
          <div className="overflow-y-auto max-h-[680px] space-y-6 pr-1">
            {loading ? (
              <div className="text-center py-20 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Synchronizing PMF indicator matrix...</span>
              </div>
            ) : filteredMetrics.length === 0 ? (
              <div className="text-center py-20 text-slate-400 italic">
                No performance indicators found matching your active filter criteria.
              </div>
            ) : (
              <>
                {/* CHAPTER F.1: INTERNAL ICT PROJECTS */}
                {(filterSection === "All" || filterSection === "F.1") && f1GroupedByProject.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-900/60 pb-2">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <h4 className="font-bold text-xs uppercase tracking-wider text-purple-900 dark:text-purple-300 font-serif">
                          F.1. Internal ICT Projects Performance Scorecard
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 font-bold">
                        {f1GroupedByProject.reduce((acc, g) => acc + g.items.length, 0)} Indicators
                      </span>
                    </div>

                    <div className="space-y-4">
                      {f1GroupedByProject.map(group => (
                        <div 
                          key={group.title} 
                          className="bg-slate-50/70 dark:bg-slate-955/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-2xs"
                        >
                          <div className="flex justify-between items-center border-b border-slate-200/80 dark:border-slate-800 pb-2">
                            <div>
                              <h5 className="font-bold text-slate-900 dark:text-white text-xs">{group.title}</h5>
                              {group.project?.implementing_unit && (
                                <span className="text-[9.5px] text-slate-400 font-mono">
                                  Implementing Unit: {group.project.implementing_unit}
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 font-mono font-bold">
                              {group.items.length} {group.items.length === 1 ? "KPI" : "KPIs"}
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {group.items.map(m => (
                              <MetricCard 
                                key={m.id}
                                metric={m}
                                projects={projects}
                                activeYears={activeYears}
                                onEdit={handleStartEdit}
                                onDelete={handleDelete}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CHAPTER F.2: CROSS-AGENCY ICT PROJECTS */}
                {(filterSection === "All" || filterSection === "F.2") && f2GroupedByProject.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-teal-200 dark:border-teal-900/60 pb-2">
                      <div className="flex items-center gap-2">
                        <Network className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <h4 className="font-bold text-xs uppercase tracking-wider text-teal-900 dark:text-teal-300 font-serif">
                          F.2. Cross-Agency ICT Projects Performance Scorecard
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 font-bold">
                        {f2GroupedByProject.reduce((acc, g) => acc + g.items.length, 0)} Indicators
                      </span>
                    </div>

                    <div className="space-y-4">
                      {f2GroupedByProject.map(group => (
                        <div 
                          key={group.title} 
                          className="bg-slate-50/70 dark:bg-slate-955/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-2xs"
                        >
                          <div className="flex justify-between items-center border-b border-slate-200/80 dark:border-slate-800 pb-2">
                            <div>
                              <h5 className="font-bold text-slate-900 dark:text-white text-xs">{group.title}</h5>
                              <div className="flex flex-wrap items-center gap-2 text-[9.5px] text-slate-400 font-mono mt-0.5">
                                {group.project?.lead_agency && (
                                  <span>Lead Agency: <strong className="text-teal-600 dark:text-teal-400">{group.project.lead_agency}</strong></span>
                                )}
                                {group.project?.partner_agencies && (
                                  <span>&bull; Partners: {group.project.partner_agencies}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 font-mono font-bold">
                              {group.items.length} {group.items.length === 1 ? "KPI" : "KPIs"}
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {group.items.map(m => (
                              <MetricCard 
                                key={m.id}
                                metric={m}
                                projects={projects}
                                activeYears={activeYears}
                                onEdit={handleStartEdit}
                                onDelete={handleDelete}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CHAPTER F.3: STANDALONE / INSTITUTIONAL GOVERNANCE KPIS */}
                {(filterSection === "All" || filterSection === "F.3") && f3StandaloneMetrics.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-blue-200 dark:border-blue-900/60 pb-2">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="font-bold text-xs uppercase tracking-wider text-blue-900 dark:text-blue-300 font-serif">
                          F.3. Institutional &amp; Agency-Wide ICT Governance KPIs
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 font-bold">
                        {f3StandaloneMetrics.length} Indicators
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {f3StandaloneMetrics.map(m => (
                        <MetricCard 
                          key={m.id}
                          metric={m}
                          projects={projects}
                          activeYears={activeYears}
                          onEdit={handleStartEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-Component: Individual Metric Card with Dynamic Multi-Year Milestones & Project Linkage Badges
function MetricCard({ metric, projects = [], activeYears, onEdit, onDelete }) {
  const hierLower = (metric.result_hierarchy || "").toLowerCase();
  const badgeStyle = hierLower.includes("output")
    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
    : hierLower.includes("intermediate")
    ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";

  let annualMap = metric.annual_targets;
  if (typeof annualMap === "string") {
    try { annualMap = JSON.parse(annualMap); } catch { annualMap = {}; }
  }
  annualMap = (annualMap && typeof annualMap === "object") ? annualMap : {};

  // Resolve Project Provenance
  const matchedProject = projects.find(
    p => (metric.project_id && String(p.id) === String(metric.project_id)) ||
         (p.project_title && p.project_title.toLowerCase().trim() === (metric.project_title || "").toLowerCase().trim())
  );
  const isLinked = Boolean(metric.project_id || matchedProject);
  const isCrossAgency = matchedProject?.project_category?.toLowerCase()?.includes("cross");

  return (
    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 space-y-2.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wider border font-mono ${badgeStyle}`}>
            {metric.result_hierarchy}
          </span>

          {/* Project Linkage Indicator Badge */}
          {isLinked ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-mono font-bold border ${
              isCrossAgency 
                ? "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-955/60 dark:text-teal-300 dark:border-teal-800"
                : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-955/60 dark:text-purple-300 dark:border-purple-800"
            }`}>
              <Link className="w-2.5 h-2.5" />
              <span>{isCrossAgency ? "F.2 Cross-Agency Link" : "F.1 Internal Project Link"}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-mono font-bold border bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700">
              <span>F.3 Standalone Governance</span>
            </span>
          )}

          <span className="text-[10px] text-slate-400 font-mono">
            {metric.project_title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(metric)}
            className="p-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
            title="Edit Indicator Parameters"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(metric.id, metric.project_title)}
            className="p-1 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded text-slate-400 cursor-pointer transition-colors"
            title="Delete Indicator"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-slate-800 dark:text-slate-200 text-xs leading-relaxed font-sans">
        {metric.indicator}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-955 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-mono">
        <div>
          <span className="text-slate-400 uppercase text-[8px] font-bold block">Baseline</span>
          <span className="text-slate-700 dark:text-slate-300 font-semibold">{metric.baseline}</span>
        </div>
        <div>
          <span className="text-emerald-600 uppercase text-[8px] font-bold block">Target</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{metric.target}</span>
        </div>
        <div>
          <span className="text-slate-400 uppercase text-[8px] font-bold block">Collection Method</span>
          <span className="text-slate-700 dark:text-slate-300 truncate block" title={metric.collection_method}>{metric.collection_method}</span>
        </div>
      </div>

      {/* Annual Targets Breakdown Strip across active horizon */}
      {Object.keys(annualMap).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[9.5px] font-mono">
          <span className="text-slate-400 font-bold uppercase text-[8.5px]">Annual Milestones:</span>
          {activeYears.map(yr => {
            const val = annualMap[String(yr)] || annualMap[`Year ${activeYears.indexOf(yr) + 1}`];
            if (!val) return null;
            return (
              <span key={yr} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                FY {yr}: <strong>{val}</strong>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex justify-between items-center text-[9px] text-slate-400 font-sans pt-1 border-t border-slate-100 dark:border-slate-800">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3 text-slate-400" />
          <span>Responsible: <strong className="text-slate-700 dark:text-slate-300">{metric.responsibility}</strong></span>
        </span>
        <span className="font-mono">ID: #{String(metric.id).slice(0, 8)}</span>
      </div>
    </div>
  );
}