const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const admin = require("firebase-admin");
const app = express();

// =========================================================
// ১. ফায়ারবেস কনফিগারেশন (Render Environment Variables)
// =========================================================
const serviceAccount = {
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
};

// ফায়ারবেস কানেক্ট করা
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
// ২. সার্ভার সেটআপ (২৪ ঘন্টা রান রাখার জন্য)
// =========================================================
const port = process.env.PORT || 3000;
app.get('/', (req, res) => {
    res.send('Bot is Running with Firebase Database (Optimized)!');
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// =========================================================
// ৩. বট কনফিগারেশন এবং ভেরিয়েবল
// =========================================================
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0'; // আপনার টোকেন
const mainAdminId = 6802901397; // আপনার আইডি (মেইন এডমিন)
const permanentAdmins = [6802901397]; // মেইন এডমিন সবসময় থাকবে

const bot = new TelegramBot(token, { polling: true });
const userState = {}; // টেম্পোরারি স্টেট (র‍্যামে থাকবে)

// =========================================================
// ৪. ডাটাবেস হেল্পার ফাংশন (অপ্টিমাইজড - ক্যাশ মেমোরি সহ)
// =========================================================

// গ্লোবাল ভেরিয়েবল (মেমোরিতে কনফিগ ধরে রাখার জন্য)
let cachedConfig = null;
let lastConfigFetch = 0;

// কনফিগ লোড করা (স্মার্ট ক্যাশ সিস্টেম)
async function getConfig(forceUpdate = false) {
    const now = Date.now();
    
    // যদি ফোর্স আপডেট না হয় এবং ক্যাশ থাকে এবং ক্যাশের বয়স ৫ মিনিটের কম হয়
    if (!forceUpdate && cachedConfig && (now - lastConfigFetch < 300000)) {
        return cachedConfig;
    }

    try {
        const doc = await settingsColl.doc('main_config').get();
        let data;
        
        if (!doc.exists) {
            // কনফিগ না থাকলে নতুন তৈরি করবে
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

        // পার্মানেন্ট এডমিন এবং মিসিং ফিল্ড চেক
        if (!data.admins) data.admins = [];
        if (typeof data.submissionActive === 'undefined') data.submissionActive = true;
        
        // মেমোরিতে সেভ করা
        cachedConfig = data;
        lastConfigFetch = now;
        
        return data;
    } catch (e) {
        console.error("Config Load Error:", e);
        return cachedConfig || { submissionChannel: mainAdminId, admins: permanentAdmins, submissionActive: true, supportLink: "" };
    }
}

// কনফিগ আপডেট করা (ডাটাবেস + মেমোরি আপডেট)
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

// ইউজার ডাটা লোড বা তৈরি করা
async function getUser(userId, firstName) {
    try {
        const doc = await usersColl.doc(String(userId)).get();
        if (doc.exists) {
            return doc.data();
        } else {
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
        return { id: userId, name: firstName, banned: false, locked: false }; 
    }
}

// ইউজার ডাটা আপডেট করা
async function updateUser(userId, data) {
    try {
        await usersColl.doc(String(userId)).set(data, { merge: true });
    } catch (e) { console.error("User Save Error:", e); }
}

// সব ইউজারদের আইডি আনা (ব্রডকাস্টের জন্য)
async function getAllUsersID() {
    try {
        const snapshot = await usersColl.select().get();
        return snapshot.docs.map(doc => doc.id);
    } catch (e) {
        return [];
    }
}

// এডমিন চেক
function checkIsAdmin(userId, config) {
    return userId == mainAdminId || (config.admins && config.admins.includes(Number(userId)));
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

// =========================================================
// ৫. টেক্সট এবং কীবোর্ড
// =========================================================

const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী (A to Z):</b>\n\n১. প্রথমে '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. আপনার <b>.xlsx</b> (এক্সেল) ফাইলটি আপলোড করুন।\n৩. এডমিন আপনার ফাইল চেক করে কনফার্ম করবেন।\n৪. কোনো সমস্যা হলে '📞 <b>Support</b>' বাটনে ক্লিক করে যোগাযোগ করুন।\n\n<i>ধন্যবাদ!</i>",
    en: "ℹ️ <b>How to Use (A to Z):</b>\n\n1. First, click the '📂 <b>Submit File</b>' button.\n2. Upload your <b>.xlsx</b> (Excel) file.\n3. Admin will review and confirm your file.\n4. If you face any issues, click '📞 <b>Support</b>' to contact us.\n\n<i>Thank you!</i>"
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

// =========================================================
// ৬. কলব্যাক কোয়েরি হ্যান্ডলার
// =========================================================
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
            await updateUser(chatId, { locked: false });
            const config = await getConfig();
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
// ৭. মেইন মেসেজ হ্যান্ডলার (Async)
// =========================================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    const config = await getConfig();
    const user = await getUser(chatId, msg.from.first_name);

    if (!user) return; 

    // আপডেট লক চেক
    if (user.locked === true && chatId != mainAdminId) {
        bot.sendMessage(chatId, "⚠️ <b>System Update Available!</b>\n\nNew features added. Please click <b>Refresh</b> to continue using the bot.", {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh / Update", callback_data: "restart_bot" }]] }
        });
        return;
    }

    const isAdmin = checkIsAdmin(chatId, config);

    // --- সাধারণ কমান্ড ---
    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        await updateUser(chatId, { locked: false }); 
        
        bot.sendMessage(chatId, `👋 <b>Welcome, 🌹${msg.from.first_name}🌹!</b>\n\nPlease select an option from below:`, { 
            parse_mode: 'HTML', 
            reply_markup: getMainMenu(chatId, isAdmin) 
        });
        return;
    }

    if (text === '❌ Cancel' && isAdmin) {
        userState[chatId] = null;
        bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getAdminKeyboard(chatId, config) });
        return;
    }

    if (text === '❌ Cancel') {
        userState[chatId] = null;
        bot.sendMessage(chatId, "❌ Action Cancelled.", { reply_markup: getMainMenu(chatId, isAdmin) });
        return;
    }

    // --- ফাইল সাবমিশন লজিক ---
    if (text === '📂 Submit File') {
        if (!config.submissionActive) {
            bot.sendMessage(chatId, "⚠️ <b>Submission Closed!</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nবর্তমানে ফাইল জমা নেওয়া বন্ধ আছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন অথবা এডমিনের নোটিসের অপেক্ষা করুন।\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖", { parse_mode: 'HTML' });
            return;
        }

        if (user.banned) {
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

    if (userState[chatId] === 'WAITING_FOR_FILE') {
        if (!config.submissionActive) {
            bot.sendMessage(chatId, "⚠️ <b>Submission Closed Just Now!</b>", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
            userState[chatId] = null;
            return;
        }

        if (msg.document && msg.document.file_name && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            const forwardTarget = config.submissionChannel || mainAdminId;
            const currentDate = getFormattedDate();

            if (config.lastDate !== currentDate) {
                bot.sendMessage(forwardTarget, `📅 <b>এখানে থেকে ${currentDate} তারিখ এর ফাইল রিসিভ শুরু।</b>`, {parse_mode: 'HTML'});
                await updateConfig({ lastDate: currentDate }); 
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
                
                bot.sendMessage(chatId, "✅ <b>FILE SUBMITTED!</b>\n\nYour file has been sent for review.", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
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

    if (text === '👤 Profile') {
        const status = user.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>USER PROFILE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<b>Name:</b> ${user.name}\n<b>User ID:</b> <code>${chatId}</code>\n<b>Status:</b> ${status}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`, { parse_mode: 'HTML' });
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
        const link = config.supportLink || "https://t.me/YourUsername";
        bot.sendMessage(chatId, "📞 <b>24/7 CUSTOMER SUPPORT</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nNeed help? Contact our admin directly.\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖", { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "💬 Contact Admin", url: link }]] }
        });
        return;
    }

    // =========================================================
    // ৮. এডমিন প্যানেল লজিক
    // =========================================================
    if (isAdmin) {
        if (text === '🛠 Admin Panel') {
            bot.sendMessage(chatId, "🛠 <b>ADMIN DASHBOARD</b>\nSelect an action:", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            return;
        }

        if (text === '🔄 Reset Date') {
            userState[chatId] = 'RESET_DATE_PASS';
            bot.sendMessage(chatId, "🔒 <b>Security Check</b>\nTo reset the date tracker, please enter the password:", { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            return;
        }
        if (userState[chatId] === 'RESET_DATE_PASS') {
            if (text === 'MTS@2026') {
                await updateConfig({ lastDate: "" }); 
                bot.sendMessage(chatId, "✅ <b>Success!</b> Date tracker has been reset.", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            } else {
                bot.sendMessage(chatId, "❌ <b>Wrong Password!</b> Access Denied.", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            }
            userState[chatId] = null;
            return;
        }

        if (text === '🟢 Submission ON' || text === '🔴 Submission OFF') {
            const newState = !config.submissionActive;
            await updateConfig({ submissionActive: newState });
            const statusMsg = newState ? "✅ <b>Submission is now OPEN.</b>" : "⛔ <b>Submission is now CLOSED.</b>";
            const newConfig = { ...config, submissionActive: newState };
            bot.sendMessage(chatId, statusMsg, { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, newConfig) });
            return;
        }

        if (text === '⚠️ Send Update Alert') {
            userState[chatId] = 'CONFIRM_UPDATE_ALERT';
            bot.sendMessage(chatId, "⚠️ <b>Are you sure?</b>\nThis will send a 'Restart Bot' message to ALL users (except you).\n\nType <b>'yes'</b> to confirm or click Cancel.", {parse_mode: 'HTML', reply_markup: cancelKeyboard});
            return;
        }
        if (userState[chatId] === 'CONFIRM_UPDATE_ALERT') {
            if (text.toLowerCase() === 'yes') {
                bot.sendMessage(chatId, "⏳ Sending alerts... This might take a while.");
                const alertMsg = "⚠️ <b>SYSTEM UPDATE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\nআসসালামু আলাইকুম সবাই নতুন ফিচার ব্যবহার করার জন্য Start / update দিন\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖";
                
                const allIds = await getAllUsersID();
                let count = 0;
                
                const batch = db.batch();
                
                for (const id of allIds) {
                    if (id != chatId) {
                        const userRef = usersColl.doc(id);
                        batch.set(userRef, { locked: true }, { merge: true });
                        
                        bot.sendMessage(id, alertMsg, {
                            parse_mode: 'HTML',
                            reply_markup: { inline_keyboard: [[{ text: "🔄 Update Now / Restart", callback_data: "restart_bot" }]] }
                        }).catch(()=>{});
                        count++;
                    }
                }
                await batch.commit(); 
                
                bot.sendMessage(chatId, `✅ <b>Alert Sent to ${count} users.</b>\nUsers are now locked until update.`, {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)});
            } else {
                bot.sendMessage(chatId, "❌ Cancelled.", {reply_markup: getAdminKeyboard(chatId, config)});
            }
            userState[chatId] = null;
            return;
        }

        if (chatId == mainAdminId) {
            if (text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'ADD_ADMIN') {
                const nid = parseInt(text);
                if (isNaN(nid)) { bot.sendMessage(chatId, "❌ Invalid ID"); return; }
                
                if (!config.admins.includes(nid)) { 
                    config.admins.push(nid); 
                    await updateConfig({ admins: config.admins });
                    bot.sendMessage(chatId, "✅ Added.", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
                } else { 
                    bot.sendMessage(chatId, "⚠️ Already Admin.", {reply_markup: getAdminKeyboard(chatId, config)}); 
                }
                userState[chatId] = null; return;
            }

            if (text === '➖ Remove Admin') { userState[chatId] = 'REM_ADMIN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'REM_ADMIN') {
                const tid = parseInt(text);
                if (tid == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot remove Main Admin.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
                const idx = config.admins.indexOf(tid);
                if (idx > -1) { 
                    config.admins.splice(idx, 1); 
                    await updateConfig({ admins: config.admins });
                    bot.sendMessage(chatId, "✅ Removed.", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
                } else { 
                    bot.sendMessage(chatId, "⚠️ Not an Admin.", {reply_markup: getAdminKeyboard(chatId, config)}); 
                }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Enter Username/Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { 
            const formattedLink = formatSupportLink(text);
            await updateConfig({ supportLink: formattedLink });
            bot.sendMessage(chatId, `✅ <b>Link Updated!</b>\n${formattedLink}`, {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
            userState[chatId] = null; 
            return; 
        }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Message:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') { 
            bot.sendMessage(chatId, "⏳ Sending Broadcast...");
            const msgBody = `📢 <b>OFFICIAL NOTICE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<i>~ Management Team</i>`;
            const allIds = await getAllUsersID();
            
            for (const id of allIds) {
                bot.sendMessage(id, msgBody, {parse_mode: 'HTML'}).catch(()=>{});
            } 
            bot.sendMessage(chatId, "✅ <b>Sent Successfully.</b>", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
            userState[chatId] = null; 
            return; 
        }

        if (text === '🆔 Set Channel ID') { userState[chatId] = 'SET_CH'; bot.sendMessage(chatId, "Enter Channel ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_CH') { 
            await updateConfig({ submissionChannel: text });
            bot.sendMessage(chatId, "✅ Set.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; 
        }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Enter Message:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            const replyMsg = `📨 <b>NEW MESSAGE FROM ADMIN</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`;
            bot.sendMessage(userState[chatId].t, replyMsg, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, config)}); 
            userState[chatId]=null; 
            return; 
        }
    
        // ======================================================
        // BAN USER SECTION (UPDATED)
        // ======================================================
        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter User ID to Ban:", {reply_markup: cancelKeyboard}); return; }
        
        if (userState[chatId] === 'BAN') { 
            const targetId = text.trim();

            // ১. মেইন এডমিন চেক (মেইন এডমিনকে কেউ ব্যান করতে পারবে না)
            if (targetId == mainAdminId) { 
                bot.sendMessage(chatId, "❌ <b>Operation Denied!</b>\nমেইন এডমিনকে ব্যান করা সম্ভব না।", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
                userState[chatId] = null;
                return; 
            }

            // ২. সাব-এডমিন চেক (এডমিন লিস্টে থাকলে ব্যান করা যাবে না)
            const isTargetAdmin = config.admins && config.admins.includes(Number(targetId));

            if (isTargetAdmin) {
                // সাব এডমিন যদি অন্য সাব এডমিনকে ব্যান করতে চায়
                bot.sendMessage(chatId, "⚠️ <b>Warning!</b>\nএই আইডিটি একজন <b>এডমিন</b>-এর।\nএডমিনকে ব্যান করা সম্ভব না।", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
                userState[chatId] = null;
                return;
            }

            // সাধারণ ইউজার হলে ব্যান হবে
            await updateUser(targetId, { banned: true });
            bot.sendMessage(chatId, `🚫 <b>User (ID: ${targetId}) Banned Successfully.</b>`, {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
            userState[chatId]=null; 
            return; 
        }
        
        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { 
            await updateUser(text, { banned: false });
            bot.sendMessage(chatId, "✅ <b>User Unbanned Successfully.</b>", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)}); 
            userState[chatId]=null; return; 
        }
    }
});
console.log("🚀 Premium Business Bot with Firebase Running...");
