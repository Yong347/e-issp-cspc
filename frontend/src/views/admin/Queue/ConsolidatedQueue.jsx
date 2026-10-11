// frontend/src/views/admin/Queue/ConsolidatedQueue.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getProposalsQueue, 
  approveProposal, 
  returnProposal, 
  overrideProposal, 
  deleteProposal, 
  batchApproveProposals,
  getDepartments, 
  getIctProjects, 
  getOutcomes,
  getStrategicConcerns,
  getAllNeedsAssessments,
  getStrategicCategories,
  getUacsCatalog,
  getPolicySettings
} from "../../../api/admin";
import { getComments, postComment, resolveComment } from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
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
  SlidersHorizontal,
  CheckCheck,
  Building,
  Tag,
  ArrowRight,
  CornerDownRight,
  Layers,
  HelpCircle,
  Coins
} from "lucide-react";

/**
 * Strips numeric accounting code prefixes to display clean, official account titles.
 * Example: "50604050 03 - ICT Equipment (CO)" -> "ICT Equipment (CO)"
 */
const cleanUacsTitle = (uacsStr) => {
  if (!uacsStr) return "";
  const s = String(uacsStr).trim();
  if (s.includes(" - ")) {
    return s.split(" - ", 2)[1].trim();
  }
  return s.replace(/^\d{8}(?:\s+\d{2})?\s*[-–]?\s*/, "").trim() || s;
};

