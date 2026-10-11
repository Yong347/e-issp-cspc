// frontend/src/views/admin/Budget/CeilingControl.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getBudgetCeilings, 
  updateBudgetCeiling, 
  updateGlobalBudgetCeiling, 
  validateBudgetPreflight, 
  getParityMatrices,
  getPolicySettings,
  updatePolicySettings,
  getInflationSettings,
  updateInflationSettings,
  getUacsCatalog,
  createUacsEntry,
  updateUacsEntry,
  deleteUacsEntry,
  exportBudgetBlob
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  TrendingUp, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Landmark, 
  ShieldAlert, 
  Award, 
  Edit2, 
  Edit3, 
  Coins, 
  Search, 
  Filter, 
  ArrowUpRight, 
  Scale, 
  SlidersHorizontal,
  X,
  Layers,
  Info,
  Download,
  Plus,
  Trash2,
  Tag,
  Save,
  RotateCcw,
  Sliders
} from "lucide-react";

export default function CeilingControl() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const navigate = useNavigate();

  // Primary Section Tabs: "allotments" | "inflation" | "uacs" | "thresholds"
  const [activeTab, setActiveTab] = useState("allotments");

  // Core Ceiling Data States
  const [ceilings, setCeilings] = useState([]);
  const [globalCeiling, setGlobalCeiling] = useState("200000000.00");
  const [parityData, setParityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Pre-flight Dry Run state
  const [validationResult, setValidationResult] = useState(null);

  // Filter and Search States (Department Allotments)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all, over, near, normal

  // Edit Modal State (Independent CapEx & MOOE Allocation + N-Year Annual Allocations)
  const [activeDept, setActiveDept] = useState(null);
  const [subCeilingInput, setSubCeilingInput] = useState("");
  const [capexInput, setCapexInput] = useState("");
  const [mooeInput, setMooeInput] = useState("");
  const [splitPreset, setSplitPreset] = useState("custom"); // "custom", "70_30", "60_40", "50_50", "100_0", "0_100"
  const [annualAllocations, setAnnualAllocations] = useState({});
  const [customAnnualMode, setCustomAnnualMode] = useState(false);

  // Global Ceiling Edit Modal State
  const [isEditingGlobal, setIsEditingGlobal] = useState(false);
  const [globalCeilingInput, setGlobalCeilingInput] = useState("200000000.00");

  // --- DYNAMIC INFLATION BUFFER STATES ---
  const [inflationRates, setInflationRates] = useState([]);
  const [loadingInflation, setLoadingInflation] = useState(false);
  const [savingInflation, setSavingInflation] = useState(false);

  // --- DYNAMIC UACS CATALOG STATES ---
  const [uacsItems, setUacsItems] = useState([]);
  const [loadingUacs, setLoadingUacs] = useState(false);
  const [savingUacs, setSavingUacs] = useState(false);
  const [uacsSearch, setUacsSearch] = useState("");
  const [uacsClassFilter, setUacsClassFilter] = useState("All");

  const [newUacsCode, setNewUacsCode] = useState("");
  const [newUacsTitle, setNewUacsTitle] = useState("");
  const [newUacsClass, setNewUacsClass] = useState("Capital Outlay");
  const [newUacsIsSub, setNewUacsIsSub] = useState(false);
  const [newUacsDesc, setNewUacsDesc] = useState("");

  // UACS Item Edit Modal State
  const [editingUacsItem, setEditingUacsItem] = useState(null);
  const [editUacsCode, setEditUacsCode] = useState("");
  const [editUacsTitle, setEditUacsTitle] = useState("");
  const [editUacsClass, setEditUacsClass] = useState("Capital Outlay");
  const [editUacsIsSub, setEditUacsIsSub] = useState(false);
  const [editUacsDesc, setEditUacsDesc] = useState("");

  // --- DYNAMIC POLICY THRESHOLDS STATES ---
  const [policySettings, setPolicySettings] = useState({
    capitalization_threshold: 50000.00,
    major_outlay_review_threshold: 2000000.00,
    hardware_replacement_buffer_units: 3,
    canvas_expiration_warning_days: 14
  });
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  // Active planning horizon years sequence (e.g. [2028, 2029, 2030])
  const activeYears = useMemo(() => {
    return (planningYears && planningYears.length > 0) ? planningYears : [2028, 2029, 2030];
  }, [planningYears]);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const parseAnnualItem = useCallback((val) => {
    if (typeof val === "object" && val !== null) {
      return {
        capex: parseFloat(val.capex) || 0,
        mooe: parseFloat(val.mooe) || 0
      };
    }
    const num = parseFloat(val) || 0;
    return { capex: num, mooe: 0 };
  }, []);

  // Auto-dismiss alerts
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

  // Modal escape key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (activeDept) setActiveDept(null);
        if (isEditingGlobal) setIsEditingGlobal(false);
        if (editingUacsItem) setEditingUacsItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDept, isEditingGlobal, editingUacsItem]);

  // -------------------------------------------------------------
  // DATA FETCHING PIPELINE
  // -------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Department Ceilings
      const data = await getBudgetCeilings(token, activeCycle);
      const ceilingsList = Array.isArray(data) ? data : [];
      setCeilings(ceilingsList);
      
      if (ceilingsList.length > 0 && ceilingsList[0].global_ceiling) {
        setGlobalCeiling(String(ceilingsList[0].global_ceiling));
        setGlobalCeilingInput(String(ceilingsList[0].global_ceiling));
      }

      // 2. Fetch Part IV.B Parity Matrix Data
      const pJson = await getParityMatrices(token, activeCycle).catch(() => null);
      if (pJson) {
        setParityData(pJson);
      }
    } catch (err) {
      setError(err.message || "Failed to load budget ceiling data.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCycle]);

  // Fetch Dynamic Inflation Buffer Settings
  const fetchInflationSettingsData = useCallback(async () => {
    if (!token) return;
    setLoadingInflation(true);
    try {
      const json = await getInflationSettings(token);
      const loadedRates = json.rates || [];
      
      // Defensively ensure every year in activeYears is represented in the list
      const existingYears = new Set(loadedRates.map(r => r.year));
      const mergedRates = [...loadedRates];
      activeYears.forEach((yr, idx) => {
        if (!existingYears.has(yr)) {
          mergedRates.push({
            year: yr,
            year_index: idx + 1,
            rate_percent: idx === 0 ? 0.0 : (idx === 1 ? 3.0 : (idx === 2 ? 5.0 : 5.0 + (idx - 2) * 2.0)),
            is_base_year: idx === 0
          });
        }
      });
      mergedRates.sort((a, b) => a.year - b.year);
      setInflationRates(mergedRates);
    } catch (err) {
      console.warn("Could not load inflation settings:", err);
    } finally {
      setLoadingInflation(false);
    }
  }, [token, activeYears]);

  // Fetch UACS Catalog Items
  const fetchUacsCatalogData = useCallback(async () => {
    if (!token) return;
    setLoadingUacs(true);
    try {
      const json = await getUacsCatalog(token);
      setUacsItems(Array.isArray(json) ? json : []);
    } catch (err) {
      console.warn("Could not load UACS catalog:", err);
    } finally {
      setLoadingUacs(false);
    }
  }, [token]);

  // Fetch Policy Threshold Settings
  const fetchPolicySettingsData = useCallback(async () => {
    if (!token) return;
    setLoadingPolicy(true);
    try {
      const json = await getPolicySettings(token);
      setPolicySettings({
        capitalization_threshold: parseFloat(json.capitalization_threshold) || 50000.00,
        major_outlay_review_threshold: parseFloat(json.major_outlay_review_threshold) || 2000000.00,
        hardware_replacement_buffer_units: parseInt(json.hardware_replacement_buffer_units, 10) || 3,
        canvas_expiration_warning_days: parseInt(json.canvas_expiration_warning_days, 10) || 14
      });
    } catch (err) {
      console.warn("Could not load policy threshold settings:", err);
    } finally {
      setLoadingPolicy(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && activeCycle) {
      fetchData();
      fetchInflationSettingsData();
      fetchUacsCatalogData();
      fetchPolicySettingsData();
    }
  }, [token, activeCycle, fetchData, fetchInflationSettingsData, fetchUacsCatalogData, fetchPolicySettingsData]);

  // -------------------------------------------------------------
  // GLOBAL CEILING & PRE-FLIGHT VALIDATION HANDLERS
  // -------------------------------------------------------------
  const handleUpdateGlobalCeiling = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const payload = {
        global_ceiling: parseFloat(globalCeilingInput) || 0.0
      };
      await updateGlobalBudgetCeiling(token, payload);

      setGlobalCeiling(globalCeilingInput);
      setIsEditingGlobal(false);
      setSuccess("Institutional Global Budget Ceiling updated successfully.");
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to update global ceiling.");
    } finally {
      setSubmitting(false);
    }
  };

  const runValidationCheck = async () => {
    setValidating(true);
    setError(null);
    setValidationResult(null);
    try {
      const data = await validateBudgetPreflight(token, activeCycle);
      setValidationResult(data);
    } catch (err) {
      setError(err.message || "Pre-flight validation check failed.");
    } finally {
      setValidating(false);
    }
  };

  // DBM OSPS CSV Spreadsheet Exporter
  const handleExportCsv = async () => {
    setExportingCsv(true);
    setError(null);
    try {
      const blob = await exportBudgetBlob(token, activeCycle);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ISSP_${activeCycle}_Part_IV_A_DBM_Export.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccess("DBM OSPS-compliant spreadsheet exported successfully.");
    } catch (err) {
      setError(err.message || "Failed to download budget spreadsheet.");
    } finally {
      setExportingCsv(false);
    }
  };

  // -------------------------------------------------------------
  // DEPARTMENT SUB-CEILING CONFIGURATION MODAL HANDLERS
  // -------------------------------------------------------------
  const balanceAnnualAllocations = useCallback((cap, mooe, targetYears = activeYears) => {
    const span = targetYears.length || 1;
    const annualCap = Math.round((cap / span) * 100) / 100;
    const annualMooe = Math.round((mooe / span) * 100) / 100;
    const newMap = {};

    targetYears.forEach((yr, idx) => {
      if (idx === span - 1) {
        newMap[String(yr)] = {
          capex: Math.round((cap - annualCap * (span - 1)) * 100) / 100,
          mooe: Math.round((mooe - annualMooe * (span - 1)) * 100) / 100
        };
      } else {
        newMap[String(yr)] = {
          capex: annualCap,
          mooe: annualMooe
        };
      }
    });

    return newMap;
  }, [activeYears]);

  const openEditModal = (dept) => {
    setActiveDept(dept);
    const cap = Number(dept.allocated_capex || 0);
    const mooe = Number(dept.allocated_mooe || 0);
    const subCeil = Number(dept.sub_ceiling || (cap + mooe));

    setSubCeilingInput(String(subCeil));
    setCapexInput(String(cap));
    setMooeInput(String(mooe));

    // Preset determination
    if (subCeil > 0) {
      const roundCap70 = Math.round(subCeil * 0.70);
      const roundCap60 = Math.round(subCeil * 0.60);
      const roundCap50 = Math.round(subCeil * 0.50);

      if (cap === roundCap70 && mooe === subCeil - roundCap70) {
        setSplitPreset("70_30");
      } else if (cap === roundCap60 && mooe === subCeil - roundCap60) {
        setSplitPreset("60_40");
      } else if (cap === roundCap50 && mooe === subCeil - roundCap50) {
        setSplitPreset("50_50");
      } else if (cap === subCeil && mooe === 0) {
        setSplitPreset("100_0");
      } else if (cap === 0 && mooe === subCeil) {
        setSplitPreset("0_100");
      } else {
        setSplitPreset("custom");
      }
    } else {
      setSplitPreset("custom");
    }

    // Populate or initialize annual allocations for active horizon with defensive object normalization
    let initialAnnual = {};
    if (dept.annual_allocations && typeof dept.annual_allocations === "object" && Object.keys(dept.annual_allocations).length > 0) {
      activeYears.forEach(y => {
        initialAnnual[String(y)] = parseAnnualItem(dept.annual_allocations[String(y)]);
      });
    } else {
      initialAnnual = balanceAnnualAllocations(cap, mooe);
    }

    setAnnualAllocations(initialAnnual);
    setCustomAnnualMode(false);
  };

  const applyPreset = (presetKey, currentSubCeiling) => {
    setSplitPreset(presetKey);
    const total = parseFloat(currentSubCeiling) || 0;
    let cap = 0;
    let mooe = 0;

    if (presetKey === "70_30") {
      cap = Math.round(total * 0.70);
      mooe = total - cap;
    } else if (presetKey === "60_40") {
      cap = Math.round(total * 0.60);
      mooe = total - cap;
    } else if (presetKey === "50_50") {
      cap = Math.round(total * 0.50);
      mooe = total - cap;
    } else if (presetKey === "100_0") {
      cap = total;
      mooe = 0;
    } else if (presetKey === "0_100") {
      cap = 0;
      mooe = total;
    } else {
      cap = parseFloat(capexInput) || 0;
      mooe = parseFloat(mooeInput) || 0;
    }

    setCapexInput(String(cap));
    setMooeInput(String(mooe));

    if (!customAnnualMode) {
      setAnnualAllocations(balanceAnnualAllocations(cap, mooe));
    }
  };

  const handleAnnualAllocationChange = (year, field, value) => {
    const numVal = parseFloat(value) || 0;
    const currentEntry = parseAnnualItem(annualAllocations[String(year)]);
    const updated = {
      ...annualAllocations,
      [String(year)]: {
        ...currentEntry,
        [field]: numVal
      }
    };
    setAnnualAllocations(updated);

    // Sum overall CapEx and MOOE across all active planning years
    let totalCap = 0;
    let totalMooe = 0;
    activeYears.forEach(yr => {
      const entry = parseAnnualItem(updated[String(yr)]);
      totalCap += Number(entry.capex || 0);
      totalMooe += Number(entry.mooe || 0);
    });

    const roundedCap = Math.round(totalCap * 100) / 100;
    const roundedMooe = Math.round(totalMooe * 100) / 100;
    setCapexInput(String(roundedCap));
    setMooeInput(String(roundedMooe));
    setSubCeilingInput(String(Math.round((roundedCap + roundedMooe) * 100) / 100));
    setSplitPreset("custom");
  };

  const handleSaveDepartmentCeiling = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const capexVal = parseFloat(capexInput) || 0.0;
    const mooeVal = parseFloat(mooeInput) || 0.0;
    const subCeilingVal = capexVal + mooeVal;

    // Use custom annual allocations if manually tuned, or balanced auto-split
    const finalAnnualMap = customAnnualMode ? annualAllocations : balanceAnnualAllocations(capexVal, mooeVal);

    try {
      await updateBudgetCeiling(token, {
        department_id: activeDept.department_id,
        issp_period: activeCycle,
        allocated_capex: capexVal,
        allocated_mooe: mooeVal,
        sub_ceiling: subCeilingVal,
        annual_allocations: finalAnnualMap
      });

      setSuccess(`Budget allocation updated for '${activeDept.department_name}'. (CapEx: ${formatPHP(capexVal)} | MOOE: ${formatPHP(mooeVal)})`);
      setActiveDept(null);
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to persist department sub-ceiling.");
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // DYNAMIC INFLATION BUFFER PRESETS & SAVE
  // -------------------------------------------------------------
  const handleInflationRateChange = (year, newPercent) => {
    setInflationRates(prev =>
      prev.map(r => r.year === year ? { ...r, rate_percent: parseFloat(newPercent) || 0 } : r)
    );
  };

  const applyInflationPreset = (preset) => {
    setInflationRates(prev =>
      prev.map((r, idx) => {
        if (idx === 0) return { ...r, rate_percent: 0.0 };
        if (preset === "dict") {
          // DICT Guidelines: 0% Y1, 3% Y2, 5% Y3, and compounding +2%/yr thereafter
          const pct = idx === 1 ? 3.0 : (idx === 2 ? 5.0 : 5.0 + (idx - 2) * 2.0);
          return { ...r, rate_percent: pct };
        }
        if (preset === "flat4") {
          return { ...r, rate_percent: idx * 4.0 };
        }
        if (preset === "zero") {
          return { ...r, rate_percent: 0.0 };
        }
        return r;
      })
    );
  };

  const handleSaveInflationSettings = async () => {
    setSavingInflation(true);
    setError(null);
    setSuccess(null);

    const ratesPayload = {};
    inflationRates.forEach(r => {
      ratesPayload[String(r.year)] = r.rate_percent;
    });

    try {
      const json = await updateInflationSettings(token, { rates: ratesPayload });
      setSuccess(json.message || "Inflation buffer rates updated and synchronized across all proposal total costs.");
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to update inflation buffer rates.");
    } finally {
      setSavingInflation(false);
    }
  };

  // -------------------------------------------------------------
  // UACS CATALOG CRUD HANDLERS
  // -------------------------------------------------------------
  const handleAddUacs = async (e) => {
    e.preventDefault();
    if (!newUacsCode.trim() || !newUacsTitle.trim()) return;

    setSavingUacs(true);
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

      setSuccess(`UACS Code '${newUacsCode}' added to catalog.`);
      setNewUacsCode("");
      setNewUacsTitle("");
      setNewUacsDesc("");
      setNewUacsIsSub(false);
      fetchUacsCatalogData();
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to add UACS code.");
    } finally {
      setSavingUacs(false);
    }
  };

  const handleOpenEditUacsModal = (item) => {
    setEditingUacsItem(item);
    setEditUacsCode(item.uacs_code || "");
    setEditUacsTitle(item.account_title || "");
    setEditUacsClass(item.expenditure_class || "Capital Outlay");
    setEditUacsIsSub(Boolean(item.is_subscription_default));
    setEditUacsDesc(item.description || "");
  };

  const handleSaveEditUacs = async (e) => {
    e.preventDefault();
    if (!editingUacsItem) return;

    setSavingUacs(true);
    setError(null);
    setSuccess(null);
    try {
      await updateUacsEntry(token, editingUacsItem.id, {
        account_title: editUacsTitle.trim(),
        expenditure_class: editUacsClass,
        is_subscription_default: editUacsIsSub,
        description: editUacsDesc.trim() || null
      });

      setSuccess(`UACS Code '${editUacsCode}' updated successfully.`);
      setEditingUacsItem(null);
      fetchUacsCatalogData();
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to update UACS entry.");
    } finally {
      setSavingUacs(false);
    }
  };

  const handleDeleteUacs = async (id, code, title) => {
    if (!window.confirm(`Delete UACS code '${code} - ${title}' from catalog?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteUacsEntry(token, id);
      setSuccess(`UACS code '${code}' deleted.`);
      fetchUacsCatalogData();
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to delete UACS code.");
    }
  };

  // Filtered UACS Items
  const filteredUacsItems = useMemo(() => {
    return uacsItems.filter(item => {
      if (uacsClassFilter !== "All" && item.expenditure_class !== uacsClassFilter) return false;
      if (!uacsSearch.trim()) return true;
      const q = uacsSearch.toLowerCase().trim();
      return (
        (item.uacs_code || "").toLowerCase().includes(q) ||
        (item.account_title || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q)
      );
    });
  }, [uacsItems, uacsClassFilter, uacsSearch]);

  // -------------------------------------------------------------
  // POLICY THRESHOLDS SAVE HANDLER & PRESET RESTORE
  // -------------------------------------------------------------
  const handleSavePolicySettings = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePolicySettings(token, policySettings);
      setSuccess("Capitalization threshold, major review gate, and policy settings updated.");
    } catch (err) {
      setError(err.message || "Failed to update policy settings.");
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleResetPolicyDefaults = () => {
    setPolicySettings({
      capitalization_threshold: 50000.00,
      major_outlay_review_threshold: 2000000.00,
      hardware_replacement_buffer_units: 3,
      canvas_expiration_warning_days: 14
    });
    setSuccess("Restored statutory DBM & DICT default policy values. Click 'Save Policy Parameters' to apply.");
  };

  // -------------------------------------------------------------
  // CALCULATIONS FOR MACRO KPI TILES
  // -------------------------------------------------------------
  const totalAllocatedSubCeilings = ceilings.reduce((sum, d) => sum + Number(d.sub_ceiling || 0), 0);
  const totalActualSpent = ceilings.reduce((sum, d) => sum + Number(d.current_spent || 0), 0);
  const globalCapNum = parseFloat(globalCeiling) || 0;
  const unallocatedReserve = globalCapNum - totalAllocatedSubCeilings;
  const isAllocationOverGlobal = totalAllocatedSubCeilings > globalCapNum;
  const globalSpentPercent = globalCapNum > 0 ? (totalActualSpent / globalCapNum) * 100 : 0;

  // Parity Totals & Discrepancy Safe Resolution
  const certifiedGrandTotal = parseFloat(parityData?.certified_grand_total || parityData?.Certified_Grand_Total || 0);
  const isParityValid = parityData?.is_parity_valid !== undefined ? parityData.is_parity_valid : true;
  const discrepancy = parseFloat(parityData?.parity_discrepancy || 0);

  // Filter departments for listing
  const filteredCeilings = ceilings.filter(d => {
    const matchesSearch = (d.department_name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(d.department_id || "").includes(searchQuery);

    const spent = Number(d.current_spent || 0);
    const sub = Number(d.sub_ceiling || 0);
    const ratio = sub > 0 ? (spent / sub) : 0;

    let matchesStatus = true;
    if (filterStatus === "over") {
      matchesStatus = spent > sub;
    } else if (filterStatus === "near") {
      matchesStatus = spent <= sub && ratio >= 0.80;
    } else if (filterStatus === "normal") {
      matchesStatus = ratio < 0.80;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans transition-colors duration-200">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Sub-Ceiling Allocation, Dynamic Inflation &amp; 4-Way Parity</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"} ({activeYears.length} Years Horizon)
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Configure independent CapEx and MOOE department allotments across arbitrary multi-year spans ({activeYears[0]}–{activeYears[activeYears.length - 1]}), compound inflation buffers, manage UACS catalogs, and enforce 4-way parity.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Centralized Compiler Verification Button */}
          <CompilerSyncButton
            moduleName="budget"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchData}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm text-xs"
            title="Export Part IV.A Detailed Deployment to DBM-compliant OSPS/NEP CSV"
          >
            <Download className={`w-4 h-4 ${exportingCsv ? "animate-spin text-blue-500" : "text-blue-600 dark:text-blue-400"}`} />
            <span>{exportingCsv ? "Exporting..." : "Export DBM CSV"}</span>
          </button>
          
          <button
            onClick={() => navigate("/admin/parity-summary")}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm text-xs"
            title="Open Detailed Part IV.B Parity Matrix Viewer"
          >
            <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>4-Way Parity Ledger</span>
          </button>

          <button
            onClick={runValidationCheck}
            disabled={validating}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-sm text-xs"
          >
            <ShieldCheck className={`w-4 h-4 ${validating ? "animate-spin" : ""}`} />
            <span>{validating ? "Running Dry Run..." : "Pre-flight Dry Run"}</span>
          </button>
        </div>
      </div>

      {/* Real-time Status Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-time Dry Run Validation Banner */}
      {validationResult && (
        <div className={`p-5 rounded-2xl border flex items-start gap-4 leading-relaxed animate-fadeIn shadow-sm ${
          validationResult.validation_passed 
            ? "bg-emerald-50 dark:bg-emerald-955/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" 
            : "bg-rose-50 dark:bg-rose-955/30 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-300"
        }`}>
          {validationResult.validation_passed ? (
            <>
              <Award className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm">Dry Run Validation Successful: All Expenditures Balanced</h4>
                  <button onClick={() => setValidationResult(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs">
                  All active department requests fit completely within their assigned sub-ceilings. No overages detected for planning cycle FY {activeCycle}.
                </p>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce mt-0.5" />
              <div className="space-y-2 flex-grow">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-sm">Budget Ceiling Overage Detected ({validationResult.total_violations_detected || 1} Departments)</h4>
                  <button onClick={() => setValidationResult(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-xs">
                  The following departments have submitted or drafted outlays exceeding their allocated sub-ceilings. These overages must be adjusted before document compilation:
                </p>
                <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 max-w-2xl font-mono text-[11px]">
                  {validationResult.breaches?.map((b, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{b.department_name}</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        Overage: +{formatPHP(b.budget_overage_php || 0)} (Allocated: {formatPHP(b.allocated_sub_ceiling_php || 0)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 4 Macro Institutional Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Global Budget Ceiling */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-1 shadow-sm">
          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">
            <span className="flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Global Budget Ceiling</span>
            </span>
            <button 
              onClick={() => setIsEditingGlobal(true)}
              className="p-1 hover:text-blue-600 text-slate-400 dark:text-slate-500 rounded-lg transition-colors cursor-pointer"
              title="Edit Global Limit"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
          <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">{formatPHP(globalCapNum)}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Institutional Planning Cap</span>
        </div>

        {/* Card 2: Allocated Sub-Ceilings vs Reserve */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Sub-Ceilings Assigned</span>
          </span>
          <div className={`font-mono text-lg font-bold ${isAllocationOverGlobal ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
            {formatPHP(totalAllocatedSubCeilings)}
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500 dark:text-slate-400">Unallocated Reserve:</span>
            <span className={`font-mono font-bold ${unallocatedReserve < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatPHP(unallocatedReserve)}
            </span>
          </div>
        </div>

        {/* Card 3: Actual Committed Spending */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-1 shadow-sm">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Total Actual Committed</span>
          </span>
          <div className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{formatPHP(totalActualSpent)}</div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500 dark:text-slate-400">Overall Utilization:</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{globalSpentPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Card 4: Four-Way Parity Monitor */}
        <div 
          onClick={() => navigate("/admin/parity-summary")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all shadow-sm ${
            isParityValid 
              ? "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-400 text-slate-900 dark:text-white" 
              : "bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-300 animate-pulse"
          }`}
        >
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>4-Way Parity Status</span>
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="font-mono text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">
            {formatPHP(certifiedGrandTotal)}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
            {isParityValid ? "★ Tables B.1 - B.4 Balanced" : `Discrepancy: ${formatPHP(discrepancy)}`}
          </span>
        </div>
      </div>

      {/* Primary Governance Section Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm self-start">
        {[
          { id: "allotments", label: `Department Allotments (${ceilings.length})`, icon: <Landmark className="w-3.5 h-3.5" /> },
          { id: "inflation", label: `Inflation Buffer Policy (${activeYears.length} Yrs)`, icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
          { id: "uacs", label: `UACS Object Codes (${uacsItems.length})`, icon: <Tag className="w-3.5 h-3.5" /> },
          { id: "thresholds", label: "Policy Thresholds & Review Gates", icon: <Sliders className="w-3.5 h-3.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ============================================================= */}
      {/* SECTION 1: DEPARTMENT ALLOTMENTS (MAIN CONSOLE)               */}
      {/* ============================================================= */}
      {activeTab === "allotments" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          
          {/* Left Column: Expenditure Class Principles & 4-Way Parity Ledger */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-sm">
              <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5 font-serif">
                <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Expenditure Class Principles</span>
              </h3>

              <div className="space-y-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  In compliance with DBM and DICT guidelines, department sub-ceilings are composed of independent expenditure classes:
                </p>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex justify-between font-mono">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">Capital Outlay (CapEx)</span>
                    <span className="text-slate-500 dark:text-slate-400">&ge; {formatPHP(policySettings.capitalization_threshold)} / Software</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">Operating Services (MOOE)</span>
                    <span className="text-slate-500 dark:text-slate-400">&lt; {formatPHP(policySettings.capitalization_threshold)}, Subscriptions</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] leading-relaxed flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    Allotments can be set independently per department based on strategic procurement requirements (e.g. 70/30, 60/40, or custom per-year breakdowns across the active horizon).
                  </span>
                </div>
              </div>
            </div>

            {/* Part IV.B Parity Reconciliation Widget */}
            {parityData && (
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-3 shadow-sm">
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between font-serif">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Part IV.B Parity Reconciliation</span>
                  </span>
                  <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 font-mono font-bold uppercase">
                    Certified
                  </span>
                </h3>

                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">B.1 General Summary:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatPHP(parityData.b1_general_summary?.["GRAND TOTAL"]?.["Total"] || parityData.b1_general_summary?.["GRAND TOTAL"]?.["grand_total"] || certifiedGrandTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">B.2 Fund Sources:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatPHP(parityData.b2_fund_source?.["GRAND TOTAL"]?.["Total"] || parityData.b2_fund_source?.["GRAND TOTAL"]?.["grand_total"] || certifiedGrandTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">B.3 Statement of Exp.:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatPHP(parityData.b3_statement_of_expenditure?.["GRAND TOTAL"]?.["Total"] || parityData.b3_statement_of_expenditure?.["GRAND TOTAL"]?.["grand_total"] || certifiedGrandTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">B.4 Object of Exp. (UACS):</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatPHP(parityData.b4_object_of_expenditure?.["GRAND TOTAL"]?.["Total"] || parityData.b4_object_of_expenditure?.["GRAND TOTAL"]?.["grand_total"] || certifiedGrandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Department Sub-Ceilings Directory */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider font-serif">
                  Departmental Budget Allotments (FY {activeCycle})
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Monitoring CapEx &amp; MOOE consumption across all {activeYears.length} planning years</p>
              </div>

              {/* Search and Status Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter department..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer font-semibold"
                >
                  <option value="all">All Departments</option>
                  <option value="over">Over Ceiling (&gt;100%)</option>
                  <option value="near">Near Limit (&ge;80%)</option>
                  <option value="normal">Under Limit (&lt;80%)</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500 dark:text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Loading department budget allotments...</span>
              </div>
            ) : filteredCeilings.length > 0 ? (
              <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
                {filteredCeilings.map((dept) => {
                  const totalSpent = Number(dept.current_spent || 0);
                  const subCeiling = Number(dept.sub_ceiling || 0);
                  const capexAllocated = Number(dept.allocated_capex || 0);
                  const mooeAllocated = Number(dept.allocated_mooe || 0);

                  const isOver = totalSpent > subCeiling;
                  const percentSpent = subCeiling > 0 ? Math.min((totalSpent / subCeiling) * 100, 100) : 0;
                  const rawPercent = subCeiling > 0 ? (totalSpent / subCeiling) * 100 : 0;

                  const capexPct = subCeiling > 0 ? Math.round((capexAllocated / subCeiling) * 100) : 0;
                  const mooePct = subCeiling > 0 ? Math.round((mooeAllocated / subCeiling) * 100) : 0;

                  const annualMap = dept.annual_allocations || {};

                  return (
                    <div 
                      key={dept.department_id} 
                      className={`p-4 rounded-2xl border transition-all space-y-3 shadow-sm ${
                        isOver 
                          ? "bg-rose-50/60 dark:bg-rose-955/20 border-rose-300 dark:border-rose-900/60 border-l-4 border-l-rose-500" 
                          : rawPercent >= 80 
                          ? "bg-amber-50/60 dark:bg-amber-955/20 border-amber-300 dark:border-amber-900/60" 
                          : "bg-slate-50 dark:bg-slate-955 border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">{dept.department_name}</h4>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Department ID: #{dept.department_id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOver ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 font-mono animate-pulse">
                              Over Ceiling (+{formatPHP(totalSpent - subCeiling)})
                            </span>
                          ) : rawPercent >= 80 ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 font-mono">
                              Near Limit ({rawPercent.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono">
                              Within Budget
                            </span>
                          )}
                          <button
                            onClick={() => openEditModal(dept)}
                            className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer shadow-sm"
                            title="Configure Sub-Ceilings & Multi-Year Split"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Allotments Matrix */}
                      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px] font-mono">
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 block">Sub-Ceiling Cap</span>
                          <span className="text-slate-900 dark:text-white font-bold">{formatPHP(subCeiling)}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[9px] uppercase font-bold text-blue-600 dark:text-blue-400 block">
                            CapEx Allotment ({capexPct}%)
                          </span>
                          <span className="text-blue-700 dark:text-blue-300 font-bold">{formatPHP(capexAllocated)}</span>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="text-[9px] uppercase font-bold text-purple-600 dark:text-purple-400 block">
                            MOOE Allotment ({mooePct}%)
                          </span>
                          <span className="text-purple-700 dark:text-purple-300 font-bold">{formatPHP(mooeAllocated)}</span>
                        </div>
                      </div>

                      {/* Multi-Year Horizon Targets Preview */}
                      {Object.keys(annualMap).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[9.5px] font-mono">
                          <span className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[8.5px]">Annual Allocation Spread:</span>
                          {activeYears.map(yr => {
                            const alloc = parseAnnualItem(annualMap[String(yr)]);
                            if (!alloc) return null;
                            return (
                              <span key={yr} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                                FY {yr}: <strong>{formatPHP((alloc.capex || 0) + (alloc.mooe || 0))}</strong>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Progress Utilization Meter */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500 dark:text-slate-400">
                            Committed: <strong className={isOver ? "text-rose-600 dark:text-rose-400 font-mono" : "text-slate-900 dark:text-white font-mono"}>{formatPHP(totalSpent)}</strong>
                          </span>
                          <span className="font-mono text-slate-400 dark:text-slate-500">{rawPercent.toFixed(1)}% of Sub-Ceiling</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOver ? "bg-rose-600 animate-pulse" : rawPercent >= 80 ? "bg-amber-500" : "bg-blue-600"
                            }`}
                            style={{ width: `${percentSpent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500 italic">
                No departmental sub-ceilings match your query.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 2: DYNAMIC INFLATION BUFFER POLICY (2 to 5+ YEARS)   */}
      {/* ============================================================= */}
      {activeTab === "inflation" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-sm animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Annual Inflation Buffer Policy (DICT Guidelines p. 26 &bull; {activeYears.length} Years Span)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Configure annual inflation buffer percentages compounded into multi-year hardware and subscription projections.
              </p>
            </div>

            {/* Quick 1-Click Presets */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => applyInflationPreset("dict")}
                className="px-2.5 py-1 text-[9.5px] font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900 hover:bg-blue-100 cursor-pointer"
              >
                DICT Standard (3%/5%/+2%)
              </button>
              <button
                type="button"
                onClick={() => applyInflationPreset("flat4")}
                className="px-2.5 py-1 text-[9.5px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Flat 4%/yr
              </button>
              <button
                type="button"
                onClick={() => applyInflationPreset("zero")}
                className="px-2.5 py-1 text-[9.5px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                0% (No Buffer)
              </button>
            </div>
          </div>

          {loadingInflation ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Loading inflation rate policies...</span>
            </div>
          ) : (
            <div 
              className="grid gap-3 pt-1"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(activeYears.length, 5)}, minmax(0, 1fr))`
              }}
            >
              {inflationRates.map((item) => (
                <div 
                  key={item.year}
                  className={`p-3.5 rounded-xl border text-center space-y-1.5 ${
                    item.is_base_year 
                      ? "bg-slate-50 dark:bg-slate-955 border-slate-200 dark:border-slate-800" 
                      : "bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-900/60 shadow-sm"
                  }`}
                >
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block font-mono">
                    Year {item.year_index} (FY {item.year})
                  </span>

                  {item.is_base_year ? (
                    <div className="font-mono font-bold text-slate-500 dark:text-slate-400 py-1.5 text-sm">
                      0.0% <span className="text-[9px] font-normal block text-slate-400 dark:text-slate-500">(Base Year)</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="50"
                        value={item.rate_percent}
                        onChange={e => handleInflationRateChange(item.year, e.target.value)}
                        className="w-16 p-1.5 text-center bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500 font-bold"
                      />
                      <span>%</span>
                    </div>
                  )}

                  {/* Impact Calculation Preview */}
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono block">
                    ₱100k &rarr; ₱{(100000 * (1 + (item.rate_percent / 100))).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Saving automatically applies these rates to Part IV.A Detailed Deployment and Table B.1–B.4 summaries across all {activeYears.length} years.</span>
            </div>

            <button
              type="button"
              onClick={handleSaveInflationSettings}
              disabled={savingInflation || loadingInflation}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-sm cursor-pointer transition-all self-end sm:self-auto"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingInflation ? "Saving Rates..." : "Save Buffer Settings"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 3: DYNAMIC UACS CATALOG MANAGER (TABLE B.4)           */}
      {/* ============================================================= */}
      {activeTab === "uacs" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-sm animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>UACS Object Code Catalog (Table B.4 Governance)</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Admin-managed Unified Accounts Code Structure (UACS) catalog. Dictates accounting classification in Part IV.B.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full font-mono font-bold text-slate-800 dark:text-slate-200">
                {uacsItems.length} Registered Codes
              </span>
            </div>
          </div>

          {/* New UACS Entry Form */}
          <form onSubmit={handleAddUacs} className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Register New UACS Account Code</span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input 
                placeholder="UACS Code (e.g. 50604050 03)" 
                value={newUacsCode} 
                onChange={e => setNewUacsCode(e.target.value)} 
                className="p-2 border border-slate-300 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white outline-none focus:border-blue-500"
                required 
              />
              <input 
                placeholder="Account Title (e.g. ICT Equipment)" 
                value={newUacsTitle} 
                onChange={e => setNewUacsTitle(e.target.value)} 
                className="p-2 border border-slate-300 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-blue-500 sm:col-span-2"
                required 
              />
              <select 
                value={newUacsClass} 
                onChange={e => setNewUacsClass(e.target.value)}
                className="p-2 border border-slate-300 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="Capital Outlay">Capital Outlay (CO)</option>
                <option value="Maintenance and Other Operating Expenses">MOOE</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <input 
                placeholder="Description / Remarks (Optional)" 
                value={newUacsDesc} 
                onChange={e => setNewUacsDesc(e.target.value)} 
                className="sm:col-span-2 p-2 border border-slate-300 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
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
                  disabled={savingUacs}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{savingUacs ? "Adding..." : "Add Code"}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Search & Class Filter Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter UACS code or title..."
                value={uacsSearch}
                onChange={e => setUacsSearch(e.target.value)}
                className="w-full pl-9 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
              />
              {uacsSearch && (
                <button onClick={() => setUacsSearch("")} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
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
          </div>

          {/* UACS Table Listing */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            {loadingUacs ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                <span>Loading UACS catalog...</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3 w-40">UACS Code</th>
                    <th className="p-3">Account Title &amp; Description</th>
                    <th className="p-3">Expenditure Class</th>
                    <th className="p-3 text-center">Subscription Default</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredUacsItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors font-mono">
                      <td className="p-3 font-bold text-blue-600 dark:text-blue-400">{item.uacs_code}</td>
                      <td className="p-3 font-sans">
                        <div className="text-slate-900 dark:text-white font-semibold">{item.account_title}</div>
                        {item.description && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{item.description}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          item.expenditure_class === "Capital Outlay"
                            ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                            : "bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                        }`}>
                          {item.expenditure_class}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {item.is_subscription_default ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[9px] font-bold uppercase">
                            Yes
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-sans">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditUacsModal(item)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 rounded-lg cursor-pointer"
                            title="Edit UACS properties"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUacs(item.id, item.uacs_code, item.account_title)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            title="Delete UACS code"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* SECTION 4: CAPITALIZATION & REVIEW GATES THRESHOLDS           */}
      {/* ============================================================= */}
      {activeTab === "thresholds" && (
        <form onSubmit={handleSavePolicySettings} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-5 shadow-sm animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2 font-serif">
                <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Statutory Policy Thresholds &amp; Administrative Review Gates</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Centralized governance parameters. Altering these thresholds reconfigures automatic proposal classifications and validation guards.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleResetPolicyDefaults}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
                title="Reset to official DBM & DICT default thresholds"
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
                <span>{submitting ? "Saving Policies..." : "Save Policy Parameters"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Capitalization Threshold */}
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
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                Units &ge; this amount are Capital Outlay (CO); items below are Semi-Expendable MOOE.
              </span>
            </div>

            {/* Major Outlay Review Gate */}
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
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                Outlays &ge; this mandate selecting a System Development Status tag.
              </span>
            </div>

            {/* Replacement Buffer Units */}
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
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-center text-slate-900 dark:text-white"
                />
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">units</span>
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                Allowed replacement units requested above unconsumed EOL inventory.
              </span>
            </div>

            {/* Canvas Expiration Warning Days */}
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
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg p-1.5 outline-none focus:border-blue-500 text-center text-slate-900 dark:text-white"
                />
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">days</span>
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block leading-tight">
                Days before quotation expiration to trigger warning banners.
              </span>
            </div>
          </div>
        </form>
      )}

      {/* ============================================================= */}
      {/* MODAL 1: EDIT DEPARTMENT ALLOCATION & N-YEAR BREAKDOWN        */}
      {/* ============================================================= */}
      {activeDept && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Configure Department Allotments</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{activeYears.length}-Year Horizon Breakdown (FY {activeYears[0]}–{activeYears[activeYears.length - 1]})</span>
              </div>
              <button 
                onClick={() => setActiveDept(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartmentCeiling} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Target Department</span>
                <p className="font-bold text-slate-900 dark:text-white text-sm">{activeDept.department_name}</p>
              </div>

              {/* Editable Target Total Sub-Ceiling Input */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  Target Total Sub-Ceiling (PHP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={subCeilingInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSubCeilingInput(val);
                    if (splitPreset !== "custom") {
                      applyPreset(splitPreset, val);
                    } else {
                      const total = parseFloat(val) || 0;
                      const currentCap = parseFloat(capexInput) || 0;
                      const currentMooe = parseFloat(mooeInput) || 0;
                      const oldSum = currentCap + currentMooe;
                      let newCap = 0;
                      let newMooe = 0;
                      if (oldSum > 0) {
                        const ratio = currentCap / oldSum;
                        newCap = Math.round(total * ratio);
                        newMooe = total - newCap;
                      } else {
                        newCap = total;
                        newMooe = 0;
                      }
                      setCapexInput(String(newCap));
                      setMooeInput(String(newMooe));
                      if (!customAnnualMode) {
                        setAnnualAllocations(balanceAnnualAllocations(newCap, newMooe));
                      }
                    }
                  }}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm outline-none focus:border-blue-500"
                />
              </div>

              {/* Allocation Presets Selector */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  Quick Allocation Preset
                </label>
                <select
                  value={splitPreset}
                  onChange={(e) => applyPreset(e.target.value, subCeilingInput)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value="custom">Custom / Independent Entry</option>
                  <option value="70_30">70% CapEx / 30% MOOE</option>
                  <option value="60_40">60% CapEx / 40% MOOE</option>
                  <option value="50_50">50% CapEx / 50% MOOE</option>
                  <option value="100_0">100% CapEx (0% MOOE)</option>
                  <option value="0_100">100% MOOE (0% CapEx)</option>
                </select>
              </div>

              {/* Independent CapEx and MOOE Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                    CapEx Allotment (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={capexInput}
                    onChange={(e) => {
                      const newCap = parseFloat(e.target.value) || 0;
                      setCapexInput(e.target.value);
                      setSplitPreset("custom");
                      const currentMooe = parseFloat(mooeInput) || 0;
                      setSubCeilingInput(String(newCap + currentMooe));
                      if (!customAnnualMode) {
                        setAnnualAllocations(balanceAnnualAllocations(newCap, currentMooe));
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 tracking-wider">
                    MOOE Allotment (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={mooeInput}
                    onChange={(e) => {
                      const newMooe = parseFloat(e.target.value) || 0;
                      setMooeInput(e.target.value);
                      setSplitPreset("custom");
                      const currentCap = parseFloat(capexInput) || 0;
                      setSubCeilingInput(String(currentCap + newMooe));
                      if (!customAnnualMode) {
                        setAnnualAllocations(balanceAnnualAllocations(currentCap, newMooe));
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 font-bold"
                  />
                </div>
              </div>

              {/* Dynamic N-Year Horizon Breakdown Section */}
              <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 font-mono">
                    Annual Multi-Year Allotments ({activeYears.length} Years Horizon)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomAnnualMode(!customAnnualMode);
                      if (customAnnualMode) {
                        // Reset back to balanced distribution
                        const cap = parseFloat(capexInput) || 0;
                        const mooe = parseFloat(mooeInput) || 0;
                        setAnnualAllocations(balanceAnnualAllocations(cap, mooe));
                      }
                    }}
                    className="text-[9.5px] text-blue-600 dark:text-blue-400 hover:underline font-bold font-mono cursor-pointer"
                  >
                    {customAnnualMode ? "Reset to Auto-Balanced" : "Customize Annual Spread"}
                  </button>
                </div>

                <div className="space-y-2 pt-1 font-mono text-[10.5px]">
                  {activeYears.map((yr, idx) => {
                    const alloc = parseAnnualItem(annualAllocations[String(yr)]);
                    return (
                      <div key={yr} className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5">
                        <div className="flex justify-between items-center font-bold">
                          <span className="text-slate-700 dark:text-slate-300">Year {idx + 1} (FY {yr})</span>
                          <span className="text-slate-900 dark:text-white">
                            Subtotal: {formatPHP((alloc.capex || 0) + (alloc.mooe || 0))}
                          </span>
                        </div>

                        {customAnnualMode ? (
                          <div className="grid grid-cols-2 gap-2 pt-0.5">
                            <div>
                              <span className="text-[8.5px] uppercase font-bold text-blue-600 dark:text-blue-400 block">CapEx</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={alloc.capex || 0}
                                onChange={e => handleAnnualAllocationChange(yr, "capex", e.target.value)}
                                className="w-full p-1 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded font-mono text-center font-semibold text-slate-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <span className="text-[8.5px] uppercase font-bold text-purple-600 dark:text-purple-400 block">MOOE</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={alloc.mooe || 0}
                                onChange={e => handleAnnualAllocationChange(yr, "mooe", e.target.value)}
                                className="w-full p-1 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded font-mono text-center font-semibold text-slate-900 dark:text-white"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span>CapEx: <strong className="text-blue-600 dark:text-blue-400">{formatPHP(alloc.capex || 0)}</strong></span>
                            <span>MOOE: <strong className="text-purple-600 dark:text-purple-400">{formatPHP(alloc.mooe || 0)}</strong></span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Automatically Computed Total Sub-Ceiling Box */}
              <div className="p-3 bg-slate-100 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider block">Computed Sub-Ceiling</span>
                  <span className="text-[9.5px] text-slate-400 dark:text-slate-500">Natural Sum = CapEx + MOOE</span>
                </div>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {formatPHP((parseFloat(capexInput) || 0) + (parseFloat(mooeInput) || 0))}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Updating Allotments..." : "Save Department Allotments"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 2: EDIT GLOBAL CEILING                                  */}
      {/* ============================================================= */}
      {isEditingGlobal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Update Global Budget Ceiling</h3>
              <button 
                onClick={() => setIsEditingGlobal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateGlobalCeiling} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-1.5">
                  Institutional Budget Ceiling (PHP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={globalCeilingInput}
                  onChange={(e) => setGlobalCeilingInput(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{submitting ? "Saving..." : "Update Global Ceiling"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 3: EDIT UACS ENTRY PROPERTIES                           */}
      {/* ============================================================= */}
      {editingUacsItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit UACS Catalog Entry</h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Code: {editUacsCode}</span>
              </div>
              <button 
                onClick={() => setEditingUacsItem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUacs} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Account Title</label>
                <input
                  type="text"
                  required
                  value={editUacsTitle}
                  onChange={e => setEditUacsTitle(e.target.value)}
                  placeholder="e.g. ICT Equipment"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Expenditure Class</label>
                <select
                  value={editUacsClass}
                  onChange={e => setEditUacsClass(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
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
                  placeholder="e.g. Hardware equipment thresholded >= 50k..."
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
                disabled={savingUacs}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all cursor-pointer shadow-sm text-xs"
              >
                <span>{savingUacs ? "Saving..." : "Save UACS Modifications"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
