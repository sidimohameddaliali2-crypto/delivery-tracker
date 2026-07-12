import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineDrivers, setOnlineDrivers] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      auth: {
        token: token
      }
    });

    setSocket(newSocket);

    newSocket.on('drivers:statusUpdate', (data) => {
      setOnlineDrivers(data.onlineDrivers);
    });

    newSocket.on('delivery:statusUpdate', (data) => {
      // Handle real-time delivery updates
      console.log('Delivery update:', data);
    });

    return () => newSocket.close();
  }, []);

  const value = {
    socket,
    onlineDrivers
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};