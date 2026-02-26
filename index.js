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

if (!TOKEN) console.warn('⚠️ DISCORD_TOKEN is missing!');
if (!CLIENT_ID) console.warn('⚠️ CLIENT_ID is missing!');

/* ================= DISCORD CLIENT ================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= DATA STORAGE ================= */
const rainbowFile = './rainbowData.json';
if (!fs.existsSync(rainbowFile)) fs.writeFileSync(rainbowFile, '{}');
let rainbowData = JSON.parse(fs.readFileSync(rainbowFile));

const saveData = () =>
  fs.writeFileSync(rainbowFile, JSON.stringify(rainbowData, null, 2));

/* ================= ACTIVE INTERVALS ================= */
const activeIntervals = {};

/* ================= COLOR EFFECT ================= */
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

function stopEffect(roleId) {
  clearInterval(activeIntervals[roleId]);
  delete activeIntervals[roleId];
}

/* ================= READY ================= */
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  for (const g in rainbowData) {
    for (const r in rainbowData[g]) {
      startRainbow(g, r, rainbowData[g][r]);
    }
  }
});

/* ================= SLASH COMMANDS ================= */
if (CLIENT_ID && TOKEN) {
  const commands = [
    new SlashCommandBuilder()
      .setName('rainbow-start')
      .setDescription('Start rainbow effect')
      .addRoleOption(o =>
        o.setName('role')
         .setDescription('Role to apply rainbow effect to')
         .setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName('speed')
         .setDescription('Speed in milliseconds (minimum 500)')
         .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('rainbow-stop')
      .setDescription('Stop rainbow effect')
      .addRoleOption(o =>
        o.setName('role')
         .setDescription('Role to stop rainbow effect on')
         .setRequired(true)
      )
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

/* ================= INTERACTION HANDLER ================= */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.reply({
      content: '❌ You need Manage Roles permission.',
      ephemeral: true
    });
  }

  const role = interaction.options.getRole('role');
  const speed = interaction.options.getInteger('speed') || 1000;

  if (!role.editable) {
    return interaction.reply({
      content: '❌ I cannot edit this role. Make sure my role is above it.',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'rainbow-start') {
    if (!rainbowData[interaction.guild.id])
      rainbowData[interaction.guild.id] = {};

    rainbowData[interaction.guild.id][role.id] = speed;
    saveData();

    startRainbow(interaction.guild.id, role.id, speed);

    await interaction.reply(`🌈 Rainbow started on **${role.name}**`);
  }

  if (interaction.commandName === 'rainbow-stop') {
    stopEffect(role.id);

    if (rainbowData[interaction.guild.id])
      delete rainbowData[interaction.guild.id][role.id];

    saveData();

    await interaction.reply(`🛑 Rainbow stopped on **${role.name}**`);
  }
});

/* ================= LOGIN ================= */
if (TOKEN) {
  client.login(TOKEN)
    .then(() => console.log('✅ Bot logged in successfully'))
    .catch(err => console.error('❌ Failed to login:', err));
}