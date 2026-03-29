import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import logger from '../middleware/logger';

let io: SocketIOServer | null = null;

export const socketService = {
  initialize: (httpServer: HttpServer) => {
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN ?? '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
      }
    });

    io.on('connection', (socket) => {
      logger.info(`Client connected to WebSocket: ${socket.id}`);
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  },

  emit: (event: string, data: any) => {
    if (io) {
      io.emit(event, data);
    }
  }
};
