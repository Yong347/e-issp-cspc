// frontend/src/views/admin/Narrative/CostBreakdownManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import {
  Coins,
  Plus,
  Trash2,
  Edit3,
  Save,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  CheckCircle,
  Calendar,
  Layers,
  X,
  FolderKanban,
  Info,
  Building,
  GraduationCap,
  Sparkles,
  ClipboardCheck,
  Tag,
  SlidersHorizontal
} from "lucide-react";

export default function CostBreakdownManager() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();

  // Data States
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filter States (Supports "all" or specific fiscal year string e.g. "2026")
  const [selectedYear, setSelectedYear] = useState("all");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterExpClass, setFilterExpClass] = useState("All");
  const [filterFundSource, setFilterFundSource] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form State (Add / Edit Modal)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    item_name: "",
    strategic_category: "Office Productivity",
    project_id: "",
    outcome_id: "",
    department_id: "",
    office_location: "Central Office",
    fund_source: "General Appropriations Act (GAA)",
    unit_cost: "",
    yearly_quantities: {},
    justification: "",
    is_expansion: false
  });

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Capitalization and UACS Auto-Resolution Helper (DBM ₱50,000.00 Threshold + Training Expenses Code)
  const getAutoClassification = (name, cost, category) => {
    const unitCostNum = parseFloat(cost) || 0;
    const isCO = unitCostNum >= 50000.00;
    const lower = (name || "").toLowerCase();

    // Mandated by DICT Guidelines Pg. 24: Training Expenses (MOOE)
    if (lower.includes("training") || lower.includes("seminar") || lower.includes("workshop")) {
      return {
        expClass: "Maintenance and Other Operating Expenses",
        uacs: "50202010 00 - Training Expenses (MOOE)"
      };
    }

    if (category === "Office Productivity") {
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

    if (category === "Continuing Costs/Expenses") {
      if (lower.includes("subscription") || lower.includes("cloud") || lower.includes("internet") || lower.includes("license")) {
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

  const getDepartmentName = (deptId) => {
    if (!deptId) return "Central Office";
    const d = departments.find(dept => (dept.department_id || dept.id) === deptId || String(dept.department_id || dept.id) === String(deptId));
    return d ? (d.department_name || d.name) : `Dept ${deptId}`;
  };

  const loadAllLedgers = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Master Resource Ledger Items (Part IV.A) using safe pagination
      let allItems = [];
      const fetchLimit = 100;
      const pRes = await fetch(
        `${apiUrl}/api/admin/proposals?issp_period=${encodeURIComponent(activeCycle)}&skip=0&limit=${fetchLimit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (pRes.ok) {
        const pData = await pRes.json();
        const pageItems = Array.isArray(pData) ? pData : (pData.data || []);
        const total = pData.total !== undefined ? pData.total : pageItems.length;
        allItems = [...pageItems];

        if (total > allItems.length) {
          let currentSkip = fetchLimit;
          while (currentSkip < total) {
            const nextRes = await fetch(
              `${apiUrl}/api/admin/proposals?issp_period=${encodeURIComponent(activeCycle)}&skip=${currentSkip}&limit=${fetchLimit}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (nextRes.ok) {
              const nextData = await nextRes.json();
              const nextItems = Array.isArray(nextData) ? nextData : (nextData.data || []);
              if (nextItems.length === 0) break;
              allItems = [...allItems, ...nextItems];
              currentSkip += fetchLimit;
            } else {
              break;
            }
          }
        }
      } else {
        const fallbackRes = await fetch(
          `${apiUrl}/api/admin/proposals?issp_period=${encodeURIComponent(activeCycle)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!fallbackRes.ok) {
          const errData = await fallbackRes.json().catch(() => ({}));
          const detail = typeof errData.detail === "object" ? JSON.stringify(errData.detail) : errData.detail;
          throw new Error(detail || "Failed to load Part IV.A resource items.");
        }
        const fallbackData = await fallbackRes.json();
        allItems = Array.isArray(fallbackData) ? fallbackData : (fallbackData.data || []);
      }
      setItems(allItems);

      // 2. Fetch Strategic ICT Projects (Part III.E Link)
      const projRes = await fetch(`${apiUrl}/api/admin/ict-projects?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (projRes.ok) setProjects(await projRes.json());

      // 3. Fetch Organizational Outcomes (Part I.A.4 Link)
      const outRes = await fetch(`${apiUrl}/api/admin/outcomes?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (outRes.ok) setOutcomes(await outRes.json());

      // 4. Fetch Departments
      const deptRes = await fetch(`${apiUrl}/api/admin/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (deptRes.ok) {
        setDepartments(await deptRes.json());
      } else {
        const supplyDeptRes = await fetch(`${apiUrl}/api/supply/departments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (supplyDeptRes.ok) setDepartments(await supplyDeptRes.json());
      }
    } catch (err) {
      setError(err.message || "Failed to load ledger resources.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      loadAllLedgers();
    }
  }, [token, activeCycle]);

  // Open Creation Modal (Initializes physical targets across all dynamic planning years)
  const handleOpenCreateModal = () => {
    setEditingId(null);
    const initialQtys = {};
    (planningYears || []).forEach(yr => {
      initialQtys[String(yr)] = 0;
    });

    setForm({
      item_name: "",
      strategic_category: "Office Productivity",
      project_id: "",
      outcome_id: outcomes.length > 0 ? String(outcomes[0].id) : "1",
      department_id: departments.length > 0 ? String(departments[0].department_id || departments[0].id) : "1",
      office_location: "Central Office",
      fund_source: "General Appropriations Act (GAA)",
      unit_cost: "",
      yearly_quantities: initialQtys,
      justification: "",
      is_expansion: false
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal (Loads quantities mapped across dynamic planning years)
  const handleOpenEditModal = (item) => {
    setEditingId(item.id);
    const initialQtys = {};
    (planningYears || []).forEach((yr, idx) => {
      if (item.yearly_quantities && item.yearly_quantities[String(yr)] !== undefined) {
        initialQtys[String(yr)] = item.yearly_quantities[String(yr)];
      } else if (idx === 0) {
        initialQtys[String(yr)] = item.year_1_qty || 0;
      } else if (idx === 1) {
        initialQtys[String(yr)] = item.year_2_qty || 0;
      } else if (idx === 2) {
        initialQtys[String(yr)] = item.year_3_qty || 0;
      } else {
        initialQtys[String(yr)] = 0;
      }
    });

    setForm({
      item_name: item.item_name || "",
      strategic_category: item.strategic_category || "Office Productivity",
      project_id: item.project_id || "",
      outcome_id: String(item.outcome_id || (outcomes[0]?.id || "1")),
      department_id: String(item.department_id || (departments[0]?.department_id || departments[0]?.id || "1")),
      office_location: item.office_location || "Central Office",
      fund_source: item.fund_source || "General Appropriations Act (GAA)",
      unit_cost: String(item.unit_cost || "0"),
      yearly_quantities: initialQtys,
      justification: item.justification || "",
      is_expansion: !!item.is_expansion
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  // Save / Update Dispatcher
  const handleSaveItem = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const costNum = parseFloat(form.unit_cost);
    if (isNaN(costNum) || costNum <= 0) {
      setError("Please specify a valid unit cost greater than ₱0.00.");
      return;
    }

    setSubmitting(true);
    try {
      // Dynamic extraction of multi-year quantities
      const yQtys = {};
      (planningYears || []).forEach(yr => {
        yQtys[String(yr)] = parseInt(form.yearly_quantities?.[String(yr)], 10) || 0;
      });

      // Backward compatibility fallback assignments
      const q1 = (planningYears && planningYears[0] && yQtys[String(planningYears[0])]) || 0;
      const q2 = (planningYears && planningYears[1] && yQtys[String(planningYears[1])]) || 0;
      const q3 = (planningYears && planningYears[2] && yQtys[String(planningYears[2])]) || 0;

      if (editingId) {
        const payload = {
          item_name: form.item_name.trim(),
          unit_cost: costNum,
          strategic_category: form.strategic_category,
          project_id: form.project_id ? form.project_id : null,
          office_location: form.office_location,
          fund_source: form.fund_source,
          justification: form.justification.trim() || null,
          year_1_qty: q1,
          year_2_qty: q2,
          year_3_qty: q3,
          yearly_quantities: yQtys
        };

        let res = await fetch(`${apiUrl}/api/admin/proposals/${editingId}/override`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const altRes = await fetch(`${apiUrl}/api/admin/proposals/${editingId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          if (altRes.ok) res = altRes;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const detail = typeof errData.detail === "object" ? JSON.stringify(errData.detail) : errData.detail;
          throw new Error(detail || "Failed to update resource item.");
        }
        setSuccess(`Line item '${form.item_name}' updated successfully.`);
      } else {
        const isContinuing = form.strategic_category === "Continuing Costs/Expenses";
        const isSub = isContinuing || form.item_name.toLowerCase().includes("subscription");
        const categoryVal = isSub ? "Subscription" : (form.item_name.toLowerCase().includes("software") ? "Software" : "Hardware");

        const payload = {
          outcome_id: parseInt(form.outcome_id, 10) || 1,
          department_id: parseInt(form.department_id, 10) || 1,
          category: categoryVal,
          strategic_category: form.strategic_category,
          office_location: form.office_location,
          fund_source: form.fund_source,
          item_select: "other",
          item_name: form.item_name.trim(),
          unit_cost: costNum,
          year_1_qty: q1,
          year_2_qty: q2,
          year_3_qty: q3,
          yearly_quantities: yQtys,
          project_id: form.project_id ? form.project_id : null,
          justification: form.justification.trim() || "Administrative Part IV.A allocation",
          is_expansion: form.is_expansion
        };

        let res = await fetch(`${apiUrl}/api/admin/proposals`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (res.status === 404 || res.status === 405) {
          res = await fetch(`${apiUrl}/api/dept/proposals`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const detail = typeof errData.detail === "object" ? JSON.stringify(errData.detail) : errData.detail;
          throw new Error(detail || "Failed to create resource item.");
        }
        setSuccess(`Resource item '${form.item_name}' recorded in Part IV.A ledger.`);
      }

      handleCloseModal();
      loadAllLedgers();
    } catch (err) {
      setError(err.message || "Operation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (id, name) => {
    if (!window.confirm(`Delete line item '${name}' from Part IV.A?`)) return;
    setError(null);
    setSuccess(null);
    try {
      let res = await fetch(`${apiUrl}/api/admin/proposals/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 404 || res.status === 405) {
        res = await fetch(`${apiUrl}/api/dept/proposals/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = typeof errData.detail === "object" ? JSON.stringify(errData.detail) : errData.detail;
        throw new Error(detail || "Failed to delete line item.");
      }
      setSuccess(`Line item '${name}' removed from ledger.`);
      loadAllLedgers();
    } catch (err) {
      setError(err.message);
    }
  };

  // Macro Summary Calculations
  const totalPartIVACost = items.reduce((sum, item) => sum + Number(item.total_cost || (item.unit_cost * item.total_qty) || 0), 0);
  const totalCOCost = items.filter(i => i.expenditure_class === "Capital Outlay").reduce((sum, item) => sum + Number(item.total_cost || (item.unit_cost * item.total_qty) || 0), 0);
  const totalMOOECost = items.filter(i => i.expenditure_class !== "Capital Outlay").reduce((sum, item) => sum + Number(item.total_cost || (item.unit_cost * item.total_qty) || 0), 0);
  const totalPhysicalUnits = items.reduce((sum, item) => sum + Number(item.total_qty || 0), 0);

  // Category Bands
  const strategicBands = [
    "Office Productivity",
    "Internal ICT Projects",
    "Cross-Agency ICT Projects",
    "Continuing Costs/Expenses"
  ];

  // Dynamic Multi-Year Filtering Pipeline
  const filterItems = (itemList) => {
    return itemList.filter(item => {
      // 1. Dynamic Year Filter
      if (selectedYear !== "all") {
        let q = 0;
        if (item.yearly_quantities && item.yearly_quantities[selectedYear] !== undefined) {
          q = Number(item.yearly_quantities[selectedYear] || 0);
        } else {
          const yrIdx = planningYears.indexOf(Number(selectedYear));
          if (yrIdx === 0) q = Number(item.year_1_qty || 0);
          else if (yrIdx === 1) q = Number(item.year_2_qty || 0);
          else if (yrIdx === 2) q = Number(item.year_3_qty || 0);
        }
        if (q <= 0) return false;
      }

      // 2. Category Filter
      if (filterCategory !== "All" && item.strategic_category !== filterCategory) return false;

      // 3. Expenditure Class Filter
      if (filterExpClass === "CO" && item.expenditure_class !== "Capital Outlay") return false;
      if (filterExpClass === "MOOE" && item.expenditure_class === "Capital Outlay") return false;

      // 4. Fund Source Filter
      if (filterFundSource !== "All" && item.fund_source !== filterFundSource) return false;

      // 5. Search Text
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.item_name || "").toLowerCase().includes(q);
        const matchesUacs = (item.uacs_object_code || "").toLowerCase().includes(q);
        const matchesProj = (item.project_rel?.project_title || item.project?.project_title || "").toLowerCase().includes(q);
        const matchesJust = (item.justification || "").toLowerCase().includes(q);
        if (!matchesName && !matchesUacs && !matchesProj && !matchesJust) return false;
      }

      return true;
    });
  };

  const getFilteredItems = filterItems(items);

  // Modal derived preview calculations
  const modalClassPreview = getAutoClassification(form.item_name, form.unit_cost, form.strategic_category);
  const modalTotalQty = Object.values(form.yearly_quantities || {}).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
  const modalTotalCost = (parseFloat(form.unit_cost) || 0) * modalTotalQty;

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-bold text-base flex items-center gap-2 font-serif">
            <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Part IV.A: Detailed Resource Deployment &amp; Cost Breakdown</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Maintain itemized resource allocations across dynamic multi-year horizons (FY {activeCycle}). Automatically aligns with DBM capitalization thresholds (₱50k CO vs MOOE) and UACS ledgers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenCreateModal}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Resource Line Item</span>
          </button>
          <button
            onClick={loadAllLedgers}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 font-bold shadow-xs"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-red-955/40 border border-rose-200 dark:border-red-900 text-rose-700 dark:text-red-300 rounded-lg flex items-start gap-2.5 animate-fadeIn shadow-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg flex items-start gap-2.5 animate-fadeIn shadow-xs">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Aggregate Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Part IV.A Total Investment</span>
          <div className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(totalPartIVACost)}</div>
          <span className="text-[10px] text-slate-500 block">Total Physical Units: {totalPhysicalUnits} items</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Capital Outlay (CO &ge; ₱50k)</span>
          <div className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{formatPHP(totalCOCost)}</div>
          <span className="text-[10px] text-slate-500 block">
            {totalPartIVACost > 0 ? ((totalCOCost / totalPartIVACost) * 100).toFixed(1) : 0}% of overall outlays
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Operating Services (MOOE &lt; ₱50k)</span>
          <div className="font-mono text-lg font-bold text-purple-600 dark:text-purple-400">{formatPHP(totalMOOECost)}</div>
          <span className="text-[10px] text-slate-500 block">
            {totalPartIVACost > 0 ? ((totalMOOECost / totalPartIVACost) * 100).toFixed(1) : 0}% of overall outlays
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Planning Cycle Horizon</span>
          <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">FY {activeCycle}</div>
          <span className="text-[10px] text-slate-500 block">{planningYears.length} Fiscal Year Deployment Schedule</span>
        </div>
      </div>

      {/* Multi-Dimensional Dynamic Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          {/* Dynamic Fiscal Year Filter Buttons */}
          <div className="flex bg-slate-100 dark:bg-slate-955 p-1 rounded-lg border border-slate-200 dark:border-slate-800 self-start overflow-x-auto max-w-full">
            <button
              onClick={() => setSelectedYear("all")}
              className={`px-3 py-1.5 rounded-md font-bold text-[10px] cursor-pointer transition-all whitespace-nowrap ${
                selectedYear === "all" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              All Years (Combined)
            </button>
            {planningYears.map((yr, idx) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(String(yr))}
                className={`px-3 py-1.5 rounded-md font-bold text-[10px] cursor-pointer transition-all whitespace-nowrap ${
                  selectedYear === String(yr) ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Year {idx + 1} (FY {yr})
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search resource, UACS, or project..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 placeholder-slate-400"
            />
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-850">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600 dark:text-slate-400 font-semibold text-[11px]">Category:</span>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 outline-none text-xs cursor-pointer"
            >
              <option value="All">All Categories</option>
              <option value="Office Productivity">Office Productivity</option>
              <option value="Internal ICT Projects">Internal ICT Projects</option>
              <option value="Cross-Agency ICT Projects">Cross-Agency Projects</option>
              <option value="Continuing Costs/Expenses">Continuing Costs</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 dark:text-slate-400 font-semibold text-[11px]">Class:</span>
            <select
              value={filterExpClass}
              onChange={e => setFilterExpClass(e.target.value)}
              className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 outline-none text-xs cursor-pointer"
            >
              <option value="All">All Classes</option>
              <option value="CO">Capital Outlay (CO)</option>
              <option value="MOOE">MOOE Services</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 dark:text-slate-400 font-semibold text-[11px]">Fund:</span>
            <select
              value={filterFundSource}
              onChange={e => setFilterFundSource(e.target.value)}
              className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 outline-none text-xs cursor-pointer"
            >
              <option value="All">All Fund Sources</option>
              <option value="General Appropriations Act (GAA)">GAA (National Budget)</option>
              <option value="Foreign-Assisted Projects (FAP)">FAP (Loans / Grants)</option>
              <option value="Locally Funded">Locally Funded</option>
              <option value="Other Income Generating Sources">Other Income</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Ledger Table (Grouped into Four Strategic Categories) */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading Part IV.A resource deployment ledgers...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 italic shadow-sm">
            No resource line items have been added to the Part IV.A ledger yet. Click "Add Resource Line Item" to start.
          </div>
        ) : (
          strategicBands.map(categoryBand => {
            const bandItems = getFilteredItems.filter(i => i.strategic_category === categoryBand);
            if (bandItems.length === 0 && filterCategory !== "All") return null;

            const bandSubtotal = bandItems.reduce((sum, item) => {
              const unit = Number(item.unit_cost || 0);
              if (selectedYear !== "all") {
                const q = item.yearly_quantities?.[selectedYear] !== undefined
                  ? Number(item.yearly_quantities[selectedYear] || 0)
                  : (selectedYear === String(planningYears[0]) ? Number(item.year_1_qty || 0) : 0);
                return sum + (unit * q);
              }
              return sum + Number(item.total_cost || (unit * Number(item.total_qty || 0)));
            }, 0);

            return (
              <div key={categoryBand} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm space-y-0">
                {/* Category Header Band */}
                <div className="p-4 bg-slate-50 dark:bg-slate-955 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">{categoryBand}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                      {bandItems.length} line items
                    </span>
                  </div>
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    Band Total: <strong className="text-emerald-600 dark:text-emerald-400">{formatPHP(bandSubtotal)}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 text-slate-500 font-bold uppercase text-[9px] tracking-wider">
                        <th className="p-3 w-2/5">Item Description &amp; Specifications</th>
                        <th className="p-3 w-40">UACS Accounting Code</th>
                        <th className="p-3">Office / Fund Source</th>
                        <th className="p-3 text-right">Unit Rate</th>
                        <th className="p-3 text-center">Physical Targets</th>
                        <th className="p-3 text-right font-bold text-slate-900 dark:text-white">Line Total</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {bandItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                            No active items match the current filters for {categoryBand}.
                          </td>
                        </tr>
                      ) : (
                        bandItems.map(item => {
                          const unitCostVal = Number(item.unit_cost || 0);
                          let currentQty = 0;
                          if (selectedYear === "all") {
                            currentQty = Number(item.total_qty || 0);
                          } else {
                            if (item.yearly_quantities && item.yearly_quantities[selectedYear] !== undefined) {
                              currentQty = Number(item.yearly_quantities[selectedYear] || 0);
                            } else {
                              const yrIdx = planningYears.indexOf(Number(selectedYear));
                              if (yrIdx === 0) currentQty = Number(item.year_1_qty || 0);
                              else if (yrIdx === 1) currentQty = Number(item.year_2_qty || 0);
                              else if (yrIdx === 2) currentQty = Number(item.year_3_qty || 0);
                              else currentQty = 0;
                            }
                          }

                          const computedLineTotal = unitCostVal * currentQty;
                          const linkedProject = item.project_rel?.project_title || item.project?.project_title || (projects.find(p => p.id === item.project_id)?.project_title);

                          return (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-955/30 transition-colors">
                              {/* Description */}
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-slate-200">{item.item_name}</div>
                                
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  {linkedProject && (
                                    <div className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                                      <FolderKanban className="w-3 h-3 shrink-0" />
                                      <span>{linkedProject}</span>
                                    </div>
                                  )}
                                  {item.needs_assessment_id && (
                                    <span className="text-[8.5px] px-1.5 py-0.2 rounded font-bold uppercase bg-teal-50 dark:bg-teal-955 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900 flex items-center gap-0.5 font-mono">
                                      <ClipboardCheck className="w-2.5 h-2.5" /> Sec 8.0 Linked
                                    </span>
                                  )}
                                  {item.created_by_students && (
                                    <span className="text-[8px] px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold uppercase flex items-center gap-0.5">
                                      <Sparkles className="w-2.5 h-2.5" /> In-House / Non-Commercial
                                    </span>
                                  )}
                                </div>

                                {item.justification && (
                                  <div className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-md" title={item.justification}>
                                    {item.justification}
                                  </div>
                                )}
                              </td>

                              {/* UACS & Class */}
                              <td className="p-3">
                                <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 block">{item.uacs_object_code || "50604050 03"}</span>
                                <span className={`inline-block mt-0.5 text-[8.5px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  item.expenditure_class === "Capital Outlay"
                                    ? "bg-blue-50 dark:bg-blue-955 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
                                    : "bg-purple-50 dark:bg-purple-955 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400"
                                }`}>
                                  {item.expenditure_class === "Capital Outlay" ? "Capital Outlay (CO)" : "MOOE"}
                                </span>
                              </td>

                              {/* Office & Fund */}
                              <td className="p-3">
                                <div className="text-slate-800 dark:text-slate-300 font-medium">
                                  {item.target_office_automated || getDepartmentName(item.department_id) || item.office_location || "Central Office"}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.fund_source ? item.fund_source.split(" (")[0] : "GAA"}</div>
                              </td>

                              {/* Unit Rate */}
                              <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                {formatPHP(item.unit_cost)}
                              </td>

                              {/* Physical Targets */}
                              <td className="p-3 text-center font-mono">
                                {selectedYear === "all" ? (
                                  <div>
                                    <span className="font-bold text-slate-900 dark:text-slate-200 text-xs">{item.total_qty} units</span>
                                    <span className="block text-[9px] text-slate-400 mt-0.5">
                                      {planningYears.map(y => `FY${y}: ${(item.yearly_quantities && item.yearly_quantities[String(y)] !== undefined) ? item.yearly_quantities[String(y)] : 0}`).join(" | ")}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="font-bold text-slate-900 dark:text-slate-200">{currentQty} units</span>
                                )}
                              </td>

                              {/* Line Total */}
                              <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                {formatPHP(computedLineTotal)}
                              </td>

                              {/* Actions */}
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditModal(item)}
                                    className="p-1.5 bg-slate-100 dark:bg-slate-955 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
                                    title="Edit Line Item"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id, item.item_name)}
                                    className="p-1.5 bg-slate-100 dark:bg-slate-955 hover:bg-rose-100 dark:hover:bg-red-955 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-red-400 rounded transition-colors cursor-pointer"
                                    title="Delete Line Item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: ADD / EDIT PART IV.A RESOURCE LINE ITEM */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {editingId ? "Update Part IV.A Resource Item" : "Add Part IV.A Resource Deployment Item"}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  Standardized DICT ISSP v.2026 Resource Accounting ({activeCycle})
                </span>
              </div>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 text-xs">
              {/* Item Name */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Resource Item Description / Specification</label>
                <input
                  type="text"
                  required
                  value={form.item_name}
                  onChange={e => setForm({ ...form, item_name: e.target.value })}
                  placeholder="e.g. Heavy-Duty Developer Workstation Laptop"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              {/* Strategic Category & Project */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Strategic Category (Spending Bucket)</label>
                  <select
                    value={form.strategic_category}
                    onChange={e => setForm({ ...form, strategic_category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="Office Productivity">Office Productivity</option>
                    <option value="Internal ICT Projects">Internal ICT Projects</option>
                    <option value="Cross-Agency ICT Projects">Cross-Agency ICT Projects</option>
                    <option value="Continuing Costs/Expenses">Continuing Costs/Expenses</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Linked Strategic ICT Project</label>
                  <select
                    value={form.project_id}
                    onChange={e => setForm({ ...form, project_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="">-- No Project Link (Office / Continuing) --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Outcome & Department */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Organizational Outcome (Part I.A.4)</label>
                  <select
                    value={form.outcome_id}
                    onChange={e => setForm({ ...form, outcome_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    {outcomes.map(o => (
                      <option key={o.id} value={String(o.id)}>{o.outcome_name || o.program_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Department / Office</label>
                  <select
                    value={form.department_id}
                    onChange={e => setForm({ ...form, department_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    {departments.map(d => {
                      const dId = d.department_id !== undefined ? d.department_id : d.id;
                      const dName = d.department_name !== undefined ? d.department_name : d.name;
                      return (
                        <option key={dId} value={String(dId)}>{dName}</option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Location & Fund Source */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Deployment Location</label>
                  <select
                    value={form.office_location}
                    onChange={e => setForm({ ...form, office_location: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="Central Office">Central Office</option>
                    <option value="Field/Regional Office">Field/Regional Office</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Financing Source</label>
                  <select
                    value={form.fund_source}
                    onChange={e => setForm({ ...form, fund_source: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="General Appropriations Act (GAA)">GAA (National Budget)</option>
                    <option value="Foreign-Assisted Projects (FAP)">FAP (Loans / Grants)</option>
                    <option value="Locally Funded">Locally Funded</option>
                    <option value="Other Income Generating Sources">Other Income</option>
                  </select>
                </div>
              </div>

              {/* Unit Cost & Capitalization Preview */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Unit Cost (PHP ₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.unit_cost}
                    onChange={e => setForm({ ...form, unit_cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>

                {/* Live Auto Classification Pill */}
                <div className="p-2.5 bg-slate-100 dark:bg-slate-955 rounded-lg border border-slate-200 dark:border-slate-850 space-y-1">
                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Auto-Resolved Accounting</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      modalClassPreview.expClass === "Capital Outlay" ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800" : "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                    }`}>
                      {modalClassPreview.expClass}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono block truncate" title={modalClassPreview.uacs}>
                    {modalClassPreview.uacs}
                  </span>
                </div>
              </div>

              {/* DYNAMIC MULTI-YEAR PHYSICAL TARGETS GRID */}
              <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-850 space-y-3">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                  Multi-Year Physical Targets ({planningYears.length} Years Horizon)
                </span>
                
                <div 
                  style={{ 
                    display: "grid", 
                    gridTemplateColumns: `repeat(${Math.min(planningYears.length, 4)}, minmax(0, 1fr))`, 
                    gap: "0.75rem" 
                  }}
                >
                  {planningYears.map((yr, idx) => (
                    <div key={yr} className="space-y-1">
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        FY {yr} (Yr {idx + 1})
                      </label>
                      <input
                        type="number" 
                        min="0" 
                        value={form.yearly_quantities?.[String(yr)] ?? 0}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setForm(prev => ({
                            ...prev,
                            yearly_quantities: {
                              ...prev.yearly_quantities,
                              [String(yr)]: val
                            }
                          }));
                        }}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-center text-slate-900 dark:text-white font-mono font-bold"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-850 flex justify-between items-center text-[10px] font-mono">
                  <span className="text-slate-600 dark:text-slate-400">Total Physical Target: <strong>{modalTotalQty} units</strong></span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Total Outlay: {formatPHP(modalTotalCost)}</span>
                </div>
              </div>

              {/* Technical Justification */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Technical Justification</label>
                <textarea
                  rows={2}
                  value={form.justification}
                  onChange={e => setForm({ ...form, justification: e.target.value })}
                  placeholder="Record technical necessity or operational requirement..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-850 rounded-lg text-slate-900 dark:text-white resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Persisting..." : editingId ? "Commit Line Modifications" : "Add Line Item to Part IV.A"}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}