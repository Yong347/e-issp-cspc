// frontend/src/views/department/Systems/ProposedSystems.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getDeptSystems, 
  createProposedSystem, 
  updateProposedSystem, 
  deleteProposedSystem, 
  submitProposedSystem,
  getNeedsAssessments,
  getProjects
} from "../../../api/dept";
import { 
  Database, 
  Plus, 
  Send, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Layers, 
  Globe, 
  Lock, 
  Info, 
  X, 
  Clock, 
  Search, 
  Building, 
  CheckSquare, 
  ExternalLink, 
  Eye, 
  RotateCcw, 
  FileText, 
  Check, 
  RefreshCw, 
  Coins, 
  Users, 
  ShieldCheck, 
  ArrowRight, 
  Save, 
  HelpCircle, 
  FolderKanban, 
  Tag,
  Calendar
} from "lucide-react";

export default function ProposedSystems() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();

  // Active planning horizon years sequence (e.g. [2026, 2027, 2028])
  const activeYears = useMemo(() => {
    if (planningYears && planningYears.length > 0) return planningYears;
    if (activeCycle && activeCycle.includes("-")) {
      const parts = activeCycle.split("-");
      const start = parseInt(parts[0], 10);
      if (!isNaN(start)) {
        return [start, start + 1, start + 2];
      }
    }
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1, currentYear + 2];
  }, [planningYears, activeCycle]);

  // Core Data States
  const [systems, setSystems] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filter & Search States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All"); // All | Draft | Submitted | Approved | Returned
  const [typeFilter, setTypeFilter] = useState("All"); // All | For Development | For Enhancement

  // Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal Control States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewingSystem, setViewingSystem] = useState(null);

  // Simplified Non-Technical Form State (Department User Friendly with Project Linkage & Parity Integration)
  const initialFormState = {
    name: "",
    status: "For Development", // "For Development" (New System) | "For Enhancement" (Upgrade)
    proposed_cost: "",
    target_year: "",
    uacs_object_code: "50604070 01 - ICT Software (Perpetual CO)",
    expenditure_class: "Capital Outlay",
    needs_assessment_id: "",
    project_id: "", // Direct Major ICT Project linkage (Part III.E)
    description_and_purpose: "",
    enhancement_details: "",
    is_client_facing: true,
    hosting_mode: "Online", // Online | On-premise | Hybrid
    online_url: "",
    internal_users: "",
    external_users: ""
  };
  const [form, setForm] = useState(initialFormState);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (viewingSystem) setViewingSystem(null);
        if (isModalOpen) setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewingSystem, isModalOpen]);

  // Load Department Systems, Section 8.0 Needs Assessments, and Major ICT Projects
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sysData, naData, projData] = await Promise.all([
        getDeptSystems().catch(() => []),
        getNeedsAssessments().catch(() => []),
        getProjects().catch(() => [])
      ]);
      setSystems(Array.isArray(sysData) ? sysData : []);
      setNeedsAssessments(Array.isArray(naData) ? naData : []);
      setProjects(Array.isArray(projData) ? projData : []);
    } catch (err) {
      setError(err.message || "Network error loading proposed systems registry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, activeCycle]);

  // Handle direct navigation pre-fill from Section 8.0 Needs Assessment view or ICT Project Portfolio
  useEffect(() => {
    if (location.state?.prefillNeedsAssessment) {
      const na = location.state.prefillNeedsAssessment;
      setEditingId(null);
      setForm({
        ...initialFormState,
        target_year: activeYears[0] || 2026,
        needs_assessment_id: String(na.id),
        name: na.title || "",
        description_and_purpose: `[Addressing Department Operational Need]: ${na.current_problem}\n\nProposed Solution: ${na.proposed_solution}`,
        internal_users: user?.department_name || "Department Staff"
      });
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    } else if (location.state?.prefillProjectId) {
      const pid = location.state.prefillProjectId;
      setEditingId(null);
      setForm({
        ...initialFormState,
        target_year: activeYears[0] || 2026,
        project_id: String(pid),
        internal_users: user?.department_name || "Department Staff"
      });
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, user, activeYears]);

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setForm({
      ...initialFormState,
      target_year: activeYears[0] || 2026,
      internal_users: user?.department_name || "Department Personnel"
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sys) => {
    setEditingId(sys.id);
    const hostingType = sys.frontline_hosting_type?.value || sys.frontline_hosting_type || sys.hosting_type?.value || sys.hosting_type || "Online";

    setForm({
      name: sys.name || "",
      status: sys.status?.value || sys.status || "For Development",
      proposed_cost: sys.proposed_cost !== undefined ? String(sys.proposed_cost) : "",
      target_year: sys.target_year || activeYears[0] || 2026,
      uacs_object_code: sys.uacs_object_code || "50604070 01 - ICT Software (Perpetual CO)",
      expenditure_class: sys.expenditure_class || "Capital Outlay",
      needs_assessment_id: sys.needs_assessment_id ? String(sys.needs_assessment_id) : "",
      project_id: sys.project_id ? String(sys.project_id) : "",
      description_and_purpose: sys.description_and_purpose || "",
      enhancement_details: sys.enhancement_details || "",
      is_client_facing: sys.is_client_facing !== undefined ? Boolean(sys.is_client_facing) : true,
      hosting_mode: hostingType,
      online_url: sys.online_url || "",
      internal_users: sys.internal_users || user?.department_name || "Department Personnel",
      external_users: sys.external_users || ""
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  // Automatically classify UACS Object Code & Class on cost change
  const handleCostChange = (val) => {
    const costNum = parseFloat(val) || 0;
    setForm(prev => {
      let code = prev.uacs_object_code;
      let expClass = prev.expenditure_class;
      if (costNum >= 50000) {
        code = "50604070 01 - ICT Software (Perpetual CO)";
        expClass = "Capital Outlay";
      } else {
        code = "50211030 00 - Consulting/Outsourced Development (MOOE)";
        expClass = "Maintenance and Other Operating Expenses";
      }
      return {
        ...prev,
        proposed_cost: val,
        uacs_object_code: code,
        expenditure_class: expClass
      };
    });
  };

  // Pre-fill fields when selecting a Section 8.0 Needs Assessment
  const handleNeedsAssessmentSelect = (e) => {
    const selectedId = e.target.value;
    setForm(prev => ({ ...prev, needs_assessment_id: selectedId }));

    if (selectedId) {
      const matched = needsAssessments.find(n => String(n.id) === String(selectedId));
      if (matched) {
        setForm(prev => ({
          ...prev,
          needs_assessment_id: selectedId,
          name: prev.name || matched.title || "",
          description_and_purpose: prev.description_and_purpose || `[Addressing Department Operational Need]: ${matched.current_problem}\n\nProposed Solution: ${matched.proposed_solution}`
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("Please provide a name or title for the proposed system.");
      return;
    }

    const costNum = parseFloat(form.proposed_cost);
    if (isNaN(costNum) || costNum <= 0) {
      setError("Mandatory Requirement: Please enter a valid estimated budget outlay greater than ₱0.00 for this system proposal.");
      return;
    }

    if (!form.description_and_purpose.trim()) {
      setError("Please describe the operational problem or purpose of this system.");
      return;
    }

    if (form.status === "For Enhancement" && !form.enhancement_details.trim()) {
      setError("Please describe what specific features or modules need to be upgraded.");
      return;
    }

    setSubmitting(true);

    // Prepare clean payload with architectural and accounting defaults and direct ICT Project linkage
    const payload = {
      name: form.name.trim(),
      status: form.status,
      proposed_cost: costNum,
      target_year: form.target_year ? parseInt(form.target_year, 10) : activeYears[0],
      uacs_object_code: form.uacs_object_code || "50604070 01 - ICT Software (Perpetual CO)",
      expenditure_class: form.expenditure_class || (form.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "Maintenance and Other Operating Expenses"),
      needs_assessment_id: form.needs_assessment_id || null,
      project_id: form.project_id || null,
      is_client_facing: form.is_client_facing,
      is_frontline_service: form.is_client_facing,
      frontline_hosting_type: form.hosting_mode,
      online_url: form.hosting_mode !== "On-premise" && form.online_url.trim() ? form.online_url.trim() : null,
      description_and_purpose: form.description_and_purpose.trim(),
      enhancement_details: form.status === "For Enhancement" ? form.enhancement_details.trim() : null,
      internal_users: form.internal_users.trim() || user?.department_name || "Department Staff",
      external_users: form.is_client_facing 
        ? (form.external_users.trim() || "Students / General Citizens / Public") 
        : "Internal Personnel Only",
      // Safe defaults for technical fields configured later by MIS Admin
      development_strategy: "Outsourced",
      development_platform: "Institutional Web Framework",
      database_name: `${form.name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 25)}_db`,
      data_storage_type: "GovCloud / On-premise Storage"
    };

    try {
      if (editingId) {
        await updateProposedSystem(editingId, payload);
        setSuccess(`System proposal '${form.name}' updated successfully.`);
      } else {
        await createProposedSystem(payload);
        setSuccess(`System proposal '${form.name}' drafted successfully in the Information Systems Registry.`);
      }

      setIsModalOpen(false);
      setEditingId(null);
      loadData();
    } catch (err) {
      setError(err.message || "Failed to submit proposed system.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitToAdmin = async (id, name) => {
    if (!window.confirm(`Submit proposed system '${name}' to the MIS Administrator for architecture assignment and project portfolio approval?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await submitProposedSystem(id);
      setSuccess(`System proposal '${name}' submitted to the MIS Information Systems Review Queue.`);
      loadData();
    } catch (err) {
      setError(err.message || "Submission failed.");
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Permanently delete proposed system draft '${name}'?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProposedSystem(id);
      setSuccess(`System proposal '${name}' deleted.`);
      loadData();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  // Macro Summary Statistics
  const totalCount = systems.length;
  const draftCount = systems.filter(s => (s.submission_status || "Draft").toLowerCase() === "draft").length;
  const inReviewCount = systems.filter(s => (s.submission_status || "").toLowerCase() === "submitted").length;
  const approvedCount = systems.filter(s => (s.submission_status || "").toLowerCase() === "approved").length;
  const returnedCount = systems.filter(s => (s.submission_status || "").toLowerCase() === "returned").length;
  const totalProposedBudget = useMemo(() => {
    return systems.reduce((sum, s) => sum + (parseFloat(s.proposed_cost) || 0), 0);
  }, [systems]);

  // Filtered Systems List
  const filteredSystems = useMemo(() => {
    return systems.filter(sys => {
      const subStatus = (sys.submission_status || "Draft").toLowerCase();
      if (statusFilter !== "All" && subStatus !== statusFilter.toLowerCase()) return false;

      const devStatus = (sys.status?.value || sys.status || "").toLowerCase();
      if (typeFilter !== "All" && !devStatus.includes(typeFilter.toLowerCase().replace("for ", ""))) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      return (
        (sys.name || "").toLowerCase().includes(q) ||
        (sys.description_and_purpose || "").toLowerCase().includes(q)
      );
    });
  }, [systems, statusFilter, typeFilter, searchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Propose an Information System (Part III.D)</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Propose a new software application or platform upgrade for <strong>{user?.department_name || "your department"}</strong>. Simply explain the operational problem, enter your estimated budget outlay, choose your Target Fiscal Year, and link its parent Major ICT Project. The MIS Office handles technical stacks, security audits, and formal compilation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer font-bold shadow-xs text-xs"
            title="Refresh Systems"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Propose a System</span>
          </button>
        </div>
      </div>

      {/* Conceptual Scope Clarification Banner: Enterprise Systems vs Commodity COTS Software Licenses */}
      <div className="p-4 bg-blue-50/70 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-2xl text-[11px] text-blue-950 dark:text-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs leading-relaxed animate-fadeIn">
        <div className="flex items-start gap-2.5">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-blue-900 dark:text-blue-300 block text-xs uppercase tracking-wide font-mono">
              Statutory Scope: Enterprise Information Systems (Part III.D) vs. Commodity Licenses (Part IV.A)
            </span>
            <p>
              Use this workspace to propose <strong>enterprise software platforms</strong> that automate an institutional operational workflow (e.g. Student Portals, Clinic Electronic Health Records, HRMIS, Payroll, Cashiering Gateways).
              If your department simply needs packaged <strong>Commercial Off-The-Shelf (COTS) software seat licenses</strong> (e.g. AutoCAD, SPSS, Adobe Creative Cloud, MATLAB, Windows OS CALs), propose them under <Link to="/dept/proposals" className="text-blue-600 dark:text-blue-400 font-bold underline">Part IV.A Resource Proposals</Link>.
            </p>
          </div>
        </div>

        <Link
          to="/dept/proposals"
          className="px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs whitespace-nowrap self-end sm:self-auto"
        >
          <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
          <span>COTS Licenses (Part IV.A)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Aggregate KPI Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Proposals</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalCount} Systems</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl shrink-0">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Draft Mode</span>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 font-mono mt-0.5">{draftCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Under MIS Review</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{inReviewCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Approved &amp; Mapped</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{approvedCount}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Requested Budget</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {formatPHP(totalProposedBudget)}
            </h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <span className="font-semibold whitespace-pre-wrap leading-relaxed">{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 text-[10px]">
            {[
              { id: "All", label: `All Proposals (${systems.length})` },
              { id: "Draft", label: `Draft (${draftCount})` },
              { id: "Submitted", label: `In Review (${inReviewCount})` },
              { id: "Approved", label: `Approved (${approvedCount})` },
              { id: "Returned", label: `Returned (${returnedCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 text-[10px]">
            {["All", "For Development", "For Enhancement"].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  typeFilter === t
                    ? "bg-purple-600 text-white shadow-xs" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {t === "All" ? "All Types" : t.replace("For ", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search system title, problem..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Systems Directory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && systems.length === 0 ? (
          <div className="col-span-2 text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2 shadow-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading proposed systems...</span>
          </div>
        ) : filteredSystems.length > 0 ? (
          filteredSystems.map((sys) => {
            const statusLabel = sys.status?.value || sys.status || "For Development";
            const subStatus = (sys.submission_status || "Draft");
            const isClientFacing = sys.is_client_facing !== undefined ? Boolean(sys.is_client_facing) : true;
            const hostingType = sys.frontline_hosting_type?.value || sys.frontline_hosting_type || sys.hosting_type?.value || sys.hosting_type || "Online";
            const costVal = parseFloat(sys.proposed_cost) || 0.0;
            const linkedNeeds = needsAssessments.find(n => String(n.id) === String(sys.needs_assessment_id));
            const linkedProject = projects.find(p => String(p.id) === String(sys.project_id)) || (sys.project_title ? { project_title: sys.project_title } : null);

            return (
              <div 
                key={sys.id}
                className={`p-6 rounded-2xl border bg-white dark:bg-slate-900 transition-all space-y-4 shadow-xs flex flex-col justify-between ${
                  subStatus.toLowerCase() === "returned"
                    ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/20"
                    : subStatus.toLowerCase() === "submitted"
                    ? "border-blue-300 dark:border-blue-900/60"
                    : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="space-y-3">
                  {/* Top Card Bar */}
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${
                          statusLabel === "For Enhancement"
                            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                            : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                        }`}>
                          {statusLabel === "For Enhancement" ? "Upgrade / Enhancement" : "New Software System"}
                        </span>

                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono border ${
                          subStatus.toLowerCase() === "approved"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : subStatus.toLowerCase() === "submitted"
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300"
                            : subStatus.toLowerCase() === "returned"
                            ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400"
                            : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {subStatus.toLowerCase() === "submitted" ? "Under MIS Review" : subStatus}
                        </span>

                        {linkedNeeds && (
                          <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 text-[9px] font-mono font-bold flex items-center gap-1">
                            <CheckSquare className="w-3 h-3" /> Needs Linked
                          </span>
                        )}

                        {linkedProject && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 text-[9px] font-mono font-bold flex items-center gap-1">
                            <FolderKanban className="w-3 h-3" /> {linkedProject.project_title.slice(0, 18)}...
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1 flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{sys.name}</span>
                      </h3>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setViewingSystem(sys)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                        title="View Full Specification Card"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {(subStatus.toLowerCase() === "draft" || subStatus.toLowerCase() === "returned") && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(sys)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 cursor-pointer"
                            title="Edit Proposal Details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(sys.id, sys.name)}
                            className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-955/40 rounded-lg text-slate-500 cursor-pointer"
                            title="Delete Proposal Draft"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Rejection / Return Instructions Callout */}
                  {subStatus.toLowerCase() === "returned" && sys.rejection_reason && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-1 text-rose-800 dark:text-rose-300 animate-fadeIn">
                      <strong className="block text-[10px] uppercase font-bold flex items-center gap-1 font-mono">
                        <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                        <span>Revisions Requested by MIS Administrator:</span>
                      </strong>
                      <p className="text-[11px] leading-relaxed italic whitespace-pre-wrap">
                        "{sys.rejection_reason}"
                      </p>
                    </div>
                  )}

                  {/* Estimated Cost Badge */}
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl flex items-center justify-between font-mono">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Estimated Budget Outlay:</span>
                    </span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                      {formatPHP(costVal)}
                    </span>
                  </div>

                  {/* Target Year & UACS Accounting Badge Row */}
                  <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                    <div className="p-2.5 bg-blue-50/50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-0.5">
                      <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Target Fiscal Year</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        FY {sys.target_year || activeYears[0]}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-0.5">
                      <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-emerald-600" />
                        <span>Accounting Class</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white truncate block" title={sys.uacs_object_code || "Capital Outlay"}>
                        {sys.expenditure_class || (sys.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "MOOE")}
                      </span>
                    </div>
                  </div>

                  {/* Parent Major ICT Project Linkage Display */}
                  {linkedProject && (
                    <div className="p-2.5 bg-purple-50/50 dark:bg-purple-955/20 border border-purple-200 dark:border-purple-900/50 rounded-xl flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-purple-900 dark:text-purple-300 truncate">
                        <FolderKanban className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span className="truncate">Linked Project: <strong>{linkedProject.project_title}</strong></span>
                      </div>
                      <span className="text-[9.5px] text-purple-700 dark:text-purple-400 font-mono font-bold shrink-0">Part III.E Major Project</span>
                    </div>
                  )}

                  {/* Section 8.0 Needs Linkage Display */}
                  {linkedNeeds && (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 text-[11px]">
                      <span className="text-slate-400 dark:text-slate-500 uppercase text-[9px] font-bold font-mono block">
                        Section 8.0 Needs Assessment Provenance:
                      </span>
                      <strong className="text-slate-800 dark:text-slate-200 block truncate" title={linkedNeeds.title}>
                        {linkedNeeds.title} [{linkedNeeds.mfo_alignment}]
                      </strong>
                      <p className="text-slate-500 dark:text-slate-400 italic text-[10.5px] line-clamp-2">
                        "{linkedNeeds.current_problem}"
                      </p>
                    </div>
                  )}

                  {/* Operational Problem & Purpose */}
                  <div className="space-y-1">
                    <span className="text-slate-400 dark:text-slate-500 uppercase text-[9px] font-bold font-mono block">
                      Operational Problem &amp; Functionality:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs line-clamp-3">
                      {sys.description_and_purpose}
                    </p>
                  </div>

                  {/* Enhancement Details if applicable */}
                  {statusLabel === "For Enhancement" && sys.enhancement_details && (
                    <div className="p-3 bg-amber-50/50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900/50 rounded-xl space-y-0.5">
                      <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                        <Sparkles className="w-3 h-3" />
                        <span>Planned Upgrades:</span>
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 text-[10.5px] line-clamp-2">
                        {sys.enhancement_details}
                      </p>
                    </div>
                  )}

                  {/* User Profile & Access Mode Badges */}
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-slate-400 dark:text-slate-500 uppercase text-[8px] font-bold block">Primary Target Users</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold block truncate">
                        {isClientFacing ? "Public Citizens / Clients" : "Internal Staff Only"}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-slate-400 dark:text-slate-500 uppercase text-[8px] font-bold block">Access Mode</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold block truncate">
                        {hostingType === "Online" ? "Online Web Portal" : hostingType}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Strip with Action Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 dark:text-slate-500 font-mono">
                    ID: #{sys.id.slice(0, 8)}
                  </span>

                  <div>
                    {subStatus.toLowerCase() === "draft" || subStatus.toLowerCase() === "returned" ? (
                      <button
                        type="button"
                        onClick={() => handleSubmitToAdmin(sys.id, sys.name)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit to MIS Registry</span>
                      </button>
                    ) : subStatus.toLowerCase() === "submitted" ? (
                      <span className="font-mono text-slate-400 dark:text-slate-500 italic flex items-center gap-1 font-semibold">
                        <Clock className="w-3 h-3" /> Awaiting MIS Review
                      </span>
                    ) : (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Approved in Part III.D
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-2 text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 dark:text-slate-500 italic shadow-xs">
            No proposed systems found for your active filter. Click "Propose a System" to draft a new software request.
          </div>
        )}
      </div>

      {/* USER-FRIENDLY SYSTEM INTAKE MODAL (NO JARGON WITH PROJECT LINKAGE & PARITY INTEGRATION) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{editingId ? "Update System Proposal" : "Propose a New Information System or Upgrade"}</span>
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Simplified Department Intake Form &bull; Non-Technical Workflow
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              {/* Step 1: System Title & Lifecycle Target */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                    1. Information System Name (Enterprise Platform)
                  </label>
                  <span className="text-[9.5px] text-blue-600 dark:text-blue-400 font-mono">Part III.D Platform</span>
                </div>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Student Health Record Management & Clinical Portal, Online Document Tracking System..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
                />
                <span className="text-[9.5px] text-slate-400 dark:text-slate-500 italic block">
                  *For commodity packaged licenses (e.g. AutoCAD, Adobe CC), use the Resource Proposals ledger instead.
                </span>
              </div>

              {/* Proposal Type Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  2. Proposal Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: "For Development" })}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                      form.status === "For Development"
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-slate-700"
                    }`}
                  >
                    New Software System (For Development)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, status: "For Enhancement" })}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                      form.status === "For Enhancement"
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-purple-400 dark:hover:border-slate-700"
                    }`}
                  >
                    System Upgrade (For Enhancement)
                  </button>
                </div>
              </div>

              {/* Step 3: Link to Parent Major ICT Project (Part III.E) */}
              <div className="space-y-1.5 p-3.5 bg-purple-50/50 dark:bg-purple-955/20 border border-purple-200 dark:border-purple-900/40 rounded-xl">
                <label className="text-[10px] uppercase font-bold text-purple-900 dark:text-purple-300 tracking-wider flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>3. Target Major ICT Project (Part III.E Portfolio)</span>
                  </span>
                  <span className="text-[9px] text-purple-600 dark:text-purple-400 font-bold">Project Bridge</span>
                </label>
                <select
                  value={form.project_id}
                  onChange={e => setForm({ ...form, project_id: e.target.value })}
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs font-semibold"
                >
                  <option value="">-- Standalone (No project assigned / MIS Admin will link) --</option>
                  {projects.map(p => (
                    <option key={p.id} value={String(p.id)}>
                      [{p.project_category?.includes("Cross-Agency") ? "Cross-Agency" : "Internal"}] {p.project_title}
                    </option>
                  ))}
                </select>
                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block pt-0.5">
                  Under DICT guidelines, enterprise systems in Part III.D are implemented via an ICT Project Charter (Part III.E). Selecting a project ensures the system's estimated budget aggregates into the project's capital outlay without injecting duplicate proposal line items.
                </span>
              </div>

              {/* Step 4: 1-Click Link to Section 8.0 Needs Assessment */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1 font-mono">
                    <CheckSquare className="w-3.5 h-3.5 text-teal-600" />
                    <span>4. Link to Department Needs Assessment (Section 8.0)</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Recommended &bull; Pre-fills Problem</span>
                </label>
                <select
                  value={form.needs_assessment_id}
                  onChange={handleNeedsAssessmentSelect}
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
                >
                  <option value="">-- None / Custom Problem Statement --</option>
                  {needsAssessments.map(n => (
                    <option key={n.id} value={n.id}>
                      [{n.mfo_alignment}] {n.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 5: Operational Problem it Solves */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  5. Operational Problem &amp; Business Process it Automates
                </label>
                <textarea
                  rows={3}
                  required
                  value={form.description_and_purpose}
                  onChange={e => setForm({ ...form, description_and_purpose: e.target.value })}
                  placeholder="Explain why your department needs this software. What operational bottleneck, paper processing backlog, or service delay will this resolve?"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none text-xs outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              {/* If Upgrade / Enhancement: Specific New Modules */}
              {form.status === "For Enhancement" && (
                <div className="space-y-1 p-3.5 bg-purple-50/50 dark:bg-purple-955/20 border border-purple-200 dark:border-purple-900/40 rounded-xl animate-fadeIn">
                  <label className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300 flex items-center justify-between">
                    <span className="flex items-center gap-1 font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Planned Upgrades &amp; New Features</span>
                    </span>
                    <span className="text-[9px] text-rose-500 font-bold">*Required for Upgrade</span>
                  </label>
                  <textarea
                    rows={2}
                    required={form.status === "For Enhancement"}
                    value={form.enhancement_details}
                    onChange={e => setForm({ ...form, enhancement_details: e.target.value })}
                    placeholder="Specify the new features or modules you need added to the existing platform..."
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-lg text-slate-900 dark:text-white resize-none text-xs outline-none"
                  />
                </div>
              )}

              {/* Step 6: Estimated Budget Outlay (Mandatory) */}
              <div className="space-y-1 p-3.5 bg-emerald-50/50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl">
                <label className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-emerald-600" />
                    <span>6. Estimated Total Budget / Proposed Cost (PHP ₱)</span>
                  </span>
                  <span className="text-[9px] text-rose-500 font-bold">*Mandatory</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.proposed_cost}
                  onChange={e => handleCostChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-sm outline-none focus:border-emerald-500"
                />
                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block pt-0.5">
                  Approving this system automatically registers the corresponding budget line item in Part IV.A and binds it into the strategic ICT project outlay.
                </span>
              </div>

              {/* Step 7: Target Implementation Year (Strictly bounded to active cycle years) */}
              <div className="space-y-1 p-3.5 bg-blue-50/50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-xl">
                <label className="text-[10px] uppercase font-bold text-blue-900 dark:text-blue-300 tracking-wider flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>7. Target Implementation / Deployment Fiscal Year</span>
                  </span>
                  <span className="text-[9px] text-rose-500 font-bold">*Required for 4-Way Parity</span>
                </label>
                <select
                  value={form.target_year || activeYears[0]}
                  onChange={e => setForm({ ...form, target_year: parseInt(e.target.value, 10) })}
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs font-bold font-mono"
                >
                  {activeYears.map(yr => (
                    <option key={yr} value={yr}>FY {yr} (Active Planning Horizon)</option>
                  ))}
                </select>
                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block pt-0.5">
                  Dictates which fiscal year column in Part IV.A and Part IV.B (Tables B.1–B.4) will receive this development outlay in the compiled PDF/Word document.
                </span>
              </div>

              {/* Step 8: UACS Object Code & Class */}
              <div className="space-y-1 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>8. UACS Object Code (Table B.4 Classification)</span>
                  </span>
                  <span className="text-[9px] text-slate-400">DBM Classification</span>
                </label>
                <select
                  value={form.uacs_object_code}
                  onChange={e => {
                    const code = e.target.value;
                    const isCO = code.includes("(CO)");
                    setForm({
                      ...form,
                      uacs_object_code: code,
                      expenditure_class: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses"
                    });
                  }}
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs font-mono font-semibold"
                >
                  <option value="50604070 01 - ICT Software (Perpetual CO)">50604070 01 - ICT Software (Perpetual CO) [Capital Outlay]</option>
                  <option value="50211030 00 - Consulting/Outsourced Development (MOOE)">50211030 00 - Consulting/Outsourced Development (MOOE) [MOOE]</option>
                  <option value="50299070 00 - ICT Software Subscription (MOOE)">50299070 00 - ICT Software Subscription (MOOE) [MOOE]</option>
                  <option value="50604050 03 - ICT Equipment (CO)">50604050 03 - ICT Equipment (CO) [Capital Outlay]</option>
                </select>
                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block pt-0.5">
                  Current Expenditure Class: <strong className="text-blue-600 font-bold">{form.expenditure_class}</strong>
                </span>
              </div>

              {/* Step 9: Target Users (Simple Profile) */}
              <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
                  9. Primary Users Profile
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_client_facing}
                      onChange={e => setForm({ ...form, is_client_facing: e.target.checked })}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">Public / Client Facing</span>
                      <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block">Used directly by citizens, students, or external clients</span>
                    </div>
                  </label>

                  <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">Internal Department Staff</span>
                      <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block">{user?.department_name || "Department Personnel"}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <input
                    type="text"
                    value={form.internal_users}
                    onChange={e => setForm({ ...form, internal_users: e.target.value })}
                    placeholder="Internal Users (e.g. Planning Officers, Clinicians)"
                    className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    disabled={!form.is_client_facing}
                    value={form.external_users}
                    onChange={e => setForm({ ...form, external_users: e.target.value })}
                    placeholder="External Users (e.g. Students, Citizens, Applicants)"
                    className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Step 10: Access Mode (Simple Web vs On-Premise) */}
              <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
                  10. Access Mode &amp; Deployment
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "Online", label: "Online Web Portal / Mobile" },
                    { id: "On-premise", label: "Office Network (On-Premise)" },
                    { id: "Hybrid", label: "Hybrid Access" }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setForm({ ...form, hosting_mode: mode.id })}
                      className={`p-2 rounded-lg font-bold border transition-all cursor-pointer text-center text-xs ${
                        form.hosting_mode === mode.id
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-slate-700"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {form.hosting_mode !== "On-premise" && (
                  <div className="space-y-1 pt-1 animate-fadeIn">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400">
                      Target Web Portal Address (Optional)
                    </label>
                    <input
                      type="url"
                      value={form.online_url}
                      onChange={e => setForm({ ...form, online_url: e.target.value })}
                      placeholder="https://services.agency.gov.ph (if already registered)"
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg font-mono text-blue-600 dark:text-blue-400 text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Info Note: Administrative Handling Guarantee */}
              <div className="p-3 bg-blue-50/60 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10px] text-blue-900 dark:text-blue-300 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <span>
                  <strong>MIS Office Review Guarantee:</strong> You do not need to specify technical frameworks, database engines, or security audit dates. The MIS Administrator will assign the technical architecture stack, conduct privacy impact assessments, and verify project portfolio linkages upon review.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Saving..." : editingId ? "Save Proposal Changes" : "Save System Proposal Draft"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SYSTEM SPECIFICATION CARD */}
      {viewingSystem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[9px] font-mono text-blue-600 dark:text-blue-400 uppercase font-bold">
                  Proposed System Specification Summary
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mt-0.5">{viewingSystem.name}</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingSystem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between font-mono">
                <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">
                  Estimated Development Outlay:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                  {formatPHP(viewingSystem.proposed_cost)}
                </span>
              </div>

              {/* Target Year & UACS Display in Detail Modal */}
              <div className="grid grid-cols-2 gap-2.5 font-mono text-[10px]">
                <div className="p-2.5 bg-blue-50/50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-0.5">
                  <span className="text-[8.5px] uppercase font-bold text-blue-600 dark:text-blue-400">Target Implementation Year</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">FY {viewingSystem.target_year || activeYears[0]}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-0.5">
                  <span className="text-[8.5px] uppercase font-bold text-slate-500 dark:text-slate-400">Expenditure Class</span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs truncate block" title={viewingSystem.uacs_object_code}>
                    {viewingSystem.expenditure_class || (viewingSystem.uacs_object_code?.includes("(CO)") ? "Capital Outlay" : "MOOE")}
                  </span>
                </div>
              </div>

              {/* Linked ICT Project in Detail Modal */}
              {(projects.find(p => String(p.id) === String(viewingSystem.project_id)) || viewingSystem.project_title) && (
                <div className="p-3 bg-purple-50 dark:bg-purple-955/30 border border-purple-200 dark:border-purple-900/50 rounded-xl space-y-0.5">
                  <span className="text-[9.5px] uppercase font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 font-mono">
                    <FolderKanban className="w-3.5 h-3.5" />
                    <span>Linked Major ICT Project (Part III.E):</span>
                  </span>
                  <div className="font-semibold text-purple-900 dark:text-purple-200 text-xs">
                    {projects.find(p => String(p.id) === String(viewingSystem.project_id))?.project_title || viewingSystem.project_title}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[9.5px] uppercase font-bold text-slate-400 dark:text-slate-500 block font-mono">
                  Operational Purpose &amp; Problem Solved
                </span>
                <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800 leading-relaxed whitespace-pre-wrap">
                  {viewingSystem.description_and_purpose}
                </p>
              </div>

              {viewingSystem.enhancement_details && (
                <div className="space-y-1">
                  <span className="text-[9.5px] uppercase font-bold text-amber-600 dark:text-amber-400 block font-mono">
                    Planned Enhancements
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 bg-amber-50/40 dark:bg-amber-955/20 p-3 rounded-xl border border-amber-200 dark:border-amber-900 leading-relaxed whitespace-pre-wrap">
                    {viewingSystem.enhancement_details}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 font-mono text-[10px]">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block text-[8.5px] uppercase font-bold">Lifecycle Target</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{viewingSystem.status?.value || viewingSystem.status}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block text-[8.5px] uppercase font-bold">Access Deployment</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{viewingSystem.frontline_hosting_type?.value || viewingSystem.frontline_hosting_type || viewingSystem.hosting_type?.value || viewingSystem.hosting_type || "Online"}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setViewingSystem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}