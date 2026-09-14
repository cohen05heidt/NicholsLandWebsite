<?php
/* Contact form endpoint.

   Saves the inquiry to MySQL first, then emails. Saving comes first on
   purpose: if Resend is unreachable the inquiry is still on record and the
   visitor still sees a confirmation, rather than being told to go and find
   their email program for something the office could have recovered.

   The response is JSON in every case, including failures. app.js reads the
   body before deciding what to show, so a 400 can carry wording worth putting
   in front of the visitor where a bare "it failed" would leave them guessing.

   Secrets live in config.php beside this file, which is not in the repository
   and is denied by .htaccess. */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/compat.php';

function fail(string $code, int $status = 400): never {
  http_response_code($status);
  echo json_encode(['ok' => false, 'error' => $code]);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('method', 405);

$cfgPath = __DIR__ . '/config.php';
if (!is_file($cfgPath)) {
  error_log('contact.php: config.php missing');
  fail('not_configured', 500);
}
$cfg = require $cfgPath;

/* The form posts multipart FormData, which is one of the three content types a
   browser sends without a preflight OPTIONS request. JSON is accepted too so
   the endpoint can be exercised with curl. */
$in = $_POST;
if (!$in) {
  $raw = file_get_contents('php://input');
  if ($raw === false || strlen($raw) > 20000) fail('body');
  $in = json_decode($raw, true);
  if (!is_array($in)) fail('json');
}

/* ---------- the two bot traps ---------------------------------------------

   "website" is a honeypot: hidden from sight and from screen readers, so
   anything that arrives with it filled in was a script. Answer 200 rather than
   an error — a bot told it failed will simply try again, where one told it
   succeeded goes away.

   "t" is the moment the page stamped the form as ready to fill in. Three
   seconds is faster than any person can read these fields, and slower than
   almost every scripted submission. A missing or unparseable stamp is let
   through: an old cached page is not evidence of a bot. */

if (trim((string)($in['website'] ?? '')) !== '') {
  echo json_encode(['ok' => true]);
  exit;
}

$stamp = (int)($in['t'] ?? 0);
if ($stamp > 0) {
  $elapsed = (int)round(microtime(true) * 1000) - $stamp;
  if ($elapsed >= 0 && $elapsed < 3000) fail('too_fast', 422);
}

/* ---------- validate ------------------------------------------------------ */

$clean = static fn($v, int $max) => nli_substr(trim((string)($v ?? '')), 0, $max);

$name    = $clean($in['name']    ?? '', 120);
$email   = $clean($in['email']   ?? '', 160);
$phone   = $clean($in['phone']   ?? '', 40);
$county  = $clean($in['county']  ?? '', 120);
$acres   = $clean($in['acres']   ?? '', 80);
$message = $clean($in['message'] ?? '', 4000);
$subject = $in['subject'] ?? [];

if (nli_strlen($name) < 2)                          fail('name');
if (!filter_var($email, FILTER_VALIDATE_EMAIL))     fail('email');
if (nli_strlen($message) < 2)                       fail('message');

/* One box ticked is the minimum; twelve is well past what the form offers and
   exists only to bound what a hand-rolled POST can put in the table. */
if (is_string($subject)) $subject = [$subject];
if (!is_array($subject)) fail('subject');
$subject = array_values(array_filter(
  array_map(static fn($s) => nli_substr(trim((string)$s), 0, 80), $subject),
  static fn($s) => $s !== ''
));
if (!$subject || count($subject) > 12) fail('subject');

/* ---------- save ---------------------------------------------------------- */

$saved = false;
try {
  $pdo = new PDO(
    "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4",
    $cfg['db_user'],
    $cfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
  );

  /* Created on every request rather than once by hand, so a fresh deploy or a
     rebuilt database can never silently drop an inquiry on the floor. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS inquiries (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(120) NOT NULL,
       email VARCHAR(160) NOT NULL,
       phone VARCHAR(40) NULL,
       county VARCHAR(120) NULL,
       acres VARCHAR(80) NULL,
       subject TEXT NOT NULL,
       message TEXT NOT NULL,
       ip VARCHAR(45) NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_created (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
  );

  $ip = nli_substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);

  /* Five submissions per address per ten minutes is generous for a real
     person and stops a bored script filling the table. */
  $recent = $pdo->prepare(
    'SELECT COUNT(*) FROM inquiries
      WHERE ip = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)'
  );
  $recent->execute([$ip]);
  if ((int)$recent->fetchColumn() >= 5) fail('slow_down', 429);

  $ins = $pdo->prepare(
    'INSERT INTO inquiries (name, email, phone, county, acres, subject, message, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  $ins->execute([
    $name, $email, $phone ?: null, $county ?: null, $acres ?: null,
    implode(', ', $subject), $message, $ip,
  ]);
  $saved = true;
} catch (Throwable $e) {
  /* Logged, never returned: an exception message can carry the database name
     and the query, and none of that belongs in a browser. */
  error_log('contact.php db: ' . $e->getMessage());
}

/* ---------- email --------------------------------------------------------- */

require __DIR__ . '/mail.php';
$notified = false;
$confirmed = false;
try {
  [$notified, $confirmed] = nli_send_inquiry_mail($cfg, [
    'name'    => $name,
    'email'   => $email,
    'phone'   => $phone,
    'county'  => $county,
    'acres'   => $acres,
    'subject' => $subject,
    'message' => $message,
  ]);
} catch (Throwable $e) {
  error_log('contact.php mail: ' . $e->getMessage());
}

/* Success if the inquiry survived in either place. It is only a failure when
   nothing caught it — and that is the one case where telling the visitor to
   call the office is the right advice. */
if (!$saved && !$notified) fail('storage', 500);

echo json_encode(['ok' => true, 'confirmed' => $confirmed]);
