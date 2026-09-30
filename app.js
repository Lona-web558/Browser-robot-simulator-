const canvas = document.getElementById('mazeCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const mazeSelect = document.getElementById('mazeSelect');
const algoSelect = document.getElementById('algoSelect');
const editToggle = document.getElementById('editToggle');
const deleteBtn = document.getElementById('deleteMaze');
const playBtn = document.getElementById('playBtn');
const stepBtn = document.getElementById('stepBtn');
const resetBtn = document.getElementById('resetBtn');
const speedEl = document.getElementById('speed');
const editorPanel = document.getElementById('editorPanel');
const newRowsEl = document.getElementById('newRows');
const newColsEl = document.getElementById('newCols');
const newGridBtn = document.getElementById('newGridBtn');
const placeStartBtn = document.getElementById('placeStart');
const placeGoalBtn = document.getElementById('placeGoal');
const mazeNameEl = document.getElementById('mazeName');
const saveMazeBtn = document.getElementById('saveMaze');
const editorMsg = document.getElementById('editorMsg');
const statStatus = document.getElementById('statStatus');
const statSteps = document.getElementById('statSteps');
const statVisited = document.getElementById('statVisited');
const statPath = document.getElementById('statPath');

const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // N, E, S, W
let cellSize = 24;

let maze = null;          // { id, name, grid, start, goal, rows, cols, builtin }
let editing = false;
let placing = null;       // 'start' | 'goal' | null

// Playback state
let explorationFrames = []; // cells highlighted while "thinking" (BFS only)
let pathFrames = [];        // { r, c, heading } robot moves through these
let frameIndex = -1;        // -1 = exploration not started; index into explorationFrames, then pathFrames
let visitedSet = new Set();
let playTimer = null;
let outcome = null;         // 'solved' | 'stuck' | null

function isOpen(grid, r, c) {
  return r >= 0 && r < grid.length && c >= 0 && c < grid[0].length && grid[r][c] === 0;
}

function bfsSolve(grid, start, goal) {
  const seen = new Set([start.join(',')]);
  const parent = new Map();
  const queue = [start];
  const visitedOrder = [];
  let reached = false;

  while (queue.length) {
    const cell = queue.shift();
    visitedOrder.push(cell);
    if (cell[0] === goal[0] && cell[1] === goal[1]) { reached = true; break; }
    for (const [dr, dc] of DIRS) {
      const nr = cell[0] + dr, nc = cell[1] + dc;
      const key = nr + ',' + nc;
      if (isOpen(grid, nr, nc) && !seen.has(key)) {
        seen.add(key);
        parent.set(key, cell);
        queue.push([nr, nc]);
      }
    }
  }

  let path = [];
  if (reached) {
    const startKey = start.join(',');
    let cur = goal;
    let curKey = cur.join(',');
    path.unshift(cur);
    while (curKey !== startKey) {
      cur = parent.get(curKey);
      curKey = cur.join(',');
      path.unshift(cur);
    }
  }

  return { visitedOrder, path, success: reached };
}

function wallFollowerSolve(grid, start, goal) {
  const maxSteps = grid.length * grid[0].length * 4;
  let heading = 1; // start facing East
  let pos = start.slice();
  const path = [{ r: pos[0], c: pos[1], heading }];
  let steps = 0;
  let success = pos[0] === goal[0] && pos[1] === goal[1];

  while (!success && steps < maxSteps) {
    const order = [(heading + 1) % 4, heading, (heading + 3) % 4, (heading + 2) % 4]; // right, front, left, back
    let moved = false;
    for (const h of order) {
      const [dr, dc] = DIRS[h];
      const nr = pos[0] + dr, nc = pos[1] + dc;
      if (isOpen(grid, nr, nc)) { heading = h; pos = [nr, nc]; moved = true; break; }
    }
    steps++;
    path.push({ r: pos[0], c: pos[1], heading });
    if (!moved) break; // fully boxed in
    success = pos[0] === goal[0] && pos[1] === goal[1];
  }

  return { path, success };
}

function resizeCanvas() {
  const maxW = canvas.parentElement.clientWidth || 560;
  cellSize = Math.max(10, Math.min(32, Math.floor(maxW / maze.grid[0].length)));
  canvas.width = maze.grid[0].length * cellSize;
  canvas.height = maze.grid.length * cellSize;
}

function cellAt(px, py) {
  return { r: Math.floor(py / cellSize), c: Math.floor(px / cellSize) };
}

function draw() {
  const grid = maze.grid;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      ctx.fillStyle = grid[r][c] === 1 ? '#1a242c' : '#182028';
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  visitedSet.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(61, 214, 208, .16)';
    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
  });

  if (frameIndex >= explorationFrames.length) {
    const pathSoFar = pathFrames.slice(0, frameIndex - explorationFrames.length + 1);
    ctx.fillStyle = 'rgba(232, 185, 49, .3)';
    pathSoFar.forEach(f => ctx.fillRect(f.c * cellSize, f.r * cellSize, cellSize, cellSize));
  }

  ctx.fillStyle = '#63d68e';
  ctx.fillRect(maze.start[1] * cellSize + 2, maze.start[0] * cellSize + 2, cellSize - 4, cellSize - 4);
  ctx.fillStyle = '#e8b931';
  ctx.fillRect(maze.goal[1] * cellSize + 2, maze.goal[0] * cellSize + 2, cellSize - 4, cellSize - 4);

  // Robot
  let robotR = maze.start[0], robotC = maze.start[1], robotHeading = 1;
  if (frameIndex >= explorationFrames.length && pathFrames.length) {
    const i = Math.min(frameIndex - explorationFrames.length, pathFrames.length - 1);
    if (i >= 0) { robotR = pathFrames[i].r; robotC = pathFrames[i].c; robotHeading = pathFrames[i].heading; }
  }
  drawRobot(robotR, robotC, robotHeading);

  if (editing && placing) {
    ctx.strokeStyle = placing === 'start' ? '#63d68e' : '#e8b931';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  }
}

