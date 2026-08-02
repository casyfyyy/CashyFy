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
      await sendMsg(u.telegram_id,
        `<b>🔐 CashyFy Password Reset</b>\n\n<b>Your new password: <code>${newPassword}</code></b>\n\n<b>Please login and change your password immediately!</b>\n\n<b>- CashyFy Team</b>`
      );
    }
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.get('/web/profile', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token chahiye' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token' });
    const u = users[0];
    res.json({
      success: true, name: u.name, phone: u.phone,
      balance: parseFloat(u.balance || 0).toFixed(2),
      lifetime_earnings: parseFloat(u.lifetime_earnings || 0).toFixed(2),
      upi_id: u.upi_id || null, bank_account: u.bank_account || null, bank_ifsc: u.bank_ifsc || null
    });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.get('/web/txns', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token chahiye' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token' });
    const u = users[0];
    const conversions = await dbGet('conversions', `telegram_id=eq.${u.phone}&order=created_at.desc&limit=50`);
    const withdrawals = await dbGet('withdrawals', `telegram_id=eq.${u.telegram_id}&order=created_at.desc&limit=50`);
    const txns = [
      ...conversions.map(c => ({
        id: `TXN${c.id}`, type: 'credit', title: c.offer_name,
        amount: parseFloat(c.amount), status: c.amount > 0 ? 'success' : 'pending',
        comment: c.event,
        date: new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
        method: 'cashback', closing: ''
      })),
      ...withdrawals.map(w => ({
        id: `WD${w.id}`, type: 'debit', title: 'Withdrawal',
        amount: parseFloat(w.amount),
        status: w.status === 'paid' ? 'success' : w.status === 'cancelled' ? 'failed' : 'pending',
        comment: `To: ${w.upi_id}`,
        date: new Date(w.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
        method: w.upi_id?.includes('@') ? 'upi' : 'bank', closing: ''
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, txns });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/withdraw', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token chahiye' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token' });
    const u = users[0];
    const { amount, method, upi_id, bank_account, bank_ifsc } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 10) return res.json({ success: false, error: 'Minimum ₹10 required' });
    if (amt > parseFloat(u.balance)) return res.json({ success: false, error: 'Insufficient balance' });
    const payment = method === 'upi' ? upi_id : `${bank_account} | ${bank_ifsc}`;
    const requestId = getRequestId();
    const newBal = parseFloat(u.balance) - amt;
    await dbPost('withdrawals', { telegram_id: u.telegram_id, amount: amt, upi_id: payment, status: 'pending', request_id: requestId });
    await dbPatch('users', `telegram_id=eq.${u.telegram_id}`, { balance: newBal < 0 ? 0 : newBal });
    // ✅ Push notification
    await sendPushNotification(
      '💸 New Withdraw Request!',
      `${u.name} — ₹${amt} — ${payment}`
    );
    res.json({ success: true, request_id: requestId, new_balance: newBal.toFixed(2) });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/transfer', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token chahiye' });
    const senderUsers = await dbGet('users', `web_token=eq.${token}`);
    if (senderUsers.length === 0) return res.json({ success: false, error: 'Invalid token' });
    const sender = senderUsers[0];
    const { phone, amount } = req.body;
    const amt = parseFloat(amount);
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) return res.json({ success: false, error: 'Valid phone chahiye' });
    if (isNaN(amt) || amt <= 0) return res.json({ success: false, error: 'Valid amount chahiye' });
    if (phone === sender.phone) return res.json({ success: false, error: 'Apne aap ko transfer nahi' });
    if (amt > parseFloat(sender.balance)) return res.json({ success: false, error: 'Insufficient balance' });
    const receiverUsers = await dbGet('users', `phone=eq.${phone}`);
    if (receiverUsers.length === 0) return res.json({ success: false, error: 'Receiver registered nahi hai' });
    const receiver = receiverUsers[0];
    const senderNewBal = parseFloat(sender.balance) - amt;
    await dbPatch('users', `phone=eq.${sender.phone}`, { balance: senderNewBal < 0 ? 0 : senderNewBal });
    const receiverNewBal = parseFloat(receiver.balance) + amt;
    await dbPatch('users', `phone=eq.${receiver.phone}`, { balance: receiverNewBal });
    if (receiver.telegram_id) {
      await sendMsg(receiver.telegram_id,
        `<b>💰 Payment of Rs. ${amt} received</b>\n\n<b>You have received Rs ${amt} from ${sender.name}</b>\n\n<b>Updated Balance: ₹${receiverNewBal.toFixed(2)}</b>`
      );
    }
    res.json({ success: true, receiver_name: receiver.name, amount: amt, new_balance: senderNewBal.toFixed(2) });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

