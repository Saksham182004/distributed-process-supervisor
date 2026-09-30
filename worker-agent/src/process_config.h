#pragma once
#include <string>
#include <sys/types.h>  
#include <vector>
#include <yaml-cpp/yaml.h>



struct Process{
    std :: string name ;
    std :: string command;
    long max_memory_bytes ;
    int  max_cpu_seconds;
    pid_t pid ; // filld after spawans and this pid can change if the process dies in between
    int max_restarts;
    int restart_count ;
};


std::vector<Process> load_config(const std::string& filename);