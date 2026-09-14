<?php
/* Copy this to config.php beside it on the server and fill in the two blanks.

   config.php is deliberately NOT in the GitHub repository, is listed in
   .gitignore, and is denied by .htaccess so it cannot be downloaded even if
   the PHP handler ever breaks. Never commit it. */

return [
  /* ---- Hostinger MySQL, from hPanel > Databases > Management ---- */
  'db_host' => 'localhost',
  'db_name' => '',
  'db_user' => '',
  'db_pass' => '',

  /* ---- where an inquiry is delivered ---- */
  'mail_to' => 'gwilliams@nicholsland.net',

  /* ---- Resend.

     mail_from has to sit at a domain verified in Resend, which is why it is
     at nicholsland.net. Nobody reads that mailbox — it does not need to
     exist. Every lead email carries the visitor's own address as Reply-To,
     so hitting reply in Outlook answers the person who filled in the form.

     It cannot be a gmail.com address: Gmail's DMARC policy tells receivers
     to reject mail claiming to come from gmail.com but sent through anyone
     else, so it would bounce or land in spam. ---- */
  'resend_api_key' => '',
  'mail_from'      => 'inquiries@nicholsland.net',
  'from_name'      => 'Nichols Land & Investment Co.',
];
