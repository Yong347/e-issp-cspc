// frontend/src/views/admin/Queue/ConsolidatedQueue.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getProposalsQueue, 
  approveProposal, 
  returnProposal, 
  overrideProposal, 
  deleteProposal, 
  getDepartments, 
  getIctProjects, 
  getOutcomes,
  getAllNeedsAssessments
} from "../../../api/admin";
import { getComments, postComment, resolveComment } from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import { 
  ShieldCheck, 
  FileText, 
  FolderKanban, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Search, 
  Check, 
  RotateCcw, 
  Edit, 
  MessageSquare, 
  ExternalLink, 
  CheckSquare,
  Lock,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Save,
  X,
  GraduationCap,
  Sparkles,
  Trash2,
  ClipboardCheck,
  Calendar,
  Info,
  Filter,
  Layers,
  Coins
} from "lucide-react";

export default function ConsolidatedQueue() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();

  // Primary Classification Tabs: All, Strategic Buckets, Expenditure Classes, or Needs Linked
  const [activeTab, setActiveTab] = useState("all"); 
  const [proposals, setProposals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Server-Side Pagination, Filtering & Debounced Search States
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fundFilter, setFundFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(25);

  // Deep-Linking Highlight State
  const [highlightedId, setHighlightedId] = useState(null);

  // Override Modal State (DICT v.2026 Aligned + Sec 8.0 Provenance)
  const [activeOverrideItem, setActiveOverrideItem] = useState(null);
  const [overrideItemName, setOverrideItemName] = useState("");
  const [overrideCategory, setOverrideCategory] = useState("Hardware");
  const [overrideUnitCost, setOverrideUnitCost] = useState("");
  const [overrideStrategicCat, setOverrideStrategicCat] = useState("Office Productivity");
  const [overrideProjectId, setOverrideProjectId] = useState("");
  const [overrideOutcomeId, setOverrideOutcomeId] = useState("");
  const [overrideNeedsAssessmentId, setOverrideNeedsAssessmentId] = useState("");
  const [overrideOfficeLoc, setOverrideOfficeLoc] = useState("Central Office");
  const [overrideFundSource, setOverrideFundSource] = useState("General Appropriations Act (GAA)");
  const [overrideQuantities, setOverrideQuantities] = useState({});
  const [overrideJustification, setOverrideJustification] = useState("");
  const [overrideDevStatus, setOverrideDevStatus] = useState("N/A");
  const [overrideCreatedByStudents, setOverrideCreatedByStudents] = useState(false);
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Comments / Inline Revision Remarks Modal State
  const [activeDiscussionItem, setActiveDiscussionItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [requiresAction, setRequiresAction] = useState(false);

  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  // Dynamic Year Sequence Fallback (Supports 1 to N Years)
  const activeYears = (planningYears && planningYears.length > 0) ? planningYears : [2026, 2027, 2028];

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Capitalization and UACS Auto-Resolution Helper (DBM ₱50,000.00 Threshold + Training Expenses Code)
  const getAutoClassification = (name, cost, categoryType, strategicCat, isStudentCreated) => {
    if (isStudentCreated) {
      return {
        expClass: "Capital Outlay",
        uacs: "50604070 01 - ICT Software (Perpetual CO)"
      };
    }

    if (categoryType === "Subscription") {
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: "50299070 00 - ICT Software Subscription (MOOE)"
      };
    }

    const unit = parseFloat(cost) || 0;
    const isCO = unit >= 50000.00;
    const lower = (name || "").toLowerCase();

    // Mandated by DICT Guidelines Pg. 24: Training Expenses (MOOE)
    if (lower.includes("training") || lower.includes("seminar") || lower.includes("workshop")) {
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: "50202010 00 - Training Expenses (MOOE)"
      };
    }

    if (strategicCat === "Continuing Costs/Expenses") {
      if (lower.includes("subscription") || lower.includes("cloud") || lower.includes("internet")) {
        return {
          expClass: "Maintenance and Other Operating Expenses",
          uacs: "50299070 00 - ICT Software Subscription (MOOE)"
        };
      }
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: "50211030 00 - Consulting/Outsourced Development (MOOE)"
      };
    }

    if (strategicCat === "Office Productivity") {
      if (lower.includes("printer") || lower.includes("scanner") || lower.includes("plotter")) {
        return {
          expClass: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses",
          uacs: isCO ? "50604050 07 - Printing Equipment (CO)" : "50203210 07 - Semi-Expendable Printing Equipment (MOOE)"
        };
      }
      if (lower.includes("suite") || lower.includes("license") || lower.includes("subscription")) {
        return {
          expClass: "Maintenance and Other Operating Expenses",
          uacs: "50299070 00 - ICT Software Subscription (MOOE)"
        };
      }
      return {
        expClass: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses",
        uacs: isCO ? "50604050 03 - ICT Equipment (CO)" : "50203210 03 - Semi-Expendable ICT Equipment (MOOE)"
      };
    }

    if (lower.includes("contractor") || lower.includes("consulting") || lower.includes("development")) {
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: "50211030 00 - Consulting/Outsourced Development (MOOE)"
      };
    }

    return {
      expClass: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses",
      uacs: isCO ? "50604050 03 - ICT Equipment (CO)" : "50203210 03 - Semi-Expendable ICT Equipment (MOOE)"
    };
  };

  // Sync URL Query Parameters into filters (Global Search & Dashboard Deep-Links)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const searchVal = searchParams.get("search");
    if (searchVal !== null) {
      setSearchTerm(searchVal);
      setDebouncedSearch(searchVal);
    }
    const statusVal = searchParams.get("status_filter");
    if (statusVal !== null) {
      setStatusFilter(statusVal);
    }
    const deptVal = searchParams.get("dept_id");
    if (deptVal !== null) {
      setDeptFilter(deptVal);
    }
    const catVal = searchParams.get("strategic_category");
    if (catVal !== null) {
      setActiveTab(catVal);
    }
    const fundVal = searchParams.get("fund_source");
    if (fundVal !== null) {
      setFundFilter(fundVal);
    }
  }, [location.search]);

  // Debounce search input to prevent network spam while ensuring live reactive search execution
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setSkip(0);
    }, 280);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadReferenceData = async () => {
    try {
      const [depts, projs, outs, needs] = await Promise.all([
        getDepartments(token).catch(() => []),
        getIctProjects(token, activeCycle).catch(() => []),
        getOutcomes(token, activeCycle).catch(() => []),
        getAllNeedsAssessments(token).catch(() => [])
      ]);
      setDepartments(Array.isArray(depts) ? depts : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setOutcomes(Array.isArray(outs) ? outs : []);
      setNeedsAssessments(Array.isArray(needs) ? needs : []);
    } catch (e) {
      console.warn("Could not load reference data:", e);
    }
  };

  const fetchQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = { skip, limit, issp_period: activeCycle };
      if (deptFilter) params.dept_id = deptFilter;
      if (statusFilter) params.status_filter = statusFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      if (!["all", "Capital Outlay", "MOOE", "needs_linked"].includes(activeTab)) {
        params.strategic_category = activeTab;
      }

      const payload = await getProposalsQueue(token, params);
      const itemsList = Array.isArray(payload) ? payload : (payload?.data || []);
      const totalItemsCount = Array.isArray(payload) ? payload.length : (payload?.total || 0);

      setProposals(itemsList);
      setTotalCount(totalItemsCount);
    } catch (err) {
      setError(err.message || "Network error loading queue.");
    } finally {
      setLoading(false);
    }
  }, [token, skip, limit, activeCycle, deptFilter, statusFilter, debouncedSearch, activeTab]);

  useEffect(() => {
    if (token) {
      loadReferenceData();
    }
  }, [token, activeCycle]);

  useEffect(() => {
    if (token) {
      fetchQueue();
    }
  }, [fetchQueue]);

  // Deep-linking row focus listener
  useEffect(() => {
    if (location.state?.highlightId && proposals.length > 0) {
      const targetId = location.state.highlightId;
      setHighlightedId(targetId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`proposal-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => setHighlightedId(null), 3500);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [location.state, proposals]);

  const handleApprove = async (id, itemName) => {
    setError(null);
    setSuccess(null);
    try {
      await approveProposal(token, id);
      setSuccess(`Proposal line item '${itemName}' approved successfully.`);
      fetchQueue();
    } catch (err) {
      setError(err.message || "Approval failed.");
    }
  };

  const handleReturn = async (id, itemName) => {
    setError(null);
    setSuccess(null);
    try {
      await returnProposal(token, id);
      setSuccess(`Proposal line item '${itemName}' returned for revisions.`);
      fetchQueue();
    } catch (err) {
      setError(err.message || "Return failed.");
    }
  };

  const handleDeleteProposal = async (id, itemName) => {
    if (!window.confirm(`Permanently remove proposal '${itemName}' from Part IV.A?`)) return;
    try {
      await deleteProposal(token, id);
      setSuccess(`Proposal '${itemName}' deleted.`);
      fetchQueue();
    } catch (err) {
      setError(err.message);
    }
  };

  const openOverrideModal = (item) => {
    setActiveOverrideItem(item);
    setOverrideItemName(item.item_name || "");
    setOverrideCategory(item.category || "Hardware");
    setOverrideUnitCost(String(item.unit_cost || "0"));
    setOverrideStrategicCat(item.strategic_category || "Office Productivity");
    setOverrideProjectId(item.project_id || "");
    setOverrideOutcomeId(String(item.outcome_id || (outcomes[0]?.id || "")));
    setOverrideNeedsAssessmentId(item.needs_assessment_id ? String(item.needs_assessment_id) : "");
    setOverrideOfficeLoc(item.office_location || "Central Office");
    setOverrideFundSource(item.fund_source || "General Appropriations Act (GAA)");
    setOverrideJustification(item.justification || "");
    setOverrideDevStatus(item.system_development_status || "N/A");
    setOverrideCreatedByStudents(Boolean(item.created_by_students));
    
    const prefill = {};
    activeYears.forEach(year => {
      prefill[String(year)] = item.yearly_quantities?.[String(year)] ?? 0;
    });
    setOverrideQuantities(prefill);
  };

  // Derived Override Calculations
  const overrideTotalQty = Object.values(overrideQuantities).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const overrideTotalOutlay = (parseFloat(overrideUnitCost) || 0) * overrideTotalQty;
  const isOverrideMajorOutlay = overrideTotalOutlay >= 2000000.00;
  const overrideAutoClass = getAutoClassification(
    overrideItemName, 
    overrideUnitCost, 
    overrideCategory, 
    overrideStrategicCat, 
    overrideCreatedByStudents
  );

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const costNum = parseFloat(overrideUnitCost);
    if (isNaN(costNum) || costNum < 0) {
      setError("Please specify a valid unit rate (₱0.00 or greater).");
      return;
    }

    if (isOverrideMajorOutlay && overrideDevStatus === "N/A") {
      setError("Rule 2 Violation: Total outlay exceeds ₱2,000,000.00. Please select a System Development Status ('For Development' or 'For Enhancement').");
      return;
    }

    setSubmittingOverride(true);
    try {
      await overrideProposal(token, activeOverrideItem.id, {
        item_name: overrideItemName.trim(),
        unit_cost: costNum,
        category: overrideCategory,
        strategic_category: overrideStrategicCat,
        project_id: overrideProjectId || null,
        needs_assessment_id: overrideNeedsAssessmentId || null,
        office_location: overrideOfficeLoc,
        fund_source: overrideFundSource,
        justification: overrideJustification.trim() || null,
        system_development_status: overrideDevStatus,
        created_by_students: overrideCreatedByStudents,
        yearly_quantities: overrideQuantities
      });
      setSuccess(`Parameters overridden and reclassified for: '${overrideItemName}'`);
      setActiveOverrideItem(null);
      fetchQueue();
    } catch (err) {
      setError(err.message || "Administrative override rejected by governance rules.");
    } finally {
      setSubmittingOverride(false);
    }
  };

  const openComments = async (item) => {
    setActiveDiscussionItem(item);
    setNewCommentText("");
    setRequiresAction(false);
    try {
      const data = await getComments(item.id);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      await postComment(activeDiscussionItem.id, {
        text: newCommentText.trim(),
        requires_department_action: requiresAction
      });
      setNewCommentText("");
      setRequiresAction(false);
      const data = await getComments(activeDiscussionItem.id);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResolveComment = async (commentId) => {
    try {
      await resolveComment(activeDiscussionItem.id, commentId);
      const data = await getComments(activeDiscussionItem.id);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(err.message);
    }
  };

  const getDepartmentName = (id, item = null) => {
    if (item?.target_office_automated) return item.target_office_automated;
    if (item?.department?.name) return item.department.name;
    const d = departments.find(dept => (dept.department_id || dept.id) === id);
    return d ? (d.department_name || d.name) : "Central Office";
  };

  const getNeedsAssessment = (id) => {
    if (!id) return null;
    return needsAssessments.find(na => String(na.id) === String(id));
  };

  const filteredProposals = proposals.filter(item => {
    if (activeTab === "Capital Outlay") return item.expenditure_class === "Capital Outlay";
    if (activeTab === "MOOE") return item.expenditure_class !== "Capital Outlay";
    if (activeTab === "needs_linked") return Boolean(item.needs_assessment_id);
    if (fundFilter && item.fund_source !== fundFilter && !item.fund_source?.startsWith(fundFilter)) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Master Review Queue (Part IV.A Financial Ledger)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Audit, reclassify, and approve resource proposals. Enforces DBM capitalization thresholds (₱50k CO vs MOOE) and Section 8.0 Needs Assessment provenance linkages.
          </p>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Queue</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs & Search Filter Toolbar */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 self-start">
          {[
            { id: "all", label: "All Line Items" },
            { id: "Office Productivity", label: "Office Productivity" },
            { id: "Internal ICT Projects", label: "Internal Projects" },
            { id: "Cross-Agency ICT Projects", label: "Cross-Agency" },
            { id: "Continuing Costs/Expenses", label: "Continuing Costs" },
            { id: "Capital Outlay", label: "Capital Outlay (CO)" },
            { id: "MOOE", label: "MOOE Services" },
            { id: "needs_linked", label: "Needs Linked (Sec 8.0)" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setSkip(0); setActiveTab(tab.id); }}
              className={`px-3 py-1.5 font-bold rounded-lg transition-all text-[11px] cursor-pointer ${
                activeTab === tab.id 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full justify-between pt-1">
          <div className="relative w-full md:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search resource, UACS code, or project..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <select
              value={deptFilter}
              onChange={(e) => { setSkip(0); setDeptFilter(e.target.value); }}
              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none text-xs"
            >
              <option value="">-- All Departments --</option>
              {departments.map(d => (
                <option key={d.department_id || d.id} value={d.department_id || d.id}>
                  {d.department_name || d.name}
                </option>
              ))}
            </select>

            <select
              value={fundFilter}
              onChange={(e) => { setSkip(0); setFundFilter(e.target.value); }}
              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none text-xs"
            >
              <option value="">-- All Fund Sources --</option>
              <option value="General Appropriations Act (GAA)">GAA (National Budget)</option>
              <option value="Foreign-Assisted Projects (FAP)">FAP (Loans / Grants)</option>
              <option value="Locally Funded">Locally Funded</option>
              <option value="Other Income Generating Sources">Other Income</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => { setSkip(0); setStatusFilter(e.target.value); }}
              className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-semibold cursor-pointer outline-none text-xs"
            >
              <option value="">-- All Statuses --</option>
              <option value="Submitted">Submitted (Review Pending)</option>
              <option value="Approved">Approved</option>
              <option value="Returned">Returned</option>
              <option value="Draft">Draft Mode</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Querying master queue...</span>
            </div>
          ) : filteredProposals.length > 0 ? (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px]">
                  <th className="py-3 px-3.5 w-44">Department / Office</th>
                  <th className="py-3 px-3.5">Requested Resource &amp; Provenance</th>
                  <th className="py-3 px-3.5">UACS Code &amp; Class</th>
                  <th className="py-3 px-3.5">Financing Source</th>
                  <th className="py-3 px-3.5">Target Schedule</th>
                  <th className="py-3 px-3.5 text-right">Cost (Unit / Total)</th>
                  <th className="py-3 px-3.5 text-center">Quotation State</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredProposals.map((item) => {
                  const filename = item.canvas_evidence_url ? item.canvas_evidence_url.split("/").pop() : null;
                  const totalCost = Number(item.total_cost || (item.unit_cost * item.total_qty) || 0);
                  const isCanvasExpired = item.canvas_expiration_date && new Date(item.canvas_expiration_date) < new Date();
                  const isStudentSystem = Boolean(item.created_by_students);
                  const linkedNa = getNeedsAssessment(item.needs_assessment_id);

                  return (
                    <tr 
                      key={item.id} 
                      id={`proposal-${item.id}`} 
                      className={`transition-colors ${
                        item.id === highlightedId 
                          ? "bg-blue-50/80 dark:bg-blue-955/40 border-l-4 border-l-blue-600" 
                          : "hover:bg-slate-50/80 dark:hover:bg-slate-955/30"
                      }`}
                    >
                      {/* Department */}
                      <td className="py-3.5 px-3.5 align-top">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {getDepartmentName(item.department_id, item)}
                        </div>
                        <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 font-mono">
                          {item.target_office_automated || item.office_location || "Central Office"}
                        </span>
                      </td>

                      {/* Resource Description & Badges */}
                      <td className="py-3.5 px-3.5 align-top max-w-xs space-y-1.5">
                        <div className="font-bold text-slate-900 dark:text-white text-xs">{item.item_name}</div>
                        
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.outcome?.outcome_name && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 truncate max-w-[150px]">
                              {item.outcome.outcome_name}
                            </span>
                          )}

                          {item.project_rel?.project_title && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 truncate max-w-[150px]">
                              {item.project_rel.project_title}
                            </span>
                          )}

                          {isStudentSystem && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                              Student Software
                            </span>
                          )}

                          {item.system_development_status && item.system_development_status !== "N/A" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                              {item.system_development_status}
                            </span>
                          )}

                          {item.is_expansion && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              Expansion Project
                            </span>
                          )}

                          {/* Section 8.0 Needs Assessment Provenance Badge */}
                          {item.needs_assessment_id && (
                            <span 
                              className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20 cursor-help"
                              title={linkedNa ? `Linked Needs Assessment: ${linkedNa.title}\nProblem: ${linkedNa.current_problem}` : `Needs Assessment ID: ${item.needs_assessment_id}`}
                            >
                              Sec 8.0 Linked: {linkedNa?.title ? linkedNa.title.slice(0, 24) + "..." : "Attached"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* UACS & Class */}
                      <td className="py-3.5 px-3.5 align-top">
                        <div className="font-mono text-[10px] text-slate-700 dark:text-slate-300 font-semibold">{item.uacs_object_code || "50604050 03"}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono ${
                          item.expenditure_class === "Capital Outlay"
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                            : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                        }`}>
                          {item.expenditure_class === "Capital Outlay" ? "Capital Outlay (CO)" : "MOOE"}
                        </span>
                      </td>

                      {/* Financing Source */}
                      <td className="py-3.5 px-3.5 align-top font-medium text-slate-700 dark:text-slate-300">
                        {item.fund_source ? item.fund_source.split(" (")[0] : "GAA"}
                      </td>

                      {/* Schedule Targets */}
                      <td className="py-3.5 px-3.5 align-top font-mono text-[10.5px]">
                        <div className="font-bold text-slate-900 dark:text-white">{item.total_qty} units</div>
                        <div className="text-slate-400 text-[9px] mt-0.5">
                          {activeYears.map(y => `FY${y}: ${item.yearly_quantities?.[String(y)] ?? 0}`).join(" | ")}
                        </div>
                      </td>

                      {/* Cost */}
                      <td className="py-3.5 px-3.5 align-top text-right font-mono">
                        <div className="text-slate-500 text-[10px]">{formatPHP(item.unit_cost)}</div>
                        <div className="font-bold text-slate-900 dark:text-white text-xs">{formatPHP(totalCost)}</div>
                      </td>

                      {/* Quotation Proof */}
                      <td className="py-3.5 px-3.5 align-top text-center">
                        {isStudentSystem ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                            {item.canvas_evidence_url ? "Proof Attached" : "Turnover Deed"}
                          </span>
                        ) : item.canvas_evidence_url ? (
                          <div className="space-y-1 inline-block text-center">
                            <a
                              href={item.canvas_evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1 text-[10px]"
                            >
                              <span className="max-w-[80px] truncate">{filename}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                            {isCanvasExpired ? (
                              <span className="block px-2 py-0.2 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[8.5px] font-bold uppercase">
                                Expired
                              </span>
                            ) : (
                              <span className="block text-[8.5px] text-slate-400 font-mono">Verified</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                            Missing Quote
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3.5 align-top text-center">
                        <StatusPill status={item.status} />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3.5 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openComments(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Revision Remarks"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {item.status === "Submitted" ? (
                            <>
                              <button
                                onClick={() => handleApprove(item.id, item.item_name)}
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 dark:bg-emerald-500/10 dark:hover:bg-emerald-600 dark:text-emerald-400 dark:hover:text-white dark:border-emerald-500/20 transition-colors cursor-pointer font-bold"
                                title="Approve Line Item"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openOverrideModal(item)}
                                className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 dark:bg-blue-500/10 dark:hover:bg-blue-600 dark:text-blue-400 dark:hover:text-white dark:border-blue-500/20 transition-colors cursor-pointer"
                                title="Administrative Override"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReturn(item.id, item.item_name)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-600 dark:text-rose-400 dark:hover:text-white dark:border-rose-500/20 transition-colors cursor-pointer font-bold"
                                title="Return to Department"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openOverrideModal(item)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="Override Item"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProposal(item.id, item.item_name)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 text-slate-500 transition-colors cursor-pointer"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-400 italic">
              No proposal line items found matching active parameters.
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-xs">
        <span className="text-slate-500 text-xs">
          Showing <strong>{totalCount > 0 ? skip + 1 : 0}</strong> to <strong>{Math.min(skip + limit, totalCount)}</strong> of <strong>{totalCount}</strong> items
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 transition-all cursor-pointer text-xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <button
            onClick={() => setSkip(skip + limit)}
            disabled={skip + limit >= totalCount}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 transition-all cursor-pointer text-xs"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* OVERRIDE MODAL (DICT v.2026 Aligned + Sec 8.0 Provenance) */}
      {activeOverrideItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Administrative Override Console</h3>
                <span className="text-[10px] text-slate-500 font-mono">Resource ID: {activeOverrideItem.id}</span>
              </div>
              <button onClick={() => setActiveOverrideItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Resource Item Label</label>
                <input
                  type="text" required value={overrideItemName} onChange={(e) => setOverrideItemName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              {/* Student-Developed System Flag */}
              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">System Created by Students</span>
                  <span className="text-[9.5px] text-slate-500 block">Classified as Capital Outlay (ICT Software); quotation canvas is optional.</span>
                </div>
                <input
                  type="checkbox"
                  checked={overrideCreatedByStudents}
                  onChange={e => setOverrideCreatedByStudents(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* Organizational Outcome (Part I.A.4 Link) */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                  <span>Broader Scope: Organizational Outcome (Part I.A.4)</span>
                </label>
                <select
                  value={overrideOutcomeId}
                  onChange={(e) => setOverrideOutcomeId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  {outcomes.map(o => (
                    <option key={o.id} value={String(o.id)}>
                      {o.outcome_name} ({o.type_label})
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Section 8.0 Department Needs Assessment */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                  <ClipboardCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Link to Department Needs Assessment (Section 8.0)</span>
                </label>
                <select
                  value={overrideNeedsAssessmentId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setOverrideNeedsAssessmentId(selectedId);
                    const matched = needsAssessments.find(n => String(n.id) === selectedId);
                    if (matched && !overrideJustification) {
                      setOverrideJustification(`[Justified by Needs Assessment]: ${matched.current_problem}`);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="">-- None / Standalone Line Item --</option>
                  {needsAssessments
                    .filter(na => !activeOverrideItem?.department_id || na.department_id === activeOverrideItem.department_id)
                    .map(na => (
                      <option key={na.id} value={String(na.id)}>
                        [{na.mfo_alignment?.toUpperCase() || "MFO"}] {na.title}
                      </option>
                    ))}
                  {needsAssessments.some(na => activeOverrideItem?.department_id && na.department_id !== activeOverrideItem.department_id) && (
                    <optgroup label="Other Department Needs Assessments">
                      {needsAssessments
                        .filter(na => activeOverrideItem?.department_id && na.department_id !== activeOverrideItem.department_id)
                        .map(na => (
                          <option key={na.id} value={String(na.id)}>
                            [{na.department_name || `Dept ${na.department_id}`}] {na.title}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                {overrideNeedsAssessmentId && (
                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono block">
                    ✓ Connected with Section 8.0 Needs Assessment
                  </span>
                )}
              </div>

              {/* Classification Category & Strategic Bucket */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Classification</label>
                  <select
                    value={overrideCategory} onChange={(e) => setOverrideCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none"
                  >
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Subscription">Subscription</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Spending Bucket</label>
                  <select
                    value={overrideStrategicCat}
                    onChange={(e) => setOverrideStrategicCat(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Office Productivity">Office Productivity</option>
                    <option value="Internal ICT Projects">Internal ICT Projects</option>
                    <option value="Cross-Agency ICT Projects">Cross-Agency Projects</option>
                    <option value="Continuing Costs/Expenses">Continuing Costs/Expenses</option>
                  </select>
                </div>
              </div>

              {/* Unit Cost & Location */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Unit Cost (PHP ₱)</label>
                  <input
                    type="number" step="0.01" min="0" required value={overrideUnitCost} onChange={(e) => setOverrideUnitCost(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Deployment Location</label>
                  <select
                    value={overrideOfficeLoc}
                    onChange={(e) => setOverrideOfficeLoc(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Central Office">Central Office</option>
                    <option value="Field/Regional Office">Field/Regional Office</option>
                  </select>
                </div>
              </div>

              {/* Financing Fund Source */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Financing Fund Source</label>
                <select
                  value={overrideFundSource}
                  onChange={(e) => setOverrideFundSource(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="General Appropriations Act (GAA)">GAA (National Budget)</option>
                  <option value="Foreign-Assisted Projects (FAP)">FAP (Loans / Grants)</option>
                  <option value="Locally Funded">Locally Funded</option>
                  <option value="Other Income Generating Sources">Other Income</option>
                </select>
              </div>

              {/* Associated ICT Project */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Associated Strategic Project (Part III.E)</label>
                <select
                  value={overrideProjectId}
                  onChange={(e) => setOverrideProjectId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="">-- No Specific Project (Office / Continuing) --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.project_title}</option>
                  ))}
                </select>
              </div>

              {/* Rule 2: Major Outlays Development Status Parameter */}
              {isOverrideMajorOutlay && (
                <div className="p-3 bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-2 animate-fadeIn">
                  <span className="block text-[10px] text-amber-800 dark:text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Outlay &ge; ₱2,000,000.00 (Rule 2 Tag Mandated)</span>
                  </span>
                  <select
                    value={overrideDevStatus}
                    onChange={(e) => setOverrideDevStatus(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="For Development">For Development (New System)</option>
                    <option value="For Enhancement">For Enhancement (Upgrade)</option>
                  </select>
                </div>
              )}

              {/* Multi-Year Physical Targets Grid */}
              <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>Adjust Multi-Year Quantities</span>
                </span>
                <div className="space-y-2">
                  {activeYears.map(year => (
                    <div key={year} className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Fiscal Year {year} Target</span>
                      <input
                        type="number"
                        min="0"
                        required
                        value={overrideQuantities[String(year)] ?? 0}
                        onChange={(e) => setOverrideQuantities({
                          ...overrideQuantities,
                          [String(year)]: parseInt(e.target.value, 10) || 0
                        })}
                        className="w-20 p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[10.5px] font-mono">
                  <span className="text-slate-500">Total Units: <strong>{overrideTotalQty}</strong></span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Total Cost: {formatPHP(overrideTotalOutlay)}</span>
                </div>
              </div>

              {/* Live DBM Capitalization & UACS Preview Box */}
              <div className="p-3 bg-blue-50 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px]">
                  <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Live DBM Auto-Classification Resolution</span>
                </div>
                <div>
                  Class: <strong className="uppercase">{overrideAutoClass.expClass}</strong> &bull; UACS: <code className="font-mono">{overrideAutoClass.uacs}</code>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Administrative Override Reason</label>
                <textarea
                  rows={2}
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  placeholder="Record justification for DBM and audit trail..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submittingOverride}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submittingOverride ? "Saving Override..." : "Commit Administrative Override"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DISCUSSION MODAL */}
      {activeDiscussionItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl flex flex-col h-[520px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-sm">Discussions &amp; Remarks</h3>
                <p className="text-[10px] text-slate-500 font-mono">Proposal: {activeDiscussionItem.item_name}</p>
              </div>
              <button onClick={() => setActiveDiscussionItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {comments.length > 0 ? (
                comments.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-blue-600 dark:text-blue-400">{c.author_name}</span>
                      <span className="text-slate-400 font-mono">{new Date(c.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{c.text}</p>
                    
                    {c.requires_department_action && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 font-bold uppercase tracking-wider font-mono">
                          Requires Action by Department
                        </span>
                        {c.is_resolved ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 text-[10px] font-mono">
                            <CheckSquare className="w-3.5 h-3.5" /> Resolved
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolveComment(c.id)}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                          >
                            Resolve Action
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 italic">No remarks logged yet.</div>
              )}
            </div>

            <form onSubmit={handlePostComment} className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="action_gate"
                  checked={requiresAction}
                  onChange={(e) => setRequiresAction(e.target.checked)}
                  className="w-3.5 h-3.5 accent-rose-600 rounded cursor-pointer"
                />
                <label htmlFor="action_gate" className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none">
                  Flag as Action Item (blocks department submission until resolved)
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  type="text" required value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Post feedback or revision instructions..."
                  className="flex-1 p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
                <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer">
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}