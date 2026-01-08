const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express'); // সার্ভারের জন্য
const app = express(); // অ্যাপ তৈরি

// --- ২৪ ঘন্টা রান রাখার কোড শুরু ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.send('Bot is Running Successfully!');
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
// --- ২৪ ঘন্টা রান রাখার কোড শেষ ---

// আপনার নতুন টোকেন এবং আইডি (পরিবর্তন করা হয়েছে)
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0';
const mainAdminId = 6802901397; 

const bot = new TelegramBot(token, {polling: true});
const DB_FILE = 'database.json';

// ডাটা লোড
function loadData() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = { 
            users: {}, 
            config: { 
                submissionChannel: mainAdminId, 
                supportLink: "https://t.me/YourUsername",
                admins: [],
                lastDate: "", 
                submissionActive: true 
            } 
        };
        // নোট: Render ফ্রি সার্ভারে ফাইল সেভ থাকে না, রিস্টার্ট হলে মুছে যায়।
        // পার্মানেন্ট ডাটার জন্য MongoDB ব্যবহার করা ভালো।
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
        return initialData;
    }
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (typeof data.config.submissionActive === 'undefined') data.config.submissionActive = true;
        return data;
    } catch (e) {
        return { users: {}, config: { submissionChannel: mainAdminId, admins: [] } };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) { console.log("Save error"); }
}

function isAdmin(userId, db) {
    return userId == mainAdminId || (db.config.admins && db.config.admins.includes(userId));
}

// তারিখ ফরম্যাট
function getFormattedDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1; 
    let dd = today.getDate();
    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;
    return dd + '/' + mm + '/' + yyyy;
}

const userState = {}; 
console.log("🚀 Premium Business Bot Running...");

// --- TEXT CONTENT ---
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

// --- CALLBACK QUERY ---
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        if (data === 'lang_en') {
            bot.editMessageText(useInfoText.en, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🔄 Translate Bangla", callback_data: "lang_bn" }]] }
            });
        } else if (data === 'lang_bn') {
            bot.editMessageText(useInfoText.bn, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🔄 Translate English", callback_data: "lang_en" }]] }
            });
        }
        else if (data === 'restart_bot') {
            const db = loadData();
            if (db.users[chatId]) {
                db.users[chatId].locked = false;
                saveData(db);
            }

            bot.sendMessage(chatId, "✅ <b>Refreshed Successfully!</b>\nSelect an option:", { 
                parse_mode: 'HTML', 
                reply_markup: getMainMenu(chatId, db) 
            });
            bot.deleteMessage(chatId, query.message.message_id).catch((err) => {});
        }
    } catch (e) { console.log(e.message); }
    bot.answerCallbackQuery(query.id);
});

