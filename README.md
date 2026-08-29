# Implaqubles Tactics Board

## Idea

Implaqubles Tactics Board is a lightweight rugby tactics tool for the Les Implacables 1993 team. It makes it possible to draw a play, position players, prepare lineouts and scrums, save several phases, and replay the movement smoothly.

The project is intentionally simple: it runs in a browser, stores plays locally, and does not require a database, account, build system, or external dependency.

## Features

- Create a play phase by phase
- Add attacking and defensive players
- Move players and the ball directly on the board
- Draw runs, carries, passes and kicks
- Add notes and highlighted areas
- Replay phases with smooth player and ball interpolation
- Use `Pitch In`, `Pitch Middle`, `Pitch Out` and `Lineout` board views
- Generate lineout and scrum starting positions
- Save locally in the browser
- Export and import a full JSON tactics file
- Share a play through a generated link
- Use the Les Implacables 1993 transparent badge

## Project structure

```text
index.html       Application entry point
app.js           Board interaction, playback and persistence logic
styles.css       User interface styling
setpiece-data.js Scrum setup data
badge-logo.png   Les Implacables 1993 logo
start-local.command macOS launcher
```

## Run locally

From the repository directory:

```bash
./start-local.command
```

Then open <http://localhost:8000> in a browser.

Alternatively:

```bash
python3 -m http.server 8000
```

Press `Ctrl+C` in the Terminal to stop the local server.

## Data and privacy

Plays are stored in the browser's local storage. Nothing is sent to a server by the application itself. Use the JSON export to keep a backup or move a play to another browser.

## Repository

This project is maintained as a private GitHub repository for the Les Implacables team.
