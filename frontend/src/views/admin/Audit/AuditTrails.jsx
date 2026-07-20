// frontend/src/views/admin/Audit/AuditTrails.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { History, RefreshCw, AlertCircle, Search } from "lucide-react";

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
    
    return action.includes(term) || proposalId.includes(term) || subscriptionId.includes(term);
  });

  return (
    <div className="space-y-6 text-xs text-slate-100">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <History className="text-yellow-400 w-5 h-5" />
            <span>COA Immutable Audit Security Trails</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Tamper-proof transactional security ledger. Captures system changes, price modifications, and state adjustments.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/4 border border-red-900/30 text-red-300 rounded-lg flex items-start gap-2">
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
          placeholder="Search by Action or Document ID..."
          className="w-full bg-transparent outline-none border-none text-xs text-white"
        />
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              <span>Querying transaction records...</span>
            </div>
          ) : filteredLogs.length > 0 ? (
            <table className="w-full text-left border-collapse text-[10px] font-mono">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold uppercase">
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Target ID</th>
                  <th className="p-3.5">Action Type</th>
                  <th className="p-3.5">Operator ID</th>
                  <th className="p-3.5">Old Value</th>
                  <th className="p-3.5">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="p-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-blue-400 select-all font-bold">
                      {log.proposal_id || log.subscription_id || "SYSTEM"}
                    </td>
                    <td className="p-3.5 font-bold text-slate-200">
                      {log.action}
                    </td>
                    <td className="p-3.5 text-slate-400">
                      User: {log.user_id}
                    </td>
                    <td className="p-3.5 text-red-400 max-w-[200px] truncate select-all">
                      {JSON.stringify(log.old_value)}
                    </td>
                    <td className="p-3.5 text-emerald-400 max-w-[200px] truncate select-all">
                      {JSON.stringify(log.new_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-500">
              No matching security ledger records found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}