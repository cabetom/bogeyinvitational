import { supabase } from "./supabase";

export type Direction = "ida" | "vuelta";

export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  capacity: number;
}
export interface Seat {
  player_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string; // 'driver' | 'passenger'
}
export interface VehicleWithSeats extends Vehicle {
  seats: Seat[];
}

export async function getVehicles(editionId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, name, plate, capacity")
    .eq("edition_id", editionId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export async function addVehicle(editionId: string, name: string, plate: string | null, capacity: number): Promise<void> {
  const { error } = await supabase
    .from("vehicles")
    .insert({ edition_id: editionId, name: name.trim(), plate: plate || null, capacity });
  if (error) throw error;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) throw error;
}

/** Devuelve los vehículos de la edición con los pasajeros asignados para ese día/dirección. */
export async function getAssignments(
  editionId: string,
  fixtureId: string,
  direction: Direction
): Promise<VehicleWithSeats[]> {
  const [vehicles, seats] = await Promise.all([
    getVehicles(editionId),
    supabase
      .from("vehicle_seats")
      .select("player_id, role, vehicle_trips!inner(vehicle_id, fixture_id, direction), players(full_name, avatar_url)")
      .eq("vehicle_trips.fixture_id", fixtureId)
      .eq("vehicle_trips.direction", direction),
  ]);
  if (seats.error) throw seats.error;

  const byVehicle = new Map<string, Seat[]>();
  for (const s of (seats.data ?? []) as any[]) {
    const vid = s.vehicle_trips.vehicle_id as string;
    if (!byVehicle.has(vid)) byVehicle.set(vid, []);
    byVehicle.get(vid)!.push({
      player_id: s.player_id,
      full_name: s.players?.full_name ?? "?",
      avatar_url: s.players?.avatar_url ?? null,
      role: s.role,
    });
  }
  return vehicles.map((v) => ({ ...v, seats: byVehicle.get(v.id) ?? [] }));
}

async function ensureTrip(vehicleId: string, fixtureId: string, direction: Direction): Promise<string> {
  const { data } = await supabase
    .from("vehicle_trips")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .eq("fixture_id", fixtureId)
    .eq("direction", direction)
    .maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: created, error } = await supabase
    .from("vehicle_trips")
    .insert({ vehicle_id: vehicleId, fixture_id: fixtureId, direction })
    .select("id")
    .single();
  if (error) throw error;
  return (created as { id: string }).id;
}

/** Saca al jugador de cualquier camioneta de ese día/dirección (para que esté en una sola). */
async function removePlayerFromTripDay(fixtureId: string, direction: Direction, playerId: string): Promise<void> {
  const { data: trips } = await supabase
    .from("vehicle_trips")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("direction", direction);
  const ids = (trips ?? []).map((t: { id: string }) => t.id);
  if (ids.length) {
    await supabase.from("vehicle_seats").delete().in("trip_id", ids).eq("player_id", playerId);
  }
}

export async function joinVehicle(
  vehicleId: string,
  fixtureId: string,
  direction: Direction,
  playerId: string,
  asDriver = false
): Promise<void> {
  await removePlayerFromTripDay(fixtureId, direction, playerId);
  const tripId = await ensureTrip(vehicleId, fixtureId, direction);
  const { error } = await supabase
    .from("vehicle_seats")
    .upsert({ trip_id: tripId, player_id: playerId, role: asDriver ? "driver" : "passenger" }, { onConflict: "trip_id,player_id" });
  if (error) throw error;
}

export async function leaveVehicle(fixtureId: string, direction: Direction, playerId: string): Promise<void> {
  await removePlayerFromTripDay(fixtureId, direction, playerId);
}
