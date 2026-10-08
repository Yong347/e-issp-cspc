// frontend/src/views/department/Inventory/InventoryManager.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getInventory, 
  getProposals, 
  uploadUnserviceableReport 
} from "../../../api/dept";
import { 
  Database, 
  RefreshCw, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  UploadCloud, 
  HardDrive, 
  Coins, 
  FileText, 
  ExternalLink, 
  Info, 
  Search, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  Tag, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  CheckSquare, 
  ShieldCheck, 
  Layers, 
  Building, 
  Filter 
} from "lucide-react";

// Standard Asset Categories (DICT Annex 1 Standard)
const STANDARD_EQUIPMENT_CATEGORIES = [
  "Servers",
  "Desktop",
  "Laptop",
  "Mobile Phone",
  "Tablet",
  "Printer",
  "Network Switch",
  "Others (ICT Equipment)"
];

const STANDARD_SOFTWARE_CATEGORIES = [
  "Office Productivity Tool",
  "Grammar checker",
  "Graphics and Simulation Software",
  "Antivirus",
  "IT Help Desk Tool",
  "Photo and Video Editing Software",
  "Web Application Firewall",
  "Others (ICT Software)"
];

const resolveCategoryString = (category) => {
  if (!category) return "";
  if (typeof category === "object" && category !== null && category.value) {
    return String(category.value);
  }
  return String(category);
};

