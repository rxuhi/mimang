require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const db = require('./database');
const { generateProfileCard, generateVoiceCard, generateChatCard } = require('./card');

const MAIN_COLOR = 0xa7b7d6;
const WIN_COLOR = 0x57f287;
const LOSE_COLOR = 0xed4245;

// ---------- 설정값 (원하는 대로 수정 가능) ----------
const XP_PER_MESSAGE = 50; // 채팅 1개당 경험치
const XP_PER_VOICE_MINUTE = 100; // 음성채널 1분당 경험치
const VOICE_TICK_MS = 60 * 1000; // 음성 경험치 지급 주기 (1분)
const VOICE_TICK_SECONDS = VOICE_TICK_MS / 1000;

const ATTENDANCE_REWARDS = { 1: 4000, 2: 3000, 3: 2000 };
const ATTENDANCE_DEFAULT_REWARD = 1000;

const GACHA_COST_XP = 1000; // 가챠 1회 비용 (경험치)

const GAMBLE_MIN_BET = 1000; // 도박 최소 배팅량 (도박경험치)
// 배율별 확률 (합계 100)
const GAMBLE_OUTCOMES = [
  { multiplier: 0, weight: 50 },
  { multiplier: 1, weight: 30 },
  { multiplier: 2, weight: 10 },
  { multiplier: 3, weight: 7 },
  { multiplier: 5, weight: 3 },
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember, Partials.Channel],
});

function todayKST() {
  // 한국 시간 기준 YYYY-MM-DD
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function getDisplayName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return `알 수 없는 사용자 (${userId})`;
  }
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours.toLocaleString()}시간 ${minutes}분`;
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ ${c.user.tag} 로 로그인했습니다.`);

  // 음성채널 경험치 / 음성시간 지급 (1분마다 tick)
  setInterval(() => {
    for (const guild of c.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;
        if (guild.afkChannelId && channel.id === guild.afkChannelId) continue;
        for (const member of channel.members.values()) {
          if (member.user.bot) continue;
          db.addXp(guild.id, member.id, XP_PER_VOICE_MINUTE);
          db.addVoiceSeconds(guild.id, member.id, VOICE_TICK_SECONDS);
        }
      }
    }
  }, VOICE_TICK_MS);
});

// ---------- 채팅 경험치 / 채팅 횟수 ----------
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot || !message.guild) return;
  db.addXp(message.guild.id, message.author.id, XP_PER_MESSAGE);
  db.addMessageCount(message.guild.id, message.author.id, 1);
});

// ---------- 인터랙션 처리 ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'roleshop_select') {
      await handleRoleShopSelect(interaction);
    } else if (interaction.isButton() && interaction.customId === 'gacha_draw') {
      await handleGachaDraw(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith('gamble:')) {
      await handleGambleButton(interaction);
    }
  } catch (err) {
    console.error(err);
    const payload = { content: '⚠️ 처리 중 오류가 발생했습니다.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

async function handleCommand(interaction) {
  const { commandName, guild } = interaction;
  if (!guild) {
    return interaction.reply({ content: '이 명령어는 서버에서만 사용할 수 있습니다.', ephemeral: true });
  }

  switch (commandName) {
    case '경험치':
      return cmd경험치(interaction);
    case '경험치전환':
      return cmd경험치전환(interaction);
    case '출석체크':
      return cmd출석체크(interaction);
    case '서버순위':
      return cmd서버순위(interaction);
    case '선물':
      return cmd선물(interaction);
    case '추가':
      return cmd추가(interaction);
    case '경험치제거':
      return cmd경험치제거(interaction);
    case '출첵리셋':
      return cmd출첵리셋(interaction);
    case '출첵순위':
      return cmd출첵순위(interaction);
    case '역할추가':
      return cmd역할추가(interaction);
    case '역할제거':
      return cmd역할제거(interaction);
    case '역할상점':
      return cmd역할상점(interaction);
    case '가챠확률설정':
      return cmd가챠확률설정(interaction);
    case '가챠':
      return cmd가챠(interaction);
    case '가챠리셋':
      return cmd가챠리셋(interaction);
    case '도박':
      return cmd도박(interaction);
    case '음성':
      return cmd음성(interaction);
    case '음성순위':
      return cmd음성순위(interaction);
    case '채팅':
      return cmd채팅(interaction);
    case '채팅순위':
      return cmd채팅순위(interaction);
    default:
      return interaction.reply({ content: '알 수 없는 명령어입니다.', ephemeral: true });
  }
}

function checkAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

// ---------- /경험치 ----------
async function cmd경험치(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('대상') || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    return interaction.editReply('해당 유저를 서버에서 찾을 수 없습니다.');
  }

  const user = db.getUser(interaction.guild.id, target.id);
  const rank = db.getRank(interaction.guild.id, target.id);
  const avatarURL = member.displayAvatarURL({ extension: 'png', size: 256 });

  const buffer = await generateProfileCard({
    avatarURL,
    displayName: member.displayName,
    tag: `@${target.username}`,
    xp: user.xp,
    gambleXp: user.gamble_xp,
    rank,
  });

  const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`${member.displayName}님의 경험치 정보`)
    .setImage('attachment://profile.png')
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], files: [attachment] });
}

