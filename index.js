const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const admin = require("firebase-admin");
const app = express();

// =========================================================
// ১. ফায়ারবেস কনফিগারেশন
// =========================================================
const serviceAccount = {
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🔥 Firebase Connected Successfully!");
    } catch (e) {
        console.error("❌ Firebase Connection Failed: " + e.message);
    }
}

const db = admin.firestore();
const usersColl = db.collection('users');
const settingsColl = db.collection('settings'); 

// =========================================================
// ২. সার্ভার সেটআপ
// =========================================================
const port = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.send('Bot is Running with Dual Alert System!');
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// =========================================================
// ৩. বট কনফিগারেশন
// =========================================================
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0'; 
const mainAdminId = 6802901397; 
const permanentAdmins = [6802901397]; 

const bot = new TelegramBot(token, { polling: true });
const userState = {}; 

// =========================================================
// ৪. ডাটাবেস হেল্পার ফাংশন
// =========================================================
let cachedConfig = null;
let lastConfigFetch = 0;

async function getConfig(forceUpdate = false) {
    const now = Date.now();
    if (!forceUpdate && cachedConfig && (now - lastConfigFetch < 300000)) {
        return cachedConfig;
    }

    try {
        const doc = await settingsColl.doc('main_config').get();
        let data;
        
        if (!doc.exists) {
            data = {
                submissionChannel: mainAdminId,
                supportLink: "https://t.me/YourUsername",
                admins: permanentAdmins,
                lastDateInsta: "", // আলাদা ডেট ট্র্যাকার
                lastDateFb: "",    // আলাদা ডেট ট্র্যাকার
                instaActive: true,
                fbActive: true,
                instaClosedMsg: "Currently Closed.",
                fbClosedMsg: "Currently Closed."
            };
            await settingsColl.doc('main_config').set(data);
        } else {
            data = doc.data();
        }

        if (!data.admins) data.admins = [];
        if (typeof data.instaActive === 'undefined') data.instaActive = true;
        if (typeof data.fbActive === 'undefined') data.fbActive = true;
        if (!data.instaClosedMsg) data.instaClosedMsg = "Submission Closed.";
        if (!data.fbClosedMsg) data.fbClosedMsg = "Submission Closed.";
        
        // ব্যাকওয়ার্ড কম্প্যাটিবিলিটি (নতুন ফিল্ড যোগ করা)
        if (typeof data.lastDateInsta === 'undefined') data.lastDateInsta = "";
        if (typeof data.lastDateFb === 'undefined') data.lastDateFb = "";
        
        cachedConfig = data;
        lastConfigFetch = now;
        return data;
    } catch (e) {
        return cachedConfig || { 
            submissionChannel: mainAdminId, 
            admins: permanentAdmins, 
            instaActive: true, 
            fbActive: true, 
            instaClosedMsg: "Closed",
            fbClosedMsg: "Closed",
            lastDateInsta: "",
            lastDateFb: ""
        };
    }
}

async function updateConfig(data) {
    try {
        await settingsColl.doc('main_config').set(data, { merge: true });
        if (cachedConfig) {
            cachedConfig = { ...cachedConfig, ...data };
        } else {
            await getConfig(true);
        }
    } catch (e) { console.error("Config Save Error:", e); }
}

async function getUser(userId, firstName) {
    try {
        const doc = await usersColl.doc(String(userId)).get();
        if (doc.exists) {
            return doc.data();
        } else {
            const newUser = { id: userId, name: firstName, balance: 0, banned: false, locked: false };
            await usersColl.doc(String(userId)).set(newUser);
            return newUser;
        }
    } catch (e) {
        return { id: userId, name: firstName, banned: false, locked: false }; 
    }
}

async function updateUser(userId, data) {
    try { await usersColl.doc(String(userId)).set(data, { merge: true }); } catch (e) {}
}

async function getAllUsersID() {
    try {
        const snapshot = await usersColl.select().get();
        return snapshot.docs.map(doc => doc.id);
    } catch (e) { return []; }
}

function checkIsAdmin(userId, config) {
    return userId == mainAdminId || (config.admins && config.admins.includes(Number(userId)));
}

function getFormattedDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1; 
    let dd = today.getDate();
    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;
    return dd + '/' + mm + '/' + yyyy;
}

