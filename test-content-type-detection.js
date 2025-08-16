/**
 * Test the content type detection system
 */

require('dotenv').config();
const ContentTypeDetector = require('./bookmarks/content-type-detector');

async function testDetection() {
  console.log('🧪 Testing Content Type Detection\n');
  
  // Initialize detector (will use ANTHROPIC_API_KEY from env)
  const detector = new ContentTypeDetector();
  
  // Test URLs - Real examples from user
  const testCases = [
    { url: 'https://youtu.be/H2I6V0NlaHg?si=x4LqGHyLkprO21__', expected: 'video' },
    { url: 'https://x.com/shweta_ai/status/1956378072221102170', expected: 'social' },
    { url: 'https://x.com/NoteSphere/status/1956340096820449503', expected: 'social' },
    { url: 'https://us.33-mm.com/products/leonardo?pr_prod_strat=jac&pr_rec_id=0354adbc5&pr_rec_pid=8743372652756&pr_ref_pid=8743372030164&pr_seq=uniform', expected: 'product' },
    { url: 'https://elwoodclothing.com/collections/seasonal-core/male', expected: 'product' }
  ];
  
  console.log('Testing URL-based detection:');
  for (const test of testCases) {
    const type = detector.detectFromURL(test.url);
    const passed = type === test.expected;
    console.log(`${passed ? '✅' : '❌'} ${test.url.substring(0, 40)}... → ${type} (expected: ${test.expected})`);
  }
  
  // Test metadata extraction
  console.log('\nTesting metadata extraction:');
  const sampleHTML = `
    <html>
      <head>
        <title>Sample Product - Shop</title>
        <meta name="description" content="Amazing product description">
        <meta property="og:image" content="https://example.com/image.jpg">
        <meta property="product:price:amount" content="29.99">
        <meta property="product:availability" content="in stock">
      </head>
      <body>
        <h1>Sample Product</h1>
      </body>
    </html>
  `;
  
  const metadata = detector.extractMetadata(sampleHTML, 'product');
  console.log('Extracted metadata:', metadata);
  
  // If API key is available, test full detection
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('\n🤖 Testing Claude-based detection (requires API key):');
    try {
      const type = await detector.detectType('https://example.com/unknown', sampleHTML);
      console.log(`Detected type via Claude: ${type}`);
    } catch (error) {
      console.log('⚠️ LLM detection skipped:', error.message);
    }
  } else {
    console.log('\n⚠️ Set ANTHROPIC_API_KEY to test LLM-based detection');
  }
}

// Run test
testDetection().then(() => {
  console.log('\n✨ Test completed!');
}).catch(error => {
  console.error('❌ Test failed:', error);
});