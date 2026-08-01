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

/** Vehículos de la edición con los pasajeros del viaje de ida o vuelta (a/desde Tandil). */
export async function getAssignments(editionId: string, direction: Direction): Promise<VehicleWithSeats[]> {
  const vehicles = await getVehicles(editionId);
  const ids = vehicles.map((v) => v.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("vehicle_seats")
    .select("player_id, role, vehicle_trips!inner(vehicle_id, direction, fixture_id), players(full_name, avatar_url)")
    .in("vehicle_trips.vehicle_id", ids)
    .eq("vehicle_trips.direction", direction)
    .is("vehicle_trips.fixture_id", null);
  if (error) throw error;

  const byVehicle = new Map<string, Seat[]>();
  for (const s of (data ?? []) as any[]) {
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

async function ensureTrip(vehicleId: string, direction: Direction): Promise<string> {
  const { data } = await supabase
    .from("vehicle_trips")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .eq("direction", direction)
    .is("fixture_id", null)
    .maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: created, error } = await supabase
    .from("vehicle_trips")
    .insert({ vehicle_id: vehicleId, direction, fixture_id: null })
    .select("id")
    .single();
  if (error) throw error;
  return (created as { id: string }).id;
}

async function removeFromDirection(editionId: string, direction: Direction, playerId: string): Promise<void> {
  const vehicles = await getVehicles(editionId);
  const ids = vehicles.map((v) => v.id);
  if (!ids.length) return;
  const { data: trips } = await supabase
    .from("vehicle_trips")
    .select("id")
    .in("vehicle_id", ids)
    .eq("direction", direction)
    .is("fixture_id", null);
  const tripIds = (trips ?? []).map((t: { id: string }) => t.id);
  if (tripIds.length) {
    await supabase.from("vehicle_seats").delete().in("trip_id", tripIds).eq("player_id", playerId);
  }
}

export async function joinVehicle(editionId: string, vehicleId: string, direction: Direction, playerId: string, asDriver = false): Promise<void> {
  await removeFromDirection(editionId, direction, playerId);
  const tripId = await ensureTrip(vehicleId, direction);
  const { error } = await supabase
    .from("vehicle_seats")
    .upsert({ trip_id: tripId, player_id: playerId, role: asDriver ? "driver" : "passenger" }, { onConflict: "trip_id,player_id" });
  if (error) throw error;
}

export async function leaveVehicle(editionId: string, direction: Direction, playerId: string): Promise<void> {
  await removeFromDirection(editionId, direction, playerId);
}
