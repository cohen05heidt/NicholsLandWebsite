<?php
/* String helpers that do not assume the mbstring extension is installed.

   A missing extension is a hard fatal in PHP, which means a blank 500 and no
   JSON for the browser to read — the form would show "that didn't send" with
   nothing in any log to explain it. Rather than trust the host's build, these
   fall back to PCRE with the /u flag, which is UTF-8 correct and always
   available. */

declare(strict_types=1);

if (!function_exists('nli_substr')) {
  function nli_substr(string $s, int $start, ?int $len = null): string {
    if (function_exists('mb_substr')) {
      return $len === null ? mb_substr($s, $start) : mb_substr($s, $start, $len);
    }
    $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $slice = $len === null ? array_slice($chars, $start) : array_slice($chars, $start, $len);
    return implode('', $slice);
  }

  function nli_strlen(string $s): int {
    if (function_exists('mb_strlen')) return mb_strlen($s);
    return (int)preg_match_all('/./u', $s);
  }
}
