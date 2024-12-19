"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { socket, connectToSocket, disconnectFromSocket, joinRoom, leaveRoom, sendMessage } from "./lib/socket";
import MessageList from "./components/chat/message-list";
import OnlineUsers from "./components/chat/online-users";
import VideoChat from "./components/chat/video-chat";

interface Room {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  };
  _count: {
    members: number;
  };
}

interface User {
  id: string;
  name: string | null;
  email: string | null;
  online: boolean;
}

export default function Home() {
  const { data: session } = useSession();
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomMembers, setRoomMembers] = useState<User[]>([]);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [isVideoChatOpen, setIsVideoChatOpen] = useState(false);

  const handleEditMessage = async (messageId: string, content: string) => {
    if (!currentRoom) return;

    try {
      const response = await fetch(`/api/rooms/${currentRoom}/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to edit message");
      }

      const updatedMessage = await response.json();
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
      );

      // 通知其他用户消息已更新
      socket.emit("message_updated", {
        roomId: currentRoom,
        messageId,
        content,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error editing message");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentRoom) return;

    try {
      const response = await fetch(`/api/rooms/${currentRoom}/messages/${messageId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete message");
      }

      const deletedMessage = await response.json();
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? deletedMessage : msg))
      );

      // 通知其他用户消息已删除
      socket.emit("message_deleted", {
        roomId: currentRoom,
        messageId,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error deleting message");
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;

    // 连接到 Socket.IO 服务器
    connectToSocket(session.user.id);

    // 监听新消息
    socket.on("new-message", (message) => {
      console.log("Received new message:", message);
      setMessages((prev) => [...prev, message]);
    });

    // 监听消息更新
    socket.on("message_updated", ({ messageId, content }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content, isEdited: true }
            : msg
        )
      );
    });

    // 监听消息删除
    socket.on("message_deleted", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, isDeleted: true }
            : msg
        )
      );
    });

    // 监听房间成员更新
    socket.on("room_members_update", (members: User[]) => {
      console.log("Room members updated:", members);
      setRoomMembers(members);
    });

    // 监听用户上线
    socket.on("user_online", (userId: string) => {
      setRoomMembers((prev) =>
        prev.map((member) =>
          member.id === userId ? { ...member, online: true } : member
        )
      );
    });

    // 监听用户离线
    socket.on("user_offline", (userId: string) => {
      setRoomMembers((prev) =>
        prev.map((member) =>
          member.id === userId ? { ...member, online: false } : member
        )
      );
    });

    // 监听错误
    socket.on("error", (error) => {
      console.error("Socket error:", error);
      setError(error.message);
    });

    // 获取房间列表
    fetchRooms();

    return () => {
      // 清理连接
      socket.off("new-message");
      socket.off("message_updated");
      socket.off("message_deleted");
      socket.off("room_members_update");
      socket.off("user_online");
      socket.off("user_offline");
      socket.off("error");
      disconnectFromSocket();
    };
  }, [session]);

  const fetchRooms = async () => {
    try {
      const response = await fetch("/api/rooms");
      if (!response.ok) {
        throw new Error("Failed to fetch rooms");
      }
      const data = await response.json();
      setRooms(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error fetching rooms");
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          description: roomDescription,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create room");
      }

      const newRoom = await response.json();
      setRooms((prevRooms) => [newRoom, ...prevRooms]);
      setIsCreateRoomModalOpen(false);
      setRoomName("");
      setRoomDescription("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error creating room");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (currentRoom) {
      leaveRoom(currentRoom);
    }
    joinRoom(roomId);
    setCurrentRoom(roomId);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`);
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error fetching messages");
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      const { url } = await uploadResponse.json();
      return url;
    } catch (error) {
      throw error;
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id || !currentRoom) return;

    try {
      // 如果有待发送的图片
      if (pendingImages.length > 0) {
        for (const file of pendingImages) {
          const imageUrl = await handleImageUpload(file);
          socket.emit("send-message", {
            roomId: currentRoom,
            message: messageInput.trim(),
            userId: session.user.id,
            type: "image",
            imageUrl,
          });
        }
        setPendingImages([]);
      }
      
      // 如果有文本消息
      if (messageInput.trim()) {
        socket.emit("send-message", {
          roomId: currentRoom,
          message: messageInput.trim(),
          userId: session.user.id,
          type: "text",
        });
      }

      setMessageInput("");
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to send message");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // 只有当离开整个聊天区域时才重置状态
    if (chatAreaRef.current && !chatAreaRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (!currentRoom || !session?.user?.id) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setError("Please drop only image files");
      return;
    }

    setPendingImages(prev => [...prev, ...imageFiles]);
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please sign in to access the chat.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Chat Rooms</h2>
            <button
              onClick={() => setIsCreateRoomModalOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              New Room
            </button>
          </div>
          <div className="space-y-2">
            {rooms.map((room) => (
              <div
                key={room.id}
                onClick={() => handleJoinRoom(room.id)}
                className={`p-3 rounded-lg cursor-pointer ${
                  currentRoom === room.id
                    ? "bg-blue-50 border-blue-500"
                    : "hover:bg-gray-50 border-transparent"
                } border`}
              >
                <div className="font-medium">{room.name}</div>
                {room.description && (
                  <div className="text-sm text-gray-500">{room.description}</div>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  {room._count.members} members
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div 
        ref={chatAreaRef}
        className="flex-1 flex flex-col"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <div className={`flex-1 overflow-y-auto p-4 ${isDragging ? 'border-2 border-blue-500 border-dashed' : ''}`}>
          {currentRoom ? (
            <>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setIsVideoChatOpen(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                  Start Video Chat
                </button>
              </div>
              <MessageList
                messages={messages}
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a room to start chatting
            </div>
          )}
        </div>
        <div className="p-4 border-t">
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="relative rounded-lg border-2 border-gray-200">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                disabled={!currentRoom}
                className="w-full p-2 bg-transparent"
              />
            </div>
            {pendingImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-2">
                {pendingImages.map((file, index) => (
                  <div key={index} className="relative flex-shrink-0">
                    <img
                      src={URL.createObjectURL(file)}
                      alt="Pending upload"
                      className="h-20 w-20 object-cover rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== index))}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <label
                  htmlFor="image-upload"
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                  </svg>
                  <span>Image</span>
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setPendingImages(prev => [...prev, ...files]);
                    }}
                    disabled={!currentRoom}
                    multiple
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={!currentRoom || (!messageInput.trim() && pendingImages.length === 0)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
              >
                <span>Send</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
          </form>
          {isDragging && (
            <div className="absolute inset-0 bg-blue-50 bg-opacity-50 flex items-center justify-center pointer-events-none">
              <div className="bg-white p-4 rounded-lg shadow-lg">
                <p className="text-blue-500 font-medium">Drop images here</p>
                <p className="text-sm text-gray-500">You can drop multiple images at once</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Online Users Sidebar */}
      {currentRoom && (
        <div className="w-64 flex-shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto p-4">
          <OnlineUsers users={roomMembers} />
        </div>
      )}

      {/* Create Room Modal */}
      {isCreateRoomModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Create New Room</h3>
              <button
                onClick={() => setIsCreateRoomModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateRoom}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={roomDescription}
                  onChange={(e) => setRoomDescription(e.target.value)}
                  className="w-full p-2 border rounded"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRoomModalOpen(false)}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Room"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Video Chat Modal */}
      {currentRoom && session?.user?.id && (
        <VideoChat
          roomId={currentRoom}
          userId={session.user.id}
          isOpen={isVideoChatOpen}
          onClose={() => setIsVideoChatOpen(false)}
        />
      )}
    </div>
  );
}
