import { supabase } from "./supabase";

export interface Sponsor {
  id: string;
  edition_id: string | null;
  name: string;
  logo_url: string | null;
  website: string | null;
  tier: string | null;
  sort: number;
}

export const TIERS = [
  { key: "principal", label: "Principal" },
  { key: "oficial", label: "Oficial" },
  { key: "colaborador", label: "Colaborador" },
];

export async function getSponsors(editionId: string): Promise<Sponsor[]> {
  const { data, error } = await supabase
    .from("sponsors")
    .select("*")
    .eq("edition_id", editionId)
    .order("sort")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Sponsor[];
}

export async function addSponsor(editionId: string, input: { name: string; logoUrl: string | null; website: string | null; tier: string }): Promise<void> {
  const { error } = await supabase.from("sponsors").insert({
    edition_id: editionId, name: input.name.trim(),
    logo_url: input.logoUrl?.trim() || null, website: input.website?.trim() || null, tier: input.tier,
  });
  if (error) throw error;
}

export async function deleteSponsor(id: string): Promise<void> {
  const { error } = await supabase.from("sponsors").delete().eq("id", id);
  if (error) throw error;
}
