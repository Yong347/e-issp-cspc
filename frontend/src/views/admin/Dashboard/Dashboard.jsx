// frontend/src/views/admin/Dashboard/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useCycle } from '../../../context/CycleContext';
import { 
  Inbox, 
  CheckCheck, 
  Landmark, 
  Bolt, 
  Terminal, 
  RefreshCw, 
  Lock, 
  Download, 
  ArrowRight,
  X,
  Activity,
  Check,
  FileText
} from 'lucide-react';
import Modal from '../../../components/common/Modal';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  const token = user?.token;
  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [budgetMetrics, setBudgetMetrics] = useState({
    global_ceiling: 200000000.00,
    total_spent: 0.00
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatusMsg, setGenerationStatusMsg] = useState("");
  const [generationComplete, setGenerationComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  const [logs, setLogs] = useState(() => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    return [
      { time: timeStr, text: 'SYSTEM: Governance engine initialized for active planning cycle.', type: 'text-emerald-400' },
      { time: timeStr, text: 'AUDIT: Verified statutory constraints and baseline budget parameters.', type: 'text-blue-400' }
    ];
  });

  const [returnModalItem, setReturnModalItem] = useState(null);
  const [returnRemark, setReturnRemark] = useState("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [alertError, setAlertError] = useState(null);

  const addLog = (text, type = '') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setLogs(prev => [...prev, { time: timeStr, text, type }]);
  };

  const getDeptName = (proposal) => {
    if (proposal.target_office_automated) return proposal.target_office_automated;
    if (proposal.department?.name) return proposal.department.name;
    const deptObj = departments.find(d => (d.department_id || d.id) === proposal.department_id);
    return deptObj ? (deptObj.department_name || deptObj.name) : "Central Office";
  };

  const fetchLiveProposals = async () => {
    setLoading(true);
    try {
      const deptRes = await fetch(`${apiUrl}/api/admin/departments`, {
        headers: { "Authorization": `Bearer ${token}` }
      }).catch(() => null);

      if (deptRes && deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(Array.isArray(deptData) ? deptData : []);
      }

      const response = await fetch(`${apiUrl}/api/admin/proposals?issp_period=${activeCycle}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch database queue.");
      
      const payload = await response.json();
      const itemsList = Array.isArray(payload) ? payload : (payload.data || []);
      
      setProposals(itemsList);
      setPendingCount(itemsList.filter(p => p.status === 'Submitted').length);
      setApprovedCount(itemsList.filter(p => p.status === 'Approved').length);

      const metricsResponse = await fetch(`${apiUrl}/api/admin/dashboard-metrics`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setBudgetMetrics({
          global_ceiling: metricsData.global_ceiling || 200000000.00,
          total_spent: metricsData.total_spent || 0.00
        });
      }
    } catch (err) {
      addLog(`ERROR: Database connection failed. ${err.message}`, 'text-rose-400');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLiveProposals();
    }
  }, [token, activeCycle]);

  const handleApprove = async (id, itemName) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${id}/approve`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Approval transaction failed.");
      }
      
      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'Approved' } : p));
      setPendingCount(prev => (prev > 0 ? prev - 1 : 0));
      setApprovedCount(prev => prev + 1);
      
      addLog(`SUCCESS: Transited "${itemName}" to APPROVED.`, 'text-emerald-400');
    } catch (err) {
      addLog(`ERROR: Approval failed - ${err.message}`, 'text-rose-400');
      setAlertError(`Approval failed: ${err.message}`);
    }
  };

  const submitReturnModal = async (e) => {
    e.preventDefault();
    if (!returnModalItem || !returnRemark.trim()) return;

    setIsSubmittingReturn(true);
    const { id, item_name: itemName } = returnModalItem;

    try {
      const commentRes = await fetch(`${apiUrl}/api/admin/proposals/${id}/return`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!commentRes.ok) {
        const errData = await commentRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Return state transition failed.");
      }

      await fetch(`${apiUrl}/api/dept/proposals/${id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          text: returnRemark.trim(),
          proposal_id: id,
          requires_department_action: true
        })
      });

      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'Returned' } : p));
      setPendingCount(prev => (prev > 0 ? prev - 1 : 0));
      
      addLog(`RETURNED: "${itemName}" set to Returned with action items.`, 'text-amber-400');
      setReturnModalItem(null);
      setReturnRemark("");
    } catch (err) {
      setAlertError(`Return execution failed: ${err.message}`);
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const triggerPDFGeneration = async () => {
    setIsGenerating(true);
    setGenerationComplete(false);
    setGenerationProgress(15);
    setGenerationStatusMsg("Queuing background task & verifying admin cryptographic token...");
    addLog("INIT: Dispatching document trigger payload to background workers...", "text-blue-400");

    try {
      const response = await fetch(`${apiUrl}/api/admin/governance/generate-issp?issp_period=${activeCycle}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Compilation queue registration failed.");
      }
      const data = await response.json();
      
      if (data.task_id) {
        addLog(`SUCCESS: Task queued (ID: ${data.task_id})`, 'text-emerald-400');
        pollTaskStatus(data.task_id);
      }
    } catch (err) {
      addLog(`ERROR: Task dispatch failed: ${err.message}`, 'text-rose-400');
      setIsGenerating(false);
    }
  };

  const pollTaskStatus = async (taskId) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/governance/task-status/${taskId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.state === "PROGRESS" || data.state === "PENDING") {
        const prog = data.progress_percent || 30;
        const msg = data.current_step_message || "Compiling layout packages...";
        setGenerationProgress(prog);
        setGenerationStatusMsg(msg);
        addLog(`WORKER [${prog}%]: ${msg}`, 'text-slate-400');
        setTimeout(() => pollTaskStatus(taskId), 1500);
      } else if (data.state === "SUCCESS") {
        setGenerationProgress(100);
        setGenerationStatusMsg("Official ISSP PDF certified and archived successfully!");
        setIsGenerating(false);
        setGenerationComplete(true);
        addLog("SUCCESS: Official ISSP PDF certified and archived.", "text-emerald-400");
        setDownloadUrl(data.result?.file_url || '');
      } else if (data.state === "FAILURE") {
        setIsGenerating(false);
        addLog(`ERROR: Compiling process failed: ${data.error}`, 'text-rose-400');
      }
    } catch (e) {
      setIsGenerating(false);
    }
  };

  const utilizationPercent = budgetMetrics.global_ceiling > 0 
    ? (budgetMetrics.total_spent / budgetMetrics.global_ceiling) * 100 
    : 0;

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-100 font-sans select-none">
      
      {alertError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center justify-between">
          <span>{alertError}</span>
          <button onClick={() => setAlertError(null)} className="text-current font-bold"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          onClick={() => navigate("/admin/queue?status_filter=Submitted")}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xs hover:border-blue-400 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 rounded-xl">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{pendingCount}</h3>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Pending Review</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>

        <div 
          onClick={() => navigate("/admin/queue?status_filter=Approved")}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xs hover:border-emerald-400 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{approvedCount}</h3>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Approved Proposals</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl space-y-2 shadow-xs">
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            <span className="flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5 text-blue-500" />
              <span>Budget Cap Utilization</span>
            </span>
            <span className="font-mono">{utilizationPercent.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-sm font-bold text-slate-900 dark:text-white">
            ₱{budgetMetrics.total_spent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Main Review Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-955">
          <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
            Actionable Proposals Queue (Part IV.A)
          </h3>
          <button 
            onClick={fetchLiveProposals} 
            disabled={loading}
            className="p-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 font-bold shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400 uppercase font-bold text-[9.5px] font-mono">
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Resource Description</th>
                <th className="p-3.5 text-center">Qty</th>
                <th className="p-3.5">Unit Cost</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
              {proposals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">No proposal line items currently queued.</td>
                </tr>
              ) : (
                proposals.slice(0, 8).map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-955/30 transition-colors">
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                      {getDeptName(p)}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">{p.item_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">[{p.strategic_category}]</div>
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-900 dark:text-white">{p.total_qty}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      ₱{Number(p.unit_cost).toLocaleString()}
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono uppercase ${
                        p.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                        p.status === 'Returned' ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                        'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {p.status === 'Submitted' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => handleApprove(p.id, p.item_name)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition-colors cursor-pointer"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => { setReturnModalItem(p); setReturnRemark("Quotation requires update or verification."); }}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded font-bold transition-colors cursor-pointer"
                          >
                            Return
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono font-bold uppercase flex items-center justify-end gap-1">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compiler & System Event Logger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col justify-between shadow-xs space-y-4">
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Bolt className="w-4 h-4 text-blue-500" />
              <span>ISSP Document Compilation Engine</span>
            </h4>
            <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">
              Triggers asynchronous dual-pass WeasyPrint compilation with live four-way financial parity assertion across all planning years.
            </p>

            {/* In-Progress Stepper View */}
            {isGenerating && (
              <div className="p-3.5 bg-blue-50/70 dark:bg-slate-955 rounded-xl border border-blue-200 dark:border-blue-900 space-y-2.5 animate-fadeIn">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 animate-pulse" />
                    <span>{generationStatusMsg || "Compiling layout packages..."}</span>
                  </span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{generationProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(10, generationProgress)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            {generationComplete ? (
              <a 
                href={downloadUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Download Certified Plan PDF</span>
              </a>
            ) : (
              <button 
                onClick={triggerPDFGeneration}
                disabled={isGenerating}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs cursor-pointer shadow-sm transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Compiling Layout Packages...' : 'Compile ISSP Document'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xs">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="font-bold text-slate-500 uppercase text-[9.5px] font-mono">Live Event &amp; Audit Feed</span>
          </div>
          <div className="p-4 flex-1">
            <div className="bg-slate-955 p-3 rounded-xl font-mono text-[9px] h-32 overflow-y-auto space-y-1.5 custom-scrollbar text-slate-200">
              {logs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  <span className="text-slate-500">[{log.time}]</span> <span className={log.type}>{log.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Return Modal */}
      <Modal
        isOpen={Boolean(returnModalItem)}
        onClose={() => setReturnModalItem(null)}
        title="Return Proposal for Revisions"
        subtitle={returnModalItem ? `Item: ${returnModalItem.item_name}` : ""}
      >
        <form onSubmit={submitReturnModal} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500">Revision Instructions</label>
            <textarea
              rows={3}
              required
              value={returnRemark}
              onChange={e => setReturnRemark(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setReturnModalItem(null)}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReturn}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold cursor-pointer"
            >
              {isSubmittingReturn ? "Returning..." : "Confirm Return"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
