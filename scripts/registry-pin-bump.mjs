#!/usr/bin/env node
/**
 * Registry pin bump: keeps this repository's mzizi-registry pin on registry
 * `main`, through an ordinary pull request that lands only when every check on
 * it is green.
 *
 *   node scripts/registry-pin-bump.mjs            # reconcile (CI)
 *   node scripts/registry-pin-bump.mjs --dry-run  # print the plan, write nothing
 *
 * Run by .github/workflows/registry-pin-bump.yml (hourly, by hand, when
 * mzizi-registry `main` moves, and whenever a check on the bump branch
 * finishes). Every run does the same idempotent reconcile, so a missed or
 * cancelled run is caught by the next one:
 *
 *   1. Read the pin on `main` (PIN_FILE) and registry `main` (`git ls-remote`,
 *      public, no token). Registry history comes from a treeless clone.
 *   2. Main already pins registry main (a bump landed, by the bot or by hand):
 *      close the bot's pull request, if one is open, and delete its branch.
 *   3. Otherwise make PIN_BUMP_BRANCH exactly one bot commit on top of the
 *      current `main` that sets the pin to registry main, force-pushing it only
 *      when that differs from what is there. One branch, so at most one open
 *      bump pull request: it is updated, never duplicated. Before a push to a
 *      branch with auto-merge on, auto-merge is switched off, so a new commit
 *      can never ride on an old commit's green checks.
 *   4. When nothing was pushed, gate the open pull request: it merges (rebase)
 *      only if it is the bot's own single commit, changes nothing but PIN_FILE,
 *      moves the pin forward along registry main, and every check run and
 *      status on its head commit has finished green, EXPECTED_CHECKS included.
 *      A failed check gets one comment asking for review, and the pull request
 *      waits for a person. The merge goes through the branch rules like any
 *      other; this script never bypasses them.
 *
 * A branch someone else has pushed to (any commit without the bot trailer) is
 * never rewritten or merged by the bot: taking over a bump is pushing to it.
 *
 * Environment:
 *   RELEASE_BUMP_TOKEN token that pushes, opens and merges (see README). Unset:
 *                      the run warns and exits 0 without writing anything.
 *   GITHUB_TOKEN       the workflow's own token, given `checks: read` and
 *                      `statuses: read`. The gate reads the head commit's check
 *                      runs and status, and main's branch rules, with it, so
 *                      RELEASE_BUMP_TOKEN needs no Checks or Commit statuses
 *                      permission. (A fine-grained token without them gets a
 *                      403 on a private repository, though not on a public
 *                      one.) Unset: RELEASE_BUMP_TOKEN does the reads too.
 *   PIN_FILE           the pin, relative to the repository root.
 *   PIN_BUMP_BRANCH    the bot's branch (default bot/registry-pin).
 *   EXPECTED_CHECKS    newline-separated check names that must be present and
 *                      green on the head commit before it merges.
 *   GITHUB_REPOSITORY  owner/name (set by Actions).
 *
 * The same file is in mzizi-dev/mzizi-api-gateway and mzizi-dev/agent-tools;
 * keep the copies identical.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = process.env;
const DRY_RUN = env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const TOKEN = env.RELEASE_BUMP_TOKEN ?? "";
/** Reads the gate's checks, status and rules: see GITHUB_TOKEN above. */
const READ_TOKEN = env.GITHUB_TOKEN || TOKEN;
const REPO = env.GITHUB_REPOSITORY ?? "";
const PIN_FILE = env.PIN_FILE ?? "";
const BRANCH = env.PIN_BUMP_BRANCH || "bot/registry-pin";
const EXPECTED_CHECKS = (env.EXPECTED_CHECKS ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const API = env.GITHUB_API_URL || "https://api.github.com";
const TRAILER = "Registry-Pin-Bump: automated";
/** In the pull request body: which registry commit it bumps to. */
const targetMark = (sha) => `<!-- registry-pin-bump target=${sha} -->`;
const MAX_LISTED_COMMITS = 150;
const OK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

const log = (...a) => console.log(...a);
const summary = [];
const note = (line) => {
  log(line);
  summary.push(line);
};

function fail(msg) {
  console.error(`::error::registry-pin-bump: ${msg}`);
  process.exit(1);
}

if (!REPO.includes("/")) fail("GITHUB_REPOSITORY must be owner/name.");
if (!PIN_FILE) fail("PIN_FILE is required.");
if (!TOKEN && !DRY_RUN) {
  console.log(
    "::warning::registry-pin-bump: the RELEASE_BUMP_TOKEN secret is not set, so no " +
      "bump pull request can be opened or merged. See README, 'Registry pin bump'.",
  );
  process.exit(0);
}
const OWNER = REPO.split("/")[0];

// ── git and GitHub helpers ────────────────────────────────────────────────

function git(args, cwd, extraEnv = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_LFS_SKIP_SMUDGE: "1",
      ...extraEnv,
    },
  }).trim();
}
const gitOk = (args, cwd) => {
  try {
    git(args, cwd);
    return true;
  } catch {
    return false;
  }
};
function lsRemote(remote, ref) {
  const line = git(["ls-remote", remote, ref]).split("\n")[0] ?? "";
  return line.split("\t")[0] || null;
}

