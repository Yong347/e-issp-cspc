// frontend/src/views/admin/Governance/CategorizationManager.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getStrategicCategories, 
  createStrategicCategory, 
  updateStrategicCategory, 
  deleteStrategicCategory,
  getUacsCatalog, 
  createUacsEntry, 
  updateUacsEntry, 
  deleteUacsEntry,
  getFundSources, 
  createFundSource, 
  deleteFundSource,
  getDevelopmentStrategies, 
  createDevelopmentStrategy, 
  deleteDevelopmentStrategy,
  getHarmonizationCriteria, 
  createHarmonizationCriterion, 
  updateHarmonizationCriterion,
  deleteHarmonizationCriterion,
  getPolicySettings, 
  updatePolicySettings,
  getInflationSettings,
  updateInflationSettings
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  Tag, 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  Search, 
  X, 
  Save, 
  AlertCircle, 
  CheckCircle, 
  Coins, 
  Landmark, 
  Database, 
  Sliders, 
  RotateCcw, 
  Sparkles,
  SlidersHorizontal,
  Filter,
  Info
} from "lucide-react";

export default function CategorizationManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();

  // Active Navigation Tab: "uacs" | "strategic" | "funds" | "strategies" | "harmonization" | "thresholds"
  const [activeTab, setActiveTab] = useState("uacs");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // -------------------------------------------------------------------------
  // 1. UACS CATALOG STATE
  // -------------------------------------------------------------------------
  const [uacsList, setUacsList] = useState([]);
  const [uacsClassFilter, setUacsClassFilter] = useState("All");
  const [newUacsCode, setNewUacsCode] = useState("");
  const [newUacsTitle, setNewUacsTitle] = useState("");
  const [newUacsClass, setNewUacsClass] = useState("Capital Outlay");
  const [newUacsIsSub, setNewUacsIsSub] = useState(false);
  const [newUacsDesc, setNewUacsDesc] = useState("");

  // UACS Edit Modal State
  const [editingUacs, setEditingUacs] = useState(null);
  const [editUacsCode, setEditUacsCode] = useState("");
  const [editUacsTitle, setEditUacsTitle] = useState("");
  const [editUacsClass, setEditUacsClass] = useState("Capital Outlay");
  const [editUacsIsSub, setEditUacsIsSub] = useState(false);
  const [editUacsDesc, setEditUacsDesc] = useState("");

  // -------------------------------------------------------------------------
  // 2. STRATEGIC CATEGORIES STATE
  // -------------------------------------------------------------------------
  const [strategicCategories, setStrategicCategories] = useState([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatCode, setNewCatCode] = useState("");
  const [newCatIsProject, setNewCatIsProject] = useState(false);
  const [newCatIsRecurring, setNewCatIsRecurring] = useState(false);
  const [newCatDesc, setNewCatDesc] = useState("");

  // Strategic Category Edit Modal State
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatCode, setEditCatCode] = useState("");
  const [editCatIsProject, setEditCatIsProject] = useState(false);
  const [editCatIsRecurring, setEditCatIsRecurring] = useState(false);
  const [editCatDesc, setEditCatDesc] = useState("");

  // -------------------------------------------------------------------------
  // 3. FUND SOURCES STATE
  // -------------------------------------------------------------------------
  const [fundSources, setFundSources] = useState([]);
  const [newFundName, setNewFundName] = useState("");
  const [newFundCode, setNewFundCode] = useState("");
  const [newFundDesc, setNewFundDesc] = useState("");

  // -------------------------------------------------------------------------
  // 4. DEVELOPMENT STRATEGIES STATE
  // -------------------------------------------------------------------------
  const [strategies, setStrategies] = useState([]);
  const [newStratName, setNewStratName] = useState("");
  const [newStratCode, setNewStratCode] = useState("");
  const [newStratDesc, setNewStratDesc] = useState("");

  // -------------------------------------------------------------------------
  // 5. HARMONIZATION CRITERIA STATE
  // -------------------------------------------------------------------------
  const [harmonizationList, setHarmonizationList] = useState([]);
  const [newHarmName, setNewHarmName] = useState("");
  const [newHarmMandatory, setNewHarmMandatory] = useState(false);
  const [newHarmDesc, setNewHarmDesc] = useState("");

  // Harmonization Edit Modal State
  const [editingHarm, setEditingHarm] = useState(null);
  const [editHarmName, setEditHarmName] = useState("");
  const [editHarmMandatory, setEditHarmMandatory] = useState(false);
  const [editHarmDesc, setEditHarmDesc] = useState("");

  // -------------------------------------------------------------------------
  // 6. POLICY SETTINGS & MULTI-YEAR INFLATION RATES STATE
  // -------------------------------------------------------------------------
  const [policySettings, setPolicySettings] = useState({
    capitalization_threshold: 50000.00,
    major_outlay_review_threshold: 2000000.00,
    hardware_replacement_buffer_units: 3,
    canvas_expiration_warning_days: 14
  });

  const [inflationRates, setInflationRates] = useState({});

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "") || "";

  // Dynamic derivation of active cycle years (handles arbitrary 1 to N-year spans)
  const cycleYears = useMemo(() => {
    if (planningYears && planningYears.length > 0) return planningYears;
    if (!activeCycle || !activeCycle.includes("-")) {
      const currentYear = new Date().getFullYear();
      return [currentYear, currentYear + 1, currentYear + 2];
    }
    const parts = activeCycle.split("-");
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    if (isNaN(start) || isNaN(end) || start > end) return [2026, 2027, 2028];
    const yrs = [];
    for (let y = start; y <= end; y++) {
      yrs.push(y);
    }
    return yrs;
  }, [planningYears, activeCycle]);

  // Load All Categorization Data via API Client
  const loadAllCategorizations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [uacsData, catData, fundData, stratData, harmData, policyData, inflationData] = await Promise.all([
        getUacsCatalog(token).catch(() => []),
        getStrategicCategories(token).catch(() => []),
        getFundSources(token).catch(() => []),
        getDevelopmentStrategies(token).catch(() => []),
        getHarmonizationCriteria(token).catch(() => []),
        getPolicySettings(token).catch(() => null),
        getInflationSettings(token).catch(() => null)
      ]);

      setUacsList(Array.isArray(uacsData) ? uacsData : []);
      setStrategicCategories(Array.isArray(catData) ? catData : []);
      setFundSources(Array.isArray(fundData) ? fundData : []);
      setStrategies(Array.isArray(stratData) ? stratData : []);
      setHarmonizationList(Array.isArray(harmData) ? harmData : []);

      if (policyData && typeof policyData === "object") {
        setPolicySettings({
          capitalization_threshold: parseFloat(policyData.capitalization_threshold) || 50000.00,
          major_outlay_review_threshold: parseFloat(policyData.major_outlay_review_threshold) || 2000000.00,
          hardware_replacement_buffer_units: parseInt(policyData.hardware_replacement_buffer_units, 10) || 3,
          canvas_expiration_warning_days: parseInt(policyData.canvas_expiration_warning_days, 10) || 14
        });
      }

      if (inflationData && Array.isArray(inflationData.rates) && inflationData.rates.length > 0) {
        const rateMap = {};
        inflationData.rates.forEach(r => {
          rateMap[String(r.year)] = parseFloat(r.rate_percent) || 0.0;
        });
        setInflationRates(rateMap);
      } else if (policyData?.inflation_rates_by_year && typeof policyData.inflation_rates_by_year === "object") {
        setInflationRates(policyData.inflation_rates_by_year);
      } else {
        const defaultRates = {};
        cycleYears.forEach((yr, idx) => {
          defaultRates[String(yr)] = idx === 0 ? 0.0 : (idx === 1 ? 3.0 : 5.0);
        });
        setInflationRates(defaultRates);
      }
    } catch (err) {
      setError(err.message || "Failed to load system categorizations.");
    } finally {
      setLoading(false);
    }
  }, [token, cycleYears]);

  useEffect(() => {
    loadAllCategorizations();
  }, [loadAllCategorizations]);

  // =========================================================================
  // 1. UACS HANDLERS
  // =========================================================================
  const handleCreateUacs = async (e) => {
    e.preventDefault();
    if (!newUacsCode.trim() || !newUacsTitle.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createUacsEntry(token, {
        uacs_code: newUacsCode.trim(),
        account_title: newUacsTitle.trim(),
        expenditure_class: newUacsClass,
        is_subscription_default: newUacsIsSub,
        description: newUacsDesc.trim() || null
      });
      setSuccess(`UACS Code '${newUacsCode.trim()}' registered successfully.`);
      setNewUacsCode("");
      setNewUacsTitle("");
      setNewUacsDesc("");
      setNewUacsIsSub(false);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to register UACS code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditUacs = (item) => {
    setEditingUacs(item);
    setEditUacsCode(item.uacs_code || "");
    setEditUacsTitle(item.account_title || "");
    setEditUacsClass(item.expenditure_class || "Capital Outlay");
    setEditUacsIsSub(Boolean(item.is_subscription_default));
    setEditUacsDesc(item.description || "");
  };

  const handleUpdateUacs = async (e) => {
    e.preventDefault();
    if (!editingUacs || !editUacsTitle.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await updateUacsEntry(token, editingUacs.id, {
        account_title: editUacsTitle.trim(),
        expenditure_class: editUacsClass,
        is_subscription_default: editUacsIsSub,
        description: editUacsDesc.trim() || null
      });
      setSuccess(`UACS Code '${editingUacs.uacs_code}' updated successfully.`);
      setEditingUacs(null);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to update UACS entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUacs = async (id, code, title) => {
    if (!window.confirm(`Permanently remove UACS code '${code} - ${title}' from catalog?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteUacsEntry(token, id);
      setSuccess(`UACS code '${code}' deleted.`);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to delete UACS code.");
    }
  };

  // =========================================================================
  // 2. STRATEGIC CATEGORIES HANDLERS
  // =========================================================================
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const code = (newCatCode.trim() || newCatName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")).slice(0, 40);
      await createStrategicCategory(token, {
        name: newCatName.trim(),
        code: code,
        is_project_linked: newCatIsProject,
        is_recurring_expense: newCatIsRecurring,
        description: newCatDesc.trim() || null
      });
      setSuccess(`Strategic Category '${newCatName}' registered.`);
      setNewCatName("");
      setNewCatCode("");
      setNewCatDesc("");
      setNewCatIsProject(false);
      setNewCatIsRecurring(false);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to add category.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditCategory = (cat) => {
    setEditingCat(cat);
    setEditCatName(cat.name || "");
    setEditCatCode(cat.code || "");
    setEditCatIsProject(Boolean(cat.is_project_linked));
    setEditCatIsRecurring(Boolean(cat.is_recurring_expense));
    setEditCatDesc(cat.description || "");
  };

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    if (!editingCat || !editCatName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await updateStrategicCategory(token, editingCat.id, {
        name: editCatName.trim(),
        code: editCatCode.trim() || editingCat.code,
        is_project_linked: editCatIsProject,
        is_recurring_expense: editCatIsRecurring,
        description: editCatDesc.trim() || null
      });
      setSuccess(`Strategic Category '${editCatName}' updated successfully.`);
      setEditingCat(null);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to update category.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (!window.confirm(`Permanently remove strategic category '${name}'? This will fail if proposals are currently linked to it.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteStrategicCategory(token, id);
      setSuccess(`Category '${name}' deleted.`);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to delete category.");
    }
  };

  // =========================================================================
  // 3. FUND SOURCES HANDLERS
  // =========================================================================
  const handleCreateFundSource = async (e) => {
    e.preventDefault();
    if (!newFundName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const code = (newFundCode.trim() || newFundName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")).slice(0, 30);
      await createFundSource(token, {
        display_name: newFundName.trim(),
        code: code,
        description: newFundDesc.trim() || null
      });
      setSuccess(`Fund Source '${newFundName}' added.`);
      setNewFundName("");
      setNewFundCode("");
      setNewFundDesc("");
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to add fund source.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFundSource = async (code, name) => {
    if (!window.confirm(`Permanently remove fund source '${name}' (${code})?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteFundSource(token, code);
      setSuccess(`Fund Source '${name}' deleted.`);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to delete fund source.");
    }
  };

  // =========================================================================
  // 4. DEVELOPMENT STRATEGIES HANDLERS
  // =========================================================================
  const handleCreateStrategy = async (e) => {
    e.preventDefault();
    if (!newStratName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const code = (newStratCode.trim() || newStratName.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_")).slice(0, 30);
      await createDevelopmentStrategy(token, {
        display_name: newStratName.trim(),
        code: code,
        description: newStratDesc.trim() || null
      });
      setSuccess(`Development Strategy '${newStratName}' added.`);
      setNewStratName("");
      setNewStratCode("");
      setNewStratDesc("");
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to add development strategy.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStrategy = async (code, name) => {
    if (!window.confirm(`Permanently remove development strategy '${name}' (${code})?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteDevelopmentStrategy(token, code);
      setSuccess(`Development strategy '${name}' deleted.`);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to delete development strategy.");
    }
  };

  // =========================================================================
  // 5. HARMONIZATION FRAMEWORK HANDLERS
  // =========================================================================
  const handleCreateHarmonization = async (e) => {
    e.preventDefault();
    if (!newHarmName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createHarmonizationCriterion(token, {
        name: newHarmName.trim(),
        is_mandatory: newHarmMandatory,
        description: newHarmDesc.trim() || null
      });
      setSuccess(`Harmonization Criterion '${newHarmName}' added.`);
      setNewHarmName("");
      setNewHarmMandatory(false);
      setNewHarmDesc("");
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to add harmonization criterion.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditHarmonization = (item) => {
    setEditingHarm(item);
    setEditHarmName(item.name || item.criteria_name || "");
    setEditHarmMandatory(Boolean(item.is_mandatory));
    setEditHarmDesc(item.description || "");
  };

  const handleUpdateHarmonization = async (e) => {
    e.preventDefault();
    if (!editingHarm || !editHarmName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await updateHarmonizationCriterion(token, editingHarm.id, {
        name: editHarmName.trim(),
        is_mandatory: editHarmMandatory,
        description: editHarmDesc.trim() || null
      });
      setSuccess(`Harmonization Criterion '${editHarmName}' updated successfully.`);
      setEditingHarm(null);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to update criterion.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHarmonization = async (id, name) => {
    if (!window.confirm(`Permanently remove harmonization criterion '${name}'?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteHarmonizationCriterion(token, id);
      setSuccess(`Harmonization criterion '${name}' deleted.`);
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to delete criterion.");
    }
  };

  // =========================================================================
  // 6. POLICY THRESHOLDS & INFLATION HANDLERS
  // =========================================================================
  const applyInflationPreset = (preset) => {
    const updatedRates = {};
    cycleYears.forEach((yr, idx) => {
      if (idx === 0) {
        updatedRates[String(yr)] = 0.0;
      } else if (preset === "dict") {
        // DICT ISSP Guidelines: 3.0% Year 2, 5.0% Year 3, +2.0%/yr thereafter
        updatedRates[String(yr)] = idx === 1 ? 3.0 : (idx === 2 ? 5.0 : 5.0 + (idx - 2) * 2.0);
      } else if (preset === "flat4") {
        updatedRates[String(yr)] = idx * 4.0;
      } else if (preset === "zero") {
        updatedRates[String(yr)] = 0.0;
      }
    });
    setInflationRates(updatedRates);
    setSuccess(`Applied ${preset === 'dict' ? 'DICT Standard (3%/5%/+2%)' : preset === 'flat4' ? 'Flat 4%/yr' : '0% No Buffer'} preset.`);
  };

  const handleSavePolicySettings = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const cleanRates = {};
    Object.entries(inflationRates).forEach(([k, v]) => {
      cleanRates[String(k)] = parseFloat(v) || 0.0;
    });

    try {
      await Promise.all([
        updatePolicySettings(token, policySettings),
        updateInflationSettings(token, { rates: cleanRates })
      ]);
      setSuccess("Capitalization thresholds and multi-year inflation buffer settings saved successfully.");
      loadAllCategorizations();
    } catch (err) {
      setError(err.message || "Failed to update policy settings.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPolicyDefaults = () => {
    setPolicySettings({
      capitalization_threshold: 50000.00,
      major_outlay_review_threshold: 2000000.00,
      hardware_replacement_buffer_units: 3,
      canvas_expiration_warning_days: 14
    });
    const defaultRates = {};
    cycleYears.forEach((yr, idx) => {
      defaultRates[String(yr)] = idx === 0 ? 0.0 : (idx === 1 ? 3.0 : 5.0);
    });
    setInflationRates(defaultRates);
    setSuccess("Restored statutory DBM & DICT default policy values. Click 'Save Parameters' to commit.");
  };

  // -------------------------------------------------------------------------
  // FILTERED LISTS ACROSS TABS
  // -------------------------------------------------------------------------
  const filteredUacs = useMemo(() => {
    return uacsList.filter(item => {
      if (uacsClassFilter !== "All" && item.expenditure_class !== uacsClassFilter) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      return (
        (item.uacs_code || "").toLowerCase().includes(q) ||
        (item.account_title || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q)
      );
    });
  }, [uacsList, uacsClassFilter, searchTerm]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return strategicCategories;
    const q = searchTerm.toLowerCase().trim();
    return strategicCategories.filter(cat => 
      (cat.name || "").toLowerCase().includes(q) ||
      (cat.code || "").toLowerCase().includes(q) ||
      (cat.description || "").toLowerCase().includes(q)
    );
  }, [strategicCategories, searchTerm]);

  const filteredFunds = useMemo(() => {
    if (!searchTerm.trim()) return fundSources;
    const q = searchTerm.toLowerCase().trim();
    return fundSources.filter(f => 
      (f.display_name || "").toLowerCase().includes(q) ||
      (f.code || "").toLowerCase().includes(q) ||
      (f.description || "").toLowerCase().includes(q)
    );
  }, [fundSources, searchTerm]);

  const filteredStrategies = useMemo(() => {
    if (!searchTerm.trim()) return strategies;
    const q = searchTerm.toLowerCase().trim();
    return strategies.filter(s => 
      (s.display_name || "").toLowerCase().includes(q) ||
      (s.code || "").toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q)
    );
  }, [strategies, searchTerm]);

  const filteredHarmonization = useMemo(() => {
    if (!searchTerm.trim()) return harmonizationList;
    const q = searchTerm.toLowerCase().trim();
    return harmonizationList.filter(h => 
      (h.name || h.criteria_name || "").toLowerCase().includes(q) ||
      (h.description || "").toLowerCase().includes(q)
    );
  }, [harmonizationList, searchTerm]);

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans transition-colors duration-200">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>System Categorizations, Taxonomies &amp; UACS Catalog</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Governance Engine &bull; FY {activeCycle}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Centralized governance console for all procurement parameters. Configure <strong>UACS Object Codes</strong>, <strong>Strategic Spending Categories</strong>, <strong>Fund Sources</strong>, <strong>Development Strategies</strong>, <strong>Harmonization Criteria</strong>, and <strong>Multi-Year Inflation Buffers</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CompilerSyncButton 
            moduleName="budget" 
            activeCycle={activeCycle} 
            token={token} 
            onSaveAndSync={loadAllCategorizations}
            label="Save &amp; Verify Compiler Pipeline"
          />
          <button
            type="button"
            onClick={loadAllCategorizations}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 font-bold transition-colors cursor-pointer text-xs"
            title="Reload all master categorizations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <span className="leading-relaxed whitespace-pre-wrap">{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-0.5"><X className="w-4 h-4" /></button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start justify-between gap-2 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <span className="leading-relaxed">{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-0.5"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs self-start">
        {[
          { id: "uacs", label: `UACS Object Codes (${uacsList.length})`, icon: <Coins className="w-3.5 h-3.5" /> },
          { id: "strategic", label: `Strategic Categories (${strategicCategories.length})`, icon: <Tag className="w-3.5 h-3.5" /> },
          { id: "funds", label: `Fund Sources (${fundSources.length})`, icon: <Landmark className="w-3.5 h-3.5" /> },
          { id: "strategies", label: `Development Strategies (${strategies.length})`, icon: <Database className="w-3.5 h-3.5" /> },
          { id: "harmonization", label: `Harmonization Framework (${harmonizationList.length})`, icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: "thresholds", label: "Statutory Thresholds & Inflation", icon: <Sliders className="w-3.5 h-3.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setSearchTerm(""); }}
            className={`px-4 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ============================================================= */}
      {/* TAB 1: UACS OBJECT CODES                                      */}
      {/* ============================================================= */}
      {activeTab === "uacs" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Coins className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>UACS Object Code &amp; Expenditure Class Catalog (Table B.4 &amp; B.3)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Every resource proposal line item is tagged to an Object Code by the Admin. This code determines whether it counts as <strong>Capital Outlay (CO)</strong> or <strong>MOOE</strong> in Part IV.B.
              </p>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-slate-700 dark:text-slate-300">
              {uacsList.length} Registered Accounts
            </span>
          </div>

          <form onSubmit={handleCreateUacs} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
              + Register New UACS Object Code
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                required
                placeholder="UACS Code (e.g. 50604050 03)"
                value={newUacsCode}
                onChange={e => setNewUacsCode(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
              />
              <input
                type="text"
                required
                placeholder="Account Title (e.g. ICT Equipment)"
                value={newUacsTitle}
                onChange={e => setNewUacsTitle(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs sm:col-span-2 text-slate-900 dark:text-white outline-none focus:border-blue-500 font-semibold"
              />
              <select
                value={newUacsClass}
                onChange={e => setNewUacsClass(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none cursor-pointer font-semibold"
              >
                <option value="Capital Outlay">Capital Outlay (CO)</option>
                <option value="Maintenance and Other Operating Expenses">MOOE Services</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Description / Accounting Guidelines (Optional)..."
                value={newUacsDesc}
                onChange={e => setNewUacsDesc(e.target.value)}
                className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs sm:col-span-2 text-slate-900 dark:text-white outline-none"
              />

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newUacsIsSub}
                    onChange={e => setNewUacsIsSub(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Default for Subscriptions (MOOE)
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add UACS</span>
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter UACS code or title..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500"
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

              <select
                value={uacsClassFilter}
                onChange={e => setUacsClassFilter(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold cursor-pointer outline-none text-slate-800 dark:text-slate-200"
              >
                <option value="All">All Expenditure Classes</option>
                <option value="Capital Outlay">Capital Outlay (CO)</option>
                <option value="Maintenance and Other Operating Expenses">MOOE Only</option>
              </select>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3.5 w-44">UACS Code</th>
                    <th className="p-3.5">Account Title</th>
                    <th className="p-3.5">Expenditure Class</th>
                    <th className="p-3.5 text-center">Subscription Default</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredUacs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 dark:text-slate-500 italic">
                        No UACS object codes found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUacs.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors font-mono">
                        <td className="p-3.5 font-bold text-blue-600 dark:text-blue-400">{item.uacs_code}</td>
                        <td className="p-3.5 font-sans">
                          <div className="font-bold text-slate-900 dark:text-white">{item.account_title}</div>
                          {item.description && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{item.description}</div>}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            item.expenditure_class === "Capital Outlay"
                              ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300"
                              : "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300"
                          }`}>
                            {item.expenditure_class}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {item.is_subscription_default ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold">
                              Yes
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">-</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditUacs(item)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg cursor-pointer transition-colors"
                              title="Edit UACS Code"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUacs(item.id, item.uacs_code, item.account_title)}
                              className="p-1.5 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 rounded-lg cursor-pointer transition-colors"
                              title="Delete UACS Code"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: STRATEGIC SPENDING CATEGORIES                          */}
      {/* ============================================================= */}
      {activeTab === "strategic" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Strategic Procurement Spending Categories (Table B.1)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Manage the master categories used in Part IV.A budget tables and Table B.1. The four canonical categories are pre-configured. You can add dynamic custom categories.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter categories..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500"
                />
              </div>
              <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-slate-700 dark:text-slate-300">
                {strategicCategories.length} Categories
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateCategory} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
              + Register Dynamic Strategic Category
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Category Name (e.g. Specialized Laboratory Modernization)"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 font-semibold sm:col-span-2"
              />
              <input
                type="text"
                placeholder="Code (Optional, e.g. LAB_MODERNIZATION)"
                value={newCatCode}
                onChange={e => setNewCatCode(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Description of spending intent..."
                value={newCatDesc}
                onChange={e => setNewCatDesc(e.target.value)}
                className="p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs sm:col-span-2 text-slate-900 dark:text-white outline-none"
              />

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={newCatIsProject}
                    onChange={e => setNewCatIsProject(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span>Project-Linked</span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>
            </div>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCategories.map(cat => {
              const isCanonical = [
                "Office Productivity", 
                "Internal ICT Projects", 
                "Cross-Agency ICT Projects", 
                "Continuing Costs/Expenses"
              ].includes(cat.name);

              return (
                <div key={cat.id || cat.code} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex justify-between items-start">
                      <strong className="text-slate-900 dark:text-white text-xs">{cat.name}</strong>
                      <div className="flex items-center gap-1.5">
                        {isCanonical ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-mono text-[9px] font-bold uppercase">
                            Canonical
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEditCategory(cat)}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer transition-colors"
                              title="Edit Category"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat.id, cat.name)}
                              className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 rounded cursor-pointer transition-colors"
                              title="Delete Custom Category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block">Code: {cat.code}</span>
                    {cat.description && <p className="text-[10.5px] text-slate-600 dark:text-slate-400 leading-relaxed">{cat.description}</p>}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span>{cat.is_project_linked ? "Tied to ICT Projects" : "Standalone Line Items"}</span>
                    <span>{cat.is_recurring_expense ? "Recurring (MOOE)" : "Capital / MOOE"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: FUND SOURCES                                           */}
      {/* ============================================================= */}
      {activeTab === "funds" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Financing Fund Sources (Table B.2 &amp; Project Inheritance)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Fund Sources are set on each <strong>ICT Project</strong> in Part III.E, and all child proposals inherit that Fund Source automatically upon project linkage.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter fund sources..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500"
                />
              </div>
              <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-slate-700 dark:text-slate-300">
                {fundSources.length} Sources
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateFundSource} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
              + Register Custom Financing Fund Source
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Fund Source Display Name (e.g. Special Trust Fund)"
                value={newFundName}
                onChange={e => setNewFundName(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs sm:col-span-2 text-slate-900 dark:text-white outline-none focus:border-blue-500 font-semibold"
              />
              <input
                type="text"
                placeholder="Code (Optional, e.g. TRUST_FUND)"
                value={newFundCode}
                onChange={e => setNewFundCode(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none font-mono"
              />
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Description / Guidelines..."
                value={newFundDesc}
                onChange={e => setNewFundDesc(e.target.value)}
                className="flex-1 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Source</span>
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredFunds.map(fs => {
              const isCanonical = ["GAA", "FAP", "LOCALLY_FUNDED", "OTHER_INCOME"].includes(fs.code);

              return (
                <div key={fs.code} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 dark:text-white text-xs">{fs.display_name}</strong>
                      {isCanonical ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono text-[9px] font-bold uppercase">
                          Standard
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-mono text-[9px] font-bold uppercase">
                          Custom
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block">Code: {fs.code}</span>
                    {fs.description && <p className="text-[10.5px] text-slate-600 dark:text-slate-400">{fs.description}</p>}
                  </div>

                  {!isCanonical && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFundSource(fs.code, fs.display_name)}
                      className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 rounded cursor-pointer transition-colors"
                      title="Delete Custom Fund Source"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: DEVELOPMENT STRATEGIES                                 */}
      {/* ============================================================= */}
      {activeTab === "strategies" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Information System Development Strategies (Parts II.C &amp; III.D)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Manage the procurement and build strategies available when cataloging or proposing Information Systems.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter strategies..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500"
                />
              </div>
              <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-slate-700 dark:text-slate-300">
                {strategies.length} Strategies
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateStrategy} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block font-mono">
              + Register Custom Development Strategy
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Strategy Display Name (e.g. Cloud SaaS Managed)"
                value={newStratName}
                onChange={e => setNewStratName(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs sm:col-span-2 text-slate-900 dark:text-white outline-none focus:border-blue-500 font-semibold"
              />
              <input
                type="text"
                placeholder="Code (Optional, e.g. SAAS_MANAGED)"
                value={newStratCode}
                onChange={e => setNewStratCode(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none font-mono"
              />
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Description of build / procurement model..."
                value={newStratDesc}
                onChange={e => setNewStratDesc(e.target.value)}
                className="flex-1 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Strategy</span>
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredStrategies.map(strat => {
              const isCanonical = ["IN_HOUSE", "OUTSOURCED", "COTS", "COMBINATION"].includes(strat.code);

              return (
                <div key={strat.code} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 dark:text-white text-xs">{strat.display_name}</strong>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[9px]">
                        {strat.code}
                      </span>
                    </div>
                    {strat.description && <p className="text-[10.5px] text-slate-600 dark:text-slate-400">{strat.description}</p>}
                  </div>

                  {!isCanonical && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStrategy(strat.code, strat.display_name)}
                      className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 rounded cursor-pointer transition-colors"
                      title="Delete Custom Strategy"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 5: HARMONIZATION FRAMEWORK CRITERIA                       */}
      {/* ============================================================= */}
      {activeTab === "harmonization" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Harmonization Framework Criteria (Part III.E Evaluation)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Manage evaluation criteria applied to ICT Projects. Mandatory criteria enforce statutory compliance during the Singularity DAG verification.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter criteria..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500"
                />
              </div>
              <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-slate-700 dark:text-slate-300">
                {harmonizationList.length} Criteria
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateHarmonization} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block font-mono">
              + Register Harmonization Criterion
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Criterion Name (e.g. Zero-Trust Architecture)"
                value={newHarmName}
                onChange={e => setNewHarmName(e.target.value)}
                className="p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs sm:col-span-2 text-slate-900 dark:text-white outline-none focus:border-purple-500 font-semibold"
              />
              <div className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-800">
                <input
                  type="checkbox"
                  id="harm_mandatory"
                  checked={newHarmMandatory}
                  onChange={e => setNewHarmMandatory(e.target.checked)}
                  className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                />
                <label htmlFor="harm_mandatory" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Mandatory Criterion
                </label>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Description of technical evaluation intent..."
                value={newHarmDesc}
                onChange={e => setNewHarmDesc(e.target.value)}
                className="flex-1 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Criterion</span>
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredHarmonization.map(item => (
              <div key={item.id} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <strong className="text-slate-900 dark:text-white text-xs">{item.name || item.criteria_name}</strong>
                    {item.is_mandatory ? (
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 font-mono text-[9px] font-bold uppercase">
                        Mandatory
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[9px]">
                        Optional
                      </span>
                    )}
                  </div>
                  {item.description && <p className="text-[10.5px] text-slate-600 dark:text-slate-400">{item.description}</p>}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEditHarmonization(item)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer transition-colors"
                    title="Edit Criterion"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteHarmonization(item.id, item.name || item.criteria_name)}
                    className="p-1 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 rounded cursor-pointer transition-colors"
                    title="Delete Criterion"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 6: STATUTORY POLICY THRESHOLDS & MULTI-YEAR INFLATION     */}
      {/* ============================================================= */}
      {activeTab === "thresholds" && (
        <form onSubmit={handleSavePolicySettings} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-6 shadow-xs animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Statutory Policy Thresholds &amp; Multi-Year Compounding Buffers</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Centralized governance parameters. Altering these thresholds reconfigures automatic proposal classifications and inflation compounding across FY {activeCycle}.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleResetPolicyDefaults}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-sm cursor-pointer transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{submitting ? "Saving..." : "Save Parameters"}</span>
              </button>
            </div>
          </div>

          {/* Section 6.1: Expenditure & Review Gates */}
          <div className="space-y-3">
            <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block font-mono">
              1. Statutory Expenditure Classification &amp; Review Gates
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Capitalization Threshold</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-900 dark:text-white text-base">
                  <span>₱</span>
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    required
                    value={policySettings.capitalization_threshold}
                    onChange={e => setPolicySettings({ ...policySettings, capitalization_threshold: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                  Units &ge; this amount are Capital Outlay (CO); items below are Semi-Expendable MOOE.
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Major Outlay Gate (₱2M Rule)</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-900 dark:text-white text-base">
                  <span>₱</span>
                  <input
                    type="number"
                    step="100000"
                    min="100000"
                    required
                    value={policySettings.major_outlay_review_threshold}
                    onChange={e => setPolicySettings({ ...policySettings, major_outlay_review_threshold: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                  Outlays &ge; this mandate selecting a System Development Status tag.
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Annex 1 Replacement Buffer</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-900 dark:text-white text-base">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    required
                    value={policySettings.hardware_replacement_buffer_units}
                    onChange={e => setPolicySettings({ ...policySettings, hardware_replacement_buffer_units: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-center text-slate-900 dark:text-white font-mono"
                  />
                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">units</span>
                </div>
                <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                  Allowed replacement units requested above unconsumed EOL inventory.
                </span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Quotation Expiry Warning</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-900 dark:text-white text-base">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={policySettings.canvas_expiration_warning_days}
                    onChange={e => setPolicySettings({ ...policySettings, canvas_expiration_warning_days: parseInt(e.target.value, 10) || 14 })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-center text-slate-900 dark:text-white font-mono"
                  />
                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">days</span>
                </div>
                <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                  Days before quotation expiration to trigger warning banners.
                </span>
              </div>
            </div>
          </div>

          {/* Section 6.2: Multi-Year Compounding Inflation Rate Buffers */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block font-mono">
                  2. Dynamic Multi-Year Inflation Rate Adjusters (Compounded per Calendar Year)
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Year 1 serves as the baseline price point (0.00% markup). Subsequent years apply the specified annual buffer to account for DBM procurement cost escalation.
                </p>
              </div>

              {/* 1-Click Preset Options */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                <span className="text-[9px] uppercase font-bold text-slate-400 mr-1 font-mono">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyInflationPreset("dict")}
                  className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800 hover:bg-purple-100 rounded-lg text-[9.5px] font-bold cursor-pointer transition-colors"
                >
                  DICT Standard (3%/5%/+2%)
                </button>
                <button
                  type="button"
                  onClick={() => applyInflationPreset("flat4")}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 rounded-lg text-[9.5px] font-bold cursor-pointer transition-colors"
                >
                  Flat 4%/yr
                </button>
                <button
                  type="button"
                  onClick={() => applyInflationPreset("zero")}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 rounded-lg text-[9.5px] font-bold cursor-pointer transition-colors"
                >
                  0% (No Buffer)
                </button>
              </div>
            </div>

            <div 
              className="grid gap-4 pt-1"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(cycleYears.length, 5)}, minmax(0, 1fr))`
              }}
            >
              {cycleYears.map((yr, idx) => {
                const yrStr = String(yr);
                const isBaseYear = idx === 0;
                const currentVal = isBaseYear ? 0.0 : (inflationRates[yrStr] !== undefined ? inflationRates[yrStr] : (idx === 1 ? 3.0 : 5.0));

                return (
                  <div key={yr} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-900 dark:text-white font-mono">
                        FY {yr} (Year {idx + 1})
                      </span>
                      {isBaseYear ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-[9px] font-bold uppercase font-mono">
                          Base Year
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[9px] font-bold uppercase font-mono">
                          Compounded
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="50"
                        disabled={isBaseYear}
                        value={currentVal}
                        onChange={e => {
                          const val = e.target.value;
                          setInflationRates(prev => ({ ...prev, [yrStr]: val }));
                        }}
                        className={`w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-sm outline-none ${
                          isBaseYear ? "opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-800" : "focus:border-purple-500"
                        }`}
                      />
                      <span className="font-mono font-bold text-slate-500 text-sm">%</span>
                    </div>

                    <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                      {isBaseYear 
                        ? "Original market reference catalog unit cost." 
                        : `Adjusted price formula: Base Price × (1 + ${currentVal / 100})`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      )}

      {/* ============================================================= */}
      {/* EDIT MODAL: UACS CATALOG ENTRY                                */}
      {/* ============================================================= */}
      {editingUacs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit UACS Catalog Entry</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Code: {editUacsCode}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingUacs(null)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUacs} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Account Title</label>
                <input
                  type="text"
                  required
                  value={editUacsTitle}
                  onChange={e => setEditUacsTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Expenditure Class</label>
                <select
                  value={editUacsClass}
                  onChange={e => setEditUacsClass(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer font-semibold"
                >
                  <option value="Capital Outlay">Capital Outlay (CO)</option>
                  <option value="Maintenance and Other Operating Expenses">Maintenance and Other Operating Expenses (MOOE)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Description / Guidelines (Optional)</label>
                <textarea
                  rows={2}
                  value={editUacsDesc}
                  onChange={e => setEditUacsDesc(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none"
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editUacsIsSub}
                  onChange={e => setEditUacsIsSub(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded"
                />
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Default UACS code for Software Subscriptions &amp; Cloud (Mandatory MOOE)
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Saving..." : "Save UACS Modifications"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* EDIT MODAL: STRATEGIC CATEGORY                                */}
      {/* ============================================================= */}
      {editingCat && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit Strategic Category</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Code: {editCatCode}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingCat(null)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCategory} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Category Name</label>
                <input
                  type="text"
                  required
                  value={editCatName}
                  onChange={e => setEditCatName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Description</label>
                <textarea
                  rows={2}
                  value={editCatDesc}
                  onChange={e => setEditCatDesc(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editCatIsProject}
                    onChange={e => setEditCatIsProject(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Project-Linked (Tied to Part III.E Initiatives)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editCatIsRecurring}
                    onChange={e => setEditCatIsRecurring(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Recurring Expense (Continuing Costs / MOOE)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Saving..." : "Save Category Modifications"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* EDIT MODAL: HARMONIZATION CRITERION                           */}
      {/* ============================================================= */}
      {editingHarm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit Harmonization Criterion</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ID: {editingHarm.id}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingHarm(null)} 
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateHarmonization} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Criterion Name</label>
                <input
                  type="text"
                  required
                  value={editHarmName}
                  onChange={e => setEditHarmName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Description</label>
                <textarea
                  rows={3}
                  value={editHarmDesc}
                  onChange={e => setEditHarmDesc(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none resize-none"
                />
              </div>

              <label className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editHarmMandatory}
                  onChange={e => setEditHarmMandatory(e.target.checked)}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Mandatory Statutory Criterion (Verified in Singularity DAG)
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Saving..." : "Save Criterion Modifications"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}