const axios = require('axios');
const crypto = require('crypto');
const validTokens = new Map();

// Updated Route Name
const getMapProxyUrl = (req, res) => {
    const { latitude, longitude } = req.params;
    const port = process.env.PORT || 3000;

    const token = crypto.randomBytes(16).toString('hex');
    validTokens.set(token, {
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
        expires: Date.now() + 2 * 60 * 1000 // 2-minute token
    });

    const mapUrl = `https://backend.dylansserver.top/api/proxy/map?token=${token}`;
    res.json({ mapUrl });
};


const serveMapProxy = async (req, res) => {
    const { token } = req.query;
    const tokenData = validTokens.get(token);
    if (!tokenData || tokenData.expires < Date.now()) {
        return res.status(401).send('Invalid or expired token');
    }

    // Fetch map JS from Google, proxying the API key
    const { lat, lng } = tokenData;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    try {
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/staticmap`,
            {
                params: {
                    center: `${lat},${lng}`,
                    zoom: 15,
                    size: '400x400',
                    key: apiKey,
                    markers: `${lat},${lng}`
                },
                responseType: 'arraybuffer', // Binary data
            }
        );
        res.set('Content-Type', 'image/png');
        res.send(response.data);

        // Cleanup token after serving
        validTokens.delete(token);
    } catch (error) {
        console.error('Error fetching map:', error.message);
        res.status(500).send('Error fetching map data.');
    }
};

module.exports = { getMapProxyUrl, serveMapProxy };
