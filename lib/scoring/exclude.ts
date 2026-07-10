// Team-member exclusion. Some Follow Up Boss "people" are actually Proven
// Realty agents/staff (e.g. an agent's own record, test contacts). They must
// NEVER appear in a briefing, script, or digest. This is the single source of
// truth for that roster — update the list when the team changes.
//
// Roster from https://www.provenrealtynd.com/team-page (cross-referenced 2026-07-09).

export const EXCLUDED_AGENTS: string[] = [
  'Erik Peterson',
  'Cami Hinz',
  'Jeff Boscaino',
  'Laura Ward',
  'Emery Mrdenovic',
  'Kayla Ruby',
  'Wes Houle',
  'Dan Ruby',
  'Janelle Groenhout',
  'Courtney Law',
  'Amariah Hier',
  'Nicole Wall',
  'Chelsey Belgarde',
  'Deano Vass',
  'Nathanael Fossum',
  'Vaughn Anderson',
  'Kayla Peterson',
  'Ron Maurera',
  'Bobbie Mabiloq',
  'Rafael Serato',
  'Kristian Molino',
  'Nessa Gil',
  'Reizeal Ida Saligan',
  'Marlon Pimentel',
]

// Lowercase, strip accents/punctuation/titles, collapse whitespace.
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accent marks
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|realtor|broker|assistant)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// First + last token, so "Erik C. Peterson" still matches "Erik Peterson".
function firstLast(norm: string): string {
  const parts = norm.split(' ').filter(Boolean)
  return parts.length < 2 ? norm : `${parts[0]} ${parts[parts.length - 1]}`
}

const excluded = new Set<string>()
for (const n of EXCLUDED_AGENTS) {
  const norm = normalizeName(n)
  if (norm) {
    excluded.add(norm)
    excluded.add(firstLast(norm))
  }
}

// True if this lead name belongs to a team member and must be hidden.
export function isExcludedName(name: string | null | undefined): boolean {
  const norm = normalizeName(name)
  if (!norm) return false
  return excluded.has(norm) || excluded.has(firstLast(norm))
}
