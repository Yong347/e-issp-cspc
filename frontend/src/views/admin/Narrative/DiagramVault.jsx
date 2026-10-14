// frontend/src/views/admin/Narrative/DiagramVault.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  getNarrative, 
  updateNarrative, 
  uploadDiagram 
} from "../../../api/admin";
import CompilerSyncButton from "../../../components/common/CompilerSyncButton";
import { 
  ImageIcon, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  FileImage, 
  Search, 
  Layers, 
  Eye, 
  X, 
  Trash2, 
  ExternalLink, 
  ShieldCheck, 
  ShieldAlert, 
  Edit3, 
  Check, 
  RotateCcw, 
  Sparkles, 
  Info 
} from "lucide-react";

// Security & Compliance Blacklist against test artwork leaks (matches backend compiler guards)
const TEST_ARTWORK_BLACKLIST = [
  "syanart",
  "boruto",
  "naruto",
  "wallpaper",
  "anime",
  "dummy",
  "placeholder",
  "sample"
];

/**
 * Checks if a URL or filename represents unverified test/anime artwork.
 */
const isTestArtwork = (urlOrName) => {
  if (!urlOrName) return false;
  const lower = String(urlOrName).toLowerCase();
  return TEST_ARTWORK_BLACKLIST.some(keyword => lower.includes(keyword));
};

