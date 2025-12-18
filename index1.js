require("dotenv").config();
const fs = require("fs");

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");

const { Player } = require("discord-player");
const { DefaultExtractors } = require("@discord-player/extractor");
const OpenAI = require("openai");
const {
  joinVoiceChannel,
  EndBehaviorType
} = require("@discordjs/voice");

const prism = require("prism-media");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);


// ================= OPENAI =================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================= DISCORD =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ================= PLAYER (LAVALINK v4) =================
const player = new Player(client, {
  lavoice: {
    nodes: [
      {
        id: "local",
        host: "127.0.0.1",
        port: 2444,
        password: "021307",
        secure: false,
      },
    ],
  },
});
// ================= PLAYER EVENTS =================
player.events.on("error", (queue, error) => {
  console.error("❌ Error del player:", error);
  if (queue?.metadata?.channel) {
    queue.metadata.channel.send("❌ Error al reproducir la música");
  }
});

player.events.on("playerError", (queue, error) => {
  console.error("❌ Error interno del player:", error);
  if (queue?.metadata?.channel) {
    queue.metadata.channel.send("❌ Error interno del reproductor");
  }
});


// ================= ECONOMÍA =================
const ECONOMY_FILE = "./economy.json";

function leerEconomia() {
  if (!fs.existsSync(ECONOMY_FILE)) {
    fs.writeFileSync(ECONOMY_FILE, JSON.stringify({}, null, 2));
  }

  const data = fs.readFileSync(ECONOMY_FILE, "utf8");
  return data ? JSON.parse(data) : {};
}

function guardarEconomia(data) {
  fs.writeFileSync(ECONOMY_FILE, JSON.stringify(data, null, 2));
}

// ================= LOAD EXTRACTORS =================
(async () => {
  await player.extractors.loadMulti(DefaultExtractors);
  console.log("🎵 Extractores cargados correctamente");
})();

