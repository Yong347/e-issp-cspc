// frontend/src/context/CycleContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const CycleContext = createContext(null);
const rawRoot = import.meta.env?.VITE_API_URL || "http://localhost:8000";
const API_ROOT = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

export function CycleProvider({ children }) {
  const [activeCycle, setActiveCycle] = useState("2026-2028");
  const [planningYears, setPlanningYears] = useState([2026, 2027, 2028]);

  const fetchActiveCycle = async () => {
    try {
      const res = await fetch(`${API_ROOT}/api/auth/active-cycle`);
      if (res.ok) {
        const data = await res.json();
        if (data.issp_period) {
          setActiveCycle(data.issp_period);
          // Parse cycle start and end years to dynamically construct planningYears range
          const start = data.from_year || parseInt(data.issp_period.split("-")[0], 10);
          const end = data.to_year || parseInt(data.issp_period.split("-")[1], 10);
          const years = [];
          for (let y = start; y <= end; y++) {
            years.push(y);
          }
          setPlanningYears(years);
        }
      }
    } catch (e) {
      console.error("Failed to dynamically load active cycle boundaries:", e);
    }
  };

  useEffect(() => {
    fetchActiveCycle();
  }, []);

  return (
    <CycleContext.Provider value={{ activeCycle, setActiveCycle, planningYears, fetchActiveCycle }}>
      {children}
    </CycleContext.Provider>
  );
}

export const useCycle = () => {
  const context = useContext(CycleContext);
  if (!context) {
    throw new Error("useCycle must be consumed within a CycleProvider boundary.");
  }
  return context;
};