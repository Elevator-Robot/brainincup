# GM interface

There is no adventure banner. Day, Location, and Act are not shown as a strip
across the workspace; location lives in the Location context tab and Act/Chapter
are narrative metadata that never needed a permanent header. No build flag
re-enables it.

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
- Normal startup and data loading show no loading screens, skeletons, placeholder
  copy, or fake response bubbles. Panels are either absent or already showing real
  data; content that arrives late fades in place (reduced motion skips the fade).
  A compact recovery notice appears only after a startup error or an unusual
  delay; authentication and send-lock checks remain active.
