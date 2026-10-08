// frontend/src/views/supply/SupplyInventory.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCycle } from "../../context/CycleContext";
import { 
  Database, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  RefreshCw, 
  Search, 
  Calendar, 
  AlertTriangle, 
  CheckCircle, 
  Coins, 
  FileText,
  Boxes,
  Activity,
  ShieldAlert,
  Building,
  UploadCloud,
  ExternalLink,
  Table,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Tag,
  Clock,
  Info,
  Layers,
  Sparkles,
  CheckCircle2,
  FolderKanban,
  CheckSquare,
  Printer,
  Download,
  FileSpreadsheet
} from "lucide-react";

// Canonical DICT Annex 1 Standard Categories (Template Pages 1–3)
const DEFAULT_EQUIPMENT_CATEGORIES = [
  "Servers",
  "Desktop",
  "Laptop",
  "Mobile Phone",
  "Tablet",
  "Printer",
  "Network Switch",
  "Others (ICT Equipment)"
];

const DEFAULT_SOFTWARE_CATEGORIES = [
  "Office Productivity Tool",
  "Grammar checker",
  "Graphics and Simulation Software",
  "Antivirus",
  "IT Help Desk Tool",
  "Photo and Video Editing Software",
  "Web Application Firewall",
  "Others (ICT Software)"
];

/**
 * Intelligent categorization resolver that inspects specific appliance terms first
 * to avoid generic substring collisions (e.g. switches with "server" in model name).
 */
const inferDictCategory = (itemName, isSoftware) => {
  const nameClean = (itemName || "").trim().toLowerCase();
  if (isSoftware) {
    if (["antivirus", "anti-virus", "edr", "endpoint security"].some(k => nameClean.includes(k))) {
      return "Antivirus";
    }
    if (["grammar", "grammarly"].some(k => nameClean.includes(k))) {
      return "Grammar checker";
    }
    if (["graphics", "simulation", "cad", "autocad", "3d", "revit", "solidworks"].some(k => nameClean.includes(k))) {
      return "Graphics and Simulation Software";
    }
    if (["help desk", "helpdesk", "ticketing", "service desk", "jira"].some(k => nameClean.includes(k))) {
      return "IT Help Desk Tool";
    }
    if (["photo", "video", "premiere", "photoshop", "creative cloud", "editing"].some(k => nameClean.includes(k))) {
      return "Photo and Video Editing Software";
    }
    if (["waf", "web application firewall", "cloudflare waf"].some(k => nameClean.includes(k))) {
      return "Web Application Firewall";
    }
    if (["office", "productivity", "word", "excel", "suite", "docs", "365", "workspace"].some(k => nameClean.includes(k))) {
      return "Office Productivity Tool";
    }
    return "Others (ICT Software)";
  } else {
    if (["switch", "router", "access point", "patch panel", "gateway", "firewall appliance"].some(k => nameClean.includes(k))) {
      return "Network Switch";
    }
    if (["printer", "scanner", "plotter", "copier", "laserjet", "inkjet"].some(k => nameClean.includes(k))) {
      return "Printer";
    }
    if (["tablet", "ipad", "surface"].some(k => nameClean.includes(k))) {
      return "Tablet";
    }
    if (["mobile", "phone", "smartphone", "cellular"].some(k => nameClean.includes(k))) {
      return "Mobile Phone";
    }
    if (["laptop", "notebook", "thinkpad", "macbook"].some(k => nameClean.includes(k))) {
      return "Laptop";
    }
    if (["desktop", "pc", "optiplex", "prodesk", "all-in-one", "clerical"].some(k => nameClean.includes(k))) {
      return "Desktop";
    }
    if (["server", "poweredge", "blade", "rackmount", "san storage", "nas"].some(k => nameClean.includes(k))) {
      return "Servers";
    }
    return "Others (ICT Equipment)";
  }
};

const getItemCategory = (item) => {
  const isSw = Boolean(item.is_software);
  const rawCat = item.dict_category?.value || item.dict_category;
  if (rawCat) {
    const valStr = String(rawCat).trim();
    if (valStr.toLowerCase() === "others" || valStr.toLowerCase() === "others, please specify") {
      return isSw ? "Others (ICT Software)" : "Others (ICT Equipment)";
    }
    return valStr;
  }
  return inferDictCategory(item.item_name, isSw);
};

