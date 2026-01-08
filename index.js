const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const express = require('express'); 
const app = express(); 

// --- সেটিংস ---
const token = '8363378044:AAGmdnsOVRQ-S8pD4uTRp9UJLZGQMUHvR-0'; 
const mainAdminId = 6802901397; 
const mongoURI = 'mongodb+srv://saifulmiasaifulmia:Saiful%402008@cluster0.bzhwkun.mongodb.net/?appName=Cluster0'; 

// --- সার্ভার (Render এর জন্য) ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Running...'));
app.listen(port, () => console.log(`🌍 Web Server running on port ${port}`));

// --- মঙ্গোডিবি কানেকশন ---
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

// --- বট সেটআপ (Polling Fix) ---
// এখানে আমরা ম্যানুয়ালি পোলিং স্টার্ট করবো যাতে কোনো কনফ্লিক্ট না হয়
const bot = new TelegramBot(token, {polling: false}); 

// আগে ওয়েবুক ডিলিট করবে, তারপর বটের কাজ শুরু করবে
(async () => {
    try {
        await bot.deleteWebHook(); // আগের জ্যাম ক্লিয়ার করা
        console.log("🧹 Webhook cleared.");
        await bot.startPolling(); // নতুন করে পোলিং শুরু
        console.log("🚀 Bot Started Successfully!");
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

// --- মেসেজ হ্যান্ডলার ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    try {
        const user = await getUser(chatId, msg.from.first_name);
        const config = await getConfig();

        // লক চেক
        if (user.locked && chatId != mainAdminId) {
            return bot.sendMessage(chatId, "⚠️ <b>System Update!</b>\nPlease wait.", {parse_mode: 'HTML'});
        }

        // কমান্ড
        if (text === '/start' || text === '🔙 Back to Home') {
            userState[chatId] = null;
            user.locked = false; 
            await user.save();
            
            let kb = [
                [{ text: "📂 Submit File" }], 
                [{ text: "👤 Profile" }, { text: "ℹ️ Use Info" }], 
                [{ text: "📞 Support" }] 
            ];
            if (await isAdmin(chatId)) kb.push([{ text: "🛠 Admin Panel" }]);

            return bot.sendMessage(chatId, `👋 <b>Welcome, ${msg.from.first_name}!</b>`, { 
                parse_mode: 'HTML', 
                reply_markup: { keyboard: kb, resize_keyboard: true } 
            });
        }

        // ফাইল সাবমিশন
        if (text === '📂 Submit File') {
            if (!config.submissionActive) return bot.sendMessage(chatId, "⚠️ Submission Closed.");
            if (user.banned) return bot.sendMessage(chatId, "🚫 You are Banned.");
            
            userState[chatId] = 'WAITING';
            return bot.sendMessage(chatId, "📂 Upload your <b>.xlsx</b> file now.", { 
                parse_mode: 'HTML', 
                reply_markup: { keyboard: [[{ text: "❌ Cancel" }]], resize_keyboard: true }
            });
        }

        // ক্যানসেল
        if (text === '❌ Cancel') {
            userState[chatId] = null;
            return bot.sendMessage(chatId, "❌ Cancelled.", { 
                reply_markup: { keyboard: [[{ text: "📂 Submit File" }], [{ text: "👤 Profile" }, { text: "ℹ️ Use Info" }], [{ text: "📞 Support" }]], resize_keyboard: true } 
            });
        }

        // ফাইল রিসিভ
        if (userState[chatId] === 'WAITING' && msg.document) {
            if (!config.submissionActive) return bot.sendMessage(chatId, "⚠️ Submission Closed.");
            
            const target = config.submissionChannel || mainAdminId;
            const date = getFormattedDate();

            if (config.lastDate !== date) {
                config.lastDate = date;
                await config.save();
                await bot.sendMessage(target, `📅 <b>Date: ${date}</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            }

            await bot.forwardMessage(target, chatId, msg.message_id);
            
            const caption = `📄 <b>From:</b> ${msg.from.first_name}\nID: <code>${chatId}</code>`;
            await bot.sendMessage(target, caption, {parse_mode: 'HTML'});

            userState[chatId] = null;
            return bot.sendMessage(chatId, "✅ <b>File Submitted!</b>", {parse_mode: 'HTML'});
        }

        // --- এডমিন প্যানেল ---
        if (await isAdmin(chatId)) {
            if (text === '🛠 Admin Panel') {
                 let akb = [
                    [{ text: "🟢 ON/OFF" }, { text: "🚫 Ban User" }],
                    [{ text: "✅ Unban User" }, { text: "🔙 Back to Home" }]
                ];
                return bot.sendMessage(chatId, "🛠 Admin Panel:", { reply_markup: { keyboard: akb, resize_keyboard: true } });
            }

            if (text === '🟢 ON/OFF') {
                config.submissionActive = !config.submissionActive;
                await config.save();
                return bot.sendMessage(chatId, `Status: ${config.submissionActive ? 'ON' : 'OFF'}`);
            }

            if (text === '🚫 Ban User') { userState[chatId] = 'BAN'; return bot.sendMessage(chatId, "Enter User ID:"); }
            if (userState[chatId] === 'BAN') {
                const u = await getUser(text, "User");
                u.banned = true; await u.save();
                userState[chatId] = null;
                return bot.sendMessage(chatId, "🚫 Banned.");
            }

            if (text === '✅ Unban User') { userState[chatId] = 'UNBAN'; return bot.sendMessage(chatId, "Enter User ID:"); }
            if (userState[chatId] === 'UNBAN') {
                const u = await getUser(text, "User");
                u.banned = false; await u.save();
                userState[chatId] = null;
                return bot.sendMessage(chatId, "✅ Unbanned.");
            }
        }
        
    } catch (e) {
        console.log("Error:", e);
    }
});