// ---------- /경험치전환 ----------
async function cmd경험치전환(interaction) {
  const from = interaction.options.getString('사용');
  const to = interaction.options.getString('전환');
  const amount = interaction.options.getInteger('양');

  if (from === to) {
    return interaction.reply({ content: '같은 종류로는 전환할 수 없습니다.', ephemeral: true });
  }

  const result = db.convertXp(interaction.guild.id, interaction.user.id, from, to, amount);

  if (!result.ok) {
    if (result.reason === 'INSUFFICIENT') {
      return interaction.reply({ content: '보유한 경험치가 부족합니다.', ephemeral: true });
    }
    if (result.reason === 'TOO_SMALL') {
      return interaction.reply({ content: '도박경험치 100당 경험치 1로 전환됩니다. 100 이상 입력해주세요.', ephemeral: true });
    }
    return interaction.reply({ content: '전환에 실패했습니다.', ephemeral: true });
  }

  const fromLabel = from === 'xp' ? '경험치' : '도박경험치';
  const toLabel = to === 'xp' ? '경험치' : '도박경험치';

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('🔄 경험치 전환 완료')
    .setDescription(
      `${fromLabel} **${result.spent.toLocaleString()}** 을(를) 사용해\n${toLabel} **${result.gained.toLocaleString()}** 을(를) 획득했습니다.`
    );

  return interaction.reply({ embeds: [embed] });
}

// ---------- /출석체크 ----------
async function cmd출석체크(interaction) {
  const date = todayKST();
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  if (db.hasCheckedToday(guildId, userId, date)) {
    return interaction.reply({ content: '오늘은 이미 출석체크를 완료했습니다. 내일 다시 시도해주세요!', ephemeral: true });
  }

  const rank = db.getTodayCount(guildId, date) + 1;
  db.checkAttendance(guildId, userId, date);

  const reward = ATTENDANCE_REWARDS[rank] || ATTENDANCE_DEFAULT_REWARD;
  db.addXp(guildId, userId, reward);

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('📅 출석체크 완료!')
    .setDescription(`오늘의 출석 순위: **${rank}등**\n획득 경험치: **+${reward.toLocaleString()} XP**`)
    .setFooter({ text: '1등: 4000 / 2등: 3000 / 3등: 2000 / 4등부터: 1000' });

  return interaction.reply({ embeds: [embed] });
}

