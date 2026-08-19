// frontend/src/views/admin/Narrative/DocumentStructureManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  FolderTree, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  Settings2, 
  ArrowUp, 
  ArrowDown, 
  AlignLeft, 
  Layout, 
  Save, 
  RefreshCw,
  AlertTriangle,
  FolderOpen
} from "lucide-react";

export default function DocumentStructureManager() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  const [treeData, setTreeData] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Expanded tree node tracked states
  const [expandedNodes, setExpandedNodes] = useState({});

  // Node editing state variables
  const [displayTitle, setDisplayTitle] = useState("");
  const [tocLabel, setTocLabel] = useState("");
  const [forcePageBreak, setForcePageBreak] = useState(false);
  const [orientation, setPageOrientation] = useState("landscape");
  const [nodeType, setNodeType] = useState("section");

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const fetchDocumentTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/document-tree`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTreeData(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load document skeletal hierarchy.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDocumentTree();
    }
  }, [token]);

  const toggleExpand = (nodeId) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const handleSelectNode = (node) => {
    setError(null);
    setSuccess(null);
    setSelectedNode(node);
    setDisplayTitle(node.vocabulary?.display_title || "");
    setTocLabel(node.vocabulary?.toc_label || "");
    setForcePageBreak(node.force_page_break);
    setPageOrientation(node.page_orientation);
    setNodeType(node.node_type);
  };

  // Node Addition Handler
  const handleAddNode = async (parentId = null) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          parent_id: parentId,
          node_type: "section",
          system_key: `NODE_${uuidv4().substring(0, 8).toUpperCase()}`,
          sequence_order: 1.000,
          page_orientation: "landscape",
          force_page_break: false
        })
      });

      if (!res.ok) throw new Error("Failed to append node.");
      setSuccess("New structural node added. Set properties in the editor.");
      fetchDocumentTree();
    } catch (err) {
      setError(err.message);
    }
  };

  // Node Reordering Handler
  const handleReorder = async (nodeId, direction) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/reorder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          node_id: nodeId,
          direction: direction // "up", "down", "indent", "outdent"
        })
      });

      if (!res.ok) throw new Error("Failed to adjust sequence position.");
      setSuccess("Sequence reordered.");
      fetchDocumentTree();
    } catch (err) {
      setError(err.message);
    }
  };

  // Save Node Details Update
  const handleSaveProperties = async (e) => {
    e.preventDefault();
    if (!selectedNode) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          node_type: nodeType,
          page_orientation: orientation,
          force_page_break: forcePageBreak,
          vocabulary: {
            display_title: displayTitle.trim(),
            toc_label: tocLabel.trim()
          }
        })
      });

      if (!res.ok) throw new Error("Failed to update node configuration.");
      setSuccess("Properties saved successfully.");
      fetchDocumentTree();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Node deletion Handler
  const handleDeleteNode = async (nodeId) => {
    if (!window.confirm("Are you sure you want to permanently delete this node and all of its children?")) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/issp/nodes/${nodeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete node.");
      setSuccess("Structural node removed.");
      setSelectedNode(null);
      fetchDocumentTree();
    } catch (err) {
      setError(err.message);
    }
  };

  // Helper utility to generate unique UUIDs for placeholder keys
  const uuidv4 = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Recursive Tree Rendering inside Sidebar Workspace
  const renderTreeNodes = (nodes) => {
    return (
      <ul className="space-y-1.5 pl-4 border-l border-slate-800/80">
        {nodes.map(node => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = !!expandedNodes[node.id];
          const isSelected = selectedNode?.id === node.id;

          return (
            <li key={node.id} className="space-y-1 animate-fadeIn">
              <div 
                className={`flex items-center justify-between p-2 rounded-lg transition-all text-xs ${
                  isSelected 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/10" 
                    : "bg-slate-950/40 border border-slate-900 text-slate-300 hover:bg-slate-900/60"
                }`}
              >
                <div 
                  onClick={() => handleSelectNode(node)} 
                  className="flex items-center gap-2 cursor-pointer flex-1 truncate pr-2"
                >
                  {hasChildren ? (
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                      className="p-0.5 hover:bg-slate-800/60 rounded text-slate-500"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-4 h-4 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                    </span>
                  )}
                  <span className="font-bold font-mono tracking-tight text-[10px] text-blue-400 bg-blue-950/45 px-1.5 py-0.5 rounded border border-blue-900/40 shrink-0">
                    {node.sequence_order}
                  </span>
                  <span className="truncate font-semibold text-[11px]">
                    {node.vocabulary?.display_title || node.system_key}
                  </span>
                </div>

                {/* Inline Reordering & Child Actions */}
                <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleReorder(node.id, "up")}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => handleReorder(node.id, "down")}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => handleReorder(node.id, "indent")}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400"
                    title="Indent (Nest Child)"
                  >
                    <ChevronRight className="w-3 h-3 text-purple-400" />
                  </button>
                  <button 
                    onClick={() => handleReorder(node.id, "outdent")}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400"
                    title="Outdent"
                  >
                    <AlignLeft className="w-3 h-3 text-purple-400" />
                  </button>
                  <button 
                    onClick={() => handleAddNode(node.id)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400"
                    title="Append Child Section"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button 
                    onClick={() => handleDeleteNode(node.id)}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400"
                    title="Delete Node"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {hasChildren && isExpanded && (
                <div className="mt-1">
                  {renderTreeNodes(node.children)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 select-none max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-blue-500" />
            <span>DICT Document Hierarchy Tree Manager</span>
          </h2>
          <p className="text-slate-400 mt-1">
            Build strict document layouts, orient landscape diagrams, and manage sequential DICT vocabulary definitions.
          </p>
        </div>
        <button
          onClick={fetchDocumentTree}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Sync Hierarchy</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/20 border border-red-900 text-red-400 font-bold rounded-lg flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-800 text-emerald-400 font-bold rounded-lg flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Draggable/Reorderable Tree Skelton */}
        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-blue-400" />
              <span>Skeletal Tree Outline</span>
            </h3>
            <button
              onClick={() => handleAddNode(null)}
              className="p-1 px-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Part / Root</span>
            </button>
          </div>

          <div className="max-h-[500px] overflow-y-auto pr-2">
            {loading && treeData.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span>Reading document mapping...</span>
              </div>
            ) : treeData.length > 0 ? (
              <div className="-ml-4">
                {renderTreeNodes(treeData)}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 italic">
                Tree is currently empty. Define a parent Root node to begin.
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Content / Vocabulary editor for Selected Node */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800">
          {selectedNode ? (
            <form onSubmit={handleSaveProperties} className="space-y-4 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-purple-400" />
                  <span>Configure Node: {selectedNode.system_key}</span>
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-500 font-mono select-all">
                  Node Index: {selectedNode.id}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">RICT Structural Type</label>
                  <select
                    value={nodeType}
                    onChange={(e) => setNodeType(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white"
                  >
                    <option value="root">Root</option>
                    <option value="part">Part / Chapter</option>
                    <option value="section">Section</option>
                    <option value="subsection">Subsection</option>
                    <option value="leaf">Leaf Node</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Page Orientation</label>
                  <select
                    value={orientation}
                    onChange={(e) => setPageOrientation(e.target.value)}
                    className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white"
                  >
                    <option value="portrait">Portrait Orientation</option>
                    <option value="landscape">Landscape Orientation</option>
                  </select>
                </div>
              </div>

              {/* Vocabulary Display Properties */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-4 font-sans">
                <span className="block text-[9.5px] uppercase font-bold text-slate-500 tracking-wider">
                  Vocabulary Dictionary Validation (TOC Alignment)
                </span>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Official Title Header</label>
                  <input
                    type="text"
                    required
                    value={displayTitle}
                    onChange={(e) => setDisplayTitle(e.target.value)}
                    placeholder="e.g. A.1. Mandate (Legal Basis)"
                    className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white font-semibold font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">TOC Short Label</label>
                  <input
                    type="text"
                    required
                    value={tocLabel}
                    onChange={(e) => setTocLabel(e.target.value)}
                    placeholder="e.g. A.1. Mandate"
                    className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Force Page Break toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-955/50 border border-slate-850/80 rounded-xl">
                <div className="space-y-0.5">
                  <label className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block">Force Page Break</label>
                  <span className="text-[10px] text-slate-500">Inject break tags before rendering this node.</span>
                </div>
                <input
                  type="checkbox"
                  checked={forcePageBreak}
                  onChange={(e) => setForcePageBreak(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 pt-2"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Preserving Properties..." : "Save Properties"}</span>
              </button>
            </form>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-24 text-slate-500 gap-2 text-center max-w-sm mx-auto leading-relaxed border-2 border-dashed border-slate-850 rounded-xl bg-slate-950/20">
              <Settings2 className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="font-semibold text-slate-400">Node Editor Sandbox</p>
              <p className="text-[10px]">Click any structural node in the tree outline to edit display titles, TOC mappings, and page properties.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}