async function gh(method, path, body, token = TOKEN) {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(
      `${method} ${path}: ${res.status} ${data?.message ?? text}`,
    );
    err.status = res.status;
    throw err;
  }
  return data;
}
/** Every page of a list endpoint (or of `key` inside each page). */
async function ghAll(path, key, token = TOKEN) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await gh(
      "GET",
      `${path}${sep}per_page=100&page=${page}`,
      undefined,
      token,
    );
    const items = key ? data[key] : data;
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}
/** A write: skipped (and printed) under --dry-run. */
async function ghWrite(method, path, body) {
  if (DRY_RUN) {
    log(`[dry-run] ${method} ${path}`);
    return null;
  }
  return gh(method, path, body);
}
async function graphql(query, variables) {
  if (DRY_RUN) {
    log(`[dry-run] graphql ${query.trim().split(/\s+/).slice(0, 3).join(" ")}`);
    return null;
  }
  const data = await gh("POST", "/graphql", { query, variables });
  if (data.errors?.length)
    throw new Error(data.errors.map((e) => e.message).join("; "));
  return data.data;
}

// ── state ────────────────────────────────────────────────────────────────

git([
  "fetch",
  "-q",
  "--no-tags",
  "origin",
  "+refs/heads/main:refs/remotes/origin/main",
]);
const mainSha = git(["rev-parse", "refs/remotes/origin/main"]);
const readPinAt = (rev) => JSON.parse(git(["show", `${rev}:${PIN_FILE}`]));
const basePin = readPinAt(mainSha);
if (!/^[0-9a-f]{40}$/.test(basePin.ref ?? ""))
  fail(`${PIN_FILE} on main has no full commit SHA in "ref".`);
const registryUrl = basePin.repository.replace(/\/$/, "");
const registrySlug = registryUrl.replace(/^https:\/\/github\.com\//, "");

const target = lsRemote(registryUrl, "refs/heads/main");
if (!target) fail(`could not read ${registryUrl} main.`);

// Registry commits only (no trees or blobs): enough for ancestry and the log.
const regDir = mkdtempSync(join(tmpdir(), "registry-"));
git([
  "clone",
  "-q",
  "--bare",
  "--filter=tree:0",
  "--single-branch",
  "--branch",
  "main",
  registryUrl,
  regDir,
]);
const onMain = (sha) =>
  gitOk(["merge-base", "--is-ancestor", sha, target], regDir);
const isAncestor = (a, b) =>
  gitOk(["merge-base", "--is-ancestor", a, b], regDir);

const branchSha = lsRemote("origin", `refs/heads/${BRANCH}`);
if (
  branchSha &&
  !gitOk([
    "fetch",
    "-q",
    "--no-tags",
    "origin",
    `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`,
  ])
) {
  // Deleted between the two reads: a person merged or closed the bump just
  // now. Nothing to gate; the next run starts from the new state.
  note(`${BRANCH} was deleted during this run; the next run reconciles`);
  finish();
}
const branchRef = `refs/remotes/origin/${BRANCH}`;
/** The bot's branch holds only bot commits (each carries the trailer). */
const branchCommits = branchSha
  ? git(["log", "--format=%H%x1f%B%x1e", `${mainSha}..${branchRef}`])
      .split("\x1e")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [sha, message] = s.split("\x1f");
        return { sha, message };
      })
  : [];
const botOwned = branchCommits.every((c) => c.message.includes(TRAILER));

