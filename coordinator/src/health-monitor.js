const { redis} = require("./index.js");
const http = require("http");
const os = require('os');


const TIMEOUT_MS = 15000;
const WORKER_PORT = 4000; // C++ WORKER WILL LISTEN HERE IN ORDER TO CATACH THE SERVICES

const failedOver = new Set(); // don't re-trigger failover for same dead worker (just a marker)

const MY_ID = process.env.HOSTNAME || os.hostname();  // unique per container
const LEADER_TTL = 30


async function tryBecomingLeader() {
    // try to claim the lock ( the lock is only acquuired when the nx part is null ie noe key value pair exists)
    const result = await redis.set("coordinator:leader" , MY_ID ,"NX" , "EX" , LEADER_TTL);


    if (result =="OK") return true ; // just become the leader 

    //Already set , now check if we are current leader 
    const current = await redis.get("coordinator:leader");

    if (current === MY_ID) {
        await redis.expire("coordinator:leader", LEADER_TTL);  // renew TTL
        return true;
    }
    return false;  // someone else is leader
}

function postToWorker(workerHost, service) {
    const body = JSON.stringify(service);
    const options = {
        hostname: workerHost,
        port: WORKER_PORT,
        path: "/run-service",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
    };

    const req = http.request(options, (res) => {
        console.log(
            `[FAILOVER] ${workerHost} accepted: ${service.name} (${res.statusCode})`,
        );
    });
    req.on("error", (e) => {
        console.log(
            `[FAILOVER ERROR] Could not reach ${workerHost}: ${e.message}`,
        );
    });
    req.write(body);
    req.end();
}

// now we will check

setInterval(async () => {
    const now = Date.now();

    const isLeader = await tryBecomingLeader();

    console.log(`[ELECTION] ${MY_ID} — ${isLeader ? "LEADER" : "follower"}`); // ← add this


    const keys = await redis.keys("worker:*:lastSeen");

   

    if (keys.length === 0) return;

    const worker_Ids = keys.map((k) => k.split(":")[1]); // get the worker ids

    const lastSeenValues = await Promise.all(
        worker_Ids.map((id) => redis.get(`worker:${id}:lastSeen`)),
    );

    const aliveWorkers = []; // for failover logic ahead
    const checks = [];

    worker_Ids.forEach((id, i) => {
        const diff = now - parseInt(lastSeenValues[i]);
        checks.push({ id, diff });

        if (diff < TIMEOUT_MS) aliveWorkers.push(id);
    });

    // handle each worker here

    for (const { id, diff } of checks) {
        const servicesRaw = await redis.get(`worker:${id}:services`);
        const services = servicesRaw ? JSON.parse(servicesRaw) : [];

        if (diff >= TIMEOUT_MS) {
            console.log(
                `[ALERT] ${id} DEAD — last seen ${Math.floor(diff / 1000)}s ago`,
            );

            if (isLeader && !failedOver.has(id) && services.length > 0) { // ONLY THE LEADER FIRES THE FAILOVER 
                // if the worker is not in the failedOver list and has some services then we need to add that in the set and sets its request to any other alive workers so that it can do the deads job

                const target = aliveWorkers.find((w) => w !== id);
                if (target) {
                    console.log(
                        `[FAILOVER] ${id} → ${target} (${services.length} service(s))`,
                    );
                    for (const svc of services) {
                        postToWorker(target, svc);
                    }
                    failedOver.add(id);
                } else {
                    console.log(`[FAILOVER] No alive workers available!`);
                }
            }
        } else {
            console.log(
                `[OK] ${id} alive — services: ${services.map((s) => s.name).join(", ")}`,
            );
            failedOver.delete(id);
        }
    }
}, 10000);