function drawRobot(r, c, heading) {
  const cx = c * cellSize + cellSize / 2, cy = r * cellSize + cellSize / 2;
  const size = cellSize * 0.32;
  const angle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][heading]; // N,E,S,W
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = '#3dd6d0';
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, size * 0.7);
  ctx.lineTo(-size * 0.7, -size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function updateStats() {
  const total = explorationFrames.length + pathFrames.length;
  const played = Math.max(frameIndex + 1, 0);
  let statusText = 'Idle';
  if (outcome === 'solved') statusText = 'Solved';
  else if (outcome === 'stuck') statusText = 'Stuck — no path found';
  else if (played > 0 && played < total) statusText = frameIndex < explorationFrames.length ? 'Exploring' : 'Moving';
  else if (played > 0) statusText = 'Moving';

  statStatus.textContent = statusText;
  const pathPlayed = Math.max(0, Math.min(frameIndex - explorationFrames.length + 1, pathFrames.length));
  statSteps.textContent = pathPlayed;
  statVisited.textContent = visitedSet.size;
  statPath.textContent = outcome === 'solved' ? pathFrames.length : outcome === 'stuck' ? 'No path' : '–';
}

function computeAlgorithm() {
  const algo = algoSelect.value;
  if (algo === 'bfs') {
    const { visitedOrder, path, success } = bfsSolve(maze.grid, maze.start, maze.goal);
    explorationFrames = visitedOrder;
    pathFrames = success ? path.map(([r, c], i) => {
      const prev = path[i - 1];
      let heading = 1;
      if (prev) {
        if (r < prev[0]) heading = 0; else if (c > prev[1]) heading = 1; else if (r > prev[0]) heading = 2; else heading = 3;
      }
      return { r, c, heading };
    }) : [];
  } else {
    const { path } = wallFollowerSolve(maze.grid, maze.start, maze.goal);
    explorationFrames = [];
    pathFrames = path; // shown whether or not it reaches the goal; finishOutcome() reports success
  }
  frameIndex = -1;
  visitedSet = new Set();
  outcome = null;
  updateStats();
}

function stepForward() {
  const total = explorationFrames.length + pathFrames.length;
  if (frameIndex >= total - 1) {
    finishOutcome();
    return false;
  }
  frameIndex++;
  if (frameIndex < explorationFrames.length) {
    const [r, c] = explorationFrames[frameIndex];
    visitedSet.add(r + ',' + c);
  } else {
    const f = pathFrames[frameIndex - explorationFrames.length];
    visitedSet.add(f.r + ',' + f.c);
  }
  draw();
  updateStats();
  if (frameIndex >= total - 1) finishOutcome();
  return true;
}

function finishOutcome() {
  if (algoSelect.value === 'bfs') {
    outcome = pathFrames.length ? 'solved' : 'stuck';
  } else {
    const last = pathFrames[pathFrames.length - 1];
    outcome = last && last.r === maze.goal[0] && last.c === maze.goal[1] ? 'solved' : 'stuck';
  }
  stopPlaying();
  updateStats();
}

function stopPlaying() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  playBtn.textContent = 'Play';
}

function togglePlay() {
  if (playTimer) { stopPlaying(); return; }
  playBtn.textContent = 'Pause';
  playTimer = setInterval(() => { if (!stepForward()) stopPlaying(); }, 410 - Number(speedEl.value));
}

function resetPlayback() {
  stopPlaying();
  computeAlgorithm();
  draw();
}

async function loadMazeList(selectId) {
  const res = await fetch('/api/mazes');
  const list = await res.json();
  mazeSelect.replaceChildren(...list.map(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name + (m.builtin ? '' : ' (custom)');
    return opt;
  }));
  if (selectId && list.some(m => m.id === selectId)) mazeSelect.value = selectId;
  return list;
}

