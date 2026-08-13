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
const ADMIN_ID = process.env.ADMIN_ID || '8897413984';
const POSTBACK_TOKEN = process.env.POSTBACK_TOKEN || 'cashf';

const offerConfig = {
  'Waves': { installAmt: 0.1, trialAmt: 3, installBalance: false, trialBalance: true, installComment: 'Waves Install', trialComment: 'Waves Signup' },
  'PolicyBazar': { installAmt: 0.1, trialAmt: 5, installBalance: false, trialBalance: true, installComment: 'PolicyBazar Install', trialComment: 'PolicyBazar Register' },
  'Bharat Ryd': { installAmt: 0.1, trialAmt: 4, installBalance: false, trialBalance: true, installComment: 'Bharat Ryd Install', trialComment: 'Bharat Ryd Register' },
  'Jigri Super': { installAmt: 0.1, trialAmt: 45, installBalance: false, trialBalance: true, installComment: 'Jigri Super Install', trialComment: 'Jigri Super Deposit' },
  'FRIENDSHIP': { installAmt: 0.1, trialAmt: 43, installBalance: false, trialBalance: true, installComment: 'Friendship Install', trialComment: 'Friendship Deposit' },
  'Incred Gold': { installAmt: 0.1, trialAmt: 22, installBalance: false, trialBalance: true, installComment: 'Incred Gold Install', trialComment: 'Incred Gold Complete' },
  'StoryTv Fire': { installAmt: 0.1, trialAmt: 22, installBalance: false, trialBalance: true, installComment: 'StoryTv Install', trialComment: 'StoryTv Register' }
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
  return phone.slice(0, 4) + '••••' + phone.slice(-2);
}

function getTime() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }).replace(',', '');
}

function getRequestId() {
  return 'TXN' + Math.floor(100000 + Math.random() * 900000).toString();
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

const mainKeyboard = [['💰 Withdraw', '👤 Profile'], ['🔄 Transfer', '📊 History']];
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
  console.log('🧹 Memory cleanup done');
}, 30 * 60 * 1000);

