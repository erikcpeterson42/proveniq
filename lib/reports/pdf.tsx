// Server-side PDF rendering of a valuation report (@react-pdf/renderer —
// pure JS, no headless browser, Vercel-friendly). Used by the download route
// and as the email attachment. Mirrors the web report's structure & brand.

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ReportRecord } from './report'
import { prettyReportDate, CTA_HEADLINE, CTA_BODY, DISCLAIMER } from './report'
import { formatMoney } from '@/lib/valuation/range'

const NAVY = '#0f2a43'
const NAVY_MID = '#3f5f83'
const NAVY_SOFT = '#85a1c0'
const AZURE = '#29a9e0'
const LINE = '#d8e3ef'
const CANVAS = '#f6f3ec'

const s = StyleSheet.create({
  // paddingBottom lives on the PAGE (not an inner View) so every page break
  // clears the fixed footer; padding on a child View only pads the last page.
  page: {
    backgroundColor: '#ffffff', fontFamily: 'Helvetica', fontSize: 10, color: NAVY,
    paddingBottom: 100,
  },
  band: {
    backgroundColor: NAVY, paddingHorizontal: 36, paddingVertical: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  bandRight: { color: '#d8e3ef', fontSize: 9, textAlign: 'right' },
  body: { paddingHorizontal: 36, paddingTop: 24 },
  preparedFor: { color: AZURE, fontSize: 9, letterSpacing: 2, textAlign: 'center' },
  address: { fontFamily: 'Times-Roman', fontSize: 24, textAlign: 'center', marginTop: 6 },
  cityLine: { color: NAVY_MID, textAlign: 'center', marginTop: 3, fontSize: 11 },
  valueCard: {
    marginTop: 20, borderWidth: 1, borderColor: LINE, borderRadius: 10,
    backgroundColor: CANVAS, padding: 20, alignItems: 'center',
  },
  valueLabel: { fontSize: 8, letterSpacing: 2, color: NAVY_MID },
  valueBig: { fontFamily: 'Times-Roman', fontSize: 34, marginTop: 6 },
  rangeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    width: 260, marginTop: 10,
  },
  rangeVal: { fontSize: 11, color: NAVY_MID },
  bar: { width: 260, height: 6, borderRadius: 3, backgroundColor: LINE, marginTop: 8 },
  barFill: { height: 6, borderRadius: 3, backgroundColor: AZURE },
  para: { marginTop: 10, lineHeight: 1.5, color: NAVY_MID, fontSize: 10 },
  h2: { fontFamily: 'Times-Roman', fontSize: 15, marginTop: 22, marginBottom: 6 },
  factsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    borderWidth: 1, borderColor: LINE, borderRadius: 6,
    paddingVertical: 6, paddingHorizontal: 10, minWidth: 110,
  },
  factLabel: { fontSize: 7, letterSpacing: 1, color: NAVY_SOFT },
  factValue: { fontFamily: 'Times-Roman', fontSize: 13, marginTop: 2 },
  compRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: LINE, paddingVertical: 7,
  },
  compAddr: { fontSize: 10, maxWidth: 340 },
  compMeta: { fontSize: 8, color: NAVY_SOFT, marginTop: 2 },
  compPrice: { fontFamily: 'Times-Roman', fontSize: 12 },
  cta: {
    marginTop: 24, backgroundColor: NAVY, borderRadius: 10,
    padding: 18, alignItems: 'center',
  },
  ctaH: { fontFamily: 'Times-Roman', fontSize: 15, color: '#ffffff' },
  ctaP: { color: '#d8e3ef', marginTop: 6, textAlign: 'center', lineHeight: 1.5, fontSize: 9.5 },
  ctaContact: { color: AZURE, marginTop: 10, fontSize: 11 },
  footer: {
    position: 'absolute', bottom: 22, left: 36, right: 36,
    borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8,
  },
  disclaimer: { fontSize: 6.5, color: NAVY_SOFT, lineHeight: 1.4 },
})

function Facts({ report }: { report: ReportRecord }) {
  const p = report.property ?? {}
  const items: [string, string][] = []
  if (p.beds) items.push(['BEDROOMS', String(p.beds)])
  if (p.baths) items.push(['BATHROOMS', String(p.baths)])
  if (p.sqft) items.push(['SQUARE FEET', p.sqft.toLocaleString()])
  if (p.yearBuilt) items.push(['YEAR BUILT', String(p.yearBuilt)])
  if (p.lastSalePrice) items.push(['LAST SOLD FOR', formatMoney(p.lastSalePrice)])
  if (!items.length) return null
  return (
    <>
      <Text style={s.h2}>Your home at a glance</Text>
      <View style={s.factsRow}>
        {items.map(([label, value]) => (
          <View key={label} style={s.fact}>
            <Text style={s.factLabel}>{label}</Text>
            <Text style={s.factValue}>{value}</Text>
          </View>
        ))}
      </View>
    </>
  )
}

