import { loadTypeScript } from './load-typescript.mjs';
export const { interactionPermission, activityItemPermission } = new Function(loadTypeScript('src/action/interaction-permission.ts')+';return {interactionPermission,activityItemPermission};')();
