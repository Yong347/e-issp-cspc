// frontend/src/views/department/Proposals/QuotationManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { uploadCanvas, getProposals, getSubscriptions } from "../../../api/dept";
import { 
  UploadCloud, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  FileSpreadsheet, 
  HardDrive
} from "lucide-react";

export default function QuotationManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  const [proposals, setProposals] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [selectedId, setSelectedId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [file, setFile] = useState(null);
  
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pData, sData] = await Promise.all([
        getProposals(activeCycle),
        getSubscriptions(activeCycle)
      ]);
      setProposals(pData.filter(p => p.status === "Draft" || p.status === "Returned"));
      setSubscriptions(sData.filter(s => s.status === "Draft" || s.status === "Returned"));
    } catch (err) {
      setError(err.message || "Failed to load workspace items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchItems();
    }
  }, [user, activeCycle]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedId || !supplierName.trim() || !file) {
      setError("Please complete all fields and attach a PDF file.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      await uploadCanvas(selectedId, supplierName.trim(), file);
      setSuccess("Market quotation canvas uploaded and linked successfully.");
      setSelectedId("");
      setSupplierName("");
      setFile(null);
      
      const fileInput = document.getElementById("canvas-file-input");
      if (fileInput) fileInput.value = "";

      fetchItems();
    } catch (err) {
      setError(err.message || "Failed to upload canvas.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-xs max-w-5xl mx-auto bg-slate-950 p-6 rounded-xl border border-slate-800">
      {/* Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-500" />
            <span>Canvas & Quotation Manager</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Store, link, and audit supplier price quotations for CapEx (Hardware) and MOOE (Software Subscriptions) proposals.
          </p>
        </div>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Items</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Panel */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4">
          <h3 className="text-white font-bold text-xs uppercase tracking-wider border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <UploadCloud className="w-4 h-4 text-blue-500" />
            <span>Link Quotation</span>
          </h3>

          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Target Proposal</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 outline-none cursor-pointer"
                required
              >
                <option value="" className="bg-slate-900 text-slate-200">-- Select Pending Proposal --</option>
                <optgroup label="Hardware Proposals (CapEx)" className="bg-slate-900 font-bold text-slate-400">
                  {proposals.map(p => (
                    <option key={p.id} value={p.id} className="font-normal text-slate-200 bg-slate-900">
                      {p.item_name} (₱{Number(p.unit_cost).toLocaleString()})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Software Subscriptions (MOOE)" className="bg-slate-900 font-bold text-slate-400">
                  {subscriptions.map(s => (
                    <option key={s.id} value={s.id} className="font-normal text-slate-200 bg-slate-900">
                      {s.software_name} (₱{Number(s.annual_cost_per_user).toLocaleString()})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Supplier Name</label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. PC Express"
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Quotation Document (PDF)</label>
              <input
                id="canvas-file-input"
                type="file"
                required
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full text-slate-400 text-xs file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-slate-850 file:text-slate-200 hover:file:bg-slate-700 file:cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all cursor-pointer"
            >
              <span>{submitting ? "Uploading file..." : "Link Canvas Document"}</span>
            </button>
          </form>
        </div>

        {/* Existing Links List */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3">Linked Canvas Records</h3>
          
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-10 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Reading upload paths...</span>
              </div>
            ) : proposals.length === 0 && subscriptions.length === 0 ? (
              <div className="text-center py-16 text-slate-500 italic">No editable items found requiring canvas uploads.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase font-bold">
                    <th className="py-2.5 px-2">Proposal Item</th>
                    <th className="py-2.5 px-2">Type</th>
                    <th className="py-2.5 px-2">S3 Storage Class</th>
                    <th className="py-2.5 px-2 text-right">Reference Attachment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {proposals.map(p => (
                    <tr key={p.id}>
                      <td className="py-3 px-2 font-semibold text-slate-200">{p.item_name}</td>
                      <td className="py-3 px-2 text-slate-400 font-medium">CapEx</td>
                      <td className="py-3 px-2 font-mono text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                          <span>{p.s3_storage_class || "STANDARD"}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        {p.canvas_evidence_url ? (
                          <a href={p.canvas_evidence_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1 font-semibold">
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </a>
                        ) : (
                          <span className="text-red-400 font-bold italic">Required upload missing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {subscriptions.map(s => (
                    <tr key={s.id}>
                      <td className="py-3 px-2 font-semibold text-slate-200">{s.software_name}</td>
                      <td className="py-3 px-2 text-slate-400 font-medium">MOOE</td>
                      <td className="py-3 px-2 font-mono text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3.5 h-3.5 text-slate-600" />
                          <span>{s.s3_storage_class || "STANDARD"}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        {s.canvas_evidence_url ? (
                          <a href={s.canvas_evidence_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1 font-semibold">
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </a>
                        ) : (
                          <span className="text-red-400 font-bold italic">Required upload missing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}