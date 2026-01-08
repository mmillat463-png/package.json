const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express'); 
const app = express(); 

// --- আপনার সেটিংস (সরাসরি কোডে বসানো হলো) ---
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0'; 
const mainAdminId = 6802901397; 
// আপনার পাসওয়ার্ডে @ থাকায় %40 ব্যবহার করা হয়েছে (ঠিক আছে)
const mongoURI = 'mongodb+srv://saifulmiasaifulmia:Saiful%402008@cluster0.bzhwkun.mongodb.net/?appName=Cluster0'; 

// --- সার্ভার সেটআপ ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Running with MongoDB!'));

app.listen(port, () => {
    console.log(`Web Server running on port ${port}`);
});

// --- BOT SETUP (সমস্যার আসল সমাধান এখানে) ---
// ১. পোলিং শুরুতে 'false' রাখা হয়েছে
const bot = new TelegramBot(token, {polling: false});

// ২. অটোমেটিক ফিক্সার ফাংশন
(async () => {
    try {
        // আগে যদি কোনো ওয়েবহুক (Webhook) আটকে থাকে, সেটা ডিলিট করবে
        await bot.deleteWebHook();
        console.log("✅ Previous Webhook cleared.");
        
        // তারপর ফ্রেশভাবে পোলিং চালু করবে
        await bot.startPolling();
        console.log("🚀 Bot Started Polling Successfully!");
    } catch (error) {
        console.error("❌ Polling Error:", error);
    }
})();

// --- MONGODB কানেকশন ---
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => console.log('❌ MongoDB Connection Error:', err));

// --- ডাটাবেস মডেল ---
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    name: String,
    balance: { type: Number, default: 0 },
    banned: { type: Boolean, default: false },
    locked: { type: Boolean, default: false }
});

const configSchema = new mongoose.Schema({
    id: { type: String, default: 'settings' }, 
    submissionChannel: { type: String, default: mainAdminId.toString() },
    supportLink: { type: String, default: "https://t.me/YourUsername" },
    admins: { type: [Number], default: [] },
    lastDate: { type: String, default: "" },
    submissionActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);
const Config = mongoose.model('Config', configSchema);

// --- হেল্পার ফাংশন ---
async function getConfig() {
    let conf = await Config.findOne({ id: 'settings' });
    if (!conf) {
        conf = new Config({ id: 'settings' });
        await conf.save();
    }
    return conf;
}

async function getUser(id, name) {
    let user = await User.findOne({ userId: id });
    if (!user) {
        user = new User({ userId: id, name: name });
        await user.save();
    }
    return user;
}

async function isAdmin(userId) {
    if (userId == mainAdminId) return true;
    const conf = await getConfig();
    return conf.admins.includes(userId);
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

const userState = {}; 

// --- TEXT ---
const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী (A to Z):</b>\n\n১. প্রথমে '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. আপনার <b>.xlsx</b> (এক্সেল) ফাইলটি আপলোড করুন।\n৩. এডমিন আপনার ফাইল চেক করে কনফার্ম করবেন।\n৪. কোনো সমস্যা হলে '📞 <b>Support</b>' বাটনে ক্লিক করে যোগাযোগ করুন।\n\n<i>ধন্যবাদ!</i>",
    en: "ℹ️ <b>How to Use (A to Z):</b>\n\n1. First, click the '📂 <b>Submit File</b>' button.\n2. Upload your <b>.xlsx</b> (Excel) file.\n3. Admin will review and confirm your file.\n4. If you face any issues, click '📞 <b>Support</b>' to contact us.\n\n<i>Thank you!</i>"
};

// --- KEYBOARDS ---
async function getMainMenu(userId) {
    let keyboard = [
        [{ text: "📂 Submit File" }], 
        [{ text: "👤 Profile" }, { text: "ℹ️ Use Info" }], 
        [{ text: "📞 Support" }] 
    ];
    if (await isAdmin(userId)) keyboard.push([{ text: "🛠 Admin Panel" }]);
    return { keyboard: keyboard, resize_keyboard: true };
}

async function getAdminKeyboard(userId) {
    const conf = await getConfig();
    const subStatus = conf.submissionActive ? "🟢 Submission ON" : "🔴 Submission OFF";
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
bot.on('callback_query', async (query) => {
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
            let user = await getUser(chatId, query.from.first_name);
            user.locked = false;
            await user.save();
            bot.sendMessage(chatId, "✅ <b>Refreshed Successfully!</b>\nSelect an option:", { 
                parse_mode: 'HTML', 
                reply_markup: await getMainMenu(chatId) 
            });
            bot.deleteMessage(chatId, query.message.message_id).catch((err) => {});
        }
    } catch (e) { console.log(e.message); }
    bot.answerCallbackQuery(query.id);
});

