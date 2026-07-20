// frontend/src/views/admin/Inventory/OsCensusManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getOsCensus,
  createOsCensusRecord,
  updateOsCensusRecord,
  deleteOsCensusRecord
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
  Monitor,
  Server,
  Layers,
  Database
} from "lucide-react";

export default function OsCensusManager() {
  const { user } = useAuth();
  const [census, setCensus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    os_name: "",
    workstations_count: 0,
    servers_count: 0
  });
  const [editId, setEditId] = useState(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchCensusList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOsCensus(user.token);
      setCensus(data);
    } catch (err) {
      setError(err.message || "Failed to load client OS census directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchCensusList();
    }
  }, [user]);

  const validateForm = () => {
    if (!form.os_name.trim()) return "Operating System name is required.";
    if (form.workstations_count < 0) return "Workstations count cannot be negative.";
    if (form.servers_count < 0) return "Servers count cannot be negative.";
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
        os_name: form.os_name.trim(),
        workstations_count: parseInt(form.workstations_count, 10) || 0,
        servers_count: parseInt(form.servers_count, 10) || 0
      };

      if (editId) {
        await updateOsCensusRecord(user.token, editId, payload);
        setSuccess("Census record updated successfully.");
      } else {
        await createOsCensusRecord(user.token, payload);
        setSuccess("Census record registered successfully.");
      }

      // Reset Form
      setForm({
        os_name: "",
        workstations_count: 0,
        servers_count: 0
      });
      setEditId(null);
      fetchCensusList();
    } catch (err) {
      setError(err.message || "Failed to save OS census record.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item) => {
    setError(null);
    setSuccess(null);
    setEditId(item.id);
    setForm({
      os_name: item.os_name,
      workstations_count: item.workstations_count,
      servers_count: item.servers_count
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      os_name: "",
      workstations_count: 0,
      servers_count: 0
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this operating system census record?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteOsCensusRecord(user.token, id);
      setSuccess("Operating system registry purged.");
      fetchCensusList();
    } catch (err) {
      setError(err.message || "Failed to delete census record.");
    }
  };

  // Aggregated summaries
  const totalWorkstations = census.reduce((sum, item) => sum + (item.workstations_count || 0), 0);
  const totalServers = census.reduce((sum, item) => sum + (item.servers_count || 0), 0);
  const totalDevices = totalWorkstations + totalServers;

  const filteredCensus = census.filter(c =>
    c.os_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Header Block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-6 rounded-xl border border-slate-800 gap-4">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-500" />
            <span>DICT Section 2.1: Client OS License Census</span>
          </h2>
          <p className="text-slate-400 mt-1">Audit and record active operating system platforms, workstation installations, and network servers.</p>
        </div>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-blue-950/40 border border-blue-900 rounded-lg text-blue-400">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Workstations</div>
            <div className="text-xl font-mono font-bold text-white mt-0.5">{totalWorkstations.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-purple-950/40 border border-purple-900 rounded-lg text-purple-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Servers</div>
            <div className="text-xl font-mono font-bold text-white mt-0.5">{totalServers.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
          <div className="p-3 bg-emerald-950/40 border border-emerald-900 rounded-lg text-emerald-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Overall Installations</div>
            <div className="text-xl font-mono font-bold text-white mt-0.5">{totalDevices.toLocaleString()}</div>
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
        {/* Editor Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editId ? <Edit className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-blue-500" />}
            <span>{editId ? "Update OS Platform" : "Add OS Platform"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Operating System platform</label>
            <input
              type="text"
              placeholder="e.g. Windows 11 Enterprise"
              value={form.os_name}
              onChange={e => setForm({ ...form, os_name: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Workstations Count</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={form.workstations_count}
              onChange={e => setForm({ ...form, workstations_count: parseInt(e.target.value, 10) || 0 })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Servers Count</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={form.servers_count}
              onChange={e => setForm({ ...form, servers_count: parseInt(e.target.value, 10) || 0 })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono"
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
                  : "bg-blue-600 hover:bg-blue-500 w-full"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Preserving..." : editId ? "Update Platform" : "Save Platform"}</span>
            </button>
          </div>
        </form>

        {/* Directory Grid Table */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls */}
          <div className="flex gap-3 border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search operating systems..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>
          </div>

          {/* Table list */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <Layers className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading physical license registers...</span>
              </div>
            ) : filteredCensus.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-1/2">Operating System platform</th>
                    <th className="py-2.5 px-2">Workstations</th>
                    <th className="py-2.5 px-2">Servers</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredCensus.map(c => (
                    <tr key={c.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-2 font-bold text-slate-200">{c.os_name}</td>
                      <td className="py-3 px-2 font-mono text-slate-300 font-semibold">{c.workstations_count.toLocaleString()}</td>
                      <td className="py-3 px-2 font-mono text-slate-300 font-semibold">{c.servers_count.toLocaleString()}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(c)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                            title="Edit Record"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                            title="Purge Record"
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
                No matching client operating platforms listed.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}