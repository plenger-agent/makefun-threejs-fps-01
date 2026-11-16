// Neon Breach — rounds and economy. A match is first to 5 round wins
// (at most 9 rounds). Each round: a 15-second buy phase, then a 100-second
// live round. Money is earned for wins, losses, kills and plants, and spent
// in the buy menu on weapons, grenades and armour.
import { WEAPONS, GRENADE } from './weapons.js';

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const ROUND_END_TIME = 4.5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export const BUY_ITEMS = [
  { key: '1', id: 'rifle', name: 'NB-7 PULSE RIFLE', price: WEAPONS.rifle.price, desc: 'Auto rifle · 34 dmg · 2.0x headshot' },
  { key: '2', id: 'smg', name: 'VOLT SMG', price: WEAPONS.smg.price, desc: 'Fast SMG · 22 dmg · tight close range' },
  { key: '3', id: 'grenade', name: 'FLUX GRENADE', price: GRENADE.price, desc: 'Throwable · 95 dmg blast · key G' },
  { key: '4', id: 'armor', name: 'NEON PLATING', price: 650, desc: 'Armour 50 · absorbs half of each hit' },
];

export function makeMatch() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0,
    round: 1,
    scoreNeon: 0,
    scoreVoid: 0,
    money: 800,
    roundWinner: null, // 'NEON' | 'VOID'
    roundReason: '',
    matchWinner: null,
    buyOpen: false,
    // The player's kit: owned weapon ids, selected slot, grenades, armour.
    owned: new Set(['pistol']),
    grenades: 0,
    armor: 0,
    lastEvents: [],
  };
}

export function startMatch(m) {
  m.phase = 'buy';
  m.phaseTime = BUY_TIME;
  m.round = 1;
  m.scoreNeon = 0;
  m.scoreVoid = 0;
  m.money = 800;
  m.matchWinner = null;
  m.owned = new Set(['pistol']);
  m.grenades = 0;
  m.armor = 0;
  m.buyOpen = true;
}

export function startRound(m) {
  m.phase = 'buy';
  m.phaseTime = BUY_TIME;
  m.buyOpen = true;
  m.roundWinner = null;
  m.roundReason = '';
}

// Buy an item by id. Returns true when the purchase went through.
export function buy(m, id) {
  if (m.phase !== 'buy') return false;
  const item = BUY_ITEMS.find((b) => b.id === id);
  if (!item || m.money < item.price) return false;
  if (id === 'rifle' || id === 'smg') {
    if (m.owned.has(id)) return false;
    m.owned.add(id);
  } else if (id === 'grenade') {
    if (m.grenades >= 2) return false;
    m.grenades += 1;
  } else if (id === 'armor') {
    if (m.armor >= 50) return false;
    m.armor = 50;
  }
  m.money -= item.price;
  return true;
}

export function award(m, amount, why) {
  m.money += amount;
  m.lastEvents.push(`${why} +$${amount}`);
  if (m.lastEvents.length > 6) m.lastEvents.shift();
}

// End a round: score it, pay the round money, and decide the match.
export function endRound(m, winner, reason) {
  m.phase = 'roundEnd';
  m.phaseTime = ROUND_END_TIME;
  m.roundWinner = winner;
  m.roundReason = reason;
  if (winner === 'NEON') {
    m.scoreNeon += 1;
    award(m, 3250, 'Round win');
  } else {
    m.scoreVoid += 1;
    award(m, 1900, 'Round loss');
  }
  if (m.scoreNeon >= WIN_ROUNDS) m.matchWinner = 'NEON';
  else if (m.scoreVoid >= WIN_ROUNDS) m.matchWinner = 'VOID';
  else if (m.round >= MAX_ROUNDS) {
    m.matchWinner = m.scoreNeon > m.scoreVoid ? 'NEON' : m.scoreNeon < m.scoreVoid ? 'VOID' : 'DRAW';
  }
}

// Advance the phase clock. Returns 'toLive' | 'toBuy' | 'toMatchEnd' | null.
export function tickPhase(m, dt) {
  m.phaseTime -= dt;
  if (m.phase === 'buy' && m.phaseTime <= 0) {
    m.phase = 'live';
    m.phaseTime = ROUND_TIME;
    m.buyOpen = false;
    return 'toLive';
  }
  if (m.phase === 'live' && m.phaseTime <= 0) {
    return 'timeout';
  }
  if (m.phase === 'roundEnd' && m.phaseTime <= 0) {
    if (m.matchWinner) {
      m.phase = 'matchEnd';
      return 'toMatchEnd';
    }
    m.round += 1;
    startRound(m);
    return 'toBuy';
  }
  return null;
}
