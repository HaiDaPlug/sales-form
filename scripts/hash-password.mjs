#!/usr/bin/env node
import { createInterface } from "node:readline";
import { hashPassword } from "./password-hash.mjs";

/**
 * Prints the password hash to put in an `APP_USERS` entry.
 *
 *     npm run hash-password            # prompts, input hidden from history
 *     npm run hash-password -- "text"  # one-off; lands in shell history
 *
 * Nothing is stored anywhere: copy the printed value into APP_USERS.
 */
async function readPassword() {
  const fromArgument = process.argv[2];
  if (fromArgument) return fromArgument;

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  return new Promise((resolve) => {
    rl.question("Lösenord: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const password = await readPassword();

if (!password) {
  console.error("Ange ett lösenord.");
  process.exit(1);
}

console.log(hashPassword(password));
