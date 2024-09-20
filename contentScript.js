(function() {
  const config = {
    linkedin: {
      name: 'LinkedIn',
      urlPattern: 'linkedin.com',
      selectors: {
        container: '.job-details-jobs-unified-top-card__container--two-pane',
        jobDescription: '.jobs-description__content.jobs-description-content'
      }
    },
    indeed: {
      name: 'Indeed',
      urlPattern: 'indeed.com',
      selectors: {
        container: '.jobsearch-InfoHeaderContainer',
        jobDescription: '.jobsearch-JobComponent-description'
      }
    },
    // Add more website configurations here...
  };
  
  let lastUrl = window.location.href; // Track last known URL

  function getSiteConfig() {
    const currentUrl = window.location.href;
    return Object.values(config).find(site => currentUrl.includes(site.urlPattern));
  }

  function injectAnalyzeButton(siteConfig) {
    const jobContainer = document.querySelector(siteConfig.selectors.container);
    if (!jobContainer) return;

    // Clear existing button if it's already there
    const existingButton = jobContainer.querySelector('#analyze-job-btn');
    if (existingButton) existingButton.remove();

	clearAnalysisResults();

    // Create a container div for the button and results
	let analysisContainer = document.querySelector('#job-analysis-container');
	if(!analysisContainer) {
		analysisContainer = document.createElement('div');
		analysisContainer.id = 'job-analysis-container';
		analysisContainer.style.position = 'relative';
		analysisContainer.style.marginTop = '10px';
		
		
	}

	// Create and style the analyze button
	const analyzeButton = document.createElement('button');
	analyzeButton.innerText = 'Analyze Job Suitability';
	analyzeButton.id = 'analyze-job-btn';
	analyzeButton.style.marginTop = '10px';
	analyzeButton.style.padding = '10px';
	analyzeButton.style.backgroundColor = '#0073b1';
	analyzeButton.style.color = 'white';
	analyzeButton.style.border = 'none';
	analyzeButton.style.cursor = 'pointer';

	// Append the button to the analysis container
	analysisContainer.appendChild(analyzeButton);
    jobContainer.appendChild(analysisContainer);

	analyzeButton.addEventListener('click', () => {
		const jobDescription = document.querySelector(siteConfig.selectors.jobDescription)?.innerText;
		console.log(jobDescription);
		if (jobDescription) {
			// Send job description for analysis via middleware
			window.postMessage({
				type: 'ANALYZE_JOB',
				payload: jobDescription
			}, '*');
		} else {
			alert('Failed to retrieve job description.');
		}
	});
	
    checkJobInCache(); // Check the cache right after the button is injected
  }

  // Function to display the score and hover tooltip on the page
  function displayAnalysisResult({ jobId, score, forList, againstList }) {
    const analysisContainer = document.querySelector('#job-analysis-container');
    if (!analysisContainer) return;

    // Clear any previous result
    analysisContainer.innerHTML = '';

    // Display the score
    const scoreText = document.createElement('p');
    scoreText.innerText = `Suitability Score: ${score} / 10`;
    scoreText.style.fontWeight = 'bold';

    // Create a tooltip with the For and Against lists
    const tooltip = document.createElement('div');
    tooltip.style.position = 'relative';
    tooltip.style.display = 'inline-block';
    tooltip.style.borderBottom = '1px dotted black';
    tooltip.innerText = 'Details';

    const tooltipText = document.createElement('div');
    tooltipText.style.visibility = 'hidden';
    tooltipText.style.width = '600px';
    tooltipText.style.backgroundColor = 'black';
    tooltipText.style.color = '#fff';
    tooltipText.style.textAlign = 'left';
    tooltipText.style.padding = '10px';
    tooltipText.style.position = 'absolute';
    tooltipText.style.zIndex = '1';
    tooltipText.style.bottom = '100%';
    tooltipText.style.marginLeft = '0px';
    tooltipText.innerHTML = `<strong>For:</strong><br>${forList.join('<br>')}<br><strong>Against:</strong><br>${againstList.join('<br>')}`;

    tooltip.appendChild(tooltipText);
    tooltip.addEventListener('mouseover', () => { tooltipText.style.visibility = 'visible'; });
    tooltip.addEventListener('mouseout', () => { tooltipText.style.visibility = 'hidden'; });

    // Append the score and tooltip to the analysis container
    analysisContainer.appendChild(scoreText);
    analysisContainer.appendChild(tooltip);
  }
  
  // Clear analysis results, leaving just the button
  function clearAnalysisResults() {
    const analysisContainer = document.querySelector('#job-analysis-container');
    if (analysisContainer) {
      analysisContainer.innerHTML = '';
    }
  }

  // Listen for analysis result messages from middleware
  window.addEventListener('message', (event) => {
    if (event.data.type === 'ANALYSIS_RESULT') {
      console.log(event.data.payload);
      displayAnalysisResult(event.data.payload);
    }
  });
  
  // Detect URL changes (Single Page Apps often change URL without a full reload)
  function detectUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log(`URL changed to: ${currentUrl}`);
      const siteConfig = getSiteConfig();
      if (siteConfig) {
        injectAnalyzeButton(siteConfig); // Re-inject button and check cache on URL change
      }
    }
  }

  // Observe page mutations to detect job listing changes and inject button
  const observer = new MutationObserver(() => {
    detectUrlChange();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial injection of button
  const siteConfig = getSiteConfig();
  if (siteConfig) injectAnalyzeButton(siteConfig);

  // Reattach listeners in case of DOM changes
  function reattachListeners() {
    document.querySelector('#analyze-job-btn')?.addEventListener('click', () => {
      // Logic for button click can be reattached here if needed
    });
  }
  
  // Send checkCache message after button is injected
  function checkJobInCache() {
    chrome.runtime.sendMessage({ type: 'checkCache' }, (response) => {
      if (response && response.isCached) {
        console.log('Job is cached, result was sent to content script.');
      } else {
        console.log('Job not in cache.');
      }
    });
  }

  // Poll the URL periodically to detect changes
  setInterval(detectUrlChange, 1000);

  // Call reattachListeners periodically or after detecting DOM changes
  setInterval(reattachListeners, 1000);
})();