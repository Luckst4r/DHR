import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { quoteHashrate, btcUsd } from './pricing.js';
import { createOrder, getOrderStatus, cancelOrder, markPaid } from './orders.js';
import { validatePool } from './pools.js';
import { braiinsBalanceUsd, nicehashBalanceUsd } from './balances.js';

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
    .addIntegerOption((opt) => opt.setName('hours').setDescription('Duration in hours').setRequired(true)),
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
  const pool = 'stratum+tcp://example.com:3333';
  const worker = 'quote';

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
  const durationFactor = ph * (hours / 24);
  const baseTotal = q.baseUsdPerPhDay * durationFactor;
  const feeTotal = q.feeUsdPerPhDay * durationFactor;
  const marginTotal = q.marginUsdPerPhDay * durationFactor;
  const bufferTotal = q.bufferUsdPerPhDay * durationFactor;
  const marginBps = Number(process.env.PRICE_MARGIN_BPS ?? '100');
  const bufferBps = Number(process.env.BETA_BUFFER_BPS ?? '1000');
  const nhFeeBps = Number(process.env.NICEHASH_FEE_BPS ?? '200');
  const braiinsFeeBps = Number(process.env.BRAIINS_FEE_BPS ?? '200');
  const feePct = q.source === 'nicehash' ? nhFeeBps / 100 : q.source === 'braiins' ? braiinsFeeBps / 100 : 0;
  const feeLineBps = `  Platform fee (${feePct.toFixed(2)}%): $${q.feeUsdPerPhDay.toFixed(2)} / PH-day → $${feeTotal.toFixed(2)}`;
  const marginLineBps = `  Margin (${(marginBps / 100).toFixed(2)}%): $${q.marginUsdPerPhDay.toFixed(2)} / PH-day → $${marginTotal.toFixed(2)}`;
  const bufferLine = `  BETA buffer funding (${(bufferBps / 100).toFixed(2)}%): $${q.bufferUsdPerPhDay.toFixed(2)} / PH-day → $${bufferTotal.toFixed(2)}`;
  const lines = [
    `Quote: ${ph} PH for ${hours}h → $${q.totalUsd.toFixed(2)} (unit: $${q.usdPerPhDay.toFixed(2)} / PH-day).`,
    `  Base: $${q.baseUsdPerPhDay.toFixed(2)} / PH-day → $${baseTotal.toFixed(2)}`,
    feeLineBps,
    marginLineBps,
    bufferLine,
  ];
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

async function handleRent(interaction: ChatInputCommandInteraction) {
  const ph = interaction.options.getNumber('ph', true);
  const hours = interaction.options.getInteger('hours', true);
  const pool = interaction.options.getString('pool', true);
  const worker = interaction.options.getString('worker', true);

  // Balance gate
  const braiinsBal = await braiinsBalanceUsd();
  const nhBal = await nicehashBalanceUsd();
  if (!isFinite(braiinsBal.usd) || braiinsBal.usd < 50 || !isFinite(nhBal.usd) || nhBal.usd < 50) {
    await interaction.reply({ content: 'admin needs to top up hashrate accounts. please check back later.', ephemeral: true });
    return;
  }

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

  let q;
  try {
    q = await quoteHashrate({ ph, hours, pool, worker });
  } catch (err) {
    await interaction.reply({ content: 'No valid quote available right now. Please retry shortly.', ephemeral: true });
    return;
  }

  const order = await createOrder({ ph, hours, pool, worker, user: interaction.user.id, totalUsd: q.totalUsd });
  const btcPrice = await btcUsd().catch(() => NaN);
  const btcDue = isFinite(btcPrice) && btcPrice > 0 ? order.totalUsd / btcPrice : NaN;
  const usdcAddr = process.env.PAYMENT_USDC_BASE || 'set PAYMENT_USDC_BASE';
  const usdcSolAddr = process.env.PAYMENT_USDC_SOL || 'set PAYMENT_USDC_SOL';
  const btcAddr = process.env.PAYMENT_BTC_ONCHAIN || 'set PAYMENT_BTC_ONCHAIN';
  const lines = [
    `Order ${order.id} accepted. Paying: $${order.totalUsd.toFixed(2)}. Status: ${order.status}. Source: ${q.source}.`,
    `USDC (Base): ${usdcAddr} (amount: $${order.totalUsd.toFixed(2)})`,
    `USDC (Solana): ${usdcSolAddr} (amount: $${order.totalUsd.toFixed(2)})`,
    `BTC on-chain: ${btcAddr}` + (isFinite(btcDue) ? ` (~${btcDue.toFixed(8)} BTC at $${btcPrice?.toFixed(2) ?? 'n/a'})` : ''),
    `After payment, an admin will run /mark_paid <id> to activate.`
  ];
  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
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
