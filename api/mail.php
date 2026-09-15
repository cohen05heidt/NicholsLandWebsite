<?php
/* The two emails a contact-form submission produces, and the transport that
   sends them.

   Transport is Resend over its HTTPS API rather than PHP's mail(). mail() on
   shared hosting sends from the server's own hostname, which fails the SPF and
   DKIM checks Outlook and Gmail run, and lands in spam. Resend signs the
   message as nicholsland.net, so it arrives like any other mail from the firm.

   ---------------------------------------------------------------------------
   Why these look plain, and deliberately so
   ---------------------------------------------------------------------------
   The first version of this file was built to look like the website: a pine
   rule across the top, a ruled title block, red clay accents, a "Browse the
   current listings" call to action. It was handsome, and Gmail filed the
   confirmation under Promotions.

   That is what Gmail's tab classifier is for. A wide coloured header bar, a
   table used for layout, a styled call-to-action link and the words "mailing
   list" are the signature of bulk marketing mail, and it reads them as such
   regardless of what the message actually says. A land broker answering an
   inquiry is not marketing, so the email should not look like it.

   So: no colour blocks, no layout tables, no images, no call to action, no
   mention of lists. A system font, ordinary paragraphs, a signature. It now
   looks like what it is - a short note from an office - which is both the
   honest presentation and the one most likely to reach the inbox.

   The plain-text part is kept close to the HTML on purpose too. A large
   divergence between the two is itself a bulk-mail signal.

   Worth knowing: no sender can *guarantee* Primary. Gmail also weights the
   sending domain's history, and nicholsland.net only started sending today.
   Placement typically improves as real recipients reply and mark as read.
   --------------------------------------------------------------------------- */

declare(strict_types=1);

require_once __DIR__ . '/compat.php';

/* One neutral stack, close to what a person's mail client would use anyway. */
const NLI_FONT  = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
const NLI_INK   = '#1a1a1a';
const NLI_QUIET = '#666666';
const NLI_RULE  = '#dddddd';

const NLI_PHONE      = '706-353-3900';
const NLI_PHONE_HREF = 'tel:+17063533900';

function nli_esc(string $s): string {
  return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* Subjects and display names go to Resend as plain UTF-8, never RFC 2047
   encoded. Resend builds the MIME message and encodes the headers itself;
   pre-encoding would be encoded twice and the recipient would read a subject
   line of "=?UTF-8?B?...?=". */

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

  if ($res === false)              { error_log("resend curl: $err"); return false; }
  if ($code < 200 || $code >= 300) { error_log("resend http $code: $res"); return false; }
  return true;
}

/* ---------------------------------------------------------------------------
   Shared chrome - deliberately almost none
   --------------------------------------------------------------------------- */

function nli_wrap(string $inner): string {
  return '<!doctype html><html><head><meta charset="utf-8">'
    . '<meta name="viewport" content="width=device-width,initial-scale=1">'
    . '</head>'
    . '<body style="margin:0;padding:0;background:#ffffff;">'
    . '<div style="max-width:600px;margin:0;padding:16px;font-family:' . NLI_FONT . ';'
    . 'font-size:15px;line-height:1.55;color:' . NLI_INK . ';">'
    . $inner
    . '</div></body></html>';
}

/* Signature as a person would write one, not a branded footer. */
function nli_signature(): string {
  return '<p style="margin:22px 0 0 0;padding-top:14px;border-top:1px solid ' . NLI_RULE . ';'
    . 'font-size:13px;color:' . NLI_QUIET . ';">'
    . 'Nichols Land &amp; Investment Co.<br>'
    . '2500 Daniells Bridge Rd., Building 200, Suite 1F, Athens, GA 30606<br>'
    . '<a href="' . NLI_PHONE_HREF . '" style="color:' . NLI_QUIET . ';">' . NLI_PHONE . '</a>'
    . ' &nbsp;|&nbsp; info@nicholsland.net'
    . '</p>';
}

