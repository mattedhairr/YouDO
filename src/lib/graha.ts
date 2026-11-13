/**
 * The graha of the day on the ambient screen. Each weekday is named after one
 * of seven grahas (vāra): Ravivāra the Sun, Somavāra the Moon, and so on. Its
 * planet sits small in the sky and rises slowly through the day; a tap shows
 * one story or fact about it, with its source.
 *
 * The facts are kept short and sourced: stories from named texts, the Navagraha
 * Stotra's verse for each graha (attributed to Vyāsa; our own translation),
 * Jyotiṣa where it explains the calendar, and plain astronomy. No predictions.
 */

export interface GrahaFact {
  text: string;
  source: string;
}

export interface Graha {
  /** Devanagari */
  dev: string;
  /** IAST */
  name: string;
  /** English planet */
  planet: string;
  /** The weekday it names */
  vara: string;
  facts: GrahaFact[];
}

const STOTRA = 'Navagraha Stotra, attributed to Vyāsa';

/** Indexed by the JavaScript weekday: 0 is Sunday. */
export const GRAHAS: Graha[] = [
  {
    dev: 'सूर्य',
    name: 'Sūrya',
    planet: 'Sun',
    vara: 'Ravivāra · Sunday',
    facts: [
      { text: 'The Gāyatrī mantra is addressed to Savitṛ, the Sun as the one who stirs all things to act. It asks him to inspire our thoughts.', source: 'Ṛgveda 3.62.10' },
      { text: 'Why Monday follows Sunday: each hour (horā) of the day is ruled in turn by the grahas, from the slowest to the fastest: Śani, Guru, Maṅgala, Sūrya, Śukra, Budha, Chandra. The graha of the first hour at sunrise names the day. After 24 hours the turn has moved three places on, so the next day belongs to Chandra.', source: 'Jyotiṣa, Sūrya Siddhānta' },
      { text: '“Red as the japā flower, son of Kaśyapa, great in radiance, foe of darkness: I bow to Divākara, the maker of the day.”', source: STOTRA },
      { text: 'Sūrya’s chariot is drawn by seven horses, named after the seven metres of the Vedas, from Gāyatrī to Paṅkti.', source: 'Viṣṇu Purāṇa' },
      { text: 'Sunlight leaving the Sun now reaches you in about 8 minutes and 20 seconds. The Sun holds 99.8% of the mass of the whole Solar System.', source: 'Astronomy' },
    ],
  },
  {
    dev: 'चन्द्र',
    name: 'Chandra',
    planet: 'Moon',
    vara: 'Somavāra · Monday',
    facts: [
      { text: 'Monday is named after Soma. The whole ninth maṇḍala of the Ṛgveda, 114 hymns, is given to Soma, and later tradition knows Soma as the Moon.', source: 'Ṛgveda, Maṇḍala 9' },
      { text: 'A tithi is the time the Moon takes to gain 12° on the Sun. Thirty tithis make a lunar month, and because the Moon’s speed changes, a tithi lasts anywhere from about 19 to 26 hours.', source: 'Jyotiṣa, the pañcāṅga' },
      { text: 'The 27 nakṣatras are the Moon’s stations: it passes through all of them in about 27⅓ days, roughly one a night. In the Purāṇas they are Dakṣa’s daughters, married to Chandra.', source: 'Purāṇas' },
      { text: '“White as curd, conch and frost, born of the Ocean of Milk, the jewel on Śiva’s crown: I bow to Soma, the Moon.”', source: STOTRA },
      { text: 'The Moon always shows us the same face, and it moves about 3.8 cm farther from Earth every year.', source: 'Astronomy' },
    ],
  },
  {
    dev: 'मङ्गल',
    name: 'Maṅgala',
    planet: 'Mars',
    vara: 'Maṅgalavāra · Tuesday',
    facts: [
      { text: 'Maṅgala means “auspicious”. The red graha is also called Bhauma or Kuja, “son of Bhūmi”, the Earth.', source: 'Purāṇas' },
      { text: '“Born of the Earth, bright as lightning, the youth with the spear in his hand: I bow to Maṅgala.”', source: STOTRA },
      { text: 'Mars is red because its dust is rich in iron oxide: rust. Its volcano Olympus Mons is about two and a half times as tall as Everest.', source: 'Astronomy' },
      { text: 'A day on Mars lasts 24 hours and 37 minutes, so close to ours that rover teams live on “Mars time”.', source: 'Astronomy' },
    ],
  },
  {
    dev: 'बुध',
    name: 'Budha',
    planet: 'Mercury',
    vara: 'Budhavāra · Wednesday',
    facts: [
      { text: 'Budha means “the wise one, the awakened”. In the Purāṇas he is the son of Chandra and Tārā.', source: 'Purāṇas' },
      { text: '“Dark as a priyaṅgu bud, of matchless form, gentle and of gentle nature: I bow to Budha.”', source: STOTRA },
      { text: 'Mercury circles the Sun in only 88 days, the fastest of all the planets.', source: 'Astronomy' },
      { text: 'Mercury never strays more than about 28° from the Sun, so you can only see it low in the sky just after sunset or before sunrise.', source: 'Astronomy' },
    ],
  },
  {
    dev: 'बृहस्पति',
    name: 'Bṛhaspati',
    planet: 'Jupiter',
    vara: 'Guruvāra · Thursday',
    facts: [
      { text: 'Bṛhaspati, “lord of prayer”, is the guru of the devas, which is why Thursday is also Guruvāra. Hymns of the Ṛgveda praise him.', source: 'Ṛgveda (for example 4.50)' },
      { text: '“Guru of the gods and the sages, bright as gold, wisdom itself, lord of the three worlds: I bow to Bṛhaspati.”', source: STOTRA },
      { text: 'Jupiter takes about 12 years to go once round the sky. Five of its rounds make the 60-year saṃvatsara cycle of the Indian calendar.', source: 'Jyotiṣa' },
      { text: 'Jupiter’s Great Red Spot is a storm wider than the whole Earth, and it has been raging for centuries.', source: 'Astronomy' },
    ],
  },
  {
    dev: 'शुक्र',
    name: 'Śukra',
    planet: 'Venus',
    vara: 'Śukravāra · Friday',
    facts: [
      { text: 'Śukra is Śukrācārya, guru of the asuras, who alone knew the Mṛtasañjīvanī, the knowledge that brings the dead back to life. Kaca, Bṛhaspati’s son, came to learn it from him.', source: 'Mahābhārata, Ādi Parva' },
      { text: '“White as snow, jasmine and lotus stalk, supreme guru of the daityas, teacher of every śāstra: I bow to Bhārgava.”', source: STOTRA },
      { text: 'Śukra means “bright, clear”, and Venus is the brightest planet in our sky: the morning and evening star.', source: 'Astronomy' },
      { text: 'A day on Venus (243 Earth days) is longer than its year (225). It also spins backwards: there, the Sun rises in the west.', source: 'Astronomy' },
    ],
  },
  {
    dev: 'शनि',
    name: 'Śani',
    planet: 'Saturn',
    vara: 'Śanivāra · Saturday',
    facts: [
      { text: 'Śani is also Śanaiścara, “the one who moves slowly”: Saturn takes about 29½ years to go once round the zodiac, about two and a half years in each rāśi.', source: 'Jyotiṣa' },
      { text: '“Dark as blue collyrium, son of Ravi, elder brother of Yama, born of Chāyā and Mārtaṇḍa: I bow to Śanaiścara.”', source: STOTRA },
      { text: 'In the Purāṇas Śani is the son of Sūrya and Chāyā, the Sun’s shadow wife.', source: 'Purāṇas' },
      { text: 'Saturn is so light for its size that it would float in water. Its rings are hundreds of thousands of kilometres wide but typically only about ten metres thick.', source: 'Astronomy' },
    ],
  },
];

