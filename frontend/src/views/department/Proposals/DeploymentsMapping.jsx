// frontend/src/views/department/Proposals/DeploymentsMapping.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { 
  Building2, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Inbox,
  ShieldAlert
} from "lucide-react";

export default function DeploymentsMapping({ proposalId, proposalName, proposalTotalQty = 0 }) {
  const { user } = useAuth();
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    office_name: "",
    quantity: 1
  });

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const BASE_URL = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const fetchDeploymentsList = async () => {
    if (!proposalId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/dept/proposals/${proposalId}/deployments`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to load allocation mappings.");
      }
      const data = await res.json();
      setDeployments(data);
    } catch (err) {
      setError(err.message || "Failed to query Table IV.A deployment matrix.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && proposalId) {
      fetchDeploymentsList();
    }
  }, [user, proposalId]);

  // Derived Calculations
  const allocatedQuantity = deployments.reduce((acc, curr) => acc + curr.quantity, 0);
  const remainingQuantity = proposalTotalQty - allocatedQuantity;

  const validateForm = () => {
    if (!form.office_name.trim()) return "Target SUC Office name is required.";
    if (form.quantity < 1) return "Allocation quantity must be at least 1 unit.";
    if (form.quantity > remainingQuantity) {
      return `Allocation count (${form.quantity}) exceeds remaining unallocated quantity of ${remainingQuantity} units.`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/dept/proposals/${proposalId}/deployments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          office_name: form.office_name.trim(),
          quantity: form.quantity
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to commit deployment allocation.");
      }

      setSuccess("Deployment allocation mapped successfully.");
      setForm({ office_name: "", quantity: remainingQuantity - form.quantity > 0 ? 1 : 0 });
      fetchDeploymentsList();
    } catch (err) {
      setError(err.message || "Failed to write deployment allocation mapping.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this deployment allocation mapping?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${BASE_URL}/api/dept/deployments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to delete deployment record.");
      }
      setSuccess("Deployment record removed successfully.");
      fetchDeploymentsList();
    } catch (err) {
      setError(err.message || "Failed to delete deployment allocation mapping.");
    }
  };

  return (
    <div className="space-y-4 p-5 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-100 select-none">
      
      {/* Title block */}
      <div className="border-b border-slate-850 pb-3 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-500" />
            <span>Table IV.A: Resource Deployment Matrix</span>
          </h3>
          <p className="text-slate-500 text-[10px] mt-0.5 max-w-md">
            Deploy hardware quantities to SUC target offices. Total proposal allocation check active.
          </p>
        </div>
        
        {proposalTotalQty > 0 && (
          <div className="text-right font-mono text-[10px] space-y-0.5">
            <div className="text-slate-400">Total Requested: <span className="font-bold text-slate-200">{proposalTotalQty} units</span></div>
            <div className="text-slate-400">Unallocated: <span className={`font-bold ${remainingQuantity > 0 ? "text-amber-400" : "text-emerald-400"}`}>{remainingQuantity} units</span></div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-955/20 border border-red-900 text-red-400 font-bold rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-950/20 border border-emerald-800 text-emerald-400 font-bold rounded flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Deployment Form */}
      {remainingQuantity > 0 ? (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-end sm:items-center bg-slate-950 p-3 rounded-lg border border-slate-850">
          <div className="flex-1 w-full space-y-1">
            <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block">Target SUC Office</label>
            <input
              type="text"
              placeholder="e.g. Dean's Office, Academic Support"
              value={form.office_name}
              onChange={e => setForm({ ...form, office_name: e.target.value })}
              className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none"
              required
            />
          </div>

          <div className="w-24 w-full sm:w-24 space-y-1">
            <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider block">Quantity</label>
            <input
              type="number"
              min="1"
              max={remainingQuantity}
              placeholder="Qty"
              value={form.quantity || ""}
              onChange={e => setForm({ ...form, quantity: parseInt(e.target.value, 10) || 1 })}
              className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-xs text-center text-slate-200 font-mono font-bold"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto p-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="sm:hidden">Add Allocation</span>
          </button>
        </form>
      ) : (
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg flex items-center gap-2.5 text-emerald-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Table IV.A Allocation complete. All {proposalTotalQty} proposed units have been mapped.</span>
        </div>
      )}

      {/* Allocation List Table */}
      <div className="bg-slate-950 rounded-lg border border-slate-850 overflow-hidden">
        {loading ? (
          <div className="text-center py-8 text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            <span>Reading allocation mapping...</span>
          </div>
        ) : deployments.length > 0 ? (
          <div className="divide-y divide-slate-850">
            {deployments.map(d => (
              <div key={d.id} className="flex justify-between items-center p-3 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="font-semibold text-slate-200">{d.office_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-blue-400 bg-blue-950/40 border border-blue-900/50 px-2 py-0.5 rounded text-[10px]">
                    {d.quantity} units
                  </span>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                    title="Delete Allocation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-500 flex flex-col items-center justify-center gap-2">
            <Inbox className="w-6 h-6 text-slate-600" />
            <span className="italic">No deployment mappings recorded yet.</span>
          </div>
        )}
      </div>
    </div>
  );
}