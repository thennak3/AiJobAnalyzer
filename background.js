// Site configuration for extracting job IDs
const siteConfig = {
  linkedin: {
    urlPattern: 'linkedin.com',
    idPattern: /currentJobId=(\d+)/
  },
  indeed: {
    urlPattern: 'indeed.com',
    idPattern: /jk=([a-zA-Z0-9]+)/
  }
};

const DB_NAME = 'JobCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'jobs_cache';

/*
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url }) => {
  if (url.includes('linkedin.com/jobs/')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js'],
      world: "MAIN"
    });
  }
});*/

// Read experience.txt file
async function loadExperience() {
  const response = await fetch(chrome.runtime.getURL('experience.txt'));
  const experience = await response.text();
  return experience;
}

// Helper function to get current job ID based on the URL
function getCurrentJobId(url) {
  const site = Object.values(siteConfig).find(site => url.includes(site.urlPattern));
  if (site) {
    const match = url.match(site.idPattern);
    return match ? match[1] : null;
  }
  return null;
}

// Helper function to check if the job ID exists in the cache and is within 7 days
async function checkCache(jobId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(jobId);

    request.onsuccess = (event) => {
      const data = event.target.result;

      if (data) {
        const now = new Date();
        const timestamp = new Date(data.timestamp);
        const diff = (now - timestamp) / (1000 * 60 * 60 * 24); // Difference in days

        if (diff <= 7) {
          resolve({
            jobId: data.jobId,
            score: data.score,
            forList: data.forList,
            againstList: data.againstList
          });
        } else {
          resolve(null); // Cache expired
        }
      } else {
        resolve(null); // No cache hit
      }
    };

    request.onerror = (event) => {
      console.error('Error fetching job analysis from cache:', event);
      reject(event);
    };
  });
}

// Helper function to remove old entries from the cache (older than 7 days)
async function removeOldCacheEntries() {
  const db = await openDatabase();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const now = new Date();

  const request = store.openCursor();

  request.onsuccess = (event) => {
    const cursor = event.target.result;

    if (cursor) {
      const entryDate = new Date(cursor.value.timestamp);
      const diff = (now - entryDate) / (1000 * 60 * 60 * 24); // Difference in days

      if (diff > 7) {
        store.delete(cursor.primaryKey); // Delete the outdated entry
        console.log(`Removed old entry for jobId: ${cursor.value.jobId}`);
      }
      cursor.continue(); // Continue to the next entry
    }
  };

  request.onerror = (event) => {
    console.error('Error removing old entries from cache:', event);
  };
}


// Open (or create) IndexedDB
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Error opening IndexedDB:', event);
      reject(event);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
      objectStore.createIndex('timestamp', 'timestamp', { unique: false });
    };
  });
}

// Helper function to add a job analysis entry to the IndexedDB
async function addJobToCache(jobId, result) {
  const db = await openDatabase();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const now = new Date().toISOString();
  const entry = {
    jobId: jobId,
    timestamp: now,
    score: result.score,
    forList: result.forList,
    againstList: result.againstList
  };

  const request = store.put(entry);

  request.onsuccess = () => {
    console.log('Job analysis added to cache successfully.');
  };

  request.onerror = (event) => {
    console.error('Error adding job analysis to cache:', event);
  };
}



// Handle the OpenAI API call for job suitability
async function analyzeJob(jobDescription, experience) {
  const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Authorization': Bearer #YOURKEYHERE`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a career advisor. Given a user’s experience and skills, analyze a job description and provide a score from 1 to 10 on how suitable the job is for them. Be critical but not negative, the applicant will use this info to determine if they will apply for this job, trend lower unless the job matches well. Provide a list of pros (For) and cons (Against) with clear explanations. Format the output as such. Score: 1\nFor:\nReason 1\nReason2 etc..\nAgainst:\nAgainst1\nAgainst2 etc. Provide no further information than this.' },
        { role: 'user', content: `User's Experience:\n${experience}\n\nJob Description:\n${jobDescription}` }
      ]
    })
  });

  const data = await openAiResponse.json();
  console.log(data);
  const analysisResult = data.choices[0].message.content;

  // Extract the score, for, and against lists
  const scoreMatch = analysisResult.match(/Score:\s*(\d+)/);
  const score = scoreMatch ? scoreMatch[1] : 'N/A';
  
  // Extract the "For" list
  const forMatch = analysisResult.match(/For:\s*(.*?)(Against|$)/s);
  let forList = forMatch ? forMatch[1].trim() : 'No for items found.';
  // Split into an array by line breaks
  forList = forList.split('\n').filter(item => item.trim() !== '');
  // Extract the "Against" list
  const againstMatch = analysisResult.match(/Against:\s*(.*)/s);
  let againstList = againstMatch ? againstMatch[1].trim() : 'No against items found.';
  // Split into an array by line breaks
  againstList = againstList.split('\n').filter(item => item.trim() !== '');

  console.log('For List:', forList);
  console.log('Against List:', againstList);
  return { score, forList, againstList };
}

// Listen for messages from the middleware
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  const currentJobId = getCurrentJobId(sender.tab.url);
  
  if (message.type === 'checkCache' && currentJobId) {
    const cachedResult = await checkCache(currentJobId);
    if (cachedResult) {
      console.log(`Cache hit for Job ID ${currentJobId}. Sending cached data to content script.`);
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'ANALYSIS_RESULT',
        jobId: currentJobId,
        score: cachedResult.score,
        forList: cachedResult.forList,
        againstList: cachedResult.againstList
      });
    }
    return true;
  }


  if (message.type === 'ANALYZE_JOB') {
	const cachedResult = await checkCache(currentJobId);
	// If cached, return the cached result immediately
    if (cachedResult) {
	  (async () => {
	    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
	    const response = await chrome.tabs.sendMessage(tab.id, {
		    type: 'ANALYSIS_RESULT',
		    jobId: currentJobId,
		    score: cachedResult.score,
		    forList: cachedResult.forList,
		    againstList: cachedResult.againstList
		  });
	    // do something with response here, not outside the function
	    console.log(response);
	  })();
      return true;
    }

    const jobDescription = message.payload;

    // Load experience from file
    const experience = await loadExperience();

    // Call OpenAI for analysis
    const result = await analyzeJob(jobDescription, experience);
	
    // Update the cache with new data
    await addJobToCache(currentJobId, result);
	
	console.log(result);
	(async () => {
	  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
	  const response = await chrome.tabs.sendMessage(tab.id, {
		  type: 'ANALYSIS_RESULT',
		  jobId: currentJobId,
		  score: result.score,
		  forList: result.forList,
		  againstList: result.againstList
		});
	  // do something with response here, not outside the function
	  console.log(response);
	})();
    // Send the result back to the content script
    /*chrome.runtime.sendMessage({
      type: 'ANALYSIS_RESULT',
      jobId: currentJobId,
      score: result.score,
      forList: result.forList,
      againstList: result.againstList
    });*/

    return true;  // Keeps the message channel open for async response
  }
});
setInterval(removeOldCacheEntries, 1000000);

