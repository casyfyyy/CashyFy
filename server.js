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
          mainKeyboard
        );
      }

    } else if (text === '👤 Profile') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        await sendInlineMsg(chat_id,
          `<b>👤 Your Profile</b>\n\n<b>Name:</b> ${u.name}\n<b>Phone:</b> ${u.phone}\n<b>💰 Balance:</b> ₹${parseFloat(u.balance).toFixed(2)}\n<b>🏆 Lifetime Earnings:</b> ₹${parseFloat(u.lifetime_earnings).toFixed(2)}\n\n<b>Payment Details</b>\n<b>💳 UPI:</b> ${u.upi_id || 'Not set'}\n<b>🏦 Bank:</b> ${u.bank_account ? u.bank_account + ' | ' + u.bank_ifsc : 'Not set'}`,
          [[{ text: '💳 Update UPI', callback_data: 'set_upi' }], [{ text: '🏦 Update Bank', callback_data: 'set_bank' }]]
        );
      }

    } else if (text === '💰 Withdraw') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        if (parseFloat(u.balance) < 10) {
          await sendMsg(chat_id,
            `<b>⚠️ Insufficient Balance</b>\n\n<b>💰 Current Balance:</b> ₹${parseFloat(u.balance).toFixed(2)}\n\n<i>Minimum withdrawal is ₹10.</i>`,
            mainKeyboard
          );
        } else if (u.upi_id && u.bank_account) {
          await sendInlineMsg(chat_id,
            `<b>💸 Withdrawal</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}\n\n<b>Select payment method:</b>`,
            [[{ text: '💳 UPI Transfer', callback_data: 'withdraw_upi' }], [{ text: '🏦 Bank Transfer', callback_data: 'withdraw_bank' }]]
          );
        } else if (u.upi_id) {
          userState[chat_id] = { state: 'withdraw_amount', method: 'upi', payment: u.upi_id, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>💸 Enter Withdrawal Amount</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}\n<b>Minimum:</b> ₹10`);
        } else if (u.bank_account) {
          userState[chat_id] = { state: 'withdraw_amount', method: 'bank', payment: `${u.bank_account} | ${u.bank_ifsc}`, timestamp: Date.now() };
          await sendMsg(chat_id, `<b>💸 Enter Withdrawal Amount</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}\n<b>Minimum:</b> ₹10`);
        } else {
          await sendInlineMsg(chat_id,
            `<b>⚠️ No Payment Method</b>\n\nPlease add a payment method first.`,
            [[{ text: '💳 Add UPI', callback_data: 'set_upi' }], [{ text: '🏦 Add Bank', callback_data: 'set_bank' }]]
          );
        }
      }

    } else if (text === '🔄 Transfer') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        if (parseFloat(u.balance) <= 0) {
          await sendMsg(chat_id,
            `<b>⚠️ Insufficient Balance</b>\n\n<b>💰 Current Balance:</b> ₹${parseFloat(u.balance).toFixed(2)}`,
            mainKeyboard
          );
        } else {
          userState[chat_id] = { state: 'transfer_phone', timestamp: Date.now() };
          await sendMsg(chat_id,
            `<b>🔄 Transfer Funds</b>\n\n<b>💰 Available:</b> ₹${parseFloat(u.balance).toFixed(2)}\n\n<b>📱 Enter recipient's phone number:</b>`
          );
        }
      }

    } else if (text === '📊 History') {
      const users = await dbGet('users', `telegram_id=eq.${chat_id}`);
      if (users.length > 0) {
        const u = users[0];
        const conversions = await dbGet('conversions', `telegram_id=eq.${u.phone}&order=created_at.desc&limit=5`);
        if (conversions.length === 0) {
          await sendMsg(chat_id, `<b>📊 Transaction History</b>\n\n<i>No transactions yet. Complete offers to earn cashback!</i>`, mainKeyboard);
        } else {
          let msg = `<b>📊 Recent Transactions</b>\n\n`;
          conversions.forEach((c, i) => {
            const date = new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
            msg += `<b>${i+1}.</b> ${c.offer_name} — <b>₹${c.amount}</b> — ${date}\n`;
          });
          msg += `\n<i>Visit cashyfy.site for full history.</i>`;
          await sendMsg(chat_id, msg, mainKeyboard);
        }
      }

    } else if (text.startsWith('/pause ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/pause ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: false }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: false }); }
      await sendMsg(ADMIN_ID, `<b>⏸️ ${offerName} paused.</b>`);

    } else if (text.startsWith('/resume ') && chat_id === ADMIN_ID) {
      const offerName = text.replace('/resume ', '').trim();
      const existing = await dbGet('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`);
      if (existing.length > 0) { await dbPatch('offer_status', `offer_name=eq.${encodeURIComponent(offerName)}`, { is_active: true }); }
      else { await dbPost('offer_status', { offer_name: offerName, is_active: true }); }
      await sendMsg(ADMIN_ID, `<b>▶️ ${offerName} resumed.</b>`);

    } else if (text === '/offers' && chat_id === ADMIN_ID) {
      const offers = await dbGet('offer_status', `order=offer_name.asc`);
      if (offers.length === 0) { await sendMsg(ADMIN_ID, `<b>📋 No offers configured.</b>`); }
      else {
        let msg = `<b>📋 Offer Status</b>\n\n`;
        offers.forEach(o => { msg += `${o.is_active ? '🟢' : '🔴'} <b>${o.offer_name}</b> — ${o.is_active ? 'Active' : 'Paused'}\n`; });
        await sendMsg(ADMIN_ID, msg);
      }

    } else if (text === '/stats' && chat_id === ADMIN_ID) {
      const users = await dbGet('users', `select=balance,lifetime_earnings`);
      const totalBalance = users.reduce((s, u) => s + parseFloat(u.balance || 0), 0);
      const totalEarnings = users.reduce((s, u) => s + parseFloat(u.lifetime_earnings || 0), 0);
      await sendMsg(ADMIN_ID,
        `<b>📊 Platform Stats</b>\n\n<b>👥 Total Users:</b> ${users.length}\n<b>💰 Total Balance:</b> ₹${totalBalance.toFixed(2)}\n<b>🏆 Total Earnings:</b> ₹${totalEarnings.toFixed(2)}`
      );
    }

  } catch(e) { console.error(e); }
  res.send('OK');
});

