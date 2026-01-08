const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const admin = require("firebase-admin");
const app = express();

// --- ১. ফায়ারবেস কনফিগারেশন (Render Env থেকে) ---
const serviceAccount = {
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
};

// ফায়ারবেস কানেক্ট করা
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const usersColl = db.collection('users');
const settingsColl = db.collection('settings'); // কনফিগের জন্য আলাদা কালেকশন

// --- ২. ২৪ ঘন্টা রান রাখার কোড ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.send('Bot is Running with Firebase Database!');
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// --- ৩. বট কনফিগারেশন ---
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0';
const mainAdminId = 6802901397;
const permanentAdmins = [5679766488, 6805367127]; // সার্ভার রিস্টার্ট হলেও এরা এডমিন থাকবে

const bot = new TelegramBot(token, { polling: true });
const userState = {};

console.log("🚀 Bot Started connecting to Firestore...");

// --- ৪. ডাটাবেস হেল্পার ফাংশন ---

// কনফিগ লোড করা (ডাটাবেস থেকে)
async function getConfig() {
    try {
        const doc = await settingsColl.doc('main_config').get();
        let data;
        
        if (!doc.exists) {
            // যদি কনফিগ না থাকে, নতুন তৈরি করবে
            data = {
                submissionChannel: mainAdminId,
                supportLink: "https://t.me/YourUsername",
                admins: permanentAdmins,
                lastDate: "",
                submissionActive: true
            };
            await settingsColl.doc('main_config').set(data);
        } else {
            data = doc.data();
        }

        // পার্মানেন্ট এডমিন চেক
        if (!data.admins) data.admins = [];
        let changed = false;
        permanentAdmins.forEach(id => {
            if (!data.admins.includes(id)) {
                data.admins.push(id);
                changed = true;
            }
        });
        if (changed) await updateConfig(data);
        
        return data;
    } catch (e) {
        console.error("Config Load Error:", e);
        // এরর হলে ডিফল্ট রিটার্ন করবে যেন বট বন্ধ না হয়
        return { submissionChannel: mainAdminId, admins: permanentAdmins, submissionActive: true, supportLink: "" };
    }
}

// কনফিগ আপডেট করা
async function updateConfig(data) {
    await settingsColl.doc('main_config').set(data, { merge: true });
}

// ইউজার ডাটা লোড বা তৈরি করা
async function getUser(userId, firstName) {
    try {
        const doc = await usersColl.doc(String(userId)).get();
        if (doc.exists) {
            return doc.data();
        } else {
            // নতুন ইউজার তৈরি
            const newUser = { 
                id: userId,
                name: firstName, 
                balance: 0, 
                banned: false, 
                locked: false 
            };
            await usersColl.doc(String(userId)).set(newUser);
            return newUser;
        }
    } catch (e) {
        console.error("User Load Error:", e);
        return null;
    }
}

// ইউজার ডাটা আপডেট করা
async function updateUser(userId, data) {
    await usersColl.doc(String(userId)).set(data, { merge: true });
}

// সব ইউজারদের লিস্ট আনা (Broadcast এর জন্য)
async function getAllUsersID() {
    const snapshot = await usersColl.get();
    return snapshot.docs.map(doc => doc.id);
}

// এডমিন চেক
function checkIsAdmin(userId, config) {
    return userId == mainAdminId || (config.admins && config.admins.includes(userId));
}

function getFormattedDate() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
}

// --- TEXT ---
const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী (A to Z):</b>\n\n১. প্রথমে '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. আপনার <b>.xlsx</b> (এক্সেল) ফাইলটি আপলোড করুন।\n৩. এডমিন আপনার ফাইল চেক করে কনফার্ম করবেন।\n৪. কোনো সমস্যা হলে '📞 <b>Support</b>' বাটনে ক্লিক করে যোগাযোগ করুন।\n\n<i>ধন্যবাদ!</i>",
    en: "ℹ️ <b>How to Use (A to Z):</b>\n\n1. First, click the '📂 <b>Submit File</b>' button.\n2. Upload your <b>.xlsx</b> (Excel) file.\n3. Admin will review and confirm your file.\n4. If you face any issues, click '📞 <b>Support</b>' to contact us.\n\n<i>Thank you!</i>"
};

