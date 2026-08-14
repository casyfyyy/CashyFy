const express = require('express');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = '8897413984';
const POSTBACK_TOKEN = process.env.POSTBACK_TOKEN || 'cashf';
const SMS_API_KEY = process.env.SMS_API_KEY || '';

const offerConfig = {
  'Waves': { installAmt: 0.1, trialAmt: 3, installBalance: false, trialBalance: true, installComment: 'Waves Install', trialComment: 'Waves Signup' },
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
  'Waves': 'WV', 'PolicyBazar': 'PB', 'Bharat Ryd': 'BR',
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

function getShortTime() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function getRequestId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

function generateTxnId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 12; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function isValidUPI(upi) { return /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/.test(upi); }
function isValidIFSC(ifsc) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase()); }

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

const crypto = require('crypto');
function hashPassword(pass) { return crypto.createHash('sha256').update(pass).digest('hex'); }

async function sendSMS(phone, otp) {
  try {
    const url = `https://sms.renflair.in/V1.php?API=${SMS_API_KEY}&PHONE=${phone}&OTP=${otp}`;
    await fetchWithTimeout(url);
    return true;
  } catch(e) { return false; }
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

async function deleteMsg(chat_id, message_id) {
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, message_id })
    });
  } catch(e) {}
}

async function answerAlert(callback_query_id, text) {
  await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id, text, show_alert: text ? true : false })
  });
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

