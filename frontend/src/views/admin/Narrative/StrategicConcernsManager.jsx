// frontend/src/views/admin/Narrative/StrategicConcernsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getStrategicConcerns,
  createStrategicConcern,
  updateStrategicConcern,
  deleteStrategicConcern,
  getInformationSystems,
  getAllNeedsAssessments,
  aggregateNeedsToStrategicConcern
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
  ShieldAlert,
  Cpu,
  CornerDownRight,
  RefreshCw,
  GraduationCap,
  Database,
  SlidersHorizontal,
  ClipboardCheck,
  Building,
  CheckSquare,
  Sparkles,
  Info,
  Layers
} from "lucide-react";

export default function StrategicConcernsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Data States
  const [concerns, setConcerns] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [systems, setSystems] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    outcome_id: "",
    mfo: "",
    critical_system: "",
    problems: "",
    intended_use: "",
    order_index: 1,
    source_needs_assessment_id: null
  });
  const [editId, setEditId] = useState(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("All");
  const [activeTab, setActiveTab] = useState("concerns"); // "concerns" | "intake"

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const loadAllData = useCallback(async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Strategic Concerns (Part II.A)
      const concernsData = await getStrategicConcerns(token, activeCycle);
      setConcerns(Array.isArray(concernsData) ? concernsData : []);

      // 2. Fetch Organizational Outcomes (Part I.A.4 Link)
      const outRes = await fetch(`${apiUrl}/api/admin/outcomes?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (outRes.ok) {
        const outData = await outRes.json();
        const outList = Array.isArray(outData) ? outData : [];
        setOutcomes(outList);
        if (outList.length > 0 && !form.outcome_id) {
          setForm(prev => ({
            ...prev,
            outcome_id: String(outList[0].id),
            mfo: outList[0].outcome_name || outList[0].program_name || ""
          }));
        }
      }

      // 3. Fetch Downstream Information Systems (Part II.C & III.D Link)
      const sysData = await getInformationSystems(token, activeCycle);
      setSystems(Array.isArray(sysData) ? sysData : []);

      // 4. Fetch Department Needs Assessments (Section 8.0 Intake Pool)
      let naData = [];
      if (typeof getAllNeedsAssessments === "function") {
        naData = await getAllNeedsAssessments(token);
      } else {
        const naRes = await fetch(`${apiUrl}/api/admin/needs-assessments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (naRes.ok) {
          naData = await naRes.json();
        }
      }
      setNeedsAssessments(Array.isArray(naData) ? naData : []);
    } catch (err) {
      setError(err.message || "Failed to load strategic concerns data.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token, apiUrl, form.outcome_id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle 1-Click Aggregation from Department Needs Assessment
  const handleAggregateFromNeeds = (na) => {
    setError(null);
    setSuccess(null);

    // Dynamic matching against registered outcomes
    const align = (na.mfo_alignment || "").toLowerCase().trim();
    const matchedOutcome = outcomes.find(o => {
      const oName = (o.outcome_name || o.program_name || "").toLowerCase().trim();
      const oType = (o.type_label || "").toLowerCase().trim();
      return (
        oName === align ||
        (align && oName.includes(align)) ||
        (align && align.includes(oName)) ||
        (align && oType.includes(align))
      );
    }) || outcomes[0];

    const outcomeTitle = matchedOutcome 
      ? (matchedOutcome.outcome_name || matchedOutcome.program_name) 
      : (outcomes[0]?.outcome_name || outcomes[0]?.program_name || "Organizational Outcome");

    const deptPrefix = na.department_name ? `[${na.department_name}]` : (na.department_id ? `[Dept ${na.department_id}]` : "");
    const problemText = deptPrefix ? `${deptPrefix}: ${na.current_problem || ""}` : (na.current_problem || "");

    setForm({
      outcome_id: matchedOutcome ? String(matchedOutcome.id) : (outcomes[0]?.id ? String(outcomes[0].id) : ""),
      mfo: outcomeTitle,
      critical_system: na.title || "",
      problems: problemText,
      intended_use: na.proposed_solution || "",
      order_index: concerns.length + 1,
      source_needs_assessment_id: na.id
    });
    setEditId(null);
    setActiveTab("concerns");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOutcomeChange = (e) => {
    const chosenId = e.target.value;
    const selectedOutcome = outcomes.find(o => String(o.id) === String(chosenId));
    setForm(prev => ({
      ...prev,
      outcome_id: chosenId,
      mfo: selectedOutcome ? (selectedOutcome.outcome_name || selectedOutcome.program_name) : prev.mfo
    }));
  };

  const validateForm = () => {
    if (!form.outcome_id) return "Compliance Check: Please associate this concern with an Organizational Outcome.";
    if (!form.critical_system.trim()) return "Critical Management / Operating System title is required.";
    if (!form.problems.trim()) return "Operational bottleneck / barrier statement is required.";
    if (!form.intended_use.trim()) return "Intended use of ICT solution description is required.";
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
      if (form.source_needs_assessment_id) {
        // Aggregating from Department Needs Assessment
        const payload = {
          needs_assessment_id: form.source_needs_assessment_id,
          outcome_id: parseInt(form.outcome_id, 10),
          mfo: form.mfo.trim(),
          critical_system: form.critical_system.trim(),
          problems: form.problems.trim(),
          intended_use: form.intended_use.trim(),
          order_index: parseInt(form.order_index, 10) || 1
        };

        if (typeof aggregateNeedsToStrategicConcern === "function") {
          await aggregateNeedsToStrategicConcern(token, payload, activeCycle);
        } else {
          const qs = activeCycle ? `?issp_period=${encodeURIComponent(activeCycle)}` : "";
          const res = await fetch(`${apiUrl}/api/admin/concerns/aggregate-from-needs${qs}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.detail || "Failed to aggregate needs assessment into strategic concern.");
          }
        }

        setSuccess(`Department Needs Assessment aggregated into Strategic Concern '${form.critical_system}'.`);
      } else if (editId) {
        // Standard Update
        await updateStrategicConcern(token, editId, {
          outcome_id: parseInt(form.outcome_id, 10),
          mfo: form.mfo.trim(),
          critical_system: form.critical_system.trim(),
          problems: form.problems.trim(),
          intended_use: form.intended_use.trim(),
          order_index: parseInt(form.order_index, 10) || 1
        });
        setSuccess("Strategic concern updated successfully.");
      } else {
        // Standard Manual Creation
        await createStrategicConcern(token, activeCycle, {
          outcome_id: parseInt(form.outcome_id, 10),
          mfo: form.mfo.trim(),
          critical_system: form.critical_system.trim(),
          problems: form.problems.trim(),
          intended_use: form.intended_use.trim(),
          order_index: parseInt(form.order_index, 10) || 1
        });
        setSuccess("Strategic concern successfully registered.");
      }

      // Reset form
      setForm({
        outcome_id: outcomes.length > 0 ? String(outcomes[0].id) : "",
        mfo: outcomes.length > 0 ? (outcomes[0].outcome_name || outcomes[0].program_name) : "",
        critical_system: "",
        problems: "",
        intended_use: "",
        order_index: concerns.length + 2,
        source_needs_assessment_id: null
      });
      setEditId(null);
      loadAllData();
    } catch (err) {
      setError(err.message || "Failed to persist strategic concern.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (c) => {
    setError(null);
    setSuccess(null);
    setEditId(c.id);
    setForm({
      outcome_id: c.outcome_id ? String(c.outcome_id) : (outcomes[0]?.id ? String(outcomes[0].id) : ""),
      mfo: c.mfo || "",
      critical_system: c.critical_system || "",
      problems: c.problems || "",
      intended_use: c.intended_use || "",
      order_index: c.order_index || 1,
      source_needs_assessment_id: null
    });
    setActiveTab("concerns");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm({
      outcome_id: outcomes.length > 0 ? String(outcomes[0].id) : "",
      mfo: outcomes.length > 0 ? (outcomes[0].outcome_name || outcomes[0].program_name) : "",
      critical_system: "",
      problems: "",
      intended_use: "",
      order_index: concerns.length + 1,
      source_needs_assessment_id: null
    });
  };

  const handleDelete = async (id, systemName) => {
    if (!window.confirm(`Permanently delete strategic concern for '${systemName}'?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteStrategicConcern(token, id);
      setSuccess("Strategic concern purged from registry.");
      loadAllData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Find downstream systems mapped to a specific concern
  const getDownstreamSystems = (concernId) => {
    return systems.filter(s => s.strategic_concern_id === concernId);
  };

  // Filtered Concerns List
  const filteredConcerns = useMemo(() => {
    return concerns.filter(c => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = q === "" || 
        (c.mfo || "").toLowerCase().includes(q) ||
        (c.critical_system || "").toLowerCase().includes(q) ||
        (c.problems || "").toLowerCase().includes(q) ||
        (c.intended_use || "").toLowerCase().includes(q);

      const matchesOutcome = filterOutcome === "All" || String(c.outcome_id) === filterOutcome;
      return matchesSearch && matchesOutcome;
    });
  }, [concerns, searchQuery, filterOutcome]);

  const pendingNeedsCount = needsAssessments.filter(na => !na.is_aggregated).length;

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Part II.A: Strategic Concerns for ICT Use &amp; Needs Aggregation</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Review departmental Needs Assessments (Section 8.0), aggregate them into institutional Strategic Concerns, and anchor them to Part I.A.4 Outcomes.
          </p>
        </div>
        <button
          onClick={loadAllData}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 font-bold shadow-xs cursor-pointer text-xs self-start md:self-auto"
          title="Refresh Strategic Concerns Ledger"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync All</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Strategic Concerns</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{concerns.length} Concerns</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Department Needs Intake</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{needsAssessments.length} Received</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Linked Outcomes (I.A.4)</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{outcomes.length} Registered</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Downstream Systems</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{systems.length} Ready</h3>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 self-start shadow-xs">
        <button
          onClick={() => setActiveTab("concerns")}
          className={`px-4 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
            activeTab === "concerns" 
              ? "bg-blue-600 text-white shadow-xs" 
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Part II.A Strategic Concerns ({concerns.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("intake")}
          className={`px-4 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer relative ${
            activeTab === "intake" 
              ? "bg-blue-600 text-white shadow-xs" 
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>Department Needs Intake (Sec 8.0) ({needsAssessments.length})</span>
          {pendingNeedsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold font-mono animate-pulse">
              {pendingNeedsCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "concerns" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Form Panel */}
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                {form.source_needs_assessment_id ? (
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : editId ? (
                  <Edit className="w-4 h-4 text-amber-500" />
                ) : (
                  <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                )}
                <span>
                  {form.source_needs_assessment_id 
                    ? "Aggregate Needs into Concern" 
                    : editId 
                    ? "Update Strategic Concern" 
                    : "Register Strategic Concern"}
                </span>
              </h3>
              {(editId || form.source_needs_assessment_id) && (
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

            {form.source_needs_assessment_id && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-[10.5px] leading-relaxed flex items-start gap-2 animate-fadeIn shadow-2xs">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Intake Pre-fill:</strong> Sourced directly from department Needs Assessment. Verify alignment and commit to establish bidirectional graph provenance.
                </span>
              </div>
            )}

            {/* Outcome Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                <span>1. Organizational Outcome / MFO (Part I.A.4)</span>
              </label>
              {outcomes.length > 0 ? (
                <select
                  value={form.outcome_id}
                  onChange={handleOutcomeChange}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 cursor-pointer text-xs"
                  required
                >
                  {outcomes.map(o => (
                    <option key={o.id} value={String(o.id)}>
                      {o.outcome_name || o.program_name} ({o.type_label})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-[10px]">
                  No Organizational Outcomes registered! Please configure Part I.A.4 first.
                </div>
              )}
            </div>

            {/* Critical Business System */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>2. Critical Management / Operating System</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Citizen Frontline Registry and Electronic Payment System"
                value={form.critical_system}
                onChange={e => setForm({ ...form, critical_system: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
              />
            </div>

            {/* Problem Statement */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                3. Operational Problem / Bottleneck
              </label>
              <textarea
                rows={3}
                required
                placeholder="Detail operational delays, transaction latency, paper backlogs, fraud risks, or server vulnerabilities..."
                value={form.problems}
                onChange={e => setForm({ ...form, problems: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 text-xs leading-relaxed"
              />
            </div>

            {/* Intended Use of ICT */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                4. Intended Use of Proposed ICT Solution
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain how the proposed ICT initiative digitalizes, automates, and secures the workflow..."
                value={form.intended_use}
                onChange={e => setForm({ ...form, intended_use: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 text-xs leading-relaxed"
              />
            </div>

            {/* Order Index */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Table Row Sort Order
              </label>
              <input
                type="number"
                min="1"
                value={form.order_index}
                onChange={e => setForm({ ...form, order_index: parseInt(e.target.value, 10) || 1 })}
                className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs"
              />
            </div>

            {/* Non-glaring slate callout card */}
            <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>
                <strong>Singularity Governance:</strong> Strategic Concerns serve as the official parent problem for Information Systems (Parts II.C / III.D).
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || outcomes.length === 0}
              className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all shadow-sm text-xs ${
                form.source_needs_assessment_id
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : editId 
                  ? "bg-amber-600 hover:bg-amber-500" 
                  : "bg-blue-600 hover:bg-blue-500"
              } disabled:opacity-50`}
            >
              <Save className="w-4 h-4" />
              <span>
                {submitting 
                  ? "Persisting..." 
                  : form.source_needs_assessment_id 
                  ? "Commit Aggregated Concern" 
                  : editId 
                  ? "Save Concern Modifications" 
                  : "Commit Strategic Concern"}
              </span>
            </button>
          </form>

          {/* Right Column: Strategic Concerns Directory */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search concern, system, problem..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={filterOutcome}
                  onChange={e => setFilterOutcome(e.target.value)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-semibold outline-none text-xs cursor-pointer max-w-[200px]"
                >
                  <option value="All">All Organizational Outcomes</option>
                  {outcomes.map(o => (
                    <option key={o.id} value={String(o.id)}>{o.outcome_name || o.program_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <span>Synchronizing strategic concerns matrix...</span>
                </div>
              ) : filteredConcerns.length > 0 ? (
                filteredConcerns.map((c) => {
                  const downstream = getDownstreamSystems(c.id);

                  return (
                    <div 
                      key={c.id} 
                      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 hover:border-blue-300 dark:hover:border-slate-700 transition-all space-y-3.5 shadow-xs"
                    >
                      <div className="flex justify-between items-start gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 px-2.5 py-0.5 rounded-full font-mono">
                              {c.mfo}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">
                              Order #{c.order_index}
                            </span>
                          </div>
                          <h4 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-1.5 mt-0.5">
                            <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{c.critical_system}</span>
                          </h4>
                        </div>

                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => handleEdit(c)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Edit Strategic Concern"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.critical_system)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded-lg text-slate-500 transition-colors cursor-pointer"
                            title="Delete Concern"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] block">
                            Operational Problem / Bottleneck
                          </span>
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed">
                            {c.problems}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                            <span>Intended Use of ICT Solution</span>
                          </span>
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed">
                            {c.intended_use}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-500 dark:text-slate-400 font-semibold">Downstream Technical Systems:</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {downstream.length > 0 ? (
                            downstream.map(sys => (
                              <span 
                                key={sys.id}
                                className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[9px] flex items-center gap-1"
                              >
                                <strong className="text-emerald-600 dark:text-emerald-400">{sys.name}</strong>
                                <span className="text-slate-400">[{sys.status}]</span>
                              </span>
                            ))
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-[9px] font-bold">
                              No Downstream System Mapped Yet
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic">
                  No strategic concerns logged for planning cycle FY {activeCycle}. Click "Commit Strategic Concern" to register operational gaps.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* INTAKE TAB: Department Needs Assessments (Sec 8.0) */
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs animate-fadeIn">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Departmental Needs Assessments (Section 8.0 Intake Pool)</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                Review qualitative problems submitted by departments and convert them into institutional Part II.A Strategic Concerns.
              </p>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-600 dark:text-slate-300 font-mono font-bold">
              Total Received: {needsAssessments.length} | Pending: {pendingNeedsCount}
            </span>
          </div>

          <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
            {needsAssessments.length > 0 ? (
              needsAssessments.map(na => (
                <div 
                  key={na.id}
                  className={`p-5 rounded-2xl border transition-all space-y-3.5 shadow-xs ${
                    na.is_aggregated 
                      ? "bg-slate-50/50 dark:bg-slate-955/50 border-slate-200 dark:border-slate-800 opacity-75" 
                      : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-800"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 font-mono font-semibold flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>{na.department_name || `Dept ${na.department_id}`}</span>
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono font-bold uppercase">
                          Alignment: {na.mfo_alignment}
                        </span>
                        {na.is_aggregated && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold uppercase flex items-center gap-1 font-mono">
                            <CheckSquare className="w-3 h-3" /> Aggregated into Part II.A
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1">{na.title}</h4>
                    </div>

                    {!na.is_aggregated ? (
                      <button
                        onClick={() => handleAggregateFromNeeds(na)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Aggregate to Part II.A</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">Already Processed</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider block">
                        Department Problem Statement
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{na.current_problem}</p>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider block">
                        Proposed Solution
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{na.proposed_solution}</p>
                    </div>
                  </div>

                  {/* Expected Impacts Tag Strip */}
                  {((na.expected_impacts && na.expected_impacts.length > 0) || na.other_impact) && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-[9px] font-mono">
                      <span className="text-slate-400 font-bold uppercase mr-1">Expected Impacts:</span>
                      {na.expected_impacts && na.expected_impacts.map((imp, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {imp}
                        </span>
                      ))}
                      {na.other_impact && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 font-bold">
                          {na.other_impact}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-20 text-slate-400 italic bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800">
                No departmental needs assessments received yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}