const express = require('express');
const app = express();
app.use(express.json());
const crypto = require('crypto');

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
  const d = new Date();
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', hour12: true,
    day: '2-digit', month: 'short',
    hour: 'numeric', minute: '2-digit'
  });
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

function generateClickId(phone) {
  const ts = Date.now().toString().slice(-6);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 3; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${phone}${ts}${rand}`;
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

// ✅ Semi-transparent emoji style buttons
const mainKeyboard = [
  ['\u{1F4B0} Withdraw', '\u{1F464} Profile'],
  ['\u{1F4B8} Send Money', '\u{1F4CB} Transaction']
];

const contactKeyboard = {
  keyboard: [[{ text: '\u{1F4F1} Share Contact', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true
};

const userState = {};
const txnStore = {};

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
  for (const id in txnStore) {
    if (now - txnStore[id].createdAt > 24 * 60 * 60 * 1000) delete txnStore[id];
  }
  console.log('Memory cleanup done \u2705');
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
            `<b>\uD83D\uDCB8 UPI Details:</b>\n\n<b>UPI ID: ${users[0].upi_id}</b>`,
            [[{ text: '\u270F\uFE0F Update', callback_data: 'update_upi' }]]
          );
        } else {
          await editMsg(chat_id, message_id,
            `<b>\uD83D\uDCB8 UPI Details:\n\nNo UPI Details saved.</b>`,
            [[{ text: '\u270F\uFE0F Update', callback_data: 'update_upi' }]]
          );
        }

      } else if (data === 'update_upi') {
        await answerAlert(callback_query.id, '');
        userState[chat_id] = { state: 'set_upi', message_id: null, timestamp: Date.now() };
        await sendMsg(chat_id, `<b>Please enter your UPI ID\n\nExample: john.doe@okaxis</b>`);

      } else if (data === 'set_bank') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0 && users[0].bank_account) {
          await editMsg(chat_id, message_id,
            `<b>\uD83C\uDFE6 Bank Details:</b>\n\n<b>Account Number: ${users[0].bank_account}</b>\n<b>IFSC Code: ${users[0].bank_ifsc}</b>`,
            [[{ text: '\u270F\uFE0F Update', callback_data: 'update_bank' }]]
          );
        } else {
          await editMsg(chat_id, message_id,
            `<b>\uD83C\uDFE6 Bank Details:\n\nNo bank details saved.</b>`,
            [[{ text: '\u270F\uFE0F Update', callback_data: 'update_bank' }]]
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
              `<b>\uD83D\uDCB8 UPI Details:\n\nNo UPI saved.</b>`,
              [[{ text: '\u270F\uFE0F Update', callback_data: 'update_upi' }]]
            );
          } else if (parseFloat(u.balance) >= 10) {
            userState[chat_id] = { state: 'withdraw_amount', method: 'upi', payment: u.upi_id, message_id, timestamp: Date.now() };
            await editMsg(chat_id, message_id, `<b>Please enter withdrawal amount (Minimum: \u20B910.00):</b>`, []);
          } else {
            await sendMsg(chat_id, `<b>\u274C Minimum \u20B910 Required To Withdraw!</b>`, mainKeyboard);
          }
        }

      } else if (data === 'withdraw_bank') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (!u.bank_account) {
            await editMsg(chat_id, message_id,
              `<b>\uD83C\uDFE6 Bank Details:\n\nNo bank details saved.</b>`,
              [[{ text: '\u270F\uFE0F Update', callback_data: 'update_bank' }]]
            );
          } else if (parseFloat(u.balance) >= 10) {
            userState[chat_id] = { state: 'withdraw_amount', method: 'bank', payment: `${u.bank_account} | ${u.bank_ifsc}`, message_id, timestamp: Date.now() };
            await editMsg(chat_id, message_id, `<b>Please enter withdrawal amount (Minimum: \u20B910.00):</b>`, []);
          } else {
            await sendMsg(chat_id, `<b>\u274C Minimum \u20B910 Required To Withdraw!</b>`, mainKeyboard);
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
              await sendMsg(chat_id, `<b>\u274C Invalid amount!</b>`, mainKeyboard);
              delete userState[chat_id];
              return res.send('OK');
            }
            if (parseFloat(u.balance) < amt) {
              await sendMsg(chat_id, `<b>\u274C Insufficient balance! Available: \u20B9${parseFloat(u.balance).toFixed(2)}</b>`, mainKeyboard);
              delete userState[chat_id];
              return res.send('OK');
            }
            const now = getTime();
            const requestId = getRequestId();
            const newBal = parseFloat(u.balance) - amt;
            await dbPost('withdrawals', { telegram_id: chat_id, amount: amt, upi_id: state.payment, status: 'pending', request_id: requestId });
            await dbPatch('users', `telegram_id=eq.${chat_id}`, { balance: newBal < 0 ? 0 : newBal });
            await sendInlineMsg(chat_id,
              `<b>\u23F3 Withdrawal Request Submitted!</b>\n\n<b>\uD83D\uDCCA Request ID: ${requestId}</b>\n<b>\uD83D\uDCB0 Amount: \u20B9${amt}</b>\n<b>\uD83D\uDCF1 Method: ${state.method === 'upi' ? 'UPI' : 'Bank'}</b>\n<b>\uD83D\uDCC5 Date: ${now}</b>`,
              [[{ text: '\uD83D\uDD0D Check Status', callback_data: `status_${requestId}` }]]
            );
            await sendInlineMsg(ADMIN_ID,
              `<b>\uD83D\uDCB8 New Withdraw Request!</b>\n\n<b>\uD83E\uDDD1 User: ${u.name}</b>\n<b>\uD83D\uDCF1 Phone: ${u.phone}</b>\n<b>\uD83D\uDCB0 Amount: \u20B9${amt}</b>\n<b>\uD83D\uDCB3 Payment: ${state.payment}</b>\n<b>\uD83D\uDCC5 Time: ${now}</b>\n<b>\uD83D\uDCCA Request ID: ${requestId}</b>`,
              [[{ text: '\u2705 Approve', callback_data: `admin_approve_${requestId}` }, { text: '\u274C Cancel', callback_data: `admin_cancel_${requestId}` }]]
            );
            delete userState[chat_id];
          }
        }

      } else if (data === 'cancel_withdraw') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        delete userState[chat_id];
        await sendMsg(chat_id, `<b>\u274C Withdrawal Cancelled!</b>`, mainKeyboard);

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
              await sendMsg(chat_id, `<b>\u274C Insufficient balance! Available: \u20B9${parseFloat(u.balance).toFixed(2)}</b>`, mainKeyboard);
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
              txnStore[txnId] = {
                txnId, amount: amt, time: timeStr,
                senderName: u.name, senderPhone: u.phone,
                receiverName: r.name, receiverPhone: r.phone,
                createdAt: Date.now()
              };
              await sendInlineMsg(r.telegram_id,
                `<b>Payment of Rs. ${amt} received</b>\n\nYou have received Rs ${amt} from ${u.name}.\nClick to view details`,
                [[{ text: '\uD83D\uDD0D See Details', callback_data: `recv_txn_${txnId}` }]]
              );
            }
            delete userState[chat_id];
            await sendInlineMsg(chat_id,
              `<b>Paid Successfully to ${state.receiver_name}</b>`,
              [[{ text: '\uD83D\uDD0D See Details', callback_data: `sent_txn_${txnId}` }]]
            );
          }
        }

      } else if (data === 'cancel_transfer') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        delete userState[chat_id];
        await sendMsg(chat_id, `<b>\u274C Transfer Cancelled!</b>`, mainKeyboard);

      } else if (data.startsWith('sent_txn_')) {
        const txnId = data.replace('sent_txn_', '');
        const txn = txnStore[txnId];
        if (txn) {
          await answerAlert(callback_query.id,
            `\u20B9${txn.amount}\nPaid Successfully\n${txn.time}\n\nTo: ${txn.receiverName}\nPhone: ${txn.receiverPhone}\n\nTransaction ID\n${txnId}`
          );
        } else {
          await answerAlert(callback_query.id, 'Transaction details not found.');
        }

      } else if (data.startsWith('recv_txn_')) {
        const txnId = data.replace('recv_txn_', '');
        const txn = txnStore[txnId];
        if (txn) {
          await answerAlert(callback_query.id,
            `\u20B9${txn.amount}\nReceived Successfully\n${txn.time}\n\nFrom: ${txn.senderName}\nPhone: ${txn.senderPhone}\n\nTransaction ID\n${txnId}`
          );
        } else {
          await answerAlert(callback_query.id, 'Transaction details not found.');
        }

      } else if (data === 'show_password') {
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          const newPass = generatePassword();
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { password: hashPassword(newPass) });
          await sendSMS(u.phone, newPass);
          await answerAlert(callback_query.id,
            `\uD83D\uDD11 Login Details\n\nWebsite: cashyfy.site/transactions\n\nPhone: ${u.phone}\nPassword: ${newPass}\n\nUse these to login!`
          );
        }

      } else if (data.startsWith('status_')) {
        const requestId = data.replace('status_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.telegram_id !== chat_id && chat_id !== ADMIN_ID) {
            await answerAlert(callback_query.id, '\u274C Unauthorized!');
            return res.send('OK');
          }
          const statusEmoji = w.status === 'paid' ? '\u2705' : w.status === 'cancelled' ? '\u274C' : '\uD83D\uDD50';
          const statusText = w.status === 'paid' ? 'Paid' : w.status === 'cancelled' ? 'Cancelled' : 'Pending';
          await answerAlert(callback_query.id, `Status: ${statusText} ${statusEmoji}`);
        }

      } else if (data.startsWith('admin_approve_')) {
        if (chat_id !== ADMIN_ID) { await answerAlert(callback_query.id, '\u274C Unauthorized!'); return res.send('OK'); }
        const requestId = data.replace('admin_approve_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.status !== 'pending') { await answerAlert(callback_query.id, '\u26A0\uFE0F Already processed!'); return res.send('OK'); }
          await dbPatch('withdrawals', `request_id=eq.${requestId}`, { status: 'paid' });
          await editMsg(ADMIN_ID, message_id,
            `<b>\uD83D\uDCB8 Withdraw Request</b>\n\n<b>\uD83D\uDCCA Request ID: ${requestId}</b>\n<b>\uD83D\uDCB0 Amount: \u20B9${w.amount}</b>\n<b>\uD83D\uDCB3 Payment: ${w.upi_id}</b>\n\n<b>\u2705 Approved</b>`, []
          );
          await sendMsg(w.telegram_id, `<b>Your withdrawal of \u20B9${parseFloat(w.amount).toFixed(2)} has been approved! \u2705</b>`);
          await answerAlert(callback_query.id, '\u2705 Approved!');
        }

      } else if (data.startsWith('admin_cancel_')) {
        if (chat_id !== ADMIN_ID) { await answerAlert(callback_query.id, '\u274C Unauthorized!'); return res.send('OK'); }
        const requestId = data.replace('admin_cancel_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.status !== 'pending') { await answerAlert(callback_query.id, '\u26A0\uFE0F Already processed!'); return res.send('OK'); }
          await dbPatch('withdrawals', `request_id=eq.${requestId}`, { status: 'cancelled' });
          const users = await dbGet('users', `telegram_id=eq.${w.telegram_id}`);
          if (users.length > 0) {
            const refundBal = parseFloat(users[0].balance) + parseFloat(w.amount);
            await dbPatch('users', `telegram_id=eq.${w.telegram_id}`, { balance: refundBal });
          }
          await editMsg(ADMIN_ID, message_id,
            `<b>\uD83D\uDCB8 Withdraw Request</b>\n\n<b>\uD83D\uDCCA Request ID: ${requestId}</b>\n<b>\uD83D\uDCB0 Amount: \u20B9${w.amount}</b>\n<b>\uD83D\uDCB3 Payment: ${w.upi_id}</b>\n\n<b>\u274C Cancelled</b>`, []
          );
          await sendMsg(w.telegram_id, `<b>\u274C Your withdraw request failed.\n\n\uD83D\uDCB0 \u20B9${parseFloat(w.amount).toFixed(2)} has been refunded to your wallet!</b>`);
          await answerAlert(callback_query.id, '\u274C Cancelled!');
        }

      } else {
        await answerAlert(callback_query.id, '');
      }
      return res.send('OK');
    }

    if (!message) return res.send('OK');
    const chat_id = message.chat.id.toString();
    const name = sanitize(message.from.first_name || 'User');

    if (message.contact) {
      const phone = message.contact.phone_number.replace(/\D/g, '').replace(/^91/, '');
      if (message.contact.user_id && message.contact.user_id.toString() !== chat_id) {
        await sendMsg(chat_id, `<b>\u274C Please share your own contact only!</b>`);
        return res.send('OK');
      }
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length === 0) {
        const existing = await dbGet('users', `phone=eq.${phone}`);
        if (existing.length > 0) {
          await sendMsg(chat_id, `<b>\u274C This phone number is already registered!</b>`);
          return res.send('OK');
        }
        await dbPost('users', { telegram_id: chat_id, name, phone, balance: 0, lifetime_earnings: 0 });
        await sendMsg(chat_id, `<b>\u2705 Registration successful!</b>`, mainKeyboard);
        await sendMsg(chat_id,
          `<b>\uD83D\uDC64 Profile</b>\n\n<b>\uD83D\uDE4C\uD83C\uDFFB User: ${name} \u26A1</b>\n<b>\uD83D\uDCB0 Balance: \u20B90.00</b>\n<b>\uD83E\uDEB2 Lifetime Earnings: \u20B90.00</b>\n<b>\uD83D\uDCF1 Phone: ${phone}</b>`,
          mainKeyboard
        );
      } else {
        await sendMsg(chat_id, `<b>\u2705 Already registered!</b>`, mainKeyboard);
      }
      return res.send('OK');
    }

    const text = message.text || '';
    if (['\uD83D\uDCB0 Withdraw', '\uD83D\uDC64 Profile', '\uD83D\uDCB8 Send Money', '\uD83D\uDCCB Transaction'].includes(text)) {
      delete userState[chat_id];
    }

    if (userState[chat_id]) {
      const state = userState[chat_id].state;
      const mid = userState[chat_id].message_id;

      if (state === 'set_upi') {
        if (isValidUPI(text)) {
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { upi_id: text });
          delete userState[chat_id];
          await sendMsg(chat_id, `<b>\u2705 UPI ID updated!\n\n\uD83D\uDCB3 UPI ID: ${text}</b>`, mainKeyboard);
        } else {
          await sendMsg(chat_id, `<b>\u274C Invalid UPI format!\n\nExample: john.doe@okaxis</b>`);
        }
        return res.send('OK');

      } else if (state === 'set_bank_account') {
        if (/^\d{9,18}$/.test(text)) {
          userState[chat_id] = { state: 'set_bank_ifsc', account: text, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>\uD83C\uDFE6 Please enter your IFSC code:</b>`);
        } else {
          await sendMsg(chat_id, `<b>\u274C Invalid account number!</b>`);
        }
        return res.send('OK');

      } else if (state === 'set_bank_ifsc') {
        if (isValidIFSC(text)) {
          const account = userState[chat_id].account;
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { bank_account: account, bank_ifsc: text.toUpperCase() });
          delete userState[chat_id];
          await sendMsg(chat_id, `<b>\u2705 Bank Details saved!\n\n\uD83C\uDFE6 Account: ${account}\n\uD83D\uDCCB IFSC: ${text.toUpperCase()}</b>`, mainKeyboard);
        } else {
          await sendMsg(chat_id, `<b>\u274C Invalid IFSC! Example: SBIN0001234</b>`);
        }
        return res.send('OK');

      } else if (state === 'withdraw_amount') {
        const amt = parseFloat(text);
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (isNaN(amt) || amt < 10) {
            await sendMsg(chat_id, `<b>\u274C Minimum \u20B910 required!</b>`);
          } else if (amt > parseFloat(u.balance)) {
            await sendMsg(chat_id, `<b>\u274C Insufficient balance!</b>`);
          } else {
            const method = userState[chat_id].method;
            const payment = userState[chat_id].payment;
            userState[chat_id] = { state: 'withdraw_confirm', amount: amt, method, payment, message_id: mid, timestamp: Date.now() };
            const confirmMsgId = await sendInlineMsg(chat_id,
              `<b>\u26A0\uFE0F Withdrawal Confirmation</b>\n\n<b>\uD83D\uDCB0 Amount: \u20B9${amt}</b>\n<b>\uD83D\uDCF1 Method: ${method === 'upi' ? 'UPI' : 'Bank'}</b>\n<b>\uD83D\uDCB8 ${method === 'upi' ? 'UPI ID' : 'Bank'}: ${payment}</b>`,
              [[{ text: '\u2705 Confirm', callback_data: 'approve_withdraw' }, { text: '\u274C Cancel', callback_data: 'cancel_withdraw' }]]
            );
            userState[chat_id].confirmMsgId = confirmMsgId;
            setTimeout(async () => {
              if (confirmMsgId) await deleteMsg(chat_id, confirmMsgId);
              if (userState[chat_id]?.state === 'withdraw_confirm') delete userState[chat_id];
            }, 60000);
          }
        }
        return res.send('OK');

      } else if (state === 'transfer_phone') {
        const phone = text.trim();
        const senders = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (!/^[6-9]\d{9}$/.test(phone)) {
          await sendMsg(chat_id, `<b>\u274C Invalid phone number! Enter valid 10-digit number:</b>`);
        } else if (senders.length > 0 && phone === senders[0].phone) {
          await sendMsg(chat_id, `<b>\u274C You cannot send money to yourself!</b>`, mainKeyboard);
          delete userState[chat_id];
        } else {
          const receivers = await dbGet('users', `phone=eq.${phone}`);
          if (receivers.length === 0) {
            await sendMsg(chat_id, `<b>\u274C This phone number is not registered!</b>`, mainKeyboard);
            delete userState[chat_id];
          } else {
            const r = receivers[0];
            const phoneMsgId = await sendMsg(chat_id,
              `<b>Pay to</b>\n\n<b>Account Holder Name :</b> ${r.name}\n<b>Phone Number :</b> ${maskPhone(phone)}\n\n<b>Enter amount to sent</b>`
            );
            userState[chat_id] = { state: 'transfer_amount', receiver_phone: phone, receiver_name: r.name, phoneMsgId, timestamp: Date.now() };
          }
        }
        return res.send('OK');

      } else if (state === 'transfer_amount') {
        const amt = parseFloat(text);
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (isNaN(amt) || amt <= 0) {
            await sendMsg(chat_id, `<b>\u274C Invalid amount!</b>`);
          } else if (amt > parseFloat(u.balance)) {
            await sendMsg(chat_id, `<b>\u274C Insufficient balance! Available: \u20B9${parseFloat(u.balance).toFixed(2)}</b>`);
          } else {
            if (userState[chat_id].phoneMsgId) await deleteMsg(chat_id, userState[chat_id].phoneMsgId);
            const receiver_phone = userState[chat_id].receiver_phone;
            const receiver_name = userState[chat_id].receiver_name;
            userState[chat_id] = { state: 'transfer_confirm', amount: amt, receiver_phone, receiver_name, timestamp: Date.now() };
            const confirmMsgId = await sendInlineMsg(chat_id,
              `<b>\u26A0\uFE0F Transfer Confirmation</b>\n\n<b>\uD83D\uDCB0 Amount: \u20B9${amt}</b>\n<b>\uD83D\uDC64 To: ${receiver_name}</b>\n<b>\uD83D\uDCF1 Phone: ${maskPhone(receiver_phone)}</b>`,
              [[{ text: '\u2705 Confirm', callback_data: 'confirm_transfer' }, { text: '\u274C Cancel', callback_data: 'cancel_transfer' }]]
            );
            userState[chat_id].confirmMsgId = confirmMsgId;
            setTimeout(async () => {
              if (confirmMsgId) await deleteMsg(chat_id, confirmMsgId);
              if (userState[chat_id]?.state === 'transfer_confirm') delete userState[chat_id];
            }, 60000);
          }
        }
        return res.send('OK');
      }
    }

    if (text === '/start') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length === 0) {
        await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id,
            text: `<b>\uD83D\uDC4B Welcome! Please share your phone number to get started:</b>`,
            parse_mode: 'HTML',
            reply_markup: contactKeyboard
          })
        });
      } else {
        const u = users[0];
        await sendMsg(chat_id,
          `<b>\uD83D\uDC64 Profile</b>\n\n<b>\uD83E\uDDD1 User: ${u.name} \u26A1</b>\n<b>\uD83D\uDCB0 Balance: \u20B9${parseFloat(u.balance).toFixed(2)}</b>\n<b>\uD83D\uDD01 Lifetime Earnings: \u20B9${parseFloat(u.lifetime_earnings).toFixed(2)}</b>\n<b>\uD83D\uDCF1 Phone: ${u.phone}</b>`,
          mainKeyboard
        );
      }

    } else if (text === '\uD83D\uDC64 Profile') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        await sendInlineMsg(chat_id,
          `<b>\uD83D\uDC64 Profile</b>\n\n<b>\uD83D\uDE4C\uD83C\uDFFB User: ${u.name} \u26A1</b>\n<b>\uD83D\uDCB0 Balance: \u20B9${parseFloat(u.balance).toFixed(2)}</b>\n<b>\uD83E\uDEB2 Lifetime Earnings: \u20B9${parseFloat(u.lifetime_earnings).toFixed(2)}</b>\n<b>\uD83D\uDCF1 Phone: ${u.phone}</b>`,
          [
            [{ text: '\uD83D\uDCB8 UPI', callback_data: 'set_upi' }],
            [{ text: '\uD83C\uDFE6 Bank Details', callback_data: 'set_bank' }]
          ]
        );
      }

    } else if (text === '\uD83D\uDCB0 Withdraw') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        if (parseFloat(u.balance) < 10) {
          await sendMsg(chat_id, `<b>\u274C Minimum \u20B910 Required To Withdraw!</b>`, mainKeyboard);
        } else if (u.upi_id && u.bank_account) {
          await sendInlineMsg(chat_id,
            `<b>Choose Payment Method:</b>`,
            [[{ text: '\uD83D\uDCB8 UPI Transfer', callback_data: 'withdraw_upi' }], [{ text: '\uD83C\uDFE6 Bank Transfer', callback_data: 'withdraw_bank' }]]
          );
        } else if (u.upi_id) {
          userState[chat_id] = { state: 'withdraw_amount', method: 'upi', payment: u.upi_id, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>Please enter withdrawal amount (Minimum: \u20B910.00):</b>`);
        } else if (u.bank_account) {
          userState[chat_id] = { state: 'withdraw_amount', method: 'bank', payment: `${u.bank_account} | ${u.bank_ifsc}`, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>Please enter withdrawal amount (Minimum: \u20B910.00):</b>`);
        } else {
          await sendInlineMsg(chat_id,
            `<b>Choose Payment Method:</b>`,
            [[{ text: '\uD83D\uDCB8 UPI Transfer', callback_data: 'withdraw_upi' }], [{ text: '\uD83C\uDFE6 Bank Transfer', callback_data: 'withdraw_bank' }]]
          );
        }
      }

    } else if (text === '\uD83D\uDCB8 Send Money') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        if (parseFloat(u.balance) <= 0) {
          await sendMsg(chat_id, `<b>\u274C Insufficient balance!</b>`, mainKeyboard);
        } else {
          userState[chat_id] = { state: 'transfer_phone', timestamp: Date.now() };
          await sendMsg(chat_id, `<b>Please enter recipient's phone number:</b>`);
        }
      }

    } else if (text === '\uD83D\uDCCB Transaction') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        await sendInlineMsg(chat_id,
          `<b>\uD83D\uDCCB Transaction History</b>\n\n<b>\uD83D\uDC64 ${u.name}</b>\n<b>\uD83D\uDCF1 ${u.phone}</b>\n\n<i>View your complete transaction history or get login password below.</i>`,
          [
            [{ text: '\uD83D\uDCCA See Transaction History', web_app: { url: 'https://cashyfy.site/transactions' } }],
            [{ text: '\uD83D\uDD11 See Password', callback_data: 'show_password' }]
          ]
        );
      }

    } else if (text.startsWith('/pause ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/pause ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: false }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: false }); }
      await sendMsg(ADMIN_ID, `<b>\u23F8\uFE0F ${offerName} — Paused!</b>`);

    } else if (text.startsWith('/resume ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/resume ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: true }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: true }); }
      await sendMsg(ADMIN_ID, `<b>\u25B6\uFE0F ${offerName} — Resumed!</b>`);

    } else if (text === '/offers' && chat_id === ADMIN_ID) {
      const offers = await dbGet('offer_status', `order=offer_name.asc`);
      if (offers.length === 0) { await sendMsg(ADMIN_ID, `<b>\uD83D\uDCCB No offers configured!</b>`); }
      else {
        let msg = `<b>\uD83D\uDCCB Offer Status:</b>\n\n`;
        offers.forEach(o => { msg += `${o.is_active ? '\uD83D\uDFE2' : '\uD83D\uDD34'} <b>${o.offer_name}</b> — ${o.is_active ? 'Active' : 'Paused'}\n`; });
        await sendMsg(ADMIN_ID, msg);
      }

    } else if (text.startsWith('/paid ') && chat_id === ADMIN_ID) {
      const phone = text.split(' ')[1];
      const users = await dbGet('users', `phone=eq.${phone}`);
      if (users.length > 0) {
        const u = users[0];
        const withdrawals = await dbGet('withdrawals', `telegram_id=eq.${u.telegram_id}&status=eq.pending&order=created_at.desc&limit=1`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          await dbPatch('withdrawals', `id=eq.${w.id}`, { status: 'paid' });
          await sendMsg(u.telegram_id, `<b>Your withdrawal of \u20B9${parseFloat(w.amount).toFixed(2)} has been approved! \u2705</b>`);
          await sendMsg(ADMIN_ID, `<b>\u2705 Done — ${u.name} (${u.phone}) — \u20B9${w.amount}</b>`);
        } else { await sendMsg(ADMIN_ID, `<b>\u274C No pending withdrawal for ${phone}</b>`); }
      } else { await sendMsg(ADMIN_ID, `<b>\u274C User not found: ${phone}</b>`); }
    }

  } catch(e) { console.error(e); }
  res.send('OK');
});

