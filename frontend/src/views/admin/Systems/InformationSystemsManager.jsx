// frontend/src/views/admin/Systems/InformationSystemsManager.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Database, 
  Server, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  Search, 
  ShieldAlert, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  Lock, 
  Share2,
  Cpu,
  Layers,
  Globe,
  Info,
  Sparkles
} from "lucide-react";

export default function InformationSystemsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Data States
  const [systems, setSystems] = useState([]);
  const [strategicConcerns, setStrategicConcerns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Filter & Search States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusTab, setStatusTab] = useState("All"); // All, Operational, For Development, For Enhancement

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State (Aligned with DICT v.2026 specs including enhancement_details)
  const initialFormState = {
    strategic_concern_id: "",
    name: "",
    status: "Operational",
    classification: "Operations - Frontline Service",
    hosting_type: "Hybrid",
    online_url: "",
    description_and_purpose: "",
    enhancement_details: "",
    development_strategy: "Outsourced",
    development_platform: "",
    database_name: "",
    data_storage_type: "",
    internal_users: "",
    external_users: "",
    system_owner_office: "",
    is_integrated_with_others: false,
    internal_integrated_systems: "",
    external_integrated_systems: "",
    generates_data_for_others: false,
    processes_data_from_others: false,
    is_deployed_on_shared_platform: false,
    processes_personal_information: false,
    has_undergone_pia: false
  };
  const [form, setForm] = useState(initialFormState);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const fetchSystems = async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/information-systems?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load information systems registry.");
      }
      const data = await res.json();
      setSystems(Array.isArray(data) ? data : []);

      // Fetch strategic concerns for root problem provenance dropdown
      const concernsRes = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/concerns`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (concernsRes.ok) {
        const cData = await concernsRes.json();
        setStrategicConcerns(Array.isArray(cData) ? cData : []);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch systems.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystems();
  }, [token, activeCycle]);

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setForm(initialFormState);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sys) => {
    setEditingId(sys.id);
    setForm({
      strategic_concern_id: sys.strategic_concern_id || "",
      name: sys.name || "",
      status: sys.status?.value || sys.status || "Operational",
      classification: sys.classification?.value || sys.classification || "Operations - Frontline Service",
      hosting_type: sys.hosting_type?.value || sys.hosting_type || "Hybrid",
      online_url: sys.online_url || "",
      description_and_purpose: sys.description_and_purpose || "",
      enhancement_details: sys.enhancement_details || "",
      development_strategy: sys.development_strategy?.value || sys.development_strategy || "Outsourced",
      development_platform: sys.development_platform || "",
      database_name: sys.database_name || "",
      data_storage_type: sys.data_storage_type || "",
      internal_users: sys.internal_users || "",
      external_users: sys.external_users || "",
      system_owner_office: sys.system_owner_office || "",
      is_integrated_with_others: Boolean(sys.is_integrated_with_others),
      internal_integrated_systems: sys.internal_integrated_systems || "",
      external_integrated_systems: sys.external_integrated_systems || "",
      generates_data_for_others: Boolean(sys.generates_data_for_others),
      processes_data_from_others: Boolean(sys.processes_data_from_others),
      is_deployed_on_shared_platform: Boolean(sys.is_deployed_on_shared_platform),
      processes_personal_information: Boolean(sys.processes_personal_information),
      has_undergone_pia: Boolean(sys.has_undergone_pia)
    });
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim()) {
      setError("System name is required.");
      return;
    }

    if (!form.description_and_purpose.trim()) {
      setError("System description and purpose is required.");
      return;
    }

    if (form.status === "For Enhancement" && !form.enhancement_details?.trim()) {
      setError("DICT Guidelines Notice (Page 13): Please specify the enhancement details when status is set to 'For Enhancement'.");
      return;
    }

    setSubmitting(true);
    const payload = {
      ...form,
      name: form.name.trim(),
      description_and_purpose: form.description_and_purpose.trim(),
      enhancement_details: form.status === "For Enhancement" ? (form.enhancement_details?.trim() || null) : null,
      strategic_concern_id: form.strategic_concern_id || null,
      online_url: form.online_url?.trim() || null,
      development_platform: form.development_platform.trim(),
      database_name: form.database_name.trim(),
      data_storage_type: form.data_storage_type.trim(),
      internal_users: form.internal_users.trim(),
      external_users: form.external_users.trim(),
      system_owner_office: form.system_owner_office.trim(),
      internal_integrated_systems: form.internal_integrated_systems?.trim() || null,
      external_integrated_systems: form.external_integrated_systems?.trim() || null
    };

    try {
      const endpoint = editingId 
        ? `${apiUrl}/api/admin/information-systems/${encodeURIComponent(editingId)}`
        : `${apiUrl}/api/admin/information-systems`;
      
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
        if (Array.isArray(detailMsg)) {
          detailMsg = detailMsg.map(d => `${d.loc ? d.loc.filter(p => p !== "body").join(" -> ") + ": " : ""}${d.msg}`).join(" | ");
        } else if (typeof detailMsg === "object" && detailMsg !== null) {
          detailMsg = JSON.stringify(detailMsg);
        }
        throw new Error(detailMsg || "Failed to persist information system specifications.");
      }

      setSuccess(`Information System '${form.name}' saved successfully.`);
      setIsModalOpen(false);
      fetchSystems();
    } catch (err) {
      setError(err.message || "Failed to save system.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Permanently delete Information System '${name}'? This will disconnect any linked BIA records and ICT projects.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/information-systems/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete system.");
      }
      setSuccess(`System '${name}' removed from registry.`);
      fetchSystems();
    } catch (err) {
      setError(err.message || "Failed to delete system.");
    }
  };

  // Summary Metrics Breakdown
  const operationalCount = systems.filter(s => (s.status?.value || s.status) === "Operational").length;
  const proposedCount = systems.filter(s => (s.status?.value || s.status) !== "Operational").length;
  const pendingPiaCount = systems.filter(s => s.processes_personal_information && !s.has_undergone_pia).length;
  const frontlineCount = systems.filter(s => (s.classification?.value || s.classification || "").includes("Frontline Service")).length;

  // Filtered Systems List
  const filteredSystems = useMemo(() => {
    return systems.filter(s => {
      const sStatus = s.status?.value || s.status || "";
      const matchesTab = statusTab === "All" || sStatus === statusTab;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = q === "" || 
        (s.name || "").toLowerCase().includes(q) ||
        (s.system_owner_office || "").toLowerCase().includes(q) ||
        (s.development_platform || "").toLowerCase().includes(q) ||
        (s.database_name || "").toLowerCase().includes(q) ||
        (s.description_and_purpose || "").toLowerCase().includes(q);
      return matchesTab && matchesSearch;
    });
  }, [systems, statusTab, searchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans">
      
      {/* Header Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Information Systems Register (Parts II.C &amp; III.D)</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Single-source inventory for existing operational systems (Part II.C) and proposed development/enhancement platforms (Part III.D). Enforces Data Privacy Act (PIA) auditing, PeGIF interoperability, and strategic concern linkage.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={fetchSystems}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh systems register"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Register System</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Operational (Part II.C)</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{operationalCount} Systems</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Proposed (Part III.D)</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{proposedCount} Systems</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Frontline Services</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{frontlineCount} Portals</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Uncompleted PIAs</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${pendingPiaCount > 0 ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-slate-900 dark:text-white"}`}>
              {pendingPiaCount} Deficits
            </h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
          {[
            { id: "All", label: `All Systems (${systems.length})` },
            { id: "Operational", label: `Operational (${operationalCount})` },
            { id: "For Development", label: "For Development" },
            { id: "For Enhancement", label: "For Enhancement" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusTab(tab.id)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                statusTab === tab.id
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search systems, databases, platform..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Systems Directory Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
            <span>Reading systems inventory...</span>
          </div>
        ) : filteredSystems.length > 0 ? (
          filteredSystems.map(sys => {
            const hasPiaRisk = sys.processes_personal_information && !sys.has_undergone_pia;
            const statusLabel = sys.status?.value || sys.status || "Operational";
            const classLabel = sys.classification?.value || sys.classification || "";
            const hostingLabel = sys.hosting_type?.value || sys.hosting_type || "Hybrid";
            const strategyLabel = sys.development_strategy?.value || sys.development_strategy || "Outsourced";

            return (
              <div 
                key={sys.id}
                className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 transition-all space-y-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400">
                      <Layers className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">{sys.name}</h3>
                        {sys.online_url && (
                          <a href={sys.online_url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Owner Office: {sys.system_owner_office}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${
                      statusLabel === "Operational" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                        : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                    }`}>
                      {statusLabel}
                    </span>

                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      {classLabel}
                    </span>

                    <button
                      onClick={() => handleOpenEditModal(sys)}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer"
                      title="Edit System Specifications"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(sys.id, sys.name)}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg transition-colors cursor-pointer"
                      title="Delete System"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Purpose Narration */}
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans text-xs">
                  {sys.description_and_purpose}
                </p>

                {/* DICT v.2026 Enhancement Details (Page 13 Mandate) */}
                {statusLabel === "For Enhancement" && sys.enhancement_details && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <span className="text-[9.5px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 font-mono">
                      <Sparkles className="w-3 h-3" />
                      <span>Details of Planned System Enhancements (DICT Page 13)</span>
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px] font-sans">
                      {sys.enhancement_details}
                    </p>
                  </div>
                )}

                {/* Technical Architecture Specs Grid (Harmonized slate insets) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-955 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Development Strategy</span>
                    <span className="text-slate-800 dark:text-slate-200 font-bold">{strategyLabel}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Development Stack</span>
                    <span className="text-slate-800 dark:text-slate-200 truncate block">{sys.development_platform || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Database Name</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{sys.database_name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 uppercase block font-bold text-[8.5px]">Hosting Architecture</span>
                    <span className="text-slate-800 dark:text-slate-200">{hostingLabel}</span>
                  </div>
                </div>

                {/* Compliance & Interoperability Badges */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[10px]">
                  <div className="flex flex-wrap gap-2 items-center font-mono">
                    <span className={`px-2.5 py-0.5 rounded-md border text-[9.5px] flex items-center gap-1 ${
                      sys.processes_personal_information
                        ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                    }`}>
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Processes Personal Data: {sys.processes_personal_information ? "YES" : "NO"}</span>
                    </span>

                    {sys.processes_personal_information && (
                      <span className={`px-2.5 py-0.5 rounded-md border text-[9.5px] font-bold flex items-center gap-1 ${
                        sys.has_undergone_pia 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 animate-pulse"
                      }`}>
                        {sys.has_undergone_pia ? "PIA Completed" : "PIA Audit Deficit"}
                      </span>
                    )}

                    {sys.is_deployed_on_shared_platform && (
                      <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 text-[9.5px]">
                        GovCloud / Shared Platform
                      </span>
                    )}
                  </div>

                  <div className="text-slate-400 text-[9.5px] font-mono">
                    Interoperability: Generates Data [{sys.generates_data_for_others ? "✓" : "✗"}] | Ingests Data [{sys.processes_data_from_others ? "✓" : "✗"}]
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic">
            No information systems registered for planning cycle FY {activeCycle}. Click "Register System" to catalog platforms.
          </div>
        )}
      </div>

      {/* CREATE / EDIT SYSTEM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{editingId ? "Update Information System" : "Register Information System (Parts II.C / III.D)"}</span>
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              {/* Strategic Root Linkage */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Link to Part II.A Strategic Concern (Root Problem Provenance)
                </label>
                <select
                  value={form.strategic_concern_id}
                  onChange={e => setForm({ ...form, strategic_concern_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="">-- Standalone (No explicit concern mapped) --</option>
                  {strategicConcerns.map(c => (
                    <option key={c.id} value={c.id}>
                      [{c.mfo}] {c.critical_system} - {c.problems.substring(0, 60)}...
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">System Name</label>
                  <input
                    type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Citizen Frontline Registry & Payment Gateway"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Lifecycle Status</label>
                  <select
                    value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none focus:border-blue-500"
                  >
                    <option value="Operational">Operational (Part II.C Existing Inventory)</option>
                    <option value="For Enhancement">For Enhancement (Part III.D Proposed Upgrade)</option>
                    <option value="For Development">For Development (Part III.D Proposed New Build)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Classification</label>
                  <select
                    value={form.classification} onChange={e => setForm({ ...form, classification: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none focus:border-blue-500"
                  >
                    <option value="Operations - Frontline Service">Operations - Frontline Service (Direct Citizen/Client Access)</option>
                    <option value="Operations - Non-Frontline Service">Operations - Non-Frontline Service (Core Mandate Back-Office)</option>
                    <option value="General Administrative Systems">General Administrative Systems (HR, Accounting, Logistics)</option>
                    <option value="Support to Operations">Support to Operations (Planning, Legal, M&amp;E)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Hosting Architecture</label>
                  <select
                    value={form.hosting_type} onChange={e => setForm({ ...form, hosting_type: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none focus:border-blue-500"
                  >
                    <option value="Online">Online / Cloud Hosted</option>
                    <option value="On-premise">On-premise Institutional Data Center</option>
                    <option value="Hybrid">Hybrid Cloud (Local Mirror with Cloud Failover)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Online Service Portal URL (If accessible)</label>
                <input
                  type="url" value={form.online_url} onChange={e => setForm({ ...form, online_url: e.target.value })}
                  placeholder="https://services.agency.gov.ph"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-blue-600 dark:text-blue-400 font-mono text-xs outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Description &amp; Core Purpose</label>
                <textarea
                  rows={3} required value={form.description_and_purpose} onChange={e => setForm({ ...form, description_and_purpose: e.target.value })}
                  placeholder="Detail salient functionalities, transactional modules, target outputs, and public services provided..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* DICT v.2026 Enhancement Details Field */}
              {form.status === "For Enhancement" && (
                <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl animate-fadeIn">
                  <label className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1 font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Details of System Enhancements to be Done (DICT Page 13 Mandate)</span>
                    </span>
                    <span className="text-[9px] text-rose-500 font-bold">*Required for Enhancement</span>
                  </label>
                  <textarea
                    rows={3}
                    required={form.status === "For Enhancement"}
                    value={form.enhancement_details}
                    onChange={e => setForm({ ...form, enhancement_details: e.target.value })}
                    placeholder="Specify modules to be redesigned, containerization milestones, PeGIF API gateway additions, or database schema upgrades..."
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Development Strategy</label>
                  <select
                    value={form.development_strategy} onChange={e => setForm({ ...form, development_strategy: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white cursor-pointer outline-none"
                  >
                    <option value="In-House Development">In-House Development</option>
                    <option value="Outsourced">Outsourced Contractor</option>
                    <option value="Commercial Off-The-Shelf (COTS)">COTS Ready-made</option>
                    <option value="Combination / Hybrid">Combination / Hybrid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Platform &amp; Tech Stack</label>
                  <input
                    type="text" required value={form.development_platform} onChange={e => setForm({ ...form, development_platform: e.target.value })}
                    placeholder="e.g. Next.js, FastAPI, PostgreSQL"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Database Name</label>
                  <input
                    type="text" required value={form.database_name} onChange={e => setForm({ ...form, database_name: e.target.value })}
                    placeholder="e.g. production_registry_db"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Storage Architecture</label>
                  <input
                    type="text" required value={form.data_storage_type} onChange={e => setForm({ ...form, data_storage_type: e.target.value })}
                    placeholder="e.g. GovCloud Hybrid Object Storage"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Internal Users</label>
                  <input
                    type="text" required value={form.internal_users} onChange={e => setForm({ ...form, internal_users: e.target.value })}
                    placeholder="e.g. Frontline Staff, Cashiers, Auditors"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">System Owner Office</label>
                  <input
                    type="text" required value={form.system_owner_office} onChange={e => setForm({ ...form, system_owner_office: e.target.value })}
                    placeholder="e.g. Public Frontline Services Division"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Interoperability Controls */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" />
                  <span>PeGIF Interoperability &amp; Shared Infrastructure</span>
                </span>
                
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={form.generates_data_for_others}
                      onChange={e => setForm({ ...form, generates_data_for_others: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-slate-200">Generates Data for Other Systems</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={form.processes_data_from_others}
                      onChange={e => setForm({ ...form, processes_data_from_others: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-slate-200">Ingests Data from Other Systems</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer col-span-2">
                    <input
                      type="checkbox" checked={form.is_deployed_on_shared_platform}
                      onChange={e => setForm({ ...form, is_deployed_on_shared_platform: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-slate-200">Hosted on Shared Platform (e.g. GovCloud, Common Server)</span>
                  </label>
                </div>
              </div>

              {/* Data Privacy Act of 2012 Compliance (PIA) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Data Privacy Act of 2012 Compliance (PIA)</span>
                </span>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={form.processes_personal_information}
                      onChange={e => setForm({ ...form, processes_personal_information: e.target.checked })}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                    />
                    <span className="text-slate-800 dark:text-slate-200">Processes Personal Information (PII)</span>
                  </label>

                  {form.processes_personal_information && (
                    <label className="flex items-center gap-2 cursor-pointer animate-fadeIn">
                      <input
                        type="checkbox" checked={form.has_undergone_pia}
                        onChange={e => setForm({ ...form, has_undergone_pia: e.target.checked })}
                        className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
                      />
                      <span className={form.has_undergone_pia ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"}>
                        Formal PIA Audit Completed
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : editingId ? "Save System Modifications" : "Register Information System"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}