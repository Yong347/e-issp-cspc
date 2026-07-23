// frontend/src/views/admin/Instructions/InstructionsManager.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import {
  getInstructions,
  createInstruction,
  updateInstruction,
  deleteInstruction
} from "../../../api/admin";
import {
  Save,
  Plus,
  Trash2,
  Edit,
  ClipboardList,
  X,
  AlertCircle,
  CheckCircle,
  Hash
} from "lucide-react";

export default function InstructionsManager() {
  const { user } = useAuth();
  const [instructions, setInstructions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [form, setForm] = useState({
    step_number: 1,
    instruction_text: ""
  });
  const [editId, setEditId] = useState(null);

  // Notifications
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchInstructionsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInstructions(user.token);
      // Sort instructions sequentially by step number ascending
      const sorted = data.sort((a, b) => a.step_number - b.step_number);
      setInstructions(sorted);
      
      // Auto-populate the next sequential step number for convenience
      if (!editId) {
        const nextStep = sorted.length > 0 ? sorted[sorted.length - 1].step_number + 1 : 1;
        setForm(f => ({ ...f, step_number: nextStep }));
      }
    } catch (err) {
      setError(err.message || "Failed to load submission instructions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchInstructionsList();
    }
  }, [user]);

  const validateForm = () => {
    if (form.step_number <= 0) return "Step number must be a positive integer greater than zero.";
    if (!form.instruction_text.trim()) return "Instruction guideline text is required.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        step_number: parseInt(form.step_number, 10),
        instruction_text: form.instruction_text.trim()
      };

      if (editId) {
        await updateInstruction(user.token, editId, payload);
        setSuccess("Instruction guideline updated successfully.");
      } else {
        // Prevent duplicate step indices locally before submission
        const isDuplicate = instructions.some(i => i.step_number === payload.step_number);
        if (isDuplicate) {
          setError(`Step number ${payload.step_number} is already registered. Please edit the existing step or use a different index.`);
          setSubmitting(false);
          return;
        }
        await createInstruction(user.token, payload);
        setSuccess("Instruction guideline added successfully.");
      }

      // Reset form fields
      setForm({
        step_number: instructions.length + 2,
        instruction_text: ""
      });
      setEditId(null);
      fetchInstructionsList();
    } catch (err) {
      setError(err.message || "Failed to save submission instructions.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (inst) => {
    setError(null);
    setSuccess(null);
    setEditId(inst.id);
    setForm({
      step_number: inst.step_number,
      instruction_text: inst.instruction_text
    });
  };

  const handleCancelEdit = () => {
    setEditId(null);
    const nextStep = instructions.length > 0 ? instructions[instructions.length - 1].step_number + 1 : 1;
    setForm({
      step_number: nextStep,
      instruction_text: ""
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently remove this submission instruction step?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteInstruction(user.token, id);
      setSuccess("Instruction step removed from registry.");
      fetchInstructionsList();
    } catch (err) {
      setError(err.message || "Failed to delete instruction step.");
    }
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 max-w-7xl mx-auto">
      {/* Title block */}
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-400" />
            <span>General Submission Instructions Configuration (Page 11)</span>
          </h2>
          <p className="text-slate-400 mt-1">Manage global sequential instructions and guidelines rendered on the document compilation page.</p>
        </div>
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
        {/* Step configuration form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
          <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
            {editId ? <Edit className="w-4 h-4 text-amber-400" /> : <Plus className="w-4 h-4 text-indigo-500" />}
            <span>{editId ? "Update Instruction Step" : "Append Instruction Step"}</span>
          </h3>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Hash className="w-3 h-3 text-slate-500" />
              <span>Step Execution Order</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.step_number}
              onChange={e => setForm({ ...form, step_number: parseInt(e.target.value, 10) || 1 })}
              className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white font-mono font-bold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Instruction Description Text</label>
            <textarea
              placeholder="Provide clean and descriptive guideline rules rendered on the submission guidelines sections..."
              value={form.instruction_text}
              onChange={e => setForm({ ...form, instruction_text: e.target.value })}
              className="w-full p-2.5 bg-slate-955 border border-slate-855 rounded-lg text-white h-36 resize-none leading-relaxed"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            {editId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`py-2.5 rounded font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer transition-all ${
                editId 
                  ? "bg-amber-600 hover:bg-amber-500 w-2/3" 
                  : "bg-indigo-600 hover:bg-indigo-500 w-full"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{submitting ? "Preserving..." : editId ? "Update Step" : "Save Step"}</span>
            </button>
          </div>
        </form>

        {/* Directory Sequential Display */}
        <div className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-300 text-xs border-b border-slate-850 pb-3">
            Guidelines Step Sequencer Matrix
          </h3>

          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-16 text-slate-500">
                <ClipboardList className="w-6 h-6 animate-pulse mx-auto mb-2 text-indigo-500" />
                <span>Reading sequential index guidelines...</span>
              </div>
            ) : instructions.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {instructions.map((inst, index) => (
                  <div key={inst.id} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex items-start gap-4 hover:border-slate-700 transition-colors">
                    
                    {/* Index Circle Indicator */}
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-950/50 border border-indigo-900 text-indigo-400 font-mono font-bold shrink-0">
                      {inst.step_number}
                    </span>

                    <div className="flex-1 space-y-2">
                      <p className="text-slate-300 leading-relaxed break-words">{inst.instruction_text}</p>
                    </div>

                    {/* Actions block */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(inst)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-855 rounded border border-slate-800 text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                        title="Edit Guideline"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(inst.id)}
                        className="p-1.5 bg-slate-900 hover:bg-slate-855 rounded border border-slate-800 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                        title="Purge Guideline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500 italic">
                No guideline steps logged in sequential execution profiles.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}