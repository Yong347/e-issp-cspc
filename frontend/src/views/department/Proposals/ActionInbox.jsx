// frontend/src/views/department/Proposals/ActionInbox.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  History,
  Search,
  Filter,
  Eye,
  ArrowRight,
  User,
  X,
  Clock,
  ExternalLink
} from "lucide-react";

export default function ActionInbox() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const { fetchNotifications } = useNotifications();
  const navigate = useNavigate();
  
  const [notificationsList, setNotificationsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filtering States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [dateSpan, setDateSpan] = useState("All"); // All, Today, Week, Month, Custom
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Inspection Drawer State
  const [selectedNotification, setSelectedNotification] = useState(null);

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

  const handleResolveAction = async (e, parentId, commentId) => {
    e.stopPropagation(); // Prevent opening the inspection drawer
    if (!parentId || !commentId) return;
    try {
      await resolveComment(parentId, commentId);
      setSelectedNotification(null);
      await fetchActionItems();
    } catch (err) {
      alert(err.message || "Failed to resolve action item.");
    }
  };

  const handleDeepLinkRedirect = (item) => {
    if (!item.url_path || !item.ref_id) return;
    setSelectedNotification(null);
    
    // Pass highlightId in location state to trigger smooth-scrolling & row glow
    navigate(item.url_path, { 
      state: { 
        highlightId: item.ref_id 
      } 
    });
  };

  // Maps notification types to themed styled badges, borders, and icons
  const renderIconAndStyle = (type) => {
    switch (type) {
      case "budget":
        return {
          icon: <Coins className="w-4 h-4 text-emerald-400" />,
          bgColor: "bg-emerald-950/20 border-emerald-900/50 hover:border-emerald-800/80",
          tagColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          label: "Budget Update"
        };
      case "comment":
        return {
          icon: <MessageSquare className="w-4 h-4 text-rose-400" />,
          bgColor: "bg-rose-950/20 border-rose-900/40 hover:border-rose-800/80",
          tagColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
          label: "Action Item"
        };
      case "security":
        return {
          icon: <Key className="w-4 h-4 text-amber-400" />,
          bgColor: "bg-amber-950/20 border-amber-900/40 hover:border-amber-800/80",
          tagColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
          label: "Security Audit"
        };
      case "override":
        return {
          icon: <ShieldAlert className="w-4 h-4 text-purple-400" />,
          bgColor: "bg-purple-950/20 border-purple-900/40 hover:border-purple-800/80",
          tagColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
          label: "Admin Override"
        };
      case "status_change":
      default:
        return {
          icon: <History className="w-4 h-4 text-blue-400" />,
          bgColor: "bg-blue-955/20 border-blue-900/40 hover:border-blue-800/80",
          tagColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
          label: "Status Transition"
        };
    }
  };

  // Process client-side filters
  const filteredNotifications = notificationsList.filter(item => {
    // 1. Search Query Match
    const query = searchTerm.toLowerCase().trim();
    const matchesSearch = query === "" || 
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      (item.target_name && item.target_name.toLowerCase().includes(query)) ||
      (item.operator_email && item.operator_email.toLowerCase().includes(query));

    // 2. Category Dropdown Match
    const matchesCategory = selectedCategory === "All" || item.type === selectedCategory;

    // 3. Date Selection Match
    let matchesDate = true;
    if (dateSpan !== "All") {
      const itemDate = new Date(item.timestamp);
      const boundaryDate = new Date();
      
      if (dateSpan === "Today") {
        boundaryDate.setHours(0, 0, 0, 0);
        matchesDate = itemDate >= boundaryDate;
      } else if (dateSpan === "Week") {
        boundaryDate.setDate(boundaryDate.getDate() - 7);
        matchesDate = itemDate >= boundaryDate;
      } else if (dateSpan === "Month") {
        boundaryDate.setMonth(boundaryDate.getMonth() - 1);
        matchesDate = itemDate >= boundaryDate;
      } else if (dateSpan === "Custom") {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start) {
          start.setHours(0, 0, 0, 0);
          matchesDate = matchesDate && itemDate >= start;
        }
        if (end) {
          end.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && itemDate <= end;
        }
      }
    }

    return matchesSearch && matchesCategory && matchesDate;
  });

  return (
    <div className="space-y-6 text-xs max-w-4xl mx-auto select-none">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Inbox className="w-5 h-5 text-blue-400" />
            <span>Workspace Notifications & Revisions Inbox</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Track budget modifications, proposal status movements, whitelisting updates, and admin remarks. Click any card for audit logs.
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
              placeholder="Search by title, desc, target, or operator..."
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
                className="p-1.5 bg-slate-950 border border-slate-850 rounded text-slate-200 outline-none cursor-pointer text-xs"
              >
                <option value="All">All Categories</option>
                <option value="status_change">Status Transitions</option>
                <option value="comment">Action Items / Remarks</option>
                <option value="budget">Ceiling Modifications</option>
                <option value="override">Admin Overrides</option>
                <option value="security">Account Security</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400 font-semibold">Date Span:</span>
              <select
                value={dateSpan}
                onChange={(e) => setDateSpan(e.target.value)}
                className="p-1.5 bg-slate-950 border border-slate-850 rounded text-slate-200 outline-none cursor-pointer text-xs"
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

      {/* Notifications List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
            <span>Synchronizing workspace notifications...</span>
          </div>
        ) : filteredNotifications.length > 0 ? (
          filteredNotifications.map((item) => {
            const config = renderIconAndStyle(item.type);
            return (
              <div 
                key={item.id} 
                onClick={() => setSelectedNotification(item)}
                className={`p-5 rounded-xl border cursor-pointer transition-all ${config.bgColor} ${config.borderColor} space-y-3 group shadow-md hover:shadow-lg`}
              >
                <div className="flex justify-between items-center border-b border-slate-850/30 pb-2">
                  <div className="flex items-center gap-2">
                    {config.icon}
                    <h3 className="font-bold text-slate-200 text-sm group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h3>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 border font-bold uppercase tracking-wider rounded ${config.tagColor}`}>
                    {config.label}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-slate-300 leading-relaxed font-mono text-[11px] whitespace-pre-wrap line-clamp-2">
                    {item.description}
                  </p>
                  
                  <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-850/20">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-600" />
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </span>
                    
                    <div className="flex items-center gap-3">
                      {item.operator_email && (
                        <span className="text-[10px] text-slate-500 font-semibold">
                          By: {item.operator_email}
                        </span>
                      )}
                      
                      {/* Standalone Resolve Action Trigger */}
                      {item.type === "comment" && !item.is_resolved && (
                        <button
                          onClick={(e) => handleResolveAction(e, item.ref_id, item.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded cursor-pointer transition-colors text-[9px] uppercase tracking-wider"
                        >
                          Resolve
                        </button>
                      )}

                      <span className="flex items-center gap-1 text-blue-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Inspect</span>
                        <Eye className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-slate-900 rounded-xl border border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-2">
            <Inbox className="w-8 h-8 text-slate-700" />
            <p className="italic">No notifications or remarks found for your criteria.</p>
          </div>
        )}
      </div>

      {/* Detailed Action Inspection Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-sm">{selectedNotification.title}</h3>
                <span className="text-[9px] font-mono text-slate-500 uppercase">EVENTID: {selectedNotification.id}</span>
              </div>
              <button 
                onClick={() => setSelectedNotification(null)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Event Metadata (The Who & When) */}
              <div className="grid grid-cols-2 gap-3 bg-slate-955 p-3 rounded-lg border border-slate-850">
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Executed By</span>
                  <div className="flex items-center gap-1.5 font-mono text-slate-300">
                    <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-bold">{selectedNotification.operator_email || "System/Cron"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Operator Rank</span>
                  <span className="block font-bold text-blue-400 uppercase tracking-wide font-mono">
                    {selectedNotification.operator_role || "SYSTEM"}
                  </span>
                </div>
              </div>

              {/* Event Narration */}
              <div className="space-y-1">
                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Description of Change</span>
                <p className="text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-850 leading-relaxed font-mono whitespace-pre-wrap">
                  {selectedNotification.description}
                </p>
              </div>

              {/* Affected Target Asset */}
              {selectedNotification.target_name && (
                <div className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-850 rounded-lg">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Affected Asset Target</span>
                  <span className="font-bold text-slate-300">{selectedNotification.target_name}</span>
                </div>
              )}

              {/* Parametric Comparison Tables (If present inside log metadata) */}
              {(selectedNotification.old_value || selectedNotification.new_value) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[9px] text-rose-400 uppercase font-bold tracking-wider">Previous Parameters</span>
                    <pre className="p-2 bg-red-955/10 border border-red-900/30 text-rose-300 font-mono text-[9px] rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap">
                      {selectedNotification.old_value ? JSON.stringify(selectedNotification.old_value, null, 2) : "None"}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">Updated Parameters</span>
                    <pre className="p-2 bg-emerald-950/10 border border-emerald-900/30 text-emerald-300 font-mono text-[9px] rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap">
                      {selectedNotification.new_value ? JSON.stringify(selectedNotification.new_value, null, 2) : "None"}
                    </pre>
                  </div>
                </div>
              )}

              {/* Action Buttons with deep routing redirections */}
              <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                {selectedNotification.type === "comment" && !selectedNotification.is_resolved && (
                  <button
                    onClick={(e) => handleResolveAction(e, selectedNotification.ref_id, selectedNotification.id)}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5 text-xs"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Resolve Action Item</span>
                  </button>
                )}
                {selectedNotification.url_path && selectedNotification.ref_id && (
                  <button
                    onClick={() => handleDeepLinkRedirect(selectedNotification)}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5 text-xs"
                  >
                    <span>Direct Link to Asset Row</span>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}