# megahackathon26

Our project for MEGA Hackathon 2026

## Local setup

This is a static frontend that displays a TomTom map with live traffic data over New York City. The API key is loaded from the `.env` file, which must reside in the same directory as `index.html`.

1. Create a `.env` file with the following line (replace the value with your actual key):

   ```dotenv
   TOMTOM_API_KEY=your_real_key_here
   ```

2. Serve the files over HTTP (the browser will not allow `fetch('.env')` from a `file://` URL). A quick way is using Python's simple server:

   ```sh
   cd /path/to/megahackathon26
   python3 -m http.server 8000
   ```

3. Open `http://localhost:8000` in your browser and the map should appear. The routing/traffic analysis script (`main.py`) also uses the same API key and can be run independently.

4. To highlight the busiest roads on the page, run the Python script once:

   ```sh
   python3 main.py
   ```

   It will print diagnostics, save `top100_routes.csv` and also create `busy_roads.json` containing sampled coordinates for the top routes. The frontend (if the JSON file is present next to `index.html`) will fetch this file and draw those routes on the map.
   Instead of using the stored geometry, the client now requests actual street-aligned paths from the **OSRM public routing service** based on the origin/destination coordinates. This avoids the need for a TomTom routing API key and ensures the lines follow real streets.

## Troubleshooting

- **Map stays black**: open the browser devtools console. You should see messages such as "Loading API key…" or errors about missing/invalid key. The overlay in the map area will display any status text as well.
- **.env not served**: some static servers (including Python's `http.server`) may hide dotfiles. If the overlay says the key is missing, either serve the file manually or append `?key=YOUR_KEY` to the URL, e.g. `http://localhost:8000/?key=XLQo2TtzklMGi5tST0tITQ8KHu1yFcGt`.
- **API rate limits or bad key**: the console will log HTTP errors from TomTom; use a valid key with sufficient quota.
- **Busy road lines not appearing**: make sure `busy_roads.json` exists in the same directory and contains `route_points`. Run `python3 main.py` again if necessary.

Remember, the app must be accessed over HTTP – `file://` will block the `.env` fetch and the overlay will notify you of that. Hosting via `python -m http.server` is the simplest way.
