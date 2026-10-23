#pragma once 
#include <queue> 
#include <mutex> 
#include <string> 


struct SpawnRequest{
    std :: string name ;
    std :: string command;
    int max_restarts;
};

 // just declaration exits somewhere else
extern std::queue<SpawnRequest> spawnQueue;
extern std::mutex queueMutex;

// Hand-off from the run-service server thread (producer: receives failover
// requests on :4000) to the main thread (consumer: the only thread that spawns
// and tracks child processes). queueMutex guards it because both threads touch it.
