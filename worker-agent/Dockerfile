FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    libyaml-cpp-dev \
    libcurl4-openssl-dev
WORKDIR /app
CMD ["./supervisor"]