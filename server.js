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
const CAR_RADIUS = 27;

const COLORS = [
  "#38bdf8",
  "#fb7185",
  "#facc15",
  "#4ade80",
  "#c084fc",
  "#fb923c",
  "#22d3ee",
  "#f472b6"
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
  const count = Math.max(1, Object.keys(players).length || 1);
  const angle = (Math.PI * 2 * index) / count;
  const radius = 150 + Math.random() * 70;

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

function updatePlayer(player, dt) {
  if (!player.alive) return;

  const acceleration = 520;
  const reverseAcceleration = 330;
  const turnSpeed = 3.9;
  const brakeForce = 0.88;

  if (player.input.left) player.angle -= turnSpeed * dt;
  if (player.input.right) player.angle += turnSpeed * dt;

  let force = 0;

  if (player.input.up) force += acceleration;
  if (player.input.down) force -= reverseAcceleration;

  if (player.input.boost && player.boost > 0 && force > 0) {
    force += 760;
    player.boost = Math.max(0, player.boost - 55 * dt);
  } else {
    player.boost = Math.min(100, player.boost + 18 * dt);
  }

  player.vx += Math.cos(player.angle) * force * dt;
  player.vy += Math.sin(player.angle) * force * dt;

  if (player.input.brake) {
    player.vx *= brakeForce;
    player.vy *= brakeForce;
  }

  const speed = Math.hypot(player.vx, player.vy);
  const maxSpeed = 420;

  if (speed > maxSpeed) {
    player.vx = (player.vx / speed) * maxSpeed;
    player.vy = (player.vy / speed) * maxSpeed;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  player.vx *= 0.985;
  player.vy *= 0.985;

  const distanceFromCenter = Math.hypot(
    player.x - CENTER.x,
    player.y - CENTER.y
  );

  if (distanceFromCenter > ARENA_RADIUS + player.radius * 0.65) {
    player.alive = false;
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

        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velocityAlongNormal = rvx * nx + rvy * ny;

        if (velocityAlongNormal < 0) {
          const restitution = 0.94;
          const impulse = (-(1 + restitution) * velocityAlongNormal) / 2;

          const ix = impulse * nx;
          const iy = impulse * ny;

          a.vx -= ix;
          a.vy -= iy;
          b.vx += ix;
          b.vy += iy;
        }
      }
    }
  }
}

function resetRound() {
  const ids = Object.keys(players);

  ids.forEach((id, index) => {
    const spawn = randomSpawn(index);
    const player = players[id];

    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.angle = spawn.angle;
    player.alive = true;
    player.boost = 100;
  });

  round += 1;
  isGameRunning = ids.length >= 2;
}

function gameLoop() {
  const now = Date.now();
  const dt = Math.min((now - lastUpdate) / 1000, 0.033);
  lastUpdate = now;

  if (isGameRunning) {
    Object.values(players).forEach(player => updatePlayer(player, dt));
    resolveCollisions();

    const alive = getAlivePlayers();

    if (Object.keys(players).length >= 2 && alive.length <= 1) {
      if (alive[0]) {
        alive[0].score += 1;
      }

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

    socket.emit("joined", {
      id: socket.id
    });

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
