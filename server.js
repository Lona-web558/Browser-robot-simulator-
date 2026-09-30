const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname,  'mazes.json');
const MAX_DIMENSION = 40;

app.use(express.json({ limit: '512kb' }));

function loadMazes() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function saveMazes(mazes) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(mazes, null, 2));
}

function bfsReachable(grid, start, goal) {
  const rows = grid.length, cols = grid[0].length;
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const q = [start];
  seen[start[0]][start[1]] = true;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (q.length) {
    const [r, c] = q.shift();
    if (r === goal[0] && c === goal[1]) return true;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !seen[nr][nc] && grid[nr][nc] === 0) {
        seen[nr][nc] = true;
        q.push([nr, nc]);
      }
    }
  }
  return false;
}

function validateMaze(body) {
  const { name, grid, start, goal } = body || {};
  if (typeof name !== 'string' || !name.trim()) return 'Name is required.';
  if (!Array.isArray(grid) || grid.length < 3) return 'Grid must be an array with at least 3 rows.';
  const cols = grid[0].length;
  if (grid.length > MAX_DIMENSION || cols > MAX_DIMENSION) return `Grid must be at most ${MAX_DIMENSION}x${MAX_DIMENSION}.`;
  if (!grid.every(row => Array.isArray(row) && row.length === cols && row.every(v => v === 0 || v === 1))) {
    return 'Grid rows must be equal length and contain only 0 (open) or 1 (wall).';
  }
  const inBounds = ([r, c]) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < grid.length && c >= 0 && c < cols;
  if (!Array.isArray(start) || !inBounds(start)) return 'Start must be [row, col] within the grid.';
  if (!Array.isArray(goal) || !inBounds(goal)) return 'Goal must be [row, col] within the grid.';
  if (grid[start[0]][start[1]] === 1) return 'Start cell cannot be a wall.';
  if (grid[goal[0]][goal[1]] === 1) return 'Goal cell cannot be a wall.';
  if (!bfsReachable(grid, start, goal)) return 'Goal is not reachable from start with this wall layout.';
  return null;
}

app.get('/api/mazes', (req, res) => {
  try {
    const mazes = loadMazes();
    res.json(mazes.map(({ id, name, rows, cols, builtin }) => ({ id, name, rows, cols, builtin })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load maze list.' });
  }
});

app.get('/api/mazes/:id', (req, res) => {
  try {
    const maze = loadMazes().find(m => m.id === req.params.id);
    if (!maze) return res.status(404).json({ error: 'Maze not found.' });
    res.json(maze);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load maze.' });
  }
});

app.post('/api/mazes', (req, res) => {
  try {
    const error = validateMaze(req.body);
    if (error) return res.status(400).json({ error });

    const mazes = loadMazes();
    const slug = req.body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'maze';
    let id = slug, n = 1;
    while (mazes.some(m => m.id === id)) id = `${slug}-${++n}`;

    const maze = {
      id,
      name: req.body.name.trim(),
      grid: req.body.grid,
      start: req.body.start,
      goal: req.body.goal,
      rows: req.body.grid.length,
      cols: req.body.grid[0].length,
      builtin: false
    };
    mazes.push(maze);
    saveMazes(mazes);
    res.status(201).json(maze);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save maze.' });
  }
});

app.delete('/api/mazes/:id', (req, res) => {
  try {
    const mazes = loadMazes();
    const target = mazes.find(m => m.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Maze not found.' });
    if (target.builtin) return res.status(403).json({ error: 'Built-in mazes cannot be deleted.' });
    saveMazes(mazes.filter(m => m.id !== req.params.id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete maze.' });
  }
});

const PUBLIC_DIR = path.join(__dirname);
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => console.log(`Robot simulator running on http://localhost:${PORT}`));