// --- MAIN MESSAGE HANDLER ---
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const db = loadData();

    if (!db.users[chatId]) {
        db.users[chatId] = { name: msg.from.first_name, balance: 0, banned: false, locked: false };
        saveData(db);
    }

    if (db.users[chatId].locked === true && chatId != mainAdminId) {
         bot.sendMessage(chatId, "⚠️ <b>System Update Available!</b>\n\nNew features added. Please click <b>Refresh</b> to continue using the bot.", {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh / Update", callback_data: "restart_bot" }]] }
        });
        return;
    }

    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        db.users[chatId].locked = false;
        saveData(db);

        bot.sendMessage(chatId, `👋 <b>Welcome, 🌹${msg.from.first_name}🌹!</b>\n\nPlease select an option from below:`, { 
            parse_mode: 'HTML', 
            reply_markup: getMainMenu(chatId, db) 
        });
        return;
    }

    if (text === '❌ Cancel' && isAdmin(chatId, db)) {
        userState[chatId] = null;
        bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getAdminKeyboard(chatId, db) });
        return;
    }

    if (text === '❌ Cancel') {
        userState[chatId] = null;
        bot.sendMessage(chatId, "❌ Action Cancelled.", { reply_markup: getMainMenu(chatId, db) });
        return;
    }
    
    if (text === '📂 Submit File') {
        if (!db.config.submissionActive) {
            bot.sendMessage(chatId, "⚠️ <b>Submission Closed!</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nবর্তমানে ফাইল জমা নেওয়া বন্ধ আছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন অথবা এডমিনের নোটিসের অপেক্ষা করুন।\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖", { parse_mode: 'HTML' });
            return;
        }

        if (db.users[chatId].banned) {
            bot.sendMessage(chatId, "🚫 <b>ACCESS DENIED</b>\nYou are banned from submitting files. Please contact support.", { parse_mode: 'HTML' });
            return;
        }

        userState[chatId] = 'WAITING_FOR_FILE';
        bot.sendMessage(chatId, "📂 <b>FILE SUBMISSION</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nPlease upload your <b>Google Sheet (.xlsx)</b> file now.\n\n<i>⚠️ Only .xlsx files are accepted.</i>", { 
            reply_markup: cancelKeyboard, 
            parse_mode: 'HTML' 
        });
        return;
    }

    if (text === '👤 Profile') {
        const u = db.users[chatId];
        const status = u.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>USER PROFILE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<b>Name:</b> ${u.name}\n<b>User ID:</b> <code>${chatId}</code>\n<b>Status:</b> ${status}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`, { parse_mode: 'HTML' });
        return;
    }

    if (text === 'ℹ️ Use Info') {
        bot.sendMessage(chatId, useInfoText.bn, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔄 Translate English", callback_data: "lang_en" }]] }
        });
        return;
    }

    if (text === '📞 Support') {
        const link = db.config.supportLink || "https://t.me/YourUsername";
        bot.sendMessage(chatId, "📞 <b>24/7 CUSTOMER SUPPORT</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nNeed help? Contact our admin directly.\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖", { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "💬 Contact Admin", url: link }]] }
        });
        return;
    }

    if (userState[chatId] === 'WAITING_FOR_FILE') {
        if (!db.config.submissionActive) {
            bot.sendMessage(chatId, "⚠️ <b>Submission Closed Just Now!</b>", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, db) });
            userState[chatId] = null;
            return;
        }

        if (msg.document && msg.document.file_name && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            const forwardTarget = db.config.submissionChannel || mainAdminId;
            const currentDate = getFormattedDate();

            if (db.config.lastDate !== currentDate) {
                bot.sendMessage(forwardTarget, `📅 <b>এখানে থেকে ${currentDate} তারিখ এর ফাইল রিসিভ শুরু।</b>`, {parse_mode: 'HTML'});
                db.config.lastDate = currentDate;
                saveData(db);
            }

            bot.forwardMessage(forwardTarget, chatId, msg.message_id).then((forwardedMsg) => {
                
                const senderName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
                const senderUsername = msg.from.username ? `@${msg.from.username}` : 'N/A';

                const infoMessage = `📄 <b>New File from:</b>\n` +
                                    `Name: ${senderName}\n` +
                                    `User: ${senderUsername}\n` +
                                    `ID: <code>${chatId}</code>`;

                bot.sendMessage(forwardTarget, infoMessage, {
                    parse_mode: 'HTML',
                    reply_to_message_id: forwardedMsg.message_id
                });
                
                bot.sendMessage(chatId, "✅ <b>FILE SUBMITTED!</b>\n\nYour file has been sent for review.", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, db) });
                userState[chatId] = null;

            }).catch((err) => {
                console.log(err);
                bot.sendMessage(chatId, "❌ <b>Error:</b> Could not send file.", {parse_mode: 'HTML'});
            });

        } else {
            bot.sendMessage(chatId, "⚠️ <b>Invalid File!</b>\nPlease upload a valid <b>.xlsx</b> file.", { parse_mode: 'HTML' });
        }
        return;
    }

    if (isAdmin(chatId, db)) {
        if (text === '🛠 Admin Panel') {
            bot.sendMessage(chatId, "🛠 <b>ADMIN DASHBOARD</b>\nSelect an action:", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, db) });
            return;
        }

        if (text === '🔄 Reset Date') {
            userState[chatId] = 'RESET_DATE_PASS';
            bot.sendMessage(chatId, "🔒 <b>Security Check</b>\nTo reset the date tracker, please enter the password:", { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            return;
        }
        if (userState[chatId] === 'RESET_DATE_PASS') {
            if (text === 'MTS@2026') {
                db.config.lastDate = ""; 
                saveData(db);
                bot.sendMessage(chatId, "✅ <b>Success!</b> Date tracker has been reset.", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, db) });
            } else {
                bot.sendMessage(chatId, "❌ <b>Wrong Password!</b> Access Denied.", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, db) });
            }
            userState[chatId] = null;
            return;
        }

        if (text === '🟢 Submission ON' || text === '🔴 Submission OFF') {
            db.config.submissionActive = !db.config.submissionActive;
            saveData(db);
            const statusMsg = db.config.submissionActive ? "✅ <b>Submission is now OPEN.</b>" : "⛔ <b>Submission is now CLOSED.</b>";
            bot.sendMessage(chatId, statusMsg, { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, db) });
            return;
        }

        if (text === '⚠️ Send Update Alert') {
            userState[chatId] = 'CONFIRM_UPDATE_ALERT';
            bot.sendMessage(chatId, "⚠️ <b>Are you sure?</b>\nThis will send a 'Restart Bot' message to ALL users (except you).\n\nType <b>'yes'</b> to confirm or click Cancel.", {parse_mode: 'HTML', reply_markup: cancelKeyboard});
            return;
        }
        if (userState[chatId] === 'CONFIRM_UPDATE_ALERT') {
            if (text.toLowerCase() === 'yes') {
                const alertMsg = "⚠️ <b>SYSTEM UPDATE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nআসসালামু আলাইকুম সবাই নতুন ফিচার ব্যবহার করার জন্য Start / update দিন\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖";
                let count = 0;
                Object.keys(db.users).forEach(id => {
                    if (id != chatId) {
                        db.users[id].locked = true; 
                        bot.sendMessage(id, alertMsg, {
                            parse_mode: 'HTML',
                            reply_markup: { inline_keyboard: [[{ text: "🔄 Update Now / Restart", callback_data: "restart_bot" }]] }
                        }).catch(()=>{});
                        count++;
                    }
                });
                saveData(db); 
                bot.sendMessage(chatId, `✅ <b>Alert Sent to ${count} users.</b>\nUsers are now locked until update.`, {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)});
            } else {
                bot.sendMessage(chatId, "❌ Cancelled.", {reply_markup: getAdminKeyboard(chatId, db)});
            }
            userState[chatId] = null;
            return;
        }

        if (chatId == mainAdminId) {
            if (text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'ADD_ADMIN') {
                const nid = parseInt(text);
                if (isNaN(nid)) { bot.sendMessage(chatId, "❌ Invalid ID"); return; }
                if (!db.config.admins) db.config.admins = [];
                if (!db.config.admins.includes(nid)) { db.config.admins.push(nid); saveData(db); bot.sendMessage(chatId, "✅ Added.", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)}); }
                else { bot.sendMessage(chatId, "⚠️ Already Admin.", {reply_markup: getAdminKeyboard(chatId, db)}); }
                userState[chatId] = null; return;
            }

            if (text === '➖ Remove Admin') { userState[chatId] = 'REM_ADMIN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'REM_ADMIN') {
                const tid = parseInt(text);
                if (tid == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot remove Main Admin.", {reply_markup: getAdminKeyboard(chatId, db)}); return; }
                const idx = db.config.admins.indexOf(tid);
                if (idx > -1) { db.config.admins.splice(idx, 1); saveData(db); bot.sendMessage(chatId, "✅ Removed.", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)}); }
                else { bot.sendMessage(chatId, "⚠️ Not an Admin.", {reply_markup: getAdminKeyboard(chatId, db)}); }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Enter Username/Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { 
            const formattedLink = formatSupportLink(text);
            db.config.supportLink = formattedLink; 
            saveData(db); 
            bot.sendMessage(chatId, `✅ <b>Link Updated!</b>\n${formattedLink}`, {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)}); 
            userState[chatId] = null; 
            return; 
        }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Message:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') { 
            const msgBody = `📢 <b>OFFICIAL NOTICE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<i>~ Management Team</i>`;
            Object.keys(db.users).forEach(id => bot.sendMessage(id, msgBody, {parse_mode: 'HTML'}).catch(()=>{})); 
            bot.sendMessage(chatId, "✅ <b>Sent.</b>", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)}); 
            userState[chatId] = null; 
            return; 
        }

        if (text === '🆔 Set Channel ID') { userState[chatId] = 'SET_CH'; bot.sendMessage(chatId, "Enter Channel ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_CH') { db.config.submissionChannel = text; saveData(db); bot.sendMessage(chatId, "✅ Set.", {reply_markup: getAdminKeyboard(chatId, db)}); userState[chatId]=null; return; }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Enter Message:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            const replyMsg = `📨 <b>NEW MESSAGE FROM ADMIN</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`;
            bot.sendMessage(userState[chatId].t, replyMsg, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, db)}); 
            userState[chatId]=null; 
            return; 
        }
    
        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BAN') { 
            if(text == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot ban Main Admin.", {reply_markup: getAdminKeyboard(chatId, db)}); return; }
            if(db.users[text]) { 
                db.users[text].banned=true; 
                saveData(db); 
                bot.sendMessage(chatId, "🚫 <b>User Banned Successfully.</b>", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)}); 
            } else {
                bot.sendMessage(chatId, "⚠️ User not found.", {reply_markup: getAdminKeyboard(chatId, db)});
            }
            userState[chatId]=null; return; 
        }
        
        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { 
            if(db.users[text]) { 
                db.users[text].banned=false; 
                saveData(db); 
                bot.sendMessage(chatId, "✅ <b>User Unbanned Successfully.</b>", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, db)}); 
            } else {
                bot.sendMessage(chatId, "⚠️ User not found.", {reply_markup: getAdminKeyboard(chatId, db)});
            }
            userState[chatId]=null; return; 
        }
    }
});
