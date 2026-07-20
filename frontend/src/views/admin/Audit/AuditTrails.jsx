// frontend/src/views/admin/Audit/AuditTrails.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { History, RefreshCw, AlertCircle, Search, ArrowRight, Shield } from "lucide-react";

export default function AuditTrails() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

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
  }, [token]);

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    const action = (log.action || "").toLowerCase();
    const proposalId = (log.proposal_id || "").toLowerCase();
    const subscriptionId = (log.subscription_id || "").toLowerCase();
    const oldStr = JSON.stringify(log.old_value || "").toLowerCase();
    const newStr = JSON.stringify(log.new_value || "").toLowerCase();
    
    return action.includes(term) || proposalId.includes(term) || subscriptionId.includes(term) || oldStr.includes(term) || newStr.includes(term);
  });

  // Renders JSON payloads into clean, readable key-value lists
  const renderPayload = (payload, isOld = false) => {
    if (!payload) return <span className="text-slate-600 italic font-mono text-[9px]">-</span>;
    if (typeof payload === 'string') return <span className="font-mono text-[10px] break-all">{payload}</span>;
    
    return (
      <div className="space-y-1 bg-slate-950/40 p-2 rounded border border-slate-800/60 max-h-48 overflow-y-auto w-full">
        {Object.entries(payload).map(([key, val]) => {
          let displayVal = val;
          if (typeof val === 'object' && val !== null) {
            displayVal = JSON.stringify(val);
          }
          return (
            <div key={key} className="flex flex-col text-[10px] font-mono leading-tight">
              <span className="text-slate-500 uppercase tracking-wider">{key.replace(/_/g, ' ')}:</span>
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
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <History className="text-amber-400 w-5 h-5" />
            <span>COA Immutable Audit Security Trails</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Tamper-proof transactional security ledger. Captures system changes, price modifications, and administrative state adjustments.
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

      {/* Filter Toolbar */}
      <div className="flex bg-slate-900 p-3 rounded-lg border border-slate-850 items-center gap-2.5 max-w-md">
        <Search className="w-4 h-4 text-slate-500 shrink-0" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search actions, JSON payloads, or Target IDs..."
          className="w-full bg-transparent outline-none border-none text-xs text-white"
        />
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
                  <th className="p-4 w-[20%]">Operator & Target</th>
                  <th className="p-4 w-[20%]">Action Execution</th>
                  <th className="p-4 w-1/4 text-center">Previous State</th>
                  <th className="p-4 w-1/4 text-center">Updated State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {filteredLogs.map((log) => {
                  const isSystem = !log.proposal_id && !log.subscription_id;
                  const targetId = log.proposal_id || log.subscription_id || "SYSTEM_ENVIRONMENT";
                  
                  return (
                    <tr key={log.id} className="hover:bg-slate-955/20 transition-colors group">
                      {/* Timestamp */}
                      <td className="p-4 text-slate-400 align-top">
                        <div className="font-mono text-slate-300">{new Date(log.timestamp).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</div>
                      </td>
                      
                      {/* Operator & Target context */}
                      <td className="p-4 align-top space-y-2">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5 tracking-wider">Operator ID:</span>
                          <span className="font-mono text-slate-300 px-2 py-0.5 bg-slate-950 rounded border border-slate-800">
                            {log.user_id || "Unknown"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5 tracking-wider">Target Node:</span>
                          <span className={`font-mono text-[9px] font-bold select-all ${isSystem ? "text-amber-400" : "text-blue-400"}`}>
                            {targetId}
                          </span>
                        </div>
                      </td>

                      {/* Action Type */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5 font-bold text-slate-200">
                          {isSystem && <Shield className="w-3.5 h-3.5 text-amber-500" />}
                          <span className="uppercase tracking-wide">{log.action.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-1 select-all">{log.action}</div>
                      </td>

                      {/* Previous State JSON */}
                      <td className="p-4 align-top">
                        {renderPayload(log.old_value, true)}
                      </td>

                      {/* Arrow Spacer (Visual only on wide screens) */}
                      <td className="p-4 align-top">
                        {renderPayload(log.new_value, false)}
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
    </div>
  );
}