export default function ConsolidatedQueue() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();
  const navigate = useNavigate();

  // Core Data Lists
  const [proposals, setProposals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [strategicConcerns, setStrategicConcerns] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [strategicCategories, setStrategicCategories] = useState([]);
  const [uacsCatalog, setUacsCatalog] = useState([]);
  const [policySettings, setPolicySettings] = useState({
    capitalization_threshold: 50000.00,
    major_outlay_review_threshold: 2000000.00,
    hardware_replacement_buffer_units: 3,
    canvas_expiration_warning_days: 14
  });

  // UI & Loading States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Multi-Select Batch Approvals
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchApproving, setBatchApproving] = useState(false);

  // Classification Tab & Server-Side Filters
  const [activeTab, setActiveTab] = useState("all"); 
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fundFilter, setFundFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(25);

  // Deep-Linking Row Highlight State
  const [highlightedId, setHighlightedId] = useState(null);

  // Administrative Review / Governance Assignment Modal State
  const [activeOverrideItem, setActiveOverrideItem] = useState(null);
  const [overrideItemName, setOverrideItemName] = useState("");
  const [overrideCategory, setOverrideCategory] = useState("Hardware");
  const [overrideUnitCost, setOverrideUnitCost] = useState("");
  const [overrideStrategicCat, setOverrideStrategicCat] = useState("Internal ICT Projects");
  const [overrideProjectId, setOverrideProjectId] = useState("");
  
  const [overrideOutcomeId, setOverrideOutcomeId] = useState("");
  const [overrideConcernId, setOverrideConcernId] = useState("");
  const [overrideNeedsAssessmentId, setOverrideNeedsAssessmentId] = useState("");
  const [overrideOfficeLoc, setOverrideOfficeLoc] = useState("Central Office");
  const [overrideFundSource, setOverrideFundSource] = useState("General Appropriations Act (GAA)");
  const [overrideQuantities, setOverrideQuantities] = useState({});
  const [overrideJustification, setOverrideJustification] = useState("");
  const [overrideDevStatus, setOverrideDevStatus] = useState("N/A");
  const [overrideCreatedByStudents, setOverrideCreatedByStudents] = useState(false);
  const [overrideUacsCode, setOverrideUacsCode] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Return Modal State (Action Items & Mandatory Feedback)
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [returnRemark, setReturnRemark] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // Comments / Inline Revision Remarks Modal State
  const [activeDiscussionItem, setActiveDiscussionItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [requiresAction, setRequiresAction] = useState(false);

  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

  // Dynamic Year Sequence (1 to N Years)
  const activeYears = useMemo(() => {
    if (planningYears && planningYears.length > 0) return planningYears;
    if (activeCycle && activeCycle.includes("-")) {
      const parts = activeCycle.split("-");
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        const span = [];
        for (let y = start; y <= end; y++) span.push(y);
        return span;
      }
    }
    return [2026, 2027, 2028];
  }, [planningYears, activeCycle]);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Capitalization & UACS Auto-Resolution Helper (Zero Hardcoding)
  const getAutoClassification = useCallback((name, cost, categoryType, strategicCat, isStudentCreated) => {
    if (isStudentCreated) {
      const swMatch = uacsCatalog.find(u => u.uacs_code.startsWith("50604070"));
      return {
        expClass: "Capital Outlay",
        uacs: swMatch ? `${swMatch.uacs_code} - ${swMatch.account_title}` : "50604070 01 - ICT Software (Perpetual CO)"
      };
    }

    if (categoryType === "Subscription") {
      const subMatch = uacsCatalog.find(u => u.is_subscription_default) || uacsCatalog.find(u => u.uacs_code.startsWith("50299070"));
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: subMatch ? `${subMatch.uacs_code} - ${subMatch.account_title}` : "50299070 00 - ICT Software Subscription (MOOE)"
      };
    }

    const unit = parseFloat(cost) || 0;
    const capThreshold = policySettings.capitalization_threshold || 50000.00;
    const isCO = unit >= capThreshold;
    const lower = (name || "").toLowerCase();

    // Mandated Training Expenses (MOOE) per DICT Guidelines
    if (lower.includes("training") || lower.includes("seminar") || lower.includes("workshop")) {
      const trMatch = uacsCatalog.find(u => u.uacs_code.startsWith("50202010"));
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: trMatch ? `${trMatch.uacs_code} - ${trMatch.account_title}` : "50202010 00 - Training Expenses (MOOE)"
      };
    }

    if (strategicCat === "Continuing Costs/Expenses" || strategicCat === "Continuing Costs") {
      if (lower.includes("subscription") || lower.includes("cloud") || lower.includes("internet") || lower.includes("bandwidth")) {
        const subMatch = uacsCatalog.find(u => u.is_subscription_default) || uacsCatalog.find(u => u.uacs_code.startsWith("50299070"));
        return {
          expClass: "Maintenance and Other Operating Expenses",
          uacs: subMatch ? `${subMatch.uacs_code} - ${subMatch.account_title}` : "50299070 00 - ICT Software Subscription (MOOE)"
        };
      }
      const consultMatch = uacsCatalog.find(u => u.uacs_code.startsWith("50211030"));
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: consultMatch ? `${consultMatch.uacs_code} - ${consultMatch.account_title}` : "50211030 00 - Consulting/Outsourced Development (MOOE)"
      };
    }

    if (strategicCat === "Office Productivity") {
      if (lower.includes("printer") || lower.includes("scanner") || lower.includes("plotter")) {
        const prefix = isCO ? "50604050 07" : "50203210 07";
        const prMatch = uacsCatalog.find(u => u.uacs_code.startsWith(prefix));
        return {
          expClass: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses",
          uacs: prMatch ? `${prMatch.uacs_code} - ${prMatch.account_title}` : (isCO ? "50604050 07 - Printing Equipment (CO)" : "50203210 07 - Semi-Expendable Printing Equipment (MOOE)")
        };
      }
      if (lower.includes("suite") || lower.includes("license") || lower.includes("subscription") || lower.includes("cloud")) {
        const subMatch = uacsCatalog.find(u => u.is_subscription_default) || uacsCatalog.find(u => u.uacs_code.startsWith("50299070"));
        return {
          expClass: "Maintenance and Other Operating Expenses",
          uacs: subMatch ? `${subMatch.uacs_code} - ${subMatch.account_title}` : "50299070 00 - ICT Software Subscription (MOOE)"
        };
      }
      const eqPrefix = isCO ? "50604050 03" : "50203210 03";
      const eqMatch = uacsCatalog.find(u => u.uacs_code.startsWith(eqPrefix));
      return {
        expClass: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses",
        uacs: eqMatch ? `${eqMatch.uacs_code} - ${eqMatch.account_title}` : (isCO ? "50604050 03 - ICT Equipment (CO)" : "50203210 03 - Semi-Expendable ICT Equipment (MOOE)")
      };
    }

    if (lower.includes("contractor") || lower.includes("consulting") || lower.includes("development")) {
      const consultMatch = uacsCatalog.find(u => u.uacs_code.startsWith("50211030"));
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: consultMatch ? `${consultMatch.uacs_code} - ${consultMatch.account_title}` : "50211030 00 - Consulting/Outsourced Development (MOOE)"
      };
    }

    const defaultPrefix = isCO ? "50604050 03" : "50203210 03";
    const defaultMatch = uacsCatalog.find(u => u.uacs_code.startsWith(defaultPrefix));
    return {
      expClass: isCO ? "Capital Outlay" : "Maintenance and Other Operating Expenses",
      uacs: defaultMatch ? `${defaultMatch.uacs_code} - ${defaultMatch.account_title}` : (isCO ? "50604050 03 - ICT Equipment (CO)" : "50203210 03 - Semi-Expendable ICT Equipment (MOOE)")
    };
  }, [policySettings.capitalization_threshold, uacsCatalog]);

  // Sync URL Query Parameters into filters (Global Search & Deep Links)
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

  // Debounce search input for responsive execution
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setSkip(0);
    }, 280);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [depts, projs, outs, concerns, needs, cats, uacs, policies] = await Promise.all([
        getDepartments(token).catch(() => []),
        getIctProjects(token, activeCycle).catch(() => []),
        getOutcomes(token, activeCycle).catch(() => []),
        getStrategicConcerns(token, activeCycle).catch(() => []),
        getAllNeedsAssessments(token).catch(() => []),
        getStrategicCategories(token).catch(() => []),
        getUacsCatalog(token).catch(() => []),
        getPolicySettings(token).catch(() => null)
      ]);
      setDepartments(Array.isArray(depts) ? depts : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setOutcomes(Array.isArray(outs) ? outs : []);
      setStrategicConcerns(Array.isArray(concerns) ? concerns : []);
      setNeedsAssessments(Array.isArray(needs) ? needs : []);
      if (Array.isArray(cats) && cats.length > 0) {
        setStrategicCategories(cats);
      }
      if (Array.isArray(uacs) && uacs.length > 0) {
        setUacsCatalog(uacs);
      }
      if (policies && typeof policies === "object") {
        setPolicySettings({
          capitalization_threshold: parseFloat(policies.capitalization_threshold) || 50000.00,
          major_outlay_review_threshold: parseFloat(policies.major_outlay_review_threshold) || 2000000.00,
          hardware_replacement_buffer_units: parseInt(policies.hardware_replacement_buffer_units, 10) || 3,
          canvas_expiration_warning_days: parseInt(policies.canvas_expiration_warning_days, 10) || 14
        });
      }
    } catch (e) {
      console.warn("Could not load queue reference data:", e);
    }
  }, [token, activeCycle]);

  const fetchQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = { skip, limit, issp_period: activeCycle };
      if (deptFilter) params.dept_id = deptFilter;
      if (statusFilter) params.status_filter = statusFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      if (activeTab === "pending_review") {
        params.status_filter = "submitted";
      } else if (!["all", "needs_linked", "Capital Outlay", "MOOE"].includes(activeTab)) {
        params.strategic_category = activeTab;
      }

      const payload = await getProposalsQueue(token, params);
      const itemsList = Array.isArray(payload) ? payload : (payload?.data || []);
      const totalItemsCount = Array.isArray(payload) ? payload.length : (payload?.total || 0);

      setProposals(itemsList);
      setTotalCount(totalItemsCount);
      setSelectedIds(new Set());
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
  }, [token, loadReferenceData]);

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

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSkip(0);
    setSelectedIds(new Set());
  };

  /**
   * Action: Approve Single Proposal
   * Checks for mandatory Program Outcome & UACS Code assignment,
   * enforces ₱2M major outlay review gates, and guarantees project linkage.
   */
  const handleApprove = async (id, itemName) => {
    setError(null);
    setSuccess(null);

    const target = proposals.find(p => p.id === id);
    if (!target) return;

    // Gate 1: Mandatory Program Outcome Assignment (Part I.A.4)
    if (!target.outcome_id && (!target.outcome || !target.outcome.id)) {
      setError(`Cannot approve '${itemName}': Assign an Organizational Outcome (Part I.A.4) first via Review & Classify.`);
      openOverrideModal(target);
      return;
    }

    // Gate 2: Mandatory UACS Code Assignment (Table B.4)
    if (!target.uacs_object_code) {
      setError(`Cannot approve '${itemName}': Assign an official UACS Object Code (Table B.4) first via Review & Classify.`);
      openOverrideModal(target);
      return;
    }

    const totalCost = Number(target.total_cost || (target.unit_cost * target.total_qty) || 0);
    const majorThreshold = policySettings.major_outlay_review_threshold || 2000000.00;
    const isMajor = totalCost >= majorThreshold;

    // Gate 3: Major Outlay Review Gate (>= ₱2M Rule)
    if (isMajor && (!target.project_id || target.system_development_status === "N/A")) {
      setError(`Major Outlay Review Gate: '${itemName}' exceeds ${formatPHP(majorThreshold)}. Verify its ICT Project linkage and development status before approving.`);
      openOverrideModal(target);
      return;
    }

    // Gate 4: Project Linkage Notice (auto-bound by backend or assigned via modal)
    if (!target.project_id && projects.length === 0) {
      setError("Approval Blocked: At least one ICT Project must be registered in Part III.E before approving proposal expenditures.");
      return;
    }

    try {
      await approveProposal(token, id);
      setSuccess(`Proposal line item '${itemName}' approved and bound to ICT Project.`);
      fetchQueue();
    } catch (err) {
      setError(err.message || "Approval failed.");
    }
  };

  const openReturnModal = (item) => {
    setReturnModalItem(item);
    setReturnRemark("Please attach an updated market quotation canvas and clarify technical specifications.");
  };

  const submitReturnWithInstructions = async (e) => {
    e.preventDefault();
    if (!returnModalItem || !returnRemark.trim()) return;

    setIsSubmittingReturn(true);
    setError(null);
    setSuccess(null);
    try {
      await returnProposal(token, returnModalItem.id);

      await postComment(returnModalItem.id, {
        text: returnRemark.trim(),
        proposal_id: returnModalItem.id,
        requires_department_action: true
      });

      setSuccess(`Proposal '${returnModalItem.item_name}' returned to department with flagged action items.`);
      setReturnModalItem(null);
      setReturnRemark("");
      fetchQueue();
    } catch (err) {
      setError(err.message || "Failed to return proposal with instructions.");
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleDeleteProposal = async (id, itemName) => {
    if (!window.confirm(`Permanently remove proposal '${itemName}' from queue?`)) return;
    try {
      await deleteProposal(token, id);
      setSuccess(`Proposal '${itemName}' deleted.`);
      fetchQueue();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  // Multi-Select Batch Approvals
  const submittedProposalsOnPage = useMemo(() => {
    return proposals.filter(p => p.status === "Submitted");
  }, [proposals]);

  const allSubmittedSelected = useMemo(() => {
    if (submittedProposalsOnPage.length === 0) return false;
    return submittedProposalsOnPage.every(p => selectedIds.has(p.id));
  }, [submittedProposalsOnPage, selectedIds]);

  const toggleSelectAllSubmitted = () => {
    const next = new Set(selectedIds);
    if (allSubmittedSelected) {
      submittedProposalsOnPage.forEach(p => next.delete(p.id));
    } else {
      submittedProposalsOnPage.forEach(p => next.add(p.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;

    if (projects.length === 0) {
      setError("Batch approval blocked: No active ICT Projects found in Part III.E to associate approved expenditures with.");
      return;
    }

    const unassignedOutcomeCount = Array.from(selectedIds).filter(id => {
      const p = proposals.find(item => item.id === id);
      return p && (!p.outcome_id && (!p.outcome || !p.outcome.id));
    }).length;

    if (unassignedOutcomeCount > 0 && outcomes.length === 0) {
      setError(`Batch approval blocked: ${unassignedOutcomeCount} selected proposal(s) require a Program Outcome, but none are registered for cycle ${activeCycle}.`);
      return;
    }

    const promptMsg = `Batch approve ${selectedIds.size} submitted proposal(s)? Proposals will automatically inherit the cycle's statutory default outcome and matching ICT Project portfolio.`;

    if (!window.confirm(promptMsg)) return;

    setBatchApproving(true);
    setError(null);
    setSuccess(null);
    try {
      await batchApproveProposals(token, Array.from(selectedIds));
      setSuccess(`Successfully approved ${selectedIds.size} proposal(s).`);
      setSelectedIds(new Set());
      fetchQueue();
    } catch (err) {
      setError(err.message || "Failed to process batch approval.");
    } finally {
      setBatchApproving(false);
    }
  };

  const getDepartmentName = useCallback((id, item = null) => {
    if (item?.target_office_automated) return item.target_office_automated;
    if (item?.department?.name) return item.department.name;
    const d = departments.find(dept => (dept.department_id || dept.id) === id);
    return d ? (d.department_name || d.name) : "Central Office";
  }, [departments]);

  const getNeedsAssessment = useCallback((id) => {
    if (!id) return null;
    return needsAssessments.find(na => String(na.id) === String(id));
  }, [needsAssessments]);

  // Open the administrative review & governance assignment modal
  const openOverrideModal = (item) => {
    setActiveOverrideItem(item);
    setOverrideItemName(item.item_name || "");
    setOverrideCategory(item.category || "Hardware");
    setOverrideUnitCost(String(item.unit_cost || "0"));

    // Check project linkage: prioritize explicit project_id or default to matching/first project
    const pId = item.project_id ? String(item.project_id) : "";
    const pObj = pId 
      ? projects.find(p => String(p.id) === String(pId))
      : (projects.length > 0 ? projects[0] : null);

    if (pObj) {
      setOverrideProjectId(String(pObj.id));
      setOverrideStrategicCat(pObj.project_category || "Internal ICT Projects");
      setOverrideFundSource(pObj.funding_source || item.fund_source || "General Appropriations Act (GAA)");
    } else {
      setOverrideProjectId("");
      setOverrideStrategicCat(item.strategic_category || "Internal ICT Projects");
      setOverrideFundSource(item.fund_source || "General Appropriations Act (GAA)");
    }

    setOverrideOutcomeId(item.outcome_id ? String(item.outcome_id) : (outcomes[0]?.id ? String(outcomes[0].id) : ""));
    setOverrideNeedsAssessmentId(item.needs_assessment_id ? String(item.needs_assessment_id) : "");
    
    const defaultOffice = item.target_office_automated || getDepartmentName(item.department_id, item) || item.office_location || "Central Office";
    setOverrideOfficeLoc(item.office_location || defaultOffice);
    
    setOverrideJustification(item.justification || "");
    setOverrideDevStatus(item.system_development_status || "N/A");
    setOverrideCreatedByStudents(Boolean(item.created_by_students || item.is_in_house_turnover));
    setOverrideUacsCode(item.uacs_object_code || "");
    
    const linkedNa = needsAssessments.find(n => String(n.id) === String(item.needs_assessment_id));
    const concernId = linkedNa?.strategic_concern_id ? String(linkedNa.strategic_concern_id) : "";
    setOverrideConcernId(concernId);

    const prefill = {};
    activeYears.forEach((year, idx) => {
      let q = item.yearly_quantities?.[String(year)] ?? 
              item.yearly_quantities?.[year] ?? 
              item.yearly_quantities?.[`Year ${idx + 1}`];
      if (q === undefined) {
        if (idx === 0) q = item.year_1_qty;
        else if (idx === 1) q = item.year_2_qty;
        else if (idx === 2) q = item.year_3_qty;
      }
      prefill[String(year)] = q !== undefined ? parseInt(q, 10) || 0 : 0;
    });
    setOverrideQuantities(prefill);
  };

  // Derived Override Calculations
  const overrideTotalQty = Object.values(overrideQuantities).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const overrideTotalOutlay = (parseFloat(overrideUnitCost) || 0) * overrideTotalQty;
  const majorReviewThreshold = policySettings.major_outlay_review_threshold || 2000000.00;
  const isOverrideMajorOutlay = overrideTotalOutlay >= majorReviewThreshold;
  
  const overrideAutoClass = useMemo(() => {
    return getAutoClassification(
      overrideItemName, 
      overrideUnitCost, 
      overrideCategory, 
      overrideStrategicCat, 
      overrideCreatedByStudents
    );
  }, [getAutoClassification, overrideItemName, overrideUnitCost, overrideCategory, overrideStrategicCat, overrideCreatedByStudents]);

  // Derive effective UACS and Expenditure Class directly from manual selection or dynamic auto-class
  const resolvedEffectiveUacs = useMemo(() => {
    return overrideUacsCode || overrideAutoClass.uacs;
  }, [overrideUacsCode, overrideAutoClass.uacs]);

  const resolvedEffectiveExpClass = useMemo(() => {
    if (overrideCreatedByStudents) {
      return "Capital Outlay";
    }
    if (overrideCategory === "Subscription") {
      return "Maintenance and Other Operating Expenses";
    }
    const matched = uacsCatalog.find(u => 
      resolvedEffectiveUacs.startsWith(u.uacs_code) || `${u.uacs_code} - ${u.account_title}` === resolvedEffectiveUacs
    );
    if (matched && matched.expenditure_class) {
      return matched.expenditure_class;
    }
    if (resolvedEffectiveUacs.includes("(CO)")) {
      return "Capital Outlay";
    }
    if (resolvedEffectiveUacs.includes("(MOOE)")) {
      return "Maintenance and Other Operating Expenses";
    }
    return overrideAutoClass.expClass;
  }, [overrideCreatedByStudents, overrideCategory, resolvedEffectiveUacs, uacsCatalog, overrideAutoClass.expClass]);

  // Administrative Override & Classification Submission Handler
  const handleSaveOverride = async (e, approveImmediately = false) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setSuccess(null);

    const costNum = parseFloat(overrideUnitCost);
    if (isNaN(costNum) || costNum < 0) {
      setError("Please specify a valid unit rate (₱0.00 or greater).");
      return;
    }

    if (!overrideOutcomeId) {
      setError("Program Alignment Requirement: Assign an Organizational Outcome (Part I.A.4) before proceeding.");
      return;
    }

    if (!overrideProjectId) {
      setError("Project Linkage Requirement: Select a target ICT Project from Part III.E to associate this expenditure with.");
      return;
    }

    if (isOverrideMajorOutlay && overrideDevStatus === "N/A") {
      setError(`Major Outlay Review Gate: Total outlay exceeds ${formatPHP(majorReviewThreshold)}. Select a System Development Status ('For Development' or 'For Enhancement').`);
      return;
    }

    setSubmittingOverride(true);
    try {
      const selectedProj = projects.find(p => String(p.id) === String(overrideProjectId));

      const finalProjectId = selectedProj ? selectedProj.id : null;
      const finalStrategicCat = selectedProj ? (selectedProj.project_category || "Internal ICT Projects") : overrideStrategicCat;
      const finalFundSource = selectedProj?.funding_source || overrideFundSource;
      const selectedStratObj = strategicCategories.find(s => s.name === finalStrategicCat);
      const effectiveUacs = resolvedEffectiveUacs;
      const effectiveExpClass = resolvedEffectiveExpClass;

      await overrideProposal(token, activeOverrideItem.id, {
        item_name: overrideItemName.trim(),
        unit_cost: costNum,
        category: overrideCategory,
        strategic_category: finalStrategicCat,
        strategic_category_id: selectedStratObj ? selectedStratObj.id : null,
        outcome_id: overrideOutcomeId ? parseInt(overrideOutcomeId, 10) : null,
        project_id: finalProjectId,
        needs_assessment_id: overrideNeedsAssessmentId || null,
        office_location: overrideOfficeLoc,
        fund_source: finalFundSource,
        justification: overrideJustification.trim() || null,
        system_development_status: overrideDevStatus,
        created_by_students: overrideCreatedByStudents,
        is_in_house_turnover: overrideCreatedByStudents,
        uacs_object_code: effectiveUacs,
        expenditure_class: effectiveExpClass,
        yearly_quantities: overrideQuantities
      });

      if (approveImmediately) {
        await approveProposal(token, activeOverrideItem.id);
        setSuccess(`Classification committed and proposal '${overrideItemName}' approved under project '${selectedProj?.project_title || "ICT Portfolio"}'.`);
      } else {
        setSuccess(`Governance classification saved for '${overrideItemName}'.`);
      }

      setActiveOverrideItem(null);
      fetchQueue();
    } catch (err) {
      setError(err.message || "Administrative classification update rejected by governance rules.");
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

  // Dynamic Tabs Array with Clarified Labels
  const dynamicTabs = useMemo(() => {
    const pendingCount = proposals.filter(p => p.status === "Submitted").length;

    return [
      { id: "all", label: "All Line Items" },
      { id: "pending_review", label: `Pending Review (${pendingCount})`, isAlert: pendingCount > 0 },
      ...(strategicCategories.length > 0
        ? strategicCategories.map(c => ({ id: c.name, label: c.name }))
        : [
            { id: "Office Productivity", label: "Office Productivity" },
            { id: "Internal ICT Projects", label: "Internal Projects" },
            { id: "Cross-Agency ICT Projects", label: "Cross-Agency" },
            { id: "Continuing Costs/Expenses", label: "Continuing Costs" }
          ]
      ),
      { id: "Capital Outlay", label: "Capital Outlay (CO)" },
      { id: "MOOE", label: "MOOE Services" },
      { id: "needs_linked", label: "Sec 8.0 Needs Linked" }
    ];
  }, [proposals, strategicCategories]);

  const filteredProposals = proposals.filter(item => {
    if (activeTab === "pending_review") {
      return item.status === "Submitted";
    }
    if (activeTab === "Capital Outlay") return item.expenditure_class === "Capital Outlay";
    if (activeTab === "MOOE") return item.expenditure_class !== "Capital Outlay";
    if (activeTab === "needs_linked") return Boolean(item.needs_assessment_id);
    if (!["all", "pending_review", "Capital Outlay", "MOOE", "needs_linked"].includes(activeTab)) {
      if ((item.strategic_category || "").toLowerCase() !== activeTab.toLowerCase()) return false;
    }
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
            <span>Master Review Queue &amp; Governance Intake</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Audit department submissions, assign UACS Object Codes ({formatPHP(policySettings.capitalization_threshold)} capitalization threshold), and govern pipeline compilation. Approved proposals belong strictly to an authorized ICT Project in Part III.E.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchApprove}
              disabled={batchApproving}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm text-xs cursor-pointer transition-all animate-fadeIn"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{batchApproving ? "Approving..." : `Batch Approve (${selectedIds.size})`}</span>
            </button>
          )}
          <CompilerSyncButton 
            moduleName="budget" 
            activeCycle={activeCycle} 
            token={token} 
            onSaveAndSync={fetchQueue} 
            label="Verify Pipeline"
          />
          <button
            onClick={fetchQueue}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Queue</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs & Search Filter Toolbar */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 self-start">
          {dynamicTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3 py-1.5 font-bold rounded-lg transition-all text-[11px] cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.id 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <span>{tab.label}</span>
              {tab.isAlert && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
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
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 placeholder-slate-400"
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
              onChange={(e) => { setSkip(0); setSelectedIds(new Set()); setDeptFilter(e.target.value); }}
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
              onChange={(e) => { setSkip(0); setSelectedIds(new Set()); setFundFilter(e.target.value); }}
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
              onChange={(e) => { setSkip(0); setSelectedIds(new Set()); setStatusFilter(e.target.value); }}
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
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px]">
                  <th className="py-3 px-3 w-8 text-center">
                    <input 
                      type="checkbox"
                      checked={allSubmittedSelected}
                      onChange={toggleSelectAllSubmitted}
                      disabled={submittedProposalsOnPage.length === 0}
                      className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer"
                      title="Select all submitted proposals on this page"
                    />
                  </th>
                  <th className="py-3 px-3.5 w-40">Department / Office</th>
                  <th className="py-3 px-3.5">Requested Resource &amp; Governance Provenance</th>
                  <th className="py-3 px-3.5">UACS Code &amp; Class</th>
                  <th className="py-3 px-3.5">Financing Source</th>
                  <th className="py-3 px-3.5">Target Schedule</th>
                  <th className="py-3 px-3.5 text-right">Cost (Unit / Total)</th>
                  <th className="py-3 px-3.5 text-center">Quotation State</th>
                  <th className="py-3 px-3.5 text-center">Review State</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredProposals.map((item) => {
                  const filename = item.canvas_evidence_url ? item.canvas_evidence_url.split("/").pop() : null;
                  const totalCost = Number(item.total_cost || (item.unit_cost * item.total_qty) || 0);
                  const isCanvasExpired = item.canvas_expiration_date && new Date(item.canvas_expiration_date) < new Date();
                  const isStudentSystem = Boolean(item.created_by_students || item.is_in_house_turnover);
                  const linkedNa = getNeedsAssessment(item.needs_assessment_id);
                  const isSubmitted = item.status === "Submitted";
                  const isApproved = item.status === "Approved";
                  const hasAssignedOutcome = Boolean(item.outcome_id || item.outcome?.id);
                  const linkedProjTitle = item.project_rel?.project_title || item.project_title || projects.find(p => String(p.id) === String(item.project_id))?.project_title;

                  return (
                    <tr 
                      key={item.id} 
                      id={`proposal-${item.id}`} 
                      className={`transition-colors ${
                        item.id === highlightedId 
                          ? "bg-blue-50/80 dark:bg-blue-955/40 border-l-4 border-l-blue-600" 
                          : selectedIds.has(item.id)
                          ? "bg-blue-50/40 dark:bg-blue-950/20"
                          : "hover:bg-slate-50/80 dark:hover:bg-slate-955/30"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3 text-center align-top">
                        {isSubmitted ? (
                          <input 
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelectRow(item.id)}
                            className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer mt-1"
                          />
                        ) : (
                          <span className="w-3.5 h-3.5 block" />
                        )}
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-3.5 align-top">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {getDepartmentName(item.department_id, item)}
                        </div>
                        <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 font-mono">
                          {item.target_office_automated || item.office_location || "Central Office"}
                        </span>
                      </td>

                      {/* Resource Description & Explicit Project / Needs Provenance */}
                      <td className="py-3.5 px-3.5 align-top max-w-xs space-y-1.5">
                        <div className="font-bold text-slate-900 dark:text-white text-xs">{item.item_name}</div>
                        
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Program Outcome Badge */}
                          {hasAssignedOutcome ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 truncate max-w-[150px]">
                              {item.outcome?.outcome_name || `Outcome #${item.outcome_id}`}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20">
                              Outcome Pending
                            </span>
                          )}

                          {/* Explicit Project Linkage Badge (No confusing intake pool states) */}
                          {item.project_id ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 flex items-center gap-1 truncate max-w-[170px]" title={`Project: ${linkedProjTitle || item.project_title}`}>
                              <Layers className="w-2.5 h-2.5 shrink-0" />
                              <span>Project: {linkedProjTitle || item.project_title || "Linked"}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 flex items-center gap-1" title="Unlinked: Must be bound to an ICT Project">
                              <FolderKanban className="w-2.5 h-2.5" />
                              <span>Unlinked (Assign Project)</span>
                            </span>
                          )}

                          {isStudentSystem && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                              Turnover Software
                            </span>
                          )}

                          {item.system_development_status && item.system_development_status !== "N/A" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                              {item.system_development_status}
                            </span>
                          )}

                          {item.is_expansion && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              Expansion
                            </span>
                          )}

                          {/* Clarified Section 8.0 Needs Assessment Badge */}
                          {item.needs_assessment_id && (
                            <span 
                              className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border font-mono bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20 cursor-help"
                              title={linkedNa ? `Needs Assessment: ${linkedNa.title}\nProblem: ${linkedNa.current_problem}` : `Needs Assessment ID: ${item.needs_assessment_id}`}
                            >
                              Needs Assessment: {linkedNa?.title ? linkedNa.title.slice(0, 22) + "..." : "Attached"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Clean UACS & Class Presentation */}
                      <td className="py-3.5 px-3.5 align-top">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                          {cleanUacsTitle(item.uacs_object_code) || "ICT Equipment (CO)"}
                        </div>
                        <div className="font-mono text-[9px] text-slate-400 mt-0.5">
                          {item.uacs_object_code ? item.uacs_object_code.split(" - ")[0] : "50604050 03"}
                        </div>
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
                        <div className="text-slate-500 dark:text-slate-400 text-[10px]">{formatPHP(item.unit_cost)}</div>
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
                              <span className="block px-2 py-0.2 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[8.5px] font-bold uppercase font-mono">
                                Expired
                              </span>
                            ) : (
                              <span className="block text-[8.5px] text-slate-400 dark:text-slate-500 font-mono">Verified</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border font-mono bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                            Missing Quote
                          </span>
                        )}
                      </td>

                      {/* Review State */}
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
                                title="Classify & Review Parameters"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openReturnModal(item)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-600 dark:text-rose-400 dark:hover:text-white dark:border-rose-500/20 transition-colors cursor-pointer font-bold"
                                title="Return to Department with Instructions"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : item.status === "Approved" && !item.project_id ? (
                            <div className="flex items-center gap-1">
                              <Link
                                to="/admin/projects/internal"
                                className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-955/50 dark:text-purple-300 dark:border-purple-800 text-[10px] font-bold font-mono inline-flex items-center gap-1"
                                title="Bind this proposal to an ICT Project in Part III.E to include it in the compiled plan"
                              >
                                <FolderKanban className="w-3 h-3" />
                                <span>Assign Project</span>
                              </Link>
                              <button
                                onClick={() => openOverrideModal(item)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="Classify & Review Parameters"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProposal(item.id, item.item_name)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-955/40 dark:hover:text-rose-400 text-slate-500 transition-colors cursor-pointer"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openOverrideModal(item)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="Classify & Review Parameters"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProposal(item.id, item.item_name)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-955/40 dark:hover:text-rose-400 text-slate-500 transition-colors cursor-pointer"
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
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
              No proposal line items found matching active parameters.
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-xs">
        <span className="text-slate-500 dark:text-slate-400 text-xs">
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

      {/* OVERRIDE & GOVERNANCE ASSIGNMENT MODAL (Explicit Project-Bound Portfolio Mapping) */}
      {activeOverrideItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Administrative Review &amp; Governance Classification</span>
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Proposal ID: {activeOverrideItem.id}</span>
              </div>
              <button onClick={() => setActiveOverrideItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Department's Raw Submission Summary Card */}
            <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>Department's Raw Submission</span>
                </span>
                <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                  Submitting Unit: <strong className="text-slate-700 dark:text-slate-300">{getDepartmentName(activeOverrideItem.department_id, activeOverrideItem)}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-bold block">Raw Item Label:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{activeOverrideItem.item_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-bold block">Original Unit Cost:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatPHP(activeOverrideItem.unit_cost)}</span>
                </div>
              </div>

              <div className="text-[11px]">
                <span className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-bold block">Requested Quantities Schedule:</span>
                <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px]">
                  {activeYears.map((yr, idx) => {
                    const q = activeOverrideItem.yearly_quantities?.[String(yr)] ?? 
                              activeOverrideItem.yearly_quantities?.[`Year ${idx + 1}`] ?? 
                              (idx === 0 ? activeOverrideItem.year_1_qty : idx === 1 ? activeOverrideItem.year_2_qty : idx === 2 ? activeOverrideItem.year_3_qty : 0) ?? 0;
                    return (
                      <span key={yr} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        FY {yr}: <strong>{q} units</strong>
                      </span>
                    );
                  })}
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900">
                    Total: {activeOverrideItem.total_qty || (activeOverrideItem.yearly_quantities ? Object.values(activeOverrideItem.yearly_quantities || {}).reduce((a, b) => a + (parseInt(b, 10) || 0), 0) : 0)} units
                  </span>
                </div>
              </div>

              {activeOverrideItem.justification && (
                <div className="text-[11px]">
                  <span className="text-slate-400 dark:text-slate-500 text-[9px] uppercase font-bold block">Technical Justification:</span>
                  <p className="text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 mt-1">
                    "{activeOverrideItem.justification}"
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 dark:text-slate-500 uppercase text-[9px] font-bold">Attached Proof / Quotation:</span>
                  {activeOverrideItem.canvas_evidence_url ? (
                    <a 
                      href={activeOverrideItem.canvas_evidence_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      <span>View Proof Document ({activeOverrideItem.supplier_name || "Quotation"})</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (activeOverrideItem.created_by_students || activeOverrideItem.is_in_house_turnover) ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      In-House / Non-Commercial Turnover (Quotation Exempt)
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                      No Quotation Canvas Attached
                    </span>
                  )}
                </div>

                {activeOverrideItem.canvas_expiration_date && (
                  <span className="text-slate-400 dark:text-slate-500 font-mono text-[9.5px]">
                    Expiry: {new Date(activeOverrideItem.canvas_expiration_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Guided Administrative Governance Assignment Form */}
            <form onSubmit={(e) => handleSaveOverride(e, false)} className="space-y-4 text-xs pt-1">
              
              {/* Resource Item Label */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Resource Item Label</label>
                <input
                  type="text" 
                  required 
                  value={overrideItemName} 
                  onChange={(e) => setOverrideItemName(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              {/* Student / In-House Turnover Flag */}
              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">In-House / Non-Commercial Turnover</span>
                  <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block">Classified as Capital Outlay (ICT Software); commercial quotation is optional.</span>
                </div>
                <input
                  type="checkbox"
                  checked={overrideCreatedByStudents}
                  onChange={e => setOverrideCreatedByStudents(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {/* STEP 1: Program Outcome Assignment (Part I.A.4) */}
              <div className="space-y-1.5 p-3.5 bg-blue-50/90 dark:bg-slate-955 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 rounded-xl">
                <label className="text-[10px] uppercase font-bold text-blue-900 dark:text-blue-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center font-mono text-[9px] font-bold">1</span>
                    <GraduationCap className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Program Alignment (Part I.A.4 Organizational Outcome)</span>
                  </span>
                  <span className="text-[9px] text-rose-500 font-bold">*Mandatory</span>
                </label>
                <select
                  value={overrideOutcomeId}
                  onChange={(e) => setOverrideOutcomeId(e.target.value)}
                  required
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer font-semibold text-xs"
                >
                  <option value="">-- Select Organizational Outcome --</option>
                  {outcomes.map(o => (
                    <option key={o.id} value={String(o.id)}>
                      {o.outcome_name} ({o.type_label})
                    </option>
                  ))}
                </select>
                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block pt-0.5">
                  Establishes statutory accountability and links this outlay to institutional key result areas.
                </span>
              </div>

              {/* STEP 2: Root Problem Provenance (Strategic Concern & Section 8.0 Needs Assessment) */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-slate-700 text-white flex items-center justify-center font-mono text-[9px] font-bold">2</span>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span>Strategic Concern &amp; Needs Assessment Linkage (Part II.A &amp; Section 8.0)</span>
                </span>

                <div className="space-y-1.5">
                  <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400">
                    Parent Strategic Concern (Part II.A Root Problem)
                  </label>
                  <select
                    value={overrideConcernId}
                    onChange={(e) => {
                      const cId = e.target.value;
                      setOverrideConcernId(cId);
                      const concern = strategicConcerns.find(c => String(c.id) === String(cId));
                      if (concern?.outcome_id) {
                        setOverrideOutcomeId(String(concern.outcome_id));
                      }
                      if (concern?.intended_use && !overrideJustification) {
                        setOverrideJustification(concern.intended_use);
                      }
                    }}
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
                  >
                    <option value="">-- No Specific Strategic Concern --</option>
                    {strategicConcerns.map(c => (
                      <option key={c.id} value={String(c.id)}>
                        [{c.mfo}] {c.critical_system} — {c.problems.slice(0, 50)}...
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <ClipboardCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Linked Department Needs Assessment (Section 8.0)</span>
                  </label>
                  <select
                    value={overrideNeedsAssessmentId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setOverrideNeedsAssessmentId(selectedId);
                      const matched = needsAssessments.find(n => String(n.id) === selectedId);
                      if (matched) {
                        if (!overrideJustification) {
                          setOverrideJustification(`[Justified by Needs Assessment]: ${matched.current_problem}`);
                        }
                        if (matched.strategic_concern_id) {
                          setOverrideConcernId(String(matched.strategic_concern_id));
                          const concern = strategicConcerns.find(c => String(c.id) === String(matched.strategic_concern_id));
                          if (concern?.outcome_id) {
                            setOverrideOutcomeId(String(concern.outcome_id));
                          }
                        }
                      }
                    }}
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
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
                </div>
              </div>

              {/* STEP 3: Project Charter Binding (Part III.E) */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-slate-700 text-white flex items-center justify-center font-mono text-[9px] font-bold">3</span>
                  <FolderKanban className="w-3.5 h-3.5 text-purple-500" />
                  <span>Target ICT Project Charter &amp; Portfolio (Part III.E)</span>
                </span>

                <div className="space-y-1.5 animate-fadeIn">
                  <label className="text-[9.5px] uppercase font-bold text-purple-700 dark:text-purple-300 flex items-center justify-between">
                    <span>Target ICT Project Charter (Part III.E)</span>
                    <span className="text-rose-500 font-bold">*Required</span>
                  </label>
                  <select
                    value={overrideProjectId}
                    required
                    onChange={(e) => {
                      const pId = e.target.value;
                      setOverrideProjectId(pId);
                      if (pId) {
                        const pObj = projects.find(p => String(p.id) === String(pId));
                        if (pObj) {
                          setOverrideStrategicCat(pObj.project_category || "Internal ICT Projects");
                          if (pObj.funding_source) {
                            setOverrideFundSource(pObj.funding_source);
                          }
                        }
                      }
                    }}
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs font-semibold"
                  >
                    <option value="">-- Choose Target ICT Project --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.project_category}] {p.project_title}
                      </option>
                    ))}
                  </select>
                  <span className="text-[9px] text-slate-400 font-sans block pt-0.5">
                    *Every approved proposal must belong to an authorized ICT Project. This governs Table B.1 Category and Table B.2 Fund Source inheritance.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400">Resource Nature</label>
                    <select
                      value={overrideCategory} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setOverrideCategory(val);
                      }}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none text-xs"
                    >
                      <option value="Hardware">Hardware Equipment</option>
                      <option value="Software">Software Packages (COTS / Licenses)</option>
                      <option value="Subscription">Subscription (Cloud / SaaS)</option>
                      <option value="Services">Services (Consulting / Maintenance)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Spending Bucket (Table B.1)</span>
                      <span className="text-[8.5px] text-purple-600 dark:text-purple-400 font-mono">(Project Inherited)</span>
                    </label>
                    <select
                      value={overrideStrategicCat}
                      onChange={(e) => setOverrideStrategicCat(e.target.value)}
                      disabled={true}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer font-semibold text-xs disabled:opacity-60"
                    >
                      {strategicCategories.length > 0 ? (
                        strategicCategories.map((sc) => (
                          <option key={sc.id || sc.name} value={sc.name}>
                            {sc.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Office Productivity">Office Productivity</option>
                          <option value="Internal ICT Projects">Internal ICT Projects</option>
                          <option value="Cross-Agency ICT Projects">Cross-Agency Projects</option>
                          <option value="Continuing Costs/Expenses">Continuing Costs/Expenses</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Helpful Guidance Callout for Packaged Software vs Custom Systems */}
                {overrideCategory === "Software" && (
                  <div className="p-2.5 bg-blue-50/90 dark:bg-slate-955 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 rounded-xl text-[10px] flex items-start gap-1.5 leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Procurement Scope Note:</strong> Use this line item for Commercial Off-The-Shelf (COTS) software licenses and perpetual seat packages (e.g. AutoCAD, SPSS, Adobe CC, Windows Server CALs). Enterprise systems running multi-user workflows (e.g. HRIS, Student Portal) must be managed under <strong>Part III.D Information Systems</strong>.
                    </span>
                  </div>
                )}
              </div>

              {/* STEP 4: Deployment Location, Fund Source, UACS & Accounting */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-slate-700 text-white flex items-center justify-center font-mono text-[9px] font-bold">4</span>
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Deployment Location, Funding &amp; UACS Accounting (Table B.4)</span>
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400">Unit Cost (PHP ₱)</label>
                    <input
                      type="number" step="0.01" min="0" required value={overrideUnitCost} onChange={(e) => setOverrideUnitCost(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold outline-none focus:border-blue-500 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400">Deployment Location</label>
                    <input
                      type="text"
                      required
                      value={overrideOfficeLoc}
                      onChange={(e) => setOverrideOfficeLoc(e.target.value)}
                      placeholder="e.g. Planning Division, Central Office, Field Branch..."
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Financing Fund Source</span>
                    <span className="text-[8.5px] text-purple-600 dark:text-purple-400 font-mono">(Project Inherited)</span>
                  </label>
                  <select
                    value={overrideFundSource}
                    onChange={(e) => setOverrideFundSource(e.target.value)}
                    disabled={true}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none cursor-pointer text-xs disabled:opacity-60"
                  >
                    <option value="General Appropriations Act (GAA)">General Appropriations Act (GAA)</option>
                    <option value="Foreign-Assisted Projects (FAP)">Foreign-Assisted Projects (FAP)</option>
                    <option value="Locally Funded">Locally Funded</option>
                    <option value="Other Income Generating Sources">Other Income</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-slate-400">
                      UACS Object Code &amp; Title (Table B.4 Ledger)
                    </label>
                    <button
                      type="button"
                      onClick={() => setOverrideUacsCode(overrideAutoClass.uacs)}
                      className="text-[9.5px] text-blue-600 dark:text-blue-400 hover:underline font-mono cursor-pointer"
                    >
                      Reset to Auto-Resolved
                    </button>
                  </div>
                  <select
                    value={resolvedEffectiveUacs}
                    onChange={(e) => setOverrideUacsCode(e.target.value)}
                    className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs outline-none cursor-pointer font-semibold"
                  >
                    <option value={overrideAutoClass.uacs}>
                      [Auto-Resolved]: {overrideAutoClass.uacs} ({overrideAutoClass.expClass})
                    </option>
                    {uacsCatalog.map(u => {
                      const fullCode = `${u.uacs_code} - ${u.account_title}`;
                      if (fullCode === overrideAutoClass.uacs) return null;
                      return (
                        <option key={u.id} value={fullCode}>
                          {fullCode} ({u.expenditure_class})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Major Outlays Development Status Parameter */}
              {isOverrideMajorOutlay && (
                <div className="p-3 bg-amber-50/90 dark:bg-slate-955 border border-amber-300 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 rounded-xl space-y-2 animate-fadeIn">
                  <span className="block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 font-mono">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Major Outlay &ge; {formatPHP(majorReviewThreshold)} (Development Tag Mandated)</span>
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
                <span className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>Adjust Multi-Year Quantities ({activeYears.length} Years Horizon)</span>
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
                  <span className="text-slate-500 dark:text-slate-400">Total Units: <strong>{overrideTotalQty}</strong></span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">Total Cost: {formatPHP(overrideTotalOutlay)}</span>
                </div>
              </div>

              {/* Live DBM Capitalization & UACS Preview Box */}
              <div className="p-3 bg-blue-50/90 dark:bg-slate-955 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 rounded-xl text-[10px] leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px]">
                  <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Live DBM Classification &amp; Parity Resolution</span>
                </div>
                <div className="font-mono">
                  Expenditure Class: <strong className="uppercase font-bold">{resolvedEffectiveExpClass}</strong> &bull; Resolved UACS: <code>{resolvedEffectiveUacs}</code>
                </div>
                <div className="text-[9.5px] text-slate-500 dark:text-slate-400 font-sans">
                  *Threshold: &ge; {formatPHP(policySettings.capitalization_threshold)} is Capital Outlay (CO); recurring subscriptions are mandatory MOOE.
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Administrative Review Justification</label>
                <textarea
                  rows={2}
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  placeholder="Record justification for audit trail and compliance reporting..."
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none outline-none focus:border-blue-500"
                />
              </div>

              {/* Dual Modal Action Buttons: Save vs Save & Approve */}
              <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={submittingOverride}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>{submittingOverride ? "Saving..." : "Save Classification"}</span>
                </button>

                <button
                  type="button"
                  disabled={submittingOverride}
                  onClick={(e) => handleSaveOverride(e, true)}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{submittingOverride ? "Authorizing..." : "Save & Approve Proposal"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RETURN WITH REVISION INSTRUCTIONS MODAL */}
      {returnModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Return Proposal for Revisions</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Resource: {returnModalItem.item_name}</span>
              </div>
              <button onClick={() => setReturnModalItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitReturnWithInstructions} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Revision Instructions (Will be flagged as Action Item in Department Inbox)
                </label>
                <textarea
                  rows={3}
                  required
                  value={returnRemark}
                  onChange={e => setReturnRemark(e.target.value)}
                  placeholder="Detail missing documentation, expired quotation updates, or required quantity adjustments..."
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none leading-relaxed focus:border-rose-500"
                />
              </div>

              <div className="p-3 bg-amber-50/90 dark:bg-slate-955 border border-amber-300 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 rounded-xl text-[10.5px]">
                Returning this proposal unlocks editing for the department and locks submission until this action item is marked resolved.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnModalItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold cursor-pointer text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReturn}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer shadow-sm text-xs transition-colors"
                >
                  {isSubmittingReturn ? "Returning..." : "Confirm Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISCUSSION MODAL */}
      {activeDiscussionItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl flex flex-col h-[520px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-955">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-sm">Discussions &amp; Remarks</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Proposal: {activeDiscussionItem.item_name}</p>
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
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">{c.text}</p>
                    
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
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-2xs"
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
