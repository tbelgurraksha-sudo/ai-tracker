import nodemailer from 'nodemailer';
import {
  computeRangeMetrics,
  computeStreaks,
  formatDuration,
  getDayName,
  getWeekBoundsMondayToSunday,
} from '../src/lib/discipline.ts';
import type {
  BootstrapPayload,
  DailyRecord,
  WeeklyEmailLog,
} from '../src/types/discipline.ts';
import { recordWeeklyEmailLog } from './db.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildWeeklyDigestEmail(
  payload: BootstrapPayload,
  referenceDateStr: string
): {
  weekStart: string;
  weekEnd: string;
  subject: string;
  html: string;
  text: string;
  summary: WeeklyEmailLog['summary'];
} {
  const { start, end, dates } = getWeekBoundsMondayToSunday(referenceDateStr);
  const recordsMap = new Map<string, DailyRecord>();
  for (const r of payload.dailyRecords) {
    recordsMap.set(r.recordDate, r);
  }

  const metrics = computeRangeMetrics(dates, recordsMap);
  const streaks = computeStreaks(payload.dailyRecords, referenceDateStr);
  const pendingTasks = payload.recoveryTasks.filter((t) => t.status === 'PENDING');
  const pendingRecoveryMinutes = pendingTasks.reduce(
    (sum, t) => sum + t.recoveryMinutes,
    0
  );

  const summary: WeeklyEmailLog['summary'] = {
    totalMinutes: metrics.totalMinutes,
    passedDays: metrics.passedDays,
    failedDays: metrics.failedDays,
    recordedDays: metrics.recordedDays,
    successRate: metrics.successRatePercent,
    pendingRecoveryCount: pendingTasks.length,
    pendingRecoveryMinutes,
    currentStreak: streaks.currentStreak,
  };

  const subject = `DISCIPLINE 90 Weekly Report (${start} to ${end}) — ${formatDuration(metrics.totalMinutes)} logged`;
  const userName = payload.user.fullName || payload.user.email;

  const dayRowsHtml = dates
    .map((d) => {
      const rec = recordsMap.get(d);
      const status = rec ? rec.status : 'NOT RECORDED';
      const hrs = rec ? formatDuration(rec.totalMinutes) : '0h 00m';
      const color =
        status === 'PASS' ? '#16A34A' : status === 'FAIL' ? '#DC2626' : '#64748B';
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1f2937;color:#e2e8f0;font-family:monospace;">${escapeHtml(d)} (${escapeHtml(getDayName(d))})</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1f2937;color:#f8fafc;font-family:monospace;text-align:right;">${escapeHtml(hrs)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1f2937;color:${color};font-weight:700;text-align:right;">${status}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0b0f17;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:620px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;">
      <div style="font-size:12px;letter-spacing:0.08em;color:#10b981;font-weight:700;">DISCIPLINE 90</div>
      <h1 style="margin:8px 0 4px;font-size:22px;color:#ffffff;">Weekly Accountability Digest</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">${escapeHtml(userName)} · Week of ${escapeHtml(start)} to ${escapeHtml(end)}</p>

      <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;border-collapse:collapse;">
        <tr>
          <td style="padding:12px;background:#0b0f17;border:1px solid #1f2937;border-radius:8px;width:25%;">
            <div style="font-size:11px;color:#94a3b8;">Total Hours</div>
            <div style="font-size:18px;font-weight:700;color:#ffffff;margin-top:4px;">${escapeHtml(formatDuration(metrics.totalMinutes))}</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:12px;background:#0b0f17;border:1px solid #1f2937;border-radius:8px;width:25%;">
            <div style="font-size:11px;color:#94a3b8;">Success Rate</div>
            <div style="font-size:18px;font-weight:700;color:#10b981;margin-top:4px;">${metrics.successRatePercent}%</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:12px;background:#0b0f17;border:1px solid #1f2937;border-radius:8px;width:25%;">
            <div style="font-size:11px;color:#94a3b8;">Current Streak</div>
            <div style="font-size:18px;font-weight:700;color:#ffffff;margin-top:4px;">${streaks.currentStreak}d</div>
          </td>
          <td style="width:8px;"></td>
          <td style="padding:12px;background:#0b0f17;border:1px solid #1f2937;border-radius:8px;width:25%;">
            <div style="font-size:11px;color:#94a3b8;">Pending Recovery</div>
            <div style="font-size:18px;font-weight:700;color:${pendingTasks.length > 0 ? '#f59e0b' : '#10b981'};margin-top:4px;">${pendingTasks.length} (${pendingRecoveryMinutes}m)</div>
          </td>
        </tr>
      </table>

      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="padding:8px 12px;border-bottom:1px solid #334155;text-align:left;color:#94a3b8;">Date</th>
            <th style="padding:8px 12px;border-bottom:1px solid #334155;text-align:right;color:#94a3b8;">Productive Time</th>
            <th style="padding:8px 12px;border-bottom:1px solid #334155;text-align:right;color:#94a3b8;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${dayRowsHtml}
        </tbody>
      </table>

      <p style="margin:20px 0 0;font-size:12px;color:#64748b;">
        Daily target: ${escapeHtml(formatDuration(payload.user.dailyTargetMinutes))} · Recovery session length: ${payload.user.recoverySessionMinutes}m
      </p>
    </div>
  </body>
</html>`.trim();

  const textLines = [
    `DISCIPLINE 90 — Weekly Report (${start} to ${end})`,
    `User: ${userName}`,
    `Total Productive Time: ${formatDuration(metrics.totalMinutes)}`,
    `Passed Days: ${metrics.passedDays} / ${metrics.recordedDays} (${metrics.successRatePercent}%)`,
    `Current Streak: ${streaks.currentStreak} days`,
    `Pending Weekend Recovery: ${pendingTasks.length} sessions (${pendingRecoveryMinutes} min)`,
    '',
    ...dates.map((d) => {
      const rec = recordsMap.get(d);
      const st = rec ? rec.status : 'NOT RECORDED';
      const hrs = rec ? formatDuration(rec.totalMinutes) : '0h 00m';
      return `${d} (${getDayName(d)}): ${hrs} — ${st}`;
    }),
  ];

  return {
    weekStart: start,
    weekEnd: end,
    subject,
    html,
    text: textLines.join('\n'),
    summary,
  };
}

export async function dispatchWeeklyEmailReport(
  payload: BootstrapPayload,
  accessToken: string,
  referenceDateStr: string
): Promise<WeeklyEmailLog> {
  const digest = buildWeeklyDigestEmail(payload, referenceDateStr);
  const recipientEmail = payload.user.email;

  let deliveryStatus = 'GENERATED_PREVIEW';

  const resendKey = (process.env.RESEND_API_KEY ?? '').trim();
  const smtpHost = (process.env.SMTP_HOST ?? '').trim();
  const smtpUser = (process.env.SMTP_USER ?? '').trim();
  const smtpPass = (process.env.SMTP_PASS ?? '').trim();
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpFrom =
    (process.env.SMTP_FROM ?? '').trim() || smtpUser || 'reports@discipline90.app';

  if (resendKey) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: smtpFrom,
        to: [recipientEmail],
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      }),
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(`Email delivery failed: ${msg}`);
    }
    deliveryStatus = 'SENT_RESEND';
  } else if (smtpHost && smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    await transporter.sendMail({
      from: smtpFrom,
      to: recipientEmail,
      subject: digest.subject,
      text: digest.text,
      html: digest.html,
    });
    deliveryStatus = 'SENT_SMTP';
  }

  return recordWeeklyEmailLog(payload.user, accessToken, {
    weekStart: digest.weekStart,
    weekEnd: digest.weekEnd,
    recipientEmail,
    subject: digest.subject,
    deliveryStatus,
    summary: digest.summary,
    htmlPreview: digest.html,
  });
}
