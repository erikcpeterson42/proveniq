// Builds a Zillow deep link for the TEAM digest so an agent can eyeball the
// Zestimate in one click. We link — we never scrape (Zillow ToS).

export function zillowUrl(address: string): string {
  // Zillow's address URLs use dashes for spaces: /homes/12-Main-St,-Williston,-ND-58801_rb/
  const slug = address.trim().replace(/\s+/g, '-')
  return `https://www.zillow.com/homes/${encodeURIComponent(slug)}_rb/`
}