/** The weekday (0 is Sunday) of a local date key, "YYYY-MM-DD". */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

export function grahaOf(dateKey: string): Graha {
  return GRAHAS[weekdayOf(dateKey)];
}

/**
 * Which fact a day opens with: it moves on each week, so the same weekday
 * starts with a different one.
 */
export function firstFact(dateKey: string, count: number): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const days = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
  return count > 0 ? Math.floor(days / 7) % count : 0;
}

/** 0–1 through the Moon's cycle (0 new, 0.5 full): a mean synodic month, enough to draw the phase. */
export function moonPhase(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const days = (Date.UTC(y, (m || 1) - 1, d || 1, 12) - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  return (((days / 29.530588853) % 1) + 1) % 1;
}

/**
 * Where the graha is, as fractions of the screen, `minutes` after midnight: it
 * moves slowly through the day (from 6:00 to midnight), so it never sits on
 * one spot. In portrait it crosses the top right, clear of the top line and the
 * label above the digits; in landscape it climbs the right-hand side.
 */
export function grahaPosition(minutes: number, portrait: boolean): { x: number; y: number } {
  const p = Math.min(1, Math.max(0, (minutes - 360) / (18 * 60)));
  const arc = Math.sin(p * Math.PI);
  return portrait
    ? { x: 0.86 - 0.16 * p, y: 0.15 - 0.03 * arc }
    : { x: 0.9 - 0.035 * arc, y: 0.7 - 0.48 * p };
}
