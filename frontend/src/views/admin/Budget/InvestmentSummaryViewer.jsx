// frontend/src/views/admin/Budget/InvestmentSummaryViewer.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Coins, 
  RefreshCw, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle, 
  ShieldCheck, 
  Layers, 
  Landmark, 
  FileText, 
  Award, 
  Printer, 
  ShieldAlert, 
  BarChart3, 
  Calendar, 
  TrendingUp, 
  HelpCircle, 
  Eye, 
  SlidersHorizontal,
  FileCheck2,
  PieChart,
  Check,
  X,
  ArrowUpRight
} from "lucide-react";

export default function InvestmentSummaryViewer() {
  const { user } = useAuth();
  const { activeCycle, planningYears, agencyName: cycleAgencyName } = useCycle();

  const [data, setData] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [activeTab, setActiveTab] = useState("overview"); // overview, b1, b2, b3, b4, print
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || localStorage.getItem("access_token") || "";

  const defaultAgencyName = import.meta.env.VITE_AGENCY_NAME || "National Government Agency";
  const agencyName = cycleAgencyName || user?.agency_name || data?.agency_name || defaultAgencyName;

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fetchMatrices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/governance/parity-matrices?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load Part IV.B investment matrices.");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message || "Failed to load Part IV.B parity matrices.");
    } finally {
      setLoading(false);
    }
  };

  const runGraphAudit = async () => {
    setValidating(true);
    setGraphStatus(null);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/governance/validate-graph?issp_period=${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        const violations = resData.detail?.violations || [resData.detail || "Graph validation failed."];
        setGraphStatus({ valid: false, message: "ISSP Singularity Integrity Check Failed", violations });
      } else {
        setGraphStatus({ valid: true, message: resData.message || "Singularity DAG certified. All relational chains are sound." });
      }
    } catch (err) {
      setGraphStatus({ valid: false, message: err.message || "Singularity audit network error." });
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      fetchMatrices();
    }
  }, [token, activeCycle]);

  // Clean, Isolated Printable Document Handler:
  // Extracts ONLY the formal document content, applies dedicated print stylesheet,
  // and launches print preview without capturing the sidebar, navbar, or UI buttons.
  const handlePrintDocument = () => {
    const printElement = document.getElementById("formal-print-area");
    if (!printElement) {
      window.print();
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      window.print();
      return;
    }

    // Clean formal print template with strict A4 Landscape margins
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>PART IV.B SUMMARY OF INVESTMENTS - ${agencyName} (${activeCycle})</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 12mm 15mm 12mm 15mm;
            }
            body {
              font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
              font-size: 9pt;
              line-height: 1.4;
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
              margin-bottom: 14px;
              page-break-inside: avoid;
            }
            th, td {
              border: 1px solid #334155;
              padding: 5px 7px;
              font-size: 8.5pt;
              vertical-align: top;
            }
            th {
              background-color: #f1f5f9;
              font-weight: bold;
              text-transform: uppercase;
            }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            .font-bold { font-weight: bold; }
            .header-bar {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 16px;
            }
            .certified-box {
              text-align: center;
              font-weight: bold;
              padding: 10px;
              background-color: #ecfdf5;
              border: 1px solid #10b981;
              color: #047857;
              border-radius: 4px;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <p style="font-size: 8pt; text-transform: uppercase; letter-spacing: 1.2px; margin: 0; color: #475569;">
              Republic of the Philippines
            </p>
            <h2 style="font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 2px 0;">
              ${agencyName}
            </h2>
            <h3 style="font-size: 11pt; font-weight: bold; color: #1e3a8a; margin: 2px 0;">
              INFORMATION SYSTEMS STRATEGIC PLAN (${activeCycle})
            </h3>
            <h4 style="font-size: 10pt; font-weight: bold; text-transform: uppercase; color: #0f172a; margin: 2px 0;">
              PART IV.B: SUMMARY OF INVESTMENTS
            </h4>
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
    }, 300);
  };

  const b1Grid = data?.b1_general_summary || data?.B1_General_Summary;
  const b2Grid = data?.b2_fund_source || data?.B2_Fund_Source;
  const b3Grid = data?.b3_statement_of_expenditure || data?.B3_Statement_Of_Expenditure;
  const b4Grid = data?.b4_object_of_expenditure || data?.B4_Object_Of_Expenditure;

  const getYearColumns = (matrix) => {
    if (data?.year_columns && Array.isArray(data.year_columns) && data.year_columns.length > 0) {
      return data.year_columns;
    }
    if (planningYears && planningYears.length > 0) {
      return planningYears.map(y => `FY ${y}`);
    }
    if (!matrix) return [];
    const grandRow = matrix["GRAND TOTAL"] || matrix["Grand Total"] || Object.values(matrix)[0] || {};
    return Object.keys(grandRow)
      .filter(k => k.toLowerCase() !== "total")
      .sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });
  };

  const getGrandTotal = (matrix) => {
    if (!matrix) return 0;
    const grand = matrix["GRAND TOTAL"] || matrix["Grand Total"] || {};
    return parseFloat(grand["Total"] || grand["total"] || 0);
  };

  const t1 = getGrandTotal(b1Grid);
  const t2 = getGrandTotal(b2Grid);
  const t3 = getGrandTotal(b3Grid);
  const t4 = getGrandTotal(b4Grid);

  const certifiedTotal = parseFloat(data?.certified_grand_total || data?.Certified_Grand_Total || t1 || 0);
  const isParityValid = data?.is_parity_valid !== undefined ? data.is_parity_valid : (t1 === t2 && t2 === t3 && t3 === t4);
  const discrepancy = parseFloat(data?.parity_discrepancy || Math.max(Math.abs(t1 - t2), Math.abs(t1 - t3), Math.abs(t1 - t4)));

  const activeYearCols = getYearColumns(b1Grid);
  const activeHorizonCount = activeYearCols.length;

  const renderGridTable = (gridData, title, description) => {
    if (!gridData) {
      return <div className="text-center py-10 text-slate-400 italic">No ledger records mapped for this classification.</div>;
    }

    const yearCols = getYearColumns(gridData);
    const totalOutlay = getGrandTotal(gridData);
    const totalHeaderLabel = yearCols.length > 0 ? `${yearCols.length}-Year Total` : "Total Amount";

    return (
      <div className="space-y-3 animate-fadeIn">
        <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-800 pb-2">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5 font-serif">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{title}</span>
            </h3>
            {description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Table Subtotal: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatPHP(totalOutlay)}</strong>
          </span>
        </div>

        <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-bold text-[10px]">
                <th className="p-3.5 w-2/5">Category / Classification Line Item</th>
                {yearCols.map(y => (
                  <th key={y} className="p-3.5 text-right font-mono">{y}</th>
                ))}
                <th className="p-3.5 text-right font-bold text-slate-900 dark:text-white font-mono">{totalHeaderLabel}</th>
                <th className="p-3.5 text-right text-[9px] w-20">Distribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {Object.entries(gridData).map(([rowKey, vals]) => {
                const isGrand = rowKey === "GRAND TOTAL" || rowKey === "Grand Total";
                const rowTotal = parseFloat(vals["Total"] || vals["total"] || 0);
                const percentOfTotal = totalOutlay > 0 ? ((rowTotal / totalOutlay) * 100).toFixed(1) : "0.0";

                return (
                  <tr 
                    key={rowKey} 
                    className={`transition-colors ${
                      isGrand 
                        ? "bg-slate-100/80 dark:bg-slate-955/80 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700" 
                        : "hover:bg-slate-50/70 dark:hover:bg-slate-955/30 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <td className={`p-3.5 ${isGrand ? "font-bold text-slate-900 dark:text-white uppercase tracking-wide" : "font-medium text-slate-800 dark:text-slate-200"}`}>
                      {rowKey}
                    </td>
                    {yearCols.map(y => (
                      <td key={y} className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {formatPHP(vals[y] || 0)}
                      </td>
                    ))}
                    <td className={`p-3.5 text-right font-mono font-bold ${isGrand ? "text-emerald-600 dark:text-emerald-400 text-sm" : "text-slate-900 dark:text-slate-100"}`}>
                      {formatPHP(rowTotal)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-[10px] text-slate-500">
                      {isGrand ? "100%" : `${percentOfTotal}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs print-hide">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Part IV.B: Summary of Investments (Financial Parity Certification)</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Enforces strict DBM / MITHI mathematical parity across multi-year horizons: Table B.1 (General) &equiv; Table B.2 (Fund Source) &equiv; Table B.3 (Expenditure Class) &equiv; Table B.4 (UACS Object Codes).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={runGraphAudit} 
            disabled={validating}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50 text-xs"
          >
            <ShieldCheck className={`w-4 h-4 ${validating ? "animate-spin" : ""}`} />
            <span>{validating ? "Auditing DAG..." : "Audit Singularity DAG"}</span>
          </button>
          <button 
            onClick={fetchMatrices} 
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Recalculate Investment Summaries"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Parity</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold rounded-xl flex items-center gap-2.5 animate-fadeIn shadow-xs print-hide">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Singularity DAG Audit Result Banner */}
      {graphStatus && (
        <div className={`p-5 rounded-2xl border space-y-2.5 animate-fadeIn shadow-xs print-hide ${
          graphStatus.valid 
            ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300" 
            : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-300"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm">
              {graphStatus.valid ? (
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 animate-bounce" />
              )}
              <span>{graphStatus.valid ? "Singularity DAG Certified: 100% Provenance Linkage" : "Singularity Graph Audit Failure"}</span>
            </div>
            <button 
              onClick={() => setGraphStatus(null)} 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{graphStatus.message}</p>
          {graphStatus.violations && graphStatus.violations.length > 0 && (
            <ul className="list-disc list-inside space-y-1 pt-1 font-mono text-[10px] text-rose-700 dark:text-rose-300 bg-white/60 dark:bg-slate-950/60 p-3 rounded-xl border border-rose-200 dark:border-rose-900/40">
              {graphStatus.violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Parity Status Certification Badge */}
      <div className={`p-6 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all shadow-xs print-hide ${
        isParityValid 
          ? "bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300" 
          : "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-300 animate-pulse"
      }`}>
        <div className="flex items-start gap-3.5">
          {isParityValid ? (
            <Award className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <h3 className="font-bold text-sm uppercase tracking-wide text-slate-900 dark:text-white">
              {isParityValid ? "★ Certified Four-Way Mathematical Parity Achieved ★" : "FATAL RECONCILIATION IMBALANCE DETECTED"}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-2xl">
              {isParityValid 
                ? `Tables B.1, B.2, B.3, and B.4 resolve to the identical sum across FY ${activeCycle}. Ready for DBM submission and PDF compilation.` 
                : `A discrepancy of ${formatPHP(discrepancy)} was detected across the summary tables. Inspect unmapped UACS codes or missing fund sources.`}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 font-mono bg-slate-50 dark:bg-slate-955 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
            Certified {activeHorizonCount > 0 ? `${activeHorizonCount}-Year` : ""} Investment
          </span>
          <span className={`text-xl font-bold ${isParityValid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {formatPHP(certifiedTotal)}
          </span>
        </div>
      </div>

      {/* 4-Way Comparison Cards Widget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print-hide">
        <div 
          onClick={() => setActiveTab("b1")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b1" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Table B.1 General Summary</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t1)}</div>
          <span className="text-[10px] text-slate-400 mt-1 block">Office, Projects &amp; Continuing</span>
        </div>

        <div 
          onClick={() => setActiveTab("b2")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b2" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Table B.2 Fund Source</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t2)}</div>
          <span className="text-[10px] text-slate-400 mt-1 block">GAA, FAP, Local &amp; Income</span>
        </div>

        <div 
          onClick={() => setActiveTab("b3")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b3" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Table B.3 Expenditure</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t3)}</div>
          <span className="text-[10px] text-slate-400 mt-1 block">Capital Outlay vs MOOE</span>
        </div>

        <div 
          onClick={() => setActiveTab("b4")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b4" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Table B.4 UACS Object</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t4)}</div>
          <span className="text-[10px] text-slate-400 mt-1 block">Standard DBM Accounting Codes</span>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 print-hide shadow-xs">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "overview" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Consolidated Overview</span>
        </button>
        <button
          onClick={() => setActiveTab("b1")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b1" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.1 General Summary</span>
        </button>
        <button
          onClick={() => setActiveTab("b2")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b2" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.2 Fund Source</span>
        </button>
        <button
          onClick={() => setActiveTab("b3")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b3" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.3 Statement of Expenditure</span>
        </button>
        <button
          onClick={() => setActiveTab("b4")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b4" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.4 Object of Expenditure</span>
        </button>
        <button
          onClick={() => setActiveTab("print")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 ml-auto cursor-pointer text-xs ${
            activeTab === "print" ? "bg-emerald-600 text-white shadow-xs" : "text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-white"
          }`}
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print-Ready Formal Preview</span>
        </button>
      </div>

      {/* Main Workspace Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm print-hide">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span>Calculating mathematical parity matrices from atomic line items...</span>
        </div>
      ) : (
        <div>
          {/* TAB 0: CONSOLIDATED OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-fadeIn print-hide">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderGridTable(b1Grid, "B.1 General Summary", "Groups budget by functional category")}
                {renderGridTable(b2Grid, "B.2 Fund Source", "Groups budget by financing mechanism")}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderGridTable(b3Grid, "B.3 Statement of Expenditure", "Classifies outlays into Capital Outlay and MOOE")}
                {renderGridTable(b4Grid, "B.4 Object of Expenditure (UACS)", "Maps items to Unified Accounts Code Structure ledgers (including ICT Training & Consulting)")}
              </div>
            </div>
          )}

          {/* TAB 1: B.1 GENERAL SUMMARY */}
          {activeTab === "b1" && (
            <div className="print-hide">
              {renderGridTable(
                b1Grid, 
                "Part IV.B.1 General Summary", 
                "Consolidates Office Productivity, Internal ICT Projects, Cross-Agency Projects, and Continuing Costs across all planning years."
              )}
            </div>
          )}

          {/* TAB 2: B.2 FUND SOURCE */}
          {activeTab === "b2" && (
            <div className="print-hide">
              {renderGridTable(
                b2Grid, 
                "Part IV.B.2 Fund Source", 
                "Identifies the funding source origins: General Appropriations Act (GAA), Foreign-Assisted (FAP), Locally Funded, and Other Income."
              )}
            </div>
          )}

          {/* TAB 3: B.3 STATEMENT OF EXPENDITURE */}
          {activeTab === "b3" && (
            <div className="print-hide">
              {renderGridTable(
                b3Grid, 
                "Part IV.B.3 Statement of Expenditure", 
                "Enforces the government capitalization threshold: Capital Outlay (Unit Cost >= ₱50,000.00) vs MOOE (Unit Cost < ₱50,000.00, subscriptions, services)."
              )}
            </div>
          )}

          {/* TAB 4: B.4 OBJECT OF EXPENDITURE (UACS) */}
          {activeTab === "b4" && (
            <div className="print-hide">
              {renderGridTable(
                b4Grid, 
                "Part IV.B.4 Object of Expenditure (UACS Standard)", 
                "Detailed account code classification matching COA and DBM standards for ICT Equipment, Software, Subscriptions, Training, and Consulting."
              )}
            </div>
          )}

          {/* TAB 5: FORMAL PRINT-READY PREVIEW & ISOLATED PRINT CANVAS */}
          {activeTab === "print" && (
            <div className="space-y-4">
              {/* Action Bar */}
              <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs print-hide">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                    Formal Government Document Print Preview
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Clicking "Print Document" prints only the formal A4 Landscape Part IV.B summary tables without capturing any dashboard shell or sidebars.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePrintDocument}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl font-sans text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
              </div>

              {/* The Isolated Formal Document Area */}
              <div 
                id="formal-print-area" 
                className="bg-white text-slate-900 p-8 rounded-2xl border border-slate-300 space-y-6 font-serif shadow-xl animate-fadeIn"
              >
                {/* Formal Header */}
                <div className="border-b-2 border-slate-900 pb-4 space-y-1">
                  <p className="text-[11px] uppercase tracking-widest font-sans font-bold text-slate-600 m-0">
                    Republic of the Philippines
                  </p>
                  <h2 className="text-base font-bold uppercase m-0">
                    {agencyName}
                  </h2>
                  <h3 className="text-sm font-bold m-0">
                    INFORMATION SYSTEMS STRATEGIC PLAN ({activeCycle})
                  </h3>
                  <h4 className="text-xs uppercase tracking-wider font-sans font-bold text-blue-900 m-0">
                    PART IV.B: SUMMARY OF INVESTMENTS
                  </h4>
                </div>

                <div className="space-y-6 text-[10.5pt]">
                  {/* Formal B.1 */}
                  <div>
                    <h5 className="font-bold text-xs uppercase mb-1 font-sans">B.1. GENERAL SUMMARY</h5>
                    <table className="w-full border-collapse border border-slate-700 text-[9pt]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-sans font-bold">
                          <th className="border border-slate-700 p-2 text-left">Category</th>
                          {activeYearCols.map(y => (
                            <th key={y} className="border border-slate-700 p-2 text-right">{y}</th>
                          ))}
                          <th className="border border-slate-700 p-2 text-right font-bold font-mono">
                            {activeHorizonCount > 0 ? `${activeHorizonCount}-Year Total` : "Total Cost (PHP)"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {b1Grid && Object.entries(b1Grid).map(([k, v]) => (
                          <tr key={k} className={k.includes("GRAND") ? "font-bold bg-slate-200" : ""}>
                            <td className="border border-slate-700 p-2">{k}</td>
                            {activeYearCols.map(y => (
                              <td key={y} className="border border-slate-700 p-2 text-right font-mono">{formatPHP(v[y] || 0)}</td>
                            ))}
                            <td className="border border-slate-700 p-2 text-right font-mono font-bold">{formatPHP(v["Total"] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Formal B.2 */}
                  <div>
                    <h5 className="font-bold text-xs uppercase mb-1 font-sans">B.2. FUND SOURCE</h5>
                    <table className="w-full border-collapse border border-slate-700 text-[9pt]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-sans font-bold">
                          <th className="border border-slate-700 p-2 text-left">Fund Source</th>
                          {activeYearCols.map(y => (
                            <th key={y} className="border border-slate-700 p-2 text-right">{y}</th>
                          ))}
                          <th className="border border-slate-700 p-2 text-right font-bold font-mono">
                            {activeHorizonCount > 0 ? `${activeHorizonCount}-Year Total` : "Total Cost (PHP)"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {b2Grid && Object.entries(b2Grid).map(([k, v]) => (
                          <tr key={k} className={k.includes("GRAND") ? "font-bold bg-slate-200" : ""}>
                            <td className="border border-slate-700 p-2">{k}</td>
                            {activeYearCols.map(y => (
                              <td key={y} className="border border-slate-700 p-2 text-right font-mono">{formatPHP(v[y] || 0)}</td>
                            ))}
                            <td className="border border-slate-700 p-2 text-right font-mono font-bold">{formatPHP(v["Total"] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Formal B.3 */}
                  <div>
                    <h5 className="font-bold text-xs uppercase mb-1 font-sans">B.3. STATEMENT OF EXPENDITURE</h5>
                    <table className="w-full border-collapse border border-slate-700 text-[9pt]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-sans font-bold">
                          <th className="border border-slate-700 p-2 text-left">Expenditure Class</th>
                          {activeYearCols.map(y => (
                            <th key={y} className="border border-slate-700 p-2 text-right">{y}</th>
                          ))}
                          <th className="border border-slate-700 p-2 text-right font-bold font-mono">
                            {activeHorizonCount > 0 ? `${activeHorizonCount}-Year Total` : "Total Cost (PHP)"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {b3Grid && Object.entries(b3Grid).map(([k, v]) => (
                          <tr key={k} className={k.includes("GRAND") ? "font-bold bg-slate-200" : ""}>
                            <td className="border border-slate-700 p-2">{k}</td>
                            {activeYearCols.map(y => (
                              <td key={y} className="border border-slate-700 p-2 text-right font-mono">{formatPHP(v[y] || 0)}</td>
                            ))}
                            <td className="border border-slate-700 p-2 text-right font-mono font-bold">{formatPHP(v["Total"] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Formal B.4 */}
                  <div>
                    <h5 className="font-bold text-xs uppercase mb-1 font-sans">B.4. OBJECT OF EXPENDITURE (UACS ACCOUNTING CODES)</h5>
                    <table className="w-full border-collapse border border-slate-700 text-[9pt]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 font-sans font-bold">
                          <th className="border border-slate-700 p-2 text-left">UACS Object Code</th>
                          {activeYearCols.map(y => (
                            <th key={y} className="border border-slate-700 p-2 text-right">{y}</th>
                          ))}
                          <th className="border border-slate-700 p-2 text-right font-bold font-mono">
                            {activeHorizonCount > 0 ? `${activeHorizonCount}-Year Total` : "Total Cost (PHP)"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {b4Grid && Object.entries(b4Grid).map(([k, v]) => (
                          <tr key={k} className={k.includes("GRAND") ? "font-bold bg-slate-200" : ""}>
                            <td className="border border-slate-700 p-2">{k}</td>
                            {activeYearCols.map(y => (
                              <td key={y} className="border border-slate-700 p-2 text-right font-mono">{formatPHP(v[y] || 0)}</td>
                            ))}
                            <td className="border border-slate-700 p-2 text-right font-mono font-bold">{formatPHP(v["Total"] || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="certified-box">
                    ★ CERTIFIED BALANCED: Multi-Year Strategic Investment Total ({activeHorizonCount > 0 ? `${activeHorizonCount} Fiscal Years` : "Complete Horizon"}) is {formatPHP(certifiedTotal)} ★
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}