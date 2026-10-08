// frontend/src/views/admin/Narrative/OrganizationalOutcomes.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getOutcomes, 
  createOutcome, 
  updateOutcome, 
  deleteOutcome 
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  GraduationCap, 
  BookOpen, 
  Search, 
  Save, 
  HelpCircle, 
  Layers, 
  Tag, 
  Info, 
  Filter, 
  X,
  SlidersHorizontal,
  Link2,
  FileText
} from "lucide-react";

export default function OrganizationalOutcomes() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Data States
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState(null);
  const [outcomeName, setOutcomeName] = useState("");
  const [typeLabel, setTypeLabel] = useState("Organizational Outcome");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [description, setDescription] = useState("");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("All");

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = user?.token || localStorage.getItem("access_token") || "";

  // ==========================================================
  // DATA FETCHING & SYNCHRONIZATION
  // ==========================================================
  const fetchOutcomes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOutcomes(token, activeCycle);
      setOutcomes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load organizational outcomes directory.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCycle]);

  useEffect(() => {
    if (token) {
      fetchOutcomes();
    }
  }, [token, fetchOutcomes]);

  // Reset form inputs
  const resetForm = () => {
    setEditingId(null);
    setOutcomeName("");
    setDescription("");
    setCustomTypeLabel("");
    setTypeLabel("Organizational Outcome");
  };

  // Populate form for editing
  const handleStartEdit = (o) => {
    setError(null);
    setSuccess(null);
    setEditingId(o.id);
    setOutcomeName(o.outcome_name || o.program_name || "");
    setDescription(o.description || "");

    const standardTypes = ["Organizational Outcome", "Strategic Objective", "Major Final Output"];
    if (standardTypes.includes(o.type_label)) {
      setTypeLabel(o.type_label);
      setCustomTypeLabel("");
    } else {
      setTypeLabel("Other");
      setCustomTypeLabel(o.type_label || "");
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    resetForm();
    setError(null);
  };

  // ==========================================================
  // FORM SUBMISSION (CREATE / UPDATE)
  // ==========================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = outcomeName.trim();
    if (!trimmedName) {
      setError("Outcome name or program title is required.");
      return;
    }

    const effectiveType = typeLabel === "Other" ? customTypeLabel.trim() : typeLabel.trim();
    if (!effectiveType) {
      setError("Please specify a valid classification label.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        outcome_name: trimmedName,
        type_label: effectiveType,
        description: description.trim() || null,
        issp_period: activeCycle
      };

      if (editingId) {
        await updateOutcome(token, editingId, payload);
        setSuccess(`Program Outcome '${trimmedName}' updated successfully.`);
      } else {
        await createOutcome(token, payload);
        setSuccess(`Program Outcome '${trimmedName}' registered successfully.`);
      }

      resetForm();
      await fetchOutcomes();
    } catch (err) {
      setError(err.message || "Failed to save program outcome.");
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================================
  // DELETION WITH RELATIONAL INTEGRITY CHECK
  // ==========================================================
  const handleDelete = async (id, name, linkedCount = 0) => {
    const linkageWarning = linkedCount > 0 
      ? `\n\nWARNING: There are ${linkedCount} active resource proposal(s) currently linked to this outcome. Deleting it will be blocked by the server.` 
      : "";

    if (!window.confirm(
      `Confirm Deletion: Permanently remove outcome category '${name}'?${linkageWarning}\n\n` +
      `This action cannot be undone.`
    )) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      await deleteOutcome(token, id);
      setSuccess(`Outcome category '${name}' purged successfully.`);
      if (editingId === id) resetForm();
      await fetchOutcomes();
    } catch (err) {
      setError(err.message || "Failed to delete program outcome.");
    }
  };

  // ==========================================================
  // SUMMARY METRICS & CLASSIFICATION AGGREGATES
  // ==========================================================
  const totalCount = outcomes.length;
  const ooCount = outcomes.filter(o => (o.type_label || "").toLowerCase().includes("organizational")).length;
  const soCount = outcomes.filter(o => (o.type_label || "").toLowerCase().includes("strategic")).length;
  const mfoCount = outcomes.filter(o => (o.type_label || "").toLowerCase().includes("major") || (o.type_label || "").toLowerCase().includes("mfo")).length;
  const customCount = totalCount - (ooCount + soCount + mfoCount);

  // Dynamically collect unique types for the filter dropdown
  const availableFilterTypes = useMemo(() => {
    const types = new Set(["Organizational Outcome", "Strategic Objective", "Major Final Output"]);
    outcomes.forEach(o => {
      if (o.type_label) types.add(o.type_label);
    });
    return ["All", ...Array.from(types)];
  }, [outcomes]);

  // Filtered & Searched Directory Pipeline
  const filteredOutcomes = useMemo(() => {
    return outcomes.filter(o => {
      const q = searchQuery.toLowerCase().trim();
      const name = (o.outcome_name || o.program_name || "").toLowerCase();
      const type = (o.type_label || "").toLowerCase();
      const desc = (o.description || "").toLowerCase();

      const matchesSearch = q === "" || name.includes(q) || type.includes(q) || desc.includes(q);
      const matchesFilter = selectedTypeFilter === "All" || o.type_label === selectedTypeFilter;

      return matchesSearch && matchesFilter;
    });
  }, [outcomes, searchQuery, selectedTypeFilter]);

  const getTypeBadgeClass = (label) => {
    const l = (label || "").toLowerCase();
    if (l.includes("organizational")) {
      return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20";
    }
    if (l.includes("strategic")) {
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20";
    }
    if (l.includes("major") || l.includes("mfo")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20";
    }
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20";
  };

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Organizational Outcomes &amp; Strategic Program Framework</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Configure statutory institutional program categories (OO for NGAs, SO for GOCCs, MFO for SUCs/LGUs, or custom sectoral frameworks). These categories serve as mandatory relational anchors for Part II.A Strategic Concerns and Part IV.A procurement line items.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <span className="text-[10px] px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-full font-bold font-mono text-blue-700 dark:text-blue-400 uppercase tracking-wider">
            Cycle: FY {activeCycle || "2026-2028"}
          </span>

          {/* Universal Compiler Verification Pipeline Action */}
          <CompilerSyncButton
            moduleName="outcomes"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchOutcomes}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            onClick={fetchOutcomes}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh outcomes directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Outcomes</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalCount} Programs</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Organizational (OO)</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{ooCount} Programs</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Strategic (SO)</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{soCount} Programs</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              {customCount > 0 ? "MFO & Custom" : "Major Final Output"}
            </span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {mfoCount + customCount} Programs
            </h3>
          </div>
        </div>
      </div>

      {/* Alert Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Creation & Editing Form Column */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              {editingId ? (
                <>
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  <span>Update Outcome Category</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Configure Outcome Category</span>
                </>
              )}
            </h3>
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          {editingId && (
            <div className="p-3 bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 rounded-xl flex items-center justify-between text-[11px] font-mono">
              <span>Editing Outcome ID: #{editingId}</span>
              <button type="button" onClick={handleCancelEdit} className="font-bold underline text-[10px] cursor-pointer">
                Discard
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Classification Type
            </label>
            <select
              value={typeLabel}
              onChange={e => setTypeLabel(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 outline-none cursor-pointer focus:border-blue-500 font-semibold"
            >
              <option value="Organizational Outcome">Organizational Outcome (OO - National Government Agencies)</option>
              <option value="Strategic Objective">Strategic Objective (SO - Government-Owned &amp; Controlled Corporations)</option>
              <option value="Major Final Output">Major Final Output (MFO - State Universities &amp; LGUs)</option>
              <option value="Other">Other / Custom Classification</option>
            </select>
          </div>

          {/* Conditional Custom Classification Input */}
          {typeLabel === "Other" && (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Specify Custom Classification Label</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sectoral Outcome, Core Institutional Result, Priority Mandate"
                value={customTypeLabel}
                onChange={e => setCustomTypeLabel(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-blue-300 dark:border-blue-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Outcome / Program Title
            </label>
            <input
              type="text"
              placeholder="e.g. Higher Education Program, Public Health Information Systems Program"
              value={outcomeName}
              onChange={e => setOutcomeName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
              Strategic Scope &amp; Statutory Objectives
            </label>
            <textarea
              placeholder="Describe program objectives, statutory public service targets, and PREXC / GAA key performance indicators..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white h-32 resize-none leading-relaxed outline-none focus:border-blue-500 text-xs"
            />
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Relational Anchor:</strong> During proposal intake and review, all department line items and strategic concerns must bind to an active outcome to satisfy DICT Singularity validation.
            </span>
          </div>

          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`py-2.5 ${editingId ? "w-2/3 bg-amber-600 hover:bg-amber-500" : "w-full bg-blue-600 hover:bg-blue-500"} disabled:opacity-50 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm text-xs`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Saving..." : editingId ? "Update Program Outcome" : "Save Program Outcome"}</span>
            </button>
          </div>
        </form>

        {/* Directory Output Grid Column */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search outcomes or descriptions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedTypeFilter}
                onChange={e => setSelectedTypeFilter(e.target.value)}
                className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 outline-none text-[11px] cursor-pointer font-semibold max-w-[200px]"
              >
                {availableFilterTypes.map(ft => (
                  <option key={ft} value={ft}>
                    {ft === "All" ? "All Classifications" : ft}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <BookOpen className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                <span>Reading statutory outcome configurations...</span>
              </div>
            ) : filteredOutcomes.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] font-mono bg-slate-50 dark:bg-slate-955">
                    <th className="py-3 px-3.5 w-1/4">Classification</th>
                    <th className="py-3 px-3.5 w-1/3">Program / Outcome Title</th>
                    <th className="py-3 px-3.5">Statutory Scope &amp; Links</th>
                    <th className="py-3 px-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredOutcomes.map(o => {
                    const linkedProposalsCount = o.proposals_count ?? (Array.isArray(o.proposals) ? o.proposals.length : 0);
                    const linkedConcernsCount = o.strategic_concerns_count ?? (Array.isArray(o.strategic_concerns) ? o.strategic_concerns.length : 0);

                    return (
                      <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                        <td className="py-3 px-3.5 align-top">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${getTypeBadgeClass(o.type_label)}`}>
                            {o.type_label || "Organizational Outcome"}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900 dark:text-slate-200 align-top">
                          <div className="flex items-start gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-500 shrink-0 mt-0.5" />
                            <div>
                              <span>{o.outcome_name || o.program_name}</span>
                              <div className="text-[10px] text-slate-400 font-mono font-normal mt-0.5">
                                Identifier: #{o.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm break-words align-top">
                          <p className="line-clamp-2">
                            {o.description || <span className="text-slate-400 dark:text-slate-500 italic">No statutory description provided.</span>}
                          </p>
                          
                          {/* Live Relational Linkage Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {linkedProposalsCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[9.5px] px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-md font-mono font-semibold">
                                <FileText className="w-3 h-3 text-blue-500" />
                                <span>{linkedProposalsCount} Linked Proposal{linkedProposalsCount > 1 ? "s" : ""}</span>
                              </span>
                            ) : null}

                            {linkedConcernsCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[9.5px] px-2 py-0.5 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900 rounded-md font-mono font-semibold">
                                <Link2 className="w-3 h-3 text-purple-500" />
                                <span>{linkedConcernsCount} Concern{linkedConcernsCount > 1 ? "s" : ""}</span>
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-right align-top">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleStartEdit(o)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Edit Outcome Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(o.id, o.outcome_name || o.program_name, linkedProposalsCount)}
                              className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-lg cursor-pointer transition-colors shadow-2xs"
                              title="Delete Program Outcome"
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
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
                No outcomes found matching your query.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}