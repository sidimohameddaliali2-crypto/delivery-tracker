"""Multi-driver delivery route solver, built on Google OR-Tools' VRP solver.

Invoked as a subprocess from server/services/routeOptimizationService.js —
never run directly by the app. Reads a single JSON payload from stdin,
writes a single JSON result to stdout, and uses stderr + a non-zero exit
code for failures so the Node caller can distinguish "no solution found"
from "the script crashed."

INPUT (stdin), all distances/durations already computed by
server/services/distanceMatrixService.js (Google Distance Matrix API):
{
  "depot_index": 0,
  "num_vehicles": 3,
  "duration_matrix": [[...], ...],   # seconds, NxN, index 0 = depot
  "stop_ids": ["deliveryId1", ...],  # length N-1; matrix index i+1 -> stop_ids[i]
  "vehicle_capacities": [20, 20, 20],       # optional: max stops per driver
  "time_windows": [[0, 86400], [start, end], ...],  # optional: seconds from
                                                        midnight, length N,
                                                        index 0 = depot window
  "max_route_duration_seconds": 28800       # optional: per-driver shift cap
}

OUTPUT (stdout):
{
  "success": true,
  "routes": { "0": ["deliveryId3", "deliveryId1"], "1": [], "2": ["deliveryId2"] },
  "total_duration_seconds": 12345
}
or on failure: { "success": false, "error": "..." }
"""

import sys
import json

from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

# Safety net so a pathological input can't hang the HTTP request that
# triggered this script indefinitely — mirrors the search_parameters time
# limit from Google's own examples.
SOLVER_TIME_LIMIT_SECONDS = 20
DEFAULT_MAX_ROUTE_DURATION_SECONDS = 8 * 60 * 60  # 8-hour shift


def solve(payload):
    depot_index = payload["depot_index"]
    num_vehicles = payload["num_vehicles"]
    duration_matrix = payload["duration_matrix"]
    stop_ids = payload["stop_ids"]
    num_locations = len(duration_matrix)

    if num_locations != len(stop_ids) + 1:
        raise ValueError(
            f"duration_matrix has {num_locations} locations but stop_ids has "
            f"{len(stop_ids)} entries — expected duration_matrix length to be "
            "stop_ids length + 1 (for the depot)."
        )

    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def duration_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        # OR-Tools' routing core works in integer arc costs — real-world
        # routing engines (OSRM, Google) return fractional seconds, so this
        # must be rounded, not passed through as-is (a raw float here trips
        # a low-level SWIG type error rather than a clean Python exception).
        return int(round(duration_matrix[from_node][to_node]))

    transit_callback_index = routing.RegisterTransitCallback(duration_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    max_route_duration = payload.get(
        "max_route_duration_seconds", DEFAULT_MAX_ROUTE_DURATION_SECONDS
    )
    routing.AddDimension(
        transit_callback_index,
        0,  # no slack
        max_route_duration,
        True,  # start cumul to zero
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")
    # Balance workload across drivers instead of just minimizing total time
    # (otherwise the solver can happily dump everything on one driver and
    # leave others empty, as long as total distance is lowest).
    time_dimension.SetGlobalSpanCostCoefficient(100)

    # Optional per-stop delivery windows (e.g. a customer's delivery_window).
    time_windows = payload.get("time_windows")
    if time_windows:
        if len(time_windows) != num_locations:
            raise ValueError(
                f"time_windows has {len(time_windows)} entries but there are "
                f"{num_locations} locations (depot + stops)."
            )
        for location_idx, (window_start, window_end) in enumerate(time_windows):
            index = manager.NodeToIndex(location_idx)
            time_dimension.CumulVar(index).SetRange(window_start, window_end)

    # Optional max-stops-per-driver cap.
    vehicle_capacities = payload.get("vehicle_capacities")
    if vehicle_capacities:
        if len(vehicle_capacities) != num_vehicles:
            raise ValueError(
                f"vehicle_capacities has {len(vehicle_capacities)} entries but "
                f"num_vehicles is {num_vehicles}."
            )

        def demand_callback(from_index):
            from_node = manager.IndexToNode(from_index)
            return 0 if from_node == depot_index else 1

        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # no slack
            vehicle_capacities,
            True,  # start cumul to zero
            "Capacity",
        )

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.FromSeconds(SOLVER_TIME_LIMIT_SECONDS)

    solution = routing.SolveWithParameters(search_parameters)
    if solution is None:
        return {"success": False, "error": "No feasible solution found for the given drivers/stops/constraints."}

    routes = {}
    total_duration = 0
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        ordered_stop_ids = []
        route_duration = 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != depot_index:
                ordered_stop_ids.append(stop_ids[node - 1])
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_duration += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)
        routes[str(vehicle_id)] = ordered_stop_ids
        total_duration += route_duration

    return {"success": True, "routes": routes, "total_duration_seconds": total_duration}


def main():
    # Read as bytes and decode with utf-8-sig so a UTF-8 BOM (which some
    # shells/pipelines prepend, e.g. PowerShell's `Get-Content | python`)
    # doesn't break json.loads — utf-8-sig strips a BOM if present and
    # behaves identically to plain utf-8 otherwise.
    raw = sys.stdin.buffer.read().decode("utf-8-sig")
    payload = json.loads(raw)
    result = solve(payload)
    print(json.dumps(result))
    if not result.get("success"):
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - top-level boundary, must not leak a traceback to stdout
        print(json.dumps({"success": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
