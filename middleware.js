// Define a specific message format
const MESSAGE_TYPE = 'ANALYZE_JOB';

// Listen for messages from the main content script
window.addEventListener('message', event => {
    // Ensure the message is from our extension
    if (event.source !== window || event.data.type !== MESSAGE_TYPE) return;

    // Forward the message to the background script
    const payload = event.data.payload;
    chrome.runtime.sendMessage({ type: MESSAGE_TYPE, payload: payload });
});

// Listen for responses from the background script (analysis results)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ANALYSIS_RESULT') {
        const { jobId, score, forList, againstList } = message;

        // Send the result back to the content script for display
        window.postMessage({
            type: 'ANALYSIS_RESULT',
            payload: {
                jobId: jobId,
                score: score,
                forList: forList,
                againstList: againstList
            }
        }, '*');
    }
});