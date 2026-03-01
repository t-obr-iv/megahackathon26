#MY JOB

#Pathfinding algorithm to find the shorter path between two random nodes

#Then, compare to traffic flow. If correlation is high, store path to be compared against transit routes

#Store in pandas df and use numpy

"""
NYC Shortest vs. Fastest Route Flow Comparison
================================================
For each random point pair in NYC:
  - Fetches the shortest-by-distance route
  - Fetches the fastest-by-traffic route
  - Samples real-time flow ratio along the shortest path
  - Compares the two routes (distance, time, agreement)
  - Saves full path geometry for transit map overlay
Stores the 100 most correlated results in a Pandas DataFrame.

Correlation measured: does higher flow on the shortest path
predict better agreement between the two routes?

Requirements:
    pip install requests numpy pandas python-dotenv

.env file:
    TOMTOM_API_KEY=your_key_here
"""

import os
import time
import json
import requests
import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

def add_api_keys(api_keys:list[str], key_names:list[str] = ["TOMTOM_API_KEY"]):
    for key_name in key_names:
        api_key = os.getenv(key_name, None)
        if api_key:
            api_keys.append(api_key)
    return api_keys

API_KEYS = add_api_keys([], [
    "TOMTOM_API_KEY",
    "TOMTOM_API_KEY_TWO",
    "TOMTOM_API_KEY_THREE"
])

BASE_ROUTING = "https://api.tomtom.com/routing/1/calculateRoute"
BASE_FLOW    = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

NYC_LAT    = (40.700, 40.820)
NYC_LON    = (-74.020, -73.900)

NUM_ROUTES   = 150 #change this to do more routes
FLOW_SAMPLES = 5   #change this to do more point samples for flow per route (more api requests)
MIN_DIST_M   = 1000 #minimum distance for a route to be, =1km currently since TomTom uses meters

key_index = 0

def get_key() -> str:
    global key_index
    API_KEY = API_KEYS[key_index]
    key_index += 1
    key_index %= len(API_KEYS)    
    return API_KEY


#make sure api works
def check_api_keys() -> bool:
    print("── API Diagnostics ─────────────────────────────────────────")
    origin, dest = (40.7484, -73.9967), (40.7614, -73.9776)
    coords = f"{origin[0]},{origin[1]}:{dest[0]},{dest[1]}"
    
    for API_KEY in API_KEYS:
        try:
            r = requests.get(f"{BASE_ROUTING}/{coords}/json", params={
                "key": API_KEY, "routeType": "shortest",
                "travelMode": "car", "traffic": "false",
            }, timeout=12)
            if r.status_code == 200:
                dist = r.json()["routes"][0]["summary"]["lengthInMeters"]
                print(f"  ✔ Routing API — OK (test route: {dist}m)")
            else:
                print(f"  ✗ Routing API — HTTP {r.status_code}: {r.text[:200]}")
                return False
        except Exception as e:
            print(f"  ✗ Routing API — Exception: {e}")
            return False

        try:
            r = requests.get(BASE_FLOW, params={
                "key": API_KEY, "point": "40.7484,-73.9967", "unit": "KMPH",
            }, timeout=10)
            if r.status_code == 200:
                d = r.json()["flowSegmentData"]
                print(f"  ✔ Flow API    — OK (speed: {d['currentSpeed']} km/h, "
                    f"free-flow: {d['freeFlowSpeed']} km/h)")
            else:
                print(f"  ✗ Flow API    — HTTP {r.status_code}: {r.text[:200]}")
                return False
        except Exception as e:
            print(f"  ✗ Flow API    — Exception: {e}")
            return False

        print()
    return True

with open(os.path.join("routing", "traffic.json"), 'r') as traffic_json:
    traffic = json.load(traffic_json)

def random_nyc_point() -> tuple:
    return (round(np.random.uniform(*NYC_LAT), 5),
            round(np.random.uniform(*NYC_LON), 5))

