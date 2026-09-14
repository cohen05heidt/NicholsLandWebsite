<?php
/* TEMPORARY. Delete this file as soon as the images are recovered.

   Why it exists
   -------------
   38 of the 39 listings reference their photographs at
   nicholsland.net/wp-content/uploads/..., which is the old WordPress media
   library. The files were never copied into this repository; they were linked
   to the live WordPress install. Moving the domain to Hostinger left all 143
   of them 404.

   The old WordPress server is still running at 209.17.116.165, and still holds
   every file. It cannot be reached by name any more - its virtual host answers
   only to nicholsland.net and www.nicholsland.net, and both now resolve here.
   But a request can still be sent to that IP with the right Host header, and
   this server can do exactly that. That is all this script is: it asks the old
   machine for the files this site is already asking for, and returns them in
   one zip.

   What it will and will not fetch
   -------------------------------
   Nothing is passed in. The list comes from data/properties.json sitting next
   to it, filtered to wp-content/uploads URLs on nicholsland.net. It is a fixed,
   closed set - not a proxy, and there is no parameter to point it anywhere
   else. Worst case it serves images that were public on this domain yesterday. */

declare(strict_types=1);
set_time_limit(600);
ini_set('memory_limit', '512M');

const OLD_HOST = 'nicholsland.net';
const OLD_IP   = '209.17.116.165';

function bail(string $msg, int $code = 500): never {
  http_response_code($code);
  header('Content-Type: text/plain; charset=utf-8');
  echo $msg . "\n";
  exit;
}

if (!class_exists('ZipArchive')) bail('ZipArchive is not available on this PHP build.');
if (!function_exists('curl_init')) bail('The curl extension is not available.');

$jsonPath = __DIR__ . '/data/properties.json';
if (!is_file($jsonPath)) bail('data/properties.json not found next to this script.');

$props = json_decode((string)file_get_contents($jsonPath), true);
if (!is_array($props)) bail('data/properties.json did not parse.');

/* Collect every wp-content URL the site references, de-duplicated, and keep
   the listing slug with each one so the zip arrives already organised. */
$wanted = [];
foreach ($props as $p) {
  $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower((string)($p['title'] ?? 'untitled')));
  $slug = trim($slug, '-');
  foreach ((array)($p['images'] ?? []) as $i => $src) {
    if (!is_string($src)) continue;
    $parts = parse_url($src);
    if (($parts['host'] ?? '') !== OLD_HOST) continue;
    $path = $parts['path'] ?? '';
    if (!preg_match('#^/wp-content/uploads/[0-9]{4}/[0-9]{2}/[A-Za-z0-9._%()-]+$#', $path)) continue;
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION)) ?: 'jpg';
    if (isset($wanted[$path])) continue;   // same file used by two listings

    /* Two different tracts are both titled "Poplar Street Tract" - one 2.5
       acres, one 28 - so slug+index alone is not unique, and the second
       listing's photographs silently overwrote the first's. Keep counting up
       until the name is free: readable, and unique by construction. */
    $n = $i + 1;
    do {
      $name = sprintf('%s-%02d.%s', $slug, $n, $ext);
      $n++;
    } while (in_array($name, $wanted, true));
    $wanted[$path] = $name;
  }
}

if (!$wanted) bail('No wp-content image URLs found in properties.json - nothing to do.', 404);

$tmp = tempnam(sys_get_temp_dir(), 'wpimg');
$zip = new ZipArchive();
if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) bail('Could not open a zip for writing.');

$ok = 0; $failed = [];
foreach ($wanted as $path => $name) {
  /* Resolve the name to the old machine explicitly. The Host header is what
     makes its virtual host answer; without it the server returns its default
     404, which is what a plain request to that IP gets. */
  $ch = curl_init('http://' . OLD_HOST . $path);
  curl_setopt_array($ch, [
    CURLOPT_RESOLVE        => [OLD_HOST . ':80:' . OLD_IP],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT        => 25,
    CURLOPT_USERAGENT      => 'nicholsland-image-recovery/1.0',
  ]);
  $body = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  $err  = curl_error($ch);
  curl_close($ch);

  if ($body === false || $code !== 200 || stripos($type, 'image/') !== 0) {
    $failed[] = $path . ' -> ' . ($code ?: 'curl') . ' ' . ($err ?: $type);
    continue;
  }
  $zip->addFromString($name, $body);
  $ok++;
}

/* A manifest so the mapping from old URL to new filename survives the trip. */
$manifest = "old_url\tnew_filename\n";
foreach ($wanted as $path => $name) $manifest .= 'https://' . OLD_HOST . $path . "\t" . $name . "\n";
$zip->addFromString('_manifest.tsv', $manifest);
$zip->addFromString('_report.txt',
  "recovered: $ok of " . count($wanted) . "\n\nfailed:\n" . ($failed ? implode("\n", $failed) : '(none)') . "\n");
$zip->close();

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="nicholsland-wp-images.zip"');
header('Content-Length: ' . (string)filesize($tmp));
header('X-Recovered: ' . $ok . '/' . count($wanted));
readfile($tmp);
@unlink($tmp);
