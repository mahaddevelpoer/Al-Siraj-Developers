import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function LeafletMap({
  onLocationSelect,
  initialLat = 31.5204,
  initialLng = 74.3587,
  searchEnabled = true,
  readOnly = false,
  markerLabel = null,
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState({
    lat: initialLat,
    lng: initialLng,
    address: '',
  });

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = L.map(mapContainer.current).setView([initialLat, initialLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      minZoom: 2,
    }).addTo(map.current);

    marker.current = L.marker([initialLat, initialLng])
      .addTo(map.current)
      .bindPopup(markerLabel || 'Location');

    if (!readOnly) {
      map.current.on('click', (e) => {
        const { lat, lng } = e.latlng;
        updateMarker(lat, lng);
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initialLat, initialLng, readOnly, markerLabel]);

  const updateMarker = (lat, lng) => {
    if (marker.current) {
      marker.current.setLatLng([lat, lng]);
    } else {
      marker.current = L.marker([lat, lng])
        .addTo(map.current)
        .bindPopup(markerLabel || 'Location');
    }

    if (map.current) {
      map.current.panTo([lat, lng]);
    }

    setSelectedLocation({ lat, lng });
    reverseGeocode(lat, lng);

    if (onLocationSelect) {
      onLocationSelect({ lat, lng });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery + ' Pakistan')}&limit=5`
      );
      const results = await response.json();
      if (results.length > 0) {
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      setSelectedLocation(prev => ({ ...prev, address: data.address?.county || data.address?.city || 'Unknown' }));
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
  };

  const selectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    updateMarker(lat, lng);
    setSearchResults([]);
    setSearchQuery('');
    if (map.current) map.current.flyTo([lat, lng], 15);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {searchEnabled && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search location... (e.g. Lahore, Karachi)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              padding: '10px 16px',
              background: 'var(--accent-blue)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Search
          </button>
        </div>
      )}

      {searchResults.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 1000,
            background: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            maxHeight: 200,
            overflowY: 'auto',
            width: 'calc(100% - 24px)',
            marginLeft: 12,
            marginTop: 48,
          }}
        >
          {searchResults.map((result, idx) => (
            <div
              key={idx}
              onClick={() => selectSearchResult(result)}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                fontSize: 12,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.target.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.target.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 600 }}>{result.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {result.type}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: 400,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          background: '#f0f0f0',
        }}
      />

      <div
        style={{
          padding: 12,
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          fontSize: 12,
        }}
      >
        <div><strong>Latitude:</strong> {selectedLocation.lat.toFixed(4)}</div>
        <div><strong>Longitude:</strong> {selectedLocation.lng.toFixed(4)}</div>
        {selectedLocation.address && (
          <div><strong>Location:</strong> {selectedLocation.address}</div>
        )}
        {!readOnly && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Click on map to place marker or search above
          </div>
        )}
      </div>
    </div>
  );
}