async function loadMaze(id) {
  statusEl.className = 'status';
  statusEl.textContent = 'Loading maze...';
  try {
    const res = await fetch('/api/mazes/' + id);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load maze.');
    maze = data;
    deleteBtn.classList.toggle('d-none', !!maze.builtin);
    resizeCanvas();
    resetPlayback();
    statusEl.textContent = `${maze.name} — ${maze.rows}×${maze.cols}. Press Play to run the ${algoSelect.options[algoSelect.selectedIndex].text.toLowerCase()}.`;
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = err.message;
  }
}

// --- Editor ---

function enterEdit() {
  editing = true;
  stopPlaying();
  editorPanel.classList.remove('d-none');
  editToggle.textContent = 'Exit editor';
  editToggle.classList.add('active-toggle');
  mazeNameEl.value = '';
  editorMsg.textContent = '';
  draw();
}

function exitEdit() {
  editing = false;
  placing = null;
  editorPanel.classList.add('d-none');
  editToggle.textContent = 'Edit maze';
  editToggle.classList.remove('active-toggle');
  draw();
}

function newBlankGrid() {
  const rows = Math.max(3, Math.min(40, Number(newRowsEl.value) || 12));
  const cols = Math.max(3, Math.min(40, Number(newColsEl.value) || 12));
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  maze = { id: null, name: '', grid, start: [0, 0], goal: [rows - 1, cols - 1], rows, cols, builtin: false };
  resizeCanvas();
  explorationFrames = []; pathFrames = []; frameIndex = -1; visitedSet = new Set(); outcome = null;
  updateStats();
  draw();
  editorMsg.textContent = '';
}

canvas.addEventListener('click', e => {
  if (!editing || !maze) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const { r, c } = cellAt((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
  if (r < 0 || r >= maze.grid.length || c < 0 || c >= maze.grid[0].length) return;

  if (placing === 'start') {
    if (maze.grid[r][c] === 1) { editorMsg.textContent = 'Start cannot be on a wall.'; editorMsg.className = 'small mt-2 text-danger'; return; }
    maze.start = [r, c]; placing = null; editorMsg.textContent = '';
  } else if (placing === 'goal') {
    if (maze.grid[r][c] === 1) { editorMsg.textContent = 'Goal cannot be on a wall.'; editorMsg.className = 'small mt-2 text-danger'; return; }
    maze.goal = [r, c]; placing = null; editorMsg.textContent = '';
  } else {
    if ((r === maze.start[0] && c === maze.start[1]) || (r === maze.goal[0] && c === maze.goal[1])) return;
    maze.grid[r][c] = maze.grid[r][c] === 1 ? 0 : 1;
  }
  draw();
});

placeStartBtn.addEventListener('click', () => { placing = placing === 'start' ? null : 'start'; draw(); });
placeGoalBtn.addEventListener('click', () => { placing = placing === 'goal' ? null : 'goal'; draw(); });
newGridBtn.addEventListener('click', newBlankGrid);

saveMazeBtn.addEventListener('click', async () => {
  const name = mazeNameEl.value.trim();
  if (!name) { editorMsg.textContent = 'Enter a name for the maze.'; editorMsg.className = 'small mt-2 text-danger'; return; }
  editorMsg.textContent = 'Saving...';
  editorMsg.className = 'small mt-2';
  try {
    const res = await fetch('/api/mazes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, grid: maze.grid, start: maze.start, goal: maze.goal })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save maze.');
    editorMsg.textContent = 'Saved.';
    editorMsg.className = 'small mt-2 text-success';
    await loadMazeList(data.id);
    exitEdit();
    await loadMaze(data.id);
  } catch (err) {
    editorMsg.textContent = err.message;
    editorMsg.className = 'small mt-2 text-danger';
  }
});

editToggle.addEventListener('click', () => (editing ? exitEdit() : enterEdit()));

deleteBtn.addEventListener('click', async () => {
  if (!maze || maze.builtin) return;
  if (!confirm(`Delete "${maze.name}"? This cannot be undone.`)) return;
  try {
    const res = await fetch('/api/mazes/' + maze.id, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not delete maze.');
    }
    const list = await loadMazeList();
    if (list.length) await loadMaze(list[0].id);
  } catch (err) {
    statusEl.className = 'status error';
    statusEl.textContent = err.message;
  }
});

mazeSelect.addEventListener('change', () => loadMaze(mazeSelect.value));
algoSelect.addEventListener('change', resetPlayback);
playBtn.addEventListener('click', togglePlay);
stepBtn.addEventListener('click', () => { stopPlaying(); stepForward(); });
resetBtn.addEventListener('click', resetPlayback);
window.addEventListener('resize', () => { if (maze) { resizeCanvas(); draw(); } });

(async function init() {
  const list = await loadMazeList();
  if (list.length) await loadMaze(list[0].id);
})();
