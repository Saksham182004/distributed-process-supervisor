const { workerLastSeen } = require("./index.js");


// now we will check 



setInterval(() => {
        Object.keys(workerLastSeen).forEach(worker_id =>{
            const lastSeen = workerLastSeen[worker_id];
            const diff = Date.now() - lastSeen;


            if(diff >= 15000){
                console.log(`[ALERT] ${worker_id} is DEAD - last seen ${Math.floor(diff/1000)}s ago`);
            } else {
                console.log(`[OK] ${worker_id} is alive`);
            }

        })
}, (10000));