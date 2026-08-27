// frontend/src/views/department/Proposals/CapExProposals.jsx
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getProposals, 
  createDraftProposal, 
  updateProposal, 
  deleteProposal, 
  submitProposal, 
  getDeptCatalog, 
  uploadCanvas,
  syncProposalMetadata,
  requestProposalRestore,
  getComments,
  postComment,
  resolveComment
} from "../../../api/dept";
import StatusPill from "../../../components/common/StatusPill";
import DeploymentsMapping from "./DeploymentsMapping";
import { 
  FolderKanban, 
  Plus, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Trash2, 
  Send, 
  Upload, 
  MessageCircle, 
  CheckSquare, 
  RefreshCcw,
  Wallet, 
  Building2,
  Edit2, 
  X,
  Save,
  Calendar
} from "lucide-react";

const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
const rawUrl = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

export default function CapExProposals() {
  const { user } = useAuth();
  const { activeCycle, planningYears } = useCycle();
  const location = useLocation();
  
  const [proposals, setProposals] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Budget Headroom State
  const [headroom, setHeadroom] = useState(null);
  const [warning, setWarning] = useState(null);
  
  // Creation Form State
  const [itemSelect, setItemSelect] = useState("");
  const [customSpec, setCustomSpec] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [yearlyQuantities, setYearlyQuantities] = useState({});
  const [targetOffices, setTargetOffices] = useState("");
  const [isExpansion, setIsExpansion] = useState(false);
  const [officesRegistry, setOfficesRegistry] = useState([]);
  
  // Unified Creation File Upload State (for unlisted/custom requests)
  const [supplierName, setSupplierName] = useState("");
  const [canvasFile, setCanvasFile] = useState(null);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [canvasExpirationDate, setCanvasExpirationDate] = useState("");
  
  // Secondary post-creation upload state (standard replacement uploads)
  const [uploadProposalId, setUploadProposalId] = useState(null);
  const [standaloneSupplier, setStandaloneSupplier] = useState("");
  const [standaloneFile, setStandaloneFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Comments Modal State
  const [activeCommentsProposal, setActiveCommentsProposal] = useState(null);
  const [comments, setComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [requiresAction, setRequiresAction] = useState(false);

  // Row Expansion State for Table IV.A Mapping Integration
  const [expandedProposalId, setExpandedProposalId] = useState(null);

  // Deep-linking Highlight State
  const [highlightedId, setHighlightedId] = useState(null);

  // --- NEW EDIT STATE VARIABLES ---
  const [editingProposal, setEditingProposal] = useState(null);
  const [editItemSelect, setEditItemSelect] = useState("");
  const [editCustomSpec, setEditCustomSpec] = useState("");
  const [editUnitCost, setEditUnitCost] = useState("");
  const [editYearlyQuantities, setEditYearlyQuantities] = useState({});
  const [editTargetOffices, setEditTargetOffices] = useState("");
  const [editIsExpansion, setEditIsExpansion] = useState(false);
  const [editCanvasExpirationDate, setEditCanvasExpirationDate] = useState("");
  const [updatingProposal, setUpdatingProposal] = useState(false);

  useEffect(() => {
    if (planningYears && planningYears.length > 0) {
      const initial = {};
      planningYears.forEach(year => {
        initial[String(year)] = 0;
      });
      setYearlyQuantities(initial);
    }
  }, [planningYears]);

  // Fetch Budget Headroom Summary
  const fetchHeadroomData = async () => {
    try {
      const res = await fetch(`${rawUrl}/api/dept/budget-summary`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHeadroom(data);
      }
    } catch (err) {
      console.error("Failed to query budget headroom summary:", err);
    }
  };

  // Fetch the office directory inside useEffect
  useEffect(() => {
    const fetchOffices = async () => {
      try {
        const res = await fetch(`${rawUrl}/api/dept/offices-list`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (res.ok) {
          setOfficesRegistry(await res.json());
        }
      } catch (e) {
        console.error("Failed to load authorized offices:", e);
      }
    };
    if (user?.token) {
      fetchOffices();
    }
  }, [user]);

 const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [proposalsData, catalogData] = await Promise.all([
        // Pass "", 0, 500 to expand the list limit parameter on the server
        getProposals(activeCycle, "", 0, 500),
        getDeptCatalog()
      ]);
      setProposals(proposalsData);
      setCatalog(catalogData);
      if (catalogData.length > 0) {
        setItemSelect(catalogData[0].item_key);
        setUnitCost(String(catalogData[0].standard_unit_cost));
      } else {
        setItemSelect("other");
      }
      await fetchHeadroomData();
    } catch (err) {
      setError(err.message || "Failed to sync planning queue data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchData();
    }
  }, [user, activeCycle]);

  // Handle auto-focus and scrolling glow effects from deep-links
  useEffect(() => {
    if (location.state?.highlightId && proposals.length > 0) {
      const targetId = location.state.highlightId;
      setHighlightedId(targetId);
      setExpandedProposalId(targetId);

      const timer = setTimeout(() => {
        const el = document.getElementById(`proposal-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          
          setTimeout(() => {
            setHighlightedId(null);
          }, 4000);
        }
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [location.state, proposals]);

  // Budget Headroom Live Warning Calculation
  useEffect(() => {
    if (!headroom) return;
    
    const currentUnitCost = parseFloat(unitCost) || 0.0;
    const currentTotalQty = Object.values(yearlyQuantities).reduce((a, b) => a + b, 0);
    const projectedTotalCost = currentUnitCost * currentTotalQty;

    const remaining = headroom.remaining_capex_headroom ?? headroom.remaining_headroom ?? 0.0;
    if (projectedTotalCost > remaining) {
      setWarning(
        `Budget Warning: This proposal will cost ₱${projectedTotalCost.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}, which exceeds your remaining department headroom of ₱${remaining.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}.`
      );
    } else {
      setWarning(null);
    }
  }, [unitCost, yearlyQuantities, headroom]);

  // Active Polling for Glacier Restore Progress
  useEffect(() => {
    const activeRestorations = proposals.filter(p => p.is_restoring);
    if (activeRestorations.length === 0) return;

    const intervals = activeRestorations.map(p => {
      const intervalId = setInterval(async () => {
        try {
          const res = await fetch(`${rawUrl}/api/dept/proposals/${p.id}/sync-metadata`, {
            method: "POST",
            headers: { Authorization: `Bearer ${user.token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.is_restoring) {
              clearInterval(intervalId);
              fetchData();
            } else {
              setProposals(prev => 
                prev.map(item => item.id === p.id ? { ...item, restore_progress: data.restore_progress } : item)
              );
            }
          }
        } catch (pollErr) {
          console.error("Error polling Glacier restoration status:", pollErr);
        }
      }, 10000);

      return { id: p.id, intervalId };
    });

    return () => {
      intervals.forEach(x => clearInterval(x.intervalId));
    };
  }, [proposals.filter(p => p.is_restoring).length]);

  useEffect(() => {
    if (itemSelect && itemSelect !== "other") {
      const selected = catalog.find(item => item.item_key === itemSelect);
      if (selected) {
        setUnitCost(String(selected.standard_unit_cost));
        setCustomSpec("");
      }
    } else if (itemSelect === "other") {
      setUnitCost("");
    }
  }, [itemSelect, catalog]);

  const handleCreateProposal = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (itemSelect === "other") {
      if (!canvasFile || !supplierName.trim() || !canvasExpirationDate) {
        setError("Compliance Violation: Posing a custom unlisted item requires a supplier name, a canvas quotation document, and a validity expiration date.");
        return;
      }
    }
    
    setCreatingProposal(true);
    const parsedOffices = targetOffices ? [targetOffices] : [];
    const expirationPayload = canvasExpirationDate ? new Date(canvasExpirationDate).toISOString() : null;
      
    const payload = {
      item_select: itemSelect,
      custom_specification: itemSelect === "other" ? customSpec : null,
      yearly_quantities: yearlyQuantities,
      unit_cost: parseFloat(unitCost) || 0.0,
      target_offices_json: parsedOffices,
      is_expansion: isExpansion,
      canvas_evidence_url: null,
      canvas_expiration_date: expirationPayload
    };

    try {
      const res = await createDraftProposal(payload);
      const proposalId = res.proposal_id;

      if (itemSelect === "other" && canvasFile) {
        await uploadCanvas(proposalId, supplierName.trim(), canvasFile);
      }

      setSuccess("Proposal draft created and canvas quotation linked successfully.");
      setCustomSpec("");
      setTargetOffices("");
      setIsExpansion(false);
      setSupplierName("");
      setCanvasFile(null);
      setCanvasExpirationDate("");
      
      const fileInput = document.getElementById("inline-canvas-input");
      if (fileInput) fileInput.value = "";

      if (planningYears && planningYears.length > 0) {
        const resetQty = {};
        planningYears.forEach(year => { resetQty[String(year)] = 0; });
        setYearlyQuantities(resetQty);
      }
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to create draft proposal.");
    } finally {
      setCreatingProposal(false);
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
      await uploadCanvas(uploadProposalId, standaloneSupplier, standaloneFile);
      setSuccess("Canvas evidence document successfully uploaded.");
      setUploadProposalId(null);
      setStandaloneSupplier("");
      setStandaloneFile(null);
      
      const fileInput = document.getElementById("canvas-evidence-input");
      if (fileInput) fileInput.value = "";

      fetchData();
    } catch (err) {
      setError(err.message || "Upload operation failed.");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this proposal draft?")) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteProposal(id);
      setSuccess("Proposal draft successfully deleted.");
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to remove proposal.");
    }
  };

  const handleSubmit = async (id) => {
    setError(null);
    setSuccess(null);
    try {
      await submitProposal(id);
      setSuccess("Proposal successfully transited to SUBMITTED status.");
      fetchData();
    } catch (err) {
      setError(err.message || "Submission process failed.");
    }
  };

  const handleMetadataSync = async (id) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await syncProposalMetadata(id);
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
      await requestProposalRestore(id);
      setSuccess("AWS S3 Glacier cold-retrieval restoration initiated. Standard restore completes in 3-5 hours.");
      fetchData();
    } catch (err) {
      setError(err.message || "Cold retrieval initialization failed.");
    }
  };

  const openComments = async (proposal) => {
    setActiveCommentsProposal(proposal);
    setNewCommentText("");
    setRequiresAction(false);
    try {
      const data = await getComments(proposal.id);
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

  // --- NEW EDIT DIALOG HANDLERS ---
  const openEditModal = (p) => {
    setError(null);
    setSuccess(null);
    setEditingProposal(p);
    setEditItemSelect(p.item_key || "other");
    setEditCustomSpec(p.custom_specification || "");
    setEditUnitCost(String(p.unit_cost));
    setEditIsExpansion(p.is_expansion || false);
    setEditTargetOffices(p.target_offices_json && p.target_offices_json.length > 0 ? p.target_offices_json[0] : "");
    setEditCanvasExpirationDate(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
    
    const prefill = {};
    planningYears.forEach(year => {
      prefill[String(year)] = p.yearly_quantities?.[String(year)] || 0;
    });
    setEditYearlyQuantities(prefill);
  };

  useEffect(() => {
    if (editItemSelect && editItemSelect !== "other") {
      const selected = catalog.find(item => item.item_key === editItemSelect);
      if (selected) {
        setEditUnitCost(String(selected.standard_unit_cost));
        setEditCustomSpec("");
      }
    }
  }, [editItemSelect, catalog]);

  const handleUpdateProposal = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setUpdatingProposal(true);

    const parsedOffices = editTargetOffices ? [editTargetOffices] : [];
    const expirationPayload = editCanvasExpirationDate ? new Date(editCanvasExpirationDate).toISOString() : null;

    const payload = {
      item_select: editItemSelect,
      custom_specification: editItemSelect === "other" ? editCustomSpec : null,
      yearly_quantities: editYearlyQuantities,
      unit_cost: parseFloat(editUnitCost) || 0.0,
      target_offices_json: parsedOffices,
      is_expansion: editIsExpansion,
      canvas_expiration_date: expirationPayload
    };

    try {
      await updateProposal(editingProposal.id, payload);
      setSuccess("Proposal draft updated successfully.");
      setEditingProposal(null);
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to update proposal.");
    } finally {
      setUpdatingProposal(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto select-none">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-blue-500" />
            <span>Capital Outlay (CapEx) Hardware Proposals</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Log and manage your department's multi-year hardware requirements under the active compliance sub-ceiling limits.
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
        <div className="p-4 bg-red-955/40 border border-red-900 text-red-300 rounded-lg flex items-start gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-955/40 border border-emerald-900 text-emerald-300 rounded-lg flex items-start gap-2.5 text-xs">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Creation Form Sidebar */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4">
          <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-500" />
            <span>Create CapEx Request</span>
          </h3>

          {/* Budget Headroom Stats Tracker Dashboard Block */}
          {headroom && (
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px]">
              <div className="flex items-center gap-1 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span>CapEx Allotment Tracker</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[9px]">Allocated CapEx</span>
                  <span className="font-mono font-bold text-slate-100">
                    ₱{(headroom.allocated_capex ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px]">Remaining Balance</span>
                  <span className="font-mono font-bold text-emerald-400">
                    ₱{(headroom.remaining_capex_headroom ?? headroom.remaining_headroom ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateProposal} className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Standard Catalog Product
              </label>
              <select
                value={itemSelect}
                onChange={(e) => setItemSelect(e.target.value)}
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer font-sans"
              >
                {catalog.map(item => (
                  <option key={item.item_key} value={item.item_key} className="bg-slate-900 text-slate-100">
                    {item.display_name} (₱{Number(item.standard_unit_cost).toLocaleString()})
                  </option>
                ))}
                <option value="other" className="bg-slate-900 text-slate-100">-- Custom / Unlisted Equipment (Other) --</option>
              </select>
            </div>

            {itemSelect === "other" && (
              <div className="space-y-4 p-3.5 bg-slate-955 border border-slate-850 rounded-lg animate-fadeIn">
                <span className="block text-[9px] uppercase font-extrabold text-blue-400 tracking-wider">
                  Mandatory Market Canvas Verification
                </span>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Detailed Specifications
                  </label>
                  <input
                    type="text"
                    required
                    value={customSpec}
                    onChange={(e) => setCustomSpec(e.target.value)}
                    placeholder="Brand, RAM, Storage, CPU specs"
                    className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. Dell Philippines"
                    className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Quotation Canvas Document (PDF Only)
                  </label>
                  <input
                    id="inline-canvas-input"
                    type="file"
                    required
                    accept="application/pdf"
                    onChange={(e) => setCanvasFile(e.target.files[0])}
                    className="w-full text-slate-300 text-xs"
                  />
                </div>
                {/* NEW CAPEX EXPIRATION DATE INPUT */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>Canvas Expiration Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={canvasExpirationDate}
                    onChange={(e) => setCanvasExpirationDate(e.target.value)}
                    className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Unit Cost (PHP)
              </label>
              <input
                type="number"
                disabled={itemSelect !== "other"}
                required
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all disabled:opacity-50 font-mono"
              />
            </div>

            <div className="space-y-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                Multi-Year Quantity Targets
              </span>
              {planningYears.map(year => (
                <div key={year} className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-300 font-mono">FY {year}</span>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    required
                    value={yearlyQuantities[String(year)] || 0}
                    onChange={(e) => setYearlyQuantities({
                      ...yearlyQuantities,
                      [String(year)]: parseInt(e.target.value, 10) || 0
                    })}
                    className="w-24 p-1.5 bg-slate-900 border border-slate-800 rounded text-center text-white font-mono"
                  />
                </div>
              ))}
            </div>

            {/* Expansion Checkbox */}
            <div className="flex items-center gap-2 p-3 bg-slate-955/50 rounded-lg border border-slate-850">
              <input
                type="checkbox"
                id="is_expansion"
                checked={isExpansion}
                onChange={(e) => setIsExpansion(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
              <label htmlFor="is_expansion" className="text-[10px] font-bold text-slate-300 uppercase tracking-wider cursor-pointer select-none">
                Is this an expansion project?
              </label>
            </div>

            {/* Target Deployments Registry Selector Dropdown */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                Target Deployment Office / Room {isExpansion && <span className="text-red-500">*</span>}
              </label>
              <select
                value={targetOffices}
                onChange={(e) => setTargetOffices(e.target.value)}
                className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
                required={isExpansion}
              >
                <option value="">-- Select Deployment Location --</option>
                {officesRegistry.map((off) => (
                  <option key={off.id} value={off.office_name}>
                    {off.office_name} ({off.division})
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Room Over Budget Headroom Warnings */}
            {warning && (
              <div className="p-3 bg-red-955/20 border border-red-900 text-red-400 font-bold rounded animate-pulse leading-normal">
                {warning}
              </div>
            )}

            <button
              type="submit"
              disabled={creatingProposal || !!warning}
              className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>{creatingProposal ? "Uploading & Creating..." : "Log Proposal Draft"}</span>
            </button>
          </form>
        </div>

        {/* Proposals List */}
        <div className="lg:col-span-2 space-y-6">
          {uploadProposalId && (
            <div className="bg-slate-900 p-5 rounded-xl border border-blue-900/50 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h4 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-blue-400" />
                  <span>Upload Canvas Quotation Evidence</span>
                </h4>
                <button 
                  onClick={() => setUploadProposalId(null)}
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
                    placeholder="e.g. PC Express"
                    className="w-full p-2 bg-slate-955 border border-slate-800 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Canvas PDF Document</label>
                  <input
                    id="canvas-evidence-input"
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
              Department Proposals Registry
            </h3>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="text-xs">Loading active queue...</span>
                </div>
              ) : proposals.length > 0 ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                      <th className="py-3 px-2">Proposed Item</th>
                      <th className="py-3 px-2">Multi-Year Quantities</th>
                      <th className="py-3 px-2">Unit Cost</th>
                      <th className="py-3 px-2">Quotation</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-855">
                    {proposals.map(p => {
                      const isCustom = p.item_key === "other";
                      const filename = p.canvas_evidence_url ? p.canvas_evidence_url.split("/").pop() : null;
                      
                      const isHighlighted = p.id === highlightedId;
                      const rowClass = `transition-all duration-700 ${
                        isHighlighted 
                          ? "bg-blue-955/45 border-l-4 border-l-blue-500 ring-2 ring-blue-500/30 animate-pulse" 
                          : "hover:bg-slate-955/20"
                      }`;

                      return (
                        <React.Fragment key={p.id}>
                          <tr id={`proposal-${p.id}`} className={rowClass}>
                            <td className="py-3.5 px-2">
                              <div className="font-semibold text-slate-200">{p.item_name}</div>
                              {isCustom ? (
                                <div className="text-[10px] text-amber-500 mt-0.5">Custom: {p.custom_specification}</div>
                              ) : (
                                <div className="text-[10px] text-slate-500 mt-0.5">Standard Spec</div>
                              )}
                              {p.is_expansion && (
                                <span className="text-[9px] px-1.5 py-0.2 mt-1 inline-block bg-blue-955/40 border border-blue-900 text-blue-400 font-bold uppercase tracking-wider rounded">
                                  Expansion
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-2">
                              <div className="font-semibold text-slate-300">Total: {p.total_qty} units</div>
                              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                {planningYears.map(y => y + ": " + (p.yearly_quantities?.[String(y)] || 0)).join(" | ")}
                              </div>
                            </td>
                            <td className="py-3.5 px-2 font-mono text-slate-200">
                              ₱{parseFloat(p.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-2">
                              {p.canvas_evidence_url ? (
                                <div className="flex flex-col gap-1 items-start">
                                  <a 
                                    href={p.canvas_evidence_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-blue-400 underline font-semibold truncate max-w-[120px]"
                                  >
                                    {filename}
                                  </a>
                                  {p.canvas_expiration_date ? (
                                    <span className="text-[9px] text-amber-500 font-mono font-semibold flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      <span>Expires: {new Date(p.canvas_expiration_date).toLocaleDateString()}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-500 italic">No Expiry Set</span>
                                  )}
                                  {p.s3_storage_class === "GLACIER" ? (
                                    p.is_restoring ? (
                                      <div className="space-y-1 w-full max-w-[120px] pt-1">
                                        <div className="flex justify-between text-[8px] font-mono text-amber-400 font-semibold">
                                          <span>RESTORING</span>
                                          <span>{p.restore_progress || 50}%</span>
                                        </div>
                                        <div className="w-full bg-slate-955 h-1 rounded-full overflow-hidden border border-slate-850">
                                          <div 
                                            className="h-full bg-amber-500 rounded-full transition-all duration-500 animate-pulse" 
                                            style={{ width: `${p.restore_progress || 50}%` }} 
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <button 
                                        onClick={() => handleGlacierRestore(p.id)}
                                        className="text-[9px] text-amber-400 hover:text-amber-300 underline font-semibold cursor-pointer"
                                      >
                                        S3 Glacier Restore
                                      </button>
                                    )
                                  ) : (
                                    <button 
                                      onClick={() => handleMetadataSync(p.id)}
                                      title="Sync metadata class"
                                      className="text-[9px] text-slate-500 hover:text-slate-400 flex items-center gap-0.5 cursor-pointer font-sans"
                                    >
                                      <RefreshCcw className="w-2.5 h-2.5" />
                                      <span>Sync</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setUploadProposalId(p.id)}
                                  className="text-blue-400 underline font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Upload className="w-3 h-3" />
                                  <span>Upload Canvas</span>
                                </button>
                              )}
                            </td>
                            <td className="py-3.5 px-2">
                              <StatusPill status={p.status} />
                            </td>
                            <td className="py-3.5 px-2 text-right">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setExpandedProposalId(expandedProposalId === p.id ? null : p.id)}
                                  className={`p-1 transition-colors cursor-pointer ${
                                    expandedProposalId === p.id ? "text-blue-400" : "text-slate-400 hover:text-blue-400"
                                  }`}
                                  title="Configure Deployments (Table IV.A)"
                                >
                                  <Building2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openComments(p)}
                                  className="p-1 text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
                                  title="Comments thread"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                                
                                {p.status === "Draft" || p.status === "Returned" ? (
                                  <>
                                    <button
                                      onClick={() => openEditModal(p)}
                                      className="p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                                      title="Edit Draft Parameters"
                                    >
                                      
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleSubmit(p.id)}
                                      className="p-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                      title="Submit Proposal"
                                    >
                                      <Send className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(p.id)}
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
                          
                          {/* Table IV.A Deployments Mapping Sub-Drawer (Gap 13) */}
                          {expandedProposalId === p.id && (
                            <tr className="bg-slate-955/30">
                              <td colSpan="6" className="p-4 border-t border-b border-slate-800/80">
                                <DeploymentsMapping 
                                  proposalId={p.id} 
                                  proposalName={p.item_name} 
                                  proposalTotalQty={p.total_qty} 
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-16 text-slate-500">
                  No active hardware proposals logged. Create a draft using the panel on the left.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- NEW EDIT PROPOSAL MODAL DIALOG --- */}
      {editingProposal && (
        <div className="fixed inset-0 bg-slate-955/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Edit Proposal Draft</h3>
              <button 
                onClick={() => setEditingProposal(null)}
                className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateProposal} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Catalog Item</label>
                <select
                  value={editItemSelect}
                  onChange={(e) => setEditItemSelect(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 cursor-pointer"
                >
                  {catalog.map(item => (
                    <option key={item.item_key} value={item.item_key}>
                      {item.display_name}
                    </option>
                  ))}
                  <option value="other">-- Custom / Unlisted (Other) --</option>
                </select>
              </div>

              {editItemSelect === "other" && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Specifications</label>
                  <input
                    type="text" required value={editCustomSpec}
                    onChange={(e) => setEditCustomSpec(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Unit Cost (PHP)</label>
                <input
                  type="number" step="0.01" required
                  disabled={editItemSelect !== "other"}
                  value={editUnitCost}
                  onChange={(e) => setEditUnitCost(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>

              <div className="space-y-2 p-3 bg-slate-950 rounded-lg border border-slate-850">
                <span className="block text-[9px] uppercase font-bold text-slate-500">Yearly Quantities</span>
                {planningYears.map(year => (
                  <div key={year} className="flex justify-between items-center">
                    <span className="font-semibold text-slate-400">FY {year}</span>
                    <input
                      type="number" min="0" required
                      value={editYearlyQuantities[String(year)] || 0}
                      onChange={(e) => setEditYearlyQuantities({
                        ...editYearlyQuantities,
                        [String(year)]: parseInt(e.target.value, 10) || 0
                      })}
                      className="w-20 p-1.5 bg-slate-900 border border-slate-800 text-center rounded text-white font-mono"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-955/50 border border-slate-850 rounded-lg">
                <input
                  type="checkbox" id="edit_is_expansion" checked={editIsExpansion}
                  onChange={(e) => setEditIsExpansion(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
                <label htmlFor="edit_is_expansion" className="text-[10px] font-bold text-slate-300 uppercase tracking-wider cursor-pointer">
                  Is this an expansion project?
                </label>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Deployment Location</label>
                <select
                  value={editTargetOffices}
                  onChange={(e) => setEditTargetOffices(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-slate-100 cursor-pointer"
                  required={editIsExpansion}
                >
                  <option value="">-- Select Deployment Location --</option>
                  {officesRegistry.map((off) => (
                    <option key={off.id} value={off.office_name}>
                      {off.office_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* NEW EDIT-MODAL HARDWARE CANVAS EXPIRATION FIELD */}
              <div className="space-y-1.5 pt-1.5">
                <label className="block text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span>Canvas Validity Expiration Date</span>
                </label>
                <input
                  type="date"
                  required={editItemSelect === "other"}
                  value={editCanvasExpirationDate}
                  onChange={(e) => setEditCanvasExpirationDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-xs outline-none"
                />
              </div>

              <button
                type="submit" disabled={updatingProposal}
                className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{updatingProposal ? "Updating Draft..." : "Save Modifications"}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {activeCommentsProposal && (
        <div className="fixed inset-0 bg-slate-955/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl flex flex-col h-[500px] animate-fadeIn">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-955/50 rounded-t-xl">
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
                  <div key={comment.id} className="p-3 bg-slate-950 border border-slate-850 rounded-lg space-y-1.5">
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