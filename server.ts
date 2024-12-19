import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// 在线用户映射表
const onlineUsers = new Map<string, Set<string>>(); // roomId -> Set<userId>
const userSockets = new Map<string, string>(); // socketId -> userId

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("identify", (userId: string) => {
      userSockets.set(socket.id, userId);
      // 广播用户上线事件
      io.emit("user_online", userId);
    });

    socket.on("join-room", async (roomId) => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);

      // 将用户添加到房间的在线用户列表
      if (!onlineUsers.has(roomId)) {
        onlineUsers.set(roomId, new Set());
      }
      onlineUsers.get(roomId)?.add(userId);

      try {
        // 获取房间所有成员信息
        const roomMembers = await prisma.roomMember.findMany({
          where: { roomId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        // 构建在线状态
        const membersWithStatus = roomMembers.map((member) => ({
          ...member.user,
          online: onlineUsers.get(roomId)?.has(member.user.id) || false,
        }));

        // 向房间广播更新后的成员列表
        io.to(roomId).emit("room_members_update", membersWithStatus);
      } catch (error) {
        console.error("Error fetching room members:", error);
      }
    });

    socket.on("leave-room", (roomId) => {
      const userId = userSockets.get(socket.id);
      if (!userId) return;

      socket.leave(roomId);
      console.log(`User ${userId} left room ${roomId}`);

      // 从房间的在线用户列表中移除用户
      onlineUsers.get(roomId)?.delete(userId);
      if (onlineUsers.get(roomId)?.size === 0) {
        onlineUsers.delete(roomId);
      }

      // 向房间广播用户离开事件
      io.to(roomId).emit("user_offline", userId);
    });

    socket.on("send-message", async (data) => {
      const { roomId, message, userId, type = "text", imageUrl } = data;
      console.log(`Received message from ${userId} in room ${roomId}:`, message);
      
      try {
        const newMessage = await prisma.message.create({
          data: {
            content: message,
            type,
            imageUrl,
            roomId: roomId,
            userId: userId
          },
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        });

        io.to(roomId).emit("new-message", newMessage);
        console.log("Message broadcast to room", roomId);
      } catch (error) {
        console.error("Error saving message:", error);
        socket.emit("error", { message: "Failed to save message" });
      }
    });

    socket.on("disconnect", () => {
      const userId = userSockets.get(socket.id);
      if (userId) {
        // 从所有房间中移除用户
        for (const [roomId, users] of onlineUsers.entries()) {
          if (users.has(userId)) {
            users.delete(userId);
            if (users.size === 0) {
              onlineUsers.delete(roomId);
            }
            // 向房间广播用户离线事件
            io.to(roomId).emit("user_offline", userId);
          }
        }
        userSockets.delete(socket.id);
        // 广播用户离线事件
        io.emit("user_offline", userId);
      }
      console.log("Client disconnected:", socket.id);
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    socket.on("message_updated", async (data) => {
      const { roomId, messageId, content } = data;
      console.log(`Message ${messageId} updated in room ${roomId}`);
      
      // 广播消息更新到房间内的所有用户
      io.to(roomId).emit("message_updated", {
        messageId,
        content,
      });
    });

    socket.on("message_deleted", async (data) => {
      const { roomId, messageId } = data;
      console.log(`Message ${messageId} deleted in room ${roomId}`);
      
      // 广播消息删除到房间内的所有用户
      io.to(roomId).emit("message_deleted", {
        messageId,
      });
    });

    // 加入视频聊天
    socket.on("join-video-chat", ({ roomId, userId }) => {
      socket.join(`video-${roomId}`);
      // 通知房间内其他用户有新用户加入
      socket.to(`video-${roomId}`).emit("user-joined-video", { userId });
    });

    // 离开视频聊天
    socket.on("leave-video-chat", ({ roomId, userId }) => {
      socket.leave(`video-${roomId}`);
      // 通知房间内其他用户有用户离开
      io.to(`video-${roomId}`).emit("user-left-video", { userId });
    });

    // 处理视频提议
    socket.on("video-offer", ({ roomId, userId, targetUserId, offer }) => {
      io.to(`video-${roomId}`).emit("video-offer", {
        userId,
        offer,
      });
    });

    // 处理视频应答
    socket.on("video-answer", ({ roomId, userId, targetUserId, answer }) => {
      io.to(`video-${roomId}`).emit("video-answer", {
        userId,
        answer,
      });
    });

    // 处理ICE候选
    socket.on("ice-candidate", ({ roomId, userId, targetUserId, candidate }) => {
      io.to(`video-${roomId}`).emit("ice-candidate", {
        userId,
        candidate,
      });
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}); 