/* A labelled line. Plain text, no table, no uppercase mono labels. */
function nli_line(string $label, string $value): string {
  return '<p style="margin:0 0 4px 0;"><span style="color:' . NLI_QUIET . ';">'
    . nli_esc($label) . ':</span> ' . nli_esc($value) . '</p>';
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
  $interests = implode(', ', $subjects);

  try {
    $when = (new DateTime('now', new DateTimeZone('America/New_York')))->format('F j, Y \a\t g:i a');
  } catch (Throwable $e) {
    $when = gmdate('c');
  }

  /* ---- 1. the lead, to the office ---------------------------------------- */

  $leadHtml = nli_wrap(
    '<p style="margin:0 0 14px 0;">' . nli_esc($d['name']) . ' sent an inquiry through the website.</p>'
    . nli_line('Name', $d['name'])
    . '<p style="margin:0 0 4px 0;"><span style="color:' . NLI_QUIET . ';">Email:</span> '
    . '<a href="mailto:' . nli_esc($d['email']) . '">' . nli_esc($d['email']) . '</a></p>'
    . ($d['phone']  !== '' ? nli_line('Phone', $d['phone']) : '')
    . ($d['county'] !== '' ? nli_line('County', $d['county']) : '')
    . ($d['acres']  !== '' ? nli_line('Acreage', $d['acres']) : '')
    . nli_line('Interested in', $interests)
    . nli_line('Received', $when)
    . '<p style="margin:16px 0 6px 0;color:' . NLI_QUIET . ';">Message:</p>'
    . '<p style="margin:0;white-space:pre-wrap;">' . nli_esc($d['message']) . '</p>'
    . '<p style="margin:20px 0 0 0;font-size:13px;color:' . NLI_QUIET . ';">'
    . 'Reply to this email to answer ' . nli_esc($d['name']) . ' directly. '
    . 'They have been sent a short confirmation that it arrived.</p>'
    . nli_signature()
  );

  $leadText = $d['name'] . " sent an inquiry through the website.\n\n"
    . 'Name: ' . $d['name'] . "\n"
    . 'Email: ' . $d['email'] . "\n"
    . ($d['phone']  !== '' ? 'Phone: ' . $d['phone'] . "\n" : '')
    . ($d['county'] !== '' ? 'County: ' . $d['county'] . "\n" : '')
    . ($d['acres']  !== '' ? 'Acreage: ' . $d['acres'] . "\n" : '')
    . 'Interested in: ' . $interests . "\n"
    . 'Received: ' . $when . "\n\n"
    . "Message:\n" . $d['message'] . "\n\n"
    . 'Reply to this email to answer ' . $d['name'] . " directly.\n\n"
    . "Nichols Land & Investment Co.\n"
    . "2500 Daniells Bridge Rd., Building 200, Suite 1F, Athens, GA 30606\n"
    . NLI_PHONE . " | info@nicholsland.net\n";

  $subject = 'Website inquiry: ' . $d['name']
    . ($d['county'] !== '' ? ' - ' . $d['county'] : '')
    . ' (' . $headline . ')';

  $notified = nli_resend_send($cfg, $to, $subject, $leadText, $leadHtml, $d['email']);

  /* ---- 2. the confirmation, to the visitor --------------------------------

     Short, and written as a person would write it. No call to action, no
     branding bar, nothing that reads as a campaign. */

  $first = trim(explode(' ', trim($d['name']))[0]);

  $custHtml = nli_wrap(
    '<p style="margin:0 0 14px 0;">Hello ' . nli_esc($first) . ',</p>'
    . '<p style="margin:0 0 14px 0;">Thank you for getting in touch. We have your inquiry '
    . 'and someone from our office will get back to you, usually within one business day.</p>'
    . '<p style="margin:0 0 6px 0;color:' . NLI_QUIET . ';">For your records, this is what you sent:</p>'
    . nli_line('Interested in', $interests)
    . ($d['county'] !== '' ? nli_line('County', $d['county']) : '')
    . ($d['acres']  !== '' ? nli_line('Acreage', $d['acres'])  : '')
    . nli_line('Sent', $when)
    . '<p style="margin:10px 0 0 0;white-space:pre-wrap;">' . nli_esc($d['message']) . '</p>'
    . '<p style="margin:18px 0 0 0;">If it is time-sensitive, calling the office at '
    . '<a href="' . NLI_PHONE_HREF . '" style="color:' . NLI_INK . ';">' . NLI_PHONE . '</a>'
    . ' is quicker than waiting on email.</p>'
    . '<p style="margin:14px 0 0 0;">Regards,<br>Nichols Land &amp; Investment Co.</p>'
    . nli_signature()
  );

  $custText = 'Hello ' . $first . ",\n\n"
    . "Thank you for getting in touch. We have your inquiry and someone from our\n"
    . "office will get back to you, usually within one business day.\n\n"
    . "For your records, this is what you sent:\n\n"
    . 'Interested in: ' . $interests . "\n"
    . ($d['county'] !== '' ? 'County: ' . $d['county'] . "\n" : '')
    . ($d['acres']  !== '' ? 'Acreage: ' . $d['acres']  . "\n" : '')
    . 'Sent: ' . $when . "\n\n"
    . $d['message'] . "\n\n"
    . 'If it is time-sensitive, calling the office at ' . NLI_PHONE . " is quicker\n"
    . "than waiting on email.\n\n"
    . "Regards,\n"
    . "Nichols Land & Investment Co.\n"
    . "2500 Daniells Bridge Rd., Building 200, Suite 1F, Athens, GA 30606\n"
    . NLI_PHONE . " | info@nicholsland.net\n";

  $confirmed = nli_resend_send(
    $cfg,
    $d['email'],
    'We received your inquiry',
    $custText,
    $custHtml,
    $to
  );

  return [$notified, $confirmed];
}
