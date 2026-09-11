/** Data-only protection: never import plugin runtimes, resolve URLs, or fabricate installed status. */
export function isDecorativePluginItem(item: { Group: string; Name: string; Property?: Record<string, unknown> }): boolean {
  const property = item.Property;
  // A safeword must still remove an item carrying actual gameplay restrictions.
  if (Array.isArray(property?.Effect) && property.Effect.length || Array.isArray(property?.Block) && property.Block.length) return false;
  return item.Name === '自定义贴图'
    || item.Group === 'SingleGloveFX' && item.Name === 'SingleGlove'
    || /^ItemCanvas[123](Mask|Vis)?$/.test(item.Group);
}
