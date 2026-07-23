// frontend/src/views/admin/Narrative/TransmittalLetterPreview.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCycle } from "../../../context/CycleContext";
import { 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle,
  FileText,
  Mail,
  User,
  MapPin,
  Calendar
} from "lucide-react";

export default function TransmittalLetterPreview() {
  const { user } = useAuth();
  const { activeCycle } = useCycle();
  
  // Transmittal configuration state
  const [form, setForm] = useState({
    transmittal_recipient: "",
    transmittal_recipient_title: "",
    transmittal_recipient_agency: "",
    transmittal_recipient_address: "",
    transmittal_date: "",
    signatory_approved_by: ""
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const apiEndpoint = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const fetchTransmittalDetails = async () => {
    if (!activeCycle || !user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiEndpoint}/api/admin/narratives/${activeCycle}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to load SUC transmittal details.");
      }
      const data = await res.json();
      setForm({
        transmittal_recipient: data.transmittal_recipient || "",
        transmittal_recipient_title: data.transmittal_recipient_title || "",
        transmittal_recipient_agency: data.transmittal_recipient_agency || "",
        transmittal_recipient_address: data.transmittal_recipient_address || "",
        transmittal_date: data.transmittal_date || "",
        signatory_approved_by: data.signatory_approved_by || ""
      });
    } catch (err) {
      setError(err.message || "Failed to retrieve transmittal configurations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token && activeCycle) {
      fetchTransmittalDetails();
    }
  }, [user, activeCycle]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.token || !activeCycle) {
      setError("Session expired. Please log in again.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiEndpoint}/api/admin/narratives/${activeCycle}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        throw new Error("Failed to preserve transmittal letter metadata.");
      }

      setSuccess("Transmittal letter layout configurations updated successfully.");
      fetchTransmittalDetails();
    } catch (err) {
      setError(err.message || "Failed to update transmittal parameters.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto select-none">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span>Letter of Transmittal Layout Configurator</span>
          </h2>
          <p className="text-slate-400 mt-1">Configure formal recipient lines, addresses, dates, and preview formatting styles.</p>
        </div>
        <button
          onClick={fetchTransmittalDetails}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
          title="Refresh Metadata"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Editor Form Panel */}
        <form onSubmit={handleSave} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-white text-sm border-b border-slate-800 pb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-500" />
            <span>Transmittal Address Settings</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-slate-500" />
              <span>Recipient Name</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Director General, DICT"
              value={form.transmittal_recipient}
              onChange={e => setForm({ ...form, transmittal_recipient: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recipient Title</label>
              <input
                type="text"
                placeholder="e.g. Regional Director"
                value={form.transmittal_recipient_title}
                onChange={e => setForm({ ...form, transmittal_recipient_title: e.target.value })}
                className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recipient Agency</label>
              <input
                type="text"
                placeholder="e.g. Department of Information and Communications Technology"
                value={form.transmittal_recipient_agency}
                onChange={e => setForm({ ...form, transmittal_recipient_agency: e.target.value })}
                className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-500" />
              <span>Agency Address</span>
            </label>
            <textarea
              placeholder="Full mailing address block..."
              value={form.transmittal_recipient_address}
              onChange={e => setForm({ ...form, transmittal_recipient_address: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white h-20 resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>Transmittal Date</span>
              </label>
              <input
                type="text"
                placeholder="e.g. July 18, 2026"
                value={form.transmittal_date}
                onChange={e => setForm({ ...form, transmittal_date: e.target.value })}
                className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">SUC Signatory Approved By</label>
              <input
                type="text"
                placeholder="e.g. Dr. Charlito P. Cadag"
                value={form.signatory_approved_by}
                onChange={e => setForm({ ...form, signatory_approved_by: e.target.value })}
                className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? "Preserving Parameters..." : "Save Transmittal Configuration"}</span>
          </button>
        </form>

        {/* Live Formal Print Preview Sheet */}
        <div className="space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Document Print Preview Model</span>
          <div className="bg-white rounded-xl p-12 shadow-2xl text-slate-800 aspect-[1/1.38] flex flex-col justify-between font-serif border border-slate-200">
            
            {/* Document Body */}
            <div className="space-y-8 text-[11px] leading-relaxed">
              
              {/* Emulated SUC Header Letterhead */}
              <div className="text-center border-b pb-4 border-slate-300 font-sans">
                <h2 className="font-bold text-sm tracking-wide text-blue-900 uppercase">Camarines Sur Polytechnic Colleges</h2>
                <p className="text-[9px] text-slate-500 mt-0.5 font-semibold">Nabua, Camarines Sur | Republic of the Philippines</p>
              </div>

              {/* Date Block */}
              <div className="text-slate-700 font-mono text-[10px] tracking-tight">
                {form.transmittal_date || "Date of Submission"}
              </div>

              {/* Recipient Lines */}
              <div className="space-y-0.5 text-slate-800 font-bold">
                <div className="uppercase tracking-tight text-slate-900">{form.transmittal_recipient || "RECIPIENT NAME"}</div>
                <div className="text-slate-600 text-[10px]">{form.transmittal_recipient_title || "Position Title"}</div>
                <div className="text-slate-600 text-[10px]">{form.transmittal_recipient_agency || "Agency / Institution"}</div>
                <div className="font-normal text-slate-500 mt-1 whitespace-pre-wrap max-w-sm text-[10px] leading-relaxed font-sans block">
                  {form.transmittal_recipient_address || "Mailing Address Block"}
                </div>
              </div>

              {/* Formal Text */}
              <div className="space-y-4 text-slate-600 text-justify">
                <p className="indent-8">
                  Pursuant to national regulatory protocols, we have the honor to respectfully submit the Information Systems Strategic Plan (ISSP) of the Camarines Sur Polytechnic Colleges for the FY {activeCycle || "Planning Period"}, for your evaluation and appropriate endorsement.
                </p>
                <p className="indent-8">
                  The plan captures administrative investments, institutional systems integration targets, hardware census counts, and multi-year SUC developmental outlays compiled in alignment with the national ICT guidelines.
                </p>
              </div>
            </div>

            {/* Formal Signoff Block */}
            <div className="text-slate-700 text-[11px] pt-8 border-t border-slate-100 flex justify-between items-end">
              <div>
                <p className="italic">Very truly yours,</p>
                <div className="mt-8 font-sans">
                  <span className="text-blue-900 font-bold underline uppercase block tracking-wide font-serif">{form.signatory_approved_by || "SUC PRESIDENT NAME"}</span>
                  <span className="text-slate-400 text-[9px] block mt-0.5 font-semibold">SUC President III</span>
                </div>
              </div>
              
              {/* Emulated Stamp Spacer */}
              <div className="border border-dashed border-slate-300 rounded p-3 text-center w-28 h-16 flex items-center justify-center font-sans text-[8px] text-slate-400 uppercase select-none">
                Official Seal / Stamp Here
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}