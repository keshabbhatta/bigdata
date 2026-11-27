"""Builds shared/nepal-data.js: every province, district and local level of Nepal
(with type and number of wards), in English AND Nepali.

Source: github.com/sagautam5/local-states-nepal (English and Nepali datasets).
The script refuses to write the file unless the totals match the official
structure of Nepal:
    7 provinces, 77 districts, 753 local levels
    (6 metropolitan cities, 11 sub-metropolitan cities, 276 municipalities,
     460 rural municipalities) and 6,743 wards,
and unless both language versions agree on every id, parent and ward count.

Every name in the dataset was reviewed by hand. The corrections below fix
typing faults, non-standard spellings and local levels renamed by the
government after the dataset was made.

Usage:  python tools/build-nepal-data.py            (downloads the datasets)
        python tools/build-nepal-data.py <folder>   (uses <name>.json and <name>_np.json there)
"""
import json
import os
import sys
import urllib.request
from collections import Counter

BASE = 'https://raw.githubusercontent.com/sagautam5/local-states-nepal/master/dataset/{}/{}.json'
OUT = os.path.join(os.path.dirname(__file__), '..', 'shared', 'nepal-data.js')
DEVANAGARI_DIGITS = str.maketrans('०१२३४५६७८९', '0123456789')

# ---- English corrections -------------------------------------------------------
PROVINCE_FIX = {'Sudurpaschim Province': 'Sudurpashchim Province'}
DISTRICT_FIX = {'Pachthar': 'Panchthar', 'Parwat': 'Parbat', 'Ramechap': 'Ramechhap', 'Acham': 'Achham'}
LOCAL_FIX = {  # id -> official English name (renamed local levels and typos)
    316: 'Budhanilkantha', 370: 'Aamachhodingmo', 388: 'Panchpokhari Thangpal', 390: 'Lisankhu Pakhar',
    396: 'Jaimini', 405: 'Barpak Sulikot', 433: 'Baragung Muktikshetra',
}

# ---- Nepali corrections ----------------------------------------------------------
PROVINCE_NE = {1: 'कोशी प्रदेश', 2: 'मधेश प्रदेश', 3: 'बागमती प्रदेश', 4: 'गण्डकी प्रदेश',
               5: 'लुम्बिनी प्रदेश', 6: 'कर्णाली प्रदेश', 7: 'सुदूरपश्चिम प्रदेश'}
DISTRICT_NE_FIX = {  # English name -> official Nepali spelling
    'Panchthar': 'पाँचथर', 'Khotang': 'खोटाङ', 'Morang': 'मोरङ', 'Okhaldhunga': 'ओखलढुङ्गा',
    'Solukhumbu': 'सोलुखुम्बु', 'Taplejung': 'ताप्लेजुङ', 'Dhading': 'धादिङ', 'Kathmandu': 'काठमाडौं',
    'Kavrepalanchok': 'काभ्रेपलाञ्चोक', 'Syangja': 'स्याङ्जा', 'Rupandehi': 'रूपन्देही',
    'Eastern Rukum': 'पूर्वी रुकुम', 'Western Rukum': 'पश्चिमी रुकुम',
}
LOCAL_NE_FIX = {  # id -> official Nepali spelling
    14: 'चौबिसे', 18: 'इलाम', 28: 'बिर्तामोड', 40: 'गौरीगञ्ज', 41: 'हल्दीबारी', 53: 'बेलबारी', 56: 'उर्लाबारी',
    58: 'सुनवर्षी', 67: 'केराबारी', 69: 'सिद्धिचरण', 85: 'खाँदबारी', 99: 'महाकुलुङ', 101: 'खुम्बु पासाङल्हामु',
    104: 'इनरुवा', 105: 'दुहबी', 107: 'इटहरी', 133: 'बेलका', 138: 'बीरगञ्ज', 154: 'कोल्हबी', 197: 'बसबरिया',
    210: 'मिर्चैया', 250: 'अग्निसाइर कृष्णासवरन', 285: 'धुनीबेसी', 291: 'ज्वालामुखी', 294: 'बेनीघाट रोराङ',
    295: 'रुबी भ्याली', 298: 'भीमेश्वर', 301: 'मेलुङ', 302: 'बिगु', 304: 'बैतेश्वर', 305: 'शैलुङ', 307: 'काठमाडौं',
    311: 'चन्द्रागिरि', 325: 'चौरीदेउराली', 342: 'राक्सिराङ', 344: 'बागमती', 346: 'इन्द्रसरोवर', 347: 'बिदुर',
    355: 'सूर्यगढी', 358: 'म्यागङ', 382: 'बाह्रबिसे', 386: 'इन्द्रावती', 396: 'जैमिनी', 397: 'बरेङ', 402: 'बडिगाड',
    408: 'चुमनुब्री', 410: 'भीमसेनथापा', 412: 'आरुघाट', 421: 'राइनास', 437: 'अन्नपूर्ण', 443: 'गैंडाकोट',
    445: 'मध्यबिन्दु', 448: 'बिनयी त्रिवेणी', 453: 'पैयुँ', 456: 'बिहादी', 463: 'आँधीखोला', 474: 'बन्दीपुर',
    475: 'ऋषिङ', 480: 'बुद्धभूमि', 483: 'महाराजगञ्ज', 485: 'यशोधरा', 486: 'शुद्धोधन', 502: 'कञ्चन', 515: 'पाणिनि',
    526: 'इस्मा', 556: 'नौबहिनी', 562: 'लुङ्ग्री', 571: 'नेपालगञ्ज', 631: 'शुभ कालिका', 647: 'लेकबेसी', 652: 'महाबु',
    679: 'बित्थडचिर', 685: 'सुर्मा', 701: 'डिलासैनी', 710: 'के.आई.सिंह', 724: 'पञ्चदेवल बिनायक', 733: 'पुनर्वास',
    734: 'बेदकोट', 735: 'महाकाली', 740: 'बेलडाँडी',
}


