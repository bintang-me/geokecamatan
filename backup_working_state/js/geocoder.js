// geocoder.js
import { parseNominatimResponse } from './parser.js';

export async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                // Nominatim requires a user agent
                'User-Agent': 'GeoKecamatan-App/1.0 (local-dev)'
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
             return { success: false, error: "Lokasi tidak ditemukan." };
        }

        return parseNominatimResponse(data);
        
    } catch (error) {
        console.error("Geocoding failed:", error);
        return { success: false, error: "Gagal terhubung ke layanan geocoding." };
    }
}
