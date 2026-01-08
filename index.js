const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express'); 
const app = express(); 

// --- সেটিংস ---
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0'; 
const mainAdminId = 6802901397; 
const mongoURI = 'mongodb+srv://saifulmiasaifulmia:Saiful%402008@cluster0.bzhwkun.mongodb.net/?appName=Cluster0'; 

// --- সার্ভার (সবার আগে রান হবে) ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Fully Active & Running! 🚀'));

app.listen(port, () => {
    console.log(`✅ Web Server started on port ${port}`);
});

// --- মঙ্গোডিবি ---
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.log('❌ MongoDB Error:', err));

// --- স্কিমা ---
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

// --- বট সেটআপ ---
const bot = new TelegramBot(token, {polling: false}); 

// ফাস্ট স্টার্ট লজিক
(async () => {
    try {
        await bot.deleteWebHook();
        console.log("🧹 Webhook cleared.");
        await bot.startPolling();
        console.log("🚀 Bot Polling Started!");
    } catch (e) {
        console.log("❌ Bot Start Error:", e.message);
    }
})();

// --- ফাংশন ---
async function getConfig() {
    try {
        let conf = await Config.findOne({ id: 'settings' });
        if (!conf) { conf = new Config({ id: 'settings' }); await conf.save(); }
        return conf;
    } catch (e) { return { admins: [], submissionActive: true }; }
}

async function getUser(id, name) {
    try {
        let user = await User.findOne({ userId: id });
        if (!user) { user = new User({ userId: id, name: name }); await user.save(); }
        return user;
    } catch (e) { return { userId: id, name: name, banned: false, locked: false }; }
}

async function isAdmin(userId) {
    if (userId == mainAdminId) return true;
    const conf = await getConfig();
    return conf.admins.includes(userId);
}

function getFormattedDate() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
}

const userState = {};

// --- টেক্সট কন্টেন্ট ---
const useInfoText = {
    bn: "ℹ️ <b>বট ব্যবহারের নিয়মাবলী (A to Z):</b>\n\n১. প্রথমে '📂 <b>Submit File</b>' বাটনে ক্লিক করুন।\n২. আপনার <b>.xlsx</b> (এক্সেল) ফাইলটি আপলোড করুন।\n৩. এডমিন আপনার ফাইল চেক করে কনফার্ম করবেন।\n৪. কোনো সমস্যা হলে '📞 <b>Support</b>' বাটনে ক্লিক করে যোগাযোগ করুন।\n\n<i>ধন্যবাদ!</i>",
    en: "ℹ️ <b>How to Use (A to Z):</b>\n\n1. First, click the '📂 <b>Submit File</b>' button.\n2. Upload your <b>.xlsx</b> (Excel) file.\n3. Admin will review and confirm your file.\n4. If you face any issues, click '📞 <b>Support</b>' to contact us.\n\n<i>Thank you!</i>"
};

// --- কিবোর্ড ---
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

// --- কলব্যাক কুয়েরি ---
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
            let user = await getUser(chatId, query.from.first_name);
            user.locked = false; await user.save();
            bot.sendMessage(chatId, "✅ <b>Refreshed!</b>", { parse_mode: 'HTML', reply_markup: await getMainMenu(chatId) });
            bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
        }
    } catch (e) { console.log(e.message); }
    bot.answerCallbackQuery(query.id);
});

