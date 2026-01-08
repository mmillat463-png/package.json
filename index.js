const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express'); 
const app = express(); 

// --- ২৪ ঘন্টা রান রাখার কোড ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.send('Bot is Running Successfully!');
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// --- কনফিগারেশন ---
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0';
const mainAdminId = 6802901397; 

// 🔥 সাব-এডমিনদের লিস্ট (এখানে যোগ করা হয়েছে)
// সার্ভার রিস্টার্ট হলেও এরা এডমিন থাকবে
const permanentAdmins = [5679766488, 6805367127];

const bot = new TelegramBot(token, {polling: true});
const DB_FILE = 'database.json';

// --- ডাটা লোড ---
function loadData() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = { 
            users: {}, 
            config: { 
                submissionChannel: mainAdminId, 
                supportLink: "https://t.me/YourUsername",
                admins: permanentAdmins, // ডিফল্টভাবে সাব-এডমিন এড থাকবে
                lastDate: "", 
                submissionActive: true 
            } 
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
        return initialData;
    }
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        // ডাটা লোড হওয়ার সময়ও চেক করবে সাব-এডমিনরা আছে কিনা
        if (!data.config.admins) data.config.admins = [];
        permanentAdmins.forEach(id => {
            if(!data.config.admins.includes(id)) data.config.admins.push(id);
        });
        
        return data;
    } catch (e) {
        return { users: {}, config: { submissionChannel: mainAdminId, admins: permanentAdmins } };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.log("Save error"); }
}

function isAdmin(userId, db) {
    // মেইন এডমিন অথবা কনফিগ এডমিন লিস্টে থাকলে TRUE
    return userId == mainAdminId || (db.config.admins && db.config.admins.includes(userId));
}

function getFormattedDate() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
}

const userState = {}; 
console.log("🚀 Bot Running with Local DB...");

// --- TEXT ---
const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী (A to Z):</b>\n\n১. প্রথমে '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. আপনার <b>.xlsx</b> (এক্সেল) ফাইলটি আপলোড করুন।\n৩. এডমিন আপনার ফাইল চেক করে কনফার্ম করবেন।\n৪. কোনো সমস্যা হলে '📞 <b>Support</b>' বাটনে ক্লিক করে যোগাযোগ করুন।\n\n<i>ধন্যবাদ!</i>",
    en: "ℹ️ <b>How to Use (A to Z):</b>\n\n1. First, click the '📂 <b>Submit File</b>' button.\n2. Upload your <b>.xlsx</b> (Excel) file.\n3. Admin will review and confirm your file.\n4. If you face any issues, click '📞 <b>Support</b>' to contact us.\n\n<i>Thank you!</i>"
};

// --- KEYBOARDS ---
function getMainMenu(userId, db) {
    let keyboard = [
        [{ text: "📂 Submit File" }], 
        [{ text: "👤 Profile" }, { text: "ℹ️ Use Info" }], 
        [{ text: "📞 Support" }] 
    ];
    if (isAdmin(userId, db)) keyboard.push([{ text: "🛠 Admin Panel" }]);
    return { keyboard: keyboard, resize_keyboard: true };
}

function getAdminKeyboard(userId, db) {
    const subStatus = db.config.submissionActive ? "🟢 Submission ON" : "🔴 Submission OFF";
    let kb = [
        [{ text: subStatus }, { text: "🔄 Reset Date" }],
        [{ text: "⚠️ Send Update Alert" }, { text: "📢 Broadcast" }],
        [{ text: "🚫 Ban User" }, { text: "✅ Unban User" }],
        [{ text: "🆔 Set Channel ID" }, { text: "🔗 Set Support Link" }],
        [{ text: "📨 Reply User" }, { text: "🔙 Back to Home" }]
    ];
    if (userId == mainAdminId) kb.unshift([{ text: "➕ Add Admin" }, { text: "➖ Remove Admin" }]);
    return { keyboard: kb, resize_keyboard: true };
}

const cancelKeyboard = { keyboard: [[{ text: "❌ Cancel" }]], resize_keyboard: true };

