// Delivers a valuation report to the client: branded email with the live
// report link + the PDF attached (owner wanted both). Called by the
// orchestrator for auto_send reports and by the review UI's approve action.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadReportByToken, type ReportRecord, CTA_BODY, DISCLAIMER } from '@/lib/reports/report'
import { renderReportPdf } from '@/lib/reports/pdf'
import { formatMoney } from '@/lib/valuation/range'

export interface SendReportResult {
  sent: boolean
  to?: string
  skipped?: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function buildHtml(report: ReportRecord, reportUrl: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const firstName = report.leads?.first_name || report.leads?.name || 'there'
  const n = report.narrative
  const low = report.value_low!
  const high = report.value_high!

  return `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">${esc(n?.email_preview ?? 'Your home value report from Proven Realty')}</div>
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;">
        <img src="${base}/proven-logo.png" alt="Proven Realty, brokered by eXp" style="height:38px;width:auto;margin-bottom:16px;" />
        <h1 style="margin:0 0 4px;font-size:22px;color:#0f2a43;font-family:Georgia,serif;">Hi ${esc(firstName)},</h1>
        <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
          We put together a home value report for
          <b style="color:#0f2a43;">${esc(report.address_formatted ?? 'your home')}</b> —
          current estimated range:
        </p>
        <div style="background:#f6f3ec;border:1px solid #e5e7eb;border-radius:12px;padding:18px;text-align:center;margin-bottom:18px;">
          <div style="font-size:11px;letter-spacing:2px;color:#5c7ba0;font-weight:700;">ESTIMATED MARKET VALUE</div>
          <div style="font-size:28px;color:#0f2a43;font-family:Georgia,serif;margin-top:4px;">
            ${formatMoney(low)} &ndash; ${formatMoney(high)}
          </div>
        </div>
        <div style="text-align:center;margin-bottom:18px;">
          <a href="${reportUrl}" style="display:inline-block;background:#0f2a43;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">
            See your full report
          </a>
          <div style="color:#9ca3af;font-size:12px;margin-top:8px;">Comparable sales, market trends, and more — also attached as a PDF.</div>
        </div>
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${esc(CTA_BODY)}</p>
        <p style="margin:14px 0 0;color:#374151;font-size:14px;">— The Proven Realty Team</p>
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:10px;line-height:1.5;margin-top:14px;">${esc(DISCLAIMER)}</p>
      <p style="text-align:center;color:#9ca3af;font-size:10px;margin-top:6px;">Proven Realty · brokered by eXp Realty · Williston, North Dakota</p>
    </div>
  </body></html>`
}

/**
 * Send one report to its lead and mark it sent (+ quarterly refresh date).
 * Never throws for per-lead problems — returns {sent:false, skipped} so a
 * batch run keeps going.
 */
export async function sendValuationEmail(token: string): Promise<SendReportResult> {
  const db = createAdminClient()
  const report = await loadReportByToken(token)
  if (!report) return { sent: false, skipped: 'report not found' }
  if (report.status === 'sent') return { sent: false, skipped: 'already sent' }
  if (report.value_best == null) return { sent: false, skipped: 'no value on report' }

  const to = report.leads?.email
  if (!to) {
    await db.from('valuation_reports')
      .update({ status: 'held', hold_reason: 'no_email' }).eq('id', report.id)
    return { sent: false, skipped: 'lead has no email' }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  const resend = new Resend(apiKey)

  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const reportUrl = `${base}/r/${report.token}`
  const from = process.env.VALUATION_FROM ?? 'Proven Realty <valuation@provenrealtynd.com>'
  const replyTo = process.env.VALUATION_REPLY_TO
  const subject =
    report.narrative?.email_subject ??
    `Your home value report — ${report.address_formatted ?? 'from Proven Realty'}`

  const pdf = await renderReportPdf(report)
  const slug = (report.address_street ?? 'home-value-report')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const { error } = await resend.emails.send({
    from,
    to: [to],
    ...(replyTo ? { replyTo } : {}),
    subject,
    html: buildHtml(report, reportUrl),
    attachments: [{ filename: `Proven-Realty-Value-Report-${slug}.pdf`, content: pdf }],
  })
  if (error) {
    // Don't leave the report invisible in 'pending' — fail it loudly so the
    // team digest / admin screen surfaces it.
    await db.from('valuation_reports')
      .update({ status: 'failed', error: 'resend: ' + error.message }).eq('id', report.id)
    return { sent: false, skipped: 'resend: ' + error.message }
  }

  const now = new Date()
  const refreshDue = new Date(now.getTime() + 90 * 86_400_000) // quarterly refresh
  await db.from('valuation_reports').update({
    status: 'sent',
    hold_reason: null,
    sent_at: now.toISOString(),
    refresh_due_at: refreshDue.toISOString(),
    error: null,
  }).eq('id', report.id)

  return { sent: true, to }
}
