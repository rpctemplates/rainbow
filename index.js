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
const knownRoles = {}; // store all roles we've seen

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
   ⚡ OPTIMIZED GLOBAL LOOP (NO FETCH SPAM)
============================================================ */

let globalStep = 0;

setInterval(() => {
  globalStep++;

  for (const guildId in rainbowData) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    for (const roleId in rainbowData[guildId]) {
      const role = guild.roles.cache.get(roleId);
      if (!role || !role.editable) continue;

      const speed = Math.max(rainbowData[guildId][roleId], 500);
      const interval = Math.max(Math.floor(speed / 200), 1);

      if (globalStep % interval !== 0) continue;

      const color = getSmoothRainbow(globalStep);

      if (role.color === color) continue;

      role.setColor(color).catch(() => {});

      activeRoles.set(roleId, {
        guildId,
        speed,
        step: globalStep,
        lastColor: color
      });
    }
  }
}, 200);

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

  if (!knownRoles[interaction.guild.id]) knownRoles[interaction.guild.id] = {};
  knownRoles[interaction.guild.id][role.id] = { name: role.name, lastSpeed: speed };

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
   🌐 DASHBOARD SERVER
============================================================ */

const app = express();
app.use(express.json());

app.get('/api/data', (_, res) => {
  const dataWithStopped = {};
  for (const guildId in knownRoles) {
    dataWithStopped[guildId] = {};
    for (const roleId in knownRoles[guildId]) {
      dataWithStopped[guildId][roleId] =
        rainbowData[guildId]?.[roleId] ||
        knownRoles[guildId][roleId]?.lastSpeed ||
        0;
    }
  }
  res.json(dataWithStopped);
});

app.post('/api/start', (req, res) => {
  const { guildId, roleId, speed } = req.body;
  if (!rainbowData[guildId]) rainbowData[guildId] = {};
  const actualSpeed = Math.max(speed || 1000, 500);
  rainbowData[guildId][roleId] = actualSpeed;

  saveData();
  res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
  const { guildId, roleId } = req.body;
  if (rainbowData[guildId]) delete rainbowData[guildId][roleId];
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

app.listen(PORT, () =>
  console.log("🌐 Rainbow dashboard running on port", PORT)
);

/* ============================================================
   LOGIN
============================================================ */

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
