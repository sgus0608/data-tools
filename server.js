const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "BumperCar.html"));
});

const WIDTH = 760;
const HEIGHT = 760;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const ARENA_RADIUS = 315;
const CAR_RADIUS = 29;

const COLORS = [
  "#38bdf8", "#fb7185", "#facc15", "#4ade80",
  "#c084fc", "#fb923c", "#22d3ee", "#f472b6"
];

const players = {};
let round = 1;
let isGameRunning = false;
let lastUpdate = Date.now();

function safeNickname(nickname) {
  return String(nickname || "Player")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 12) || "Player";
}

function randomSpawn(index = 0) {
  const count = Math.max(2, Object.keys(players).length + 1);
  const angle = Math.PI * 2 * index / count;
  const radius = 165;
  return {
    x: CENTER.x + Math.cos(angle) * radius,
    y: CENTER.y + Math.sin(angle) * radius,
    angle: angle + Math.PI
  };
}

function createPlayer(socketId, nickname) {
  const count = Object.keys(players).length;
  const spawn = randomSpawn(count);

  return {
    id: socketId,
    nickname: safeNickname(nickname),
    color: COLORS[count % COLORS.length],
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: spawn.angle,
    angularVelocity: 0,
    radius: CAR_RADIUS,
    alive: true,
    score: 0,
    boost: 100,
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      boost: false,
      brake: false
    }
  };
}

function getAlivePlayers() {
  return Object.values(players).filter(player => player.alive);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function resetRound() {
  const ids = Object.keys(players);
  ids.forEach((id, index) => {
    const spawn = randomSpawn(index);
    const p = players[id];
    p.x = spawn.x;
    p.y = spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.angle = spawn.angle;
    p.angularVelocity = 0;
    p.alive = true;
    p.boost = 100;
  });

  round += 1;
  isGameRunning = ids.length >= 2;
}

function updatePlayer(p, dt) {
  if (!p.alive) return;

  const input = p.input;

  const fx = Math.cos(p.angle);
  const fy = Math.sin(p.angle);
  const rx = Math.cos(p.angle + Math.PI / 2);
  const ry = Math.sin(p.angle + Math.PI / 2);

  let forwardSpeed = p.vx * fx + p.vy * fy;
  let sideSpeed = p.vx * rx + p.vy * ry;

  let force = 0;
  if (input.up) force += 760;
  if (input.down) force -= 470;

  if (input.boost && input.up && p.boost > 0) {
    force += 980;
    p.boost = Math.max(0, p.boost - 42 * dt);
  } else {
    p.boost = Math.min(100, p.boost + 16 * dt);
  }

  p.vx += fx * force * dt;
  p.vy += fy * force * dt;

  forwardSpeed = p.vx * fx + p.vy * fy;
  sideSpeed = p.vx * rx + p.vy * ry;

  const absForwardSpeed = Math.abs(forwardSpeed);
  const speedFactor = clamp(absForwardSpeed / 230, 0.22, 1);
  const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (turn !== 0) {
    const direction = forwardSpeed >= -20 ? 1 : -1;
    p.angularVelocity += turn * direction * 5.6 * speedFactor * dt;
  }

  p.angle = normalizeAngle(p.angle + p.angularVelocity * dt);
  p.angularVelocity *= Math.pow(0.045, dt);

  const sideGrip = input.brake ? 0.78 : 0.9;
  const forwardGrip = input.brake ? 0.84 : 0.985;

  forwardSpeed *= Math.pow(forwardGrip, dt * 60);
  sideSpeed *= Math.pow(sideGrip, dt * 60);

  p.vx = fx * forwardSpeed + rx * sideSpeed;
  p.vy = fy * forwardSpeed + ry * sideSpeed;

  if (input.brake) {
    p.vx *= Math.pow(0.94, dt * 60);
    p.vy *= Math.pow(0.94, dt * 60);
  }

  const speed = Math.hypot(p.vx, p.vy);
  const maxSpeed = input.boost ? 500 : 390;

  if (speed > maxSpeed) {
    p.vx = p.vx / speed * maxSpeed;
    p.vy = p.vy / speed * maxSpeed;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const idleDrag = input.up || input.down ? 0.995 : 0.982;
  p.vx *= Math.pow(idleDrag, dt * 60);
  p.vy *= Math.pow(idleDrag, dt * 60);

  const distanceFromCenter = Math.hypot(p.x - CENTER.x, p.y - CENTER.y);
  if (distanceFromCenter > ARENA_RADIUS + p.radius * 0.7) {
    p.alive = false;
    p.vx = 0;
    p.vy = 0;
  }
}

function resolveCollisions() {
  const list = Object.values(players);

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a.alive || !b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (dist > 0 && dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        a.x -= nx * overlap * 0.52;
        a.y -= ny * overlap * 0.52;
        b.x += nx * overlap * 0.52;
        b.y += ny * overlap * 0.52;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const normalVelocity = rvx * nx + rvy * ny;

        if (normalVelocity < 0) {
          const restitution = 0.78;
          const impulse = -(1 + restitution) * normalVelocity / 2;
          const ix = impulse * nx;
          const iy = impulse * ny;

          a.vx -= ix;
          a.vy -= iy;
          b.vx += ix;
          b.vy += iy;

          const tx = -ny;
          const ty = nx;
          const sideImpact = (rvx * tx + rvy * ty) * 0.0018;
          a.angularVelocity -= sideImpact;
          b.angularVelocity += sideImpact;

          const pushPower = clamp(Math.abs(impulse) / 90, 0, 1);
          a.vx -= nx * 18 * pushPower;
          a.vy -= ny * 18 * pushPower;
          b.vx += nx * 18 * pushPower;
          b.vy += ny * 18 * pushPower;
        }
      }
    }
  }
}

function gameLoop() {
  const now = Date.now();
  const dt = Math.min((now - lastUpdate) / 1000, 0.033);
  lastUpdate = now;

  if (isGameRunning) {
    Object.values(players).forEach(p => updatePlayer(p, dt));

    for (let i = 0; i < 3; i++) {
      resolveCollisions();
    }

    const alive = getAlivePlayers();

    if (Object.keys(players).length >= 2 && alive.length <= 1) {
      if (alive[0]) alive[0].score += 1;

      io.emit("roundEnd", {
        winner: alive[0] ? alive[0].nickname : "DRAW"
      });

      isGameRunning = false;

      setTimeout(() => {
        if (Object.keys(players).length >= 2) {
          resetRound();
        }
      }, 2500);
    }
  }

  io.emit("state", {
    players,
    round,
    isGameRunning,
    aliveCount: getAlivePlayers().length
  });
}

setInterval(gameLoop, 1000 / 60);

io.on("connection", socket => {
  socket.on("join", nickname => {
    players[socket.id] = createPlayer(socket.id, nickname);

    if (Object.keys(players).length >= 2) {
      isGameRunning = true;
    }

    socket.emit("joined", { id: socket.id });
    io.emit("system", `${players[socket.id].nickname} joined`);
  });

  socket.on("input", input => {
    if (!players[socket.id]) return;

    players[socket.id].input = {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right,
      boost: !!input.boost,
      brake: !!input.brake
    };
  });

  socket.on("restart", () => {
    if (Object.keys(players).length >= 2) {
      resetRound();
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];

    if (Object.keys(players).length < 2) {
      isGameRunning = false;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
