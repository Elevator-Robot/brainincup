# GM interface

The optional Location/Act banner is **hidden by default**. Day has been removed.
To enable the banner for a local build, set this in `.env.local` and restart Vite:

```dotenv
VITE_GM_BANNER_HEADERS=true
```

Set the same build-time variable for a deployed frontend to enable it there.
Remove it or set it to `false` to hide the banner. The shared setting lives in
`src/config/gameMasterUi.ts`.

Even when enabled, the banner renders only real fields. No location means no
Location label; no recognized act means no Act label. Chapter is shown only when
a positive integer is present. If nothing is available, the entire banner is
absent—there is no placeholder Act I or Chapter 1.

## Local interaction preview

```sh
VITE_ENABLE_TESTMODE_AUTH=true npx vite --host 127.0.0.1
```

Open `/?testmode=true&preview=gm`. Create a character in the context panel, then
try the composer shortcuts and Character/Quests/Location/Timeline tabs. The
preview uses local sample data and never calls the backend. On mobile, Character
opens the context drawer. Quick actions fill the draft; they never auto-send.

## Interaction and motion

- Character setup previews the chosen portrait, name, race/class, and calculated
  starting attributes. Portraits use small WebP thumbnails.
- Quests and Location are reachable context tabs, with keyboard arrow navigation.
  Quest summaries use the adventure's persisted ActiveQuest records.
- Tab changes use a brief directional slide, fade, and soft-focus reveal. Tabs
  stay fixed and each new panel starts at the top. Reduced motion disables it.
- Typewriter text and arrival trails apply only to **new assistant chat replies**,
  not user messages, historical messages, labels, menus, dialogs, or stats.
- Normal startup and data loading have no dedicated loading screens, skeletons,
  or fake response bubbles. The interface stays in place while content arrives.
  A compact recovery notice appears only after a startup error or an unusual
  delay; authentication and send-lock checks remain active.
