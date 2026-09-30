#include<iostream>
#include"process_manager.h"
#include <unistd.h>
#include <vector>
#include <sys/wait.h>
#include <sstream>
#include <sys/resource.h>
#include <errno.h>
#include <signal.h>
#include<fstream>
#include<string>

using namespace std ;

void ProcessManager :: set_resource_limits(const ResourceLimits& limits){

     if (limits.max_memory_bytes > 0) {
        struct rlimit mem;
        mem.rlim_cur = limits.max_memory_bytes;  // soft limit
        mem.rlim_max = limits.max_memory_bytes;  // hard limit
        setrlimit(RLIMIT_AS, &mem);
    }

    if (limits.max_cpu_seconds > 0) {
        struct rlimit cpu;
        cpu.rlim_cur = limits.max_cpu_seconds;
        cpu.rlim_max = limits.max_cpu_seconds;
        setrlimit(RLIMIT_CPU, &cpu);
    }
}



pid_t ProcessManager :: spawn_process(const string& command , const ResourceLimits& resource_limits){
    pid_t pid = fork();


    if(pid<0){
        perror("Fork failed");
        exit(1);
    }

    if(pid==0){ // child process
        setpgid(0,0); // group this processs 
        set_resource_limits(resource_limits);

        istringstream ss(command);

        string token ;
        vector<string> args ;

        while( ss >> token){ // get the value of ss one at a time 
            args.push_back(token);
        }

        vector<char*> argv ;

        for(auto& arg : args){
            argv.push_back(const_cast<char*>(arg.c_str()));
            //execvp expects char* (non-const pointer) and this is the method do do it const_cast 
        }

        argv.push_back(nullptr);


        execvp(argv[0], argv.data());

        perror("exec failed");
        exit(1);    

    }else{
        cout << "Spawned process with PID: " << pid << endl;
        //not waiting because it would pause the superviser , will do that removing work in stop_process
        return pid;
    }
}

bool ProcessManager :: is_process_alive(pid_t pid){ // returns true if the process is still alive 

      int flag = kill(pid,0);
      int err = errno; // good habit to carch errno just after system call

      if(!flag){
        return true ; // 0 means the processs is alive 
      }

      if(err==ESRCH){
        // PROCESS IN DEAD  
        return false ;
      }


      return true;


}

void ProcessManager :: stop_process(pid_t pid){

    kill(pid,SIGTERM); // polite request 

    for(int i =0 ; i<5 ; i++){
        sleep(1); // waiting one second 
        if(!is_process_alive(pid)){
            cout<<"Process has stopped now "<<endl;
            return; // done here
        }
    }

    //If we come to this part of the code that means we need to forcefully kill it 

    cout<<"Process "<<pid<<" didn't stop need to kill it"<<endl;
    kill(pid,SIGKILL);

    waitpid(pid, nullptr, 0); // clean up the zombie process 

}

void ProcessManager :: kill_process_tree(pid_t pid){
    pid_t pgid = getpgid(pid);

    if(pgid<0){
        //failed - might be that the process is dead 
        kill(pid,SIGKILL);
        return ;
    }

    killpg(pgid, SIGTERM);   // polite first
    sleep(3);
    killpg(pgid, SIGKILL);   // force kill entire group
}

Process_stats ProcessManager :: get_process_stats(pid_t pid){

    Process_stats stats = {};  // zero-initializes all fields

    stats.pid = pid ;
    stats.alive = is_process_alive(pid);

    string infoPath = "/proc/" + to_string(pid) + "/status";

    ifstream status_file1(infoPath);

    string line ;

    while(getline(status_file1 ,line)){

        if(line.find("VmRSS")!=string :: npos){
            istringstream ss(line);

            string label ;
            ss>>label>>stats.memory_kb; // format VMRSS : Number 
            break;
        }
    }

    string cpu_info = "/proc/" + to_string(pid) + "/stat";

    ifstream status_file2(cpu_info);
    string stat_file ;

    getline(status_file2 ,stat_file);

    istringstream ss(stat_file);

    string token ;
    long userTime ;
    long cpuTime ;
    long startTime;

    for(int i =1 ; i<=22 ; i++){
        ss >> token ;

        if(i==14){
            userTime = stol(token);
        }
        if(i==15){
            cpuTime = stol(token);
        }

        if(i==22){
            startTime = stol(token);
        }
    }

    //Total cpu ticks 

    ifstream uptime_file("/proc/uptime");
    double uptime_seconds;
    uptime_file >> uptime_seconds;

    

    long total_ticks = userTime + cpuTime;

    long long ticks_per_sec = sysconf(_SC_CLK_TCK);

    //updating the values 

    stats.time_running = uptime_seconds - ((double)startTime / ticks_per_sec);

    stats.cpu_percentage = (double)total_ticks / ticks_per_sec;

    return stats;


} 