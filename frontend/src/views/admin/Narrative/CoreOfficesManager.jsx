// frontend/src/views/admin/Narrative/CoreOfficesManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getOfficeFunctions,
  createOfficeFunction,
  updateOfficeFunction,
  deleteOfficeFunction
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Edit,
  Building,
  Search,
  X,
  AlertCircle,
  CheckCircle,
  Briefcase,
  Layers,
  Filter
} from "lucide-react";

export default function CoreOfficesManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    office_name: "",
    division: "Administration",
    description: ""
  });
  const [editId, setEditId] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDivision, setFilterDivision] = useState("All");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchOfficesList = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOfficeFunctions(user.token, activeCycle);
      setOffices(data);
    } catch (err) {
      setError(err.message || "Failed to load SUC core offices directory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchOfficesList();
    }
  }, [user, activeCycle]);

  const validateForm = () => {
    if (!form.office_name.trim()) return "Office name is required.";
    if (!form.description.trim()) return "Functional description of SUC office is required.";
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
        office_name: form.office_name.trim(),
        division: form.division,
        description: form.description.trim()
      };

      if (editId) {
        await updateOfficeFunction(user.token, editId, payload);
        setSuccess("Office profile updated successfully.");
      } else {
        await createOfficeFunction(user.token, activeCycle, payload);
        setSuccess("Office profile documented successfully.");
      }

      // Reset Form State
      setForm({
        office_name: "",
        division: "Administration",
        description: ""
      });
      setEditId(null);
      fetchOfficesList();
    } catch (err) {
      setError(err.message || "Failed to save core office metrics.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (o) => {
    setError(null);
    setSuccess(null);
    setEditId(o.id);
    setForm({
      office_name: o.office_name,
      division: o.division,
      description: o.description
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      office_name: "",
      division: "Administration",
      description: ""
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this office and its legal descriptions?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteOfficeFunction(user.token, id);
      setSuccess("Office documented registry cleared.");
      fetchOfficesList();
    } catch (err) {
      setError(err.message || "Failed to delete office profile.");
    }
  };

  const filteredOffices = offices.filter(o => {
    const matchesSearch = 
      o.office_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDivision = filterDivision === "All" || o.division === filterDivision;
    
    return matchesSearch && matchesDivision;
  });

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <Building className="w-5 h-5 text-purple-500" />
            <span>Annex A-3: Core SUC Offices Directory</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage physical college administrative units, divisions, and legally mandated organizational roles.</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 bg-purple-950/40 border border-purple-900 rounded font-bold font-mono text-purple-400 uppercase tracking-wider">
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
        {/* Editor Form Box */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editId ? <Edit className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-purple-500" />}
            <span>{editId ? "Update Office Profile" : "Document Office Profile"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Office Name</label>
            <input
              type="text"
              placeholder="e.g. Office of the SUC President"
              value={form.office_name}
              onChange={e => setForm({ ...form, office_name: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Organizational Division</label>
            <select
              value={form.division}
              onChange={e => setForm({ ...form, division: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
            >
              <option value="Administration">Administration</option>
              <option value="Academic">Academic</option>
              <option value="Research">Research & Extension</option>
              <option value="Finance">Finance</option>
              <option value="Support">Academic Support</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Functional Responsibilities</label>
            <textarea
              placeholder="Mandated functions, legal responsibilities, or workflow definitions..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white h-36 resize-none leading-relaxed"
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
                  : "bg-purple-600 hover:bg-purple-500 w-full"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Preserving..." : editId ? "Update Profile" : "Save Profile"}</span>
            </button>
          </div>
        </form>

        {/* Directory Search Panel */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Filtering Controls */}
          <div className="flex flex-col md:flex-row gap-3 justify-between items-center border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search offices or responsibilities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-955 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Division:</span>
              <select
                value={filterDivision}
                onChange={e => setFilterDivision(e.target.value)}
                className="p-1.5 bg-slate-950 border border-slate-850 rounded text-[10px] font-bold text-white uppercase tracking-wide cursor-pointer focus:outline-none"
              >
                <option value="All">ALL DIVISIONS</option>
                <option value="Administration">ADMINISTRATION</option>
                <option value="Academic">ACADEMIC</option>
                <option value="Research">RESEARCH & EXTENSION</option>
                <option value="Finance">FINANCE</option>
                <option value="Support">ACADEMIC SUPPORT</option>
              </select>
            </div>
          </div>

          {/* Table display */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <Building className="w-6 h-6 animate-pulse mx-auto mb-2 text-purple-500" />
                <span>Reading core offices directory...</span>
              </div>
            ) : filteredOffices.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-1/4">Office / Administrative Unit</th>
                    <th className="py-2.5 px-2 w-1/5">Division Category</th>
                    <th className="py-2.5 px-2 w-2/5">Functional Description</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {filteredOffices.map(o => (
                    <tr key={o.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-2 font-bold text-slate-200">
                        <span className="flex items-center gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{o.office_name}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center gap-1 bg-slate-950/40 px-2.5 py-1 border border-slate-850 rounded text-[9px] font-bold uppercase tracking-wide text-purple-400">
                          <Layers className="w-3 h-3 text-slate-500" />
                          <span>{o.division}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 leading-relaxed text-slate-400 truncate max-w-[240px] select-all" title={o.description}>
                        {o.description}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(o)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                            title="Edit Office Profile"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(o.id)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                            title="Purge Office Profile"
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
                No core offices mapped for category filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}