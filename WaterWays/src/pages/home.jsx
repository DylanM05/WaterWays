import React from 'react';
import './styling/home.css'; 


const Home = () => {
  return (
    <div className="mx-auto">
      <h1 className="text-center">WaterWays</h1>
      
      {/* <div className="p-4 border border-primary shadow-sm mobile-only-instructions">
      <p>⚠️ If installed before April 25th, please re-add WaterWays to your home screen for improved functionality.</p>
      </div>
    <div className="p-4 border border-primary shadow-sm">
     <p>While subscriptions are active, we will be making a large amount of changes. So in order to not lose any data, feel free to reach out to me and I will give you premium for free for the time being. dylan.mcmullen@live.com</p>
    </div> */}

      <section className="mobile-only-instructions">
        <h2 className="mb-4 pb-2"></h2>
        <div>
        <p>Follow these steps to add WaterWays to your phone's home screen for quick access</p>
          <div className="instruction-container">
            <div className="instruction-box p-5">
              <h3 className="mb-3 title">For iPhone (Safari)</h3>
              <ol className="space-y-3">
                <li>Open WaterWays in Safari</li>
                <li>
                  Tap the <svg className="share-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="m8 10.1073c.34225 0 .61245-.27858.61245-.60557v-6.01298l-.04804-.89619.34825.45415.78658.84775c.10807.12111.25818.18166.40826.18166.2942 0 .5404-.21799.5404-.52681 0-.15744-.06-.27855-.1681-.38755l-2.00545-1.94377c-.16212-.15744-.31223-.21799-.47435-.21799s-.31823.06055-.47434.21799l-2.00546 1.94377c-.11409.109-.17413.23011-.17413.38755 0 .30882.24618.52681.54039.52681.15011 0 .30623-.06055.4083-.18166l.79258-.84775.34825-.45415-.05404.89619v6.01298c0 .32699.2762.60557.61845.60557zm-3.46452 4.8927h6.92902c1.333 0 2.0355-.7085 2.0355-2.0346v-5.89793c0-1.32612-.7025-2.0346-2.0355-2.0346h-1.59114v1.35035h1.47704c.5224 0 .8106.27249.8106.82353v5.61935c0 .5571-.2882.8236-.8106.8236h-6.70084c-.52838 0-.81059-.2665-.81059-.8236v-5.61935c0-.55104.28221-.82353.81059-.82353h1.49509v-1.35035h-1.60917c-1.32696 0-2.03548.70848-2.03548 2.0346v5.89793c0 1.3322.70852 2.0346 2.03548 2.0346z" fill="currentColor"/></svg> button
                </li>
                <li>Scroll down and tap "Add to Home Screen"</li>
                <li>Confirm the name or edit it</li>
                <li>Tap "Add" in the top right corner</li>
              </ol>
            </div>
            
            <div className="instruction-box p-5">
              <h3 className="mb-3 title">For Android (Chrome)</h3>
              <ol className="space-y-3">
                <li>Open WaterWays in Chrome</li>
                <li>
                  Tap the <svg className="share-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" fill="currentColor"/></svg> button
                </li>
                <li>Select "Add to Home screen"</li>
                <li>Confirm the name or edit it</li>
                <li>Tap "Add"</li>
              </ol>
            </div>
          </div>
        </div>
      </section>
      
      <section>
      <h2 className="mb-4 pb-2"></h2>
        <h2 className="mb-4 pb-2">Latest Updates</h2>
        <div>
          {/* Updates content goes here */}

          <div className="py-2 mb-4">
            <p className="mb-1">May 18, 2025</p>
            <p>Added Subscriptions to support the cost of development, and a huge perfomance update.</p>
            </div>

	  <div className="py-2 mb-4">
            <p className="mb-1">May 6, 2025</p>
            <p>Added user favourites</p>
            </div>


          <div className="py-2 mb-4">
            <p className="mb-1">May 5, 2025</p>
            <p>Added user accounts, and settings</p>
          </div>
          
          <div className="py-2 mb-4">
            <p className="mb-1">April 13, 2025</p>
            <p>UI Overhaul</p>
          </div>
          
         {/* <div className="py-2 mb-4">
            <p className="mb-1">Coming Soon</p>
            <p>Favourite Stations</p>
          </div> */}
          
        </div>
      </section>
    </div>
  );
};

export default Home;
