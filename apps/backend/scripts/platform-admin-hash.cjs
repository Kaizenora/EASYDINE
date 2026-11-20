#!/usr/bin/env node
// One-time setup of the EasyDine platform admin password.
//
// Prints ONLY a bcrypt hash. Put it in the backend's environment as
// PLATFORM_ADMIN_PASSWORD_HASH (and the login ID as PLATFORM_ADMIN_EMAIL).
// The password itself is never written to disk, logged or sent anywhere.
//
//   cd apps/backend
//   node scripts/platform-admin-hash.cjs
//
// Type the password twice when asked (input is not echoed where the terminal
// supports it). Minimum 12 characters.
const bcrypt = require('bcrypt');
const readline = require('node:readline');

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => (s.includes(prompt) ? write(s) : write(''));
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const a = await ask('New platform admin password: ');
  const b = await ask('Repeat password: ');
  if (a !== b) {
    console.error('Passwords do not match. Nothing was generated.');
    process.exit(1);
  }
  if (a.length < 12) {
    console.error('Use at least 12 characters. Nothing was generated.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(a, 12);
  // The hash alone on its own line (60 characters) so a narrow terminal
  // does not wrap it and a copy does not pick up a line break.
  console.log('\nValue for PLATFORM_ADMIN_PASSWORD_HASH (copy the next line only):\n');
  console.log(hash);
  console.log('\nSet it (and PLATFORM_ADMIN_EMAIL) in the backend environment, then redeploy.');
})();