export default function SupplyInventory() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const location = useLocation();

  // Dynamic Agency Identifier
  const defaultAgencyName = import.meta.env.VITE_DEFAULT_AGENCY_NAME || "National Government Agency";
  const agencyName = import.meta.env.VITE_AGENCY_NAME || user?.agency_name || defaultAgencyName;

  // Dynamic Categories from API
  const [equipmentCategories, setEquipmentCategories] = useState(DEFAULT_EQUIPMENT_CATEGORIES);
  const [softwareCategories, setSoftwareCategories] = useState(DEFAULT_SOFTWARE_CATEGORIES);

  // Data States
  const [inventory, setInventory] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // View & Filter States
  const [activeTab, setActiveTab] = useState("ledger"); // "ledger" or "annex1"
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [typeFilter, setFilterType] = useState("all"); // all, hardware, software, eol, unconsumed, backup, condemned
  const [locationFilter, setLocationFilter] = useState("all"); // all, central, regional

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Notification States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form State (DICT Annex 1 Standard Aligned)
  const initialFormState = {
    department_id: "",
    dict_category: "Desktop",
    other_category_name: "",
    item_name: "",
    specs: "",
    exact_model: "",
    quantity: 1,
    status: "Functional",
    date_acquired: new Date().toISOString().split("T")[0],
    acquired_price: "",
    is_central_office: true,
    is_end_of_life: false,
    is_backup: false,
    is_software: false,
    is_perpetual: true,
    unserviceable_report_url: ""
  };
  const [form, setForm] = useState(initialFormState);

  // Modal Edit State
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState(initialFormState);

  // IIRUP Upload Modal State
  const [activeReportAsset, setActiveReportAsset] = useState(null);
  const [reportFile, setReportFile] = useState(null);
  const [reportUrlInput, setReportUrlInput] = useState("");
  const [uploadingReport, setUploadingReport] = useState(false);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken || localStorage.getItem("access_token") || "";

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

  // Auto-dismiss transient notifications
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Sync Global Search Query & Filters from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const q = searchParams.get("search");
    if (q !== null) {
      setSearchTerm(q);
    }
    const dept = searchParams.get("dept_id");
    if (dept !== null) {
      setDeptFilter(dept);
    }
  }, [location.search]);

  // Load standard and custom categories dynamically from backend
  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/supply/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.equipment_categories && Array.isArray(data.equipment_categories)) {
          setEquipmentCategories(data.equipment_categories);
        }
        if (data.software_categories && Array.isArray(data.software_categories)) {
          setSoftwareCategories(data.software_categories);
        }
      }
    } catch (e) {
      console.warn("Using default static DICT categories:", e);
    }
  }, [apiUrl, token]);

  const fetchDepartments = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/supply/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
        if (data.length > 0 && !form.department_id) {
          setForm(f => ({ ...f, department_id: String(data[0].department_id || data[0].id) }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch departments directory:", err);
    }
  }, [apiUrl, token, form.department_id]);

  const fetchInventory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = ["limit=10000"];
      if (activeCycle) params.push(`issp_period=${encodeURIComponent(activeCycle)}`);
      if (deptFilter) params.push(`dept_id=${encodeURIComponent(deptFilter)}`);
      const queryParams = `?${params.join("&")}`;

      const [invRes, propRes] = await Promise.all([
        fetch(`${apiUrl}/api/supply/inventory${queryParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/admin/proposals?issp_period=${encodeURIComponent(activeCycle || "2026-2028")}&limit=1000`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)
      ]);

      if (!invRes.ok) {
        const errData = await invRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load baseline inventory records.");
      }
      
      const invData = await invRes.json();
      setInventory(Array.isArray(invData) ? invData : []);

      if (propRes && propRes.ok) {
        const pJson = await propRes.json();
        setProposals(Array.isArray(pJson) ? pJson : (pJson?.data || []));
      }
    } catch (err) {
      setError(err.message || "Network error loading inventory ledger.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, activeCycle, deptFilter]);

  useEffect(() => {
    if (token) {
      fetchCategories();
      fetchDepartments();
      fetchInventory();
    }
  }, [token, fetchCategories, fetchDepartments, fetchInventory]);

  // Lookup proposal name consumed by replacement_proposal_id
  const getProposalTitle = useCallback((proposalId) => {
    if (!proposalId) return null;
    const found = proposals.find(p => String(p.id) === String(proposalId));
    return found ? found.item_name : null;
  }, [proposals]);

  const handleCategoryChange = (val, isEditing = false) => {
    const isSw = softwareCategories.includes(val);
    const updater = isEditing ? setEditForm : setForm;
    updater(prev => ({
      ...prev,
      dict_category: val,
      is_software: isSw,
      other_category_name: val.startsWith("Others") ? prev.other_category_name : ""
    }));
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const priceNum = parseFloat(form.acquired_price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Please specify a valid historical acquisition price (₱0.00 or greater).");
      return;
    }

    if (!form.department_id) {
      setError("Please select the target department.");
      return;
    }

    if (form.dict_category.startsWith("Others") && !form.other_category_name.trim()) {
      setError("Please specify the item category details under 'Others, please specify'.");
      return;
    }

    let dateAcquiredIso = new Date().toISOString();
    if (form.date_acquired) {
      const parsed = new Date(form.date_acquired);
      if (!isNaN(parsed.getTime())) {
        dateAcquiredIso = parsed.toISOString();
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        department_id: parseInt(form.department_id, 10),
        issp_period: activeCycle || "2026-2028",
        dict_category: form.dict_category,
        other_category_name: form.dict_category.startsWith("Others") ? form.other_category_name.trim() : null,
        item_name: form.item_name.trim(),
        specs: form.specs.trim() || null,
        exact_model: form.exact_model.trim() || null,
        quantity: parseInt(form.quantity, 10) || 1,
        status: form.status,
        date_acquired: dateAcquiredIso,
        acquired_price: priceNum,
        office_location: form.is_central_office ? "Central Office" : "Field/Regional Office",
        is_central_office: form.is_central_office,
        is_end_of_life: form.is_end_of_life,
        is_backup: form.is_backup,
        is_software: form.is_software,
        is_perpetual: form.is_software ? form.is_perpetual : true,
        unserviceable_report_url: form.unserviceable_report_url?.trim() || null
      };

      const res = await fetch(`${apiUrl}/api/supply/inventory?issp_period=${encodeURIComponent(activeCycle || "2026-2028")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to register baseline inventory item.");
      }

      setSuccess(`Asset '${form.item_name}' successfully logged into Annex 1 for cycle FY ${activeCycle}.`);
      setForm(prev => ({
        ...initialFormState,
        department_id: prev.department_id
      }));
      fetchInventory();
    } catch (err) {
      setError(err.message || "Failed to record asset.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (item) => {
    setEditingItem(item);
    const itemCat = getItemCategory(item);
    setEditForm({
      department_id: String(item.department_id),
      dict_category: itemCat,
      other_category_name: item.other_category_name || "",
      item_name: item.item_name,
      specs: item.specs || "",
      exact_model: item.exact_model || "",
      quantity: item.quantity,
      status: item.status?.value || item.status || "Functional",
      date_acquired: item.date_acquired ? item.date_acquired.split("T")[0] : "",
      acquired_price: String(item.acquired_price || "0"),
      is_central_office: Boolean(item.is_central_office),
      is_end_of_life: Boolean(item.is_end_of_life),
      is_backup: Boolean(item.is_backup),
      is_software: Boolean(item.is_software),
      is_perpetual: Boolean(item.is_perpetual),
      unserviceable_report_url: item.unserviceable_report_url || ""
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    setError(null);
    setSuccess(null);

    if (editForm.dict_category.startsWith("Others") && !editForm.other_category_name.trim()) {
      setError("Please specify the item details under 'Others, please specify'.");
      return;
    }

    let dateAcquiredIso = new Date().toISOString();
    if (editForm.date_acquired) {
      const parsed = new Date(editForm.date_acquired);
      if (!isNaN(parsed.getTime())) {
        dateAcquiredIso = parsed.toISOString();
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        department_id: parseInt(editForm.department_id, 10),
        issp_period: editingItem.issp_period || activeCycle || "2026-2028",
        dict_category: editForm.dict_category,
        other_category_name: editForm.dict_category.startsWith("Others") ? editForm.other_category_name.trim() : null,
        item_name: editForm.item_name.trim(),
        specs: editForm.specs.trim() || null,
        exact_model: editForm.exact_model.trim() || null,
        quantity: parseInt(editForm.quantity, 10) || 1,
        status: editForm.status,
        date_acquired: dateAcquiredIso,
        acquired_price: parseFloat(editForm.acquired_price) || 0.0,
        office_location: editForm.is_central_office ? "Central Office" : "Field/Regional Office",
        is_central_office: editForm.is_central_office,
        is_end_of_life: editForm.is_end_of_life,
        is_backup: editForm.is_backup,
        is_software: editForm.is_software,
        is_perpetual: editForm.is_software ? editForm.is_perpetual : true,
        unserviceable_report_url: editForm.unserviceable_report_url?.trim() || null,
        replacement_proposal_id: editingItem.replacement_proposal_id || null
      };

      const res = await fetch(`${apiUrl}/api/supply/inventory/${editingItem.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update inventory record.");
      }

      setSuccess(`Inventory record for '${editForm.item_name}' updated.`);
      setEditingItem(null);
      fetchInventory();
    } catch (err) {
      setError(err.message || "Failed to update inventory.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete '${name}' from the master baseline inventory?`)) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/supply/inventory/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete inventory record.");
      }
      
      setSuccess(`Asset record for '${name}' removed.`);
      fetchInventory();
    } catch (err) {
      setError(err.message || "Failed to delete record.");
    }
  };

  const handleUploadIirupReport = async (e) => {
    e.preventDefault();
    if (!activeReportAsset) return;

    setUploadingReport(true);
    setError(null);
    try {
      // 1. If explicit URL is provided directly
      if (reportUrlInput.trim()) {
        const res = await fetch(`${apiUrl}/api/supply/inventory/${activeReportAsset.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            ...activeReportAsset,
            unserviceable_report_url: reportUrlInput.trim()
          })
        });
        if (!res.ok) throw new Error("Failed to attach IIRUP report URL.");
        setSuccess(`IIRUP Inspection Report linked to '${activeReportAsset.item_name}'.`);
        setActiveReportAsset(null);
        setReportFile(null);
        setReportUrlInput("");
        fetchInventory();
        return;
      }

      // 2. Otherwise upload via multipart file
      if (!reportFile) {
        throw new Error("Please select a PDF file or provide a report URL.");
      }

      const formData = new FormData();
      formData.append("inventory_id", activeReportAsset.id);
      formData.append("file", reportFile);

      const res = await fetch(`${apiUrl}/api/dept/upload/unserviceable-report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload inspection report.");
      }

      setSuccess(`IIRUP Inspection Report uploaded and linked to '${activeReportAsset.item_name}'.`);
      setActiveReportAsset(null);
      setReportFile(null);
      setReportUrlInput("");
      fetchInventory();
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploadingReport(false);
    }
  };

  // Automated Inventory CSV Export with UTF-8 BOM
  const handleExportInventoryCSV = () => {
    if (inventory.length === 0) {
      setError("No inventory assets available to export.");
      return;
    }

    try {
      const headers = [
        "Asset ID",
        "Asset Description",
        "DICT Standard Category",
        "Exact Model",
        "Specifications",
        "Department",
        "Deployment Location",
        "Condition / Status",
        "Quantity",
        "Acquisition Unit Cost (PHP)",
        "Total Value (PHP)",
        "Date Acquired",
        "End of Life",
        "Backup",
        "IIRUP Report URL",
        "Replacement Proposal ID"
      ];

      const rows = inventory.map(item => {
        const cat = getItemCategory(item);
        const dept = getDeptName(item.department_id, item);
        const loc = item.is_central_office ? "Central Office" : (item.office_location || "Regional Office");
        const statusStr = item.status?.value || item.status || "Functional";
        const totalVal = (Number(item.acquired_price || 0) * (item.quantity || 1)).toFixed(2);

        return [
          `"${item.id}"`,
          `"${(item.item_name || "").replace(/"/g, '""')}"`,
          `"${cat}"`,
          `"${(item.exact_model || "").replace(/"/g, '""')}"`,
          `"${(item.specs || "").replace(/"/g, '""')}"`,
          `"${dept.replace(/"/g, '""')}"`,
          `"${loc}"`,
          `"${statusStr}"`,
          item.quantity || 1,
          item.acquired_price || 0,
          totalVal,
          item.date_acquired ? item.date_acquired.split("T")[0] : "",
          item.is_end_of_life ? "Yes" : "No",
          item.is_backup ? "Yes" : "No",
          `"${item.unserviceable_report_url || ""}"`,
          `"${item.replacement_proposal_id || ""}"`
        ];
      });

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${agencyName.replace(/\s+/g, "_")}_Annex1_Inventory_${activeCycle}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess("Master asset inventory exported to CSV successfully.");
    } catch (err) {
      setError(`CSV export failed: ${err.message}`);
    }
  };

  // Print-Ready Document Handler for Annex 1
  const handlePrintAnnex1 = () => {
    const printElement = document.getElementById("formal-annex1-print-area");
    if (!printElement) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ANNEX 1: EXISTING ICT ASSET INVENTORY - ${agencyName} (${activeCycle})</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 15mm 15mm 15mm 15mm;
            }
            body {
              font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
              font-size: 8.5pt;
              line-height: 1.35;
              color: #0f172a;
              background: #ffffff;
              padding: 0;
              margin: 0;
            }
            .no-print, button {
              display: none !important;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
              page-break-inside: avoid;
            }
            th, td {
              border: 1px solid #334155;
              padding: 4px 6px;
              font-size: 7.5pt;
              vertical-align: top;
            }
            th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .text-center { text-align: center; }
            .font-mono { font-family: monospace; }
            .font-bold { font-weight: bold; }
            .header-bar {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 14px;
            }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <p style="font-size: 8pt; text-transform: uppercase; letter-spacing: 1.2px; margin: 0; color: #475569;">
              Republic of the Philippines
            </p>
            <h2 style="font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 2px 0;">
              ${agencyName}
            </h2>
            <h3 style="font-size: 10.5pt; font-weight: bold; color: #1e3a8a; margin: 2px 0;">
              ANNEX 1: EXISTING INFORMATION &amp; COMMUNICATIONS TECHNOLOGY (ICT) ASSET INVENTORY
            </h3>
            <p style="font-size: 8pt; font-family: monospace; color: #64748b; margin: 0;">
              Active Planning Horizon: FY ${activeCycle}
            </p>
          </div>
          ${printElement.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 350);
  };

  // Derived Summary Analytics
  const totalUnits = inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalAcquisitionSpent = inventory.reduce((sum, item) => sum + (Number(item.acquired_price || 0) * (item.quantity || 1)), 0);
  
  const isItemEol = (item) => {
    return Boolean(item.is_end_of_life) || ["condemned", "unserviceable"].includes((item.status?.value || item.status || "").toLowerCase());
  };

  const eolCount = inventory.filter(isItemEol).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const unconsumedEolCount = inventory.filter(item => isItemEol(item) && !item.replacement_proposal_id).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const obsoleteCount = inventory.filter(item => isObsolete(item.date_acquired)).reduce((sum, item) => sum + (item.quantity || 1), 0);

  const getDeptName = (id, item = null) => {
    if (item?.department?.name) return item.department.name;
    if (item?.department_name) return item.department_name;
    const dObj = departments.find(d => String(d.department_id || d.id) === String(id));
    return dObj ? (dObj.department_name || dObj.name) : (id ? `Dept ID: ${id}` : "Central Office");
  };

  // Category matching helper preventing collisions
  const matchEquipmentCategory = (item, targetCategory) => {
    if (item.is_software) return false;
    const itemCat = getItemCategory(item);
    const isTargetOthers = targetCategory.startsWith("Others");
    if (isTargetOthers) {
      return itemCat.startsWith("Others") || !equipmentCategories.slice(0, -1).some(c => c.toLowerCase() === itemCat.toLowerCase());
    }
    return itemCat.toLowerCase() === targetCategory.toLowerCase();
  };

  const matchSoftwareCategory = (item, targetCategory) => {
    if (!item.is_software) return false;
    const itemCat = getItemCategory(item);
    const isTargetOthers = targetCategory.startsWith("Others");
    if (isTargetOthers) {
      return itemCat.startsWith("Others") || !softwareCategories.slice(0, -1).some(c => c.toLowerCase() === itemCat.toLowerCase());
    }
    return itemCat.toLowerCase() === targetCategory.toLowerCase();
  };

  // Pre-calculate Grand Totals for Annex 1 View
  const annex1EquipmentTotals = useMemo(() => {
    let cOps = 0, cEol = 0, cBak = 0;
    let fOps = 0, fEol = 0, fBak = 0;

    inventory.filter(i => !i.is_software).forEach(i => {
      const isCentral = Boolean(i.is_central_office) || i.office_location === "Central Office";
      const isOps = !i.is_end_of_life && (i.status?.value || i.status || "").toLowerCase() === "functional";
      const isEol = i.is_end_of_life || ["condemned", "unserviceable"].includes((i.status?.value || i.status || "").toLowerCase());
      const isBak = Boolean(i.is_backup);
      const qty = i.quantity || 1;

      if (isCentral) {
        if (isOps) cOps += qty;
        if (isEol) cEol += qty;
        if (isBak) cBak += qty;
      } else {
        if (isOps) fOps += qty;
        if (isEol) fEol += qty;
        if (isBak) fBak += qty;
      }
    });

    return { cOps, cEol, cBak, fOps, fEol, fBak };
  }, [inventory]);

  const annex1SoftwareTotals = useMemo(() => {
    let cPerp = 0, cSub = 0;
    let fPerp = 0, fSub = 0;

    inventory.filter(i => Boolean(i.is_software)).forEach(i => {
      const isCentral = Boolean(i.is_central_office) || i.office_location === "Central Office";
      const isPerp = Boolean(i.is_perpetual);
      const qty = i.quantity || 1;

      if (isCentral) {
        if (isPerp) cPerp += qty;
        else cSub += qty;
      } else {
        if (isPerp) fPerp += qty;
        else fSub += qty;
      }
    });

    return { cPerp, cSub, fPerp, fSub };
  }, [inventory]);

  // Filtering Pipeline for Tab 1 (Ledger View)
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const isEol = isItemEol(item);

      // Type Filters
      if (typeFilter === "hardware" && item.is_software) return false;
      if (typeFilter === "software" && !item.is_software) return false;
      if (typeFilter === "eol" && !isEol) return false;
      if (typeFilter === "unconsumed" && (!isEol || item.replacement_proposal_id)) return false;
      if (typeFilter === "backup" && !item.is_backup) return false;
      if (typeFilter === "condemned" && (item.status?.value || item.status) !== "Condemned") return false;

      // Location Filters
      if (locationFilter === "central" && !item.is_central_office) return false;
      if (locationFilter === "regional" && item.is_central_office) return false;

      // Category Filter (Using Normalized Matcher)
      if (categoryFilter !== "All") {
        const itemCat = getItemCategory(item);
        if (equipmentCategories.includes(categoryFilter)) {
          if (!matchEquipmentCategory(item, categoryFilter)) return false;
        } else if (softwareCategories.includes(categoryFilter)) {
          if (!matchSoftwareCategory(item, categoryFilter)) return false;
        } else if (itemCat.toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }

      // Search Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = (item.item_name || "").toLowerCase().includes(q);
        const matchesModel = (item.exact_model || "").toLowerCase().includes(q);
        const matchesSpecs = (item.specs || "").toLowerCase().includes(q);
        const matchesCategory = (item.dict_category || "").toLowerCase().includes(q);
        const matchesOther = (item.other_category_name || "").toLowerCase().includes(q);
        const matchesDept = getDeptName(item.department_id, item).toLowerCase().includes(q);
        if (!matchesName && !matchesModel && !matchesSpecs && !matchesDept && !matchesCategory && !matchesOther) return false;
      }

      return true;
    });
  }, [inventory, typeFilter, locationFilter, categoryFilter, searchTerm, departments, equipmentCategories, softwareCategories]);

  // Safe Pagination Slice
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages) || 1;
  const paginatedInventory = filteredInventory.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 max-w-7xl mx-auto select-none font-sans transition-colors duration-200">
      
      {/* Title Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Master {agencyName} ICT Asset Inventory Ledger (DICT Annex 1) [4]</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Active Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Global management console for logging, auditing, and inspecting physical equipment and software licensing states across Central and Regional offices using DICT Annex 1 Standard Categories [4].
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* CSV Export Action Button */}
          <button
            type="button"
            onClick={handleExportInventoryCSV}
            disabled={inventory.length === 0}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer font-bold shadow-xs text-xs disabled:opacity-50"
            title="Download CSV roster of all master baseline assets with inspection records"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {activeTab === "annex1" && (
            <button
              type="button"
              onClick={handlePrintAnnex1}
              className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl flex items-center gap-1.5 transition-all cursor-pointer font-bold shadow-xs text-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print Annex 1 Tables</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "ledger" ? "annex1" : "ledger")}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer font-bold shadow-xs text-xs"
          >
            <Table className="w-4 h-4" />
            <span>{activeTab === "ledger" ? "Official DICT Annex 1 View" : "Tabular Ledger View"}</span>
          </button>

          <button
            type="button"
            onClick={() => { fetchDepartments(); fetchInventory(); fetchCategories(); }}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh Inventory Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Indicators Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Total Active Units</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalUnits.toLocaleString()} items</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Historical Acquisition Cost</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{formatPHP(totalAcquisitionSpent)}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">End of Life (EOL) / Condemned</span>
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
              {eolCount.toLocaleString()} units <span className="text-[10px] text-slate-400 dark:text-slate-500">({unconsumedEolCount} unconsumed)</span>
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Depreciated (&gt;3 Yrs Old)</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{obsoleteCount.toLocaleString()} units</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-start justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
          <button 
            type="button"
            onClick={() => setError(null)} 
            className="text-rose-400 hover:text-rose-600 dark:hover:text-white cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-start justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button 
            type="button"
            onClick={() => setSuccess(null)} 
            className="text-emerald-500 hover:text-emerald-700 dark:hover:text-white cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIEW 1: MASTER INVENTORY LEDGER */}
      {activeTab === "ledger" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          
          {/* Creator Form Column */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 h-fit space-y-4 shadow-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-1.5 font-serif">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Log Baseline Asset (Annex 1) [4]</span>
            </h3>

            <form onSubmit={handleAddAsset} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Target Department
                </label>
                <select
                  value={form.department_id}
                  onChange={e => setForm({ ...form, department_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer text-xs"
                  required
                >
                  <option value="" disabled>Select department division...</option>
                  {departments.map(d => (
                    <option key={d.department_id || d.id} value={d.department_id || d.id}>
                      {d.department_name || d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mandatory DICT Annex 1 Standard Category Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>DICT Annex 1 Standard Category</span>
                </label>
                <select
                  value={form.dict_category}
                  onChange={e => handleCategoryChange(e.target.value, false)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer font-semibold text-xs focus:border-blue-500"
                  required
                >
                  <optgroup label="1. ICT Equipment Inventory (Hardware)">
                    {equipmentCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="2. ICT Software Inventory (Applications)">
                    {softwareCategories.map(scat => (
                      <option key={scat} value={scat}>{scat}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Conditional "Others, please specify" Field */}
              {form.dict_category.startsWith("Others") && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Others, please specify</span>
                    <span className="text-[9px] text-rose-500 font-bold">*Mandatory</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Uninterruptible Power Supply (UPS), Document Scanner, Biometrics"
                    value={form.other_category_name}
                    onChange={e => setForm({ ...form, other_category_name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                    required
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Specific Unit Description / Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dell OptiPlex 3080 Desktop Workstation"
                  value={form.item_name}
                  onChange={e => setForm({ ...form, item_name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Exact Model</label>
                  <input
                    type="text"
                    placeholder="e.g. OptiPlex 3080"
                    value={form.exact_model}
                    onChange={e => setForm({ ...form, exact_model: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Quantity (Units)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Acquisition Cost (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.acquired_price}
                    onChange={e => setForm({ ...form, acquired_price: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Date Acquired</label>
                  <input
                    type="date"
                    value={form.date_acquired}
                    onChange={e => setForm({ ...form, date_acquired: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono cursor-pointer"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Technical Specs</label>
                <textarea
                  rows={2}
                  placeholder="CPU cores, RAM, storage, serial numbers, OS..."
                  value={form.specs}
                  onChange={e => setForm({ ...form, specs: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none leading-relaxed text-xs outline-none focus:border-blue-500"
                />
              </div>

              {/* COA IIRUP Report Link Input */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>COA IIRUP Report URL (Optional)</span>
                  <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">PDF / Archive Link</span>
                </label>
                <input
                  type="url"
                  placeholder="https://agency.gov.ph/... or official document URL"
                  value={form.unserviceable_report_url}
                  onChange={e => setForm({ ...form, unserviceable_report_url: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-blue-600 dark:text-blue-400 font-mono text-xs outline-none"
                />
              </div>

              {/* Annex 1 Deployment & Lifecycle States */}
              <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800">
                <span className="block text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  Annex 1 Deployment &amp; Status Mapping [4]
                </span>
                
                <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Deployment Site</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, is_central_office: !form.is_central_office })}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase transition-all cursor-pointer ${
                      form.is_central_office 
                        ? "bg-blue-600 text-white shadow-xs" 
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {form.is_central_office ? "Central Office" : "Field / Regional Office"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_end_of_life}
                      onChange={e => setForm({ ...form, is_end_of_life: e.target.checked })}
                      className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-rose-600 dark:text-rose-400 text-[10px]">End of Life (EOL)</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_backup}
                      onChange={e => setForm({ ...form, is_backup: e.target.checked })}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">Backup Unit</span>
                  </label>
                </div>

                {form.is_software ? (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Licensing Model</label>
                    <select
                      value={form.is_perpetual ? "true" : "false"}
                      onChange={e => setForm({ ...form, is_perpetual: e.target.value === "true" })}
                      className="p-1 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-slate-200 text-[10px] outline-none"
                    >
                      <option value="true">Perpetual License</option>
                      <option value="false">Subscription</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Operational Condition</label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                      className="p-1 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded text-slate-900 dark:text-slate-200 text-[10px] outline-none"
                    >
                      <option value="Functional">Functional</option>
                      <option value="Needs Repair">Needs Repair</option>
                      <option value="Condemned">Condemned (Unserviceable)</option>
                    </select>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || departments.length === 0}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm text-xs"
              >
                <Plus className="w-4 h-4" />
                <span>{submitting ? "Processing..." : "Record Asset into Annex 1"}</span>
              </button>
            </form>
          </div>

          {/* Master Ledger Directory Column */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs">
            
            {/* Multi-tier Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl">
                {[
                  { id: "all", label: "All Items" },
                  { id: "hardware", label: "Equipment" },
                  { id: "software", label: "Software" },
                  { id: "eol", label: "EOL" },
                  { id: "unconsumed", label: `Unconsumed EOL (${unconsumedEolCount})` },
                  { id: "backup", label: "Backups" },
                  { id: "condemned", label: "Condemned" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setFilterType(tab.id); setCurrentPage(1); }}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                      typeFilter === tab.id 
                        ? "bg-blue-600 text-white shadow-xs" 
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                {/* Location Filter */}
                <select
                  value={locationFilter}
                  onChange={e => { setLocationFilter(e.target.value); setCurrentPage(1); }}
                  className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none text-xs"
                >
                  <option value="all">All Sites</option>
                  <option value="central">Central Office</option>
                  <option value="regional">Field / Regional Office</option>
                </select>

                {/* DICT Annex 1 Category Filter */}
                <select
                  value={categoryFilter}
                  onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                  className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none text-xs max-w-[170px]"
                >
                  <option value="All">All Standard Categories</option>
                  <optgroup label="1. ICT Equipment Inventory">
                    {equipmentCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="2. ICT Software Inventory">
                    {softwareCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                </select>

                <select
                  value={deptFilter}
                  onChange={e => { setDeptFilter(e.target.value); setCurrentPage(1); }}
                  className="p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer outline-none text-xs max-w-[150px]"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d.department_id || d.id} value={d.department_id || d.id}>
                      {d.department_name || d.name}
                    </option>
                  ))}
                </select>

                <div className="relative w-44">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search model, specs..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => { setSearchTerm(""); setCurrentPage(1); }}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {loading ? (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <span>Synchronizing inventory ledger...</span>
                </div>
              ) : paginatedInventory.length > 0 ? (
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px] bg-slate-50 dark:bg-slate-950 font-mono">
                      <th className="py-2.5 px-3 w-[28%]">Asset, Category &amp; Model</th>
                      <th className="py-2.5 px-3">Location &amp; Dept</th>
                      <th className="py-2.5 px-3">Acquisition</th>
                      <th className="py-2.5 px-3">Condition &amp; Status</th>
                      <th className="py-2.5 px-3 text-right">Count</th>
                      <th className="py-2.5 px-3 text-center">IIRUP</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {paginatedInventory.map(item => {
                      const obsolete = isObsolete(item.date_acquired);
                      const isCondemned = (item.status?.value || item.status) === "Condemned";
                      const isEol = item.is_end_of_life || isCondemned;
                      const proposalConsumedTitle = getProposalTitle(item.replacement_proposal_id);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-955/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-slate-100">{item.item_name}</div>
                            
                            {/* Category Badge */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 dark:bg-slate-800 text-blue-700 dark:text-blue-400 border border-slate-200 dark:border-slate-700">
                                {item.dict_category || (item.is_software ? "Software" : "Hardware")}
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

                          <td className="py-3 px-3">
                            <div className="text-slate-800 dark:text-slate-200 font-semibold">{getDeptName(item.department_id, item)}</div>
                            <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono">
                              {item.is_central_office ? "Central Office" : "Field / Regional Office"}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono">
                            <div className="text-slate-800 dark:text-slate-200">{formatPHP(item.acquired_price)}</div>
                            <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{item.date_acquired ? new Date(item.date_acquired).toLocaleDateString() : "N/A"}</span>
                            </div>
                          </td>

                          <td className="py-3 px-3 space-y-1">
                            <div className="flex flex-wrap gap-1 font-mono">
                              <span className={`inline-block px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase border ${
                                item.is_software
                                  ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                                  : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                              }`}>
                                {item.is_software ? (item.is_perpetual ? "Perpetual" : "Subscription") : (item.status?.value || item.status)}
                              </span>

                              {/* Anti-Loop Replacement & EOL Tracking Badges */}
                              {isEol && (
                                item.replacement_proposal_id ? (
                                  <span 
                                    className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 text-[8.5px] font-bold uppercase cursor-help"
                                    title={proposalConsumedTitle ? `Claimed by Replacement Proposal: '${proposalConsumedTitle}'` : `Claimed by Proposal ID: ${item.replacement_proposal_id}`}
                                  >
                                    Replaced {proposalConsumedTitle ? `(${proposalConsumedTitle.slice(0, 16)}...)` : "(Claimed)"}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 text-[8.5px] font-bold uppercase">
                                    EOL Unconsumed
                                  </span>
                                )
                              )}

                              {item.is_backup && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[8.5px] font-bold uppercase">
                                  Backup
                                </span>
                              )}
                              {obsolete && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 text-[8.5px] font-bold uppercase">
                                  &gt;3 Yrs Old
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 font-mono font-bold text-right text-blue-600 dark:text-blue-400 text-xs">
                            {item.quantity}
                          </td>

                          {/* COA IIRUP Report View / Upload */}
                          <td className="py-3 px-3 text-center">
                            {item.unserviceable_report_url ? (
                              <a
                                href={item.unserviceable_report_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold text-[10px]"
                              >
                                <span>IIRUP</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              </a>
                            ) : (isCondemned || isEol) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveReportAsset(item);
                                  setReportFile(null);
                                  setReportUrlInput("");
                                }}
                                className="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[8.5px] font-bold uppercase cursor-pointer transition-colors"
                              >
                                Upload
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px] font-mono">-</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer"
                                title="Edit Asset"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id, item.item_name)}
                                className="p-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-slate-300 dark:border-slate-700 text-slate-500 rounded-lg transition-colors cursor-pointer"
                                title="Purge Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
                  No inventory assets match your active search criteria.
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                <span>
                  Showing page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong> ({filteredInventory.length} records)
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    className="p-1 px-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="p-1 px-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-40 cursor-pointer flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 shadow-2xs"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: OFFICIAL DICT ANNEX 1 AGGREGATED TABLES WITH MATHEMATICAL GRAND TOTALS */}
      {activeTab === "annex1" && (
        <div id="formal-annex1-print-area" className="space-y-6 animate-fadeIn">
          {/* Table 1: ICT Equipment Inventory */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs space-y-0">
            <div className="p-4 bg-slate-50 dark:bg-slate-955 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                  1. ICT Equipment Inventory (DICT Template Annex 1, Pages 1–2) [4]
                </h3>
                <span className="text-[10px] text-slate-500">Distribution across Central Office and Field/Regional Offices (FY {activeCycle})</span>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono font-bold uppercase">
                Section 1 Equipment
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] font-mono">
                    <th className="p-3.5 w-1/3">ICT Resources</th>
                    <th className="p-3.5 w-1/4">Office Location</th>
                    <th className="p-3.5 text-center w-28">Operational</th>
                    <th className="p-3.5 text-center w-28">End of Life</th>
                    <th className="p-3.5 text-center w-28">Backup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {equipmentCategories.map(category => {
                    const isOthers = category.startsWith("Others");
                    const cItems = inventory.filter(i => matchEquipmentCategory(i, category));

                    const cOps = cItems.filter(i => (Boolean(i.is_central_office) || i.office_location === "Central Office") && !i.is_end_of_life && (i.status?.value || i.status || "").toLowerCase() === "functional").reduce((s, i) => s + (i.quantity || 1), 0);
                    const cEol = cItems.filter(i => (Boolean(i.is_central_office) || i.office_location === "Central Office") && (i.is_end_of_life || ["condemned", "unserviceable"].includes((i.status?.value || i.status || "").toLowerCase()))).reduce((s, i) => s + (i.quantity || 1), 0);
                    const cBak = cItems.filter(i => (Boolean(i.is_central_office) || i.office_location === "Central Office") && i.is_backup).reduce((s, i) => s + (i.quantity || 1), 0);

                    const fOps = cItems.filter(i => !(Boolean(i.is_central_office) || i.office_location === "Central Office") && !i.is_end_of_life && (i.status?.value || i.status || "").toLowerCase() === "functional").reduce((s, i) => s + (i.quantity || 1), 0);
                    const fEol = cItems.filter(i => !(Boolean(i.is_central_office) || i.office_location === "Central Office") && (i.is_end_of_life || ["condemned", "unserviceable"].includes((i.status?.value || i.status || "").toLowerCase()))).reduce((s, i) => s + (i.quantity || 1), 0);
                    const fBak = cItems.filter(i => !(Boolean(i.is_central_office) || i.office_location === "Central Office") && i.is_backup).reduce((s, i) => s + (i.quantity || 1), 0);

                    const specifiedList = isOthers 
                      ? Array.from(
                          cItems.reduce((acc, i) => {
                            const name = (i.other_category_name || i.item_name || "").trim();
                            if (name) acc.set(name, (acc.get(name) || 0) + (i.quantity || 1));
                            return acc;
                          }, new Map()).entries()
                        ).map(([name, qty]) => `${name} (${qty})`).join(", ")
                      : "";

                    return (
                      <React.Fragment key={category}>
                        <tr className="border-t border-slate-200 dark:border-slate-800">
                          <td rowSpan={3} className="p-3.5 font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 align-middle">
                            <div>{isOthers ? "Others, please specify" : category}</div>
                            {specifiedList && (
                              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-normal mt-0.5 italic">
                                [{specifiedList}]
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">Central Office</td>
                          <td className="p-3 text-center font-mono text-slate-800 dark:text-slate-200">{cOps}</td>
                          <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400 font-bold">{cEol}</td>
                          <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">{cBak}</td>
                        </tr>
                        <tr>
                          <td className="p-3 text-slate-600 dark:text-slate-400">Field/Regional Office</td>
                          <td className="p-3 text-center font-mono text-slate-800 dark:text-slate-200">{fOps}</td>
                          <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400 font-bold">{fEol}</td>
                          <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">{fBak}</td>
                        </tr>
                        <tr className="bg-slate-50/80 dark:bg-slate-955/80 font-bold">
                          <td className="p-3 text-slate-900 dark:text-slate-300">Total</td>
                          <td className="p-3 text-center font-mono text-slate-900 dark:text-white">{cOps + fOps}</td>
                          <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400">{cEol + fEol}</td>
                          <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">{cBak + fBak}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Mathematical Grand Total Row across all Equipment */}
                  <tr className="bg-slate-100 dark:bg-slate-955 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                    <td rowSpan={3} className="p-3.5 text-slate-900 dark:text-white uppercase font-bold border-r border-slate-300 dark:border-slate-800 align-middle">
                      Grand Total (ICT Equipment)
                    </td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-300">Central Office Total</td>
                    <td className="p-3 text-center font-mono text-slate-900 dark:text-white">{annex1EquipmentTotals.cOps}</td>
                    <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400">{annex1EquipmentTotals.cEol}</td>
                    <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">{annex1EquipmentTotals.cBak}</td>
                  </tr>
                  <tr className="bg-slate-100 dark:bg-slate-955 font-bold">
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-300">Field/Regional Office Total</td>
                    <td className="p-3 text-center font-mono text-slate-900 dark:text-white">{annex1EquipmentTotals.fOps}</td>
                    <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400">{annex1EquipmentTotals.fEol}</td>
                    <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">{annex1EquipmentTotals.fBak}</td>
                  </tr>
                  <tr className="bg-blue-50 dark:bg-blue-955/60 font-bold text-blue-900 dark:text-blue-300 border-t border-slate-300 dark:border-slate-800">
                    <td className="p-3 uppercase font-bold">Consolidated Equipment Total</td>
                    <td className="p-3 text-center font-mono text-slate-950 dark:text-white">
                      {annex1EquipmentTotals.cOps + annex1EquipmentTotals.fOps}
                    </td>
                    <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400">
                      {annex1EquipmentTotals.cEol + annex1EquipmentTotals.fEol}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400">
                      {annex1EquipmentTotals.cBak + annex1EquipmentTotals.fBak}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: ICT Software Inventory */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs space-y-0">
            <div className="p-4 bg-slate-50 dark:bg-slate-955 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                  2. ICT Software Inventory (DICT Template Annex 1, Pages 2–3) [4]
                </h3>
                <span className="text-[10px] text-slate-500">Breakdown across Perpetual Licenses vs. Ongoing Cloud Subscriptions (FY {activeCycle})</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 font-mono font-bold uppercase text-[10px]">
                Section 2 Software
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] font-mono">
                    <th className="p-3.5 w-1/3">ICT Resources</th>
                    <th className="p-3.5 w-1/4">Office Location</th>
                    <th className="p-3.5 text-center w-36">Perpetual</th>
                    <th className="p-3.5 text-center w-36">Subscription</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {softwareCategories.map(category => {
                    const isOthers = category.startsWith("Others");
                    const sItems = inventory.filter(i => matchSoftwareCategory(i, category));

                    const cPerp = sItems.filter(i => (Boolean(i.is_central_office) || i.office_location === "Central Office") && Boolean(i.is_perpetual)).reduce((s, i) => s + (i.quantity || 1), 0);
                    const cSub = sItems.filter(i => (Boolean(i.is_central_office) || i.office_location === "Central Office") && !i.is_perpetual).reduce((s, i) => s + (i.quantity || 1), 0);

                    const fPerp = sItems.filter(i => !(Boolean(i.is_central_office) || i.office_location === "Central Office") && Boolean(i.is_perpetual)).reduce((s, i) => s + (i.quantity || 1), 0);
                    const fSub = sItems.filter(i => !(Boolean(i.is_central_office) || i.office_location === "Central Office") && !i.is_perpetual).reduce((s, i) => s + (i.quantity || 1), 0);

                    const specifiedList = isOthers 
                      ? Array.from(
                          sItems.reduce((acc, i) => {
                            const name = (i.other_category_name || i.item_name || "").trim();
                            if (name) acc.set(name, (acc.get(name) || 0) + (i.quantity || 1));
                            return acc;
                          }, new Map()).entries()
                        ).map(([name, qty]) => `${name} (${qty})`).join(", ")
                      : "";

                    return (
                      <React.Fragment key={category}>
                        <tr className="border-t border-slate-200 dark:border-slate-800">
                          <td rowSpan={3} className="p-3.5 font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 align-middle">
                            <div>{isOthers ? "Others, please specify" : category}</div>
                            {specifiedList && (
                              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-normal mt-0.5 italic">
                                [{specifiedList}]
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">Central Office</td>
                          <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400 font-bold">{cPerp}</td>
                          <td className="p-3 text-center font-mono text-purple-600 dark:text-purple-400 font-bold">{cSub}</td>
                        </tr>
                        <tr>
                          <td className="p-3 text-slate-600 dark:text-slate-400">Field/Regional Office</td>
                          <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400 font-bold">{fPerp}</td>
                          <td className="p-3 text-center font-mono text-purple-600 dark:text-purple-400 font-bold">{fSub}</td>
                        </tr>
                        <tr className="bg-slate-50/80 dark:bg-slate-955/80 font-bold">
                          <td className="p-3 text-slate-900 dark:text-slate-300">Total</td>
                          <td className="p-3 text-center font-mono text-blue-700 dark:text-blue-300">{cPerp + fPerp}</td>
                          <td className="p-3 text-center font-mono text-purple-700 dark:text-purple-300">{cSub + fSub}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Mathematical Grand Total Row across all Software */}
                  <tr className="bg-slate-100 dark:bg-slate-955 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                    <td rowSpan={3} className="p-3.5 text-slate-900 dark:text-white uppercase font-bold border-r border-slate-300 dark:border-slate-800 align-middle">
                      Grand Total (ICT Software)
                    </td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-300">Central Office Total</td>
                    <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400">{annex1SoftwareTotals.cPerp}</td>
                    <td className="p-3 text-center font-mono text-purple-600 dark:text-purple-400">{annex1SoftwareTotals.cSub}</td>
                  </tr>
                  <tr className="bg-slate-100 dark:bg-slate-955 font-bold">
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-300">Field/Regional Office Total</td>
                    <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400">{annex1SoftwareTotals.fPerp}</td>
                    <td className="p-3 text-center font-mono text-purple-600 dark:text-purple-400">{annex1SoftwareTotals.fSub}</td>
                  </tr>
                  <tr className="bg-purple-50 dark:bg-purple-955/60 font-bold text-purple-900 dark:text-purple-300 border-t border-slate-300 dark:border-slate-800">
                    <td className="p-3 uppercase font-bold">Consolidated Software Total</td>
                    <td className="p-3 text-center font-mono text-blue-700 dark:text-blue-300">
                      {annex1SoftwareTotals.cPerp + annex1SoftwareTotals.fPerp}
                    </td>
                    <td className="p-3 text-center font-mono text-purple-700 dark:text-purple-300">
                      {annex1SoftwareTotals.cSub + annex1SoftwareTotals.fSub}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT ASSET PROPERTIES */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Edit Baseline Asset Properties</h3>
                <span className="text-[10px] text-slate-500 font-mono">Asset ID: {editingItem.id}</span>
              </div>
              <button 
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Department</label>
                <select
                  value={editForm.department_id}
                  onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  {departments.map(d => (
                    <option key={d.department_id || d.id} value={d.department_id || d.id}>
                      {d.department_name || d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* DICT Category Dropdown in Edit Mode */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>DICT Annex 1 Standard Category</span>
                </label>
                <select
                  value={editForm.dict_category}
                  onChange={e => handleCategoryChange(e.target.value, true)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none font-semibold text-xs cursor-pointer"
                >
                  <optgroup label="1. ICT Equipment Inventory (Hardware)">
                    {equipmentCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="2. ICT Software Inventory (Applications)">
                    {softwareCategories.map(scat => (
                      <option key={scat} value={scat}>{scat}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Conditional "Others, please specify" Field in Edit Mode */}
              {editForm.dict_category.startsWith("Others") && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Others, please specify</label>
                  <input
                    type="text"
                    required
                    value={editForm.other_category_name}
                    onChange={e => setEditForm({ ...editForm, other_category_name: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Asset Title / Description</label>
                <input
                  type="text"
                  required
                  value={editForm.item_name}
                  onChange={e => setEditForm({ ...editForm, item_name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Exact Model</label>
                  <input
                    type="text"
                    value={editForm.exact_model}
                    onChange={e => setEditForm({ ...editForm, exact_model: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Quantity (Units)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.quantity}
                    onChange={e => setEditForm({ ...editForm, quantity: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-center text-slate-900 dark:text-white font-mono font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Acquisition Price (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editForm.acquired_price}
                    onChange={e => setEditForm({ ...editForm, acquired_price: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Acquisition Date</label>
                  <input
                    type="date"
                    required
                    value={editForm.date_acquired}
                    onChange={e => setEditForm({ ...editForm, date_acquired: e.target.value })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono cursor-pointer outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Hardware Specifications</label>
                <textarea
                  rows={2}
                  value={editForm.specs}
                  onChange={e => setEditForm({ ...editForm, specs: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white resize-none outline-none"
                />
              </div>

              {/* COA IIRUP Report Link Input */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>COA IIRUP Report URL (PDF / Archive Link)</span>
                  <span className="text-[9px] text-blue-600 dark:text-blue-400 font-mono">Official Link</span>
                </label>
                <input
                  type="url"
                  placeholder="https://agency.gov.ph/... or official document URL"
                  value={editForm.unserviceable_report_url}
                  onChange={e => setEditForm({ ...editForm, unserviceable_report_url: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-blue-600 dark:text-blue-400 font-mono text-xs outline-none"
                />
              </div>

              {/* Toggles */}
              <div className="p-3 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Deployment Location:</span>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, is_central_office: !editForm.is_central_office })}
                    className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase transition-all cursor-pointer ${
                      editForm.is_central_office ? "bg-blue-600 text-white shadow-xs" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {editForm.is_central_office ? "Central Office" : "Field / Regional Office"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.is_end_of_life}
                      onChange={e => setEditForm({ ...editForm, is_end_of_life: e.target.checked })}
                      className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-rose-600 dark:text-rose-400 text-[10px]">End of Life (EOL)</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.is_backup}
                      onChange={e => setEditForm({ ...editForm, is_backup: e.target.checked })}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[10px]">Backup Unit</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Saving changes..." : "Commit Asset Changes"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UPLOAD OR LINK COA IIRUP REPORT */}
      {activeReportAsset && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Link COA Unserviceable Report</h3>
                <span className="text-[10px] text-slate-500 font-mono">Asset: {activeReportAsset.item_name}</span>
              </div>
              <button 
                type="button"
                onClick={() => { setActiveReportAsset(null); setReportFile(null); setReportUrlInput(""); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadIirupReport} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Option A: Enter Official Document URL (PDF / Archive Link)
                </label>
                <input
                  type="url"
                  placeholder="https://agency.gov.ph/... or official document URL"
                  value={reportUrlInput}
                  onChange={e => setReportUrlInput(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-lg text-blue-600 dark:text-blue-400 font-mono text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-2 text-slate-400 font-mono text-[9px] uppercase">
                <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
                <span>OR</span>
                <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                  Option B: Upload COA Inspection Report (IIRUP PDF)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={e => setReportFile(e.target.files[0])}
                  className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] text-slate-700 dark:text-slate-300 leading-normal flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>
                  Linking an approved COA IIRUP report validates hardware retirement quotas for Part IV.A replacement proposals.
                </span>
              </div>

              <button
                type="submit"
                disabled={uploadingReport || (!reportFile && !reportUrlInput.trim())}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{uploadingReport ? "Uploading Report..." : "Link Inspection Report"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