// =========================================================
// ৫. কীবোর্ড এবং টেক্সট
// =========================================================
const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী:</b>\n\n১. '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. ক্যাটাগরি (Instagram/Facebook) সিলেক্ট করুন।\n৩. আপনার <b>.xlsx</b> ফাইল আপলোড করুন।",
    en: "ℹ️ <b>How to Use:</b>\n\n1. Click '📂 <b>Submit File</b>'.\n2. Select category (Instagram/Facebook).\n3. Upload <b>.xlsx</b> file."
};

function getMainMenu(userId, isAdmin) {
    let keyboard = [
        [{ text: "📂 Submit File" }], 
        [{ text: "👤 Profile" }, { text: "ℹ️ Use Info" }], 
        [{ text: "📞 Support" }] 
    ];
    if (isAdmin) keyboard.push([{ text: "🛠 Admin Panel" }]);
    return { keyboard: keyboard, resize_keyboard: true };
}

// সাবমিশন মেনু (Reply Keyboard)
function getSubmissionMenu() {
    return {
        keyboard: [
            [{ text: "📸 Submit Instagram" }, { text: "🔵 Submit Facebook" }],
            [{ text: "🔙 Back to Home" }]
        ],
        resize_keyboard: true
    };
}

function getAdminKeyboard(userId, config) {
    let kb = [
        [{ text: "⚙️ Control Submission" }, { text: "🔄 Reset Date" }],
        [{ text: "⚠️ Send Update Alert" }, { text: "📢 Broadcast" }],
        [{ text: "🚫 Ban User" }, { text: "✅ Unban User" }],
        [{ text: "🆔 Set Channel ID" }, { text: "🔗 Set Support Link" }],
        [{ text: "📨 Reply User" }, { text: "🔙 Back to Home" }]
    ];
    if (userId == mainAdminId) kb.unshift([{ text: "➕ Add Admin" }, { text: "➖ Remove Admin" }]);
    return { keyboard: kb, resize_keyboard: true };
}

function getSubControlKeyboard(config) {
    const instaStatus = config.instaActive ? "🟢 Insta: ON" : "🔴 Insta: OFF";
    const fbStatus = config.fbActive ? "🟢 FB: ON" : "🔴 FB: OFF";
    return {
        keyboard: [
            [{ text: instaStatus }, { text: fbStatus }],
            [{ text: "🔙 Back to Admin" }]
        ],
        resize_keyboard: true
    };
}

const cancelKeyboard = { keyboard: [[{ text: "❌ Cancel" }]], resize_keyboard: true };

function formatSupportLink(input) {
    if (input.startsWith("https://") || input.startsWith("http://")) return input;
    if (input.startsWith("@")) return `https://t.me/${input.substring(1)}`;
    return `https://t.me/${input}`;
}

// =========================================================
// ৬. কলব্যাক কোয়েরি হ্যান্ডলার
// =========================================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const config = await getConfig();

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
            await updateUser(chatId, { locked: false });
            const isAdmin = checkIsAdmin(chatId, config);
            bot.sendMessage(chatId, "✅ <b>Refreshed Successfully!</b>\nSelect an option:", { 
                parse_mode: 'HTML', 
                reply_markup: getMainMenu(chatId, isAdmin) 
            });
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
        }
    } catch (e) { console.log(e.message); }
    bot.answerCallbackQuery(query.id);
});

