// frontend/src/views/admin/Narrative/StaffPositionsManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getStaffPositions,
  createStaffPosition,
  updateStaffPosition,
  deleteStaffPosition
} from "../../../api/admin";
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
  Info
} from "lucide-react";

export default function StaffPositionsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Notification states
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form State (DICT ISSP v.2026 Part III.C Aligned)
  const [form, setForm] = useState({
    position_title: "",
    status: "Plantilla (Permanent)",
    count: 1
  });

  // Inline Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    position_title: "",
    status: "Plantilla (Permanent)",
    count: 1
  });

  const token = user?.token;

  const fetchPositions = async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStaffPositions(token, activeCycle);
      setPositions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load proposed ICT staff positions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      fetchPositions();
    }
  }, [token, activeCycle]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.position_title.trim()) {
      setError("Position title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        position_title: form.position_title.trim(),
        status: form.status,
        count: parseInt(form.count, 10) || 1
      };
      await createStaffPosition(token, activeCycle, payload);
      setSuccess("Proposed ICT staff position registered successfully.");
      setForm({ position_title: "", status: "Plantilla (Permanent)", count: 1 });
      fetchPositions();
    } catch (err) {
      setError(err.message || "Failed to register proposed ICT staff position.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (pos) => {
    setEditingId(pos.id);
    setEditForm({
      position_title: pos.position_title,
      status: pos.status,
      count: pos.count
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ position_title: "", status: "Plantilla (Permanent)", count: 1 });
  };

  const handleUpdate = async (e, id) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        position_title: editForm.position_title.trim(),
        status: editForm.status,
        count: parseInt(editForm.count, 10) || 1
      };
      await updateStaffPosition(token, id, payload);
      setSuccess("Proposed ICT staff position updated successfully.");
      setEditingId(null);
      fetchPositions();
    } catch (err) {
      setError(err.message || "Failed to update proposed ICT staff position.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this proposed staff position?")) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteStaffPosition(token, id);
      setSuccess("Proposed staff position successfully removed.");
      fetchPositions();
    } catch (err) {
      setError(err.message || "Failed to delete proposed staff position.");
    }
  };

  const totalHeadcount = positions.reduce((sum, item) => sum + (item.count || 0), 0);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Part III.C: Proposed ICT Human Capital Registry</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure proposed technical positions, civil service classifications, and physical headcounts (DICT ISSP Template Page 19).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 dark:bg-slate-955 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-850 flex items-center gap-3">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Total Headcount:</span>
              <span className="font-mono text-slate-900 dark:text-white font-bold text-sm">{totalHeadcount.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={fetchPositions}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold"
            title="Refresh positions list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-red-955/20 border border-rose-200 dark:border-red-900 text-rose-700 dark:text-red-400 font-bold rounded-lg flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold rounded-lg flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creator Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 h-fit shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Register Proposed Position</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Official Position Title
            </label>
            <input
              type="text"
              placeholder="e.g. Information Technology Officer II / Systems Analyst"
              value={form.position_title}
              onChange={e => setForm({ ...form, position_title: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white text-xs font-semibold outline-none focus:border-blue-500"
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
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs focus:border-blue-500 font-medium"
            >
              <option value="Plantilla (Permanent)">Plantilla (Permanent)</option>
              <option value="Contractual">Contractual</option>
              <option value="Casual">Casual</option>
              <option value="Outsourced (JO / COS / HTC)">Outsourced (JO / COS / HTC)</option>
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
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-xs outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>DICT Template Page 19:</strong> These positions populate the <em>Part III.C Proposed ICT Human Capital</em> table, validating technical staffing feasibility for in-house developed systems.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm text-xs"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? "Documenting..." : "Save Position"}</span>
          </button>
        </form>

        {/* Directory Output */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2 mb-4">
            Proposed Human Capital Registry (Part III.C)
          </h3>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Reading proposed staffing registry...</span>
              </div>
            ) : positions.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50 dark:bg-slate-955">
                    <th className="py-2.5 px-3 w-2/5">IT Position Title</th>
                    <th className="py-2.5 px-3 w-1/3">Employment Status</th>
                    <th className="py-2.5 px-3 text-center w-24">Headcount</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {positions.map(pos => (
                    <tr key={pos.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-955/25 transition-colors">
                      {editingId === pos.id ? (
                        <td colSpan={4} className="py-3 px-3">
                          <form onSubmit={(e) => handleUpdate(e, pos.id)} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                            <input
                              type="text"
                              value={editForm.position_title}
                              onChange={e => setEditForm({ ...editForm, position_title: e.target.value })}
                              className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white text-xs"
                              required
                            />
                            <select
                              value={editForm.status}
                              onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 cursor-pointer text-xs"
                            >
                              <option value="Plantilla (Permanent)">Plantilla (Permanent)</option>
                              <option value="Contractual">Contractual</option>
                              <option value="Casual">Casual</option>
                              <option value="Outsourced (JO / COS / HTC)">Outsourced (JO / COS / HTC)</option>
                            </select>
                            <input
                              type="number"
                              min="1"
                              value={editForm.count}
                              onChange={e => setEditForm({ ...editForm, count: parseInt(e.target.value, 10) || 1 })}
                              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-white font-mono text-xs text-center"
                              required
                            />
                            <div className="flex justify-end gap-1.5">
                              <button 
                                type="submit" 
                                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer shadow-xs"
                                title="Save changes"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                type="button" 
                                onClick={handleCancelEdit}
                                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
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
                            <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-950/40 px-2.5 py-0.5 border border-slate-200 dark:border-slate-850 rounded text-[9px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                              {pos.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-center text-blue-600 dark:text-blue-400">
                            {pos.count}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEdit(pos)}
                                className="p-1.5 hover:text-blue-600 dark:hover:text-blue-400 text-slate-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Edit properties"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(pos.id)}
                                className="p-1.5 hover:text-rose-600 dark:hover:text-red-400 text-slate-400 rounded hover:bg-rose-50 dark:hover:bg-red-955 transition-colors cursor-pointer"
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
                      {totalHeadcount}
                    </td>
                    <td className="py-3 px-3"></td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500 italic">
                No proposed staffing positions recorded. Document active personnel requirements using the form.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}