// ---------- /서버순위 ----------
async function cmd서버순위(interaction) {
  await interaction.deferReply();
  const leaderboard = db.getLeaderboard(interaction.guild.id, 10);

  if (leaderboard.length === 0) {
    return interaction.editReply('아직 경험치 데이터가 없습니다.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    leaderboard.map(async (row, i) => {
      const name = await getDisplayName(interaction.guild, row.user_id);
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} **${name}** — ${row.xp.toLocaleString()} XP`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`📊 ${interaction.guild.name} 경험치 순위`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ---------- /선물 ----------
async function cmd선물(interaction) {
  const target = interaction.options.getUser('유저');
  const amount = interaction.options.getInteger('경험치량');

  if (target.id === interaction.user.id) {
    return interaction.reply({ content: '자기 자신에게는 선물할 수 없습니다.', ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: '봇에게는 선물할 수 없습니다.', ephemeral: true });
  }

  const sender = db.getUser(interaction.guild.id, interaction.user.id);
  if (sender.xp < amount) {
    return interaction.reply({ content: '보유한 경험치가 부족합니다.', ephemeral: true });
  }

  db.transferXp(interaction.guild.id, interaction.user.id, target.id, amount);

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('🎁 경험치 선물')
    .setDescription(`${interaction.user}님이 ${target}님에게 **${amount.toLocaleString()} XP**를 선물했습니다!`);

  return interaction.reply({ embeds: [embed] });
}

// ---------- /추가 (관리자) ----------
async function cmd추가(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  const target = interaction.options.getUser('유저');
  const amount = interaction.options.getInteger('경험치량');

  db.addXp(interaction.guild.id, target.id, amount);

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('⚙️ 경험치 지급')
    .setDescription(`${target}님에게 경험치 **${amount.toLocaleString()}**을(를) 지급했습니다.`);

  return interaction.reply({ embeds: [embed] });
}

// ---------- /경험치제거 (관리자) ----------
async function cmd경험치제거(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  const target = interaction.options.getUser('유저');
  const amount = interaction.options.getInteger('경험치량');

  const { removed, remaining } = db.removeXp(interaction.guild.id, target.id, amount);

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('🗑️ 경험치 제거')
    .setDescription(
      `${target}님의 경험치에서 **${removed.toLocaleString()}**을(를) 제거했습니다.\n남은 경험치: **${remaining.toLocaleString()} XP**`
    );

  return interaction.reply({ embeds: [embed] });
}

// ---------- /출첵리셋 (관리자) ----------
async function cmd출첵리셋(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  db.resetAttendance(interaction.guild.id);

  return interaction.reply({ content: '🗑️ 모든 출석 기록이 초기화되었습니다. (출석 순위도 초기화됨)', ephemeral: true });
}

// ---------- /출첵순위 ----------
async function cmd출첵순위(interaction) {
  await interaction.deferReply();
  const leaderboard = db.getAttendanceLeaderboard(interaction.guild.id, 10);

  if (leaderboard.length === 0) {
    return interaction.editReply('아직 출석 데이터가 없습니다.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    leaderboard.map(async (row, i) => {
      const name = await getDisplayName(interaction.guild, row.user_id);
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} **${name}** — 총 ${row.cnt.toLocaleString()}회 출석`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`📅 ${interaction.guild.name} 누적 출석 순위`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ---------- 역할 상점 임베드/컴포넌트 생성 (역할상점 / 역할추가 / 역할제거 공용) ----------
function buildRoleShopComponents(guildId, description) {
  const roles = db.getShopRoles(guildId);

  const embed = new EmbedBuilder().setColor(MAIN_COLOR).setTitle('🛍️ 역할 상점').setDescription(description);

  let select;
  if (roles.length === 0) {
    select = new StringSelectMenuBuilder()
      .setCustomId('roleshop_select')
      .setPlaceholder('아직 등록된 역할이 없습니다')
      .setDisabled(true)
      .addOptions([{ label: '등록된 역할이 없습니다', value: '_none' }]);
  } else {
    select = new StringSelectMenuBuilder()
      .setCustomId('roleshop_select')
      .setPlaceholder('구매할 역할을 선택하세요')
      .addOptions(
        roles.slice(0, 25).map((r) => ({
          label: r.role_name.slice(0, 100),
          description: `${r.price.toLocaleString()} XP`,
          value: r.role_id,
        }))
      );
  }

  const row = new ActionRowBuilder().addComponents(select);
  return { embed, row };
}

// 이미 게시된 역할상점 메세지가 있으면 최신 상태로 다시 그려줌 (역할추가/역할제거 후 호출)
async function refreshRoleShopMessage(interaction) {
  const shopMsg = db.getShopMessage(interaction.guild.id);
  if (!shopMsg) return { refreshed: false };

  try {
    const channel = await interaction.guild.channels.fetch(shopMsg.channel_id);
    const message = await channel.messages.fetch(shopMsg.message_id);
    const { embed, row } = buildRoleShopComponents(interaction.guild.id, shopMsg.description);
    await message.edit({ embeds: [embed], components: [row] });
    return { refreshed: true };
  } catch (e) {
    return { refreshed: false };
  }
}

// ---------- /역할추가 (관리자) ----------
async function cmd역할추가(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  const price = interaction.options.getInteger('필요경험치');
  const role = interaction.options.getRole('역할');
  const roleName = interaction.options.getString('역할이름') || role.name;

  db.addShopRole(interaction.guild.id, role.id, roleName, price);

  const { refreshed } = await refreshRoleShopMessage(interaction);

  return interaction.reply({
    content: refreshed
      ? `✅ 역할 상점에 **${roleName}** (${price.toLocaleString()} XP)를 추가하고, 게시된 상점 메세지를 갱신했습니다.`
      : `✅ 역할 상점에 **${roleName}** (${price.toLocaleString()} XP)를 추가했습니다.\n(\`/역할상점\`으로 상점을 먼저 게시해주세요.)`,
    ephemeral: true,
  });
}

// ---------- /역할제거 (관리자) ----------
async function cmd역할제거(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  const role = interaction.options.getRole('역할');
  const removed = db.removeShopRole(interaction.guild.id, role.id);

  if (!removed) {
    return interaction.reply({ content: '상점에 등록되지 않은 역할입니다.', ephemeral: true });
  }

  const { refreshed } = await refreshRoleShopMessage(interaction);

  return interaction.reply({
    content: refreshed
      ? `✅ 역할 상점에서 **${role.name}**을(를) 제거하고, 게시된 상점 메세지를 갱신했습니다.`
      : `✅ 역할 상점에서 **${role.name}**을(를) 제거했습니다.`,
    ephemeral: true,
  });
}

// ---------- /역할상점 (관리자) ----------
async function cmd역할상점(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  const message = interaction.options.getString('메세지');

  const { embed, row } = buildRoleShopComponents(interaction.guild.id, message);

  const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
  db.setShopMessage(interaction.guild.id, sent.channelId, sent.id, message);
}

async function handleRoleShopSelect(interaction) {
  const roleId = interaction.values[0];
  const guildId = interaction.guild.id;

  if (roleId === '_none') {
    return interaction.reply({ content: '아직 등록된 역할이 없습니다.', ephemeral: true });
  }

  const shopRole = db.getShopRole(guildId, roleId);

  if (!shopRole) {
    return interaction.reply({ content: '더 이상 구매할 수 없는 역할입니다. (상점에서 제거됨)', ephemeral: true });
  }

  const member = interaction.member;
  if (member.roles.cache.has(roleId)) {
    return interaction.reply({ content: '이미 보유중인 역할입니다.', ephemeral: true });
  }

  const user = db.getUser(guildId, interaction.user.id);
  if (user.xp < shopRole.price) {
    return interaction.reply({
      content: `경험치가 부족합니다. (필요: ${shopRole.price.toLocaleString()} XP / 보유: ${user.xp.toLocaleString()} XP)`,
      ephemeral: true,
    });
  }

  try {
    await member.roles.add(roleId);
  } catch (e) {
    return interaction.reply({ content: '역할 지급에 실패했습니다. 봇의 역할 권한/위치를 확인해주세요.', ephemeral: true });
  }

  db.addXp(guildId, interaction.user.id, -shopRole.price);

  return interaction.reply({
    content: `🎉 **${shopRole.role_name}** 역할을 구매했습니다! (-${shopRole.price.toLocaleString()} XP)`,
    ephemeral: true,
  });
}

// ---------- /가챠확률설정 (관리자) ----------
async function cmd가챠확률설정(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }
  const role = interaction.options.getRole('역할');
  const probability = interaction.options.getNumber('확률');

  db.addGachaItem(interaction.guild.id, role ? role.id : null, probability);

  const label = role ? role.name : '꽝';
  return interaction.reply({
    content: `✅ 가챠 확률을 추가했습니다: **${label}** — ${probability}%\n(이미 \`/가챠\`로 게시된 메세지가 있다면 그대로 사용하시면 됩니다. 뽑기는 항상 최신 확률로 진행됩니다.)`,
    ephemeral: true,
  });
}

// ---------- /가챠 (관리자) ----------
async function cmd가챠(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }

  const message = interaction.options.getString('메세지');

  const embed = new EmbedBuilder().setColor(MAIN_COLOR).setTitle('𝐏𝐢𝐜𝐤𝐢𝐧𝐠 𝐫𝐨𝐥𝐞𝐬').setDescription(message);

  const button = new ButtonBuilder().setCustomId('gacha_draw').setLabel('𝐏𝐫𝐞𝐬𝐬').setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder().addComponents(button);

  const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
  db.setGachaMessage(interaction.guild.id, sent.channelId, sent.id);
}

