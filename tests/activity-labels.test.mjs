import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPenis, physicalGroup, textGroup, activityLabel, cuddleReason, cuddleState } from './activity-helper.mjs';
import { gameCatalog } from './catalog-helper.mjs';
test('activity labels follow self/other fallback and BC anatomical text aliases', () => {
  const male = { Appearance: [{ Group: 'Pussy', Name: 'Penis' }] };
  assert.equal(hasPenis(male), true);
  assert.equal(hasPenis({ Appearance: [{ Group: 'ItemVulva', Name: 'PenisDildo' }] }), false);
  assert.equal(physicalGroup('ItemGlans'), 'ItemVulvaPiercings');
  assert.equal(textGroup('ItemVulva', male), 'ItemPenis');
  assert.equal(activityLabel('Test', 'ItemVulva', male, false, { 'Label-ChatSelf-ItemPenis-Test': 'Translated' }), 'Translated');
  assert.equal(activityLabel('XSAct_Test', 'ItemHead', {}, false, { 'Label-ChatOther-ItemHead-XSAct_Test': 'MISSING TEXT IN test' }), 'Test');
  const catalog = gameCatalog('zh');
  assert.ok(Object.keys(catalog).filter(k => k.startsWith('Label-') && k.includes('XSAct_')).length > 50);
  assert.equal(activityLabel('钻进怀里', 'ItemTorso', {}, false, gameCatalog('en')), 'Get In Arms');
});
test('cuddle state is reciprocal and occupied own slots cannot be overwritten', () => {
  const a = { MemberNumber: 1, Appearance: [{ Group: 'BodyUpper', Name: 'Normal' }] };
  const b = { ...a, MemberNumber: 2 };
  assert.equal(cuddleReason(a, b), null);
  assert.equal(cuddleReason({ ...a, Appearance: [...a.Appearance, { Group: 'ItemMisc', Name: 'Other' }] }, b), 'cuddle.occupied');
  assert.equal(cuddleState('钻进怀里', 2).prevCharacter, 2);
  assert.equal(cuddleState('钻进怀里', 1, true).nextCharacter, 1);
  assert.equal(cuddleState('抱入怀中', 2).nextCharacter, 2);
  assert.equal(cuddleState('抱入怀中', 1, true).prevCharacter, 1);
});
