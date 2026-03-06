import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

function withJsonErrors(
  fn: (req: Request, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>
) {
  return async (req: Request, context: { params: Promise<Record<string, string | string[]>> }) => {
    try {
      return await fn(req, context);
    } catch (error) {
      console.error("[next-auth] Route error:", error);
      return Response.json(
        { error: "AuthError", message: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  };
}

export const GET = withJsonErrors(handler);
export const POST = withJsonErrors(handler);