const openPrs = await gh(
  "GET",
  `/repos/${REPO}/pulls?state=open&base=main&head=${OWNER}:${encodeURIComponent(BRANCH)}`,
);
let pr = openPrs[0] ?? null;

note(
  `main ${mainSha.slice(0, 7)} pins ${registrySlug}@${basePin.ref.slice(0, 7)}; ` +
    `registry main is ${target.slice(0, 7)}; ` +
    `${BRANCH}: ${branchSha ? branchSha.slice(0, 7) : "absent"}` +
    `${branchSha && !botOwned ? " (has commits not made by the bot)" : ""}; ` +
    `open bump PR: ${pr ? `#${pr.number}` : "none"}`,
);

// A person has pushed to the bot's branch: the bump is theirs now.
if (branchSha && !botOwned) {
  note(
    `${BRANCH} has commits not made by the bot, so a person owns this bump now; ` +
      "the bot leaves the branch and the pull request alone.",
  );
  finish();
}

// ── 2. main already pins registry main ───────────────────────────────────

async function comment(number, body) {
  await ghWrite("POST", `/repos/${REPO}/issues/${number}/comments`, { body });
}
async function commentOnce(number, key, body) {
  const marker = `<!-- registry-pin-bump:${key} -->`;
  const comments = await ghAll(`/repos/${REPO}/issues/${number}/comments`);
  if (comments.some((c) => c.body?.includes(marker))) return;
  await comment(number, `${marker}\n${body}`);
}
async function disableAutoMerge(p) {
  if (!p?.auto_merge) return;
  await graphql(
    `
      mutation ($id: ID!) {
        disablePullRequestAutoMerge(input: { pullRequestId: $id }) {
          clientMutationId
        }
      }
    `,
    { id: p.node_id },
  );
  note(`auto-merge switched off on #${p.number}`);
}

if (basePin.ref === target) {
  if (pr) {
    await disableAutoMerge(pr);
    await comment(
      pr.number,
      `\`main\` already pins ${registrySlug}@\`${target.slice(0, 7)}\`, registry main, so this bump is no longer needed. Closing.`,
    );
    await ghWrite("PATCH", `/repos/${REPO}/pulls/${pr.number}`, {
      state: "closed",
    });
    note(`closed #${pr.number}: main already pins registry main`);
  }
  if (branchSha && botOwned) {
    await ghWrite("DELETE", `/repos/${REPO}/git/refs/heads/${BRANCH}`);
    note(`deleted ${BRANCH}`);
  }
  if (!pr && !branchSha) note("up to date: nothing to do");
  finish();
}

// ── 3. make the branch main + one bot commit at registry main ────────────

const fastForward = isAncestor(basePin.ref, target);
const commits = fastForward
  ? git(
      [
        "log",
        "--reverse",
        "--format=%H%x1f%s%x1f%an%x1f%as",
        `${basePin.ref}..${target}`,
      ],
      regDir,
    )
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [sha, subject, author, date] = l.split("\x1f");
        return { sha, subject, author, date };
      })
  : [];

const branchIsCurrent =
  branchSha &&
  botOwned &&
  branchCommits.length === 1 &&
  git(["rev-parse", `${branchRef}^`]) === mainSha &&
  readPinAt(branchRef).ref === target &&
  git(["diff", "--name-only", mainSha, branchRef]) === PIN_FILE;

let pushed = false;

if (!pr && ((await manualBumpInFlight()) || (await closedByAPerson())))
  finish();

