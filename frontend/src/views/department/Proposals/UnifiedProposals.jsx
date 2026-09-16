// frontend/src/views/department/Proposals/UnifiedProposals.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { useNotifications } from "../../../context/NotificationContext";
import { 
  getProposals, 
  createDraftProposal, 
  updateProposal, 
  deleteProposal, 
  submitProposal, 
  getDeptCatalog, 
  getNeedsAssessments, 
  getOutcomes, 
  getProjects, 
  getComments, 
  postComment, 
  resolveComment, 
  uploadCanvas 
} from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import { 
  FolderKanban, 
  Plus, 
  Trash2, 
  Edit3, 
  Send, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  GraduationCap, 
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
  Info, 
  Lock, 
  ShieldAlert 
} from "lucide-react";

export default function UnifiedProposals() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const { fetchNotifications } = useNotifications();
  const location = useLocation();

  // Core Data Lists
  const [proposals, setProposals] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filter States
  const [activeTab, setActiveTab] = useState("all"); 
  const [searchQuery, setSearchQuery] = useState("");

  // Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form Field States (DICT v.2026 Aligned)
  const [outcomeId, setOutcomeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [needsAssessmentId, setNeedsAssessmentId] = useState("");
  const [category, setCategory] = useState("Hardware");
  const [strategicCategory, setStrategicCategory] = useState("Office Productivity");
  const [officeLocation, setOfficeLocation] = useState("Central Office");
  const [fundSource, setFundSource] = useState("General Appropriations Act (GAA)");
  const [itemSelect, setItemSelect] = useState("other");
  const [itemName, setItemName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [yearlyQuantities, setYearlyQuantities] = useState({});
  const [justification, setJustification] = useState("");
  const [devStatus, setDevStatus] = useState("N/A");
  const [createdByStudents, setCreatedByStudents] = useState(false);
  const [isExpansion, setIsExpansion] = useState(false);
  const [canvasUrl, setCanvasUrl] = useState("");
  const [canvasExpiry, setCanvasExpiry] = useState("");

  // Edit / Action States
  const [editingId, setEditingId] = useState(null);
  
  // Canvas Upload Modal State (Rule 7)
  const [activeUploadItem, setActiveUploadItem] = useState(null);
  const [uploadSupplier, setUploadSupplier] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadingCanvas, setUploadingCanvas] = useState(false);

  // Discussion Remarks Thread State
  const [activeDiscussionItem, setActiveDiscussionItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");

  const token = user?.token || localStorage.getItem("access_token") || "";
  const activeYears = (planningYears && planningYears.length > 0) ? planningYears : [2026, 2027, 2028];

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Capitalization and UACS Auto-Resolution Helper (DBM ₱50,000.00 Rule + DICT Training Code)
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

    // Mandated by DICT Guidelines Page 24: Training Expenses under UACS 50202010 00
    if (lower.includes("training") || lower.includes("seminar") || lower.includes("workshop")) {
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: "50202010 00 - Training Expenses (MOOE)"
      };
    }

    if (strategicCat === "Continuing Costs/Expenses") {
      if (lower.includes("software") || lower.includes("subscription") || lower.includes("cloud") || lower.includes("internet")) {
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
      if (lower.includes("suite") || lower.includes("license") || lower.includes("subscription") || lower.includes("cloud")) {
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

    // Projects (Internal or Cross-Agency)
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

  // Sync Global Search Query & Tab from URL Navigation (?search=...&category=...)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const q = searchParams.get("search");
    if (q !== null) {
      setSearchQuery(q);
    }
    const cat = searchParams.get("category");
    if (cat !== null) {
      setActiveTab(cat);
    }
  }, [location.search]);

  // Synchronize yearly quantities with active planning years non-destructively
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
  }, [planningYears]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pData, catData, oData, prjData, naData] = await Promise.all([
        getProposals(activeCycle),
        getDeptCatalog().catch(() => []),
        getOutcomes().catch(() => []),
        getProjects().catch(() => []),
        getNeedsAssessments().catch(() => [])
      ]);
      setProposals(Array.isArray(pData) ? pData : []);
      setCatalog(Array.isArray(catData) ? catData : []);
      setOutcomes(Array.isArray(oData) ? oData : []);
      setProjects(Array.isArray(prjData) ? prjData : []);
      setNeedsAssessments(Array.isArray(naData) ? naData : []);

      if (Array.isArray(oData) && oData.length > 0 && !outcomeId) {
        setOutcomeId(String(oData[0].id));
      }
    } catch (err) {
      setError(err.message || "Failed to load proposals.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, outcomeId]);

  useEffect(() => {
    if (token && activeCycle) {
      loadData();
    }
  }, [token, activeCycle, loadData]);

  // Derived Quantities & Total Cost
  const calculatedTotalQty = Object.values(yearlyQuantities).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  const calculatedTotalOutlay = (parseFloat(unitCost) || 0) * calculatedTotalQty;
  const isCapitalOutlayMajor = calculatedTotalOutlay >= 2000000.00;
  const isOver2M = isCapitalOutlayMajor;
  const autoClass = getAutoClassification(itemName, unitCost, category, strategicCategory, createdByStudents);

  // Auto-sync development status when outlay crosses ₱2M to prevent validation desync
  useEffect(() => {
    if (isOver2M && devStatus === "N/A") {
      setDevStatus("For Development");
    } else if (!isOver2M && (devStatus === "For Development" || devStatus === "For Enhancement")) {
      setDevStatus("N/A");
    }
  }, [isOver2M, devStatus]);

  // Standard Catalog Auto-Fill Handler
  const handleCatalogItemChange = (key) => {
    setItemSelect(key);
    if (key === "other") {
      setItemName("");
      setUnitCost("");
      setCanvasUrl("");
      setCanvasExpiry("");
      setCreatedByStudents(false);
    } else {
      const selected = catalog.find(item => item.item_key === key);
      if (selected) {
        setItemName(selected.display_name);
        setUnitCost(String(selected.standard_unit_cost));
        setCanvasUrl(selected.canvas_evidence_url || "");
        setCanvasExpiry(selected.canvas_expiration_date ? selected.canvas_expiration_date.split("T")[0] : "");
        setCreatedByStudents(false);
      }
    }
  };

  const resetForm = () => {
    setOutcomeId(outcomes.length > 0 ? String(outcomes[0].id) : "");
    setProjectId("");
    setNeedsAssessmentId("");
    setCategory("Hardware");
    setStrategicCategory("Office Productivity");
    setOfficeLocation("Central Office");
    setFundSource("General Appropriations Act (GAA)");
    setItemSelect("other");
    setItemName("");
    setUnitCost("");
    setJustification("");
    setDevStatus("N/A");
    setCreatedByStudents(false);
    setIsExpansion(false);
    setCanvasUrl("");
    setCanvasExpiry("");
    
    const initial = {};
    activeYears.forEach(year => {
      initial[String(year)] = 0;
    });
    setYearlyQuantities(initial);
    setEditingId(null);
  };

  const handleSaveProposal = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!outcomeId) {
      setError("Compliance Violation: Please select an Organizational Outcome (Broader Scope) first.");
      return;
    }

    const costNum = parseFloat(unitCost);
    if (isNaN(costNum) || costNum < 0) {
      setError("Please enter a valid unit rate (₱0.00 or greater).");
      return;
    }

    if (calculatedTotalQty <= 0) {
      setError("Please specify a target quantity greater than zero for at least one planning year.");
      return;
    }

    // Rule 2: Outlays >= ₱2M require Development Status
    if (isCapitalOutlayMajor && devStatus === "N/A") {
      setError("Compliance Violation: Outlays exceeding ₱2,000,000.00 require a System Development Status ('For Development' or 'For Enhancement').");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        outcome_id: parseInt(outcomeId, 10),
        project_id: projectId ? projectId : null,
        needs_assessment_id: needsAssessmentId ? needsAssessmentId : null,
        category,
        strategic_category: strategicCategory,
        office_location: officeLocation,
        fund_source: fundSource,
        item_select: itemSelect,
        item_name: itemName.trim(),
        unit_cost: costNum,
        yearly_quantities: yearlyQuantities,
        justification: justification.trim() || null,
        system_development_status: isOver2M ? devStatus : "N/A",
        created_by_students: createdByStudents,
        canvas_evidence_url: canvasUrl ? canvasUrl.trim() : null,
        canvas_expiration_date: canvasExpiry ? new Date(canvasExpiry).toISOString() : null,
        is_expansion: isExpansion
      };

      if (editingId) {
        await updateProposal(editingId, payload);
        setSuccess("Proposal line item updated successfully.");
      } else {
        await createDraftProposal(payload);
        setSuccess("Draft proposal successfully created.");
      }

      resetForm();
      loadData();
    } catch (err) {
      setError(err.message || "Failed to save proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (p) => {
    setError(null);
    setSuccess(null);
    setEditingId(p.id);
    setOutcomeId(String(p.outcome_id || (outcomes[0]?.id || "1")));
    setProjectId(p.project_id || "");
    setNeedsAssessmentId(p.needs_assessment_id ? String(p.needs_assessment_id) : "");
    setCategory(p.category || "Hardware");
    setStrategicCategory(p.strategic_category || "Office Productivity");
    setOfficeLocation(p.office_location || "Central Office");
    setFundSource(p.fund_source || "General Appropriations Act (GAA)");
    setItemSelect(p.item_key || "other");
    setItemName(p.item_name);
    setUnitCost(String(p.unit_cost));
    setJustification(p.justification || "");
    setDevStatus(p.system_development_status || "N/A");
    setCreatedByStudents(Boolean(p.created_by_students));
    setIsExpansion(Boolean(p.is_expansion));
    setCanvasUrl(p.canvas_evidence_url || "");
    setCanvasExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
    
    const qtyMap = {};
    activeYears.forEach((year, idx) => {
      let q = p.yearly_quantities?.[String(year)];
      if (q === undefined) {
        if (idx === 0) q = p.year_1_qty;
        else if (idx === 1) q = p.year_2_qty;
        else if (idx === 2) q = p.year_3_qty;
      }
      qtyMap[String(year)] = q || 0;
    });
    setYearlyQuantities(qtyMap);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Purge proposal draft for '${name}'?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProposal(id);
      setSuccess("Proposal draft purged successfully.");
      loadData();
    } catch (err) {
      setError(err.message || "Failed to delete proposal.");
    }
  };

  const handleSubmitProposal = async (id, name) => {
    setError(null);
    setSuccess(null);
    try {
      await submitProposal(id);
      setSuccess(`Proposal '${name}' submitted to governance review queue.`);
      loadData();
      if (fetchNotifications) fetchNotifications();
    } catch (err) {
      setError(err.message || "Submission rejected.");
    }
  };

  // Rule 7: Uploads or updates a canvas quotation / turnover deed
  const handleUploadCanvasModal = async (e) => {
    e.preventDefault();
    if (!uploadFile || !uploadSupplier.trim() || !activeUploadItem) return;
    setError(null);
    setSuccess(null);
    setUploadingCanvas(true);
    try {
      const expiryIso = uploadExpiry ? new Date(uploadExpiry).toISOString() : null;
      await uploadCanvas(activeUploadItem.id, uploadSupplier.trim(), uploadFile, expiryIso, token);

      setSuccess("Document and validity period updated successfully.");
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
      const data = await getComments(item.id);
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
      });
      setNewCommentText("");
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
      loadData();
      if (fetchNotifications) fetchNotifications();
    } catch (err) {
      alert(err.message);
    }
  };

  // Tab and Search Filter
  const filteredProposals = useMemo(() => {
    return proposals.filter(p => {
      if (activeTab === "needs_linked") {
        if (!p.needs_assessment_id) return false;
      } else if (activeTab === "Capital Outlay") {
        if (p.expenditure_class !== "Capital Outlay") return false;
      } else if (activeTab === "MOOE") {
        if (p.expenditure_class === "Capital Outlay") return false;
      } else if (activeTab !== "all") {
        if (p.strategic_category !== activeTab) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (p.item_name || "").toLowerCase().includes(q);
        const matchesOutcome = (p.outcome?.outcome_name || "").toLowerCase().includes(q);
        const matchesUacs = (p.uacs_object_code || "").toLowerCase().includes(q);
        const matchesProject = (p.project_rel?.project_title || "").toLowerCase().includes(q);
        const matchesJust = (p.justification || "").toLowerCase().includes(q);
        if (!matchesName && !matchesOutcome && !matchesUacs && !matchesProject && !matchesJust) return false;
      }

      return true;
    });
  }, [proposals, activeTab, searchQuery]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto font-sans select-none">
      
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Unified Resource Proposals Ledger (Part IV.A)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Merged CapEx &amp; MOOE ledger. Target deployment office automated to: <strong className="text-slate-900 dark:text-white">{user?.department_name || "Assigned Department"}</strong>.
          </p>
        </div>
        <button 
          onClick={loadData} 
          disabled={loading}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 font-bold shadow-xs text-xs"
          title="Refresh Ledger"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Ledger</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Proposal Submission Form */}
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

          {/* Rule 6: Broader Scope Target (Organizational Outcome) at the TOP */}
          <div className="space-y-1.5 bg-blue-50/60 dark:bg-slate-955 p-3.5 rounded-xl border border-blue-200 dark:border-slate-800">
            <label className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-400 tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              <span>Broader Scope Target: Outcome (Part I.A.4)</span>
            </label>
            {outcomes.length > 0 ? (
              <select
                value={outcomeId}
                onChange={e => setOutcomeId(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none text-xs font-semibold cursor-pointer focus:border-blue-500"
                required
              >
                {outcomes.map(o => (
                  <option key={o.id} value={String(o.id)}>
                    {o.outcome_name} ({o.type_label || "Outcome"})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-lg text-[10.5px]">
                No Organizational Outcomes defined by Admin.
              </div>
            )}
          </div>

          {/* Optional Link to Department Needs Assessment (Sec 8.0) */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Link to Needs Assessment (Section 8.0)</span>
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
                  [{n.mfo_alignment?.toUpperCase() || "MFO"}] {n.title}
                </option>
              ))}
            </select>
          </div>

          {/* Resource Category & Strategic Bucket */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">Classification</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer text-xs font-semibold"
              >
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Subscription">Subscription</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">Spending Bucket</label>
              <select
                value={strategicCategory}
                onChange={e => setStrategicCategory(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none text-xs font-semibold"
              >
                <option value="Office Productivity">Office Productivity</option>
                <option value="Internal ICT Projects">Internal Projects</option>
                <option value="Cross-Agency ICT Projects">Cross-Agency</option>
                <option value="Continuing Costs/Expenses">Continuing Costs</option>
              </select>
            </div>
          </div>

          {/* Pre-Approved Catalog Reference */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Price Reference Catalog</label>
            <select
              value={itemSelect}
              onChange={e => handleCatalogItemChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none font-mono text-xs"
            >
              <option value="other">-- Custom Request (Other) --</option>
              {catalog.map(item => (
                <option key={item.id} value={item.item_key}>
                  {item.display_name} ({formatPHP(item.standard_unit_cost)})
                </option>
              ))}
            </select>
          </div>

          {/* Linked Strategic ICT Project */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <FolderKanban className="w-3.5 h-3.5 text-blue-500" />
              <span>Linked Strategic Project (Part III.E)</span>
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none text-xs cursor-pointer focus:border-blue-500 font-medium"
            >
              <option value="">-- Standalone (Office Productivity / Continuing) --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.project_category}] {p.project_title}</option>
              ))}
            </select>
          </div>

          {/* Item Description */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Item Description</label>
            <input
              type="text"
              required
              disabled={itemSelect !== "other"}
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="e.g. Workstation Laptop, Productivity Software"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500 disabled:opacity-60 text-xs"
            />
          </div>

          {/* Location & Fund Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">Deployment Location</label>
              <select
                value={officeLocation}
                onChange={e => setOfficeLocation(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none text-xs"
              >
                <option value="Central Office">Central Office</option>
                <option value="Field/Regional Office">Field/Regional Office</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">Financing Source</label>
              <select
                value={fundSource}
                onChange={e => setFundSource(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white cursor-pointer outline-none text-xs"
              >
                <option value="General Appropriations Act (GAA)">GAA (National Budget)</option>
                <option value="Foreign-Assisted Projects (FAP)">FAP (Loans / Grants)</option>
                <option value="Locally Funded">Locally Funded</option>
                <option value="Other Income Generating Sources">Other Income</option>
              </select>
            </div>
          </div>

          {/* Unit Cost & Real-Time DBM Auto-Classification */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">Unit Cost (PHP ₱)</label>
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

            {/* Live DBM Classification Badge */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Accounting Class</span>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono tracking-wider border ${
                autoClass.expClass === "Capital Outlay"
                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                  : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
              }`}>
                {autoClass.expClass === "Capital Outlay" ? "Capital Outlay" : "MOOE"}
              </span>
              <span className="block text-[9px] text-slate-500 font-mono truncate" title={autoClass.uacs}>
                {autoClass.uacs.split(" - ")[0]}
              </span>
            </div>
          </div>

          {/* Rule 1: In-House / Non-Commercial Development Systems Bypass Toggle */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <span className="font-bold text-slate-900 dark:text-white block text-xs">In-House / Non-Commercial Asset</span>
              <span className="text-[10px] text-slate-500 block leading-tight">
                Capital Outlay; market quotation is optional (Rule 1).
              </span>
            </div>
            <input
              type="checkbox"
              checked={createdByStudents}
              onChange={e => setCreatedByStudents(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Dynamic Quotation Proof / Turnover Deed Section */}
          {itemSelect === "other" && (
            <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  {createdByStudents 
                    ? "Turnover Deed / Proof (Optional)" 
                    : "Market Quotation Proof (PDF)"}
                </label>
                {canvasUrl && (
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 font-mono">
                    <Check className="w-3 h-3" /> Attached
                  </span>
                )}
              </div>

              {canvasUrl ? (
                <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <a
                    href={canvasUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-[10px] truncate max-w-[180px] inline-flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{canvasUrl.split("/").pop()}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                  <button
                    type="button"
                    onClick={() => { setCanvasUrl(""); setCanvasExpiry(""); }}
                    className="text-rose-500 hover:text-rose-700 text-[10px] font-bold p-1 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-slate-500 italic">
                  {createdByStudents 
                    ? "Optional: You can save this draft and attach supporting documents (e.g. deed of turnover, project acceptance sheet) anytime."
                    : "Quotation proof can be linked via 'Attach Document' or upload after drafting."}
                </p>
              )}

              <div className="space-y-1 pt-1">
                <label className="text-[9px] uppercase font-bold text-slate-400 block">
                  Quotation / Proof Expiration Date {createdByStudents ? "(Optional)" : ""}
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

          {/* Rule 2: Outlays >= ₱2,000,000.00 System Development Tag */}
          {isOver2M && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-2 animate-fadeIn">
              <span className="block text-[10px] text-amber-800 dark:text-amber-300 font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Major Outlay (&ge; ₱2M): Lifecycle Tag Required</span>
              </span>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400 leading-normal">
                Outlays exceeding ₱2,000,000.00 require a development lifecycle tag for DICT compliance.
              </p>
              <select
                value={devStatus}
                onChange={e => setDevStatus(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
              >
                <option value="For Development">For Development (New System)</option>
                <option value="For Enhancement">For Enhancement (Upgrade Profile)</option>
              </select>
            </div>
          )}

          {/* Expansion Project Declaration */}
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
              <span className="text-[10px] text-slate-500 block leading-tight">
                Check if this proposal is expanding capacity rather than replacing retired End-of-Life (EOL) hardware. Bypasses Annex 1 hardware retirement matching.
              </span>
            </div>
          </div>

          {/* Multi-Year Targets Grid */}
          <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Multi-Year Quantities ({activeYears.length} Years Horizon)</span>
            </span>
            <div className="space-y-2">
              {activeYears.map(year => (
                <div key={year} className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">FY {year} Target:</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={yearlyQuantities[String(year)] ?? 0}
                    onChange={e => setYearlyQuantities({
                      ...yearlyQuantities,
                      [String(year)]: parseInt(e.target.value, 10) || 0
                    })}
                    className="w-20 p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-center rounded-lg text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Specifications Justification */}
          {itemSelect === "other" && (
            <div className="space-y-1.5 animate-fadeIn">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Technical Justification
              </label>
              <textarea
                value={justification}
                onChange={e => setJustification(e.target.value)}
                placeholder="Hardware specifications, CPU cores, storage capacity, operating workload requirements..."
                rows={3}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white leading-relaxed resize-none text-xs outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* Total Outlay Indicator */}
          <div className="p-3.5 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between font-sans">
            <span className="text-slate-600 dark:text-slate-400 font-semibold">Projected Outlay:</span>
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
            <span>{submitting ? "Saving..." : editingId ? "Save Proposal Modifications" : "Save Proposal Draft"}</span>
          </button>
        </form>

        {/* Right Column: Proposals Ledger Workspace */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
                {[
                  { id: "all", label: "All Items" },
                  { id: "Office Productivity", label: "Office Productivity" },
                  { id: "Internal ICT Projects", label: "Projects" },
                  { id: "Cross-Agency ICT Projects", label: "Cross-Agency" },
                  { id: "Continuing Costs/Expenses", label: "Continuing" },
                  { id: "Capital Outlay", label: "CapEx (CO)" },
                  { id: "MOOE", label: "MOOE" },
                  { id: "needs_linked", label: "Needs Linked (Sec 8)" }
                ].map(tab => (
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

              <div className="relative w-full sm:w-56">
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

            {/* Proposal Cards List */}
            <div className="space-y-3.5 max-h-[650px] overflow-y-auto pr-1">
              {loading && proposals.length === 0 ? (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
                  <span>Loading department proposals...</span>
                </div>
              ) : filteredProposals.length > 0 ? (
                filteredProposals.map(p => {
                  const subtotal = parseFloat(p.total_cost || 0);
                  const isCanvasExpired = p.canvas_expiration_date && new Date(p.canvas_expiration_date) < new Date();
                  const needsCanvas = !p.created_by_students && (!p.canvas_evidence_url || isCanvasExpired);
                  const inHouseExpiredWarning = p.created_by_students && parseFloat(p.unit_cost) > 0 && p.canvas_evidence_url && isCanvasExpired;

                  return (
                    <div 
                      key={p.id} 
                      className={`p-4 rounded-2xl border transition-all space-y-3 shadow-xs ${
                        p.status === "Returned" 
                          ? "bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60" 
                          : needsCanvas 
                          ? "bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/60" 
                          : "bg-white dark:bg-slate-955 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-4 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{p.item_name}</span>
                            <span className={`text-[8.5px] px-2 py-0.5 rounded-full font-bold uppercase font-mono border ${
                              p.expenditure_class === "Capital Outlay" 
                                ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20" 
                                : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                            }`}>
                              {p.expenditure_class === "Capital Outlay" ? "Capital Outlay (CO)" : "MOOE"}
                            </span>
                            {p.created_by_students && (
                              <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold uppercase font-mono flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> In-House / Non-Commercial
                              </span>
                            )}
                            {p.needs_assessment_id && (
                              <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20 font-bold uppercase font-mono flex items-center gap-0.5">
                                <ClipboardCheck className="w-2.5 h-2.5" /> Sec 8.0 Linked
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-1 space-x-2">
                            <span>UACS: <strong className="text-slate-700 dark:text-slate-300">{p.uacs_object_code || "50604050 03"}</strong></span>
                            <span>&bull;</span>
                            <span>Outcome: <strong className="text-slate-700 dark:text-slate-300">{p.outcome?.outcome_name}</strong></span>
                            <span>&bull;</span>
                            <span>Fund: <strong className="text-slate-700 dark:text-slate-300">{p.fund_source ? p.fund_source.split(" (")[0] : "GAA"}</strong></span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <StatusPill status={p.status} />
                          <button
                            onClick={() => openDiscussion(p)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                            title="Remarks & Discussions"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Rule 7: Missing / Expired Quotation Banner */}
                      {needsCanvas && (
                        <div className="p-3 bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-300 rounded-xl flex items-center justify-between text-[11px] font-bold">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>{isCanvasExpired ? "Market quotation has expired! Please upload an updated quotation before submitting." : "Quotation canvas required before submission."}</span>
                          </span>
                          <button 
                            onClick={() => {
                              setActiveUploadItem(p);
                              setUploadSupplier(p.payload?.supplier_name || "");
                              setUploadFile(null);
                              setUploadExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
                            }}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg cursor-pointer uppercase tracking-wider text-[9px] shadow-xs"
                          >
                            Upload Canvas
                          </button>
                        </div>
                      )}

                      {/* Funded In-House Proposal Expired Notice */}
                      {inHouseExpiredWarning && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-300 rounded-xl flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>Supporting documentation for this funded non-commercial project has expired. You may refresh it or submit as-is.</span>
                          </span>
                          <button 
                            onClick={() => {
                              setActiveUploadItem(p);
                              setUploadSupplier(p.payload?.supplier_name || "");
                              setUploadFile(null);
                              setUploadExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer uppercase tracking-wider text-[9px] shadow-xs"
                          >
                            Update Proof
                          </button>
                        </div>
                      )}

                      {/* Quotation / Proof Audit State Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-[10.5px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-semibold uppercase text-[9px]">Proof Document:</span>
                          {p.created_by_students ? (
                            p.canvas_evidence_url ? (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={p.canvas_evidence_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 dark:text-blue-400 underline font-semibold text-[10px] inline-flex items-center gap-1"
                                >
                                  <span>View Proof</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[8.5px] font-bold uppercase font-mono">
                                  Turnover Proof Attached
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic font-mono text-[10px]">
                                No Canvas (Bypassed)
                              </span>
                            )
                          ) : p.canvas_evidence_url ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={p.canvas_evidence_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 dark:text-blue-400 underline font-semibold text-[10px] inline-flex items-center gap-1"
                              >
                                <span>View Canvas</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                              {isCanvasExpired ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[8.5px] font-bold uppercase font-mono animate-pulse">
                                  Expired
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[9.5px]">
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

                        {(p.status === "Draft" || p.status === "Returned") && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveUploadItem(p);
                              setUploadSupplier(p.payload?.supplier_name || "");
                              setUploadFile(null);
                              setUploadExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase text-[9px] transition-colors cursor-pointer shadow-2xs font-mono"
                          >
                            {p.canvas_evidence_url ? "Update Document" : "Attach Document"}
                          </button>
                        )}
                      </div>

                      {/* Multi-Year Physical Targets Breakdown Strip */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono">
                        <span className="text-slate-400 uppercase font-bold text-[9px]">Targets:</span>
                        {activeYears.map((yr, idx) => {
                          const q = p.yearly_quantities?.[String(yr)] ?? (idx === 0 ? p.year_1_qty : idx === 1 ? p.year_2_qty : idx === 2 ? p.year_3_qty : 0);
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
                            <span className="text-slate-400">Unit Cost:</span>
                            <span className="text-slate-800 dark:text-slate-200 ml-1 font-bold">{formatPHP(p.unit_cost)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Total Units:</span>
                            <span className="text-slate-800 dark:text-slate-200 ml-1 font-bold">{p.total_qty} units</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Total Outlay:</span>
                            <span className="text-slate-900 dark:text-white ml-1 font-bold text-xs">{formatPHP(subtotal)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        {p.status === "Draft" || p.status === "Returned" ? (
                          <div className="flex items-center gap-1.5">
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
                              title="Submit to Review Queue"
                            >
                              <Send className="w-3 h-3" />
                              <span>Submit</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Under Review
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-20 text-slate-400 italic">
                  No proposals logged matching active query.
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
                <p className="text-[10px] text-slate-500 font-mono">Proposal: {activeDiscussionItem.item_name}</p>
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
                      <span className="text-slate-400 font-mono">{new Date(comment.timestamp).toLocaleTimeString()}</span>
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

      {/* MODAL 2: UPLOAD / UPDATE CANVAS QUOTATION (RULE 7) */}
      {activeUploadItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {activeUploadItem.created_by_students ? "Attach Proof / Turnover Deed (PDF)" : "Update Market Quotation (PDF)"}
                </h3>
                <span className="text-[10px] font-mono text-slate-500">{activeUploadItem.item_name}</span>
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
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                  {activeUploadItem.created_by_students ? "Internal Development Team / Turnover Unit" : "Supplier Name"}
                </label>
                <input
                  type="text" required value={uploadSupplier} onChange={e => setUploadSupplier(e.target.value)}
                  placeholder={activeUploadItem.created_by_students ? "e.g. In-House Dev Unit / Systems Development Team" : "e.g. Authorized Bidding Supplier / Solution Provider"}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
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
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
                  {activeUploadItem.created_by_students 
                    ? "Turnover Deed / Supporting Proof (PDF) - Optional" 
                    : "Market Quotation Canvas (PDF) - Mandatory"}
                </label>
                <input
                  type="file" required accept="application/pdf"
                  onChange={e => setUploadFile(e.target.files[0])}
                  className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
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