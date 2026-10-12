const PORT = 3000; 
const express = require("express");
const app = express();




app.use(express.json());



const workerLastSeen = {};
const workerServices = {};


app.post("/heartbeat" , (req, res)=>{
    var worker_id = req.body.worker_id ;


    workerLastSeen[worker_id] = Date.now();
    workerServices[worker_id] = req.body.services;

    console.log(`Heartbeat received from ${worker_id}`);

    res.json({status : "ok"});
    
});


module.exports = { workerLastSeen  , workerServices};




app.listen(PORT , ()=>{
    console.log(`Server running on the port ${PORT}`);
    require('./health-monitor');
});





