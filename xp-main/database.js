const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Railway 등에 배포할 때 볼륨 경로를 DB_PATH 환경변수로 지정할 수 있습니다.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  console.log(`[database.js] ${dbDir} 폴더가 없어 새로 생성합니다.`);
  fs.mkdirSync(dbDir, { recursive: true });
}
console.log(`[database.js] DB 경로: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  gamble_xp INTEGER NOT NULL DEFAULT 0,
  voice_seconds INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_roles (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS shop_message (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gacha_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  role_id TEXT,
  probability REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS gacha_message (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, date)
);
`);

// 이미 운영중이던 DB(볼륨)에는 voice_seconds / message_count 컬럼이 없을 수 있으므로 마이그레이션
const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (!userColumns.includes('voice_seconds')) {
  db.exec(`ALTER TABLE users ADD COLUMN voice_seconds INTEGER NOT NULL DEFAULT 0`);
}
if (!userColumns.includes('message_count')) {
  db.exec(`ALTER TABLE users ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0`);
}

// ---------- 유저 / 경험치 ----------
function ensureUser(guildId, userId) {
  db.prepare(
    `INSERT OR IGNORE INTO users (guild_id, user_id, xp, gamble_xp, voice_seconds, message_count) VALUES (?, ?, 0, 0, 0, 0)`
  ).run(guildId, userId);
}

function getUser(guildId, userId) {
  ensureUser(guildId, userId);
  return db.prepare(`SELECT * FROM users WHERE guild_id=? AND user_id=?`).get(guildId, userId);
}

function addXp(guildId, userId, amount) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET xp = xp + ? WHERE guild_id=? AND user_id=?`).run(amount, guildId, userId);
}

function addGambleXp(guildId, userId, amount) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET gamble_xp = gamble_xp + ? WHERE guild_id=? AND user_id=?`).run(amount, guildId, userId);
}

function addVoiceSeconds(guildId, userId, seconds) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET voice_seconds = voice_seconds + ? WHERE guild_id=? AND user_id=?`).run(
    seconds,
    guildId,
    userId
  );
}

function addMessageCount(guildId, userId, amount = 1) {
  ensureUser(guildId, userId);
  db.prepare(`UPDATE users SET message_count = message_count + ? WHERE guild_id=? AND user_id=?`).run(
    amount,
    guildId,
    userId
  );
}

function getRank(guildId, userId) {
  const rows = db.prepare(`SELECT user_id FROM users WHERE guild_id=? ORDER BY xp DESC`).all(guildId);
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? rows.length + 1 : idx + 1;
}

function getVoiceRank(guildId, userId) {
  const rows = db.prepare(`SELECT user_id FROM users WHERE guild_id=? ORDER BY voice_seconds DESC`).all(guildId);
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? rows.length + 1 : idx + 1;
}

function getMessageRank(guildId, userId) {
  const rows = db.prepare(`SELECT user_id FROM users WHERE guild_id=? ORDER BY message_count DESC`).all(guildId);
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? rows.length + 1 : idx + 1;
}

function getLeaderboard(guildId, limit = 10) {
  return db
    .prepare(`SELECT user_id, xp FROM users WHERE guild_id=? ORDER BY xp DESC LIMIT ?`)
    .all(guildId, limit);
}

function getVoiceLeaderboard(guildId, limit = 10) {
  return db
    .prepare(`SELECT user_id, voice_seconds FROM users WHERE guild_id=? ORDER BY voice_seconds DESC LIMIT ?`)
    .all(guildId, limit);
}

function getMessageLeaderboard(guildId, limit = 10) {
  return db
    .prepare(`SELECT user_id, message_count FROM users WHERE guild_id=? ORDER BY message_count DESC LIMIT ?`)
    .all(guildId, limit);
}

function transferXp(guildId, fromUserId, toUserId, amount) {
  ensureUser(guildId, fromUserId);
  ensureUser(guildId, toUserId);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE users SET xp = xp - ? WHERE guild_id=? AND user_id=?`).run(amount, guildId, fromUserId);
    db.prepare(`UPDATE users SET xp = xp + ? WHERE guild_id=? AND user_id=?`).run(amount, guildId, toUserId);
  });
  tx();
}

// 경험치 <-> 도박경험치 전환 (도박경험치 100 = 경험치 1)
function convertXp(guildId, userId, from, to, amount) {
  const user = getUser(guildId, userId);
  if (from === 'xp' && to === 'gamble') {
    if (user.xp < amount) return { ok: false, reason: 'INSUFFICIENT' };
    const gained = amount * 100;
    const tx = db.transaction(() => {
      addXp(guildId, userId, -amount);
      addGambleXp(guildId, userId, gained);
    });
    tx();
    return { ok: true, spent: amount, gained };
  }
  if (from === 'gamble' && to === 'xp') {
    if (user.gamble_xp < amount) return { ok: false, reason: 'INSUFFICIENT' };
    const gained = Math.floor(amount / 100);
    if (gained <= 0) return { ok: false, reason: 'TOO_SMALL' };
    const actuallySpent = gained * 100;
    const tx = db.transaction(() => {
      addGambleXp(guildId, userId, -actuallySpent);
      addXp(guildId, userId, gained);
    });
    tx();
    return { ok: true, spent: actuallySpent, gained };
  }
  return { ok: false, reason: 'INVALID' };
}

