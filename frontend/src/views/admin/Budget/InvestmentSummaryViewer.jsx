// frontend/src/views/admin/Budget/InvestmentSummaryViewer.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getParityMatrices, 
  validateSingularityGraph, 
  exportBudgetBlob 
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  Coins, 
  RefreshCw, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle, 
  ShieldCheck, 
  Landmark, 
  FileText, 
  Award, 
  Printer, 
  ShieldAlert, 
  Calendar, 
  SlidersHorizontal,
  X, 
  Download, 
  Info, 
  Scale, 
  Sparkles, 
  ArrowUpRight, 
  ChevronRight, 
  TrendingUp, 
  Building,
  Filter,
  Layers,
  CheckSquare,
  Tag
} from "lucide-react";

/**
 * Strips numeric UACS accounting prefixes, displaying solely the clean account title.
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

export default function InvestmentSummaryViewer() {
  const { user } = useAuth();
  const { activeCycle, planningYears, agencyName: cycleAgencyName, agencyLogoUrl } = useCycle();

  // Core Parity Data & Audit States
  const [data, setData] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Proposal-to-Project Governance Filter:
  // true = Only approved proposals bound to ICT Projects (or standalone operational buckets) -> matches final ISSP PDF compilation.
  // false = Entire planning pipeline ledger (including pending drafts and pool items).
  const [onlyApproved, setOnlyApproved] = useState(true);

  // Active View Tab: "overview" | "b1" | "b2" | "b3" | "b4" | "print"
  const [activeTab, setActiveTab] = useState("overview");

  const token = user?.token || (typeof window !== "undefined" ? localStorage.getItem("access_token") : "");

  const defaultAgencyName = import.meta.env.VITE_DEFAULT_AGENCY_NAME || "National Government Agency";
  const agencyName = cycleAgencyName || user?.agency_name || data?.agency_name || defaultAgencyName;

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // -------------------------------------------------------------
  // DATA FETCHING & SINGULARITY VALIDATION
  // -------------------------------------------------------------
  const fetchMatrices = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const json = await getParityMatrices(token, activeCycle, onlyApproved);
      setData(json);
    } catch (err) {
      setError(err.message || "Failed to load Part IV.B investment matrices.");
    } finally {
      setLoading(false);
    }
  }, [token, activeCycle, onlyApproved]);

  const runGraphAudit = async () => {
    if (!token || !activeCycle) return;
    setValidating(true);
    setGraphStatus(null);
    setError(null);
    try {
      const resData = await validateSingularityGraph(token, activeCycle);
      setGraphStatus({ 
        valid: true, 
        message: resData.message || "Singularity DAG certified. All relational chains and financial parity tables are sound." 
      });
      setSuccess("Singularity graph successfully validated.");
    } catch (err) {
      const msg = err.message || "Singularity audit network error.";
      let parsedViolations = [];
      if (err.violations && Array.isArray(err.violations)) {
        parsedViolations = err.violations;
      } else if (msg.includes(": ") && msg.includes(" | ")) {
        const parts = msg.split(": ")[1];
        if (parts) {
          parsedViolations = parts.split(" | ");
        }
      } else if (msg.includes("Part ")) {
        parsedViolations = [msg];
      }

      setGraphStatus({ 
        valid: false, 
        message: msg,
        violations: parsedViolations
      });
    } finally {
      setValidating(false);
    }
  };

  const handleExportCsv = async () => {
    if (!token || !activeCycle) return;
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

  useEffect(() => {
    if (token && activeCycle) {
      fetchMatrices();
    }
  }, [token, activeCycle, fetchMatrices]);

  // Matrix Grids
  const b1Grid = data?.b1_general_summary || data?.B1_General_Summary;
  const b2Grid = data?.b2_fund_source || data?.B2_Fund_Source;
  const b3Grid = data?.b3_statement_of_expenditure || data?.B3_Statement_Of_Expenditure;
  const b4Grid = data?.b4_object_of_expenditure || data?.B4_Object_Of_Expenditure;

  // Derive dynamic year sequence (e.g. ['FY 2026', 'FY 2027', 'FY 2028', ...])
  const getYearColumns = useCallback((matrix) => {
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
  }, [data?.year_columns, planningYears]);

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
  const isParityValid = data?.is_parity_valid !== undefined 
    ? data.is_parity_valid 
    : (Math.abs(t1 - t2) < 0.01 && Math.abs(t1 - t3) < 0.01 && Math.abs(t1 - t4) < 0.01);
  const discrepancy = parseFloat(data?.parity_discrepancy || Math.max(Math.abs(t1 - t2), Math.abs(t1 - t3), Math.abs(t1 - t4)));

  const activeYearCols = useMemo(() => getYearColumns(b1Grid), [getYearColumns, b1Grid]);
  const activeHorizonCount = activeYearCols.length;

  // -------------------------------------------------------------
  // FORMAL PRINTABLE DOCUMENT GENERATOR
  // -------------------------------------------------------------
  const handlePrintDocument = () => {
    const printElement = document.getElementById("formal-print-area");
    if (!printElement) {
      window.print();
      return;
    }

    try {
      const printWindow = window.open("", "_blank", "width=1200,height=900");
      if (!printWindow) {
        window.print();
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>PART IV.B SUMMARY OF INVESTMENTS - ${agencyName} (${activeCycle})</title>
            <style>
              @page {
                size: A4 landscape;
                margin: 15mm;
              }
              body {
                font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
                font-size: 8.5pt;
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
                INFORMATION SYSTEMS STRATEGIC PLAN (${activeCycle})
              </h3>
              <h4 style="font-size: 10pt; font-weight: bold; text-transform: uppercase; color: #0f172a; margin: 2px 0;">
                B. SUMMARY OF INVESTMENTS
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
      }, 350);
    } catch {
      window.print();
    }
  };

  // Helper to render interactive screen tables for Tables B.1, B.2, B.3, B.4
  const renderGridTable = (gridData, title, columnTitle, description) => {
    if (!gridData) {
      return (
        <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 italic">
          No ledger records mapped for this classification.
        </div>
      );
    }

    const yearCols = getYearColumns(gridData);
    const totalOutlay = getGrandTotal(gridData);
    const totalHeaderLabel = yearCols.length > 0 ? `${yearCols.length}-Year Total` : "Total Amount";
    const isUacsTable = title.includes("B.4") || title.toUpperCase().includes("OBJECT OF EXPENDITURE");

    // Partition keys so GRAND TOTAL is always strictly the final row
    const regularKeys = Object.keys(gridData).filter(
      k => k !== "GRAND TOTAL" && k !== "Grand Total"
    );
    const grandRowKey = Object.keys(gridData).find(
      k => k === "GRAND TOTAL" || k === "Grand Total"
    );
    const grandRowVals = grandRowKey ? gridData[grandRowKey] : null;

    return (
      <div className="space-y-3 animate-fadeIn">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end border-b border-slate-200 dark:border-slate-800 pb-2 gap-2">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5 font-serif">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{title}</span>
            </h3>
            {description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            Table Subtotal: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatPHP(totalOutlay)}</strong>
          </span>
        </div>

        <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-600 dark:text-slate-400 uppercase font-bold text-[10px]">
                <th className="p-3.5 w-2/5">{columnTitle}</th>
                {yearCols.map(y => (
                  <th key={y} className="p-3.5 text-right font-mono">{y}</th>
                ))}
                <th className="p-3.5 text-right font-bold text-slate-900 dark:text-white font-mono">{totalHeaderLabel}</th>
                <th className="p-3.5 text-right text-[9px] w-20">Share %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
              {regularKeys.map((rowKey) => {
                const vals = gridData[rowKey] || {};
                const rowTotal = parseFloat(vals["Total"] || vals["total"] || 0);
                const percentOfTotal = totalOutlay > 0 ? ((rowTotal / totalOutlay) * 100).toFixed(1) : "0.0";

                return (
                  <tr 
                    key={rowKey} 
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-955/30 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <td className="p-3.5 font-medium text-slate-800 dark:text-slate-200">
                      {isUacsTable && rowKey.includes(" - ") ? (
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white block">{cleanUacsTitle(rowKey)}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{rowKey.split(" - ")[0]}</span>
                        </div>
                      ) : (
                        <span>{rowKey}</span>
                      )}
                    </td>
                    {yearCols.map(y => {
                      const cellVal = vals[y] !== undefined 
                        ? vals[y] 
                        : (vals[y.replace("FY ", "")] !== undefined ? vals[y.replace("FY ", "")] : 0);
                      return (
                        <td key={y} className="p-3.5 text-right font-mono text-slate-700 dark:text-slate-300">
                          {formatPHP(cellVal)}
                        </td>
                      );
                    })}
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatPHP(rowTotal)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      {percentOfTotal}%
                    </td>
                  </tr>
                );
              })}

              {grandRowVals && (
                <tr className="bg-slate-100/90 dark:bg-slate-955 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                  <td className="p-3.5 font-bold uppercase tracking-wider">
                    {grandRowKey}
                  </td>
                  {yearCols.map(y => {
                    const grandCellVal = grandRowVals[y] !== undefined 
                      ? grandRowVals[y] 
                      : (grandRowVals[y.replace("FY ", "")] !== undefined ? grandRowVals[y.replace("FY ", "")] : 0);
                    return (
                      <td key={y} className="p-3.5 text-right font-mono">
                        {formatPHP(grandCellVal)}
                      </td>
                    );
                  })}
                  <td className="p-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {formatPHP(grandRowVals["Total"] !== undefined ? grandRowVals["Total"] : (grandRowVals["total"] !== undefined ? grandRowVals["total"] : totalOutlay))}
                  </td>
                  <td className="p-3.5 text-right font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    100.0%
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Helper to render formal print tables in a structured, clean layout
  const renderPrintableTableSection = (gridData, sectionCode, sectionTitle, colHeader) => {
    if (!gridData) return null;
    const yearCols = activeYearCols;
    const totalHeaderLabel = activeHorizonCount > 0 ? `${activeHorizonCount}-YEAR TOTAL` : "TOTAL";
    const grand = gridData["GRAND TOTAL"] || gridData["Grand Total"];
    const entries = Object.entries(gridData).filter(([k]) => k !== "GRAND TOTAL" && k !== "Grand Total");
    const isUacsTable = sectionCode.includes("B.4") || sectionTitle.toUpperCase().includes("OBJECT OF EXPENDITURE");

    return (
      <div style={{ marginBottom: "18px", pageBreakInside: "avoid" }}>
        <h5 style={{ fontWeight: "bold", fontSize: "9pt", textTransform: "uppercase", marginBottom: "4px", fontFamily: "sans-serif", color: "#0f172a" }}>
          {sectionCode}. {sectionTitle}
        </h5>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #334155", fontSize: "8pt" }}>
          <thead>
            <tr style={{ backgroundColor: "#f1f5f9", color: "#0f172a", fontFamily: "sans-serif", fontWeight: "bold" }}>
              <th style={{ border: "1px solid #334155", padding: "6px 8px", textAlign: "left", width: "40%" }}>{colHeader}</th>
              {yearCols.map(y => (
                <th key={y} style={{ border: "1px solid #334155", padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{y}</th>
              ))}
              <th style={{ border: "1px solid #334155", padding: "6px 8px", textAlign: "right", fontWeight: "bold", fontFamily: "monospace" }}>
                {totalHeaderLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td style={{ border: "1px solid #334155", padding: "5px 8px" }}>
                  {isUacsTable && k.includes(" - ") ? (
                    <div>
                      <span style={{ fontWeight: "bold", display: "block" }}>{cleanUacsTitle(k)}</span>
                      <span style={{ fontSize: "7pt", color: "#64748b", fontFamily: "monospace" }}>{k.split(" - ")[0]}</span>
                    </div>
                  ) : (
                    k
                  )}
                </td>
                {yearCols.map(y => {
                  const val = v[y] !== undefined ? v[y] : (v[y.replace("FY ", "")] !== undefined ? v[y.replace("FY ", "")] : 0);
                  return (
                    <td key={y} style={{ border: "1px solid #334155", padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>
                      {formatPHP(val)}
                    </td>
                  );
                })}
                <td style={{ border: "1px solid #334155", padding: "5px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                  {formatPHP(v["Total"] !== undefined ? v["Total"] : (v["total"] || 0))}
                </td>
              </tr>
            ))}
            {grand && (
              <tr style={{ fontWeight: "bold", backgroundColor: "#e2e8f0" }}>
                <td style={{ border: "1px solid #334155", padding: "6px 8px", textTransform: "uppercase" }}>GRAND TOTAL</td>
                {yearCols.map(y => {
                  const val = grand[y] !== undefined ? grand[y] : (grand[y.replace("FY ", "")] !== undefined ? grand[y.replace("FY ", "")] : 0);
                  return (
                    <td key={y} style={{ border: "1px solid #334155", padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                      {formatPHP(val)}
                    </td>
                  );
                })}
                <td style={{ border: "1px solid #334155", padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                  {formatPHP(grand["Total"] !== undefined ? grand["Total"] : (grand["total"] || 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 select-none max-w-7xl mx-auto font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs print-hide">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
              <span>Part IV.B: Summary of Investments (Four-Way Parity Ledger)</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20 font-mono">
              Cycle: FY {activeCycle || "2026-2028"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs">
            Certifies DBM and DICT mathematical parity across all four planning dimensions: <strong>Table B.1 (General Summary)</strong> &equiv; <strong>Table B.2 (Fund Source)</strong> &equiv; <strong>Table B.3 (Statement of Expenditure)</strong> &equiv; <strong>Table B.4 (Object of Expenditure)</strong>.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Scope Filter Segmented Switch */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <button
              type="button"
              onClick={() => setOnlyApproved(true)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                onlyApproved 
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Official DICT compiled scope: Approved proposals bound to ICT Projects or Continuing Costs"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Project-Bound Scope</span>
            </button>
            <button
              type="button"
              onClick={() => setOnlyApproved(false)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                !onlyApproved 
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs" 
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Master planning ledger: Includes all submitted and pipeline draft proposals"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Comprehensive Ledger</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs text-xs"
            title="Download Part IV.A Detailed Deployment to DBM OSPS / NEP-compliant CSV"
          >
            <Download className={`w-3.5 h-3.5 ${exportingCsv ? "animate-spin text-blue-500" : "text-blue-600 dark:text-blue-400"}`} />
            <span>{exportingCsv ? "Exporting..." : "Export DBM CSV"}</span>
          </button>
          
          <button
            type="button"
            onClick={runGraphAudit} 
            disabled={validating}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50 text-xs"
            title="Perform end-to-end dependency verification across all sections"
          >
            <ShieldCheck className={`w-4 h-4 ${validating ? "animate-spin" : "text-blue-600 dark:text-blue-400"}`} />
            <span>{validating ? "Auditing Graph..." : "Audit Singularity DAG"}</span>
          </button>

          {/* Unified Save & Verify Compiler Pipeline Action */}
          <CompilerSyncButton
            moduleName="parity"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchMatrices}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button 
            type="button"
            onClick={fetchMatrices} 
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 font-bold shadow-xs text-xs"
            title="Reload Parity Matrices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Scope Governance Indicator Callout */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-slate-600 dark:text-slate-300 text-xs print-hide shadow-xs">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-slate-900 dark:text-white font-semibold">
            {onlyApproved ? "Compilation Guardrail Active (Project-Bound Proposals Only): " : "Full Lifecycle Oversight Active (Comprehensive Planning Ledger): "}
          </strong>
          {onlyApproved ? (
            <span>
              Under standard DICT ISSP regulations, only approved proposals bound to an authorized <strong>ICT Project (Part III.E)</strong> or statutory continuing operations (Office Productivity / Continuing Costs) contribute to the compiled Part IV.B summary and PDF document. Detached pool items remain excluded until assigned.
            </span>
          ) : (
            <span>
              Displaying all proposal line items recorded across departments, including draft items, submitted reviews, and unassigned intake pool proposals. This provides complete visibility into internal agency demands prior to portfolio linkage.
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start justify-between gap-2.5 animate-fadeIn shadow-xs print-hide">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <span className="font-semibold whitespace-pre-wrap leading-relaxed">{typeof error === "object" ? (error.message || JSON.stringify(error)) : error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold rounded-xl flex items-center justify-between gap-2.5 animate-fadeIn shadow-xs print-hide">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
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
              type="button"
              onClick={() => setGraphStatus(null)} 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{graphStatus.message}</p>
          {graphStatus.violations && graphStatus.violations.length > 0 && (
            <ul className="list-disc list-inside space-y-1 pt-1 font-mono text-[10px] text-rose-700 dark:text-rose-300 bg-white/60 dark:bg-slate-955/60 p-3 rounded-xl border border-rose-200 dark:border-rose-900/40">
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
          : "bg-rose-50 dark:bg-rose-955/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-300"
      }`}>
        <div className="flex items-start gap-3.5">
          {isParityValid ? (
            <Award className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 animate-pulse" />
          )}
          <div className="space-y-1">
            <h3 className="font-bold text-sm uppercase tracking-wide text-slate-900 dark:text-white">
              {isParityValid ? "★ Certified Four-Way Mathematical Parity Achieved ★" : "FATAL RECONCILIATION IMBALANCE DETECTED"}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-2xl">
              {isParityValid 
                ? `Tables B.1, B.2, B.3, and B.4 resolve to the identical sum across FY ${activeCycle} down to the exact centavo. Compounded inflation buffers and project-level attributes are synchronized.` 
                : `A mathematical discrepancy of ${formatPHP(discrepancy)} was detected across the summary tables. Inspect unmapped UACS account codes or missing fund sources.`}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 font-mono bg-slate-50 dark:bg-slate-955 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider block">
            Certified {activeHorizonCount > 0 ? `${activeHorizonCount}-Year` : ""} Investment
          </span>
          <span className={`text-xl font-bold ${isParityValid ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {formatPHP(certifiedTotal)}
          </span>
        </div>
      </div>

      {/* Discrepancy Breakdown Box if Parity Fails */}
      {!isParityValid && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 rounded-2xl space-y-2 animate-fadeIn print-hide">
          <span className="font-bold text-rose-900 dark:text-rose-300 text-xs flex items-center gap-1.5 uppercase font-mono">
            <Scale className="w-4 h-4 text-rose-600" />
            <span>Table Discrepancy Diagnostics:</span>
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-800">
              <span className="text-slate-400 dark:text-slate-500 block text-[9px]">Table B.1 (General):</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatPHP(t1)}</span>
            </div>
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-800">
              <span className="text-slate-400 dark:text-slate-500 block text-[9px]">Table B.2 (Fund Source):</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatPHP(t2)}</span>
            </div>
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-800">
              <span className="text-slate-400 dark:text-slate-500 block text-[9px]">Table B.3 (Exp. Class):</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatPHP(t3)}</span>
            </div>
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-800">
              <span className="text-slate-400 dark:text-slate-500 block text-[9px]">Table B.4 (UACS):</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatPHP(t4)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 4-Way Comparison Cards Widget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print-hide">
        <div 
          onClick={() => setActiveTab("b1")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b1" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Table B.1 General Summary</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t1)}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">Office, Projects &amp; Continuing</span>
        </div>

        <div 
          onClick={() => setActiveTab("b2")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b2" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Table B.2 Fund Source</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t2)}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">GAA, FAP, Local &amp; Income</span>
        </div>

        <div 
          onClick={() => setActiveTab("b3")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b3" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Table B.3 Statement of Expenditure</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t3)}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">Capital Outlay vs MOOE</span>
        </div>

        <div 
          onClick={() => setActiveTab("b4")}
          className={`p-4 bg-white dark:bg-slate-900 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            activeTab === "b4" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700"
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Table B.4 Object of Expenditure</span>
          <div className="font-mono text-base font-bold text-slate-900 dark:text-white mt-1">{formatPHP(t4)}</div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">UACS Accounting Ledgers</span>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-955 rounded-2xl border border-slate-200 dark:border-slate-800 print-hide shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "overview" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Consolidated Overview</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("b1")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b1" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.1 General Summary</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("b2")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b2" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.2 Fund Source</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("b3")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b3" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.3 Statement of Expenditure</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("b4")}
          className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer text-xs ${
            activeTab === "b4" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <span>B.4 Object of Expenditure</span>
        </button>
        <button
          type="button"
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
                {renderGridTable(b1Grid, "B.1 General Summary", "CATEGORY", "Consolidates functional procurement streams across all active fiscal years")}
                {renderGridTable(b2Grid, "B.2 Fund Source", "FUND SOURCE", "Identifies financing origins (GAA, FAP, Locally Funded, Other Income)")}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderGridTable(b3Grid, "B.3 Statement of Expenditure", "EXPENDITURE CLASS", "Enforces DBM ₱50,000 threshold (Capital Outlay vs MOOE)")}
                {renderGridTable(b4Grid, "B.4 Object of Expenditure", "OBJECT CODE", "Maps outlays to Unified Accounts Code Structure (UACS) ledgers")}
              </div>
            </div>
          )}

          {/* TAB 1: B.1 GENERAL SUMMARY */}
          {activeTab === "b1" && (
            <div className="print-hide">
              {renderGridTable(
                b1Grid, 
                "B.1. GENERAL SUMMARY", 
                "CATEGORY",
                "Consolidates Office Productivity, Internal ICT Projects, Cross-Agency Projects, and Continuing Costs across all planning years."
              )}
            </div>
          )}

          {/* TAB 2: B.2 FUND SOURCE */}
          {activeTab === "b2" && (
            <div className="print-hide">
              {renderGridTable(
                b2Grid, 
                "B.2. FUND SOURCE", 
                "FUND SOURCE",
                "Identifies financing origins: General Appropriations Act (GAA), Foreign-Assisted (FAP), Locally Funded, and Other Income."
              )}
            </div>
          )}

          {/* TAB 3: B.3 STATEMENT OF EXPENDITURE */}
          {activeTab === "b3" && (
            <div className="print-hide">
              {renderGridTable(
                b3Grid, 
                "B.3. STATEMENT OF EXPENDITURE", 
                "EXPENDITURE CLASS",
                "Categorizes outlays according to DBM standards: Capital Outlay (CO >= ₱50k) vs MOOE (< ₱50k, recurring subscriptions, services)."
              )}
            </div>
          )}

          {/* TAB 4: B.4 OBJECT OF EXPENDITURE */}
          {activeTab === "b4" && (
            <div className="print-hide">
              {renderGridTable(
                b4Grid, 
                "B.4. OBJECT OF EXPENDITURE", 
                "OBJECT CODE",
                "Detailed account code mapping matching COA and DBM standards (ICT Equipment, Printing, Semi-Expendable, Software, Subscriptions)."
              )}
            </div>
          )}

          {/* TAB 5 / PRINT PREVIEW CONTAINER */}
          <div className={activeTab === "print" ? "space-y-4" : "hidden print:block"}>
            {/* Action Bar (Screen Only) */}
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs print-hide">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider font-serif">
                  Formal Government Document Print Preview
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Renders clean A4 Landscape Part IV.B summary tables matching official DICT ISSP Guidelines (Pages 40–41).
                </p>
              </div>
              <button
                type="button"
                onClick={handlePrintDocument}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl font-sans text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>

            {/* Formal Document Area matching DICT Template Pages 40–41 */}
            <div 
              id="formal-print-area" 
              className="bg-white text-slate-900 p-8 rounded-2xl border border-slate-300 space-y-6 font-serif shadow-xl animate-fadeIn"
            >
              {/* Formal Document Header */}
              <div className="border-b-2 border-slate-900 pb-4 space-y-1">
                <p className="text-[10px] uppercase tracking-widest font-sans font-bold text-slate-600 m-0">
                  Republic of the Philippines
                </p>
                <h2 className="text-base font-bold uppercase m-0">
                  {agencyName}
                </h2>
                <h3 className="text-sm font-bold text-blue-900 m-0">
                  INFORMATION SYSTEMS STRATEGIC PLAN ({activeCycle})
                </h3>
                <h4 className="text-xs uppercase tracking-wider font-sans font-bold text-slate-900 m-0">
                  B. SUMMARY OF INVESTMENTS
                </h4>
              </div>

              <div className="space-y-6 text-[9.5pt]">
                {renderPrintableTableSection(b1Grid, "B.1", "GENERAL SUMMARY", "CATEGORY")}
                {renderPrintableTableSection(b2Grid, "B.2", "FUND SOURCE", "FUND SOURCE")}
                {renderPrintableTableSection(b3Grid, "B.3", "STATEMENT OF EXPENDITURE", "EXPENDITURE CLASS")}
                {renderPrintableTableSection(b4Grid, "B.4", "OBJECT OF EXPENDITURE", "OBJECT CODE")}

                {/* Statutory Inflation Footnote */}
                <p style={{ fontSize: "7.5pt", fontStyle: "italic", color: "#475569", marginTop: "10px" }}>
                  *All figures indicated across Tables B.1 to B.4 reflect verified market research and compounded annual inflation buffer adjustments (Year 2 onwards) pursuant to the DICT ISSP Guidelines (p. 26).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}