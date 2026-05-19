const BLOCKLIST = [
  // English
  'fuck','shit','bitch','asshole','bastard','cunt','damn','dick','piss','cock',
  'whore','slut','faggot','nigger','nigga','motherfucker','motherfucking',
  'bullshit','jackass','dumbass','ass','fag','twat','wanker','prick',
  // Common variants / leet
  'f*ck','sh*t','b*tch','f**k','sh**','a**hole',
  // Tagalog / Filipino
  'putang ina','putangina','puta','tangina','tang ina','tang-ina',
  'gago','gaga','gagong','bobo','tanga','ulol','hayop','peste',
  'leche','lintik','punyeta','kupal','tarantado','bwisit','hinayupak',
  'pakyu','pakyu','pakshet','pakingshet','pakingbet','putcha','hudas',
  'burat','pepe','tite','bilat','kantot','jakol','suso',
  'inamo','inamo ka','ina mo','ina nyo','ina nyo','inaymo',
  'anak ng puta','anak ng bitch','ungas','engot','gunggong',
];

const PATTERN = new RegExp(
  BLOCKLIST.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

export function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  return PATTERN.test(text.trim());
}