function formatSupportLink(input) {
    if (input.startsWith("https://") || input.startsWith("http://")) return input;
    if (input.startsWith("@")) return `https://t.me/${input.substring(1)}`;
    return `https://t.me/${input}`;
}

// --- CALLBACK ---
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        if (data === 'lang_en') {
            bot.editMessageText(useInfoText.en, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🔄 Translate Bangla", callback_data: "lang_bn" }]] }
            });
        } else if (data === 'lang_bn') {
            bot.editMessageText(useInfoText.bn, {
                chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🔄 Translate English", callback_data: "lang_en" }]] }
            });
        }
        else if (data === 'restart_bot') {
            const db = loadData();
            if (db.users[chatId]) { db.users[chatId].locked = false; saveData(db); }
            bot.sendMessage(chatId, "✅ <b>Refreshed!</b>", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, db) });
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        }
    } catch (e) { console.log(e.message); }
    bot.answerCallbackQuery(query.id);
});

// --- MESSAGE HANDLER ---
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const db = loadData(); // ডাটা লোড এবং এডমিন চেক

    // ইউজার ডাটা তৈরি
    if (!db.users[chatId]) {
        db.users[chatId] = { name: msg.from.first_name, balance: 0, banned: false, locked: false };
        saveData(db);
    }

    // আপডেট লক চেক
    if (db.users[chatId].locked === true && chatId != mainAdminId) {
         bot.sendMessage(chatId, "⚠️ <b>System Update!</b>\nPlease click Refresh.", {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "restart_bot" }]] }
        });
        return;
    }

    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        db.users[chatId].locked = false; saveData(db);
        bot.sendMessage(chatId, `👋 <b>Welcome, ${msg.from.first_name}!</b>`, { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, db) });
        return;
    }

    if (text === '❌ Cancel') {
        userState[chatId] = null;
        bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getMainMenu(chatId, db) });
        return;
    }
    
    // সাবমিশন
    if (text === '📂 Submit File') {
        if (!db.config.submissionActive) return bot.sendMessage(chatId, "⚠️ <b>Closed.</b>", { parse_mode: 'HTML' });
        if (db.users[chatId].banned) return bot.sendMessage(chatId, "🚫 <b>Banned.</b>", { parse_mode: 'HTML' });

        userState[chatId] = 'WAITING_FOR_FILE';
        bot.sendMessage(chatId, "📂 Upload your <b>.xlsx</b> file.", { reply_markup: cancelKeyboard, parse_mode: 'HTML' });
        return;
    }

    // প্রোফাইল
    if (text === '👤 Profile') {
        const u = db.users[chatId];
        const status = u.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>Profile</b>\nName: ${u.name}\nID: <code>${chatId}</code>\nStatus: ${status}`, { parse_mode: 'HTML' });
        return;
    }

    if (text === 'ℹ️ Use Info') {
        bot.sendMessage(chatId, useInfoText.bn, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "lang_en" }]] } });
        return;
    }

    if (text === '📞 Support') {
        bot.sendMessage(chatId, "📞 <b>Support</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "Contact Admin", url: db.config.supportLink }]] } });
        return;
    }

    // ফাইল রিসিভ
    if (userState[chatId] === 'WAITING_FOR_FILE') {
        if (!db.config.submissionActive) return bot.sendMessage(chatId, "⚠️ Closed.", {reply_markup: getMainMenu(chatId, db)});

        if (msg.document && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            const target = db.config.submissionChannel || mainAdminId;
            const date = getFormattedDate();

            if (db.config.lastDate !== date) {
                bot.sendMessage(target, `📅 <b>Date: ${date}</b>`, {parse_mode: 'HTML'});
                db.config.lastDate = date; saveData(db);
            }

            bot.forwardMessage(target, chatId, msg.message_id).then(() => {
                const info = `📄 <b>From:</b> ${msg.from.first_name}\nID: <code>${chatId}</code>`;
                bot.sendMessage(target, info, {parse_mode: 'HTML'});
                bot.sendMessage(chatId, "✅ <b>Submitted!</b>", {parse_mode: 'HTML', reply_markup: getMainMenu(chatId, db)});
                userState[chatId] = null;
            }).catch(() => bot.sendMessage(chatId, "❌ Error sending file."));
        } else {
            bot.sendMessage(chatId, "⚠️ Only .xlsx files allowed.");
        }
        return;
    }

    // --- ADMIN ---
    if (isAdmin(chatId, db)) {
        if (text === '🛠 Admin Panel') {
            bot.sendMessage(chatId, "🛠 Admin Dashboard:", { reply_markup: getAdminKeyboard(chatId, db) });
            return;
        }

        if (text === '🔄 Reset Date') { userState[chatId] = 'RESET_DATE'; bot.sendMessage(chatId, "Enter Pass:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'RESET_DATE') {
            if (text === 'MTS@2026') { db.config.lastDate = ""; saveData(db); bot.sendMessage(chatId, "✅ Reset Done."); }
            else { bot.sendMessage(chatId, "❌ Wrong Pass."); }
            userState[chatId] = null; return;
        }

        if (text === '🟢 Submission ON' || text === '🔴 Submission OFF') {
            db.config.submissionActive = !db.config.submissionActive; saveData(db);
            bot.sendMessage(chatId, `Status: ${db.config.submissionActive ? "ON" : "OFF"}`, { reply_markup: getAdminKeyboard(chatId, db) });
            return;
        }

        if (text === '⚠️ Send Update Alert') { userState[chatId] = 'ALERT'; bot.sendMessage(chatId, "Type 'yes' to confirm:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ALERT') {
            if (text.toLowerCase() === 'yes') {
                let count = 0;
                Object.keys(db.users).forEach(id => {
                    if (id != chatId) {
                        db.users[id].locked = true;
                        bot.sendMessage(id, "⚠️ <b>Update Available!</b>\nRestart Bot.", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔄 Restart", callback_data: "restart_bot" }]] } }).catch(()=>{});
                        count++;
                    }
                });
                saveData(db); bot.sendMessage(chatId, `✅ Sent to ${count} users.`);
            } else { bot.sendMessage(chatId, "❌ Cancelled."); }
            userState[chatId] = null; return;
        }

        // মেইন এডমিন ফিচার
        if (chatId == mainAdminId) {
            if (text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'ADD_ADMIN') {
                const id = parseInt(text);
                if(!db.config.admins.includes(id)) { db.config.admins.push(id); saveData(db); bot.sendMessage(chatId, "✅ Added."); }
                userState[chatId] = null; return;
            }
            if (text === '➖ Remove Admin') { userState[chatId] = 'REM_ADMIN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'REM_ADMIN') {
                const id = parseInt(text);
                const idx = db.config.admins.indexOf(id);
                if (idx > -1) { db.config.admins.splice(idx, 1); saveData(db); bot.sendMessage(chatId, "✅ Removed."); }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Enter Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { db.config.supportLink = formatSupportLink(text); saveData(db); bot.sendMessage(chatId, "✅ Updated."); userState[chatId]=null; return; }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Msg:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') {
            Object.keys(db.users).forEach(id => bot.sendMessage(id, `📢 <b>Notice:</b>\n${text}`, {parse_mode:'HTML'}).catch(()=>{}));
            bot.sendMessage(chatId, "✅ Sent."); userState[chatId] = null; return;
        }

        if (text === '🆔 Set Channel ID') { userState[chatId] = 'SET_CH'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_CH') { db.config.submissionChannel = text; saveData(db); bot.sendMessage(chatId, "✅ Set."); userState[chatId]=null; return; }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Enter Msg:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            bot.sendMessage(userState[chatId].t, `📨 <b>Admin Msg:</b>\n${text}`, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent."); userState[chatId]=null; return; 
        }

        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BAN') { 
            if(db.users[text]) { db.users[text].banned=true; saveData(db); bot.sendMessage(chatId, "🚫 Banned."); }
            userState[chatId]=null; return; 
        }

        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { 
            if(db.users[text]) { db.users[text].banned=false; saveData(db); bot.sendMessage(chatId, "✅ Unbanned."); }
            userState[chatId]=null; return; 
        }
    }
});
