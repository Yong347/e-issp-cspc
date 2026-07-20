// frontend/src/views/admin/Analytics/ComplianceAnalytics.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { AlertTriangle, ShieldCheck, RefreshCw, BarChart2, ShieldAlert } from "lucide-react";

export default function ComplianceAnalytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/department-analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch compliance analytics data.");
      setAnalytics(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAnalytics();
    }
  }, [token]);

  return (
    <div className="space-y-6 text-xs text-slate-100">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <BarChart2 className="text-purple-400 w-5 h-5" />
            <span>Compliance Analytics & Abuse Index</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Real-time tracking of non-standard requests. Identifies departments exceeding the 20% limit for custom "Other" selections.
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="p-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 text-xs disabled:opacity-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Diagnostics</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/30 text-red-300 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Analytics Listing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 text-center py-20 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
            <span>Compiling compliance metrics...</span>
          </div>
        ) : analytics.length > 0 ? (
          analytics.map((dept) => {
            const hasAbuse = dept.requires_review_abuse;
            return (
              <div 
                key={dept.department_id} 
                className={`p-6 rounded-xl border transition-all ${
                  hasAbuse 
                    ? "bg-red-955/10 border-red-900/40" 
                    : "bg-slate-900 border-slate-800"
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-sm text-slate-200">{dept.department_name}</h3>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {dept.department_id}</p>
                  </div>
                  {hasAbuse ? (
                    <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 font-bold uppercase tracking-wider rounded">
                      <ShieldAlert className="w-3 h-3" /> Flagged (Abuse)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider rounded">
                      <ShieldCheck className="w-3 h-3" /> Compliant
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-4 font-mono">
                  <div>
                    <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Total Items</span>
                    <span className="text-slate-300 font-bold text-sm">{dept.total_proposals}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Custom Items</span>
                    <span className="text-slate-300 font-bold text-sm">{dept.custom_proposals}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Other %</span>
                    <span className={`font-bold text-sm ${hasAbuse ? "text-red-400" : "text-emerald-400"}`}>
                      {dept.custom_ratio_percent}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 font-semibold">Missing Canvas Uploads:</span>
                  <span className={`font-bold ${dept.missing_canvas_count > 0 ? "text-red-400" : "text-slate-400"}`}>
                    {dept.missing_canvas_count} items
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-2 text-center py-20 text-slate-500">
            No compliance analytics profiles mapped.
          </div>
        )}
      </div>
    </div>
  );
}