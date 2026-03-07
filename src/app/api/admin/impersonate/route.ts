import { NextRequest } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import { isAdminEmail } from "@/lib/auth";
import { db } from "@/lib/db";

const SECRET = process.env.NEXTAUTH_SECRET!;
const SECURE = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
const COOKIE_NAME = SECURE
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: SECRET });
  if (!token?.sub || !isAdminEmail(token.adminEmail ?? token.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (token.impersonatedBy) {
    return Response.json(
      { error: "Already impersonating. Exit first." },
      { status: 400 }
    );
  }

  const { userId } = (await req.json()) as { userId: string };
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!targetUser) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const newToken = await encode({
    secret: SECRET,
    token: {
      ...token,
      sub: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      impersonatedBy: token.sub,
      adminEmail: token.adminEmail ?? token.email ?? undefined,
      isAdmin: true,
    },
    maxAge: 30 * 24 * 60 * 60,
  });

  const response = Response.json({ ok: true, user: targetUser });
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${newToken}; Path=/; HttpOnly; SameSite=Lax${SECURE ? "; Secure" : ""}; Max-Age=${30 * 24 * 60 * 60}`
  );
  return response;
}

export async function DELETE(req: NextRequest) {
  const token = await getToken({ req, secret: SECRET });
  if (!token?.impersonatedBy) {
    return Response.json({ error: "Not impersonating" }, { status: 400 });
  }

  const adminUser = await db.user.findUnique({
    where: { id: token.impersonatedBy },
    select: { id: true, email: true, name: true },
  });
  if (!adminUser) {
    return Response.json({ error: "Admin user not found" }, { status: 404 });
  }

  const newToken = await encode({
    secret: SECRET,
    token: {
      ...token,
      sub: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      impersonatedBy: undefined,
      adminEmail: adminUser.email ?? undefined,
      isAdmin: true,
    },
    maxAge: 30 * 24 * 60 * 60,
  });

  const response = Response.json({ ok: true, user: adminUser });
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${newToken}; Path=/; HttpOnly; SameSite=Lax${SECURE ? "; Secure" : ""}; Max-Age=${30 * 24 * 60 * 60}`
  );
  return response;
}
