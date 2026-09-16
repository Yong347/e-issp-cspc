// frontend/src/views/admin/Projects/InternalProjectsManager.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  FolderKanban, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  Search, 
  Coins, 
  Building, 
  CheckSquare, 
  ExternalLink, 
  ShieldCheck, 
  Target,
  Layers,
  AlertCircle,
  CheckCircle,
  Database,
  Network,
  Info,
  Calendar,
  Sparkles
} from "lucide-react";

export default function InternalProjectsManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();

  // Dynamic branding and department defaults
  const defaultImplementingUnit = 
    import.meta.env.VITE_DEFAULT_IMPLEMENTING_UNIT || 
    user?.department_name || 
    "ICT Management Office";

  // Data States
  const [projects, setProjects] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filter & Search States
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Dynamic Form State Supporting Arbitrary N-Year Horizons
  const initialFormState = {
    system_id: "",
    project_title: "",
    project_category: "Internal ICT Projects",
    description: "",
    objectives: "",
    aligns_pip: false,
    aligns_ncsp: false,
    aligns_egmp: false,
    aligns_pcb: false,
    aligns_others: false,
    aligns_others_specify: "",
    harmonizes_national_priority: false,
    harmonizes_resource_optimization: false,
    harmonizes_pegif: false,
    harmonizes_cross_collaboration: false,
    harmonizes_scalability: false,
    duration_start_year: (planningYears && planningYears[0]) || 2026,
    duration_end_year: (planningYears && planningYears[planningYears.length - 1]) || 2028,
    annual_deliverables: {},
    year_1_deliverables: "",
    year_2_deliverables: "",
    year_3_deliverables: "",
    implementing_unit: defaultImplementingUnit,
    funding_source: "General Appropriations Act (GAA)",
    lead_agency: "",
    partner_agencies: ""
  };
  const [form, setForm] = useState(initialFormState);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fetchProjects = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/ict-projects?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load ICT projects registry.");
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : (data.data || []));

      // Query registered information systems to populate the system provenance dropdown
      const sysRes = await fetch(`${apiUrl}/api/admin/information-systems?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        setSystems(Array.isArray(sysData) ? sysData : (sysData.data || []));
      }
    } catch (err) {
      setError(err.message || "Network error loading projects.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, activeCycle, token]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Sync duration years with active planning horizon
  useEffect(() => {
    if (activeCycle) {
      const parts = activeCycle.split("-");
      if (parts.length === 2) {
        const start = parseInt(parts[0], 10);
        const end = parseInt(parts[1], 10);
        setForm(prev => ({
          ...prev,
          duration_start_year: isNaN(start) ? 2026 : start,
          duration_end_year: isNaN(end) ? 2028 : end
        }));
      }
    }
  }, [activeCycle]);

  const handleOpenCreateModal = () => {
    setEditingId(null);
    const startYr = (planningYears && planningYears[0]) || 2026;
    const endYr = (planningYears && planningYears[planningYears.length - 1]) || 2028;

    const initialDelivs = {};
    for (let y = startYr; y <= endYr; y++) {
      initialDelivs[String(y)] = "";
      initialDelivs[`Year ${y - startYr + 1}`] = "";
    }

    setForm({
      ...initialFormState,
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: initialDelivs,
      implementing_unit: defaultImplementingUnit
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (proj) => {
    setEditingId(proj.id);
    const startYr = parseInt(proj.duration_start_year, 10) || (planningYears && planningYears[0]) || 2026;
    const endYr = parseInt(proj.duration_end_year, 10) || (planningYears && planningYears[planningYears.length - 1]) || 2028;

    let parsedAnnual = proj.annual_deliverables;
    if (typeof parsedAnnual === "string") {
      try {
        parsedAnnual = JSON.parse(parsedAnnual);
      } catch {
        parsedAnnual = {};
      }
    }
    parsedAnnual = parsedAnnual && typeof parsedAnnual === "object" ? { ...parsedAnnual } : {};

    // Populate all years in the project span, falling back to legacy deliverable fields
    for (let y = startYr; y <= endYr; y++) {
      const idx = y - startYr + 1;
      let text = parsedAnnual[String(y)] || parsedAnnual[`Year ${idx}`] || "";
      if (!text) {
        if (idx === 1) text = proj.year_1_deliverables || "";
        else if (idx === 2) text = proj.year_2_deliverables || "";
        else if (idx === 3) text = proj.year_3_deliverables || "";
      }
      parsedAnnual[String(y)] = text;
      parsedAnnual[`Year ${idx}`] = text;
    }

    setForm({
      system_id: proj.system_id || "",
      project_title: proj.project_title || "",
      project_category: proj.project_category || "Internal ICT Projects",
      description: proj.description || "",
      objectives: proj.objectives || "",
      aligns_pip: Boolean(proj.aligns_pip),
      aligns_ncsp: Boolean(proj.aligns_ncsp),
      aligns_egmp: Boolean(proj.aligns_egmp),
      aligns_pcb: Boolean(proj.aligns_pcb),
      aligns_others: Boolean(proj.aligns_others),
      aligns_others_specify: proj.aligns_others_specify || "",
      harmonizes_national_priority: Boolean(proj.harmonizes_national_priority),
      harmonizes_resource_optimization: Boolean(proj.harmonizes_resource_optimization),
      harmonizes_pegif: Boolean(proj.harmonizes_pegif),
      harmonizes_cross_collaboration: Boolean(proj.harmonizes_cross_collaboration),
      harmonizes_scalability: Boolean(proj.harmonizes_scalability),
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: parsedAnnual,
      year_1_deliverables: parsedAnnual["Year 1"] || parsedAnnual[String(startYr)] || proj.year_1_deliverables || "",
      year_2_deliverables: parsedAnnual["Year 2"] || parsedAnnual[String(startYr + 1)] || proj.year_2_deliverables || "",
      year_3_deliverables: parsedAnnual["Year 3"] || parsedAnnual[String(endYr)] || proj.year_3_deliverables || "",
      implementing_unit: proj.implementing_unit || defaultImplementingUnit,
      funding_source: proj.funding_source || "General Appropriations Act (GAA)",
      lead_agency: proj.lead_agency || "",
      partner_agencies: proj.partner_agencies || ""
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleAnnualDeliverableChange = (yr, yearIndex, value) => {
    setForm(prev => {
      const updated = { ...(prev.annual_deliverables || {}) };
      updated[String(yr)] = value;
      updated[`Year ${yearIndex}`] = value;
      return {
        ...prev,
        annual_deliverables: updated,
        ...(yearIndex === 1 ? { year_1_deliverables: value } : {}),
        ...(yearIndex === 2 ? { year_2_deliverables: value } : {}),
        ...(yearIndex === 3 ? { year_3_deliverables: value } : {})
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate Others (Specify) if checked
    if (form.aligns_others && !form.aligns_others_specify.trim()) {
      setError("Please specify the program or circular title under Strategic Alignment 'Others (Specify)'.");
      return;
    }

    // Validate Lead Agency if Cross-Agency Project is selected
    if (form.project_category === "Cross-Agency ICT Projects" && !form.lead_agency?.trim()) {
      setError("Please designate a Lead Agency for Cross-Agency ICT Projects (Part III.E.2).");
      return;
    }

    const startYr = parseInt(form.duration_start_year, 10) || 2026;
    const endYr = parseInt(form.duration_end_year, 10) || (startYr + 2);

    if (startYr > endYr) {
      setError("Start Year cannot be later than End Year.");
      return;
    }

    setSubmitting(true);

    // Build standardized annual deliverables map
    const cleanAnnual = {};
    for (let y = startYr; y <= endYr; y++) {
      const idx = y - startYr + 1;
      let text = form.annual_deliverables?.[String(y)] || form.annual_deliverables?.[`Year ${idx}`] || "";
      if (!text) {
        if (idx === 1) text = form.year_1_deliverables || "";
        else if (idx === 2) text = form.year_2_deliverables || "";
        else if (idx === 3) text = form.year_3_deliverables || "";
      }
      cleanAnnual[String(y)] = text;
      cleanAnnual[`Year ${idx}`] = text;
    }

    const y1 = cleanAnnual["Year 1"] || cleanAnnual[String(startYr)] || form.year_1_deliverables || "";
    const y2 = cleanAnnual["Year 2"] || cleanAnnual[String(startYr + 1)] || form.year_2_deliverables || "";
    const y3 = cleanAnnual["Year 3"] || cleanAnnual[String(endYr)] || form.year_3_deliverables || "";

    const payload = {
      ...form,
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: cleanAnnual,
      year_1_deliverables: y1,
      year_2_deliverables: y2,
      year_3_deliverables: y3,
      system_id: form.system_id || null,
      aligns_others: Boolean(form.aligns_others),
      aligns_others_specify: form.aligns_others ? form.aligns_others_specify.trim() : null,
      lead_agency: form.project_category === "Cross-Agency ICT Projects" ? (form.lead_agency?.trim() || null) : null,
      partner_agencies: form.project_category === "Cross-Agency ICT Projects" ? (form.partner_agencies?.trim() || null) : null
    };

    try {
      const endpoint = editingId 
        ? `${apiUrl}/api/admin/ict-projects/${editingId}`
        : `${apiUrl}/api/admin/ict-projects`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let detailMsg = errData.detail;
        if (typeof detailMsg === "object") detailMsg = JSON.stringify(detailMsg);
        throw new Error(detailMsg || "Failed to save ICT project parameters.");
      }

      setSuccess(`ICT Project '${form.project_title}' preserved successfully.`);
      setIsModalOpen(false);
      fetchProjects();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete '${title}'? This action is blocked if budget line items are linked in Part IV.A.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/ict-projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete project.");
      }
      setSuccess(`Project '${title}' deleted.`);
      fetchProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper: Retrieve deliverable text across JSON map and legacy properties
  const getDeliverableText = (proj, yearNum, calYear) => {
    let annual = proj.annual_deliverables;
    if (typeof annual === "string") {
      try { annual = JSON.parse(annual); } catch { annual = {}; }
    }
    if (annual && typeof annual === "object") {
      if (annual[String(calYear)]) return annual[String(calYear)];
      if (annual[`Year ${yearNum}`]) return annual[`Year ${yearNum}`];
    }
    if (yearNum === 1) return proj.year_1_deliverables || "";
    if (yearNum === 2) return proj.year_2_deliverables || "";
    if (yearNum === 3) return proj.year_3_deliverables || "";
    return "";
  };

  // Dynamic Year Sequence inside Modal Form
  const modalStartYr = parseInt(form.duration_start_year, 10) || 2026;
  const modalEndYr = parseInt(form.duration_end_year, 10) || (modalStartYr + 2);
  const modalHorizonYears = [];
  if (modalStartYr <= modalEndYr) {
    for (let y = modalStartYr; y <= modalEndYr; y++) {
      modalHorizonYears.push(y);
    }
  }

  // Portfolio Totals
  const totalPortfolioValue = projects.reduce((acc, p) => acc + parseFloat(p.computed_total_project_cost || 0), 0);
  const internalCount = projects.filter(p => p.project_category === "Internal ICT Projects").length;
  const crossAgencyCount = projects.filter(p => p.project_category === "Cross-Agency ICT Projects").length;

  const filteredProjects = projects.filter(p => {
    const matchesCategory = categoryFilter === "All" || p.project_category === categoryFilter;
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = q === "" || 
      (p.project_title || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.implementing_unit || "").toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Part III.E: ICT Projects Portfolio &amp; Deliverables</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Manage multi-year milestones, strategic alignment (PIP, NCSP, EGMP, PCB, Others), and national harmonization standards.
            Total project costs calculate dynamically from child Part IV.A line items.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchProjects}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 font-bold shadow-xs cursor-pointer text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create ICT Project</span>
          </button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Portfolio</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{projects.length} Initiatives</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Computed Budget Cost</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {formatPHP(totalPortfolioValue)}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Internal Projects (III.E.1)</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{internalCount} Active</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cross-Agency (III.E.2)</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{crossAgencyCount} Joint</h3>
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex bg-slate-100 dark:bg-slate-955 p-1 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
          {["All", "Internal ICT Projects", "Cross-Agency ICT Projects"].map(tab => (
            <button
              key={tab}
              onClick={() => setCategoryFilter(tab)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                categoryFilter === tab 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab === "All" ? "All Projects" : tab === "Internal ICT Projects" ? "Internal (III.E.1)" : "Cross-Agency (III.E.2)"}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search project title, unit, or scope..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Projects Cards List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-500 shadow-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading strategic project portfolios...</span>
          </div>
        ) : filteredProjects.length > 0 ? (
          filteredProjects.map(proj => {
            const pStart = parseInt(proj.duration_start_year, 10) || 2026;
            const pEnd = parseInt(proj.duration_end_year, 10) || (pStart + 2);
            const pYears = [];
            for (let y = pStart; y <= pEnd; y++) {
              pYears.push(y);
            }

            const linkedSystem = systems.find(s => s.id === proj.system_id);

            return (
              <div 
                key={proj.id}
                className="p-6 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 transition-all space-y-4 shadow-xs"
              >
                {/* Header Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${
                        proj.project_category === "Internal ICT Projects"
                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                          : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                      }`}>
                        {proj.project_category}
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{proj.project_title}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono mt-1">
                      <span>Implementing Unit: <strong className="text-slate-700 dark:text-slate-300">{proj.implementing_unit}</strong></span>
                      <span>•</span>
                      <span>Fund Source: <strong className="text-blue-600 dark:text-blue-400">{proj.funding_source}</strong></span>
                      <span>•</span>
                      <span>Horizon: <strong className="text-slate-700 dark:text-slate-300">FY {pStart} – FY {pEnd} ({pYears.length} Years)</strong></span>
                      {linkedSystem && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                            <Database className="w-3 h-3" />
                            <span>System: {linkedSystem.name}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Computed Project Cost</span>
                      <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatPHP(proj.computed_total_project_cost)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleOpenEditModal(proj)}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(proj.id, proj.project_title)}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded-lg text-slate-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Narrative Context */}
                <div className="space-y-1 text-xs">
                  <p className="text-slate-700 dark:text-slate-300"><strong>Description:</strong> {proj.description}</p>
                  <p className="text-slate-500 dark:text-slate-400"><strong>Objectives:</strong> {proj.objectives}</p>
                </div>

                {/* Cross-Agency Details Box (Clean Inset Surface) */}
                {proj.project_category === "Cross-Agency ICT Projects" && (
                  <div className="text-xs p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap gap-6 text-slate-700 dark:text-slate-300">
                    <div>
                      <strong className="text-slate-900 dark:text-white">Lead Agency:</strong> 
                      <span className="text-blue-600 dark:text-blue-400 ml-1 font-mono font-bold">{proj.lead_agency || "Not Specified"}</span>
                    </div>
                    <div>
                      <strong className="text-slate-900 dark:text-white">Partner Agencies:</strong> 
                      <span className="text-slate-600 dark:text-slate-400 ml-1">{proj.partner_agencies || "None Configured"}</span>
                    </div>
                  </div>
                )}

                {/* Deliverables / Milestones Matrix (Clean Inset Surface with Uniform Blue Headers) */}
                <div 
                  className="grid gap-3 bg-slate-50 dark:bg-slate-955 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(pYears.length, 4)}, minmax(0, 1fr))`
                  }}
                >
                  {pYears.map((yr, idx) => {
                    const text = getDeliverableText(proj, idx + 1, yr);
                    return (
                      <div key={yr}>
                        <span className="text-blue-600 dark:text-blue-400 uppercase font-bold text-[10px] block mb-1 font-mono">
                          Year {idx + 1} Deliverables ({yr})
                        </span>
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {text || <span className="text-slate-400 italic">No deliverables specified.</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Strategic Alignment & Harmonization Tags */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[9.5px] font-mono">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase mr-1">Alignment:</span>
                    {proj.aligns_pip && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">PIP</span>}
                    {proj.aligns_ncsp && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">NCSP</span>}
                    {proj.aligns_egmp && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">EGMP</span>}
                    {proj.aligns_pcb && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">PCB</span>}
                    {proj.aligns_others && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">
                        Others: {proj.aligns_others_specify || "Special Mandate"}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase mr-1">Harmonization:</span>
                    {proj.harmonizes_national_priority && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">National Priority</span>}
                    {proj.harmonizes_resource_optimization && <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">Resource Optimization</span>}
                    {proj.harmonizes_pegif && <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">PeGIF / APIs</span>}
                    {proj.harmonizes_scalability && <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-bold">SPAR / PREXC</span>}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic shadow-xs">
            No ICT projects registered for planning cycle '{activeCycle}'.
          </div>
        )}
      </div>

      {/* CREATE / EDIT PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{editingId ? "Update ICT Project Parameters" : "Create Strategic ICT Project (Part III.E)"}</span>
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              {/* Linked Information System Provenance */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Associated Information System (Architecture Link)
                </label>
                <select
                  value={form.system_id}
                  onChange={e => setForm({ ...form, system_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="">-- Standalone Infrastructure / Network Project --</option>
                  {systems.map(s => (
                    <option key={s.id} value={s.id}>
                      [{s.status}] {s.name} ({s.classification})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Project Title</label>
                  <input
                    type="text" required value={form.project_title} onChange={e => setForm({ ...form, project_title: e.target.value })}
                    placeholder="e.g. Enterprise Portal Modernization and GovCloud Migration"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Portfolio Category</label>
                  <select
                    value={form.project_category} onChange={e => setForm({ ...form, project_category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none focus:border-blue-500"
                  >
                    <option value="Internal ICT Projects">Internal ICT Project (Part III.E.1)</option>
                    <option value="Cross-Agency ICT Projects">Cross-Agency Project (Part III.E.2)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Description</label>
                <textarea
                  rows={2} required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="High-level technical overview of the digital transformation initiative..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Project Objectives (The "Why")</label>
                <textarea
                  rows={2} required value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })}
                  placeholder="Specific operational pain points and performance targets this project resolves..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Implementing Unit</label>
                  <input
                    type="text" required value={form.implementing_unit} onChange={e => setForm({ ...form, implementing_unit: e.target.value })}
                    placeholder="e.g. Information and Communications Technology Division"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Funding Source</label>
                  <select
                    value={form.funding_source} onChange={e => setForm({ ...form, funding_source: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none focus:border-blue-500"
                  >
                    <option value="General Appropriations Act (GAA)">General Appropriations Act (GAA)</option>
                    <option value="Foreign-Assisted Projects (FAP)">Foreign-Assisted Projects (FAP)</option>
                    <option value="Locally Funded">Locally Funded Special Grant</option>
                    <option value="Other Income Generating Sources">Other Income / Retained Earnings</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Planning Horizon Bounds */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Duration Start Year</label>
                  <input
                    type="number"
                    required
                    value={form.duration_start_year}
                    onChange={e => {
                      const start = parseInt(e.target.value, 10) || 2026;
                      setForm(prev => ({ ...prev, duration_start_year: start }));
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Duration End Year</label>
                  <input
                    type="number"
                    required
                    value={form.duration_end_year}
                    onChange={e => {
                      const end = parseInt(e.target.value, 10) || 2028;
                      setForm(prev => ({ ...prev, duration_end_year: end }));
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              {/* Cross Agency Parameters */}
              {form.project_category === "Cross-Agency ICT Projects" && (
                <div className="p-3 bg-teal-50 dark:bg-teal-955/20 border border-teal-200 dark:border-teal-900/40 rounded-xl space-y-2 animate-fadeIn">
                  <span className="text-[10px] uppercase font-bold text-teal-800 dark:text-teal-400">Cross-Agency Partnerships (III.E.2)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text" placeholder="Lead Agency (e.g. DICT)"
                      value={form.lead_agency} onChange={e => setForm({ ...form, lead_agency: e.target.value })}
                      className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                    />
                    <input
                      type="text" placeholder="Partner Agencies (e.g. DBM, BTr, DOH)"
                      value={form.partner_agencies} onChange={e => setForm({ ...form, partner_agencies: e.target.value })}
                      className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Strategic Alignment Checklists with 'Others (Specify)' Support */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">National Strategic Alignment (Part III.E)</span>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_pip} onChange={e => setForm({ ...form, aligns_pip: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Public Investment (PIP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_ncsp} onChange={e => setForm({ ...form, aligns_ncsp: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Cybersecurity (NCSP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_egmp} onChange={e => setForm({ ...form, aligns_egmp: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>E-Gov Plan (EGMP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_pcb} onChange={e => setForm({ ...form, aligns_pcb: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Convergence (PCB)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_others} onChange={e => setForm({ ...form, aligns_others: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Others (Specify)</span>
                  </label>
                </div>

                {/* Conditional Text Box for 'Others (Specify)' */}
                {form.aligns_others && (
                  <div className="pt-2 animate-fadeIn space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                      <span>Specify Strategic Framework / Policy Directive</span>
                      <span className="text-[9px] text-rose-500 font-bold">*Required</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={form.aligns_others_specify}
                      onChange={e => setForm({ ...form, aligns_others_specify: e.target.value })}
                      placeholder="e.g. Commission Directive on Institutional Cloud Migration"
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>
                )}
              </div>

              {/* Harmonization Framework Checklists */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block">Harmonization Framework Criteria</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_national_priority} onChange={e => setForm({ ...form, harmonizes_national_priority: e.target.checked })} className="accent-purple-600 rounded" />
                    <span>National Prioritization (PDP 2023-2028)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_resource_optimization} onChange={e => setForm({ ...form, harmonizes_resource_optimization: e.target.checked })} className="accent-purple-600 rounded" />
                    <span>Resource Optimization (GovNet, GovCloud)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_pegif} onChange={e => setForm({ ...form, harmonizes_pegif: e.target.checked })} className="accent-purple-600 rounded" />
                    <span>PeGIF Standardized APIs &amp; NGDX</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_scalability} onChange={e => setForm({ ...form, harmonizes_scalability: e.target.checked })} className="accent-purple-600 rounded" />
                    <span>Scalability &amp; Sustainability (SPAR / PREXC)</span>
                  </label>
                </div>
              </div>

              {/* Dynamic Multi-Year Deliverables & Milestones */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                    Annual Project Milestones &amp; Deliverables ({modalHorizonYears.length} Years Horizon)
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    FY {modalStartYr} – FY {modalEndYr}
                  </span>
                </div>

                <div 
                  className="grid gap-3"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(modalHorizonYears.length, 3)}, minmax(0, 1fr))`
                  }}
                >
                  {modalHorizonYears.map((yr, idx) => (
                    <div key={yr} className="space-y-1">
                      <label className="text-[9.5px] uppercase font-bold text-slate-500">
                        Year {idx + 1} Deliverables ({yr})
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={form.annual_deliverables?.[String(yr)] || ""}
                        onChange={e => handleAnnualDeliverableChange(yr, idx + 1, e.target.value)}
                        placeholder={`Key deliverables, architecture milestones, or targets for FY ${yr}...`}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : editingId ? "Update Project Portfolio" : "Save ICT Project"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}