// Local, reviewed templates only. No translation service or plugin execution.
import { readFileSync } from 'node:fs';
import { compileCatalogs } from './compile-action-catalogs.mjs';
import { writeJson } from './catalog-utils.mjs';
const locales = ['ja','ko','de','fr','ru','uk','zh-cn','zh'];
const parts = {
  Face:['顔','얼굴','Gesicht','visage','лицо','обличчя','脸','臉'],
  Arm:['腕','팔','Arm','bras','руку','руку','手臂','手臂'],
  Arms:['腕','팔','Arme','bras','руки','руки','手臂','手臂'],
  Hands:['手','손','Hände','mains','руки','руки','手','手'],
  Thighs:['太もも','허벅지','Oberschenkel','cuisses','бёдра','стегна','大腿','大腿'],
  Legs:['脚','다리','Beine','jambes','ноги','ноги','腿','腿'],
  Calves:['ふくらはぎ','종아리','Waden','mollets','икры','литки','小腿','小腿'],
  Feet:['足','발','Füße','pieds','ступни','ступні','脚','腳'],
  Breast:['胸','가슴','Brust','poitrine','грудь','груди','胸部','胸部'],
  Breasts:['胸','가슴','Brüste','seins','грудь','груди','乳房','乳房'],
  Butt:['お尻','엉덩이','Po','fesses','ягодицы','сідниці','屁股','屁股'],
  Nipples:['乳首','유두','Brustwarzen','mamelons','соски','соски','乳头','乳頭'],
  Vulva:['外陰部','외음부','Vulva','vulve','вульву','вульву','外阴','外陰'],
  Clitoris:['クリトリス','음핵','Klitoris','clitoris','клитор','клітор','阴蒂','陰蒂'],
  Nose:['鼻','코','Nase','nez','нос','ніс','鼻子','鼻子'],
  Head:['頭','머리','Kopf','tête','голову','голову','头','頭'],
  Neck:['首','목','Hals','cou','шею','шию','脖子','脖子'],
  Ears:['耳','귀','Ohren','oreilles','уши','вуха','耳朵','耳朵'],
  Torso:['胴体','몸통','Rumpf','torse','туловище','тулуб','躯干','軀幹'],
  Abdomen:['お腹','배','Bauch','ventre','живот','живіт','腹部','腹部'],
  Cheek:['頬','뺨','Wange','joue','щёку','щоку','脸颊','臉頰'],
};
// Each row is [button, message]. {p} is a translated body part.
const patterns = {
  finger: [
    ['{p}を指でつつく','SourceCharacterはDestinationCharacterの{p}を指先でつつきます。'],
    ['{p} 손끝으로 찌르기','SourceCharacter 님이 DestinationCharacter의 {p} 부위를 손끝으로 콕 찌릅니다.'],
    ['{p} anstupsen','SourceCharacter stupst DestinationCharacter mit der Fingerspitze an ({p}).'],
    ['Tapoter : {p}','SourceCharacter tapote du bout du doigt cette partie du corps de DestinationCharacter : {p}.'],
    ['Ткнуть: {p}','SourceCharacter тыкает пальцем в {p} DestinationCharacter.'],
    ['Тицьнути: {p}','SourceCharacter тицяє пальцем у {p} DestinationCharacter.'],
    ['戳{p}','SourceCharacter用指尖戳了戳DestinationCharacter的{p}。'],
    ['戳{p}','SourceCharacter用指尖戳了戳DestinationCharacter的{p}。'],
  ],
  tentacle: [
    ['触手で{p}をつつく','SourceCharacterは触手でDestinationCharacterの{p}をそっとつつきます。'],
    ['촉수로 {p} 찌르기','SourceCharacter 님이 촉수로 DestinationCharacter의 {p} 부위를 살짝 찌릅니다.'],
    ['{p} mit Tentakeln anstupsen','SourceCharacter stupst DestinationCharacter sanft mit Tentakeln an ({p}).'],
    ['Tapoter avec des tentacules : {p}','SourceCharacter tapote doucement avec des tentacules cette partie du corps de DestinationCharacter : {p}.'],
    ['Ткнуть щупальцами: {p}','SourceCharacter мягко тыкает щупальцами в {p} DestinationCharacter.'],
    ['Тицьнути щупальцями: {p}','SourceCharacter ніжно тицяє щупальцями у {p} DestinationCharacter.'],
    ['触手戳{p}','SourceCharacter用触手轻轻戳了戳DestinationCharacter的{p}。'],
    ['觸手戳{p}','SourceCharacter用觸手輕輕戳了戳DestinationCharacter的{p}。'],
  ],
  toe: [
    ['足指で{p}をつつく','SourceCharacterは足指でDestinationCharacterの{p}をつつきます。'],
    ['발가락으로 {p} 찌르기','SourceCharacter 님이 발가락으로 DestinationCharacter의 {p} 부위를 콕 찌릅니다.'],
    ['{p} mit dem Zeh anstupsen','SourceCharacter stupst DestinationCharacter mit dem Zeh an ({p}).'],
    ['Tapoter avec un orteil : {p}','SourceCharacter tapote avec un orteil cette partie du corps de DestinationCharacter : {p}.'],
    ['Ткнуть пальцем ноги: {p}','SourceCharacter тыкает пальцем ноги в {p} DestinationCharacter.'],
    ['Тицьнути пальцем ноги: {p}','SourceCharacter тицяє пальцем ноги у {p} DestinationCharacter.'],
    ['脚趾戳{p}','SourceCharacter用脚趾戳了戳DestinationCharacter的{p}。'],
    ['腳趾戳{p}','SourceCharacter用腳趾戳了戳DestinationCharacter的{p}。'],
  ],
  massage: [
    ['足で{p}を揉む','SourceCharacterは足でDestinationCharacterの{p}を優しくマッサージします。'],
    ['발로 {p} 마사지하기','SourceCharacter 님이 발로 DestinationCharacter의 {p} 부위를 부드럽게 마사지합니다.'],
    ['{p} mit Füßen massieren','SourceCharacter massiert DestinationCharacter sanft mit den Füßen ({p}).'],
    ['Masser avec les pieds : {p}','SourceCharacter masse doucement avec les pieds cette partie du corps de DestinationCharacter : {p}.'],
    ['Массировать ногами: {p}','SourceCharacter нежно массирует ногами {p} DestinationCharacter.'],
    ['Масажувати ногами: {p}','SourceCharacter ніжно масажує ногами {p} DestinationCharacter.'],
    ['脚按摩{p}','SourceCharacter用脚轻轻按摩DestinationCharacter的{p}。'],
    ['腳按摩{p}','SourceCharacter用腳輕輕按摩DestinationCharacter的{p}。'],
  ],
  nuzzle: [
    ['ペニスを擦り寄せる','SourceCharacterはPronounPossessiveペニスをDestinationCharacterの{p}に擦り寄せます。'],
    ['음경 비비기','SourceCharacter 님이 PronounPossessive 음경을 DestinationCharacter의 {p} 부위에 비빕니다.'],
    ['Penis anschmiegen','SourceCharacter schmiegt PronounPossessive Penis an DestinationCharacter ({p}).'],
    ['Frotter le pénis','SourceCharacter frotte PronounPossessive pénis contre cette partie du corps de DestinationCharacter : {p}.'],
    ['Потереться пенисом','SourceCharacter трётся пенисом (PronounPossessive) о {p} DestinationCharacter.'],
    ['Потертися пенісом','SourceCharacter треться пенісом (PronounPossessive) об {p} DestinationCharacter.'],
    ['阴茎摩擦','SourceCharacter用PronounPossessive阴茎摩擦DestinationCharacter的{p}。'],
    ['陰莖摩擦','SourceCharacter用PronounPossessive陰莖摩擦DestinationCharacter的{p}。'],
  ],
  pinch: [
    ['{p}をつまむ','SourceCharacterはTargetCharacterの{p}をつまみます。'],
    ['{p} 꼬집기','SourceCharacter 님이 TargetCharacter의 {p} 부위를 꼬집습니다.'],
    ['{p} kneifen','SourceCharacter kneift TargetCharacter ({p}).'],
    ['Pincer : {p}','SourceCharacter pince cette partie du corps de TargetCharacter : {p}.'],
    ['Ущипнуть: {p}','SourceCharacter щиплет {p} TargetCharacter.'],
    ['Ущипнути: {p}','SourceCharacter щипає {p} TargetCharacter.'],
    ['捏{p}','SourceCharacter捏了捏TargetCharacter的{p}。'],
    ['捏{p}','SourceCharacter捏了捏TargetCharacter的{p}。'],
  ],
};
const catalogs=compileCatalogs();
for (const [index,locale] of locales.entries()) {
  const file=`src/translations/overrides/${locale}.json`, dictionary=JSON.parse(readFileSync(file,'utf8'));
  for (const [key,text] of Object.entries(catalogs.en)) {
    if (!/^(?:Label-)?Chat(?:Other|Self)-/.test(key) || Object.hasOwn(catalogs[locale],key) || Object.hasOwn(dictionary,key)) continue;
    const messageKey=key.replace(/^Label-/,''), message=catalogs.en[messageKey];
    let kind,part;
    for (const [candidate,regex] of Object.entries({finger:/pokes DestinationCharacter (.+) with the tip of finger/,tentacle:/gently pokes DestinationCharacter (.+) with tentacles/,toe:/pokes DestinationCharacter (.+) with toe/,massage:/gently massages DestinationCharacter (.+) with feet/,nuzzle:/nuzzles DestinationCharacter (.+) with PronounPossessive penis/,pinch:/pinches (?:TargetCharacter's|PronounPossessive own) (.+)\./})) {
      const match=message?.match(regex);
      if (match) { kind=candidate; part=Object.keys(parts).find(p=>p.toLowerCase()===match[1].toLowerCase()); break; }
    }
    if (!kind || !part) throw new Error(`Missing reviewed template: ${locale}: ${key}`);
    let value=patterns[kind][index][key.startsWith('Label-')?0:1].replaceAll('{p}',parts[part][index]);
    if (kind==='pinch' && key.startsWith('ChatSelf')) value=[
      'SourceCharacterはPronounPossessive{p}をつまみます。',
      'SourceCharacter 님이 PronounPossessive {p} 부위를 꼬집습니다.',
      'SourceCharacter kneift sich selbst ({p}, PronounPossessive).',
      'SourceCharacter se pince ({p}, PronounPossessive).',
      'SourceCharacter щиплет собственную часть тела: {p} (PronounPossessive).',
      'SourceCharacter щипає власну частину тіла: {p} (PronounPossessive).',
      'SourceCharacter捏了捏PronounPossessive自己的{p}。',
      'SourceCharacter捏了捏PronounPossessive自己的{p}。',
    ][index].replaceAll('{p}',parts[part][index]);
    dictionary[key]=value;
  }
  writeJson(file,dictionary);
}
