// Real photographs used on the public pages. All come from Wikimedia Commons under
// licences that allow reuse; the credit and licence are shown wherever a photo appears.
// The people shown are NOT users or patients of this app.
//
// Each photo exists in public/images as <name>-800.webp, <name>-1400.webp and <name>.jpg
// (1400 px, for old browsers), all cropped to 3:2. Phones download the small WebP only.
const BY = 'https://creativecommons.org/licenses/by/4.0';
const BY2 = 'https://creativecommons.org/licenses/by/2.0';
const BYSA = 'https://creativecommons.org/licenses/by-sa/4.0';
const DFAT = 'Department of Foreign Affairs and Trade (Australia)';

export const PHOTOS = {
  fchv: {
    name: 'fchv-salyan',
    alt: 'A health volunteer in a blue sari talks with a group of mothers sitting outside a house.',
    caption: 'Amrika KC, a female community health volunteer in Salyan, talks with expecting mothers about regular check-ups.',
    credit: 'USAID Nepal', license: 'Public domain',
    page: 'https://commons.wikimedia.org/wiki/File:Amrika_KC,_a_Female_Community_Health_Volunteer_from_Salyan_district,_talks_with_would-be_mothers_about_the_importance_of_regular_antenatal_checkups.jpg',
  },
  committee: {
    name: 'women-committee',
    alt: 'A woman in a sari speaks to a large group of village women sitting on the ground in the shade.',
    caption: 'Village women meet outdoors for their community committee in Nepal.',
    credit: 'Dutch WASH Alliance', license: 'CC BY 2.0', licenseUrl: BY2,
    page: 'https://commons.wikimedia.org/wiki/File:16_Women_water_committe_(14784079114).jpg',
  },
  motherChild: {
    name: 'mother-child-checkup',
    alt: 'A mother holds her small son on her lap while a health worker checks his foot.',
    caption: 'A health worker checks a child at Batulechaur Health Post, Pokhara.',
    credit: DFAT, license: 'CC BY 4.0', licenseUrl: BY,
    page: 'https://commons.wikimedia.org/wiki/File:Mother_Nishal_Thapa,_brings_her_child_to_the_tempoary_Batulechaur_Health_Post._(10702522495).jpg',
  },
  womensMeeting: {
    name: 'womens-health-meeting',
    alt: 'Many women and children sit in a health post room with health posters on the walls.',
    caption: 'A women’s health meeting at a rural health post, 2014.',
    credit: 'MaryBB2009', license: 'CC BY-SA 4.0', licenseUrl: BYSA,
    page: 'https://commons.wikimedia.org/wiki/File:Nepal_trip_2014_bhalayatar.jpg',
  },
  elderCheck: {
    name: 'bp-check-elder',
    alt: 'A young health worker wraps a blood pressure cuff around an older woman’s arm.',
    caption: 'A blood pressure check for an older woman at Batulechaur Health Post, Pokhara.',
    credit: DFAT, license: 'CC BY 4.0', licenseUrl: BY,
    page: 'https://commons.wikimedia.org/wiki/File:Bishnu_Maya_Thapa_is_the_Health_Worker_as_Bishnu_Maya_Sunar_arrives_at_the_temporary_Batulechaur_Health_Post_for_a_blood_pressure_checkup_(10677193566).jpg',
  },
  polio: {
    name: 'polio-drops',
    alt: 'A baby receives polio vaccine drops in the mouth.',
    caption: 'Polio drops during routine vaccination in Pokhara.',
    credit: DFAT, license: 'CC BY 4.0', licenseUrl: BY,
    page: 'https://commons.wikimedia.org/wiki/File:District_Public_Health_Office,_Immunisation_Clinic,_Pokhara,_Nepal._(10693299213).jpg',
  },
  village: {
    name: 'sindhupalchok',
    alt: 'A small village of a few houses on a steep terraced hillside covered in forest.',
    caption: 'Kalleri, Sindhupalchok. Homes sit far apart on steep terraced hills.',
    credit: 'YubarajKhatri1', license: 'CC BY-SA 4.0', licenseUrl: BYSA,
    page: 'https://commons.wikimedia.org/wiki/File:Sindhupalchok,_Nepal.jpg',
  },
  checkup: {
    name: 'bp-check',
    alt: 'A health worker in a white coat measures a woman’s blood pressure at a desk.',
    caption: 'A blood pressure check at Batulechaur Health Post, Pokhara.',
    credit: DFAT, license: 'CC BY 4.0', licenseUrl: BY,
    page: 'https://commons.wikimedia.org/wiki/File:Health_Worker_Bisnu_Poudel_check_the_blood_pressure_of_Sabina_Rai_at_the_temporary_Batulechaur_Health_Post,_Pokhara,_Nepal_(10700206874).jpg',
  },
  terraces: {
    name: 'terraces',
    alt: 'Green rice terraces on a hillside under a cloudy sky, with mountains behind.',
    caption: 'Terraced fields in Chamunda, Dailekh.',
    credit: 'Kuber Rana Magar', license: 'CC BY-SA 4.0', licenseUrl: BYSA,
    page: 'https://commons.wikimedia.org/wiki/File:Terrace_Farming_in_Chamunda_VDC_of_Dailekh.jpg',
  },
  vaccination: {
    name: 'vaccination',
    alt: 'A mother holds her baby while a nurse gives a vaccine.',
    caption: 'Routine vaccination at the District Public Health Office, Pokhara.',
    credit: DFAT, license: 'CC BY 4.0', licenseUrl: BY,
    page: 'https://commons.wikimedia.org/wiki/File:District_Public_Health_Office,_Immunisation_Clinic,_Pokhara,_Nepal._(10692915725).jpg',
  },
};

/** The photos that take turns at the top of the home page. */
export const HERO_SLIDES = [PHOTOS.fchv, PHOTOS.committee, PHOTOS.motherChild, PHOTOS.womensMeeting, PHOTOS.elderCheck, PHOTOS.polio];

/** srcset / fallback for <picture>. */
export const webpSet = (p) => `/images/${p.name}-800.webp 800w, /images/${p.name}-1400.webp 1400w`;
export const jpg = (p) => `/images/${p.name}.jpg`;
