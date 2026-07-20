// frontend/src/views/admin/Narrative/GaaTargets.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getGaaTargets,
  createGaaTarget,
  updateGaaTarget,
  deleteGaaTarget
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Target,
  Search,
  X,
  AlertCircle,
  CheckCircle
} from "lucide-react";

export default function GaaTargets() {
  const { user } = useAuth();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    indicator_name: "",
    target_value: ""
  });
  const [editId, setEditId] = useState(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchTargetsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGaaTargets(user.token);
      setTargets(data);
    } catch (err) {
      setError(err.message || "Failed to load GAA performance targets registry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchTargetsList();
    }
  }, [user]);

  const validateForm = () => {
    if (!form.indicator_name.trim()) return "Performance Indicator description is required.";
    if (!form.target_value.trim()) return "Target value is required.";
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
        indicator_name: form.indicator_name.trim(),
        target_value: form.target_value.trim()
      };

      if (editId) {
        await updateGaaTarget(user.token, editId, payload);
        setSuccess("GAA target indicator updated successfully.");
      } else {
        await createGaaTarget(user.token, payload);
        setSuccess("GAA performance target added to registry.");
      }

      // Reset form
      setForm({
        indicator_name: "",
        target_value: ""
      });
      setEditId(null);
      fetchTargetsList();
    } catch (err) {
      setError(err.message || "Failed to save GAA target indicator.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (t) => {
    setError(null);
    setSuccess(null);
    setEditId(t.id);
    setForm({
      indicator_name: t.indicator_name,
      target_value: t.target_value
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      indicator_name: "",
      target_value: ""
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this performance indicator target?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteGaaTarget(user.token, id);
      setSuccess("GAA target indicator removed from registry.");
      fetchTargetsList();
    } catch (err) {
      setError(err.message || "Failed to delete target metric.");
    }
  };

  const filteredTargets = targets.filter(t => 
    t.indicator_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.target_value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title Header Banner */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-500" />
            <span>GAA Target Performance Indicators (Annex A-4)</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage physical SUC Legislative and General Appropriations Act baseline target outcomes.</p>
        </div>
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
        {/* Registration Form Box */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editId ? <Edit2 className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-emerald-500" />}
            <span>{editId ? "Update Performance Indicator" : "Register Target Indicator"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Indicator Description</label>
            <textarea
              placeholder="e.g. Percentage of first-time licensure exam passers..."
              value={form.indicator_name}
              onChange={e => setForm({ ...form, indicator_name: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white h-24 resize-none leading-relaxed"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">GAA Baseline Target</label>
            <input
              type="text"
              placeholder="e.g. 50% or 100 Graduates"
              value={form.target_value}
              onChange={e => setForm({ ...form, target_value: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono font-bold text-emerald-400"
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
                  : "bg-emerald-600 hover:bg-emerald-500 w-full"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Preserving..." : editId ? "Update Metric" : "Save Metric"}</span>
            </button>
          </div>
        </form>

        {/* Targets Directory Grid */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Search Controls */}
          <div className="flex gap-3 border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search indicators or target values..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>
          </div>

          {/* Directory Listings */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <Target className="w-6 h-6 animate-pulse mx-auto mb-2 text-emerald-500" />
                <span>Reading GAA performance registries...</span>
              </div>
            ) : filteredTargets.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-3/4">Performance Indicator Description</th>
                    <th className="py-2.5 px-2 w-1/4">GAA Baseline Target</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredTargets.map(t => (
                    <tr key={t.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-2 text-slate-200 leading-relaxed max-w-md break-words">{t.indicator_name}</td>
                      <td className="py-3 px-2 font-mono font-bold text-emerald-400">
                        <span className="inline-flex items-center gap-1.5 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-900/50">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{t.target_value}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                            title="Edit Metric"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                            title="Purge Metric"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No matching performance milestones registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}