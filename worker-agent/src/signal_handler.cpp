#include "signal_handler.h"
#include <sys/wait.h>    // waitpid, WNOHANG
#include <signal.h>      // signal, SIGCHLD

#define MAX_DEAD 64 
volatile pid_t dead_pids[MAX_DEAD];
volatile int dead_count = 0;




void sigChild_handler(int sig){
    pid_t dead;

    while((dead = waitpid(-1,nullptr,WNOHANG))>0){
        if(dead_count < MAX_DEAD){
            dead_pids[dead_count++] = dead;
        }
    }

}

pid_t get_dead_process(){
    
    if (dead_count >0 ){
        return dead_pids[--dead_count];
    }

    return -1 ;
}



void setup_signal_handler(){
    signal(SIGCHLD , sigChild_handler);
}