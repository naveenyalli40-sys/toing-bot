const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = "8678876730";
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "";
const DEFAULT_REF_LINK = "https://toingit.com";

const DB_FILE = "./database.json";
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ accounts: [], orders: [], otps: {} }, null, 2));
}
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.get("/", (req, res) => res.send("Naveen's Toing Bot Server is Live!"));

app.post("/api/send-otp", async (req, res) => {
  const { phone } = req.body;
  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ error: "Invalid 10-digit phone number" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const db = readDB();
  db.otps[cleanPhone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
  writeDB(db);

  try {
    if (FAST2SMS_API_KEY) {
      await axios.get("https://fast2sms.com", {
        params: {
          authorization: FAST2SMS_API_KEY,
          variables_values: otp,
          route: "otp",
          numbers: cleanPhone
        }
      });
    } else {
      await axios.post(`https://telegram.org{BOT_TOKEN}/sendMessage`, {
        chat_id: ADMIN_CHAT_ID,
        text: `🔐 OTP for +91 ${cleanPhone}: *${otp}*`,
        parse_mode: "Markdown"
      });
    }
    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

app.post("/api/verify-otp", (req, res) => {
  const { phone, otp } = req.body;
  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
  const db = readDB();
  const record = db.otps[cleanPhone];

  if (!record || record.otp !== String(otp) || Date.now() > record.expires) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  delete db.otps[cleanPhone];
  const formattedPhone = `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
  let account = db.accounts.find((a) => a.phone === formattedPhone);

  if (!account) {
    account = {
      id: "acc_" + Date.now(),
      phone: formattedPhone,
      customerId: String(Math.floor(800000000 + Math.random() * 99999999)),
      name: `Toing User ${cleanPhone.slice(-4)}`,
      freeCash: 50,
      status: "FRESH",
      refLink: DEFAULT_REF_LINK,
      token: "TA-" + Math.random().toString(36).substring(2, 8).toUpperCase()
    };
    db.accounts.unshift(account);
  }

  writeDB(db);
  res.json({ success: true, account, accounts: db.accounts });
});

app.get("/api/data", (req, res) => {
  const db = readDB();
  res.json({ accounts: db.accounts, orders: db.orders });
});

app.post("/api/place-order", async (req, res) => {
  const { accountId, items, subtotal, discount, finalTotal, address, telegramUser } = req.body;
  const db = readDB();
  const account = db.accounts.find((a) => a.id === accountId);

  const newOrder = {
    id: "ORD-" + Math.floor(100000 + Math.random() * 900000),
    items: items.map((i) => `${i.qty}x ${i.item}`).join(", "),
    subtotal,
    discount,
    total: finalTotal,
    account: account ? account.phone : "Guest",
    refLink: DEFAULT_REF_LINK,
    address: address ? `${address.title} (${address.full})` : "Not specified",
    date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    status: "Confirmed"
  };

  db.orders.unshift(newOrder);

  if (discount >= 50 && account) {
    account.freeCash = 0;
    account.status = "USED";
  }
  writeDB(db);

  try {
    await axios.post(`https://telegram.org{BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_CHAT_ID,
      text:
        `🛎️ *NEW ORDER — NAVEEN'S TOING BOT*\n\n` +
        `🆔 *Order ID:* \`${newOrder.id}\`\n` +
        `👤 *TG User:* ${telegramUser?.name || "User"} (@${telegramUser?.username || "none"})\n` +
        `📱 *Account:* ${newOrder.account}\n` +
        `🍔 *Items:* ${newOrder.items}\n` +
        `💰 *Subtotal:* ₹${subtotal}\n` +
        `🎁 *Refer Discount:* -₹${discount}\n` +
        `✅ *Final Payable:* *₹${finalTotal}*\n` +
        `📍 *Address:* ${newOrder.address}\n` +
        `🔗 *Ref:* ${DEFAULT_REF_LINK}`,
      parse_mode: "Markdown"
    });
  } catch (e) {
    console.error("Telegram alert failed:", e.message);
  }

  res.json({ success: true, order: newOrder, accounts: db.accounts, orders: db.orders });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

