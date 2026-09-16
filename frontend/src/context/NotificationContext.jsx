// frontend/src/context/NotificationContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [actionCount, setActionCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [recentRemarks, setRecentRemarks] = useState([]);
  const [loading, setLoading] = useState(false);

  const rawUrl = import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
  const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

  const fetchNotifications = useCallback(async () => {
    if (!user?.token) return;
    
    setLoading(true);
    try {
      if (user.role === 'ROLE_DEPT_USER') {
        const summaryRes = await fetch(`${apiUrl}/api/dept/action-items/summary`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (summaryRes.ok) {
          const sData = await summaryRes.json();
          setActionCount(sData.unread_actions || 0);
          setReturnedCount(sData.returned_proposals || 0);
        }

        const notifRes = await fetch(`${apiUrl}/api/dept/notifications?days=14`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (notifRes.ok) {
          const nData = await notifRes.json();
          const items = Array.isArray(nData) ? nData : [];
          setRecentNotifications(items.filter(i => i.type !== 'comment'));
          setRecentRemarks(items.filter(i => i.type === 'comment'));
        }
      } else if (user.role === 'ROLE_MIS_ADMIN') {
        const auditRes = await fetch(`${apiUrl}/api/admin/audit-logs`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (auditRes.ok) {
          const aData = await auditRes.json();
          const logs = Array.isArray(aData) ? aData.slice(0, 10) : [];
          
          setRecentNotifications(logs.map(l => ({
            id: String(l.id),
            title: l.action.replace(/_/g, ' '),
            description: l.new_value ? Object.entries(l.new_value).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'System Audit Log',
            type: l.module === 'AUTHENTICATION' ? 'security' : l.module === 'PROPOSALS' ? 'status_change' : 'budget',
            timestamp: l.timestamp,
            ref_id: l.proposal_id || '',
            url_path: l.proposal_id ? '/admin/queue' : '/admin/audit'
          })));

          const propRes = await fetch(`${apiUrl}/api/admin/proposals?status_filter=Submitted`, {
            headers: { Authorization: `Bearer ${user.token}` }
          });
          if (propRes.ok) {
            const pData = await propRes.json();
            const count = pData.total !== undefined ? pData.total : (Array.isArray(pData) ? pData.length : 0);
            setActionCount(count);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to update notification feeds:", error);
    } finally {
      setLoading(false);
    }
  }, [user, apiUrl]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        actionCount,
        returnedCount,
        recentNotifications,
        recentRemarks,
        loading,
        fetchNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return { 
      actionCount: 0, 
      returnedCount: 0, 
      recentNotifications: [], 
      recentRemarks: [], 
      loading: false, 
      fetchNotifications: async () => {} 
    };
  }
  return context;
};