export default function DiagramVault() {
  const { user } = useAuth();
  const { activeCycle, fetchActiveCycle } = useCycle();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const [activeGroup, setActiveGroup] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState({});
  const [dragOverKey, setDragOverKey] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // Dynamic Custom Titles and Narrative Scope JSON
  const [customTitles, setCustomTitles] = useState({});
  const [scopeJson, setScopeJson] = useState({});
  const [editingTitleKey, setEditingTitleKey] = useState(null);
  const [tempTitle, setTempTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // Canonical 4 DICT Exhibits (1 Sole Institutional Emblem + 3 Technical Schematics)
  const [diagrams, setDiagrams] = useState({
    agency_logo: null,
    network_diagram: null,
    fiber_backbone: null,
    system_architecture: null
  });

  const token = 
    user?.token || 
    user?.accessToken || 
    (typeof window !== "undefined" 
      ? localStorage.getItem("access_token") || localStorage.getItem("token") || "" 
      : "");

  // Auto-dismiss transient alerts
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard navigation for preview modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && previewImage) {
        setPreviewImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  // Canonical Catalog of the 4 Official DICT Exhibits
  const allCategories = useMemo(() => [
    {
      key: "agency_logo", 
      group: "governance", 
      isCore: true,
      defaultTitle: "1. Official Agency Institutional Seal / Logo", 
      section: "Cover Page Header & Running Page Headers",
      description: "Sole official institutional emblem displayed prominently in the central header of the Cover Page and running page headers. Per statutory formatting, no secondary or competing logos are rendered."
    },
    { 
      key: "network_diagram", 
      group: "network", 
      isCore: true,
      defaultTitle: "2. Existing LAN/WAN Topology Diagram (Part II.B.1)", 
      section: "Part II.B.1 Existing Network Infrastructure",
      description: "Full-page landscape schematic illustrating core switches, distribution nodes, routing topology, and existing campus leased line connectivity."
    },
    { 
      key: "fiber_backbone", 
      group: "network", 
      isCore: true,
      defaultTitle: "3. Proposed Network Infrastructure & Fiber Backbone (Part III.A.1)", 
      section: "Part III.A.1 Proposed Network Infrastructure",
      description: "Full-page landscape schematic detailing the proposed 10G optical fiber backbone, distribution switches, GovNet interconnect, and cloud routing."
    },
    { 
      key: "system_architecture", 
      group: "systems", 
      isCore: true,
      defaultTitle: "4. Enterprise Architecture Framework (Part III.B)", 
      section: "Part III.B Enterprise Architecture",
      description: "Full-page multi-layer enterprise architecture blueprint illustrating portals, service layers, PeGIF API interoperability gateways, and data repositories."
    }
  ], []);

  const fetchVaultData = useCallback(async () => {
    if (!token || !activeCycle) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getNarrative(token, activeCycle);
      
      // Extract database-persisted custom diagram titles from scope_json
      const sJson = data.scope_json || {};
      setScopeJson(sJson);
      if (sJson.custom_diagram_titles && typeof sJson.custom_diagram_titles === "object") {
        setCustomTitles(sJson.custom_diagram_titles);
      } else {
        setCustomTitles({});
      }

      setDiagrams({
        agency_logo: data.agency_logo_url || null,
        network_diagram: data.network_diagram_url || null,
        fiber_backbone: data.fiber_backbone_url || null,
        system_architecture: data.system_architecture_url || null
      });
    } catch (e) {
      setError(e.message || "Failed to retrieve registered diagram filepaths.");
    } finally {
      setLoading(false);
    }
  }, [activeCycle, token]);

  useEffect(() => {
    fetchVaultData();
  }, [fetchVaultData]);

  // Handle Saving Custom Schematic Title to Database
  const handleSaveTitle = async (catKey) => {
    if (!tempTitle.trim()) return;
    setSavingTitle(true);
    setError(null);
    setSuccess(null);

    const updatedCustomTitles = {
      ...customTitles,
      [catKey]: tempTitle.trim()
    };

    const updatedScopeJson = {
      ...(scopeJson || {}),
      custom_diagram_titles: updatedCustomTitles
    };

    try {
      await updateNarrative(token, activeCycle, { scope_json: updatedScopeJson });
      setCustomTitles(updatedCustomTitles);
      setScopeJson(updatedScopeJson);
      setEditingTitleKey(null);
      setSuccess(`Custom schematic title '${tempTitle.trim()}' saved successfully.`);
    } catch (err) {
      setError(err.message || "Failed to persist custom title.");
    } finally {
      setSavingTitle(false);
    }
  };

  // Handle Resetting Custom Schematic Title Back to Standard Default
  const handleResetTitle = async (catKey) => {
    setSavingTitle(true);
    setError(null);
    setSuccess(null);

    const updatedCustomTitles = { ...customTitles };
    delete updatedCustomTitles[catKey];

    const updatedScopeJson = {
      ...(scopeJson || {}),
      custom_diagram_titles: updatedCustomTitles
    };

    try {
      await updateNarrative(token, activeCycle, { scope_json: updatedScopeJson });
      setCustomTitles(updatedCustomTitles);
      setScopeJson(updatedScopeJson);
      setEditingTitleKey(null);
      setSuccess("Schematic title reset to default specification.");
    } catch (err) {
      setError(err.message || "Failed to reset title.");
    } finally {
      setSavingTitle(false);
    }
  };

  // Upload Schematic Handler with Security & Format Validation
  const handleUpload = async (category, file) => {
    if (!file) return;

    // Strict Anti-Test Artwork & Anime Image Guard
    if (isTestArtwork(file.name)) {
      setError("Compliance Rejection: Unverified test, anime, or placeholder files cannot be uploaded as official exhibits.");
      return;
    }

    // Validate MIME type
    const validMimes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    const validExt = /\.(png|jpe?g|svg|webp)$/i;
    if (!validMimes.includes(file.type) && !validExt.test(file.name || "")) {
      setError("Invalid image file format. Supported formats: PNG, JPG, JPEG, SVG, WebP.");
      return;
    }

    // Recommended limit for high-DPI full-page PDF printing (15MB)
    if (file.size > 15 * 1024 * 1024) {
      setError("File size exceeds 15MB limit. Please compress or optimize the image for print generation.");
      return;
    }

    setError(null);
    setSuccess(null);
    setUploading(prev => ({ ...prev, [category]: true }));

    try {
      const resData = await uploadDiagram(token, activeCycle, category, file);
      const catObj = allCategories.find(c => c.key === category);
      const displayTitle = customTitles[category] || catObj?.defaultTitle || category;
      setSuccess(`Graphic asset registered for '${displayTitle}'.`);
      setDiagrams(prev => ({ ...prev, [category]: resData.file_url }));

      if (category === "agency_logo" && fetchActiveCycle) {
        fetchActiveCycle();
      }
    } catch (err) {
      setError(err.message || "Upload failed. Please check network connection.");
    } finally {
      setUploading(prev => ({ ...prev, [category]: false }));
    }
  };

  // Remove Schematic Handler
  const handleRemove = async (category) => {
    const catObj = allCategories.find(c => c.key === category);
    const displayTitle = customTitles[category] || catObj?.defaultTitle || category;
    if (!window.confirm(`Are you sure you want to remove the graphic asset for '${displayTitle}'?`)) return;

    setError(null);
    setSuccess(null);

    const colMapping = {
      agency_logo: "agency_logo_url",
      network_diagram: "network_diagram_url",
      fiber_backbone: "fiber_backbone_url",
      system_architecture: "system_architecture_url"
    };

    const colName = colMapping[category] || `${category}_url`;

    try {
      await updateNarrative(token, activeCycle, { [colName]: "" });
      setSuccess(`Graphic asset for '${displayTitle}' removed.`);
      setDiagrams(prev => ({ ...prev, [category]: null }));

      if (category === "agency_logo" && fetchActiveCycle) {
        fetchActiveCycle();
      }
    } catch (err) {
      setError(err.message || "Failed to remove graphic asset.");
    }
  };

  // Purge All Unverified Test Artworks Across All Slots
  const handlePurgeAllTestArtworks = async () => {
    if (!window.confirm("Purge all unverified test artwork URLs from the database?")) return;
    setError(null);
    setSuccess(null);
    try {
      const colMapping = {
        agency_logo: "agency_logo_url",
        network_diagram: "network_diagram_url",
        fiber_backbone: "fiber_backbone_url",
        system_architecture: "system_architecture_url"
      };

      const updates = {};
      allCategories.forEach(cat => {
        if (isTestArtwork(diagrams[cat.key])) {
          updates[colMapping[cat.key]] = "";
        }
      });

      await updateNarrative(token, activeCycle, updates);
      setSuccess("All unverified test artworks purged from database.");
      await fetchVaultData();
      if (fetchActiveCycle) fetchActiveCycle();
    } catch (err) {
      setError(err.message || "Failed to purge test artworks.");
    }
  };

  // Filter and Search Logic
  const filteredCategories = useMemo(() => {
    return allCategories.filter(cat => {
      let matchesGroup = true;
      if (activeGroup !== "all") {
        matchesGroup = cat.group === activeGroup;
      }

      const q = searchTerm.toLowerCase().trim();
      const currentTitle = (customTitles[cat.key] || cat.defaultTitle).toLowerCase();
      const matchesSearch = !q || 
        currentTitle.includes(q) || 
        cat.defaultTitle.toLowerCase().includes(q) || 
        cat.section.toLowerCase().includes(q) || 
        cat.key.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [allCategories, customTitles, activeGroup, searchTerm]);

  // Accurate Metrics Breakdown for the 4 Core Schematics with Test Image Auditing
  const stats = useMemo(() => {
    let totalUploaded = 0;
    let flaggedTestCount = 0;

    allCategories.forEach(cat => {
      const url = diagrams[cat.key];
      if (url) {
        if (isTestArtwork(url)) {
          flaggedTestCount += 1;
        } else {
          totalUploaded += 1;
        }
      }
    });

    const totalCount = allCategories.length;
    return {
      totalCount,
      totalUploaded,
      flaggedTestCount,
      pendingCount: totalCount - totalUploaded
    };
  }, [allCategories, diagrams]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 gap-4 shadow-xs">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Official Document Schematics &amp; Emblems Vault</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Centralized digital asset repository for official visual exhibits specified under the ISSP guidelines. The <strong>4 canonical exhibits</strong> (1 Sole Institutional Seal + 3 Core Technical Schematics) render as full-page landscape exhibits in the compiled document. If an exhibit is unuploaded, an official DICT schematic outline box is generated automatically.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Centralized Compiler Verification Pipeline Button */}
          <CompilerSyncButton
            moduleName="diagrams"
            activeCycle={activeCycle}
            token={token}
            onSaveAndSync={fetchVaultData}
            label="Save &amp; Verify Compiler Pipeline"
          />

          <button
            onClick={fetchVaultData}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
            title="Refresh Vault Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Metric Tiles with Flagged Test Artwork Indicator */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Mandatory Exhibits</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
              {stats.totalUploaded} / {stats.totalCount} Attached
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Vault Verification</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {stats.totalUploaded === stats.totalCount ? "100% Ready" : `${stats.totalUploaded} of ${stats.totalCount} Ready`}
            </h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className={`p-3 rounded-xl ${stats.pendingCount > 0 ? "bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400" : "bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"}`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Statutory Outline Mode</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${stats.pendingCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {stats.pendingCount === 0 ? "All Exhibits Uploaded" : `${stats.pendingCount} Auto-Outlined`}
            </h3>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-xs transition-all ${
          stats.flaggedTestCount > 0 
            ? "bg-rose-50 dark:bg-rose-955/30 border-rose-300 dark:border-rose-900 text-rose-900 dark:text-rose-300 animate-pulse" 
            : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800"
        }`}>
          <div className={`p-3 rounded-xl ${stats.flaggedTestCount > 0 ? "bg-rose-600 text-white" : "bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"}`}>
            {stats.flaggedTestCount > 0 ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-75">Test Artwork Guard</span>
            <h3 className={`text-base font-bold font-mono mt-0.5 ${stats.flaggedTestCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {stats.flaggedTestCount > 0 ? `${stats.flaggedTestCount} Blocked` : "0 Leakage"}
            </h3>
          </div>
        </div>
      </div>

      {/* Flagged Test Artwork Purge Action Banner */}
      {stats.flaggedTestCount > 0 && (
        <div className="p-4 bg-rose-50 dark:bg-rose-955/40 border border-rose-300 dark:border-rose-900 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-rose-900 dark:text-rose-300 shadow-xs animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <strong className="font-bold">Unverified Test Artwork Blocked by Compliance Guard</strong>
              <p className="text-[11px] leading-relaxed">
                {stats.flaggedTestCount} unverified external artwork URL(s) matching blacklisted test patterns were intercepted. These items are blocked from rendering in the compiled PDF.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePurgeAllTestArtworks}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge Blocked Test URLs</span>
          </button>
        </div>
      )}

      {/* Standards Information Banner */}
      <div className="p-3.5 bg-blue-50 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/60 rounded-xl text-[10.5px] text-blue-900 dark:text-blue-300 flex items-start gap-2.5 leading-relaxed">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          <strong>Document Schematics Standard:</strong> Exactly 4 official exhibits are required under the standard ISSP framework: (1) Sole Agency Seal, (2) Existing LAN/WAN Topology, (3) Proposed LAN/WAN Fiber Backbone, and (4) Enterprise Architecture Framework. Per statutory formatting, only the single institutional seal renders in the central cover header. Each technical schematic renders as a full-page landscape exhibit with dynamic pagination in the final certified PDF. If unuploaded, an official schematic outline box is generated automatically to prevent layout shifts.
        </span>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-955/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start gap-2.5 animate-fadeIn">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap gap-1 p-0.5 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
          {[
            { id: "all", label: `All Exhibits (${stats.totalCount})` },
            { id: "governance", label: "Agency Seal" },
            { id: "network", label: "Network Schematics (2)" },
            { id: "systems", label: "Enterprise Architecture (1)" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveGroup(tab.id)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                activeGroup === tab.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search schematic title or section..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Schematic Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredCategories.map((cat) => {
          const currentUrl = diagrams[cat.key];
          const isLogo = cat.key === "agency_logo";
          const isEditingThisTitle = editingTitleKey === cat.key;
          const hasCustomTitle = Boolean(customTitles[cat.key]);
          const currentTitle = customTitles[cat.key] || cat.defaultTitle;
          const isDraggingOver = dragOverKey === cat.key;
          const isBlocked = isTestArtwork(currentUrl);

          return (
            <div 
              key={cat.key} 
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverKey(cat.key);
              }}
              onDragLeave={() => setDragOverKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverKey(null);
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) {
                  handleUpload(cat.key, droppedFile);
                }
              }}
              className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border space-y-4 flex flex-col justify-between shadow-xs transition-all duration-200 ${
                isBlocked
                  ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/20"
                  : isDraggingOver 
                  ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-955/20" 
                  : "border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
              }`}
            >
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider font-mono">
                        {cat.section}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                        Official Exhibit
                      </span>
                    </div>

                    {/* Editable Title Interface */}
                    {isEditingThisTitle ? (
                      <div className="mt-1 flex items-center gap-1.5 animate-fadeIn">
                        <input
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          placeholder="Enter customized schematic title..."
                          className="flex-1 p-1.5 bg-slate-50 dark:bg-slate-955 border border-blue-400 dark:border-blue-600 rounded-lg text-slate-900 dark:text-white font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveTitle(cat.key);
                            if (e.key === "Escape") setEditingTitleKey(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTitle(cat.key)}
                          disabled={savingTitle}
                          className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg cursor-pointer"
                          title="Save Custom Title"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTitleKey(null)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 rounded-lg cursor-pointer"
                          title="Cancel Editing"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {hasCustomTitle && (
                          <button
                            type="button"
                            onClick={() => handleResetTitle(cat.key)}
                            disabled={savingTitle}
                            className="p-1.5 bg-slate-100 hover:bg-amber-100 dark:bg-slate-800 text-slate-500 hover:text-amber-600 rounded-lg cursor-pointer"
                            title="Reset to Template Default Title"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-0.5 group/title">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                          <FileImage className="w-4 h-4 text-slate-500 shrink-0" />
                          <span>{currentTitle}</span>
                        </h3>
                        {hasCustomTitle && (
                          <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-mono font-bold">
                            Custom
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTitleKey(cat.key);
                            setTempTitle(currentTitle);
                          }}
                          className="opacity-0 group-hover/title:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-blue-600 transition-opacity cursor-pointer"
                          title="Customize Title for this Schematic"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <span className={`text-[8.5px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider border shrink-0 ${
                    isBlocked
                      ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                      : currentUrl 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                      : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                  }`}>
                    {isBlocked ? "Blocked Test URL" : currentUrl ? "Attached" : "Auto-Outlined"}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {cat.description}
                </p>
              </div>

              {/* Preview Box with Safeguards and Statutory Outlines */}
              {uploading[cat.key] ? (
                <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 h-52 flex flex-col items-center justify-center rounded-xl animate-pulse">
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-600 mb-2" />
                  <span className="text-[10.5px] text-slate-500">Uploading and validating schematic asset...</span>
                </div>
              ) : isBlocked ? (
                /* Blocked Test Artwork Warning Container */
                <div className="bg-rose-50 dark:bg-rose-955/30 border border-rose-300 dark:border-rose-900/60 rounded-xl p-4 h-52 flex flex-col items-center justify-center text-center space-y-2">
                  <ShieldAlert className="w-8 h-8 text-rose-600 dark:text-rose-400" />
                  <div className="space-y-0.5">
                    <strong className="text-rose-900 dark:text-rose-200 text-xs uppercase font-bold">
                      Unverified Test Artwork Blocked
                    </strong>
                    <p className="text-[10px] text-rose-700 dark:text-rose-300 max-w-sm leading-snug">
                      External placeholder artwork was detected in this slot. The compiler blocks unverified images to maintain strict compliance.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleRemove(cat.key)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Purge Blocked Asset</span>
                    </button>
                  </div>
                </div>
              ) : currentUrl ? (
                /* Verified Image Preview Box */
                <div className="relative group bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-850 h-52 flex items-center justify-center overflow-hidden">
                  <img 
                    src={currentUrl} 
                    alt={currentTitle} 
                    className={`${isLogo ? "max-h-28 max-w-[140px]" : "max-w-full max-h-full"} object-contain rounded-lg transition-transform duration-200 group-hover:scale-102`} 
                  />
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ url: currentUrl, title: currentTitle, isPlaceholder: false })}
                      className="p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl shadow-md hover:bg-slate-100 dark:hover:bg-slate-700 font-bold flex items-center gap-1 cursor-pointer transition-colors text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(cat.key)}
                      className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md font-bold flex items-center gap-1 cursor-pointer transition-colors text-xs"
                      title="Clear / Remove Graphic Asset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ) : isLogo ? (
                /* Seal Placeholder when Logo is Unuploaded */
                <div className={`relative border-2 border-dashed h-52 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-colors overflow-hidden ${
                  isDraggingOver 
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-955/30 text-blue-600" 
                    : "border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400"
                }`}>
                  <div className="w-full h-full flex flex-col items-center justify-center space-y-1.5 p-2 bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <div className="w-12 h-12 rounded-full border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                      <ImageIcon className="w-6 h-6 opacity-60" />
                    </div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 text-xs font-serif">
                      Official Agency Seal Pending
                    </div>
                    <p className="text-[9.5px] text-slate-500 dark:text-slate-400 max-w-[280px] leading-tight italic">
                      Renders as the sole institutional seal on the document cover page and running headers.
                    </p>
                    <span className="text-[8.5px] text-slate-400 font-mono">
                      Drag &amp; drop PNG, JPG, SVG or browse below
                    </span>
                  </div>
                </div>
              ) : (
                /* OFFICIAL STATUTORY SCHEMATIC OUTLINE PLACEHOLDER */
                <div className={`relative border-2 border-dashed h-52 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-colors overflow-hidden group/box ${
                  isDraggingOver 
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-955/30 text-blue-600" 
                    : "border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-955 text-slate-500 dark:text-slate-400"
                }`}>
                  <div className="w-full h-full flex flex-col items-center justify-center space-y-1.5 p-3 bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xs">
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider text-[9px] font-mono">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Schematic Specification Framework</span>
                    </div>
                    <div className="font-bold text-slate-800 dark:text-slate-200 text-xs font-serif truncate max-w-[280px]">
                      {currentTitle}
                    </div>
                    <p className="text-[9.5px] text-slate-500 dark:text-slate-400 max-w-[320px] leading-tight italic">
                      No diagram uploaded. An official statutory outline box with metadata will render in the compiled PDF.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ title: currentTitle, isPlaceholder: true })}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[9.5px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview Outline Box</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* File Upload Selector */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUpload(cat.key, file);
                    }
                    e.target.value = "";
                  }}
                  className="w-full text-slate-500 dark:text-slate-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer transition-all"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* FULL-SIZE PREVIEW MODAL */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-955">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">{previewImage.title}</h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  {previewImage.isPlaceholder ? "Statutory Outline Box Placeholder (Compiled Layout)" : "Full-Resolution Print Asset"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {previewImage.url && (
                  <a
                    href={previewImage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Open Original in New Tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 bg-slate-100 dark:bg-slate-955 flex items-center justify-center overflow-auto">
              {previewImage.isPlaceholder ? (
                /* Full Outline Box Simulation matching PDF Output */
                <div className="w-full max-w-3xl h-[60vh] max-h-[460px] border-2 border-dashed border-slate-400 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
                  <div className="text-base font-bold text-blue-900 dark:text-blue-300 font-serif uppercase tracking-wide">
                    OFFICIAL SCHEMATIC SPECIFICATION FRAMEWORK
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {previewImage.title}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed italic">
                    Physical and logical architecture diagram maintained under institutional repository.
                    Approved under DICT ISSP Guidelines &bull; Reference Exhibit for Planning Horizon.
                  </p>
                  <span className="text-[10px] text-slate-500 font-mono uppercase bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                    Auto-Rendered in Compiled Document when Graphic Asset is Unuploaded
                  </span>
                </div>
              ) : (
                <img 
                  src={previewImage.url} 
                  alt={previewImage.title} 
                  className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg border border-slate-200 dark:border-slate-800"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}