// --- MAIN MESSAGE HANDLER ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // ডাটা লোড
    let user = await getUser(chatId, msg.from.first_name);
    let config = await getConfig();

    // সিস্টেম আপডেট লক চেক
    if (user.locked === true && chatId != mainAdminId) {
         bot.sendMessage(chatId, "⚠️ <b>System Update Available!</b>\n\nNew features added. Please click <b>Refresh</b> to continue using the bot.", {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh / Update", callback_data: "restart_bot" }]] }
        });
        return;
    }

    if (text === '/start' || text === '🔙 Back to Home') {
        userState[chatId] = null;
        user.locked = false;
        await user.save();
        bot.sendMessage(chatId, `👋 <b>Welcome, 🌹${msg.from.first_name}🌹!</b>\n\nPlease select an option from below:`, { 
            parse_mode: 'HTML', 
            reply_markup: await getMainMenu(chatId) 
        });
        return;
    }

    if (text === '❌ Cancel') {
        userState[chatId] = null;
        const kb = await isAdmin(chatId) ? await getAdminKeyboard(chatId) : await getMainMenu(chatId);
        bot.sendMessage(chatId, "❌ Action Cancelled.", { reply_markup: kb });
        return;
    }
    
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

    if (userState[chatId] === 'WAITING_FOR_FILE') {
        config = await getConfig(); 
        if (!config.submissionActive) {
            bot.sendMessage(chatId, "⚠️ <b>Submission Closed Just Now!</b>", { parse_mode: 'HTML', reply_markup: await getMainMenu(chatId) });
            userState[chatId] = null;
            return;
        }

        if (msg.document && msg.document.file_name && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
            const forwardTarget = config.submissionChannel || mainAdminId;
            const currentDate = getFormattedDate();

            if (config.lastDate !== currentDate) {
                config.lastDate = currentDate;
                await config.save();
                await bot.sendMessage(forwardTarget, `📅 <b>এখানে থেকে ${currentDate} তারিখ এর ফাইল রিসিভ শুরু।</b>`, {parse_mode: 'HTML'}).catch(e=>console.log(e));
            }

            bot.forwardMessage(forwardTarget, chatId, msg.message_id).then((forwardedMsg) => {
                const senderName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
                const senderUsername = msg.from.username ? `@${msg.from.username}` : 'N/A';
                const infoMessage = `📄 <b>New File from:</b>\nName: ${senderName}\nUser: ${senderUsername}\nID: <code>${chatId}</code>`;

                bot.sendMessage(forwardTarget, infoMessage, {
                    parse_mode: 'HTML',
                    reply_to_message_id: forwardedMsg.message_id
                });
                
                getMainMenu(chatId).then(kb => {
                    bot.sendMessage(chatId, "✅ <b>FILE SUBMITTED!</b>\n\nYour file has been sent for review.", { parse_mode: 'HTML', reply_markup: kb });
                });
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

    // --- ADMIN PANEL ---
    if (await isAdmin(chatId)) {
        if (text === '🛠 Admin Panel') {
            bot.sendMessage(chatId, "🛠 <b>ADMIN DASHBOARD</b>\nSelect an action:", { parse_mode: 'HTML', reply_markup: await getAdminKeyboard(chatId) });
            return;
        }

        if (text === '🔄 Reset Date') {
            userState[chatId] = 'RESET_DATE_PASS';
            bot.sendMessage(chatId, "🔒 <b>Security Check</b>\nTo reset the date tracker, please enter the password:", { parse_mode: 'HTML', reply_markup: cancelKeyboard });
            return;
        }
        if (userState[chatId] === 'RESET_DATE_PASS') {
            if (text === 'MTS@2026') {
                config.lastDate = ""; 
                await config.save();
                bot.sendMessage(chatId, "✅ <b>Success!</b> Date tracker has been reset.", { parse_mode: 'HTML', reply_markup: await getAdminKeyboard(chatId) });
            } else {
                bot.sendMessage(chatId, "❌ <b>Wrong Password!</b> Access Denied.", { parse_mode: 'HTML', reply_markup: await getAdminKeyboard(chatId) });
            }
            userState[chatId] = null;
            return;
        }

        if (text === '🟢 Submission ON' || text === '🔴 Submission OFF') {
            config.submissionActive = !config.submissionActive;
            await config.save();
            const statusMsg = config.submissionActive ? "✅ <b>Submission is now OPEN.</b>" : "⛔ <b>Submission is now CLOSED.</b>";
            bot.sendMessage(chatId, statusMsg, { parse_mode: 'HTML', reply_markup: await getAdminKeyboard(chatId) });
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
                await User.updateMany({ userId: { $ne: chatId } }, { locked: true });
                const users = await User.find({ userId: { $ne: chatId } });
                let count = 0;
                users.forEach(u => {
                    bot.sendMessage(u.userId, alertMsg, {
                        parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: [[{ text: "🔄 Update Now / Restart", callback_data: "restart_bot" }]] }
                    }).catch(()=>{});
                    count++;
                });
                bot.sendMessage(chatId, `✅ <b>Alert Sent to ${count} users.</b>`, {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)});
            } else {
                bot.sendMessage(chatId, "❌ Cancelled.", {reply_markup: await getAdminKeyboard(chatId)});
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
                    await config.save(); 
                    bot.sendMessage(chatId, "✅ Added.", {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)}); 
                } else { 
                    bot.sendMessage(chatId, "⚠️ Already Admin.", {reply_markup: await getAdminKeyboard(chatId)}); 
                }
                userState[chatId] = null; return;
            }
            if (text === '➖ Remove Admin') { userState[chatId] = 'REM_ADMIN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'REM_ADMIN') {
                const tid = parseInt(text);
                if (tid == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot remove Main Admin.", {reply_markup: await getAdminKeyboard(chatId)}); return; }
                const idx = config.admins.indexOf(tid);
                if (idx > -1) { 
                    config.admins.splice(idx, 1); 
                    await config.save(); 
                    bot.sendMessage(chatId, "✅ Removed.", {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)}); 
                } else { 
                    bot.sendMessage(chatId, "⚠️ Not an Admin.", {reply_markup: await getAdminKeyboard(chatId)}); 
                }
                userState[chatId] = null; return;
            }
        }

        if (text === '🔗 Set Support Link') { userState[chatId] = 'SET_SUPPORT'; bot.sendMessage(chatId, "Enter Username/Link:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_SUPPORT') { 
            const formattedLink = formatSupportLink(text);
            config.supportLink = formattedLink; 
            await config.save(); 
            bot.sendMessage(chatId, `✅ <b>Link Updated!</b>\n${formattedLink}`, {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)}); 
            userState[chatId] = null; return; 
        }

        if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Message:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BROADCAST') { 
            const msgBody = `📢 <b>OFFICIAL NOTICE</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n<i>~ Management Team</i>`;
            const users = await User.find({});
            users.forEach(u => bot.sendMessage(u.userId, msgBody, {parse_mode: 'HTML'}).catch(()=>{})); 
            bot.sendMessage(chatId, `✅ <b>Sent to ${users.length} users.</b>`, {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)}); 
            userState[chatId] = null; return; 
        }

        if (text === '🆔 Set Channel ID') { userState[chatId] = 'SET_CH'; bot.sendMessage(chatId, "Enter Channel ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'SET_CH') { 
            config.submissionChannel = text; 
            await config.save(); 
            bot.sendMessage(chatId, "✅ Set.", {reply_markup: await getAdminKeyboard(chatId)}); 
            userState[chatId]=null; return; 
        }

        if (text === '📨 Reply User') { userState[chatId] = 'REP_1'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'REP_1') { userState[chatId] = {step:'REP_2', t:text}; bot.sendMessage(chatId, "Enter Message:"); return; }
        if (userState[chatId]?.step === 'REP_2') { 
            const replyMsg = `📨 <b>NEW MESSAGE FROM ADMIN</b>\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖\n${text}\n➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖➖`;
            bot.sendMessage(userState[chatId].t, replyMsg, {parse_mode: 'HTML'}).catch(()=>{}); 
            bot.sendMessage(chatId, "✅ Sent.", {reply_markup: await getAdminKeyboard(chatId)}); 
            userState[chatId]=null; return; 
        }
    
        if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'BAN') { 
            if(text == mainAdminId) { bot.sendMessage(chatId, "❌ Cannot ban Main Admin.", {reply_markup: await getAdminKeyboard(chatId)}); return; }
            const target = await getUser(text, "Unknown");
            target.banned = true;
            await target.save();
            bot.sendMessage(chatId, "🚫 <b>User Banned Successfully.</b>", {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)}); 
            userState[chatId]=null; return; 
        }
        
        if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter User ID:", {reply_markup: cancelKeyboard}); return; }
        if (userState[chatId] === 'UNBAN') { 
            const target = await getUser(text, "Unknown");
            target.banned = false;
            await target.save();
            bot.sendMessage(chatId, "✅ <b>User Unbanned Successfully.</b>", {parse_mode:'HTML', reply_markup: await getAdminKeyboard(chatId)}); 
            userState[chatId]=null; return; 
        }
    }
});
