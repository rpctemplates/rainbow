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
   🌐 PUBLIC ADVANCED DASHBOARD
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
    body {
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: white;
      padding: 30px;
    }

    h1 {
      text-align: center;
      margin-bottom: 30px;
    }

    .card {
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 0 20px rgba(0,0,0,0.4);
    }

    button {
      background: #ef4444;
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font-weight: bold;
    }

    button:hover {
      background: #dc2626;
    }

    .guild-title {
      font-size: 20px;
      margin-bottom: 10px;
      color: #38bdf8;
    }

    .role-row {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      padding: 6px;
      background: #334155;
      border-radius: 6px;
    }
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
        <span>Role ID: \${roleId} (Speed: \${speed}ms)</span>
        <button onclick="stopRole('\${guildId}','\${roleId}')">Stop</button>
      \`;

      card.appendChild(row);
    }

    container.appendChild(card);
  }
}

async function stopRole(guildId, roleId) {
  await fetch('/api/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId, roleId })
  });

  loadData();
}

// Auto-refresh every 5 seconds
setInterval(loadData, 5000);
loadData();
</script>

</body>
</html>
  `);
});

/* ========= API ========= */

// Public API: anyone can access
app.get('/api/data', (_, res) => {
  res.json(rainbowData);
});

app.post('/api/stop', (req, res) => {
  const { guildId, roleId } = req.body;

  if (rainbowData[guildId]) {
    delete rainbowData[guildId][roleId];
    activeRoles.delete(roleId);
    saveData();
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("🌐 Public dashboard running on port", PORT);
});

/* ============================================================
   LOGIN
============================================================ */

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(TOKEN);