app.post('/refer/create', async (req, res) => {
  try {
    const { offer_name, referrer_phone, user_payout, my_payout } = req.body;
    if (!offer_name || !referrer_phone) return res.json({ success: false });
    const code = generateReferCode(offer_name);
    await dbPost('wallet_referrals', { code, offer_name, referrer_phone, user_payout: parseFloat(user_payout) || 0, my_payout: parseFloat(my_payout) || 0 });
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
    console.log('CLICK RECEIVED:', { click_id, offer_name, phone });
    await dbPost('clicks', {
      click_id,
      offer_name: sanitize(offer_name),
      phone: phone ? String(phone) : null,
      referred_by, user_payout, my_payout
    });
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
  try { res.json({ success: true, offers: Object.keys(offerConfig) }); }
  catch(e) { res.json({ success: false }); }
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

// ✅ Web endpoints
app.post('/web/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, error: 'Phone and password required.' });
    const users = await dbGet('users', `phone=eq.${phone}`);
    if (users.length === 0) return res.json({ success: false, error: 'No account found.' });
    const u = users[0];
    if (!u.password) return res.json({ success: false, error: 'Password not set. Use See Password in bot.' });
    if (u.password !== hashPassword(password)) return res.json({ success: false, error: 'Incorrect password.' });
    const token = crypto.randomBytes(32).toString('hex');
    await dbPatch('users', `phone=eq.${phone}`, { web_token: token });
    res.json({ success: true, token, name: u.name, phone: u.phone });
  } catch(e) { res.json({ success: false, error: 'Server error.' }); }
});

app.get('/web/profile', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token required.' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token.' });
    const u = users[0];
    res.json({
      success: true, name: u.name, phone: u.phone,
      balance: parseFloat(u.balance || 0).toFixed(2),
      lifetime_earnings: parseFloat(u.lifetime_earnings || 0).toFixed(2)
    });
  } catch(e) { res.json({ success: false, error: 'Server error.' }); }
});

