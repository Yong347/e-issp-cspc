// frontend/src/views/admin/Narrative/CrossProjectsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getIctProjects, 
  createIctProject, 
  updateIctProject, 
  deleteIctProject 
} from "../../../api/admin";
import { 
  Network, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  RefreshCw, 
  Search, 
  Calendar, 
  Building, 
  Target, 
  Layers, 
  AlertCircle, 
  CheckCircle, 
  Coins, 
  X, 
  SlidersHorizontal,
  Info
} from "lucide-react";

export default function CrossProjectsManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();

  // Dynamic institutional naming
  const defaultAgencyName = import.meta.env.VITE_AGENCY_NAME || user?.agency_name || "National Government Agency";
  const agencyName = defaultAgencyName;
  const defaultImplementingUnit = 
    import.meta.env.VITE_DEFAULT_IMPLEMENTING_UNIT || 
    user?.department_name || 
    "ICT Management Office";

  // Data States
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAlignment, setFilterAlignment] = useState("All");

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal State (Add / Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const initialFormState = {
    project_title: "",
    project_category: "Cross-Agency ICT Projects",
    description: "",
    objectives: "",
    lead_agency: "",
    partner_agencies: "",
    implementing_unit: defaultImplementingUnit,
    funding_source: "General Appropriations Act (GAA)",
    duration_start_year: (planningYears && planningYears[0]) || 2026,
    duration_end_year: (planningYears && planningYears[planningYears.length - 1]) || 2028,
    annual_deliverables: {},
    year_1_deliverables: "",
    year_2_deliverables: "",
    year_3_deliverables: "",
    aligns_pip: false,
    aligns_ncsp: false,
    aligns_egmp: true,
    aligns_pcb: true,
    aligns_others: false,
    aligns_others_specify: "",
    harmonizes_national_priority: true,
    harmonizes_resource_optimization: true,
    harmonizes_pegif: true,
    harmonizes_cross_collaboration: true,
    harmonizes_scalability: true
  };

  const [form, setForm] = useState(initialFormState);
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Synchronize duration years with active planning horizon
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

  const fetchCrossProjects = useCallback(async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getIctProjects(token, activeCycle, "Cross-Agency ICT Projects");
      const rawList = Array.isArray(data) ? data : (data?.data || []);

      // Filter to ensure only cross-agency projects are displayed
      const crossProjects = rawList.filter(p => {
        const cat = (p.project_category || "").toString().toLowerCase();
        return cat.includes("cross") || cat === "cross_agency_ict_project";
      });

      setProjects(crossProjects);
    } catch (err) {
      // Graceful fallback query without category filter parameter
      try {
        const data = await getIctProjects(token, activeCycle);
        const rawList = Array.isArray(data) ? data : (data?.data || []);
        const crossProjects = rawList.filter(p => {
          const cat = (p.project_category || "").toString().toLowerCase();
          return cat.includes("cross") || cat === "cross_agency_ict_project";
        });
        setProjects(crossProjects);
      } catch (fallbackErr) {
        setError(fallbackErr.message || err.message || "Failed to load cross-agency collaborative projects.");
        setProjects([]);
      }
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token]);

  useEffect(() => {
    fetchCrossProjects();
  }, [fetchCrossProjects]);

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

  const handleOpenEditModal = (p) => {
    setEditingId(p.id);
    const startYr = parseInt(p.duration_start_year, 10) || (planningYears && planningYears[0]) || 2026;
    const endYr = parseInt(p.duration_end_year, 10) || (planningYears && planningYears[planningYears.length - 1]) || 2028;

    let parsedAnnual = p.annual_deliverables;
    if (typeof parsedAnnual === "string") {
      try {
        parsedAnnual = JSON.parse(parsedAnnual);
      } catch (e) {
        parsedAnnual = {};
      }
    }
    parsedAnnual = parsedAnnual && typeof parsedAnnual === "object" ? { ...parsedAnnual } : {};

    // Ensure all years in the project duration span are mapped
    for (let y = startYr; y <= endYr; y++) {
      const idx = y - startYr + 1;
      let text = parsedAnnual[String(y)] || parsedAnnual[`Year ${idx}`] || "";
      if (!text) {
        if (idx === 1) text = p.year_1_deliverables || "";
        else if (idx === 2) text = p.year_2_deliverables || "";
        else if (idx === 3) text = p.year_3_deliverables || "";
      }
      parsedAnnual[String(y)] = text;
      parsedAnnual[`Year ${idx}`] = text;
    }

    setForm({
      project_title: p.project_title || "",
      project_category: "Cross-Agency ICT Projects",
      description: p.description || "",
      objectives: p.objectives || "",
      lead_agency: p.lead_agency || "",
      partner_agencies: p.partner_agencies || "",
      implementing_unit: p.implementing_unit || defaultImplementingUnit,
      funding_source: p.funding_source || "General Appropriations Act (GAA)",
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: parsedAnnual,
      year_1_deliverables: parsedAnnual["Year 1"] || parsedAnnual[String(startYr)] || p.year_1_deliverables || "",
      year_2_deliverables: parsedAnnual["Year 2"] || parsedAnnual[String(startYr + 1)] || p.year_2_deliverables || "",
      year_3_deliverables: parsedAnnual["Year 3"] || parsedAnnual[String(endYr)] || p.year_3_deliverables || "",
      aligns_pip: Boolean(p.aligns_pip),
      aligns_ncsp: Boolean(p.aligns_ncsp),
      aligns_egmp: Boolean(p.aligns_egmp),
      aligns_pcb: Boolean(p.aligns_pcb),
      aligns_others: Boolean(p.aligns_others),
      aligns_others_specify: p.aligns_others_specify || "",
      harmonizes_national_priority: Boolean(p.harmonizes_national_priority),
      harmonizes_resource_optimization: Boolean(p.harmonizes_resource_optimization),
      harmonizes_pegif: Boolean(p.harmonizes_pegif),
      harmonizes_cross_collaboration: Boolean(p.harmonizes_cross_collaboration),
      harmonizes_scalability: Boolean(p.harmonizes_scalability)
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
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

    if (!form.project_title.trim()) {
      setError("Project Title is required.");
      return;
    }
    if (!form.lead_agency.trim()) {
      setError("Lead Agency designation is required for Cross-Agency Projects.");
      return;
    }
    if (form.aligns_others && !form.aligns_others_specify.trim()) {
      setError("Please specify the strategic program name under Strategic Alignment 'Others (Specify)'.");
      return;
    }

    const startYr = parseInt(form.duration_start_year, 10) || (planningYears && planningYears[0]) || 2026;
    const endYr = parseInt(form.duration_end_year, 10) || (planningYears && planningYears[planningYears.length - 1]) || 2028;

    if (startYr > endYr) {
      setError("Start Year cannot be later than End Year.");
      return;
    }

    setSubmitting(true);

    // Build comprehensive annual deliverables mapping across all years
    const cleanAnnual = {};
    for (let y = startYr; y <= endYr; y++) {
      const idx = y - startYr + 1;
      const text = form.annual_deliverables?.[String(y)] || form.annual_deliverables?.[`Year ${idx}`] || "";
      cleanAnnual[String(y)] = text;
      cleanAnnual[`Year ${idx}`] = text;
    }

    const y1 = cleanAnnual["Year 1"] || cleanAnnual[String(startYr)] || form.year_1_deliverables || "";
    const y2 = cleanAnnual["Year 2"] || cleanAnnual[String(startYr + 1)] || form.year_2_deliverables || "";
    const y3 = cleanAnnual["Year 3"] || cleanAnnual[String(endYr)] || form.year_3_deliverables || "";

    const payload = {
      project_title: form.project_title.trim(),
      project_category: "Cross-Agency ICT Projects",
      description: form.description.trim(),
      objectives: form.objectives.trim(),
      lead_agency: form.lead_agency.trim(),
      partner_agencies: form.partner_agencies.trim(),
      implementing_unit: form.implementing_unit.trim() || defaultImplementingUnit,
      funding_source: form.funding_source || "General Appropriations Act (GAA)",
      duration_start_year: startYr,
      duration_end_year: endYr,
      annual_deliverables: cleanAnnual,
      year_1_deliverables: y1 || `Year 1 (${startYr}) Inter-Agency Deliverables`,
      year_2_deliverables: y2 || `Year 2 (${startYr + 1}) Inter-Agency Deliverables`,
      year_3_deliverables: y3 || `Year 3 (${endYr}) Inter-Agency Deliverables`,
      aligns_pip: Boolean(form.aligns_pip),
      aligns_ncsp: Boolean(form.aligns_ncsp),
      aligns_egmp: Boolean(form.aligns_egmp),
      aligns_pcb: Boolean(form.aligns_pcb),
      aligns_others: Boolean(form.aligns_others),
      aligns_others_specify: form.aligns_others ? form.aligns_others_specify.trim() : null,
      harmonizes_national_priority: Boolean(form.harmonizes_national_priority),
      harmonizes_resource_optimization: Boolean(form.harmonizes_resource_optimization),
      harmonizes_pegif: Boolean(form.harmonizes_pegif),
      harmonizes_cross_collaboration: Boolean(form.harmonizes_cross_collaboration),
      harmonizes_scalability: Boolean(form.harmonizes_scalability),
      system_id: null
    };

    try {
      if (editingId) {
        await updateIctProject(token, editingId, payload);
      } else {
        await createIctProject(token, payload);
      }

      setSuccess(`Cross-Agency Project '${form.project_title}' successfully saved.`);
      handleCloseModal();
      fetchCrossProjects();
    } catch (err) {
      setError(err.message || "Operation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Permanently delete Cross-Agency Project '${title}'? This action is blocked if budget line items are linked in Part IV.A.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteIctProject(token, id);
      setSuccess(`Project '${title}' purged from framework.`);
      fetchCrossProjects();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  // Helper: Retrieve deliverable text across JSON map and legacy properties
  const getDeliverableText = (proj, yearNum, calYear) => {
    let annual = proj.annual_deliverables;
    if (typeof annual === "string") {
      try { annual = JSON.parse(annual); } catch (e) { annual = {}; }
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

  // Dynamic Year Sequence for Modal
  const modalStartYr = parseInt(form.duration_start_year, 10) || 2026;
  const modalEndYr = parseInt(form.duration_end_year, 10) || (modalStartYr + 2);
  const modalHorizonYears = useMemo(() => {
    const years = [];
    if (modalStartYr <= modalEndYr) {
      for (let y = modalStartYr; y <= modalEndYr; y++) {
        years.push(y);
      }
    }
    return years;
  }, [modalStartYr, modalEndYr]);

  // Macro Summary Statistics
  const totalCrossProjects = projects.length;
  const totalCrossOutlay = projects.reduce((sum, p) => sum + Number(p.computed_total_project_cost || 0), 0);
  const pegifAlignedCount = projects.filter(p => p.harmonizes_pegif).length;
  const pcbAlignedCount = projects.filter(p => p.aligns_pcb).length;

  const filteredProjects = projects.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      (p.project_title || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.lead_agency || "").toLowerCase().includes(q) ||
      (p.partner_agencies || "").toLowerCase().includes(q);

    let matchesAlignment = true;
    if (filterAlignment === "EGMP") matchesAlignment = Boolean(p.aligns_egmp);
    if (filterAlignment === "PeGIF") matchesAlignment = Boolean(p.harmonizes_pegif);
    if (filterAlignment === "PCB") matchesAlignment = Boolean(p.aligns_pcb);
    if (filterAlignment === "PIP") matchesAlignment = Boolean(p.aligns_pip);
    if (filterAlignment === "NCSP") matchesAlignment = Boolean(p.aligns_ncsp);
    if (filterAlignment === "Others") matchesAlignment = Boolean(p.aligns_others);

    return matchesSearch && matchesAlignment;
  });

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans">
      
      {/* Title Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Part III.E.2: Cross-Agency ICT Projects &amp; Harmonization</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Manage multi-agency digital initiatives (Joint Memorandum Circulars &amp; Convergence), PeGIF / NGDX integration, and child Part IV.A line items.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreateModal}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Register Cross-Agency Project</span>
          </button>
          <button
            onClick={fetchCrossProjects}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-start gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-start gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Aggregate Financial and Compliance KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cross-Agency Initiatives</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalCrossProjects} Projects</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Part IV.A Financial Share</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{formatPHP(totalCrossOutlay)}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">PeGIF / NGDX Ready</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{pegifAlignedCount} Aligned</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Program Convergence (PCB)</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{pcbAlignedCount} Initiatives</h3>
          </div>
        </div>
      </div>

      {/* Search and Alignment Filter Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search cross-agency projects, agencies..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs placeholder-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-600 dark:text-slate-400 text-[11px] font-semibold">Strategic Filter:</span>
          <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            {["All", "PeGIF", "PCB", "EGMP", "PIP", "NCSP", "Others"].map(al => (
              <button
                key={al}
                onClick={() => setFilterAlignment(al)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  filterAlignment === al 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {al}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Projects Directory Listings */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Reading cross-agency cooperative frameworks...</span>
          </div>
        ) : filteredProjects.length > 0 ? (
          filteredProjects.map((p) => {
            const computedCost = Number(p.computed_total_project_cost || 0);
            const pStart = parseInt(p.duration_start_year, 10) || 2026;
            const pEnd = parseInt(p.duration_end_year, 10) || (pStart + 2);
            const pYears = [];
            for (let y = pStart; y <= pEnd; y++) {
              pYears.push(y);
            }

            return (
              <div 
                key={p.id} 
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 transition-all space-y-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Header Information Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold uppercase text-[9px] font-mono">
                        Cross-Agency ICT Project
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        Duration: {pStart} – {pEnd} ({pYears.length} Years)
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">{p.project_title}</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">{p.description}</p>
                  </div>

                  {/* Actions & Budget Indicator */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right font-mono bg-slate-50 dark:bg-slate-955 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[9px] text-slate-500 uppercase font-bold block">Part IV.A Financial Share</span>
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(computedCost)}</span>
                      <span className="text-[9px] text-slate-500 block mt-0.5">{p.funding_source}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer shadow-xs"
                        title="Edit Cross-Agency Project"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.project_title)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg transition-colors cursor-pointer shadow-xs"
                        title="Delete Project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collaboration & Objectives Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider flex items-center gap-1">
                      <Building className="w-3.5 h-3.5" />
                      <span>Inter-Agency Collaboration Structure</span>
                    </span>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <div><strong className="text-slate-700 dark:text-slate-300">Lead Agency:</strong> <span className="font-mono text-slate-900 dark:text-white font-bold ml-1">{p.lead_agency || "Not Specified"}</span></div>
                      <div><strong className="text-slate-700 dark:text-slate-300">Partner Agencies:</strong> <span className="text-slate-600 dark:text-slate-400 ml-1">{p.partner_agencies || "None Configured"}</span></div>
                      <div><strong className="text-slate-700 dark:text-slate-300">{agencyName} Implementing Unit:</strong> <span className="text-slate-600 dark:text-slate-400 ml-1">{p.implementing_unit}</span></div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" />
                      <span>Specific Inter-Agency Objectives</span>
                    </span>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed text-slate-700 dark:text-slate-300">
                      {p.objectives}
                    </div>
                  </div>
                </div>

                {/* Dynamic Multi-Year Milestones Schedule */}
                <div className="space-y-1 pt-1">
                  <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span>Annual Milestones &amp; Deliverables Breakdown ({pYears.length} Years Horizon)</span>
                  </span>
                  <div 
                    className="grid gap-3 bg-slate-50 dark:bg-slate-955 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px]"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(pYears.length, 4)}, minmax(0, 1fr))`
                    }}
                  >
                    {pYears.map((yr, idx) => {
                      const delivText = getDeliverableText(p, idx + 1, yr);
                      return (
                        <div key={yr}>
                          <strong className="text-blue-600 dark:text-blue-400 block mb-1 font-mono text-[10px] uppercase">
                            Year {idx + 1} ({yr}):
                          </strong>
                          <p className="text-slate-700 dark:text-slate-300 leading-normal whitespace-pre-wrap">
                            {delivText || <span className="text-slate-400 dark:text-slate-500 italic">No Year {idx + 1} milestones specified.</span>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Strategic Alignment & Harmonization Tags */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-[9.5px] font-mono">
                  <span className="text-slate-400 font-bold uppercase mr-1">Harmonization Alignment:</span>
                  {p.harmonizes_pegif && (
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">
                      PeGIF / NGDX API
                    </span>
                  )}
                  {p.aligns_pcb && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-bold">
                      Convergence Budgeting (PCB)
                    </span>
                  )}
                  {p.aligns_egmp && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-bold">
                      EGMP Masterplan
                    </span>
                  )}
                  {p.aligns_pip && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-bold">
                      Public Investment (PIP)
                    </span>
                  )}
                  {p.aligns_ncsp && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20 font-bold">
                      Cybersecurity (NCSP)
                    </span>
                  )}
                  {p.aligns_others && (
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold">
                      Others: {p.aligns_others_specify || "Special Mandate"}
                    </span>
                  )}
                  {p.harmonizes_resource_optimization && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20 font-bold">
                      GovCloud CSE Shared
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic shadow-xs">
            No Cross-Agency ICT Projects registered for planning cycle FY {activeCycle}. Click "Register Cross-Agency Project" to define cooperative initiatives.
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT CROSS-AGENCY ICT PROJECT */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {editingId ? "Update Cross-Agency ICT Project" : "Register Cross-Agency ICT Project (Part III.E.2)"}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  DICT Inter-Agency Collaboration Framework &amp; PeGIF Integration
                </span>
              </div>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Project Title */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Formal Project Title</label>
                <input
                  type="text"
                  required
                  value={form.project_title}
                  onChange={e => setForm({ ...form, project_title: e.target.value })}
                  placeholder="e.g. Philippine National Single Window System or Inter-Agency Data Exchange Portal"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              {/* Description & Scope */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Collaborative Description &amp; Systems Linked</label>
                <textarea
                  rows={2}
                  required
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Clearly state which government processes are being linked and how data will exchange..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed text-xs"
                />
              </div>

              {/* Objectives */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Inter-Agency Objectives (The 'Why')</label>
                <textarea
                  rows={2}
                  required
                  value={form.objectives}
                  onChange={e => setForm({ ...form, objectives: e.target.value })}
                  placeholder="Discuss specific inter-agency problem solved (e.g. eliminating redundant data submissions)..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 leading-relaxed text-xs"
                />
              </div>

              {/* Inter-Agency Leadership Mappings */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Lead Agency (Primary Accountability)</label>
                  <input
                    type="text"
                    required
                    value={form.lead_agency}
                    onChange={e => setForm({ ...form, lead_agency: e.target.value })}
                    placeholder="e.g. Department of Information and Communications Technology"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Partner / Implementing Agencies</label>
                  <input
                    type="text"
                    required
                    value={form.partner_agencies}
                    onChange={e => setForm({ ...form, partner_agencies: e.target.value })}
                    placeholder="e.g. Department of Budget and Management (DBM), Bureau of the Treasury (BTr)"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Unit, Fund & Duration */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">{agencyName} Implementing Unit</label>
                  <input
                    type="text"
                    required
                    value={form.implementing_unit}
                    onChange={e => setForm({ ...form, implementing_unit: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Financing Source</label>
                  <select
                    value={form.funding_source}
                    onChange={e => setForm({ ...form, funding_source: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="General Appropriations Act (GAA)">GAA (National Budget)</option>
                    <option value="Foreign-Assisted Projects (FAP)">FAP (Loans / Grants)</option>
                    <option value="Locally Funded">Locally Funded Special Grant</option>
                    <option value="Other Income Generating Sources">Other Income / Retained Earnings</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">Start</label>
                    <input
                      type="number"
                      required
                      value={form.duration_start_year}
                      onChange={e => setForm({ ...form, duration_start_year: parseInt(e.target.value, 10) || 2026 })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">End</label>
                    <input
                      type="number"
                      required
                      value={form.duration_end_year}
                      onChange={e => setForm({ ...form, duration_end_year: parseInt(e.target.value, 10) || 2028 })}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Strategic Alignment Checklists (Including DICT Others Specify) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  National Blueprint Strategic Alignment
                </span>
                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_egmp} onChange={e => setForm({ ...form, aligns_egmp: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>E-Government Master Plan (EGMP)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_pcb} onChange={e => setForm({ ...form, aligns_pcb: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Program Convergence Budgeting (PCB)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_ncsp} onChange={e => setForm({ ...form, aligns_ncsp: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>National Cybersecurity Plan (NCSP)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.aligns_pip} onChange={e => setForm({ ...form, aligns_pip: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Public Investment Program (PIP)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer col-span-2">
                    <input 
                      type="checkbox" 
                      checked={form.aligns_others} 
                      onChange={e => setForm({ ...form, aligns_others: e.target.checked })} 
                      className="accent-blue-600 rounded" 
                    />
                    <span>Others (Specify)</span>
                  </label>
                </div>

                {form.aligns_others && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 animate-fadeIn">
                    <label className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400">Specify Strategic Policy / Directive</label>
                    <input
                      type="text"
                      required={form.aligns_others}
                      value={form.aligns_others_specify}
                      onChange={e => setForm({ ...form, aligns_others_specify: e.target.value })}
                      placeholder="e.g. Joint Memorandum Circular No. 2026-01 on Inter-Agency Data Interoperability"
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Harmonization Framework Checklists */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  DICT Harmonization Framework Compliance
                </span>
                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_pegif} onChange={e => setForm({ ...form, harmonizes_pegif: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>PeGIF / NGDX API Interoperability</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_cross_collaboration} onChange={e => setForm({ ...form, harmonizes_cross_collaboration: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Joint Memorandum Circular (JMC) Shared</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_national_priority} onChange={e => setForm({ ...form, harmonizes_national_priority: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>National Priority / Cabinet-Level Initiative</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.harmonizes_resource_optimization} onChange={e => setForm({ ...form, harmonizes_resource_optimization: e.target.checked })} className="accent-blue-600 rounded" />
                    <span>Resource Optimization (GovNet, GovCloud)</span>
                  </label>
                </div>
              </div>

              {/* Dynamic Multi-Year Deliverables & Milestones */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">
                    Annual Project Milestones &amp; Deliverables ({modalHorizonYears.length} Years Horizon)
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
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
                      <label className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400">
                        Year {idx + 1} Deliverables ({yr})
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={form.annual_deliverables?.[String(yr)] || ""}
                        onChange={e => handleAnnualDeliverableChange(yr, idx + 1, e.target.value)}
                        placeholder={`Key collaborative deliverables, PeGIF API milestones, or shared deployment targets for FY ${yr}...`}
                        className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>
                  <strong>Financial Governance Note:</strong> In accordance with DICT ISSP Guidelines, the Total Project Cost is dynamically computed from child line items budgeted under <em>Part IV.A (Cross-Agency ICT Projects)</em>.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Persisting..." : editingId ? "Commit Project Modifications" : "Register Cross-Agency Project"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}