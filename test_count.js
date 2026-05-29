const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(new Error(`Failed to parse JSON`));
                }
            });
        }).on('error', reject);
    });
}

async function test() {
    for (let layer of [2, 3, 4]) {
        const url = `https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/BATAS_WILAYAH/MapServer/${layer}/query?where=1%3D1&returnCountOnly=true&f=pjson`;
        try {
            const res = await fetchUrl(url);
            console.log(`Layer ${layer} Count:`, res.count);
        } catch(e) {
            console.error(`Layer ${layer} error:`, e.message);
        }
    }
}

test();
