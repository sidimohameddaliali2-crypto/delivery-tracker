# Self-hosting OSRM for route optimization

`server/services/distanceMatrixService.js` calls an OSRM server's Table
Service to get real driving distances/times between the depot and delivery
stops. By default it points at OSRM's **public demo server**
(`https://router.project-osrm.org`) — that's fine for testing this feature,
but it's informally rate-limited, has no uptime guarantee, and is explicitly
not meant for production traffic. Before relying on this for real dispatch,
self-host your own OSRM instance.

## 1. Download a map extract for your delivery area

```bash
wget http://download.geofabrik.de/asia/united-arab-emirates-latest.osm.pbf
```

(Swap the URL for whatever region actually covers your delivery area —
browse https://download.geofabrik.de/ for other countries/regions.)

## 2. Pre-process it (one-time, or whenever you refresh the map data)

```bash
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/united-arab-emirates-latest.osm.pbf

docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/united-arab-emirates-latest.osrm

docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/united-arab-emirates-latest.osrm
```

## 3. Run the routing server

Use a port that doesn't collide with this app's own Node server (which
already uses 5000 — see `server/.env`'s `PORT`). `--max-table-size` should
be set generously so a full day's stops across all drivers never gets
rejected as "too many locations":

```bash
docker run -d --restart unless-stopped -p 5001:5000 -v "${PWD}:/data" \
  ghcr.io/project-osrm/osrm-backend \
  osrm-routed --algorithm mld --max-table-size 1000 \
  /data/united-arab-emirates-latest.osrm
```

## 4. Point this app at it

In `server/.env`:
```
OSRM_BASE_URL=http://localhost:5001
```

(Or the server's actual address/port if OSRM runs on a different host.)

## 5. Verify

```bash
curl "http://localhost:5001/table/v1/driving/55.2244,25.1257;55.27,25.20?annotations=duration,distance"
```

Should return `{"code":"Ok", "durations": [[...]], "distances": [[...]]}`.
