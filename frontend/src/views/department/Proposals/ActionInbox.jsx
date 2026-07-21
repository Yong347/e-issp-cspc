// frontend/src/views/department/Proposals/ActionInbox.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { useNotifications } from "../../../context/NotificationContext";
import { getNotifications, resolveComment } from "../../../api/dept";
import { 
  Inbox, 
  RefreshCw, 
  AlertCircle, 
  HelpCircle, 
  Calendar, 
  Coins, 
  MessageSquare, 
  Key, 
  ShieldAlert, 
  CheckSquare,
  History
} from "lucide-react";

export default function ActionInbox() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const { fetchNotifications } = useNotifications();
  
  const [notificationsList, setNotificationsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchActionItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications();
      setNotificationsList(data);
      
      // Update global notification badge count
      if (fetchNotifications) {
        fetchNotifications();
      }
    } catch (err) {
      setError(err.message || "Failed to load department workspace updates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchActionItems();
    }
  }, [user, activeCycle]);

  const handleResolve = async (parentId, commentId) => {
    if (!parentId || !commentId) return;
    try {
      await resolveComment(parentId, commentId);
      await fetchActionItems();
    } catch (err) {
      alert(err.message || "Failed to resolve action item.");
    }
  };

  // Maps notification types to distinctive styled badges and icons
  const renderIconAndStyle = (type) => {
    switch (type) {
      case "budget":
        return {
          icon: <Coins className="w-4 h-4 text-emerald-400" />,
          bgColor: "bg-emerald-950/20",
          borderColor: "border-emerald-900/50",
          tagColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          label: "Budget Update"
        };
      case "comment":
        return {
          icon: <MessageSquare className="w-4 h-4 text-red-400" />,
          bgColor: "bg-red-955/10",
          borderColor: "border-red-900/40",
          tagColor: "bg-red-500/10 text-red-400 border-red-500/20",
          label: "Action Item"
        };
      case "security":
        return {
          icon: <Key className="w-4 h-4 text-amber-400" />,
          bgColor: "bg-amber-950/10",
          borderColor: "border-amber-900/40",
          tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
          label: "Security Audit"
        };
      case "override":
        return {
          icon: <ShieldAlert className="w-4 h-4 text-purple-400" />,
          bgColor: "bg-purple-950/10",
          borderColor: "border-purple-900/40",
          tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
          label: "Admin Override"
        };
      case "status_change":
      default:
        return {
          icon: <History className="w-4 h-4 text-blue-400" />,
          bgColor: "bg-blue-955/10",
          borderColor: "border-blue-900/40",
          tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
          label: "Status Transition"
        };
    }
  };

  return (
    <div className="space-y-6 text-xs max-w-4xl mx-auto select-none">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Inbox className="w-5 h-5 text-blue-400" />
            <span>Workspace Notifications & Revisions Inbox</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Track budget modifications, proposal status movements, whitelisting updates, and admin remarks.
          </p>
        </div>
        <button
          onClick={fetchActionItems}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Workspace</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
            <span>Synchronizing workspace notifications...</span>
          </div>
        ) : notificationsList.length > 0 ? (
          notificationsList.map((item) => {
            const config = renderIconAndStyle(item.type);
            return (
              <div 
                key={item.id} 
                className={`p-5 rounded-xl border transition-all ${config.bgColor} ${config.borderColor} space-y-3`}
              >
                <div className="flex justify-between items-center border-b border-slate-850/40 pb-2">
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <h3 className="font-bold text-slate-200 text-sm">{item.title}</h3>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 border font-bold uppercase tracking-wider rounded ${config.tagColor}`}>
                    {config.label}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-slate-300 leading-relaxed font-mono text-[11px] whitespace-pre-wrap">
                    {item.description}
                  </p>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-850/20">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-600" />
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </span>
                    
                    {item.ref_id && (
                      <span className="font-mono text-[9px] text-slate-600">
                        REF_ID: {item.ref_id}
                      </span>
                    )}

                    {/* Resolve button for actionable pinned admin remarks */}
                    {item.type === "comment" && (
                      <button
                        onClick={() => handleResolve(item.ref_id, item.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded cursor-pointer transition-colors text-[10px]"
                      >
                        Resolve Action
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2">
            <HelpCircle className="w-8 h-8 text-slate-700" />
            <p className="italic">No notifications or remarks found for your department.</p>
          </div>
        )}
      </div>
    </div>
  );
}