require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  PermissionsBitField
} = require('discord.js');

const express = require('express');
const fs = require('fs');

/* ================= ENV ================= */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
  console.log("Missing TOKEN or CLIENT_ID");
}

/* ================= DISCORD CLIENT ================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= STORAGE ================= */
const dataFile = './rainbowData.json';
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '{}');

let rainbowData = JSON.parse(fs.readFileSync(dataFile));

const saveData = () =>
  fs.writeFileSync(dataFile, JSON.stringify(rainbowData, null, 2));

/* ============================================================
   🌈 ULTRA SMOOTH HSV RAINBOW
============================================================ */

function hsvToRgb(h, s, v) {
  let r, g, b;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  return [
    Math.floor(r * 255),
    Math.floor(g * 255),
    Math.floor(b * 255)
  ];
}

function getSmoothRainbow(step) {
  const hue = (step % 360) / 360;
  const [r, g, b] = hsvToRgb(hue, 1, 1);
  return (r << 16) | (g << 8) | b;
}

/* ============================================================
   ⚡ LOW API USAGE GLOBAL LOOP
============================================================ */

let globalStep = 0;

async function rainbowLoop() {
  globalStep++;

  for (const guildId in rainbowData) {
    for (const roleId in rainbowData[guildId]) {

      try {
        const guild = await client.guilds.fetch(guildId);
        const role = await guild.roles.fetch(roleId);
        if (!role || !role.editable) continue;

        const speed = rainbowData[guildId][roleId];
        if (globalStep % Math.floor(speed / 100) !== 0) continue;

        const color = getSmoothRainbow(globalStep);
        await role.setColor(color);

      } catch (err) {
        console.log("Loop error:", err.message);
      }
    }
  }
}

// Single loop instead of multiple intervals
setInterval(rainbowLoop, 100);

/* ============================================================
   🔥 SLASH COMMANDS
============================================================ */

const commands = [
  new SlashCommandBuilder()
    .setName('rainbow-start')
    .setDescription('Start rainbow effect')
    .addRoleOption(o =>
      o.setName('role')
        .setDescription('Role')
        .setRequired(true))
    .addIntegerOption(o =>
      o.setName('speed')
        .setDescription('Speed ms (min 500)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('rainbow-stop')
    .setDescription('Stop rainbow effect')
    .addRoleOption(o =>
      o.setName('role')
        .setDescription('Role')
        .setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Slash commands registered");
})();

/* ============================================================
   🎮 INTERACTION HANDLER
============================================================ */

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.reply({ content: "Need Manage Roles permission.", ephemeral: true });
  }

  const role = interaction.options.getRole('role');
  const speed = Math.max(interaction.options.getInteger('speed') || 1000, 500);

  if (!role.editable) {
    return interaction.reply({ content: "Role not editable.", ephemeral: true });
  }

  if (!rainbowData[interaction.guild.id])
    rainbowData[interaction.guild.id] = {};

  if (interaction.commandName === 'rainbow-start') {
    rainbowData[interaction.guild.id][role.id] = speed;
    saveData();
    return interaction.reply(`🌈 Rainbow started on ${role.name}`);
  }

  if (interaction.commandName === 'rainbow-stop') {
    delete rainbowData[interaction.guild.id][role.id];
    saveData();
    return interaction.reply(`🛑 Rainbow stopped on ${role.name}`);
  }
});

/* ============================================================
   🌐 FULL PUBLIC RAINBOW DASHBOARD
============================================================ */

const app = express();
app.use(express.json());

