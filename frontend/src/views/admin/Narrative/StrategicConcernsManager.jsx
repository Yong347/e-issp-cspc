// frontend/src/views/admin/Narrative/StrategicConcernsManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getStrategicConcerns,
  createStrategicConcern,
  updateStrategicConcern,
  deleteStrategicConcern
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Edit,
  Search,
  X,
  AlertCircle,
  CheckCircle,
  ShieldAlert,
  Cpu,
  CornerDownRight
} from "lucide-react";

export default function StrategicConcernsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [concerns, setConcerns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    mfo: "",
    critical_system: "",
    problems: "",
    intended_use: ""
  });
  const [editId, setEditId] = useState(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchConcernsList = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStrategicConcerns(user.token, activeCycle);
      setConcerns(data);
    } catch (err) {
      setError(err.message || "Failed to load strategic concerns matrix.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchConcernsList();
    }
  }, [user, activeCycle]);

  const validateForm = () => {
    if (!form.mfo.trim()) return "Major Final Output / Key Result Area description is required.";
    if (!form.critical_system.trim()) return "Critical SUC Business System description is required.";
    if (!form.problems.trim()) return "At least one descriptive problem entry is required.";
    if (!form.intended_use.trim()) return "Intended use of ICT solution description is required.";
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
        mfo: form.mfo.trim(),
        critical_system: form.critical_system.trim(),
        problems: form.problems.trim(),
        intended_use: form.intended_use.trim()
      };

      if (editId) {
        await updateStrategicConcern(user.token, editId, payload);
        setSuccess("Strategic concern updated successfully.");
      } else {
        await createStrategicConcern(user.token, activeCycle, payload);
        setSuccess("Strategic concern documented successfully.");
      }

      // Reset form
      setForm({
        mfo: "",
        critical_system: "",
        problems: "",
        intended_use: ""
      });
      setEditId(null);
      fetchConcernsList();
    } catch (err) {
      setError(err.message || "Failed to save strategic concern record.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (c) => {
    setError(null);
    setSuccess(null);
    setEditId(c.id);
    setForm({
      mfo: c.mfo,
      critical_system: c.critical_system,
      problems: c.problems,
      intended_use: c.intended_use
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      mfo: "",
      critical_system: "",
      problems: "",
      intended_use: ""
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this strategic concern record?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteStrategicConcern(user.token, id);
      setSuccess("Strategic concern successfully purged.");
      fetchConcernsList();
    } catch (err) {
      setError(err.message || "Failed to delete strategic concern entry.");
    }
  };

  const filteredConcerns = concerns.filter(c =>
    c.mfo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.critical_system.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.problems.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.intended_use.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-500" />
            <span>Part I.E: SUC Strategic Concerns Matrix</span>
          </h2>
          <p className="text-slate-400 mt-1">Map Key Result Areas to business workflows and establish the intended use of proposed ICT solutions.</p>
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
        {/* Editor Form Panel */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editId ? <Edit className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-indigo-500" />}
            <span>{editId ? "Update Strategic Concern" : "Document Strategic Concern"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Major Final Output / KRA</label>
            <input
              type="text"
              placeholder="e.g. Higher Education Services"
              value={form.mfo}
              onChange={e => setForm({ ...form, mfo: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-semibold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Critical SUC Business System</label>
            <input
              type="text"
              placeholder="e.g. Student Information & Accounting System"
              value={form.critical_system}
              onChange={e => setForm({ ...form, critical_system: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Problems Encountered</label>
            <textarea
              placeholder="Descriptive explanation of performance latencies or workflow bottlenecks..."
              value={form.problems}
              onChange={e => setForm({ ...form, problems: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white h-24 resize-none leading-relaxed"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Intended Use of ICT Solution</label>
            <textarea
              placeholder="How the proposed hardware, software, or network pipeline will resolve the problem..."
              value={form.intended_use}
              onChange={e => setForm({ ...form, intended_use: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white h-24 resize-none leading-relaxed"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            {editId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`py-2.5 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all ${
                editId 
                  ? "bg-amber-600 hover:bg-amber-500 w-2/3" 
                  : "bg-indigo-600 hover:bg-indigo-500 w-full"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Preserving..." : editId ? "Update Concern" : "Save Concern"}</span>
            </button>
          </div>
        </form>

        {/* Matrix Registry Display */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls */}
          <div className="flex gap-3 border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search concerns or business systems..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>
          </div>

          {/* Table list */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <ShieldAlert className="w-6 h-6 animate-pulse mx-auto mb-2 text-indigo-500" />
                <span>Reading strategic concerns matrix...</span>
              </div>
            ) : filteredConcerns.length > 0 ? (
              <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2">
                {filteredConcerns.map(c => (
                  <div key={c.id} className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3 hover:border-indigo-900 transition-all">
                    
                    {/* Header bar */}
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider bg-indigo-950/40 px-2 py-0.5 border border-indigo-900 rounded">
                          KRA: {c.mfo}
                        </span>
                        <h4 className="text-slate-200 font-bold mt-1.5 text-xs flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-slate-400" />
                          <span>{c.critical_system}</span>
                        </h4>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(c)}
                          className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                          title="Edit Concern"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                          title="Purge Concern"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Breakdown grids */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-850 text-[11px] leading-relaxed">
                      <div className="space-y-1">
                        <span className="font-bold text-red-400 uppercase tracking-wider text-[9px] block">Problems Encountered:</span>
                        <p className="text-slate-400 italic break-words">{c.problems}</p>
                      </div>

                      <div className="space-y-1">
                        <span className="font-bold text-emerald-400 uppercase tracking-wider text-[9px] flex items-center gap-0.5">
                          <CornerDownRight className="w-3 h-3 text-emerald-500" />
                          <span>Intended ICT Solution:</span>
                        </span>
                        <p className="text-slate-400 break-words">{c.intended_use}</p>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No strategic concerns logged for cycle period '{activeCycle}'.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}