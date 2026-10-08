import "leaflet/dist/leaflet.css";
import { Circle, MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";

import { Locality } from "../lib/types";

export default function LocalityMap({ locality }: { locality: Locality }) {
  if (locality.lat == null || locality.lng == null) {
    return <p className="text-xs text-slate-400">No coordinates for this business, so the map is hidden. Add latitude and longitude to see nearby places.</p>;
  }
  const center: [number, number] = [locality.lat, locality.lng];
  return (
    <MapContainer center={center} zoom={14} style={{ height: 220 }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={center}><Tooltip>Business</Tooltip></Marker>
      <Circle center={center} radius={locality.signals.length ? 1500 : 500} pathOptions={{ color: "#ea580c", fillOpacity: 0.08 }} />
    </MapContainer>
  );
}