// ✅ Offer endpoints
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
    if (token !== POSTBACK_TOKEN) return res.status(403).send('Forbidden');
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!rateLimit(ip, 50, 60000)) return res.status(429).send('Too Many Requests');
    console.log('POSTBACK:', req.query);
    let runTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    let offer = 'Unknown', phone = null, referred_by = null, user_payout_custom = 0, my_payout_custom = 0;
    try {
      const clicks = await dbGet('clicks', `click_id=eq.${encodeURIComponent(click_id)}&order=created_at.desc&limit=1`);
      if (clicks.length > 0) {
        offer = clicks[0].offer_name; phone = clicks[0].phone;
        runTime = new Date(clicks[0].created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
        referred_by = clicks[0].referred_by;
        user_payout_custom = clicks[0].user_payout || 0;
        my_payout_custom = clicks[0].my_payout || 0;
      }
    } catch(e) {}
    if (!phone) return res.send('OK');
    const config = offerConfig[offer] || { installAmt: 0, trialAmt: 0, installBalance: false, trialBalance: false, installComment: `${offer} Install`, trialComment: `${offer} Complete` };
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
        await sendMsg(u.telegram_id,
          `<b>🎉 Cashback Credited!</b>\n\n<b>💶 Amount:</b> ₹${amount}\n<b>💰 New Balance:</b> ₹${newBal.toFixed(2)}\n\n<b>📝 Note:</b> ${comment}`
        );
      }
      if (referred_by && my_payout_custom > 0 && addBalance) {
        const referrers = await dbGet('users', `phone=eq.${referred_by}`);
        if (referrers.length > 0) {
          const r = referrers[0];
          const newRefBal = parseFloat(r.balance) + my_payout_custom;
          const newRefLife = parseFloat(r.lifetime_earnings) + my_payout_custom;
          await dbPatch('users', `phone=eq.${referred_by}`, { balance: newRefBal, lifetime_earnings: newRefLife });
          await sendMsg(r.telegram_id,
            `<b>🎁 Referral Bonus!</b>\n\n<b>💶 Amount:</b> ₹${my_payout_custom}\n<b>💰 New Balance:</b> ₹${newRefBal.toFixed(2)}\n\n<b>📝 Note:</b> Referral Bonus — ${offer}`
          );
        }
      }
    }
    const trackTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    const msg = referred_by
      ? `<b>📊 Conversion</b>\n\n<b>🎯 Offer:</b> ${offer}\n\n<b>User:</b> ${maskPhone(phone)}\n<b>Amount:</b> ₹${amount}\n<b>Status:</b> ${userPayment}\n\n<b>Referrer:</b> ${maskPhone(referred_by)}\n<b>Bonus:</b> ₹${my_payout_custom}\n\n<b>Run Time:</b> ${runTime}\n<b>Track Time:</b> ${trackTime}\n\n<i>Powered by Cashyfy</i>`
      : `<b>📊 Conversion</b>\n\n<b>🎯 Offer:</b> ${offer}\n\n<b>User:</b> ${maskPhone(phone)}\n<b>Amount:</b> ₹${amount}\n<b>Status:</b> ${userPayment}\n\n<b>Run Time:</b> ${runTime}\n<b>Track Time:</b> ${trackTime}\n\n<i>Powered by Cashyfy</i>`;
    await sendMsg(CHAT_ID, msg);
  } catch(e) { console.error(e); }
  res.send('OK');
});

app.get('/', (req, res) => res.send('CashyFy Wallet Bot Running! ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));

setInterval(async () => {
  try { await fetchWithTimeout('https://cashyfy-1.onrender.com/'); } catch(e) {}
}, 14 * 60 * 1000);
    
