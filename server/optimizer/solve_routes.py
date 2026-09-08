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
  "vehicle_capacities": [20, 100, 20],      # optional: max stops per driver
                                              (e.g. bike=20, van=100)
  "vehicle_max_route_durations": [28800, 28800, 43200],  # optional: per-driver
                                              shift length in seconds; takes
                                              precedence over the global
                                              max_route_duration_seconds
  "vehicle_service_seconds": [600, 300, 600],  # optional: seconds spent AT THE
                                              DOOR for each vehicle — a flat
                                              per-vehicle-type figure (e.g.
                                              bike=600, van=300), the same at
                                              every stop that vehicle visits
                                              (villa and apartment no longer
                                              differ). Length num_vehicles.
                                              Added into the time dimension so
                                              a shift cap accounts for dwell
                                              time, not just driving.
  "soft_deadlines": [null, 21600, 25200, ...],  # optional: each stop's
                                              scheduled delivery time as
                                              seconds from midnight, length N,
                                              index 0 (depot) = null. Turns on
                                              wall-clock VRPTW mode: arriving
                                              after a stop's time is penalised
                                              (soft — never dropped for being
                                              late), early arrival is free.
  "lateness_penalty_per_second": 3          # optional: cost per second late
                                              (default 3); higher = punctuality
                                              beats a shorter/more-balanced route
  "start_window_seconds": [3600, 7200]      # optional (time-window mode only):
                                              each vehicle leaves the depot
                                              within this wall-clock window. The
                                              solver starts as LATE as the
                                              deadlines allow (the upper bound
                                              is the usual departure), earlier
                                              only when a deadline needs it.
  "early_departure_penalty_per_second": 1   # optional: cost per second the
                                              start is pulled before the usual
                                              departure (default 1 — vs 3/s of
                                              lateness, so leaving early must
                                              save more lateness than it costs)
  "max_route_duration_seconds": 28800,      # optional: global shift cap,
                                              used when vehicle_max_route_
                                              durations isn't given
  "vehicle_hub_ready_seconds": [null, 21600, null]  # optional (time-window
                                              mode only): a dispatcher-
                                              designated "hub" vehicle's own
                                              deliveries must be fully done —
                                              including the modeled return-to-
                                              depot leg — by this wall-clock
                                              time (seconds from midnight).
                                              This is a hard cutoff on that
                                              vehicle's End cumul, not a
                                              preference; null entries (or
                                              omitting the field) leave a
                                              vehicle unconstrained. Length
                                              num_vehicles when present.
}

