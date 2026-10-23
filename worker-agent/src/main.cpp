#include<iostream>
#include"process_manager.h"
#include"signal_handler.h"
#include"process_config.h"
#include"heartbeat_client.h"
#include <unistd.h>
#include <thread>
#include "run_service_server.h"
#include "shared_queue.h"
#include <yaml-cpp/yaml.h>
#include <mutex>  
#include <sstream> 
using namespace std;

int main(){

    setup_signal_handler();

    string worker_id = getenv("WORKER_ID") ? getenv("WORKER_ID") : "worker_default";
    string coordinator_url = getenv("COORDINATOR_URL") ? getenv("COORDINATOR_URL") : "http://coordinator:3000/heartbeat";

    vector<Process> YamlServices;
    YamlServices = load_config("services.yaml");
    mutex servicesMutex; 

    // NOW start heartbeat thread — YamlServices is ready
    thread heartbeat_thread([worker_id, coordinator_url, &YamlServices, &servicesMutex](){
        while(true){
            vector<Process> snapshot ;
            {
                lock_guard<mutex> lock(servicesMutex);
                snapshot = YamlServices ; // copy under the lock 
            }
            send_heartbeat(worker_id, coordinator_url, snapshot);
            sleep(5);
        }
    });
    heartbeat_thread.detach();

    thread server_thread([](){
        start_run_service_server(4000);
    });

    server_thread.detach();

    ProcessManager Pm;

    {

        lock_guard<mutex> lock(servicesMutex);
        for(Process &P : YamlServices){
            ResourceLimits Rl;
            Rl.max_cpu_seconds = P.max_cpu_seconds;
            Rl.max_memory_bytes = P.max_memory_bytes;
            P.pid = Pm.spawn_process(P.command, Rl);
        }

    }

   

    while(true){
        {
            lock_guard<mutex> lock(queueMutex);
            while (!spawnQueue.empty()) {
                SpawnRequest req = spawnQueue.front();
                spawnQueue.pop();

                Process P;
                P.name = req.name;
                P.command = req.command;
                P.max_restarts = req.max_restarts;
                P.restart_count = 0;

                ResourceLimits Rl;  // default — no limits on failed-over services
                P.pid = Pm.spawn_process(P.command, Rl);
                {
                    lock_guard<mutex> slock(servicesMutex);
                    YamlServices.push_back(P);
                }
                
                cout << "[RUN-SERVICE] Started: " << P.name << " (pid " << P.pid << ")" << endl;
            }
        }

        pid_t dead = get_dead_process();

        if(dead != -1){
            lock_guard<mutex> slock(servicesMutex); 
            for(Process& P : YamlServices){
                if(P.pid == dead){
                    if(P.max_restarts == -1 || P.restart_count < P.max_restarts){
                        cout << P.name << " died! Restarting..." << endl;
                        ResourceLimits Rl;
                        Rl.max_memory_bytes = P.max_memory_bytes;
                        Rl.max_cpu_seconds = P.max_cpu_seconds;
                        P.pid = Pm.spawn_process(P.command, Rl);
                        P.restart_count++;
                    } else {
                        cout << P.name << " exceeded max restarts. Giving up." << endl;
                    }
                    break;
                }
            }
        }

        sleep(2);
    }

    return 0;
}