// ---------- 출석체크 ----------
function hasCheckedToday(guildId, userId, date) {
  return !!db
    .prepare(`SELECT 1 FROM attendance WHERE guild_id=? AND user_id=? AND date=?`)
    .get(guildId, userId, date);
}

function getTodayCount(guildId, date) {
  return db.prepare(`SELECT COUNT(*) as c FROM attendance WHERE guild_id=? AND date=?`).get(guildId, date).c;
}

function checkAttendance(guildId, userId, date) {
  db.prepare(`INSERT INTO attendance (guild_id, user_id, date) VALUES (?, ?, ?)`).run(guildId, userId, date);
}

function resetAttendance(guildId) {
  db.prepare(`DELETE FROM attendance WHERE guild_id=?`).run(guildId);
}

function getAttendanceLeaderboard(guildId, limit = 10) {
  return db
    .prepare(
      `SELECT user_id, COUNT(*) as cnt FROM attendance WHERE guild_id=? GROUP BY user_id ORDER BY cnt DESC LIMIT ?`
    )
    .all(guildId, limit);
}

// ---------- 경험치 일부 제거 ----------
function removeXp(guildId, userId, amount) {
  const user = getUser(guildId, userId);
  const removed = Math.min(user.xp, amount);
  const remaining = user.xp - removed;
  db.prepare(`UPDATE users SET xp = ? WHERE guild_id=? AND user_id=?`).run(remaining, guildId, userId);
  return { removed, remaining };
}

// ---------- 역할 상점 ----------
function addShopRole(guildId, roleId, roleName, price) {
  db.prepare(
    `INSERT INTO shop_roles (guild_id, role_id, role_name, price) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, role_id) DO UPDATE SET role_name=excluded.role_name, price=excluded.price`
  ).run(guildId, roleId, roleName, price);
}

function removeShopRole(guildId, roleId) {
  const info = db.prepare(`DELETE FROM shop_roles WHERE guild_id=? AND role_id=?`).run(guildId, roleId);
  return info.changes > 0;
}

function getShopRoles(guildId) {
  return db.prepare(`SELECT * FROM shop_roles WHERE guild_id=? ORDER BY price ASC`).all(guildId);
}

function getShopRole(guildId, roleId) {
  return db.prepare(`SELECT * FROM shop_roles WHERE guild_id=? AND role_id=?`).get(guildId, roleId);
}

function setShopMessage(guildId, channelId, messageId, description) {
  db.prepare(
    `INSERT INTO shop_message (guild_id, channel_id, message_id, description) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id, message_id=excluded.message_id, description=excluded.description`
  ).run(guildId, channelId, messageId, description);
}

function getShopMessage(guildId) {
  return db.prepare(`SELECT * FROM shop_message WHERE guild_id=?`).get(guildId);
}

// ---------- 가챠 ----------
function addGachaItem(guildId, roleId, probability) {
  db.prepare(`INSERT INTO gacha_items (guild_id, role_id, probability) VALUES (?, ?, ?)`).run(
    guildId,
    roleId,
    probability
  );
}

function getGachaItems(guildId) {
  return db.prepare(`SELECT * FROM gacha_items WHERE guild_id=?`).all(guildId);
}

function resetGacha(guildId) {
  db.prepare(`DELETE FROM gacha_items WHERE guild_id=?`).run(guildId);
  db.prepare(`DELETE FROM gacha_message WHERE guild_id=?`).run(guildId);
}

function setGachaMessage(guildId, channelId, messageId) {
  db.prepare(
    `INSERT INTO gacha_message (guild_id, channel_id, message_id) VALUES (?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id, message_id=excluded.message_id`
  ).run(guildId, channelId, messageId);
}

function getGachaMessage(guildId) {
  return db.prepare(`SELECT * FROM gacha_message WHERE guild_id=?`).get(guildId);
}

module.exports = {
  getUser,
  addXp,
  addGambleXp,
  addVoiceSeconds,
  addMessageCount,
  getRank,
  getVoiceRank,
  getMessageRank,
  getLeaderboard,
  getVoiceLeaderboard,
  getMessageLeaderboard,
  transferXp,
  convertXp,
  hasCheckedToday,
  getTodayCount,
  checkAttendance,
  resetAttendance,
  getAttendanceLeaderboard,
  removeXp,
  addShopRole,
  removeShopRole,
  getShopRoles,
  getShopRole,
  setShopMessage,
  getShopMessage,
  addGachaItem,
  getGachaItems,
  resetGacha,
  setGachaMessage,
  getGachaMessage,
};