app.get('/', (_, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>🌈 Rainbow Dashboard</title>
  <style>
    body { font-family: Arial,sans-serif; background:#0f172a; color:white; padding:30px; }
    h1 { text-align:center; margin-bottom:30px; }
    .card { background:#1e293b; padding:20px; border-radius:12px; margin-bottom:20px; box-shadow:0 0 20px rgba(0,0,0,0.4); }
    button { background:#10b981; border:none; padding:6px 12px; border-radius:6px; color:white; cursor:pointer; font-weight:bold; }
    button.stop { background:#ef4444; }
    button:hover { opacity:0.9; }
    .guild-title { font-size:20px; margin-bottom:10px; color:#38bdf8; }
    .role-row { display:flex; align-items:center; justify-content:space-between; margin:6px 0; padding:6px; background:#334155; border-radius:6px; }
    .color-box { width:30px; height:20px; border-radius:4px; display:inline-block; margin-left:10px; }
    input[type="number"] { width:70px; padding:4px; border-radius:4px; border:none; margin-left:5px; }
  </style>
</head>
<body>

<h1>🌈 Rainbow Role Dashboard</h1>

<div id="content"></div>

<script>
async function loadData() {
  const res = await fetch('/api/data');
  const data = await res.json();

  const container = document.getElementById('content');
  container.innerHTML = '';

  if (Object.keys(data).length === 0) {
    container.innerHTML = "<p>No active rainbow roles.</p>";
    return;
  }

  for (const guildId in data) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML += '<div class="guild-title">Guild ID: ' + guildId + '</div>';

    for (const roleId in data[guildId]) {
      const speed = data[guildId][roleId];

      const row = document.createElement('div');
      row.className = 'role-row';
      row.innerHTML = \`
        <span>
          Role ID: \${roleId} 
          <input type="number" min="500" value="\${speed}" id="speed-\${guildId}-\${roleId}">ms
          <div class="color-box" id="color-\${guildId}-\${roleId}"></div>
        </span>
        <span>
          <button onclick="startRole('\${guildId}','\${roleId}')" >Start</button>
          <button class="stop" onclick="stopRole('\${guildId}','\${roleId}')">Stop</button>
        </span>
      \`;

      card.appendChild(row);
    }

    container.appendChild(card);
  }
}

// Start a rainbow role
async function startRole(guildId, roleId) {
  const speedInput = document.getElementById(\`speed-\${guildId}-\${roleId}\`);
  const speed = Math.max(parseInt(speedInput.value)||1000, 500);

  await fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, roleId, speed })
  });

  loadData();
}

// Stop a rainbow role
async function stopRole(guildId, roleId) {
  await fetch('/api/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, roleId })
  });

  loadData();
}

// Update color previews
async function updateColors() {
  const res = await fetch('/api/activeColors');
  const data = await res.json();
  for (const guildId in data) {
    for (const roleId in data[guildId]) {
      const colorBox = document.getElementById(\`color-\${guildId}-\${roleId}\`);
      if (colorBox) colorBox.style.background = '#' + data[guildId][roleId].toString(16).padStart(6,'0');
    }
  }
}

setInterval(() => { loadData(); updateColors(); }, 3000);
loadData();
updateColors();
</script>

</body>
</html>
  `);
});

/* ========= PUBLIC API ========= */

app.get('/api/data', (_, res) => res.json(rainbowData));

// Start rainbow role
app.post('/api/start', (req, res) => {
  const { guildId, roleId, speed } = req.body;

  if (!rainbowData[guildId]) rainbowData[guildId] = {};
  rainbowData[guildId][roleId] = speed;
  saveData();

  activeRoles.set(roleId, { guildId, speed, step: 0, lastColor: null });

  res.json({ success: true });
});

// Stop rainbow role
app.post('/api/stop', (req, res) => {
  const { guildId, roleId } = req.body;

  if (rainbowData[guildId]) {
    delete rainbowData[guildId][roleId];
    activeRoles.delete(roleId);
    saveData();
  }

  res.json({ success: true });
});

// Provide live color preview
app.get('/api/activeColors', (_, res) => {
  const colors = {};
  activeRoles.forEach((data, roleId) => {
    if (!colors[data.guildId]) colors[data.guildId] = {};
    colors[data.guildId][roleId] = data.lastColor || 0;
  });
  res.json(colors);
});

app.listen(PORT, () => console.log("🌐 Fully public rainbow dashboard running on port", PORT));

/* ============================================================
   LOGIN
============================================================ */

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(TOKEN);