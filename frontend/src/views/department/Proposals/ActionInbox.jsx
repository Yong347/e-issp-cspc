// frontend/src/views/department/Proposals/ActionInbox.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { useNotifications } from "../../../context/NotificationContext";
import { getProposals, getSubscriptions } from "../../../api/dept";
import { Inbox, RefreshCw, AlertCircle, HelpCircle, History } from "lucide-react";

export default function ActionInbox() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const { fetchNotifications } = useNotifications();
  
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchActionItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const [proposals, subscriptions] = await Promise.all([
        getProposals(activeCycle),
        getSubscriptions(activeCycle)
      ]);

      const items = [];

      // Extract audit comments from CapEx Proposals
      proposals.forEach(p => {
        const comments = p.payload?.comments || [];
        comments.forEach(c => {
          items.push({
            ...c,
            parentId: p.id,
            parentName: p.item_name,
            parentType: "CapEx (Hardware)",
            parentStatus: p.status
          });
        });
      });

      // Extract audit comments from MOOE Subscriptions
      subscriptions.forEach(s => {
        const comments = s.payload?.comments || [];
        comments.forEach(c => {
          items.push({
            ...c,
            parentId: s.id,
            parentName: s.software_name,
            parentType: "MOOE (Software)",
            parentStatus: s.status
          });
        });
      });

      // Sort chronologically (newest entries first)
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setActionItems(items);
      
      // Update global counter indicator immediately
      if (fetchNotifications) {
        fetchNotifications();
      }
    } catch (err) {
      setError(err.message || "Failed to load department action items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchActionItems();
    }
  }, [user, activeCycle]);

  return (
    <div className="space-y-6 text-xs max-w-4xl mx-auto select-none">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Inbox className="w-5 h-5 text-blue-400" />
            <span>Feedback & Revisions Inbox</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Dynamic ledger of feedback, required modifications, and administrative evaluation notes logged by the MIS Administrator.
          </p>
        </div>
        <button
          onClick={fetchActionItems}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Items List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
            <span>Syncing remarks log...</span>
          </div>
        ) : actionItems.length > 0 ? (
          actionItems.map((item, idx) => (
            <div key={idx} className="p-5 rounded-xl border bg-slate-900 border-slate-800 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">
                    {item.parentType}
                  </span>
                  <h3 className="font-bold text-slate-200 text-sm">{item.parentName}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[9px] px-2 py-0.5 bg-slate-500/10 border border-slate-500/20 text-slate-400 font-bold uppercase tracking-wider rounded">
                    <History className="w-3 h-3" /> Logged Entry
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                  <span className="font-bold text-blue-400">{item.author_name} (Admin Operator)</span>
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-slate-300 leading-relaxed bg-slate-955 p-3 rounded-lg border border-slate-850 font-mono text-[11px]">
                  {item.text}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2">
            <HelpCircle className="w-8 h-8 text-slate-700" />
            <p className="italic">No remarks logged for your department.</p>
          </div>
        )}
      </div>
    </div>
  );
}