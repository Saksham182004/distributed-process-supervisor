#include <iostream>
#include "heartbeat_client.h"
#include <curl/curl.h>
#include "process_config.h"
#include <yaml-cpp/yaml.h>
#include <sstream>   // for stringstream (used to split the URL list)
#include <vector>
using namespace std;

// curl calls this with the coordinator's response; we just discard it
// (must be a real function, a lambda passed through curl_easy_setopt's ... crashes)
static size_t discard_response(char *, size_t size, size_t nmemb, void *)
{
    return size * nmemb;
}

// Send the heartbeat to the first coordinator that accepts it.
// coordinator_url is a comma-separated list (see COORDINATOR_URL in docker-compose).
void send_heartbeat(const string &worker_id, const string &coordinator_url, const vector<Process> &services)
{
    
    // resuable syntax to send request -> just syntax nothing else
    CURL *curl = curl_easy_init();

    // getting all the avaliable urls of all the coordinators avaliable 
    vector<string> urls;
    stringstream ss(coordinator_url);   
    string item;
    while (getline(ss, item, ','))
    {
        if (!item.empty())              
        {
            urls.push_back(item);
        }
    }

    if (curl)   // curl_easy_init gives nullptr if it couldn't set up
    {
        // forming the body of the application requests 
        string services_json = "[";
        for (int i = 0; i < services.size(); i++)
        {
            services_json += "{";
            services_json += "\"name\":\"" + services[i].name + "\",";
            services_json += "\"command\":\"" + services[i].command + "\",";
            services_json += "\"max_restarts\":" + to_string(services[i].max_restarts);
            services_json += "}";
            if (i < services.size() - 1)
                services_json += ","; // comma between items, not after last
        }
        services_json += "]";

        string body = "{\"worker_id\":\"" + worker_id + "\",\"services\":" + services_json + "}";

     

         // just some syntax for cpp 
        struct curl_slist *headers = nullptr;   // curl keeps headers in its own linked list
        headers = curl_slist_append(headers, "Content-Type: application/json");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

        // what to do with the coordinator's reply → throw it away (else curl prints it)
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, discard_response);

        // the data to POST. curl keeps a pointer, not a copy, so body must stay alive till we're done
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());

        // give up on a coordinator after 2s so a hung one can't freeze this thread
        // (the L makes it a long — curl expects long here)
        curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 2L);   // time allowed to connect
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 2L);          // time allowed for the whole request

        // try each coordinator and break when we get one 
        bool sent = false;
        for (const auto &url : urls)   
        {
            curl_easy_setopt(curl, CURLOPT_URL, url.c_str());   // only the address changes per try

            // actually send it; res tells us if the network part worked
            CURLcode res = curl_easy_perform(curl);
            if (res != CURLE_OK)
            {
                // couldn't even talk to it: coordinator down, name not found, or timed out
                cerr << "[HEARTBEAT] " << url << " failed: " << curl_easy_strerror(res) << endl;
                continue;   // try the next coordinator
            }

            // it answered — but was the answer "OK" (200) or an error like 500?
            long http_code = 0;
            curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);   // curl writes the code into http_code
            if (http_code == 200)
            {
                sent = true;
                break;   // done — no need to bother the other coordinators
            }
            cerr << "[HEARTBEAT] " << url << " returned HTTP " << http_code << endl;
        }

        if (!sent)   // went through every URL and none accepted it
        {
            cerr << "[HEARTBEAT] no coordinator reachable" << endl;
        }

        //freeing something 
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
    }
}
