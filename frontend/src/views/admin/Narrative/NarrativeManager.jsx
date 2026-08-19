// frontend/src/views/admin/Narrative/NarrativeManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  FileText, Save, RefreshCw, CheckCircle, AlertCircle, 
  CalendarRange, Landmark, ShieldAlert, Settings2, FileSignature, Trash2,
  ChevronDown, ChevronRight, Layers, FolderPlus, ArrowUp, ArrowDown, UploadCloud
} from "lucide-react";

export default function NarrativeManager() {
  const { user } = useAuth();
  const { activeCycle, fetchActiveCycle } = useCycle();

  const [activeTab, setActiveTab] = useState("cycle"); 
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Dynamic Cycle Configuration State
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");

  // Coversheet & Narrative Authorship State
  const [agencyName, setAgencyName] = useState("Camarines Sur Polytechnic Colleges");
  const [preparedBy, setPreparedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [mandate, setMandate] = useState("");
  const [vision, setVision] = useState("");
  const [mission, setMission] = useState("");
  const [presentSituation, setPresentSituation] = useState("");

  // Letter of Transmittal Coversheet State
  const [recipientName, setRecipientName] = useState("ATTY. IVAN JOHN E. UY");
  const [recipientTitle, setRecipientTitle] = useState("Secretary");
  const [recipientAgency, setRecipientAgency] = useState("Department of Information and Communications Technology");
  const [recipientAddress, setRecipientAddress] = useState("DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City");
  const [transmittalDate, setTransmittalDate] = useState("");

  // --- NEW DOCUMENT TREE STATE (Gap Restructuring) ---
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [loadingTree, setLoadingTree] = useState(false);

  // New Node Form States
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState("section");

  // Selected Node Content States
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeTocLabel, setNodeTocLabel] = useState("");
  const [nodeOrientation, setNodeOrientation] = useState("landscape");
  const [nodePageBreak, setNodePageBreak] = useState(false);
  const [nodeParentId, setNodeParentId] = useState("");
  const [nodeSequence, setNodeSequence] = useState("");
  const [nodeRichText, setNodeRichText] = useState("");

  // Selected Node Asset States
  const [assetFile, setCanvasFile] = useState(null);
  const [assetRole, setAssetRole] = useState("inline_diagram");
  const [assetTitle, setAssetTitle] = useState("");
  const [assetRatio, setAssetRatio] = useState(true);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  useEffect(() => {
    if (activeCycle) {
      const parts = activeCycle.split("-");
      if (parts.length === 2) {
        setStartYear(parts[0]);
        setEndYear(parts[1]);
      }
    }
  }, [activeCycle]);

  const fetchCycleData = async () => {
    if (!activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAgencyName(data.agency_name || "Camarines Sur Polytechnic Colleges");
        setPreparedBy(data.signatory_prepared_by || "");
        setApprovedBy(data.signatory_approved_by || "");
        setMandate(data.mandate_html || "");
        setVision(data.vision_html || "");
        setMission(data.mission_html || "");
        setPresentSituation(data.present_situation_html || "");
        setRecipientName(data.transmittal_recipient || "ATTY. IVAN JOHN E. UY");
        setRecipientTitle(data.transmittal_recipient_title || "Secretary");
        setRecipientAgency(data.transmittal_recipient_agency || "Department of Information and Communications Technology");
        setRecipientAddress(data.transmittal_recipient_address || "DICT Bldg., C.P. Garcia Avenue, Diliman, Quezon City");
        setTransmittalDate(data.transmittal_date || "");
      } else {
        setPreparedBy("");
        setApprovedBy("");
        setMandate("");
        setVision("");
        setMission("");
        setPresentSituation("");
      }
    } catch (e) {
      console.warn("Ready for cycle configuration.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      fetchCycleData();
      fetchDocumentTree();
    }
  }, [token, activeCycle]);

  // ==========================================================
  // DYNAMIC TREE API INTEGRATION (Gap Restructuring)
  // ==========================================================
  
  const fetchDocumentTree = async () => {
    setLoadingTree(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/document-tree`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
      }
    } catch (e) {
      console.error("Failed to load dynamic layout tree:", e);
    } finally {
      setLoadingTree(false);
    }
  };

  const handleSelectNode = (node) => {
    setSelectedNode(node);
    setNodeTitle(node.vocabulary?.display_title || "");
    setNodeTocLabel(node.vocabulary?.toc_label || "");
    setNodeOrientation(node.page_orientation);
    setNodePageBreak(node.force_page_break);
    setNodeParentId(node.parent_id ? String(node.parent_id) : "");
    setNodeSequence(String(node.sequence_order));
    
    const textContent = node.contents?.[0]?.json_data?.text || "";
    setNodeRichText(textContent);
  };

  const handleSaveNodeMetadata = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      // 1. Update IsspNode Properties
      const resNode = await fetch(`${apiUrl}/api/admin/issp/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          page_orientation: nodeOrientation,
          force_page_break: nodePageBreak,
          sequence_order: parseFloat(nodeSequence) || 0.0,
          parent_id: nodeParentId ? parseInt(nodeParentId, 10) : null
        })
      });

      if (!resNode.ok) throw new Error("Failed to preserve node structural parameters.");

      // 2. Update Vocabulary DICT mapping
      const resVocab = await fetch(`${apiUrl}/api/admin/issp/vocabulary/${selectedNode.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          display_title: nodeTitle.trim(),
          toc_label: nodeTocLabel.trim()
        })
      });

      if (!resVocab.ok) throw new Error("Failed to write vocabulary DICT display headers.");

      // 3. Update Content Rich text payload
      const resContent = await fetch(`${apiUrl}/api/admin/issp/contents/${selectedNode.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content_type: "rich_text",
          json_data: { text: nodeRichText.trim() }
        })
      });

      if (!resContent.ok) throw new Error("Failed to write dynamic text store contents.");

      setSuccess(`Layout parameters saved for: '${nodeTitle}'`);
      fetchDocumentTree();
    } catch (err) {
      setError(err.message || "Failed to update node configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateChildNode = async (e) => {
    e.preventDefault();
    if (!newNodeName.trim() || !selectedNode) return;
    setError(null);
    setSuccess(null);
    try {
      const generatedKey = `NODE_${newNodeName.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          parent_id: selectedNode.id,
          node_type: newNodeType,
          system_key: generatedKey,
          sequence_order: 1.0,
          display_title: newNodeName.trim(),
          toc_label: newNodeName.trim()
        })
      });

      if (!res.ok) throw new Error("Failed to append sub-node to hierarchy.");
      setSuccess(`Successfully appended child node: ${newNodeName}`);
      setNewNodeName("");
      fetchDocumentTree();
    } catch (err) {
      setError(err.message || "Failed to create node.");
    }
  };

  const handleDeleteNode = async (nodeId) => {
    if (!window.confirm("Purge node? This will recursively erase all sub-branches, structured rich texts, and assets.")) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes/${nodeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete selected node.");
      setSuccess("Node and nested structures removed successfully.");
      setSelectedNode(null);
      fetchDocumentTree();
    } catch (err) {
      setError(err.message || "Deletion failed.");
    }
  };

  const handleAssetUpload = async (e) => {
    e.preventDefault();
    if (!assetFile || !selectedNode) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    const formData = new FormData();
    formData.append("file", assetFile);
    formData.append("node_id", selectedNode.id);
    formData.append("asset_role", assetRole);
    formData.append("custom_title", assetTitle.trim());
    formData.append("aspect_ratio_preserve", assetRatio);

    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) throw new Error("Failed to store asset binary.");
      setSuccess("Asset successfully linked to node. Page-break forces applied.");
      setCanvasFile(null);
      setAssetTitle("");
      
      const fileInput = document.getElementById("node-asset-input");
      if (fileInput) fileInput.value = "";
      
      fetchDocumentTree();
    } catch (err) {
      setError(err.message || "Failed to upload asset.");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle tree expansion nodes state
  const toggleExpand = (id) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Recursive Tree Component Renderer
  const renderTreeNodes = (nodesList, depth = 0) => {
    return (
      <ul className={`space-y-1 ${depth > 0 ? "pl-4 border-l border-slate-800" : ""}`}>
        {nodesList.map(node => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = !!expandedNodes[node.id];
          const isSelected = selectedNode?.id === node.id;

          return (
            <li key={node.id} className="space-y-1">
              <div className={`flex items-center justify-between p-2 rounded-lg text-xs font-semibold cursor-pointer group ${
                isSelected ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}>
                <div className="flex items-center space-x-2 flex-1" onClick={() => handleSelectNode(node)}>
                  {hasChildren ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                      className="p-0.5 hover:bg-slate-700 rounded cursor-pointer"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-4 h-4 block" />
                  )}
                  <span className="truncate max-w-[140px] font-mono select-none">
                    {node.vocabulary?.display_title || node.system_key}
                  </span>
                </div>
                
                <span className="text-[9px] uppercase px-1.5 py-0.2 bg-slate-950/40 border border-slate-800 rounded font-bold mr-2 text-slate-400">
                  {node.page_orientation === "portrait" ? "Port" : "Land"}
                </span>

                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                  className="p-1 hover:text-red-400 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {hasChildren && isExpanded && renderTreeNodes(node.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  // ==========================================================
  // LEGACY ENDPOINTS (Preserved)
  // ==========================================================

  const handleActivateCycle = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const start = parseInt(startYear, 10);
    const end = parseInt(endYear, 10);

    if (isNaN(start) || isNaN(end)) {
      setError("Please enter valid calendar years.");
      return;
    }

    if (start > end) {
      setError("Start Year must be less than or equal to End Year.");
      return;
    }

    const span = end - start + 1;
    if (span < 2 || span > 10) {
      setError(`ISSP cycles must span between 2 and 10 years. Currently requesting: ${span} years.`);
      return;
    }

    setSubmitting(true);
    const targetCycle = `${start}-${end}`;

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${targetCycle}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to activate cycle.");
      }

      setSuccess(`Planning cycle updated and activated to: FY ${targetCycle}`);
      await fetchActiveCycle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetCycle = async () => {
    const confirmation = window.confirm(
      `CRITICAL ACTION CONFIRMATION:\n` +
      `Are you sure you want to safe-reset the active cycle '${activeCycle}'?\n` +
      `This will completely purge all draft/submitted/approved proposals, dynamic narratives, and ceilings linked to this span.`
    );
    if (!confirmation) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to safe-reset planning cycle.");
      }

      setSuccess("Planning cycle metrics and templates safely purged. You can now define a corrected year span.");
      setStartYear("");
      setEndYear("");
      await fetchActiveCycle();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveNarratives = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          agency_name: agencyName.trim(),
          signatory_prepared_by: preparedBy.trim(),
          signatory_approved_by: approvedBy.trim(),
          mandate_html: mandate.trim(),
          vision_html: vision.trim(),
          mission_html: mission.trim(),
          present_situation_html: presentSituation.trim(),
          transmittal_recipient: recipientName.trim(),
          transmittal_recipient_title: recipientTitle.trim(),
          transmittal_recipient_agency: recipientAgency.trim(),
          transmittal_recipient_address: recipientAddress.trim(),
          transmittal_date: transmittalDate.trim(),
          issp_period_from: parseInt(startYear, 10),
          issp_period_to: parseInt(endYear, 10)
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to write narrative parameters.");
      }

      setSuccess("Coversheet narratives and transmittal fields saved successfully.");
      fetchCycleData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedSpan = parseInt(endYear, 10) - parseInt(startYear, 10) + 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-100 select-none">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            <span>Master ISSP Narrative and Coversheet Studio</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Centralized management of framework timelines, signatory coversheets, and legal compliance mandates.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/50 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{typeof error === "object" ? error.message : error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Primary Tab Headers */}
      <div className="flex gap-1.5 p-1 bg-slate-955 rounded-lg border border-slate-850 self-start max-w-2xl">
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("cycle"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "cycle" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          <span>1. Cycle & Signatories</span>
        </button>
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("tree"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "tree" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>2. Dynamic Document Tree (DICT Struct)</span>
        </button>
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("coversheet"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "coversheet" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileSignature className="w-4 h-4" />
          <span>3. Transmittal Letter</span>
        </button>
        <button
          onClick={() => { setError(null); setSuccess(null); setActiveTab("parts"); }}
          className={`flex items-center gap-1.5 px-4 py-2 font-bold rounded-md transition-all cursor-pointer ${
            activeTab === "parts" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>4. Mandates & Narratives</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Core Workspace Panels */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          
          {activeTab === "cycle" && (
            <div className="space-y-6">
              <form onSubmit={handleActivateCycle} className="space-y-4 animate-fadeIn">
                <h3 className="text-white font-bold text-xs uppercase tracking-wide border-b border-slate-855 pb-2">
                  Active Cycle Governance Configuration
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      Start Fiscal Year
                    </label>
                    <input
                      type="number"
                      required
                      value={startYear}
                      onChange={(e) => setStartYear(e.target.value)}
                      className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-center outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      End Fiscal Year
                    </label>
                    <input
                      type="number"
                      required
                      value={endYear}
                      onChange={(e) => setEndYear(e.target.value)}
                      className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-center outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
                {!isNaN(calculatedSpan) && calculatedSpan > 0 && (
                  <div className="p-3 bg-slate-955 border border-slate-850 rounded-lg text-[10px] text-slate-400">
                    Calculated Duration: <span className="font-bold text-blue-400 font-mono">{calculatedSpan}-Year Planning Cycle</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Settings2 className="w-4 h-4" />
                  <span>{submitting ? "Processing..." : "Activate Cycle Framework"}</span>
                </button>
              </form>

              {/* Cycle Safe Reset Control Panel */}
              <div className="p-5 bg-slate-955 rounded-xl border border-slate-850/80 space-y-3.5 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <span className="font-bold text-slate-200 block">Planning Cycle Reset Management</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Need to redefine active year spans or adjust the timeline plan? Running a Safe Reset transactionally flushes active drafts, narratives, and budget ceilings for '{activeCycle}' allowing you to establish a corrected cycle from scratch.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResetCycle}
                  disabled={submitting}
                  className="p-2 px-4 bg-red-955 hover:bg-red-900 border border-red-900 text-red-300 font-bold rounded flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Safe Reset Active Cycle</span>
                </button>
              </div>
            </div>
          )}

          {/* DYNAMIC TREE STUDIO TAB (Gap Restructuring) */}
          {activeTab === "tree" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
              
              {/* Left Column: Draggable/Collapsible Structure Tree */}
              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-4">
                <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[10px] border-b border-slate-850 pb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Document Skeleton</span>
                </h4>
                {loadingTree ? (
                  <div className="text-center py-10">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500" />
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    {renderTreeNodes(nodes)}
                  </div>
                )}

                {selectedNode && (
                  <form onSubmit={handleCreateChildNode} className="border-t border-slate-850 pt-3 space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FolderPlus className="w-4 h-4 text-emerald-400" />
                      <span>Append Child Node</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Node Title..."
                      value={newNodeName}
                      onChange={e => setNewNodeName(e.target.value)}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-slate-100"
                    />
                    <select
                      value={newNodeType}
                      onChange={e => setNewNodeType(e.target.value)}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-slate-300 cursor-pointer"
                    >
                      <option value="part">Part</option>
                      <option value="section">Section</option>
                      <option value="subsection">Subsection</option>
                      <option value="leaf">Leaf Node</option>
                    </select>
                    <button type="submit" className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded font-bold cursor-pointer transition-colors text-[10px]">
                      Create Child Section
                    </button>
                  </form>
                )}
              </div>

              {/* Right Column: Node and Content Editor Workspace */}
              <div className="md:col-span-2 space-y-5">
                {selectedNode ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg flex justify-between items-center font-mono">
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase font-bold">Selected Node Key:</span>
                        <span className="block font-bold text-blue-400 select-all">{selectedNode.system_key}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-bold uppercase text-slate-400 text-[9px]">
                        {selectedNode.node_type}
                      </span>
                    </div>

                    <form onSubmit={handleSaveNodeMetadata} className="space-y-4">
                      {/* DICT Vocabulary Titles */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400">DICT Display Title</label>
                          <input
                            type="text" required value={nodeTitle} onChange={e => setNodeTitle(e.target.value)}
                            className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400">TOC Shorthand Label</label>
                          <input
                            type="text" required value={nodeTocLabel} onChange={e => setNodeTocLabel(e.target.value)}
                            className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white"
                          />
                        </div>
                      </div>

                      {/* Orientation & Page Breaks */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Page Orientation</label>
                          <select
                            value={nodeOrientation} onChange={e => setNodeOrientation(e.target.value)}
                            className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white cursor-pointer"
                          >
                            <option value="portrait">Portrait layout (Cover / Letters)</option>
                            <option value="landscape">Landscape layout (Wide Matrices)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Nesting Sort Sequence</label>
                          <input
                            type="number" step="0.001" required value={nodeSequence} onChange={e => setNodeSequence(e.target.value)}
                            className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-lg border border-slate-850">
                        <input
                          type="checkbox" id="break_toggle" checked={nodePageBreak} onChange={e => setNodePageBreak(e.target.checked)}
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                        />
                        <label htmlFor="break_toggle" className="text-[10px] font-bold text-slate-300 uppercase tracking-wider cursor-pointer select-none">
                          Force Explicit Page Break Before This Section
                        </label>
                      </div>

                      {/* Rich Text Editor */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400">Rich Text Store Content (HTML allowed)</label>
                        <textarea
                          rows={6} value={nodeRichText} onChange={e => setNodeRichText(e.target.value)}
                          placeholder="HTML/XML formatted body text..."
                          className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-[11px]"
                        />
                      </div>

                      <button type="submit" disabled={submitting} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold flex items-center justify-center gap-1 cursor-pointer">
                        <Save className="w-4 h-4" /> Save Section Configuration
                      </button>
                    </form>

                    {/* Media Management Area */}
                    <form onSubmit={handleAssetUpload} className="border-t border-slate-800 pt-4 space-y-4">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <UploadCloud className="w-4 h-4 text-purple-400" />
                        <span>Link Graphic Diagram / Charts Asset</span>
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Asset Layout Role</label>
                          <select
                            value={assetRole} onChange={e => setAssetRole(e.target.value)}
                            className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white cursor-pointer"
                          >
                            <option value="logo">Branding Logo (Header bounds)</option>
                            <option value="inline_diagram">Inline diagram (Aspect-ratio check)</option>
                            <option value="full_page_diagram">Full-Page diagram (Auto Pagebreak forced)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Graphic Caption Title</label>
                          <input
                            type="text" value={assetTitle} onChange={e => setAssetTitle(e.target.value)}
                            placeholder="e.g. Cisco Edge Switch Layout"
                            className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <input
                          id="node-asset-input" type="file" required accept="image/png, image/jpeg, image/jpg, image/gif, application/pdf"
                          onChange={e => setCanvasFile(e.target.files[0])}
                          className="text-[11px] text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-slate-800 file:text-slate-200 file:cursor-pointer"
                        />
                        <button type="submit" disabled={submitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded font-bold cursor-pointer transition-colors shrink-0 text-white">
                          Link Asset
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="h-64 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-500 italic">
                    Click any node in the document skeleton to load configuration parameters.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "coversheet" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-white font-bold text-xs uppercase tracking-wide border-b border-slate-855 pb-2">
                DICT Transmittal Coversheet Mappings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Recipient Full Name</label>
                  <input 
                    type="text" required value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Recipient Title</label>
                  <input 
                    type="text" required value={recipientTitle} onChange={(e) => setRecipientTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Target Agency / Commission Name</label>
                <input 
                  type="text" required value={recipientAgency} onChange={(e) => setRecipientAgency(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Physical Delivery Address</label>
                <textarea 
                  rows={2} required value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white resize-none focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Formal Document Date</label>
                <input 
                  type="text" required value={transmittalDate} onChange={(e) => setTransmittalDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <button
                type="submit" disabled={submitting}
                className="w-full p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : "Save Coversheet Parameters"}</span>
              </button>
            </form>
          )}

          {activeTab === "parts" && (
            <form onSubmit={handleSaveNarratives} className="space-y-4 animate-fadeIn">
              <h3 className="text-white font-bold text-xs uppercase tracking-wide border-b border-slate-855 pb-2">
                Mandates, Vision, & Mission Definitions
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Signatory: Prepared By</label>
                  <input
                    type="text" required value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Signatory: Approved By</label>
                  <input
                    type="text" required value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Part I.A.1 - Legal Mandate (HTML Formatted)</label>
                <textarea
                  value={mandate} onChange={(e) => setMandate(e.target.value)} rows={3}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white font-mono text-[11px] focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">College Vision Statement</label>
                  <textarea
                    value={vision} onChange={(e) => setVision(e.target.value)} rows={3}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">College Mission Statement</label>
                  <textarea
                    value={mission} onChange={(e) => setMission(e.target.value)} rows={3}
                    className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5">Part I.D - Present ICT Situation & Vulnerabilities</label>
                <textarea
                  value={presentSituation} onChange={(e) => setPresentSituation(e.target.value)} rows={4}
                  className="w-full p-2.5 bg-slate-955 border border-slate-800 rounded-lg text-white focus:ring-1 focus:ring-blue-600 outline-none"
                />
              </div>
              <button
                type="submit" disabled={submitting}
                className="w-full p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving..." : "Save Narratives"}</span>
              </button>
            </form>
          )}

        </div>

        {/* Global Reference Sidebar Info Panel */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-fit space-y-4 text-slate-400 leading-relaxed text-[11px]">
          <h3 className="text-white font-bold text-xs tracking-wider uppercase border-b border-slate-800 pb-3 flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-blue-500" />
            <span>Framework Details</span>
          </h3>
          <div className="space-y-3 font-mono">
            <div className="flex justify-between border-b border-slate-855 pb-2">
              <span>Institution Head:</span>
              <span className="text-slate-200 font-bold">SUC President III</span>
            </div>
            <div className="flex justify-between border-b border-slate-855 pb-2">
              <span>Active Period:</span>
              <span className="text-slate-200 font-bold">{activeCycle || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span>DICT Mandate:</span>
              <span className="text-slate-200 font-bold">A4 Compliance</span>
            </div>
          </div>
          <div className="bg-slate-955/40 p-4 rounded-lg border border-slate-850 space-y-2">
            <span className="font-bold text-slate-300 uppercase tracking-wider block">Information</span>
            <p>
              Modifying these elements rewrites cover signatures and Part I parameters inside the twin-pass compiling engine. Make sure all signage names align with academic records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}