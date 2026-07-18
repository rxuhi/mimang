require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('경험치')
    .setDescription('나 또는 다른 사람의 경험치 정보를 확인합니다.')
    .addUserOption((opt) => opt.setName('대상').setDescription('확인할 사용자').setRequired(false)),

  new SlashCommandBuilder()
    .setName('경험치전환')
    .setDescription('경험치와 도박경험치를 서로 전환합니다. (도박경험치 100 = 경험치 1)')
    .addStringOption((opt) =>
      opt
        .setName('사용')
        .setDescription('사용할 경험치 종류')
        .setRequired(true)
        .addChoices({ name: '경험치', value: 'xp' }, { name: '도박경험치', value: 'gamble' })
    )
    .addStringOption((opt) =>
      opt
        .setName('전환')
        .setDescription('전환할 경험치 종류')
        .setRequired(true)
        .addChoices({ name: '경험치', value: 'xp' }, { name: '도박경험치', value: 'gamble' })
    )
    .addIntegerOption((opt) => opt.setName('양').setDescription('전환할 양').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder().setName('출석체크').setDescription('오늘의 출석체크를 하고 경험치를 받습니다.'),

  new SlashCommandBuilder().setName('서버순위').setDescription('경험치 서버 순위를 확인합니다.'),

  new SlashCommandBuilder()
    .setName('선물')
    .setDescription('다른 사람에게 경험치를 선물합니다.')
    .addUserOption((opt) => opt.setName('유저').setDescription('선물할 대상').setRequired(true))
    .addIntegerOption((opt) => opt.setName('경험치량').setDescription('선물할 경험치 양').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('추가')
    .setDescription('[관리자] 특정 유저의 경험치를 추가합니다.')
    .addUserOption((opt) => opt.setName('유저').setDescription('경험치를 추가할 유저').setRequired(true))
    .addIntegerOption((opt) => opt.setName('경험치량').setDescription('추가할 경험치 양 (음수 입력시 차감)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('경험치제거')
    .setDescription('[관리자] 특정 유저의 경험치를 지정한 양만큼 제거합니다.')
    .addUserOption((opt) => opt.setName('유저').setDescription('경험치를 제거할 유저').setRequired(true))
    .addIntegerOption((opt) => opt.setName('경험치량').setDescription('제거할 경험치 양').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('출첵리셋')
    .setDescription('[관리자] 모든 출석 기록을 초기화합니다. (출석 순위도 함께 초기화됩니다)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('출첵순위').setDescription('누적 출석 횟수 순위를 확인합니다.'),

  new SlashCommandBuilder()
    .setName('역할추가')
    .setDescription('[관리자] 역할 상점에 역할을 추가합니다.')
    .addIntegerOption((opt) => opt.setName('필요경험치').setDescription('필요 경험치').setRequired(true).setMinValue(1))
    .addRoleOption((opt) => opt.setName('역할').setDescription('지급할 역할').setRequired(true))
    .addStringOption((opt) => opt.setName('역할이름').setDescription('상점에 표시할 이름 (미입력시 역할 이름 사용)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('역할제거')
    .setDescription('[관리자] 역할 상점에서 역할을 제거합니다.')
    .addRoleOption((opt) => opt.setName('역할').setDescription('제거할 역할').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('역할상점')
    .setDescription('[관리자] 역할 상점 임베드를 표시합니다.')
    .addStringOption((opt) => opt.setName('메세지').setDescription('상점 상단에 표시할 안내 메세지').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('가챠확률설정')
    .setDescription('[관리자] 가챠 확률을 설정합니다. (역할을 비워두면 꽝으로 등록됩니다)')
    .addNumberOption((opt) => opt.setName('확률').setDescription('당첨 확률 (%)').setRequired(true).setMinValue(0.01).setMaxValue(100))
    .addRoleOption((opt) => opt.setName('역할').setDescription('당첨시 지급할 역할 (미입력시 꽝)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('가챠')
    .setDescription('[관리자] 가챠 뽑기 임베드를 표시합니다.')
    .addStringOption((opt) => opt.setName('메세지').setDescription('가챠 상단에 표시할 안내 메세지').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('가챠리셋')
    .setDescription('[관리자] 가챠 설정과 임베드를 모두 초기화합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('도박')
    .setDescription(`도박경험치로 배팅합니다. (최소 1000)`)
    .addIntegerOption((opt) => opt.setName('배팅량').setDescription('배팅할 도박경험치 양 (최소 1000)').setRequired(true).setMinValue(1000)),

  new SlashCommandBuilder()
    .setName('음성')
    .setDescription('나 또는 다른 사람의 누적 음성 활동 시간을 확인합니다.')
    .addUserOption((opt) => opt.setName('대상').setDescription('확인할 사용자').setRequired(false)),

  new SlashCommandBuilder().setName('음성순위').setDescription('서버 음성 활동 시간 순위를 확인합니다.'),

  new SlashCommandBuilder()
    .setName('채팅')
    .setDescription('나 또는 다른 사람의 누적 채팅 횟수를 확인합니다.')
    .addUserOption((opt) => opt.setName('대상').setDescription('확인할 사용자').setRequired(false)),

  new SlashCommandBuilder().setName('채팅순위').setDescription('서버 채팅 횟수 순위를 확인합니다.'),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`슬래시커맨드 ${commands.length}개 등록을 시작합니다...`);

    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
        body: commands,
      });
      console.log('길드(서버) 전용 커맨드 등록 완료! (즉시 반영)');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('전역 커맨드 등록 완료! (반영까지 최대 1시간 소요될 수 있습니다)');
    }
  } catch (error) {
    console.error(error);
  }
})();
