import { createHook } from 'node:async_hooks';
import { writeSync } from 'node:fs';

// Preloaded in isolated test workers only. An unref'ed watchdog does not keep
// healthy workers alive. Timeout is a failure, never a forced successful exit.
if (process.env.NODE_TEST_CONTEXT === 'child-v8') {
  const active = new Map();
  const hook = createHook({
    init(id, type, trigger, resource) {
      if (['Timeout', 'Immediate', 'TCPWRAP', 'TCPCONNECTWRAP', 'TLSWRAP', 'PIPEWRAP', 'MESSAGEPORT', 'WORKER', 'FSREQCALLBACK', 'GETADDRINFOREQWRAP'].includes(type)) {
        active.set(id, { type, resource: new WeakRef(resource), stack: new Error().stack });
      }
    },
    destroy(id) { active.delete(id); }
  }).enable();
  const watchdog = setTimeout(() => {
    hook.disable();
    const lines = [`TEST WORKER TIMEOUT: ${process.argv[1]}`, `Node ${process.version}; ${process.platform}; active resources: ${process.getActiveResourcesInfo().join(', ')}`];
    for (const item of active.values()) {
      const resource = item.resource.deref();
      if (!resource || resource === watchdog || resource.hasRef?.() === false) continue;
      lines.push(`${item.type}\n${item.stack}`);
      if (lines.length >= 22) break;
    }
    writeSync(2, lines.join('\n') + '\n');
    process.exit(1);
  }, 60000);
  watchdog.unref();
}
