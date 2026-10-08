// frontend/src/views/auth/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCycle } from '../../context/CycleContext';
import { useTheme } from '../../context/ThemeContext';
import { login } from '../../api/auth';
import { 
  Shield, 
  ArrowRight, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  Lock,
  Sun,
  Moon
} from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { loginSession } = useAuth();
  const { agencyName: ctxAgencyName, agencyLogoUrl } = useCycle();
  const { theme, toggleTheme } = useTheme();

  // Strict clean state: NO pre-filled credentials or demo accounts
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const appTitle = import.meta.env.VITE_APP_TITLE || "e-ISSP Compliance Engine";
  const defaultAgencyName = import.meta.env.VITE_DEFAULT_AGENCY_NAME || "National Government Agency";
  const agencyName = import.meta.env.VITE_AGENCY_NAME || ctxAgencyName || defaultAgencyName;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await login(email.trim().toLowerCase(), password);
      loginSession(data.access_token, data.role, data.department_id);

      if (data.role === 'ROLE_MIS_ADMIN') {
        navigate('/admin/dashboard');
      } else if (data.role === 'ROLE_SUPPLY_USER') {
        navigate('/supply/inventory');
      } else if (data.role === 'ROLE_DEPT_USER') {
        navigate('/dept/dashboard');
      } else {
        setError('Unauthorized role allocation. Contact your MIS Administrator.');
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#edf3fa] dark:bg-[#0b1329] text-slate-800 dark:text-slate-100 overflow-hidden px-4 select-none font-sans transition-colors duration-200">
      
      {/* Light / Dark Mode Toggle Button */}
      <div className="absolute top-6 right-6 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-[#f7fafc] dark:bg-slate-900 border border-[#cbd8e6] dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-[#eef4fb] dark:hover:bg-slate-800 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 font-bold text-xs"
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>

      {/* Ambient Radial Soft Glow */}
      <div 
        className="absolute pointer-events-none" 
        style={{ 
          top: '-20%', 
          left: '-20%', 
          width: '140%', 
          height: '140%', 
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 65%)', 
          zIndex: 0 
        }} 
      />

      {/* Card Container: Soft Tinted Ice-Blue Slate Surface */}
      <div className="w-full max-w-md bg-[#f7fafc] dark:bg-slate-900 rounded-2xl p-8 border border-[#cbd8e6] dark:border-slate-800 z-10 shadow-xl space-y-6">
        
        {/* Institutional Branding Header linked to Uploaded Seal */}
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-[#eef4fb] dark:bg-slate-800 border border-[#cbd8e6] dark:border-slate-700 p-1.5 flex items-center justify-center shadow-xs overflow-hidden shrink-0">
            {agencyLogoUrl ? (
              <img 
                src={agencyLogoUrl} 
                alt={agencyName} 
                className="w-full h-full object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white">
                <Shield className="w-7 h-7" />
              </div>
            )}
          </div>
          <div>
            <h1 className="font-serif text-lg text-slate-900 dark:text-white font-bold tracking-tight">{appTitle}</h1>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-mono uppercase tracking-widest mt-0.5">{agencyName}</p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 dark:bg-slate-950 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Security-Hardened Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Institutional Email
            </label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 bg-[#eef4fb] dark:bg-slate-950 border border-[#cbd8e6] dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono placeholder:text-slate-400"
              placeholder="username@agency.gov.ph" 
              autoComplete="username"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2.5 pr-10 bg-[#eef4fb] dark:bg-slate-955 border border-[#cbd8e6] dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono placeholder:text-slate-400"
                placeholder="••••••••••••" 
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            <span>{loading ? 'Authenticating Credentials...' : 'Sign In to Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Security Compliance Guarantee */}
        <div className="pt-4 border-t border-[#cbd8e6] dark:border-slate-800 space-y-2 text-center text-[10px] text-slate-500 dark:text-slate-400 font-mono">
          <div className="flex items-center justify-center gap-1.5 text-slate-700 dark:text-slate-300 font-bold">
            <Lock className="w-3.5 h-3.5 text-blue-500" />
            <span>DICT ISSP v.2026 CSPC © All rights reserved</span>
          </div>
          <p className="text-[9.5px] text-slate-400 dark:text-slate-500 leading-tight">
            Official Government System &bull; Unauthorized access prohibited
          </p>
        </div>
      </div>
    </div>
  );
}