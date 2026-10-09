import "leaflet/dist/leaflet.css";
import { Circle, MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";

import { Locality } from "../lib/types";

const BRAND = "#ea580c";

export default function LocalityMap({ locality, businessName }: { locality: Locality; businessName?: string | null }) {
  if (locality.lat == null || locality.lng == null) {
    return <p className="text-sm text-slate-600">Add a location on the business and this map will show colleges, offices, and transit nearby, which is what the copy can mention.</p>;
  }
  const center: [number, number] = [locality.lat, locality.lng];
  return (
    <MapContainer center={center} zoom={14} style={{ height: 220 }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={center}><Tooltip>{businessName || "Business"}</Tooltip></Marker>
      <Circle center={center} radius={locality.signals.length ? 1500 : 500} pathOptions={{ color: BRAND, fillOpacity: 0.08 }} />
    </MapContainer>
  );
}
