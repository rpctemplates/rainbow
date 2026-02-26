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

// ---------- Express for uptime ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🌈 Rainbow Bot is alive!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ---------- Discord client ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---------- Data storage ----------
const rainbowFile = './rainbowData.json';
if (!fs.existsSync(rainbowFile)) fs.writeFileSync(rainbowFile, '{}');
let rainbowData = JSON.parse(fs.readFileSync(rainbowFile));

function saveData() {
  fs.writeFileSync(rainbowFile, JSON.stringify(rainbowData, null, 2));
}

// ---------- Presets ----------
const presets = {
  admin: [
    "1468334725172301920",
    "1468334725172301919",
    "1472683521981288539",
    "1468334725172301917"
  ]
};

// ---------- Intervals ----------
const activeIntervals = {};

// ---------- Rainbow & Gradient ----------
function getRainbowColor(step) {
  const frequency = 0.3;
  const red   = Math.sin(frequency * step + 0) * 127 + 128;
  const green = Math.sin(frequency * step + 2) * 127 + 128;
  const blue  = Math.sin(frequency * step + 4) * 127 + 128;
  return (Math.floor(red) << 16) + (Math.floor(green) << 8) + Math.floor(blue);
}

function startRainbow(guildId, roleId, speed) {
  let step = 0;
  if (activeIntervals[roleId]) clearInterval(activeIntervals[roleId]);

  activeIntervals[roleId] = setInterval(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId);
      if (!role || !role.editable) return;

      const color = `#${getRainbowColor(step++).toString(16).padStart(6,'0')}`;
      await role.setColor(color);
    } catch (err) {
      console.error("Rainbow error:", err);
      clearInterval(activeIntervals[roleId]);
    }
  }, Math.max(speed, 500));
}

function startGradient(guildId, roleId, colors, speed) {
  let index = 0;
  if (activeIntervals[roleId]) clearInterval(activeIntervals[roleId]);

  activeIntervals[roleId] = setInterval(async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId);
      if (!role || !role.editable) return;

      await role.setColor(colors[index % colors.length]);
      index++;
    } catch (err) {
      console.error("Gradient error:", err);
      clearInterval(activeIntervals[roleId]);
    }
  }, Math.max(speed, 500));
}

function stopEffect(roleId) {
  if (activeIntervals[roleId]) {
    clearInterval(activeIntervals[roleId]);
    delete activeIntervals[roleId];
  }
}

// ---------- Ready ----------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const guildId in rainbowData) {
    for (const roleId in rainbowData[guildId]) {
      startRainbow(guildId, roleId, rainbowData[guildId][roleId]);
    }
  }
});

// ---------- Slash commands ----------
const commands = [
  // Rainbow
  new SlashCommandBuilder()
    .setName('rainbow-start')
    .setDescription('Start rainbow effect on a role')
    .addRoleOption(opt => opt.setName('role').setDescription('Role to make rainbow').setRequired(true))
    .addIntegerOption(opt => opt.setName('speed').setDescription('Speed in ms (min 500)')),

  new SlashCommandBuilder()
    .setName('rainbow-stop')
    .setDescription('Stop rainbow effect on a role')
    .addRoleOption(opt => opt.setName('role').setDescription('Role to stop').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rainbow')
    .setDescription('Start rainbow effect on a preset group of roles')
    .addStringOption(opt => opt.setName('preset').setDescription('Preset group of roles').setRequired(true)
      .addChoices({ name: 'admin', value: 'admin' })),

  new SlashCommandBuilder()
    .setName('rainbow-stop-preset')
    .setDescription('Stop rainbow effect on a preset group of roles')
    .addStringOption(opt => opt.setName('preset').setDescription('Preset group of roles').setRequired(true)
      .addChoices({ name: 'admin', value: 'admin' })),

  // Gradient
  new SlashCommandBuilder()
    .setName('gradient')
    .setDescription('Apply a gradient of colors to a role or preset')
    .addStringOption(opt => opt.setName('colors').setDescription('Comma-separated hex colors').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Single role to color'))
    .addStringOption(opt => opt.setName('preset').setDescription('Preset of roles to color'))
    .addIntegerOption(opt => opt.setName('speed').setDescription('Speed in ms (min 500)')),

  new SlashCommandBuilder()
    .setName('gradient-stop')
    .setDescription('Stop gradient on a role')
    .addRoleOption(opt => opt.setName('role').setDescription('Role to stop').setRequired(true)),

  new SlashCommandBuilder()
    .setName('gradient-stop-preset')
    .setDescription('Stop gradient on a preset')
    .addStringOption(opt => opt.setName('preset').setDescription('Preset to stop').setRequired(true)
      .addChoices({ name: 'admin', value: 'admin' }))
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("Slash commands registered!");
  } catch (err) {
    console.error(err);
  }
})();

