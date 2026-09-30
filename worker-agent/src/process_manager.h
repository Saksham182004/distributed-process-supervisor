#pragma once
#include <string>
#include <sys/types.h>  


struct ResourceLimits {
    long max_memory_bytes ; // -1 means no limit
    int max_cpu_seconds ; // -1 means no limit
};

struct Process_stats{
    pid_t pid ;
    long memory_kb ;
    double cpu_percentage;
    bool alive ;
    double time_running;
    
};

class ProcessManager{
public:
    pid_t spawn_process(const std :: string& command , const ResourceLimits& resource_limits);
    void stop_process(pid_t pid);
    void kill_process_tree(pid_t pid); // need to make sure not orphan processess remain 
    bool is_process_alive(pid_t pid);
    Process_stats get_process_stats(pid_t pid);

private:
    void set_resource_limits(const ResourceLimits& limits); 

};

