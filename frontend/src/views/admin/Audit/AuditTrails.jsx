// frontend/src/views/admin/Audit/AuditTrails.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  History, 
  RefreshCw, 
  AlertCircle, 
  Search, 
  ArrowRight, 
  Shield, 
  Filter, 
  Calendar, 
  Eye, 
  User, 
  X 
} from "lucide-react";

export default function AuditTrails() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const navigate = useNavigate();
  
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dateSpan, setDateSpan] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Inspection Modal State
  const [selectedLog, setSelectedLog] = useState(null);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load audit logs from the security ledger.");
      setLogs(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLogs();
    }
  }, [token, activeCycle]);

  const handleDeepLinkRedirect = (log) => {
    setSelectedLog(null);
    const targetPath = log.proposal_id ? "/admin/queue" : (log.subscription_id ? "/admin/queue" : null);
    if (targetPath) {
      // Redirect to the master queue passing the highlight target ID and category tab
      navigate(targetPath, { 
        state: { 
          highlightId: log.proposal_id || log.subscription_id, 
          tab: log.proposal_id ? "capex" : "mooe" 
        } 
      });
    }
  };

  // Client-side filtering logic
  const filteredLogs = logs.filter(log => {
    // 1. Search filter
    const query = searchTerm.toLowerCase().trim();
    const action = (log.action || "").toLowerCase();
    const operator = (log.operator_email || "").toLowerCase();
    const targetId = String(log.proposal_id || log.subscription_id || "").toLowerCase();
    
    const matchesSearch = query === "" || 
      action.includes(query) || 
      operator.includes(query) || 
      targetId.includes(query) ||
      String(log.id).includes(query);

    // 2. Category Filter
    let matchesCategory = true;
    if (selectedCategory !== "All") {
      const cat_lower = selectedCategory.toLowerCase();
      if (cat_lower === "budget") {
        matchesCategory = log.action.toLowerCase().includes("budget");
      } else if (cat_lower === "state") {
        matchesCategory = log.action.toLowerCase().includes("state");
      } else if (cat_lower === "override") {
        matchesCategory = log.action.toLowerCase().includes("override");
      } else if (cat_lower === "user") {
        matchesCategory = log.action.toLowerCase().includes("user");
      }
    }

    // 3. Date Span Filter
    let matchesDate = true;
    if (dateSpan !== "All") {
      const logDate = new Date(log.timestamp);
      const boundaryDate = new Date();
      if (dateSpan === "Today") {
        boundaryDate.setHours(0, 0, 0, 0);
        matchesDate = logDate >= boundaryDate;
      } else if (dateSpan === "Week") {
        boundaryDate.setDate(boundaryDate.getDate() - 7);
        matchesDate = logDate >= boundaryDate;
      } else if (dateSpan === "Month") {
        boundaryDate.setMonth(boundaryDate.getMonth() - 1);
        matchesDate = logDate >= boundaryDate;
      } else if (dateSpan === "Custom") {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start) {
          start.setHours(0, 0, 0, 0);
          matchesDate = matchesDate && logDate >= start;
        }
        if (end) {
          end.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && logDate <= end;
        }
      }
    }

    return matchesSearch && matchesCategory && matchesDate;
  });

  // Renders JSON payloads into clean, readable key-value list grids inside the Modal
  const renderPayload = (payload, isOld = false) => {
    if (!payload) return <span className="text-slate-600 italic font-mono text-[9px]">-</span>;
    if (typeof payload === 'string') return <span className="font-mono text-[10px] break-all">{payload}</span>;
    
    return (
      <div className="space-y-1 bg-slate-950/45 p-2 rounded border border-slate-800/60 max-h-48 overflow-y-auto w-full">
        {Object.entries(payload).map(([key, val]) => {
          let displayVal = val;
          if (typeof val === 'object' && val !== null) {
            displayVal = JSON.stringify(val);
          }
          return (
            <div key={key} className="flex flex-col text-[10px] font-mono leading-tight">
              <span className="text-slate-500 uppercase tracking-wider text-[8px]">{key.replace(/_/g, ' ')}:</span>
              <span className={`font-bold break-all ${isOld ? "text-rose-400" : "text-emerald-400"}`}>
                {String(displayVal)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <History className="text-amber-400 w-5 h-5" />
            <span>COA Immutable Audit Security Trails</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Tamper-proof transactional security ledger. Captures system changes, price modifications, and state adjustments. Click any row to inspect.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/30 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Advanced Filter Toolbar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search operator, target keys or IDs..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-white outline-none placeholder-slate-600 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 font-semibold">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="p-1.5 bg-slate-955 border border-slate-850 rounded text-slate-200 outline-none cursor-pointer text-xs"
              >
                <option value="All">All Categories</option>
                <option value="state">Status Transitions</option>
                <option value="override">Admin Overrides</option>
                <option value="budget">Ceiling Modifications</option>
                <option value="user">User Modifications</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 font-semibold">Date Span:</span>
              <select
                value={dateSpan}
                onChange={(e) => setDateSpan(e.target.value)}
                className="p-1.5 bg-slate-955 border border-slate-850 rounded text-slate-200 outline-none cursor-pointer text-xs"
              >
                <option value="All">All Time</option>
                <option value="Today">Today Only</option>
                <option value="Week">Past 7 Days</option>
                <option value="Month">Past 30 Days</option>
                <option value="Custom">Custom Date Range</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom Date Range Picker Drawer */}
        {dateSpan === "Custom" && (
          <div className="grid grid-cols-2 gap-4 bg-slate-955 p-3 rounded-lg border border-slate-850/80 animate-fadeIn max-w-md">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white text-xs outline-none cursor-pointer font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white text-xs outline-none cursor-pointer font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <span>Querying transactional security ledger...</span>
            </div>
          ) : filteredLogs.length > 0 ? (
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  <th className="p-4 w-32">Timestamp</th>
                  <th className="p-4 w-[25%]">Operator Context</th>
                  <th className="p-4 w-[25%]">Action Execution</th>
                  <th className="p-4 w-[25%]">Target Node</th>
                  <th className="p-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {filteredLogs.map((log) => {
                  const isSystem = !log.proposal_id && !log.subscription_id;
                  const targetId = log.proposal_id || log.subscription_id || "SYSTEM_ENVIRONMENT";
                  
                  return (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-955/20 transition-colors group cursor-pointer"
                    >
                      <td className="p-4 text-slate-400 align-top">
                        <div className="font-mono text-slate-300">{new Date(log.timestamp).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</div>
                      </td>
                      
                      <td className="p-4 align-top space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-slate-200">{log.operator_email || "System"}</span>
                        </div>
                        <span className="inline-block px-1.5 py-0.2 text-[8px] bg-slate-950 border border-slate-800 rounded font-semibold text-slate-400 font-mono uppercase">
                          {log.operator_role || "SYSTEM"}
                        </span>
                      </td>

                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 font-bold text-slate-200 uppercase tracking-wide">
                          {isSystem && <Shield className="w-3.5 h-3.5 text-amber-500" />}
                          <span>{log.action.replace(/_/g, ' ')}</span>
                        </div>
                      </td>

                      <td className="p-4 align-top">
                        <span className={`font-mono text-[9px] font-bold select-all ${isSystem ? "text-amber-400" : "text-blue-400"}`}>
                          {targetId}
                        </span>
                      </td>

                      <td className="p-4 align-top text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>Inspect</span>
                          <Eye className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-500 italic">
              No matching security ledger records found.
            </div>
          )}
        </div>
      </div>

      {/* Audit Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-955/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 space-y-4 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-sm">Audit Log Record Inspection</h3>
                <span className="text-[9px] font-mono text-slate-500 uppercase">LOGID: {selectedLog.id}</span>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Operator details context */}
              <div className="grid grid-cols-2 gap-3 bg-slate-955 p-3 rounded-lg border border-slate-850">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Executed By</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-300">
                    <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-bold">{selectedLog.operator_email || "System/Cron"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Access Designation</span>
                  <span className="block font-bold text-blue-400 font-mono uppercase">{selectedLog.operator_role || "SYSTEM"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Action Identifier</span>
                  <span className="block font-bold text-slate-200 font-mono uppercase">{selectedLog.action}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Log Timestamp</span>
                  <span className="block text-slate-300 font-mono">{new Date(selectedLog.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {/* Side-by-Side Old vs New Value Differences */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[9px] text-rose-400 uppercase font-bold tracking-wider block">Previous State Parameters</span>
                  {renderPayload(selectedLog.old_value, true)}
                </div>
                <div className="space-y-1.5">
                  <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider block">Updated State Parameters</span>
                  {renderPayload(selectedLog.new_value, false)}
                </div>
              </div>

              {/* Deep-linking action buttons */}
              {(selectedLog.proposal_id || selectedLog.subscription_id) && (
                <div className="pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => handleDeepLinkRedirect(selectedLog)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Inspect live Asset Queue properties</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}