async function handleGachaDraw(interaction) {
  const guildId = interaction.guild.id;
  const items = db.getGachaItems(guildId);

  if (items.length === 0) {
    return interaction.reply({ content: '⚠️ 설정된 확률이 없습니다.', ephemeral: true });
  }

  const user = db.getUser(guildId, interaction.user.id);
  if (user.xp < GACHA_COST_XP) {
    return interaction.reply({
      content: `⚠️ 포인트가 없습니다. (필요: ${GACHA_COST_XP.toLocaleString()} XP / 보유: ${user.xp.toLocaleString()} XP)`,
      ephemeral: true,
    });
  }

  db.addXp(guildId, interaction.user.id, -GACHA_COST_XP);

  const rand = Math.random() * 100;
  let cumulative = 0;
  let winner = null;
  for (const item of items) {
    cumulative += item.probability;
    if (rand <= cumulative) {
      winner = item;
      break;
    }
  }

  if (!winner || !winner.role_id) {
    return interaction.reply({
      content: `💨 꽝! 경험치 **${GACHA_COST_XP.toLocaleString()}**을 사용했지만 아쉽게도 당첨되지 않았습니다.`,
      ephemeral: true,
    });
  }

  const member = interaction.member;
  if (member.roles.cache.has(winner.role_id)) {
    return interaction.reply({
      content: `축하합니다! 하지만 이미 <@&${winner.role_id}> 역할을 보유하고 있어 추가로 지급되지는 않았습니다. (경험치는 차감되었습니다)`,
      ephemeral: true,
    });
  }

  try {
    await member.roles.add(winner.role_id);
  } catch (e) {
    db.addXp(guildId, interaction.user.id, GACHA_COST_XP); // 지급 실패 시 경험치 환불
    return interaction.reply({
      content: '당첨되었지만 역할 지급에 실패해 경험치를 환불했습니다. 봇의 역할 권한/위치를 확인해주세요.',
      ephemeral: true,
    });
  }

  return interaction.reply({ content: `🎉 축하합니다! <@&${winner.role_id}> 역할에 당첨되었습니다!`, ephemeral: true });
}

