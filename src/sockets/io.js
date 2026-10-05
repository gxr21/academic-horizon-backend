/**
 * Holds the Socket.io server instance so that services/controllers
 * (outside of socket handlers) can push real-time events.
 */
let ioInstance = null;

export const setIO = (io) => {
  ioInstance = io;
};

export const getIO = () => ioInstance;

/**
 * Kick every live socket for a user (used after an admin restriction/ban).
 */
export const disconnectUserSockets = async (userId, message = 'تم تقييد حسابك') => {
  const io = ioInstance;
  if (!io || !userId) return;
  try {
    const room = `user:${userId.toString()}`;
    io.to(room).emit('account_restricted', { message });
    const sockets = await io.in(room).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }
  } catch (err) {
    console.error('disconnectUserSockets failed:', err.message);
  }
};
