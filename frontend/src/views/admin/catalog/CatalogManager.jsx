// frontend/src/views/admin/Catalog/CatalogManager.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { 
  getCatalogItems, 
  createCatalogItem, 
  updateCatalogItem, 
  deleteCatalogItem,
  getApprovedCanvasProposals,
  getPolicySettings,
  getDepartments
} from "../../../api/admin";
import { 
  Package, 
  Plus, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  ToggleLeft, 
  ToggleRight, 
  FileSearch, 
  Calendar, 
  Search, 
  Filter, 
  Edit3, 
  Save, 
  X, 
  Clock, 
  ShieldCheck, 
  Tag, 
  Layers, 
  ExternalLink,
  Info,
  SlidersHorizontal,
  Building,
  Trash2,
  AlertTriangle,
  Check
} from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "computing_devices", label: "Computing Devices (Desktops, Laptops, Workstations)" },
  { value: "networking", label: "Networking & Connectivity (Switches, Routers, APs)" },
  { value: "printers_imaging", label: "Printers & Imaging (Network Lasers, Scanners)" },
  { value: "software", label: "Software & Subscriptions (Cloud, Suites, Antivirus)" },
  { value: "other", label: "Other Operations & Technical Equipment" }
];

export default function CatalogManager() {
  const { user } = useAuth();

  // Data States
  const [items, setItems] = useState([]);
  const [approvedProposals, setApprovedProposals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [warningDays, setWarningDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All"); // All, Active, ExpiringSoon, Expired, Disabled

  // Form State for Creating New Catalog Items
  const initialFormState = {
    item_key: "",
    display_name: "",
    standard_unit_cost: "",
    category: "computing_devices",
    allowed_offices: "",
    supplier_name: "",
    canvas_evidence_url: "",
    canvas_expiration_date: ""
  };
  const [form, setForm] = useState(initialFormState);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState(initialFormState);

  const token = user?.token || user?.accessToken || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isExpired = (dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && d < new Date();
  };

  const isExpiringSoon = useCallback((dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    const boundary = new Date();
    boundary.setDate(now.getDate() + (warningDays || 14));
    return d >= now && d <= boundary;
  }, [warningDays]);

  const getDaysRemaining = (dateString) => {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const diffTime = d - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const fetchCatalogData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [catalogData, proposalsData, policyData, deptsData] = await Promise.all([
        getCatalogItems(token).catch(() => []),
        getApprovedCanvasProposals(token).catch(() => []),
        getPolicySettings(token).catch(() => null),
        getDepartments(token).catch(() => [])
      ]);

      setItems(Array.isArray(catalogData) ? catalogData : []);
      setApprovedProposals(Array.isArray(proposalsData) ? proposalsData : []);
      setDepartments(Array.isArray(deptsData) ? deptsData : []);

      if (policyData?.canvas_expiration_warning_days) {
        setWarningDays(parseInt(policyData.canvas_expiration_warning_days, 10) || 14);
      }
    } catch (e) {
      setError(e.message || "Failed to load reference catalog data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCatalogData();
  }, [fetchCatalogData]);

  // Reference an Approved Custom Proposal to Auto-Fill the Creation Form
  const handleReferenceSelect = (e) => {
    const refId = e.target.value;
    if (!refId) return;

    const selected = approvedProposals.find(item => String(item.id) === String(refId));
    if (selected) {
      const nameLower = (selected.display_name || "").toLowerCase();
      let inferredCategory = "computing_devices";
      if (selected.type === "MOOE" || nameLower.includes("subscription") || nameLower.includes("license") || nameLower.includes("software")) {
        inferredCategory = "software";
      } else if (nameLower.includes("switch") || nameLower.includes("router") || nameLower.includes("access point") || nameLower.includes("network")) {
        inferredCategory = "networking";
      } else if (nameLower.includes("printer") || nameLower.includes("scanner") || nameLower.includes("copier")) {
        inferredCategory = "printers_imaging";
      }

      setForm({
        ...form,
        item_key: selected.display_name.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 50),
        display_name: selected.display_name,
        standard_unit_cost: String(selected.unit_cost),
        category: inferredCategory,
        supplier_name: selected.supplier_name || "",
        canvas_evidence_url: selected.canvas_evidence_url || "",
        canvas_expiration_date: selected.canvas_expiration_date ? selected.canvas_expiration_date.split("T")[0] : ""
      });
      setSuccess(`Parameters auto-populated from approved request: '${selected.display_name}'.`);
    }
  };

  // Toggle quick department chip in allowed_offices string
  const toggleOfficeInForm = (deptName, isEditing = false) => {
    const targetForm = isEditing ? editForm : form;
    const setTargetForm = isEditing ? setEditForm : setForm;
    const currentList = targetForm.allowed_offices
      ? targetForm.allowed_offices.split(",").map(o => o.trim()).filter(Boolean)
      : [];

    let nextList;
    if (currentList.includes(deptName)) {
      nextList = currentList.filter(o => o !== deptName);
    } else {
      nextList = [...currentList, deptName];
    }
    setTargetForm({ ...targetForm, allowed_offices: nextList.join(", ") });
  };

  // Submit Handler for Creating a New Catalog Item
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const keyClean = form.item_key.trim().toLowerCase();
    if (keyClean === "other") {
      setError("Registration Error: 'other' is a reserved system namespace and cannot be used as an item key.");
      return;
    }

    const costNum = parseFloat(form.standard_unit_cost);
    if (isNaN(costNum) || costNum <= 0) {
      setError("Please specify a valid standard unit price greater than ₱0.00.");
      return;
    }

    setSubmitting(true);
    const parsedOffices = form.allowed_offices
      ? form.allowed_offices.split(",").map(o => o.trim()).filter(Boolean)
      : [];

    try {
      const expirationPayload = form.canvas_expiration_date 
        ? new Date(form.canvas_expiration_date).toISOString() 
        : null;

      await createCatalogItem(token, {
        item_key: keyClean,
        display_name: form.display_name.trim(),
        standard_unit_cost: costNum,
        category: form.category,
        allowed_offices: parsedOffices,
        supplier_name: form.supplier_name.trim() || null,
        canvas_evidence_url: form.canvas_evidence_url.trim() || null,
        canvas_expiration_date: expirationPayload,
        is_active: true
      });

      setSuccess(`Catalog reference item '${form.display_name}' created successfully.`);
      setForm(initialFormState);
      fetchCatalogData();
    } catch (err) {
      setError(err.message || "Failed to register catalog item.");
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal for an Existing Catalog Item
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setEditForm({
      item_key: item.item_key || "",
      display_name: item.display_name || "",
      standard_unit_cost: String(item.standard_unit_cost || "0"),
      category: item.category || "computing_devices",
      allowed_offices: Array.isArray(item.allowed_offices) ? item.allowed_offices.join(", ") : "",
      supplier_name: item.supplier_name || "",
      canvas_evidence_url: item.canvas_evidence_url || "",
      canvas_expiration_date: item.canvas_expiration_date ? item.canvas_expiration_date.split("T")[0] : ""
    });
  };

  // Submit Handler for Updating an Existing Catalog Item
  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    setError(null);
    setSuccess(null);
    const costNum = parseFloat(editForm.standard_unit_cost);
    if (isNaN(costNum) || costNum <= 0) {
      setError("Please specify a valid unit price greater than ₱0.00.");
      return;
    }

    setSubmitting(true);
    const parsedOffices = editForm.allowed_offices
      ? editForm.allowed_offices.split(",").map(o => o.trim()).filter(Boolean)
      : [];

    try {
      const expirationPayload = editForm.canvas_expiration_date 
        ? new Date(editForm.canvas_expiration_date).toISOString() 
        : null;

      await updateCatalogItem(token, editingItem.id, {
        display_name: editForm.display_name.trim(),
        standard_unit_cost: costNum,
        category: editForm.category,
        allowed_offices: parsedOffices,
        supplier_name: editForm.supplier_name.trim() || null,
        canvas_evidence_url: editForm.canvas_evidence_url.trim() || null,
        canvas_expiration_date: expirationPayload
      });

      setSuccess(`Catalog item '${editForm.display_name}' updated successfully.`);
      setEditingItem(null);
      fetchCatalogData();
    } catch (err) {
      setError(err.message || "Failed to update catalog item.");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Catalog Item with Confirmation
  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Permanently remove catalog reference '${item.display_name}' (${item.item_key})? This cannot be undone.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      await deleteCatalogItem(token, item.id);
      setSuccess(`Catalog reference '${item.display_name}' deleted successfully.`);
      fetchCatalogData();
    } catch (err) {
      setError(err.message || "Failed to delete catalog item.");
    }
  };

  // Toggle Active / Disabled State
  const toggleItemState = async (item) => {
    setError(null);
    setSuccess(null);
    try {
      await updateCatalogItem(token, item.id, {
        is_active: !item.is_active
      });
      setSuccess(`Status updated: '${item.display_name}' is now ${!item.is_active ? "Active" : "Disabled"}.`);
      fetchCatalogData();
    } catch (err) {
      setError(err.message || "Failed to toggle item active status.");
    }
  };

  // KPI Metrics Calculations
  const totalCount = items.length;
  const activeCount = items.filter(i => i.is_active && !isExpired(i.canvas_expiration_date)).length;
  const expiredCount = items.filter(i => isExpired(i.canvas_expiration_date)).length;
  const expiringSoonCount = items.filter(i => isExpiringSoon(i.canvas_expiration_date)).length;
  const uniqueCategoriesCount = new Set(items.map(i => i.category)).size;

  // Multi-Condition Filter Pipeline
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category Filter
      if (filterCategory !== "All" && item.category !== filterCategory) return false;

      const expired = isExpired(item.canvas_expiration_date);
      const expiringSoon = isExpiringSoon(item.canvas_expiration_date);

      // Status Filter
      if (filterStatus === "Active" && (!item.is_active || expired)) return false;
      if (filterStatus === "ExpiringSoon" && !expiringSoon) return false;
      if (filterStatus === "Expired" && !expired) return false;
      if (filterStatus === "Disabled" && item.is_active) return false;

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (item.display_name || "").toLowerCase();
        const key = (item.item_key || "").toLowerCase();
        const cat = (item.category || "").toLowerCase();
        const supp = (item.supplier_name || "").toLowerCase();
        const offices = Array.isArray(item.allowed_offices) ? item.allowed_offices.join(" ").toLowerCase() : "";
        return name.includes(q) || key.includes(q) || cat.includes(q) || supp.includes(q) || offices.includes(q);
      }
      return true;
    });
  }, [items, filterCategory, filterStatus, searchQuery, isExpiringSoon]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans">
      
      {/* Top Banner Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base">
              Price Reference Catalog &amp; Quotation Validity Manager
            </h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Maintain institutional standard specifications, approved unit cost ceilings, and market quotation proofs. Department planners selecting items from this active catalog bypass external market canvassing delays.
          </p>
        </div>
        <button
          onClick={fetchCatalogData}
          disabled={loading}
          className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Catalog</span>
        </button>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total References</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalCount} Items</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active &amp; Pre-Approved</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{activeCount} Ready</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Category Groups</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{uniqueCategoriesCount} Groups</h3>
          </div>
        </div>

        <div 
          onClick={() => setFilterStatus("ExpiringSoon")}
          className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            filterStatus === "ExpiringSoon"
              ? "bg-amber-50 dark:bg-amber-955/40 border-amber-400 dark:border-amber-700"
              : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-400"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl shrink-0 ${expiringSoonCount > 0 ? "bg-amber-500 text-white" : "bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400"}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Expiring &le;{warningDays}d</span>
              <h3 className={`text-base font-bold font-mono mt-0.5 ${expiringSoonCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
                {expiringSoonCount} Alerts
              </h3>
            </div>
          </div>
        </div>

        <div 
          onClick={() => setFilterStatus("Expired")}
          className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            filterStatus === "Expired"
              ? "bg-rose-50 dark:bg-rose-955/40 border-rose-400 dark:border-rose-700"
              : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-rose-400"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl shrink-0 ${expiredCount > 0 ? "bg-rose-600 text-white animate-pulse" : "bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400"}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Expired Quotations</span>
              <h3 className={`text-base font-bold font-mono mt-0.5 ${expiredCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}`}>
                {expiredCount} Locked
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Proactive Quotation Expiration Alert Notice */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="p-4 bg-amber-50 dark:bg-amber-955/30 border border-amber-300 dark:border-amber-900/60 rounded-2xl flex items-start gap-3 shadow-xs animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-950 dark:text-amber-200 leading-relaxed flex-1">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-sm text-amber-900 dark:text-amber-300">
                Market Quotation Validity Advisory &bull; Rule 7 Safeguard Active
              </h4>
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400">
                Warning Threshold: {warningDays} Calendar Days
              </span>
            </div>
            <p>
              {expiredCount > 0 ? (
                <span>
                  <strong>{expiredCount} reference item(s)</strong> have expired quotation proofs. Under DBM and DICT rules, department users are prevented from selecting items with expired quotations until an updated quotation canvas is attached.
                </span>
              ) : null}
              {expiringSoonCount > 0 ? (
                <span className={expiredCount > 0 ? " block pt-0.5" : ""}>
                  <strong>{expiringSoonCount} item(s)</strong> will expire within the next {warningDays} days. Please coordinate with accredited vendors to refresh quotation proofs.
                </span>
              ) : null}
            </p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start justify-between gap-2.5 animate-fadeIn shadow-xs">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-800 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Form Panel */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 h-fit space-y-4 shadow-xs">
          <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center gap-1.5 font-serif">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Add Catalog Reference</span>
          </h3>

          {/* Reference approved custom proposals dropdown */}
          <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl">
            <label className="block text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FileSearch className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Reference Approved Custom Proposal</span>
              </span>
              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono font-bold">1-Click Auto-Fill</span>
            </label>
            <select
              onChange={handleReferenceSelect}
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 outline-none text-xs cursor-pointer focus:border-blue-500 font-medium"
            >
              <option value="">-- Choose Approved Proposal --</option>
              {approvedProposals.map((ref) => (
                <option key={ref.id} value={ref.id}>
                  [{ref.type}] {ref.display_name} ({formatPHP(ref.unit_cost)})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Item Key Identifier (Unique, Lowercase)
              </label>
              <input
                type="text"
                required
                value={form.item_key}
                onChange={(e) => setForm({ ...form, item_key: e.target.value })}
                placeholder="e.g. pc_workstation_standard"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none font-mono focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Display Name (Procurement Label)
              </label>
              <input
                type="text"
                required
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="e.g. Standard Administrative Desktop Workstation"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none font-semibold focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Standard Unit Cost (PHP ₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.standard_unit_cost}
                  onChange={(e) => setForm({ ...form, standard_unit_cost: e.target.value })}
                  placeholder="0.00"
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white text-xs outline-none font-mono font-bold focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Category Group
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none cursor-pointer focus:border-blue-500 font-semibold"
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label.split(" (")[0]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Authorized Divisions with Quick Department Chips */}
            <div className="space-y-1.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Authorized Divisions Scope
                </label>
                <span className="text-[9px] text-slate-400 font-mono">Empty = Global Access</span>
              </div>

              {departments.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {departments.slice(0, 8).map(dept => {
                    const dName = dept.department_name || dept.name;
                    const isSelected = form.allowed_offices.split(",").map(o => o.trim()).includes(dName);
                    return (
                      <button
                        key={dept.department_id || dept.id}
                        type="button"
                        onClick={() => toggleOfficeInForm(dName, false)}
                        className={`px-2 py-0.5 rounded text-[9px] transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-blue-600 text-white border-blue-600 font-bold"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                        }`}
                      >
                        {isSelected ? `✓ ${dName}` : `+ ${dName}`}
                      </button>
                    );
                  })}
                </div>
              )}

              <input
                type="text"
                value={form.allowed_offices}
                onChange={(e) => setForm({ ...form, allowed_offices: e.target.value })}
                placeholder="Leave blank for global institutional access (or comma-separated)"
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 mt-1"
              />
            </div>

            {/* Supporting Quotation Proof & Expiration Fields */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider flex justify-between items-center">
                  <span>Accredited Supplier Name</span>
                  <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">Reference</span>
                </label>
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                  placeholder="e.g. Authorized Bidding Solution Provider"
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider flex justify-between items-center">
                  <span>Quotation Canvas URL Link</span>
                  <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">S3 / Vault</span>
                </label>
                <input
                  type="url"
                  value={form.canvas_evidence_url}
                  onChange={(e) => setForm({ ...form, canvas_evidence_url: e.target.value })}
                  placeholder="https://issp-vault.s3.amazonaws.com/canvases/..."
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    <span>Quotation Validity Expiration</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Rule 7 Guard</span>
                </label>
                <input
                  type="date"
                  value={form.canvas_expiration_date}
                  onChange={(e) => setForm({ ...form, canvas_expiration_date: e.target.value })}
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-xs outline-none font-mono cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? "Processing..." : "Add Catalog Item"}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Catalog Listing Table */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-slate-900 dark:text-white font-bold text-xs tracking-wider uppercase font-serif">
                Active Reference Items ({filteredItems.length})
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Pre-approved items available to department planners</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 outline-none text-[11px] cursor-pointer font-semibold"
              >
                <option value="All">All Categories</option>
                <option value="computing_devices">Computing Devices</option>
                <option value="networking">Networking</option>
                <option value="printers_imaging">Printers &amp; Imaging</option>
                <option value="software">Software &amp; Subscriptions</option>
                <option value="other">Other</option>
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="p-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 outline-none text-[11px] cursor-pointer font-semibold"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="ExpiringSoon">Expiring Soon (&le;{warningDays}d)</option>
                <option value="Expired">Expired Quotation</option>
                <option value="Disabled">Disabled</option>
              </select>

              <div className="relative w-44">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter catalog..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 placeholder-slate-400"
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

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Loading standard reference catalog...</span>
              </div>
            ) : filteredItems.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold font-mono">
                    <th className="py-2.5 px-3 w-2/5">Key / Reference Item</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 font-mono">Standard Cost</th>
                    <th className="py-2.5 px-3">Validity &amp; Scope</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredItems.map((item) => {
                    const expired = isExpired(item.canvas_expiration_date);
                    const expiringSoon = isExpiringSoon(item.canvas_expiration_date);
                    const daysLeft = getDaysRemaining(item.canvas_expiration_date);

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${
                          expired 
                            ? "bg-rose-50/40 dark:bg-rose-955/20 hover:bg-rose-50/70"
                            : expiringSoon
                            ? "bg-amber-50/40 dark:bg-amber-955/20 hover:bg-amber-50/70"
                            : "hover:bg-slate-50/80 dark:hover:bg-slate-955/30"
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white text-xs">{item.display_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 select-all">{item.item_key}</div>
                          {item.supplier_name && (
                            <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5">Supplier: {item.supplier_name}</div>
                          )}
                        </td>

                        <td className="py-3 px-3 capitalize text-slate-600 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-medium">
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span>{item.category ? item.category.replace(/_/g, " ") : "Uncategorized"}</span>
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white text-xs">
                          {formatPHP(item.standard_unit_cost)}
                        </td>

                        <td className="py-3 px-3 space-y-1">
                          {item.canvas_expiration_date ? (
                            <div className="flex items-center gap-1 font-mono text-[9.5px]">
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className={
                                expired 
                                  ? "text-rose-600 dark:text-rose-400 font-bold" 
                                  : expiringSoon 
                                  ? "text-amber-600 dark:text-amber-400 font-bold" 
                                  : "text-slate-600 dark:text-slate-400"
                              }>
                                {new Date(item.canvas_expiration_date).toLocaleDateString()}
                              </span>
                              {expired ? (
                                <span className="text-[8px] px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded uppercase font-bold font-mono">
                                  Expired
                                </span>
                              ) : expiringSoon ? (
                                <span className="text-[8px] px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 rounded uppercase font-bold font-mono">
                                  {daysLeft}d left
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[9.5px] text-slate-400 italic">No expiry date</span>
                          )}

                          {item.canvas_evidence_url && (
                            <a
                              href={item.canvas_evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1 text-[10px] block"
                            >
                              <span>View Quotation</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}

                          {item.allowed_offices && item.allowed_offices.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {item.allowed_offices.map((off, oIdx) => (
                                <span key={oIdx} className="px-1.5 py-0.2 text-[8.5px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 font-mono truncate max-w-[120px]">
                                  {off}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[9px] text-slate-400 italic block">Global Access</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                              title="Edit Reference Properties"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 text-slate-500 rounded-lg transition-colors cursor-pointer"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => toggleItemState(item)}
                              className="hover:scale-105 transition-transform inline-flex items-center gap-1 cursor-pointer align-middle ml-1"
                              title={item.is_active ? "Disable Item" : "Activate Item"}
                            >
                              {item.is_active ? (
                                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono">
                                  <span className="text-[9.5px] uppercase font-bold">Active</span>
                                  <ToggleRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-slate-400 font-mono">
                                  <span className="text-[9.5px] uppercase font-bold">Off</span>
                                  <ToggleLeft className="w-5 h-5 text-slate-400" />
                                </div>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-20 text-slate-400 italic">
                No catalog items match your search criteria.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* EDIT CATALOG ITEM MODAL */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit Catalog Reference</h3>
                <span className="text-[10px] text-slate-500 font-mono">Key: {editingItem.item_key}</span>
              </div>
              <button 
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Display Name</label>
                <input
                  type="text"
                  required
                  value={editForm.display_name}
                  onChange={e => setEditForm({ ...editForm, display_name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Standard Cost (PHP ₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editForm.standard_unit_cost}
                    onChange={e => setEditForm({ ...editForm, standard_unit_cost: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Category Group</label>
                  <select
                    value={editForm.category}
                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 outline-none cursor-pointer font-semibold"
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label.split(" (")[0]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Supplier Name</label>
                <input
                  type="text"
                  value={editForm.supplier_name}
                  onChange={e => setEditForm({ ...editForm, supplier_name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                  <span>Quotation Expiration Date</span>
                  <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">Rule 7 Guard</span>
                </label>
                <input
                  type="date"
                  value={editForm.canvas_expiration_date}
                  onChange={e => setEditForm({ ...editForm, canvas_expiration_date: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Quotation Canvas URL</label>
                <input
                  type="url"
                  value={editForm.canvas_evidence_url}
                  onChange={e => setEditForm({ ...editForm, canvas_evidence_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono outline-none text-xs"
                />
              </div>

              {/* Division Permissions with Quick Chips */}
              <div className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Authorized Divisions</label>
                  <span className="text-[9px] text-slate-400 font-mono">Empty = Global</span>
                </div>

                {departments.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {departments.slice(0, 6).map(dept => {
                      const dName = dept.department_name || dept.name;
                      const isSelected = editForm.allowed_offices.split(",").map(o => o.trim()).includes(dName);
                      return (
                        <button
                          key={dept.department_id || dept.id}
                          type="button"
                          onClick={() => toggleOfficeInForm(dName, true)}
                          className={`px-2 py-0.5 rounded text-[9px] transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 font-bold"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400"
                          }`}
                        >
                          {isSelected ? `✓ ${dName}` : `+ ${dName}`}
                        </button>
                      );
                    })}
                  </div>
                )}

                <input
                  type="text"
                  value={editForm.allowed_offices}
                  onChange={e => setEditForm({ ...editForm, allowed_offices: e.target.value })}
                  placeholder="Leave blank for global access (or comma-separated)"
                  className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none mt-1"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Updating..." : "Save Modifications"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}