// frontend/src/views/department/Vault/DeptDocumentVault.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getBudgetSummary, 
  getProposals, 
  getNeedsAssessments, 
  getInventory,
  retrieveArchivedDocument
} from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import { 
  FolderKanban, 
  Download, 
  RefreshCw, 
  FileSpreadsheet, 
  ClipboardCheck, 
  Coins, 
  ShieldCheck, 
  Building, 
  ArrowRight, 
  Printer, 
  Table, 
  CheckCircle, 
  AlertCircle, 
  X, 
  ExternalLink, 
  Lock, 
  Layers, 
  Info, 
  Calendar, 
  Eye, 
  FileCheck, 
  Check, 
  Clock, 
  FileText, 
  Search,
  Tag,
  ChevronLeft,
  ChevronRight,
  Database,
  Sparkles
} from "lucide-react";

/**
 * Strips numeric accounting code prefixes to display clean official titles.
 * Example: '50604050 03 - ICT Equipment (CO)' -> 'ICT Equipment (CO)'
 */
const cleanUacsTitle = (uacsStr) => {
  if (!uacsStr) return "";
  const s = String(uacsStr).trim();
  if (s.includes(" - ")) {
    return s.split(" - ", 2)[1].trim();
  }
  return s.replace(/^\d{8}(?:\s+\d{2})?\s*[-–]?\s*/, "").trim() || s;
};

/**
 * Defensively extracts annual allocation values whether stored as objects or scalars.
 */
const parseAnnualItem = (val) => {
  if (typeof val === "object" && val !== null) {
    return {
      capex: parseFloat(val.capex) || 0,
      mooe: parseFloat(val.mooe) || 0
    };
  }
  const num = parseFloat(val) || 0;
  return { capex: num, mooe: 0 };
};

