# reports

One file per played game, written by the DM bot when the game ends (`server/report.ts`, read by Haiku from the host's log):
what players said to the DM and what the game did around it, with the state of the game each time, ranked into findings and
a prompt for the next Claude session to act on. Start a session from the newest file here: take its findings in order,
reproduce each, fix, add a test, run `npm run verify`.

- `reports/raw/` holds the raw log (`*.jsonl`) and is not committed.
- Players are P1, P2...; links, emails and long numbers are cut. **Read a report before committing it**: it quotes what players typed.
- Delete a report once its findings are fixed or judged not worth fixing; the git history keeps it.
