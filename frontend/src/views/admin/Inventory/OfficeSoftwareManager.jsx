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
  Hash,
  RefreshCw,
  Info
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
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSoftwareCensus(user.token);
      setCensus(Array.isArray(data) ? data : []);
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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to permanently remove '${name}' from the software license census?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteSoftwareCensus(user.token, id);
      setSuccess(`Software census record for '${name}' removed successfully.`);
      fetchCensusList();
    } catch (err) {
      setError(err.message || "Failed to purge software platform from census.");
    }
  };

  const filteredCensus = census.filter(c =>
    (c.software_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalLicenses = census.reduce((sum, item) => sum + (item.license_count || 0), 0);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      {/* Title Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Annex 1 Section 2: Office Software & Applications Census</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Track license counts and software assets for office productivity suites, database management systems, and specialized agency platforms.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 dark:bg-slate-955 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-850 flex items-center gap-3">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">Total Seats Logged:</span>
              <span className="font-mono text-slate-900 dark:text-white font-bold text-sm">{totalLicenses.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={fetchCensusList}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold"
            title="Refresh Census Registry"
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
        {/* Registration Form Box */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 h-fit shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Record Software Asset</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Software Platform / Name
            </label>
            <input
              type="text"
              placeholder="e.g. Microsoft Office 365 Professional / PostgreSQL Enterprise"
              value={form.software_name}
              onChange={e => setForm({ ...form, software_name: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              License Volume / Count (Seats)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Hash className="w-3.5 h-3.5" />
              </span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={form.license_count}
                onChange={e => setForm({ ...form, license_count: parseInt(e.target.value, 10) || 0 })}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-xs outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Annex 1 Section 2 Integration:</strong> This census documents operating software licenses (perpetual and subscription) deployed across central and regional operating divisions.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm text-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? "Documenting..." : "Save Record"}</span>
          </button>
        </form>

        {/* Inventory Directory */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
          {/* Search Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-850 pb-4">
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search software products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-[10px] font-mono text-slate-500 self-end sm:self-auto">
              Showing {filteredCensus.length} of {census.length} Records
            </span>
          </div>

          {/* Table list */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Reading office software census registry...</span>
              </div>
            ) : filteredCensus.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50 dark:bg-slate-955">
                    <th className="py-2.5 px-3 w-3/4">Software Platform / Suite Name</th>
                    <th className="py-2.5 px-3 w-1/4">Seat Count / Licenses</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredCensus.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-3 text-slate-900 dark:text-slate-200 font-bold leading-relaxed">
                        {c.software_name}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded">
                          <span>{Number(c.license_count || 0).toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500 font-normal">seats</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleDelete(c.id, c.software_name)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-red-955 rounded text-slate-400 hover:text-rose-600 dark:hover:text-red-400 cursor-pointer transition-colors"
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
              <div className="text-center py-20 text-slate-400 italic">
                No matching software platforms or applications registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}