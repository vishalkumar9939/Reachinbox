import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  previewUrl?: string | null;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  notifications: SocketNotification[];
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<SocketNotification[]>([]);

  const addNotification = (notif: Omit<SocketNotification, 'id' | 'timestamp'> & { previewUrl?: string | null }) => {
    const item: SocketNotification = {
      ...notif,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
    };
    setNotifications((prev) => [item, ...prev].slice(0, 15));
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const apiBase = (import.meta as any).env?.VITE_API_URL as string | undefined;
    const wsBase = (import.meta as any).env?.VITE_WS_URL as string | undefined;
    const socketOrigin = wsBase || (apiBase ? apiBase.replace(/\/api\/?$/, '') : window.location.origin);

    const socketInstance = io(socketOrigin, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('email:scheduled', (data: any) => {
      addNotification({
        type: 'info',
        title: 'Email Scheduled',
        message: data.email
          ? `Email to ${data.email.recipientEmail} queued for ${new Date(data.email.scheduledAt).toLocaleTimeString()}`
          : `Campaign scheduled with ${data.count} emails`,
      });
    });

    socketInstance.on('email:processing', (data: any) => {
      addNotification({
        type: 'info',
        title: 'Dispatching Email',
        message: `Now sending to ${data.recipientEmail}...`,
      });
    });

    socketInstance.on('email:sent', (data: any) => {
      addNotification({
        type: 'success',
        title: 'Email Sent Successfully',
        message: `Email to ${data.recipientEmail} has been delivered.`,
        previewUrl: data.previewUrl,
      });
    });

    socketInstance.on('email:failed', (data: any) => {
      addNotification({
        type: 'error',
        title: 'Email Failed to Send',
        message: `Failed sending to ${data.recipientEmail}: ${data.failureReason || 'SMTP error'}`,
      });
    });

    socketInstance.on('email:rate-limited', (data: any) => {
      const resumeTime = new Date(data.resumesAt).toLocaleTimeString();
      addNotification({
        type: 'warning',
        title: 'Hourly Rate Limit Reached',
        message: `Limit (${data.limit}/hr) reached for ${data.senderEmail}. Queued email to ${data.recipientEmail} deferred until ${resumeTime}.`,
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        notifications,
        clearNotification,
        clearAllNotifications,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
