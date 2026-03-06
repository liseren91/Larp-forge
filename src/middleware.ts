export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/game/:path*", "/api/ai/:path*", "/api/export/:path*"],
};
