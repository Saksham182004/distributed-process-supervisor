const { workerLastSeen , workerServices } = require("./index.js");
const http = require('http');

const TIMEOUT_MS = 15000;
const WORKER_PORT = 4000 ; // C++ WORKER WILL LISTEN HERE IN ORDER TO CATACH THE SERVICES 

const   failedOver = new Set();// don't re-trigger failover for same dead worker (just a marker)


function postToWorker(workerHost , service){
    const body = JSON.stringify(service);
    const options = {
        hostname :workerHost ,
        port : WORKER_PORT ,
        path : "/run-service" ,
        method :"POST",
        headers  : {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
        }
    };

    const req = http.request(options, (res) => {
        console.log(`[FAILOVER] ${workerHost} accepted: ${service.name} (${res.statusCode})`);
    });
    req.on("error", (e) => {
        console.log(`[FAILOVER ERROR] Could not reach ${workerHost}: ${e.message}`);
    });
    req.write(body);
    req.end();
}




// now we will check 



setInterval(() => {
        const now = Date.now();

        const aliveWorkers = Object.keys(workerLastSeen).filter(id =>
            (now - workerLastSeen[id] < TIMEOUT_MS) // collect all the workers who are alive
        )

        Object.keys(workerLastSeen).forEach(worker_id =>{ // Now search for a probable dead worker
            const diff = now - workerLastSeen[worker_id];
            const services = workerServices[worker_id] || [];

            if (diff >= TIMEOUT_MS){
                console.log(`[ALERT] ${worker_id} DEAD — last seen ${Math.floor(diff/1000)}s ago`);


                if(!failedOver.has(worker_id) && services.length > 0){
                    const target = aliveWorkers.find( id => id!==worker_id); // 
                    if(target){
                         console.log(`[FAILOVER] ${worker_id} → ${target} (${services.length} service(s))`);
                        for (const svc of services) {
                            postToWorker(target, svc);
                        }
                        failedOver.add(worker_id);
                    }else{
                        console.log(`[FAILOVER] No alive workers available!`);
                    }
                }

            }else{
                console.log(`[OK] ${worker_id} alive — services: ${services.map(s => s.name).join(", ")}`); 
                failedOver.delete(worker_id); // if it comes back, reset so it can failover again
            }

        })
}, (10000));