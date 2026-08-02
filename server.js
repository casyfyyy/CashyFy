const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-token');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ✅ Firebase Admin init
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

let adminFCMToken = null;

async function sendPushNotification(title, body) {
  if (!adminFCMToken) return;
  try {
    await admin.messaging().send({
      token: adminFCMToken,
      notification: { title, body },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } }
    });
    console.log('Push sent ✅');
  } catch(e) {
    console.error('Push error:', e);
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = '8897413984';
const POSTBACK_TOKEN = process.env.POSTBACK_TOKEN || 'cashf';
const SMS_API_KEY = process.env.SMS_API_KEY || '';

const offerConfig = {
  'Waves': { installAmt: 0.1, trialAmt: 3, installBalance: false, trialBalance: true, installComment: 'Waves install', trialComment: 'Waves Signup' },
  'PolicyBazar': { installAmt: 0.1, trialAmt: 5, installBalance: false, trialBalance: true, installComment: 'PolicyBazar install', trialComment: 'PolicyBazar Register' },
  'Bharat Ryd': { installAmt: 0.1, trialAmt: 4, installBalance: false, trialBalance: true, installComment: 'BharatRdy Install', trialComment: 'BharatRdy Register' },
  'Jigri Super': { installAmt: 0.1, trialAmt: 45, installBalance: false, trialBalance: true, installComment: 'JIGRI Install', trialComment: 'JIGRI Deposit' },
  'FRIENDSHIP': { installAmt: 0.1, trialAmt: 43, installBalance: false, trialBalance: true, installComment: 'FriendShip Install', trialComment: 'FriendShip Deposit' },
  'Incred Gold': { installAmt: 0.1, trialAmt: 22, installBalance: false, trialBalance: true, installComment: 'Incred Install', trialComment: 'Incred Gold' },
  'StoryTv Fire': { installAmt: 0.1, trialAmt: 22, installBalance: false, trialBalance: true, installComment: 'StoryTv Install', trialComment: 'StoryTv Trail' }
};

const offerSlugMap = {
  'Waves': 'WV', 'PolicyBazar': 'PB', 'Bharat Ryd': 'BR',
  'Jigri Super': 'JS', 'FRIENDSHIP': 'FR', 'Incred Gold': 'IG', 'StoryTv Fire': 'ST'
};

const prefixMap = {
  'PolicyBazar': 'PB', 'Waves': 'WV', 'Bharat Ryd': 'BR',
  'Jigri Super': 'JS', 'FRIENDSHIP': 'FR', 'Incred Gold': 'IG', 'StoryTv Fire': 'ST'
};

const rateLimitMap = {};
function rateLimit(ip, limit = 10, windowMs = 60000) {
  const now = Date.now();
  if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
  rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < windowMs);
  if (rateLimitMap[ip].length >= limit) return false;
  rateLimitMap[ip].push(now);
  return true;
}

async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally { clearTimeout(timer); }
}

function maskPhone(phone) {
  if (!phone || phone.length < 8) return phone;
  return phone.slice(0, 4) + '****' + phone.slice(-4);
}

function getTime() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '');
}

function getRequestId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

function sanitize(text) {
  if (!text) return '';
  return String(text).replace(/[<>]/g, '').trim().slice(0, 500);
}

function generateReferCode(offer_name) {
  const prefix = prefixMap[offer_name] || 'CF';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = prefix;
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const nums = '0123456789';
  const all = upper + lower + nums;
  let pass = '';
  pass += upper.charAt(Math.floor(Math.random() * upper.length));
  pass += lower.charAt(Math.floor(Math.random() * lower.length));
  pass += nums.charAt(Math.floor(Math.random() * nums.length));
  for (let i = 0; i < 9; i++) pass += all.charAt(Math.floor(Math.random() * all.length));
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

async function sendSMS(phone, otp) {
  try {
    const url = `https://sms.renflair.in/V1.php?API=${SMS_API_KEY}&PHONE=${phone}&OTP=${otp}`;
    const res = await fetchWithTimeout(url);
    const data = await res.json();
    console.log('SMS sent:', data);
    return true;
  } catch(e) { console.error('SMS error:', e); return false; }
}

async function sendMsg(chat_id, text, keyboard) {
  const body = { chat_id, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = { keyboard, resize_keyboard: true };
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) { const data = await res.json(); return data.result?.message_id; }
    } catch(e) {
      if (i === 2) console.error('sendMsg failed:', e);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function sendInlineMsg(chat_id, text, inline_keyboard) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup: { inline_keyboard } })
      });
      if (res.ok) { const data = await res.json(); return data.result?.message_id; }
    } catch(e) { await new Promise(r => setTimeout(r, 1000)); }
  }
}

