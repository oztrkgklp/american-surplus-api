// src/utils/socket.ts
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { getLogger } from './logger';
import { AppError } from './response/appError';
import envvars from '@/config/envvars';
import User from '@/authn/models/User';

const logger = getLogger('Socket');
let io: SocketIOServer;

export function initSocket(server: HttpServer) {
    io = new SocketIOServer(server, {
        cors: { origin: envvars.ui, methods: ['GET', 'POST'] }
    });

    io.use(async (socket, next) => {
        try {
            const hashedToken = socket.handshake.auth?.notificationTokenHash;
            if (!hashedToken) throw new AppError(401, 'Unauthenticated', 'Token missing');

            const decodedToken = Buffer.from(hashedToken, 'base64').toString('utf-8')
            if (!decodedToken) throw new AppError(401, 'Unauthenticated', 'Invalid token');

            const user = await User.findOne({ where: { notification_token: decodedToken } });
            if (!user) throw new AppError(401, 'Unauthenticated', 'User not found');
            if (user.isActive === false) throw new AppError(401, 'Unauthenticated', 'User is inactive');

            socket.data.authenticatedUserId = user.id;
            next();
        } catch (err) {
            logger.error('Authentication failed:', err);
            return next(new Error('Authentication error'));
        }
    });

    io.on('connection', socket => {
        logger.info(`Socket connected: ${socket.id}`);
        socket.on('notification', (userId: string) => {
            if (socket.data.authenticatedUserId === userId) {
                socket.join(`user_${userId}`);
            } else {
                logger.warn(`User: ${userId} tried to acces ${socket.data.authenticatedUserId}'s room.`)
                socket.disconnect();
            }
        });

        socket.on('connect_error', (err) => {
            logger.error('Connection error:', err.message);
        });

        socket.on('disconnect', () => {
            logger.info(`Client disconnected: ${socket.id}`);
        });
    });
    return io;
}

export function getIO(): SocketIOServer {
    if (!io) throw new Error('Socket.IO not initialized!');
    return io;
}
