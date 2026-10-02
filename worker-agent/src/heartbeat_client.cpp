#include<iostream>
#include "heartbeat_client.h"
#include <curl/curl.h>
using namespace std;


void send_heartbeat(const string & worker_id , const string& coordinator_url){
    CURL* curl = curl_easy_init();

    if (curl){
        string body = "{\"worker_id\": \"" + worker_id + "\"}";

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


