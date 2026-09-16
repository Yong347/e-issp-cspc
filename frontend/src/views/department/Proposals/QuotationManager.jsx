// frontend/src/views/department/Proposals/QuotationManager.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { uploadCanvas, getProposals, getSubscriptions } from "../../../api/dept";
import { 
  UploadCloud, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Calendar, 
  Clock, 
  ExternalLink, 
  Sparkles, 
  Search, 
  FileText,
  ShieldCheck,
  Layers,
  FileCheck2,
  X,
  Tag,
  Info,
  ChevronRight
} from "lucide-react";

export default function QuotationManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  // Data lists
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form input states
  const [selectedId, setSelectedId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [canvasExpiry, setCanvasExpiry] = useState("");
  const [file, setFile] = useState(null);
  
  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // "all", "missing", "attached", "expired", "in_house"
  
  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const formatPHP = (val) => {
    const num = parseFloat(val) || 0;
    return "₱" + num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isExpired = (dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && d < new Date();
  };

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pData, sData] = await Promise.all([
        getProposals(activeCycle, "", 0, 1000).catch(() => []),
        getSubscriptions(activeCycle).catch(() => [])
      ]);

      // Deduplicate items between proposals and subscriptions
      const itemMap = new Map();
      (Array.isArray(pData) ? pData : []).forEach(item => itemMap.set(item.id, item));
      (Array.isArray(sData) ? sData : []).forEach(item => itemMap.set(item.id, item));
      const combined = Array.from(itemMap.values());

      // Only Draft and Returned items can receive updated quotations
      const editableItems = combined.filter(item => item.status === "Draft" || item.status === "Returned");
      setAllItems(editableItems);
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

  // Selected proposal context
  const selectedProposal = allItems.find(p => p.id === selectedId);
  const isInHouseAsset = Boolean(selectedProposal?.created_by_students || selectedProposal?.is_in_house_turnover);

  // Group items by category for the select dropdown
  const hardwareItems = allItems.filter(p => p.category === "Hardware" || p.category === "hardware");
  const softwareSubItems = allItems.filter(p => p.category === "Subscription" || p.category === "Software" || p.category === "subscription" || p.category === "software");
  const otherItems = allItems.filter(p => !hardwareItems.includes(p) && !softwareSubItems.includes(p));

  // Auto-fill form details when a proposal is selected
  const handleSelectProposal = (id) => {
    setSelectedId(id);
    const p = allItems.find(item => item.id === id);
    if (p) {
      setSupplierName(p.payload?.supplier_name || p.supplier_name || "");
      setCanvasExpiry(p.canvas_expiration_date ? p.canvas_expiration_date.split("T")[0] : "");
    } else {
      setSupplierName("");
      setCanvasExpiry("");
    }
    setError(null);
    setSuccess(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedId) {
      setError("Please select a target proposal from the list.");
      return;
    }
    if (!supplierName.trim()) {
      setError(isInHouseAsset 
        ? "Please identify the development team, donating unit, or provider." 
        : "Please enter the official bidding supplier or vendor name.");
      return;
    }
    if (!file) {
      setError("Please attach a quotation canvas or turnover deed PDF document.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      let expiryIso = null;
      if (canvasExpiry) {
        const d = new Date(canvasExpiry);
        if (!isNaN(d.getTime())) {
          expiryIso = d.toISOString();
        }
      }

      await uploadCanvas(selectedId, supplierName.trim(), file, expiryIso);
      
      setSuccess(`Quotation / turnover document linked to '${selectedProposal?.item_name || "proposal"}' successfully.`);
      setSelectedId("");
      setSupplierName("");
      setCanvasExpiry("");
      setFile(null);
      
      const fileInput = document.getElementById("canvas-file-input");
      if (fileInput) fileInput.value = "";

      fetchItems();
    } catch (err) {
      setError(err.message || "Failed to upload quotation canvas.");
    } finally {
      setSubmitting(false);
    }
  };

  // KPI Metrics Calculations
  const totalEditable = allItems.length;
  const attachedCount = allItems.filter(i => Boolean(i.canvas_evidence_url) && !isExpired(i.canvas_expiration_date)).length;
  const expiredCount = allItems.filter(i => Boolean(i.canvas_evidence_url) && isExpired(i.canvas_expiration_date)).length;
  const missingCount = allItems.filter(i => !i.created_by_students && !i.canvas_evidence_url).length;
  const inHouseCount = allItems.filter(i => Boolean(i.created_by_students || i.is_in_house_turnover)).length;

  // Filtered list pipeline
  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      const hasCanvas = Boolean(item.canvas_evidence_url);
      const expired = isExpired(item.canvas_expiration_date);
      const isInHouse = Boolean(item.created_by_students || item.is_in_house_turnover);

      if (filterType === "missing") {
        if (isInHouse || hasCanvas) return false;
      } else if (filterType === "attached") {
        if (!hasCanvas || expired) return false;
      } else if (filterType === "expired") {
        if (!hasCanvas || !expired) return false;
      } else if (filterType === "in_house") {
        if (!isInHouse) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const name = (item.item_name || "").toLowerCase();
        const supplier = (item.payload?.supplier_name || item.supplier_name || "").toLowerCase();
        if (!name.includes(q) && !supplier.includes(q)) return false;
      }

      return true;
    });
  }, [allItems, filterType, searchTerm]);

  return (
    <div className="space-y-6 text-xs max-w-7xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 shadow-sm font-sans select-none transition-colors duration-200">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50 dark:bg-slate-955 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Canvas & Quotation Proof Manager</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Upload market quotation proofs, monitor validity expiration guards (Rule 7), and attach optional turnover deeds / project documentation for in-house developed software (Rule 1).
          </p>
        </div>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="p-2.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors self-start font-bold shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Proposals</span>
        </button>
      </div>

      {/* Aggregate KPI Indicators Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Pending Quotations</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{totalEditable} Proposals</h3>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Proofs Attached</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{attachedCount} Verified</h3>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-rose-100 dark:bg-red-955/40 text-rose-600 dark:text-red-400 rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Missing or Expired</span>
            <h3 className="text-base font-bold text-rose-600 dark:text-red-400 font-mono mt-0.5">{missingCount + expiredCount} Items</h3>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">In-House / Turnover</span>
            <h3 className="text-base font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5">{inHouseCount} Bypassed</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-red-955/40 border border-rose-200 dark:border-red-900 text-rose-700 dark:text-red-300 rounded-lg flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg flex items-start gap-2.5 animate-fadeIn">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Upload Form */}
        <div className="bg-slate-50 dark:bg-slate-955 p-6 rounded-xl border border-slate-200 dark:border-slate-800 h-fit space-y-4 shadow-xs">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Attach Quotation Proof</span>
            </h3>
            {selectedId && (
              <button
                type="button"
                onClick={() => handleSelectProposal("")}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            {/* Target Proposal Selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                Target Proposal (Draft / Returned)
              </label>
              <select
                value={selectedId}
                onChange={(e) => handleSelectProposal(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 outline-none cursor-pointer text-xs focus:border-blue-500"
                required
              >
                <option value="">-- Select Pending Proposal --</option>
                {hardwareItems.length > 0 && (
                  <optgroup label="Hardware Proposals (CapEx / Semi-Expendable)" className="font-bold text-slate-500">
                    {hardwareItems.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.created_by_students ? "[In-House / Non-Commercial] " : ""}
                        {p.item_name} ({formatPHP(p.unit_cost)})
                      </option>
                    ))}
                  </optgroup>
                )}
                {softwareSubItems.length > 0 && (
                  <optgroup label="Software & Subscriptions (MOOE / Perpetual)" className="font-bold text-slate-500">
                    {softwareSubItems.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.created_by_students ? "[In-House / Non-Commercial] " : ""}
                        {s.item_name} ({formatPHP(s.unit_cost)})
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherItems.length > 0 && (
                  <optgroup label="Other Proposals / Services" className="font-bold text-slate-500">
                    {otherItems.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.created_by_students ? "[In-House / Non-Commercial] " : ""}
                        {o.item_name} ({formatPHP(o.unit_cost)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* In-House / Non-Commercial Development Informational Note */}
            {isInHouseAsset && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-800/60 rounded-lg space-y-1 text-[10.5px] leading-relaxed animate-fadeIn">
                <span className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>In-House / Non-Commercial Development (Rule 1)</span>
                </span>
                <p className="text-slate-600 dark:text-slate-300">
                  A commercial market quotation is <strong>not mandatory</strong> for in-house developed assets, internal open-source contributions, or inter-agency turnovers. You may optionally attach project acceptance documentation, a turnover deed, or a bill of materials.
                </p>
              </div>
            )}

            {/* Supplier / Provider Name (Agency-Agnostic Generic Placeholders) */}
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                {isInHouseAsset 
                  ? "Development Team / Project Unit / Provider Name" 
                  : "Bidding Supplier Name"}
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder={isInHouseAsset ? "e.g. In-House ICT Development Unit / Partner Agency Turnover" : "e.g. Authorized Equipment Supplier / IT Solutions Provider"}
                className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white outline-none focus:border-blue-500 text-xs"
              />
            </div>

            {/* Quotation Expiration Date */}
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>Quotation Expiration Date</span>
                </span>
                <span className="text-[9px] text-slate-400 font-normal">
                  {isInHouseAsset ? "Optional" : "Recommended (Rule 7)"}
                </span>
              </label>
              <input
                type="date"
                value={canvasExpiry}
                onChange={(e) => setCanvasExpiry(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 text-xs cursor-pointer"
              />
            </div>

            {/* PDF File Input */}
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 tracking-wider">
                {isInHouseAsset 
                  ? "Turnover Deed / Project Acceptance / Supporting Proof (PDF)" 
                  : "Quotation Canvas Document (PDF)"}
              </label>
              <input
                id="canvas-file-input"
                type="file"
                required
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full text-slate-600 dark:text-slate-400 text-xs file:mr-3 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white file:cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedId}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm text-xs"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{submitting ? "Uploading Document..." : "Link Canvas Document"}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Linked Records List */}
        <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-955 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wider">
              Department Proposals Canvas Status
            </h3>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-44">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="p-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded text-[11px] text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
              >
                <option value="all">All Proposals ({allItems.length})</option>
                <option value="missing">Missing Canvas ({missingCount})</option>
                <option value="expired">Expired Canvas ({expiredCount})</option>
                <option value="attached">Verified Attached ({attachedCount})</option>
                <option value="in_house">In-House / Non-Commercial ({inHouseCount})</option>
              </select>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Reading quotation links...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 text-slate-400 italic">
                No proposals match your current filter parameters.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[10px] uppercase font-bold bg-white/50 dark:bg-slate-900/50">
                    <th className="py-2.5 px-3 w-[35%]">Proposal Item</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Quotation Expiry</th>
                    <th className="py-2.5 px-3 text-center">Document Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                  {filteredItems.map(item => {
                    const hasCanvas = Boolean(item.canvas_evidence_url);
                    const expired = isExpired(item.canvas_expiration_date);
                    const filename = hasCanvas ? item.canvas_evidence_url.split("/").pop() : null;
                    const isInHouse = Boolean(item.created_by_students || item.is_in_house_turnover);
                    const isSelected = selectedId === item.id;

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${
                          isSelected 
                            ? "bg-blue-50/80 dark:bg-blue-955/40 border-l-2 border-l-blue-600" 
                            : "hover:bg-white/70 dark:hover:bg-slate-900/50"
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5">
                            <span>{item.item_name}</span>
                            {isInHouse && (
                              <span className="text-[8px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400 font-bold uppercase tracking-wider">
                                In-House / Non-Commercial
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {formatPHP(item.unit_cost)} &bull; {item.total_qty || 1} units &bull; Total: {formatPHP((item.unit_cost || 0) * (item.total_qty || 1))}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className={`inline-block px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase border ${
                            item.expenditure_class === "Capital Outlay"
                              ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                              : "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-900"
                          }`}>
                            {item.expenditure_class === "Capital Outlay" ? "CapEx" : "MOOE"}
                          </span>
                        </td>

                        {/* Expiration Date Display */}
                        <td className="py-3 px-3 font-mono text-[10.5px]">
                          {item.canvas_expiration_date ? (
                            <div className="space-y-0.5">
                              <span className={`flex items-center gap-1 font-bold ${expired ? "text-rose-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
                                <Clock className="w-3 h-3" />
                                <span>{new Date(item.canvas_expiration_date).toLocaleDateString()}</span>
                              </span>
                              {expired && (
                                <span className="text-[8px] px-1.5 py-0.2 rounded bg-rose-100 dark:bg-red-955 text-rose-700 dark:text-red-400 font-bold uppercase inline-block">
                                  Expired (Rule 7)
                                </span>
                              )}
                            </div>
                          ) : isInHouse ? (
                            <span className="text-slate-400 italic text-[10px]">Turnover Deed</span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">No Date Stamped</span>
                          )}
                        </td>

                        {/* Reference Attachment State */}
                        <td className="py-3 px-3 text-center">
                          {hasCanvas ? (
                            <div className="space-y-1 inline-block text-center">
                              <a 
                                href={item.canvas_evidence_url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold text-[11px]"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span className="max-w-[120px] truncate">{filename}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                              {isInHouse && (
                                <span className="block text-[8px] font-bold text-emerald-600 dark:text-emerald-400 uppercase font-mono">
                                  Supporting Proof Attached
                                </span>
                              )}
                            </div>
                          ) : isInHouse ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 font-bold text-[9px] uppercase tracking-wider font-mono">
                              <Sparkles className="w-2.5 h-2.5" /> Canvas Bypassed (Rule 1)
                            </span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-bold italic text-[10px] inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>Required canvas missing</span>
                            </span>
                          )}
                        </td>

                        {/* Fast Select Action Trigger */}
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleSelectProposal(item.id)}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : hasCanvas && !expired
                                ? "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                                : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 hover:bg-blue-600 hover:text-white"
                            }`}
                          >
                            {isSelected ? "Selected" : hasCanvas ? "Update" : "Attach"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}