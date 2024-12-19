import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/app/lib/prisma";

// 编辑消息
export async function PATCH(
  request: NextRequest,
  { params }: { params: { roomId: string; messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { content } = await request.json();

    // 检查消息是否存在且属于当前用户
    const message = await prisma.message.findFirst({
      where: {
        id: params.messageId,
        roomId: params.roomId,
        userId: session.user.id,
      },
    });

    if (!message) {
      return NextResponse.json(
        { error: "Message not found or unauthorized" },
        { status: 404 }
      );
    }

    // 创建编辑历史记录
    await prisma.messageEdit.create({
      data: {
        content: message.content,
        messageId: message.id,
        userId: session.user.id,
      },
    });

    // 更新消息
    const updatedMessage = await prisma.message.update({
      where: { id: params.messageId },
      data: {
        content,
        isEdited: true,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        editHistory: {
          orderBy: {
            editedAt: "desc",
          },
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(updatedMessage);
  } catch (error) {
    console.error("Error updating message:", error);
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 }
    );
  }
}

// 删除消息（软删除）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { roomId: string; messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 检查消息是否存在且属于当前用户
    const message = await prisma.message.findFirst({
      where: {
        id: params.messageId,
        roomId: params.roomId,
        userId: session.user.id,
      },
    });

    if (!message) {
      return NextResponse.json(
        { error: "Message not found or unauthorized" },
        { status: 404 }
      );
    }

    // 软删除消息
    const deletedMessage = await prisma.message.update({
      where: { id: params.messageId },
      data: {
        isDeleted: true,
      },
    });

    return NextResponse.json(deletedMessage);
  } catch (error) {
    console.error("Error deleting message:", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}

// 获取消息编辑历史
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string; messageId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const editHistory = await prisma.messageEdit.findMany({
      where: {
        messageId: params.messageId,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        editedAt: "desc",
      },
    });

    return NextResponse.json(editHistory);
  } catch (error) {
    console.error("Error fetching edit history:", error);
    return NextResponse.json(
      { error: "Failed to fetch edit history" },
      { status: 500 }
    );
  }
} 