app.post('/web/logout', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false });
    await dbPatch('users', `web_token=eq.${token}`, { web_token: null });
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

app.post('/web/update-password', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token chahiye' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token' });
    const u = users[0];
    const { current_password, new_password } = req.body;
    if (u.password !== hashPassword(current_password)) return res.json({ success: false, error: 'Current password galat hai' });
    await dbPatch('users', `phone=eq.${u.phone}`, { password: hashPassword(new_password) });
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Server error' }); }
});

// ===================== OFFER ENDPOINTS =====================

app.post('/refer/create', async (req, res) => {
  try {
    const { offer_name, referrer_phone, user_payout, my_payout } = req.body;
    if (!offer_name || !referrer_phone) return res.json({ success: false });
    const code = generateReferCode(offer_name);
    await dbPost('wallet_referrals', { code, offer_name, referrer_phone, user_payout: user_payout || 0, my_payout: my_payout || 0 });
    const slug = offerSlugMap[offer_name] || offer_name;
    const landing_url = `https://cashyfy.site/offer/${slug}?source=${code}`;
    res.json({ success: true, code, landing_url });
  } catch(e) { res.json({ success: false }); }
});

app.get('/refer/amount', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.json({ success: false });
    const referral = await dbGet('wallet_referrals', `code=eq.${code}`);
    if (referral.length === 0) return res.json({ success: false });
    res.json({ success: true, user_payout: referral[0].user_payout, my_payout: referral[0].my_payout, offer_name: referral[0].offer_name });
  } catch(e) { res.json({ success: false }); }
});

app.post('/click', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!rateLimit(ip, 30, 60000)) return res.status(429).json({ success: false });
    const { click_id, offer_name, refer_code, phone } = req.body;
    if (!click_id || !offer_name) return res.json({ success: false });
    let referred_by = null, user_payout = 0, my_payout = 0;
    if (refer_code) {
      const referral = await dbGet('wallet_referrals', `code=eq.${refer_code}`);
      if (referral.length > 0) {
        referred_by = referral[0].referrer_phone;
        user_payout = referral[0].user_payout;
        my_payout = referral[0].my_payout;
      }
    }
    await dbPost('clicks', { click_id, offer_name: sanitize(offer_name), phone: phone || null, referred_by, user_payout, my_payout });
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

app.get('/offer-status', async (req, res) => {
  try {
    const { offer } = req.query;
    if (!offer) return res.json({ is_active: true });
    const result = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offer)}`);
    if (result.length > 0) { res.json({ is_active: result[0].is_active }); }
    else { res.json({ is_active: true }); }
  } catch(e) { res.json({ is_active: true }); }
});

app.get('/offers-list', async (req, res) => {
  try {
    res.json({ success: true, offers: Object.keys(offerConfig) });
  } catch(e) { res.json({ success: false }); }
});

app.get('/offer-info', async (req, res) => {
  try {
    const { offer } = req.query;
    if (!offer) return res.json({ success: false });
    const config = offerConfig[offer];
    if (!config) return res.json({ success: false });
    const statusResult = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offer)}`);
    const is_active = statusResult.length > 0 ? statusResult[0].is_active : true;
    res.json({ success: true, payout: config.trialAmt, is_active });
  } catch(e) { res.json({ success: false }); }
});

app.get('/wallet-tracker', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.json({ success: false });
    const conversions = await dbGet('conversions', `click_id=like.${encodeURIComponent(phone)}%&order=created_at.desc`);
    if (conversions.length === 0) return res.json({ success: false });
    res.json({
      success: true,
      conversions: conversions.map(c => ({
        offer_name: c.offer_name, amount: c.amount,
        status: c.amount > 0 ? 'paid' : 'pending', time: c.created_at
      }))
    });
  } catch(e) { res.json({ success: false }); }
});

