// parser.js
export function parseNominatimResponse(data) {
    if (!data || !data.address) {
        return { success: false, error: "Data tidak ditemukan." };
    }

    const addr = data.address;
    
    // Extractor logic based on typical OSM tags in Indonesia
    const negara = addr.country || "Indonesia";
    const provinsi = addr.state || addr.province || "-";
    
    // City or Regency
    const kabKota = addr.city || addr.town || addr.county || addr.municipality || "-";
    
    // Kecamatan
    // In OSM Indonesia, sub-district is often tagged as suburb, city_district, or county
    const kecamatan = addr.suburb || addr.city_district || addr.district || "-";
    
    // Kelurahan / Desa
    const kelurahan = addr.village || addr.neighbourhood || addr.hamlet || addr.quarter || "-";
    
    const kodePos = addr.postcode || "-";

    return {
        success: true,
        administrative: {
            negara,
            provinsi,
            kabKota,
            kecamatan,
            kelurahan,
            kodePos
        },
        displayName: data.display_name
    };
}
