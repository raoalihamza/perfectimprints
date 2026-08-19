#!/usr/bin/env bash
# Monthly rebuild (SCRAPE-930) - verify or recover the rebuild pull request.
#
# Run #5 got through every scrape, the data-loss guard, the prune and the
# summary, then GitHub's PR-creation endpoint returned "Server Error" on the
# ~1.44M-line diff. The pull request HAD actually been created; the action
# treated the 500 as fatal, so the email and the auto-merge never ran and Ali
# had to find and merge the PR by hand. This script runs right after
# peter-evans/create-pull-request (which now has continue-on-error: true) and
# guarantees the job ends in one of exactly two states:
#   - a pull request exists and its number/url are exported for the email and
#     auto-merge steps, or
#   - status=failed with a plain-language reason, and a later workflow step
#     fails the run LOUDLY, after the summary email has told Patrick.
#
# It therefore ALWAYS exits 0. Exiting non-zero here would skip the email
# exactly the way run #5 did; the workflow's "Fail if no pull request" step
# re-raises the failure after the email has gone out.
#
# Cases handled:
#   1. The create step succeeded            -> pass its outputs through.
#   2. It failed but the PR exists anyway   -> find it with `gh pr list`,
#      refresh its body, reuse it. This is run #5's exact case: the 500 came
#      back AFTER the record was created server-side.
#   3. It failed and no PR exists           -> create one with `gh pr create`,
#      retrying with growing waits (GitHub's guidance for 5xx responses).
#      Every retry re-checks the list FIRST, because our own 500'd create may
#      still have created the record - retry-then-create-blindly would
#      duplicate it.
#   4. An open PR from an earlier run exists -> case 2 finds and reuses it;
#      the branch force-push already updated its contents and the body is
#      refreshed to this run's summary.
#   5. The branch was never pushed (the action failed BEFORE its push), or
#      only a stale branch from an old run exists -> nothing safe to recover;
#      status=failed with the reason. Merging a stale branch as if it held
#      this month's data would be worse than failing.
#
# Freshness rule for case 5: the branch counts as "pushed by this run" only
# when its tip commit is dated at or after PR_WINDOW_START, a UTC timestamp
# the workflow records just before the create step. The commit is made on the
# same runner that recorded the timestamp, so the clocks agree; ISO-8601 UTC
# strings compare correctly as plain strings.
#
# Env (set by monthly-rebuild.yml):
#   PR_STEP_OUTCOME        outcome of the create step: success | failure
#   PR_NUMBER / PR_URL     the create step's outputs (set only on success)
#   PR_BRANCH / PR_BASE    monthly-rebuild / main
#   PR_TITLE               the PR title (also the future squash subject)
#   PR_BODY_PATH           scripts/monthly/.artifacts/pr-body.md
#   PR_WINDOW_START        UTC ISO timestamp recorded before the create step
#   GITHUB_REPOSITORY, GITHUB_OUTPUT, GH_TOKEN
#   RECOVERY_RETRY_DELAYS  (tests only) overrides the "0 20 40 60 90" waits
set -u

emit() { # emit <status> <pr-number> <pr-url> <reason>
  {
    echo "status=$1"
    echo "pr-number=$2"
    echo "pr-url=$3"
    echo "reason=$4"
  } >>"$GITHUB_OUTPUT"
  echo "Recovery result: status=$1${2:+ pr=#$2}${4:+ reason=$4}"
}

if [ "${PR_STEP_OUTCOME:-}" = "success" ]; then
  echo "create-pull-request succeeded (PR #${PR_NUMBER:-?}); nothing to recover."
  emit created "${PR_NUMBER:-}" "${PR_URL:-}" ""
  exit 0
fi

echo "::warning::create-pull-request did not succeed (outcome: ${PR_STEP_OUTCOME:-unknown}); attempting recovery."

# -- Did this run's push land? -----------------------------------------------
tip_date=$(gh api "repos/$GITHUB_REPOSITORY/branches/$PR_BRANCH" --jq '.commit.commit.committer.date' 2>/dev/null) || tip_date=""
if [ -z "$tip_date" ]; then
  emit failed "" "" "The $PR_BRANCH branch is not on origin: the push itself failed, so this month's data was never published. Nothing was merged and no data was lost - the scraped files are in this workflow run's artifacts. Re-run the Full Catalog Rebuild."
  exit 0
fi
if [ -n "${PR_WINDOW_START:-}" ] && [[ "$tip_date" < "$PR_WINDOW_START" ]]; then
  emit failed "" "" "The $PR_BRANCH branch on origin is stale (tip committed $tip_date, before this run's window $PR_WINDOW_START): this run's push did not land, so the branch does not hold this month's data. Nothing was merged and no data was lost - the scraped files are in this workflow run's artifacts. Re-run the Full Catalog Rebuild."
  exit 0
fi
echo "Branch $PR_BRANCH is on origin with a fresh tip ($tip_date): the push landed; only the PR record is in question."

# -- Find or create the PR, with growing waits -------------------------------
# 5 attempts with waits of 0/20/40/60/90s (about 3.5 minutes in total): long
# enough to ride out a transient 500 or a brief API wobble, short enough not
# to burn the job on a real outage - a real outage ends in the loud-failure
# path below, with the branch safely pushed for a manual PR.
read -r -a delays <<<"${RECOVERY_RETRY_DELAYS:-0 20 40 60 90}"
attempt=0
for delay in "${delays[@]}"; do
  attempt=$((attempt + 1))
  if [ "$delay" != "0" ]; then
    echo "Waiting ${delay}s before attempt $attempt..."
    sleep "$delay"
  fi

  found=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$PR_BRANCH" --base "$PR_BASE" --state open \
    --json number,url --jq 'if length > 0 then "\(.[0].number) \(.[0].url)" else empty end' 2>/dev/null) || found=""
  if [ -n "$found" ]; then
    number=${found%% *}
    url=${found#* }
    echo "Found open PR #$number for $PR_BRANCH."
    # Best-effort: make sure the PR carries THIS run's summary (a PR left over
    # from an earlier run holds that run's body). Never fatal - the auto-merge
    # cares about the number, not the body.
    if [ -f "${PR_BODY_PATH:-}" ]; then
      gh pr edit "$number" --repo "$GITHUB_REPOSITORY" --body-file "$PR_BODY_PATH" >/dev/null 2>&1 \
        || echo "::warning::Could not refresh the body of PR #$number; continuing with it as-is."
    fi
    emit recovered "$number" "$url" ""
    exit 0
  fi

  echo "No open PR for $PR_BRANCH; trying gh pr create (attempt $attempt)..."
  if create_out=$(gh pr create --repo "$GITHUB_REPOSITORY" --head "$PR_BRANCH" --base "$PR_BASE" \
    --title "$PR_TITLE" --body-file "$PR_BODY_PATH" 2>&1); then
    url=$(printf '%s\n' "$create_out" | grep -Eo 'https://[^ ]+/pull/[0-9]+' | head -1)
    number=${url##*/}
    if [ -n "$number" ]; then
      echo "Created PR #$number on retry."
      emit retried "$number" "$url" ""
      exit 0
    fi
    echo "gh pr create reported success but printed no PR URL; re-checking the list on the next attempt."
  else
    echo "gh pr create failed on attempt $attempt: $create_out"
  fi
done

emit failed "" "" "GitHub would not create or reveal a pull request for $PR_BRANCH after $attempt attempts. The branch holding this month's data IS pushed - open a pull request from it by hand (its squash subject must stay '$PR_TITLE' so the warmup fires), or re-run the Full Catalog Rebuild. No data was lost."
exit 0
