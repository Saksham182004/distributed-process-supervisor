#pragma once
#include <string>
#include <vector>
#include "process_config.h"
#include <yaml-cpp/yaml.h>


void send_heartbeat(const std :: string& worker_id , const std:: string &coordinater_url ,const std::vector<Process>& services);