def get_route(origin: tuple, dest: tuple, mode: str) -> dict | None:
    """
    Fetch a route between two points.
    mode: "shortest" (optimise distance, no traffic)
          "fastest"  (optimise time, with live traffic)
    """
    coords = f"{origin[0]},{origin[1]}:{dest[0]},{dest[1]}"
    params = {
        "key":        get_key(),
        "travelMode": "car",
        "routeType":  "shortest" if mode == "shortest" else "fastest",
        "traffic":    "false"    if mode == "shortest" else "true",
    }
    try:
        r = requests.get(f"{BASE_ROUTING}/{coords}/json", params=params, timeout=12)
        if r.status_code != 200:
            print(f"    [{mode}] HTTP {r.status_code}: {r.text[:120]}")
            return None
        return r.json()["routes"][0]
    except Exception as e:
        print(f"    [{mode}] Exception: {e}")
        return None


def extract_geometry(route: dict) -> list[tuple]:
    """
    Pull the full ordered list of (lat, lon) points from a route.
    This is the complete path geometry — every coordinate TomTom returns,
    not just the sampled subset used for flow data.
    Used later to overlay the route on a transit map.
    """
    return [
        (p["latitude"], p["longitude"])
        for leg in route["legs"]
        for p in leg["points"]
    ]


def sample_route_points(route: dict, n: int) -> list[tuple]:
    pts = extract_geometry(route)
    if len(pts) < 2:
        return pts
    idx = np.linspace(0, len(pts) - 1, n, dtype=int)
    return [pts[i] for i in idx]


def get_flow_ratio(lat: float, lon: float) -> float | None:
    """currentSpeed / freeFlowSpeed — 1.0 = free flow, <1.0 = congested."""
    try:
        r = requests.get(BASE_FLOW, params={
            "key": get_key(), "point": f"{lat},{lon}", "unit": "KMPH",
        }, timeout=10)
        if r.status_code != 200:
            return None
        d = r.json()["flowSegmentData"]
        ff = d["freeFlowSpeed"]
        return d["currentSpeed"] / ff if ff > 0 else None
    except Exception:
        return None


#The actual comparison logic
def analyse_pair(origin: tuple, dest: tuple) -> dict | None:
    """
    For one origin→dest pair:
      1. Get shortest-by-distance route  (no traffic)
      2. Get fastest-by-traffic route    (with traffic)
      3. Extract full geometry of the shortest path
      4. Sample flow ratio along the shortest path
      5. Compute route agreement + correlation metric
    """
    short = get_route(origin, dest, "shortest")
    fast  = get_route(origin, dest, "fastest")
    if short is None or fast is None:
        return None

    short_dist  = short["summary"]["lengthInMeters"]
    short_time  = short["summary"]["travelTimeInSeconds"]
    fast_dist   = fast["summary"]["lengthInMeters"]
    fast_time   = fast["summary"]["travelTimeInSeconds"]

    if short_dist < MIN_DIST_M:
        return None

    # Full geometry of the shortest path — saved for transit overlay
    # Stored as a JSON string in the CSV so it survives serialization.
    # Load it back with: json.loads(df["short_path"][i])
    short_path  = extract_geometry(short)

    # distance_agreement: 1.0 = identical distance, <1.0 = fastest is longer
    # time_saved_s: how many seconds faster the traffic-optimal route is
    dist_agreement = short_dist / fast_dist if fast_dist > 0 else np.nan
    time_saved_s   = short_time - fast_time   # >0 means fastest is quicker

    # Sample flow along the shortest path
    pts         = sample_route_points(short, FLOW_SAMPLES)
    flow_ratios = []
    for lat, lon in pts:
        r = get_flow_ratio(lat, lon)
        if r is not None:
            flow_ratios.append(r)
        time.sleep(0.1)

    if len(flow_ratios) < 2:
        return None

    flow_arr  = np.array(flow_ratios)
    mean_flow = float(np.mean(flow_arr))
    flow_std  = float(np.std(flow_arr))

    # flow ratio vs. route agreement
    # High flow + high agreement -> shortest path *is* the best path
    # Low flow  + low agreement  -> traffic forcing a different route
    flow_agreement_corr = mean_flow * dist_agreement  # combined score

    return {
        "origin_lat":          origin[0],
        "origin_lon":          origin[1],
        "dest_lat":            dest[0],
        "dest_lon":            dest[1],
        # Shortest route
        "short_dist_m":        round(short_dist),
        "short_time_s":        round(short_time),
        # Fastest route
        "fast_dist_m":         round(fast_dist),
        "fast_time_s":         round(fast_time),
        # Agreement between routes
        "dist_agreement":      round(dist_agreement, 4),  # 1.0 = same distance
        "time_saved_s":        round(time_saved_s),        # seconds saved by fastest
        "routes_agree":        dist_agreement >= 0.95,     # essentially the same path
        # Flow along shortest path
        "mean_flow_ratio":     round(mean_flow, 4),        # 1.0 = free flow
        "flow_std":            round(flow_std, 4),
        "congestion_label":    (
            "free"     if mean_flow >= 0.85 else
            "moderate" if mean_flow >= 0.60 else
            "heavy"
        ),
        # Combined correlation score
        "flow_agreement_score": round(flow_agreement_corr, 4),
        # Full path geometry — list of (lat, lon) tuples for transit overlay
        # Serialized as JSON string for CSV compatibility
        "short_path":          json.dumps(short_path),
        "short_path_points":   len(short_path),  # quick reference without parsing
    }


