// frontend/src/views/admin/Campus/CampusManager.jsx
import React, { useState, useEffect, useMemo } from "react";
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
  AlertCircle,
  CheckCircle,
  Search,
  Building,
  Building2,
  Layers,
  Info
} from "lucide-react";

export default function CampusManager() {
  const { user } = useAuth();
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Create form state
  const [form, setForm] = useState({ name: "", location: "", code: "" });

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", location: "", code: "" });

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const fetchCampuses = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCampuses(token);
      setCampuses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load facility records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCampuses();
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.name.trim() || !form.location.trim() || !form.code.trim()) {
      setError("Please complete all required fields (Name, Location, and Facility Code).");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        code: form.code.trim().toUpperCase()
      };
      await createCampus(token, payload);
      setSuccess(`Operating facility '${payload.name}' (${payload.code}) registered successfully.`);
      setForm({ name: "", location: "", code: "" });
      await fetchCampuses();
    } catch (err) {
      setError(err.message || "Failed to create campus registration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (campus) => {
    setError(null);
    setSuccess(null);
    setEditingId(campus.id);
    setEditForm({
      name: campus.name || "",
      location: campus.location || "",
      code: campus.code || ""
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", location: "", code: "" });
  };

  const handleUpdate = async (e, id) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!editForm.name.trim() || !editForm.location.trim() || !editForm.code.trim()) {
      setError("Facility Name, Location, and Code cannot be empty.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        location: editForm.location.trim(),
        code: editForm.code.trim().toUpperCase()
      };
      await updateCampus(token, id, payload);
      setSuccess(`Facility '${payload.name}' (${payload.code}) updated successfully.`);
      setEditingId(null);
      await fetchCampuses();
    } catch (err) {
      setError(err.message || "Failed to update campus configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete '${name}'? This may impact linked departments and user records.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteCampus(token, id);
      setSuccess(`Facility '${name}' removed successfully.`);
      await fetchCampuses();
    } catch (err) {
      setError(err.message || "Failed to delete campus registration.");
    }
  };

  // Search filter pipeline
  const filteredCampuses = useMemo(() => {
    if (!searchQuery.trim()) return campuses;
    const q = searchQuery.toLowerCase().trim();
    return campuses.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.location || "").toLowerCase().includes(q) ||
      (c.code || "").toLowerCase().includes(q)
    );
  }, [campuses, searchQuery]);

  // Aggregate metrics
  const centralCount = campuses.filter(c => 
    (c.code || "").toUpperCase().includes("CO") || 
    (c.name || "").toLowerCase().includes("central") ||
    (c.name || "").toLowerCase().includes("headquarters")
  ).length;

  const regionalCount = Math.max(0, campuses.length - centralCount);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-6xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Facility, Site &amp; Regional Campus Registry</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Configure institutional operating sites, regional offices, and physical facility codes for deployment targeting and server capacity tracking.
          </p>
        </div>
        <button
          onClick={fetchCampuses}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold shadow-xs shrink-0 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Aggregate Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Operating Sites</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{campuses.length} Facilities</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Central Headquarters</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {centralCount} Site{centralCount === 1 ? "" : "s"}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Field &amp; Regional Centers</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {regionalCount} Branch{regionalCount === 1 ? "" : "es"}
            </h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creation Form Column */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Register Facility / Site</span>
          </h3>
          
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500">Facility / Campus Name</label>
            <input
              type="text"
              placeholder="e.g. Central Office / National Headquarters"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:border-blue-500 outline-none text-xs font-semibold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500">Physical Location / Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. National Capital Region (NCR), Philippines"
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                className="w-full p-2.5 pl-9 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:border-blue-500 outline-none text-xs"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500">Facility Code (Unique Identifier)</label>
            <div className="relative">
              <Hash className="absolute left-3 top-3 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. CO-NCR or RO-FIELD"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                className="w-full p-2.5 pl-9 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono uppercase focus:border-blue-500 outline-none text-xs"
                maxLength={10}
                required
              />
            </div>
          </div>

          {/* Clean Inset Callout */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Deployment Provenance:</strong> Facility codes categorize localized hardware outlays and multi-site server capacity tracking throughout the ISSP.
            </span>
          </div>

          <button 
            type="submit" 
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white transition-colors cursor-pointer shadow-sm text-xs"
          >
            <Plus className="w-4 h-4" /> 
            <span>{submitting ? "Registering..." : "Add Facility Unit"}</span>
          </button>
        </form>

        {/* Data Table Panel */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              Physical Operating Sites &amp; Facilities
            </h3>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search facility by name, location, or code..."
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 placeholder-slate-400"
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
          </div>
          
          <div className="overflow-x-auto">
            {loading && campuses.length === 0 ? (
              <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Synchronizing facility registries...</span>
              </div>
            ) : filteredCampuses.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-slate-50 dark:bg-slate-955">
                    <th className="py-3 px-3.5 w-28">Facility Code</th>
                    <th className="py-3 px-3.5 w-2/5">Facility Name</th>
                    <th className="py-3 px-3.5">Physical Location</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredCampuses.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-955/30 transition-colors">
                      {editingId === c.id ? (
                        <td colSpan={4} className="py-3 px-3 bg-slate-50 dark:bg-slate-950">
                          <form onSubmit={(e) => handleUpdate(e, c.id)} className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-center">
                            <input
                              type="text"
                              value={editForm.code}
                              onChange={e => setEditForm({ ...editForm, code: e.target.value })}
                              placeholder="Code"
                              className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono uppercase text-xs outline-none focus:border-blue-500"
                              maxLength={10}
                              required
                            />
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                              placeholder="Name"
                              className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                              required
                            />
                            <input
                              type="text"
                              value={editForm.location}
                              onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                              placeholder="Location"
                              className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                              required
                            />
                            <div className="flex justify-end gap-1.5">
                              <button 
                                type="submit" 
                                disabled={submitting}
                                className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer transition-colors"
                                title="Save changes"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                type="button" 
                                onClick={handleCancelEdit}
                                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                title="Cancel modification"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </form>
                        </td>
                      ) : (
                        <>
                          <td className="py-3.5 px-3.5 font-mono">
                            <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-mono font-bold">
                              {c.code}
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{c.name}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3.5 text-slate-600 dark:text-slate-400 font-mono text-xs">
                            {c.location}
                          </td>
                          <td className="py-3.5 px-3.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleStartEdit(c)}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                                title="Edit facility properties"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(c.id, c.name)}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer transition-colors"
                                title="Purge facility registration"
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
              <div className="text-center py-16 text-slate-400 italic">
                {searchQuery ? "No facilities match your search query." : "No campuses configured. Register your physical campuses using the form."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}