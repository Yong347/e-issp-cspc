// frontend/src/views/admin/Dashboard/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useCycle } from '../../../context/CycleContext';
import { 
  Inbox, CheckCheck, Landmark, Bolt, Terminal, RefreshCw, 
  Trash2, Lock, Download, ShieldAlert
} from 'lucide-react';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  const token = user?.token;
  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [budgetMetrics, setBudgetMetrics] = useState({
    global_ceiling: 200000000.00,
    total_spent: 0.00
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  
  const [logs, setLogs] = useState([
    { time: '01:15:02', text: 'INFO: Standard preambles and instructions locked into task engine.', type: 'text-emerald-400' },
    { time: '01:25:30', text: 'INFO: Budget limits validated for main Nabua and satellite Buhi campus.', type: 'text-blue-400' }
  ]);

  const addLog = (text, type = '') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setLogs(prev => [...prev, { time: timeStr, text, type }]);
  };

  const getDeptName = (id) => {
    const depts = {
      1: "College of Engineering",
      2: "College of Computer Studies",
      3: "College of Arts & Sciences",
      4: "College of Health Sciences",
      5: "College of Tourism",
      6: "Human Resources Management"
    };
    return depts[id] || `Department ${id}`;
  };

  const fetchLiveProposals = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/admin/proposals`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to fetch database queue.");
      const data = await response.json();
      setProposals(data);
      
      setPendingCount(data.filter(p => p.status === 'Submitted').length);
      setApprovedCount(data.filter(p => p.status === 'Approved').length);

      // Fetch consolidated budget metrics
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
      addLog(`ERROR: Database connection failed. ${err.message}`, 'text-red-400');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLiveProposals();
    }
  }, [token]);

  const handleApprove = async (id, itemName) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${id}/approve`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Approval transaction failed.");
      
      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'Approved' } : p));
      setPendingCount(prev => (prev > 0 ? prev - 1 : 0));
      setApprovedCount(prev => prev + 1);
      
      // Re-trigger metric refresh
      const metricsResponse = await fetch(`${apiUrl}/api/admin/dashboard-metrics`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setBudgetMetrics({
          global_ceiling: metricsData.global_ceiling,
          total_spent: metricsData.total_spent
        });
      }

      addLog(`SUCCESS: Transited "${itemName}" to APPROVED. Updated budget metrics.`, 'text-emerald-400');
    } catch (err) {
      addLog(`ERROR: Approval failed - {err.message}`, 'text-red-400');
    }
  };

  const handleReturn = async (id, itemName) => {
    const remark = prompt("Enter Inline Remark / Revision Request for this Department:", "Canvas unverified. Please upload quotation proof.");
    if (!remark) return;

    try {
      const commentRes = await fetch(`${apiUrl}/api/admin/proposals/${id}/return`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!commentRes.ok) throw new Error("Return state transition failed.");

      // Optional step: Add the remark to the comments thread of the proposal on the backend if required
      await fetch(`${apiUrl}/api/dept/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          text: remark,
          proposal_id: id,
          requires_department_action: true
        })
      });

      setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'Returned' } : p));
      setPendingCount(prev => (prev > 0 ? prev - 1 : 0));
      
      addLog(`RETURNED: "${itemName}" set to Returned. Remark dispatched to department feedback loop.`, 'text-amber-400');
    } catch (err) {
      addLog(`ERROR: Return execution failed - ${err.message}`, 'text-red-400');
    }
  };

  const handleOverride = async (id, itemName) => {
    const newPriceInput = prompt(`Enter new verified unit cost (PHP) for "${itemName}":`);
    if (!newPriceInput) return;

    const newPrice = parseFloat(newPriceInput);
    if (isNaN(newPrice)) {
      alert("Invalid price format entered.");
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/api/admin/proposals/${id}/override`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          hardware: { unit_cost: newPrice }
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Price override execution failed.");
      }

      setProposals(prev => prev.map(p => p.id === id ? { ...p, unit_cost: newPrice } : p));
      
      // Refresh globalspent metric
      fetchLiveProposals();
      addLog(`OVERRIDE: Applied price correction to "${itemName}". New rate: ₱${newPrice.toLocaleString()}`, 'text-blue-400');
    } catch (err) {
      addLog(`ERROR: Override failed: ${err.message}`, 'text-red-400');
      alert(err.message);
    }
  };

  const triggerPDFGeneration = async () => {
    setIsGenerating(true);
    setGenerationComplete(false);
    addLog("INIT: Sending document trigger payload to Celery background workers...", "text-blue-400");

    try {
      const response = await fetch(`${apiUrl}/api/admin/governance/generate-issp?issp_period=${activeCycle}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Compilation queue registration failed.");
      }
      const data = await response.json();
      
      if (data.status === "queued" || data.task_id) {
        addLog(`SUCCESS: Task queued. Celery Task ID: ${data.task_id}`, 'text-emerald-400');
        pollTaskStatus(data.task_id);
      }
    } catch (err) {
      addLog(`ERROR: Task dispatch failed: ${err.message}`, 'text-red-400');
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
        addLog(`WORKER: ${data.meta?.status || 'Processing layout components...'}`, 'text-slate-400');
        setTimeout(() => pollTaskStatus(taskId), 1500);
      } else if (data.state === "SUCCESS") {
        setIsGenerating(false);
        setGenerationComplete(true);
        addLog("SUCCESS: Document compiled and saved to target vault.", "text-emerald-400");
        setDownloadUrl(data.result?.file_url || '');
      } else if (data.state === "FAILURE") {
        setIsGenerating(false);
        addLog(`ERROR: Compiling process crashed: ${data.error}`, 'text-red-400');
      }
    } catch (e) {
      setIsGenerating(false);
    }
  };

  const utilizationPercent = budgetMetrics.global_ceiling > 0 
    ? (budgetMetrics.total_spent / budgetMetrics.global_ceiling) * 100 
    : 0;

  return (
    <div className="space-y-6 text-xs text-slate-100">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex items-center gap-4">
          <div className="p-3.5 bg-red-500/10 text-red-400 rounded-lg">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">{pendingCount}</h3>
            <span className="text-[10px] uppercase font-bold text-slate-500">Pending Review</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex items-center gap-4">
          <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <CheckCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">{approvedCount}</h3>
            <span className="text-[10px] uppercase font-bold text-slate-500">Approved Items</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2 font-bold text-slate-300">
              <Landmark className="w-4 h-4 text-blue-400" />
              <span>Global Budget Ceiling Allocation</span>
            </span>
            <span className="text-[9px] font-bold text-blue-400 bg-blue-950/50 border border-blue-900/30 px-2 py-0.5 rounded">
              FY {activeCycle}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>₱{budgetMetrics.total_spent.toLocaleString()} spent</span>
              <span>₱{budgetMetrics.global_ceiling.toLocaleString()} limit</span>
            </div>
            <div className="w-full bg-slate-950 border border-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(utilizationPercent, 100)}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Queue Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
            <span>Itemized Queue Consolidation (Annexes A-1 to A-6)</span>
          </h3>
          <button 
            onClick={fetchLiveProposals} 
            disabled={loading}
            className="p-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync DB Queue</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-955 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-4">Department</th>
                <th className="p-4">Proposed Item</th>
                <th className="p-4">Qty</th>
                <th className="p-4">Unit Cost</th>
                <th className="p-4">Canvas Proof</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {proposals.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-slate-500 italic">
                    No proposals logged in the planning queue.
                  </td>
                </tr>
              ) : (
                proposals.map(p => {
                  const isCustom = p.item_key === 'other';
                  const canvasFilename = p.canvas_evidence_url ? p.canvas_evidence_url.split('/').pop() : 'Missing';

                  return (
                    <tr key={p.id} className="hover:bg-slate-955/20 transition-colors">
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded bg-slate-955 border border-slate-850 text-[10px] text-blue-400 font-mono">
                          {getDeptName(p.department_id)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-200">{isCustom ? p.custom_specification || 'Custom Item' : p.item_name}</div>
                        {isCustom ? (
                          <span className="text-[9px] font-bold text-rose-400 flex items-center gap-1 mt-0.5">
                            <ShieldAlert className="w-3.5 h-3.5" /> Custom Request
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 mt-0.5">Standard Specification</span>
                        )}
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-200">{p.total_qty}</td>
                      <td className="p-4 font-mono font-bold text-slate-200">
                        ₱{Number(p.unit_cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4">
                        {canvasFilename === 'Missing' ? (
                          <span className="text-red-400 font-bold italic">Missing Proof</span>
                        ) : (
                          <a 
                            href={p.canvas_evidence_url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-blue-400 font-semibold underline hover:text-blue-300 break-all max-w-[120px] inline-block"
                          >
                            {canvasFilename}
                          </a>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          p.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          p.status === 'Returned' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {p.status === 'Submitted' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => handleApprove(p.id, p.item_name)}
                              className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-colors cursor-pointer"
                              title="Approve"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={() => handleOverride(p.id, p.item_name)}
                              className="p-1 px-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-750 font-bold rounded transition-colors cursor-pointer"
                              title="Override Cost"
                            >
                              Override
                            </button>
                            <button 
                              onClick={() => handleReturn(p.id, p.item_name)}
                              className="p-1 px-2.5 bg-red-955/40 hover:bg-red-900/40 text-red-300 border border-red-900/30 font-bold rounded transition-colors cursor-pointer"
                              title="Return to Department"
                            >
                              Return
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center justify-end gap-1">
                            <Lock className="w-3.5 h-3.5" /> Locked
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Balanced Dual-Column Operations suite */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Compilation Control */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col justify-between border-l-4 border-l-emerald-600">
          <div className="space-y-3">
            <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
              <Bolt className="w-4 h-4 text-emerald-400" />
              <span>ISSP Document Compilation</span>
            </h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Compile approved multi-campus plans into the official compliance PDF. Includes ISO certification stamps, Batas Pambansa mandates, and project investment summaries.
            </p>
          </div>
          <div className="mt-4">
            {generationComplete ? (
              <a 
                href={downloadUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="w-full p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 text-center text-xs"
              >
                <span>Download Compiled ISSP Document</span>
              </a>
            ) : (
              <button 
                onClick={triggerPDFGeneration}
                disabled={isGenerating}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>{isGenerating ? 'Compiling Layout Packages...' : 'Compile ISSP Document'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live System Logging Output */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-800 bg-slate-955 flex items-center gap-1.5">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="font-bold text-slate-400 text-[10px] uppercase font-mono">System Events Logs</span>
          </div>
          <div className="p-4 flex-grow flex flex-col justify-between">
            <div className="bg-[#0b0f19] border border-slate-950 p-3 rounded-lg font-mono text-[9px] overflow-y-auto space-y-2 h-32 select-text">
              {logs.map((log, index) => (
                <div key={index} className="leading-relaxed">
                  <span className="text-slate-600">[{log.time}]</span> <span className={log.type}>{log.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}