// ---------- Interaction handler ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return interaction.reply({ content: "You need Manage Roles permission.", ephemeral: true });
  }

  const guildId = interaction.guild.id;

  const getRoles = () => {
    const preset = interaction.options.getString('preset');
    const roleOption = interaction.options.getRole('role');
    if (preset) return presets[preset] || [];
    if (roleOption) return [roleOption.id];
    return [];
  };

  let speed = interaction.options.getInteger('speed') || 1000;
  speed = Math.max(speed, 500);

  // --- Rainbow ---
  if (interaction.commandName === 'rainbow-start') {
    const role = interaction.options.getRole('role');
    if (!rainbowData[guildId]) rainbowData[guildId] = {};
    rainbowData[guildId][role.id] = speed;
    saveData();
    startRainbow(guildId, role.id, speed);
    await interaction.reply(`🌈 Rainbow started for ${role.name} at ${speed}ms speed.`);
  }

  else if (interaction.commandName === 'rainbow-stop') {
    const role = interaction.options.getRole('role');
    stopEffect(role.id);
    if (rainbowData[guildId]?.[role.id]) { delete rainbowData[guildId][role.id]; saveData(); }
    await interaction.reply(`🛑 Rainbow stopped for ${role.name}.`);
  }

  else if (interaction.commandName === 'rainbow') {
    const preset = interaction.options.getString('preset');
    if (!presets[preset]) return interaction.reply({ content: `Unknown preset: ${preset}`, ephemeral: true });
    if (!rainbowData[guildId]) rainbowData[guildId] = {};
    presets[preset].forEach(rid => { rainbowData[guildId][rid] = speed; startRainbow(guildId, rid, speed); });
    saveData();
    await interaction.reply(`🌈 Rainbow started for preset "${preset}"!`);
  }

  else if (interaction.commandName === 'rainbow-stop-preset') {
    const preset = interaction.options.getString('preset');
    if (!presets[preset]) return interaction.reply({ content: `Unknown preset: ${preset}`, ephemeral: true });
    presets[preset].forEach(rid => stopEffect(rid));
    if (rainbowData[guildId]) presets[preset].forEach(rid => delete rainbowData[guildId][rid]);
    saveData();
    await interaction.reply(`🛑 Rainbow stopped for preset "${preset}"!`);
  }

  // --- Gradient ---
  else if (interaction.commandName === 'gradient') {
    const colors = interaction.options.getString('colors').split(',').map(c => c.trim());
    const roles = getRoles();
    if (roles.length === 0) return interaction.reply({ content: "Provide a role or preset.", ephemeral: true });
    roles.forEach(rid => startGradient(guildId, rid, colors, speed));
    await interaction.reply(`🎨 Gradient started for ${roles.length} role(s) with colors: ${colors.join(', ')}`);
  }

  else if (interaction.commandName === 'gradient-stop') {
    const role = interaction.options.getRole('role');
    stopEffect(role.id);
    await interaction.reply(`🛑 Gradient stopped for ${role.name}`);
  }

  else if (interaction.commandName === 'gradient-stop-preset') {
    const preset = interaction.options.getString('preset');
    if (!presets[preset]) return interaction.reply({ content: `Unknown preset: ${preset}`, ephemeral: true });
    presets[preset].forEach(rid => stopEffect(rid));
    await interaction.reply(`🛑 Gradient stopped for preset "${preset}"`);
  }
});

// ---------- Login ----------
client.login(process.env.TOKEN);