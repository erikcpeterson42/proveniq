import Image from 'next/image'
import {
  prettyReportDate,
  CTA_HEADLINE,
  CTA_BODY,
  DISCLAIMER,
  type ReportRecord,
} from '@/lib/reports/report'
import { formatMoney } from '@/lib/valuation/range'

// The full client-facing report body, shared by the real /r/[token] page and
// the /r/preview sample so the team can check the template without data.

const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Solid estimate', low: 'Preliminary estimate' } as const

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</div>
      <div className="mt-0.5 font-serif text-lg text-navy-900">{value}</div>
    </div>
  )
}

export default function ReportView({ report }: { report: ReportRecord }) {
  const low = report.value_low!
  const high = report.value_high!
  const best = report.value_best!
  const n = report.narrative
  const p = report.property ?? {}
  const comps = report.comps ?? []
  const market = report.market
  const firstName = report.leads?.first_name || report.leads?.name || null
  const contactEmail = process.env.VALUATION_CONTACT_EMAIL ?? 'valuation@provenrealtynd.com'
  const contactPhone = process.env.PROVEN_PHONE
  const markerPct = high > low ? Math.round(((best - low) / (high - low)) * 100) : 50

  const facts: [string, string][] = []
  if (p.beds) facts.push(['Bedrooms', String(p.beds)])
  if (p.baths) facts.push(['Bathrooms', String(p.baths)])
  if (p.sqft) facts.push(['Square feet', p.sqft.toLocaleString()])
  if (p.yearBuilt) facts.push(['Year built', String(p.yearBuilt)])
  if (p.lotSize) facts.push(['Lot size', `${p.lotSize.toLocaleString()} sqft`])
  if (p.lastSalePrice) facts.push(['Last sold for', formatMoney(p.lastSalePrice)])

  return (
    <div className="min-h-screen bg-canvas">
      {/* Brand band */}
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Image src="/proven-logo.png" alt="Proven Realty, brokered by eXp" width={150} height={44} className="h-10 w-auto" />
          <div className="text-right text-xs text-navy-200">
            <div>Home Value Report</div>
            <div>{prettyReportDate(report.created_at)}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16">
        {/* Address hero */}
        <section className="pt-10 text-center">
          {firstName && (
            <p className="text-sm font-semibold uppercase tracking-widest text-azure-600">
              Prepared for {firstName}
            </p>
          )}
          <h1 className="mt-2 font-serif text-3xl leading-tight text-navy-900 sm:text-4xl">
            {report.address_street ?? report.address_formatted}
          </h1>
          <p className="mt-1 text-navy-400">
            {[report.address_city, report.address_state, report.address_zip].filter(Boolean).join(', ')}
          </p>
        </section>

        {/* Value card */}
        <section className="mt-8 rounded-2xl border border-navy-100 bg-white p-6 shadow-card sm:p-8">
          <div className="text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-navy-400">
              Estimated market value
            </div>
            <div className="mt-2 font-serif text-5xl text-navy-900 sm:text-6xl">{formatMoney(best)}</div>
            {report.confidence && (
              <span className="mt-3 inline-block rounded-full bg-azure-100 px-3 py-1 text-xs font-semibold text-azure-700">
                {CONFIDENCE_LABEL[report.confidence]}
              </span>
            )}
          </div>
          <div className="mx-auto mt-6 max-w-md">
            <div className="relative h-2.5 rounded-full bg-gradient-to-r from-navy-100 via-azure-300 to-azure-500">
              <div
                className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-[3px] border-white bg-navy-900 shadow"
                style={{ left: `calc(${markerPct}% - 10px)` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm font-semibold text-navy-600">
              <span>{formatMoney(low)}</span>
              <span>{formatMoney(high)}</span>
            </div>
          </div>
          {n?.value_context && (
            <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-navy-600">
              {n.value_context}
            </p>
          )}
        </section>

        {/* Intro */}
        {n?.intro && (
          <p className="mx-auto mt-8 max-w-2xl text-center text-[15px] leading-relaxed text-navy-700">
            {n.intro}
          </p>
        )}

        {/* Home facts */}
        {facts.length > 0 && (
          <section className="mt-10">
            <h2 className="font-serif text-xl text-navy-900">Your home at a glance</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {facts.map(([label, value]) => (
                <Fact key={label} label={label} value={value} />
              ))}
            </div>
          </section>
        )}

        {/* Comparable sales */}
        {comps.length > 0 && (
          <section className="mt-10">
            <h2 className="font-serif text-xl text-navy-900">Recent comparable sales</h2>
            {n?.comps_note && <p className="mt-1 text-sm text-navy-500">{n.comps_note}</p>}
            <div className="mt-3 overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
              {comps.slice(0, 6).map((c, i) => (
                <div
                  key={`${c.address}-${i}`}
                  className={`flex items-center justify-between gap-3 px-5 py-4 ${i > 0 ? 'border-t border-navy-50' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-navy-800">{c.address}</div>
                    <div className="mt-0.5 text-xs text-navy-400">
                      {[
                        c.beds && `${c.beds} bed`,
                        c.baths && `${c.baths} bath`,
                        c.sqft && `${c.sqft.toLocaleString()} sqft`,
                        c.distance_mi != null && `${c.distance_mi.toFixed(1)} mi away`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="shrink-0 font-serif text-lg text-navy-900">{formatMoney(c.price)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Market snapshot */}
        {(market?.medianPrice || n?.market_snapshot) && (
          <section className="mt-10">
            <h2 className="font-serif text-xl text-navy-900">Your local market</h2>
            {market?.medianPrice && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact label="Median sale price" value={formatMoney(market.medianPrice)} />
                {market.averageDaysOnMarket != null && (
                  <Fact label="Avg. days on market" value={String(Math.round(market.averageDaysOnMarket))} />
                )}
                {market.totalListings != null && (
                  <Fact label="Homes for sale" value={String(market.totalListings)} />
                )}
              </div>
            )}
            {n?.market_snapshot && (
              <p className="mt-4 text-[15px] leading-relaxed text-navy-600">{n.market_snapshot}</p>
            )}
          </section>
        )}

        {/* CTA */}
        <section className="mt-12 rounded-2xl bg-navy-900 p-8 text-center text-white shadow-card">
          <h2 className="font-serif text-2xl">{CTA_HEADLINE}</h2>
          <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-navy-100">{CTA_BODY}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {contactPhone && (
              <a
                href={`tel:${contactPhone.replace(/[^+\d]/g, '')}`}
                className="w-full rounded-xl bg-azure-500 px-6 py-3 text-sm font-bold text-white hover:bg-azure-600 sm:w-auto"
              >
                Call {contactPhone}
              </a>
            )}
            <a
              href={`mailto:${contactEmail}?subject=${encodeURIComponent(`In-home equity evaluation — ${report.address_formatted ?? ''}`)}`}
              className="w-full rounded-xl border border-azure-400 px-6 py-3 text-sm font-bold text-azure-300 hover:bg-navy-800 sm:w-auto"
            >
              Request my free equity evaluation
            </a>
          </div>
        </section>

        {/* PDF + footer */}
        <div className="mt-8 text-center">
          <a
            href={`/api/r/${report.token}/pdf`}
            className="text-sm font-semibold text-azure-600 underline underline-offset-4 hover:text-azure-700"
          >
            Download this report as a PDF
          </a>
        </div>
        <footer className="mt-10 border-t border-navy-100 pt-6 text-center">
          <p className="mx-auto max-w-2xl text-xs leading-relaxed text-navy-400">{DISCLAIMER}</p>
          <p className="mt-3 text-xs text-navy-300">
            Proven Realty · brokered by eXp Realty · Williston, North Dakota
          </p>
        </footer>
      </main>
    </div>
  )
}
