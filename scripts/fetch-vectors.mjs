// Downloads the wire-protocol vectors published with the firmware release
// this app pins (package.json -> "corisco.firmware") into .contract/. The
// contract tests (tests/contract.test.ts) check postcard.ts and the UUIDs
// against that file, so bumping the pin is how the app opts into a newer
// firmware protocol.
//
// Uses the `gh` CLI: the firmware repo is private, so this needs `gh auth
// login` locally, or GH_TOKEN (a token with read access to it) in CI.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const { corisco } = JSON.parse(readFileSync("package.json", "utf8"));
const { repo, tag } = corisco.firmware;

mkdirSync(".contract", { recursive: true });
console.log(`Fetching vectors.json from ${repo}@${tag}`);
try {
  execFileSync(
    "gh",
    ["release", "download", tag, "-R", repo, "-p", "vectors.json", "-D", ".contract", "--clobber"],
    { stdio: "inherit" },
  );
} catch {
  console.error(
    `\nCould not download vectors.json for ${repo}@${tag}.\n` +
      "Check that the release exists and that `gh auth status` (or GH_TOKEN) can read the repo.",
  );
  process.exit(1);
}
