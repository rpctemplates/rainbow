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

// Load rainbowData as Map<guildId, Map<roleId, speed>>
const rainbowData = new Map();
const rawData = JSON.parse(fs.readFileSync(DATA_FILE));
for (const guildId in rawData) {
  const roles = new Map();
  for (const roleId in rawData[guildId]) roles.set(roleId, rawData[guildId][roleId]);
  rainbowData.set(guildId, roles);
}

// Active roles and known roles as Map<guildId, Map<roleId, data>>
const activeRoles = new Map();
const knownRoles = new Map();

const saveData = () => {
  const obj = {};
  rainbowData.forEach((roles, guildId) => {
    obj[guildId] = {};
    roles.forEach((speed, roleId) => (obj[guildId][roleId] = speed));
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

  return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
};

const getSmoothRainbow = (step) => {
  const hue = (step % 360) / 360;
  const [r, g, b] = hsvToRgb(hue, 1, 1);
  return (r << 16) | (g << 8) | b;
};

/* ================= GLOBAL LOOP ================= */
let globalStep = 0;
setInterval(async () => {
  globalStep++;

  rainbowData.forEach((roles, guildId) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    roles.forEach(async (speed, roleId) => {
      const role = guild.roles.cache.get(roleId);
      if (!role || !role.editable) return;

      const interval = Math.max(Math.floor(speed / 200), 1);
      if (globalStep % interval !== 0) return;

      const color = getSmoothRainbow(globalStep);
      if (role.color === color) return;

      try {
        await role.setColor(color);
        if (!activeRoles.has(guildId)) activeRoles.set(guildId, new Map());
        activeRoles.get(guildId).set(roleId, { speed, step: globalStep, lastColor: color });
      } catch {
        console.warn(`Failed to update role ${role.name} in ${guild.name}`);
      }
    });
  });
}, 200);

/* ================= SLASH COMMANDS ================= */
const commands = [
  new SlashCommandBuilder()
    .setName('rainbow-start')
    .setDescription('Start rainbow effect on a role')
    .addRoleOption((o) => o.setName('role').setDescription('Target role').setRequired(true))
    .addIntegerOption((o) => o.setName('speed').setDescription('Speed in ms (min 500)').setRequired(false)),

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

/* ================= INTERACTION HANDLER ================= */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.reply({ content: '❌ Need Manage Roles permission.', ephemeral: true });
  }

  const role = interaction.options.getRole('role');
  const speed = Math.max(interaction.options.getInteger('speed') || 1000, 500);

  if (!role.editable) return interaction.reply({ content: '❌ Role not editable.', ephemeral: true });

  if (!rainbowData.has(interaction.guild.id)) rainbowData.set(interaction.guild.id, new Map());
  if (!knownRoles.has(interaction.guild.id)) knownRoles.set(interaction.guild.id, new Map());

  knownRoles.get(interaction.guild.id).set(role.id, { name: role.name, lastSpeed: speed });

  if (interaction.commandName === 'rainbow-start') {
    rainbowData.get(interaction.guild.id).set(role.id, speed);
    saveData();
    return interaction.reply(`🌈 Rainbow started on ${role.name}`);
  }

  if (interaction.commandName === 'rainbow-stop') {
    rainbowData.get(interaction.guild.id).delete(role.id);
    saveData();
    return interaction.reply(`🛑 Rainbow stopped on ${role.name}`);
  }
});

/* ================= DASHBOARD ================= */
const app = express();
app.use(express.json());

app.get('/api/data', (_, res) => {
  const data = {};
  knownRoles.forEach((roles, guildId) => {
    data[guildId] = {};
    roles.forEach((info, roleId) => {
      const speed = rainbowData.get(guildId)?.get(roleId) || info.lastSpeed || 0;
      data[guildId][roleId] = speed;
    });
  });
  res.json(data);
});

app.post('/api/start', (req, res) => {
  const { guildId, roleId, speed } = req.body;
  if (!rainbowData.has(guildId)) rainbowData.set(guildId, new Map());
  rainbowData.get(guildId).set(roleId, Math.max(speed || 1000, 500));
  saveData();
  res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
  const { guildId, roleId } = req.body;
  rainbowData.get(guildId)?.delete(roleId);
  saveData();
  res.json({ success: true });
});

app.get('/api/activeColors', (_, res) => {
  const data = {};
  activeRoles.forEach((roles, guildId) => {
    data[guildId] = {};
    roles.forEach((info, roleId) => (data[guildId][roleId] = info.lastColor || 0));
  });
  res.json(data);
});

app.listen(PORT, () => console.log(`🌐 Rainbow dashboard running on port ${PORT}`));

/* ================= LOGIN ================= */
client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));
client.login(TOKEN);