export default function InventoryManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  // Data States
  const [inventory, setInventory] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // all, hardware, software, eol, available_eol, claimed_eol, obsolete, condemned, backup
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // IIRUP Upload Modal State
  const [activeReportAsset, setActiveReportAsset] = useState(null);
  const [reportFile, setReportFile] = useState(null);
  const [uploadingReport, setUploadingReport] = useState(false);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isObsolete = (dateString) => {
    if (!dateString) return false;
    const acqDate = new Date(dateString);
    if (isNaN(acqDate.getTime())) return false;
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    return acqDate < threeYearsAgo;
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invData, propData] = await Promise.all([
        getInventory({ limit: 1000 }),
        getProposals({ issp_period: activeCycle, limit: 1000 }).catch(() => [])
      ]);
      setInventory(Array.isArray(invData) ? invData : []);
      setProposals(Array.isArray(propData) ? propData : []);
    } catch (err) {
      setError(err.message || "Failed to load departmental baseline inventory.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle]);

  useEffect(() => {
    if (user?.token) {
      loadData();
    }
  }, [user, activeCycle, loadData]);

  const handleUploadIirupReport = async (e) => {
    e.preventDefault();
    if (!reportFile || !activeReportAsset) return;
    setError(null);
    setSuccess(null);
    setUploadingReport(true);

    try {
      await uploadUnserviceableReport(activeReportAsset.id, reportFile);
      setSuccess(`COA Inspection Report (IIRUP) linked to '${activeReportAsset.item_name}'.`);
      setActiveReportAsset(null);
      setReportFile(null);
      loadData();
    } catch (err) {
      setError(err.message || "Failed to upload inspection report.");
    } finally {
      setUploadingReport(false);
    }
  };

  // Helper: Evaluates whether an item qualifies as End of Life (EOL) or depreciated
  const isItemEolOrDepreciated = (item) => {
    const statusVal = resolveCategoryString(item.status).toLowerCase();
    return !item.is_software && (
      Boolean(item.is_end_of_life) || 
      statusVal === "condemned" || 
      statusVal === "needs repair" || 
      statusVal === "unserviceable" ||
      isObsolete(item.date_acquired)
    );
  };

  // Helper: Unconsumed EOL assets (NOT yet claimed by any replacement proposal)
  const isItemUnconsumedEol = (item) => {
    return isItemEolOrDepreciated(item) && !item.replacement_proposal_id;
  };

  // Helper: Lookup proposal title consumed by replacement_proposal_id
  const getProposalTitle = useCallback((proposalId) => {
    if (!proposalId) return null;
    const found = proposals.find(p => String(p.id) === String(proposalId));
    return found ? found.item_name : null;
  }, [proposals]);

  // Aggregated EOL counts per Standard Equipment Category
  const eolByCategory = useMemo(() => {
    return STANDARD_EQUIPMENT_CATEGORIES.reduce((acc, cat) => {
      const isOthers = cat.startsWith("Others");
      const unconsumed = inventory
        .filter(i => {
          if (!isItemUnconsumedEol(i)) return false;
          const dictCat = resolveCategoryString(i.dict_category);
          if (dictCat) {
            return isOthers ? dictCat.startsWith("Others") : dictCat === cat;
          }
          return isOthers
            ? !STANDARD_EQUIPMENT_CATEGORIES.slice(0, -1).some(c => (i.item_name || "").toLowerCase().includes(c.toLowerCase()))
            : (i.item_name || "").toLowerCase().includes(cat.toLowerCase());
        })
        .reduce((sum, i) => sum + (i.quantity || 1), 0);

      const total = inventory
        .filter(i => {
          if (!isItemEolOrDepreciated(i)) return false;
          const dictCat = resolveCategoryString(i.dict_category);
          if (dictCat) {
            return isOthers ? dictCat.startsWith("Others") : dictCat === cat;
          }
          return isOthers
            ? !STANDARD_EQUIPMENT_CATEGORIES.slice(0, -1).some(c => (i.item_name || "").toLowerCase().includes(c.toLowerCase()))
            : (i.item_name || "").toLowerCase().includes(cat.toLowerCase());
        })
        .reduce((sum, i) => sum + (i.quantity || 1), 0);

      acc[cat] = { unconsumed, total, consumed: total - unconsumed };
      return acc;
    }, {});
  }, [inventory]);

  const isFilteredToEquipmentCategory = categoryFilter !== "All" && STANDARD_EQUIPMENT_CATEGORIES.includes(categoryFilter);

  // Available (unconsumed) EOL hardware units that can legally justify NEW replacement proposals
  const availableEolUnits = isFilteredToEquipmentCategory
    ? (eolByCategory[categoryFilter]?.unconsumed || 0)
    : inventory.filter(isItemUnconsumedEol).reduce((sum, i) => sum + (i.quantity || 1), 0);

  // Total EOL units recorded across Inventory
  const totalEolUnits = isFilteredToEquipmentCategory
    ? (eolByCategory[categoryFilter]?.total || 0)
    : inventory.filter(isItemEolOrDepreciated).reduce((sum, i) => sum + (i.quantity || 1), 0);

  // Already claimed/consumed EOL units
  const consumedEolUnits = totalEolUnits - availableEolUnits;

  // Active replacement units currently requested in proposals
  const replacementRequestedUnits = proposals
    .filter(p => {
      const isOfficeProd = (p.strategic_category || "").toLowerCase() === "office productivity";
      if (!isOfficeProd || p.is_expansion || p.created_by_students || p.is_in_house_turnover) return false;
      if (isFilteredToEquipmentCategory) {
        const catLower = categoryFilter.toLowerCase().replace("others (ict equipment)", "others");
        const nameLower = (p.item_name || "").toLowerCase();
        return nameLower.includes(catLower);
      }
      return true;
    })
    .reduce((sum, p) => sum + (p.total_qty || p.year_1_qty || 0), 0);

  // Obsolescence is justified if total available unconsumed EOL >= replacement requests
  const isObsolescenceJustified = availableEolUnits >= replacementRequestedUnits;

  // General Inventory KPIs
  const totalUnits = inventory.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const totalHardwareVal = inventory.reduce((sum, i) => sum + ((parseFloat(i.acquired_price) || 0) * (i.quantity || 1)), 0);
  const operationalUnits = inventory.filter(i => !i.is_end_of_life && resolveCategoryString(i.status).toLowerCase() === "functional").reduce((sum, i) => sum + (i.quantity || 1), 0);

  // Filtering Pipeline
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const statusVal = resolveCategoryString(item.status).toLowerCase();

      // Type Filter
      if (filterType === "hardware" && item.is_software) return false;
      if (filterType === "software" && !item.is_software) return false;
      if (filterType === "eol" && !isItemEolOrDepreciated(item)) return false;
      if (filterType === "available_eol" && !isItemUnconsumedEol(item)) return false;
      if (filterType === "claimed_eol" && (!isItemEolOrDepreciated(item) || !item.replacement_proposal_id)) return false;
      if (filterType === "backup" && !item.is_backup) return false;
      if (filterType === "obsolete" && !isObsolete(item.date_acquired)) return false;
      if (filterType === "condemned" && statusVal !== "condemned") return false;

      // Category Filter
      if (categoryFilter !== "All") {
        const isOthers = categoryFilter.startsWith("Others");
        const dictCat = resolveCategoryString(item.dict_category);
        if (dictCat) {
          const match = isOthers ? dictCat.startsWith("Others") : dictCat === categoryFilter;
          if (!match) return false;
        } else {
          const catClean = categoryFilter.toLowerCase();
          const nameClean = (item.item_name || "").toLowerCase();
          if (isOthers) {
            const matchedAnyStd = [...STANDARD_EQUIPMENT_CATEGORIES.slice(0, -1), ...STANDARD_SOFTWARE_CATEGORIES.slice(0, -1)]
              .some(c => nameClean.includes(c.toLowerCase()));
            if (matchedAnyStd) return false;
          } else if (!nameClean.includes(catClean)) {
            return false;
          }
        }
      }

      // Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = (item.item_name || "").toLowerCase().includes(q);
        const matchesModel = (item.exact_model || "").toLowerCase().includes(q);
        const matchesSpecs = (item.specs || "").toLowerCase().includes(q);
        const matchesCategory = resolveCategoryString(item.dict_category).toLowerCase().includes(q);
        const matchesOther = (item.other_category_name || "").toLowerCase().includes(q);
        if (!matchesName && !matchesModel && !matchesSpecs && !matchesCategory && !matchesOther) return false;
      }

      return true;
    });
  }, [inventory, filterType, categoryFilter, searchTerm]);

  // Pagination Slice
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages) || 1;
  const paginatedInventory = filteredInventory.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto font-sans select-none transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-serif font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Department ICT Asset Inventory &amp; Obsolescence Audit</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              {user?.department_name || "Department Registry"} &bull; FY {activeCycle}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Audit localized equipment conditions by standard categories, attach COA Unserviceable Property Inspection Reports (IIRUP), and verify hardware replacement quotas for equipment requests.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 self-start cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Inventory</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button 
            type="button"
            onClick={() => setError(null)} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSuccess(null)} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DBM Obsolescence Counter Banner */}
      <div className={`p-6 rounded-2xl border flex flex-col gap-4 transition-all shadow-xs ${
        isObsolescenceJustified 
          ? "bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" 
          : "bg-amber-50 dark:bg-amber-955/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300"
      }`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-start gap-3.5">
            {isObsolescenceJustified ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {isObsolescenceJustified 
                    ? "Replacement Quota Fully Justified by Asset Inventory" 
                    : "DBM Hardware Obsolescence Discrepancy Warning"}
                </h4>
                {isFilteredToEquipmentCategory && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    Category: {categoryFilter}
                  </span>
                )}
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed max-w-3xl">
                {isObsolescenceJustified 
                  ? `Your department has recorded ${availableEolUnits} available unconsumed End-of-Life (EOL), condemned, or depreciated (>3 yrs) units ${isFilteredToEquipmentCategory ? `for [${categoryFilter}]` : "across all equipment"} in your asset inventory. This fully justifies the ${replacementRequestedUnits} replacement units requested in resource proposals.`
                  : `Your department has requested ${replacementRequestedUnits} replacement units in proposals ${isFilteredToEquipmentCategory ? `under [${categoryFilter}]` : ""}, but the inventory records only ${availableEolUnits} available unconsumed EOL/condemned assets (${consumedEolUnits} units already claimed by active proposals). Under DBM standards, uncataloged additions must be marked as "Expansion Projects" in your proposals.`}
              </p>
            </div>
          </div>

          {/* Quota Indicators */}
          <div className="flex items-center gap-4 shrink-0 font-mono text-right bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Available EOL</span>
              <span className="font-bold text-slate-900 dark:text-white text-base">{availableEolUnits}</span>
              {consumedEolUnits > 0 && (
                <span className="text-[8.5px] text-purple-600 dark:text-purple-400 block">({consumedEolUnits} Claimed)</span>
              )}
            </div>
            <span className="text-slate-400 dark:text-slate-500 text-lg">/</span>
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Replacement Requests</span>
              <span className={`font-bold text-base ${isObsolescenceJustified ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {replacementRequestedUnits}
              </span>
            </div>
            <Link
              to="/dept/proposals"
              className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs"
              title="Review Resource Proposals"
            >
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Equipment EOL Category Breakdown Tags */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="text-slate-500 dark:text-slate-400 uppercase font-bold text-[9px] mr-1 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>Available EOL by Category:</span>
          </span>
          {STANDARD_EQUIPMENT_CATEGORIES.map(cat => {
            const counts = eolByCategory[cat] || { unconsumed: 0, total: 0, consumed: 0 };
            const isSelected = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(isSelected ? "All" : cat);
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded-md border text-[9.5px] transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 font-bold"
                    : counts.unconsumed > 0
                    ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-400"
                    : "bg-slate-100 dark:bg-slate-955 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800"
                }`}
              >
                {cat.replace(" (ICT Equipment)", "")}: <strong>{counts.unconsumed}</strong>
                {counts.consumed > 0 && <span className="opacity-60 ml-0.5">({counts.total})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Aggregate KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Department Assets</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalUnits.toLocaleString()} units</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Operational In-Service</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{operationalUnits.toLocaleString()} units</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Depreciated (&gt;3 Yrs Old)</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {inventory.filter(i => isObsolete(i.date_acquired)).reduce((s, i) => s + (i.quantity || 1), 0)} units
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Historical Acquisition Cost</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{formatPHP(totalHardwareVal)}</h3>
          </div>
        </div>
      </div>

      {/* Main Department Inventory Directory */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
        
        {/* Governance Information Callout Banner */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <span>
            <strong>Institutional Custody Standard:</strong> Master ICT asset records are officially logged and categorized by the <strong>Supply and Property Management Office</strong> according to standard asset categories. Departments inspect assigned inventory here to attach COA unserviceable inspection reports (IIRUP) and audit hardware replacement justifications.
          </span>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl">
            {[
              { id: "all", label: "All Items" },
              { id: "hardware", label: "Hardware" },
              { id: "software", label: "Software" },
              { id: "available_eol", label: "Available EOL" },
              { id: "claimed_eol", label: "Claimed EOL" },
              { id: "eol", label: "All EOL" },
              { id: "obsolete", label: ">3 Yrs Old" },
              { id: "condemned", label: "Condemned" },
              { id: "backup", label: "Backups" }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilterType(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold text-[10px] cursor-pointer transition-all ${
                  filterType === tab.id 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={categoryFilter}
                onChange={e => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none text-xs max-w-[190px]"
              >
                <option value="All">All Standard Categories</option>
                <optgroup label="1. ICT Equipment Inventory">
                  {STANDARD_EQUIPMENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </optgroup>
                <optgroup label="2. ICT Software Inventory">
                  {STANDARD_SOFTWARE_CATEGORIES.map(scat => (
                    <option key={scat} value={scat}>{scat}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search asset, model, specs..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 placeholder-slate-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Querying department baseline inventory...</span>
            </div>
          ) : paginatedInventory.length > 0 ? (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px] tracking-wider font-mono">
                  <th className="p-3.5 w-60">Asset Description &amp; Standard Category</th>
                  <th className="p-3.5">Deployment Site</th>
                  <th className="p-3.5">Condition &amp; Status</th>
                  <th className="p-3.5">Replacement Quota State</th>
                  <th className="p-3.5">Acquisition Details</th>
                  <th className="p-3.5 text-right">Count</th>
                  <th className="p-3.5 text-center">IIRUP Inspection Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {paginatedInventory.map(item => {
                  const obsolete = isObsolete(item.date_acquired);
                  const statusVal = resolveCategoryString(item.status);
                  const statusLower = statusVal.toLowerCase();
                  const isCondemned = statusLower === "condemned";
                  const isClaimed = Boolean(item.replacement_proposal_id);
                  const isAvailableEol = isItemUnconsumedEol(item);
                  const proposalConsumedTitle = getProposalTitle(item.replacement_proposal_id);

                  // Condition badge style resolution
                  const conditionBadgeClass = item.is_software
                    ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                    : statusLower === "functional"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                    : statusLower === "needs repair"
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20";

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{item.item_name}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700">
                            {resolveCategoryString(item.dict_category) || (item.is_software ? "Software" : "Hardware")}
                          </span>
                          {item.other_category_name && (
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono italic">
                              ({item.other_category_name})
                            </span>
                          )}
                          {item.exact_model && (
                            <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono">
                              {item.exact_model}
                            </span>
                          )}
                        </div>

                        {item.specs && (
                          <div className="text-[9.5px] text-slate-400 dark:text-slate-500 italic truncate max-w-xs mt-0.5" title={item.specs}>
                            {item.specs}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                          {item.is_central_office ? "Central Office" : "Regional / Field Campus"}
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                          {item.office_location || "Central Office"}
                        </span>
                      </td>

                      <td className="p-3.5 space-y-1">
                        <div className="flex flex-wrap gap-1 font-mono">
                          <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase border ${conditionBadgeClass}`}>
                            {item.is_software ? (item.is_perpetual ? "Perpetual" : "Subscription") : statusVal}
                          </span>

                          {item.is_end_of_life && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[8.5px] font-bold uppercase">
                              EOL
                            </span>
                          )}

                          {item.is_backup && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 text-[8.5px] font-bold uppercase">
                              Backup
                            </span>
                          )}

                          {obsolete && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[8.5px] font-bold uppercase">
                              &gt;3 Yrs Old
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Replacement Quota State (Anti-Loop Audit) */}
                      <td className="p-3.5">
                        {isClaimed ? (
                          <div className="space-y-0.5 font-mono">
                            <span className="inline-block px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 text-[8.5px] font-bold uppercase">
                              Claimed by Proposal
                            </span>
                            {proposalConsumedTitle ? (
                              <span className="text-[9px] text-purple-600 dark:text-purple-400 font-bold block truncate max-w-[130px]" title={proposalConsumedTitle}>
                                {proposalConsumedTitle}
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block truncate max-w-[120px]" title={item.replacement_proposal_id}>
                                ID: {String(item.replacement_proposal_id).slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        ) : isAvailableEol ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[8.5px] font-bold uppercase font-mono">
                            Available for Replacement
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 font-mono text-[9.5px]">In-Service</span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                        <div>{formatPHP(item.acquired_price)} / unit</div>
                        <div className="text-[9.5px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{item.date_acquired ? new Date(item.date_acquired).toLocaleDateString() : "N/A"}</span>
                        </div>
                      </td>

                      <td className="p-3.5 text-right font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                        {item.quantity}
                      </td>

                      {/* COA IIRUP Report View / Upload */}
                      <td className="p-3.5 text-center">
                        {item.unserviceable_report_url ? (
                          <a
                            href={item.unserviceable_report_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold text-[10px]"
                          >
                            <FileText className="w-3 h-3" />
                            <span>View IIRUP</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          (isCondemned || item.is_end_of_life || statusLower === "needs repair") ? (
                            <button
                              type="button"
                              onClick={() => setActiveReportAsset(item)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[9px] font-bold uppercase cursor-pointer transition-colors"
                            >
                              Upload IIRUP
                            </button>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] font-mono">-</span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
              No departmental inventory assets match your active filter criteria.
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Showing page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong> ({filteredInventory.length} records)
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1 px-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1 px-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: UPLOAD COA IIRUP REPORT */}
      {activeReportAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Upload Unserviceable Report</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Asset: {activeReportAsset.item_name}</span>
              </div>
              <button 
                type="button"
                onClick={() => { setActiveReportAsset(null); setReportFile(null); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadIirupReport} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  COA Inspection &amp; Inventory Appraisal Report (IIRUP PDF)
                </label>
                <input
                  type="file"
                  required
                  accept="application/pdf"
                  onChange={e => setReportFile(e.target.files[0])}
                  className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 leading-normal">
                Attaching an approved IIRUP justifies replacement funding under DBM guidelines for equipment proposals.
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setActiveReportAsset(null); setReportFile(null); }}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl cursor-pointer text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingReport || !reportFile}
                  className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs transition-all"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{uploadingReport ? "Uploading..." : "Link IIRUP Report"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}