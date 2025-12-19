require("dotenv").config();
const fs = require("fs");

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const { Player } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");
const OpenAI = require("openai");

/* ================= OPENAI ================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ================= DISCORD ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

/* ================= PLAYER ================= */
const player = new Player(client);
(async () => {
  await player.extractors.loadMulti(DefaultExtractors);
  console.log("🎵 Extractores cargados");
})();

/* ================= ECONOMÍA ================= */
const ECONOMY_FILE = "./economy.json";

function leerEconomia() {
  if (!fs.existsSync(ECONOMY_FILE)) {
    fs.writeFileSync(ECONOMY_FILE, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(ECONOMY_FILE, "utf8"));
}

function guardarEconomia(data) {
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2));
}

function initUser(eco, id) {
  if (!eco[id]) {
    eco[id] = { coins: 0, bank: 0, lastMine: 0, lastRob: 0 };
  }
}

/* ================= READY ================= */
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

/* ================= MENSAJES ================= */
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  /* ========== HELP (MENÚ PRIVADO) ========== */
  if (cmd === "!help") {
    const embed = new EmbedBuilder()
      .setColor("#2B2D31")
      .setTitle("📘 Help Menu")
      .setDescription("Selecciona una categoría 👇");

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`help_${message.author.id}`)
      .setPlaceholder("Choose a category...")
      .addOptions([
        { label: "AI", value: "ai", emoji: "🤖" },
        { label: "Economy", value: "eco", emoji: "💰" },
        { label: "Music", value: "music", emoji: "🎵" },
        { label: "Moderation", value: "mod", emoji: "🛡️" },
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    return message.reply({
      embeds: [embed],
      components: [row],
    });
  }

  /* ========== MÚSICA ========== */
  if (cmd === "!play") {
    const q = args.join(" ");
    if (!q) return message.reply("❌ Escribe una canción");
    const vc = message.member.voice.channel;
    if (!vc) return message.reply("❌ Entra a un canal de voz");

    const res = await player.search(q, { requestedBy: message.author });
    if (!res.tracks.length) return message.reply("❌ No encontrado");

    await player.play(vc, res.tracks[0], {
      nodeOptions: { metadata: message },
    });

    return message.reply(`🎶 Reproduciendo **${res.tracks[0].title}**`);
  }

  if (cmd === "!pause") {
    const q = player.nodes.get(message.guild.id);
    if (!q) return message.reply("❌ No hay música");
    q.node.setPaused(true);
    return message.reply("⏸ Pausado");
  }

  if (cmd === "!resume") {
    const q = player.nodes.get(message.guild.id);
    if (!q) return message.reply("❌ No hay música");
    q.node.setPaused(false);
    return message.reply("▶️ Reanudado");
  }

  if (cmd === "!stop") {
    const q = player.nodes.get(message.guild.id);
    if (!q) return message.reply("❌ No hay música");
    q.delete();
    return message.reply("⏹ Detenido");
  }

  /* ========== ECONOMÍA ========== */
  const eco = leerEconomia();
  initUser(eco, message.author.id);

  if (cmd === "!dinero") {
    return message.reply(
      `💰 Bolsillo: ${eco[message.author.id].coins}\n🏦 Banco: ${eco[message.author.id].bank}`
    );
  }

  if (cmd === "!banco") {
    return message.reply(`🏦 Banco: ${eco[message.author.id].bank}`);
  }

  if (cmd === "!minar") {
    const now = Date.now();
    if (now - eco[message.author.id].lastMine < 60000)
      return message.reply("⏳ Espera 1 minuto");

    const gain = Math.floor(Math.random() * 50) + 1;
    eco[message.author.id].coins += gain;
    eco[message.author.id].lastMine = now;
    guardarEconomia(eco);

    return message.reply(`⛏️ Ganaste ${gain} monedas`);
  }

  if (cmd === "!depositar") {
    let amount =
      args[0] === "all" ? eco[message.author.id].coins : parseInt(args[0]);
    if (!amount || amount <= 0)
      return message.reply("❌ Cantidad inválida");
    if (eco[message.author.id].coins < amount)
      return message.reply("❌ No tienes tanto");

    eco[message.author.id].coins -= amount;
    eco[message.author.id].bank += amount;
    guardarEconomia(eco);

    return message.reply(`🏦 Depositaste ${amount}`);
  }

  if (cmd === "!retirar") {
    let amount =
      args[0] === "all" ? eco[message.author.id].bank : parseInt(args[0]);
    if (!amount || amount <= 0)
      return message.reply("❌ Cantidad inválida");
    if (eco[message.author.id].bank < amount)
      return message.reply("❌ No tienes tanto");

    eco[message.author.id].bank -= amount;
    eco[message.author.id].coins += amount;
    guardarEconomia(eco);

    return message.reply(`💸 Retiraste ${amount}`);
  }

  if (cmd === "!robar") {
    const target = message.mentions.users.first();
    if (!target || target.bot)
      return message.reply("❌ Menciona a alguien");

    initUser(eco, target.id);

    if (Math.random() < 0.5)
      return message.reply("🚔 Fallaste el robo");

    const stolen = Math.min(
      Math.floor(Math.random() * 50) + 1,
      eco[target.id].coins
    );

    eco[target.id].coins -= stolen;
    eco[message.author.id].coins += stolen;
    guardarEconomia(eco);

    return message.reply(`🦹 Robaste ${stolen} monedas`);
  }

  /* ========== IA ========== */
  if (cmd === "!ask") {
    const q = args.join(" ");
    if (!q) return message.reply("❌ Escribe algo");

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: q }],
    });

    return message.reply(r.choices[0].message.content);
  }

  /* ========== MODERACIÓN ========== */
  if (cmd === "!ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ Sin permiso");
    const u = message.mentions.users.first();
    if (!u) return message.reply("❌ Menciona a alguien");
    await message.guild.members.ban(u);
    return message.reply(`🔨 ${u.tag} baneado`);
  }

  if (cmd === "!kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply("❌ Sin permiso");
    const u = message.mentions.users.first();
    if (!u) return message.reply("❌ Menciona a alguien");
    await message.guild.members.cache.get(u.id)?.kick();
    return message.reply(`👢 ${u.tag} expulsado`);
  }
});

/* ========== INTERACCIONES (MENÚ PRIVADO) ========== */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const ownerId = interaction.customId.split("_")[1];
  if (interaction.user.id !== ownerId) {
    return interaction.reply({
      content: "❌ Este menú no es para ti",
      ephemeral: true,
    });
  }

  let embed;

  if (interaction.values[0] === "eco") {
    embed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("💰 Economy")
      .setDescription(
        "`!dinero`\n`!banco`\n`!minar`\n`!depositar`\n`!retirar`\n`!robar`"
      );
  }

  if (interaction.values[0] === "music") {
    embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("🎵 Music")
      .setDescription(
        "`!play`\n`!pause`\n`!resume`\n`!stop`"
      );
  }

  if (interaction.values[0] === "ai") {
    embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("🤖 AI")
      .setDescription("`!ask <pregunta>`");
  }

  if (interaction.values[0] === "mod") {
    embed = new EmbedBuilder()
      .setColor("#747F8D")
      .setTitle("🛡️ Moderation")
      .setDescription("`!ban`\n`!kick`\n`!unban`");
  }

  await interaction.update({
    embeds: [embed],
  });
});

/* ================= LOGIN ================= */
client.login(process.env.DISCORD_TOKEN);