OUTPUT (stdout):
{
  "success": true,
  "routes": { "0": ["deliveryId3", "deliveryId1"], "1": [], "2": ["deliveryId2"] },
  "route_durations": { "0": 5400, "1": 0, "2": 1800 },  # seconds incl. service time
  "route_lateness_seconds": { "0": 0, "1": 0, "2": 600 },  # 0 unless soft_deadlines given
  "arrivals": { "deliveryId3": 21900, ... },  # predicted arrival, seconds from midnight
  "total_duration_seconds": 12345,
  "total_lateness_seconds": 600
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
# Cost (in the same seconds-equivalent units as arc costs) of leaving a stop
# out of the plan entirely. Must dwarf anything a single stop could save in
# driving time so the solver only drops stops when it genuinely has no room
# for them (capacity or shift cap), never just to shorten a route.
DROP_PENALTY = 1_000_000


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

    # Dwell time at the door is a flat per-VEHICLE figure now (bike vs van),
    # not per-address (villa vs apartment no longer differ) — so each vehicle
    # needs its own transit callback rather than one shared for all of them.
    # Folded into the arc leaving each non-depot location, so the Time
    # dimension — and therefore each driver's shift cap — reflects time
    # actually spent at stops, not just driving between them.
    vehicle_service_seconds = payload.get("vehicle_service_seconds") or [0] * num_vehicles
    if len(vehicle_service_seconds) != num_vehicles:
        raise ValueError(
            f"vehicle_service_seconds has {len(vehicle_service_seconds)} entries but "
            f"num_vehicles is {num_vehicles}."
        )

    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def make_duration_callback(service_seconds):
        # A fresh closure per vehicle — a loop variable captured directly
        # (rather than passed in as a default/factory argument like this)
        # would have every callback see the LAST vehicle's service time.
        def duration_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            dwell = 0 if from_node == depot_index else service_seconds
            # OR-Tools' routing core works in integer arc costs — real-world
            # routing engines (OSRM, Google) return fractional seconds, so
            # this must be rounded, not passed through as-is (a raw float
            # here trips a low-level SWIG type error, not a clean exception).
            return int(round(duration_matrix[from_node][to_node] + dwell))
        return duration_callback

    transit_callback_indices = []
    for vehicle_id in range(num_vehicles):
        cb_index = routing.RegisterTransitCallback(make_duration_callback(vehicle_service_seconds[vehicle_id]))
        transit_callback_indices.append(cb_index)
        routing.SetArcCostEvaluatorOfVehicle(cb_index, vehicle_id)

    # Per-driver shift length. Each vehicle gets its own cap (a bike on a
    # morning shift vs. a van on "flexible" full day); the dimension's
    # overall horizon just has to be at least the largest of them so the
    # per-vehicle bound is the one that actually binds.
    global_max = payload.get("max_route_duration_seconds", DEFAULT_MAX_ROUTE_DURATION_SECONDS)
    vehicle_max_route_durations = payload.get("vehicle_max_route_durations")
    if vehicle_max_route_durations:
        if len(vehicle_max_route_durations) != num_vehicles:
            raise ValueError(
                f"vehicle_max_route_durations has {len(vehicle_max_route_durations)} "
                f"entries but num_vehicles is {num_vehicles}."
            )
    else:
        vehicle_max_route_durations = [global_max] * num_vehicles

    # Soft per-stop deadlines: each stop's scheduled delivery time as seconds
    # from midnight (index 0 = depot = null; a null stop has no deadline).
    # When present we switch the Time dimension into wall-clock mode so the
    # penalties below mean what they say; when absent the dimension keeps its
    # original "seconds of work from a zero start" behaviour exactly.
    soft_deadlines = payload.get("soft_deadlines")
    lateness_penalty = int(payload.get("lateness_penalty_per_second", 3))
    time_window_mode = bool(soft_deadlines)
    if time_window_mode and len(soft_deadlines) != num_locations:
        raise ValueError(
            f"soft_deadlines has {len(soft_deadlines)} entries but there are "
            f"{num_locations} locations (depot + stops)."
        )

    if time_window_mode:
        # Wall-clock VRPTW: the start time floats, and because deadlines are
        # absolute (seconds from midnight) the solver anchors each vehicle's
        # whole timeline to the real clock to satisfy them. Slack (waiting)
        # is allowed; a big horizon covers a full day plus any waiting.
        WALL_CLOCK_HORIZON = 36 * 60 * 60
        routing.AddDimensionWithVehicleTransits(
            transit_callback_indices,
            WALL_CLOCK_HORIZON,  # slack: a driver may arrive early and wait
            WALL_CLOCK_HORIZON,
            False,  # start cumul is NOT fixed to zero — the clock floats
            "Time",
        )
        time_dimension = routing.GetDimensionOrDie("Time")
        # Shift length is now the span (finish − start), not the end cumul,
        # since the start no longer sits at zero.
        for vehicle_id, cap in enumerate(vehicle_max_route_durations):
            time_dimension.SetSpanUpperBoundForVehicle(int(cap), vehicle_id)
        # Penalise arriving after a stop's scheduled time, proportional to how
        # late (soft — never makes the stop infeasible, so "minimize lateness"
        # rather than "drop if late"). Early arrival is free (a breakfast
        # delivered ahead of time is fine).
        for location_idx, deadline in enumerate(soft_deadlines):
            if deadline is None:
                continue
            index = manager.NodeToIndex(location_idx)
            time_dimension.SetCumulVarSoftUpperBound(index, int(deadline), lateness_penalty)
        # Departure window: when given, every vehicle leaves the depot inside
        # it, and the finalizer settles the start as LATE as the deadlines
        # allow (its upper bound is the business's usual departure time) —
        # leaving earlier only when a deadline in the objective demands it.
        # Without a window, keep the original behaviour (start pulled tight
        # toward zero) so older callers see identical results.
        start_window = payload.get("start_window_seconds")
        early_departure_penalty = int(payload.get("early_departure_penalty_per_second", 1))
        if start_window:
            start_lo, start_hi = int(start_window[0]), int(start_window[1])
            for vehicle_id in range(num_vehicles):
                start_cumul = time_dimension.CumulVar(routing.Start(vehicle_id))
                start_cumul.SetRange(start_lo, start_hi)
                # "Leave early only when it's worth it" has to live in the
                # objective, not just a finalizer: with soft bounds present
                # OR-Tools sets cumuls through its LP optimizer, which ignores
                # finalizer preferences (verified — starts sat at the lower
                # bound regardless). Charging each second before the usual
                # departure (default 1/s) against 3/s of lateness means the
                # solver pulls the start earlier exactly when doing so saves
                # more lateness than it costs, and otherwise leaves at the
                # usual time.
                time_dimension.SetCumulVarSoftLowerBound(routing.Start(vehicle_id), start_hi, early_departure_penalty)
        # Dispatcher-designated hub van (owner, 2026-09-06): once this vehicle
        # must be free for hub duty, it takes zero more of its OWN deliveries.
        # Modeled as a hard cap on its End cumul — the arc-costed "return to
        # depot" leg the model already includes for every vehicle, so the cap
        # is conservative (the real van finishes its last own stop with some
        # margin to spare, since it never actually drives that leg for real).
        vehicle_hub_ready_seconds = payload.get("vehicle_hub_ready_seconds")
        if vehicle_hub_ready_seconds:
            if len(vehicle_hub_ready_seconds) != num_vehicles:
                raise ValueError(
                    f"vehicle_hub_ready_seconds has {len(vehicle_hub_ready_seconds)} "
                    f"entries but num_vehicles is {num_vehicles}."
                )
            for vehicle_id, ready in enumerate(vehicle_hub_ready_seconds):
                if ready is not None:
                    time_dimension.CumulVar(routing.End(vehicle_id)).SetMax(int(ready))
        for vehicle_id in range(num_vehicles):
            if start_window:
                routing.AddVariableMaximizedByFinalizer(time_dimension.CumulVar(routing.Start(vehicle_id)))
            else:
                routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.Start(vehicle_id)))
            routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.End(vehicle_id)))
    else:
        routing.AddDimensionWithVehicleTransits(
            transit_callback_indices,
            0,  # no slack
            int(max(vehicle_max_route_durations)),
            True,  # start cumul to zero
            "Time",
        )
        time_dimension = routing.GetDimensionOrDie("Time")
        for vehicle_id, cap in enumerate(vehicle_max_route_durations):
            time_dimension.CumulVar(routing.End(vehicle_id)).SetMax(int(cap))

    # Balance workload across drivers instead of just minimizing total time
    # (otherwise the solver can happily dump everything on one driver and
    # leave others empty, as long as total distance is lowest).
    time_dimension.SetGlobalSpanCostCoefficient(100)

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

    # Let the solver DROP a stop (at DROP_PENALTY) rather than declare the
    # whole problem infeasible when demand exceeds what the selected drivers
    # can cover — e.g. 267 stops selected but only 9 bikes at 20 stops each.
    # Dropped stops come back as "unassigned" so the dispatcher can add
    # drivers or split the batch, instead of a blanket "no feasible
    # solution" with no hint as to why.
    for node in range(1, num_locations):
        routing.AddDisjunction([manager.NodeToIndex(node)], DROP_PENALTY)

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
    route_durations = {}
    # Per-route lateness (only meaningful in time-window mode; 0 otherwise).
    # arrivals maps stopId -> predicted arrival (seconds from midnight), so
    # the caller can show a per-stop ETA and flag which stops run late.
    route_lateness = {}
    arrivals = {}
    total_duration = 0
    total_lateness = 0
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        ordered_stop_ids = []
        route_duration = 0
        route_late = 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != depot_index:
                stop_id = stop_ids[node - 1]
                ordered_stop_ids.append(stop_id)
                if time_window_mode:
                    arrival = solution.Value(time_dimension.CumulVar(index))
                    arrivals[stop_id] = arrival
                    deadline = soft_deadlines[node]
                    if deadline is not None and arrival > deadline:
                        route_late += arrival - deadline
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_duration += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)
        routes[str(vehicle_id)] = ordered_stop_ids
        route_durations[str(vehicle_id)] = route_duration
        route_lateness[str(vehicle_id)] = route_late
        total_duration += route_duration
        total_lateness += route_late

    # A dropped node's NextVar points back at itself — the standard OR-Tools
    # idiom for "this stop was left out via its disjunction."
    unassigned_stop_ids = []
    for node in range(1, num_locations):
        index = manager.NodeToIndex(node)
        if solution.Value(routing.NextVar(index)) == index:
            unassigned_stop_ids.append(stop_ids[node - 1])

    return {
        "success": True,
        "routes": routes,
        "route_durations": route_durations,
        "route_lateness_seconds": route_lateness,
        "arrivals": arrivals,
        "unassigned": unassigned_stop_ids,
        "total_duration_seconds": total_duration,
        "total_lateness_seconds": total_lateness,
    }


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
