import React, { useState, useEffect } from 'react';
import { getNeedsAssessments, createNeedsAssessment } from '../../../api/dept';
import { ClipboardCheck, FileText, AlertCircle, RefreshCw } from 'lucide-react';

export default function NeedsAssessment() {
  const [needs, setNeeds] = useState([]);
  const [title, setTitle] = useState('');
  const [mfo, setMfo] = useState('he');
  const [problem, setProblem] = useState('');
  const [solution, setProposedSolution] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchNeeds = () => {
    setLoading(true);
    getNeedsAssessments()
      .then(setNeeds)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNeeds();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await createNeedsAssessment({
        title,
        mfo_alignment: mfo,
        current_problem: problem,
        proposed_solution: solution
      });
      setTitle('');
      setProblem('');
      setProposedSolution('');
      fetchNeeds();
      alert('Needs Assessment submitted successfully.');
    } catch (err) {
      alert(err.message || 'Failed to submit needs assessment.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs text-slate-100 select-none">
      
      {/* Assessment Form Box */}
      <form onSubmit={handleSave} className="lg:col-span-2 bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-4 h-fit">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
          <ClipboardCheck className="w-5 h-5 text-blue-500" />
          <span>Submit Needs Assessment (Sec 8.0)</span>
        </h3>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Assessment Title</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-600" 
            placeholder="e.g. Obsolete Networking Upgrades for CAD Laboratories"
            required 
          />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">MFO Alignment</label>
          <select 
            value={mfo} 
            onChange={(e) => setMfo(e.target.value)} 
            className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white outline-none cursor-pointer focus:ring-1 focus:ring-blue-600 transition-all"
          >
            <option value="he" className="bg-slate-900 text-slate-200">Advanced and Higher Education Services</option>
            <option value="rs" className="bg-slate-900 text-slate-200">Research Services</option>
            <option value="es" className="bg-slate-900 text-slate-200">Extension Services</option>
            <option value="admin" className="bg-slate-900 text-slate-200">General Administrative and Support Services (GASS)</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Problem / Bottleneck</label>
          <textarea 
            value={problem} 
            onChange={(e) => setProblem(e.target.value)} 
            rows="3" 
            className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-700" 
            placeholder="Describe active vulnerabilities or hardware limits..."
            required 
          />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Proposed Solution</label>
          <textarea 
            value={solution} 
            onChange={(e) => setProposedSolution(e.target.value)} 
            rows="3" 
            className="w-full p-2.5 bg-slate-955 border border-slate-850 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-700" 
            placeholder="Identify the strategic technical interventions..."
            required 
          />
        </div>
        
        <button 
          type="submit" 
          className="w-full p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all cursor-pointer"
        >
          Submit Assessment to Queue
        </button>
      </form>

      {/* History Log Box */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[500px]">
        <div className="p-4 bg-slate-955 border-b border-slate-800 font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
          <span>Recent Assessments Log</span>
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />}
        </div>
        
        <div className="divide-y divide-slate-850 overflow-y-auto flex-grow">
          {needs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 italic h-full flex items-center justify-center">
              No recent needs assessments logged.
            </div>
          ) : (
            needs.map(item => (
              <div key={item.id} className="p-4 space-y-2 hover:bg-slate-955/20 transition-all">
                <div className="font-bold text-slate-200 flex items-start gap-1.5">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>{item.title}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  MFO Code Alignment: <span className="text-slate-400 font-bold uppercase">{item.mfo_alignment}</span>
                </div>
                <div className="text-slate-400 text-[11px] leading-relaxed truncate" title={item.current_problem}>
                  {item.current_problem}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}