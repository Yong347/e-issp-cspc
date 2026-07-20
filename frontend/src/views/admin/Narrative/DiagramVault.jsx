// frontend/src/views/admin/Narrative/DiagramVault.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { ImageIcon, Upload, CheckCircle, AlertCircle, RefreshCw, FileImage } from "lucide-react";

export default function DiagramVault() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Tracks localized upload loaders per category key instead of locking the entire workspace
  const [uploading, setUploading] = useState({});

  const [diagrams, setDiagrams] = useState({
    agency_logo: null,
    cert_logo: null,
    process_flow_diagram: null,
    org_chart: null,
    functional_interface: null,
    conceptual_framework: null,
    network_layout: null,
    existing_ict_org: null,
    proposed_ict_org: null,
    placement_ict_org: null,
    site_development_plan: null,
    fiber_backbone: null,
    system_architecture: null,
    network_topology: null
  });

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const token = user?.token;

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
          network_layout: data.network_layout_url,
          existing_ict_org: data.existing_ict_org_url,
          proposed_ict_org: data.proposed_ict_org_url,
          placement_ict_org: data.placement_ict_org_url,
          site_development_plan: data.site_development_plan_url,
          fiber_backbone: data.fiber_backbone_url,
          system_architecture: data.system_architecture_url,
          network_topology: data.network_topology_url
        });
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

  const handleUpload = async (category, file) => {
    if (!file) return;
    setError(null);
    setSuccess(null);

    // Assert localized card-level loading state
    setUploading(prev => ({ ...prev, [category]: true }));

    const formData = new FormData();
    formData.append("file", file);

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

  const categories = [
    { key: "agency_logo", title: "Institutional Brand Logo" },
    { key: "cert_logo", title: "Certification Badge (TUV SUD)" },
    { key: "process_flow_diagram", title: "ISSP Process Flow Diagram (Section iii)" },
    { key: "org_chart", title: "General College Org Structure" },
    { key: "functional_interface", title: "I.C. SUC Functional Interface Diagram" },
    { key: "conceptual_framework", title: "Conceptual IS Architecture" },
    { key: "network_layout", title: "Logical LAN Network Layout" },
    { key: "existing_ict_org", title: "Part IV.B: Existing ICT Organizational Chart" },
    { key: "proposed_ict_org", title: "Part IV.B: Proposed ICT Organizational Structure" },
    { key: "placement_ict_org", title: "Part IV.B: Placement of Proposed ICT in Institutional Chart" },
    { key: "site_development_plan", title: "Annex A-2 Campus Site Development Plan" },
    { key: "network_topology", title: "CSPC Network Diagram & Core Topology (Page 129)" },
    { key: "fiber_backbone", title: "Fiber Optic Backbone Cabling Layout (Page 130)" },
    { key: "system_architecture", title: "CSPC Unified System Architecture (Page 131)" }
  ];

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
          {categories.map((cat) => (
            <div key={cat.key} className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5 uppercase tracking-wide">
                  <FileImage className="w-4 h-4 text-blue-400" />
                  <span>{cat.title}</span>
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">S3 target path: diagrams/{cat.key}/*</p>
              </div>

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
                  onChange={(e) => handleUpload(cat.key, e.target.files[0])}
                  className="w-full text-[11px] text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 file:cursor-pointer"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}