// ---------- /가챠리셋 (관리자) ----------
async function cmd가챠리셋(interaction) {
  if (!checkAdmin(interaction)) {
    return interaction.reply({ content: '관리자 권한이 필요합니다.', ephemeral: true });
  }

  const msgRef = db.getGachaMessage(interaction.guild.id);
  if (msgRef) {
    try {
      const channel = await interaction.guild.channels.fetch(msgRef.channel_id);
      const message = await channel.messages.fetch(msgRef.message_id);
      await message.delete();
    } catch (e) {
      // 이미 삭제되었거나 접근 불가한 경우 무시
    }
  }

  db.resetGacha(interaction.guild.id);

  return interaction.reply({ content: '🗑️ 가챠 설정과 임베드가 모두 초기화되었습니다.', ephemeral: true });
}

// ---------- /도박 ----------
async function cmd도박(interaction) {
  const amount = interaction.options.getInteger('배팅량');
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  if (amount < GAMBLE_MIN_BET) {
    return interaction.reply({
      content: `최소 **${GAMBLE_MIN_BET.toLocaleString()} 도박경험치**부터 배팅할 수 있습니다.`,
      ephemeral: true,
    });
  }

  const user = db.getUser(guildId, userId);
  if (user.gamble_xp < amount) {
    return interaction.reply({
      content: `보유한 도박경험치가 부족합니다. (보유: ${user.gamble_xp.toLocaleString()})`,
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle('🎰 도박')
    .setDescription(`배팅 금액: **${amount.toLocaleString()} 도박경험치**\n\n아래 버튼을 눌러 배팅을 시작하세요!`)
    .setFooter({ text: '0배 50% · 1배 30% · 2배 10% · 3배 7% · 5배 3%' });

  const button = new ButtonBuilder()
    .setCustomId(`gamble:${userId}:${amount}`)
    .setLabel('🎲 배팅 시작!')
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(button);

  return interaction.reply({ embeds: [embed], components: [row] });
}

async function handleGambleButton(interaction) {
  const [, ownerId, amountStr] = interaction.customId.split(':');
  const amount = parseInt(amountStr, 10);
  const guildId = interaction.guild.id;

  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: '본인이 시작한 배팅만 진행할 수 있습니다.', ephemeral: true });
  }

  const user = db.getUser(guildId, ownerId);
  if (user.gamble_xp < amount) {
    return interaction.reply({
      content: `도박경험치가 부족하여 배팅을 진행할 수 없습니다. (보유: ${user.gamble_xp.toLocaleString()})`,
      ephemeral: true,
    });
  }

  // 배율 추첨
  const rand = Math.random() * 100;
  let cumulative = 0;
  let multiplier = 0;
  for (const outcome of GAMBLE_OUTCOMES) {
    cumulative += outcome.weight;
    if (rand <= cumulative) {
      multiplier = outcome.multiplier;
      break;
    }
  }

  const winnings = amount * multiplier;
  const net = winnings - amount;

  db.addGambleXp(guildId, ownerId, net);

  const resultEmbed = new EmbedBuilder()
    .setColor(net >= 0 ? WIN_COLOR : LOSE_COLOR)
    .setTitle(multiplier === 0 ? '💥 꽝! 배팅에 실패했습니다' : `🎉 x${multiplier} 당첨!`)
    .setDescription(
      `배팅 금액: **${amount.toLocaleString()}**\n결과 배율: **x${multiplier}**\n${
        net >= 0 ? '순수익' : '손실'
      }: **${net >= 0 ? '+' : ''}${net.toLocaleString()} 도박경험치**`
    );

  const disabledButton = ButtonBuilder.from(interaction.message.components[0].components[0])
    .setDisabled(true)
    .setLabel('배팅 완료');
  const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

  await interaction.update({ embeds: [resultEmbed], components: [disabledRow] });
}

