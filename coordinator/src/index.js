const PORT = 3000; 
const express = require("express");
const app = express();
const Redis = require('ioredis');


const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

redis.on("connect", () => console.log("[REDIS] Connected"));
redis.on("error", (e) => console.log("[REDIS] Error:", e.message));


// allow the dashboard (different origin) to call us
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

app.use(express.json());



app.post("/heartbeat" ,async (req, res)=>{
    const {worker_id , services } = req.body; 


    await redis.set(`worker:${worker_id}:lastSeen`, Date.now()); //Store lasteen on timestamp 
    await redis.set(`worker:${worker_id}:services`,JSON.stringify(services)); // Store services as json string 


    console.log(`Heartbeat received from ${worker_id}`);

    res.json({status : "ok"});
    
});


// snapshot of the cluster for the dashboard
app.get("/status", async (req, res) => {
    const keys = await redis.keys("worker:*:lastSeen");
    const leader = await redis.get("coordinator:leader");
    const now = Date.now();
    const TIMEOUT_MS = 15000;

    const workers = await Promise.all(
        keys.map(async (key) => {
            const id = key.split(":")[1];
            const lastSeen = parseInt(await redis.get(`worker:${id}:lastSeen`));
            const servicesRaw = await redis.get(`worker:${id}:services`);
            let services = [];
            try {
                services = servicesRaw ? JSON.parse(servicesRaw) : [];
            } catch {
                services = []; // bad JSON in redis shouldn't take down the endpoint
            }
            const diff = now - lastSeen;
            return {
                id,
                status: diff < TIMEOUT_MS ? "alive" : "dead",
                lastSeenSeconds: Math.floor(diff / 1000),
                services: (services || []).map((s) => s.name),
            };
        })
    );

    res.json({ leader, workers: workers.sort((a, b) => a.id.localeCompare(b.id)) });
});


module.exports = {redis};




app.listen(PORT , ()=>{
    console.log(`Server running on the port ${PORT}`);
    require('./health-monitor');
});





