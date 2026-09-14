<?php
/* The two emails a contact-form submission produces, and the transport that
   sends them.

   Transport is Resend over its HTTPS API rather than PHP's mail(). mail() on
   shared hosting sends from the server's own hostname, which fails the SPF and
   DKIM checks Outlook and Gmail run, and lands in spam. Resend signs the
   message as nicholsland.net, so it arrives like any other mail from the firm.

   Design note: both emails are built to look like the site, which is built to
   look like a plat — a ruled title block carrying the recorded facts, a pine
   rule across the top, red clay for the one accent. Tables and inline styles
   throughout because that is all Outlook reliably renders, and no web fonts
   because mail clients do not load them; Georgia is the closest thing to
   Libre Baskerville already on every machine. */

declare(strict_types=1);

require_once __DIR__ . '/compat.php';

const NLI_INK      = '#161A15';
const NLI_PINE     = '#22362A';
const NLI_CLAY     = '#9C4526';
const NLI_PAPER    = '#E3E7E0';
const NLI_SHEET    = '#F2F4EF';
const NLI_RULE     = '#C2C9BC';
const NLI_GRAPHITE = '#5A6257';

/* Single quotes inside the stacks on purpose. These strings are interpolated
   into style="..." attributes, and a double quote there closes the attribute
   early — silently dropping every declaration after the font-family and
   leaving labels unstyled. Single quotes are valid CSS and survive intact. */
const NLI_SERIF = "Georgia,'Times New Roman',Times,serif";
const NLI_MONO  = "'Courier New',Courier,monospace";

const NLI_PHONE      = '706-353-3900';
const NLI_PHONE_HREF = 'tel:+17063533900';
const NLI_SITE       = 'https://nicholsland.net';

function nli_esc(string $s): string {
  return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* Note on encoding: subjects and display names are handed to Resend as plain
   UTF-8, never RFC 2047 encoded. Resend builds the MIME message itself and
   encodes the headers on the way out; pre-encoding here would be encoded a
   second time and the recipient would read a subject line of "=?UTF-8?B?…?=".
   That only matters because these subjects carry an em dash. */

/* ---------------------------------------------------------------------------
   Transport
   --------------------------------------------------------------------------- */

function nli_resend_send(array $cfg, string $to, string $subject, string $text, string $html, string $replyTo = ''): bool {
  if (!function_exists('curl_init')) {
    error_log('resend: the curl extension is not available on this host');
    return false;
  }

  $fromName = $cfg['from_name'] ?? 'Nichols Land & Investment Co.';
  $payload = [
    'from'    => $fromName . ' <' . $cfg['mail_from'] . '>',
    'to'      => [$to],
    'subject' => $subject,
    'text'    => $text,
    'html'    => $html,
  ];
  if ($replyTo !== '') $payload['reply_to'] = $replyTo;

  $ch = curl_init('https://api.resend.com/emails');
  curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => [
      'Authorization: Bearer ' . $cfg['resend_api_key'],
      'Content-Type: application/json',
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_SSL_VERIFYPEER => true,
  ]);
  $res  = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);

  if ($res === false)            { error_log("resend curl: $err"); return false; }
  if ($code < 200 || $code >= 300) { error_log("resend http $code: $res"); return false; }
  return true;
}

/* ---------------------------------------------------------------------------
   Shared chrome
   --------------------------------------------------------------------------- */

function nli_shell(string $eyebrow, string $heading, string $inner): string {
  return '<!doctype html><html><head><meta charset="utf-8">'
    . '<meta name="viewport" content="width=device-width,initial-scale=1">'
    . '<meta name="color-scheme" content="light only">'
    . '</head><body style="margin:0;padding:0;background:' . NLI_PAPER . ';">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' . NLI_PAPER . ';padding:28px 12px;">'
    . '<tr><td align="center">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:' . NLI_SHEET . ';border:1px solid ' . NLI_RULE . ';">'

    /* the pine rule across the top, the way every sheet on the site opens */
    . '<tr><td style="height:6px;background:' . NLI_PINE . ';font-size:0;line-height:0;">&nbsp;</td></tr>'

    . '<tr><td style="padding:30px 32px 0 32px;font-family:' . NLI_SERIF . ';">'
    . '<div style="font-family:' . NLI_MONO . ';font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:' . NLI_GRAPHITE . ';">'
    . nli_esc($eyebrow) . '</div>'
    . '<h1 style="margin:12px 0 0 0;font-size:24px;line-height:1.3;color:' . NLI_INK . ';font-weight:700;">'
    . $heading . '</h1>'
    . '</td></tr>'

    . '<tr><td style="padding:20px 32px 30px 32px;font-family:' . NLI_SERIF . ';font-size:15px;line-height:1.65;color:' . NLI_INK . ';">'
    . $inner . '</td></tr>'

    /* title block footer: the recorded facts, ruled off */
    . '<tr><td style="padding:18px 32px 22px 32px;border-top:1px solid ' . NLI_RULE . ';background:#FFFFFF;'
    . 'font-family:' . NLI_SERIF . ';font-size:13px;line-height:1.65;color:' . NLI_GRAPHITE . ';">'
    . '<strong style="color:' . NLI_INK . ';">Nichols Land &amp; Investment Co.</strong><br>'
    . '2500 Daniells Bridge Rd., Building 200, Suite 1F<br>'
    . 'Athens, Georgia 30606<br>'
    . '<span style="font-family:' . NLI_MONO . ';">'
    . '<a href="' . NLI_PHONE_HREF . '" style="color:' . NLI_CLAY . ';text-decoration:none;">' . NLI_PHONE . '</a>'
    . '</span>'
    . ' &nbsp;·&nbsp; <a href="mailto:info@nicholsland.net" style="color:' . NLI_CLAY . ';text-decoration:none;">info@nicholsland.net</a>'
    . ' &nbsp;·&nbsp; <a href="' . NLI_SITE . '" style="color:' . NLI_CLAY . ';text-decoration:none;">nicholsland.net</a>'
    . '</td></tr>'

    . '</table></td></tr></table></body></html>';
}

