// Nepali for messages that contain changing parts (a field name, an email, a
// ward code, a number). They come from the server or from the shared form
// checks (shared/schema.js, shared/accounts.js). Fixed messages are in ne.js.
import { areaLabel, toNepaliDigits } from '../../../shared/areas.js';

const ENTITY_NE = { patient: 'बिरामी', pregnancy: 'गर्भावस्था', visit: 'भेट' };
const PASSWORD_PARTS = [
  ['at least 8 characters', 'कम्तीमा ८ अक्षर'],
  ['a lowercase letter', 'एउटा सानो अक्षर (a-z)'],
  ['an uppercase letter', 'एउटा ठूलो अक्षर (A-Z)'],
  ['a number', 'एउटा अङ्क (0-9)'],
  ['a symbol, for example ! @ # $', 'एउटा चिन्ह (जस्तै ! @ # $)'],
];
const ward = (code) => areaLabel(code, { lang: 'ne', short: true });

/** @returns {string|null} Nepali text, or null when no pattern matches. */
export function translatePatternNe(text, t) {
  const rules = [
    [/^(.+) must be a number$/, (m) => `${t(m[1])} अङ्कमा लेख्नुहोस्।`],
    [/^(.+) must be between (\S+) and (\S+)$/, (m) => `${t(m[1])} ${toNepaliDigits(m[2])} देखि ${toNepaliDigits(m[3])} सम्म हुनुपर्छ।`],
    [/^(.+) must be one of: (.+)$/, (m) => `${t(m[1])} यीमध्ये एउटा हुनुपर्छ: ${m[2].split(', ').map((v) => t(v)).join(', ')}।`],
    [/^(.+) must be a date \(YYYY-MM-DD\)$/, (m) => `${t(m[1])} सही मिति (YYYY-MM-DD) हुनुपर्छ।`],
    [/^(.+) must be text$/, (m) => `${t(m[1])} अक्षरमा लेख्नुहोस्।`],
    [/^(.+) is too long$/, (m) => `${t(m[1])} धेरै लामो भयो।`],
    [/^(.+) is required$/, (m) => `${t(m[1])} अनिवार्य छ।`],
    [/^Unknown field "(.+)"$/, (m) => `"${m[1]}" नामको क्षेत्र छैन।`],
    [/^Unknown entity "(.+)"$/, (m) => `"${m[1]}" नामको रेकर्ड प्रकार छैन।`],
    [/^(\w+) records are append-only; record a new one instead$/,
      (m) => `${t(m[1])} रेकर्ड बदल्न मिल्दैन। सच्याउन नयाँ ${t(m[1])} रेकर्ड गर्नुहोस्।`],
    [/^Password needs (.+)\.$/, (m) => {
      const parts = PASSWORD_PARTS.filter(([en]) => m[1].includes(en)).map(([, ne]) => ne);
      return `पासवर्डमा यी पनि चाहिन्छ: ${parts.join(', ')}।`;
    }],
    [/^Password must be at most (\d+) characters\.$/, (m) => `पासवर्ड बढीमा ${toNepaliDigits(m[1])} अक्षरको हुनुपर्छ।`],
    [/^"(.+)" cannot receive email\. Check the address for typos\.$/, (m) => `"${m[1]}" मा इमेल आउन सक्दैन। इमेल ठेगाना फेरि जाँच्नुहोस्।`],
    [/^"(.+)" is not a ward of Nepal$/, (m) => `"${m[1]}" नेपालको कुनै वडा होइन।`],
    [/^You cannot write to (.+)$/, (m) => `${ward(m[1])} मा परिवर्तन गर्ने अनुमति तपाईंलाई छैन।`],
    [/^Record belongs to (.+); records cannot move between wards$/, (m) => `यो रेकर्ड ${ward(m[1])} को हो। रेकर्ड एक वडाबाट अर्को वडामा सार्न मिल्दैन।`],
    [/^Record is a (\w+), not a (\w+)$/, (m) => `यो रेकर्ड ${ENTITY_NE[m[1]] || m[1]} हो, ${ENTITY_NE[m[2]] || m[2]} होइन।`],
    [/^Email\/username or password is incorrect\.(.*)$/, (m) => `इमेल/प्रयोगकर्ता नाम वा पासवर्ड मिलेन।${m[1] ? ' यो खाता गुगलबाट बनाइएको हो; "गुगलबाट जारी राख्नुहोस्" थिच्नुहोस्।' : ''}`],
    [/^Google could not confirm this sign-in \((.+)\)\.$/, () => 'गुगलले यो साइन इन पुष्टि गर्न सकेन। फेरि प्रयास गर्नुहोस्।'],
    [/^No account uses (.+) yet\./, (m) => `${m[1]} प्रयोग गर्ने खाता अझै छैन। "नयाँ खाता बनाउनुहोस्" थिचेर "गुगलबाट जारी राख्नुहोस्" थिच्नुहोस्।`],
    [/^Send at most (\d+) events per request\.$/, (m) => `एक पटकमा बढीमा ${toNepaliDigits(m[1])} वटा परिवर्तन पठाउनुहोस्।`],
    [/^Request failed \((\d+)\)$/, (m) => `अनुरोध असफल भयो (${toNepaliDigits(m[1])})।`],
    [/^Sent (\d+) changes$/, (m) => `${toNepaliDigits(m[1])} वटा परिवर्तन पठाइयो`],
    [/^Received (\d+) updates$/, (m) => `${toNepaliDigits(m[1])} वटा अद्यावधिक प्राप्त भयो`],
    [/^No route for /, () => 'यो ठेगाना सर्भरमा छैन।'],
    [/^Mode must be /, () => 'मोड "safe" वा "naive" मात्र हुन सक्छ।'],
    [/^(\d+) changes by (.+) have not synced yet\./, (m) => `${m[2]} का ${toNepaliDigits(m[1])} वटा परिवर्तन अझै सिंक भएका छैनन्। अर्को व्यक्तिले यो फोनमा साइन इन गर्नुअघि इन्टरनेट जोडेर सिंक गर्नुहोस्।`],
    [/^This is a (.+) account\. Choose "(.+)" above and sign in again\.$/, (m) => `यो ${t(m[1])} खाता हो। माथि "${t(m[2])}" छानेर फेरि साइन इन गर्नुहोस्।`],
  ];
  for (const [re, fn] of rules) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return null;
}