app.get('/postback', async (req, res) => {
  try {
    const { click_id = 'N/A', event = 'N/A', token } = req.query;
    if (token !== POSTBACK_TOKEN) { return res.status(403).send('Forbidden'); }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!rateLimit(ip, 50, 60000)) return res.status(429).send('Too Many Requests');
    console.log('POSTBACK:', req.query);
    let runTime = getTime(), offer = 'Unknown', phone = null, referred_by = null, user_payout_custom = 0, my_payout_custom = 0;
    try {
      const clicks = await dbGet('clicks', `click_id=eq.${encodeURIComponent(click_id)}&order=created_at.desc&limit=1`);
      if (clicks.length > 0) {
        offer = clicks[0].offer_name; phone = clicks[0].phone;
        runTime = new Date(clicks[0].created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '');
        referred_by = clicks[0].referred_by;
        user_payout_custom = clicks[0].user_payout || 0;
        my_payout_custom = clicks[0].my_payout || 0;
      }
    } catch(e) {}
    if (!phone) { return res.send('OK'); }
    const config = offerConfig[offer] || { installAmt: 0, trialAmt: 0, installBalance: false, trialBalance: false, installComment: `${offer} Install`, trialComment: `${offer} Trial` };
    let amount = 0, comment = '', addBalance = false;
    const eventName = event?.trim().toLowerCase();
    if (['web', 'initial', 'install', 'e1', 'default'].includes(eventName)) {
      amount = config.installAmt || 0; comment = config.installComment; addBalance = config.installBalance;
    } else if (['trial', 'purchase', 'e2', 'gold_buy', 'signup', 'register', 'registration', 'deposit', 'trial_payment_successful'].includes(eventName)) {
      comment = config.trialComment; addBalance = config.trialBalance;
      amount = referred_by ? user_payout_custom : (user_payout_custom > 0 ? user_payout_custom : config.trialAmt || 0);
    } else {
      amount = parseFloat(req.query.amount || 0); comment = `${offer} Complete`; addBalance = true;
    }
    await dbPost('conversions', { telegram_id: phone, click_id, offer_name: offer, amount, event });
    const users = await dbGet('users', `phone=eq.${phone}`);
    const userPayment = users.length > 0 ? 'Success' : 'Failed';
    if (users.length > 0) {
      const u = users[0];
      if (addBalance && amount > 0) {
        const newBal = parseFloat(u.balance) + amount;
        const newLife = parseFloat(u.lifetime_earnings) + amount;
        await dbPatch('users', `phone=eq.${phone}`, { balance: newBal, lifetime_earnings: newLife });
        await sendMsg(u.telegram_id, `<b>🧿 Cashback Credited 🧿</b>\n\n<b>💶 Amount = ₹${amount}</b>\n<b>💰 Updated Balance = ₹${newBal.toFixed(2)}</b>\n\n<b>💡 Comment = ${comment}</b>`);
      }
      if (referred_by && my_payout_custom > 0 && addBalance) {
        const referrers = await dbGet('users', `phone=eq.${referred_by}`);
        if (referrers.length > 0) {
          const r = referrers[0];
          const newRefBal = parseFloat(r.balance) + my_payout_custom;
          const newRefLife = parseFloat(r.lifetime_earnings) + my_payout_custom;
          await dbPatch('users', `phone=eq.${referred_by}`, { balance: newRefBal, lifetime_earnings: newRefLife });
          await sendMsg(r.telegram_id, `<b>🎉 Refer Bonus!\n\n💶 Amount = ₹${my_payout_custom}\n💰 Updated Balance = ₹${newRefBal.toFixed(2)}\n\n💡 Comment = Refer Bonus - ${offer}</b>`);
        }
      }
    }
    const trackTime = getTime();
    const msg = referred_by
      ? `<b>Conversation Count 💝</b>\n\n<b>🎁 Offer - ${offer}</b>\n\n<b>User: ${maskPhone(phone)}</b>\n<b>Amount: ₹${amount}</b>\n<b>Payment: ${userPayment}</b>\n\n<b>Refer: ${maskPhone(referred_by)}</b>\n<b>Refer Amount: ₹${my_payout_custom}</b>\n\n<b>Run Time: ${runTime}</b>\n<b>Track Time: ${trackTime}</b>\n\n<b>Powered By - CashyFy</b>`
      : `<b>Conversation Count 💝</b>\n\n<b>🎁 Offer - ${offer}</b>\n\n<b>User: ${maskPhone(phone)}</b>\n<b>Amount: ₹${amount}</b>\n<b>Payment: ${userPayment}</b>\n\n<b>Run Time: ${runTime}</b>\n<b>Track Time: ${trackTime}</b>\n\n<b>Powered By - CashyFy</b>`;
    await sendMsg(CHAT_ID, msg);
  } catch(e) { console.error(e); }
  res.send('OK');
});

app.get('/', (req, res) => res.send('CashyFy Wallet Running! ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

setInterval(async () => {
  try { await fetchWithTimeout('https://campetihad-1.onrender.com/'); } catch(e) {}
}, 14 * 60 * 1000);
