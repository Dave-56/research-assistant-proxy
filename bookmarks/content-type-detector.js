/**
 * Content Type Detector
 * Uses Claude Haiku to classify webpage content for appropriate processing
 */

class ContentTypeDetector {
  constructor() {
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!this.anthropicApiKey) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set - LLM detection will fallback to URL patterns');
    }
  }

  /**
   * Detect content type from URL and HTML snippet
   * @param {string} url - The webpage URL
   * @param {string} html - Full HTML content
   * @returns {Promise<string>} Content type: article, product, social, video, or other
   */
  async detectType(url, html) {
    try {
      // Extract relevant HTML snippet (first 5KB)
      const snippet = this.extractSnippet(html);
      
      // Quick URL-based detection for obvious cases
      const urlType = this.detectFromURL(url);
      if (urlType && urlType !== 'unknown') {
        console.log(`Content type detected from URL: ${urlType}`);
        return urlType;
      }

      // Use Claude Haiku for content-based detection
      if (!this.anthropicApiKey) {
        console.log('No API key, falling back to "other"');
        return 'other';
      }

      const prompt = this.buildPrompt(url, snippet);
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          messages: [{
            role: 'user',
            content: prompt
          }],
          system: 'You are a webpage classifier. Respond with ONLY one word: article, product, social, video, or other.',
          max_tokens: 10,
          temperature: 0
        })
      });

      if (!response.ok) {
        console.error('Anthropic API error:', response.status);
        return 'other';
      }

      const data = await response.json();
      const type = data.content[0].text.trim().toLowerCase();
      
      // Validate response
      const validTypes = ['article', 'product', 'social', 'video', 'other'];
      if (validTypes.includes(type)) {
        console.log(`Content type detected via LLM: ${type}`);
        return type;
      }
      
      // Default fallback
      return 'other';
      
    } catch (error) {
      console.error('Error detecting content type:', error);
      // Fallback to article for safety (will be cleaned)
      return 'article';
    }
  }

  /**
   * Extract relevant HTML snippet for analysis
   * @private
   */
  extractSnippet(html) {
    // Get first 5000 chars (enough for meta tags and initial structure)
    let snippet = html.substring(0, 5000);
    
    // Try to extract key metadata
    const metaMatch = html.match(/<head[^>]*>[\s\S]*?<\/head>/i);
    if (metaMatch) {
      snippet = metaMatch[0] + html.substring(0, 2000);
    }
    
    return snippet;
  }

  /**
   * Quick detection based on URL patterns
   * @private
   */
  detectFromURL(url) {
    const urlLower = url.toLowerCase();
    
    // Social media patterns
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'social';
    if (urlLower.includes('reddit.com')) return 'social';
    if (urlLower.includes('linkedin.com/posts') || urlLower.includes('linkedin.com/feed')) return 'social';
    if (urlLower.includes('facebook.com')) return 'social';
    if (urlLower.includes('instagram.com')) return 'social';
    
    // Video platforms
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'video';
    if (urlLower.includes('vimeo.com')) return 'video';
    if (urlLower.includes('twitch.tv')) return 'video';
    if (urlLower.includes('tiktok.com')) return 'video';
    
    // E-commerce patterns
    if (urlLower.includes('amazon.com')) return 'product';
    if (urlLower.includes('ebay.com')) return 'product';
    if (urlLower.includes('etsy.com')) return 'product';
    if (urlLower.includes('shopify.com')) return 'product';
    if (urlLower.includes('/product/') || urlLower.includes('/products/')) return 'product';
    if (urlLower.includes('/shop/') || urlLower.includes('/store/')) return 'product';
    if (urlLower.includes('/collections/')) return 'product';  // Common e-commerce pattern
    if (urlLower.includes('clothing.com')) return 'product';  // Clothing sites
    
    // News/article patterns
    if (urlLower.includes('medium.com')) return 'article';
    if (urlLower.includes('substack.com')) return 'article';
    if (urlLower.includes('/blog/') || urlLower.includes('/article/')) return 'article';
    if (urlLower.includes('/news/') || urlLower.includes('/post/')) return 'article';
    
    return 'unknown';
  }

  /**
   * Build prompt for LLM classification
   * @private
   */
  buildPrompt(url, snippet) {
    return `Classify this webpage into ONE category:
    
Categories:
- article: news articles, blog posts, documentation, tutorials, essays
- product: e-commerce product pages, shopping items, things for sale
- social: social media posts, tweets, reddit threads, forum discussions
- video: video content pages, streaming platforms
- other: anything that doesn't fit above categories

URL: ${url}

HTML snippet:
${snippet}

Respond with ONLY the category word.`;
  }

  /**
   * Extract basic metadata based on content type
   * @param {string} html - Full HTML content
   * @param {string} type - Detected content type
   * @returns {Object} Type-specific metadata
   */
  extractMetadata(html, type) {
    const metadata = {
      title: this.extractTitle(html),
      description: this.extractDescription(html),
      image: this.extractImage(html)
    };

    // Add type-specific metadata
    switch(type) {
      case 'product':
        metadata.price = this.extractPrice(html);
        metadata.availability = this.extractAvailability(html);
        break;
      case 'social':
        metadata.author = this.extractAuthor(html);
        metadata.platform = this.extractPlatform(html);
        break;
      case 'video':
        metadata.duration = this.extractVideoDuration(html);
        metadata.channel = this.extractChannel(html);
        break;
    }

    return metadata;
  }

  // Basic metadata extractors
  extractTitle(html) {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  extractDescription(html) {
    const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    return match ? match[1].trim() : '';
  }

  extractImage(html) {
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    return ogImage ? ogImage[1] : '';
  }

  extractPrice(html) {
    // Look for common price patterns
    const pricePatterns = [
      /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i,
      /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>([^<]+)</i,
      /\$(\d+\.?\d*)/
    ];
    
    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  extractAvailability(html) {
    const availPattern = /<meta[^>]*property=["']product:availability["'][^>]*content=["']([^"']+)["']/i;
    const match = html.match(availPattern);
    return match ? match[1] : 'unknown';
  }

  extractAuthor(html) {
    const authorPatterns = [
      /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i
    ];
    
    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  extractPlatform(html) {
    const match = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    return match ? match[1] : '';
  }

  extractVideoDuration(html) {
    const match = html.match(/<meta[^>]*property=["']video:duration["'][^>]*content=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }

  extractChannel(html) {
    const match = html.match(/<meta[^>]*property=["']video:series["'][^>]*content=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }
}

module.exports = ContentTypeDetector;