"use client";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  online: boolean;
}

interface OnlineUsersProps {
  users: User[];
}

export default function OnlineUsers({ users }: OnlineUsersProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Room Members</h3>
      <div className="space-y-2">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {user.name?.[0] || user.email?.[0] || "?"}
                  </span>
                </div>
                <div
                  className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                    user.online ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
              </div>
              <div>
                <div className="font-medium">{user.name || "Anonymous"}</div>
                <div className="text-xs text-gray-500">{user.email}</div>
              </div>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                user.online
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {user.online ? "Online" : "Offline"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
} 