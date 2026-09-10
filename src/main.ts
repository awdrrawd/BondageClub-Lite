// Browser entry point. UI owns DOM; network/client owns the authenticated session.
import "./ui/app";
// Identification only; no session state, account data or version is exposed.
Object.defineProperty(window, "BCLite", { value: Object.freeze({ client: "Lite" }), configurable: true });
