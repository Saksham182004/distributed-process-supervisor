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