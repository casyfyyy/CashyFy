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

const mainKeyboard = [['💰 Withdraw', '👤 Profile'], ['💸 Send Money', '📋 Transaction']];
const contactKeyboard = {
  keyboard: [[{ text: '📱 Share Contact', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true
};
const userState = {};

// ✅ In-memory txn store for See Details
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
  // Clean old txns older than 24h
  for (const id in txnStore) {
    if (now - txnStore[id].createdAt > 24 * 60 * 60 * 1000) delete txnStore[id];
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
          await editMsg(chat_id, message_id, `<b>💸 UPI Details:</b>\n\n<b>UPI ID: ${users[0].upi_id}</b>`, [[{ text: '✏️ Update', callback_data: 'update_upi' }]]);
        } else {
          await editMsg(chat_id, message_id, `<b>💸 UPI Details:\n\nNo Upi Details saved.</b>`, [[{ text: '✏️ Update', callback_data: 'update_upi' }]]);
        }

      } else if (data === 'update_upi') {
        await answerAlert(callback_query.id, '');
        userState[chat_id] = { state: 'set_upi', message_id: null, timestamp: Date.now() };
        await sendMsg(chat_id, `<b>Please enter your UPI ID (format: alphanumeric@alphabets)\n\nExample: john.doe@okaxis</b>`);

      } else if (data === 'set_bank') {
        await answerAlert(callback_query.id, '');
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0 && users[0].bank_account) {
          await editMsg(chat_id, message_id, `<b>🏦 Bank Details:</b>\n\n<b>Account Number: ${users[0].bank_account}</b>\n<b>IFSC Code: ${users[0].bank_ifsc}</b>`, [[{ text: '✏️ Update', callback_data: 'update_bank' }]]);
        } else {
          await editMsg(chat_id, message_id, `<b>🏦 Bank Details:\n\nNo bank details saved.</b>`, [[{ text: '✏️ Update', callback_data: 'update_bank' }]]);
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
            await editMsg(chat_id, message_id, `<b>💸 UPI Details:\n\nNo UPI saved.</b>`, [[{ text: '✏️ Update', callback_data: 'update_upi' }]]);
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
            await editMsg(chat_id, message_id, `<b>🏦 Bank Details:\n\nNo bank details saved.</b>`, [[{ text: '✏️ Update', callback_data: 'update_bank' }]]);
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

      // ✅ FIXED: confirm_transfer — properly in callback section
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

            // ✅ Sender balance deduct
            await dbPatch('users', `phone=eq.${u.phone}`, { balance: senderNewBal < 0 ? 0 : senderNewBal });

            // ✅ Receiver balance add
            const receivers = await dbGet('users', `phone=eq.${state.receiver_phone}`);
            if (receivers.length > 0) {
              const r = receivers[0];
              const receiverNewBal = parseFloat(r.balance) + amt;
              await dbPatch('users', `phone=eq.${state.receiver_phone}`, { balance: receiverNewBal });

              // ✅ Store txn details
              txnStore[txnId] = {
                txnId,
                amount: amt,
                time: timeStr,
                senderName: u.name,
                senderPhone: u.phone,
                receiverName: r.name,
                receiverPhone: r.phone,
                createdAt: Date.now()
              };

              // ✅ Receiver message
              await sendInlineMsg(r.telegram_id,
                `<b>Payment of Rs. ${amt} received</b>\n\nYou have received Rs ${amt} from ${u.name}.\nClick to view details`,
                [[{ text: '🔍 See Details', callback_data: `recv_txn_${txnId}` }]]
              );
            }

            delete userState[chat_id];

            // ✅ Sender success message
            await sendInlineMsg(chat_id,
              `<b>Paid Successfully to ${state.receiver_name}</b>`,
              [[{ text: '🔍 See Details', callback_data: `sent_txn_${txnId}` }]]
            );
          }
        }

      } else if (data === 'cancel_transfer') {
        await answerAlert(callback_query.id, '');
        if (message_id) await deleteMsg(chat_id, message_id);
        delete userState[chat_id];
        await sendMsg(chat_id, `<b>❌ Transfer Cancelled!</b>`, mainKeyboard);

      // ✅ Sender See Details popup
      } else if (data.startsWith('sent_txn_')) {
        const txnId = data.replace('sent_txn_', '');
        const txn = txnStore[txnId];
        if (txn) {
          await answerAlert(callback_query.id,
            `₹${txn.amount}\nPaid Successfully\n${txn.time}\n\nTo: ${txn.receiverName}\nPhone: ${txn.receiverPhone}\n\nTransaction ID\n${txnId}`
          );
        } else {
          await answerAlert(callback_query.id, 'Transaction details not found.');
        }

      // ✅ Receiver See Details popup
      } else if (data.startsWith('recv_txn_')) {
        const txnId = data.replace('recv_txn_', '');
        const txn = txnStore[txnId];
        if (txn) {
          await answerAlert(callback_query.id,
            `₹${txn.amount}\nReceived Successfully\n${txn.time}\n\nFrom: ${txn.senderName}\nPhone: ${txn.senderPhone}\n\nTransaction ID\n${txnId}`
          );
        } else {
          await answerAlert(callback_query.id, 'Transaction details not found.');
        }

      // ✅ FIXED: show_password — properly in callback section
      } else if (data === 'show_password') {
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          const newPass = generatePassword();
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { password: hashPassword(newPass) });
          await sendSMS(u.phone, newPass);
          await answerAlert(callback_query.id,
            `🔑 Your Password:\n${newPass}\n\nUse this to login at:\ncashyfy.site/login\n\nNumber: ${u.phone}\nPassword: ${newPass}`
          );
        }

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
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.status !== 'pending') { await answerAlert(callback_query.id, '⚠️ Already processed!'); return res.send('OK'); }
          await dbPatch('withdrawals', `request_id=eq.${requestId}`, { status: 'paid' });
          await editMsg(ADMIN_ID, message_id, `<b>💸 Withdraw Request</b>\n\n<b>📊 Request ID: ${requestId}</b>\n<b>💰 Amount: ₹${w.amount}</b>\n<b>💳 Payment: ${w.upi_id}</b>\n\n<b>✅ Approved</b>`, []);
          await sendMsg(w.telegram_id, `<b>Your withdrawal request of ₹${parseFloat(w.amount).toFixed(2)} has been approved! ✅</b>`);
          await answerAlert(callback_query.id, '✅ Approved!');
        }

      } else if (data.startsWith('admin_cancel_')) {
        if (chat_id !== ADMIN_ID) { await answerAlert(callback_query.id, '❌ Unauthorized!'); return res.send('OK'); }
        const requestId = data.replace('admin_cancel_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.status !== 'pending') { await answerAlert(callback_query.id, '⚠️ Already processed!'); return res.send('OK'); }
          await dbPatch('withdrawals', `request_id=eq.${requestId}`, { status: 'cancelled' });
          const users = await dbGet('users', `telegram_id=eq.${w.telegram_id}`);
          if (users.length > 0) {
            const refundBal = parseFloat(users[0].balance) + parseFloat(w.amount);
            await dbPatch('users', `telegram_id=eq.${w.telegram_id}`, { balance: refundBal });
          }
          await editMsg(ADMIN_ID, message_id, `<b>💸 Withdraw Request</b>\n\n<b>📊 Request ID: ${requestId}</b>\n<b>💰 Amount: ₹${w.amount}</b>\n<b>💳 Payment: ${w.upi_id}</b>\n\n<b>❌ Cancelled</b>`, []);
          await sendMsg(w.telegram_id, `<b>❌ Your withdraw request failed. Please contact CashFlix support.</b>\n\n<b>💰 ₹${parseFloat(w.amount).toFixed(2)} has been refunded to your wallet!</b>`);
          await answerAlert(callback_query.id, '❌ Cancelled!');
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
        await sendMsg(chat_id, `<b>✅ Registration successful! You can now use the bot.</b>`, mainKeyboard);
        await sendMsg(chat_id, `<b>👤 Profile</b>\n\n<b>🙌🏻 User: ${name} ⚡</b>\n<b>💰 Balance: ₹0.00</b>\n<b>🪢 Lifetime Earnings: ₹0.00</b>\n<b>📱 Phone: ${phone}</b>`, mainKeyboard);
      } else {
        await sendMsg(chat_id, `<b>✅ Already registered!</b>`, mainKeyboard);
      }
      return res.send('OK');
    }

    const text = message.text || '';
    if (['👤 Profile', '💰 Withdraw', '💸 Send Money', '📋 Transaction'].includes(text)) delete userState[chat_id];

    if (userState[chat_id]) {
      const state = userState[chat_id].state;
      const mid = userState[chat_id].message_id;

      if (state === 'set_upi') {
        if (isValidUPI(text)) {
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { upi_id: text });
          delete userState[chat_id];
          await sendMsg(chat_id, `<b>✅ UPI ID updated successfully!</b>\n\n<b>💳 UPI ID: ${text}</b>`, mainKeyboard);
        } else {
          await sendMsg(chat_id, `<b>❌ Invalid UPI format! Please try again.\n\nExample: john.doe@okaxis</b>`);
        }
        return res.send('OK');

      } else if (state === 'set_bank_account') {
        if (/^\d{9,18}$/.test(text)) {
          userState[chat_id] = { state: 'set_bank_ifsc', account: text, message_id: null, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>🏦 Please enter your IFSC code:</b>`);
        } else {
          await sendMsg(chat_id, `<b>❌ Invalid account number! Please enter again:</b>`);
        }
        return res.send('OK');

      } else if (state === 'set_bank_ifsc') {
        if (isValidIFSC(text)) {
          const account = userState[chat_id].account;
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { bank_account: account, bank_ifsc: text.toUpperCase() });
          delete userState[chat_id];
          await sendMsg(chat_id, `<b>✅ Bank Details updated successfully!</b>\n\n<b>🏦 Account: ${account}</b>\n<b>📋 IFSC: ${text.toUpperCase()}</b>`, mainKeyboard);
        } else {
          await sendMsg(chat_id, `<b>❌ Invalid IFSC code format. Please enter a valid IFSC code (e.g., SBIN0001234). Please try again</b>`);
        }
        return res.send('OK');

      } else if (state === 'withdraw_amount') {
        const amt = parseFloat(text);
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (isNaN(amt) || amt < 10) {
            await sendMsg(chat_id, `<b>❌ Minimum ₹10 required!</b>`);
          } else if (amt > parseFloat(u.balance)) {
            await sendMsg(chat_id, `<b>❌ Insufficient balance!</b>`);
          } else {
            const method = userState[chat_id].method;
            const payment = userState[chat_id].payment;
            userState[chat_id] = { state: 'withdraw_confirm', amount: amt, method, payment, message_id: mid, timestamp: Date.now() };
            const confirmMsgId = await sendInlineMsg(chat_id,
              `<b>⚠️ Withdrawal Confirmation</b>\n\n<b>💰 Amount: ₹${amt}</b>\n<b>📱 Method: ${method === 'upi' ? 'UPI' : 'Bank'}</b>\n<b>💸 ${method === 'upi' ? 'UPI ID' : 'Bank'}: ${payment}</b>`,
              [[{ text: '✅ Confirm', callback_data: 'approve_withdraw' }, { text: '❌ Cancel', callback_data: 'cancel_withdraw' }]]
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
          await sendMsg(chat_id, `<b>❌ Invalid phone number! Please enter a valid 10-digit number:</b>`);
        } else if (senders.length > 0 && phone === senders[0].phone) {
          await sendMsg(chat_id, `<b>❌ You cannot send money to yourself!</b>`, mainKeyboard);
          delete userState[chat_id];
        } else {
          const receivers = await dbGet('users', `phone=eq.${phone}`);
          if (receivers.length === 0) {
            await sendMsg(chat_id, `<b>❌ This phone number is not registered!</b>`, mainKeyboard);
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
            await sendMsg(chat_id, `<b>❌ Invalid amount! Please enter a valid amount:</b>`);
          } else if (amt > parseFloat(u.balance)) {
            await sendMsg(chat_id, `<b>❌ Insufficient balance! Available: ₹${parseFloat(u.balance).toFixed(2)}</b>`);
          } else {
            // ✅ Delete phone msg
            if (userState[chat_id].phoneMsgId) await deleteMsg(chat_id, userState[chat_id].phoneMsgId);

            const receiver_phone = userState[chat_id].receiver_phone;
            const receiver_name = userState[chat_id].receiver_name;

            userState[chat_id] = { state: 'transfer_confirm', amount: amt, receiver_phone, receiver_name, timestamp: Date.now() };

            const confirmMsgId = await sendInlineMsg(chat_id,
              `<b>⚠️ Transfer Confirmation</b>\n\n<b>💰 Amount: ₹${amt}</b>\n<b>👤 To: ${receiver_name}</b>\n<b>📱 Phone: ${maskPhone(receiver_phone)}</b>`,
              [[{ text: '✅ Confirm', callback_data: 'confirm_transfer' }, { text: '❌ Cancel', callback_data: 'cancel_transfer' }]]
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
          body: JSON.stringify({ chat_id, text: `<b>👋 Welcome! To use this bot, please share your phone number:</b>`, parse_mode: 'HTML', reply_markup: contactKeyboard })
        });
      } else {
        const u = users[0];
        await sendMsg(chat_id, `<b>👤 Profile</b>\n\n<b>🧑 User: ${u.name} ⚡</b>\n<b>💰 Balance: ₹${parseFloat(u.balance).toFixed(2)}</b>\n<b>🔁 Lifetime Earnings: ₹${parseFloat(u.lifetime_earnings).toFixed(2)}</b>\n<b>📱 Phone: ${u.phone}</b>`, mainKeyboard);
      }

    } else if (text === '👤 Profile') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        await sendInlineMsg(chat_id,
          `<b>👤 Profile</b>\n\n<b>🙌🏻 User: ${u.name} ⚡</b>\n<b>💰 Balance: ₹${parseFloat(u.balance).toFixed(2)}</b>\n<b>🪢 Lifetime Earnings: ₹${parseFloat(u.lifetime_earnings).toFixed(2)}</b>\n<b>📱 Phone: ${u.phone}</b>`,
          [[{ text: '💸 UPI', callback_data: 'set_upi' }], [{ text: '🏦 Bank Details', callback_data: 'set_bank' }]]
        );
      }

    } else if (text === '💰 Withdraw') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        if (parseFloat(u.balance) < 10) {
          await sendMsg(chat_id, `<b>❌ Minimum ₹10 Required To Withdraw!</b>`, mainKeyboard);
        } else if (u.upi_id && u.bank_account) {
          await sendInlineMsg(chat_id, `<b>Choose Payment Method:</b>`, [[{ text: '💸 UPI Transfer', callback_data: 'withdraw_upi' }], [{ text: '🏦 Bank Transfer', callback_data: 'withdraw_bank' }]]);
        } else if (u.upi_id) {
          userState[chat_id] = { state: 'withdraw_amount', method: 'upi', payment: u.upi_id, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>Please enter withdrawal amount (Minimum: ₹10.00):</b>`);
        } else if (u.bank_account) {
          userState[chat_id] = { state: 'withdraw_amount', method: 'bank', payment: `${u.bank_account} | ${u.bank_ifsc}`, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>Please enter withdrawal amount (Minimum: ₹10.00):</b>`);
        } else {
          await sendInlineMsg(chat_id, `<b>Choose Payment Method:</b>`, [[{ text: '💸 UPI Transfer', callback_data: 'withdraw_upi' }], [{ text: '🏦 Bank Transfer', callback_data: 'withdraw_bank' }]]);
        }
      }

    } else if (text === '💸 Send Money') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        if (parseFloat(u.balance) <= 0) {
          await sendMsg(chat_id, `<b>❌ Insufficient balance!</b>`, mainKeyboard);
        } else {
          userState[chat_id] = { state: 'transfer_phone', timestamp: Date.now() };
          await sendMsg(chat_id, `<b>Please enter recipient's phone number:</b>`);
        }
      }

    } else if (text === '📋 Transaction') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        await sendInlineMsg(chat_id,
          `<b>📋 Transaction</b>\n\nView your complete transaction history on the website.`,
          [
            [{ text: '📊 See Transaction History', url: 'https://cashyfy.site/transactions' }],
            [{ text: '🔑 See Password', callback_data: 'show_password' }]
          ]
        );
      }

    } else if (text.startsWith('/pause ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/pause ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: false }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: false }); }
      await sendMsg(ADMIN_ID, `<b>⏸️ ${offerName} — Paused Successfully!</b>`);

    } else if (text.startsWith('/resume ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/resume ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: true }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: true }); }
      await sendMsg(ADMIN_ID, `<b>▶️ ${offerName} — Resumed Successfully!</b>`);

    } else if (text === '/offers' && chat_id === ADMIN_ID) {
      const offers = await dbGet('offer_status', `order=offer_name.asc`);
      if (offers.length === 0) { await sendMsg(ADMIN_ID, `<b>📋 No offers configured yet!</b>`); }
      else {
        let msg = `<b>📋 Offer Status:</b>\n\n`;
        offers.forEach(o => { msg += `${o.is_active ? '▶️' : '⏸️'} <b>${o.offer_name}</b> — ${o.is_active ? 'Active' : 'Paused'}\n`; });
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
          await sendMsg(u.telegram_id, `<b>Your withdrawal request of ₹${parseFloat(w.amount).toFixed(2)} has been approved! ✅</b>`);
          await sendMsg(ADMIN_ID, `<b>✅ Payment sent to ${u.name} (${u.phone}) — ₹${w.amount}</b>`);
        } else { await sendMsg(ADMIN_ID, `<b>❌ Koi pending withdrawal nahi mila ${phone} ke liye!</b>`); }
      } else { await sendMsg(ADMIN_ID, `<b>❌ User nahi mila: ${phone}</b>`); }
    }

  } catch(e) { console.error(e); }
  res.send('OK');
});

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
      if (referral.length > 0) { referred_by = referral[0].referrer_phone; user_payout = referral[0].user_payout; my_payout = referral[0].my_payout; }
    }
    console.log('CLICK RECEIVED:', { click_id, offer_name, phone });
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
    res.json({ success: true, payout: config.trialAmt, is_acti