#Main function, makes output
def main() -> pd.DataFrame:
    if len(API_KEYS) <= 0:
        raise ValueError("API key not set")

    if not check_api_keys():
        raise RuntimeError("API check failed")

    print(f"Analysing {NUM_ROUTES} random NYC route pairs\n")
    results = []

    for i in range(NUM_ROUTES):
        origin = random_nyc_point()
        dest   = random_nyc_point()
        print(f"[{i+1:>3}/{NUM_ROUTES}] {origin} → {dest}", end="  ")

        result = analyse_pair(origin, dest)
        if result:
            results.append(result)
            print(
                f"✔  flow={result['mean_flow_ratio']:.2f}  "
                f"agree={result['dist_agreement']:.2f}  "
                f"saved={result['time_saved_s']}s  "
                f"score={result['flow_agreement_score']:.3f}  "
                f"[{result['congestion_label']}]  "
                f"pts={result['short_path_points']}"
            )
        else:
            print("✗  skipped")

    if not results:
        raise RuntimeError("No valid route pairs collected. Check API key and quotas.")

    df = (pd.DataFrame(results)
            .sort_values("flow_agreement_score", ascending=False)
            .head(100)
            .reset_index(drop=True))
    df.index.name = "rank"

    print(f"\n{'='*60}")
    print(f"  Top {len(df)} route pairs by flow↔agreement score")
    print(f"{'='*60}")
    print(df[[
        "short_dist_m", "fast_dist_m", "dist_agreement",
        "time_saved_s", "mean_flow_ratio", "flow_agreement_score",
        "congestion_label", "short_path_points"
    ]].to_string())

    # Correlation
    r = np.corrcoef(df["mean_flow_ratio"], df["dist_agreement"])[0, 1]
    print(f"\n── Cross-pair stats ────────────────────────────────────────")
    print(f"  Pearson r (flow ratio vs. route agreement) : {r:.3f}")
    print(f"  Interpretation: {'higher flow → routes agree more' if r > 0 else 'higher flow → routes diverge'}")
    print(f"  Routes where shortest = fastest            : {df['routes_agree'].sum()} / {len(df)}")
    print(f"  Mean time saved by fastest route           : {df['time_saved_s'].mean():.0f}s")
    print(f"  Mean flow ratio                            : {df['mean_flow_ratio'].mean():.3f}")
    print(df["congestion_label"].value_counts().to_string())

    df.to_csv("top100_routes.csv", index=True)
    print(f"\n  Saved → top100_routes.csv")

    return df

if __name__ == "__main__":
    df = main()