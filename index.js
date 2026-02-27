require('dotenv').config();
const fs = require('fs');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  PermissionsBitField,
} = require('discord.js');

/* ================= ENV ================= */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID');
  process.exit(1);
}

/* ================= DISCORD CLIENT ================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================= STORAGE ================= */
const DATA_FILE = './rainbowData.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');

const rainbowRoles = new Map(); // roleId => { speed, hueOffset, interval, lastColor }
const knownRoles = new Map();

// Load saved data
const rawData = JSON.parse(fs.readFileSync(DATA_FILE));
for (const roleId in rawData) {
  const { speed = 1000, hueOffset = 0 } = rawData[roleId];
  rainbowRoles.set(roleId, { speed, hueOffset, interval: null, lastColor: 0 });
  knownRoles.set(roleId, { name: rawData[roleId].name || 'Role', lastSpeed: speed });
}

const saveData = () => {
  const obj = {};
  rainbowRoles.forEach((data, roleId) => {
    obj[roleId] = { name: knownRoles.get(roleId)?.name || 'Role', speed: data.speed, hueOffset: data.hueOffset };
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
};

/* ================= COLOR UTILITIES ================= */
const hsvToRgb = (h, s, v) => {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  return (Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255);
};

/* ================= ROLE COLOR LOOP ================= */
const startRainbowRole = (guild, roleId) => {
  const roleData = rainbowRoles.get(roleId);
  if (!roleData || roleData.interval) return;

  let step = roleData.hueOffset;

  roleData.interval = setInterval(async () => {
    const role = guild.roles.cache.get(roleId);
    if (!role || !role.editable) return;

    const color = hsvToRgb((step % 360) / 360, 1, 1);
    if (role.color !== color) {
      try {
        await role.setColor(color);
        roleData.lastColor = color;
      } catch {
        // ignore rate limit / API errors
      }
    }
    step++;
  }, Math.max(roleData.speed / 360, 50)); // Spread full hue over speed, min 50ms tick
};

const stopRainbowRole = (roleId) => {
  const roleData = rainbowRoles.get(roleId);
  if (roleData?.interval) clearInterval(roleData.interval);
  if (roleData) roleData.interval = null;
};

/* ================= SLASH COMMANDS ================= */
const commands = [
  new SlashCommandBuilder()
    .setName('rainbow-start')
    .setDescription('Start rainbow effect on a role')
    .addRoleOption((o) => o.setName('role').setDescription('Target role').setRequired(true))
    .addIntegerOption((o) => o.setName('speed').setDescription('Speed in ms (min 50)').setRequired(false))
    .addIntegerOption((o) => o.setName('hueOffset').setDescription('Hue offset (0–360)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rainbow-stop')
    .setDescription('Stop rainbow effect on a role')
    .addRoleOption((o) => o.setName('role').setDescription('Target role').setRequired(true)),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
})();

/* ================= INTERACTIONS ================= */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.reply({ content: '❌ Need Manage Roles permission.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');
  if (!role.editable) return interaction.reply({ content: '❌ Role not editable.', ephemeral: true });

  if (interaction.commandName === 'rainbow-start') {
    const speed = Math.max(interaction.options.getInteger('speed') || 1000, 50);
    const hueOffset = interaction.options.getInteger('hueOffset') || 0;

    rainbowRoles.set(role.id, { speed, hueOffset, interval: null, lastColor: 0 });
    knownRoles.set(role.id, { name: role.name, lastSpeed: speed });

    startRainbowRole(interaction.guild, role.id);
    saveData();
    return interaction.reply(`🌈 Rainbow started on ${role.name}`);
  }

  if (interaction.commandName === 'rainbow-stop') {
    stopRainbowRole(role.id);
    rainbowRoles.delete(role.id);
    saveData();
    return interaction.reply(`🛑 Rainbow stopped on ${role.name}`);
  }
});

/* ================= DASHBOARD ================= */
const app = express();
app.use(express.json());

app.get('/api/activeColors', (_, res) => {
  const colors = {};
  rainbowRoles.forEach((data, roleId) => (colors[roleId] = data.lastColor || 0));
  res.json(colors);
});

app.listen(PORT, () => console.log(`🌐 Rainbow dashboard running on port ${PORT}`));

/* ================= LOGIN ================= */
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.first();
  if (!guild) return;

  // Start all saved rainbow roles automatically
  rainbowRoles.forEach((_, roleId) => startRainbowRole(guild, roleId));
});

client.login(TOKEN);