app.post('/webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;

    if (callback_query) {
      const chat_id = callback_query.from.id.toString();
      const data = callback_query.data;
      const message_id = callback_query.message?.message_id;

      if (data === 'set_upi') {
        userState[chat_id] = { state: 'set_upi', timestamp: Date.now() };
        await sendMsg(chat_id, `<b>💳 Enter your UPI ID:</b>\n\nExample: <code>name@okaxis</code>`);

      } else if (data === 'set_bank') {
        userState[chat_id] = { state: 'set_bank_account', timestamp: Date.now() };
        await sendMsg(chat_id, `<b>🏦 Enter your Account Number:</b>`);

      } else if (data === 'withdraw_upi') {
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          userState[chat_id] = { state: 'withdraw_amount', method: 'upi', payment: u.upi_id, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>💸 Enter Withdrawal Amount</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}\n<b>Minimum:</b> ₹10`);
        }

      } else if (data === 'withdraw_bank') {
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          userState[chat_id] = { state: 'withdraw_amount', method: 'bank', payment: `${u.bank_account} | ${u.bank_ifsc}`, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>💸 Enter Withdrawal Amount</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}\n<b>Minimum:</b> ₹10`);
        }

      } else if (data.startsWith('admin_approve_')) {
        if (chat_id !== ADMIN_ID) return res.send('OK');
        const requestId = data.replace('admin_approve_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.status !== 'pending') return res.send('OK');
          await dbPatch('withdrawals', `request_id=eq.${requestId}`, { status: 'paid' });
          await editMsg(ADMIN_ID, message_id,
            `<b>✅ Withdrawal Approved</b>\n\n<b>ID:</b> ${requestId}\n<b>Amount:</b> ₹${w.amount}\n<b>Payment:</b> ${w.upi_id}\n\n<i>Processed at ${getTime()}</i>`, []
          );
          await sendMsg(w.telegram_id,
            `<b>🎉 Withdrawal Approved!</b>\n\n<b>Your withdrawal of ₹${parseFloat(w.amount).toFixed(2)} has been processed successfully.</b>\n\n<i>Funds will be credited within 24 hours.</i>`
          );
        }

      } else if (data.startsWith('admin_cancel_')) {
        if (chat_id !== ADMIN_ID) return res.send('OK');
        const requestId = data.replace('admin_cancel_', '');
        const withdrawals = await dbGet('withdrawals', `request_id=eq.${requestId}`);
        if (withdrawals.length > 0) {
          const w = withdrawals[0];
          if (w.status !== 'pending') return res.send('OK');
          await dbPatch('withdrawals', `request_id=eq.${requestId}`, { status: 'cancelled' });
          const users = await dbGet('users', `telegram_id=eq.${w.telegram_id}`);
          if (users.length > 0) {
            const refundBal = parseFloat(users[0].balance) + parseFloat(w.amount);
            await dbPatch('users', `telegram_id=eq.${w.telegram_id}`, { balance: refundBal });
          }
          await editMsg(ADMIN_ID, message_id,
            `<b>❌ Withdrawal Cancelled</b>\n\n<b>ID:</b> ${requestId}\n<b>Amount:</b> ₹${w.amount}\n\n<i>Amount refunded to user wallet.</i>`, []
          );
          await sendMsg(w.telegram_id,
            `<b>❌ Withdrawal Declined</b>\n\n<b>Your withdrawal of ₹${parseFloat(w.amount).toFixed(2)} was not processed.</b>\n\n<b>✅ ₹${parseFloat(w.amount).toFixed(2)} has been refunded to your wallet.</b>`
          );
        }
      }
      return res.send('OK');
    }

    if (!message) return res.send('OK');
    const chat_id = message.chat.id.toString();
    const name = sanitize(message.from?.first_name || 'User');

    if (message.contact) {
      const phone = message.contact.phone_number.replace(/\D/g, '').replace(/^91/, '');
      if (message.contact.user_id && message.contact.user_id.toString() !== chat_id) {
        await sendMsg(chat_id, `<b>⚠️ Please share your own contact number only.</b>`);
        return res.send('OK');
      }
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length === 0) {
        const existing = await dbGet('users', `phone=eq.${phone}`);
        if (existing.length > 0) {
          await sendMsg(chat_id, `<b>⚠️ This number is already registered with another account.</b>`);
          return res.send('OK');
        }
        await dbPost('users', { telegram_id: chat_id, name, phone, balance: 0, lifetime_earnings: 0 });
        await sendMsg(chat_id,
          `<b>🎉 Welcome to Cashyfy, ${name}!</b>\n\n<b>Your wallet is ready.</b>\n\n<b>📱 Phone:</b> ${phone}\n<b>💰 Balance:</b> ₹0.00\n\n<i>Complete offers to earn cashback!</i>`,
          mainKeyboard
        );
      } else {
        const u = users[0];
        await sendMsg(chat_id,
          `<b>✅ Already Registered</b>\n\n<b>Welcome back, ${u.name}!</b>\n<b>💰 Balance:</b> ₹${parseFloat(u.balance).toFixed(2)}`,
          mainKeyboard
        );
      }
      return res.send('OK');
    }

    const text = message.text || '';
    if (['👤 Profile', '💰 Withdraw', '🔄 Transfer', '📊 History'].includes(text)) delete userState[chat_id];

    if (userState[chat_id]) {
      const state = userState[chat_id].state;

      if (state === 'set_upi') {
        if (isValidUPI(text)) {
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { upi_id: text });
          delete userState[chat_id];
          await sendMsg(chat_id, `<b>✅ UPI ID Updated</b>\n\n<b>💳 UPI:</b> ${text}`, mainKeyboard);
        } else {
          await sendMsg(chat_id, `<b>⚠️ Invalid UPI format.</b>\n\nExample: <code>name@okaxis</code>`);
        }
        return res.send('OK');

      } else if (state === 'set_bank_account') {
        if (/^\d{9,18}$/.test(text)) {
          userState[chat_id] = { state: 'set_bank_ifsc', account: text, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>🏦 Enter your IFSC Code:</b>\n\nExample: <code>SBIN0001234</code>`);
        } else {
          await sendMsg(chat_id, `<b>⚠️ Invalid account number. Please try again.</b>`);
        }
        return res.send('OK');

      } else if (state === 'set_bank_ifsc') {
        if (isValidIFSC(text)) {
          const account = userState[chat_id].account;
          await dbPatch('users', `telegram_id=eq.${chat_id}`, { bank_account: account, bank_ifsc: text.toUpperCase() });
          delete userState[chat_id];
          await sendMsg(chat_id, `<b>✅ Bank Details Saved</b>\n\n<b>🏦 Account:</b> ${account}\n<b>📋 IFSC:</b> ${text.toUpperCase()}`, mainKeyboard);
        } else {
          await sendMsg(chat_id, `<b>⚠️ Invalid IFSC code.</b>\n\nExample: <code>SBIN0001234</code>`);
        }
        return res.send('OK');

      } else if (state === 'withdraw_amount') {
        const amt = parseFloat(text);
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (isNaN(amt) || amt < 10) {
            await sendMsg(chat_id, `<b>⚠️ Minimum withdrawal amount is ₹10.</b>`);
          } else if (amt > parseFloat(u.balance)) {
            await sendMsg(chat_id, `<b>⚠️ Insufficient balance.</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}`);
          } else {
            const method = userState[chat_id].method;
            const payment = userState[chat_id].payment;
            const requestId = getRequestId();
            const newBal = parseFloat(u.balance) - amt;
            await dbPost('withdrawals', { telegram_id: chat_id, amount: amt, upi_id: payment, status: 'pending', request_id: requestId });
            await dbPatch('users', `telegram_id=eq.${chat_id}`, { balance: newBal < 0 ? 0 : newBal });
            delete userState[chat_id];
            await sendMsg(chat_id,
              `<b>⏳ Withdrawal Requested</b>\n\n<b>💰 Amount:</b> ₹${amt}\n<b>📱 Method:</b> ${method === 'upi' ? 'UPI' : 'Bank Transfer'}\n<b>💳 Payment:</b> ${payment}\n<b>🔖 Reference:</b> ${requestId}\n\n<i>You'll be notified once processed.</i>`,
              mainKeyboard
            );
            await sendInlineMsg(ADMIN_ID,
              `<b>💸 New Withdrawal Request</b>\n\n<b>👤 User:</b> ${u.name}\n<b>📱 Phone:</b> ${u.phone}\n<b>💰 Amount:</b> ₹${amt}\n<b>💳 Payment:</b> ${payment}\n<b>🔖 Reference:</b> ${requestId}\n<b>🕐 Time:</b> ${getTime()}`,
              [[{ text: '✅ Approve', callback_data: `admin_approve_${requestId}` }], [{ text: '❌ Cancel', callback_data: `admin_cancel_${requestId}` }]]
            );
          }
        }
        return res.send('OK');

      } else if (state === 'transfer_phone') {
        const phone = text.trim();
        const senders = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (!/^[6-9]\d{9}$/.test(phone)) {
          await sendMsg(chat_id, `<b>⚠️ Invalid phone number.</b>\n\nEnter a valid 10-digit number:`);
        } else if (senders.length > 0 && phone === senders[0].phone) {
          await sendMsg(chat_id, `<b>⚠️ You cannot transfer to yourself.</b>`, mainKeyboard);
          delete userState[chat_id];
        } else {
          const receivers = await dbGet('users', `phone=eq.${phone}`);
          if (receivers.length === 0) {
            await sendMsg(chat_id, `<b>⚠️ No account found with this number.</b>\n\nThe recipient must be registered on Cashyfy.`, mainKeyboard);
            delete userState[chat_id];
          } else {
            userState[chat_id] = { state: 'transfer_amount', receiver_phone: phone, receiver_name: receivers[0].name, timestamp: Date.now() };
            await sendMsg(chat_id,
              `<b>👤 Recipient Found</b>\n\n<b>Name:</b> ${receivers[0].name}\n<b>Phone:</b> ${maskPhone(phone)}\n\n<b>💰 Enter the amount to transfer:</b>`
            );
          }
        }
        return res.send('OK');

      } else if (state === 'transfer_amount') {
        const amt = parseFloat(text);
        const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
        if (users.length > 0) {
          const u = users[0];
          if (isNaN(amt) || amt <= 0) {
            await sendMsg(chat_id, `<b>⚠️ Invalid amount. Please enter a valid number:</b>`);
          } else if (amt > parseFloat(u.balance)) {
            await sendMsg(chat_id, `<b>⚠️ Insufficient balance.</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}`);
          } else {
            const receiver_phone = userState[chat_id].receiver_phone;
            const receiver_name = userState[chat_id].receiver_name;
            delete userState[chat_id];
            const senderNewBal = parseFloat(u.balance) - amt;
            await dbPatch('users', `phone=eq.${u.phone}`, { balance: senderNewBal < 0 ? 0 : senderNewBal });
            const receivers = await dbGet('users', `phone=eq.${receiver_phone}`);
            if (receivers.length > 0) {
              const r = receivers[0];
              const receiverNewBal = parseFloat(r.balance) + amt;
              await dbPatch('users', `phone=eq.${receiver_phone}`, { balance: receiverNewBal });
              await sendMsg(r.telegram_id,
                `<b>💰 Payment Received!</b>\n\n<b>You received ₹${amt.toFixed(2)} from ${u.name}.</b>\n\n<b>💰 Updated Balance:</b> ₹${receiverNewBal.toFixed(2)}\n\n<i>${getTime()}</i>`
              );
            }
            await sendMsg(chat_id,
              `<b>✅ Transfer Successful!</b>\n\n<b>💸 Amount:</b> ₹${amt.toFixed(2)}\n<b>👤 To:</b> ${receiver_name}\n<b>📱 Phone:</b> ${maskPhone(receiver_phone)}\n<b>💰 New Balance:</b> ₹${senderNewBal.toFixed(2)}\n\n<i>${getTime()}</i>`,
              mainKeyboard
            );
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
            text: `<b>👋 Welcome to Cashyfy!</b>\n\n<b>Complete offers, earn cashback, and withdraw anytime.</b>\n\n<i>Please share your phone number to get started.</i>`,
            parse_mode: 'HTML',
            reply_markup: contactKeyboard
          })
        });
      } else {
        const u = users[0];
        await sendMsg(chat_id,
          `<b>⚡ Welcome back, ${u.name}!</b>\n\n<b>💰 Balance:</b> ₹${parseFloat(u.balance).toFixed(2)}\n<b>🏆 Lifetime Earnings:</b> ₹${parseFloat(u.lifetime_earnings).toFixed(2)}\n<b>📱 Phone:</b> ${u.phone}`,
    
