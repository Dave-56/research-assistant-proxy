// Test script to verify the proxy server works

async function testProxy() {
  const testContent = `
    Artificial Intelligence is transforming how we work and live. 
    Machine learning algorithms can now recognize patterns in data, 
    make predictions, and even generate creative content. 
    This technology is being applied in healthcare, finance, 
    transportation, and many other industries.
  `;

  try {
    console.log('Testing proxy server...\n');

    // Test summary endpoint
    console.log('1. Testing summary generation:');
    const summaryResponse = await fetch('https://research-assistant-proxy.onrender.com/api/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: testContent,
        pageTitle: 'AI Article',
        pageUrl: 'https://www.quantamagazine.org/what-does-it-mean-to-be-thirsty-20250811/',
        type: 'summary'
      })
    });

    const summaryData = await summaryResponse.json();
    console.log('Summary response:', summaryData);
    console.log('\n---\n');

    // Test TL;DR endpoint
    console.log('2. Testing TL;DR generation:');
    const tldrResponse = await fetch('http://localhost:3000/api/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: testContent,
        pageTitle: 'AI Article',
        pageUrl: 'https://example.com/ai-article',
        type: 'tldr'
      })
    });

    const tldrData = await tldrResponse.json();
    console.log('TL;DR response:', tldrData);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testProxy();