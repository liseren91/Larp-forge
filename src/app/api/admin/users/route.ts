import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminEmail } from "@/lib/auth";
import { db } from "@/lib/db";

const SECRET = process.env.NEXTAUTH_SECRET!;

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: SECRET });
  if (!token?.sub || !isAdminEmail(token.adminEmail ?? token.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      _count: { select: { games: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(users);
}