// --- KEYBOARDS ---
function getMainMenu(userId, isAdmin) {
    let keyboard = [
        [{ text: "📂 Submit File" }],
        [{ text: "👤 Profile" }, { text: "ℹ️ Use Info" }],
        [{ text: "📞 Support" }]
    ];
    if (isAdmin) keyboard.push([{ text: "🛠 Admin Panel" }]);
    return { keyboard: keyboard, resize_keyboard: true };
}

function getAdminKeyboard(userId, config) {
    const subStatus = config.submissionActive ? "🟢 Submission ON" : "🔴 Submission OFF";
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
bot.on('callback_query', async (query) => {
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
            // ডাটাবেস আপডেট
            await updateUser(chatId, { locked: false });
            
            // কনফিগ লোড করে মেনু দেখানো
            const config = await getConfig();
            const isAdmin = checkIsAdmin(chatId, config);

            bot.sendMessage(chatId, "✅ <b>Refreshed!</b>", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        }
    } catch (e) { console.log(e.message); }
    bot.answerCallbackQuery(query.id);
});

// --- MESSAGE HANDLER (Async করা হয়েছে) ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // ১. কনফিগ এবং ইউজার ডাটাবেস থেকে আনা
    const config = await getConfig();
    const user = await getUser(chatId, msg.from.first_name);

    if (!user) return; // ডাটাবেস এরর হলে থামবে

    // আপডেট লক চেক
    if (user.locked === true && chatId != mainAdminId) {
        bot.sendMessage(chatId, "⚠️ <b>System Update!</b>\nPlease click Refresh.", {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "restart_bot" }]] }
        });
        return;
    }

    const isAdmin = checkIsAdmin(chatId, config);

    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        await updateUser(chatId, { locked: false });
        bot.sendMessage(chatId, `👋 <b>Welcome, ${msg.from.first_name}!</b>`, { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
        return;
    }

    if (text === '❌ Cancel') {
        userState[chatId] = null;
        bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getMainMenu(chatId, isAdmin) });
        return;
    }
    
    // সাবমিশন
    if (text === '📂 Submit File') {
        if (!config.submissionActive) return bot.sendMessage(chatId, "⚠️ <b>Closed.</b>", { parse_mode: 'HTML' });
        if (user.banned) return bot.sendMessage(chatId, "🚫 <b>Banned.</b>", { parse_mode: 'HTML' });

        userState[chatId] = 'WAITING_FOR_FILE';
        bot.sendMessage(chatId, "📂 Upload your <b>.xlsx</b> file.", { reply_markup: cancelKeyboard, parse_mode: 'HTML' });
        return;
    }

    // প্রোফাইল
    if (text === '👤 Profile') {
        const status = user.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>Profile</b>\nName: ${user.name}\nID: <code>${chatId}</code>\nStatus: ${status}`, { parse_mode: 'HTML' });
        return;
    }

    if (text === 'ℹ️ Use Info') {
        bot.sendMessage(chatId, useInfoText.bn, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "lang_en" }]] } });
        return;
    }

    if (text === '📞 Support') {
        bot.sendMessage(chatId, "📞 <b>Support</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "Contact Admin", url: config.supportLink }]] } });
        return;
    }

    // ফাইল রিসিভ
    if (userState[chatId] === 'WAITING_FOR_FILE') {
        if (!config.submissionActive) return bot.sendMessage(chatId, "⚠️ Closed.", {reply_markup: getMainMenu(chatId, isAdmin)});

        if (msg.document && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            const target = config.submissionChannel || mainAdminId;
            const date = getFormattedDate();

            if (config.lastDate !== date) {
                bot.sendMessage(target, `📅 <b>Date: ${date}</b>`, {parse_mode: 'HTML'});
                // কনফিগে ডেট আপডেট
                config.lastDate = date;
                await updateConfig(config);
            }

            bot.forwardMessage(target, chatId, msg.message_id).then(() => {
                const info = `📄 <b>From:</b> ${msg.from.first_name}\nID: <code>${chatId}</code>`;
                bot.sendMessage(target, info, {parse_mode: 'HTML'});
                bot.sendMessage(chatId, "✅ <b>Submitted!</b>", {parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin)});
                userState[chatId] = null;
            }).catch(() => bot.sendMessage(chatId, "❌ Error sending file."));
        } else {
            bot.sendMessage(chatId, "⚠️ Only .xlsx files allowed.");
        }
        return;
    }

    // --- ADMIN PANEL ---
    if (isAdmin) {
        if (text === '🛠 Admin Panel') {
            bot.sendMessage(chatId, "🛠 Admin Dashboard:", { reply_markup: getAdminKeyboard(chatId, config) });
            return;
        }

        if (text === '🔄 Reset Date') { userState[chatId] = 'RESET_DATE'; bot.sendMessage(chatId, "Enter Pass:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'RESET_DATE') {
            if (text === 'MTS@2026') { 
                await updateConfig({ lastDate: "" });
                bot.sendMessage(chatId, "✅ Reset Done."); 
            }
            else { bot.sendMessage(chatId, "❌ Wrong Pass."); }
            userState[chatId] = null; return;
        }

        if (text === '🟢 Submission ON' || text === '🔴 Submission OFF') {
            const newState = !config.submissionActive;
            await updateConfig({ submissionActive: newState });
            // নতুন কনফিগ আবার লোড করে বাটন আপডেট
            const newConfig = { ...config, submissionActive: newState }; 
            bot.sendMessage(chatId, `Status: ${newState ? "ON" : "OFF"}`, { reply_markup: getAdminKeyboard(chatId, newConfig) });
            return;
        }

        if (text === '⚠️ Send Update Alert') { userState[chatId] = 'ALERT'; bot.sendMessage(chatId, "Type 'yes' to confirm:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ALERT') {
            if (text.toLowerCase() === 'yes') {
                bot.sendMessage(chatId, "⏳ Sending alerts...");
                const allUserIds = await getAllUsersID();
                let count = 0;
                
                // সব ইউজারকে লক করা (ডাটাবেস লুপ)
                const batch = db.batch(); // ফায়ারবেস ব্যাচ অপারেশন
                
                for (const id of allUserIds) {
                    if (id != chatId) {
                        const userRef = usersColl.doc(id);
                        batch.set(userRef, { locked: true }, { merge: true });
                        bot.sendMessage(id, "⚠️ <b>Update Available!</b>\nRestart Bot.", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔄 Restart", callback_data: "restart_bot" }]] } }).catch(()=>{});
                        count++;
                    }
                }
                await batch.commit(); // একবারে সব সেভ
                bot.sendMessage(chatId, `✅ Sent to ${count} users.`);
            } else { bot.sendMessage(chatId, "❌ Cancelled."); }
            userState[chatId] = null; return;
        }

        // মেইন এডমিন ফিচার
        if (chatId == mainAdminId) {
            if (text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'ADD_ADMIN') {
                const id = parseInt(text);
                if(!config.admins.includes(id)) { 
                    config.admins.push(id);
                    await updateConfig({ admins: config.admins });
                    bot.sendMessage(chatId, "✅ Added."); 
                }
                userState[chatId] = null; return;
            }
            if (text === '➖ Remove Admin') { userState[chatId] = 'REM_ADMIN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'REM_ADMIN') {
                const id = parseInt(text);
                const idx = config.admins.indexOf(id);
                if (idx > -1) { 
                    config.admins.splice(idx, 1);
                    await updateConfig({ admins: config.admins });
                    bot.sendMessage(chatId, "✅ Removed."); 
                }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Enter Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { 
            await updateConfig({ supportLink: formatSupportLink(text) });
            bot.sendMessage(chatId, "✅ Updated."); userState[chatId]=null; return; 
        }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Msg:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') {
            bot.sendMessage(chatId, "⏳ Sending broadcast...");
            const allIds = await getAllUsersID();
            for (const id of allIds) {
                bot.sendMessage(id, `📢 <b>Notice:</b>\n${text}`, {parse_mode:'HTML'}).catch(()=>{});
            }
            bot.sendMessage(chatId, "✅ Sent."); userState[chatId] = null; return;
        }

        if (text === '🆔 Set Channel ID') { userState[chatId] = 'SET_CH'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_CH') { 
            await updateConfig({ submissionChannel: text });
            bot.sendMessage(chatId, "✅ Set."); userState[chatId]=null; return; 
        }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Enter Msg:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            bot.sendMessage(userState[chatId].t, `📨 <b>Admin Msg:</b>\n${text}`, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent."); userState[chatId]=null; return; 
        }

        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BAN') { 
            await updateUser(text, { banned: true });
            bot.sendMessage(chatId, "🚫 Banned."); 
            userState[chatId]=null; return; 
        }

        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { 
            await updateUser(text, { banned: false });
            bot.sendMessage(chatId, "✅ Unbanned."); 
            userState[chatId]=null; return; 
        }
    }
});
