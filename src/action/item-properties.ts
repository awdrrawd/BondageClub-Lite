import catalog from './item-properties-data.json';
import definitions from './native-data.json';

export type ItemProperties = { Effect?: string[]; Block?: string[]; AllowActivity?: string[]; AllowActivityOn?: string[]; Expose?: string[]; [key: string]: unknown };
type Option = { property: ItemProperties; child?: Config };
type Config = { kind?: string; key?: string; baseline: ItemProperties; options?: Option[]; modules?: { key: string; options: Option[] }[]; unknown?: boolean };
const keys = ['Effect', 'Block', 'AllowActivity', 'AllowActivityOn', 'Expose'] as const;

/** Read-only gameplay view of an R132 bundle. Raw appearance remains lossless for sending/backups. */
export function resolveItemProperties(group: string, name: string, raw?: Record<string, unknown>) {
  const property: ItemProperties = { ...raw };
  const record = raw?.TypeRecord && typeof raw.TypeRecord === 'object' ? raw.TypeRecord as Record<string, unknown> : {};
  let unknown = keys.some(key => raw?.[key] !== undefined && (!Array.isArray(raw[key]) || !(raw[key] as unknown[]).every(v => typeof v === 'string')));
  if (raw?.TypeRecord !== undefined && (raw.TypeRecord === null || typeof raw.TypeRecord !== 'object' || Array.isArray(raw.TypeRecord))) unknown = true;
  const base = (definitions.items as Record<string, ItemProperties>)[`${group}/${name}`];
  function visit(config: Config): ItemProperties {
    unknown ||= !!config.unknown;
    const result: ItemProperties = { ...config.baseline };
    if (config.kind === 'modular') for (const key of ['Effect', 'Block', 'AllowActivity'] as const) {
      result[key] = [...new Set([...(base?.[key] ?? []), ...(result[key] ?? [])])];
    }
    function select(options: Option[], key: string) {
      const value = record[key] ?? 0;
      if (typeof value !== 'number' || !Number.isInteger(value) || !options[value]) { unknown = true; return; }
      const option = options[value];
      for (const k of keys) if (option.property[k]) {
        result[k] = config.kind === 'modular' ? [...new Set([...(result[k] ?? []), ...option.property[k]!])] : [...option.property[k]!];
      }
      if (option.child) {
        const child = visit(option.child);
        for (const k of keys) if (child[k]) result[k] = [...new Set([...(result[k] ?? []), ...child[k]!])];
      }
    }
    if (config.options) select(config.options, config.key ?? 'typed');
    for (const module of config.modules ?? []) select(module.options, module.key);
    return result;
  }
  const config = (catalog as Record<string, Config>)[`${group}/${name}`];
  if (config) {
    const defaults = visit(config);
    // Old full bundles and plugin overrides remain authoritative when supplied.
    for (const key of keys) if (property[key] === undefined && defaults[key] !== undefined) property[key] = [...defaults[key]!];
  }
  const effects = Array.isArray(property.Effect) ? [...property.Effect] : [];
  if (typeof raw?.LockedBy === 'string' && raw.LockedBy) effects.push('Lock');
  if (raw?.IsLeashed === true) effects.push('IsLeashed');
  if (effects.length) property.Effect = [...new Set(effects)];
  return { property, unknown };
}
