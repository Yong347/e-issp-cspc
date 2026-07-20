import React, { useState, useEffect } from 'react';
import { getInventory, logExistingAsset } from '../../../api/dept';
import StatusPill from '../../../components/common/StatusPill';
import { Database, Plus, RefreshCw, Calendar, AlertTriangle } from 'lucide-react';

export default function InventoryManager() {
  const [inventory, setInventory] = useState([]);
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState('Functional');
  const [dateAcquired, setDateAcquired] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const fetchInventory = () => {
    setLoading(true);
    getInventory()
      .then(setInventory)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleAddAsset = async (e) => {
    e.preventDefault();
    try {
      await logExistingAsset({ 
        item_name: name, 
        quantity: parseInt(qty, 10), 
        status: status,
        date_acquired: dateAcquired
      });
      setName('');
      setQty(1);
      setDateAcquired(new Date().toISOString().split('T')[0]);
      fetchInventory();
      alert('Asset logged inside database successfully (Annex A-5)');
    } catch (err) {
      alert(err.message || 'Failed to log asset.');
    }
  };

  const isObsolete = (dateString) => {
    if (!dateString) return false;
    const acqDate = new Date(dateString);
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    return acqDate < threeYearsAgo;
  };

  return (
    <div className="space-y-6 text-xs text-slate-100 select-none">
      {/* Logger Box */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
          <Database className="w-5 h-5 text-blue-500" />
          <span>Annex A-5 Baseline Inventory Logger</span>
        </h3>
        
        <form onSubmit={handleAddAsset} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Asset Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all placeholder:text-slate-600" 
              placeholder="e.g. Office PC" 
              required 
            />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Quantity</label>
            <input 
              type="number" 
              min="1"
              value={qty} 
              onChange={(e) => setQty(e.target.value)} 
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white font-mono outline-none focus:ring-1 focus:ring-blue-600 transition-all" 
              required 
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Acquisition Date</label>
            <input 
              type="date" 
              value={dateAcquired} 
              onChange={(e) => setDateAcquired(e.target.value)} 
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-white outline-none focus:ring-1 focus:ring-blue-600 transition-all font-mono cursor-pointer" 
              required 
            />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Status</label>
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value)} 
              className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-slate-100 outline-none cursor-pointer focus:ring-1 focus:ring-blue-600 transition-all"
            >
              <option value="Functional" className="bg-slate-900 text-slate-200">Functional</option>
              <option value="Needs Repair" className="bg-slate-900 text-slate-200">Needs Repair</option>
              <option value="Condemned" className="bg-slate-900 text-slate-200">Condemned</option>
            </select>
          </div>
          
          <button 
            type="submit" 
            className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Log Existing Asset</span>
          </button>
        </form>
      </div>

      {/* Registry Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-955 border-b border-slate-800 font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
          <span>Logged Asset Registry</span>
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-4">Asset Details</th>
                <th className="p-4">Quantity</th>
                <th className="p-4">Acquisition Date</th>
                <th className="p-4">Lifecycle State</th>
                <th className="p-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-slate-500 italic">
                    No physical assets registered under Annex A-5.
                  </td>
                </tr>
              ) : (
                inventory.map(item => (
                  <tr key={item.id} className="hover:bg-slate-955/20 transition-colors">
                    <td className="p-4 font-semibold text-slate-200">{item.item_name}</td>
                    <td className="p-4 font-mono text-slate-300">{item.quantity}</td>
                    <td className="p-4 font-mono text-slate-400">
                      {item.date_acquired ? new Date(item.date_acquired).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}
                    </td>
                    <td className="p-4">
                      {isObsolete(item.date_acquired) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/40 border border-amber-900 text-amber-400 text-[10px] font-bold uppercase">
                          <AlertTriangle className="w-3 h-3" />
                          <span>&gt; 3 Years Old</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-semibold uppercase">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <StatusPill status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}