// frontend/src/views/admin/Narrative/StaffPositionsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getStaffPositions,
  createStaffPosition,
  updateStaffPosition,
  deleteStaffPosition
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  RefreshCw,
  Hash,
  AlertCircle,
  CheckCircle,
  Briefcase,
  Layers,
  Info,
  Search,
  Check,
  ShieldCheck,
  UserCheck,
  Building2,
  Sparkles
} from "lucide-react";

// Official Civil Service Commission (CSC) & DICT Standard IT Plantilla Presets
const STANDARD_ICT_PRESETS = [
  { title: "Information Technology Officer II", status: "Plantilla (Permanent)" },
  { title: "Information Technology Officer I", status: "Plantilla (Permanent)" },
  { title: "Information Systems Analyst II", status: "Plantilla (Permanent)" },
  { title: "Information Systems Analyst I", status: "Plantilla (Permanent)" },
  { title: "Computer Programmer III", status: "Plantilla (Permanent)" },
  { title: "Computer Programmer II", status: "Plantilla (Permanent)" },
  { title: "Network and Systems Administrator", status: "Plantilla (Permanent)" },
  { title: "Cybersecurity & Information Security Analyst", status: "Plantilla (Permanent)" },
  { title: "Database Administrator", status: "Plantilla (Permanent)" },
  { title: "Computer Maintenance Technologist II", status: "Plantilla (Permanent)" },
  { title: "Technical Support Specialist", status: "Outsourced (JO / COS / HTC)" }
];

/**
 * Normalizes error messages from API or Pydantic validation envelopes
 * without rendering unhelpful "[object Object]" text.
 */
const extractErrorMessage = (err, fallbackMsg = "Operation failed") => {
  if (!err) return fallbackMsg;
  if (typeof err === "string") return err;
  if (err.message && typeof err.message === "string") return err.message;
  if (err.detail) {
    if (typeof err.detail === "string") return err.detail;
    if (Array.isArray(err.detail)) {
      return err.detail
        .map(e => (e.loc ? `[${e.loc.filter(p => p !== "body").join(" -> ")}]: ` : "") + (e.msg || JSON.stringify(e)))
        .join(" | ");
    }
    return JSON.stringify(err.detail);
  }
  return fallbackMsg;
};

