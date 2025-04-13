const axios = require('axios');
const crypto = require('crypto');
const validTokens = new Map();

// Function to generate a secure map proxy URL
const getMapProxyUrl = (req, res) => {
    const { latitude, longitude } = req.params;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid coordinates' });
    }
    const token = crypto.randomBytes(20).toString('hex');

    validTokens.set(token, {
        lat,
        lng,
        expires: Date.now() + 5 * 60 * 1000 // 5-minute token for better UX
    });


    const host = req.headers.host;
    const protocol = req.protocol;
    const mapUrl = `${protocol}://${host}/api/proxy/map?token=${token}`;
    res.json({ mapUrl });
};

const serveMapProxy = async (req, res) => {
    const { token } = req.query;
    const tokenData = validTokens.get(token);
    
    if (!tokenData || tokenData.expires < Date.now()) {
        validTokens.delete(token);
        return res.status(401).send('Invalid or expired token');
    }

    const { lat, lng } = tokenData;
    
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
        console.error('Google Maps API key not found in environment variables');
        return res.status(500).send('Server configuration error: Missing API key');
    }

    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        
    
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Location Map</title>
                <meta name="viewport" content="initial-scale=1.0, user-scalable=no">
                <style>
                    html, body {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                    }
                    #map {
                        height: 100%;
                        width: 100%;
                        border-radius: 8px;
                        overflow: hidden;
                    }
                    .loading {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        background-color: #f8f9fa;
                        z-index: 10;
                    }
                </style>
                <script>
                   function loadGoogleMaps() {
    function initMap() {
        document.getElementById('loading').style.display = 'none';
        
        const location = { lat: ${lat}, lng: ${lng} };
        const map = new google.maps.Map(document.getElementById("map"), {
            center: location,
            zoom: 14,
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            mapTypeControl: true,
            fullscreenControl: true,
            streetViewControl: false
        });

        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
            new google.maps.marker.AdvancedMarkerElement({
                map: map,
                position: location,
                title: "Station Location"
            });
        } else {
            new google.maps.Marker({
                position: location,
                map: map,
                title: "Station Location",
                animation: google.maps.Animation.DROP
            });
        }

        new google.maps.Circle({
            strokeColor: "#3388ff",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: "#3388ff",
            fillOpacity: 0.1,
            map,
            center: location,
            radius: 2000,
        });
    }

    const script = document.createElement('script');
    script.src = "https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&loading=async";
    script.async = true;
    script.defer = true;

    if (document.head) {
        document.head.appendChild(script);
        window.initMap = initMap;
    } else {
        console.error("document.head is null. Google Maps script not appended.");
    }
}


                    // Wait for the DOM to be fully loaded
                    document.addEventListener('DOMContentLoaded', loadGoogleMaps);
                </script>
            </head>
            <body>
                <div id="map"></div>
                <div id="loading" class="loading">Loading map...</div>
            </body>
            </html>
        `;
        

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    
        setTimeout(() => {
            validTokens.delete(token);
        }, 10000);
        
    } catch (error) {
        console.error('Error serving map:', error.message);
        res.status(500).send('Error serving map data.');
    }
};

module.exports = { getMapProxyUrl, serveMapProxy };