#!/bin/sh
# Scarica la terra di Natural Earth 10m (dominio pubblico) in data/ne/.
set -e
mkdir -p data/ne
curl -fL -o data/ne/ne_10m_land.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson
