import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { quoteHashrate } from './pricing.js';
import { createOrder, getOrderStatus, cancelOrder, markPaid } from './orders.js';
import { validatePool } from './pools.js';

const token = process.env.DISCORD_TOKEN ?? '';
const appId = process.env.DISCORD_APP_ID ?? '';

if (!token || !appId) {
  throw new Error('Missing DISCORD_TOKEN or DISCORD_APP_ID');
}

const commands = [
  new SlashCommandBuilder()
    .setName('quote')
    .setDescription('Get a hashrate quote')
    .addNumberOption((opt) => opt.setName('ph').setDescription('Petahash requested').setRequired(true))
    .addIntegerOption((opt) => opt.setName('hours').setDescription('Duration in hours').setRequired(true))
    .addStringOption((opt) => opt.setName('pool').setDescription('Pool URL (stratum+tcp://host:port)').setRequired(true))
    .addStringOption((opt) => opt.setName('worker').setDescription('Worker name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('rent')
    .setDescription('Place a hashrate rental')
    .addNumberOption((opt) => opt.setName('ph').setDescription('Petahash requested').setRequired(true))
    .addIntegerOption((opt) => opt.setName('hours').setDescription('Duration in hours').setRequired(true))
    .addStringOption((opt) => opt.setName('pool').setDescription('Pool URL').setRequired(true))
    .addStringOption((opt) => opt.setName('worker').setDescription('Worker name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check rental status')
    .addStringOption((opt) => opt.setName('id').setDescription('Order ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel a rental (if allowed)')
    .addStringOption((opt) => opt.setName('id').setDescription('Order ID').setRequired(true)),
  new SlashCommandBuilder()
    .setName('mark_paid')
    .setDescription('Admin: mark order paid')
    .addStringOption((opt) => opt.setName('id').setDescription('Order ID').setRequired(true)),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(appId), { body: commands.map((c) => c.toJSON()) });
  console.log('Slash commands registered');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'quote':
        await handleQuote(interaction);
        break;
      case 'rent':
        await handleRent(interaction);
        break;
      case 'status':
        await handleStatus(interaction);
        break;
      case 'cancel':
        await handleCancel(interaction);
        break;
      case 'mark_paid':
        await handleMarkPaid(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Error processing request', ephemeral: true }).catch(() => {});
    }
  }
});

async function handleQuote(interaction: ChatInputCommandInteraction) {
  const ph = interaction.options.getNumber('ph', true);
  const hours = interaction.options.getInteger('hours', true);
  const pool = interaction.options.getString('pool', true);
  const worker = interaction.options.getString('worker', true);

  const minPh = Number(process.env.MIN_PH ?? '0');
  const maxPh = Number(process.env.MAX_PH ?? '0');
  const minHours = Number(process.env.MIN_HOURS ?? '0');
  const maxHours = Number(process.env.MAX_HOURS ?? '0');
  if (minPh > 0 && ph < minPh) {
    await interaction.reply({ content: `Minimum size is ${minPh} PH`, ephemeral: true });
    return;
  }
  if (maxPh > 0 && ph > maxPh) {
    await interaction.reply({ content: `Maximum size is ${maxPh} PH`, ephemeral: true });
    return;
  }
  if (minHours > 0 && hours < minHours) {
    await interaction.reply({ content: `Minimum duration is ${minHours} hours`, ephemeral: true });
    return;
  }
  if (maxHours > 0 && hours > maxHours) {
    await interaction.reply({ content: `Maximum duration is ${maxHours} hours`, ephemeral: true });
    return;
  }

  const poolOk = validatePool(pool);
  if (!poolOk.valid) {
    await interaction.reply({ content: `Pool not allowed: ${poolOk.reason}`, ephemeral: true });
    return;
  }

  const q = await quoteHashrate({ ph, hours, pool, worker });
  await interaction.reply({
    content: `Quote: ${ph} PH for ${hours}h → $${q.totalUsd.toFixed(2)} (unit: $${q.usdPerPhDay.toFixed(2)} / PH-day). Source: ${q.source}`,
    ephemeral: true,
  });
}

async function handleRent(interaction: ChatInputCommandInteraction) {
  const ph = interaction.options.getNumber('ph', true);
  const hours = interaction.options.getInteger('hours', true);
  const pool = interaction.options.getString('pool', true);
  const worker = interaction.options.getString('worker', true);

  const minPh = Number(process.env.MIN_PH ?? '0');
  const maxPh = Number(process.env.MAX_PH ?? '0');
  const minHours = Number(process.env.MIN_HOURS ?? '0');
  const maxHours = Number(process.env.MAX_HOURS ?? '0');
  if (minPh > 0 && ph < minPh) {
    await interaction.reply({ content: `Minimum size is ${minPh} PH`, ephemeral: true });
    return;
  }
  if (maxPh > 0 && ph > maxPh) {
    await interaction.reply({ content: `Maximum size is ${maxPh} PH`, ephemeral: true });
    return;
  }
  if (minHours > 0 && hours < minHours) {
    await interaction.reply({ content: `Minimum duration is ${minHours} hours`, ephemeral: true });
    return;
  }
  if (maxHours > 0 && hours > maxHours) {
    await interaction.reply({ content: `Maximum duration is ${maxHours} hours`, ephemeral: true });
    return;
  }

  const poolOk = validatePool(pool);
  if (!poolOk.valid) {
    await interaction.reply({ content: `Pool not allowed: ${poolOk.reason}`, ephemeral: true });
    return;
  }

  const q = await quoteHashrate({ ph, hours, pool, worker });
  const order = await createOrder({ ph, hours, pool, worker, user: interaction.user.id, totalUsd: q.totalUsd });
  await interaction.reply({ content: `Order ${order.id} accepted. Paying: $${order.totalUsd.toFixed(2)}. Status: ${order.status}`, ephemeral: true });
}

async function handleMarkPaid(interaction: ChatInputCommandInteraction) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(interaction.user.id)) {
    await interaction.reply({ content: 'Not authorized', ephemeral: true });
    return;
  }
  const id = interaction.options.getString('id', true);
  const msg = await markPaid(id);
  // fulfillment stub
  const fulfillUrl = process.env.INTERNAL_FULFILL_URL;
  if (fulfillUrl) {
    // TODO: call fulfill endpoint to retarget hash
  }
  await interaction.reply({ content: msg, ephemeral: true });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString('id', true);
  const status = await getOrderStatus(id);
  await interaction.reply({ content: status, ephemeral: true });
}

async function handleCancel(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString('id', true);
  const res = await cancelOrder(id);
  await interaction.reply({ content: res, ephemeral: true });
}

async function start() {
  await registerCommands();
  await client.login(token);
}

start().catch((err) => {
  console.error('Bot start failed', err);
});