def clean_ne(s):
    """Remove invisible joiners and fix vowel signs typed as two characters."""
    s = s.replace('‌', '').replace('‍', '').strip()
    return s.replace('ाे', 'ो').replace('ाै', 'ौ')  # ा+े -> ो, ा+ै -> ौ


def load(name, lang, folder):
    if folder:
        fname = f'{name}.json' if lang == 'en' else f'{name}_np.json'
        with open(os.path.join(folder, fname), encoding='utf-8') as f:
            return json.load(f)
    with urllib.request.urlopen(BASE.format(name, lang), timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else None
    provinces, districts, locals_ = (load(n, 'en', folder) for n in ('provinces', 'districts', 'municipalities'))
    districts_np = {d['id']: d for d in load('districts', 'np', folder)}
    locals_np = {m['id']: m for m in load('municipalities', 'np', folder)}

    d_prov = {d['id']: d['province_id'] for d in districts}
    types = Counter(m['category_id'] for m in locals_)
    wards = sum(int(m['wards']) for m in locals_)
    checks = {
        'provinces': (len(provinces), 7), 'districts': (len(districts), 77), 'local levels': (len(locals_), 753),
        'metropolitan cities': (types[1], 6), 'sub-metropolitan cities': (types[2], 11),
        'municipalities': (types[3], 276), 'rural municipalities': (types[4], 460), 'wards': (wards, 6743),
        'nepali districts': (len(districts_np), 77), 'nepali local levels': (len(locals_np), 753),
    }
    per_province = {1: (14, 137, 1157), 2: (8, 136, 1271), 3: (13, 119, 1121), 4: (11, 85, 759),
                    5: (12, 109, 983), 6: (10, 79, 718), 7: (9, 88, 734)}
    for pid, (nd, nl, nw) in per_province.items():
        checks[f'province {pid} districts'] = (sum(1 for d in districts if d['province_id'] == pid), nd)
        checks[f'province {pid} local levels'] = (sum(1 for m in locals_ if d_prov[m['district_id']] == pid), nl)
        checks[f'province {pid} wards'] = (sum(int(m['wards']) for m in locals_ if d_prov[m['district_id']] == pid), nw)
    disagree = [m['id'] for m in locals_ if m['id'] not in locals_np
                or locals_np[m['id']]['district_id'] != m['district_id']
                or locals_np[m['id']]['category_id'] != m['category_id']
                or int(str(locals_np[m['id']]['wards']).translate(DEVANAGARI_DIGITS)) != int(m['wards'])]
    disagree += [d['id'] for d in districts if d['id'] not in districts_np or districts_np[d['id']]['province_id'] != d['province_id']]
    checks['english/nepali disagreements'] = (len(disagree), 0)
    bad = {k: v for k, v in checks.items() if v[0] != v[1]}
    if bad:
        sys.exit(f'Dataset does not match official totals, not writing: {bad}')

    P = [[p['id'], PROVINCE_FIX.get(p['name'], p['name']), PROVINCE_NE[p['id']]] for p in sorted(provinces, key=lambda p: p['id'])]
    D = []
    for d in sorted(districts, key=lambda d: d['id']):
        en = DISTRICT_FIX.get(d['name'], d['name'])
        D.append([d['id'], d['province_id'], en, DISTRICT_NE_FIX.get(en, clean_ne(districts_np[d['id']]['name']))])
    L = []
    for m in sorted(locals_, key=lambda m: m['id']):
        ne = LOCAL_NE_FIX.get(m['id'], clean_ne(locals_np[m['id']]['name']))
        L.append([m['id'], m['district_id'], m['category_id'], LOCAL_FIX.get(m['id'], m['name'].strip()), int(m['wards']), ne])
    if any(not r[-1] or any('a' <= ch.lower() <= 'z' for ch in r[-1]) for r in P + D + L):
        sys.exit('A Nepali name is empty or contains Latin letters, not writing.')

    def rows(a):
        return ',\n'.join('  ' + json.dumps(r, ensure_ascii=False) for r in a)

    js = f"""// GENERATED by tools/build-nepal-data.py. Do not edit by hand.
// Nepal's administrative structure: {len(P)} provinces, {len(D)} districts, {len(L)} local levels, {wards} wards.
// Source: github.com/sagautam5/local-states-nepal (English and Nepali datasets), checked against the
// official totals; names reviewed and corrected by hand (see the script).

/** [id, name, Nepali name] */
export const PROVINCES = [
{rows(P)},
];

/** [id, provinceId, name, Nepali name] */
export const DISTRICTS = [
{rows(D)},
];

/** [id, districtId, type (1 Metropolitan City, 2 Sub-Metropolitan City, 3 Municipality, 4 Rural Municipality), name, number of wards, Nepali name] */
export const LOCAL_LEVELS = [
{rows(L)},
];
"""
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print(f'Wrote {os.path.abspath(OUT)}: {len(P)} provinces, {len(D)} districts, {len(L)} local levels, {wards} wards (English + Nepali).')


if __name__ == '__main__':
    main()