async function editMsg(chat_id, message_id, text, inline_keyboard) {
  try {
    const body = { chat_id, message_id, text, parse_mode: 'HTML' };
    if (inline_keyboard !== undefined) body.reply_markup = { inline_keyboard };
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch(e) {}
}

async function dbGet(table, filter) {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function dbPost(table, data) {
  await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
}

async function dbPatch(table, filter, data) {
  await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

const contactKeyboard = {
  keyboard: [[{ text: '📱 Share Contact', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true
};

setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimitMap) {
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 60000);
    if (rateLimitMap[ip].length === 0) delete rateLimitMap[ip];
  }
  console.log('Memory cleanup ✅');
}, 30 * 60 * 1000);

// ✅ Bot webhook — sirf registration + tracking
app.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.send('OK');
    const chat_id = message.chat.id.toString();
    const name = sanitize(message.from.first_name || 'User');

    if (message.contact) {
      const phone = message.contact.phone_number.replace(/\D/g, '').replace(/^91/, '');
      if (message.contact.user_id && message.contact.user_id.toString() !== chat_id) {
        await sendMsg(chat_id, `<b>❌ Please share your own contact only!</b>`);
        return res.send('OK');
      }
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length === 0) {
        const existing = await dbGet('users', `phone=eq.${phone}`);
        if (existing.length > 0) {
          await sendMsg(chat_id, `<b>❌ This phone number is already registered!</b>`);
          return res.send('OK');
        }
        await dbPost('users', { telegram_id: chat_id, name, phone, balance: 0, lifetime_earnings: 0 });
        await sendMsg(chat_id, `<b>✅ Registration successful!</b>\n\n<b>👤 Name: ${name}</b>\n<b>📱 Phone: ${phone}</b>\n\n<b>🌐 Visit cashyfy.site to manage your wallet!</b>`);
      } else {
        await sendMsg(chat_id, `<b>✅ Already registered!</b>\n\n🌐 Visit cashyfy.site to manage your wallet!`);
      }
      return res.send('OK');
    }

    const text = message.text || '';

    if (text === '/start') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length === 0) {
        await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id,
            text: `<b>👋 Welcome to CashyFy!</b>\n\nPlease share your phone number to register:`,
            parse_mode: 'HTML',
            reply_markup: contactKeyboard
          })
        });
      } else {
        const u = users[0];
        await sendMsg(chat_id,
          `<b>👋 Welcome back, ${u.name}!</b>\n\n<b>💰 Balance: ₹${parseFloat(u.balance).toFixed(2)}</b>\n<b>🪢 Lifetime Earnings: ₹${parseFloat(u.lifetime_earnings).toFixed(2)}</b>\n\n<b>🌐 Visit cashyfy.site to manage your wallet!</b>`
        );
      }

    } else if (text.startsWith('/pause ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/pause ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: false }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: false }); }
      await sendMsg(ADMIN_ID, `<b>⏸️ ${offerName} — Paused!</b>`);

    } else if (text.startsWith('/resume ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/resume ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: true }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: true }); }
      await sendMsg(ADMIN_ID, `<b>▶️ ${offerName} — Resumed!</b>`);

    } else if (text === '/offers' && chat_id === ADMIN_ID) {
      const offers = await dbGet('offer_status', `order=offer_name.asc`);
      if (offers.length === 0) { await sendMsg(ADMIN_ID, `<b>📋 No offers!</b>`); }
      else {
        let msg = `<b>📋 Offer Status:</b>\n\n`;
        offers.forEach(o => { msg += `${o.is_active ? '▶️' : '⏸️'} <b>${o.offer_name}</b>\n`; });
        await sendMsg(ADMIN_ID, msg);
      }
    }

  } catch(e) { console.error(e); }
  res.send('OK');
});

// ✅ FCM Token save
app.post('/admin/fcm-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: false });
    adminFCMToken = token;
    console.log('FCM token saved ✅');
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

// ✅ Admin stats
app.get('/admin/stats', async (req, res) => {
  try {
    const users = await dbGet('users', `select=id,balance,lifetime_earnings`);
    const withdrawals = await dbGet('withdrawals', `select=amount,status`);
    const conversions = await dbGet('conversions', `select=amount`);

    const totalUsers = users.length;
    const totalBalance = users.reduce((s, u) => s + parseFloat(u.balance || 0), 0);
    const totalEarnings = users.reduce((s, u) => s + parseFloat(u.lifetime_earnings || 0), 0);
    const totalPaid = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + parseFloat(w.amount || 0), 0);
    const totalPending = withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + parseFloat(w.amount || 0), 0);
    const totalConversions = conversions.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const paidWithdrawals = withdrawals.filter(w => w.status === 'paid').length;

    res.json({
      success: true,
      totalUsers, totalBalance: totalBalance.toFixed(2),
      totalEarnings: totalEarnings.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalPending: totalPending.toFixed(2),
      totalConversions: totalConversions.toFixed(2),
      pendingWithdrawals, paidWithdrawals
    });
  } catch(e) { res.json({ success: false }); }
});

