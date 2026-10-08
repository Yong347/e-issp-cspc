// frontend/src/views/department/Catalog/CatalogViewer.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getDeptCatalog, 
  createDraftProposal, 
  getNeedsAssessments 
} from "../../../api/dept";
import { 
  BookOpen, 
  RefreshCw, 
  Search, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle,
  Tag,
  Plus,
  X,
  ExternalLink,
  Layers,
  Calendar,
  Coins,
  ClipboardCheck,
  FolderKanban,
  Check,
  Sparkles,
  ArrowRight,
  Info,
  SlidersHorizontal,
  LayoutGrid,
  Table as TableIcon
} from "lucide-react";

// Standard Classification Categories for Hardware and Software
const CATEGORIES = [
  { id: "All", label: "All Items" },
  { id: "computing_devices", label: "Computing Devices" },
  { id: "networking", label: "Networking & Connectivity" },
  { id: "printers_imaging", label: "Printers & Imaging" },
  { id: "software", label: "Software & Subscriptions" },
  { id: "other", label: "Other Equipment" }
];

export default function CatalogViewer() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const navigate = useNavigate();

  // Core Data States
  const [catalog, setCatalog] = useState([]);
  const [needsAssessments, setNeedsAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search, Filter & Layout States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [viewMode, setViewMode] = useState("table"); // "table" | "grid"

  // "Add to Proposal" Modal State
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [modalQuantities, setModalQuantities] = useState({});
  const [modalNeedsId, setModalNeedsId] = useState("");
  const [modalJustification, setModalJustification] = useState("");
  const [modalIsExpansion, setModalIsExpansion] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [addedProposalInfo, setAddedProposalInfo] = useState(null);

  // Active planning horizon years sequence (e.g. [2028, 2029, 2030])
  const activeYears = useMemo(() => {
    return planningYears && planningYears.length > 0 ? planningYears : [2026, 2027, 2028];
  }, [planningYears]);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getCategoryLabel = (category) => {
    const cat = (category || "").toLowerCase();
    if (cat.includes("computing")) return "Computing Devices";
    if (cat.includes("network")) return "Networking & Connectivity";
    if (cat.includes("printer") || cat.includes("imaging")) return "Printers & Imaging";
    if (cat.includes("software") || cat.includes("subscription")) return "Software & Subscriptions";
    return "Other Equipment";
  };

  // Fetch Catalog and Department Needs Assessments
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catData, naData] = await Promise.all([
        getDeptCatalog({ category: selectedCategory !== "All" ? selectedCategory : undefined }),
        getNeedsAssessments().catch(() => [])
      ]);
      setCatalog(Array.isArray(catData) ? catData : []);
      setNeedsAssessments(Array.isArray(naData) ? naData : []);
    } catch (e) {
      setError(e.message || "Failed to load reference catalog details.");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open the "Add to Proposal" Modal
  const handleOpenAddModal = (item) => {
    setActiveModalItem(item);
    setError(null);
    setSuccess(null);
    setAddedProposalInfo(null);

    // Initialize quantities with 1 for the initial year, 0 for subsequent years
    const initialQty = {};
    activeYears.forEach((yr, idx) => {
      initialQty[String(yr)] = idx === 0 ? 1 : 0;
    });
    setModalQuantities(initialQty);
    setModalNeedsId("");
    setModalJustification("");
    setModalIsExpansion(false);
  };

  const handleCloseModal = () => {
    setActiveModalItem(null);
    setModalSubmitting(false);
  };

  const handleModalQuantityChange = (year, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setModalQuantities(prev => ({
      ...prev,
      [String(year)]: num
    }));
  };

  // Derived Modal Totals
  const modalTotalQty = useMemo(() => {
    return Object.values(modalQuantities).reduce((sum, q) => sum + (parseInt(q, 10) || 0), 0);
  }, [modalQuantities]);

  const modalTotalCost = useMemo(() => {
    if (!activeModalItem) return 0;
    const unitPrice = parseFloat(activeModalItem.standard_unit_cost) || 0;
    return unitPrice * modalTotalQty;
  }, [activeModalItem, modalTotalQty]);

  // Submit Handler for "Add to Proposal"
  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    if (!activeModalItem) return;

    if (modalTotalQty <= 0) {
      setError("Please specify a requested quantity greater than 0 for at least one planning year.");
      return;
    }

    setModalSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const isSoftware = (activeModalItem.category || "").toLowerCase() === "software";
      const payload = {
        item_select: activeModalItem.item_key,
        item_name: activeModalItem.display_name,
        unit_cost: parseFloat(activeModalItem.standard_unit_cost) || 0,
        yearly_quantities: modalQuantities,
        justification: modalJustification.trim() || `Procurement from standard price catalog (${activeModalItem.item_key}).`,
        needs_assessment_id: modalNeedsId || null,
        created_by_students: false,
        is_in_house_turnover: false,
        is_expansion: modalIsExpansion,
        category: isSoftware ? "Subscription" : "Hardware",
        strategic_category: isSoftware ? "Continuing Costs/Expenses" : "Office Productivity",
        supplier_name: activeModalItem.supplier_name || null,
        canvas_evidence_url: activeModalItem.canvas_evidence_url || null,
        canvas_expiration_date: activeModalItem.canvas_expiration_date || null
      };

      const result = await createDraftProposal(payload);
      
      setSuccess(`'${activeModalItem.display_name}' was successfully added to your Department Proposals Queue as a draft!`);
      setAddedProposalInfo(result);
      handleCloseModal();
    } catch (err) {
      setError(err.message || "Failed to add catalog item to proposals.");
    } finally {
      setModalSubmitting(false);
    }
  };

  // Filtered Catalog List
  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      // Category filter
      if (selectedCategory !== "All") {
        const itemCat = (item.category || "").toLowerCase();
        if (selectedCategory === "other") {
          const matchStandard = ["computing", "network", "printer", "imaging", "software"].some(c => itemCat.includes(c));
          if (matchStandard) return false;
        } else if (!itemCat.includes(selectedCategory.replace("_", ""))) {
          if (selectedCategory === "computing_devices" && !itemCat.includes("computing")) return false;
          if (selectedCategory === "printers_imaging" && !itemCat.includes("printer") && !itemCat.includes("imaging")) return false;
          if (selectedCategory === "software" && !itemCat.includes("software") && !itemCat.includes("subscription")) return false;
          if (selectedCategory === "networking" && !itemCat.includes("network")) return false;
        }
      }

      // Search text filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const name = (item.display_name || "").toLowerCase();
        const key = (item.item_key || "").toLowerCase();
        const cat = (item.category || "").toLowerCase();
        const supp = (item.supplier_name || "").toLowerCase();
        return name.includes(q) || key.includes(q) || cat.includes(q) || supp.includes(q);
      }

      return true;
    });
  }, [catalog, selectedCategory, searchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none transition-colors duration-200 font-sans">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-slate-900 dark:text-white font-bold text-base font-serif">
              Standard Pricing &amp; Reference Catalog
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-mono">
              Pre-Approved Baseline &bull; FY {activeCycle}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Browse institutional equipment specifications and verified ceiling prices. Selecting from this standard reference catalog guarantees pre-approved pricing and bypasses external market quotation delays [2].
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/dept/proposals"
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
          >
            <FolderKanban className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Go to Proposals Queue</span>
          </Link>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-xs font-bold text-xs"
            title="Refresh Catalog"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1">
              <span>{success}</span>
              <div className="pt-0.5">
                <Link
                  to="/dept/proposals"
                  className="font-bold underline text-emerald-800 dark:text-emerald-200 inline-flex items-center gap-1 text-xs"
                >
                  <span>Open Proposals Ledger to inspect or submit</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Approved Specifications</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{catalog.length} References</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Canvass Review Exemption</span>
            <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 font-mono mt-0.5">100% Pre-Verified</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Categories</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">
              {new Set(catalog.map(c => c.category)).size} Groups
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Available Section 8.0 Needs</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {needsAssessments.length} Problem Statements
            </h3>
          </div>
        </div>
      </div>

      {/* Information Callout Banner */}
      <div className="p-3.5 bg-blue-50 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10.5px] text-blue-900 dark:text-blue-300 flex items-start gap-2.5 leading-relaxed">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          <strong>Fast-Track Review Gate:</strong> Items selected from this catalog inherit verified quotations from the MIS Central Office and are automatically classified with proper UACS object codes. Clicking <strong>"Add to Proposal"</strong> opens an intake dialog allowing you to set quantities across FY {activeCycle} [2].
        </span>
      </div>

      {/* Category Pills & Search Filter Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        
        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Input & View Toggle */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reference name, model, supplier..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 placeholder-slate-400"
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

          <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "table" ? "bg-white dark:bg-slate-800 text-blue-600 shadow-2xs" : "text-slate-400 hover:text-slate-600"
              }`}
              title="Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === "grid" ? "bg-white dark:bg-slate-800 text-blue-600 shadow-2xs" : "text-slate-400 hover:text-slate-600"
              }`}
              title="Cards Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Viewport: Table vs Grid Mode */}
      {loading ? (
        <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2 shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span>Synchronizing standard price catalog items...</span>
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-400 italic shadow-xs">
          No standard catalog items match your active search or category filters.
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs animate-fadeIn">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] font-mono">
                  <th className="p-3.5 w-2/5">Reference Item &amp; Code</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-right font-mono">Approved Unit Cost</th>
                  <th className="p-3.5">Scope &amp; Validity</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredCatalog.map(item => {
                  const unitPrice = parseFloat(item.standard_unit_cost || 0);
                  const isExpiring = item.canvas_expiration_date && new Date(item.canvas_expiration_date) < new Date();

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white text-xs">{item.display_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 select-all">
                          Key: <code>{item.item_key}</code>
                        </div>
                        {item.supplier_name && (
                          <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Supplier: {item.supplier_name}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 font-mono text-[9.5px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{getCategoryLabel(item.category)}</span>
                        </span>
                      </td>

                      <td className="p-3.5 text-right font-mono font-bold text-slate-900 dark:text-white text-sm">
                        {formatPHP(unitPrice)}
                      </td>

                      <td className="p-3.5 space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono uppercase">
                          <ShieldCheck className="w-3 h-3" /> Pre-Approved
                        </span>
                        
                        {item.canvas_evidence_url && (
                          <div className="pt-0.5">
                            <a
                              href={item.canvas_evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 text-[10px] font-semibold"
                            >
                              <span>View Proof Quote</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}

                        {item.allowed_offices && item.allowed_offices.length > 0 ? (
                          <span className="text-[9px] text-slate-400 block truncate max-w-[150px]" title={item.allowed_offices.join(", ")}>
                            Restricted: {item.allowed_offices.join(", ")}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic block">Global Access</span>
                        )}
                      </td>

                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenAddModal(item)}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs text-xs ml-auto"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add to Proposal</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID VIEW (CARDS) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn">
          {filteredCatalog.map(item => {
            const unitPrice = parseFloat(item.standard_unit_cost || 0);

            return (
              <div 
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3.5 shadow-xs flex flex-col justify-between hover:border-blue-400 dark:hover:border-slate-700 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                      <Tag className="w-3 h-3 text-slate-400" />
                      <span>{getCategoryLabel(item.category)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 font-mono uppercase">
                      <ShieldCheck className="w-2.5 h-2.5" /> Approved
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-xs leading-snug">
                    {item.display_name}
                  </h3>

                  <div className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                    {formatPHP(unitPrice)}
                    <span className="text-[9.5px] font-normal text-slate-400 ml-1">/ unit</span>
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono select-all">
                    Key: <code>{item.item_key}</code>
                  </div>
                  {item.supplier_name && (
                    <div className="text-[10px] text-slate-500">Supplier: {item.supplier_name}</div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  {item.canvas_evidence_url && (
                    <a
                      href={item.canvas_evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1 text-[10px]"
                    >
                      <span>Inspect Quotation Evidence</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenAddModal(item)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add to Proposal</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: DIRECT "ADD TO PROPOSAL" INTAKE DIALOG */}
      {activeModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Add Catalog Item to Resource Proposals</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  Cycle: FY {activeCycle} &bull; Pre-Approved Pricing
                </span>
              </div>
              <button 
                type="button" 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Catalog Summary Box */}
            <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs">{activeModalItem.display_name}</h4>
                  <span className="text-[10px] text-slate-400 font-mono">Catalog Key: {activeModalItem.item_key}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold uppercase font-mono">
                  Pre-Approved
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200 dark:border-slate-850 font-mono">
                <span className="text-slate-500">Maximum Approved Unit Price:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatPHP(activeModalItem.standard_unit_cost)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitProposal} className="space-y-4 text-xs">
              
              {/* Multi-Year Target Quantities */}
              <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span>Target Planning Quantities ({activeYears.length} Years Horizon)</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono font-bold">
                    Total Units: {modalTotalQty}
                  </span>
                </div>

                <div 
                  className="grid gap-2 pt-1"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(activeYears.length, 3)}, minmax(0, 1fr))`
                  }}
                >
                  {activeYears.map((yr, idx) => (
                    <div key={yr} className="space-y-1">
                      <label className="text-[9.5px] font-semibold text-slate-600 dark:text-slate-400 block font-mono">
                        Year {idx + 1} (FY {yr})
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={modalQuantities[String(yr)] ?? 0}
                        onChange={e => handleModalQuantityChange(yr, e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono text-center font-bold outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Estimated Cost Live Meter */}
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl flex items-center justify-between font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Outlay Commitment</span>
                  <span className="text-[9px] text-slate-400">{modalTotalQty} units &times; {formatPHP(activeModalItem.standard_unit_cost)}</span>
                </div>
                <span className="text-base font-bold text-blue-700 dark:text-blue-300">
                  {formatPHP(modalTotalCost)}
                </span>
              </div>

              {/* Provenance: Link to Department Needs Assessment */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Link to Department Needs Assessment (Section 8.0)</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Optional</span>
                </label>
                <select
                  value={modalNeedsId}
                  onChange={e => {
                    const id = e.target.value;
                    setModalNeedsId(id);
                    const matched = needsAssessments.find(n => String(n.id) === id);
                    if (matched && !modalJustification) {
                      setModalJustification(`[Justified by Needs Assessment]: ${matched.current_problem}`);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer text-xs focus:border-blue-500 font-semibold"
                >
                  <option value="">-- None / Standalone Line Item --</option>
                  {needsAssessments.map(n => (
                    <option key={n.id} value={String(n.id)}>
                      [{n.mfo_alignment || "Program"}] {n.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Justification */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">
                  Specific Technical Rationale / Workload Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={modalJustification}
                  onChange={e => setModalJustification(e.target.value)}
                  placeholder="Operational justification for requested physical quantities..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none leading-relaxed text-xs"
                />
              </div>

              {/* Expansion Project Checkbox */}
              <label className="flex items-center gap-2.5 p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalIsExpansion}
                  onChange={e => setModalIsExpansion(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">
                    Expansion Project (New Capacity)
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Check if adding new capacity rather than replacing retired End-of-Life (EOL) hardware.
                  </span>
                </div>
              </label>

              {/* Modal Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting || modalTotalQty === 0}
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{modalSubmitting ? "Adding to Proposals..." : "Add to Proposals Queue"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}