function ReportPdf({ report, logoUrl }: { report: ReportRecord; logoUrl?: string }) {
  const n = report.narrative
  const low = report.value_low ?? 0
  const high = report.value_high ?? 0
  const best = report.value_best ?? 0
  const pct = high > low ? Math.min(100, Math.max(0, ((best - low) / (high - low)) * 100)) : 50
  const firstName = report.leads?.first_name || report.leads?.name
  const comps = (report.comps ?? []).slice(0, 6)
  const market = report.market
  const contactEmail = process.env.VALUATION_CONTACT_EMAIL ?? 'valuation@provenrealtynd.com'
  const contactPhone = process.env.PROVEN_PHONE

  return (
    <Document title={`Home Value Report — ${report.address_formatted ?? ''}`} author="Proven Realty">
      <Page size="LETTER" style={s.page}>
        <View style={s.band}>
          {logoUrl ? (
            /* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */
            <Image src={logoUrl} style={{ height: 30, width: 102 }} />
          ) : (
            <Text style={{ color: '#fff', fontFamily: 'Times-Roman', fontSize: 16 }}>Proven Realty</Text>
          )}
          <View style={s.bandRight}>
            <Text>Home Value Report</Text>
            <Text>{prettyReportDate(report.created_at)}</Text>
          </View>
        </View>

        <View style={s.body}>
          {firstName ? <Text style={s.preparedFor}>PREPARED FOR {firstName.toUpperCase()}</Text> : null}
          <Text style={s.address}>{report.address_street ?? report.address_formatted}</Text>
          <Text style={s.cityLine}>
            {[report.address_city, report.address_state, report.address_zip].filter(Boolean).join(', ')}
          </Text>

          <View style={s.valueCard}>
            <Text style={s.valueLabel}>ESTIMATED MARKET VALUE</Text>
            <Text style={s.valueBig}>{formatMoney(best)}</Text>
            <View style={s.bar}>
              <View style={[s.barFill, { width: `${pct}%` }]} />
            </View>
            <View style={s.rangeRow}>
              <Text style={s.rangeVal}>{formatMoney(low)}</Text>
              <Text style={s.rangeVal}>{formatMoney(high)}</Text>
            </View>
          </View>

          {n?.intro ? <Text style={s.para}>{n.intro}</Text> : null}
          {n?.value_context ? <Text style={s.para}>{n.value_context}</Text> : null}

          <Facts report={report} />

          {comps.length > 0 ? (
            <>
              <Text style={s.h2}>Recent comparable sales</Text>
              {n?.comps_note ? <Text style={{ ...s.para, marginTop: 0, marginBottom: 6 }}>{n.comps_note}</Text> : null}
              {comps.map((c, i) => (
                <View key={i} style={s.compRow}>
                  <View>
                    <Text style={s.compAddr}>{c.address}</Text>
                    <Text style={s.compMeta}>
                      {[
                        c.beds && `${c.beds} bed`,
                        c.baths && `${c.baths} bath`,
                        c.sqft && `${c.sqft.toLocaleString()} sqft`,
                        c.distance_mi != null && `${c.distance_mi.toFixed(1)} mi away`,
                      ].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                  <Text style={s.compPrice}>{formatMoney(c.price)}</Text>
                </View>
              ))}
            </>
          ) : null}

          {market?.medianPrice || n?.market_snapshot ? (
            <>
              <Text style={s.h2}>Your local market</Text>
              {market?.medianPrice ? (
                <View style={s.factsRow}>
                  <View style={s.fact}>
                    <Text style={s.factLabel}>MEDIAN SALE PRICE</Text>
                    <Text style={s.factValue}>{formatMoney(market.medianPrice)}</Text>
                  </View>
                  {market.averageDaysOnMarket != null ? (
                    <View style={s.fact}>
                      <Text style={s.factLabel}>AVG. DAYS ON MARKET</Text>
                      <Text style={s.factValue}>{String(Math.round(market.averageDaysOnMarket))}</Text>
                    </View>
                  ) : null}
                  {market.totalListings != null ? (
                    <View style={s.fact}>
                      <Text style={s.factLabel}>HOMES FOR SALE</Text>
                      <Text style={s.factValue}>{String(market.totalListings)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {n?.market_snapshot ? <Text style={s.para}>{n.market_snapshot}</Text> : null}
            </>
          ) : null}

          <View style={s.cta} wrap={false}>
            <Text style={s.ctaH}>{CTA_HEADLINE}</Text>
            <Text style={s.ctaP}>{CTA_BODY}</Text>
            <Text style={s.ctaContact}>
              {[contactPhone, contactEmail].filter(Boolean).join('   ·   ')}
            </Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.disclaimer}>{DISCLAIMER}</Text>
          <Text style={{ ...s.disclaimer, marginTop: 3 }}>
            Proven Realty · brokered by eXp Realty · Williston, North Dakota
          </Text>
        </View>
      </Page>
    </Document>
  )
}

/** Render the report to a PDF buffer (download route + email attachment). */
export async function renderReportPdf(report: ReportRecord): Promise<Buffer> {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return renderToBuffer(<ReportPdf report={report} logoUrl={`${base}/proven-logo.png`} />)
}
