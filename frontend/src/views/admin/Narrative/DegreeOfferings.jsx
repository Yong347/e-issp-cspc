// frontend/src/views/admin/Narrative/DegreeOfferings.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { 
  getDegrees, 
  createDegree, 
  updateDegree, 
  deleteDegree 
} from "../../../api/admin";
import { 
  Save, 
  Trash2, 
  Plus, 
  Edit3, 
  GraduationCap, 
  Award, 
  Search, 
  X, 
  AlertCircle, 
  CheckCircle,
  Filter
} from "lucide-react";

export default function DegreeOfferings() {
  const { user } = useAuth();
  const [degrees, setDegrees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form State
  const [form, setForm] = useState({
    department_name: "",
    degree_name: "",
    level: "Undergraduate",
    accreditation_status: ""
  });
  const [editId, setEditId] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLevel, setFilterLevel] = useState("All");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchDegreesList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDegrees(user.token);
      setDegrees(data);
    } catch (err) {
      setError(err.message || "Failed to load academic programs registry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchDegreesList();
    }
  }, [user]);

  const validateForm = () => {
    if (!form.department_name.trim()) return "Department or College name is required.";
    if (!form.degree_name.trim()) return "Academic program/Degree name is required.";
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
        department_name: form.department_name.trim(),
        degree_name: form.degree_name.trim(),
        level: form.level,
        accreditation_status: form.accreditation_status.trim() || "Not Accredited"
      };

      if (editId) {
        await updateDegree(user.token, editId, payload);
        setSuccess("Academic program updated successfully.");
      } else {
        await createDegree(user.token, payload);
        setSuccess("Academic program added to registry.");
      }

      // Reset form
      setForm({
        department_name: "",
        degree_name: "",
        level: "Undergraduate",
        accreditation_status: ""
      });
      setEditId(null);
      fetchDegreesList();
    } catch (err) {
      setError(err.message || "Failed to save academic program.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (d) => {
    setError(null);
    setSuccess(null);
    setEditId(d.id);
    setForm({
      department_name: d.department_name,
      degree_name: d.degree_name,
      level: d.level,
      accreditation_status: d.accreditation_status || ""
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      department_name: "",
      degree_name: "",
      level: "Undergraduate",
      accreditation_status: ""
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this academic program?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteDegree(user.token, id);
      setSuccess("Academic program removed from registry.");
      fetchDegreesList();
    } catch (err) {
      setError(err.message || "Failed to delete academic program.");
    }
  };

  // Filter and Search logic
  const filteredDegrees = degrees.filter(d => {
    const matchesSearch = 
      d.degree_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.department_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.accreditation_status && d.accreditation_status.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesLevel = filterLevel === "All" || d.level === filterLevel;
    
    return matchesSearch && matchesLevel;
  });

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title block */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-500" />
            <span>Annex A-4 Academic Program Offerings Directory</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage physical CHED degree offerings and legal accreditation levels.</p>
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
            {editId ? <Edit3 className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-blue-500" />}
            <span>{editId ? "Update Academic Program" : "Register Academic Program"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">College / Department Name</label>
            <input
              type="text"
              placeholder="e.g. College of Engineering"
              value={form.department_name}
              onChange={e => setForm({ ...form, department_name: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Degree / Program Title</label>
            <input
              type="text"
              placeholder="e.g. BS Civil Engineering"
              value={form.degree_name}
              onChange={e => setForm({ ...form, degree_name: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Program Level</label>
            <select
              value={form.level}
              onChange={e => setForm({ ...form, level: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
            >
              <option value="Undergraduate">Undergraduate Degree</option>
              <option value="Graduate">Graduate / Masteral Degree</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
              <span>Accreditation Status</span>
              <span className="text-[9px] text-slate-500 normal-case">Optional</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Level III Re-Accredited"
              value={form.accreditation_status}
              onChange={e => setForm({ ...form, accreditation_status: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
            />
            <p className="text-[10px] text-slate-500">Defaults to "Not Accredited" if left blank.</p>
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
              <span>{submitting ? "Preserving..." : editId ? "Update Program" : "Save Program"}</span>
            </button>
          </div>
        </form>

        {/* Records Directory Grid */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row gap-3 justify-between items-center border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search by college or degree..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Classification:</span>
              <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-850">
                {["All", "Undergraduate", "Graduate"].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFilterLevel(level)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                      filterLevel === level 
                        ? "bg-blue-600 text-white" 
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Directory Listings */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <GraduationCap className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading physical program directory...</span>
              </div>
            ) : filteredDegrees.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-1/3">Department / College</th>
                    <th className="py-2.5 px-2 w-1/3">Academic Program</th>
                    <th className="py-2.5 px-2">Level</th>
                    <th className="py-2.5 px-2">Accreditation Level</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredDegrees.map(d => (
                    <tr key={d.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-2 font-bold text-slate-200">{d.department_name}</td>
                      <td className="py-3 px-2 text-slate-300 font-mono">{d.degree_name}</td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase ${
                          d.level === "Graduate" 
                            ? "bg-purple-950/40 border border-purple-800 text-purple-300" 
                            : "bg-blue-950/40 border border-blue-800 text-blue-300"
                        }`}>
                          {d.level}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="flex items-center gap-1 font-semibold text-emerald-400">
                          <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{d.accreditation_status || "Not Accredited"}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(d)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                            title="Edit Record"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(d.id)}
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
                No matching academic program offerings logged.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}