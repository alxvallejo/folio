# Build your own daily report

Folio can open a short summary of yesterday's work, ready to read aloud at standup. A small script collects what you did, Claude writes it up as a few bullets, and Folio opens the result when you choose **File › Daily Report** (⇧⌘R).

Folio ships a starter script. Setting it up takes about five minutes.

## What you need

- [Claude Code](https://claude.com/claude-code), installed and signed in. The script uses it to write the summary, on your Claude subscription, so there's no API key to set up.
- `jq`, which reads Claude Code's session files. Recent versions of macOS include it. If `jq --version` says it's missing, run `brew install jq`.
- Git repos you commit to.

## How the starter works

It's one shell script and one prompt, and it does four things:

1. **Picks the days.** Yesterday, or Friday through Sunday on a Monday.
2. **Collects your activity.** Your commits in every git repo under the folders you name, and what you asked Claude Code in each session in that time. Commits that reached the main branch are marked, so finished work reads as finished. This step is plain shell, with no AI involved.
3. **Has Claude write it up.** The activity goes to Claude Code with the instructions in [prompt.md](daily-report/prompt.md): short bullets grouped by client, one per ticket, each starting with the ticket number from your commit messages, and a few words on what's next.
4. **Saves it.** One Markdown file per day in Documents › Folio › Reports. Reports older than a week are deleted, so it stays a rolling log rather than an archive.

The activity is sent to Claude the same way a Claude Code session is. Nothing else leaves your Mac.

## 1. Copy the starter

In Terminal:

```sh
cp -R /Applications/Folio.app/Contents/Resources/guides/daily-report ~/daily-report
chmod +x ~/daily-report/daily-report
```

If Folio isn't in Applications, change the first path to wherever it is. You can also [show the script in Finder](daily-report/daily-report) and read it first; it's commented step by step.

## 2. Tell it where your code is

The script looks for git repos in `~/Sites`. If yours are somewhere else, create `~/.config/daily-report/config` with a line like this:

```sh
REPO_ROOTS="$HOME/Code $HOME/Work"   # folders to search, separated by spaces
```

The same file takes these too:

| Setting | Default | What it does |
| --- | --- | --- |
| `REPORTS_DIR` | `~/Documents/Folio/Reports` | Where reports are saved |
| `KEEP_DAYS` | `7` | Deletes older reports; `0` keeps them all |
| `AUTHOR` | your git name and email | Whose commits count: every name or email you commit under, separated by commas |
| `MODEL` | `sonnet` | The model that writes the report; `opus` follows the prompt more closely and takes a few seconds longer |

## 3. Try it in Terminal

```sh
~/daily-report/daily-report --digest   # what it collected; nothing is sent to Claude
~/daily-report/daily-report --print    # the report, printed instead of saved
```

Run `--digest` once before anything else. Session transcripts can hold client names, links and other details, and this shows exactly what would be sent.

If commits are missing, you may commit under more than one name or email, such as a work identity. Run `git log --format='%an <%ae>' | sort -u` in a repo to see them, and list each one in `AUTHOR`, like `AUTHOR="Jo Smith, jo@work.com"`.

## 4. Run it from Folio

Open Settings (⌘,) and set **Report command** to:

```sh
~/daily-report/daily-report
```

Now choose **File › Daily Report** (⇧⌘R). Folio runs the script, which takes about ten seconds, and opens the report. If the report for that day is already saved, it opens straight away. To write it again, run `~/daily-report/daily-report --force` in Terminal.

To see all your reports in the sidebar, open the Documents › Folio folder (⇧⌘O). Reports sits next to Posts.

## Make it yours

- **Change the wording.** Copy [prompt.md](daily-report/prompt.md) to `~/.config/daily-report/prompt.md` and edit that copy. The script uses it when it exists. Try a different grouping, a `## Blockers` section, or a longer write-up for a weekly email. Run `--print` after each change until you like it.
- **Cover a week.** `~/daily-report/daily-report 2026-10-19 2026-10-23` writes one report for a range of days.
- **Add sources.** Anything you can print as text can go into step 2 of the script: calendar events, closed tickets, a time tracker export. Claude folds it in.
- **Use your own script.** Folio runs the report command in your login shell and opens the Markdown file whose path the command prints on its last line. Any script that does that works, in any language.
