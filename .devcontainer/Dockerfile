FROM mcr.microsoft.com/devcontainers/python:1-3.11-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN rm -f /etc/apt/sources.list.d/yarn.list /etc/apt/sources.list.d/yarn.list.save \
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
    && rm -rf /var/lib/apt/lists/*
