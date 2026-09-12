// Browser entry point. UI owns DOM; network/client owns the authenticated session.
import "./ui/app";
import { bcClient } from "./network/client";
import { createExtensionAPI } from "./extensions/api";
Object.defineProperty(window, "BCLite", { value: createExtensionAPI(bcClient), configurable: false });
window.dispatchEvent(new Event("bclite:ready"));
