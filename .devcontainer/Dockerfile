FROM mcr.microsoft.com/devcontainers/python:1-3.11-bookworm

LABEL maintainer="ESD Lab USC <esd-lab@usc.edu>" \
    version="0.1.0" \
    description="Development container for the ESD Lab USC NANO dashboard and pipelines"

ENV DEBIAN_FRONTEND=noninteractive

RUN rm -f /etc/apt/sources.list.d/yarn.list /etc/apt/sources.list.d/yarn.list.save \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        gfortran \
        libcurl4-openssl-dev \
        libfontconfig1-dev \
        libfreetype6-dev \
        libfribidi-dev \
        libgit2-dev \
        libharfbuzz-dev \
        libjpeg62-turbo-dev \
        libpng-dev \
        libssl-dev \
        libtiff5-dev \
        libxml2-dev \
        pkg-config \
        r-base \
        r-base-dev \
        nodejs \
    && npm install -g npm@10.9.8 \
    && rm -rf /var/lib/apt/lists/*

USER vscode
