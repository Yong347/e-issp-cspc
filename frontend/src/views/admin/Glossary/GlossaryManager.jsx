// frontend/src/views/admin/Glossary/GlossaryManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getGlossary,
  createGlossaryTerm,
  updateGlossaryTerm,
  deleteGlossaryTerm
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Edit,
  BookOpen,
  Search,
  X,
  AlertCircle,
  CheckCircle,
  HelpCircle
} from "lucide-react";

export default function GlossaryManager() {
  const { user } = useAuth();
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    term: "",
    definition: ""
  });
  const [editId, setEditId] = useState(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchGlossaryTerms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGlossary(user.token);
      setTerms(data);
    } catch (err) {
      setError(err.message || "Failed to load glossary definitions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchGlossaryTerms();
    }
  }, [user]);

  const validateForm = () => {
    if (!form.term.trim()) return "Glossary term keyword or acronym is required.";
    if (!form.definition.trim()) return "Glossary term descriptive definition is required.";
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
        term: form.term.trim(),
        definition: form.definition.trim()
      };

      if (editId) {
        await updateGlossaryTerm(user.token, editId, payload);
        setSuccess("Glossary term updated successfully.");
      } else {
        await createGlossaryTerm(user.token, payload);
        setSuccess("Glossary term preserved in database registry.");
      }

      // Reset form
      setForm({
        term: "",
        definition: ""
      });
      setEditId(null);
      fetchGlossaryTerms();
    } catch (err) {
      setError(err.message || "Failed to save glossary term.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (t) => {
    setError(null);
    setSuccess(null);
    setEditId(t.id);
    setForm({
      term: t.term,
      definition: t.definition
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      term: "",
      definition: ""
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this definition of terms entry?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteGlossaryTerm(user.token, id);
      setSuccess("Glossary term removed from registry.");
      fetchGlossaryTerms();
    } catch (err) {
      setError(err.message || "Failed to delete glossary entry.");
    }
  };

  const filteredTerms = terms.filter(t =>
    t.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.definition.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Title Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <span>Definition of Terms & Glossary (Pages 6-10)</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage physical legal terms and DICT standard technical definitions preserved across ISSP compiling jobs.</p>
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
        {/* Editor Form Box */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editId ? <Edit className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-blue-500" />}
            <span>{editId ? "Update Vocabulary Entry" : "Register Vocabulary Term"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Acronym / Keyword Term</label>
            <input
              type="text"
              placeholder="e.g. MITHI or ISSP"
              value={form.term}
              onChange={e => setForm({ ...form, term: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white font-mono font-bold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Descriptive Definition</label>
            <textarea
              placeholder="Technical or SUC operational definition mapping to this term..."
              value={form.definition}
              onChange={e => setForm({ ...form, definition: e.target.value })}
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white h-40 resize-none leading-relaxed text-xs"
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
              <span>{submitting ? "Preserving..." : editId ? "Update Term" : "Save Term"}</span>
            </button>
          </div>
        </form>

        {/* Directory Grid */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {/* Controls */}
          <div className="flex gap-3 border-b border-slate-850 pb-4">
            <div className="relative w-full md:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search vocabulary terms or definitions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white placeholder-slate-500 text-xs"
              />
            </div>
          </div>

          {/* Table List View */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <BookOpen className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading physical dictionary indices...</span>
              </div>
            ) : filteredTerms.length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-850 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-2 w-1/4">Acronym / Term</th>
                    <th className="py-2.5 px-2 w-3/4">Descriptive Legal Definition</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredTerms.map(t => (
                    <tr key={t.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-2 font-bold font-mono text-blue-400 flex items-center gap-1.5 self-start pt-3.5">
                        <HelpCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>{t.term}</span>
                      </td>
                      <td className="py-3 px-2 text-slate-300 leading-relaxed max-w-lg break-words whitespace-pre-wrap">{t.definition}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                            title="Edit Term"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                            title="Purge Term"
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
                No matching glossary vocabulary items registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}