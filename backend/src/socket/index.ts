import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserPayload } from '../types/index.js';

let io: SocketIOServer | null = null;

export const initSocketServer = (server: HttpServer): SocketIOServer => {
  io = new SocketIOServer(server, {
    cors: {
      origin: [
        env.FRONTEND_URL,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://reachinbox-frontend-beta.vercel.app',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Authentication middleware for Socket.IO
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
        : null) ||
      socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as UserPayload;
      (socket as any).user = decoded;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired socket token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as UserPayload;
    if (!user || !user.id) {
      socket.disconnect(true);
      return;
    }

    // Join isolated user room
    const userRoom = `user:${user.id}`;
    socket.join(userRoom);
    console.log(`⚡ Socket connected: User ${user.email} (${user.id}) joined room ${userRoom}`);

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: User ${user.email} (${reason})`);
    });
  });

  return io;
};

export const getSocketIO = (): SocketIOServer | null => io;

/**
 * Emits an event specifically to an authenticated user's private room
 */
export const emitToUser = (userId: string, event: string, payload: any) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, {
    ...payload,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Emits queue update to all authenticated connections of a specific user
 */
export const emitQueueUpdate = (userId: string, stats: any) => {
  emitToUser(userId, 'queue:updated', stats);
};
