// frontend/src/views/admin/Glossary/GlossaryManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getGlossary,
  createGlossaryTerm,
  updateGlossaryTerm,
  deleteGlossaryTerm
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
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
  Info,
  Copy,
  Check,
  Sparkles,
  Download
} from "lucide-react";

// Canonical DICT ISSP Statutory Glossary Presets
const CANONICAL_DICT_TERMS = [
  {
    term: "DICT",
    definition: "Department of Information and Communications Technology – The executive department of the Philippine government responsible for the planning, development, and promotion of the national ICT agenda in support of national development."
  },
  {
    term: "MITHI",
    definition: "Medium-Term Information and Technology Harmonization Initiative – An inter-agency initiative (DBM, DICT, NEDA) aimed at harmonizing government ICT investments to optimize public resources and eliminate redundancies."
  },
  {
    term: "ISSP",
    definition: "Information Systems Strategic Plan – A statutory three-year strategic blueprint that outlines an agency's overall ICT strategy, operational information systems, infrastructure roadmaps, and budgetary requirements."
  },
  {
    term: "PeGIF",
    definition: "Philippine e-Government Interoperability Framework – Technical, organizational, and semantic specifications designed to enable seamless data exchange, unified digital identity, and API interconnectivity among government agencies."
  },
  {
    term: "GovNet",
    definition: "Government Network – High-speed fiber-optic network infrastructure deployed by DICT to interconnect national government agencies, state universities, and field offices for secure digital communications."
  },
  {
    term: "GovCloud",
    definition: "Government Cloud – Secure, multi-tenant cloud hosting infrastructure managed by DICT, providing scalable virtual compute, containerized clusters, and offsite disaster recovery storage for public sector services."
  },
  {
    term: "PNPKI",
    definition: "Philippine National Public Key Infrastructure – The national cryptographic certification authority operated by DICT that issues digital certificates ensuring confidentiality, integrity, authenticity, and non-repudiation in electronic transactions."
  },
  {
    term: "DPA",
    definition: "Data Privacy Act of 2012 (Republic Act No. 10173) – Comprehensive statutory law mandating the protection and security of personal and sensitive personal information processed by government agencies and private entities."
  },
  {
    term: "UACS",
    definition: "Unified Accounts Code Structure – Standardized government-wide coding framework jointly developed by DBM, COA, and DOF to harmonize budget classification, expenditure monitoring, and accounting across the bureaucracy."
  },
  {
    term: "CO",
    definition: "Capital Outlay – Budgetary appropriation classification for expenditures intended for the acquisition of physical assets, IT infrastructure, perpetual software licenses, and systems whose utility extends beyond one fiscal year."
  },
  {
    term: "MOOE",
    definition: "Maintenance and Other Operating Expenses – Budgetary classification covering recurrent operational expenditures necessary for day-to-day government operations, including software-as-a-service subscriptions, utilities, and maintenance contracts."
  },
  {
    term: "DRBCP",
    definition: "Disaster Recovery and Business Continuity Plan – Mandatory institutional protocol establishing emergency procedures, technical failovers, Recovery Time Objectives (RTO), and Recovery Point Objectives (RPO) to safeguard government data and services."
  }
];

