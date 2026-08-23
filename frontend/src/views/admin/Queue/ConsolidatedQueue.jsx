// frontend/src/views/admin/Queue/ConsolidatedQueue.jsx
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { getComments, postComment, resolveComment } from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import { 
  ShieldCheck, 
  FileText, 
  FolderKanban, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Search, 
  Check, 
  RotateCcw, 
  Edit, 
  MessageSquare, 
  ExternalLink, 
  HardDrive, 
  CheckSquare,
  Lock,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Save,
  X
} from "lucide-react";

export default function ConsolidatedQueue() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState("capex"); // capex or mooe
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Server-Side Pagination & Filter States
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(15); // Strict items limit per page

  // Deep-Linking Highlight State
  const [highlightedId, setHighlightedId] = useState(null);

  // Override Modal State
  const [activeOverrideItem, setActiveOverrideItem] = useState(null);
  const [overrideItemName, setOverrideItemName] = useState("");
  const [overrideUnitCost, setOverrideUnitCost] = useState("");
  const [overrideQuantities, setOverrideQuantities] = useState({});
  const [overrideSpec, setOverrideSpec] = useState("");
  const [overrideOffices, setOverrideOffices] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Comments / Remarks Thread Modal State
  const [activeDiscussionItem, setActiveDiscussionItem] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [requiresAction, setRequiresAction] = useState(false);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || user?.accessToken;

  // Department ID static label translation map
  const getDeptName = (id) => {
    const depts = {
      1: "College of Engineering",
      2: "College of Computer Studies",
      3: "College of Arts & Sciences",
      4: "College of Health Sciences",
      5: "College of Tourism",
      6: "Human Resources Management"
    };
    return depts[id] || `Department ID: ${id}`;
  };

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      let queryParams = `?skip=${skip}&limit=${limit}`;
      if (deptFilter) queryParams += `&dept_id=${deptFilter}`;
      if (statusFilter) queryParams += `&status_filter=${statusFilter}`;
      if (searchTerm) queryParams += `&search=${encodeURIComponent(searchTerm)}`;
      if (activeCycle) queryParams += `&issp_period=${encodeURIComponent(activeCycle)}`;

      const endpoint = activeTab === "capex" ? "proposals" : "subscriptions";
      const res = await fetch(`${apiUrl}/api/admin/${endpoint}${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Failed to load ${activeTab === "capex" ? "CapEx" : "MOOE"} queue.`);
      
      const payload = await res.json();
      
      // Robust Parsing: Accommodate unpaginated legacy array structures safely
      const itemsList = Array.isArray(payload) ? payload : (payload.data || []);
      const totalItemsCount = Array.isArray(payload) ? payload.length : (payload.total || 0);

      setProposals(itemsList);
      setTotalCount(totalItemsCount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Intercept deep-linking redirections on tab change
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  useEffect(() => {
    if (token) {
      fetchQueue();
    }
  }, [token, activeTab, deptFilter, statusFilter, skip, activeCycle]);

  // Handle auto-focus and scrolling glow effects
  useEffect(() => {
    if (location.state?.highlightId && proposals.length > 0) {
      const targetId = location.state.highlightId;
      setHighlightedId(targetId);
      
      // Delay slightly to ensure tab elements have mounted to the DOM tree
      const timer = setTimeout(() => {
        const el = document.getElementById(`proposal-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          
          // Clear highlight glow states after 4 seconds
          setTimeout(() => {
            setHighlightedId(null);
          }, 4000);
        }
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [location.state, proposals]);

  const triggerSearch = (e) => {
    e.preventDefault();
    setSkip(0);
    fetchQueue();
  };

  const handlePrevPage = () => {
    if (skip > 0) {
      setSkip(Math.max(0, skip - limit));
    }
  };

  const handleNextPage = () => {
    if (skip + limit < totalCount) {
      setSkip(skip + limit);
    }
  };

  // Transition: SUBMITTED -> APPROVED
  const handleApprove = async (id, itemName) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${id}/approve`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Approval transition rejected.");
      }
      setSuccess(`Proposal '${itemName}' approved successfully.`);
      fetchQueue();
    } catch (err) {
      setError(err.message);
    }
  };

  // Transition: SUBMITTED -> RETURNED
  const handleReturn = async (id, itemName) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${id}/return`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Return transition rejected.");
      }
      setSuccess(`Proposal '${itemName}' successfully returned to department drafts.`);
      fetchQueue();
    } catch (err) {
      setError(err.message);
    }
  };

  // Override Configuration Setup
  const openOverrideModal = (item) => {
    setActiveOverrideItem(item);
    setOverrideItemName(item.item_name || item.software_name || "");
    setOverrideUnitCost(String(item.unit_cost || item.annual_cost_per_user || "0"));
    setOverrideSpec(item.custom_specification || item.justification || "");
    setOverrideOffices(item.target_offices_json ? item.target_offices_json.join(", ") : "");
    
    const currentQuantities = item.yearly_quantities || item.yearly_users || {};
    const prefill = {};
    planningYears.forEach(year => {
      prefill[String(year)] = currentQuantities[String(year)] || 0;
    });
    setOverrideQuantities(prefill);
  };

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmittingOverride(true);

    const parsedOffices = overrideOffices
      ? overrideOffices.split(",").map(o => o.trim()).filter(o => o.length > 0)
      : [];

    let payload = {};
    if (activeTab === "capex") {
      payload = {
        hardware: {
          item_name: overrideItemName,
          custom_specification: overrideSpec,
          unit_cost: parseFloat(overrideUnitCost) || 0.0,
          yearly_quantities: overrideQuantities,
          target_offices_json: parsedOffices
        }
      };
    } else {
      payload = {
        subscription: {
          software_name: overrideItemName,
          justification: overrideSpec,
          annual_cost_per_user: parseFloat(overrideUnitCost) || 0.0,
          yearly_users: overrideQuantities,
          target_offices_json: parsedOffices
        }
      };
    }

    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${activeOverrideItem.id}/override`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Override parameters violated budget bounds.");
      }

      setSuccess(`Administrative override committed successfully for: ${overrideItemName}`);
      setActiveOverrideItem(null);
      fetchQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingOverride(false);
    }
  };

  const openComments = async (item) => {
    setActiveDiscussionItem(item);
    setNewCommentText("");
    setRequiresAction(false);
    try {
      const data = await getComments(item.id);
      setComments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      await postComment(activeDiscussionItem.id, {
        text: newCommentText.trim(),
        requires_department_action: requiresAction
      });
      setNewCommentText("");
      setRequiresAction(false);
      const data = await getComments(activeDiscussionItem.id);
      setComments(data);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResolveComment = async (commentId) => {
    try {
      await resolveComment(activeDiscussionItem.id, commentId);
      const data = await getComments(activeDiscussionItem.id);
      setComments(data);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-xs text-slate-100 select-none">
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Master Consolidation Queue Panel</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Consolidate, audit, and override hardware and software subscriptions submitted across all college departments.
          </p>
        </div>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 self-start disabled:opacity-50 cursor-pointer"
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

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Tabs & Filters */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-850">
        <div className="flex gap-1.5 p-1 bg-slate-955 rounded-lg border border-slate-800 self-start">
          <button
            onClick={() => { setSkip(0); setActiveTab("capex"); setProposals([]); }}
            className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
              activeTab === "capex" 
                ? "bg-blue-600 text-white" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>CapEx Hardware (A-6)</span>
          </button>
          <button
            onClick={() => { setSkip(0); setActiveTab("mooe"); setProposals([]); }}
            className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
              activeTab === "mooe" 
                ? "bg-indigo-600 text-white" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>MOOE Subscriptions (A-2)</span>
          </button>
        </div>

        {/* Paginated Search & Filters Form */}
        <form onSubmit={triggerSearch} className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-56">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search queue records..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-955 border border-slate-850 rounded text-xs text-white outline-none placeholder-slate-600"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => { setSkip(0); setDeptFilter(e.target.value); }}
            className="p-2 bg-slate-950 border border-slate-855 rounded text-slate-300 font-semibold cursor-pointer outline-none w-full md:w-44 text-xs"
          >
            <option value="">-- All Departments --</option>
            <option value="1">College of Engineering</option>
            <option value="2">College of Computer Studies</option>
            <option value="3">College of Arts & Sciences</option>
            <option value="4">College of Health Sciences</option>
            <option value="5">College of Tourism</option>
            <option value="6">Human Resources Management</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setSkip(0); setStatusFilter(e.target.value); }}
            className="p-2 bg-slate-950 border border-slate-855 rounded text-slate-300 font-semibold cursor-pointer outline-none w-full md:w-40 text-xs"
          >
            <option value="">-- All Statuses --</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Returned">Returned</option>
            <option value="Draft">Draft</option>
          </select>
        </form>
      </div>

      {/* Main Table Container */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Fetching dynamic queue records...</span>
            </div>
          ) : proposals.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Department</th>
                  <th className="py-3 px-3">Requested Resource</th>
                  <th className="py-3 px-3">Planning Years Target</th>
                  <th className="py-3 px-3">Unit Cost / Price</th>
                  <th className="py-3 px-3">Quotation</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {proposals.map((item) => {
                  const isCapEx = activeTab === "capex";
                  const label = isCapEx ? item.item_name : item.software_name;
                  const itemSpec = isCapEx ? item.custom_specification : item.justification;
                  const unitCostVal = isCapEx ? item.unit_cost : item.annual_cost_per_user;
                  const totalMetric = isCapEx ? `${item.total_qty} units` : `₱${parseFloat(item.total_multiyear_mooe).toLocaleString()} MOOE`;
                  const filename = item.canvas_evidence_url ? item.canvas_evidence_url.split("/").pop() : null;

                  const isHighlighted = item.id === highlightedId;
                  const rowClass = `transition-all duration-700 ${
                    isHighlighted 
                      ? "bg-blue-955/45 border-l-4 border-l-blue-500 ring-2 ring-blue-500/30 animate-pulse" 
                      : "hover:bg-slate-955/20"
                  }`;

                  return (
                    <tr key={item.id} id={`proposal-${item.id}`} className={rowClass}>
                      {/* Department Tag */}
                      <td className="py-3.5 px-3">
                        <span className="inline-block px-2.5 py-1 rounded-[4px] text-[10px] font-bold bg-blue-955/40 border border-blue-900/60 text-blue-400 font-mono">
                          {getDeptName(item.department_id)}
                        </span>
                      </td>

                      {/* Item Details */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-slate-200">{label}</div>
                        {itemSpec && (
                          <div className="text-[10px] text-slate-500 italic max-w-[200px] truncate mt-0.5" title={itemSpec}>
                            {itemSpec}
                          </div>
                        )}
                        {item.is_expansion && (
                          <span className="text-[8px] px-1.5 py-0.2 mt-1 inline-block bg-blue-955/40 border border-blue-900 text-blue-400 font-bold uppercase tracking-wider rounded">
                            Expansion
                          </span>
                        )}
                      </td>

                      {/* Multi-Year Timeline Breakdown */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-300">{totalMetric}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          {planningYears.map(year => {
                            const val = isCapEx ? item.yearly_quantities?.[String(year)] : item.yearly_users?.[String(year)];
                            return `FY ${year}: ${val || 0}`;
                          }).join(" | ")}
                        </div>
                      </td>

                      {/* Unit Price */}
                      <td className="py-3.5 px-3 font-mono text-slate-200">
                        ₱{parseFloat(unitCostVal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      {/* Linked Quotation & Storage S3 Class */}
                      <td className="py-3.5 px-3">
                        {item.canvas_evidence_url ? (
                          <div className="space-y-1">
                            <a
                              href={item.canvas_evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1.5"
                            >
                              <span className="max-w-[120px] truncate block">{filename}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                            {item.s3_storage_class && (
                              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-0.5">
                                <HardDrive className="w-2.5 h-2.5" />
                                <span>{item.s3_storage_class}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-rose-500 italic font-bold">Missing</span>
                        )}
                      </td>

                      {/* Status Badging */}
                      <td className="py-3.5 px-3">
                        <StatusPill status={item.status} />
                      </td>

                      {/* Inline Actions Toolbar */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openComments(item)}
                            className="p-1.5 bg-slate-955 hover:bg-slate-800 text-slate-400 hover:text-blue-400 rounded border border-slate-850 transition-all cursor-pointer"
                            title="Remarks & Thread Comments"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {item.status === "Submitted" ? (
                            <>
                              <button
                                onClick={() => handleApprove(item.id, label)}
                                className="p-1.5 bg-slate-955 hover:bg-emerald-950/50 text-slate-400 hover:text-emerald-400 rounded border border-slate-850 transition-all cursor-pointer"
                                title="Approve compliance entry"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openOverrideModal(item)}
                                className="p-1.5 bg-slate-955 hover:bg-purple-950/50 text-slate-400 hover:text-purple-400 rounded border border-slate-850 transition-all cursor-pointer"
                                title="Administrative Override"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReturn(item.id, label)}
                                className="p-1.5 bg-slate-955 hover:bg-red-955/50 text-slate-400 hover:text-red-400 rounded border border-slate-850 transition-all cursor-pointer"
                                title="Return to department drafts"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide self-center px-1 flex items-center gap-1">
                              <Lock className="w-3 h-3 text-slate-600" /> Locked
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-20 text-slate-500">
              The queue is currently empty. No proposals match the active search filters.
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls Footer Container */}
      <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl mt-4">
        <span className="text-slate-500">
          Showing <strong className="text-slate-300">{skip + 1}</strong> to{" "}
          <strong className="text-slate-300">{Math.min(skip + limit, totalCount)}</strong> of{" "}
          <strong className="text-slate-300">{totalCount}</strong> records
        </span>
        <div className="flex gap-2">
          <button
            onClick={handlePrevPage}
            disabled={skip === 0}
            className="p-2 bg-slate-955 border border-slate-850 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg flex items-center gap-1 font-bold text-slate-300 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>
          <button
            onClick={handleNextPage}
            disabled={skip + limit >= totalCount}
            className="p-2 bg-slate-955 border border-slate-855 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg flex items-center gap-1 font-bold text-slate-300 transition-all cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Polymorphic Override Modal */}
      {activeOverrideItem && (
        <div className="fixed inset-0 bg-slate-955/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Administrative Override Console</h3>
              <button 
                onClick={() => setActiveOverrideItem(null)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Overridden Product Label
                </label>
                <input
                  type="text"
                  required
                  value={overrideItemName}
                  onChange={(e) => setOverrideItemName(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                    Overridden Unit Cost (PHP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={overrideUnitCost}
                    onChange={(e) => setOverrideUnitCost(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                    Deployments Target Scope (CSV)
                  </label>
                  <input
                    type="text"
                    required
                    value={overrideOffices}
                    onChange={(e) => setOverrideOffices(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Quantities / Users multi-year target grids */}
              <div className="space-y-2.5 p-3 bg-slate-955 rounded-lg border border-slate-850">
                <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                  Adjust Multi-Year Target Capacities
                </span>
                {planningYears.map(year => (
                  <div key={year} className="flex justify-between items-center gap-3">
                    <span className="font-bold text-slate-400 font-mono">FY {year} Scope</span>
                    <input
                      type="number"
                      min="0"
                      required
                      value={overrideQuantities[String(year)] || 0}
                      onChange={(e) => setOverrideQuantities({
                        ...overrideQuantities,
                        [String(year)]: parseInt(e.target.value, 10) || 0
                      })}
                      className="w-24 p-1.5 bg-slate-900 border border-slate-800 rounded text-center text-white font-mono"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                  Overridden Justification Specifications
                </label>
                <textarea
                  rows={3}
                  value={overrideSpec}
                  onChange={(e) => setOverrideSpec(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submittingOverride}
                className="w-full p-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all cursor-pointer"
              >
                <span>{submittingOverride ? "Commiting overrides..." : "Commit Administrative Override"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Discussion & Collaborative Comments Modal */}
      {activeDiscussionItem && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl flex flex-col h-[520px]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-955/50 rounded-t-xl">
              <div>
                <h3 className="text-white font-bold text-sm">Discussions & Revision Remarks</h3>
                <p className="text-[10px] text-slate-500 font-mono">Resource ID: {activeDiscussionItem.id}</p>
              </div>
              <button 
                onClick={() => setActiveDiscussionItem(null)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            
            {/* Thread feed */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans text-xs">
              {comments.length > 0 ? (
                comments.map((comment) => (
                  <div key={comment.id} className="p-3 bg-slate-955 border border-slate-850 rounded-lg space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-blue-400">{comment.author_name}</span>
                      <span className="text-slate-500">{new Date(comment.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{comment.text}</p>
                    
                    {comment.requires_department_action && (
                      <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-955/40 border border-red-900 text-red-400 font-bold uppercase tracking-wider">
                          Requires Dept Action
                        </span>
                        {comment.is_resolved ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5 text-[10px]">
                            <CheckSquare className="w-3.5 h-3.5" /> Resolved
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolveComment(comment.id)}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded cursor-pointer"
                          >
                            Resolve Action
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  No discussion remarks logged yet. Pinned admin feedback will render here.
                </div>
              )}
            </div>

            {/* Post comment form */}
            <form onSubmit={handlePostComment} className="p-4 border-t border-slate-800 bg-slate-955 rounded-b-xl space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="action_gate"
                  checked={requiresAction}
                  onChange={(e) => setRequiresAction(e.target.checked)}
                  className="w-3.5 h-3.5 accent-red-600 rounded cursor-pointer"
                />
                <label htmlFor="action_gate" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer select-none">
                  Flag as Action Item (submission lock gate)
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Type an inline revision remark or comment..."
                  className="flex-1 p-2.5 bg-slate-950 border border-slate-800 rounded text-xs text-white outline-none"
                />
                <button 
                  type="submit"
                  className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded cursor-pointer transition-colors"
                >
                  Post Remark
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}