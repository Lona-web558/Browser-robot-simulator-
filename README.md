# Browser Robot Simulator

A canvas-based maze robot that solves grids two different ways, plus a built-in maze editor.

**Stack:** HTML5 Canvas, CSS3, Bootstrap 5, JavaScript, Node.js, Express.js

## Features

- **Two algorithms**, selectable per run:
  - **Shortest path (BFS)** — explores the grid breadth-first, then the robot walks the guaranteed shortest route.
  - **Right-hand wall follower** — a robot with a heading (N/E/S/W) that always tries to turn right first, then straight, then left, then back. No global map, just local wall-sensing — closer to how a real bump-sensor robot behaves.
- **Playback controls:** Play, Pause, Step (one move at a time), Reset, and a speed slider.
- **Three built-in mazes:** Open Field, Serpentine, and Spiral — all verified solvable server-side.
- **Maze editor:** create a blank grid of any size, click cells to toggle walls, place start/goal, and save. Saved mazes are validated on the server (rectangular grid, in-bounds start/goal, and a solvability check via BFS) before being written to disk.
- **Delete** for any custom maze (built-in mazes are protected).

## A worthwhile quirk: the Spiral maze

Try Spiral with the wall-follower algorithm. It won't reach the goal — it hits the step cap and reports "Stuck." This isn't a bug: the right-hand rule is only *guaranteed* to solve mazes where every wall connects back to the outer boundary. The spiral's inner walls are islands, so the robot circles forever without a global map. Switch to BFS on the same maze and it solves it instantly. This is a genuine, well-documented limitation of wall-following algorithms and a good talking point if you're presenting this.

## Project structure

```
robot-simulator/
├── server.js          Express server: maze CRUD + server-side solvability validation
├── package.json
├── data/
│   └── mazes.json      Maze storage — built-in mazes plus any you save from the editor
└── public/
    ├── index.html      Page markup
    ├── style.css        Styles
    └── app.js           Canvas rendering, BFS + wall-follower algorithms, editor, playback
```

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/mazes` | List maze summaries (id, name, size, built-in flag) |
| GET | `/api/mazes/:id` | Full maze: grid, start, goal |
| POST | `/api/mazes` | Save a new maze — body: `{ name, grid, start, goal }` |
| DELETE | `/api/mazes/:id` | Delete a custom maze (built-in mazes return 403) |

Grid format: a 2D array of `0` (open) and `1` (wall). `start` and `goal` are `[row, col]`.

The server rejects a POST if the grid isn't rectangular, start/goal are out of bounds or on a wall, or the goal isn't reachable from the start.

## A note on persistence

`data/mazes.json` is a plain file on disk. On Render's free tier the filesystem is ephemeral — a redeploy or restart will reset any custom mazes you've saved back to just the three built-in ones. For anything you want to keep long-term, save the maze JSON locally as a backup, or swap in a small database if this becomes a real feature.

## Customise

- **Built-in mazes:** edit `data/mazes.json` directly, or regenerate with your own layout.
- **Wall-follower starting heading:** it starts facing East; change the `heading = 1` line in `wallFollowerSolve` in `public/app.js`.
- **Max grid size for saved mazes:** `MAX_DIMENSION` in `server.js` (default 40×40).

## Deploy to Render

1. Push the project to a GitHub repository.
2. Create a new **Web Service** on Render and connect the repository.
3. Set these options:
   - **Root directory:** the folder containing `server.js` and `package.json`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Deploy. Render sets the `PORT` variable automatically.

## Troubleshooting

- **Blank page or "Cannot GET /":** check that `index.html`, `style.css` and `app.js` are inside a `public/` folder next to `server.js`.
- **"Goal is not reachable" when saving:** the walls you drew cut off the goal. Toggle a wall open to reconnect it.
- **Custom mazes disappear after a while:** expected on Render's free tier — see "A note on persistence" above.

## Ideas for next steps

- A third algorithm: A* with a visualized heuristic
- Multiple robots racing the same maze side by side
- Export/import mazes as shareable JSON files