if (!branchIsCurrent) {
  const today = new Date().toISOString().slice(0, 10);
  const next = { ...basePin, ref: target };
  if ("pinned" in basePin) next.pinned = today;
  if ("note" in basePin)
    next.note =
      `mzizi-registry main at ${target.slice(0, 7)} on ${today}, set by ` +
      `.github/workflows/registry-pin-bump.yml. The commits since the last pin are ` +
      `listed in its pull request.`;

  const message = [
    title(),
    "",
    `Moves ${PIN_FILE} from ${basePin.ref.slice(0, 7)} to ${target.slice(0, 7)}` +
      (fastForward
        ? `, ${commits.length} registry commit${commits.length === 1 ? "" : "s"}.`
        : ". Not a fast-forward along registry main: needs review."),
    "",
    TRAILER,
    "",
  ].join("\n");

  const wt = mkdtempSync(join(tmpdir(), "pin-bump-"));
  try {
    git(["worktree", "add", "-q", "--detach", wt, mainSha]);
    writeFileSync(join(wt, PIN_FILE), JSON.stringify(next, null, 2) + "\n");
    git(["add", PIN_FILE], wt);
    const who = await botIdentity();
    const msgFile = join(wt, ".git-pin-bump-msg");
    writeFileSync(msgFile, message);
    git(["commit", "-q", "-F", msgFile], wt, {
      GIT_AUTHOR_NAME: who.name,
      GIT_AUTHOR_EMAIL: who.email,
      GIT_COMMITTER_NAME: who.name,
      GIT_COMMITTER_EMAIL: who.email,
    });
    rmSync(msgFile);
    const newSha = git(["rev-parse", "HEAD"], wt);
    await disableAutoMerge(pr);
    if (DRY_RUN) {
      log(`[dry-run] push ${newSha.slice(0, 7)} to ${BRANCH}`);
    } else {
      git(
        [
          "push",
          "-q",
          `--force-with-lease=refs/heads/${BRANCH}:${branchSha ?? ""}`,
          "origin",
          `HEAD:refs/heads/${BRANCH}`,
        ],
        wt,
      );
    }
    pushed = true;
    note(
      `pushed ${newSha.slice(0, 7)} to ${BRANCH} (main + pin ${target.slice(0, 7)})`,
    );
  } finally {
    gitOk(["worktree", "remove", "--force", wt]);
    rmSync(wt, { recursive: true, force: true });
  }
}

// A pushed branch, or a current branch with no pull request (one that failed
// to open, say): open or refresh the pull request.
if (pushed || !pr) {
  const body = prBody();
  if (DRY_RUN) log(`[dry-run] pull request body:\n${body}`);
  if (pr) {
    await ghWrite("PATCH", `/repos/${REPO}/pulls/${pr.number}`, {
      title: title(),
      body,
    });
    note(`updated #${pr.number}`);
  } else {
    pr = await ghWrite("POST", `/repos/${REPO}/pulls`, {
      title: title(),
      head: BRANCH,
      base: "main",
      body,
      maintainer_can_modify: true,
    });
    note(
      pr ? `opened #${pr.number}: ${pr.html_url}` : "would open a pull request",
    );
  }
}

// ── 4. gate: merge when everything on the head commit is green ───────────

if (!pushed && pr) await gate(pr);
finish();

// ── pieces ───────────────────────────────────────────────────────────────

