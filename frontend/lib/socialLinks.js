// The shop's social links, read from Dashboard > Homepage > Let's Talk (site_content key `contact`).
//
// Both footers use this. The shop footer used to carry its own hardcoded copies, so changing or
// removing a link in the editor changed the homepage and left every /shop page pointing at the old one.
//
// A field that was never saved (undefined/null) keeps the default, so a fresh install still shows the
// shop's pages. A field the owner cleared ('') hides that icon - that is how a network is removed.
export const SOCIAL_DEFAULTS = {
  facebook:  'https://www.facebook.com/share/1Mks4kwnhZ/?mibextid=wwXIfr',
  instagram: 'https://www.instagram.com/personalizemeprints',
  tiktok:    'https://www.tiktok.com/@personalizemeprints',
  shopee:    'https://shopee.ph/personalizemeprints',
};

export function socialsFrom(contact) {
  return {
    facebook:  contact?.facebook  ?? SOCIAL_DEFAULTS.facebook,
    instagram: contact?.instagram ?? SOCIAL_DEFAULTS.instagram,
    tiktok:    contact?.tiktok    ?? SOCIAL_DEFAULTS.tiktok,
    shopee:    contact?.shopeeUrl ?? SOCIAL_DEFAULTS.shopee,
    email:     contact?.email     ?? '',
  };
}

// "Facebook, Instagram and TikTok" - only the ones that are actually shown.
export function socialNames(s) {
  const names = [s.facebook && 'Facebook', s.instagram && 'Instagram', s.tiktok && 'TikTok'].filter(Boolean);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
