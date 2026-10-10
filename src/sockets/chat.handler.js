import mongoose from 'mongoose';
import Order from '../models/Order.js';
import * as chatService from '../services/chat.service.js';

/**
 * Register chat socket event handlers.
 * Handles: join_room, leave_room, send_message, typing, stop_typing
 */
export const registerChatHandlers = (io, socket) => {
  /**
   * Rate limiting: track messages per user per room
   * Max 10 messages per 10 seconds per user in a given room
   */
  const userMessageCount = new Map(); // `${userId}:${orderId}` → { count, resetAt }

  /**
   * Presence = being inside the conversation's room.
   * A person with two tabs open stays "online" until the last tab leaves.
   */
  const userIdsInRoom = (roomName) => {
    const ids = new Set();
    const socketIds = io.sockets.adapter.rooms.get(roomName);
    if (!socketIds) return ids;
    for (const id of socketIds) {
      const peer = io.sockets.sockets.get(id);
      if (peer?.user?.id) ids.add(peer.user.id);
    }
    return ids;
  };

  // Call after this socket already left the room
  const announceLeft = (roomName) => {
    if (userIdsInRoom(roomName).has(socket.user.id)) {
      // still here with another tab / connection, so the other side keeps seeing them online
      console.log(`💬 ${socket.user.email} left ${roomName} but is still inside through another connection`);
      return;
    }
    io.to(roomName).emit('user_left', {
      orderId: roomName.replace('order:', ''),
      userId: socket.user.id,
    });
  };

  const checkRateLimit = (userId, orderId) => {
    const key = `${userId}:${orderId}`;
    const now = Date.now();
    const windowMs = 10 * 1000; // 10 seconds
    const maxMessages = 10;

    const record = userMessageCount.get(key);
    if (!record || now > record.resetAt) {
      // No record or window expired — reset
      userMessageCount.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (record.count >= maxMessages) {
      return false; // Rate limited
    }

    record.count += 1;
    return true;
  };

  /**
   * join_room — Join a chat room for an order.
   * Only the order's student or assigned provider can join.
   */
  socket.on('join_room', async ({ orderId }) => {
    try {
      if (!orderId) {
        return socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Order ID is required' });
      }

      if (!mongoose.isValidObjectId(orderId)) {
        return socket.emit('error', { code: 'VALIDATION_ERROR', message: 'Invalid order ID' });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return socket.emit('error', { code: 'NOT_FOUND', message: 'Order not found' });
      }

      // Strict access control
      const isStudent = order.student_id.toString() === socket.user.id;
      const isProvider = order.provider_id && order.provider_id.toString() === socket.user.id;

      if (!isStudent && !isProvider) {
        return socket.emit('error', { code: 'FORBIDDEN', message: 'Access denied — you are not a participant' });
      }

      const roomName = `order:${orderId}`;

      // Leave any previous rooms (except default)
      for (const room of [...socket.rooms]) {
        if (room !== socket.id && room.startsWith('order:') && room !== roomName) {
          socket.leave(room);
          announceLeft(room);
        }
      }

      socket.join(roomName);

      console.log(`💬 ${socket.user.email} joined room ${roomName}`);

      // Tell the newcomer who is already inside, so the header shows the right state at once
      const others = [...userIdsInRoom(roomName)].filter((id) => id !== socket.user.id);
      socket.emit('room_joined', {
        orderId,
        message: 'Successfully joined room',
        online: others,
      });

      // Notify others in the room
      socket.to(roomName).emit('user_joined', {
        orderId,
        userId: socket.user.id,
        email: socket.user.email,
      });
    } catch (error) {
      console.error('join_room error:', error);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Failed to join room' });
    }
  });

  /**
   * leave_room — Leave a chat room.
   */
  socket.on('leave_room', ({ orderId }) => {
    if (!orderId || !mongoose.isValidObjectId(orderId)) return;
    const roomName = `order:${orderId}`;
    if (!socket.rooms.has(roomName)) return;
    socket.leave(roomName);
    announceLeft(roomName);

    console.log(`💬 ${socket.user.email} left room ${roomName}`);
  });

  // Closing the tab or losing the connection also means leaving every conversation.
  // Rooms are already empty by the time "disconnect" fires, so remember them first.
  let roomsAtDisconnect = [];
  socket.on('disconnecting', () => {
    roomsAtDisconnect = [...socket.rooms].filter((room) => room.startsWith('order:'));
  });
  socket.on('disconnect', () => {
    for (const room of roomsAtDisconnect) announceLeft(room);
  });

  /**
   * send_message — Send an encrypted message.
   * The server NEVER sees plaintext. It only relays encrypted blobs.
   * Includes per-room rate limiting.
   */
  socket.on('send_message', async ({ orderId, encryptedMessage, iv, wrappedKey, senderWrappedKey, adminWrappedKeys, messageType }) => {
    try {
      if (!orderId || !encryptedMessage || !iv) {
        return socket.emit('error', {
          code: 'VALIDATION_ERROR',
          message: 'orderId, encryptedMessage, and iv are required',
        });
      }

      // Rate limiting check
      if (!checkRateLimit(socket.user.id, orderId)) {
        return socket.emit('error', {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'You are sending messages too quickly. Please wait.',
        });
      }

      // Save encrypted message to DB
      const savedMessage = await chatService.saveMessage(orderId, socket.user.id, {
        encryptedMessage,
        iv,
        wrappedKey,
        senderWrappedKey,
        adminWrappedKeys,
        messageType: messageType || 'text',
      });

      const roomName = `order:${orderId}`;

      // Emit to ALL in the room (including sender for confirmation)
      io.to(roomName).emit('receive_message', {
        id: savedMessage.id,
        orderId: savedMessage.orderId,
        senderId: savedMessage.senderId,
        encryptedMessage: savedMessage.encryptedMessage,
        iv: savedMessage.iv,
        wrappedKey: savedMessage.wrappedKey,
        senderWrappedKey: savedMessage.senderWrappedKey,
        messageType: savedMessage.messageType,
        createdAt: savedMessage.createdAt,
        senderEmail: socket.user.email,
      });
    } catch (error) {
      console.error('send_message error:', error);

      if (error.statusCode === 403) {
        return socket.emit('error', { code: 'FORBIDDEN', message: error.message });
      }
      socket.emit('error', { code: 'SEND_FAILED', message: 'Failed to send message' });
    }
  });

  /**
   * typing — Broadcast typing indicator.
   */
  socket.on('typing', ({ orderId }) => {
    const roomName = `order:${orderId}`;
    socket.to(roomName).emit('typing', {
      userId: socket.user.id,
      email: socket.user.email,
    });
  });

  /**
   * stop_typing — Broadcast stop typing indicator.
   */
  socket.on('stop_typing', ({ orderId }) => {
    const roomName = `order:${orderId}`;
    socket.to(roomName).emit('stop_typing', {
      userId: socket.user.id,
    });
  });
};
