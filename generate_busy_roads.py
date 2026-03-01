#!/usr/bin/env python3
"""
Generate busy_roads.json from top100_routes.csv
Creates synthetic route geometries with sampled points between origin and destination
"""

import csv
import json
import numpy as np

def interpolate_route(origin_lat, origin_lon, dest_lat, dest_lon, num_points=5):
    """Generate a simple line between origin and destination with random variations"""
    lats = np.linspace(origin_lat, dest_lat, num_points)
    lons = np.linspace(origin_lon, dest_lon, num_points)
    
    # add slight randomness to simulate actual road curves
    lat_noise = np.random.normal(0, 0.001, num_points)
    lon_noise = np.random.normal(0, 0.001, num_points)
    
    lats = lats + lat_noise
    lons = lons + lon_noise
    
    return [[lat, lon] for lat, lon in zip(lats, lons)]

routes = []

with open('top100_routes.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        route = {
            'origin_lat': float(row['origin_lat']),
            'origin_lon': float(row['origin_lon']),
            'dest_lat': float(row['dest_lat']),
            'dest_lon': float(row['dest_lon']),
            'short_dist_m': int(row['short_dist_m']),
            'time_saved_s': int(row['time_saved_s']),
            'mean_flow_ratio': float(row['mean_flow_ratio']),
            'congestion_label': row['congestion_label'].strip(),
            'flow_agreement_score': float(row['flow_agreement_score']),
            'route_points': interpolate_route(
                float(row['origin_lat']),
                float(row['origin_lon']),
                float(row['dest_lat']),
                float(row['dest_lon']),
                num_points=8
            ),
        }
        routes.append(route)

with open('busy_roads.json', 'w') as f:
    json.dump(routes, f)

print(f"Generated busy_roads.json with {len(routes)} routes")