// ================= READY =================
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ================= COMANDOS =================
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  // ================= 📜 HELP =================
  if (cmd === "!help" || cmd === "!comandos") {
    return message.reply(`
📜 **Comandos disponibles**

🎵 **Música**
• \`!play <nombre | link>\`
• \`!queue\` / \`!cola\`
• \`!pause\`
• \`!resume\`
• \`!stop\`

💰 **Economía**
• \`!minar\`
• \`!dinero\`
• \`!top\`

🛡️ **Moderación**
• \`!ban @usuario [razón]\`
• \`!kick @usuario [razón]\`
• \`!unban <ID>\`

🤖 **IA**
• \`!ask <pregunta>\`
    `);
  }

  // ================= 🎵 PLAY =================
 if (cmd === "!play") {
  const query = args.join(" ");
  if (!query) return message.reply("❌ Pon un link o nombre");

  const voice = message.member.voice.channel;
  if (!voice) return message.reply("❌ Debes estar en un canal de voz");

  try {
    const res = await player.search(query, {
      requestedBy: message.author,
    });

    if (!res.tracks.length)
      return message.reply("❌ No encontré resultados");

    await player.play(voice, res.tracks[0], {
      nodeOptions: {
        metadata: message,
        leaveOnEnd: false,
        leaveOnStop: false,
        leaveOnEmpty: false,
      },
    });

    return message.reply(`🎶 Reproduciendo **${res.tracks[0].title}**`);
  } catch (err) {
    console.error(err);
    return message.reply("❌ Error al reproducir");
  }
}

  // ================= 📃 QUEUE =================
  if (cmd === "!queue" || cmd === "!cola") {
    const queue = player.nodes.get(message.guild.id);

    if (!queue || !queue.tracks.size) {
      return message.reply("📭 La cola está vacía");
    }

    const tracks = queue.tracks.toArray().slice(0, 10);

    const list = tracks
      .map(
        (track, i) =>
          `**${i + 1}.** ${track.title} — *${track.requestedBy?.username ?? "?"}*`
      )
      .join("\n");

    return message.reply(`
🎶 **Cola actual**
🎧 Reproduciendo: **${queue.currentTrack.title}**

${list}
    `);
  }

  // ================= ⏸ PAUSE =================
  if (cmd === "!pause") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ No hay música");
    queue.node.setPaused(true);
    return message.reply("⏸ Música pausada");
  }

  // ================= ▶️ RESUME =================
  if (cmd === "!resume") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ No hay música");
    queue.node.setPaused(false);
    return message.reply("▶️ Música reanudada");
  }

  // ================= ⏹ STOP =================
  if (cmd === "!stop") {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("❌ No hay música");
    queue.delete();
    return message.reply("⏹ Música detenida");
  }

  // ================= 💰 DINERO =================
  if (cmd === "!dinero") {
    const eco = leerEconomia();
    const id = message.author.id;
    if (!eco[id]) eco[id] = { coins: 0, lastMine: 0 };

    return message.reply(`💰 Tienes **${eco[id].coins} monedas**`);
  }

  // ================= ⛏️ MINAR =================
  if (cmd === "!minar") {
    const eco = leerEconomia();
    const id = message.author.id;
    const ahora = Date.now();
    const cooldown = 50 * 1000;

    if (!eco[id]) eco[id] = { coins: 0, lastMine: 0 };

    const restante = eco[id].lastMine + cooldown - ahora;
    if (restante > 0) {
      return message.reply(`⏳ Espera **${Math.ceil(restante / 1000)}s**`);
    }

    const ganado = Math.floor(Math.random() * 50) + 1;
    eco[id].coins += ganado;
    eco[id].lastMine = ahora;

    guardarEconomia(eco);

    return message.reply(
      `⛏️ Minaste y ganaste **${ganado} monedas** 💰\n💼 Total: **${eco[id].coins}**`
    );
  }

  // ================= 🏆 TOP =================
  if (cmd === "!top") {
    const eco = leerEconomia();

    const top = Object.entries(eco)
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 5);

    if (!top.length) return message.reply("📭 No hay datos aún");

    let msg = "🏆 **Top más ricos**\n\n";
    for (let i = 0; i < top.length; i++) {
      const user = await client.users.fetch(top[i][0]);
      msg += `${i + 1}. ${user.username} — 💰 ${top[i][1].coins}\n`;
    }

    return message.reply(msg);
  }

  // ================= 🤖 OPENAI =================
  if (cmd === "!ask") {
    const pregunta = args.join(" ");
    if (!pregunta) return message.reply("❌ Escribe una pregunta");

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Responde claro y breve." },
          { role: "user", content: pregunta },
        ],
      });

      return message.reply(response.choices[0].message.content);
    } catch (error) {
      console.error(error);
      return message.reply("❌ Error al consultar OpenAI");
    }
  }

  // ================= 🛡️ MODERACIÓN =================
  if (cmd === "!ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ No tienes permiso");

    const user = message.mentions.users.first();
    if (!user) return message.reply("❌ Menciona a un usuario");

    const reason = args.slice(1).join(" ") || "Sin razón";
    await message.guild.members.ban(user, { reason });
    return message.reply(`🔨 ${user.tag} baneado`);
  }

  if (cmd === "!kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply("❌ No tienes permiso");

    const user = message.mentions.users.first();
    if (!user) return message.reply("❌ Menciona a un usuario");

    const member = message.guild.members.cache.get(user.id);
    if (!member) return message.reply("❌ No encontrado");

    await member.kick();
    return message.reply(`👢 ${user.tag} expulsado`);
  }

  if (cmd === "!unban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ No tienes permiso");

    const id = args[0];
    if (!id) return message.reply("❌ Pon el ID");

    await message.guild.members.unban(id);
    return message.reply("🔓 Usuario desbaneado");
  }
});




// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);
