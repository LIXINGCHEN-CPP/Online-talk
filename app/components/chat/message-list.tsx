"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import Image from "next/image";

interface User {
  name: string | null;
  email: string | null;
}

interface MessageEdit {
  id: string;
  content: string;
  editedAt: Date;
  user: User;
}

interface Message {
  id: string;
  content: string;
  type: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  isEdited: boolean;
  isDeleted: boolean;
  userId: string;
  user: User;
  editHistory: MessageEdit[];
}

interface MessageListProps {
  messages: Message[];
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
}

export default function MessageList({ messages, onEditMessage, onDeleteMessage }: MessageListProps) {
  const { data: session } = useSession();
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showEditHistory, setShowEditHistory] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleEditClick = (message: Message) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const handleSaveEdit = async (messageId: string) => {
    await onEditMessage(messageId, editContent);
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const toggleEditHistory = (messageId: string) => {
    setShowEditHistory(showEditHistory === messageId ? null : messageId);
  };

  const renderMessageContent = (message: Message) => {
    if (message.type === "image") {
      return (
        <div className="relative">
          <Image
            src={message.imageUrl!}
            alt="Message image"
            width={300}
            height={200}
            className="rounded-lg cursor-pointer hover:opacity-90"
            onClick={() => setSelectedImage(message.imageUrl!)}
            style={{ objectFit: "contain" }}
          />
          {message.content && (
            <p className="mt-2 text-gray-700">{message.content}</p>
          )}
        </div>
      );
    }
    return <div className="mt-2 text-gray-700">{message.content}</div>;
  };

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div key={message.id} className="bg-white rounded-lg shadow p-4">
          {message.isDeleted ? (
            <div className="text-gray-400 italic">This message has been deleted</div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {message.user.name?.[0] || message.user.email?.[0] || "?"}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{message.user.name || "Anonymous"}</div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(message.createdAt), "MMM d, yyyy h:mm a")}
                      {message.isEdited && (
                        <button
                          onClick={() => toggleEditHistory(message.id)}
                          className="ml-2 text-blue-500 hover:underline"
                        >
                          (edited)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {session?.user?.email === message.user.email && message.type === "text" && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditClick(message)}
                      className="text-gray-500 hover:text-blue-500"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDeleteMessage(message.id)}
                      className="text-gray-500 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {editingMessageId === message.id ? (
                <div className="mt-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full p-2 border rounded"
                    rows={3}
                  />
                  <div className="mt-2 flex justify-end space-x-2">
                    <button
                      onClick={() => handleCancelEdit()}
                      className="px-3 py-1 text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(message.id)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                renderMessageContent(message)
              )}

              {showEditHistory === message.id && message.editHistory.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <div className="text-sm font-medium text-gray-500">Edit History</div>
                  <div className="space-y-2">
                    {message.editHistory.map((edit) => (
                      <div key={edit.id} className="text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>{edit.user.name || "Anonymous"}</span>
                          <span>{format(new Date(edit.editedAt), "MMM d, yyyy h:mm a")}</span>
                        </div>
                        <div className="mt-1">{edit.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* 图片预览模态框 */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <Image
              src={selectedImage}
              alt="Preview"
              width={800}
              height={600}
              className="rounded-lg"
              style={{ objectFit: "contain" }}
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 text-white hover:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 