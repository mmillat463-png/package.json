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
    res.send('Bot is Running with Fully Custom Channel Setup!');
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
                submissionChannel: "", // Global (IG & FB)
                instaChannel: "",      // Only IG
                fbChannel: "",         // Only FB
                supportLink: "https://t.me/YourUsername",
                admins: permanentAdmins,
                lastDateInsta: "", 
                lastDateFb: "",    
                instaActive: true,
                fbActive: true,
                instaClosedMsg: "Currently Closed.",
                fbClosedMsg: "Currently Closed.",
                paymentName: "Bkash Number", 
                paymentName2: "",            
                tutorialVideoId: ""          
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
        if (!data.paymentName) data.paymentName = "Bkash Number";
        if (!data.paymentName2) data.paymentName2 = ""; 
        if (!data.submissionChannel) data.submissionChannel = ""; // Global
        if (!data.instaChannel) data.instaChannel = "";
        if (!data.fbChannel) data.fbChannel = "";
        if (!data.tutorialVideoId) data.tutorialVideoId = "";
        
        cachedConfig = data;
        lastConfigFetch = now;
        return data;
    } catch (e) {
        return cachedConfig || { 
            submissionChannel: "", 
            admins: permanentAdmins, 
            instaActive: true, 
            fbActive: true, 
            paymentName: "Bkash Number",
            paymentName2: ""
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
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী:</b>\n\n১. '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. ক্যাটাগরি (Instagram/Facebook) সিলেক্ট করুন।\n৩. আপনার <b>.xlsx</b> ফাইল আপলোড করুন।\n৪. পেমেন্ট মেথড সিলেক্ট করে নাম্বার দিন।",
    en: "ℹ️ <b>Rules for using the bot:</b>\n\n1. Click the '📂 <b>Submit File</b>' button.\n2. Select Category (Instagram/Facebook).\n3. Upload your <b>.xlsx</b> file.\n4. Select payment method and enter number."
};

function getMainMenu(userId, isAdmin) {
    let keyboard = [
        [{ text: "📂 Submit File" }], 
        [{ text: "👤 Profile" }, { text: "🎥 Bot Use Video" }], 
        [{ text: "ℹ️ Use Info" }, { text: "📞 Support" }] 
    ];
    if (isAdmin) keyboard.push([{ text: "🛠 Admin Panel" }]);
    return { keyboard: keyboard, resize_keyboard: true };
}

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
        [{ text: "💳 Manage Payment" }, { text: "📢 Broadcast" }],
        [{ text: "🆔 Manage Channels" }, { text: "🎥 Manage Video" }], 
        [{ text: "🚫 Ban User" }, { text: "✅ Unban User" }],
        [{ text: "🔗 Set Support Link" }, { text: "📨 Reply User" }],
        [{ text: "🔙 Back to Home" }]
    ];
    
    if (userId == mainAdminId) {
        kb.splice(2, 0, [{ text: "⚠️ Send Update Alert" }]);
        kb.unshift([{ text: "➕ Add Admin" }, { text: "➖ Remove Admin" }]);
    }
    
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
        else if (data.startsWith('pay_select_')) {
            const selectedMethod = data.replace('pay_select_', '');
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            
            if (userState[chatId]) {
                userState[chatId].state = 'WAITING_NUMBER';
                userState[chatId].selectedPayment = selectedMethod;
                
                bot.sendMessage(chatId, `📝 <b>Step 3/3:</b>\nঅনুগ্রহ করে আপনার <b>${selectedMethod}</b> টি দিন:`, { 
                    parse_mode: 'HTML', reply_markup: cancelKeyboard 
                });
            }
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
    // CANCEL LOGIC
    // ======================================================
    if (text === '❌ Cancel') {
        userState[chatId] = null;
        if (isAdmin) {
            bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: getAdminKeyboard(chatId, config) });
        } else {
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

    // --- VIDEO SHOW ---
    if (text === '🎥 Bot Use Video') {
        if (config.tutorialVideoId) {
            bot.sendVideo(chatId, config.tutorialVideoId, {
                caption: "🎥 <b>How to use this bot</b>",
                parse_mode: 'HTML'
            }).catch(() => {
                bot.sendMessage(chatId, "⚠️ Video unavailable temporarily.");
            });
        } else {
            bot.sendMessage(chatId, "⚠️ No tutorial video set yet.", { parse_mode: 'HTML' });
        }
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

    // --- ফাইল রিসিভ (স্টেপ ১: ফাইল নেওয়া) ---
    if (userState[chatId] && userState[chatId].state === 'WAITING_FILE') {
        const subType = userState[chatId].type; 
        
        if ((subType === 'INSTAGRAM' && !config.instaActive) || (subType === 'FACEBOOK' && !config.fbActive)) {
            bot.sendMessage(chatId, "⚠️ Submission Closed just now.", { reply_markup: getMainMenu(chatId, isAdmin) });
            userState[chatId] = null;
            return;
        }

        if (msg.document && msg.document.file_name && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            userState[chatId] = { 
                state: 'WAITING_PAYMENT_SELECT', 
                type: subType, 
                fileMsgId: msg.message_id 
            };
            
            const pay1 = config.paymentName;
            const pay2 = config.paymentName2;

            if (pay1 && pay2) {
                bot.sendMessage(chatId, "💳 <b>Select Payment Method:</b>", {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: pay1, callback_data: `pay_select_${pay1}` }],
                            [{ text: pay2, callback_data: `pay_select_${pay2}` }]
                        ]
                    }
                });
            } else {
                const finalPay = pay1 || "Bkash";
                userState[chatId].state = 'WAITING_NUMBER';
                userState[chatId].selectedPayment = finalPay;
                bot.sendMessage(chatId, `📝 <b>Step 2/2:</b>\nঅনুগ্রহ করে আপনার <b>${finalPay}</b> টি দিন:`, { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            }

        } else {
            bot.sendMessage(chatId, "⚠️ <b>Invalid File!</b> Only .xlsx accepted.", { parse_mode: 'HTML' });
        }
        return;
    }

    // --- নাম্বার রিসিভ এবং ফরওয়ার্ডিং (স্টেপ ২/৩) ---
    if (userState[chatId] && userState[chatId].state === 'WAITING_NUMBER') {
        const number = text;
        const subType = userState[chatId].type;
        const fileMsgId = userState[chatId].fileMsgId;
        const paymentName = userState[chatId].selectedPayment;

        // চ্যানেল লজিক: 
        // ১. যদি স্পেসিফিক (Insta/FB) চ্যানেল সেট থাকে, সেখানে যাবে।
        // ২. যদি স্পেসিফিক সেট না থাকে, তাহলে গ্লোবাল (Global IG & FB) চ্যানেলে যাবে।
        // ৩. যদি কোনোটাই সেট না থাকে, মেইন এডমিনের কাছে যাবে।
        let forwardTarget = mainAdminId;
        
        if (subType === 'INSTAGRAM') {
            if (config.instaChannel) forwardTarget = config.instaChannel; // Priority 1: Specific
            else if (config.submissionChannel) forwardTarget = config.submissionChannel; // Priority 2: Global
        } else if (subType === 'FACEBOOK') {
            if (config.fbChannel) forwardTarget = config.fbChannel; // Priority 1: Specific
            else if (config.submissionChannel) forwardTarget = config.submissionChannel; // Priority 2: Global
        }

        const currentDate = getFormattedDate();

        if (subType === 'INSTAGRAM' && config.lastDateInsta !== currentDate) {
            bot.sendMessage(forwardTarget, `📅 <b>আসসালামু আলাইকুম এডমিন, এই ফাইল থেকে আজকের Instagram আইডি রিসিভ শুরু।</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            await updateConfig({ lastDateInsta: currentDate }); 
        }

        if (subType === 'FACEBOOK' && config.lastDateFb !== currentDate) {
            bot.sendMessage(forwardTarget, `📅 <b>আসসালামু আলাইকুম এডমিন, এই ফাইল থেকে আজকের Facebook আইডি রিসিভ শুরু।</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            await updateConfig({ lastDateFb: currentDate }); 
        }

        bot.forwardMessage(forwardTarget, chatId, fileMsgId).then((forwardedMsg) => {
            const typeEmoji = subType === 'INSTAGRAM' ? '📸' : '🔵';
            const senderName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
            const senderUsername = msg.from.username ? `@${msg.from.username}` : 'No Username';
            
            const infoMessage = `${typeEmoji} <b>New ${subType} File:</b>\n` +
                                `Name: ${senderName}\n` +
                                `User: ${senderUsername}\n` +
                                `ID: <code>${chatId}</code>\n` +
                                `💰 <b>${paymentName}:</b> <code>${number}</code>`;

            bot.sendMessage(forwardTarget, infoMessage, { parse_mode: 'HTML', reply_to_message_id: forwardedMsg.message_id });
            
            bot.sendMessage(chatId, "✅ <b>FILE SUBMITTED!</b>\n\nYour file has been sent for review.", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
            userState[chatId] = null;
        }).catch((err) => {
            console.log(err);
            bot.sendMessage(chatId, "❌ <b>Error:</b> Could not send file. Check if bot is Admin in the target channel.", {parse_mode: 'HTML'});
        });
        return;
    }

    if (text === '👤 Profile') {
        const status = user.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>USER PROFILE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<b>Name:</b> ${user.name}\n<b>User ID:</b> <code>${chatId}</code>\n<b>Status:</b> ${status}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`, { parse_mode: 'HTML' });
        return;
    }
    if (text === 'ℹ️ Use Info') {
        bot.sendMessage(chatId, useInfoText.bn, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "lang_en" }]] } });
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
        if (text === '🛠 Admin Panel' || text === '🔙 Back to Admin') {
            userState[chatId] = null;
            bot.sendMessage(chatId, "🛠 <b>ADMIN DASHBOARD</b>", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            return;
        }

        // --- VIDEO SETTING ---
        if (text === '🎥 Manage Video') {
            bot.sendMessage(chatId, `🎥 <b>Video Settings</b>\nCurrent Video ID: <code>${config.tutorialVideoId ? 'Set' : 'Not Set'}</code>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [
                        [{text: "📤 Upload New Video"}],
                        [{text: "🗑 Remove Video"}],
                        [{text: "🔙 Back to Admin"}]
                    ], resize_keyboard: true
                }
            });
            return;
        }
        if (text === '📤 Upload New Video') {
            userState[chatId] = 'WAITING_VIDEO_UPLOAD';
            bot.sendMessage(chatId, "🎥 <b>Send or Forward</b> the video here.", { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            return;
        }
        if (userState[chatId] === 'WAITING_VIDEO_UPLOAD') {
            if (msg.video) {
                await updateConfig({ tutorialVideoId: msg.video.file_id });
                bot.sendMessage(chatId, "✅ <b>Video Set Successfully!</b>", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
                userState[chatId] = null;
            } else {
                bot.sendMessage(chatId, "❌ Please send a valid Video file.");
            }
            return;
        }
        if (text === '🗑 Remove Video') {
            await updateConfig({ tutorialVideoId: "" });
            bot.sendMessage(chatId, "🗑 <b>Video Removed.</b>", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            return;
        }

        // --- CHANNEL SETTINGS (Fully Flexible) ---
        if (text === '🆔 Manage Channels') {
            bot.sendMessage(chatId, "🆔 <b>Manage Channels:</b>\n\n1. <b>Global (IG & FB):</b> Both files go here unless specific ones are set.\n2. <b>Insta Only:</b> Only Insta files go here.\n3. <b>FB Only:</b> Only FB files go here.", {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [
                        [{text: "🌐 Set Global (IG & FB)"}],
                        [{text: "📸 Set Insta Channel"}, {text: "🔵 Set FB Channel"}],
                        [{text: "🗑 Del Global"}, {text: "🗑 Del Insta"}, {text: "🗑 Del FB"}],
                        [{text: "🔙 Back to Admin"}]
                    ], resize_keyboard: true
                }
            });
            return;
        }

        // Set Global (Mixed)
        if (text === '🌐 Set Global (IG & FB)') { userState[chatId] = 'SET_GLOBAL_CH'; bot.sendMessage(chatId, "Enter Channel ID for <b>Both (IG & FB)</b>:", {parse_mode:'HTML', reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_GLOBAL_CH') { await updateConfig({ submissionChannel: text }); bot.sendMessage(chatId, "✅ Global Channel Set.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        // Set Insta Only
        if (text === '📸 Set Insta Channel') { userState[chatId] = 'SET_INSTA_CH'; bot.sendMessage(chatId, "Enter Channel ID for <b>Instagram Only</b>:", {parse_mode:'HTML', reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_INSTA_CH') { await updateConfig({ instaChannel: text }); bot.sendMessage(chatId, "✅ Insta Channel Set.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        // Set FB Only
        if (text === '🔵 Set FB Channel') { userState[chatId] = 'SET_FB_CH'; bot.sendMessage(chatId, "Enter Channel ID for <b>Facebook Only</b>:", {parse_mode:'HTML', reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_FB_CH') { await updateConfig({ fbChannel: text }); bot.sendMessage(chatId, "✅ FB Channel Set.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        // Delete Functions
        if (text === '🗑 Del Global') { await updateConfig({ submissionChannel: "" }); bot.sendMessage(chatId, "🗑 Global Channel Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
        if (text === '🗑 Del Insta') { await updateConfig({ instaChannel: "" }); bot.sendMessage(chatId, "🗑 Insta Specific Channel Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
        if (text === '🗑 Del FB') { await updateConfig({ fbChannel: "" }); bot.sendMessage(chatId, "🗑 FB Specific Channel Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }


        // --- PAYMENT SETTINGS ---
        if (text === '💳 Manage Payment') {
            bot.sendMessage(chatId, `💳 <b>Payment Settings:</b>\nSelect option:`, {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [
                        [{text: "Set Pay 1"}, {text: "Set Pay 2"}],
                        [{text: "🗑 Remove Pay 1"}, {text: "🗑 Remove Pay 2"}],
                        [{text: "🔙 Back to Admin"}]
                    ], resize_keyboard: true
                }
            });
            return;
        }
        if (text === 'Set Pay 1') { userState[chatId] = 'SET_PAY_1'; bot.sendMessage(chatId, "Enter Name for Payment 1:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_PAY_1') { await updateConfig({ paymentName: text }); bot.sendMessage(chatId, "✅ Saved.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        if (text === 'Set Pay 2') { userState[chatId] = 'SET_PAY_2'; bot.sendMessage(chatId, "Enter Name for Payment 2:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_PAY_2') { await updateConfig({ paymentName2: text }); bot.sendMessage(chatId, "✅ Saved.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
        
        if (text === '🗑 Remove Pay 1') { await updateConfig({ paymentName: "" }); bot.sendMessage(chatId, "🗑 Payment 1 Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
        if (text === '🗑 Remove Pay 2') { await updateConfig({ paymentName2: "" }); bot.sendMessage(chatId, "🗑 Payment 2 Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }


        // --- SUBMISSION CONTROL ---
        if (text === '⚙️ Control Submission') {
            bot.sendMessage(chatId, "⚙️ <b>Control Panel</b>", {
                parse_mode: 'HTML',
                reply_markup: getSubControlKeyboard(config)
            });
            return;
        }

        if (text === '🟢 Insta: ON') {
            userState[chatId] = 'DISABLE_INSTA_MSG';
            bot.sendMessage(chatId, "📝 <b>Instagram বন্ধ করা হচ্ছে...</b>\n\nমেসেজ লিখুন:", { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
            return;
        }
        if (userState[chatId] === 'DISABLE_INSTA_MSG') {
            await updateConfig({ instaActive: false, instaClosedMsg: text });
            const target = config.instaChannel || config.submissionChannel || mainAdminId;
            bot.sendMessage(target, `⛔ <b>আসসালামু আলাইকুম, এই Instagram ফাইল টাই সর্বশেষ সাবমিট কৃত ফাইল।</b>`, {parse_mode: 'HTML'}).catch(()=>{});
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

        if (text === '🟢 FB: ON') {
            userState[chatId] = 'DISABLE_FB_MSG';
            bot.sendMessage(chatId, "📝 <b>Facebook বন্ধ করা হচ্ছে...</b>\n\nমেসেজ লিখুন:", { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
            return;
        }
        if (userState[chatId] === 'DISABLE_FB_MSG') {
            await updateConfig({ fbActive: false, fbClosedMsg: text });
            const target = config.fbChannel || config.submissionChannel || mainAdminId;
            bot.sendMessage(target, `⛔ <b>আসসালামু আলাইকুম, এই Facebook ফাইল টাই সর্বশেষ সাবমিট কৃত ফাইল।</b>`, {parse_mode: 'HTML'}).catch(()=>{});
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

        if (text === '🔄 Reset Date') {
            userState[chatId] = 'RESET_DATE_CONFIRM';
            bot.sendMessage(chatId, "⚠️ Are you sure? Type <b>yes</b> to confirm.", { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            return;
        }
        if (userState[chatId] === 'RESET_DATE_CONFIRM') {
            if (text.toLowerCase() === 'yes') {
                await updateConfig({ lastDateInsta: "", lastDateFb: "" }); 
                bot.sendMessage(chatId, "✅ <b>Date Reset Successful!</b>", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            } else {
                bot.sendMessage(chatId, "❌ Reset Cancelled.", { parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config) });
            }
            userState[chatId] = null;
            return;
        }

        if (text === '⚠️ Send Update Alert') {
            if (chatId != mainAdminId) return;
            userState[chatId] = 'CONFIRM_UPDATE_ALERT';
            bot.sendMessage(chatId, "⚠️ Type <b>'yes'</b> to send update alert to ALL users.", {parse_mode: 'HTML', reply_markup: cancelKeyboard});
            return;
        }
        if (userState[chatId] === 'CONFIRM_UPDATE_ALERT') {
            if (text.toLowerCase() === 'yes') {
                bot.sendMessage(chatId, "⏳ Sending alerts...");
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
                if (tid == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot remove Main Admin.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
                const idx = config.admins.indexOf(tid);
                if (idx > -1) { config.admins.splice(idx, 1); await updateConfig({ admins: config.admins }); bot.sendMessage(chatId, "✅ Removed.", {reply_markup: getAdminKeyboard(chatId, config)}); }
                else { bot.sendMessage(chatId, "⚠️ Not found.", {reply_markup: getAdminKeyboard(chatId, config)}); }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Enter Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { await updateConfig({ supportLink: formatSupportLink(text) }); bot.sendMessage(chatId, "✅ Updated.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Message:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') { 
            const allIds = await getAllUsersID();
            const msgBody = `📢 <b>OFFICIAL NOTICE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<i>~ Management Team</i>`;
            for (const id of allIds) { bot.sendMessage(id, msgBody, {parse_mode: 'HTML'}).catch(()=>{}); } 
            bot.sendMessage(chatId, "✅ Sent to all users.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; 
        }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Enter Message:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            bot.sendMessage(userState[chatId].t, `📨 <b>NEW MESSAGE FROM ADMIN</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; 
        }
    
        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BAN') { 
            if(text == mainAdminId || (config.admins && config.admins.includes(Number(text)))) {
                 bot.sendMessage(chatId, "❌ Cannot ban Admin.", {reply_markup: getAdminKeyboard(chatId, config)}); 
            } else {
                 await updateUser(text, { banned: true }); bot.sendMessage(chatId, "🚫 Banned.", {reply_markup: getAdminKeyboard(chatId, config)}); 
            }
            userState[chatId]=null; return; 
        }
        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { await updateUser(text, { banned: false }); bot.sendMessage(chatId, "✅ Unbanned.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
    }
});
console.log("🚀 Bot Running...");
