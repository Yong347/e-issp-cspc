// frontend/src/views/department/Proposals/MooeSubscriptions.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getSubscriptions, 
  createSubscription, 
  deleteSubscription, 
  submitSubscription, 
  uploadCanvas,
  syncSubscriptionMetadata,
  requestSubscriptionRestore,
  getComments,
  postComment,
  resolveComment
} from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import { 
  FileText, Plus, RefreshCw, AlertCircle, CheckCircle, 
  Trash2, Send, Upload, MessageCircle, CheckSquare, RefreshCcw
} from "lucide-react";

const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
const rawUrl = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

export default function MooeSubscriptions() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Form State
  const [subscriptionType, setSubscriptionType] = useState("SaaS");
  const [softwareName, setSoftwareName] = useState("");
  const [justification, setJustification] = useState("");
  const [annualCostPerUser, setAnnualCostPerUser] = useState("");
  const [yearlyUsers, setYearlyUsers] = useState({});
  const [targetOffices, setTargetOffices] = useState("");
  
  // Unified Creation File Upload State (for unlisted/custom requests)
  const [supplierName, setSupplierName] = useState("");
  const [canvasFile, setCanvasFile] = useState(null);
  const [creatingSubscription, setCreatingSubscription] = useState(false);
  
  // Secondary post-creation upload state (standard replacement uploads)
  const [uploadSubscriptionId, setUploadSubscriptionId] = useState(null);
  const [standaloneSupplier, setStandaloneSupplier] = useState("");
  const [standaloneFile, setStandaloneFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Comments Modal State
  const [activeCommentsProposal, setActiveCommentsProposal] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [requiresAction, setRequiresAction] = useState(false);

  useEffect(() => {
    if (planningYears && planningYears.length > 0) {
      const initial = {};
      planningYears.forEach(year => {
        initial[String(year)] = 0;
      });
      setYearlyUsers(initial);
    }
  }, [planningYears]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSubscriptions(activeCycle);
      setSubscriptions(data);
    } catch (err) {
      setError(err.message || "Failed to load software subscriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchData();
    }
  }, [user, activeCycle]);

  // Active Polling for Glacier Restore Progress on Subscriptions (Gap 28)
  useEffect(() => {
    const activeRestorations = subscriptions.filter(s => s.is_restoring);
    if (activeRestorations.length === 0) return;

    const intervals = activeRestorations.map(s => {
      const intervalId = setInterval(async () => {
        try {
          const res = await fetch(`${rawUrl}/api/dept/subscriptions/${s.id}/sync-metadata`, {
            method: "POST",
            headers: { Authorization: `Bearer ${user.token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.is_restoring) {
              clearInterval(intervalId);
              fetchData(); // Trigger full refresh to update download state
            } else {
              setSubscriptions(prev => 
                prev.map(item => item.id === s.id ? { ...item, restore_progress: data.restore_progress } : item)
              );
            }
          }
        } catch (pollErr) {
          console.error("Error polling Glacier restoration status on subscription:", pollErr);
        }
      }, 10000); // Poll status every 10 seconds

      return { id: s.id, intervalId };
    });

    return () => {
      intervals.forEach(x => clearInterval(x.intervalId));
    };
  }, [subscriptions.filter(s => s.is_restoring).length]);

  const handleCreateSubscription = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Strict validation check requiring quotation attachments on create
    if (!canvasFile || !supplierName.trim()) {
      setError("Compliance Violation: Setting up a subscription request requires an attached canvas quotation.");
      return;
    }
    
    setCreatingSubscription(true);
    const parsedOffices = targetOffices
      ? targetOffices.split(",").map(o => o.trim()).filter(o => o.length > 0)
      : [];
      
    const payload = {
      subscription_type: subscriptionType,
      software_name: softwareName.trim(),
      justification: justification.trim(),
      yearly_users: yearlyUsers,
      annual_cost_per_user: parseFloat(annualCostPerUser) || 0.0,
      target_offices_json: parsedOffices,
      canvas_evidence_url: null
    };

    try {
      // 1. Log Proposal Draft
      const res = await createSubscription(payload);
      const subscriptionId = res.id;

      // 2. Upload and link file sequentially
      if (canvasFile) {
        await uploadCanvas(subscriptionId, supplierName.trim(), canvasFile);
      }

      setSuccess("MOOE subscription draft logged and canvas quotation linked successfully.");
      setSoftwareName("");
      setJustification("");
      setAnnualCostPerUser("");
      setTargetOffices("");
      setSupplierName("");
      setCanvasFile(null);
      
      const fileInput = document.getElementById("inline-canvas-mooe-input");
      if (fileInput) fileInput.value = "";

      if (planningYears && planningYears.length > 0) {
        const resetUsers = {};
        planningYears.forEach(year => { resetUsers[String(year)] = 0; });
        setYearlyUsers(resetUsers);
      }
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to create subscription.");
    } finally {
      setCreatingSubscription(false);
    }
  };

  const handleStandaloneUpload = async (e) => {
    e.preventDefault();
    if (!standaloneFile || !standaloneSupplier) {
      alert("Please provide both a supplier name and a valid canvas PDF file.");
      return;
    }
    setError(null);
    setSuccess(null);
    setUploadingFile(true);
    try {
      await uploadCanvas(uploadSubscriptionId, standaloneSupplier, standaloneFile);
      setSuccess("Canvas evidence document successfully uploaded.");
      setUploadSubscriptionId(null);
      setStandaloneSupplier("");
      setStandaloneFile(null);
      
      const fileInput = document.getElementById("canvas-evidence-mooe-input");
      if (fileInput) fileInput.value = "";

      fetchData();
    } catch (err) {
      setError(err.message || "Upload operation failed.");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this subscription draft?")) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteSubscription(id);
      setSuccess("Subscription successfully deleted.");
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to remove subscription.");
    }
  };

  const handleSubmit = async (id) => {
    setError(null);
    setSuccess(null);
    try {
      await submitSubscription(id);
      setSuccess("Subscription successfully transited to SUBMITTED status.");
      fetchData();
    } catch (err) {
      setError(err.message || "Submission process failed.");
    }
  };

  const handleMetadataSync = async (id) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await syncSubscriptionMetadata(id);
      setSuccess(`Metadata synced successfully. S3 Class: ${res.storage_class}`);
      fetchData();
    } catch (err) {
      setError(err.message || "Metadata sync failed.");
    }
  };

  const handleGlacierRestore = async (id) => {
    setError(null);
    setSuccess(null);
    try {
      await requestSubscriptionRestore(id);
      setSuccess("AWS S3 Glacier cold-retrieval restoration initiated. Standard restore completes in 3-5 hours.");
      fetchData();
    } catch (err) {
      setError(err.message || "Cold retrieval initialization failed.");
    }
  };

  const openComments = async (sub) => {
    setActiveCommentsProposal(sub);
    setNewCommentText("");
    setRequiresAction(false);
    try {
      const data = await getComments(sub.id);
      setComments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      await postComment(activeCommentsProposal.id, {
        text: newCommentText.trim(),
        requires_department_action: requiresAction
      });
      setNewCommentText("");
      setRequiresAction(false);
      const data = await getComments(activeCommentsProposal.id);
      setComments(data);
    } catch (err) {
      alert(err.message || "Failed to post remark.");
    }
  };

  const handleResolveComment = async (commentId) => {
    try {
      await resolveComment(activeCommentsProposal.id, commentId);
      const data = await getComments(activeCommentsProposal.id);
      setComments(data);
    } catch (err) {
      alert(err.message || "Failed to resolve remark.");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <span>MOOE Software & Cloud Service Subscriptions</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Log and manage your department's multi-year software licensing requirements under compliance sub-ceiling limits.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Workspace</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{typeof error === "object" ? error.message : error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5 text-xs">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creation Form Sidebar */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4">
          <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-indigo-500" />
            <span>Create MOOE Request</span>
          </h3>

          <form onSubmit={handleCreateSubscription} className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Subscription Framework Type
              </label>
              <select
                value={subscriptionType}
                onChange={(e) => setSubscriptionType(e.target.value)}
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
              >
                <option value="SaaS" className="bg-slate-900 text-slate-200">SaaS (Software as a Service)</option>
                <option value="Cloud Subscription" className="bg-slate-900 text-slate-200">Cloud Subscription (AWS, Azure, GCP)</option>
                <option value="Annual License" className="bg-slate-900 text-slate-200">Annual License / Seat Mapping</option>
                <option value="PaaS" className="bg-slate-900 text-slate-200">PaaS (Platform as a Service)</option>
                <option value="IaaS" className="bg-slate-900 text-slate-200">IaaS (Infrastructure as a Service)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Software / Service Package Name
              </label>
              <input
                type="text"
                required
                value={softwareName}
                onChange={(e) => setSoftwareName(e.target.value)}
                placeholder="e.g. Adobe Creative Cloud, JetBrains Rider"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all"
              />
            </div>

            <div className="space-y-4 p-3.5 bg-slate-950 border border-slate-850 rounded-lg animate-fadeIn">
              <span className="block text-[9px] uppercase font-extrabold text-blue-400 tracking-wider">
                Mandatory Market Canvas Verification
              </span>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Supplier Name
                </label>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Adobe Education Partner"
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Quotation Canvas Document (PDF Only)
                </label>
                <input
                  id="inline-canvas-mooe-input"
                  type="file"
                  required
                  accept="application/pdf"
                  onChange={(e) => setCanvasFile(e.target.files[0])}
                  className="w-full text-slate-300 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Est. Annual Cost per User/License (PHP)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={annualCostPerUser}
                onChange={(e) => setAnnualCostPerUser(e.target.value)}
                placeholder="0.00"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all font-mono"
              />
            </div>

            <div className="space-y-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                Multi-Year User Allocations
              </span>
              {planningYears.map(year => (
                <div key={year} className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-300 font-mono">FY {year} Seats</span>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    required
                    value={yearlyUsers[String(year)] || 0}
                    onChange={(e) => setYearlyUsers({
                      ...yearlyUsers,
                      [String(year)]: parseInt(e.target.value, 10) || 0
                    })}
                    className="w-24 p-1.5 bg-slate-900 border border-slate-800 rounded text-center text-white font-mono"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Detailed Justification
              </label>
              <textarea
                required
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="How this license directly maps to MFO outcomes and curriculum"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Target Office Deployments (CSV List)
              </label>
              <input
                type="text"
                required
                value={targetOffices}
                onChange={(e) => setTargetOffices(e.target.value)}
                placeholder="e.g. Design Faculty, CS Lab 1"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={creatingSubscription}
              className="w-full p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{creatingSubscription ? "Uploading & Creating..." : "Log MOOE Request Draft"}</span>
            </button>
          </form>
        </div>

        {/* Dynamic Proposals Board */}
        <div className="lg:col-span-2 space-y-6">
          {uploadSubscriptionId && (
            <div className="bg-slate-900 p-5 rounded-xl border border-blue-900/50 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-blue-400" />
                  <span>Upload Canvas Quotation Evidence</span>
                </h4>
                <button 
                  onClick={() => setUploadSubscriptionId(null)}
                  className="text-slate-400 hover:text-white font-bold text-xs cursor-pointer"
                >
                  &times; Cancel
                </button>
              </div>
              <form onSubmit={handleStandaloneUpload} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Supplier Name</label>
                  <input
                    type="text"
                    required
                    value={standaloneSupplier}
                    onChange={(e) => setStandaloneSupplier(e.target.value)}
                    placeholder="e.g. Adobe Education Distributor"
                    className="w-full p-2 bg-slate-955 border border-slate-800 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Canvas PDF Document</label>
                  <input
                    id="canvas-evidence-mooe-input"
                    type="file"
                    required
                    accept="application/pdf"
                    onChange={(e) => setStandaloneFile(e.target.files[0])}
                    className="w-full text-slate-300 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={uploadingFile}
                  className="p-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingFile ? "Uploading..." : "Submit File"}</span>
                </button>
              </form>
            </div>
          )}

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
            <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3">
              MOOE Subscriptions Registry
            </h3>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="text-xs">Loading active queue...</span>
                </div>
              ) : subscriptions.length > 0 ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                      <th className="py-3 px-2">Software Package</th>
                      <th className="py-3 px-2">User License Seats</th>
                      <th className="py-3 px-2">Annual Unit Rate</th>
                      <th className="py-3 px-2">Quotation</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {subscriptions.map(sub => {
                      const filename = sub.canvas_evidence_url ? sub.canvas_evidence_url.split("/").pop() : null;
                      const totalSeats = Object.values(sub.yearly_users || {}).reduce((a, b) => a + b, 0);
                      
                      return (
                        <tr key={sub.id} className="hover:bg-slate-950/20 transition-colors">
                          <td className="py-3.5 px-2">
                            <div className="font-semibold text-slate-200">{sub.software_name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{sub.subscription_type}</div>
                          </td>
                          <td className="py-3.5 px-2">
                            <div className="font-semibold text-slate-300">Total: {totalSeats} seats</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {planningYears.map(y => `${y}: ${sub.yearly_users?.[String(y)] || 0}`).join(" | ")}
                            </div>
                          </td>
                          <td className="py-3.5 px-2 font-mono text-slate-200">
                            ₱{parseFloat(sub.annual_cost_per_user).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-2">
                            {sub.canvas_evidence_url ? (
                              <div className="flex flex-col gap-1 items-start">
                                <a 
                                  href={sub.canvas_evidence_url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-blue-400 underline font-semibold truncate max-w-[120px]"
                                >
                                  {filename}
                                </a>
                                {sub.s3_storage_class === "GLACIER" ? (
                                  sub.is_restoring ? (
                                    /* Active Time-Based S3 Glacier Progress Bar Indicator (Gap 28) */
                                    <div className="space-y-1 w-full max-w-[120px] pt-1">
                                      <div className="flex justify-between text-[8px] font-mono text-amber-400 font-semibold">
                                        <span>RESTORING</span>
                                        <span>{sub.restore_progress || 50}%</span>
                                      </div>
                                      <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden border border-slate-850">
                                        <div 
                                          className="h-full bg-amber-500 rounded-full transition-all duration-500 animate-pulse" 
                                          style={{ width: `${sub.restore_progress || 50}%` }} 
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => handleGlacierRestore(sub.id)}
                                      className="text-[9px] text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer"
                                    >
                                      S3 Glacier Restore
                                    </button>
                                  )
                                ) : (
                                  <button 
                                    onClick={() => handleMetadataSync(sub.id)}
                                    title="Sync metadata class"
                                    className="text-[9px] text-slate-500 hover:text-slate-400 flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <RefreshCcw className="w-2.5 h-2.5" />
                                    <span>Sync</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button 
                                onClick={() => setUploadSubscriptionId(sub.id)}
                                className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Upload className="w-3 h-3" />
                                <span>Upload Canvas</span>
                              </button>
                            )}
                          </td>
                          <td className="py-3.5 px-2">
                            <StatusPill status={sub.status} />
                          </td>
                          <td className="py-3.5 px-2 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => openComments(sub)}
                                className="p-1 text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
                                title="Comments thread"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                              
                              {sub.status === "Draft" || sub.status === "Returned" ? (
                                <>
                                  <button
                                    onClick={() => handleSubmit(sub.id)}
                                    className="p-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                    title="Submit Proposal"
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(sub.id)}
                                    className="p-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                                    title="Delete Draft"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-500 italic">Locked</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-16 text-slate-500">
                  No active software licensing proposals logged. Create a draft using the panel on the left.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeCommentsProposal && (
        <div className="fixed inset-0 bg-slate-955/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl flex flex-col h-[500px]">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 rounded-t-xl">
              <div>
                <h3 className="text-white font-bold text-sm">Discussions Thread</h3>
                <p className="text-[10px] text-slate-400">Proposal ID: {activeCommentsProposal.id}</p>
              </div>
              <button 
                onClick={() => setActiveCommentsProposal(null)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            
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
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
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

            <form onSubmit={handlePostComment} className="p-4 border-t border-slate-800 bg-slate-955 rounded-b-xl flex gap-2">
              <input
                type="text"
                required
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white outline-none"
              />
              <button 
                type="submit"
                className="p-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded cursor-pointer"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}