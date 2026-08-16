import type { NotificationType } from '../types.js';
import type { RenderedEmailTemplate } from './types.js';

function renderBaseHtmlLayout(title: string, contentHtml: string, appName = 'Gami'): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 20px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; padding: 32px; font-family: monospace; }
    .header { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #71717a; margin-bottom: 24px; font-weight: bold; border-b: 1px solid #27272a; padding-bottom: 12px; }
    .header span { color: #10b981; }
    .title { font-size: 20px; font-weight: bold; color: #ffffff; margin-bottom: 16px; text-transform: uppercase; }
    .body-content { font-size: 14px; line-height: 1.6; color: #d4d4d8; margin-bottom: 32px; }
    .badge { display: inline-block; background-color: #064e3b; border: 1px solid #059669; color: #34d399; padding: 6px 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 16px; }
    .footer { border-t: 1px solid #27272a; padding-top: 16px; font-size: 10px; color: #71717a; text-transform: uppercase; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">⚡ <span>${appName}</span> GAMIFICATION ENGINE</div>
    ${contentHtml}
    <div class="footer">
      Sent by ${appName} Community Engine • Manage notification preferences in dashboard settings.
    </div>
  </div>
</body>
</html>`;
}

export function renderEmailTemplate(
  type: NotificationType,
  data: Record<string, unknown>,
  appName = 'Gami'
): RenderedEmailTemplate {
  switch (type) {
    case 'xp_awarded': {
      const amount = Number(data['amount']) || 0;
      const reason = (data['reason'] as string) || 'Activity reward';
      const subject = `You earned ${amount} XP!`;
      const htmlBody = renderBaseHtmlLayout(
        subject,
        `<div class="badge">+${amount} XP AWARDED</div>
         <div class="title">${subject}</div>
         <div class="body-content">
           Great job! You just earned <strong>${amount} XP</strong> for: <em>${reason}</em>.
         </div>`,
        appName
      );
      const textBody = `[${appName}] ${subject}\n\nYou just earned ${amount} XP for: ${reason}.\n\nSent by ${appName} Gamification Engine.`;
      return { subject, htmlBody, textBody };
    }

    case 'achievement_unlocked': {
      const name = (data['achievementName'] as string) || (data['name'] as string) || 'New Achievement';
      const description = (data['description'] as string) || '';
      const subject = `You unlocked ${name}!`;
      const htmlBody = renderBaseHtmlLayout(
        subject,
        `<div class="badge">🏆 ACHIEVEMENT UNLOCKED</div>
         <div class="title">${name}</div>
         <div class="body-content">
           Congratulations! You just unlocked the <strong>${name}</strong> achievement.
           ${description ? `<p style="color: #a1a1aa; font-style: italic;">"${description}"</p>` : ''}
         </div>`,
        appName
      );
      const textBody = `[${appName}] ${subject}\n\nCongratulations! You just unlocked the ${name} achievement.${description ? `\n${description}` : ''}\n\nSent by ${appName} Gamification Engine.`;
      return { subject, htmlBody, textBody };
    }

    case 'level_up': {
      const newLevel = Number(data['newLevel']) || Number(data['level']) || 1;
      const levelName = (data['levelName'] as string) || `Level ${newLevel}`;
      const subject = `You reached Level ${newLevel}!`;
      const htmlBody = renderBaseHtmlLayout(
        subject,
        `<div class="badge">🚀 LEVEL UP</div>
         <div class="title">REACHED LEVEL ${newLevel}</div>
         <div class="body-content">
           Awesome progression! You crossed the XP threshold and leveled up to <strong>${levelName}</strong>.
         </div>`,
        appName
      );
      const textBody = `[${appName}] ${subject}\n\nAwesome progression! You crossed the XP threshold and leveled up to ${levelName}.\n\nSent by ${appName} Gamification Engine.`;
      return { subject, htmlBody, textBody };
    }

    case 'challenge_completed': {
      const challengeName = (data['challengeName'] as string) || (data['name'] as string) || 'Challenge';
      const subject = `Challenge completed!`;
      const htmlBody = renderBaseHtmlLayout(
        subject,
        `<div class="badge">🎯 CHALLENGE COMPLETED</div>
         <div class="title">${challengeName}</div>
         <div class="body-content">
           Success! You completed the <strong>${challengeName}</strong> challenge and unlocked your completion rewards.
         </div>`,
        appName
      );
      const textBody = `[${appName}] ${subject}\n\nSuccess! You completed the ${challengeName} challenge and unlocked your completion rewards.\n\nSent by ${appName} Gamification Engine.`;
      return { subject, htmlBody, textBody };
    }
  }
}

export function renderInvitationEmailTemplate(params: {
  organizationName: string;
  inviterName: string;
  role: string;
  expiresAt: Date;
  acceptUrl: string;
  appName?: string;
}): RenderedEmailTemplate {
  const { organizationName, inviterName, role, expiresAt, acceptUrl, appName = 'Gami' } = params;
  const subject = `You've been invited to join ${organizationName} on ${appName}`;
  const roleDisplay = role.toUpperCase();
  const expiresFormatted = expiresAt.toLocaleDateString();

  const htmlBody = renderBaseHtmlLayout(
    subject,
    `<div class="badge">✉️ TEAM INVITATION</div>
     <div class="title">JOIN ${organizationName.toUpperCase()}</div>
     <div class="body-content">
       <p><strong>${inviterName}</strong> invited you to join <strong>${organizationName}</strong> as a <strong>${roleDisplay}</strong> on ${appName}.</p>
       <p>This invitation will expire on <strong>${expiresFormatted}</strong>.</p>
       <div style="margin-top: 24px;">
         <a href="${acceptUrl}" style="background-color: #10b981; color: #ffffff; padding: 10px 20px; text-decoration: none; font-weight: bold; font-family: monospace; display: inline-block;">ACCEPT INVITATION</a>
       </div>
     </div>`,
    appName
  );

  const textBody = `[${appName}] ${subject}\n\n${inviterName} invited you to join ${organizationName} as a ${roleDisplay}.\nAccept Invitation Link: ${acceptUrl}\nExpires on: ${expiresFormatted}\n\nSent by ${appName} Gamification Engine.`;

  return { subject, htmlBody, textBody };
}

