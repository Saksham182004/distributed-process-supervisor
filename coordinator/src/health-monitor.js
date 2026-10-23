const { redis} = require("./index.js");
const http = require("http");
const os = require('os');


const TIMEOUT_MS = 15000;
const WORKER_PORT = 4000; // C++ WORKER WILL LISTEN HERE IN ORDER TO CATACH THE SERVICES

const FAILED_OVER_KEY = "coordinator:failedover";
// if its in the redis along with id : it means the worker is dead and it persists across the coordinatres 
// so even if one coordinator dies the other used redis and get that this workers works is handles or not 
// if 1 it was handled not need to fireback the failover logic again and 0 means need to perform the failover logic again 


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

    if (!isLeader) return;  // not need to do anything of failover logic if you are not the leader 
    


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

    // ★ NEW — read every worker's services once, before the loop, so we know each worker's load up front

    const servicesRawList = await Promise.all(
        worker_Ids.map((id)=>redis.get(`worker:${id}:services`)),  
    )

    const servicesOf = {}
    worker_Ids.forEach((id, i)=>{
        servicesOf[id] =servicesRawList[i] ? JSON.parse(servicesRawList[i]) : [];
    });


    // Load -> number of services each alive worker is running 
    const load = {}
    aliveWorkers.forEach((w)=> (load[w] = servicesOf[w].length))

    // alive worker with the fewest services wins 
    function pickLeastLoaded(){
        let best = null ;
        for (const w of aliveWorkers){
            if( best==null || load[w] < load[best]) best = w ;

        }

        return best;
    }


    // handle each worker here

    for (const { id, diff } of checks) {
        const services = servicesOf[id]



        if (diff >= TIMEOUT_MS) {
            console.log(
                `[ALERT] ${id} DEAD — last seen ${Math.floor(diff / 1000)}s ago`,
            );

            const alreadyFailedOver = await redis.sismember(FAILED_OVER_KEY , id); //Checking through redis , it the worker dead : 0-> not handled yet its adead worker 


            if (isLeader && !alreadyFailedOver && services.length > 0) { // ONLY THE LEADER FIRES THE FAILOVER 
                // if the worker is not in the failedOver redis list  and has some services then we need to add that in the set and sets its request to any other alive workers so that it can do the deads job

                if( aliveWorkers.length==0){
                    console.log(`[FAILOVER] No alive workers available!`);
                    continue;

                }

                // spread services one at a time, each to whoever is least loaded right now

                for (const svc of services){
                    const target = pickLeastLoaded();
                    console.log(                                       
                        `[FAILOVER] ${id}:${svc.name} → ${target} (load ${load[target]})`,
                    );  

                    postToWorker(target, svc);   
                    load[target]++; // count it now so the next service sees the updated load     

                }
                await redis.sadd(FAILED_OVER_KEY , id);        
            }
        } else {
            console.log(
                `[OK] ${id} alive — services: ${services.map((s) => s.name).join(", ")}`,
            );
            await redis.srem(FAILED_OVER_KEY , id);
        }
    }
}, 10000);