export default function DeptDocumentVault() {
  const { user } = useAuth();
  const { activeCycle, planningYears, agencyName: cycleAgencyName } = useCycle();
  const navigate = useNavigate();

  const defaultAgency = import.meta.env.VITE_DEFAULT_AGENCY_NAME || "National Government Agency";
  const agencyName = cycleAgencyName || user?.agency_name || defaultAgency;
  const deptName = user?.department_name || "Department Planning Office";

  // Data States
  const [budgetSummary, setBudgetSummary] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [needs, setNeeds] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");

  // Active View Tab: "proposals" | "needs" | "budget" | "inventory"
  const [activeTab, setActiveTab] = useState("proposals");

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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

  const loadVaultData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetData, propData, needsData, invData] = await Promise.all([
        getBudgetSummary().catch(() => null),
        getProposals({ issp_period: activeCycle, limit: 1000 }).catch(() => []),
        getNeedsAssessments().catch(() => []),
        getInventory({ limit: 1000 }).catch(() => [])
      ]);

      setBudgetSummary(budgetData);
      setProposals(Array.isArray(propData) ? propData : []);
      setNeeds(Array.isArray(needsData) ? needsData : []);
      setInventory(Array.isArray(invData) ? invData : []);
    } catch (err) {
      setError(err.message || "Failed to load department document vault records.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle]);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

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

  // Transparent Supporting Document Access Handler (Zero Cloud Vendor Jargon)
  const handleOpenQuotation = async (proposal) => {
    if (!proposal.canvas_evidence_url) return;
    try {
      const res = await retrieveArchivedDocument(proposal.id);
      if (res && res.file_url) {
        window.open(res.file_url, "_blank", "noopener,noreferrer");
        return;
      }
    } catch (err) {
      console.warn("Direct archive access fallback:", err);
    }
    window.open(proposal.canvas_evidence_url, "_blank", "noopener,noreferrer");
  };

  // Derived Department KPI Calculations
  const approvedProposals = useMemo(() => {
    return proposals.filter(p => p.status === "Approved");
  }, [proposals]);

  const totalCommittedOutlay = useMemo(() => {
    return approvedProposals.reduce((sum, p) => sum + parseFloat(p.total_cost || 0), 0);
  }, [approvedProposals]);

  const aggregatedNeedsCount = useMemo(() => {
    return needs.filter(n => n.is_aggregated).length;
  }, [needs]);

  const totalInventoryUnits = useMemo(() => {
    return inventory.reduce((sum, i) => sum + (i.quantity || 1), 0);
  }, [inventory]);

  // Filtered Proposals Pipeline
  const filteredProposals = useMemo(() => {
    if (!searchTerm.trim()) return proposals;
    const q = searchTerm.toLowerCase().trim();
    return proposals.filter(p => 
      (p.item_name || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q) ||
      (p.strategic_category || "").toLowerCase().includes(q) ||
      (p.uacs_object_code || "").toLowerCase().includes(q) ||
      (p.supplier_name || "").toLowerCase().includes(q) ||
      (p.status || "").toLowerCase().includes(q)
    );
  }, [proposals, searchTerm]);

  // Client-Side CSV Exporter with UTF-8 BOM & Direct Document Links
  const handleExportDeptProposalsCSV = () => {
    if (proposals.length === 0) {
      setError("No proposal line items available to export.");
      return;
    }

    try {
      const years = activeYears;
      const headers = [
        "Proposal ID",
        "Resource Description",
        "Category",
        "Strategic Spending Category",
        "Assigned Program Outcome",
        "UACS Object Code",
        "Expenditure Class",
        "Status",
        "Base Unit Cost (PHP)",
        ...years.map(y => `FY ${y} Qty`),
        "Total Physical Units",
        "Total Estimated Outlay (PHP)",
        "Quotation Status",
        "Supplier / Vendor Name",
        "Direct Quotation URL",
        "Linked Needs Assessment ID"
      ];

      const rows = proposals.map(p => {
        const outcomeTitle = p.outcome?.outcome_name || p.outcome?.program_name || (p.outcome_id ? `Outcome #${p.outcome_id}` : "Pending Review");
        return [
          `"${p.id}"`,
          `"${(p.item_name || "").replace(/"/g, '""')}"`,
          `"${p.category || "Hardware"}"`,
          `"${p.strategic_category || "Office Productivity"}"`,
          `"${outcomeTitle.replace(/"/g, '""')}"`,
          `"${p.uacs_object_code || ""}"`,
          `"${p.expenditure_class || ""}"`,
          `"${p.status}"`,
          p.unit_cost || 0,
          ...years.map((y, idx) => getYearQty(p, y, idx)),
          p.total_qty || 0,
          p.total_cost || 0,
          `"${p.canvas_evidence_url ? "Attached" : (p.created_by_students || p.is_in_house_turnover ? "Turnover Deed" : "Missing Quote")}"`,
          `"${(p.supplier_name || "").replace(/"/g, '""')}"`,
          `"${p.canvas_evidence_url || ""}"`,
          `"${p.needs_assessment_id || ""}"`
        ];
      });

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      // Add UTF-8 BOM (\uFEFF) to guarantee Microsoft Excel renders currency symbols (₱) properly
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${deptName.replace(/\s+/g, "_")}_ISSP_${activeCycle}_Proposals.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess("Department proposals roster with quotation links exported successfully.");
    } catch (err) {
      setError(`Export error: ${err.message}`);
    }
  };

  // Formal Printable Department Report Handler
  const handlePrintDeptReport = () => {
    const printElement = document.getElementById("dept-vault-print-area");
    if (!printElement) {
      window.print();
      return;
    }

    try {
      const printWindow = window.open("", "_blank", "width=1100,height=850");
      if (!printWindow) {
        window.print();
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${deptName} - ISSP Procurement Records (${activeCycle})</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 20mm 15mm 20mm 15mm;
              }
              body {
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 9pt;
                line-height: 1.4;
                color: #0f172a;
                background: #ffffff;
                margin: 0;
                padding: 0;
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
                font-size: 8pt;
                vertical-align: top;
              }
              th {
                background-color: #f1f5f9;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.3px;
              }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-mono { font-family: monospace; }
              .font-bold { font-weight: bold; }
              .header-bar {
                border-bottom: 2px solid #0f172a;
                padding-bottom: 8px;
                margin-bottom: 16px;
              }
            </style>
          </head>
          <body>
            <div class="header-bar">
              <p style="font-size: 8.5pt; text-transform: uppercase; margin: 0; color: #475569; letter-spacing: 1px;">
                Republic of the Philippines &bull; ${agencyName}
              </p>
              <h2 style="font-size: 14pt; margin: 2px 0; font-weight: bold; text-transform: uppercase;">
                ${deptName}
              </h2>
              <h3 style="font-size: 11pt; color: #1e3a8a; margin: 2px 0; font-weight: bold;">
                ISSP PROCUREMENT ALLOCATION &amp; PROPOSALS SUMMARY (FY ${activeCycle})
              </h3>
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
    } catch {
      window.print();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans transition-colors duration-200">
      
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>{deptName} &bull; Document Vault &amp; Procurement Ledgers</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Active Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Official department-scoped procurement vault. Access attached market quotations, review sub-ceiling budget allocations, audit Section 8.0 needs statements, and download certified CSV records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleExportDeptProposalsCSV}
            disabled={proposals.length === 0}
            className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs text-xs disabled:opacity-50"
            title="Download CSV roster of all department proposals with direct quotation links"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Export Proposals CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrintDeptReport}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm text-xs"
            title="Print formal departmental procurement report"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            onClick={loadVaultData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Refresh Vault Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
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
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-start justify-between gap-2.5 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
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

      {/* Department KPI Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Department Proposals</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {proposals.length} Items ({approvedProposals.length} Approved)
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Approved Outlays</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {formatPHP(totalCommittedOutlay)}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-50 dark:bg-slate-800 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Section 8.0 Needs</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">
              {needs.length} Logged ({aggregatedNeedsCount} Aggregated)
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Assigned Inventory</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">
              {totalInventoryUnits} Units
            </h3>
          </div>
        </div>
      </div>

      {/* Statutory Governance & Archive Transparency Notice (Sanitized) */}
      <div className="p-3.5 bg-blue-50 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10.5px] text-blue-900 dark:text-blue-300 flex items-start gap-2.5 leading-relaxed">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <span>
          <strong>Official Procurement Archive Standards:</strong> In compliance with DICT, DBM, and COA standards, supporting documents and quotations stored in the Long-Term Government Archive are retrieved automatically behind the scenes. You can directly inspect or download attached quotations below without manual restoration requests. Unredacted agency-wide master compilations remain managed by the Chief Information Officer and MIS Administrators.
        </span>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs self-start">
        {[
          { id: "proposals", label: `1. Proposals & Quotations (${proposals.length})`, icon: <FolderKanban className="w-3.5 h-3.5" /> },
          { id: "needs", label: `2. Needs Assessment Roster (${needs.length})`, icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
          { id: "budget", label: "3. Sub-Ceiling Balance Certificate", icon: <Coins className="w-3.5 h-3.5" /> },
          { id: "inventory", label: `4. Department Inventory (${inventory.length})`, icon: <Table className="w-3.5 h-3.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
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
      {/* TAB 1: PROPOSALS LEDGER VIEW WITH DIRECT QUOTATION ACCESS     */}
      {/* ============================================================= */}
      {activeTab === "proposals" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs animate-fadeIn">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                Department Proposals &amp; Official Quotation Archive (Part IV.A)
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                All resource proposals and attached quotations for {deptName} (FY {activeCycle})
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter items..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <Link
                to="/dept/proposals"
                className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-xs flex items-center gap-1 shrink-0"
              >
                <span>Manage Proposals</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredProposals.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3.5">Resource Description</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Program Outcome</th>
                    <th className="p-3.5">UACS &amp; Class</th>
                    <th className="p-3.5 text-center">Physical Units</th>
                    <th className="p-3.5 text-right">Total Outlay</th>
                    <th className="p-3.5 text-center">Attached Quotation Proof</th>
                    <th className="p-3.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredProposals.map(p => {
                    const isStudentAsset = Boolean(p.created_by_students || p.is_in_house_turnover);
                    const isCatalog = Boolean(p.item_key && p.item_key !== "other");
                    const outcomeLabel = p.outcome?.outcome_name || p.outcome?.program_name || (p.outcome_id ? `Outcome #${p.outcome_id}` : "Pending Assignment");

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div>{p.item_name}</div>
                          {p.needs_assessment_id && (
                            <span className="text-[9px] text-teal-600 dark:text-teal-400 font-mono block mt-0.5 font-normal">
                              Needs Assessment Linked
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-mono">
                            {p.category || "Hardware"}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-400">
                          {outcomeLabel}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            {cleanUacsTitle(p.uacs_object_code) || "ICT Equipment (CO)"}
                          </div>
                          <span className={`inline-block mt-0.5 px-2 py-0.2 rounded-full text-[8.5px] font-bold uppercase font-mono border ${
                            p.expenditure_class === "Capital Outlay"
                              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20"
                              : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20"
                          }`}>
                            {p.expenditure_class === "Capital Outlay" ? "Capital Outlay (CO)" : "MOOE"}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-900 dark:text-white">{p.total_qty}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatPHP(p.total_cost)}
                        </td>
                        
                        {/* Direct Transparent Quotation Document Access */}
                        <td className="p-3.5 text-center">
                          {p.canvas_evidence_url ? (
                            <button
                              type="button"
                              onClick={() => handleOpenQuotation(p)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-semibold text-[10.5px] transition-colors cursor-pointer"
                              title="Directly view attached market quotation from the official archive"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="truncate max-w-[120px]">{p.supplier_name || "View Document"}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </button>
                          ) : isCatalog ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono font-bold">
                              Catalog Standard
                            </span>
                          ) : isStudentAsset ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono font-bold">
                              Turnover Deed
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic text-[10px]">None Attached</span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-slate-400 dark:text-slate-500 italic">
                {searchTerm ? "No proposals match your search query." : "No resource proposals drafted yet. Navigate to Resource Proposals to create items."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: NEEDS ASSESSMENT ROSTER                                */}
      {/* ============================================================= */}
      {activeTab === "needs" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs animate-fadeIn">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                Section 8.0 Needs Assessments Registry
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Technical problems submitted by {deptName} for MIS Administrator review
              </p>
            </div>
            <Link
              to="/dept/needs"
              className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-xs flex items-center gap-1"
            >
              <span>Manage Needs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-850">
            {needs.length > 0 ? (
              needs.map(n => (
                <div key={n.id} className="p-4 space-y-2 hover:bg-slate-50/50 dark:hover:bg-slate-955/30 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono font-bold uppercase">
                        {n.mfo_alignment}
                      </span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs mt-1">{n.title}</h4>
                    </div>
                    {n.is_aggregated ? (
                      <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 font-mono font-bold uppercase flex items-center gap-1">
                        <Check className="w-3 h-3" /> Aggregated into Concern
                      </span>
                    ) : (
                      <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 font-mono font-bold uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Under Review
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                    <strong>Problem:</strong> {n.current_problem}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
                    <strong>Proposed Intervention:</strong> {n.proposed_solution}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-slate-400 dark:text-slate-500 italic">
                No Section 8.0 Needs Assessments logged yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: SUB-CEILING BALANCE CERTIFICATE                        */}
      {/* ============================================================= */}
      {activeTab === "budget" && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 space-y-4 shadow-xs animate-fadeIn">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
              Sub-Ceiling Allotment Certificate (FY {activeCycle})
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Authorized planning thresholds established by the MIS Administrator under DBM National Budget Circulars
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Total Sub-Ceiling</span>
              <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                {formatPHP(budgetSummary?.sub_ceiling || 0)}
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block font-mono">
                Spent: {formatPHP(budgetSummary?.total_spent || 0)}
              </span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block">CapEx Pool (Hardware)</span>
              <div className="font-mono text-lg font-bold text-blue-700 dark:text-blue-300">
                {formatPHP(budgetSummary?.allocated_capex || 0)}
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block font-mono">
                Spent: {formatPHP(budgetSummary?.current_spent_capex || 0)}
              </span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block">MOOE Pool (Subscriptions)</span>
              <div className="font-mono text-lg font-bold text-purple-700 dark:text-purple-300">
                {formatPHP(budgetSummary?.allocated_mooe || 0)}
              </div>
              <span className="text-[9.5px] text-slate-400 dark:text-slate-500 block font-mono">
                Spent: {formatPHP(budgetSummary?.current_spent_mooe || 0)}
              </span>
            </div>
          </div>

          {/* Multi-Year Annual Allotment Spread Breakdown */}
          {budgetSummary?.annual_allocations && Object.keys(budgetSummary.annual_allocations).length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 font-mono block">
                Annual Allocation Spread ({activeYears.length} Years Horizon)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[10.5px]">
                {activeYears.map(yr => {
                  const entry = budgetSummary.annual_allocations[String(yr)];
                  if (!entry) return null;
                  const alloc = parseAnnualItem(entry);
                  return (
                    <div key={yr} className="p-2.5 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                        <span>FY {yr}</span>
                        <span>{formatPHP(alloc.capex + alloc.mooe)}</span>
                      </div>
                      <div className="flex justify-between text-[9.5px] text-slate-500 dark:text-slate-400">
                        <span>CapEx: {formatPHP(alloc.capex)}</span>
                        <span>MOOE: {formatPHP(alloc.mooe)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: DEPARTMENT INVENTORY SUMMARY & IIRUP REPORTS          */}
      {/* ============================================================= */}
      {activeTab === "inventory" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs animate-fadeIn">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                Assigned Asset Inventory &amp; IIRUP Reports (Annex 1 Custody)
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Physical hardware and software licenses assigned to {deptName}
              </p>
            </div>
            <Link
              to="/dept/inventory"
              className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-xs flex items-center gap-1"
            >
              <span>Manage Inventory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            {inventory.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                    <th className="p-3.5">Asset Description</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Condition</th>
                    <th className="p-3.5 text-center">Quantity</th>
                    <th className="p-3.5 text-right">Acquisition Unit Cost</th>
                    <th className="p-3.5 text-center">COA IIRUP Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {inventory.slice(0, 20).map(item => {
                    const dictCatLabel = item.dict_category?.value || item.dict_category;
                    const statusLabel = item.status?.value || item.status || "In-Service";

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          <div>{item.item_name}</div>
                          {item.other_category_name && (
                            <div className="text-[9.5px] text-slate-400 dark:text-slate-500 font-mono italic">
                              ({item.other_category_name})
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-400 font-mono">
                          {dictCatLabel || (item.is_software ? "Software" : "Hardware")}
                        </td>
                        <td className="p-3.5 font-mono">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            statusLabel === "Functional"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                              : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                          }`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-900 dark:text-white">{item.quantity}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatPHP(item.acquired_price)}
                        </td>
                        <td className="p-3.5 text-center">
                          {item.unserviceable_report_url ? (
                            <a
                              href={item.unserviceable_report_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold text-[10px]"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                              <span>View IIRUP</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] font-mono">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-slate-400 dark:text-slate-500 italic">
                No inventory assets currently registered in custody.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ISOLATED FORMAL PRINTABLE REPORT CONTAINER */}
      <div id="dept-vault-print-area" className="hidden">
        <div style={{ marginBottom: "16px" }}>
          <h4 style={{ textTransform: "uppercase", fontSize: "10pt", fontWeight: "bold", borderBottom: "1px solid #334155", paddingBottom: "4px" }}>
            1. Sub-Ceiling Budget Allocation Status
          </h4>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Authorized Sub-Ceiling</th>
                <th className="text-right">Committed Spent</th>
                <th className="text-right">Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-bold">Total Budget Sub-Ceiling</td>
                <td className="text-right font-mono font-bold">{formatPHP(budgetSummary?.sub_ceiling || 0)}</td>
                <td className="text-right font-mono">{formatPHP(budgetSummary?.total_spent || 0)}</td>
                <td className="text-right font-mono">{formatPHP((budgetSummary?.sub_ceiling || 0) - (budgetSummary?.total_spent || 0))}</td>
              </tr>
              <tr>
                <td>Capital Outlay (CapEx)</td>
                <td className="text-right font-mono">{formatPHP(budgetSummary?.allocated_capex || 0)}</td>
                <td className="text-right font-mono">{formatPHP(budgetSummary?.current_spent_capex || 0)}</td>
                <td className="text-right font-mono">{formatPHP((budgetSummary?.allocated_capex || 0) - (budgetSummary?.current_spent_capex || 0))}</td>
              </tr>
              <tr>
                <td>Maintenance and Other Operating Expenses (MOOE)</td>
                <td className="text-right font-mono">{formatPHP(budgetSummary?.allocated_mooe || 0)}</td>
                <td className="text-right font-mono">{formatPHP(budgetSummary?.current_spent_mooe || 0)}</td>
                <td className="text-right font-mono">{formatPHP((budgetSummary?.allocated_mooe || 0) - (budgetSummary?.current_spent_mooe || 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h4 style={{ textTransform: "uppercase", fontSize: "10pt", fontWeight: "bold", borderBottom: "1px solid #334155", paddingBottom: "4px" }}>
            2. Detailed Resource Proposals Roster
          </h4>
          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th>Category</th>
                <th>UACS Object Code</th>
                <th className="text-center">Total Units</th>
                <th className="text-right">Total Outlay (PHP)</th>
                <th className="text-center">Review Status</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => (
                <tr key={p.id}>
                  <td className="font-bold">{p.item_name}</td>
                  <td>{p.category || "Hardware"}</td>
                  <td>{p.uacs_object_code || "N/A"}</td>
                  <td className="text-center font-mono">{p.total_qty}</td>
                  <td className="text-right font-mono font-bold">{formatPHP(p.total_cost)}</td>
                  <td className="text-center uppercase font-mono">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}