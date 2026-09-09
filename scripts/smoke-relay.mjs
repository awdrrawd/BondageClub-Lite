// No credentials, login, or account mutations. Test only the Socket.IO handshake.
import { io } from 'socket.io-client';
const origin = process.argv[2] || 'http://127.0.0.1:8788';
const status = await fetch(`${origin}/api/relay-status`);
const body = await status.json();
if (!status.ok || body.service !== 'bc-lite-relay') throw new Error('Relay status unavailable');
console.log('Relay status OK; upstream Origin:', body.bcOrigin);
const socket = io(origin, { transports: ['websocket'], upgrade: false,
  extraHeaders: { Origin: origin }, reconnection: false, timeout: 15000 });
const timeout = setTimeout(() => { console.error('Handshake timed out'); socket.disconnect(); process.exitCode = 1; }, 20000);
socket.on('connect', () => { console.log('Socket.IO connected through relay'); });
socket.on('ServerInfo', data => {
  console.log('BC ServerInfo received; online count:', data.OnlinePlayers);
  console.log('No AccountLogin sent. PROD authentication still requires a user test.');
  clearTimeout(timeout); socket.disconnect();
});
socket.on('connect_error', error => {
  console.error('Handshake failed:', error.message);
  clearTimeout(timeout); socket.disconnect(); process.exitCode = 1;
});