// ---------- /음성 ----------
async function cmd음성(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('대상') || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    return interaction.editReply('해당 유저를 서버에서 찾을 수 없습니다.');
  }

  const user = db.getUser(interaction.guild.id, target.id);
  const rank = db.getVoiceRank(interaction.guild.id, target.id);
  const avatarURL = member.displayAvatarURL({ extension: 'png', size: 256 });

  const buffer = await generateVoiceCard({
    avatarURL,
    displayName: member.displayName,
    tag: `@${target.username}`,
    durationText: formatDuration(user.voice_seconds),
    rank,
  });

  const attachment = new AttachmentBuilder(buffer, { name: 'voice.png' });
  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`${member.displayName}님의 음성 활동`)
    .setImage('attachment://voice.png')
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], files: [attachment] });
}

// ---------- /음성순위 ----------
async function cmd음성순위(interaction) {
  await interaction.deferReply();
  const leaderboard = db.getVoiceLeaderboard(interaction.guild.id, 10);

  if (leaderboard.length === 0) {
    return interaction.editReply('아직 음성 활동 데이터가 없습니다.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    leaderboard.map(async (row, i) => {
      const name = await getDisplayName(interaction.guild, row.user_id);
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} **${name}** — ${formatDuration(row.voice_seconds)}`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`🎙️ ${interaction.guild.name} 음성 활동 순위`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ---------- /채팅 ----------
async function cmd채팅(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('대상') || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    return interaction.editReply('해당 유저를 서버에서 찾을 수 없습니다.');
  }

  const user = db.getUser(interaction.guild.id, target.id);
  const rank = db.getMessageRank(interaction.guild.id, target.id);
  const avatarURL = member.displayAvatarURL({ extension: 'png', size: 256 });

  const buffer = await generateChatCard({
    avatarURL,
    displayName: member.displayName,
    tag: `@${target.username}`,
    messageCount: user.message_count,
    rank,
  });

  const attachment = new AttachmentBuilder(buffer, { name: 'chat.png' });
  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`${member.displayName}님의 채팅 활동`)
    .setImage('attachment://chat.png')
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], files: [attachment] });
}

// ---------- /채팅순위 ----------
async function cmd채팅순위(interaction) {
  await interaction.deferReply();
  const leaderboard = db.getMessageLeaderboard(interaction.guild.id, 10);

  if (leaderboard.length === 0) {
    return interaction.editReply('아직 채팅 활동 데이터가 없습니다.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = await Promise.all(
    leaderboard.map(async (row, i) => {
      const name = await getDisplayName(interaction.guild, row.user_id);
      const prefix = medals[i] || `${i + 1}.`;
      return `${prefix} **${name}** — ${row.message_count.toLocaleString()}회`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(MAIN_COLOR)
    .setTitle(`💬 ${interaction.guild.name} 채팅 활동 순위`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

client.login(process.env.DISCORD_TOKEN);