async function gate(p) {
  const headSha = p.head.sha;
  if (headSha !== branchSha) {
    note(
      `#${p.number} head ${headSha.slice(0, 7)} is not the branch tip yet; next run`,
    );
    return;
  }
  const reasons = [];
  const files = (await ghAll(`/repos/${REPO}/pulls/${p.number}/files`)).map(
    (f) => f.filename,
  );
  if (files.length !== 1 || files[0] !== PIN_FILE)
    reasons.push(`it changes more than \`${PIN_FILE}\` (${files.join(", ")})`);
  const headPin = readPinAt(branchRef);
  if (!isAncestor(basePin.ref, headPin.ref))
    reasons.push(
      `the new pin \`${headPin.ref.slice(0, 7)}\` does not descend from main's pin \`${basePin.ref.slice(0, 7)}\` on registry main`,
    );
  if (!onMain(headPin.ref))
    reasons.push(`\`${headPin.ref.slice(0, 7)}\` is not on registry main`);
  if (reasons.length) {
    await commentOnce(
      p.number,
      `review:${headSha}`,
      `**Needs review.** The bot will not merge this bump because ${reasons.join("; and ")}.`,
    );
    note(`#${p.number} needs review: ${reasons.join("; ")}`);
    return;
  }

  // Latest run per check name (a re-run replaces the earlier result).
  const runs = await ghAll(
    `/repos/${REPO}/commits/${headSha}/check-runs?filter=latest`,
    "check_runs",
    READ_TOKEN,
  );
  const status = await gh(
    "GET",
    `/repos/${REPO}/commits/${headSha}/status`,
    undefined,
    READ_TOKEN,
  );
  const checks = [
    ...runs.map((r) => ({
      name: r.name,
      done: r.status === "completed",
      ok: OK_CONCLUSIONS.has(r.conclusion),
      url: r.html_url,
      result: r.conclusion ?? r.status,
    })),
    ...status.statuses.map((s) => ({
      name: s.context,
      done: s.state !== "pending",
      ok: s.state === "success",
      url: s.target_url,
      result: s.state,
    })),
  ];
  // The checks main's branch rules require. They must be present and green
  // too, so that merging here is exactly what the rules allow, even for a token
  // whose owner could bypass them. Unreadable: leave the merge to auto-merge.
  let required = null;
  try {
    required = (
      await gh(
        "GET",
        `/repos/${REPO}/rules/branches/main`,
        undefined,
        READ_TOKEN,
      )
    )
      .filter((r) => r.type === "required_status_checks")
      .flatMap((r) =>
        r.parameters.required_status_checks.map((c) => c.context),
      );
  } catch (e) {
    note(`could not read main's branch rules (${e.message}); auto-merge only`);
  }
  const names = new Set(checks.map((c) => c.name));
  const missing = [
    ...new Set([...EXPECTED_CHECKS, ...(required ?? [])]),
  ].filter((n) => !names.has(n));
  const failed = checks.filter((c) => c.done && !c.ok);
  const pending = checks.filter((c) => !c.done);

  if (failed.length) {
    await disableAutoMerge(p);
    await commentOnce(
      p.number,
      `failed:${headSha}`,
      [
        `**Needs review.** ${failed.length === 1 ? "A check" : `${failed.length} checks`} failed on \`${headSha.slice(0, 7)}\`, so the bot will not merge this bump:`,
        "",
        ...failed.map((c) => `- [${c.name}](${c.url}): ${c.result}`),
        "",
        "If `parity` failed, its job summary lists the unexplained differences. " +
          "They usually mean the registry changed a route handler, which this " +
          "repository has to port in the same pull request. To take the bump " +
          "over, push to this branch: the bot stops touching it.",
      ].join("\n"),
    );
    note(
      `#${p.number}: failed ${failed.map((c) => c.name).join(", ")}; waiting for review`,
    );
    return;
  }
  if (missing.length || pending.length) {
    note(
      `#${p.number}: waiting for ${[...missing, ...pending.map((c) => c.name)].join(", ")}`,
    );
    return;
  }

  // Everything is green. Merge now if the branch rules allow it; otherwise
  // hand it to GitHub's auto-merge, which waits for the required checks.
  if (DRY_RUN) {
    log(`[dry-run] merge #${p.number} (rebase) at ${headSha.slice(0, 7)}`);
    return;
  }
  try {
    if (!required)
      throw Object.assign(new Error("rules unread"), { status: 405 });
    await gh("PUT", `/repos/${REPO}/pulls/${p.number}/merge`, {
      merge_method: "rebase",
      sha: headSha,
    });
    note(`merged #${p.number} (rebase): all ${checks.length} checks green`);
  } catch (e) {
    if (![405, 409, 422].includes(e.status)) throw e;
    if (p.auto_merge) {
      note(
        `#${p.number}: all checks green, auto-merge already on (${e.message})`,
      );
      return;
    }
    await graphql(
      `
        mutation ($id: ID!, $sha: GitObjectID!) {
          enablePullRequestAutoMerge(
            input: {
              pullRequestId: $id
              mergeMethod: REBASE
              expectedHeadOid: $sha
            }
          ) {
            clientMutationId
          }
        }
      `,
      { id: p.node_id, sha: headSha },
    );
    note(
      `#${p.number}: all checks green; auto-merge (rebase) on (${e.message})`,
    );
  }
}

/** Another open pull request (a bump by hand) already moves the pin to `target`. */
async function manualBumpInFlight() {
  const prs = await ghAll(`/repos/${REPO}/pulls?state=open&base=main`);
  for (const other of prs) {
    if (other.head.ref === BRANCH) continue;
    const files = await ghAll(`/repos/${REPO}/pulls/${other.number}/files`);
    if (!files.some((f) => f.filename === PIN_FILE)) continue;
    try {
      const c = await gh(
        "GET",
        `/repos/${other.head.repo.full_name}/contents/${PIN_FILE}?ref=${other.head.sha}`,
      );
      const ref = JSON.parse(Buffer.from(c.content, "base64").toString()).ref;
      if (ref === target) {
        note(
          `#${other.number} (${other.head.ref}) already moves the pin to ${target.slice(0, 7)}; ` +
            "no bot pull request while it is open",
        );
        return true;
      }
    } catch {
      // unreadable head (a deleted fork): not a bump in flight
    }
  }
  return false;
}

