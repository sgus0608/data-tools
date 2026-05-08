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

const CAR_TYPES = {
  bugatti: {
    label: "Bugatti Style",
    color: "#38bdf8",
    accent: "#0f172a",
    maxSpeed: 405,
    boostSpeed: 535,
    acceleration: 1080,
    radius: 30,
    weight: 1.08,
    turnSmooth: 13
  },
  lamborghini: {
    label: "Lamborghini Style",
    color: "#facc15",
    accent: "#111827",
    maxSpeed: 430,
    boostSpeed: 560,
    acceleration: 1160,
    radius: 29,
    weight: 0.96,
    turnSmooth: 16
  },
  ferrari: {
    label: "Ferrari Style",
    color: "#ef4444",
    accent: "#f8fafc",
    maxSpeed: 415,
    boostSpeed: 545,
    acceleration: 1220,
    radius: 28,
    weight: 0.92,
    turnSmooth: 18
  },
  porsche: {
    label: "Porsche Style",
    color: "#fb923c",
    accent: "#020617",
    maxSpeed: 390,
    boostSpeed: 515,
    acceleration: 1120,
    radius: 28,
    weight: 1.0,
    turnSmooth: 17
  },
  suv: {
    label: "Heavy SUV",
    color: "#4ade80",
    accent: "#052e16",
    maxSpeed: 350,
    boostSpeed: 455,
    acceleration: 980,
    radius: 34,
    weight: 1.35,
    turnSmooth: 11
  }
};

const DEFAULT_CAR_TYPE = "bugatti";
const FALLBACK_COLORS = ["#38bdf8", "#fb7185", "#facc15", "#4ade80", "#c084fc", "#fb923c", "#22d3ee", "#f472b6"];

const players = {};
const chatHistory = [];

let round = 1;
let isGameRunning = false;
let lastUpdate = Date.now();

function safeText(value, maxLength = 80) {
  return String(value || "")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, maxLength);
}

function safeNickname(nickname) {
  return safeText(nickname, 12) || "Player";
}