// ✅ Admin — all withdrawals
app.get('/admin/withdrawals', async (req, res) => {
  try {
    const { status } = req.query;
    let filter = `order=created_at.desc&limit=100`;
    if (status) filter = `status=eq.${status}&order=created_at.desc&limit=100`;
    const withdrawals = await dbGet('withdrawals', filter);
    res.json({ success: true, withdrawals });
  } catch(e) { res.json({ success: false }); }
});

// ✅ Admin — all users
app.get('/admin/users', async (req, res) => {
  try {
    const users = await dbGet('users', `order=created_at.desc&limit=100`);
    res.json({ success: true, users });
  } catch(e) { res.json({ success: false }); }
});

// ✅ Admin approve withdraw
app.post('/admin/approve', async (req, res) => {
  try {
    const { request_id } = req.body;
    if (!request_id) return res.json({ success: false });
    const withdrawals = await dbGet('withdrawals', `request_id=eq.${request_id}`);
    if (withdrawals.length === 0) return res.json({ success: false, error: 'Not found' });
    const w = withdrawals[0];
    if (w.status !== 'pending') return res.json({ success: false, error: 'Already processed' });
    await dbPatch('withdrawals', `request_id=eq.${request_id}`, { status: 'paid' });
    await sendMsg(w.telegram_id, `<b>✅ Your withdrawal of ₹${parseFloat(w.amount).toFixed(2)} has been approved!</b>`);
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

// ✅ Admin cancel withdraw
app.post('/admin/cancel', async (req, res) => {
  try {
    const { request_id } = req.body;
    if (!request_id) return res.json({ success: false });
    const withdrawals = await dbGet('withdrawals', `request_id=eq.${request_id}`);
    if (withdrawals.length === 0) return res.json({ success: false, error: 'Not found' });
    const w = withdrawals[0];
    if (w.status !== 'pending') return res.json({ success: false, error: 'Already processed' });
    await dbPatch('withdrawals', `request_id=eq.${request_id}`, { status: 'cancelled' });
    const users = await dbGet('users', `telegram_id=eq.${w.telegram_id}`);
    if (users.length > 0) {
      const refundBal = parseFloat(users[0].balance) + parseFloat(w.amount);
      await dbPatch('users', `telegram_id=eq.${w.telegram_id}`, { balance: refundBal });
    }
    await sendMsg(w.telegram_id, `<b>❌ Your withdrawal of ₹${parseFloat(w.amount).toFixed(2)} was cancelled. Amount refunded!</b>`);
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

// ===================== WEB ENDPOINTS =====================

app.post('/web/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, error: 'Phone aur password chahiye' });
    const users = await dbGet('users', `phone=eq.${phone}`);
    if (users.length === 0) return res.json({ success: false, error: 'Phone registered nahi hai' });
    const u = users[0];
    if (u.password !== hashPassword(password)) return res.json({ success: false, error: 'Password galat hai' });
    const token = generateToken();
    await dbPatch('users', `phone=eq.${phone}`, { web_token: token });
    res.json({ success: true, token, name: u.name, phone: u.phone });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone chahiye' });
    const users = await dbGet('users', `phone=eq.${phone}`);
    if (users.length === 0) return res.json({ success: false, error: 'Pehle Telegram bot pe register karo!' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashPassword(otp);
    const otpExpiry = Date.now() + 10 * 60 * 1000;
    await dbPatch('users', `phone=eq.${phone}`, { web_token: `otp:${otpHash}:${otpExpiry}` });
    await sendSMS(phone, otp);
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.json({ success: false, error: 'Sab fields chahiye' });
    const users = await dbGet('users', `phone=eq.${phone}`);
    if (users.length === 0) return res.json({ success: false, error: 'User nahi mila' });
    const u = users[0];
    const tokenData = u.web_token || '';
    if (!tokenData.startsWith('otp:')) return res.json({ success: false, error: 'OTP request nahi mili' });
    const parts = tokenData.split(':');
    if (Date.now() > parseInt(parts[2])) return res.json({ success: false, error: 'OTP expire ho gaya' });
    if (hashPassword(otp) !== parts[1]) return res.json({ success: false, error: 'OTP galat hai' });
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/set-password', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, error: 'Phone aur password chahiye' });
    const users = await dbGet('users', `phone=eq.${phone}`);
    if (users.length === 0) return res.json({ success: false, error: 'Pehle Telegram bot pe register karo!' });
    await dbPatch('users', `phone=eq.${phone}`, { password: hashPassword(password), web_token: null });
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/forgot', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone chahiye' });
    const users = await dbGet('users', `phone=eq.${phone}`);
    if (users.length === 0) return res.json({ success: false, error: 'Phone registered nahi hai' });
    const u = users[0];
    const newPassword = generatePassword();
    await dbPatch('users', `phone=eq.${phone}`, { password: hashPassword(newPassword) });
    await sendSMS(phone, newPassword);
    if (u.telegram_id) {
      await sendMsg(u.
