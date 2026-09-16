// frontend/src/context/CycleContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CycleContext = createContext(null);

const rawRoot = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const API_ROOT = rawRoot.endsWith("/") ? rawRoot.slice(0, -1) : rawRoot;

export function CycleProvider({ children }) {
  const [activeCycle, setActiveCycleState] = useState("2026-2028");
  const [planningYears, setPlanningYears] = useState([2026, 2027, 2028]);
  const [fromYear, setFromYear] = useState(2026);
  const [toYear, setToYear] = useState(2028);
  const [agencyName, setAgencyName] = useState(
    import.meta.env?.VITE_DEFAULT_AGENCY_NAME || 
    import.meta.env?.VITE_AGENCY_NAME || 
    "National Government Agency"
  );
  const [agencyLogoUrl, setAgencyLogoUrl] = useState(null);
  const [dictLogoUrl, setDictLogoUrl] = useState(null);
  const [bagongPilipinasLogoUrl, setBagongPilipinasLogoUrl] = useState(null);
  const [cycleLoading, setCycleLoading] = useState(true);

  const computeYearsFromPeriod = (period, startHint = null, endHint = null) => {
    if (!period) return { start: 2026, end: 2028, years: [2026, 2027, 2028] };

    const parts = String(period).trim().split("-");
    let start = startHint ? parseInt(startHint, 10) : parseInt(parts[0], 10);
    let end = endHint ? parseInt(endHint, 10) : (parts.length > 1 ? parseInt(parts[1], 10) : start);

    if (isNaN(start)) start = 2026;
    if (isNaN(end)) end = start;

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }

    const years = [];
    for (let y = start; y <= end; y++) {
      years.push(y);
    }

    return { start, end, years };
  };

  const setActiveCycle = useCallback((period, customFrom = null, customTo = null) => {
    setActiveCycleState(period);
    const { start, end, years } = computeYearsFromPeriod(period, customFrom, customTo);
    setFromYear(start);
    setToYear(end);
    setPlanningYears(years);
  }, []);

  const setAgencyBranding = useCallback((branding) => {
    if (branding?.agency_name) setAgencyName(branding.agency_name);
    if (branding?.agency_logo_url !== undefined) setAgencyLogoUrl(branding.agency_logo_url);
    if (branding?.dict_logo_url !== undefined) setDictLogoUrl(branding.dict_logo_url);
    if (branding?.bagong_pilipinas_logo_url !== undefined) setBagongPilipinasLogoUrl(branding.bagong_pilipinas_logo_url);
  }, []);

  const fetchActiveCycle = useCallback(async () => {
    setCycleLoading(true);
    try {
      const res = await fetch(`${API_ROOT}/api/auth/active-cycle`);
      if (res.ok) {
        const data = await res.json();
        if (data.issp_period) {
          setActiveCycleState(data.issp_period);
          const { start, end, years } = computeYearsFromPeriod(
            data.issp_period,
            data.from_year,
            data.to_year
          );
          setFromYear(start);
          setToYear(end);
          setPlanningYears(years);
        }
        if (data.agency_name) {
          setAgencyName(data.agency_name);
        }
        if (data.agency_logo_url) {
          setAgencyLogoUrl(data.agency_logo_url);
        }
        if (data.dict_logo_url) {
          setDictLogoUrl(data.dict_logo_url);
        }
        if (data.bagong_pilipinas_logo_url) {
          setBagongPilipinasLogoUrl(data.bagong_pilipinas_logo_url);
        }
      }
    } catch (e) {
      console.error("Failed to load active cycle and agency branding:", e);
    } finally {
      setCycleLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveCycle();
  }, [fetchActiveCycle]);

  const cycleSpan = planningYears.length;

  return (
    <CycleContext.Provider
      value={{
        activeCycle,
        setActiveCycle,
        planningYears,
        setPlanningYears,
        fromYear,
        toYear,
        cycleSpan,
        cycleLoading,
        agencyName,
        agencyLogoUrl,
        dictLogoUrl,
        bagongPilipinasLogoUrl,
        setAgencyBranding,
        fetchActiveCycle,
      }}
    >
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
