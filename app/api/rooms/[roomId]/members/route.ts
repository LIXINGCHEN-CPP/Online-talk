import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";

// 加入聊天室
export async function POST(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const roomId = params.roomId;

    // 检查用户是否已经是成员
    const existingMember = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId: roomId,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "Already a member of this room" },
        { status: 400 }
      );
    }

    // 加入聊天室
    const member = await prisma.roomMember.create({
      data: {
        userId: session.user.id,
        roomId: roomId,
      },
      include: {
        room: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(member.room, { status: 201 });
  } catch (error) {
    console.error("Error joining room:", error);
    return NextResponse.json(
      { error: "Error joining room" },
      { status: 500 }
    );
  }
}

// 离开聊天室
export async function DELETE(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const roomId = params.roomId;

    // 检查是否是房主
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (room?.ownerId === session.user.id) {
      return NextResponse.json(
        { error: "Room owner cannot leave the room" },
        { status: 400 }
      );
    }

    // 离开聊天室
    await prisma.roomMember.delete({
      where: {
        userId_roomId: {
          userId: session.user.id,
          roomId: roomId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error leaving room:", error);
    return NextResponse.json(
      { error: "Error leaving room" },
      { status: 500 }
    );
  }
} 