// =========================================================
// ৭. মেইন মেসেজ হ্যান্ডলার
// =========================================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    const config = await getConfig();
    const user = await getUser(chatId, msg.from.first_name);

    if (!user) return; 

    if (user.locked === true && chatId != mainAdminId) {
        bot.sendMessage(chatId, "⚠️ <b>Update Available!</b>\nPlease click Refresh.", {
            parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "restart_bot" }]] }
        });
        return;
    }

    const isAdmin = checkIsAdmin(chatId, config);

    // ======================================================
    // CANCEL LOGIC (FIXED FOR ADMIN)
    // ======================================================
    if (text === '❌ Cancel') {
        // চেক করা ইউজার কি সাবমিশন বা ইউজার মোডে ছিল?
        const wasInUserMode = userState[chatId] && (userState[chatId].state === 'WAITING_FILE' || userState[chatId].type);
        
        userState[chatId] = null;
        
        if (isAdmin && !wasInUserMode) {
             // যদি এডমিন প্যানেলের কোনো কাজে থাকে (যেমন ব্যান করা, লিংক সেট করা), তখন এডমিন প্যানেলে ব্যাক করবে
            bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getAdminKeyboard(chatId, config) });
        } else {
            // যদি ফাইল সাবমিশন বা সাধারণ ইউজার মোডে থাকে, তাহলে মেইন মেনুতে ব্যাক করবে
            bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getMainMenu(chatId, isAdmin) });
        }
        return;
    }

    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        await updateUser(chatId, { locked: false }); 
        
        bot.sendMessage(chatId, `👋 <b>Welcome, 🌹${msg.from.first_name}🌹!</b>\n\nPlease select an option from below:`, { 
            parse_mode: 'HTML', 
            reply_markup: getMainMenu(chatId, isAdmin) 
        });
        return;
    }

    // --- ফাইল সাবমিশন ---
    if (text === '📂 Submit File') {
        if (user.banned) {
            bot.sendMessage(chatId, "🚫 <b>ACCESS DENIED</b>\nYou are banned.", { parse_mode: 'HTML' });
            return;
        }
        bot.sendMessage(chatId, "📂 <b>Select Category:</b>\nWhich type of file you want to submit?", { 
            parse_mode: 'HTML', 
            reply_markup: getSubmissionMenu() 
        });
        return;
    }

    if (text === '📸 Submit Instagram') {
        if (!config.instaActive) {
            bot.sendMessage(chatId, config.instaClosedMsg || "⚠️ Closed.", { parse_mode: 'HTML' });
            return;
        }
        userState[chatId] = { state: 'WAITING_FILE', type: 'INSTAGRAM' };
        bot.sendMessage(chatId, "📸 <b>INSTAGRAM SUBMISSION</b>\nUpload your <b>.xlsx</b> file.", { 
            parse_mode: 'HTML', reply_markup: cancelKeyboard 
        });
        return;
    }

    if (text === '🔵 Submit Facebook') {
        if (!config.fbActive) {
            bot.sendMessage(chatId, config.fbClosedMsg || "⚠️ Closed.", { parse_mode: 'HTML' });
            return;
        }
        userState[chatId] = { state: 'WAITING_FILE', type: 'FACEBOOK' };
        bot.sendMessage(chatId, "🔵 <b>FACEBOOK SUBMISSION</b>\nUpload your <b>.xlsx</b> file.", { 
            parse_mode: 'HTML', reply_markup: cancelKeyboard 
        });
        return;
    }

    // --- ফাইল রিসিভ (DUAL ALERT SYSTEM) ---
    if (userState[chatId] && userState[chatId].state === 'WAITING_FILE') {
        const subType = userState[chatId].type; 
        
        if ((subType === 'INSTAGRAM' && !config.instaActive) || (subType === 'FACEBOOK' && !config.fbActive)) {
            bot.sendMessage(chatId, "⚠️ Submission Closed just now.", { reply_markup: getMainMenu(chatId, isAdmin) });
            userState[chatId] = null;
            return;
        }

        if (msg.document && msg.document.file_name && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            const forwardTarget = config.submissionChannel || mainAdminId;
            const currentDate = getFormattedDate();

            // INSTAGRAM ALERT
            if (subType === 'INSTAGRAM' && config.lastDateInsta !== currentDate) {
                bot.sendMessage(forwardTarget, `📅 <b>আসসালামু আলাইকুম এডমিন, এই ফাইল থেকে আজকের Instagram আইডি রিসিভ শুরু।</b>`, {parse_mode: 'HTML'});
                await updateConfig({ lastDateInsta: currentDate }); 
            }

            // FACEBOOK ALERT
            if (subType === 'FACEBOOK' && config.lastDateFb !== currentDate) {
                bot.sendMessage(forwardTarget, `📅 <b>আসসালামু আলাইকুম এডমিন, এই ফাইল থেকে আজকের Facebook আইডি রিসিভ শুরু।</b>`, {parse_mode: 'HTML'});
                await updateConfig({ lastDateFb: currentDate }); 
            }

            bot.forwardMessage(forwardTarget, chatId, msg.message_id).then((forwardedMsg) => {
                const typeEmoji = subType === 'INSTAGRAM' ? '📸' : '🔵';
                const senderName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
                
                const infoMessage = `${typeEmoji} <b>New ${subType} File:</b>\n` +
                                    `Name: ${senderName}\n` +
                                    `ID: <code>${chatId}</code>`;

                bot.sendMessage(forwardTarget, infoMessage, { parse_mode: 'HTML', reply_to_message_id: forwardedMsg.message_id });
                bot.sendMessage(chatId, "✅ <b>FILE SUBMITTED!</b>", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
                userState[chatId] = null;
            }).catch((err) => {
                bot.sendMessage(chatId, "❌ <b>Error:</b> Could not send file.", {parse_mode: 'HTML'});
            });
        } else {
            bot.sendMessage(chatId, "⚠️ <b>Invalid File!</b> Only .xlsx accepted.", { parse_mode: 'HTML' });
        }
        return;
    }

    if (text === '👤 Profile') {
        const status = user.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>Name:</b> ${user.name}\nID: <code>${chatId}</code>\nStatus: ${status}`, { parse_mode: 'HTML' });
        return;
    }
    if (text === 'ℹ️ Use Info') {
        bot.sendMessage(chatId, useInfoText.bn, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "lang_en" }]] } });
        return;
    }
    if (text === '📞 Support') {
        bot.sendMessage(chatId, "📞 <b>Support:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "Contact", url: config.supportLink || "https://t.me/" }]] } });
        return;
    }

    // =========================================================
    // ৮. এডমিন প্যানেল লজিক
    // =========================================================
    if (isAdmin) {
        if (text === '🛠 Admin Panel' || text === '🔙 Back to Admin') {
            userState[chatId] = null;
            bot.sendMessage(chatId, "🛠 <b>ADMIN DASHBOARD</b>", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            return;
        }

        if (text === '⚙️ Control Submission') {
            bot.sendMessage(chatId, "⚙️ <b>Control Panel</b>", {
                parse_mode: 'HTML',
                reply_markup: getSubControlKeyboard(config)
            });
            return;
        }

        // INSTAGRAM OFF LOGIC + CHANNEL ALERT
        if (text === '🟢 Insta: ON') {
            userState[chatId] = 'DISABLE_INSTA_MSG';
            bot.sendMessage(chatId, "📝 <b>Instagram বন্ধ করা হচ্ছে...</b>\n\nইউজারদের জন্য মেসেজ লিখুন:", { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
            return;
        }
        if (userState[chatId] === 'DISABLE_INSTA_MSG') {
            await updateConfig({ instaActive: false, instaClosedMsg: text });
            
            // চ্যানেলে নোটিস পাঠানো
            const forwardTarget = config.submissionChannel || mainAdminId;
            bot.sendMessage(forwardTarget, `⛔ <b>আসসালামু আলাইকুম, এই Instagram ফাইল টাই সর্বশেষ সাবমিট কৃত ফাইল।</b>`, {parse_mode: 'HTML'});
            
            const newConfig = { ...config, instaActive: false, instaClosedMsg: text };
            bot.sendMessage(chatId, `⛔ <b>Instagram Closed!</b>`, { parse_mode: 'HTML', reply_markup: getSubControlKeyboard(newConfig) });
            userState[chatId] = null;
            return;
        }

        if (text === '🔴 Insta: OFF') {
            await updateConfig({ instaActive: true });
            const newConfig = { ...config, instaActive: true };
            bot.sendMessage(chatId, "✅ <b>Instagram OPEN.</b>", { parse_mode: 'HTML', reply_markup: getSubControlKeyboard(newConfig) });
            return;
        }

        // FACEBOOK OFF LOGIC + CHANNEL ALERT
        if (text === '🟢 FB: ON') {
            userState[chatId] = 'DISABLE_FB_MSG';
            bot.sendMessage(chatId, "📝 <b>Facebook বন্ধ করা হচ্ছে...</b>\n\nইউজারদের জন্য মেসেজ লিখুন:", { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
            return;
        }
        if (userState[chatId] === 'DISABLE_FB_MSG') {
            await updateConfig({ fbActive: false, fbClosedMsg: text });

            // চ্যানেলে নোটিস পাঠানো
            const forwardTarget = config.submissionChannel || mainAdminId;
            bot.sendMessage(forwardTarget, `⛔ <b>আসসালামু আলাইকুম, এই Facebook ফাইল টাই সর্বশেষ সাবমিট কৃত ফাইল।</b>`, {parse_mode: 'HTML'});

            const newConfig = { ...config, fbActive: false, fbClosedMsg: text };
            bot.sendMessage(chatId, `⛔ <b>Facebook Closed!</b>`, { parse_mode: 'HTML', reply_markup: getSubControlKeyboard(newConfig) });
            userState[chatId] = null;
            return;
        }

        if (text === '🔴 FB: OFF') {
            await updateConfig({ fbActive: true });
            const newConfig = { ...config, fbActive: true };
            bot.sendMessage(chatId, "✅ <b>Facebook OPEN.</b>", { parse_mode: 'HTML', reply_markup: getSubControlKeyboard(newConfig) });
            return;
        }

        // --- অন্যান্য এডমিন ফিচার ---
        if (text === '🔄 Reset Date') {
            userState[chatId] = 'RESET_DATE_PASS';
            bot.sendMessage(chatId, "🔒 Password:", { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            return;
        }
        if (userState[chatId] === 'RESET_DATE_PASS') {
            if (text === 'MTS@2026') {
                // দুইটা ডেটই রিসেট হবে
                await updateConfig({ lastDateInsta: "", lastDateFb: "" }); 
                bot.sendMessage(chatId, "✅ <b>All Dates Reset!</b>", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            } else {
                bot.sendMessage(chatId, "❌ Wrong Pass.", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            }
            userState[chatId] = null;
            return;
        }

        if (text === '⚠️ Send Update Alert') {
            userState[chatId] = 'CONFIRM_UPDATE_ALERT';
            bot.sendMessage(chatId, "⚠️ Type <b>'yes'</b> to confirm.", {parse_mode: 'HTML', reply_markup: cancelKeyboard});
            return;
        }
        if (userState[chatId] === 'CONFIRM_UPDATE_ALERT') {
            if (text.toLowerCase() === 'yes') {
                bot.sendMessage(chatId, "⏳ Sending...");
                const allIds = await getAllUsersID();
                const batch = db.batch();
                for (const id of allIds) {
                    if (id != chatId) {
                        batch.set(usersColl.doc(id), { locked: true }, { merge: true });
                        bot.sendMessage(id, "⚠️ <b>System Update!</b>\nRestart bot.", {
                            parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🔄 Restart", callback_data: "restart_bot" }]] }
                        }).catch(()=>{});
                    }
                }
                await batch.commit(); 
                bot.sendMessage(chatId, "✅ Done.", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)});
            } else {
                bot.sendMessage(chatId, "❌ Cancelled.", {reply_markup: getAdminKeyboard(chatId, config)});
            }
            userState[chatId] = null;
            return;
        }

        if (chatId == mainAdminId) {
            if (text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'ADD_ADMIN') {
                const nid = parseInt(text);
                if (!config.admins.includes(nid)) { config.admins.push(nid); await updateConfig({ admins: config.admins }); bot.sendMessage(chatId, "✅ Added.", {reply_markup: getAdminKeyboard(chatId, config)}); }
                else { bot.sendMessage(chatId, "⚠️ Exists.", {reply_markup: getAdminKeyboard(chatId, config)}); }
                userState[chatId] = null; return;
            }
            if (text === '➖ Remove Admin') { userState[chatId] = 'REM_ADMIN'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'REM_ADMIN') {
                const tid = parseInt(text);
                if (tid == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot remove Main.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
                const idx = config.admins.indexOf(tid);
                if (idx > -1) { config.admins.splice(idx, 1); await updateConfig({ admins: config.admins }); bot.sendMessage(chatId, "✅ Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); }
                else { bot.sendMessage(chatId, "⚠️ Not found.", {reply_markup: getAdminKeyboard(chatId, config)}); }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { await updateConfig({ supportLink: formatSupportLink(text) }); bot.sendMessage(chatId, "✅ Done.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Msg:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') { 
            const allIds = await getAllUsersID();
            for (const id of allIds) { bot.sendMessage(id, `📢 <b>Notice:</b>\n${text}`, {parse_mode: 'HTML'}).catch(()=>{}); } 
            bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; 
        }

        if (text === '🆔 Set Channel ID') { userState[chatId] = 'SET_CH'; bot.sendMessage(chatId, "Channel ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_CH') { await updateConfig({ submissionChannel: text }); bot.sendMessage(chatId, "✅ Set.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Msg:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            bot.sendMessage(userState[chatId].t, `📨 <b>Admin Reply:</b>\n${text}`, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; 
        }
    
        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BAN') { 
            if(text == mainAdminId || (config.admins && config.admins.includes(Number(text)))) {
                 bot.sendMessage(chatId, "❌ Cannot ban Admin.", {reply_markup: getAdminKeyboard(chatId, config)}); 
            } else {
                 await updateUser(text, { banned: true }); bot.sendMessage(chatId, "🚫 Banned.", {reply_markup: getAdminKeyboard(chatId, config)}); 
            }
            userState[chatId]=null; return; 
        }
        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { await updateUser(text, { banned: false }); bot.sendMessage(chatId, "✅ Unbanned.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
    }
});
console.log("🚀 Bot Running with Dual Channel Alerts...");
