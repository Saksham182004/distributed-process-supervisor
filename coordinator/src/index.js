const PORT = 3000; 
const express = require("express");
const app = express();
const Redis = require('ioredis');


const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

redis.on("connect", () => console.log("[REDIS] Connected"));
redis.on("error", (e) => console.log("[REDIS] Error:", e.message));


app.use(express.json());



app.post("/heartbeat" ,async (req, res)=>{
    const {worker_id , services } = req.body; 


    await redis.set(`worker:${worker_id}:lastSeen`, Date.now()); //Store lasteen on timestamp 
    await redis.set(`worker:${worker_id}:services`,JSON.stringify(services)); // Store services as json string 


    console.log(`Heartbeat received from ${worker_id}`);

    res.json({status : "ok"});
    
});


module.exports = {redis};




app.listen(PORT , ()=>{
    console.log(`Server running on the port ${PORT}`);
    require('./health-monitor');
});





