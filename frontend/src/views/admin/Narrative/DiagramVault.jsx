// frontend/src/views/admin/Narrative/DiagramVault.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  ImageIcon, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  FileImage, 
  Layout, 
  Settings2, 
  FileText, 
  Search, 
  ExternalLink, 
  Layers, 
  Network, 
  Users, 
  Eye, 
  X, 
  Building2, 
  HardDrive,
  Shield
} from "lucide-react";

export default function DiagramVault() {
  const { user } = useAuth();
  const { activeCycle, fetchActiveCycle } = useCycle();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const [activeGroup, setActiveGroup] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [uploading, setUploading] = useState({});
  const [assetRoles, setAssetRoles] = useState({});
  const [customTitles, setCustomTitles] = useState({});
  const [aspectPreserve, setAspectPreserve] = useState({});
  const [aspectWarnings, setAspectWarnings] = useState({});

  const [previewImage, setPreviewImage] = useState(null);

  const [diagrams, setDiagrams] = useState({
    dict_logo: null,
    bagong_pilipinas_logo: null,
    agency_logo: null,
    org_chart: null,
    network_diagram: null,
    fiber_backbone: null,
    system_architecture: null,
    proposed_ict_org: null
  });

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token || localStorage.getItem("access_token");

  const categories = useMemo(() => [
    {
      key: "agency_logo", 
      group: "governance", 
      title: "Agency Institutional Seal (System Logo)", 
      section: "Cover Page, System Favicon & Navigation Header",
      defaultRole: "logo",
      description: "Official institutional agency seal dynamically integrated into the system login, navigation bars, and PDF covers."
    },
    {
      key: "dict_logo",
      group: "governance",
      title: "Official DICT Seal / Co-Branding Logo",
      section: "Cover Page & Running Header",
      defaultRole: "logo",
      description: "Official Department of Information and Communications Technology seal rendered on Page 1 and running headers."
    },
    {
      key: "bagong_pilipinas_logo",
      group: "governance",
      title: "Official Bagong Pilipinas Logo",
      section: "Cover Page & Running Header",
      defaultRole: "logo",
      description: "National governance emblem featured in the top-right header of the official DICT v.2026 template."
    },
    { 
      key: "org_chart", 
      group: "organization", 
      title: "Part I.B: Agency Organizational Structure Hierarchy", 
      section: "Section I.B Organizational Structure",
      defaultRole: "full_page_diagram",
      description: "Comprehensive agency hierarchy showing the reporting structure and administrative placement of the ICT unit."
    },
    { 
      key: "network_diagram", 
      group: "network", 
      title: "Part II.B.1: Existing Network Infrastructure Topology (LAN/WAN Setup)", 
      section: "Section II.B.1 Existing LAN/WAN",
      defaultRole: "full_page_diagram",
      description: "Physical and logical network diagram across central headquarters, remote field branches, and perimeter firewalls."
    },
    { 
      key: "fiber_backbone", 
      group: "network", 
      title: "Part III.A.1: Proposed Network Infrastructure & Fiber Backbone", 
      section: "Section III.A.1 Proposed LAN/WAN",
      defaultRole: "full_page_diagram",
      description: "Target future-state connectivity architecture showing redundant fiber routing, SD-WAN failover, and GovCloud hybrid interconnectivity."
    },
    { 
      key: "system_architecture", 
      group: "network", 
      title: "Part III.B: Enterprise Architecture Logical Schematic", 
      section: "Section III.B Enterprise Architecture",
      defaultRole: "full_page_diagram",
      description: "Proposed microservices containerization, PeGIF API gateways, and National Government Data Exchange (NGDX) integration."
    },
    { 
      key: "proposed_ict_org", 
      group: "organization", 
      title: "Part III.C: Proposed ICT Human Capital Structure", 
      section: "Section III.C Proposed ICT Unit",
      defaultRole: "full_page_diagram",
      description: "Visual technical staffing hierarchy complementing the Part III.C proposed headcount table."
    }
  ], []);

  const fetchDiagrams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDiagrams({
          dict_logo: data.dict_logo_url || null,
          bagong_pilipinas_logo: data.bagong_pilipinas_logo_url || null,
          agency_logo: data.agency_logo_url || null,
          org_chart: data.org_chart_url || null,
          network_diagram: data.network_diagram_url || null,
          fiber_backbone: data.fiber_backbone_url || null,
          system_architecture: data.system_architecture_url || data.conceptual_framework_url || null,
          proposed_ict_org: data.proposed_ict_org_url || null
        });

        const initialRoles = {};
        const initialPreserve = {};
        const initialTitles = {};
        categories.forEach(cat => {
          initialRoles[cat.key] = cat.defaultRole;
          initialPreserve[cat.key] = true;
          initialTitles[cat.key] = cat.title;
        });
        setAssetRoles(initialRoles);
        setAspectPreserve(initialPreserve);
        setCustomTitles(initialTitles);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to retrieve registered diagram filepaths.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeCycle) {
      fetchDiagrams();
    }
  }, [token, activeCycle]);

  const validateImageAspect = (category, file) => {
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const ratio = width / height;

      let hasWarning = false;
      let warningText = "";
      const activeRole = assetRoles[category];

      if (activeRole === "full_page_diagram") {
        if (ratio < 1.2) {
          hasWarning = true;
          warningText = `Aspect Ratio Notice: This diagram has a portrait-oriented ratio (${ratio.toFixed(2)}:1). Official DICT templates compile in A4 Landscape (1.41:1). Landscape-oriented schematics utilize the dedicated 520px height canvas with maximum visual clarity.`;
        }
      } else if (["agency_logo", "dict_logo", "bagong_pilipinas_logo"].includes(category)) {
        if (ratio < 0.75 || ratio > 1.35) {
          hasWarning = true;
          warningText = `Sizing Notice: Cover logos and running header seals render best with near-square (1:1) aspect ratios. Current ratio: ${ratio.toFixed(2)}:1.`;
        }
      }

      setAspectWarnings(prev => ({
        ...prev,
        [category]: hasWarning ? warningText : null
      }));
    };
  };

  const handleUpload = async (category, file) => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(prev => ({ ...prev, [category]: true }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("asset_role", assetRoles[category] || "full_page_diagram");
    formData.append("custom_title", customTitles[category] || "");
    formData.append("aspect_ratio_preserve", aspectPreserve[category] ? "true" : "false");

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${encodeURIComponent(activeCycle)}/upload-diagram?category=${encodeURIComponent(category)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload diagram asset.");
      }

      const resData = await res.json();
      setSuccess(`Schematic asset registered for '${categories.find(c => c.key === category)?.title || category}'.`);
      setDiagrams(prev => ({ ...prev, [category]: resData.file_url }));

      // Instantly synchronize global institutional seal across the whole frontend
      if (category === "agency_logo" && fetchActiveCycle) {
        fetchActiveCycle();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(prev => ({ ...prev, [category]: false }));
    }
  };

  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      const matchesGroup = activeGroup === "all" || cat.group === activeGroup;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || 
        cat.title.toLowerCase().includes(q) || 
        cat.section.toLowerCase().includes(q) || 
        cat.key.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [categories, activeGroup, searchTerm]);

  const stats = useMemo(() => {
    const total = categories.length;
    const uploaded = categories.filter(c => Boolean(diagrams[c.key])).length;
    const pending = total - uploaded;
    return { total, uploaded, pending };
  }, [categories, diagrams]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-xs text-slate-800 dark:text-slate-100 select-none font-sans transition-colors duration-200">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 gap-4 shadow-sm">
        <div>
          <h2 className="text-slate-900 dark:text-white font-serif font-bold text-base flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Official DICT Schematics &amp; Structural Diagram Vault</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Upload institutional seals, national co-branding emblems, and full-page architectural schematics. Uploaded agency seals immediately reflect across logins, sidebars, and compiled PDFs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDiagrams}
            disabled={loading}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Vault</span>
          </button>
        </div>
      </div>

      {/* Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Required Schematics &amp; Seals</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">{stats.total} Schematics</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Attached in Vault</span>
            <h3 className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">{stats.uploaded} Assets</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Pending Attachments</span>
            <h3 className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5">{stats.pending} Diagrams</h3>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-start gap-2.5 animate-fadeIn">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap gap-1 p-0.5 bg-slate-100 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-xl self-start">
          {[
            { id: "all", label: "All Schematics & Seals" },
            { id: "governance", label: "1. Institutional & National Seals" },
            { id: "network", label: "2. Networks & Architecture" },
            { id: "organization", label: "3. Organizational Structures" }
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
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            placeholder="Search schematic title or section..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-955 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span>Synchronizing diagram attachments...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCategories.map((cat) => {
            const isFullPage = assetRoles[cat.key] === "full_page_diagram";
            const warningText = aspectWarnings[cat.key];
            const currentUrl = diagrams[cat.key];

            return (
              <div 
                key={cat.key} 
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4 flex flex-col justify-between shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block font-mono">
                        {cat.section}
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5 mt-0.5">
                        <FileImage className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>{cat.title}</span>
                      </h3>
                    </div>
                    <span className={`text-[8.5px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider border shrink-0 ${
                      currentUrl 
                        ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                        : "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                    }`}>
                      {currentUrl ? "Attached" : "Pending"}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {cat.description}
                  </p>
                </div>

                {/* Layout Role & Aspect Settings */}
                <div className="bg-slate-50 dark:bg-slate-955 p-3 rounded-xl border border-slate-200 dark:border-slate-850 space-y-2.5">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1"><Layout className="w-3.5 h-3.5" /> PDF Page Layout:</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setAssetRoles(prev => ({ ...prev, [cat.key]: "inline_diagram" }))}
                        className={`px-2 py-0.5 rounded-lg text-[8.5px] font-bold uppercase transition-all cursor-pointer ${
                          assetRoles[cat.key] === "inline_diagram"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Inline
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssetRoles(prev => ({ ...prev, [cat.key]: "full_page_diagram" }))}
                        className={`px-2 py-0.5 rounded-lg text-[8.5px] font-bold uppercase transition-all cursor-pointer ${
                          assetRoles[cat.key] === "full_page_diagram"
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Full-Page Landscape
                      </button>
                    </div>
                  </div>

                  {isFullPage && (
                    <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-slate-850">
                      <label className="text-[9px] uppercase font-bold text-slate-500 block">Print Header Title:</label>
                      <input
                        type="text"
                        value={customTitles[cat.key] || ""}
                        onChange={(e) => setCustomTitles(prev => ({ ...prev, [cat.key]: e.target.value }))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-[10.5px] text-slate-900 dark:text-white outline-none focus:border-blue-500"
                        placeholder="Custom page header..."
                      />
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-850">
                    <span className="flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Aspect Ratio Scaling:</span>
                    <button
                      type="button"
                      onClick={() => setAspectPreserve(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                      className={`px-2 py-0.5 rounded-lg text-[8.5px] font-bold uppercase transition-all cursor-pointer ${
                        aspectPreserve[cat.key]
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                      }`}
                    >
                      {aspectPreserve[cat.key] ? "Preserve Proportion" : "Fit Full Dimensions"}
                    </button>
                  </div>
                </div>

                {warningText && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 rounded-xl flex items-start gap-1.5 text-[10px] leading-relaxed">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                    <span>{warningText}</span>
                  </div>
                )}

                {/* Preview Box */}
                {uploading[cat.key] ? (
                  <div className="bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-850 h-44 flex flex-col items-center justify-center rounded-xl">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600 mb-2" />
                    <span className="text-[10.5px] text-slate-500">Uploading and linking schematic asset...</span>
                  </div>
                ) : currentUrl ? (
                  <div className="relative group bg-slate-50 dark:bg-slate-955 p-2 rounded-xl border border-slate-200 dark:border-slate-850 h-44 flex items-center justify-center overflow-hidden">
                    <img 
                      src={currentUrl} 
                      alt={cat.title} 
                      className="max-w-full max-h-full object-contain rounded-lg" 
                    />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: currentUrl, title: cat.title })}
                        className="p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl shadow-md hover:bg-slate-100 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Full Image</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-955 border border-dashed border-slate-300 dark:border-slate-800 h-44 flex flex-col items-center justify-center rounded-xl text-slate-400 dark:text-slate-600 font-medium italic gap-1.5">
                    <FileImage className="w-8 h-8 opacity-40" />
                    <span>No schematic registered for this section</span>
                  </div>
                )}

                {/* File Upload Selector */}
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/jpg, image/gif"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        validateImageAspect(cat.key, file);
                        handleUpload(cat.key, file);
                      }
                    }}
                    className="w-full text-slate-500 dark:text-slate-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL-SIZE PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-955">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">{previewImage.title}</h3>
                <span className="text-[10px] text-slate-500 font-mono">Full-Resolution Preview</span>
              </div>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-auto">
              <img 
                src={previewImage.url} 
                alt={previewImage.title} 
                className="max-w-full max-h-[75vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
