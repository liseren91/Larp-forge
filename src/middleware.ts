import { withAuth } from "next-auth/middleware";

export default withAuth();

export const config = {
  matcher: ["/dashboard/:path*", "/game/:path*", "/api/ai/:path*", "/api/export/:path*"],
};