app.get('/web/txns', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token required.' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token.' });
    const u = users[0];
    const conversions = await dbGet('conversions', `telegram_id=eq.${u.phone}&order=created_at.desc&limit=100`);
    const withdrawals = await dbGet('withdrawals', `telegram_id=eq.${u.telegram_id}&order=created_at.desc&limit=50`);
    const txns = [
      ...conversions.map(c => ({
        id: `TXN${c.id}`, type: 'credit', title: c.offer_name || 'Cashback',
        amount: parseFloat(c.amount || 0),
        status: parseFloat(c.amount) > 0 ? 'success' : 'pending',
        comment: c.event || 'Cashback',
        date: new Date(c.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }),
        method: 'cashback', closing: ''
      })),
      ...withdrawals.map(w => ({
        id: `WD${w.id}`, type: 'debit', title: 'Withdrawal',
        amount: parseFloat(w.amount || 0),
        status: w.status === 'paid' ? 'success' : w.status === 'cancelled' ? 'failed' : 'pending',
        comment: `To: ${w.upi_id}`,
        date: new Date(w.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Kolkata' }),
        method: w.upi_id?.includes('@') ? 'upi' : 'bank', closing: ''
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, txns });
  } catch(e) { res.json({ success: false, error: 'Server error.' }); }
});