/** A person closed the bot's pull request for this same target: respect it. */
async function closedByAPerson() {
  const closed = await gh(
    "GET",
    `/repos/${REPO}/pulls?state=closed&base=main&head=${OWNER}:${encodeURIComponent(BRANCH)}&per_page=5`,
  );
  const same = closed.find(
    (c) => !c.merged_at && c.body?.includes(targetMark(target)),
  );
  if (!same) return false;
  note(
    `#${same.number} for ${target.slice(0, 7)} was closed without merging; ` +
      "the bot opens a new one when registry main moves again",
  );
  return true;
}

async function botIdentity() {
  try {
    const me = await gh("GET", "/user");
    return {
      name: me.login,
      email: `${me.id}+${me.login}@users.noreply.github.com`,
    };
  } catch {
    return {
      name: "registry-pin-bump",
      email: "registry-pin-bump@users.noreply.github.com",
    };
  }
}

function title() {
  return `Bump mzizi-registry pin to ${target.slice(0, 7)} (registry main)`;
}

function prBody() {
  const short = (s) => s.slice(0, 7);
  const compare = `${registryUrl}/compare/${basePin.ref}...${target}`;
  const link = (sha) => `[\`${short(sha)}\`](${registryUrl}/commit/${sha})`;
  // `#123` in a registry subject means the registry's pull request, not ours.
  const subj = (s) =>
    s.replace(/(^|[^\w/])#(\d+)/g, `$1${registrySlug}#$2`).replace(/[<>]/g, "");
  const listed = commits.slice(-MAX_LISTED_COMMITS);
  const lines = [
    targetMark(target),
    "## Summary",
    "",
    `Moves \`${PIN_FILE}\` from ${link(basePin.ref)} to ${link(target)}, ` +
      `[${registrySlug}](${registryUrl}) \`main\` (${fastForward ? `${commits.length} commit${commits.length === 1 ? "" : "s"}` : "not a fast-forward"}, [compare](${compare})).`,
    "",
    "Opened and kept current by `.github/workflows/registry-pin-bump.yml`. It is " +
      "rebuilt on the current `main` whenever `main` or registry `main` moves, " +
      "and closed if the pin reaches registry `main` another way.",
    "",
  ];
  if (!fastForward)
    lines.push(
      `> [!WARNING]`,
      `> main's pin \`${short(basePin.ref)}\` is not an ancestor of registry main, ` +
        "so this is not a plain forward move. The bot will not merge it; a person has to review it.",
      "",
    );
  lines.push("## Registry commits", "");
  if (commits.length > listed.length)
    lines.push(
      `The last ${listed.length} of ${commits.length}; the rest are in the [compare view](${compare}).`,
      "",
    );
  for (const c of listed)
    lines.push(`- ${link(c.sha)} ${subj(c.subject)} (${c.author}, ${c.date})`);
  if (!commits.length) lines.push("See the [compare view](" + compare + ").");
  lines.push(
    "",
    "## How this lands",
    "",
    "The bot merges it (rebase) only when all of these hold, and never past the branch rules:",
    "",
    `- it is the bot's single commit on the current \`main\`, changing only \`${PIN_FILE}\`;`,
    "- the new pin descends from the old one on registry `main`;",
    "- every check and status on the head commit finished green, including " +
      EXPECTED_CHECKS.map((n) => `\`${n}\``).join(", ") +
      ".",
    "",
    "If anything fails, it comments here and waits for a person. To take the " +
      "bump over (port a handler change, add an `EXPECTED` entry), push to this " +
      "branch: the bot then leaves it alone, and it merges by hand.",
    "",
    "## Site/docs/skills impact",
    "",
    `This changes the registry content this repository serves (\`${REPO}\`), so ` +
      "it can change components, docs and skills as served. The site-, docs- " +
      "and skills-freshness agents should check mzizi.dev, docs.mzizi.dev and " +
      `\`@nyuchi/mzizi-skills\` against ${registrySlug}@\`${short(target)}\` once this merges.`,
    "",
  );
  return lines.join("\n");
}

function finish() {
  rmSync(regDir, { recursive: true, force: true });
  if (env.GITHUB_STEP_SUMMARY && summary.length)
    writeFileSync(
      env.GITHUB_STEP_SUMMARY,
      `## Registry pin bump${DRY_RUN ? " (dry run)" : ""}\n\n${summary.map((l) => `- ${l}`).join("\n")}\n`,
      { flag: "a" },
    );
  process.exit(0);
}
