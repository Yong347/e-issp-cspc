// frontend/src/views/department/Proposals/UnifiedProposals.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { useNotifications } from "../../../context/NotificationContext";
import { 
  getProposals,
  createDraftProposal,
  createProposalWithCanvas,
  duplicateProposal,
  updateProposal,
  deleteProposal,
  submitProposal,
  getDeptCatalog,
  getNeedsAssessments,
  getComments,
  postComment,
  resolveComment,
  uploadCanvas,
  retrieveArchivedDocument
} from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import { 
  FolderKanban, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy,
  Send, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  UploadCloud, 
  Calendar, 
  ExternalLink, 
  Check, 
  Clock, 
  Search, 
  X, 
  FileText, 
  CheckSquare, 
  Sparkles, 
  ClipboardCheck, 
  Lock, 
  CheckCircle2,
  Database,
  ArrowRight,
  Info,
  Layers,
  HelpCircle
} from "lucide-react";

export default function UnifiedProposals() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const { fetchNotifications } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();

  // Core Data Lists
  const [proposals, setProposals] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filter States (Department-Centric)
  const [activeTab, setActiveTab] = useState("all"); // "all" | "Hardware" | "Software" | "Subscription" | "Services" | "needs_linked"
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "Draft" | "Submitted" | "Approved" | "Returned"
  const [searchQuery, setSearchQuery] = useState("");

  // Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Intent-Driven Form Field States (Department-Focused: No Administrative Jargon)
  const [resourceType, setResourceType] = useState("Hardware"); // "Hardware" | "Software" | "Subscription" | "Services"
  const [itemSelect, setItemSelect] = useState("other");
  const [itemName, setItemName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [yearlyQuantities, setYearlyQuantities] = useState({});
  const [needsAssessmentId, setNeedsAssessmentId] = useState("");
  const [justification, setJustification] = useState("");
  const [createdByStudents, setCreatedByStudents] = useState(false);
  const [isExpansion, setIsExpansion] = useState(false);
  const [canvasUrl, setCanvasUrl] = useState("");
  const [canvasExpiry, setCanvasExpiry] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [inlineFile, setInlineFile] = useState(null);

  // Administrative governance fields silently preserved during edits (Managed exclusively by MIS Admin)
  const [outcomeId, setOutcomeId] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [strategicCategory, setStrategicCategory] = useState("Office Productivity");
  const [officeLocation, setOfficeLocation] = useState("Central Office");
  const [fundSource, setFundSource] = useState("General Appropriations Act (GAA)");
  const [devStatus, setDevStatus] = useState("N/A");

  // Edit State
  const [editingId, setEditingId] = useState(null);
  
  // Canvas Upload Modal State (for quick card action)
  const [activeUploadItem, setActiveUploadItem] = useState(null);
  const [uploadSupplier, setUploadSupplier] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadingCanvas, setUploadingCanvas] = useState(false);

  // Discussion Remarks Thread State
  const [activeDiscussionItem, setActiveDiscussionItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");

  const token = user?.token || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");
  
  // Dynamic Planning Horizon Sequence (Extracts cycle range dynamically; zero hardcoding)
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
    return [2028, 2029, 2030];
  }, [planningYears, activeCycle]);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isExpired = (dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && d < new Date();
  };

  // Safe Multi-Year Quantity Extractor
  const getYearQty = useCallback((p, year, idx) => {
    let yq = p.yearly_quantities;
    if (typeof yq === "string") {
      try { yq = JSON.parse(yq); } catch { yq = {}; }
    }
    if (yq && typeof yq === "object") {
      if (yq[String(year)] !== undefined && yq[String(year)] !== null) return parseInt(yq[String(year)], 10) || 0;
      if (yq[year] !== undefined && yq[year] !== null) return parseInt(yq[year], 10) || 0;
      if (yq[`Year ${idx + 1}`] !== undefined && yq[`Year ${idx + 1}`] !== null) return parseInt(yq[`Year ${idx + 1}`], 10) || 0;
    }
    if (idx === 0) return p.year_1_qty || 0;
    if (idx === 1) return p.year_2_qty || 0;
    if (idx === 2) return p.year_3_qty || 0;
    return 0;
  }, []);

  // Sync Search Query from URL Navigation
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const q = searchParams.get("search");
    if (q !== null) {
      setSearchQuery(q);
    }
  }, [location.search]);

  // Synchronize yearly quantities with active planning horizon
  useEffect(() => {
    setYearlyQuantities(prev => {
      const next = { ...prev };
      activeYears.forEach(year => {
        if (next[String(year)] === undefined) {
          next[String(year)] = 0;
        }
      });
      return next;
    });
  }, [activeYears]);

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard Escape Handler to Dismiss Modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (activeDiscussionItem) setActiveDiscussionItem(null);
        if (activeUploadItem) {
          setActiveUploadItem(null);
          setUploadFile(null);
          setUploadSupplier("");
          setUploadExpiry("");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDiscussionItem, activeUploadItem]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pData, catData, naData] = await Promise.all([
        getProposals(activeCycle),
        getDeptCatalog().catch(() => []),
        getNeedsAssessments().catch(() => [])
      ]);
      setProposals(Array.isArray(pData) ? pData : []);
      setCatalog(Array.isArray(catData) ? catData : []);
      setNeedsAssessments(Array.isArray(naData) ? naData : []);
    } catch (err) {
      setError(err.message || "Failed to load departmental proposals.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle]);

  useEffect(() => {
    if (token && activeCycle) {
      loadData();
    }
  }, [token, activeCycle, loadData]);

  // Standard Catalog Auto-Fill Handler
  const handleCatalogItemChange = useCallback((key) => {
    setItemSelect(key);
    if (key === "other") {
      setItemName("");
      setUnitCost("");
      setCanvasUrl("");
      setCanvasExpiry("");
      setSupplierName("");
      setInlineFile(null);
      setCreatedByStudents(false);
      setResourceType("Hardware");
    } else {
      const selected = catalog.find(item => item.item_key === key);
      if (selected) {
        setItemName(selected.display_name);
        setUnitCost(String(selected.standard_unit_cost));
        setCanvasUrl(selected.canvas_evidence_url || "");
        setCanvasExpiry(selected.canvas_expiration_date ? selected.canvas_expiration_date.split("T")[0] : "");
        setSupplierName(selected.supplier_name || "Pre-Approved Institutional Vendor");
        setInlineFile(null);
        setCreatedByStudents(false);
        setResourceType(selected.category === "software" ? "Software" : "Hardware");
      }
    }
  }, [catalog]);

  // Listen to incoming navigation state: 1-Click "Add from Catalog" or "Link Needs Assessment"
  useEffect(() => {
    if (location.state?.selectCatalogItem) {
      const item = location.state.selectCatalogItem;
      setItemSelect(item.item_key);
      setItemName(item.display_name);
      setUnitCost(String(item.standard_unit_cost));
      setCanvasUrl(item.canvas_evidence_url || "");
      setCanvasExpiry(item.canvas_expiration_date ? item.canvas_expiration_date.split("T")[0] : "");
      setSupplierName(item.supplier_name || "Pre-Approved Institutional Vendor");
      setInlineFile(null);
      setCreatedByStudents(false);
      setResourceType(item.category === "software" ? "Software" : "Hardware");
      setSuccess(`Populated from catalog: '${item.display_name}'. Please enter desired annual quantities.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (location.state?.catalogKey && catalog.length > 0) {
      handleCatalogItemChange(location.state.catalogKey);
    }

    if (location.state?.prefillNeedsAssessment) {
      const na = location.state.prefillNeedsAssessment;
      setNeedsAssessmentId(String(na.id));
      if (!justification) {
        setJustification(`[Addressing Department Need]: ${na.current_problem}\n\nProposed Intervention: ${na.proposed_solution}`);
      }
      setSuccess(`Linked to Section 8.0 Needs Assessment: '${na.title}'.`);
    }
  }, [location.state, catalog, handleCatalogItemChange, justification]);

  // Derived Quantities & Total Cost
  const calculatedTotalQty = Object.values(yearlyQuantities).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const calculatedTotalOutlay = (parseFloat(unitCost) || 0) * calculatedTotalQty;

  const resetForm = () => {
    setItemSelect("other");
    setItemName("");
    setUnitCost("");
    setNeedsAssessmentId("");
    setJustification("");
    setCreatedByStudents(false);
    setIsExpansion(false);
    setCanvasUrl("");
    setCanvasExpiry("");
    setSupplierName("");
    setInlineFile(null);
    setResourceType("Hardware");
    setStrategicCategory("Office Productivity");
    setProjectId(null);
    setOutcomeId(null);
    setOfficeLocation("Central Office");
    setFundSource("General Appropriations Act (GAA)");
    setDevStatus("N/A");

    const initial = {};
    activeYears.forEach(year => {
      initial[String(year)] = 0;
    });
    setYearlyQuantities(initial);
    setEditingId(null);
  };

  // Replicate first year quantity across all years in horizon
  const handleReplicateAllYears = () => {
    const firstYear = activeYears[0];
    const baseQty = yearlyQuantities[String(firstYear)] || 1;
    const replicated = {};
    activeYears.forEach(y => {
      replicated[String(y)] = baseQty;
    });
    setYearlyQuantities(replicated);
  };

  // Clear all quantities in horizon
  const handleClearAllQuantities = () => {
    const cleared = {};
    activeYears.forEach(y => {
      cleared[String(y)] = 0;
    });
    setYearlyQuantities(cleared);
  };

  // Department User Proposal Submission Handler
  const handleSaveProposal = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const costNum = parseFloat(unitCost);
    if (isNaN(costNum) || costNum < 0) {
      setError("Please enter a valid unit rate (₱0.00 or greater).");
      return;
    }

    if (calculatedTotalQty <= 0) {
      setError("Please specify a target quantity greater than zero for at least one planning year.");
      return;
    }

    setSubmitting(true);
    try {
      const isCatalog = itemSelect !== "other";
      const isTurnover = Boolean(createdByStudents);

      let defaultCat = "Office Productivity";
      if (resourceType === "Subscription" || resourceType === "Services") {
        defaultCat = "Continuing Costs/Expenses";
      }

      const payload = {
        item_select: itemSelect,
        item_name: itemName.trim(),
        unit_cost: costNum,
        yearly_quantities: yearlyQuantities,
        justification: justification.trim() || null,
        needs_assessment_id: needsAssessmentId || null,
        created_by_students: isTurnover,
        is_in_house_turnover: isTurnover,
        is_expansion: isExpansion,
        category: resourceType,
        strategic_category: editingId ? (strategicCategory || defaultCat) : defaultCat,
        project_id: editingId ? (projectId || null) : null,
        supplier_name: supplierName.trim() || null,
        canvas_expiration_date: canvasExpiry ? new Date(canvasExpiry).toISOString() : null,
        canvas_evidence_url: canvasUrl || null,
        outcome_id: editingId ? (outcomeId ? parseInt(outcomeId, 10) : null) : null,
        office_location: officeLocation || user?.department_name || "Central Office",
        fund_source: fundSource || "General Appropriations Act (GAA)",
        system_development_status: devStatus || "N/A"
      };

      if (editingId) {
        if (inlineFile) {
          await updateProposal(editingId, payload, inlineFile, token);
        } else {
          await updateProposal(editingId, payload, null, token);
        }
        setSuccess("Proposal draft updated successfully.");
      } else {
        if (inlineFile && !isCatalog) {
          await createProposalWithCanvas(payload, inlineFile, token);
          setSuccess("Proposal and quotation canvas successfully registered in 1 step!");
        } else {
          await createDraftProposal(payload, null, token);
          setSuccess("Draft proposal successfully created.");
        }
      }

      resetForm();
      loadData();
    } catch (err) {
      let msg = err.message || "Failed to save proposal.";
      if (err.violations && Array.isArray(err.violations) && err.violations.length > 0) {
        msg = `${msg}\n• ${err.violations.join("\n• ")}`;
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (p) => {
    setError(null);
    setSuccess(null);
    setEditingId(p.id);
    
    // Core department inputs
    setItemSelect(p.item_key || "other");
    setItemName(p.item_name || "");
    setUnitCost(String(p.unit_cost || 0));
    setNeedsAssessmentId(p.needs_assessment_id ? String(p.needs_assessment_id) : "");
    setJustification(p.justification || "");
    setCreatedByStudents(Boolean(p.created_by_students || p.is_in_house_turnover));
    setIsExpansion(Boolean(p.is_expansion));
    setCanvasUrl(p.canvas_evidence_url || "");
    setCanvasExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
    setSupplierName(p.supplier_name || p.payload?.supplier_name || "");
    setInlineFile(null);
    setResourceType(p.category || "Hardware");

    // Preserve existing administrative classifications silently
    setStrategicCategory(p.strategic_category || "Office Productivity");
    setProjectId(p.project_id || null);
    setOutcomeId(p.outcome_id ? String(p.outcome_id) : null);
    setOfficeLocation(p.office_location || user?.department_name || "Central Office");
    setFundSource(p.fund_source || "General Appropriations Act (GAA)");
    setDevStatus(p.system_development_status || "N/A");
    
    const qtyMap = {};
    activeYears.forEach((year, idx) => {
      qtyMap[String(year)] = getYearQty(p, year, idx);
    });
    setYearlyQuantities(qtyMap);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 1-Click Duplicate Proposal Clone Handler
  const handleDuplicate = async (id, name) => {
    setError(null);
    setSuccess(null);
    try {
      const cloned = await duplicateProposal(id, token);
      setSuccess(`Duplicated '${name}' into a fresh draft.`);
      await loadData();
      if (cloned) {
        handleEdit(cloned);
      }
    } catch (err) {
      setError(err.message || "Failed to duplicate proposal.");
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete proposal draft for '${name}'?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProposal(id, token);
      setSuccess("Proposal draft deleted successfully.");
      loadData();
    } catch (err) {
      setError(err.message || "Failed to delete proposal.");
    }
  };

  const handleSubmitProposal = async (id, name) => {
    setError(null);
    setSuccess(null);
    try {
      await submitProposal(id, token);
      setSuccess(`Proposal '${name}' submitted to the MIS review queue.`);
      loadData();
      if (fetchNotifications) fetchNotifications();
    } catch (err) {
      setError(err.message || "Submission rejected.");
    }
  };

  // Transparent Official Archive Access Handler (Automated Document Retrieval)
  const handleOpenQuotation = async (proposal) => {
    if (!proposal.canvas_evidence_url) return;
    try {
      const res = await retrieveArchivedDocument(proposal.id, token);
      if (res && res.file_url) {
        window.open(res.file_url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch (err) {
      console.warn("Direct archive access fallback:", err);
    }
    window.open(proposal.canvas_evidence_url, "_blank", "noopener,noreferrer");
  };

  const handleUploadCanvasModal = async (e) => {
    e.preventDefault();
    if (!uploadFile || !uploadSupplier.trim() || !activeUploadItem) return;
    setError(null);
    setSuccess(null);
    setUploadingCanvas(true);
    try {
      const expiryIso = uploadExpiry ? new Date(uploadExpiry).toISOString() : null;
      await uploadCanvas(activeUploadItem.id, uploadSupplier.trim(), uploadFile, expiryIso, token);

      setSuccess("Quotation canvas successfully uploaded and attached.");
      setActiveUploadItem(null);
      setUploadFile(null);
      setUploadSupplier("");
      setUploadExpiry("");
      loadData();
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploadingCanvas(false);
    }
  };

  const openDiscussion = async (item) => {
    setActiveDiscussionItem(item);
    setNewCommentText("");
    try {
      const data = await getComments(item.id, token);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load comment thread", err);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      await postComment(activeDiscussionItem.id, {
        text: newCommentText.trim(),
        requires_department_action: false
      }, token);
      setNewCommentText("");
      const data = await getComments(activeDiscussionItem.id, token);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResolveComment = async (commentId) => {
    try {
      await resolveComment(activeDiscussionItem.id, commentId, token);
      const data = await getComments(activeDiscussionItem.id, token);
      setComments(Array.isArray(data) ? data : []);
      loadData();
      if (fetchNotifications) fetchNotifications();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter Tabs Definition (Intuitive, Department-Friendly)
  const filterTabs = [
    { id: "all", label: "All Items" },
    { id: "Hardware", label: "Hardware" },
    { id: "Software", label: "Packaged Software Licenses" },
    { id: "Subscription", label: "Cloud & Subscriptions" },
    { id: "Services", label: "Technical Services" },
    { id: "needs_linked", label: "Needs-Linked" }
  ];

  const filteredProposals = useMemo(() => {
    return proposals.filter(p => {
      // Category / Nature Filter
      if (activeTab === "needs_linked") {
        if (!p.needs_assessment_id) return false;
      } else if (activeTab !== "all") {
        if ((p.category || "").toLowerCase() !== activeTab.toLowerCase()) return false;
      }

      // Status Filter
      if (statusFilter !== "all") {
        if ((p.status || "").toLowerCase() !== statusFilter.toLowerCase()) return false;
      }

      // Text Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (p.item_name || "").toLowerCase().includes(q);
        const matchesJust = (p.justification || "").toLowerCase().includes(q);
        const matchesCat = (p.category || "").toLowerCase().includes(q);
        if (!matchesName && !matchesJust && !matchesCat) return false;
      }

      return true;
    });
  }, [proposals, activeTab, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto font-sans select-none transition-colors duration-200">
      
      {/* Top Banner Panel */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Resource Proposals Ledger (Part IV.A Detailed Requirements)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Submit resource needs and technical specifications for <strong>{user?.department_name || "your department"}</strong>. Choose your procurement nature, enter target quantities, attach quotation proofs, and link to your Needs Assessment. Organizational Outcomes, Project Portfolios, and DBM UACS accounts are assigned by the Administrator upon review.
          </p>
        </div>
        <button 
          onClick={loadData} 
          disabled={loading}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 font-bold shadow-xs text-xs shrink-0"
          title="Refresh Ledger"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Ledger</span>
        </button>
      </div>

      {/* Explicit Guidance Banner: Packaged COTS Licenses vs Enterprise Information Systems */}
      <div className="p-4 bg-blue-50/70 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-2xl text-[11px] text-blue-950 dark:text-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs leading-relaxed animate-fadeIn">
        <div className="flex items-start gap-2.5">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-blue-900 dark:text-blue-300 block text-xs uppercase tracking-wide font-mono">
              Notice: Packaged Software Licenses vs. Enterprise Systems
            </span>
            <p>
              Proposing <strong>physical hardware</strong>, <strong>perpetual off-the-shelf seat licenses</strong> (e.g., AutoCAD, SPSS, Adobe CC, Windows Server CALs), or <strong>recurring subscriptions</strong>? Budget for them directly on this ledger.
              Need to propose a multi-user institutional database application, clinic records system, or citizen portal? Propose it under <strong>Part III.D Information Systems</strong>.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/dept/proposed-systems")}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs whitespace-nowrap self-end sm:self-auto"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Propose a System (Part III.D)</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Error and Success Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap leading-relaxed font-semibold">{error}</span>
          </div>
          <button 
            type="button"
            onClick={() => setError(null)} 
            className="text-rose-400 hover:text-rose-600 dark:hover:text-white cursor-pointer p-0.5"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSuccess(null)} 
            className="text-emerald-400 hover:text-emerald-600 dark:hover:text-white cursor-pointer p-0.5"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Simplified Department Proposal Intake Form */}
        <form onSubmit={handleSaveProposal} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 h-fit shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{editingId ? "Update Resource Item" : "Draft Resource Line Item"}</span>
            </h3>
            {editingId && (
              <button 
                type="button" 
                onClick={resetForm} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Categorized Pre-Approved Catalog Reference Selection */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
              Price Reference Catalog Selection
            </label>
            <select
              value={itemSelect}
              onChange={e => handleCatalogItemChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none font-mono text-xs focus:border-blue-500"
            >
              <option value="other">-- Custom Technical Request (Other) --</option>
              {["computing_devices", "networking", "printers_imaging", "software", "other"].map(catGroup => {
                const groupItems = catalog.filter(i => (i.category || "other").toLowerCase() === catGroup.toLowerCase());
                if (groupItems.length === 0) return null;
                const groupLabels = {
                  computing_devices: "Computing Devices (Desktops, Laptops)",
                  networking: "Networking & Connectivity",
                  printers_imaging: "Printers & Imaging",
                  software: "Software Packages & Subscriptions",
                  other: "Other Standard Equipment"
                };
                return (
                  <optgroup key={catGroup} label={groupLabels[catGroup] || catGroup} className="bg-white dark:bg-slate-900 font-bold text-blue-700 dark:text-blue-400">
                    {groupItems.map(item => (
                      <option key={item.id || item.item_key} value={item.item_key} className="text-slate-800 dark:text-slate-200 font-normal">
                        {item.display_name} — {formatPHP(item.standard_unit_cost)}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Catalog Item Pre-Approved Indicator Card */}
          {itemSelect !== "other" && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-800/80 rounded-xl space-y-1.5 animate-fadeIn">
              <div className="flex justify-between items-center">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Pre-Approved Catalog Standard</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCatalogItemChange("other")}
                  className="text-[10px] text-emerald-700 dark:text-emerald-400 underline font-bold hover:text-emerald-900 dark:hover:text-emerald-300 cursor-pointer"
                >
                  Switch to Custom
                </button>
              </div>
              <div className="flex justify-between text-[10.5px] font-mono text-emerald-900 dark:text-emerald-200">
                <span>Standard Rate: <strong>{formatPHP(unitCost)}</strong></span>
                <span>Proof: <strong>Pre-Approved</strong></span>
              </div>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                Unit cost and specifications are verified. Quotation canvas upload is exempt [2].
              </p>
            </div>
          )}

          {/* 1. Resource Nature Selection (4 Official Statutory Categories) */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                Resource Nature
              </label>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-mono">Official DICT/DBM Categories</span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-semibold text-xs">
              {[
                { id: "Hardware", label: "Hardware Equipment" },
                { id: "Software", label: "Software (Perpetual/COTS)" },
                { id: "Subscription", label: "Subscription (Cloud/SaaS)" },
                { id: "Services", label: "Services (Consulting/Support)" }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  disabled={itemSelect !== "other"}
                  onClick={() => setResourceType(t.id)}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    resourceType === t.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs font-bold"
                      : "bg-slate-50 dark:bg-slate-955 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-400"
                  } disabled:opacity-50`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Software Scope Context Hint */}
          {resourceType === "Software" && itemSelect === "other" && (
            <div className="p-3 bg-blue-50/60 dark:bg-blue-955/20 border border-blue-200 dark:border-blue-900/50 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 flex items-start gap-2 leading-relaxed animate-fadeIn">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>Packaged COTS Licenses:</strong> Propose commercial off-the-shelf seat licenses here (e.g. AutoCAD, Adobe CC, SPSS, Windows Server CALs). For bespoke institutional database systems or web portals, please use <Link to="/dept/proposed-systems" className="text-blue-600 dark:text-blue-400 font-bold underline">Propose a System (Part III.D)</Link>.
              </span>
            </div>
          )}

          {/* 2. Item Description */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
              Item Name &amp; Technical Description
            </label>
            <input
              type="text"
              required
              disabled={itemSelect !== "other"}
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="e.g. High-Performance Mobile Workstation, 50 AutoCAD Perpetual Lab Licenses"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 disabled:opacity-60 text-xs"
            />
          </div>

          {/* 3. Unit Cost */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
              Unit Cost (PHP ₱)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              disabled={itemSelect !== "other"}
              value={unitCost}
              onChange={e => setUnitCost(e.target.value)}
              placeholder="0.00"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold outline-none focus:border-blue-500 disabled:opacity-60 text-xs"
            />
          </div>

          {/* 4. Link to Department Needs Assessment */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Link to Department Needs Assessment (Section 8.0)</span>
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">Optional</span>
            </label>
            <select
              value={needsAssessmentId}
              onChange={e => {
                const val = e.target.value;
                setNeedsAssessmentId(val);
                const matched = needsAssessments.find(n => String(n.id) === val);
                if (matched && !justification) {
                  setJustification(`[Justified by Needs Assessment]: ${matched.current_problem}`);
                }
              }}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none text-xs cursor-pointer focus:border-blue-500 font-medium"
            >
              <option value="">-- None / Standalone Line Item --</option>
              {needsAssessments.map(n => (
                <option key={n.id} value={String(n.id)}>
                  [{n.mfo_alignment || "Program"}] {n.title}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Dynamic Multi-Year Targets Grid with Steppers & Quick Helpers */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Multi-Year Quantities ({activeYears.length} Years Horizon)</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReplicateAllYears}
                  className="text-[9px] text-blue-600 dark:text-blue-400 hover:underline font-mono cursor-pointer"
                  title="Copy Year 1 quantity across all horizon years"
                >
                  Replicate Y1
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={handleClearAllQuantities}
                  className="text-[9px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-mono cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {activeYears.map((year, idx) => (
                <div key={year} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Year {idx + 1} (FY {year}):
                  </span>
                  
                  {/* Dynamic Stepper & Numeric Input */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setYearlyQuantities(prev => ({
                        ...prev,
                        [String(year)]: Math.max(0, (parseInt(prev[String(year)], 10) || 0) - 1)
                      }))}
                      className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center cursor-pointer text-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={yearlyQuantities[String(year)] ?? 0}
                      onChange={e => setYearlyQuantities({
                        ...yearlyQuantities,
                        [String(year)]: Math.max(0, parseInt(e.target.value, 10) || 0)
                      })}
                      className="w-16 p-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-center rounded-lg text-slate-900 dark:text-white font-mono font-bold text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setYearlyQuantities(prev => ({
                        ...prev,
                        [String(year)]: (parseInt(prev[String(year)], 10) || 0) + 1
                      }))}
                      className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center cursor-pointer text-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Technical Specifications & Justification */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Technical Specifications &amp; Operational Rationale
            </label>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Detail operational necessity, hardware specs, user workloads, or target division tasks..."
              rows={3}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white leading-relaxed resize-none text-xs outline-none focus:border-blue-500"
            />
          </div>

          {/* 7. In-House / Non-Commercial Development Turnover Toggle */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <span className="font-bold text-slate-900 dark:text-white block text-xs">
                In-House Developed / Non-Commercial Asset
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                Check if software is developed internally or turned over; commercial quotation canvas is optional.
              </span>
            </div>
            <input
              type="checkbox"
              checked={createdByStudents}
              onChange={e => setCreatedByStudents(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
            />
          </div>

          {/* 8. Expansion Project Declaration */}
          <div className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
            <input
              type="checkbox"
              id="expansion_toggle"
              checked={isExpansion}
              onChange={e => setIsExpansion(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded cursor-pointer mt-0.5 shrink-0"
            />
            <div className="space-y-0.5 cursor-pointer select-none" onClick={() => setIsExpansion(!isExpansion)}>
              <label htmlFor="expansion_toggle" className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block cursor-pointer">
                Expansion Project (New Capacity)
              </label>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                Check if this proposal adds new capacity rather than replacing retired End-of-Life (EOL) equipment in Annex 1.
              </span>
            </div>
          </div>

          {/* 9. Quotation Evidence Section (1-Step File Attachment) */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                Quotation Evidence &amp; Proof
              </span>
              {itemSelect !== "other" ? (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold font-mono">
                  ✓ Catalog Pre-Approved
                </span>
              ) : createdByStudents ? (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold font-mono">
                  ✓ In-House Turnover
                </span>
              ) : (
                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono font-bold">
                  *Required for Submission
                </span>
              )}
            </div>

            {itemSelect === "other" && !createdByStudents && (
              <div className="space-y-2.5 pt-1">
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
                    Supplier / Vendor Name
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="e.g. Authorized Bidding Supplier / Solution Provider"
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
                  />
                </div>

                {/* 1-Step Inline File Picker */}
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
                    Attach Quotation Canvas (PDF)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setInlineFile(e.target.files[0] || null)}
                    className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
                  />
                  {inlineFile && (
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 pt-0.5">
                      <Check className="w-3 h-3" />
                      <span>Ready to upload: {inlineFile.name} ({(inlineFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  )}
                  {canvasUrl && !inlineFile && (
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenQuotation({ id: editingId, canvas_evidence_url: canvasUrl })}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Current Quote Attached ({canvasUrl.split("/").pop().split("?")[0]})</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCanvasUrl(""); setCanvasExpiry(""); }}
                        className="text-rose-500 hover:text-rose-700 text-[10px] font-bold p-1 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
                    Quotation Expiration Date
                  </label>
                  <input
                    type="date"
                    value={canvasExpiry}
                    onChange={e => setCanvasExpiry(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-xs outline-none cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Optional proof upload for student/in-house turnovers */}
            {itemSelect === "other" && createdByStudents && (
              <div className="space-y-2 pt-1 animate-fadeIn">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                  Commercial quotation is optional. You may optionally attach a turnover deed, project specification, or approval memorandum below.
                </p>
                <div className="space-y-1">
                  <label className="text-[9.5px] uppercase font-bold text-slate-400 dark:text-slate-500 block">
                    Turnover Deed / Supporting Proof (PDF, Optional)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setInlineFile(e.target.files[0] || null)}
                    className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
                  />
                </div>
                {canvasUrl && !inlineFile && (
                  <div className="flex items-center justify-between text-[10px] pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenQuotation({ id: editingId, canvas_evidence_url: canvasUrl })}
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Current Proof Attached</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCanvasUrl(""); setCanvasExpiry(""); }}
                      className="text-rose-500 hover:text-rose-700 text-[10px] font-bold p-1 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clean Outlay Summary Indicator */}
          <div className="p-3.5 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between font-sans">
            <div>
              <span className="text-slate-600 dark:text-slate-400 font-semibold block text-[11px]">Total Estimated Outlay:</span>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-mono">({calculatedTotalQty} Total Units Requested)</span>
            </div>
            <span className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
              {formatPHP(calculatedTotalOutlay)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{submitting ? "Saving..." : editingId ? "Save Proposal Changes" : "Save Proposal Draft"}</span>
          </button>
        </form>

        {/* Right Column: Proposals Ledger Workspace */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
                {filterTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                      activeTab === tab.id 
                        ? "bg-blue-600 text-white shadow-xs" 
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 outline-none text-[11px] cursor-pointer font-semibold"
                >
                  <option value="all">All Statuses</option>
                  <option value="Draft">Draft Mode</option>
                  <option value="Submitted">In Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Returned">Returned</option>
                </select>

                <div className="relative w-full sm:w-52">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search proposals..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="p-1.5 pl-8 pr-7 w-full bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs outline-none text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500"
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
              </div>
            </div>

            {/* Proposal Cards List */}
            <div className="space-y-3.5 max-h-[660px] overflow-y-auto pr-1">
              {loading && proposals.length === 0 ? (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                  <span>Loading department proposals...</span>
                </div>
              ) : filteredProposals.length > 0 ? (
                filteredProposals.map(p => {
                  const subtotal = parseFloat(p.total_cost || 0);
                  const isCatalog = Boolean(p.item_key && p.item_key !== "other");
                  const isStudentAsset = Boolean(p.created_by_students || p.is_in_house_turnover);
                  const isCanvasExpired = isExpired(p.canvas_expiration_date);
                  const needsCanvas = !isCatalog && !isStudentAsset && (!p.canvas_evidence_url || isCanvasExpired);
                  const hasActionRequired = (p.comments || []).some(c => c.requires_department_action && !c.is_resolved);

                  return (
                    <div 
                      key={p.id} 
                      className={`p-4 rounded-2xl border transition-all space-y-3 shadow-xs ${
                        p.status === "Returned" 
                          ? "bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60" 
                          : needsCanvas 
                          ? "bg-amber-50/70 dark:bg-amber-955/20 border-amber-300 dark:border-amber-900/60" 
                          : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-4 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{p.item_name}</span>
                            <span className="text-[8.5px] px-2 py-0.5 rounded-full font-bold uppercase font-mono border bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                              {p.category === "Software" ? "Packaged Software Licenses" : (p.category || "Hardware")}
                            </span>
                            {isStudentAsset && (
                              <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold uppercase font-mono flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> In-House / Non-Commercial
                              </span>
                            )}
                            {p.needs_assessment_id && (
                              <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20 font-bold uppercase font-mono flex items-center gap-0.5">
                                <ClipboardCheck className="w-2.5 h-2.5" /> Needs Linked
                              </span>
                            )}
                            {p.is_expansion && (
                              <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-bold uppercase font-mono">
                                Expansion
                              </span>
                            )}
                          </div>

                          {/* Administrative Assignment Badges (Rendered cleanly when mapped by Admin) */}
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-2">
                            {p.outcome?.outcome_name ? (
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                Program: {p.outcome.outcome_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 italic">
                                Program Alignment: Pending Review
                              </span>
                            )}
                            {p.project_rel?.project_title ? (
                              <>
                                <span>&bull;</span>
                                <span className="text-purple-600 dark:text-purple-400 font-semibold">
                                  Portfolio Project: {p.project_rel.project_title}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>&bull;</span>
                                <span className="text-amber-600 dark:text-amber-400 italic">
                                  Intake Pool (Unlinked)
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <StatusPill status={p.status} />
                          <button
                            onClick={() => openDiscussion(p)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors relative"
                            title="Remarks & Discussions"
                          >
                            <MessageSquare className="w-4 h-4" />
                            {hasActionRequired && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1 right-1 animate-pulse" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Returned Reason Guidance Banner */}
                      {p.status === "Returned" && (
                        <div className="p-3 bg-rose-100/90 dark:bg-rose-955/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl text-xs flex items-start gap-2 animate-fadeIn">
                          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-[11px] uppercase tracking-wide">Proposal Returned for Revision</span>
                            <span className="text-[11px] leading-relaxed">
                              {p.rejection_reason || "The MIS Administrator has requested technical adjustments. Check the discussion remarks thread for instructions, update the required parameters, and resubmit."}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Missing / Expired Quotation Banner */}
                      {needsCanvas && (
                        <div className="p-3 bg-amber-100 dark:bg-amber-955/30 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-300 rounded-xl flex items-center justify-between text-[11px] font-bold">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>{isCanvasExpired ? "Market quotation has expired! Please attach an updated quote." : "A quotation canvas is required before submitting to review."}</span>
                          </span>
                          <button 
                            onClick={() => {
                              setActiveUploadItem(p);
                              setUploadSupplier(p.supplier_name || p.payload?.supplier_name || "");
                              setUploadFile(null);
                              setUploadExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
                            }}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg cursor-pointer uppercase tracking-wider text-[9px] shadow-xs"
                          >
                            Upload Quote
                          </button>
                        </div>
                      )}

                      {/* Quotation / Proof Status Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-[10.5px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[9px]">Proof Document:</span>
                          {isCatalog ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[8.5px] font-bold uppercase font-mono">
                              ✓ Catalog Pre-Approved (Quotation Exempt)
                            </span>
                          ) : isStudentAsset ? (
                            p.canvas_evidence_url ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenQuotation(p)}
                                  className="text-blue-600 dark:text-blue-400 underline font-semibold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>View Turnover Proof</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 italic font-mono text-[10px]">
                                Turnover Asset (Quotation Exempt)
                              </span>
                            )
                          ) : p.canvas_evidence_url ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenQuotation(p)}
                                className="text-blue-600 dark:text-blue-400 underline font-semibold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>View Document in Official Archive</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                              {isCanvasExpired ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[8.5px] font-bold uppercase font-mono animate-pulse">
                                  Expired
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500 font-mono text-[9.5px]">
                                  {p.canvas_expiration_date ? `Valid until ${new Date(p.canvas_expiration_date).toLocaleDateString()}` : "Active"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-bold italic">
                              Missing Quote
                            </span>
                          )}
                        </div>

                        {(p.status === "Draft" || p.status === "Returned") && !isCatalog && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveUploadItem(p);
                              setUploadSupplier(p.supplier_name || p.payload?.supplier_name || "");
                              setUploadFile(null);
                              setUploadExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase text-[9px] transition-colors cursor-pointer shadow-2xs font-mono"
                          >
                            {p.canvas_evidence_url ? "Update Quote" : "Attach Quote"}
                          </button>
                        )}
                      </div>

                      {/* Technical Justification text */}
                      {p.justification && (
                        <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed italic">
                          "{p.justification}"
                        </p>
                      )}

                      {/* Multi-Year Physical Targets Breakdown Strip */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono">
                        <span className="text-slate-400 dark:text-slate-500 uppercase font-bold text-[9px]">Annual Targets:</span>
                        {activeYears.map((yr, idx) => {
                          const q = getYearQty(p, yr, idx);
                          return (
                            <span key={yr} className="bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800">
                              FY {yr}: <strong className="text-blue-600 dark:text-blue-400">{q || 0}</strong>
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex justify-between items-center text-[10.5px] font-mono pt-1">
                        <div className="flex gap-4">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">Unit Cost:</span>
                            <span className="text-slate-800 dark:text-slate-200 ml-1 font-bold">{formatPHP(p.unit_cost)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">Total Units:</span>
                            <span className="text-slate-800 dark:text-slate-200 ml-1 font-bold">{p.total_qty} units</span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">Total Outlay:</span>
                            <span className="text-slate-900 dark:text-white ml-1 font-bold text-xs">{formatPHP(subtotal)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          {/* 1-Click Duplicate/Clone Proposal Button */}
                          <button
                            type="button"
                            onClick={() => handleDuplicate(p.id, p.item_name)}
                            className="p-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Duplicate Proposal into New Draft"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {p.status === "Draft" || p.status === "Returned" ? (
                            <>
                              <button
                                onClick={() => handleEdit(p)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                                title="Edit proposal parameters"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(p.id, p.item_name)}
                                className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded-lg text-slate-500 cursor-pointer transition-colors"
                                title="Delete proposal draft"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleSubmitProposal(p.id, p.item_name)}
                                disabled={needsCanvas}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg font-bold cursor-pointer transition-colors flex items-center gap-1 text-[10px] shadow-sm"
                                title={needsCanvas ? "Quotation canvas required before submission" : "Submit to Review Queue"}
                              >
                                <Send className="w-3 h-3" />
                                <span>Submit</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono font-bold uppercase flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Under Review
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
                  No resource proposals match your active filter.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* MODAL 1: DISCUSSION THREAD & RESOLVE ACTIONS */}
      {activeDiscussionItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl flex flex-col h-[520px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-955">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-sm">Discussions &amp; Revision Remarks</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Proposal: {activeDiscussionItem.item_name}</p>
              </div>
              <button onClick={() => setActiveDiscussionItem(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-blue-600 dark:text-blue-400">{comment.author_name}</span>
                      <span className="text-slate-400 dark:text-slate-500 font-mono">{new Date(comment.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-xs">{comment.text}</p>
                    
                    {comment.requires_department_action && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 font-bold uppercase font-mono tracking-wider">
                          Action Required by Department
                        </span>
                        {comment.is_resolved ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[10px] font-mono">
                            <CheckSquare className="w-3.5 h-3.5" /> Resolved
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleResolveComment(comment.id)}
                            className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-2xs font-mono uppercase"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 italic">No feedback remarks logged yet.</div>
              )}
            </div>

            <form onSubmit={handlePostComment} className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 flex gap-2">
              <input
                type="text" required value={newCommentText} onChange={e => setNewCommentText(e.target.value)}
                placeholder="Type a response or clarification..."
                className="flex-1 p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500"
              />
              <button type="submit" className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white text-xs cursor-pointer">
                Post
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UPLOAD / UPDATE CANVAS QUOTATION */}
      {activeUploadItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {activeUploadItem.created_by_students ? "Attach Proof / Turnover Deed (PDF)" : "Update Market Quotation (PDF)"}
                </h3>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{activeUploadItem.item_name}</span>
              </div>
              <button 
                onClick={() => { setActiveUploadItem(null); setUploadFile(null); setUploadSupplier(""); setUploadExpiry(""); }} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadCanvasModal} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {activeUploadItem.created_by_students ? "Internal Development Team / Turnover Unit" : "Supplier Name"}
                </label>
                <input
                  type="text" required value={uploadSupplier} onChange={e => setUploadSupplier(e.target.value)}
                  placeholder={activeUploadItem.created_by_students ? "e.g. In-House Dev Unit / Systems Development Team" : "e.g. Authorized Bidding Supplier / Solution Provider"}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Quotation Expiration Date {activeUploadItem.created_by_students ? "(Optional)" : ""}
                </label>
                <input
                  type="date" 
                  value={uploadExpiry} 
                  onChange={e => setUploadExpiry(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none font-mono cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {activeUploadItem.created_by_students 
                    ? "Turnover Deed / Supporting Proof (PDF) - Optional" 
                    : "Market Quotation Canvas (PDF) - Mandatory"}
                </label>
                <input
                  type="file" required accept="application/pdf"
                  onChange={e => setUploadFile(e.target.files[0])}
                  className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
                />
              </div>

              <button 
                type="submit" 
                disabled={uploadingCanvas} 
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{uploadingCanvas ? "Uploading Document..." : "Link Document to Proposal"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}