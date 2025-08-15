/**
 * Base Content Cleaning Rules
 * Universal patterns that apply to most websites
 * These rules target common UI elements that rarely contain main content
 */

class BaseRules {
  constructor() {
    this.name = 'base-rules';
    this.priority = 1; // Higher priority = applied first
  }

  /**
   * Get selectors for elements to remove
   * @returns {Array} Array of CSS selectors
   */
  getRemovalSelectors() {
    return [
      // Navigation elements
      'nav', '[role="navigation"]', '.navigation', '.nav', '.navbar',
      '.menu', '.main-menu', '.site-menu', '.primary-menu',
      
      // Headers and footers
      'header', '[role="banner"]', '.header', '.site-header', '.page-header',
      'footer', '[role="contentinfo"]', '.footer', '.site-footer', '.page-footer',
      
      // Sidebars and complementary content
      'aside', '[role="complementary"]', '.sidebar', '.side-bar', '.aside',
      '.secondary', '.widget', '.widgets', '.widget-area',
      
      // Forms and search
      '.search', '.search-form', '.search-box', '.searchbox',
      '.newsletter', '.newsletter-signup', '.email-signup', '.subscribe',
      '.login', '.login-form', '.signin', '.sign-in',
      
      // Social and sharing
      '.social', '.social-media', '.social-links', '.share', '.sharing',
      '.follow', '.follow-us', '.social-follow',
      
      // Advertisements (be more specific to avoid false positives)
      '.ad', '.ads', '.advertisement', '.banner-ad', '.google-ad',
      '.adsense', '.ad-container', '.ad-wrapper', '.sponsored',
      '.ad-banner', '.ad-slot', '.ad-unit', '.ads-container',
      
      // Comments (often noisy)
      '.comments', '.comment-section', '.comment-list', '#comments',
      '.disqus', '.fb-comments', '.social-comments',
      
      // Related content (be specific to avoid main content)
      '.related-posts', '.related-articles', '.related-sidebar',
      '.recommended-posts', '.suggestions-sidebar', '.more-stories',
      
      // Pop-ups and overlays
      '.popup', '.pop-up', '.overlay', '.modal', '.lightbox',
      '.newsletter-popup', '.email-popup', '.subscribe-popup',
      
      // Cookie notices and legal
      '.cookie', '.cookie-notice', '.cookie-banner', '.gdpr',
      '.privacy-notice', '.legal-notice',
      
      // Breadcrumbs (structural, not content)
      '.breadcrumb', '.breadcrumbs', '.breadcrumb-nav',
      
      // Skip links and accessibility (screen reader only)
      '.skip-link', '.skip-to-content', '.screen-reader-only', '.sr-only',
      
      // Print-specific elements
      '.print-only', '.no-print'
    ];
  }

  /**
   * Get selectors for elements to clean but not remove
   * @returns {Array} Array of objects with selector and cleaning action
   */
  getCleaningSelectors() {
    return [
      // Remove common tracking attributes
      {
        selector: '*[data-track]',
        action: 'removeAttribute',
        attribute: 'data-track'
      },
      {
        selector: '*[data-analytics]',
        action: 'removeAttribute', 
        attribute: 'data-analytics'
      },
      {
        selector: '*[data-gtm]',
        action: 'removeAttribute',
        attribute: 'data-gtm'
      },
      
      // Clean up empty or low-value content
      {
        selector: 'p',
        action: 'removeIfEmpty'
      },
      {
        selector: 'div',
        action: 'removeIfOnlyWhitespace'
      }
    ];
  }

  /**
   * Get text patterns to remove (applied to text content)
   * @returns {Array} Array of regex patterns
   */
  getTextPatterns() {
    return [
      // Common promotional text
      /^Subscribe to our newsletter/i,
      /^Sign up for updates/i,
      /^Follow us on/i,
      /^Share this article/i,
      /^Advertisement$/i,
      /^Sponsored content/i,
      
      // Legal boilerplate
      /^This website uses cookies/i,
      /^By continuing to use this site/i,
      /^All rights reserved/i,
      
      // Navigation breadcrumbs
      /^Home\s*>\s*/i,
      /^\s*>\s*$/,
      
      // Common empty content
      /^\s*\|\s*$/,
      /^\s*\.\.\.\s*$/,
      /^\s*Loading\.\.\.\s*$/i
    ];
  }

  /**
   * Check if this rule should apply to the given URL
   * @param {string} url - The URL being processed
   * @returns {boolean} Whether this rule applies
   */
  shouldApply(url) {
    // Base rules apply to all URLs
    return true;
  }

  /**
   * Get human-readable description of this rule set
   */
  getDescription() {
    return 'Universal cleaning rules for navigation, ads, and common UI elements';
  }
}

module.exports = BaseRules;