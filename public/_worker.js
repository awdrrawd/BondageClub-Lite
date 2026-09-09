// Pages advanced-mode Worker. Keep frames opaque: Cloudflare bridges the
// upgraded connection, including Engine.IO heartbeat and binary packets.
const UPSTREAM = "https://bondage-club-server.herokuapp.com/socket.io/";
const DEFAULT_BC_ORIGIN = "https://bondageprojects.elementfx.com";

function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/relay-status") {
      return json({ service: "bc-lite-relay", version: 1, transport: "websocket",
        upstream: UPSTREAM, bcOrigin: env.BC_ORIGIN || DEFAULT_BC_ORIGIN,
        note: "Relay configuration only; verify PROD in LoginResponse.Environment." });
    }
    if (url.pathname !== "/socket.io/") return env.ASSETS.fetch(request);
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WEBSOCKET_REQUIRED" }, 426);
    }
    // Browser clients may only use this site's relay. This is not authentication
    // against non-browser clients; upstream remains fixed to avoid an open proxy.
    if (request.headers.get("Origin") !== url.origin) return json({ error: "ORIGIN_DENIED" }, 403);
    if (url.searchParams.get("EIO") !== "4" || url.searchParams.get("transport") !== "websocket"
      || [...url.searchParams.keys()].some(key => !["EIO", "transport", "t"].includes(key))) {
      return json({ error: "INVALID_HANDSHAKE" }, 400);
    }
    let bcOrigin;
    try {
      const parsed = new URL(env.BC_ORIGIN || DEFAULT_BC_ORIGIN);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
      bcOrigin = parsed.origin;
    } catch { return json({ error: "INVALID_BC_ORIGIN_CONFIG" }, 500); }

    const upstreamUrl = new URL(UPSTREAM);
    upstreamUrl.searchParams.set("EIO", "4");
    upstreamUrl.searchParams.set("transport", "websocket");
    // Create fresh headers: don't forward site cookies, Authorization, or IPs.
    const headers = new Headers({ Upgrade: "websocket", Origin: bcOrigin });
    try {
      const response = await fetch(upstreamUrl, { method: "GET", headers, redirect: "manual" });
      if (response.status !== 101 || !response.webSocket) {
        await response.body?.cancel();
        return json({ error: "UPSTREAM_UPGRADE_FAILED", upstreamStatus: response.status }, 502);
      }
      // Returning the untouched 101 lets the runtime proxy frames and closure.
      // No accept(), per-message callbacks, buffering, or credential logging.
      return response;
    } catch { return json({ error: "UPSTREAM_UNREACHABLE" }, 502); }
  },
};
