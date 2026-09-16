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
  HelpCircle,
  RefreshCw,
  Layers,
  FileText,
  Info
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
      setTerms(Array.isArray(data) ? data : []);
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
    if (!form.definition.trim()) return "Descriptive statutory definition is required.";
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      term: "",
      definition: ""
    });
  };

  const handleDelete = async (id, termName) => {
    if (!window.confirm(`Are you sure you want to permanently remove '${termName}' from the Definition of Terms?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteGlossaryTerm(user.token, id);
      setSuccess(`Glossary term '${termName}' removed from registry.`);
      fetchGlossaryTerms();
    } catch (err) {
      setError(err.message || "Failed to delete glossary entry.");
    }
  };

  const filteredTerms = terms.filter(t =>
    (t.term || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.definition || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Definition of Terms & Statutory Glossary (DICT Template Page 5)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage legal definitions, statutory acronyms, and DICT standard technical terminology compiled into the formal ISSP document.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchGlossaryTerms}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold"
            title="Refresh Glossary Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Glossary</span>
          </button>
        </div>
      </div>

      {/* Aggregate Metrics Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Defined Terms</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{terms.length} Definitions</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Template Alignment</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">DICT v.2026 Standard</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Compiled Placement</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">Section: Page 5</h3>
          </div>
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
        
        {/* Left Column: Editor Form Box */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 h-fit shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            {editId ? <Edit className="w-4 h-4 text-amber-500" /> : <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            <span>{editId ? "Update Vocabulary Entry" : "Register Vocabulary Term"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Acronym / Keyword Term
            </label>
            <input
              type="text"
              placeholder="e.g. MITHI, PeGIF, or CIO"
              value={form.term}
              onChange={e => setForm({ ...form, term: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-xs outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Statutory or Agency Operational Definition
            </label>
            <textarea
              placeholder="Statutory or agency operational definition mapping to this term..."
              value={form.definition}
              onChange={e => setForm({ ...form, definition: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white h-40 resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/40 rounded-lg text-[10.5px] text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Compiler Standard:</strong> These definitions are rendered on Page 5 of the generated ISSP document before Part I.
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            {editId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-slate-300 dark:border-slate-700"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`py-2.5 rounded-lg font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm ${
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

        {/* Right Column: Directory Grid */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-850 pb-4">
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search vocabulary terms or definitions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Displaying {filteredTerms.length} of {terms.length} entries
            </span>
          </div>

          {/* Table List View */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <BookOpen className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading dictionary indices...</span>
              </div>
            ) : filteredTerms.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-850 text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-50 dark:bg-slate-955">
                    <th className="py-2.5 px-3 w-1/4">Acronym / Term</th>
                    <th className="py-2.5 px-3 w-3/4">Descriptive Statutory Definition</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredTerms.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-955/20 transition-colors">
                      <td className="py-3 px-3 font-bold font-mono text-blue-600 dark:text-blue-400 align-top">
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{t.term}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300 leading-relaxed max-w-lg break-words whitespace-pre-wrap align-top">
                        {t.definition}
                      </td>
                      <td className="py-3 px-3 text-right align-top">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(t)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                            title="Edit Term"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id, t.term)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-red-955 rounded text-slate-400 hover:text-rose-600 dark:hover:text-red-400 cursor-pointer transition-colors"
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
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
                No matching glossary vocabulary items registered.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}