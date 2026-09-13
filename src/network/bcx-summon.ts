import LZString from 'lz-string';
import type { ClientSnapshot } from '../shared/types';
/** Read-only BCX storage adapter; unsupported conditional rules fail closed. */
export function bcxSummon(state: Readonly<ClientSnapshot>): { members: number[]; text: string; seconds: number } | null {
  try {
    const raw = state.player?.ExtensionSettings?.BCX;
    if (typeof raw !== 'string' || raw.length > 2000000) return null;
    const data = JSON.parse(LZString.decompressFromBase64(raw) || 'null');
    if (!data || !Array.isArray(data.disabledModules) || data.disabledModules.includes(4)) return null;
    const category = data.conditions?.rules, rule = category?.conditions?.alt_forced_summoning;
    if (!rule || rule.active !== true || rule.data?.enforce === false || (rule.timer !== undefined && (!Number.isFinite(rule.timer) || rule.timer <= Date.now()))) return null;
    const requirements = rule.requirements ?? category.requirements;
    if (!requirements || typeof requirements !== 'object' || Object.keys(requirements).some(key => !['room','roomName','player','orLogic'].includes(key))) return null;
    const checks: boolean[] = [];
    if (requirements.room) {
      if (!['public','private'].includes(requirements.room.type)) return null;
      const room = state.room;
      if (room && !Array.isArray(room.Visibility)) return null;
      const privateRoom = !!room && !room.Visibility?.includes('All');
      const match = !!room && (requirements.room.type === 'private' ? privateRoom : !privateRoom);
      checks.push(requirements.room.inverted ? !match : match);
    }
    if (requirements.roomName) { if (typeof requirements.roomName.name !== 'string') return null; const match = state.room?.Name.toLowerCase() === requirements.roomName.name.toLowerCase(); checks.push(requirements.roomName.inverted ? !match : match); }
    if (requirements.player) { const match = !!state.room && state.characters.some(c => c.MemberNumber === requirements.player.memberNumber); checks.push(requirements.player.inverted ? !match : match); }
    if (checks.length && !(requirements.orLogic ? checks.some(Boolean) : checks.every(Boolean))) return null;
    const custom = rule.data.customData;
    if (!Array.isArray(custom?.allowedMembers) || custom.allowedMembers.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0) || typeof custom.summoningText !== 'string' || !custom.summoningText.trim() || !Number.isFinite(custom.summonTime) || custom.summonTime < 0 || custom.summonTime > 3600) return null;
    return {members:custom.allowedMembers,text:custom.summoningText.trim(),seconds:custom.summonTime};
  } catch { return null; }
}
