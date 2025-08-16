/**
 * Test script for PDF extraction functionality
 */

const PDFExtractor = require('./pdf-extractor');

async function testPDFExtraction() {
  const extractor = new PDFExtractor();
  
  // Test URLs - replace with actual PDF URLs you want to test
  const testPDFs = [
    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', // Simple test PDF
    // Add more test PDFs here
  ];
  
  for (const url of testPDFs) {
    console.log('\n' + '='.repeat(50));
    console.log(`Testing: ${url}`);
    console.log('='.repeat(50));
    
    try {
      const result = await extractor.extractFromURL(url);
      
      if (result.success) {
        console.log('✅ Extraction successful!');
        console.log(`📄 Pages: ${result.metadata.pages}`);
        console.log(`📊 File size: ${Math.round(result.metadata.fileSize / 1024)}KB`);
        console.log(`📝 Text length: ${result.text.length} characters`);
        console.log(`\n📋 Preview:\n${result.preview}\n`);
      } else {
        console.log('❌ Extraction failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Run test
testPDFExtraction().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});