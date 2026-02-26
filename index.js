require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const express = require('express');

/* ================= EXPRESS (uptime for Railway) ================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('🌈 Rainbow Bot is alive!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

/* ================= ENVIRONMENT VARIABLES ================= */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  console.warn('⚠️ DISCORD_TOKEN is missing! The bot will not login.');
}
if (!CLIENT_ID) {
  console.warn('⚠️ CLIENT_ID is missing! Slash commands will not register.');
}

/* ================= DISCORD CLIENT ================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ================= DATA STORAGE ================= */
const rainbowFile = './rainbowData.json';
if (!fs.existsSync(rainbowFile)) fs.writeFileSync(rainbowFile, '{}');
let rainbowData = JSON.parse(fs.readFileSync(rainbowFile));

const saveData = () => fs.writeFileSync(rainbowFile, JSON.stringify(rainbowData, null, 2));

/* ================= PRESETS ================= */
const presets = {
  admin: [
    "1468334725172301920",
    "1468334725172301919",
    "1472683521981288539",
    "1468334725172301917"
  ]
};

/* ================= INTERVALS ================= */
const activeIntervals = {};

/* ================= COLOR EFFECTS ================= */
function getRainbowColor(step) {
  const f = 0.3;
  const r = Math.sin(f * step + 0) * 127 + 128;
  const g = Math.sin(f * step + 2) * 127 + 128;
  const b = Math.sin(f * step + 4) * 127 + 128;
  return (r << 16) + (g << 8) + b;
}

function startRainbow(guildId, roleId, speed) {
  let step = 0;
  clearInterval(activeIntervals[roleId]);

  activeIntervals[roleId] = setInterval(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId);
      if (!role || !role.editable) return;

      const color = `#${getRainbowColor(step++).toString(16).padStart(6, '0')}`;
      await role.setColor(color);
    } catch (e) {
      console.error('Rainbow error:', e);
      clearInterval(activeIntervals[roleId]);
    }
  }, Math.max(speed, 500));
}

function startGradient(guildId, roleId, colors, speed) {
  let i = 0;
  clearInterval(activeIntervals[roleId]);

  activeIntervals[roleId] = setInterval(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId);
      if (!role || !role.editable) return;

      await role.setColor(colors[i++ % colors.length]);
    } catch (e) {
      console.error('Gradient error:', e);
      clearInterval(activeIntervals[roleId]);
    }
  }, Math.max(speed, 500));
}

const stopEffect = (id) => {
  clearInterval(activeIntervals[id]);
  delete activeIntervals[id];
};

/* ================= READY ================= */
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user?.tag || '[NO LOGIN]'}`);
  for (const g in rainbowData)
    for (const r in rainbowData[g])
      startRainbow(g, r, rainbowData[g][r]);
});

/* ================= SLASH COMMANDS ================= */
if (CLIENT_ID && TOKEN) {
  const commands = [
    new SlashCommandBuilder()
      .setName('rainbow-start')
      .setDescription('Start rainbow effect')
      .addRoleOption(o => o.setName('role').setRequired(true))
      .addIntegerOption(o => o.setName('speed')),

    new SlashCommandBuilder()
      .setName('rainbow-stop')
      .setDescription('Stop rainbow')
      .addRoleOption(o => o.setName('role').setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  (async () => {
    try {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Slash commands registered');
    } catch (err) {
      console.error('❌ Failed to register slash commands:', err);
    }
  })();
}

/* ================= LOGIN ================= */
if (TOKEN) {
  client.login(TOKEN)
    .then(() => console.log('✅ Bot logged in successfully'))
    .catch(err => console.error('❌ Failed to login:', err));
} else {
  console.warn('⚠️ Skipping bot login due to missing DISCORD_TOKEN');
}