export default function GlossaryManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Form State
  const [form, setForm] = useState({
    term: "",
    definition: ""
  });
  const [editId, setEditId] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLetter, setActiveLetter] = useState("ALL");
  const [copiedId, setCopiedId] = useState(null);

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token =
    user?.token ||
    user?.accessToken ||
    (typeof window !== "undefined"
      ? localStorage.getItem("token") || localStorage.getItem("access_token")
      : "");

  const fetchGlossaryTerms = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getGlossary(token);
      setTerms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load glossary definitions.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchGlossaryTerms();
  }, [fetchGlossaryTerms]);

  // Handle escape key to cancel edit mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && editId !== null) {
        handleCancelEdit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editId]);

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
        await updateGlossaryTerm(token, editId, payload);
        setSuccess(`Glossary term '${payload.term}' updated successfully.`);
      } else {
        await createGlossaryTerm(token, payload);
        setSuccess(`Glossary term '${payload.term}' cataloged in database registry.`);
      }

      setForm({ term: "", definition: "" });
      setEditId(null);
      await fetchGlossaryTerms();
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
    setForm({ term: "", definition: "" });
  };

  const handleDelete = async (id, termName) => {
    if (!window.confirm(`Are you sure you want to permanently remove '${termName}' from the Definition of Terms?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteGlossaryTerm(token, id);
      setSuccess(`Glossary term '${termName}' removed from registry.`);
      if (editId === id) handleCancelEdit();
      await fetchGlossaryTerms();
    } catch (err) {
      setError(err.message || "Failed to delete glossary entry.");
    }
  };

  // Seed Canonical DICT ISSP Glossary Terms
  const handleSeedDefaults = async () => {
    if (!token) return;
    setSeeding(true);
    setError(null);
    setSuccess(null);

    try {
      const existingTermsLower = new Set(
        terms.map((t) => (t.term || "").trim().toLowerCase())
      );

      const missing = CANONICAL_DICT_TERMS.filter(
        (c) => !existingTermsLower.has(c.term.trim().toLowerCase())
      );

      if (missing.length === 0) {
        setSuccess("All canonical DICT standard terms are already cataloged.");
        setSeeding(false);
        return;
      }

      let addedCount = 0;
      for (const item of missing) {
        try {
          await createGlossaryTerm(token, item);
          addedCount += 1;
        } catch {
          // Continue if any single term has duplicate conflicts
        }
      }

      setSuccess(`Successfully seeded ${addedCount} standard DICT definitions.`);
      await fetchGlossaryTerms();
    } catch (err) {
      setError(err.message || "Failed to seed standard definitions.");
    } finally {
      setSeeding(false);
    }
  };

  // Copy Definition to Clipboard
  const handleCopy = (id, textToCopy) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Export Glossary as CSV
  const handleExportCSV = () => {
    if (!terms.length) return;
    const headers = ["Order", "Acronym / Term", "Statutory Definition"];
    const rows = terms.map((t, idx) => [
      idx + 1,
      `"${(t.term || "").replace(/"/g, '""')}"`,
      `"${(t.definition || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ISSP_Definition_of_Terms_${activeCycle || "Cycle"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Available Alphabetical Initial Letters
  const availableLetters = useMemo(() => {
    const letters = new Set();
    terms.forEach((t) => {
      const first = (t.term || "").trim().charAt(0).toUpperCase();
      if (first && /[A-Z]/.test(first)) {
        letters.add(first);
      }
    });
    return Array.from(letters).sort();
  }, [terms]);

  // Filtered & Sorted Terms
  const filteredTerms = useMemo(() => {
    return terms
      .filter((t) => {
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !query ||
          (t.term || "").toLowerCase().includes(query) ||
          (t.definition || "").toLowerCase().includes(query);

        const firstChar = (t.term || "").trim().charAt(0).toUpperCase();
        const matchesLetter =
          activeLetter === "ALL" || firstChar === activeLetter;

        return matchesQuery && matchesLetter;
      })
      .sort((a, b) => (a.term || "").localeCompare(b.term || ""));
  }, [terms, searchQuery, activeLetter]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Definition of Terms &amp; Statutory Glossary (DICT Template Page 5)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Manage legal definitions, statutory acronyms, and DICT standard technical terminology compiled into the formal ISSP document.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 rounded-full font-bold font-mono uppercase tracking-wider">
            Cycle: FY {activeCycle || "2026-2028"}
          </span>

          {/* Seed Defaults Button */}
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding || loading}
            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 dark:text-purple-300 dark:border-purple-800/80 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs shadow-xs disabled:opacity-50"
            title="Populate canonical DICT ISSP terminology"
          >
            <Sparkles className={`w-3.5 h-3.5 text-purple-600 dark:text-purple-400 ${seeding ? "animate-spin" : ""}`} />
            <span>{seeding ? "Seeding..." : "Seed DICT Terms"}</span>
          </button>

          {/* Export CSV Button */}
          {terms.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer font-bold shadow-xs text-xs"
              title="Export Definitions as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          )}

          {/* Centralized Compiler Verification Action */}
          <CompilerSyncButton
            moduleName="glossary"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchGlossaryTerms}
            label="Save &amp; Verify Compiler Pipeline"
          />

          {/* Refresh Button */}
          <button
            onClick={fetchGlossaryTerms}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh Glossary Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Aggregate Metrics Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Defined Terms</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{terms.length} Definitions</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Template Alignment</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">DICT v.2026 Standard</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Compiled Placement</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">Section: Page 5</h3>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Editor Form Box */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs sticky top-4">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
              {editId ? <Edit className="w-4 h-4 text-amber-500" /> : <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
              <span>{editId ? "Update Vocabulary Entry" : "Register Vocabulary Term"}</span>
            </h3>
            {editId && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80">
                Editing #{editId}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                Acronym / Keyword Term <span className="text-rose-500">*</span>
              </label>
              <span className="text-[9.5px] text-slate-400 font-mono">
                {form.term.length} chars
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. MITHI, PeGIF, or CIO"
              value={form.term}
              onChange={e => setForm({ ...form, term: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-xs outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                Statutory or Agency Operational Definition <span className="text-rose-500">*</span>
              </label>
              <span className="text-[9.5px] text-slate-400 font-mono">
                {form.definition.length} chars
              </span>
            </div>
            <textarea
              rows={6}
              placeholder="Provide statutory, legal, or agency operational definition mapping to this term..."
              value={form.definition}
              onChange={e => setForm({ ...form, definition: e.target.value })}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
              required
            />
          </div>

          <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10.5px] text-blue-900 dark:text-blue-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Compiler Placement:</strong> All cataloged definitions are automatically sorted alphabetically and compiled on <strong>Page 5</strong> of the generated ISSP document before Part I.
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            {editId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-slate-300 dark:border-slate-700 text-xs"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm text-xs ${
                editId 
                  ? "bg-amber-600 hover:bg-amber-500 w-2/3" 
                  : "bg-blue-600 hover:bg-blue-500 w-full"
              } disabled:opacity-50`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Preserving..." : editId ? "Update Entry" : "Save Entry"}</span>
            </button>
          </div>
        </form>

        {/* Right Column: Directory Grid */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Search vocabulary terms or definitions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Displaying {filteredTerms.length} of {terms.length} entries
            </span>
          </div>

          {/* Alphabetical Quick Jump Navigation */}
          {availableLetters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
              <button
                type="button"
                onClick={() => setActiveLetter("ALL")}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  activeLetter === "ALL"
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                ALL
              </button>
              {availableLetters.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setActiveLetter(letter)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    activeLetter === letter
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}

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
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] font-mono bg-slate-50 dark:bg-slate-950">
                    <th className="py-2.5 px-3 w-1/4">Acronym / Term</th>
                    <th className="py-2.5 px-3 w-7/12">Descriptive Statutory Definition</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredTerms.map((t) => {
                    const isEditing = editId === t.id;
                    const isCopied = copiedId === t.id;

                    return (
                      <tr
                        key={t.id}
                        className={`transition-colors ${
                          isEditing
                            ? "bg-amber-50/70 dark:bg-amber-950/30 border-l-4 border-amber-500"
                            : "hover:bg-slate-50/70 dark:hover:bg-slate-950/40"
                        }`}
                      >
                        <td className="py-3 px-3 font-bold font-mono text-blue-600 dark:text-blue-400 align-top">
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs">{t.term}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300 leading-relaxed max-w-lg break-words whitespace-pre-wrap align-top">
                          {t.definition}
                        </td>
                        <td className="py-3 px-3 text-right align-top">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopy(t.id, `${t.term}: ${t.definition}`)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Copy term and definition"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(t)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Edit Term"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(t.id, t.term)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Purge Term"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 space-y-3">
                <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="italic">
                  {searchQuery || activeLetter !== "ALL"
                    ? "No glossary items match your search criteria."
                    : "No statutory vocabulary items cataloged yet."}
                </p>
                {terms.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedDefaults}
                    disabled={seeding}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold inline-flex items-center gap-2 cursor-pointer shadow-xs text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Seed Canonical DICT Definitions</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}