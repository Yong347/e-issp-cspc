// frontend/src/views/admin/Narrative/DiagramVault.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  ImageIcon, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  FileImage, 
  Maximize, 
  Minimize, 
  Layout, 
  Settings2,
  FileText
} from "lucide-react";

export default function DiagramVault() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Card-specific operational states
  const [uploading, setUploading] = useState({});
  const [assetRoles, setAssetRoles] = useState({});
  const [customTitles, setCustomTitles] = useState({});
  const [aspectPreserve, setAspectPreserve] = useState({});
  const [aspectWarnings, setAspectWarnings] = useState({});

  const [diagrams, setDiagrams] = useState({
    agency_logo: null,
    cert_logo: null,
    process_flow_diagram: null,
    org_chart: null,
    functional_interface: null,
    conceptual_framework: null,
    net_layout_sias: null,
    net_layout_library: null,
    net_layout_security: null,
    net_layout_hris: null,
    net_layout_dms: null,
    net_layout_supplies: null,
    net_layout_budget: null,
    net_layout_sias_upgrade: null,
    net_layout_extension: null,
    existing_ict_org: null,
    proposed_ict_org: null,
    placement_ict_org: null,
    b_3_a_ict_org: null,
    site_development_plan: null,
    network_diagram: null,
    fiber_backbone: null,
    system_architecture: null
  });

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

  const categories = [
    { key: "agency_logo", title: "Institutional Brand Logo (Page 1)", defaultRole: "logo" },
    { key: "cert_logo", title: "TUV SUD Certification Badge (Page 1)", defaultRole: "logo" },
    { key: "process_flow_diagram", title: "ISSP Process Flow Diagram (Page 5)", defaultRole: "full_page_diagram" },
    { key: "org_chart", title: "General SUC Org Structure (Page 15)", defaultRole: "full_page_diagram" },
    { key: "functional_interface", title: "I.C. SUC Functional Interface Diagram (Page 18)", defaultRole: "full_page_diagram" },
    { key: "conceptual_framework", title: "Conceptual IS Architecture (Page 33)", defaultRole: "full_page_diagram" },
    
    // Explicitly separated system network layouts
    { key: "net_layout_sias", title: "Network Layout: SIAS / Enrollment (Page 52)", defaultRole: "full_page_diagram" },
    { key: "net_layout_library", title: "Network Layout: Library IS (Page 53)", defaultRole: "full_page_diagram" },
    { key: "net_layout_security", title: "Network Layout: School Security (Page 54)", defaultRole: "full_page_diagram" },
    { key: "net_layout_hris", title: "Network Layout: HRIS & Payroll (Page 55)", defaultRole: "full_page_diagram" },
    { key: "net_layout_dms", title: "Network Layout: Document Management (Page 56)", defaultRole: "full_page_diagram" },
    { key: "net_layout_supplies", title: "Network Layout: Supplies Management (Page 57)", defaultRole: "full_page_diagram" },
    { key: "net_layout_budget", title: "Network Layout: Budget Management (Page 58)", defaultRole: "full_page_diagram" },
    { key: "net_layout_sias_upgrade", title: "Network Layout: SIAS / Accounting (Page 59)", defaultRole: "full_page_diagram" },
    { key: "net_layout_extension", title: "Network Layout: Extension Services (Page 60)", defaultRole: "full_page_diagram" },

    // SUC Organizational Charts
    { key: "existing_ict_org", title: "Part IV.B: Existing ICT Organizational Structure (Page 100)", defaultRole: "full_page_diagram" },
    { key: "proposed_ict_org", title: "Part IV.B: Proposed ICT Organizational Structure (Page 101)", defaultRole: "full_page_diagram" },
    { key: "placement_ict_org", title: "Part IV.B: Placement of Proposed ICT (Page 102)", defaultRole: "full_page_diagram" },
    { key: "b_3_a_ict_org", title: "Part IV.B: SUC MIS/ICT Org Chart (Page 103)", defaultRole: "full_page_diagram" },

    // Annex layouts
    { key: "site_development_plan", title: "Annex A-2: Campus Site Development Plan (Page 128)", defaultRole: "full_page_diagram" },
    { key: "network_diagram", title: "Annex A-2: CSPC Network Diagram (Page 129)", defaultRole: "full_page_diagram" },
    { key: "fiber_backbone", title: "Annex A-2: Fiber Optic Backbone Cabling Layout (Page 130)", defaultRole: "full_page_diagram" },
    { key: "system_architecture", title: "Annex A-2: CSPC Unified System Architecture (Page 131)", defaultRole: "full_page_diagram" }
  ];

  const fetchDiagrams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDiagrams({
          agency_logo: data.agency_logo_url,
          cert_logo: data.cert_logo_url,
          process_flow_diagram: data.process_flow_diagram_url,
          org_chart: data.org_chart_url,
          functional_interface: data.functional_interface_url,
          conceptual_framework: data.conceptual_framework_url,
          net_layout_sias: data.net_layout_sias_url,
          net_layout_library: data.net_layout_library_url,
          net_layout_security: data.net_layout_security_url,
          net_layout_hris: data.net_layout_hris_url,
          net_layout_dms: data.net_layout_dms_url,
          net_layout_supplies: data.net_layout_supplies_url,
          net_layout_budget: data.net_layout_budget_url,
          net_layout_sias_upgrade: data.net_layout_sias_upgrade_url,
          net_layout_extension: data.net_layout_extension_url,
          existing_ict_org: data.existing_ict_org_url,
          proposed_ict_org: data.proposed_ict_org_url,
          placement_ict_org: data.placement_ict_org_url,
          b_3_a_ict_org: data.b_3_a_ict_org_url,
          site_development_plan: data.site_development_plan_url,
          network_diagram: data.network_diagram_url,
          fiber_backbone: data.fiber_backbone_url,
          system_architecture: data.system_architecture_url
        });

        // Initialize layout properties from metadata dynamically
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
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to retrieve existing diagram paths.");
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
          warningText = `Sizing Warning: This diagram has a portrait-leaning aspect ratio (${ratio.toFixed(2)}). Full-Page Charts must be landscape oriented to prevent layout overflows.`;
        }
      } else if (category === "agency_logo" || category === "cert_logo") {
        if (ratio < 0.8 || ratio > 1.2) {
          hasWarning = true;
          warningText = `Sizing Warning: Branding logos should ideally have a 1:1 aspect ratio. High variance (${ratio.toFixed(2)}) may cause header line shifts.`;
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
    formData.append("asset_role", assetRoles[category]);
    formData.append("custom_title", customTitles[category]);
    formData.append("aspect_ratio_preserve", aspectPreserve[category] ? "true" : "false");

    try {
      const res = await fetch(`${apiUrl}/api/admin/narratives/${activeCycle}/upload-diagram?category=${category}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to upload diagram.");
      }

      const resData = await res.json();
      setSuccess(`Successfully uploaded diagram for: '${category}'`);
      setDiagrams(prev => ({ ...prev, [category]: resData.file_url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(prev => ({ ...prev, [category]: false }));
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-xs text-slate-100 select-none">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-blue-500" />
            <span>DICT Standard Schematics & Diagram Vault</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Store and manage high-resolution architecture diagrams. File sizes are capped at 5MB per upload.
          </p>
        </div>
        <button
          onClick={fetchDiagrams}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Lists</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-955/40 border border-red-900/30 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-900/30 text-emerald-300 rounded-lg flex items-start gap-2.5">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span>Reading active attachments...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {categories.map((cat) => {
            const isFullPage = assetRoles[cat.key] === "full_page_diagram";
            const warningText = aspectWarnings[cat.key];

            return (
              <div key={cat.key} className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5 uppercase tracking-wide">
                      <FileImage className="w-4 h-4 text-blue-400" />
                      <span>{cat.title}</span>
                    </h3>
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-950 border border-slate-800 text-slate-500 rounded font-mono font-bold uppercase">
                      {assetRoles[cat.key]}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">S3 target path: diagrams/{cat.key}/*</p>
                </div>

                {/* layout configurator properties panel */}
                <div className="bg-slate-955/60 p-3 rounded-lg border border-slate-850/80 space-y-3 font-sans">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1"><Layout className="w-3.5 h-3.5" /> Layout Role:</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAssetRoles(prev => ({ ...prev, [cat.key]: "inline_diagram" }))}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                          assetRoles[cat.key] === "inline_diagram"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900 text-slate-500"
                        }`}
                      >
                        Inline Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssetRoles(prev => ({ ...prev, [cat.key]: "full_page_diagram" }))}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                          assetRoles[cat.key] === "full_page_diagram"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900 text-slate-500"
                        }`}
                      >
                        Full-Page Chart
                      </button>
                    </div>
                  </div>

                  {isFullPage && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <span className="text-[9px] uppercase font-bold text-slate-500 block">Print Custom Title Header:</span>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-600">
                          <FileText className="w-3.5 h-3.5" />
                        </span>
                        <input
                          type="text"
                          value={customTitles[cat.key] || ""}
                          onChange={(e) => setCustomTitles(prev => ({ ...prev, [cat.key]: e.target.value }))}
                          className="w-full pl-8 pr-2 py-1.5 bg-slate-900 border border-slate-800 rounded text-[11px] text-white outline-none focus:border-blue-500 font-mono"
                          placeholder="Print Title..."
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Preserve Native Aspect:</span>
                    <button
                      type="button"
                      onClick={() => setAspectPreserve(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                      className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition-all ${
                        aspectPreserve[cat.key]
                          ? "bg-emerald-600 text-white"
                          : "bg-red-955/40 text-red-400 border border-red-900/30"
                      }`}
                    >
                      {aspectPreserve[cat.key] ? "ENABLED" : "DISABLED (STRETCH)"}
                    </button>
                  </div>
                </div>

                {warningText && (
                  <div className="p-2.5 bg-amber-955/20 border border-amber-900/30 text-amber-400 rounded-lg flex items-start gap-1.5 leading-relaxed text-[10px] font-semibold animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{warningText}</span>
                  </div>
                )}

                {uploading[cat.key] ? (
                  <div className="bg-slate-955 border border-slate-850 h-40 flex flex-col items-center justify-center rounded-lg">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-500 mb-2" />
                    <span className="text-[10px] text-slate-500">Uploading diagram binary...</span>
                  </div>
                ) : diagrams[cat.key] ? (
                  <div className="bg-slate-955 p-2 rounded-lg border border-slate-850 h-40 flex items-center justify-center overflow-hidden">
                    <img src={diagrams[cat.key]} alt={cat.title} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="bg-slate-955 border border-dashed border-slate-850 h-40 flex items-center justify-center rounded-lg text-slate-600 font-semibold italic">
                    No diagram registered
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 border-t border-slate-850/80 pt-3 text-xs">
                  <input 
                    type="file" accept="image/png, image/jpeg, image/jpg, image/gif"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      validateImageAspect(cat.key, file);
                      handleUpload(cat.key, file);
                    }}
                    className="w-full text-[11px] text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 file:cursor-pointer"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}