// --- মেইন মেসেজ হ্যান্ডলার ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    try {
        let user = await getUser(chatId, msg.from.first_name);
        let config = await getConfig();

        // লক থাকলে
        if (user.locked && chatId != mainAdminId) {
             bot.sendMessage(chatId, "⚠️ <b>System Update!</b>\nPlease click below.", {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "🔄 Refresh", callback_data: "restart_bot" }]] }
            });
            return;
        }

        // মেইন মেনু
        if (text === '/start' || text === '🔙 Back to Home') {
            userState[chatId] = null;
            user.locked = false; await user.save();
            bot.sendMessage(chatId, `👋 <b>Welcome, ${msg.from.first_name}!</b>`, { 
                parse_mode: 'HTML', reply_markup: await getMainMenu(chatId) 
            });
            return;
        }

        if (text === '❌ Cancel') {
            userState[chatId] = null;
            bot.sendMessage(chatId, "❌ Cancelled.", { reply_markup: await getMainMenu(chatId) });
            return;
        }

        // ফাইল সাবমিট বাটন
        if (text === '📂 Submit File') {
            if (!config.submissionActive) return bot.sendMessage(chatId, "⚠️ <b>Submission Closed.</b>", { parse_mode: 'HTML' });
            if (user.banned) return bot.sendMessage(chatId, "🚫 <b>Banned.</b>", { parse_mode: 'HTML' });
            
            userState[chatId] = 'WAITING_FOR_FILE';
            bot.sendMessage(chatId, "📂 Upload your <b>.xlsx</b> file.", { reply_markup: cancelKeyboard, parse_mode: 'HTML' });
            return;
        }

        // অন্যান্য বাটন
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
            if (!config.submissionActive) return bot.sendMessage(chatId, "⚠️ Closed.");
            
            if (msg.document && (msg.document.file_name.endsWith('.xlsx') || msg.document.file_name.endsWith('.xls'))) {
                const target = config.submissionChannel || mainAdminId;
                const date = getFormattedDate();

                if (config.lastDate !== date) {
                    config.lastDate = date; await config.save();
                    await bot.sendMessage(target, `📅 <b>Date: ${date}</b>`, {parse_mode: 'HTML'}).catch(()=>{});
                }

                await bot.forwardMessage(target, chatId, msg.message_id);
                await bot.sendMessage(target, `📄 <b>From:</b> ${msg.from.first_name}\nID: <code>${chatId}</code>`, {parse_mode: 'HTML'});
                
                bot.sendMessage(chatId, "✅ <b>Submitted!</b>", {parse_mode: 'HTML', reply_markup: await getMainMenu(chatId)});
                userState[chatId] = null;
            } else {
                bot.sendMessage(chatId, "⚠️ Only .xlsx files allowed.");
            }
            return;
        }

        // --- এডমিন প্যানেল ---
        if (await isAdmin(chatId)) {
            if (text === '🛠 Admin Panel') {
                bot.sendMessage(chatId, "🛠 Admin Dashboard:", { reply_markup: await getAdminKeyboard(chatId) });
                return;
            }

            if (text === '🟢 Submission ON' || text === '🔴 Submission OFF') {
                config.submissionActive = !config.submissionActive;
                await config.save();
                bot.sendMessage(chatId, `Status: ${config.submissionActive ? "ON" : "OFF"}`, { reply_markup: await getAdminKeyboard(chatId) });
                return;
            }

            if (text === '🔄 Reset Date') { userState[chatId] = 'RESET_DATE'; bot.sendMessage(chatId, "Enter Pass:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'RESET_DATE') {
                if (text === 'MTS@2026') { config.lastDate = ""; await config.save(); bot.sendMessage(chatId, "✅ Reset Done."); }
                else { bot.sendMessage(chatId, "❌ Wrong Pass."); }
                userState[chatId] = null; return;
            }

            if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'BAN') {
                const u = await getUser(text, "User");
                u.banned = true; await u.save();
                bot.sendMessage(chatId, "🚫 Banned."); userState[chatId] = null; return;
            }

            if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'UNBAN') {
                const u = await getUser(text, "User");
                u.banned = false; await u.save();
                bot.sendMessage(chatId, "✅ Unbanned."); userState[chatId] = null; return;
            }

            if (text === '📢 Broadcast') { userState[chatId] = 'BROADCAST'; bot.sendMessage(chatId, "Enter Msg:", {reply_markup: cancelKeyboard}); return; }
            if (userState[chatId] === 'BROADCAST') {
                const users = await User.find({});
                users.forEach(u => bot.sendMessage(u.userId, `📢 <b>Notice:</b>\n${text}`, {parse_mode:'HTML'}).catch(()=>{}));
                bot.sendMessage(chatId, "✅ Sent."); userState[chatId] = null; return;
            }
            
            // মেইন এডমিন ফিচার
            if (chatId == mainAdminId) {
                if (text === '➕ Add Admin') { userState[chatId] = 'ADD_ADMIN'; bot.sendMessage(chatId, "Enter ID:", {reply_markup: cancelKeyboard}); return; }
                if (userState[chatId] === 'ADD_ADMIN') {
                    const id = parseInt(text);
                    if(!config.admins.includes(id)) { config.admins.push(id); await config.save(); bot.sendMessage(chatId, "✅ Added."); }
                    userState[chatId] = null; return;
                }
            }
        }

    } catch (e) { console.log(e); }
});