/* One row of the title block. Mono for the label so the left column lines up
   and reads as a field name rather than as prose. */
function nli_row(string $label, string $value, string $href = ''): string {
  $shown = $href !== ''
    ? '<a href="' . nli_esc($href) . '" style="color:' . NLI_CLAY . ';text-decoration:none;">' . nli_esc($value) . '</a>'
    : nli_esc($value);
  return '<tr>'
    . '<td style="padding:8px 16px 8px 0;font-family:' . NLI_MONO . ';font-size:11px;letter-spacing:1.4px;'
    . 'text-transform:uppercase;color:' . NLI_GRAPHITE . ';white-space:nowrap;vertical-align:top;border-bottom:1px solid ' . NLI_RULE . ';">'
    . nli_esc($label) . '</td>'
    . '<td style="padding:8px 0;font-family:' . NLI_SERIF . ';font-size:15px;color:' . NLI_INK . ';border-bottom:1px solid ' . NLI_RULE . ';">'
    . $shown . '</td></tr>';
}

/* ---------------------------------------------------------------------------
   The two messages
   --------------------------------------------------------------------------- */

/** @return array{0:bool,1:bool} [notified, confirmed] */
function nli_send_inquiry_mail(array $cfg, array $d): array {
  if (empty($cfg['resend_api_key']) || empty($cfg['mail_from'])) {
    error_log('mail: resend is not configured');
    return [false, false];
  }

  $to       = $cfg['mail_to'] ?: 'gwilliams@nicholsland.net';
  $subjects = $d['subject'];
  $headline = $subjects[0] ?? 'General Inquiry';

  try {
    $when = (new DateTime('now', new DateTimeZone('America/New_York')))->format('F j, Y \a\t g:i a');
  } catch (Throwable $e) {
    $when = gmdate('c');
  }

  $interests = implode(', ', $subjects);

  /* ---- 1. the lead, to the office ---------------------------------------- */

  $rows = nli_row('Name', $d['name'])
    . nli_row('Email', $d['email'], 'mailto:' . $d['email'])
    . ($d['phone']  !== '' ? nli_row('Phone', $d['phone'], 'tel:' . preg_replace('/[^\d+]/', '', $d['phone'])) : '')
    . ($d['county'] !== '' ? nli_row('County', $d['county']) : '')
    . ($d['acres']  !== '' ? nli_row('Acreage', $d['acres']) : '')
    . nli_row('Interested in', $interests)
    . nli_row('Received', $when);

  $leadHtml = nli_shell(
    'Website inquiry',
    nli_esc($d['name']) . ' is asking about ' . nli_esc($headline),
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' . NLI_RULE . ';">'
    . $rows . '</table>'
    . '<p style="margin:24px 0 8px 0;font-family:' . NLI_MONO . ';font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:' . NLI_GRAPHITE . ';">Message</p>'
    . '<div style="margin:0;padding:16px 18px;background:#FFFFFF;border-left:3px solid ' . NLI_CLAY . ';'
    . 'white-space:pre-wrap;color:' . NLI_INK . ';">' . nli_esc($d['message']) . '</div>'
    . '<p style="margin:26px 0 0 0;font-size:13px;color:' . NLI_GRAPHITE . ';">'
    . 'Replying to this email answers ' . nli_esc($d['name']) . ' directly — it is addressed back to '
    . nli_esc($d['email']) . '. A copy has been sent to them confirming it arrived.</p>'
  );

  $leadText = $d['name'] . ' is asking about ' . $headline . "\n"
    . str_repeat('=', 60) . "\n\n"
    . 'NAME           ' . $d['name'] . "\n"
    . 'EMAIL          ' . $d['email'] . "\n"
    . 'PHONE          ' . ($d['phone']  !== '' ? $d['phone']  : 'not given') . "\n"
    . 'COUNTY         ' . ($d['county'] !== '' ? $d['county'] : 'not given') . "\n"
    . 'ACREAGE        ' . ($d['acres']  !== '' ? $d['acres']  : 'not given') . "\n"
    . 'INTERESTED IN  ' . $interests . "\n"
    . 'RECEIVED       ' . $when . "\n\n"
    . "MESSAGE\n" . $d['message'] . "\n\n"
    . str_repeat('-', 60) . "\n"
    . 'Replying to this email answers ' . $d['name'] . ' directly (' . $d['email'] . ").\n"
    . "Nichols Land & Investment Co. · 706-353-3900 · nicholsland.net\n";

  $subject = 'Website inquiry: ' . $d['name']
    . ($d['county'] !== '' ? ' — ' . $d['county'] : '')
    . ' (' . $headline . ')';

  $notified = nli_resend_send($cfg, $to, $subject, $leadText, $leadHtml, $d['email']);

  /* ---- 2. the confirmation, to the visitor -------------------------------- */

  $recapRows = nli_row('Interested in', $interests)
    . ($d['county'] !== '' ? nli_row('County', $d['county']) : '')
    . ($d['acres']  !== '' ? nli_row('Acreage', $d['acres'])  : '')
    . nli_row('Sent', $when);

  $custHtml = nli_shell(
    'Inquiry received',
    'Thank you, ' . nli_esc($d['name']) . ' — we have your inquiry',
    '<p style="margin:0 0 16px 0;">A member of our team will read it and get back to you, usually within one business day.</p>'
    . '<p style="margin:0 0 22px 0;">Nichols Land &amp; Investment Co. has worked with buyers and sellers of farms, '
    . 'timberland, recreational tracts and commercial property across Georgia since 1976. Whatever you are weighing up, '
    . 'someone here has almost certainly handled something like it before.</p>'

    . '<p style="margin:0 0 8px 0;font-family:' . NLI_MONO . ';font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:' . NLI_GRAPHITE . ';">What you sent us</p>'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' . NLI_RULE . ';">'
    . $recapRows . '</table>'
    . '<div style="margin:16px 0 0 0;padding:16px 18px;background:#FFFFFF;border-left:3px solid ' . NLI_RULE . ';'
    . 'white-space:pre-wrap;color:' . NLI_INK . ';font-size:14px;">' . nli_esc($d['message']) . '</div>'

    . '<p style="margin:26px 0 8px 0;">If it is time-sensitive, calling the Athens office is quicker than waiting on email:</p>'
    . '<p style="margin:0 0 22px 0;font-family:' . NLI_MONO . ';font-size:20px;font-weight:700;">'
    . '<a href="' . NLI_PHONE_HREF . '" style="color:' . NLI_CLAY . ';text-decoration:none;">' . NLI_PHONE . '</a></p>'

    . '<p style="margin:0 0 6px 0;">In the meantime, every tract we currently have listed is on the website, '
    . 'with acreage, maps and photographs:</p>'
    . '<p style="margin:0 0 22px 0;"><a href="' . NLI_SITE . '/properties.html" style="color:' . NLI_CLAY . ';font-weight:700;text-decoration:none;">'
    . 'Browse the current listings &rarr;</a></p>'

    . '<p style="margin:0;padding-top:16px;border-top:1px solid ' . NLI_RULE . ';font-size:12px;color:' . NLI_GRAPHITE . ';">'
    . 'You are receiving this because this address was entered on the contact form at nicholsland.net. '
    . 'It is a one-off confirmation — you have not been added to any mailing list. '
    . 'If this was not you, no further action is needed and you can ignore it.</p>'
  );

  $custText = 'Thank you, ' . $d['name'] . " — we have your inquiry.\n"
    . str_repeat('=', 60) . "\n\n"
    . "A member of our team will read it and get back to you, usually within\n"
    . "one business day.\n\n"
    . "Nichols Land & Investment Co. has worked with buyers and sellers of farms,\n"
    . "timberland, recreational tracts and commercial property across Georgia\n"
    . "since 1976.\n\n"
    . "WHAT YOU SENT US\n"
    . 'Interested in  ' . $interests . "\n"
    . ($d['county'] !== '' ? 'County         ' . $d['county'] . "\n" : '')
    . ($d['acres']  !== '' ? 'Acreage        ' . $d['acres']  . "\n" : '')
    . 'Sent           ' . $when . "\n\n"
    . $d['message'] . "\n\n"
    . str_repeat('-', 60) . "\n"
    . "If it is time-sensitive, calling the Athens office is quicker than\n"
    . "waiting on email: 706-353-3900\n\n"
    . "Current listings: " . NLI_SITE . "/properties.html\n\n"
    . "Nichols Land & Investment Co.\n"
    . "2500 Daniells Bridge Rd., Building 200, Suite 1F\n"
    . "Athens, Georgia 30606\n\n"
    . "You are receiving this because this address was entered on the contact\n"
    . "form at nicholsland.net. It is a one-off confirmation — you have not been\n"
    . "added to any mailing list.\n";

  $confirmed = nli_resend_send(
    $cfg,
    $d['email'],
    'We have your inquiry — Nichols Land & Investment Co.',
    $custText,
    $custHtml,
    $to
  );

  return [$notified, $confirmed];
}
