#include "process_config.h"
#include <iostream>
using namespace std ;



vector<Process> load_config(const std :: string & filename){
   vector<Process> vec;
   YAML :: Node config  = YAML :: LoadFile(filename);

   Process P ;


   for (auto info : config["processes"]){
        P.name             = info["name"].as<std::string>();
        P.command          = info["command"].as<std::string>();
        P.max_memory_bytes = info["max_memory_bytes"].as<long>();
        P.max_cpu_seconds  = info["max_cpu_seconds"].as<int>();
        P.max_restarts     = info["max_restarts"].as<int>();
        P.pid              = -1;   // not spawned yet
        P.restart_count    = 0;    // hasn't restarted yet


        vec.push_back(P);
   }

   return vec;

}