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
const activeRoles = new Map(); // live roles for dashboard preview

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

        // update activeRoles for dashboard preview
        activeRoles.set(roleId, { guildId, speed, step: globalStep, lastColor: color });

      } catch (err) {
        console.log("Loop error:", err.message);
      }
    }
  }
}

// Single loop interval
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
    activeRoles.set(role.id, { guildId: interaction.guild.id, speed, step: 0, lastColor: null });
    return interaction.reply(`🌈 Rainbow started on ${role.name}`);
  }

  if (interaction.commandName === 'rainbow-stop') {
    delete rainbowData[interaction.guild.id][role.id];
    activeRoles.delete(role.id);
    saveData();
    return interaction.reply(`🛑 Rainbow stopped on ${role.name}`);
  }
});

/* ============================================================
   🌐 FULL PUBLIC RAINBOW DASHBOARD
============================================================ */

const app = express();
app.use(express.json());

app.get('/', async (_, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🌈 Rainbow Dashboard</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

  body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f1f5f9; margin:0; padding:0; }
  header { text-align:center; padding:40px 20px; background: linear-gradient(90deg, #fbbf24, #10b981, #3b82f6); color: #0f172a; font-size:2rem; font-weight:700; letter-spacing:1px; }
  main { max-width:1200px; margin:30px auto; padding:0 20px; display:grid; grid-template-columns: repeat(auto-fill,minmax(320px,1fr)); gap:20px; }
  .guild-card { background:#1e293b; border-radius:12px; padding:20px; box-shadow:0 8px 20px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
  .guild-title { font-size:1.2rem; font-weight:600; margin-bottom:15px; color:#38bdf8; word-break:break-word; }
  .role-row { display:flex; align-items:center; justify-content:space-between; background:#334155; margin-bottom:10px; padding:10px 12px; border-radius:8px; transition: background 0.2s ease; }
  .role-row:hover { background:#475569; }
  .role-info { display:flex; align-items:center; gap:10px; }
  .color-box { width:30px; height:20px; border-radius:4px; border:1px solid #0f172a; }
  input[type="number"] { width:80px; padding:4px 6px; border-radius:6px; border:none; font-weight:600; }
  button { border:none; border-radius:6px; padding:6px 14px; font-weight:600; cursor:pointer; transition:opacity 0.2s ease; }
  button.start { background:#10b981; color:white; }
  button.stop { background:#ef4444; color:white; }
  button:hover { opacity:0.85; }
  @media (max-width:640px){ main{ grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>🌈 Rainbow Role Dashboard</header>
<main id="dashboard">Loading...</main>
<script>
async function fetchData() {
  const res = await fetch('/api/data');
  const data = await res.json();
  const container = document.getElementById('dashboard');
  container.innerHTML = '';
  if (!Object.keys(data).length) { container.innerHTML = '<p style="text-align:center; width:100%;">No active rainbow roles.</p>'; return; }

  for (const guildId in data) {
    const card = document.createElement('div'); card.className='guild-card';
    const title = document.createElement('div'); title.className='guild-title'; title.textContent='Guild ID: '+guildId;
    card.appendChild(title);

    for (const roleId in data[guildId]) {
      const row = document.createElement('div'); row.className='role-row';
      row.innerHTML = \`
        <div class="role-info">
          <div id="name-\${guildId}-\${roleId}">Role ID: \${roleId}</div>
          <input type="number" min="500" value="\${data[guildId][roleId]}" id="speed-\${guildId}-\${roleId}"> ms
          <div class="color-box" id="color-\${guildId}-\${roleId}"></div>
        </div>
        <div>
          <button class="start" onclick="startRole('\${guildId}','\${roleId}')">Start</button>
          <button class="stop" onclick="stopRole('\${guildId}','\${roleId}')">Stop</button>
        </div>
      \`;
      card.appendChild(row);

      fetch('/api/roleName?guildId=' + guildId + '&roleId=' + roleId)
        .then(r => r.json()).then(j => {
          const nameEl = document.getElementById('name-' + guildId + '-' + roleId);
          if (j.name) nameEl.textContent = j.name;
        });
    }
    container.appendChild(card);
  }
}

async function startRole(guildId, roleId) {
  const speed = parseInt(document.getElementById(\`speed-\${guildId}-\${roleId}\`).value)||1000;
  await fetch('/api/start',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({guildId,roleId,speed}) });
  fetchData();
}

async function stopRole(guildId, roleId) {
  await fetch('/api/stop',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({guildId,roleId}) });
  fetchData();
}

async function updateColors() {
  const res = await fetch('/api/activeColors');
  const data = await res.json();
  for(const guildId in data){
    for(const roleId in data[guildId]){
      const box=document.getElementById(\`color-\${guildId}-\${roleId}\`);
      if(box) box.style.background='#'+data[guildId][roleId].toString(16).padStart(6,'0');
    }
  }
}

setInterval(()=>{fetchData();updateColors();},3000);
fetchData();updateColors();
</script>
</body>
</html>
  `);
});

// API for live role names
app.get('/api/roleName', async (req, res) => {
  try {
    const guild = await client.guilds.fetch(req.query.guildId);
    const role = await guild.roles.fetch(req.query.roleId);
    res.json({ name: role ? role.name : null });
  } catch {
    res.json({ name: null });
  }
});

/* ========= PUBLIC API ========= */
app.get('/api/data', (_, res) => res.json(rainbowData));

app.post('/api/start', (req, res) => {
  const { guildId, roleId, speed } = req.body;
  if (!rainbowData[guildId]) rainbowData[guildId] = {};
  rainbowData[guildId][roleId] = speed;
  saveData();
  activeRoles.set(roleId, { guildId, speed, step: 0, lastColor: null });
  res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
  const { guildId, roleId } = req.body;
  if (rainbowData[guildId]) delete rainbowData[guildId][roleId];
  activeRoles.delete(roleId);
  saveData();
  res.json({ success: true });
});

app.get('/api/activeColors', (_, res) => {
  const colors = {};
  activeRoles.forEach((data, roleId) => {
    if (!colors[data.guildId]) colors[data.guildId] = {};
    colors[data.guildId][roleId] = data.lastColor || 0;
  });
  res.json(colors);
});

app.listen(PORT, () => console.log("🌐 Rainbow dashboard running on port", PORT));

/* ============================================================
   LOGIN
============================================================ */

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(TOKEN);