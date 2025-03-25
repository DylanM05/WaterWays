const puppeteer = require('puppeteer');

exports.scrapeData = async (req, res) => {
    const { stationId } = req.body;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const currentDate = new Date();
    const startDate = new Date(currentDate);
    startDate.setDate(currentDate.getDate() - 1);

    const formatDate = (date) => date.toISOString().split('T')[0];

    const url = `https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${stationId}&mode=Table&startDate=${formatDate(startDate)}&endDate=${formatDate(currentDate)}&prm1=46&y1Max=&y1Min=&prm2=47&y2Max=&y2Min=`;

    await page.goto(url, { waitUntil: 'networkidle2' });

    const disclaimerButton = await page.$('input[name="disclaimer_action"][value="I Agree"]');
    if (disclaimerButton) {
        await disclaimerButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }

    try {
        const noDataMessage = await page.evaluate(() => {
            return document.evaluate("//p[contains(text(), 'No data available for the selected time period.')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        });
        if (noDataMessage) {
            await page.click('#apply');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

        await page.select('select[name="wb-auto-4_length"]', '1000');
        await page.waitForSelector('tbody', { timeout: 20000 });

        const data = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody tr');
            let result = [];
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 6) {
                    const date_time = cols[0].innerText.trim();
                    const water_level = cols[1].getAttribute('data-order') || cols[1].innerText.trim();
                    const discharge = cols[5].getAttribute('data-order') || cols[5].innerText.trim();
                    result.push({ date_time, water_level, discharge });
                }
            });
            return result;
        });

        data.forEach(entry => entry.station_id = stationId);

        await browser.close();

        res.json(data);
    } catch (error) {
        await browser.close();
        res.status(500).json({ error: `Error scraping Station ${stationId}: ${error}` });
    }
};