// ✅ Transfer → Send Money, History → Transaction
const mainKeyboard = [['💰 Withdraw', '👤 Profile'], ['💸 Send Money', '📋 Transaction']];
const contactKeyboard = {
  keyboard: [[{ text: '📱 Share Contact', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true
};
const userState = {};

setInterval(() => {
  const now = Date.now();
  for (const ip in rateLimitMap) {
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 60000);
    if (rateLimitMap[ip].length === 0) delete rateLimitMap[ip];
  }
  for (const chat_id in userState) {
    if (userState[chat_id]?.timestamp && now - userState[chat_id].timestamp > 30 * 60 * 1000) {
      delete userState[chat_id];
    }
  }
  console.log('Memory cleanup done ✅');
}, 30 * 60 * 1000);

app.post('/webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;

    if (callback_query) {
      const chat_id = callback_query.from.id.toString();
      const data = callback_query.data;
      const message_id = callback_query.message?.message_id;

      if (data === 'set_upi') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0 && users[0].upi_id) {
          await editMsg(chat_id, message_id,
            `<b>💸 UPI Details:</b>\n\n<b>UPI ID: ${users[0].upi_id}</b>`,
            [[{ text: '✏️ Update', callback_data: 'update_upi' }]]
          );
        } else {
          await editMsg(chat_id, message_id,
            `<b>💸 UPI Details:\n\nNo Upi Details saved.</b>`,
            [[{ text: '✏️ Update', callback_data: 'update_upi' }]]
          );
        }

      } else if (data === 'update_upi') {
        await answerAlert(callback_query.id, '');
        userState[chat_id] = { state: 'set_upi', message_id: null, timestamp: Date.now() };
        await sendMsg(chat_id, `<b>Please enter your UPI ID (format: alphanumeric@alphabets)\n\nExample: john.doe@okaxis</b>`);

      } else if (data === 'set_bank') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0 && users[0].bank_account) {
          await editMsg(chat_id, message_id,
            `<b>🏦 Bank Details:</b>\n\n<b>Account Number: ${users[0].bank_account}</b>\n<b>IFSC Code: ${users[0].bank_ifsc}</b>`,
            [[{ text: '✏️ Update', callback_data: 'update_bank' }]]
          );
        } else {
          await editMsg(chat_id, message_id,
            `<b>🏦 Bank Details:\n\nNo bank details saved.</b>`,
            [[{ text: '✏️ Update', callback_data: 'update_bank' }]]
          );
        }

      } else if (data === 'update_bank') {
        await answerAlert(callback_query.id, '');
        userState[chat_id] = { state: 'set_bank_account', message_id: null, timestamp: Date.now() };
        await sendMsg(chat_id, `<b>Please enter your account number:</b>`);

      } else if (data === 'withdraw_upi') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (!u.upi_id) {
            await editMsg(chat_id, message_id,
              `<b>💸 UPI Details:\n\nNo UPI saved.</b>`,
              [[{ text: '✏️ Update', callback_data: 'update_upi' }]]
            );
          } else if (parseFloat(u.balance) >= 10) {
            userState[chat_id] = { state: 'withdraw_amount', method: 'upi', payment: u.upi_id, message_id, timestamp: Date.now() };
            await editMsg(chat_id, message_id, `<b>Please enter withdrawal amount (Minimum: ₹10.00):</b>`, []);
          } else {
            await sendMsg(chat_id, `<b>❌ Minimum ₹10 Required To Withdraw!</b>`, mainKeyboard);
          }
        }

      } else if (data === 'withdraw_bank') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (!u.bank_account) {
            await editMsg(chat_id, message_id,
              `<b>🏦 Bank Details:\n\nNo bank details saved.</b>`,
              [[{ text: '✏️ Update', callback_data: 'update_bank' }]]
            );
          } else if (parseFloat(u.balance) >= 10) {
            userState[chat_id] = { state: 'withdraw_amount', method: 'bank', payment: `${u.bank_account} | ${u.bank_ifsc}`, message_id, timestamp: Date.now() };
            await editMsg(chat_id, message_id, `<b>Please enter withdrawal amount (Minimum: ₹10.00):</b>`, []);
          } else {
            await sendMsg(chat_id, `<b>❌ Minimum ₹10 Required To Withdraw!</b>`, mainKeyboard);
          }
        }

      } else if (data === 'approve_withdraw') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        const state = userState[chat_id];
        if (state && state.state === 'withdraw_confirm') {
          const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
          if (users.length > 0) {
            const u = users[0];
            const amt = parseFloat(state.amount);
            if (isNaN(amt) || amt <= 0 || amt < 10) {
              await sendMsg(chat_id, `<b>❌ Invalid amount!</b>`, mainKeyboard);
              delete userState[chat_id];
              return res.send('OK');
            }
            if (parseFloat(u.balance) < amt) {
              await sendMsg(chat_id, `<b>❌ Insufficient balance! Available: ₹${parseFloat(u.balance).toFixed(2)}</b>`, mainKeyboard);
              delete userState[chat_id];
              return res.send('OK');
            }
            const now = getTime();
            const requestId = getRequestId();
            const newBal = parseFloat(u.balance) - amt;
            await dbPost('withdrawals', { telegram_id: chat_id, amount: amt, upi_id: state.payment, status: 'pending', request_id: requestId });
            await dbPatch('users', `telegram_id=eq.${chat_id}`, { balance: newBal < 0 ? 0 : newBal });
            await sendInlineMsg(chat_id,
              `<b>⏳ Withdrawal Request Submitted for Menual Approval!</b>\n\n<b>📊 Request ID: ${requestId}</b>\n<b>💰 Amount: ₹${amt}</b>\n<b>📱 Method: ${state.method === 'upi' ? 'UPI' : 'Bank'}</b>\n<b>📅 Date: ${now}</b>`,
              [[{ text: '🔍 Check Status', callback_data: `status_${requestId}` }]]
            );
            await sendInlineMsg(ADMIN_ID,
              `<b>💸 New Withdraw Request!</b>\n\n<b>🧑 User: ${u.name}</b>\n<b>📱 Phone: ${u.phone}</b>\n<b>💰 Amount: ₹${amt}</b>\n<b>💳 Payment: ${state.payment}</b>\n<b>📅 Time: ${now}</b>\n<b>📊 Request ID: ${requestId}</b>`,
              [[{ text: '✅ Approve', callback_data: `admin_approve_${requestId}` }, { text: '❌ Cancel', callback_data: `admin_cancel_${requestId}` }]]
            );
            delete userState[chat_id];
          }
        }

      } else if (data === 'cancel_withdraw') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        delete userState[chat_id];
        await sendMsg(chat_id, `<b>❌ Withdrawal Cancelled!</b>`, mainKeyboard);

      } else if (data === 'confirm_transfer') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        const state = userState[chat_id];
        if (state && state.state === 'transfer_confirm') {
          const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
          if (users.length > 0) {
            const u = users[0];
            const amt = parseFloat(state.amount);
            if (parseFloat(u.balance) < amt) {
              await sendMsg(chat_id, `<b>❌ Insufficient balance! Available: ₹${parseFloat(u.balance).toFixed(2)}</b>`, mainKeyboard);
              delete userState[chat_id];
              return res.send('OK');
            }
            const txnId = generateTxnId();
            const timeStr = getShortTime();
            const senderNewBal = parseFloat(u.balance) - amt;
            await dbPatch('users', `phone=eq.${u.phone}`, { balance: senderNewBal < 0 ? 0 : senderNewBal });
            const receivers = await dbGet('users', `phone=eq.${state.receiver_phone}`);
            if (receivers.length > 0) {
              const r = receivers[0];
              const receiverNewBal = parseFloat(r.balance) + amt;
              await dbPatch('users', `phone=eq.${state.receiver_phone}`, { balance: receiverNewBal });

              // ✅ Receiver message
              await sendInlineMsg(r.telegram_id,
                `<b>Payment of Rs. ${amt} received</b>\n\nYou have received Rs ${amt} from ${u.name}.\nClick to view details`,
                [[{ text: '🔍 See Details', callback_data: `txn_details_recv_${txnId}_${amt}_${timeStr}_${u.name}_${u.phone}` }]]
              );
            }
            delete userState[chat_id];

            // ✅ Sender success message
            await sendInlineMsg(chat_id,
              `<b>Paid Successfully to ${state.receiver_name}</b>`,
              [[{ text: '🔍 See Details', callback_data: `txn_details_sent_${txnId}_${amt}_${timeStr}_${state.receiver_name}_${state.receiver_phone}` }]]
            );
          }
        }

      } else if (data === 'cancel_transfer') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        delete userState[chat_id];
        await sendMsg(chat_id, `<b>❌ Transfer Cancelled!</b>`, mainKeyboard);

      // ✅ Sender txn details popup
      } else if (data.startsWith('txn_details_sent_')) {
        const parts = data.replace('txn_details_sent_', '').split('_');
        const txnId = parts[0];
        const amt = parts[1];
        const timeStr = parts.slice(2, parts.length - 2).join('_');
        const toName = parts[parts.length - 2];
        const toPhone = parts[parts.length - 1];
        await answerAlert(callback_query.id,
          `₹${amt}\nPaid Successfully\n${timeStr}\n\nTo: ${toName}\nPhone: ${toPhone}\n\nTransaction ID\n${txnId}`
        );

      // ✅ Receiver txn details popup
      } else if (data.startsWith('txn_details_recv_')) {
        const parts = data.replace('txn_details_recv_', '').split('_');
        const txnId = parts[0];
        const amt = parts[1];
        const timeStr = parts.slice(2, parts.length - 2).join('_');
        const fromName = parts[parts.length - 2];
        const fromPhone = parts[parts.length - 1];
        await answerAlert(callback_query.id,
          `₹${amt}\nReceived Successfully\n${timeStr}\n\nFrom: ${fromName}\nPhone: ${fromPhone}\n\nTransaction ID\n${txnId}`
        );

      } else if (data.startsWith('status_')) {
        const requestId = data.replace('status_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.telegram_id !== chat_id && chat_id !== ADMIN_ID) {
            await answerAlert(callback_query.id, '❌ Unauthorized!');
            return res.send('OK');
          }
          const statusEmoji = w.status === 'paid' ? '✅' : w.status === 'cancelled' ? '❌' : '🕐';
          const statusText = w.status === 'paid' ? 'Paid' : w.status === 'cancelled' ? 'Cancelled' : 'Pending';
          await answerAlert(callback_query.id, `Status: ${statusText} ${statusEmoji}`);
        }

      } else if (data.startsWith('admin_approve_')) {
        if (chat_id !== ADMIN_ID) { await answerAlert(callback_query.id, '❌ Unauthorized!'); return res.send('OK'); }
        const requestId = data.replace('admin_approve_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (wit
