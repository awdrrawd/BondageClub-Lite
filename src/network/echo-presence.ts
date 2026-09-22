/** ECHO CharacterTag wire format. Lite preserves item bundles but has no ECHO renderer/runtime. */
export function echoPresence(target?: number) {
  return {
    Type: 'Hidden', Content: 'ECHO_INFO2',
    Dictionary: [{ Type: 'ECHO_INFO2', Content: {
      '服装拓展': { version: 'Lite-compat', beta: false, client: 'Lite', bundleOnly: true },
    } }],
    ...(target === undefined ? {} : { Target: target }),
  };
}