export default function StaffPositionsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Notification states
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Form State (DICT ISSP v.2026 Part III.C Aligned)
  const initialFormState = {
    position_title: "",
    status: "Plantilla (Permanent)",
    count: 1
  };
  const [form, setForm] = useState(initialFormState);

  // Inline Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(initialFormState);

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? (localStorage.getItem("access_token") || localStorage.getItem("token") || "") : "") || "";

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard Escape listener to cancel inline edit mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && editingId !== null) {
        handleCancelEdit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingId]);

  const fetchPositions = useCallback(async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStaffPositions(token, activeCycle);
      setPositions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load proposed ICT staff positions."));
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token]);

  useEffect(() => {
    if (token && activeCycle) {
      fetchPositions();
    }
  }, [token, activeCycle, fetchPositions]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const titleClean = form.position_title.trim();
    if (!titleClean) {
      setError("Position title is required.");
      return;
    }

    const countVal = parseInt(form.count, 10);
    if (isNaN(countVal) || countVal < 1) {
      setError("Physical headcount must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        position_title: titleClean,
        status: form.status,
        count: countVal
      };
      await createStaffPosition(token, activeCycle, payload);
      setSuccess(`Position '${titleClean}' registered successfully.`);
      setForm(initialFormState);
      fetchPositions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to register proposed ICT staff position."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (pos) => {
    setError(null);
    setSuccess(null);
    setEditingId(pos.id);
    setEditForm({
      position_title: pos.position_title || "",
      status: pos.status || "Plantilla (Permanent)",
      count: pos.count || 1
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(initialFormState);
  };

  const handleUpdate = async (e, id) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const titleClean = editForm.position_title.trim();
    if (!titleClean) {
      setError("Position title is required.");
      return;
    }

    const countVal = parseInt(editForm.count, 10);
    if (isNaN(countVal) || countVal < 1) {
      setError("Physical headcount must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        position_title: titleClean,
        status: editForm.status,
        count: countVal
      };
      await updateStaffPosition(token, id, payload);
      setSuccess("Proposed ICT staff position updated successfully.");
      setEditingId(null);
      fetchPositions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update proposed ICT staff position."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete '${title || "this position"}' from the proposed staff registry?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteStaffPosition(token, id);
      setSuccess("Proposed staff position successfully removed.");
      if (editingId === id) handleCancelEdit();
      fetchPositions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete proposed staff position."));
    }
  };

  const handleApplyPreset = (preset) => {
    setForm(prev => ({
      ...prev,
      position_title: preset.title,
      status: preset.status
    }));
  };

  // Metrics Calculations
  const stats = useMemo(() => {
    let totalHeadcount = 0;
    let plantillaCount = 0;
    let contractualCount = 0;
    let outsourcedCount = 0;

    positions.forEach(item => {
      const qty = parseInt(item.count, 10) || 0;
      totalHeadcount += qty;
      const statusLower = (item.status || "").toLowerCase();
      if (statusLower.includes("plantilla") || statusLower.includes("permanent")) {
        plantillaCount += qty;
      } else if (statusLower.includes("outsourced") || statusLower.includes("jo") || statusLower.includes("cos")) {
        outsourcedCount += qty;
      } else {
        contractualCount += qty;
      }
    });

    return {
      totalHeadcount,
      plantillaCount,
      contractualCount,
      outsourcedCount,
      totalDesignations: positions.length
    };
  }, [positions]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return positions.filter(pos => {
      const matchesSearch = !searchTerm.trim() || 
        (pos.position_title || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "ALL" || pos.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [positions, searchTerm, statusFilter]);

  const getStatusBadge = (status) => {
    const s = (status || "").toLowerCase();
    if (s.includes("plantilla") || s.includes("permanent")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
    }
    if (s.includes("contractual")) {
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
    }
    if (s.includes("casual")) {
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
    }
    if (s.includes("outsourced") || s.includes("cos") || s.includes("jo")) {
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
    }
    return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  };

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Part III.C: Proposed ICT Human Capital Registry</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Configure proposed technical positions, civil service classifications, and physical headcounts (DICT ISSP Template Page 19).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Synchronized Compiler Verification Button targeting Part III.C ('staff') */}
          <CompilerSyncButton
            moduleName="staff"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchPositions}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            type="button"
            onClick={fetchPositions}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh positions list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 font-mono block">Total Headcount</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {stats.totalHeadcount.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.totalDesignations} Titles
            </span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 font-mono block">Plantilla (Permanent)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {stats.plantillaCount.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.totalHeadcount > 0 ? `${Math.round((stats.plantillaCount / stats.totalHeadcount) * 100)}%` : "0%"}
            </span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 font-mono block">Contractual &amp; Casual</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
              {stats.contractualCount.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.totalHeadcount > 0 ? `${Math.round((stats.contractualCount / stats.totalHeadcount) * 100)}%` : "0%"}
            </span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 font-mono block">Outsourced / COS</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
              {stats.outsourcedCount.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.totalHeadcount > 0 ? `${Math.round((stats.outsourcedCount / stats.totalHeadcount) * 100)}%` : "0%"}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
          <button 
            type="button"
            onClick={() => setError(null)} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSuccess(null)} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creator Form Column */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5 font-serif">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Register Proposed Position</span>
          </h3>

          {/* Quick Preset Selector Chips */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Standard CSC / DICT Plantilla Presets</span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {STANDARD_ICT_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="px-2 py-1 bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-300 rounded-lg text-[9.5px] border border-slate-200 dark:border-slate-700 transition-all text-left cursor-pointer flex items-center gap-1"
                >
                  <span>{p.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Official Position Title
            </label>
            <input
              type="text"
              placeholder="e.g. Information Technology Officer II / Systems Analyst"
              value={form.position_title}
              onChange={e => setForm({ ...form, position_title: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs font-semibold outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Employment Status Classification
            </label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs focus:border-blue-500 font-medium"
            >
              <option value="Plantilla (Permanent)">Plantilla (Permanent)</option>
              <option value="Contractual">Contractual</option>
              <option value="Casual">Casual</option>
              <option value="Outsourced (JO / COS / HTC)">Outsourced (JO / COS / HTC)</option>
              <option value="Co-terminous">Co-terminous</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Physical Headcount
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Hash className="w-3.5 h-3.5" />
              </span>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={form.count}
                onChange={e => setForm({ ...form, count: parseInt(e.target.value, 10) || 1 })}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-xs outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-xl text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>DICT Template Page 19:</strong> These positions populate the <em>Part III.C Proposed ICT Human Capital</em> table, validating technical staffing feasibility for in-house developed systems [5].
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm text-xs"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? "Documenting..." : "Save Position"}</span>
          </button>
        </form>

        {/* Directory Output Column */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                  Proposed Human Capital Registry (Part III.C)
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  {positions.length} Registered Designations
                </span>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search position..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs outline-none text-slate-900 dark:text-white focus:border-blue-500 w-40 sm:w-48"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="py-1.5 px-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs outline-none text-slate-800 dark:text-slate-200 font-mono cursor-pointer"
                >
                  <option value="ALL">All Status</option>
                  <option value="Plantilla (Permanent)">Plantilla</option>
                  <option value="Contractual">Contractual</option>
                  <option value="Casual">Casual</option>
                  <option value="Outsourced (JO / COS / HTC)">Outsourced</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                  <span>Reading proposed staffing registry...</span>
                </div>
              ) : filteredPositions.length > 0 ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-slate-50 dark:bg-slate-955 font-mono">
                      <th className="py-2.5 px-3 w-2/5">IT Position Title</th>
                      <th className="py-2.5 px-3 w-1/3">Employment Status</th>
                      <th className="py-2.5 px-3 text-center w-24">Headcount</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {filteredPositions.map(pos => (
                      <tr key={pos.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-955/25 transition-colors">
                        {editingId === pos.id ? (
                          <td colSpan={4} className="py-3 px-3">
                            <form onSubmit={(e) => handleUpdate(e, pos.id)} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center bg-blue-50/30 dark:bg-blue-955/10 p-2.5 rounded-xl border border-blue-200 dark:border-blue-900/40">
                              <input
                                type="text"
                                value={editForm.position_title}
                                onChange={e => setEditForm({ ...editForm, position_title: e.target.value })}
                                className="p-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs font-semibold"
                                required
                              />
                              <select
                                value={editForm.status}
                                onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                className="p-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 cursor-pointer text-xs"
                              >
                                <option value="Plantilla (Permanent)">Plantilla (Permanent)</option>
                                <option value="Contractual">Contractual</option>
                                <option value="Casual">Casual</option>
                                <option value="Outsourced (JO / COS / HTC)">Outsourced (JO / COS / HTC)</option>
                                <option value="Co-terminous">Co-terminous</option>
                              </select>
                              <input
                                type="number"
                                min="1"
                                value={editForm.count}
                                onChange={e => setEditForm({ ...editForm, count: parseInt(e.target.value, 10) || 1 })}
                                className="p-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs text-center font-bold"
                                required
                              />
                              <div className="flex justify-end gap-1.5">
                                <button 
                                  type="submit" 
                                  disabled={submitting}
                                  className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                  title="Save changes"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  type="button" 
                                  onClick={handleCancelEdit}
                                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </form>
                          </td>
                        ) : (
                          <>
                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{pos.position_title}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 border rounded-full text-[9px] font-bold uppercase tracking-wide font-mono ${getStatusBadge(pos.status)}`}>
                                {pos.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-center text-blue-600 dark:text-blue-400">
                              {pos.count}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(pos)}
                                  className="p-1.5 hover:text-blue-600 dark:hover:text-blue-400 text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Edit properties"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(pos.id, pos.position_title)}
                                  className="p-1.5 hover:text-rose-600 dark:hover:text-rose-400 text-slate-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-955/40 transition-colors cursor-pointer"
                                  title="Purge staff position record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-slate-100/70 dark:bg-slate-950 font-bold border-t-2 border-slate-300 dark:border-slate-800 font-mono text-slate-900 dark:text-white">
                      <td colSpan={2} className="py-3 px-3 uppercase tracking-wider font-bold">
                        Grand Total (Proposed Physical Count)
                      </td>
                      <td className="py-3 px-3 text-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                        {stats.totalHeadcount}
                      </td>
                      <td className="py-3 px-3"></td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500 italic">
                  {searchTerm || statusFilter !== "ALL"
                    ? "No staff positions match the search or filter criteria."
                    : "No proposed staffing positions recorded. Document active personnel requirements using the form."}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}