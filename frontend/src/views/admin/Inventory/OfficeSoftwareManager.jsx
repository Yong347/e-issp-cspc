// frontend/src/views/admin/Inventory/OfficeSoftwareManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getSoftwareCensus,
  createSoftwareCensus,
  deleteSoftwareCensus
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle,
  FileCode,
  Layers,
  Hash
} from "lucide-react";

export default function OfficeSoftwareManager() {
  const { user } = useAuth();
  const [census, setCensus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    software_name: "",
    license_count: 0
  });

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchCensusList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSoftwareCensus(user.token);
      setCensus(data);
    } catch (err) {
      setError(err.message || "Failed to load office software census properties.");
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
    if (!form.software_name.trim()) return "Software platform name is required.";
    if (form.license_count < 0) return "License count cannot be a negative value.";
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
        software_name: form.software_name.trim(),
        license_count: parseInt(form.license_count, 10) || 0
      };

      await createSoftwareCensus(user.token, payload);
      setSuccess("Software census entry recorded successfully.");

      // Reset form
      setForm({
        software_name: "",
        license_count: 0
      });
      fetchCensusList();
    } catch (err) {
      setError(err.message || "Failed to preserve software census record.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this software license census record?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteSoftwareCensus(user.token, id);
      setSuccess("Software census record removed successfully.");
      fetchCensusList();
    } catch (err) {
      setError(err.message || "Failed to purge software platform from census.");
    }
  };

  const filteredCensus = census.filter(c =>
    c.software_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalLicenses = census.reduce((sum, item) => sum + (item.license_count || 0), 0);

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title Header Banner */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-500" />
            <span>DICT Section 2.2: SUC Office Software Census Registry</span>
          </h2>
          <p className="text-slate-400 mt-1">
            Track license counts and software assets for office suites, database structures, and platform configurations.
          </p>
        </div>
        <div className="bg-slate-950 px-4 py-2 rounded-lg border border-slate-850 flex items-center gap-3">
          <Layers className="w-4 h-4 text-blue-400" />
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Total Seats Logged:</span>
            <span className="font-mono text-white font-bold text-sm">{totalLicenses.toLocaleString()}</span>
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
        {/* Registration Form Box */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            <Plus className="w-4 h-4 text-blue-500" />
            <span>Record Software Asset</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Software Platform / Name</label>
            <input
              type="text"
              placeholder="e.g. Microsoft Office Professional 2021"
              value={form.software_name}
              onChange={e => setForm({ ...form, software_name: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-semibold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">License Volume / Counts</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Hash className="w-3.5 h-3.5" />
              </span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.license_count}
                onChange={e => setForm({ ...form, license_count: parseInt(e.target.value, 10) || 0 })}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono font-bold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all pt-2"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Documenting..." : "Save Record"}</span>
          </button>
        </form>

        {/* Inventory Directory */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Search Controls */}
          <div className="flex gap-3 border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search software products..."
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
                <FileCode className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading SUC software census registry...</span>
              </div>
            ) : filteredCensus.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-3/4">SoftwarePlatform / Suite Name</th>
                    <th className="py-2.5 px-2 w-1/4">Seat Count / Licenses</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredCensus.map(c => (
                    <tr key={c.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-2 text-slate-200 font-bold leading-relaxed">{c.software_name}</td>
                      <td className="py-3 px-2 font-mono font-bold text-blue-400">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-950 border border-slate-850 rounded">
                          <span>{c.license_count.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500 font-normal">seats</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end">
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
                No matching software platforms or applications registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}