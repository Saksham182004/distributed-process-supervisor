#include<iostream>
#include "heartbeat_client.h"
#include <curl/curl.h>
#include "process_config.h"
using namespace std;


void send_heartbeat(const string & worker_id , const string& coordinator_url ,const vector<Process>& services){
    CURL* curl = curl_easy_init();

    if (curl){

        string services_json = "[";
        for(int i = 0; i < services.size(); i++){
            services_json += "{";
            services_json += "\"name\":\"" + services[i].name + "\",";
            services_json += "\"command\":\"" + services[i].command + "\",";
            services_json += "\"max_restarts\":" + to_string(services[i].max_restarts);
            services_json += "}";
            if(i < services.size() - 1) services_json += ",";  // comma between items, not after last
        }
        services_json += "]";

        string body = "{\"worker_id\":\"" + worker_id + "\",\"services\":" + services_json + "}";
        

         // tell curl where to send it
        curl_easy_setopt(curl, CURLOPT_URL, coordinator_url.c_str());


        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());


        struct curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

        // send it
        curl_easy_perform(curl);

        // cleanup
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);

    }
}