app.post('/web/logout', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (token) await dbPatch('users', `web_token=eq.${token}`, { web_token: null });
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

app.post('/web/update-password', async (req, res) => {
  try {
    const token = req.headers['x-token'];
    if (!token) return res.json({ success: false, error: 'Token required.' });
    const users = await dbGet('users', `web_token=eq.${token}`);
    if (users.length === 0) return res.json({ success: false, error: 'Invalid token.' });
    const u = users[0];
    const { current_password, new_password } = req.body;
    if (u.password !== hashPassword(current_password)) return res.json({ success: false, error: 'Current password incorrect.' });
    await dbPatch('users', `phone=eq.${u.phone}`, { password: hashPassword(new_password) });
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Server error.' }); }
});

app.get('/postback', async (req, res) => {
  try {
    const { click_id = 'N/A', event = 'N/A', token } = req.query;
    if (token !== POSTBACK_TOKEN) { return res.status(403).send('Forbidden'); }
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!rateLimit(ip, 50, 60000)) return res.status(429).send('Too Many Requests');
    console.log('POSTBACK RECEIVED:', req.query);
    let runTime = getTime(), offer = 'Unknown', phone = null, referred_by = null, user_payout_custom = 0, my_payout_custom = 0;
    try {
      const clicks = await dbGet('clicks', `click_id=eq.${encodeURIComponent(click_id)}&order=created_at.desc&limit=1`);
      if (clicks.length > 0) {
        offer = clicks[0].offer_name; phone = clicks[0].phone ? String(clicks[0].phone) : null;
        runTime = new Date(clicks[0].created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).replace(',', '');
        referred_by = clicks[0].referred_by; user_payout_custom = clicks[0].user_payout || 0; my_payout_custom = clicks[0].my_payout || 0;
      }
    } catch(e) {}
    if (!phone) { console.log('NO PHONE FOUND FOR CLICK:', click_id); return res.send('OK'); }
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
        await sendMsg(u.telegram_id, `<b>\uD83E\uDDE7 Cashback Credited \uD83E\uDDE7</b>\n\n<b>\uD83D\uDCB6 Amount  = \u20B9${amount}</b>\n<b>\uD83D\uDCB0 Updated Balance = \u20B9${newBal.toFixed(2)}</b>\n\n<b>\uD83D\uDCA1 Comment = ${comment}</b>`);
        if (referred_by && my_payout_custom > 0) {
          const referrers = await dbGet('users', `phone=eq.${referred_by}`);
          if (referrers.length > 0) {
            const r = referrers[0];
            const newRefBal = parseFloat(r.balance) + my_payout_custom;
            const newRefLife = parseFloat(r.lifetime_earnings) + my_payout_custom;
            await dbPatch('users', `phone=eq.${referred_by}`, { balance: newRefBal, lifetime_earnings: newRefLife });
            await sendMsg(r.telegram_id, `<b>\uD83E\uDDE7 Cashback Credited \uD83E\uDDE7</b>\n\n<b>\uD83D\uDCB6 Amount  = \u20B9${my_payout_custom}</b>\n<b>\uD83D\uDCB0 Updated Balance = \u20B9${newRefBal.toFixed(2)}</b>\n\n<b>\uD83D\uDCA1 Comment = Refer Bonus - ${offer}</b>`);
          }
        }
      } else if (amount > 0) {
        await sendMsg(u.telegram_id, `<b>\uD83E\uDDE7 Cashback Credited \uD83E\uDDE7</b>\n\n<b>\uD83D\uDCB6 Amount  = \u20B9${amount}</b>\n<b>\uD83D\uDCB0 Updated Balance = \u20B9${parseFloat(u.balance).toFixed(2)}</b>\n\n<b>\uD83D\uDCA1 Comment = ${comment}</b>`);
      }
    }
    const trackTime = getTime();
    let msg = '';
    if (referred_by && amount > 1) {
      msg = `<b>Conversation Count \uD83D\uDC9D</b>\n\n<b>\uD83C\uDF81 Offer Name - ${offer}</b>\n\n<b>User Id : ${maskPhone(phone)}</b>\n<b>User Amount : \u20B9${amount}</b>\n<b>\uD83E\uDD73 User Payment : ${userPayment}</b>\n\n<b>Refer Id : ${maskPhone(referred_by)}</b>\n<b>Refer Amount : \u20B9${my_payout_custom}</b>\n<b>\uD83E\uDD73 Refer Payment : Success</b>\n\n<b>Run Time - ${runTime}</b>\n<b>Track Time - ${trackTime}</b>\n\n<b>Powered By - CashyFy</b>`;
    } else {
      msg = `<b>Conversation Count \uD83D\uDC9D</b>\n\n<b>\uD83C\uDF81 Offer Name - ${offer}</b>\n\n<b>User Id : ${maskPhone(phone)}</b>\n<b>User Amount : \u20B9${amount}</b>\n<b>\uD83E\uDD73 User Payment : ${userPayment}</b>\n\n<b>Run Time - ${runTime}</b>\n<b>Track Time - ${trackTime}</b>\n\n<b>Powered By - CashyFy</b>`;
    }
    await sendMsg(CHAT_ID, msg);
  } catch(e) { console.error(e); }
  res.send('OK');
});

app.get('/', (req, res) => res.send('CashyFy Wallet Bot Running! \u2705'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

setInterval(async () => {
  try { await fetchWithTimeout('https://cashyfy-1.onrender.com/'); } catch(e) {}
}, 14 * 60 * 1000);
