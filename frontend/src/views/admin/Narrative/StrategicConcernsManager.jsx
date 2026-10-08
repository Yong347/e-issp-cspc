// frontend/src/views/admin/Narrative/StrategicConcernsManager.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  getStrategicConcerns,
  createStrategicConcern,
  updateStrategicConcern,
  deleteStrategicConcern,
  getInformationSystems,
  getAllNeedsAssessments,
  aggregateNeedsToStrategicConcern,
  getOutcomes,
  getIctProjects,
  getNetworkInfrastructures,
  getProposalsQueue
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
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
  Clock,
  ArrowRight,
  ExternalLink,
  Check,
  FolderKanban,
  AlertTriangle,
  Link2,
  HardDrive,
  Network,
  ShieldCheck
} from "lucide-react";

// Standard Strategic Concern Templates (Covering all 5 DICT Resolution Pathways)
const CONCERN_TEMPLATES = [
  {
    label: "Online Public Portal Workflow",
    category: "System Pathway",
    critical_system: "Citizen Frontline Services & E-Payment Gateway",
    problems: "Manual queueing, paper verification backlogs, and multi-day service turnaround times preventing seamless citizen access.",
    intended_use: "Deploy containerized online public service portal with integrated eGovPay electronic settlement and automated status notifications (Information System - Parts II.C / III.D)."
  },
  {
    label: "Campus Network Backbone",
    category: "Network Pathway",
    critical_system: "Campus-Wide Optical Fiber Network & Internet Ingress",
    problems: "Bandwidth saturation, packet loss, and frequent optical link dropouts causing transaction timeouts across offices and computer laboratories.",
    intended_use: "Deploy 10G optical fiber backbone, redundant GovNet leased lines, core distribution switches, and SD-WAN routing (Network Infrastructure - Parts II.B.1 & III.A.1)."
  },
  {
    label: "Computer Laboratory Depreciation",
    category: "Hardware Pathway",
    critical_system: "Instructional Computer Laboratories & Student Workstations",
    problems: "Outdated desktop clusters with obsolete CPUs and low memory experiencing frequent freeze-ups during intensive engineering, GIS, and CAD drafting sessions.",
    intended_use: "Procurement of high-performance desktop workstations and mobile lab clusters with modern GPUs (Hardware Line Items - Part IV.A)."
  },
  {
    label: "Data Center Environmental & Power Resilience",
    category: "Infrastructure Pathway",
    critical_system: "Data Center Power & Facility Infrastructure",
    problems: "Power surges, line brownouts, and localized cooling failures threatening localized server damage and unbudgeted downtime.",
    intended_use: "Installation of online double-conversion rackmount UPS arrays and an automatic standby generator set (Infrastructure & DRBCP - Annex 2)."
  }
];

