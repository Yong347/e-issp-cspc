// frontend/src/context/NotificationContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [actionCount, setActionCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    // Only poll the backend if the active user is a Department User with a valid token
    if (user?.role === 'ROLE_DEPT_USER' && user?.token) {
      try {
        const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const apiUrl = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
        const token = user.token;

        const response = await fetch(`${apiUrl}/api/dept/action-items/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error("Failed to fetch notification summary");
        }

        const data = await response.json();
        setActionCount(data.unread_actions || 0);
        setReturnedCount(data.returned_proposals || 0);
      } catch (error) {
        console.error("Failed to fetch notification summary:", error);
      }
    }
  }, [user]);

  useEffect(() => {
    // If the user logs out or does not have the department role, clear counts and skip polling
    if (user?.role !== 'ROLE_DEPT_USER') {
      setActionCount(0);
      setReturnedCount(0);
      return;
    }

    // Fetch immediately upon mount or when the user context changes
    fetchNotifications();

    // Set up polling interval to check every 30 seconds
    const intervalId = setInterval(() => {
      fetchNotifications();
    }, 30000);

    // Cleanup the interval when the component unmounts or dependencies change
    return () => clearInterval(intervalId);
  }, [user, fetchNotifications]);

  return (
    <NotificationContext.Provider value={{ actionCount, returnedCount, fetchNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    // Fallback safe defaults to prevent runtime errors if used outside of Provider
    return { actionCount: 0, returnedCount: 0, fetchNotifications: async () => {} };
  }
  return context;
};