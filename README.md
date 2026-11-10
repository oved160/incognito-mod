# incognito

A mod for Claude Code Desktop. One command hides your project names while you
screen-share: it swaps every session title for **Chat N** and every sidebar
group name for **Group N**, and puts the real names back when you run it again.

```
/incognito          toggle on / off
/incognito on       turn on (run again to sweep any session it missed)
/incognito off      restore all real names
/incognito status   show whether it is on
```

While it is on, the status line shows `incognito ON`.

## Install

At the prompt of a terminal session:

```
/plugin install incognito --marketplace oved160/incognito-mod
```

From a shell:

```
claude plugin install incognito --marketplace oved160/incognito-mod
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt
box, then **Plugins**, **Add marketplace** with `oved160/incognito-mod`, then
**Add plugin**.

## How it works

The mod calls the app's own session and sidebar tools to rename sessions and
groups. Before it renames anything it saves your real names in the mod's local
store (on your machine only) so `/incognito off` can restore them. Nothing is
sent anywhere.

## Limits

- It changes **names only**. The working folder of a session is not hidden, so
  anything that shows a folder path is not masked.
- Project names inside the conversation text are not masked.
- Sessions you create while it is on keep their real names until you run
  `/incognito on` again.
- Renaming a session whose title you set yourself can need an approval in some
  permission modes. If the reply reports failures, run `/incognito on` again to
  retry, or approve the rename prompts.
- If you rename a session or group by hand while incognito is on, `/incognito off`
  restores the name that was saved, not your newer one.

## License

MIT
