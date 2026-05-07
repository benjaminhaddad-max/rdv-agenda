/**
 * Validation email pragmatique côté client.
 * - Vérifie le format basique
 * - Vérifie que le TLD est dans une liste blanche de TLDs courants
 * - Détecte les typos sur les providers connus (gmail.fldk → gmail.com)
 */

export const VALID_TLDS = new Set([
  'com','fr','net','org','eu','be','ch','ca','uk','de','es','it','pt','nl','lu',
  'edu','gov','io','co','me','app','info','biz','dev','tv','fm','pro','xyz','tech',
  'online','site','store','club','studio','agency','design','shop','blog','live',
  'ai','art','cloud','digital','email','expert','group','health','media','news',
  'paris','school','solutions','support','team','training','world','academy',
  'ovh','re','tn','ma','dz','sn','ci','lb','sg','jp','cn','kr','au','nz','br','mx','ar',
  'ru','ua','pl','cz','at','dk','se','no','fi','ie','gr','tr','il','in','ae','sante',
])

export const KNOWN_PROVIDERS: Record<string, string> = {
  gmail: 'gmail.com',
  googlemail: 'googlemail.com',
  hotmail: 'hotmail.com',
  outlook: 'outlook.com',
  yahoo: 'yahoo.com',
  icloud: 'icloud.com',
  protonmail: 'protonmail.com',
  proton: 'proton.me',
  laposte: 'laposte.net',
  free: 'free.fr',
  orange: 'orange.fr',
  wanadoo: 'wanadoo.fr',
  sfr: 'sfr.fr',
}

/**
 * Retourne null si l'email est valide, sinon un message d'erreur en français.
 */
export function validateEmailDomain(email: string): string | null {
  const e = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Format d'email invalide"
  const domain = e.split('@')[1]
  const parts = domain.split('.')
  const provider = parts[0]
  const tld = parts[parts.length - 1]
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) return 'Domaine invalide'
  if (!VALID_TLDS.has(tld)) return `Le domaine ".${tld}" n'existe pas`
  if (KNOWN_PROVIDERS[provider] && domain !== KNOWN_PROVIDERS[provider]) {
    return `Vouliez-vous dire ${e.split('@')[0]}@${KNOWN_PROVIDERS[provider]} ?`
  }
  return null
}
