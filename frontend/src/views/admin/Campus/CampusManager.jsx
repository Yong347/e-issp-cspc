// frontend/src/views/admin/Campus/CampusManager.jsx
import React, { useState, useEffect } from "react";
import { 
  getCampuses, 
  createCampus, 
  updateCampus, 
  deleteCampus 
} from "../../../api/admin";
import { useAuth } from "../../../context/AuthContext";
import { 
  Landmark, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  MapPin, 
  Hash, 
  AlertCircle 
} from "lucide-react";

export default function CampusManager() {
  const { user } = useAuth();
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Form States
  const [form, setForm] = useState({ name: "", location: "", code: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", location: "", code: "" });

  const fetchCampuses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCampuses(user.token);
      setCampuses(data);
    } catch (err) {
      setError(err.message || "Failed to load campuses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchCampuses();
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        code: form.code.trim().toUpperCase()
      };
      await createCampus(user.token, payload);
      setForm({ name: "", location: "", code: "" });
      await fetchCampuses();
    } catch (err) {
      setError(err.message || "Failed to create campus registration.");
    }
  };

  const handleStartEdit = (campus) => {
    setEditingId(campus.id);
    setEditForm({
      name: campus.name,
      location: campus.location,
      code: campus.code
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", location: "", code: "" });
  };

  const handleUpdate = async (e, id) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: editForm.name.trim(),
        location: editForm.location.trim(),
        code: editForm.code.trim().toUpperCase()
      };
      await updateCampus(user.token, id, payload);
      setEditingId(null);
      await fetchCampuses();
    } catch (err) {
      setError(err.message || "Failed to update campus configuration.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this campus? This may impact linked departments and user records.")) return;
    setError(null);
    try {
      await deleteCampus(user.token, id);
      await fetchCampuses();
    } catch (err) {
      setError(err.message || "Failed to delete campus registration.");
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-6xl mx-auto select-none">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-500" />
            <span>Campus Configuration Registry</span>
          </h2>
          <p className="text-slate-400 mt-1">
            Configure SUC campuses and planning parameters (Table B-1 requirement).
          </p>
        </div>
        <button
          onClick={fetchCampuses}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/20 border border-red-900/50 text-red-400 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creation Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-800 pb-2">
            Register New Campus
          </h3>
          
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400">Campus Name</label>
            <input
              type="text"
              placeholder="e.g. CSPC Buhi Campus"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400">Physical Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="e.g. Buhi, Camarines Sur"
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                className="w-full p-2.5 pl-9 bg-slate-950 border border-slate-800 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400">Campus Code</label>
            <div className="relative">
              <Hash className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="e.g. BUHI"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                className="w-full p-2.5 pl-9 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono focus:border-blue-500 focus:outline-none"
                maxLength={10}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded font-bold flex items-center justify-center gap-1.5 text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> 
            <span>Add Campus Unit</span>
          </button>
        </form>

        {/* Data Table Panel */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h3 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-800 pb-2 mb-4">
            Physical Campus Registries
          </h3>
          
          <div className="overflow-x-auto">
            {loading && campuses.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Syncing registries...</span>
              </div>
            ) : campuses.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="pb-3 px-2 w-1/4">Code</th>
                    <th className="pb-3 px-2 w-1/3">Campus Name</th>
                    <th className="pb-3 px-2 w-1/3">Location</th>
                    <th className="pb-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {campuses.map(c => (
                    <tr key={c.id} className="hover:bg-slate-950/25 transition-colors">
                      {editingId === c.id ? (
                        /* Editing Form Row */
                        <td colSpan={4} className="py-3 px-2">
                          <form onSubmit={(e) => handleUpdate(e, c.id)} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                            <input
                              type="text"
                              value={editForm.code}
                              onChange={e => setEditForm({ ...editForm, code: e.target.value })}
                              className="p-2 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                              required
                            />
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                              className="p-2 bg-slate-955 border border-slate-800 rounded text-white col-span-1"
                              required
                            />
                            <input
                              type="text"
                              value={editForm.location}
                              onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                              className="p-2 bg-slate-955 border border-slate-800 rounded text-white col-span-1"
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
                                title="Cancel modification"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </form>
                        </td>
                      ) : (
                        /* Standard Row */
                        <>
                          <td className="py-3 px-2 font-mono text-blue-400 font-bold">{c.code}</td>
                          <td className="py-3 px-2 font-medium text-slate-200">{c.name}</td>
                          <td className="py-3 px-2 text-slate-400">{c.location}</td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEdit(c)}
                                className="p-1.5 hover:text-blue-400 text-slate-500 transition-colors cursor-pointer"
                                title="Edit properties"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(c.id)}
                                className="p-1.5 hover:text-red-400 text-slate-500 transition-colors cursor-pointer"
                                title="Purge campus registration"
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
                No campuses configured. Register your physical campuses using the form.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}