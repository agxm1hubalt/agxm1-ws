const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const TOKEN = "agxm1";

const wss = new WebSocket.Server({ port: PORT });
const clients = new Map();
const listings = [];

function makeId() {
    return crypto.randomBytes(12).toString("hex");
}

function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of clients.keys()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
}

function send(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

wss.on("connection", (ws) => {
    ws._clientId = makeId();
    ws._identified = false;
    clients.set(ws, true);

    send(ws, { type: "connect_ok", clientId: ws._clientId });

    ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (!msg || typeof msg.type !== "string") return;

        if (msg.type === "identify") {
            if (msg.token !== TOKEN) {
                send(ws, { type: "error", message: "invalid token" });
                ws.close();
                return;
            }
            ws._identified = true;
            ws._username = String(msg.name || "?");
            ws._displayName = String(msg.displayName || msg.name || "?");
            ws._userId = Number(msg.userId) || 0;

            send(ws, { type: "identify_ok", clientId: ws._clientId });
            send(ws, { type: "listings", data: listings });
            return;
        }

        if (!ws._identified) return;

        if (msg.type === "ping") {
            send(ws, { type: "pong", ts: msg.ts });
            return;
        }

        if (msg.type === "post" && msg.listing) {
            const id = makeId();
            listings.push({
                listingId: id,
                clientId: ws._clientId,
                userId: ws._userId,
                username: ws._username,
                displayName: ws._displayName,
                kind: msg.kind === "trade" ? "trade" : "duel",
                item: msg.listing.item,
                itemDisplay: msg.listing.itemDisplay,
                valueText: msg.listing.valueText,
                valueNumber: msg.listing.valueNumber,
                mutation: msg.listing.mutation,
                traits: msg.listing.traits,
                rarity: msg.listing.rarity,
                traitList: msg.listing.traitList,
                region: msg.listing.region,
                pingMs: msg.listing.pingMs,
                postedAt: Date.now(),
            });
            while (listings.length > 200) listings.shift();
            send(ws, { type: "post_ok", listingId: id });
            broadcast({ type: "listings", data: listings });
            return;
        }
    });

    ws.on("close", () => {
        clients.delete(ws);
        for (let i = listings.length - 1; i >= 0; i--) {
            if (listings[i].clientId === ws._clientId) listings.splice(i, 1);
        }
        broadcast({ type: "listings", data: listings });
    });
});

setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (let i = listings.length - 1; i >= 0; i--) {
        if (now - listings[i].postedAt > 10 * 60 * 1000) {
            listings.splice(i, 1);
            changed = true;
        }
    }
    if (changed) broadcast({ type: "listings", data: listings });
}, 60000);

console.log("agxm1 finder loaded ", PORT);