export default function StrategicConcernsManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Core Data States
  const [concerns, setConcerns] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [systems, setSystems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [networkInfrastructures, setNetworkInfrastructures] = useState([]);
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

  // Search & Navigation States
  const [activeTab, setActiveTab] = useState("concerns"); // "concerns" | "intake"
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("All");

  // Section 8.0 Intake Pool Filter States
  const [intakeSearch, setIntakeSearch] = useState("");
  const [intakeFilterStatus, setIntakeFilterStatus] = useState("pending"); // "all" | "pending" | "aggregated"

  // Notifications State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  // Load All Relational Artifacts
  const loadAllData = useCallback(async () => {
    if (!activeCycle || !token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Strategic Concerns (Part II.A)
      const concernsData = await getStrategicConcerns(token, activeCycle);
      setConcerns(Array.isArray(concernsData) ? concernsData : []);

      // 2. Fetch Organizational Outcomes (Part I.A.4 Link)
      const outData = await getOutcomes(token, activeCycle).catch(() => []);
      const outList = Array.isArray(outData) ? outData : [];
      setOutcomes(outList);

      setForm(prev => {
        if (!prev.outcome_id && outList.length > 0) {
          return {
            ...prev,
            outcome_id: String(outList[0].id),
            mfo: outList[0].outcome_name || outList[0].program_name || ""
          };
        }
        return prev;
      });

      // 3. Fetch Downstream Information Systems (Part II.C & III.D)
      const sysData = await getInformationSystems(token, activeCycle).catch(() => []);
      setSystems(Array.isArray(sysData) ? sysData : []);

      // 4. Fetch ICT Projects (Part III.E)
      const projData = await getIctProjects(token, activeCycle).catch(() => []);
      setProjects(Array.isArray(projData) ? projData : []);

      // 5. Fetch Hardware Proposals (Part IV.A)
      const propData = await getProposalsQueue(token, { issp_period: activeCycle, limit: 1000 }).catch(() => []);
      setProposals(Array.isArray(propData) ? propData : (propData?.data || []));

      // 6. Fetch Network Infrastructures (Parts II.B.1 & III.A.1)
      const netData = await getNetworkInfrastructures(token, activeCycle).catch(() => []);
      setNetworkInfrastructures(Array.isArray(netData) ? netData : []);

      // 7. Fetch Department Needs Assessments (Section 8.0 Intake Pool)
      const naData = await getAllNeedsAssessments(token).catch(() => []);
      setNeedsAssessments(Array.isArray(naData) ? naData : []);
    } catch (err) {
      setError(err.message || "Failed to load strategic concerns and verification dependencies.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Evaluates All 5 Valid Resolution Pathways matching app/services/issp_engine.py
  const getDownstreamResolutions = useCallback((concern) => {
    if (!concern) {
      return { systems: [], projects: [], proposals: [], network: [], needs: [], isResolved: false };
    }
    const cIdStr = String(concern.id || "").toLowerCase();
    const cText = (concern.critical_system || "").trim().toLowerCase();
    const cIntended = (concern.intended_use || "").trim().toLowerCase();
    const cProb = (concern.problems || "").trim().toLowerCase();
    const combinedCorpus = `${cText} ${cIntended} ${cProb}`;

    // Tokenize keywords for resilient semantic matching (ignoring generic stop words)
    const stopWords = new Set(["system", "with", "from", "that", "this", "agency", "department", "user", "core", "into", "online", "office"]);
    const keywords = (cText + " " + cIntended)
      .replace(/[^a-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    // Pathway 1: Information Systems (Direct FK, exact name match, or keyword containment)
    const matchedSystems = systems.filter(s => {
      const sConcernId = String(s.strategic_concern_id || "").toLowerCase();
      const sName = (s.name || "").trim().toLowerCase();
      if (sConcernId && sConcernId === cIdStr) return true;
      if (cText && (sName === cText || sName.includes(cText) || cText.includes(sName))) return true;
      return keywords.some(kw => sName.includes(kw));
    });

    // Pathway 2: Strategic ICT Projects (Direct alignment or keyword matching)
    const matchedProjects = projects.filter(p => {
      const title = (p.project_title || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const obj = (p.objectives || "").toLowerCase();
      if (cText && (title.includes(cText) || desc.includes(cText) || obj.includes(cText))) return true;
      return keywords.some(kw => title.includes(kw));
    });

    // Pathway 3: Hardware Proposals (Deployment of hardware/tools addressing bottleneck)
    const matchedProposals = proposals.filter(p => {
      const name = (p.item_name || "").toLowerCase();
      const just = (p.justification || "").toLowerCase();
      if (cText && (name.includes(cText) || just.includes(cText))) return true;
      return keywords.some(kw => name.includes(kw));
    });

    // Pathway 4: Network Infrastructures (Connectivity, Bandwidth, Topology, or Datacenter facility resolution)
    const networkKeywords = ["network", "bandwidth", "fiber", "lan", "wan", "internet", "connectivity", "switch", "router", "datacenter", "data center", "ups", "generator", "power"];
    const isNetworkRelated = networkKeywords.some(kw => combinedCorpus.includes(kw));
    const matchedNetwork = isNetworkRelated ? networkInfrastructures : [];

    // Pathway 5: Section 8.0 Needs Assessments (Linked via FK or semantic title/solution match)
    const matchedNeeds = needsAssessments.filter(na => {
      const naConcernId = String(na.strategic_concern_id || "").toLowerCase();
      if (naConcernId && naConcernId === cIdStr) return true;
      const title = (na.title || "").toLowerCase();
      const sol = (na.proposed_solution || "").toLowerCase();
      if (cText && (title.includes(cText) || sol.includes(cText))) return true;
      return keywords.some(kw => title.includes(kw));
    });

    const isResolved = (
      matchedSystems.length + 
      matchedProjects.length + 
      matchedProposals.length + 
      matchedNetwork.length + 
      matchedNeeds.length
    ) > 0;

    return {
      systems: matchedSystems,
      projects: matchedProjects,
      proposals: matchedProposals,
      network: matchedNetwork,
      needs: matchedNeeds,
      isResolved
    };
  }, [systems, projects, proposals, networkInfrastructures, needsAssessments]);

  // Apply Quick Standard Templates (Systems, Network, Hardware, Facility)
  const handleApplyTemplate = (tmpl) => {
    setForm(prev => ({
      ...prev,
      critical_system: tmpl.critical_system,
      problems: tmpl.problems,
      intended_use: tmpl.intended_use
    }));
  };

  // Handle 1-Click Aggregation from Department Needs Assessment
  const handleAggregateFromNeeds = (na) => {
    setError(null);
    setSuccess(null);

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
    if (!form.critical_system.trim()) return "Critical System, Operational Area, or ICT Infrastructure description is required.";
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
        const payload = {
          needs_assessment_id: form.source_needs_assessment_id,
          outcome_id: form.outcome_id ? parseInt(form.outcome_id, 10) : null,
          mfo: form.mfo.trim(),
          critical_system: form.critical_system.trim(),
          problems: form.problems.trim(),
          intended_use: form.intended_use.trim(),
          order_index: parseInt(form.order_index, 10) || 1
        };

        await aggregateNeedsToStrategicConcern(token, payload, activeCycle);
        setSuccess(`Department Needs Assessment aggregated into Strategic Concern '${form.critical_system}'.`);
      } else if (editId) {
        await updateStrategicConcern(token, editId, {
          outcome_id: form.outcome_id ? parseInt(form.outcome_id, 10) : null,
          mfo: form.mfo.trim(),
          critical_system: form.critical_system.trim(),
          problems: form.problems.trim(),
          intended_use: form.intended_use.trim(),
          order_index: parseInt(form.order_index, 10) || 1
        });
        setSuccess("Strategic concern updated successfully.");
      } else {
        await createStrategicConcern(token, activeCycle, {
          outcome_id: form.outcome_id ? parseInt(form.outcome_id, 10) : null,
          mfo: form.mfo.trim(),
          critical_system: form.critical_system.trim(),
          problems: form.problems.trim(),
          intended_use: form.intended_use.trim(),
          order_index: parseInt(form.order_index, 10) || 1
        });
        setSuccess("Strategic concern successfully registered.");
      }

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
    if (!window.confirm(`Permanently delete strategic concern for '${systemName}'? This will uncouple any aggregated needs assessments.`)) return;
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

  // Find source Needs Assessment for provenance badging
  const getSourceNeedsAssessment = (concernId) => {
    return needsAssessments.find(na => String(na.strategic_concern_id) === String(concernId));
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

  // Total Concerns Resolved Count
  const resolvedCount = useMemo(() => {
    return concerns.filter(c => getDownstreamResolutions(c).isResolved).length;
  }, [concerns, getDownstreamResolutions]);

  // Filtered Needs Assessments for Intake Pool
  const filteredNeedsAssessments = useMemo(() => {
    return needsAssessments.filter(na => {
      if (intakeFilterStatus === "pending" && na.is_aggregated) return false;
      if (intakeFilterStatus === "aggregated" && !na.is_aggregated) return false;

      if (!intakeSearch.trim()) return true;
      const q = intakeSearch.toLowerCase().trim();
      return (
        (na.title || "").toLowerCase().includes(q) ||
        (na.department_name || "").toLowerCase().includes(q) ||
        (na.current_problem || "").toLowerCase().includes(q) ||
        (na.proposed_solution || "").toLowerCase().includes(q) ||
        (na.mfo_alignment || "").toLowerCase().includes(q)
      );
    });
  }, [needsAssessments, intakeFilterStatus, intakeSearch]);

  const pendingNeedsCount = needsAssessments.filter(na => !na.is_aggregated).length;

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Part II.A: Strategic Concerns for ICT Use &amp; Needs Aggregation</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            In DICT methodology, Strategic Concerns represent operational bottlenecks under statutory Organizational Outcomes (Part I.A.4). Concerns do not resolve only to software systems; they can validly resolve through <strong>Information Systems</strong>, <strong>ICT Projects</strong>, <strong>Hardware Deployments</strong>, <strong>Network Infrastructure</strong>, or <strong>Needs Assessments</strong>.
          </p>
        </div>

        {/* Action Controls: Compiler Pipeline Verifier & Refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <CompilerSyncButton
            moduleName="concerns"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={loadAllData}
            label="Save &amp; Verify Compiler Pipeline"
          />
          <button
            type="button"
            onClick={loadAllData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 font-bold shadow-xs cursor-pointer text-xs"
            title="Refresh Strategic Concerns Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
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
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Resolution Status</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${resolvedCount === concerns.length ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {resolvedCount} of {concerns.length} Resolved
            </h3>
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
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Section 8.0 Intake Pool</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">{needsAssessments.length} Received</h3>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 self-start shadow-xs">
        <button
          type="button"
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
          type="button"
          onClick={() => setActiveTab("intake")}
          className={`px-4 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer relative ${
            activeTab === "intake" 
              ? "bg-blue-600 text-white shadow-xs" 
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>Section 8.0 Department Needs Intake Pool ({needsAssessments.length})</span>
          {pendingNeedsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold font-mono animate-pulse">
              {pendingNeedsCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "concerns" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
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

            {/* Quick Templates: Multi-Pathway Resolution Examples */}
            <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Quick Standard Templates</span>
                </span>
                <span className="text-[9px] text-slate-400 font-mono">System, Network, HW &amp; Infra</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CONCERN_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyTemplate(tmpl)}
                    className="px-2 py-1 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-[9.5px] font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    + [{tmpl.category}] {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            {form.source_needs_assessment_id && (
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-[10.5px] leading-relaxed flex items-start gap-2 animate-fadeIn shadow-2xs">
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

            {/* Critical Business System, Operational Area, or ICT Infrastructure */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>2. Critical Business System, Operational Area, or ICT Infrastructure</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Campus-Wide Optical Network, Computer Laboratories, or Cashiering IS"
                value={form.critical_system}
                onChange={e => setForm({ ...form, critical_system: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 text-xs"
              />
            </div>

            {/* Problem Statement */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                3. Operational Problem / Bottleneck / Barrier
              </label>
              <textarea
                rows={3}
                required
                placeholder="Detail operational delays, bandwidth choking, obsolete hardware depreciation, or server facility constraints..."
                value={form.problems}
                onChange={e => setForm({ ...form, problems: e.target.value })}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500 text-xs leading-relaxed"
              />
            </div>

            {/* Intended Use of ICT */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                4. Intended Use of Proposed ICT Solution (Intervention)
              </label>
              <textarea
                rows={3}
                required
                placeholder="Explain the proposed intervention: enterprise web system, 10G optical fiber backbone, workstation cluster, or online double-conversion UPS..."
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

            {/* Resolution Pathways Callout */}
            <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>
                <strong>5 Valid Resolution Pathways:</strong> In DICT methodology, this concern is validly addressed when resolved by: (1) <em>Information System</em>, (2) <em>ICT Project</em>, (3) <em>Hardware Deployment</em>, (4) <em>Network Infrastructure</em>, or (5) <em>Needs Assessment</em>.
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
                  placeholder="Search concern, bottleneck, solution..."
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
                  const res = getDownstreamResolutions(c);
                  const sourceNa = getSourceNeedsAssessment(c.id);

                  return (
                    <div 
                      key={c.id} 
                      className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 hover:border-blue-300 dark:hover:border-slate-700 transition-all space-y-3.5 shadow-xs ${
                        !res.isResolved ? "border-amber-300 dark:border-amber-900/60" : "border-slate-200/90 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 px-2.5 py-0.5 rounded-full font-mono">
                              {c.mfo}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">
                              Order #{c.order_index}
                            </span>
                            {sourceNa && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20 font-mono font-bold flex items-center gap-1">
                                <ClipboardCheck className="w-3 h-3" />
                                <span>Origin: {sourceNa.department_name || `Dept ${sourceNa.department_id}`} Needs</span>
                              </span>
                            )}
                            {res.isResolved ? (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 font-mono font-bold flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" /> Resolved
                              </span>
                            ) : (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 font-mono font-bold flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> Unresolved Pathway
                              </span>
                            )}
                          </div>
                          <h4 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-1.5 mt-0.5">
                            <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>{c.critical_system}</span>
                          </h4>
                        </div>

                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(c)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Edit Strategic Concern"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
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
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {c.problems}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <CornerDownRight className="w-3.5 h-3.5 text-blue-500" />
                            <span>Intended Use of ICT Solution</span>
                          </span>
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {c.intended_use}
                          </div>
                        </div>
                      </div>

                      {/* COMPREHENSIVE MULTI-PATHWAY RESOLUTION STRIP */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                            <span>Institutional Resolution Pathways:</span>
                          </span>
                          {!res.isResolved && (
                            <span className="text-amber-600 dark:text-amber-400 font-bold text-[9px]">
                              Address via System, Project, Hardware, Network, or Needs Assessment
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Pathway 1: Information Systems */}
                          {res.systems.map(sys => {
                            const sStatus = String(sys.status?.value || sys.status || "Operational");
                            return (
                              <Link
                                key={`sys-${sys.id}`}
                                to="/admin/systems"
                                className="px-2.5 py-0.5 rounded-full border font-mono text-[9px] flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 hover:border-blue-400 transition-colors"
                                title="Resolved by Information System"
                              >
                                <Database className="w-3 h-3 text-blue-500" />
                                <strong>[System] {sys.name}</strong>
                                <span className="opacity-75">[{sStatus}]</span>
                              </Link>
                            );
                          })}

                          {/* Pathway 2: Strategic ICT Projects */}
                          {res.projects.map(proj => (
                            <Link
                              key={`proj-${proj.id}`}
                              to="/admin/projects/internal"
                              className="px-2.5 py-0.5 rounded-full border font-mono text-[9px] flex items-center gap-1 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900 hover:border-purple-400 transition-colors"
                              title="Resolved by Strategic ICT Project"
                            >
                              <FolderKanban className="w-3 h-3 text-purple-500" />
                              <strong>[Project] {proj.project_title}</strong>
                            </Link>
                          ))}

                          {/* Pathway 3: Hardware Proposals */}
                          {res.proposals.slice(0, 3).map(prop => (
                            <Link
                              key={`prop-${prop.id}`}
                              to="/admin/queue"
                              className="px-2.5 py-0.5 rounded-full border font-mono text-[9px] flex items-center gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 hover:border-emerald-400 transition-colors"
                              title="Resolved by Hardware / Tool Deployment"
                            >
                              <HardDrive className="w-3 h-3 text-emerald-500" />
                              <strong>[Hardware] {prop.item_name}</strong>
                            </Link>
                          ))}

                          {/* Pathway 4: Network Infrastructure */}
                          {res.network.map(net => (
                            <Link
                              key={`net-${net.id}`}
                              to="/admin/narratives"
                              className="px-2.5 py-0.5 rounded-full border font-mono text-[9px] flex items-center gap-1 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900 hover:border-teal-400 transition-colors"
                              title="Resolved by Network Infrastructure Setup"
                            >
                              <Network className="w-3 h-3 text-teal-500" />
                              <strong>[Network] {net.connectivity_type}</strong>
                              <span className="opacity-75">({net.bandwidth_mbps} Mbps)</span>
                            </Link>
                          ))}

                          {/* Pathway 5: Needs Assessment Linkage */}
                          {res.needs.map(na => (
                            <span
                              key={`na-${na.id}`}
                              className="px-2.5 py-0.5 rounded-full border font-mono text-[9px] flex items-center gap-1 bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                              title="Linked Section 8.0 Needs Assessment"
                            >
                              <ClipboardCheck className="w-3 h-3 text-slate-400" />
                              <strong>[Needs] {na.title.slice(0, 24)}...</strong>
                            </span>
                          ))}

                          {/* Fallback if Completely Unresolved */}
                          {!res.isResolved && (
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-955/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-[9px] font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>No resolution pathway attached</span>
                              </span>
                              <Link
                                to="/admin/systems"
                                className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-[9px] flex items-center gap-1 font-mono"
                              >
                                <span>Register System</span>
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                              <span className="text-slate-300">&bull;</span>
                              <Link
                                to="/admin/projects/internal"
                                className="text-purple-600 dark:text-purple-400 hover:underline font-bold text-[9px] flex items-center gap-1 font-mono"
                              >
                                <span>Create Project</span>
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic">
                  No strategic concerns logged for planning cycle FY {activeCycle}. Click "Commit Strategic Concern", use a quick template, or aggregate from the Section 8.0 intake pool.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* INTAKE TAB: Department Needs Assessments (Section 8.0) */
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-slate-900 dark:text-white font-bold text-sm flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Departmental Needs Assessments (Section 8.0 Intake Pool)</span>
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                Review qualitative technical problems submitted by departments and aggregate them into institutional Part II.A Strategic Concerns.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1 text-[10.5px]">
                {[
                  { id: "pending", label: `Pending Intake (${pendingNeedsCount})` },
                  { id: "aggregated", label: `Aggregated (${needsAssessments.length - pendingNeedsCount})` },
                  { id: "all", label: `All (${needsAssessments.length})` }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setIntakeFilterStatus(f.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      intakeFilterStatus === f.id
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by title, dept..."
                  value={intakeSearch}
                  onChange={e => setIntakeSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
                {intakeSearch && (
                  <button
                    type="button"
                    onClick={() => setIntakeSearch("")}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
            {filteredNeedsAssessments.length > 0 ? (
              filteredNeedsAssessments.map(na => (
                <div 
                  key={na.id}
                  className={`p-5 rounded-2xl border transition-all space-y-3.5 shadow-xs ${
                    na.is_aggregated 
                      ? "bg-slate-50/50 dark:bg-slate-955/50 border-slate-200 dark:border-slate-800 opacity-80" 
                      : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-800"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-mono font-semibold flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>{na.department_name || `Dept ID: ${na.department_id}`}</span>
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono font-bold uppercase">
                          Alignment: {na.mfo_alignment}
                        </span>
                        {na.is_aggregated ? (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold uppercase flex items-center gap-1 font-mono">
                            <CheckSquare className="w-3 h-3" /> Aggregated into Part II.A
                          </span>
                        ) : (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-bold uppercase flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" /> Pending Intake
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1">{na.title}</h4>
                    </div>

                    {!na.is_aggregated ? (
                      <button
                        type="button"
                        onClick={() => handleAggregateFromNeeds(na)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Aggregate to Part II.A Concern</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Integrated with Concern</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider block">
                        Department Operational Problem
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{na.current_problem}</p>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider block">
                        Proposed Technical Solution
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
                No departmental needs assessments match your active filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}