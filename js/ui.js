// ui.js
export function showLoading() {
    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');
}

export function showError(message) {
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    
    const errorState = document.getElementById('errorState');
    errorState.classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
}

export function showResult(data) {
    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
    
    const resultContent = document.getElementById('resultContent');
    resultContent.classList.remove('hidden');
    
    const admin = data.administrative;
    
    document.getElementById('resProvinsi').textContent = admin.provinsi;
    document.getElementById('resKabKota').textContent = admin.kabKota;
    document.getElementById('resKecamatan').textContent = admin.kecamatan;
    document.getElementById('resKelurahan').textContent = admin.kelurahan;
    document.getElementById('resKodePos').textContent = admin.kodePos;

    // Set confidence simple logic
    const badge = document.getElementById('confidenceBadge');
    if (admin.kecamatan !== '-') {
        badge.textContent = "Akurasi: Tinggi (Kecamatan Ditemukan)";
        badge.style.color = "var(--color-accent-2)";
        badge.style.background = "rgba(16, 185, 129, 0.2)";
    } else {
        badge.textContent = "Akurasi: Rendah (Kecamatan Tidak Diketahui)";
        badge.style.color = "var(--color-warning)";
        badge.style.background = "rgba(245, 158, 11, 0.2)";
    }
}

export function setInputValue(lat, lon) {
    document.getElementById('coordInput').value = `${lat}, ${lon}`;
}
