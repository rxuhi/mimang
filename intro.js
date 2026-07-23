const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ---------- 설정값 (.env 또는 Railway Variables에 아래 값들을 넣어주세요) ----------
// 디스코드에서 개발자 모드 켜고(설정 → 고급 → 개발자 모드) 역할/채널 우클릭 → ID 복사로 얻을 수 있습니다.
const BASE_ROLE_ID = process.env.INTRO_BASE_ROLE_ID; // 자기소개 완료시 누구나 받는 기본 역할
const MINOR_ROLE_ID = process.env.INTRO_MINOR_ROLE_ID; // 미성년자 역할
const ADULT_ROLE_ID = process.env.INTRO_ADULT_ROLE_ID; // 성인 역할
const MALE_ROLE_ID = process.env.INTRO_MALE_ROLE_ID; // 남자 역할
const FEMALE_ROLE_ID = process.env.INTRO_FEMALE_ROLE_ID; // 여자 역할
const LOG_CHANNEL_ID = process.env.INTRO_LOG_CHANNEL_ID; // 자기소개 로그를 남길 채널

const ADULT_AGE = 19; // 이 나이(만 나이, 출생연도 기준 간이계산) 이상이면 성인으로 처리
const MAIN_COLOR = 0xa7b7d6;

// 닉네임 자동 변경 형식: ⟡「月影」 이름 ⸝⸝
const NICKNAME_PREFIX = '⟡ 「月影」 ';
const NICKNAME_SUFFIX = ' ⸝⸝';

// deploy-commands.js에 등록할 슬래시커맨드 정의
const data = new SlashCommandBuilder()
  .setName('자기소개')
  .setDescription('자기소개를 작성하고 역할을 받습니다.')
  .addStringOption((opt) => opt.setName('이름').setDescription('이름 또는 닉네임').setRequired(true))
  .addIntegerOption((opt) =>
    opt
      .setName('나이')
      .setDescription('출생연도를 입력해주세요 (예: 2000)')
      .setRequired(true)
      .setMinValue(1900)
      .setMaxValue(new Date().getFullYear())
  )
  .addStringOption((opt) =>
    opt
      .setName('성별')
      .setDescription('성별')
      .setRequired(true)
      .addChoices({ name: '남자', value: '남자' }, { name: '여자', value: '여자' })
  )
  .addAttachmentOption((opt) => opt.setName('경로인증').setDescription('경로 인증용 첨부파일').setRequired(true));

// index.js에서 호출할 실행 함수
async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: '이 명령어는 서버에서만 사용할 수 있습니다.', ephemeral: true });
  }

  const name = interaction.options.getString('이름');
  const birthYear = interaction.options.getInteger('나이');
  const gender = interaction.options.getString('성별');
  const attachment = interaction.options.getAttachment('경로인증');

  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  const isAdult = age >= ADULT_AGE;

  const roleIds = [BASE_ROLE_ID, isAdult ? ADULT_ROLE_ID : MINOR_ROLE_ID, gender === '남자' ? MALE_ROLE_ID : FEMALE_ROLE_ID].filter(
    Boolean
  );

  try {
    if (roleIds.length > 0) {
      await interaction.member.roles.add(roleIds);
    }
  } catch (e) {
    console.error('[자기소개] 역할 지급 실패:', e);
    return interaction.reply({
      content: '⚠️ 역할 지급 중 오류가 발생했습니다. 봇의 역할 권한/위치(역할 순서)를 확인해주세요.',
      ephemeral: true,
    });
  }

  // 닉네임을 ⟡「月影」이름⸝⸝ 형식으로 자동 변경
  const maxNameLen = 32 - NICKNAME_PREFIX.length - NICKNAME_SUFFIX.length;
  const trimmedName = name.length > maxNameLen ? name.slice(0, maxNameLen) : name;
  const newNickname = `${NICKNAME_PREFIX}${trimmedName}${NICKNAME_SUFFIX}`;
  try {
    await interaction.member.setNickname(newNickname);
  } catch (e) {
    // 서버 소유자이거나 봇보다 역할이 높은 경우 등은 실패할 수 있으므로 조용히 넘어감
    console.error('[자기소개] 닉네임 변경 실패:', e.message);
  }

  // 명령어를 실행한 채널에 완료 메세지
  await interaction.reply({ content: '✅ 자기소개가 완료되었습니다!' });

  // 로그 채널에 임베드 + 첨부파일 전송
  if (!LOG_CHANNEL_ID) return;

  try {
    const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const isImage = attachment.contentType?.startsWith('image/');

    const logEmbed = new EmbedBuilder()
      .setColor(MAIN_COLOR)
      .setTitle('📋 자기소개 로그')
      .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 256 }))
      .addFields(
        { name: '작성자', value: `${interaction.user} (${interaction.user.tag})` },
        { name: '이름', value: name, inline: true },
        { name: '출생연도', value: `${birthYear}년생 (만 ${age}세 · ${isAdult ? '성인' : '미성년자'})`, inline: true },
        { name: '성별', value: gender, inline: true }
      )
      .setTimestamp();

    if (isImage) {
      logEmbed.setImage(attachment.url);
    }

    await logChannel.send({
      embeds: [logEmbed],
      files: [{ attachment: attachment.url, name: attachment.name }],
    });
  } catch (e) {
    console.error('[자기소개] 로그 채널 전송 실패:', e);
  }
}

module.exports = { data, execute };
