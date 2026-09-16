// frontend/src/views/admin/Inventory/ServerCapacityManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getServerCapacities,
  createServerCapacity,
  deleteServerCapacity,
  getCampuses
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Server,
  HardDrive,
  MapPin,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from "lucide-react";

export default function ServerCapacityManager() {
  const { user } = useAuth();
  const [capacities, setCapacities] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    campus_id: "",
    capacity_tier: "Above 4TB",
    location: "IN-HOUSE",
    quantity: ""
  });

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  const fetchRegistryAndCampuses = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [capsData, campsData] = await Promise.all([
        getServerCapacities(token),
        getCampuses(token)
      ]);
      setCapacities(Array.isArray(capsData) ? capsData : []);
      setCampuses(Array.isArray(campsData) ? campsData : []);
      
      // Auto-select first operating facility if available
      if (Array.isArray(campsData) && campsData.length > 0) {
        setForm(f => ({ ...f, campus_id: campsData[0].id }));
      }
    } catch (err) {
      setError(err.message || "Failed to query storage hardware properties.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchRegistryAndCampuses();
    }
  }, [token]);

  const validateForm = () => {
    if (!form.campus_id) return "Please associate an operating facility or branch with this hardware record.";
    const qtyInt = parseInt(form.quantity, 10);
    if (isNaN(qtyInt) || qtyInt < 0) return "Physical hardware quantity must be a non-negative integer.";
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
        campus_id: parseInt(form.campus_id, 10),
        capacity_tier: form.capacity_tier,
        location: form.location,
        quantity: parseInt(form.quantity, 10)
      };

      await createServerCapacity(token, payload);
      setSuccess("Server storage profile mapped successfully.");
      
      // Reset numeric count but preserve current selection states
      setForm(f => ({ ...f, quantity: "" }));
      
      // Refresh registry
      const updatedCaps = await getServerCapacities(token);
      setCapacities(Array.isArray(updatedCaps) ? updatedCaps : []);
    } catch (err) {
      setError(err.message || "Failed to save server storage configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this storage capacity inventory entry?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteServerCapacity(token, id);
      setSuccess("Server storage allocation record deleted.");
      
      // Refresh registry
      const updatedCaps = await getServerCapacities(token);
      setCapacities(Array.isArray(updatedCaps) ? updatedCaps : []);
    } catch (err) {
      setError(err.message || "Failed to remove inventory record.");
    }
  };

  // Maps physical facility/branch database entries to records for display
  const resolveCampusDetails = (campusId) => {
    const campus = campuses.find(c => c.id === campusId);
    return campus ? `${campus.name} (${campus.code})` : `Facility / Site ID: ${campusId}`;
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none font-sans">
      {/* Title block */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-500" />
            <span>DICT Annex 1: Server Storage Capacity Registry (Section 1.3)</span>
          </h2>
          <p className="text-slate-400 mt-1">
            Audit and record agency server locations, operational facilities, and physical storage capacity profiles.
          </p>
        </div>
        <button
          onClick={fetchRegistryAndCampuses}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Records</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/20 border border-red-900 text-red-400 font-bold rounded-lg flex items-center gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-800 text-emerald-400 font-bold rounded-lg flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Record Entry Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit shadow-sm">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Plus className="w-4 h-4 text-blue-500" />
            <span>Map Storage Hardware</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Operating Facility / Branch Location
            </label>
            <select
              value={form.campus_id}
              onChange={e => setForm({ ...form, campus_id: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white outline-none cursor-pointer focus:border-blue-500"
              required
            >
              <option value="" disabled>Select operating facility or branch...</option>
              {campuses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Storage Tier Capacity</label>
            <select
              value={form.capacity_tier}
              onChange={e => setForm({ ...form, capacity_tier: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white outline-none cursor-pointer focus:border-blue-500"
            >
              <option value="Above 4TB">Above 4TB</option>
              <option value="2TB to 4TB">2TB to 4TB</option>
              <option value="Below 2TB">Below 2TB</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Site Deployment Classification</label>
            <select
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white outline-none cursor-pointer focus:border-blue-500"
            >
              <option value="IN-HOUSE">IN-HOUSE (On-Premises Server Room)</option>
              <option value="CO-LOCATED">CO-LOCATED (External Datacenter)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Server Count Quantity</label>
            <input
              type="number"
              min="0"
              placeholder="e.g. 5"
              value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono outline-none focus:border-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting || campuses.length === 0}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all disabled:opacity-50 shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Preserving..." : "Save Record"}</span>
          </button>
        </form>

        {/* Storage Hardwares Table Grid */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <HardDrive className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading inventory data...</span>
              </div>
            ) : capacities.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-955/60">
                    <th className="py-2.5 px-3">Operating Facility / Branch Location</th>
                    <th className="py-2.5 px-3">HDD Storage Tier</th>
                    <th className="py-2.5 px-3">Deployment Location</th>
                    <th className="py-2.5 px-3 text-center">Count</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {capacities.map(c => (
                    <tr key={c.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-200">
                        {resolveCampusDetails(c.campus_id)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                          <span>{c.capacity_tier}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded border ${
                          c.location === "IN-HOUSE"
                            ? "bg-blue-950/40 border-blue-900 text-blue-300"
                            : "bg-purple-950/40 border-purple-900 text-purple-300"
                        }`}>
                          <MapPin className="w-3 h-3" />
                          <span>{c.location}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-center text-blue-400">{c.quantity}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No storage server capacity allocations recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}