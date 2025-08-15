/**
 * Test Script for Content Cleaning System
 * Demonstrates the new cleaning pipeline with the problematic e-commerce content
 */

const ContentCleaner = require('./bookmarks/content-cleaning/index');

// Sample problematic HTML (similar to your Shopify example)
const problematicHTML = `
<div id="readability-page-1" class="page">
  <div tabindex="0"> 
    <div data-popup-content="" data-js-popup-name="navigation" data-popup-mobile-left="" data-popup-desktop-top=""> 
      <ul> 
        <li><a href="https://elwoodclothing.com/pages/rewards" title="">Rewards</a></li>
        <li data-js-popup-button="account"><a href="https://elwoodclothing.com/account" title="">My Account</a></li>
        <li><a href="https://elwoodclothing.com/pages/about-us" title="">About</a></li>
        <li><a href="https://elwoodclothing.com/pages/contact-us" title="">Contact Us</a></li> 
      </ul> 
    </div>
    <div data-popup-content="" data-js-popup-name="cart" data-popup-right="" data-js-popup-ajax=""> 
      <div> 
        <h5><strong>Shopping Bag</strong> <span>(0)</span></h5> 
      </div>
      <div> 
        <p>Your cart is empty!</p> 
        <p>Add your favorite items to your cart.</p> 
      </div>
    </div>
    <div data-popup-content="" data-js-popup-name="account" data-popup-right=""> 
      <h5>SIGN UP</h5> 
    </div>
  </div>
  
  <!-- ACTUAL CONTENT (should be preserved) -->
  <div role="main" id="MainContent">
    <h1>Summer Collection 2025</h1>
    <p>Discover our latest summer collection featuring premium fabrics and timeless designs. Each piece is carefully crafted to provide both comfort and style for the modern wardrobe.</p>
    
    <h2>Featured Items</h2>
    <p>Our featured items this season include lightweight cotton shirts, linen pants, and sustainable accessories that complement any summer wardrobe. We believe in creating pieces that transcend seasonal trends while maintaining exceptional quality and comfort. Each garment is designed with attention to detail and crafted using sustainable practices.</p>
    
    <table>
      <tr>
        <th>Item</th>
        <th>Price</th>
        <th>Material</th>
      </tr>
      <tr>
        <td>Cotton Shirt</td>
        <td>$89</td>
        <td>100% Organic Cotton</td>
      </tr>
      <tr>
        <td>Linen Pants</td>
        <td>$129</td>
        <td>French Linen</td>
      </tr>
    </table>
    
    <h2>Sustainability</h2>
    <p>We are committed to sustainable fashion practices, using only ethically sourced materials and supporting fair trade manufacturing processes. Our supply chain is carefully vetted to ensure workers are treated fairly and environmental impact is minimized.</p>
    
    <h3>Our Mission</h3>
    <p>To create timeless fashion that respects both people and planet. Every piece in our collection tells a story of conscious design and responsible manufacturing.</p>
  </div>
  
  <!-- This should be removed (matches rules but is small content) -->
  <div class="related">
    <span>Related</span>
  </div>
</div>
`;

async function testContentCleaning() {
  console.log('🧪 Testing Content Cleaning System\n');
  
  // Initialize cleaner with debug mode
  const cleaner = new ContentCleaner({
    enableMetrics: true,
    enableContentScoring: true,
    debugMode: true
  });
  
  const testUrl = 'https://elwoodclothing.com/collections/summer-2025';
  
  console.log('📊 Original HTML stats:');
  console.log(`   Size: ${problematicHTML.length} characters`);
  console.log(`   Contains data-popup: ${problematicHTML.includes('data-popup-content')}`);
  console.log(`   Contains shopping cart: ${problematicHTML.includes('Shopping Bag')}`);
  console.log(`   Contains navigation: ${problematicHTML.includes('My Account')}`);
  
  console.log('\n🧹 Running cleaning pipeline...\n');
  
  try {
    // Step 1: Clean HTML before Readability
    const cleaningResult = await cleaner.cleanContent(problematicHTML, testUrl);
    
    if (cleaningResult.success) {
      console.log('✅ Pre-cleaning successful!');
      console.log(`📊 Size reduction: ${cleaningResult.preCleaningStats.reductionPercent}%`);
      console.log(`🗑️  Removed elements: ${cleaningResult.preCleaningStats.removedElements.slice(0, 5).join(', ')}...`);
      console.log(`📋 Applied rules: ${cleaningResult.preCleaningStats.appliedRules.join(', ')}`);
      
      // Step 2: Simulate Readability processing (simplified)
      console.log('\n🔄 Simulating Readability processing...');
      const mockReadabilityContent = `
        <h1>Summer Collection 2025</h1>
        <p>Discover our latest summer collection featuring premium fabrics and timeless designs. Each piece is carefully crafted to provide both comfort and style for the modern wardrobe.</p>
        
        <h2>Featured Items</h2>
        <p>Our featured items this season include lightweight cotton shirts, linen pants, and sustainable accessories that complement any summer wardrobe.</p>
        
        <table>
          <tr><th>Item</th><th>Price</th><th>Material</th></tr>
          <tr><td>Cotton Shirt</td><td>$89</td><td>100% Organic Cotton</td></tr>
          <tr><td>Linen Pants</td><td>$129</td><td>French Linen</td></tr>
        </table>
        
        <h2>Sustainability</h2>
        <p>We are committed to sustainable fashion practices, using only ethically sourced materials and supporting fair trade manufacturing processes.</p>
      `;
      
      // Step 3: Post-process the content
      const postProcessResult = await cleaner.postProcessContent(mockReadabilityContent, testUrl);
      
      if (postProcessResult.success) {
        console.log('✅ Post-processing successful!');
        console.log(`📊 Quality score: ${postProcessResult.qualityScore?.overall || 'N/A'}/100`);
        
        console.log('\n📄 Final cleaned content:');
        console.log('=' .repeat(50));
        console.log(postProcessResult.content);
        console.log('=' .repeat(50));
        
        console.log('\n📊 Quality breakdown:');
        if (postProcessResult.qualityScore?.breakdown) {
          Object.entries(postProcessResult.qualityScore.breakdown).forEach(([key, score]) => {
            console.log(`   ${key}: ${Math.round(score)}/100`);
          });
        }
        
        console.log('\n💡 Recommendations:');
        postProcessResult.qualityScore?.recommendations?.forEach(rec => {
          console.log(`   • ${rec}`);
        });
        
      } else {
        console.log('❌ Post-processing failed:', postProcessResult.error);
      }
      
    } else {
      console.log('❌ Cleaning failed:', cleaningResult.error);
    }
    
    // Show metrics
    console.log('\n📈 Cleaning metrics:');
    const stats = cleaner.getStats();
    console.log(`   Operations: ${stats.cleaned}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Avg time: ${Math.round(stats.avgCleaningTime)}ms`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testContentCleaning().then(() => {
    console.log('\n✨ Test completed!');
  }).catch(error => {
    console.error('💥 Test crashed:', error);
  });
}

module.exports = { testContentCleaning };