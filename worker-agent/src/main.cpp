#include<iostream>
#include"process_manager.h"
#include"signal_handler.h"
#include"process_config.h"
#include <unistd.h>
using namespace std;





int main(){

    setup_signal_handler();

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