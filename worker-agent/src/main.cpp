#include<iostream>
#include"process_manager.h"
#include"signal_handler.h"
#include"process_config.h"
#include"heartbeat_client.h"
#include <unistd.h>
#include <thread>
using namespace std;





int main(){

    setup_signal_handler();

    string worker_id = getenv("WORKER_ID") ? getenv("WORKER_ID") : "worker_default";
    string coordinator_url = getenv("COORDINATOR_URL") ? getenv("COORDINATOR_URL") : "http://coordinator:3000/heartbeat" ;

    thread heartbeat_thread([worker_id , coordinator_url](){
        while(true){
            send_heartbeat(worker_id, coordinator_url);
            sleep(5);
        }
    });

    heartbeat_thread.detach();

    // sending a heartbeat to the the coordinater from this machine so that coordinator checks is this machine alive 

    vector<Process> YamlServices ;

    string filename = "services.yaml";


    YamlServices = load_config(filename);

    ProcessManager Pm ;

    for(Process &P : YamlServices){
        string command = P.command ;
        long  max_mem = P.max_memory_bytes ;
        int max_cpu_sec = P.max_cpu_seconds;


        ResourceLimits Rl ; 

        Rl.max_cpu_seconds = max_cpu_sec ;
        Rl.max_memory_bytes = max_mem ;

        pid_t  pid = Pm.spawn_process(command , Rl);

        // change pid in the orinal P

        P.pid = pid ;

    }


    while(true){
        pid_t dead = get_dead_process(); // get the dead process 

        if(dead!=-1){
            for(Process& P: YamlServices ){
                if(P.pid==dead){
                    if(P.max_restarts ==-1 || P.restart_count < P.max_restarts){
                        cout << P.name << " died! Restarting..." << endl;
                        ResourceLimits Rl;
                        Rl.max_memory_bytes = P.max_memory_bytes;
                        Rl.max_cpu_seconds = P.max_cpu_seconds;
                        P.pid = Pm.spawn_process(P.command, Rl);
                        P.restart_count++;
                    }else{
                        cout << P.name << " exceeded max restarts. Giving up." << endl;
                    }
                    break; // from the for loop
            }
            }
        }
    
        sleep(2);

    }


    return 0;
}