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
  Layers
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

  // Form State
  const [form, setForm] = useState({
    position_title: "",
    status: "Permanent",
    count: 1
  });

  // Inline Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    position_title: "",
    status: "Permanent",
    count: 1
  });

  const token = user?.token;

  const fetchPositions = async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStaffPositions(token, activeCycle);
      setPositions(data);
    } catch (err) {
      setError(err.message || "Failed to load IT staff positions.");
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
      setSuccess("Staff position registered successfully.");
      setForm({ position_title: "", status: "Permanent", count: 1 });
      fetchPositions();
    } catch (err) {
      setError(err.message || "Failed to register staff position.");
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
    setEditForm({ position_title: "", status: "Permanent", count: 1 });
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
      setSuccess("Staff position updated successfully.");
      setEditingId(null);
      fetchPositions();
    } catch (err) {
      setError(err.message || "Failed to update staff position.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this staff position?")) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteStaffPosition(token, id);
      setSuccess("Staff position successfully removed.");
      fetchPositions();
    } catch (err) {
      setError(err.message || "Failed to delete staff position.");
    }
  };

  const totalHeadcount = positions.reduce((sum, item) => sum + (item.count || 0), 0);

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            <span>Part IV.B: SUC IT Staffing Registry</span>
          </h2>
          <p className="text-slate-400 mt-1">
            Track active staffing positions, classifications, and headcounts to fulfill compliance reporting requirements.
          </p>
        </div>
        <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-850 flex items-center gap-3">
          <Layers className="w-4 h-4 text-blue-400" />
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Total Headcount:</span>
            <span className="font-mono text-white font-bold text-sm">{totalHeadcount.toLocaleString()}</span>
          </div>
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
        {/* Creator Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Plus className="w-4 h-4 text-blue-500" />
            <span>Document New Position</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Official Position Title</label>
            <input
              type="text"
              placeholder="e.g. Database Administrator"
              value={form.position_title}
              onChange={e => setForm({ ...form, position_title: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status Classification</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white outline-none cursor-pointer"
            >
              <option value="Permanent">Permanent</option>
              <option value="Contractual">Contractual</option>
              <option value="Casual">Casual</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Headcount</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Hash className="w-3.5 h-3.5" />
              </span>
              <input
                type="number"
                min="0"
                placeholder="1"
                value={form.count}
                onChange={e => setForm({ ...form, count: parseInt(e.target.value, 10) || 1 })}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono font-bold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all pt-2.5"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? "Documenting..." : "Save Position"}</span>
          </button>
        </form>

        {/* Directory Output */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-800 pb-2 mb-4">
            IT Staffing Registry List
          </h3>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Reading staff registry...</span>
              </div>
            ) : positions.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="pb-3 px-2 w-2/5">Position Title</th>
                    <th className="pb-3 px-2 w-1/4">Status</th>
                    <th className="pb-3 px-2 w-1/5">Count</th>
                    <th className="pb-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {positions.map(pos => (
                    <tr key={pos.id} className="hover:bg-slate-950/25 transition-colors">
                      {editingId === pos.id ? (
                        <td colSpan={4} className="py-3 px-2">
                          <form onSubmit={(e) => handleUpdate(e, pos.id)} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                            <input
                              type="text"
                              value={editForm.position_title}
                              onChange={e => setEditForm({ ...editForm, position_title: e.target.value })}
                              className="p-2 bg-slate-950 border border-slate-800 rounded text-white"
                              required
                            />
                            <select
                              value={editForm.status}
                              onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                              className="p-2 bg-slate-955 border border-slate-800 rounded text-white cursor-pointer"
                            >
                              <option value="Permanent">Permanent</option>
                              <option value="Contractual">Contractual</option>
                              <option value="Casual">Casual</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              value={editForm.count}
                              onChange={e => setEditForm({ ...editForm, count: parseInt(e.target.value, 10) || 1 })}
                              className="p-2 bg-slate-955 border border-slate-800 rounded text-white font-mono"
                              required
                            />
                            <div className="flex justify-end gap-1.5">
                              <button 
                                type="submit" 
                                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer"
                                title="Save changes"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                type="button" 
                                onClick={handleCancelEdit}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </form>
                        </td>
                      ) : (
                        <>
                          <td className="py-3 px-2 font-bold text-slate-200">
                            <div className="flex items-center gap-1.5">
                              <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{pos.position_title}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="inline-flex items-center gap-1 bg-slate-950/40 px-2.5 py-1 border border-slate-850 rounded text-[9px] font-bold uppercase tracking-wide text-blue-400">
                              {pos.status}
                            </span>
                          </td>
                          <td className="py-3 px-2 font-mono font-bold text-blue-400">{pos.count}</td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEdit(pos)}
                                className="p-1.5 hover:text-blue-400 text-slate-500 transition-colors cursor-pointer"
                                title="Edit properties"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(pos.id)}
                                className="p-1.5 hover:text-red-400 text-slate-500 transition-colors cursor-pointer"
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
                </tbody>
              </table>
            ) : (
              <div className="text-center py-10 text-slate-500 italic">
                No staffing positions recorded. Document active staff members using the configuration form.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}