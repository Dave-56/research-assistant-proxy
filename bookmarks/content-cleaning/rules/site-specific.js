/**
 * Site-Specific Content Cleaning Rules
 * Handles unique patterns for specific websites
 * Easily extensible as we encounter new problematic sites
 */

class SiteSpecificRules {
  constructor() {
    this.name = 'site-specific-rules';
    this.priority = 3; // Applied last, most specific
    
    // Site-specific rule definitions
    this.siteRules = {
      // Wikipedia rules (borrowed from frontend)
      'wikipedia.org': {
        remove: [
          '.infobox', '.navbox', '.mbox-small', '.hatnote', '.dablink',
          '.sidebar', '.vertical-navbox', '.nowrap', '#toc', '.toc',
          '.reflist', '.reference', '.references', '.mbox', '.ambox',
          '.metadata', '.navframe', '.mediaContainer', '.audio-container',
          '.succession-box', '.collapsible', '.mw-collapsible',
          '.catlinks', '.interlanguage-link', '.IPA', '.nowrap .IPA'
        ],
        textPatterns: [
          /^Listen to this article\s*/i,
          /^From Wikipedia, the free encyclopedia\s*/i,
          /^Page semi-protected\s*/i
        ]
      },
      
      // Reddit rules
      'reddit.com': {
        remove: [
          '.sidebar', '.promoted', '.premium-banner',
          '.subreddit-rules', '.moderators', '.recently-viewed',
          '.trending-subreddits', '.gold-accent', '.ad-container'
        ]
      },
      
      // Medium rules  
      'medium.com': {
        remove: [
          '.sidebar', '.related-articles', '.recommended-articles',
          '.footer-collection', '.post-actions', '.clap-button',
          '.subscribe-prompt', '.member-preview-upgrade'
        ]
      },
      
      // YouTube rules
      'youtube.com': {
        remove: [
          '.sidebar', '.related-videos', '.comments-section',
          '.video-ads', '.masthead', '.guide-section',
          '.subscription-shelf'
        ]
      },
      
      // Amazon rules
      'amazon.com': {
        remove: [
          '.nav-main', '.nav-subnav', '.nav-footer',
          '.recommendations', '.frequently-bought-together',
          '.sponsored-products', '.customers-who-viewed',
          '.product-ads', '.deal-badge'
        ]
      },
      
      // News sites (general patterns)
      'cnn.com': {
        remove: [
          '.related-content', '.most-popular', '.trending',
          '.newsletter-signup', '.social-follow', '.video-playlist'
        ]
      },
      
      'bbc.com': {
        remove: [
          '.related-topics', '.most-popular', '.features',
          '.promotions', '.newsletter', '.social-links'
        ]
      },
      
      // GitHub rules
      'github.com': {
        remove: [
          '.header', '.footer', '.sidebar', '.explore-pjax-container',
          '.marketplace-banner', '.profile-rollup-wrapper'
        ]
      },
      
      // Stack Overflow rules
      'stackoverflow.com': {
        remove: [
          '.left-sidebar', '.right-sidebar', '.top-bar',
          '.post-menu', '.vote-accepted-off', '.js-post-menu',
          '.tagged-interesting', '.module', '.sidebar-widget'
        ]
      },
      
      // LinkedIn rules
      'linkedin.com': {
        remove: [
          '.global-nav', '.sidebar', '.right-rail',
          '.premium-upsell', '.ad-banner', '.sponsored-update'
        ]
      },
      
      // Twitter rules
      'twitter.com': {
        remove: [
          '.sidebar', '.trends', '.who-to-follow',
          '.promoted-tweet', '.timeline-footer', '.stream-footer'
        ]
      }
    };
  }

  /**
   * Get selectors for elements to remove based on hostname
   * @param {string} url - The URL being processed
   * @returns {Array} Array of CSS selectors
   */
  getRemovalSelectors(url) {
    const hostname = this._getHostname(url);
    const matchingRules = this._findMatchingRules(hostname);
    
    if (!matchingRules) {
      return [];
    }
    
    return matchingRules.remove || [];
  }

  /**
   * Get text patterns for specific sites
   * @param {string} url - The URL being processed  
   * @returns {Array} Array of regex patterns
   */
  getTextPatterns(url) {
    const hostname = this._getHostname(url);
    const matchingRules = this._findMatchingRules(hostname);
    
    if (!matchingRules) {
      return [];
    }
    
    return matchingRules.textPatterns || [];
  }

  /**
   * Get cleaning selectors for specific sites
   * @param {string} url - The URL being processed
   * @returns {Array} Array of cleaning instruction objects
   */
  getCleaningSelectors(url) {
    const hostname = this._getHostname(url);
    const matchingRules = this._findMatchingRules(hostname);
    
    if (!matchingRules) {
      return [];
    }
    
    return matchingRules.clean || [];
  }

  /**
   * Check if this rule should apply to the given URL
   * @param {string} url - The URL being processed
   * @returns {boolean} Whether this rule applies
   */
  shouldApply(url) {
    const hostname = this._getHostname(url);
    return this._findMatchingRules(hostname) !== null;
  }

  /**
   * Add a new site-specific rule
   * @param {string} hostname - The hostname to target
   * @param {Object} rules - The cleaning rules
   */
  addSiteRule(hostname, rules) {
    this.siteRules[hostname] = rules;
  }

  /**
   * Get all configured sites
   * @returns {Array} Array of hostnames with custom rules
   */
  getConfiguredSites() {
    return Object.keys(this.siteRules);
  }

  /**
   * Find matching rules for a hostname
   * @private
   * @param {string} hostname - The hostname to match
   * @returns {Object|null} Matching rules or null
   */
  _findMatchingRules(hostname) {
    // Exact match first
    if (this.siteRules[hostname]) {
      return this.siteRules[hostname];
    }
    
    // Partial match (for subdomains)
    for (const [ruleHostname, rules] of Object.entries(this.siteRules)) {
      if (hostname.includes(ruleHostname)) {
        return rules;
      }
    }
    
    return null;
  }

  /**
   * Extract hostname from URL
   * @private
   * @param {string} url - The URL
   * @returns {string} The hostname
   */
  _getHostname(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Get human-readable description of this rule set
   */
  getDescription() {
    const siteCount = Object.keys(this.siteRules).length;
    return `Site-specific cleaning rules for ${siteCount} websites including Wikipedia, Reddit, Medium, and more`;
  }
}

module.exports = SiteSpecificRules;