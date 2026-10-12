#include "shared_queue.h"


std::queue<SpawnRequest> spawnQueue;
std::mutex queueMutex;