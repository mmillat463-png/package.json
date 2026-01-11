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
    res.send('Bot is Running with Jump Alert System!');
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
                submissionChannel: "", 
                instaChannel: "",      
                fbChannel: "",         
                admins: permanentAdmins,
                lastDateInsta: "", 
                lastDateFb: "",    
                instaActive: true,
                fbActive: true,
                instaClosedMsg: "Currently Closed.",
                fbClosedMsg: "Currently Closed.",
                paymentMethods: ["Bkash Number"], 
                tutorialVideoId: "",
                instaCategories: [], 
                fbCategories: [],    
                supportButtons: []   
            };
            await settingsColl.doc('main_config').set(data);
        } else {
            data = doc.data();
        }

        if (!data.admins) data.admins = [];
        if (!data.paymentMethods || !Array.isArray(data.paymentMethods)) data.paymentMethods = ["Bkash Number"];
        if (!data.instaCategories) data.instaCategories = [];
        if (!data.fbCategories) data.fbCategories = [];
        if (!data.supportButtons) data.supportButtons = [];
        if (typeof data.instaActive === 'undefined') data.instaActive = true;
        if (typeof data.fbActive === 'undefined') data.fbActive = true;

        cachedConfig = data;
        lastConfigFetch = now;
        return data;
    } catch (e) {
        return cachedConfig || { 
            admins: permanentAdmins, 
            paymentMethods: ["Bkash Number"],
            instaCategories: [],
            fbCategories: [],
            supportButtons: [],
            instaActive: true,
            fbActive: true
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
// ৫. কীবোর্ড এবং টেক্সট হেল্পার
// =========================================================
const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী:</b>\n\n১. '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. ক্যাটাগরি সিলেক্ট করুন।\n৩. আপনার <b>.xlsx</b> ফাইল আপলোড করুন।\n৪. পেমেন্ট মেথড সিলেক্ট করে নাম্বার দিন।",
    en: "ℹ️ <b>Rules for using the bot:</b>\n\n1. Click the '📂 <b>Submit File</b>' button.\n2. Select Category.\n3. Upload your <b>.xlsx</b> file.\n4. Select payment method and enter number."
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

function getCategoryKeyboard(categories, backButtonText) {
    let keyboard = [];
    let tempRow = [];
    categories.forEach((cat, index) => {
        tempRow.push({ text: cat.name });
        if (tempRow.length === 2) {
            keyboard.push(tempRow);
            tempRow = [];
        }
    });
    if (tempRow.length > 0) keyboard.push(tempRow);
    keyboard.push([{ text: backButtonText }]); 
    
    return { keyboard: keyboard, resize_keyboard: true };
}

function getAdminKeyboard(userId, config) {
    let kb = [
        [{ text: "⚙️ Global Control" }, { text: "🔄 Reset Date" }],
        [{ text: "📂 Manage Insta Cat" }, { text: "📂 Manage FB Cat" }],
        [{ text: "💳 Manage Payment" }, { text: "📢 Broadcast" }],
        [{ text: "🆔 Manage Channels" }, { text: "🎥 Manage Video" }], 
        [{ text: "🚫 Ban User" }, { text: "✅ Unban User" }],
        [{ text: "📨 Reply User" }],
        [{ text: "🔙 Back to Home" }]
    ];
    
    if (userId == mainAdminId) {
        kb.splice(5, 0, [{ text: "👥 Manage Support Admins" }]); 
        kb.unshift([{ text: "➕ Add Admin" }, { text: "➖ Remove Admin" }]);
        kb.splice(2, 0, [{ text: "⚠️ Send Update Alert" }]);
    }
    
    return { keyboard: kb, resize_keyboard: true };
}

function getGlobalControlKeyboard(config) {
    const instaStatus = config.instaActive ? "🟢 Global Insta: ON" : "🔴 Global Insta: OFF";
    const fbStatus = config.fbActive ? "🟢 Global FB: ON" : "🔴 Global FB: OFF";
    return {
        keyboard: [
            [{ text: instaStatus }, { text: fbStatus }],
            [{ text: "🔙 Back to Admin" }]
        ],
        resize_keyboard: true
    };
}

const cancelKeyboard = { keyboard: [[{ text: "❌ Cancel" }]], resize_keyboard: true };

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
            // ওয়ার্নিং মেসেজ ভ্যানিশ করা
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            if (userState[chatId]) userState[chatId].warningMsgId = null;

            const isAdmin = checkIsAdmin(chatId, config);
            bot.sendMessage(chatId, "✅ <b>Refreshed Successfully!</b>\nSelect an option:", { 
                parse_mode: 'HTML', 
                reply_markup: getMainMenu(chatId, isAdmin) 
            });
        }
        
        else if (data.startsWith('del_pay_')) {
            const methodToDelete = data.replace('del_pay_', '');
            let methods = config.paymentMethods || [];
            const newMethods = methods.filter(m => m !== methodToDelete);
            await updateConfig({ paymentMethods: newMethods });
            
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            bot.sendMessage(chatId, `🗑 <b>Deleted:</b> ${methodToDelete}`, {
                parse_mode: 'HTML',
                reply_markup: getAdminKeyboard(chatId, config)
            });
        }
        
        else if (data.startsWith('del_supp_')) {
            const index = parseInt(data.replace('del_supp_', ''));
            let buttons = config.supportButtons || [];
            if (index >= 0 && index < buttons.length) {
                const removed = buttons.splice(index, 1);
                await updateConfig({ supportButtons: buttons });
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                bot.sendMessage(chatId, `🗑 <b>Removed:</b> ${removed[0].name}`, { parse_mode: 'HTML' });
            }
        }
        
        else if (data.startsWith('cat_toggle_')) {
            const parts = data.split('_');
            const type = parts[2]; 
            const index = parseInt(parts[3]);
            
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});

            let targetArr = type === 'IG' ? config.instaCategories : config.fbCategories;
            const category = targetArr[index];

            if (category.active) {
                userState[chatId] = { state: 'DISABLE_CAT_MSG', type: type, index: index };
                bot.sendMessage(chatId, `📝 <b>Turning OFF: ${category.name}</b>\n\nমেসেজটি লিখুন:`, { 
                    reply_markup: cancelKeyboard, parse_mode: 'HTML' 
                });
            } else {
                targetArr[index].active = true;
                if (type === 'IG') await updateConfig({ instaCategories: targetArr });
                else await updateConfig({ fbCategories: targetArr });
                
                bot.sendMessage(chatId, `✅ <b>${category.name}</b> is now OPEN.`, {
                    reply_markup: getAdminKeyboard(chatId, config), parse_mode: 'HTML'
                });
            }
        }
        
        else if (data.startsWith('cat_del_')) {
            const parts = data.split('_');
            const type = parts[2];
            const index = parseInt(parts[3]);
            
            let targetArr = type === 'IG' ? config.instaCategories : config.fbCategories;
            const deleted = targetArr.splice(index, 1);
            
            if (type === 'IG') await updateConfig({ instaCategories: targetArr });
            else await updateConfig({ fbCategories: targetArr });
            
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
            bot.sendMessage(chatId, `🗑 <b>Deleted Category:</b> ${deleted[0].name}`, { parse_mode: 'HTML' });
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

    // ======================================================
    // LOCKED / UPDATE ALERT LOGIC (JUMP EFFECT)
    // ======================================================
    if (user.locked === true && chatId != mainAdminId) {
        
        // ১. যদি আগের কোনো ওয়ার্নিং মেসেজ থাকে, সেটি ডিলিট করুন (যাতে ডুপ্লিকেট না হয়)
        if (userState[chatId] && userState[chatId].warningMsgId) {
            bot.deleteMessage(chatId, userState[chatId].warningMsgId).catch(()=>{});
        }

        // ২. নতুন করে ওয়ার্নিং মেসেজ পাঠান (এতে মনে হবে মেসেজটি জাম্প করেছে)
        const warnMsg = await bot.sendMessage(chatId, "⚠️ <b>Update Available!</b>\nPlease click Refresh.", {
            parse_mode: 'HTML', 
            reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "restart_bot" }]] }
        });

        // ৩. নতুন মেসেজের আইডি সেভ করে রাখুন
        if (!userState[chatId]) userState[chatId] = {};
        userState[chatId].warningMsgId = warnMsg.message_id;
        
        // ইউজারের মেসেজ ডিলিট করা হচ্ছে না (আপনার রিকোয়ারমেন্ট অনুযায়ী)
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

    // Home / Start
    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        await updateUser(chatId, { locked: false }); 
        
        bot.sendMessage(chatId, `👋 <b>Welcome, 🌹${msg.from.first_name}🌹!</b>\n\nPlease select an option from below:`, { 
            parse_mode: 'HTML', 
            reply_markup: getMainMenu(chatId, isAdmin) 
        });
        return;
    }

    // --- SUBMISSION FLOW ---
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

    // --- INSTAGRAM FLOW ---
    if (text === '📸 Submit Instagram') {
        if (!config.instaActive) {
            bot.sendMessage(chatId, config.instaClosedMsg || "⚠️ Closed.", { parse_mode: 'HTML' });
            return;
        }
        if (!config.instaCategories || config.instaCategories.length === 0) {
            bot.sendMessage(chatId, "⚠️ No Instagram categories available yet.", { parse_mode: 'HTML' });
            return;
        }
        userState[chatId] = { state: 'SELECTING_CAT', mainType: 'INSTAGRAM' };
        bot.sendMessage(chatId, "📸 <b>Select Instagram Category:</b>", {
            parse_mode: 'HTML',
            reply_markup: getCategoryKeyboard(config.instaCategories, "🔙 Back to Submit")
        });
        return;
    }

    // --- FACEBOOK FLOW ---
    if (text === '🔵 Submit Facebook') {
        if (!config.fbActive) {
            bot.sendMessage(chatId, config.fbClosedMsg || "⚠️ Closed.", { parse_mode: 'HTML' });
            return;
        }
        if (!config.fbCategories || config.fbCategories.length === 0) {
            bot.sendMessage(chatId, "⚠️ No Facebook categories available yet.", { parse_mode: 'HTML' });
            return;
        }
        userState[chatId] = { state: 'SELECTING_CAT', mainType: 'FACEBOOK' };
        bot.sendMessage(chatId, "🔵 <b>Select Facebook Category:</b>", {
            parse_mode: 'HTML',
            reply_markup: getCategoryKeyboard(config.fbCategories, "🔙 Back to Submit")
        });
        return;
    }
    
    if (text === "🔙 Back to Submit") {
        userState[chatId] = null;
        bot.sendMessage(chatId, "📂 Select Category:", { reply_markup: getSubmissionMenu() });
        return;
    }

    if (userState[chatId] && userState[chatId].state === 'SELECTING_CAT') {
        const mainType = userState[chatId].mainType;
        const categories = mainType === 'INSTAGRAM' ? config.instaCategories : config.fbCategories;
        const selectedCat = categories.find(c => c.name === text);

        if (selectedCat) {
            if (!selectedCat.active) {
                bot.sendMessage(chatId, `⛔ <b>${selectedCat.name}</b>\n\n${selectedCat.closedMsg || "Temporarily Closed."}`, { parse_mode: 'HTML' });
                return;
            }
            userState[chatId] = { 
                state: 'WAITING_FILE', 
                type: mainType, 
                subCategory: selectedCat.name 
            };
            bot.sendMessage(chatId, `📂 <b>Selected: ${selectedCat.name}</b>\n\nNow upload your <b>.xlsx</b> file.`, { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
        } else {
            bot.sendMessage(chatId, "⚠️ Please select a valid category from the buttons.");
        }
        return;
    }

    // --- FILE RECEIVE ---
    if (userState[chatId] && userState[chatId].state === 'WAITING_FILE') {
        if (msg.document && msg.document.file_name && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            userState[chatId].state = 'WAITING_PAYMENT_SELECT';
            userState[chatId].fileMsgId = msg.message_id;

            const methods = config.paymentMethods || ["Bkash Number"];
            
            let kbRows = [];
            let tempRow = [];
            methods.forEach(m => {
                tempRow.push({ text: m });
                if(tempRow.length === 2) { kbRows.push(tempRow); tempRow = []; }
            });
            if(tempRow.length > 0) kbRows.push(tempRow);
            kbRows.push([{text: "❌ Cancel"}]);

            bot.sendMessage(chatId, "💳 <b>Select Payment Method:</b>", {
                parse_mode: 'HTML',
                reply_markup: { keyboard: kbRows, resize_keyboard: true, one_time_keyboard: true }
            });

        } else {
            bot.sendMessage(chatId, "⚠️ <b>Invalid File!</b> Only .xlsx accepted.", { parse_mode: 'HTML' });
        }
        return;
    }

    // --- PAYMENT & NUMBER ---
    if (userState[chatId] && userState[chatId].state === 'WAITING_PAYMENT_SELECT') {
        const selected = text;
        const methods = config.paymentMethods || [];

        if (methods.includes(selected)) {
            userState[chatId].state = 'WAITING_NUMBER';
            userState[chatId].selectedPayment = selected;
            
            bot.sendMessage(chatId, `📝 <b>Step 3/3:</b>\nঅনুগ্রহ করে আপনার <b>${selected}</b> টি দিন:`, { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
        } else {
            bot.sendMessage(chatId, "⚠️ Please select a method from the buttons.", {reply_markup: cancelKeyboard});
        }
        return;
    }

    if (userState[chatId] && userState[chatId].state === 'WAITING_NUMBER') {
        const number = text;
        const subType = userState[chatId].type;
        const subCat = userState[chatId].subCategory;
        const fileMsgId = userState[chatId].fileMsgId;
        const paymentName = userState[chatId].selectedPayment;

        let forwardTarget = mainAdminId;
        if (subType === 'INSTAGRAM') {
            if (config.instaChannel) forwardTarget = config.instaChannel; 
            else if (config.submissionChannel) forwardTarget = config.submissionChannel; 
        } else if (subType === 'FACEBOOK') {
            if (config.fbChannel) forwardTarget = config.fbChannel; 
            else if (config.submissionChannel) forwardTarget = config.submissionChannel; 
        }

        const currentDate = getFormattedDate();

        if (subType === 'INSTAGRAM' && config.lastDateInsta !== currentDate) {
            bot.sendMessage(forwardTarget, `📅 <b>আসসালামু আলাইকুম এডমিন, আজকের Instagram আইডি রিসিভ শুরু।</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            await updateConfig({ lastDateInsta: currentDate }); 
        }
        if (subType === 'FACEBOOK' && config.lastDateFb !== currentDate) {
            bot.sendMessage(forwardTarget, `📅 <b>আসসালামু আলাইকুম এডমিন, আজকের Facebook আইডি রিসিভ শুরু।</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            await updateConfig({ lastDateFb: currentDate }); 
        }

        bot.forwardMessage(forwardTarget, chatId, fileMsgId).then((forwardedMsg) => {
            const typeEmoji = subType === 'INSTAGRAM' ? '📸' : '🔵';
            const senderName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
            
            const infoMessage = `${typeEmoji} <b>New ${subType} Submission</b>\n` +
                                `📂 Category: <b>${subCat}</b>\n` +
                                `👤 Name: ${senderName}\n` +
                                `🆔 User ID: <code>${chatId}</code>\n` +
                                `💰 <b>${paymentName}:</b> <code>${number}</code>`;

            bot.sendMessage(forwardTarget, infoMessage, { parse_mode: 'HTML', reply_to_message_id: forwardedMsg.message_id });
            
            bot.sendMessage(chatId, "✅ <b>SUBMISSION SUCCESSFUL!</b>\n\nYour file has been sent to review.", { parse_mode: 'HTML', reply_markup: getMainMenu(chatId, isAdmin) });
            userState[chatId] = null;
        }).catch((err) => {
            console.log(err);
            bot.sendMessage(chatId, "❌ <b>Error:</b> Could not send file.", {parse_mode: 'HTML'});
        });
        return;
    }

    // --- SUPPORT SECTION ---
    if (text === '📞 Support') {
        const buttons = config.supportButtons || [];
        let inlineKB = [];
        
        buttons.forEach(btn => { inlineKB.push([{ text: `💬 ${btn.name}`, url: btn.link }]); });

        if (inlineKB.length === 0) {
            bot.sendMessage(chatId, "⚠️ <b>No Support Admin available at the moment.</b>", { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(chatId, "📞 <b>SUPPORT CENTER</b>\nSelect an admin to contact:", { 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: inlineKB }
            });
        }
        return;
    }
    
    if (text === '🎥 Bot Use Video') {
        if (config.tutorialVideoId) bot.sendVideo(chatId, config.tutorialVideoId, { caption: "🎥 <b>How to use</b>", parse_mode: 'HTML' });
        else bot.sendMessage(chatId, "⚠️ No tutorial video set.", { parse_mode: 'HTML' });
        return;
    }
    if (text === '👤 Profile') {
        const status = user.banned ? "🚫 Banned" : "✅ Active";
        bot.sendMessage(chatId, `👤 <b>USER PROFILE</b>\nName: ${user.name}\nID: <code>${chatId}</code>\nStatus: ${status}`, { parse_mode: 'HTML' });
        return;
    }
    if (text === 'ℹ️ Use Info') {
        bot.sendMessage(chatId, useInfoText.bn, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "lang_en" }]] } });
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

        // --- GLOBAL CONTROL (FIXED) ---
        if (text === '⚙️ Global Control') {
            bot.sendMessage(chatId, "⚙️ <b>Master Switch:</b>\nএখান থেকে পুরো সার্ভিস অন/অফ করা যাবে।", {
                parse_mode: 'HTML',
                reply_markup: getGlobalControlKeyboard(config)
            });
            return;
        }

        // INSTA LOGIC
        if (text === '🟢 Global Insta: ON') {
            userState[chatId] = 'DISABLE_INSTA_MSG';
            bot.sendMessage(chatId, "📝 <b>Instagram বন্ধ করা হচ্ছে...</b>\n\nইউজারদের জন্য মেসেজটি লিখুন:", { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
            return;
        }
        if (userState[chatId] === 'DISABLE_INSTA_MSG') {
            const newConfig = { ...config, instaActive: false, instaClosedMsg: text };
            await updateConfig({ instaActive: false, instaClosedMsg: text });
            
            const target = config.instaChannel || config.submissionChannel || mainAdminId;
            bot.sendMessage(target, `⛔ <b>আসসালামু আলাইকুম, এই Instagram ফাইল টাই সর্বশেষ সাবমিট কৃত ফাইল। (Closed by Admin)</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            
            bot.sendMessage(chatId, `⛔ <b>Instagram Closed!</b>\nMsg: ${text}`, { 
                parse_mode: 'HTML', reply_markup: getGlobalControlKeyboard(newConfig) 
            });
            userState[chatId] = null;
            return;
        }
        if (text === '🔴 Global Insta: OFF') {
            const newConfig = { ...config, instaActive: true };
            await updateConfig({ instaActive: true });
            bot.sendMessage(chatId, "✅ <b>Instagram OPEN Globally.</b>", { 
                parse_mode: 'HTML', reply_markup: getGlobalControlKeyboard(newConfig) 
            });
            return;
        }

        // FB LOGIC
        if (text === '🟢 Global FB: ON') {
            userState[chatId] = 'DISABLE_FB_MSG';
            bot.sendMessage(chatId, "📝 <b>Facebook বন্ধ করা হচ্ছে...</b>\n\nইউজারদের জন্য মেসেজটি লিখুন:", { 
                parse_mode: 'HTML', reply_markup: cancelKeyboard 
            });
            return;
        }
        if (userState[chatId] === 'DISABLE_FB_MSG') {
            const newConfig = { ...config, fbActive: false, fbClosedMsg: text };
            await updateConfig({ fbActive: false, fbClosedMsg: text });
            
            const target = config.fbChannel || config.submissionChannel || mainAdminId;
            bot.sendMessage(target, `⛔ <b>আসসালামু আলাইকুম, এই Facebook ফাইল টাই সর্বশেষ সাবমিট কৃত ফাইল। (Closed by Admin)</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            
            bot.sendMessage(chatId, `⛔ <b>Facebook Closed!</b>\nMsg: ${text}`, { 
                parse_mode: 'HTML', reply_markup: getGlobalControlKeyboard(newConfig) 
            });
            userState[chatId] = null;
            return;
        }
        if (text === '🔴 Global FB: OFF') {
            const newConfig = { ...config, fbActive: true };
            await updateConfig({ fbActive: true });
            bot.sendMessage(chatId, "✅ <b>Facebook OPEN Globally.</b>", { 
                parse_mode: 'HTML', reply_markup: getGlobalControlKeyboard(newConfig) 
            });
            return;
        }

        // --- MANAGE CATEGORIES (INSTA) ---
        if (text === '📂 Manage Insta Cat') {
            userState[chatId] = null;
            const cats = config.instaCategories || [];
            
            if (cats.length === 0) {
                bot.sendMessage(chatId, "📭 No Categories.", {
                    reply_markup: { keyboard: [[{text: "➕ Add Insta Category"}], [{text: "🔙 Back to Admin"}]], resize_keyboard: true }
                });
            } else {
                let buttons = cats.map((c, i) => {
                    const status = c.active ? "🟢 ON" : "🔴 OFF";
                    return [{ text: `${c.name} (${status})`, callback_data: `cat_toggle_IG_${i}` }, { text: "🗑 Del", callback_data: `cat_del_IG_${i}` }];
                });
                bot.sendMessage(chatId, "📂 <b>Insta Categories:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
                bot.sendMessage(chatId, "👇 Actions:", { reply_markup: { keyboard: [[{text: "➕ Add Insta Category"}], [{text: "🔙 Back to Admin"}]], resize_keyboard: true } });
            }
            return;
        }
        if (text === '➕ Add Insta Category') { userState[chatId] = 'ADD_INSTA_CAT_NAME'; bot.sendMessage(chatId, "Name:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ADD_INSTA_CAT_NAME') {
            let cats = config.instaCategories || [];
            cats.push({ name: text, active: true, closedMsg: "Closed." });
            await updateConfig({ instaCategories: cats });
            bot.sendMessage(chatId, `✅ Added: ${text}`, {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return;
        }

        // --- MANAGE CATEGORIES (FB) ---
        if (text === '📂 Manage FB Cat') {
            userState[chatId] = null;
            const cats = config.fbCategories || [];
            if (cats.length === 0) {
                bot.sendMessage(chatId, "📭 No Categories.", {
                    reply_markup: { keyboard: [[{text: "➕ Add FB Category"}], [{text: "🔙 Back to Admin"}]], resize_keyboard: true }
                });
            } else {
                let buttons = cats.map((c, i) => {
                    const status = c.active ? "🟢 ON" : "🔴 OFF";
                    return [{ text: `${c.name} (${status})`, callback_data: `cat_toggle_FB_${i}` }, { text: "🗑 Del", callback_data: `cat_del_FB_${i}` }];
                });
                bot.sendMessage(chatId, "📂 <b>FB Categories:</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
                bot.sendMessage(chatId, "👇 Actions:", { reply_markup: { keyboard: [[{text: "➕ Add FB Category"}], [{text: "🔙 Back to Admin"}]], resize_keyboard: true } });
            }
            return;
        }
        if (text === '➕ Add FB Category') { userState[chatId] = 'ADD_FB_CAT_NAME'; bot.sendMessage(chatId, "Name:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ADD_FB_CAT_NAME') {
            let cats = config.fbCategories || [];
            cats.push({ name: text, active: true, closedMsg: "Closed." });
            await updateConfig({ fbCategories: cats });
            bot.sendMessage(chatId, `✅ Added: ${text}`, {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return;
        }
        
        // --- CATEGORY DISABLE MSG HANDLER ---
        if (userState[chatId] && userState[chatId].state === 'DISABLE_CAT_MSG') {
            const msgText = text;
            const type = userState[chatId].type;
            const index = userState[chatId].index;

            let targetArr = type === 'IG' ? config.instaCategories : config.fbCategories;
            
            if (targetArr[index]) {
                targetArr[index].active = false;
                targetArr[index].closedMsg = msgText;
                
                if (type === 'IG') await updateConfig({ instaCategories: targetArr });
                else await updateConfig({ fbCategories: targetArr });

                bot.sendMessage(chatId, `⛔ <b>${targetArr[index].name}</b> is now OFF.\nMsg: ${msgText}`, {
                    parse_mode: 'HTML', reply_markup: getAdminKeyboard(chatId, config)
                });
            }
            userState[chatId] = null;
            return;
        }

        // --- SUPPORT ADMINS (Main Admin) ---
        if (text === '👥 Manage Support Admins') {
            if (chatId != mainAdminId) return;
            const buttons = config.supportButtons || [];
            if (buttons.length > 0) {
                let delButtons = buttons.map((b, i) => [{ text: `🗑 Remove ${b.name}`, callback_data: `del_supp_${i}` }]);
                bot.sendMessage(chatId, "📋 Current Support:", { parse_mode: 'HTML', reply_markup: { inline_keyboard: delButtons } });
            }
            bot.sendMessage(chatId, "Options:", { reply_markup: { keyboard: [[{ text: "➕ Add Support Admin" }], [{ text: "🔙 Back to Admin" }]], resize_keyboard: true } });
            return;
        }
        if (text === '➕ Add Support Admin') { userState[chatId] = 'ADD_SUPP_NAME'; bot.sendMessage(chatId, "Name:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ADD_SUPP_NAME') { userState[chatId] = { state: 'ADD_SUPP_LINK', name: text }; bot.sendMessage(chatId, "Link/Username:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] && userState[chatId].state === 'ADD_SUPP_LINK') {
            let link = text.startsWith('@') ? `https://t.me/${text.substring(1)}` : text;
            if (!link.startsWith('http')) link = `https://t.me/${link}`;
            let buttons = config.supportButtons || [];
            buttons.push({ name: userState[chatId].name, link: link });
            await updateConfig({ supportButtons: buttons });
            bot.sendMessage(chatId, "✅ Added.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId] = null; return;
        }

        // --- PAYMENT ---
        if (text === '💳 Manage Payment') {
            const methods = config.paymentMethods || [];
            bot.sendMessage(chatId, `💳 <b>Methods:</b> ${methods.join(', ')}`, { parse_mode: 'HTML', reply_markup: { keyboard: [[{text: "➕ Add Payment Method"}, {text: "🗑 Delete Payment Method"}],[{text: "🔙 Back to Admin"}]], resize_keyboard: true } });
            return;
        }
        if (text === '➕ Add Payment Method') { userState[chatId] = 'ADD_PAY_METHOD'; bot.sendMessage(chatId, "Name:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ADD_PAY_METHOD') {
            let methods = config.paymentMethods || []; methods.push(text); await updateConfig({ paymentMethods: methods });
            bot.sendMessage(chatId, "✅ Added.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return;
        }
        if (text === '🗑 Delete Payment Method') {
            const methods = config.paymentMethods || [];
            if (methods.length === 0) { bot.sendMessage(chatId, "Empty."); return; }
            let buttons = methods.map(m => [{ text: `🗑 ${m}`, callback_data: `del_pay_${m}` }]);
            bot.sendMessage(chatId, "Select to delete:", { reply_markup: { inline_keyboard: buttons } });
            return;
        }

        // --- OTHER ---
        if (text === '🎥 Manage Video') { bot.sendMessage(chatId, "🎥 Settings", {reply_markup: { keyboard: [[{text: "📤 Set New Video"}], [{text: "🗑 Remove Video"}], [{text: "🔙 Back to Admin"}]], resize_keyboard: true }}); return; }
        if (text === '📤 Set New Video') { userState[chatId] = 'WAITING_VIDEO_FILE'; bot.sendMessage(chatId, "Send Video:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'WAITING_VIDEO_FILE' && msg.video) { await updateConfig({ tutorialVideoId: msg.video.file_id }); bot.sendMessage(chatId, "✅ Saved.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId] = null; return; }
        
        if (text === '🆔 Manage Channels') { bot.sendMessage(chatId, "Channels", {reply_markup: { keyboard: [[{text: "🌐 Set Global"}, {text: "📸 Set Insta"}, {text: "🔵 Set FB"}], [{text: "🔙 Back to Admin"}]], resize_keyboard: true }}); return; }
        if (text === '🌐 Set Global') { userState[chatId] = 'SET_G_CH'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_G_CH') { await updateConfig({submissionChannel: text}); bot.sendMessage(chatId, "✅ Done.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
        if (text === '📸 Set Insta') { userState[chatId] = 'SET_I_CH'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_I_CH') { await updateConfig({instaChannel: text}); bot.sendMessage(chatId, "✅ Done.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
        if (text === '🔵 Set FB') { userState[chatId] = 'SET_F_CH'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_F_CH') { await updateConfig({fbChannel: text}); bot.sendMessage(chatId, "✅ Done.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }

        if (chatId == mainAdminId && text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'ADD_ADMIN') { config.admins.push(parseInt(text)); await updateConfig({admins: config.admins}); bot.sendMessage(chatId, "✅ Added.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
        
        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Msg:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') { const all = await getAllUsersID(); all.forEach(id => bot.sendMessage(id, `📢 <b>NOTICE</b>\n${text}`, {parse_mode:'HTML'}).catch(()=>{})); bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
        
        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Msg:"); return; }
        if (userState[chatId]?.step === 'REP_2') { bot.sendMessage(userState[chatId].t, `📨 <b>Admin:</b>\n${text}`, {parse_mode:'HTML'}).catch(()=>{}); bot.sendMessage(chatId, "✅ Sent.", {reply_markup: getAdminKeyboard(chatId, config)}); userState[chatId]=null; return; }
        
        if (text === '🔄 Reset Date') { await updateConfig({ lastDateInsta: "", lastDateFb: "" }); bot.sendMessage(chatId, "✅ Date Reset.", {reply_markup: getAdminKeyboard(chatId, config)}); return; }
        
        if (text === '⚠️ Send Update Alert') {
            if (chatId != mainAdminId) return;
            userState[chatId] = 'CONFIRM_UPDATE_ALERT';
            bot.sendMessage(chatId, "⚠️ Type <b>'yes'</b> to force update ALL users.", {parse_mode: 'HTML', reply_markup: cancelKeyboard});
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
                        // We do NOT send message here. 
                    }
                }
                await batch.commit(); 
                bot.sendMessage(chatId, "✅ Locked all users. They will see update on next interaction.", {parse_mode:'HTML', reply_markup: getAdminKeyboard(chatId, config)});
            } else {
                bot.sendMessage(chatId, "❌ Cancelled.", {reply_markup: getAdminKeyboard(chatId, config)});
            }
            userState[chatId] = null;
            return;
        }
    }
});
console.log("🚀 Final Bot Running...");
