// frontend/src/views/department/Needs/NeedsAssessment.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getNeedsAssessments, 
  createNeedsAssessment, 
  updateNeedsAssessment, 
  deleteNeedsAssessment,
  getOutcomes,
  getProposals
} from "../../../api/dept";
import { 
  ClipboardCheck, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Plus, 
  Search, 
  CheckSquare, 
  Clock, 
  Layers, 
  X, 
  Info, 
  GraduationCap, 
  Building,
  Edit3,
  Trash2,
  Save,
  FolderKanban,
  ExternalLink,
  Sparkles,
  Tag,
  Check,
  Database,
  ArrowRight,
  ShieldCheck
} from "lucide-react";

// Standard DICT / MITHI Impact Presets
const COMMON_IMPACTS = [
  "Faster Service Turnaround",
  "Paperless Digital Workflow",
  "Public Citizen Web Access",
  "99.9% Infrastructure Uptime",
  "Data Privacy Act (RA 10173) Compliance",
  "COA Regulatory Audit Trail",
  "Inter-Agency PeGIF Integration",
  "Single Point of Failure Removal"
];

export default function NeedsAssessment() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();

  // Core Data States
  const [needs, setNeeds] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields & Edit State
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [mfo, setMfo] = useState("");
  const [problem, setProblem] = useState("");
  const [solution, setProposedSolution] = useState("");
  const [expectedImpacts, setExpectedImpacts] = useState("");
  const [otherImpact, setOtherImpact] = useState("");

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "pending" | "aggregated"

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Load Program Outcomes
  const fetchOutcomesList = useCallback(async () => {
    try {
      const data = await getOutcomes(user?.token);
      const outcomeList = Array.isArray(data) ? data : [];
      setOutcomes(outcomeList);
      setMfo(prev => prev || outcomeList[0]?.outcome_name || outcomeList[0]?.program_name || "");
    } catch (e) {
      console.warn("Could not dynamically load program outcomes:", e);
    }
  }, [user?.token]);

  // Load Department Needs Assessments & Linked Proposals
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [needsData, proposalsData] = await Promise.all([
        getNeedsAssessments({}, user?.token),
        getProposals(activeCycle, "", 0, 1000, user?.token).catch(() => [])
      ]);
      setNeeds(Array.isArray(needsData) ? needsData : []);
      setProposals(Array.isArray(proposalsData) ? proposalsData : []);
    } catch (err) {
      setError(err.message || "Failed to load department needs assessments.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, user?.token]);

  useEffect(() => {
    if (user?.token) {
      fetchOutcomesList();
      loadData();
    }
  }, [user?.token, fetchOutcomesList, loadData]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setProblem("");
    setProposedSolution("");
    setExpectedImpacts("");
    setOtherImpact("");
    if (outcomes.length > 0) {
      setMfo(outcomes[0].outcome_name || outcomes[0].program_name || "");
    }
  };

  const handleStartEdit = (item) => {
    setError(null);
    setSuccess(null);
    setEditingId(item.id);
    setTitle(item.title || "");
    setMfo(item.mfo_alignment || (outcomes[0]?.outcome_name || ""));
    setProblem(item.current_problem || "");
    setProposedSolution(item.proposed_solution || "");
    setExpectedImpacts(Array.isArray(item.expected_impacts) ? item.expected_impacts.join(", ") : "");
    setOtherImpact(item.other_impact || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    resetForm();
    setError(null);
  };

  // Toggle quick impact chip into comma-separated list
  const handleToggleImpactChip = (chipText) => {
    const currentList = expectedImpacts
      ? expectedImpacts.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    
    let updated;
    if (currentList.includes(chipText)) {
      updated = currentList.filter(s => s !== chipText);
    } else {
      updated = [...currentList, chipText];
    }
    setExpectedImpacts(updated.join(", "));
  };

  const handleDelete = async (id, assessmentTitle) => {
    if (!window.confirm(`Permanently delete Needs Assessment '${assessmentTitle}'?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteNeedsAssessment(id, user?.token);
      setSuccess(`Needs Assessment '${assessmentTitle}' removed successfully.`);
      if (editingId === id) resetForm();
      loadData();
    } catch (err) {
      setError(err.message || "Failed to delete assessment.");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title.trim()) {
      setError("Please provide an assessment title.");
      return;
    }
    if (!mfo.trim()) {
      setError("Please specify or select the statutory program alignment (OO / SO / MFO).");
      return;
    }
    if (!problem.trim()) {
      setError("Please describe the current operational bottleneck or problem.");
      return;
    }
    if (!solution.trim()) {
      setError("Please describe the proposed solution or technical intervention.");
      return;
    }

    setSubmitting(true);
    try {
      const parsedImpacts = expectedImpacts
        ? expectedImpacts.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const payload = {
        title: title.trim(),
        mfo_alignment: mfo.trim(),
        current_problem: problem.trim(),
        proposed_solution: solution.trim(),
        expected_impacts: parsedImpacts,
        other_impact: otherImpact.trim() || null,
        issp_period: activeCycle
      };

      if (editingId) {
        await updateNeedsAssessment(editingId, payload, user?.token);
        setSuccess("Needs Assessment updated successfully.");
      } else {
        await createNeedsAssessment(payload, user?.token);
        setSuccess("Needs Assessment submitted successfully to the institutional planning intake pool.");
      }

      resetForm();
      loadData();
    } catch (err) {
      setError(typeof err === "object" ? (err.message || JSON.stringify(err)) : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // 1-Click Action to Propose an Information System (Part III.D) for this Need
  const handleProposeSystemForNeed = (item) => {
    navigate("/dept/proposed-systems", { 
      state: { 
        prefillNeedsAssessment: item 
      } 
    });
  };

  // 1-Click Action to Draft a Resource Proposal (Part IV.A) for this Need
  const handleCreateProposalForNeed = (item) => {
    navigate("/dept/proposals", {
      state: {
        prefillNeedsAssessment: item
      }
    });
  };

  // Find proposals referencing this specific assessment
  const getLinkedProposals = useCallback((needsId) => {
    return proposals.filter(p => String(p.needs_assessment_id) === String(needsId));
  }, [proposals]);

  const totalCount = needs.length;
  const aggregatedCount = needs.filter(n => n.is_aggregated).length;
  const pendingCount = totalCount - aggregatedCount;

  const filteredNeeds = useMemo(() => {
    return needs.filter((item) => {
      if (statusFilter === "aggregated" && !item.is_aggregated) return false;
      if (statusFilter === "pending" && item.is_aggregated) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const matchesTitle = (item.title || "").toLowerCase().includes(q);
      const matchesMfo = (item.mfo_alignment || "").toLowerCase().includes(q);
      const matchesProblem = (item.current_problem || "").toLowerCase().includes(q);
      const matchesSolution = (item.proposed_solution || "").toLowerCase().includes(q);
      return matchesTitle || matchesMfo || matchesProblem || matchesSolution;
    });
  }, [needs, statusFilter, searchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Department Needs Assessment &amp; Problem Intake Pool</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Document operational bottlenecks, technology gaps, and proposed solutions for <strong>{user?.department_name || "your department"}</strong>. Sourced assessments populate the institutional intake pool for MIS Admin aggregation into institutional Strategic Concerns.
          </p>
        </div>
        <button
          onClick={() => { fetchOutcomesList(); loadData(); }}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold self-start shadow-xs text-xs"
          title="Refresh assessments list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync List</span>
        </button>
      </div>

      {/* KPI Metric Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Needs Documented</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalCount} Assessments</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Aggregated into Strategic Concerns</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{aggregatedCount} Concerns</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Under Governance Review</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{pendingCount} Pending</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Assessment Submission / Update Form */}
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              {editingId ? (
                <>
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  <span>Update Needs Assessment</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Log Technical Needs Assessment</span>
                </>
              )}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {editingId && (
            <div className="p-3 bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 rounded-xl flex items-center justify-between text-[11px] font-mono">
              <span>Editing Assessment ID: {String(editingId).slice(0, 8)}...</span>
              <button type="button" onClick={handleCancelEdit} className="font-bold underline text-[10px] cursor-pointer">
                Discard
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Assessment Title / Initiative Name
            </label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 font-semibold text-xs" 
              placeholder="e.g. Core Network Infrastructure Upgrade for Administrative Facilities"
              required 
            />
          </div>

          {/* Dynamic Program Alignment Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                <span>Program Alignment</span>
              </span>
              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">MFO / OO</span>
            </label>
            {outcomes.length > 0 ? (
              <select 
                value={mfo} 
                onChange={(e) => setMfo(e.target.value)} 
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer focus:border-blue-500 text-xs font-semibold"
              >
                {outcomes.map((o) => (
                  <option key={o.id} value={o.outcome_name || o.program_name}>
                    {o.outcome_name || o.program_name} ({o.type_label || "Outcome"})
                  </option>
                ))}
              </select>
            ) : (
              <input 
                type="text" 
                value={mfo} 
                onChange={(e) => setMfo(e.target.value)} 
                placeholder="e.g. Citizen Frontline Public Services Program"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs font-semibold"
                required 
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Current Problem / Operational Bottleneck
            </label>
            <textarea 
              value={problem} 
              onChange={(e) => setProblem(e.target.value)} 
              rows={3} 
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 leading-relaxed resize-none text-xs" 
              placeholder="Detail paper backlogs, processing latency, network bottlenecks, or single-point server vulnerabilities..."
              required 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Proposed ICT Solution / Intervention
            </label>
            <textarea 
              value={solution} 
              onChange={(e) => setProposedSolution(e.target.value)} 
              rows={3} 
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 leading-relaxed resize-none text-xs" 
              placeholder="Describe the hardware deployment, cloud containerization, or digital automation upgrade required..."
              required 
            />
          </div>

          {/* Quick-Select Expected Impact Chips */}
          <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1 font-mono">
                <Tag className="w-3.5 h-3.5 text-blue-500" />
                <span>Expected Strategic Impacts</span>
              </label>
              <span className="text-[9px] text-slate-400 font-mono">Select or type custom</span>
            </div>

            {/* Quick-Toggle Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {COMMON_IMPACTS.map((chip) => {
                const isSelected = expectedImpacts
                  .split(",")
                  .map(s => s.trim())
                  .includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleToggleImpactChip(chip)}
                    className={`px-2 py-0.5 rounded-lg text-[9.5px] font-semibold transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-bold"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-300"
                    }`}
                  >
                    {isSelected ? `✓ ${chip}` : `+ ${chip}`}
                  </button>
                );
              })}
            </div>

            <input 
              type="text" 
              value={expectedImpacts} 
              onChange={(e) => setExpectedImpacts(e.target.value)} 
              placeholder="e.g. Sub-15 min turnaround, 99.9% uptime, Automated verification" 
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs mt-2" 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Other Regulatory / Accreditation Impact (Optional)
            </label>
            <input 
              type="text" 
              value={otherImpact} 
              onChange={(e) => setOtherImpact(e.target.value)} 
              placeholder="e.g. ISO 27001 readiness, Data Privacy Act compliance" 
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs" 
            />
          </div>

          {/* Clean Provenance Callout */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
            <span>
              <strong>Provenance Chain:</strong> Submitted assessments are queued for MIS Admin aggregation into institutional Strategic Concerns. You can also link this problem statement directly to resource proposals or proposed software systems below.
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
              className={`py-2.5 ${editingId ? "w-2/3 bg-amber-600 hover:bg-amber-500" : "w-full bg-blue-600 hover:bg-blue-500"} disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs`}
            >
              {editingId ? <Save className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
              <span>{submitting ? "Saving..." : editingId ? "Save Assessment Changes" : "Submit Needs Assessment to Queue"}</span>
            </button>
          </div>
        </form>

        {/* Right Column: Recent Assessments Log & Directory */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col space-y-0">
          
          {/* Controls Bar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-955 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
                {[
                  { id: "all", label: `All (${totalCount})` },
                  { id: "pending", label: `In Review (${pendingCount})` },
                  { id: "aggregated", label: `Aggregated (${aggregatedCount})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                      statusFilter === tab.id 
                        ? "bg-blue-600 text-white shadow-xs" 
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by title, program, problem..."
                className="w-full pl-9 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Directory Listings */}
          <div className="divide-y divide-slate-100 dark:divide-slate-850 overflow-y-auto max-h-[660px] flex-grow">
            {loading && needs.length === 0 ? (
              <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Loading department needs assessments...</span>
              </div>
            ) : filteredNeeds.length === 0 ? (
              <div className="p-16 text-center text-slate-400 italic">
                No needs assessments found matching your filter criteria.
              </div>
            ) : (
              filteredNeeds.map((item) => {
                const linkedProps = getLinkedProposals(item.id);

                return (
                  <div key={item.id} className="p-5 space-y-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-955/20 transition-all">
                    
                    {/* Header Row with Badges & Actions */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
                            {item.mfo_alignment}
                          </span>

                          {item.is_aggregated ? (
                            <span className="inline-flex items-center gap-1 text-[9px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold uppercase font-mono">
                              <CheckSquare className="w-3 h-3" /> Aggregated into Strategic Concerns
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-bold uppercase font-mono">
                              <Clock className="w-3 h-3" /> Under MIS Review
                            </span>
                          )}

                          <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 font-mono font-semibold flex items-center gap-1">
                            <Building className="w-3 h-3 text-slate-400" />
                            <span>{item.department_name || user?.department_name || `Dept ${item.department_id}`}</span>
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1">{item.title}</h4>
                      </div>

                      {/* Header Action Buttons (Including Direct "Propose System" and "Draft Proposal" Actions) */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-auto">
                        
                        {/* DIRECT ACTION: Propose Information System for this Need (Part III.D) */}
                        <button
                          type="button"
                          onClick={() => handleProposeSystemForNeed(item)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="Propose an automated software system or platform enhancement addressing this need"
                        >
                          <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Propose System (Part III.D)</span>
                        </button>

                        {/* DIRECT ACTION: Draft Proposal for this Need (Part IV.A) */}
                        <button
                          type="button"
                          onClick={() => handleCreateProposalForNeed(item)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="Create resource line item proposal linked to this need"
                        >
                          <FolderKanban className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Draft Proposal (Part IV.A)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                          title="Edit Needs Assessment"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        {!item.is_aggregated ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.title)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 transition-colors cursor-pointer"
                            title="Delete Needs Assessment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span 
                            className="p-1.5 text-slate-400 cursor-not-allowed text-[10px] font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                            title="Cannot delete: Assessment has been aggregated into Strategic Concerns by MIS Admin"
                          >
                            Locked
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Problem & Proposed Solution Side-by-Side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
                          Problem / Operational Bottleneck
                        </span>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{item.current_problem}</p>
                      </div>

                      <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[9px] font-bold uppercase text-blue-600 dark:text-blue-400 tracking-wider block">
                          Proposed Solution / Intervention
                        </span>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{item.proposed_solution}</p>
                      </div>
                    </div>

                    {/* Expected Strategic Impacts */}
                    {((item.expected_impacts && item.expected_impacts.length > 0) || item.other_impact) && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono">
                        <span className="text-slate-400 font-bold uppercase mr-1">Impacts:</span>
                        {item.expected_impacts && item.expected_impacts.map((imp, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            {imp}
                          </span>
                        ))}
                        {item.other_impact && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 font-bold">
                            {item.other_impact}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Linked Proposals Provenance Strip */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">Linked Resource Proposals:</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {linkedProps.length > 0 ? (
                          linkedProps.map(prop => (
                            <Link
                              key={prop.id}
                              to={`/dept/proposals?search=${encodeURIComponent(prop.item_name)}`}
                              className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono text-[9px] font-bold flex items-center gap-1 hover:underline"
                            >
                              <span>{prop.item_name}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </Link>
                          ))
                        ) : (
                          <span className="text-slate-400 italic text-[9.5px]">
                            Not yet linked to any proposal draft
                          </span>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

    </div>
  );
}