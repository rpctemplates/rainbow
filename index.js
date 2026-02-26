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
   💎 WEB DASHBOARD
============================================================ */

const app = express();
app.use(express.json());

app.get('/', (_, res) => {
  res.send(`
    <h1>🌈 Rainbow Dashboard</h1>
    <pre>${JSON.stringify(rainbowData, null, 2)}</pre>
  `);
});

app.post('/stop', (req, res) => {
  const { guildId, roleId } = req.body;
  if (rainbowData[guildId]) {
    delete rainbowData[guildId][roleId];
    saveData();
  }
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("Dashboard running on port", PORT);
});

/* ============================================================
   LOGIN
============================================================ */

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(TOKEN);