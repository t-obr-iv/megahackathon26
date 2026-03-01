import pandas as pd
import json

# read both CSVs
csv1 = pd.read_csv('top100_routes.csv')
csv2 = pd.read_csv('top100_routes 2.csv')

# load existing geometry data from busy_roads.json
with open('busy_roads.json', 'r') as f:
    busy = json.load(f)

# build lookup of geometry by origin/dest coordinates
geom_lookup = {}
for r in busy:
    key = (r['origin_lat'], r['origin_lon'], r['dest_lat'], r['dest_lon'])
    geom_lookup[key] = r.get('route_points', [])

# process csv1: add route_points from lookup
list1 = []
for _, row in csv1.iterrows():
    key = (row['origin_lat'], row['origin_lon'], row['dest_lat'], row['dest_lon'])
    d = row.to_dict()
    d['route_points'] = geom_lookup.get(key, [])
    list1.append(d)

# process csv2: no geometry available, so empty list for route_points
list2 = []
for _, row in csv2.iterrows():
    d = row.to_dict()
    d['route_points'] = []  # second CSV has no geometry
    list2.append(d)

# combine: first 100 with geometry, then 100 without
combined = list1 + list2

with open('combined_routes.json', 'w') as f:
    json.dump(combined, f, indent=2)

print(f'Wrote {len(combined)} routes')
print(f'  - Routes 0-99: have geometry')
print(f'  - Routes 100-199: will get geometry from OSRM')
