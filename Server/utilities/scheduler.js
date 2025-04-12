const cron = require('node-cron');
const cheerio = require('cheerio');
const { MongoClient } = require('mongodb');
const StationCoordinates = require('../models/StationCoordinates');
const logger = require('./logger');

const uri = 'mongodb://localhost:27017';
const dbName = 'waterways';
const collectionName = 'stationdatas';


// Ensure indexes are created
async function ensureIndexes(client) {
    const database = client.db(dbName);
    const collection = database.collection(collectionName);
    await collection.createIndex({ station_id: 1, date_time: 1 }, { unique: true });
}

// Call this function once when setting up your database
async function setupDatabase() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        await ensureIndexes(client);
        console.log('Indexes ensured.');
    } catch (error) {
        console.error('Error setting up database:', error);
    } finally {
        await client.close();
    }
}

setupDatabase();

async function insertData(client, dataArray) {
    if (dataArray.length === 0) return;
    const database = client.db(dbName);
    const collection = database.collection(collectionName);
    const chunkSize = 1500; // Adjust the chunk size as needed

    for (let i = 0; i < dataArray.length; i += chunkSize) {
        const chunk = dataArray.slice(i, i + chunkSize);
        const bulkOps = chunk.map(data => ({
            updateOne: {
                filter: { station_id: data.station_id, date_time: data.date_time },
                update: { $setOnInsert: data },
                upsert: true
            }
        }));

        if (bulkOps.length > 0) {
            console.log(`Starting bulk insert/update for ${bulkOps.length} entries.`);
            await collection.bulkWrite(bulkOps);
            console.log(`Bulk insert/update completed for ${bulkOps.length} entries.`);
        } else {
            console.log(`No new entries to insert/update for this chunk.`);
        }
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchData(stationId) {
    // Get current date for endDate
    const endDate = new Date();
    
    // Get date 24 hours ago for startDate
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    
    // Format dates as YYYY-MM-DD
    const formattedEndDate = endDate.toISOString().split('T')[0];
    const formattedStartDate = startDate.toISOString().split('T')[0];
    
    const url = `https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${stationId}&mode=Table&startDate=${formattedStartDate}&endDate=${formattedEndDate}`;
    
    // Rest of the function remains unchanged
    const response = await fetch(url, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive',
            'Cookie': 'PHPSESSID=a594f5b05015291d18eb70adc1aa2f78; _ga=GA1.1.375988285.1742743699; _ga_CS8ZLP6TEM=GS1.1.1742743699.1.0.1742743840.0.0.0; disclaimer=agree',
            'Referer': url,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
            'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Microsoft Edge";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log(`Fetched HTML for station ${stationId}:`, html.substring(0, 500)); // Log the first 500 characters of the HTML

    const data = [];
    $('table').each((index, table) => {
        const caption = $(table).find('caption').text().trim();
        if (caption === 'This table provides real-time data in tabular format.') {
            let firstItemLogged = false; 
            $(table).find('tbody tr').each((index, element) => {
                const date_time = $(element).find('td').eq(0).text().trim();
                const water_level = $(element).find('td').eq(1).attr('data-order') || $(element).find('td').eq(1).text().trim();
                const discharge = $(element).find('td').eq(5).attr('data-order') || $(element).find('td').eq(5).text().trim();

                // Ensure that the extracted data is valid
                if (date_time && water_level) {
          // Only log the first extracted data point
          if (!firstItemLogged) {
            console.log(`Extracted data for station ${stationId} (first example):`, { date_time, water_level, discharge });
            firstItemLogged = true;
        }
                    data.push({ date_time, water_level, discharge, station_id: stationId });
                }
            });
        }
    });

    console.log(`Total data extracted for station ${stationId}:`, data.length);
    return data;
}

async function runScraper() {
    const { default: pLimit } = await import('p-limit');
    const client = new MongoClient(uri);

    const startTime = Date.now(); // Record start time
    logger.info('Starting scraper run');

    try {
        await client.connect();
        const stations = await StationCoordinates.find({});
        const stationIds = stations.map(station => station.station_id);

        const limit = pLimit(50);
        await Promise.all(stationIds.map((stationId, index) => 
            limit(async () => {
                await delay(index * 100); // Stagger requests
                try {
                    const data = await fetchData(stationId);
                    console.log(`Scraper ran successfully for station ${stationId}. Example entry:`, 
                        data.length > 0 ? data[0] : 'No data found');
                    await insertData(client, data);
                } catch (error) {
                    console.error(`Error running scraper for station ${stationId}:`, error);
                }
            })
        ));
    } catch (error) {
        console.error('Error fetching station coordinates:', error);
    } finally {
        await client.close();
        const endTime = Date.now(); // Record end time
        const duration = (endTime - startTime) / 1000;
        console.log(`Scraper run completed in ${duration} seconds.`);
        logger.info(`Scraper run completed in ${duration} seconds.`);
    }
}

runScraper().then(() => logger.info('Initial run of the scraper completed.'));

cron.schedule('0 */6 * * *', async () => {
    await runScraper();
    console.log('Scheduled run of the scraper completed.');
}); 

console.log('Scheduler is set up to run every 6 hours.');
logger.info('Scheduler is set up to run every 6 hours.');
