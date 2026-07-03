import React, { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    // If we land on the React bundle, redirect to the custom Multi-portal Launchpad index.html
    window.location.replace("/index.html");
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-emerald-400 flex flex-col items-center justify-center p-6 font-sans">
      <div className="text-center max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
        <div className="w-16 h-16 bg-emerald-950 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg border border-emerald-800">
          💉
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">DawaDo Partner</h1>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          Redirecting you to the enterprise medical multi-window launchpad dashboard...
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-emerald-500 font-medium">
          <svg className="animate-spin h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Bootstrapping synchronizers...
        </div>
      </div>
    </div>
  );
}