function safeCarType(carType) {
  return CAR_TYPES[carType] ? carType : DEFAULT_CAR_TYPE;
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

function createPlayer(socketId, payload) {
  const nickname = typeof payload === "object" ? payload.nickname : payload;
  const selectedCarType = safeCarType(typeof payload === "object" ? payload.carType : DEFAULT_CAR_TYPE);
  const carSpec = CAR_TYPES[selectedCarType];

  const count = Object.keys(players).length;
  const spawn = randomSpawn(count);

  return {
    id: socketId,
    nickname: safeNickname(nickname),
    carType: selectedCarType,
    carLabel: carSpec.label,
    color: carSpec.color || FALLBACK_COLORS[count % FALLBACK_COLORS.length],
    accent: carSpec.accent,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: spawn.angle,
    targetAngle: spawn.angle,
    radius: carSpec.radius,
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

function lerpAngle(current, target, amount) {
  const diff = normalizeAngle(target - current);
  return normalizeAngle(current + diff * amount);
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
    p.targetAngle = spawn.angle;
    p.alive = true;
    p.boost = 100;
  });

  round += 1;
  isGameRunning = ids.length >= 2;
}

function updatePlayer(p, dt) {
  if (!p.alive) return;

  const spec = CAR_TYPES[p.carType] || CAR_TYPES[DEFAULT_CAR_TYPE];
  const input = p.input;

  let inputX = 0;
  let inputY = 0;

  if (input.left) inputX -= 1;
  if (input.right) inputX += 1;
  if (input.up) inputY -= 1;
  if (input.down) inputY += 1;

  const hasInput = inputX !== 0 || inputY !== 0;

  if (hasInput) {
    const inputLength = Math.hypot(inputX, inputY);
    inputX /= inputLength;
    inputY /= inputLength;

    const desiredAngle = Math.atan2(inputY, inputX);
    p.targetAngle = desiredAngle;

    const currentSpeed = Math.hypot(p.vx, p.vy);
    const speedRatio = clamp(currentSpeed / spec.maxSpeed, 0, 1);

    const steerResponse = spec.turnSmooth + speedRatio * 8;
    p.angle = lerpAngle(p.angle, desiredAngle, clamp(dt * steerResponse, 0, 1));

    const forwardX = Math.cos(p.angle);
    const forwardY = Math.sin(p.angle);

    const directControl = 0.72;
    const carControl = 0.28;

    const driveX = inputX * directControl + forwardX * carControl;
    const driveY = inputY * directControl + forwardY * carControl;

    const driveLength = Math.hypot(driveX, driveY) || 1;
    const finalDriveX = driveX / driveLength;
    const finalDriveY = driveY / driveLength;

    let acceleration = spec.acceleration;

    if (input.boost && p.boost > 0) {
      acceleration *= 1.42;
      p.boost = Math.max(0, p.boost - 45 * dt);
    } else {
      p.boost = Math.min(100, p.boost + 19 * dt);
    }

    p.vx += finalDriveX * acceleration * dt;
    p.vy += finalDriveY * acceleration * dt;
  } else {
    p.boost = Math.min(100, p.boost + 24 * dt);

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 18) {
      p.targetAngle = Math.atan2(p.vy, p.vx);
      p.angle = lerpAngle(p.angle, p.targetAngle, clamp(dt * 5.5, 0, 1));
    }
  }

  const speed = Math.hypot(p.vx, p.vy);
  const maxSpeed = input.boost ? spec.boostSpeed : spec.maxSpeed;

  if (speed > maxSpeed) {
    p.vx = p.vx / speed * maxSpeed;
    p.vy = p.vy / speed * maxSpeed;
  }

  const drag = input.brake ? 0.82 : hasInput ? 0.955 : 0.895;

  p.vx *= Math.pow(drag, dt * 60);
  p.vy *= Math.pow(drag, dt * 60);

  p.x += p.vx * dt;
  p.y += p.vy * dt;

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

        const aSpec = CAR_TYPES[a.carType] || CAR_TYPES[DEFAULT_CAR_TYPE];
        const bSpec = CAR_TYPES[b.carType] || CAR_TYPES[DEFAULT_CAR_TYPE];

        const totalWeight = aSpec.weight + bSpec.weight;
        const aMove = bSpec.weight / totalWeight;
        const bMove = aSpec.weight / totalWeight;

        a.x -= nx * overlap * aMove;
        a.y -= ny * overlap * aMove;
        b.x += nx * overlap * bMove;
        b.y += ny * overlap * bMove;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const normalVelocity = rvx * nx + rvy * ny;

        if (normalVelocity < 0) {
          const restitution = 0.83;
          const impulse = -(1 + restitution) * normalVelocity / (1 / aSpec.weight + 1 / bSpec.weight);

          const ix = impulse * nx;
          const iy = impulse * ny;

          a.vx -= ix / aSpec.weight;
          a.vy -= iy / aSpec.weight;
          b.vx += ix / bSpec.weight;
          b.vy += iy / bSpec.weight;

          const extraPush = clamp(Math.abs(impulse) / 125, 0, 1);

          a.vx -= nx * 22 * extraPush / aSpec.weight;
          a.vy -= ny * 22 * extraPush / aSpec.weight;
          b.vx += nx * 22 * extraPush / bSpec.weight;
          b.vy += ny * 22 * extraPush / bSpec.weight;
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
  socket.on("join", payload => {
    players[socket.id] = createPlayer(socket.id, payload);

    if (Object.keys(players).length >= 2) {
      isGameRunning = true;
    }

    socket.emit("joined", {
      id: socket.id,
      chatHistory
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

  socket.on("chat", message => {
    const player = players[socket.id];
    if (!player) return;

    const cleanMessage = safeText(message, 80);
    if (!cleanMessage) return;

    const chat = {
      nickname: player.nickname,
      color: player.color,
      message: cleanMessage,
      time: Date.now()
    };

    chatHistory.push(chat);
    if (chatHistory.length > 30) chatHistory.shift();

    io.emit("chat", chat);
  });

  socket.on("restart", () => {
    if (Object.keys(players).length >= 2) resetRound();
  });

  socket.on("disconnect", () => {
    const nickname = players[socket.id]?.nickname;
    delete players[socket.id];

    if (nickname) io.emit("system", `${nickname} left`);
    if (Object.keys(players).length < 2) isGameRunning = false;
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
