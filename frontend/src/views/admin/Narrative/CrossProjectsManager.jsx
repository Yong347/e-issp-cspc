// frontend/src/views/admin/Narrative/CrossProjectsManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getCrossProjects,
  createCrossProject,
  deleteCrossProject
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Search,
  Network,
  Calendar,
  Layers,
  Building,
  Target,
  AlertCircle,
  CheckCircle
} from "lucide-react";

export default function CrossProjectsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    name: "",
    objectives: "",
    duration: "",
    deliverables: "",
    lead_agency: "",
    implementing_agencies: ""
  });

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchProjectsList = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCrossProjects(user.token, activeCycle);
      setProjects(data);
    } catch (err) {
      setError(err.message || "Failed to load cross-agency projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchProjectsList();
    }
  }, [user, activeCycle]);

  const validateForm = () => {
    if (!form.name.trim()) return "Project name is required.";
    if (!form.objectives.trim()) return "Objectives are required.";
    if (!form.duration.trim()) return "Duration description is required.";
    if (!form.deliverables.trim()) return "Deliverables explanation is required.";
    if (!form.lead_agency.trim()) return "Lead Agency name is required.";
    if (!form.implementing_agencies.trim()) return "At least one implementing agency is required.";
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
        name: form.name.trim(),
        objectives: form.objectives.trim(),
        duration: form.duration.trim(),
        deliverables: form.deliverables.trim(),
        lead_agency: form.lead_agency.trim(),
        implementing_agencies: form.implementing_agencies.trim()
      };

      await createCrossProject(user.token, activeCycle, payload);
      setSuccess("Cross-agency cooperative project successfully registered.");
      
      // Reset Form
      setForm({
        name: "",
        objectives: "",
        duration: "",
        deliverables: "",
        lead_agency: "",
        implementing_agencies: ""
      });
      fetchProjectsList();
    } catch (err) {
      setError(err.message || "Failed to register cooperative project.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this cooperative project entry?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteCrossProject(user.token, id);
      setSuccess("Collaborative project purged successfully.");
      fetchProjectsList();
    } catch (err) {
      setError(err.message || "Failed to delete project.");
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.lead_agency.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.implementing_agencies.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title block */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-500" />
            <span>Part III.B: Unified SUC Cross-Agency Collaborative Projects</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage joint digital pipeline initiatives undertaken with external agencies (e.g. DICT, CHED, SUCs).</p>
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
        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Plus className="w-4 h-4 text-indigo-500" />
            <span>Register Collaborative Project</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Project Name</label>
            <input
              type="text"
              placeholder="e.g. National Government Portal Integration"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-semibold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Project Objectives</label>
            <textarea
              placeholder="Key project goals, targets, and strategic alignment parameters..."
              value={form.objectives}
              onChange={e => setForm({ ...form, objectives: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white h-20 resize-none leading-relaxed"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Project Duration</label>
            <input
              type="text"
              placeholder="e.g. 2026 - 2028"
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Key Deliverables</label>
            <textarea
              placeholder="Key project deliverables, hardware clusters, API endpoints..."
              value={form.deliverables}
              onChange={e => setForm({ ...form, deliverables: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white h-20 resize-none leading-relaxed"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Lead Agency</label>
            <input
              type="text"
              placeholder="e.g. DICT"
              value={form.lead_agency}
              onChange={e => setForm({ ...form, lead_agency: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Implementing Agencies</label>
            <input
              type="text"
              placeholder="e.g. CSPC MIS Division, SUC Registrars"
              value={form.implementing_agencies}
              onChange={e => setForm({ ...form, implementing_agencies: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all pt-2.5"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? "Preserving..." : "Save Project"}</span>
          </button>
        </form>

        {/* Listings Display */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls */}
          <div className="flex gap-3 border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search projects or agencies..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>
          </div>

          {/* List display */}
          <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <Network className="w-6 h-6 animate-pulse mx-auto mb-2 text-indigo-500" />
                <span>Reading cross-agency cooperative pipeline...</span>
              </div>
            ) : filteredProjects.length > 0 ? (
              filteredProjects.map(p => (
                <div key={p.id} className="bg-slate-955 border border-slate-850 rounded-xl p-5 hover:border-indigo-900 transition-all space-y-4">
                  
                  {/* Top bar */}
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h4 className="font-bold text-slate-200 text-xs leading-relaxed">{p.name}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Timeline: {p.duration}</span>
                        </span>
                        <span className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          <Building className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-mono">Lead: {p.lead_agency}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Body matrices */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-850/60 pt-3 text-[11px] leading-relaxed">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                        <Target className="w-3 h-3 text-indigo-500" />
                        <span>Objectives</span>
                      </span>
                      <p className="text-slate-400 break-words">{p.objectives}</p>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-emerald-500" />
                        <span>Deliverables</span>
                      </span>
                      <p className="text-slate-400 break-words">{p.deliverables}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-850/40 text-[10px] text-slate-500 font-medium">
                    <span>Implementing Partners:</span>
                    <span className="text-slate-400 ml-1.5">{p.implementing_agencies}</span>
                  </div>

                </div>
              ))
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No cooperative projects indexed for cycle period '{activeCycle}'.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}