#!/bin/sh
# Scarica la terra di Natural Earth 10m (dominio pubblico) in data/ne/.
set -e
mkdir -p data/ne
curl -fL -o data/ne/ne_10m_land.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson
for f in ne_10m_rivers_lake_centerlines ne_10m_rivers_europe ne_10m_lakes ne_10m_lakes_europe; do
  curl -fL -o "data/ne/$f.geojson" \
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson"
done
