#include "run_service_server.h"
#include "shared_queue.h"
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <string>
#include <cstring>
#include <iostream>
using namespace std;


static string extract_string(const string& json, const string& key) {
    string search = "\"" + key + "\":\"";
    size_t pos = json.find(search);
    if (pos == string::npos) return "";
    pos += search.size();
    size_t end = json.find("\"", pos);
    return json.substr(pos, end - pos);
}


static int extract_int(const string& json, const string& key) {
    string search = "\"" + key + "\":";
    size_t pos = json.find(search);
    if (pos == string::npos) return 3;
    pos += search.size();
    return stoi(json.substr(pos));
}




void start_run_service_server(int port){
    int server_fd = socket(AF_INET , SOCK_STREAM , 0);
    int opt =1 ;

    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    bind(server_fd, (sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 5);
    cout << "[RUN-SERVICE] Listening on port " << port << endl;

    while(true){
        int client_fd = accept(server_fd , nullptr , nullptr);
        if(client_fd < 0){
            continue ;
        }

        char buf[4096] = {};
        recv(client_fd , buf , sizeof(buf)-1 , 0);
        string request(buf);

        size_t body_pos = request.find("\r\n\r\n");
        if (body_pos != string::npos){
            string body = request.substr(body_pos + 4 ); // getting the json body

            SpawnRequest req;
            req.name    = extract_string(body, "name");
            req.command = extract_string(body, "command");
            req.max_restarts = extract_int(body, "max_restarts");

             if (!req.command.empty()) {
                    {
                        lock_guard<mutex> lock(queueMutex);
                        spawnQueue.push(req);
                    }
                
                cout << "[RUN-SERVICE] Queued: " << req.name << " → " << req.command << endl;
                const char* ok = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok";
                send(client_fd, ok, strlen(ok), 0);
            }else{
                const char* bad = "HTTP/1.1 400 Bad Request\r\nContent-Length: 3\r\n\r\nbad";
                send(client_fd, bad, strlen(bad), 0);
            }

        }
        close(client_fd);

    }
}