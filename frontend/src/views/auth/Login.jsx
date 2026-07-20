// frontend/src/views/auth/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { login } from '../../api/auth';
import { Lock } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { loginSession } = useAuth();

  const [email, setEmail] = useState('');
  // Initialize with blank defaults to enforce secure user input
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Connect to the backend to authenticate credentials against target storage
      const data = await login(email, password);
      
      // Register session variables
      loginSession(data.access_token, data.role, data.department_id);

      // Route directly to unified dashboard pathway where roles are parsed
      if (data.role === 'ROLE_MIS_ADMIN' || data.role === 'ROLE_DEPT_USER') {
        navigate('/dashboard');
      } else {
        setError('Unauthorized role allocation.');
      }
    } catch (err) {
      // General error message to prevent account enumeration vectors
      setError('Invalid institutional credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    // Standard OAuth token verification requires client-side Google SDK integration.
    // Standard database-backed credentials should be used for core deployments.
    setError("Google Workspace Login requires the client-side Google SDK integration. Please use standard credentials below.");
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 overflow-hidden px-4">
      {/* Radial Background Blob */}
      <div 
        className="absolute pointer-events-none" 
        style={{ 
          top: '-30%', 
          left: '-20%', 
          width: '140%', 
          height: '120%', 
          background: 'radial-gradient(circle, #112d55 0%, transparent 60%)', 
          opacity: 0.6, 
          zIndex: 0 
        }} 
      />

      {/* Dark Auth Card Container */}
      <div className="w-full max-w-[460px] bg-slate-900 rounded-[20px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)] p-8 md:p-10 border border-slate-800 z-10 flex flex-col">
        
        {/* Logo and Brand Header */}
        <div className="flex flex-col items-center justify-center gap-4 mb-8 text-center">
          <div className="w-[54px] h-[54px] bg-gradient-to-br from-blue-600 to-[#60a5fa] rounded-[14px] grid grid-cols-2 gap-1 p-3 shadow-[0_4px_12px_rgba(13,110,253,0.25)]">
            <div className="bg-white rounded-[3px]" />
            <div className="bg-white rounded-[3px]" />
            <div className="bg-white rounded-[3px]" />
            <div className="bg-white rounded-[3px]" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-white font-semibold tracking-wide m-0 mb-1">CSPC-E-ISSP</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[1.5px] m-0">Unified Login</p>
          </div>
        </div>

        <h2 className="text-center font-serif text-[1.8rem] text-white font-medium mb-2">Welcome Back</h2>
        <p className="text-center text-slate-300 text-sm mb-6 leading-relaxed">
          Sign in to the Electronic ISSP platform using your CSPC Google Workspace account.
        </p>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-900 text-red-300 text-xs font-semibold rounded-md text-center">
            {error}
          </div>
        )}

        {/* Primary Auth Trigger: Google Mail */}
        <button 
          onClick={handleGoogleAuth}
          disabled={loading}
          type="button" 
          className="flex items-center justify-center gap-3 w-full p-3 bg-slate-950 border border-slate-800 rounded-[10px] text-slate-200 text-sm font-medium hover:bg-slate-800 hover:border-slate-700 transition-all duration-200 shadow-sm disabled:opacity-50"
        >
          <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with CSPC Mail
        </button>

        <div className="flex items-center my-6 text-[10px] text-slate-500 font-bold uppercase tracking-[1px] before:content-[''] before:flex-1 before:border-b before:border-slate-800 before:mr-4 after:content-[''] after:flex-1 after:border-b after:border-slate-800 after:ml-4">
          or use standard credentials
        </div>

        {/* Fallback Standard Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-300 font-semibold">Institutional Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-[10px] text-sm text-white focus:border-blue-600 focus:ring-4 focus:ring-blue-900/30 outline-none transition-all placeholder:text-slate-600"
              placeholder="yourname@cspc.edu.ph" 
              required 
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs text-slate-300 font-semibold">Password</label>
              <a href="#" className="text-xs text-blue-500 hover:text-blue-400 hover:underline font-semibold">Forgot password?</a>
            </div>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-[10px] text-sm text-white focus:border-blue-600 focus:ring-4 focus:ring-blue-900/30 outline-none transition-all tracking-[2px] placeholder:text-slate-600"
              placeholder="•••••••••" 
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full p-3.5 mt-2 bg-blue-600 border-none rounded-[10px] text-white text-sm font-semibold cursor-pointer transition-all shadow-[0_4px_6px_-1px_rgba(13,110,253,0.2)] hover:bg-blue-500 hover:shadow-[0_6px_8px_-1px_rgba(13,110,253,0.3)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Securing Session...' : 'Secure Sign In'}
          </button>
        </form>

        {/* Standard Institutional Footer */}
        <div className="text-center text-slate-400 text-[11px] leading-relaxed mt-6 pt-6 border-t border-slate-800">
          <span className="font-medium text-slate-300 flex items-center justify-center gap-1 mb-1">
            <Lock className="w-3 h-3 text-slate-400" /> Protected by CSPC MIS Division
          </span>
          &copy; Camarines Sur Polytechnic Colleges. All rights reserved.
        </div>

      </div>
    </div>
  );
}