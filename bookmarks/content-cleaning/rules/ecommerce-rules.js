/**
 * E-commerce Content Cleaning Rules
 * Targets e-commerce specific elements like shopping carts, product widgets, etc.
 * Addresses the exact issues seen in the Shopify example
 */

class EcommerceRules {
  constructor() {
    this.name = 'ecommerce-rules';
    this.priority = 2; // Applied after base rules
  }

  /**
   * Get selectors for e-commerce elements to remove
   * @returns {Array} Array of CSS selectors
   */
  getRemovalSelectors() {
    return [
      // Shopping cart and checkout elements
      '.cart', '.shopping-cart', '.shopping-bag', '.mini-cart',
      '.cart-drawer', '.cart-popup', '.cart-sidebar',
      '.checkout', '.checkout-button', '.add-to-cart',
      '.buy-now', '.purchase', '.order-now',
      
      // Account and user elements  
      '.account', '.account-menu', '.user-menu', '.my-account',
      '.login-popup', '.register-popup', '.account-popup',
      '.user-nav', '.account-nav',
      
      // Popup and modal elements (common in e-commerce)
      '[data-popup-content]', '[data-js-popup-name]',
      '[data-popup-mobile-left]', '[data-popup-desktop-top]',
      '[data-popup-right]', '[data-popup-center]',
      '[data-popup-confirmation-success]',
      
      // Product recommendation widgets
      '.recommended-products', '.related-products', '.upsell',
      '.cross-sell', '.product-recommendations', '.also-bought',
      '.recently-viewed', '.trending-products',
      
      // Reviews and ratings widgets (often promotional)
      '.reviews-widget', '.rating-widget', '.testimonials-widget',
      '.trust-badges', '.security-badges',
      
      // Promotional elements
      '.promo', '.promotion', '.promotional', '.banner-promo',
      '.sale-banner', '.discount-banner', '.offer-banner',
      '.newsletter-promo', '.email-capture',
      
      // Size guides and product info popups
      '[data-popup-size-guide-content]', '.size-guide-popup',
      '.sizing-popup', '.fit-guide', '.size-chart-popup',
      
      // Delivery and shipping info popups
      '[data-popup-content][data-js-popup-name="delivery-return"]',
      '.shipping-popup', '.delivery-popup', '.return-popup',
      
      // Customer service elements
      '.live-chat', '.chat-widget', '.customer-service',
      '.help-widget', '.support-widget',
      
      // Currency and language selectors
      '.currency-selector', '.language-selector', '.country-selector',
      '.locale-selector',
      
      // Wishlist and save elements
      '.wishlist', '.save-for-later', '.favorites', '.bookmark-product',
      
      // Stock and inventory notifications
      '.stock-notification', '.inventory-alert', '.low-stock',
      '.back-in-stock', '.notify-when-available',
      
      // Product comparison tools
      '.compare', '.comparison', '.compare-products',
      '.product-compare',
      
      // Search and filter sidebars (on product pages)
      '.search-sidebar', '.filter-sidebar', '.facets',
      '.product-filters', '.search-filters',
      
      // Shopify specific elements
      '.shopify-section', '.announcement-bar', 'announcement-bar',
      'ticker-bar', '.ticker', '.sliding-text',
      
      // Common e-commerce platform patterns
      '.woocommerce-sidebar', '.product-sidebar',
      '.magento-sidebar', '.bigcommerce-sidebar'
    ];
  }

  /**
   * Get selectors for elements to clean but not remove
   * @returns {Array} Array of objects with selector and cleaning action
   */
  getCleaningSelectors() {
    return [
      // Remove e-commerce tracking attributes
      {
        selector: '*[data-product-id]',
        action: 'removeAttribute',
        attribute: 'data-product-id'
      },
      {
        selector: '*[data-variant-id]',
        action: 'removeAttribute',
        attribute: 'data-variant-id'
      },
      {
        selector: '*[data-shopify]',
        action: 'removeAttribute',
        attribute: 'data-shopify'
      },
      {
        selector: '*[data-cart]',
        action: 'removeAttribute',
        attribute: 'data-cart'
      },
      
      // Clean up price elements that might be empty
      {
        selector: '.price',
        action: 'removeIfEmpty'
      },
      {
        selector: '.sale-price',
        action: 'removeIfEmpty'
      }
    ];
  }

  /**
   * Get text patterns specific to e-commerce
   * @returns {Array} Array of regex patterns
   */
  getTextPatterns() {
    return [
      // Shopping cart text
      /^Shopping Bag\s*\(\d+\)$/i,
      /^Your cart is empty!$/i,
      /^Add to cart$/i,
      /^Buy now$/i,
      /^Add to wishlist$/i,
      
      // Account related
      /^Sign up$/i,
      /^Log in$/i,
      /^My Account$/i,
      /^Create account$/i,
      
      // Promotional text
      /^Free shipping/i,
      /^Limited time offer/i,
      /^Sale ends/i,
      /^\d+% off/i,
      
      // Generic e-commerce notifications
      /^Added to cart$/i,
      /^Continue shopping$/i,
      /^Proceed to checkout$/i,
      /^Thanks for subscribing!$/i,
      
      // Size and fit
      /^Size guide$/i,
      /^Fit guide$/i,
      /^Not sure about your size\?$/i,
      
      // Customer service
      /^Need help\?$/i,
      /^Contact us$/i,
      /^Live chat$/i,
      /^Customer service$/i
    ];
  }

  /**
   * Check if this rule should apply to the given URL
   * @param {string} url - The URL being processed
   * @returns {boolean} Whether this rule applies
   */
  shouldApply(url) {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // Common e-commerce platforms and patterns
    const ecommercePatterns = [
      'shopify',
      'bigcommerce',
      'woocommerce',
      'magento',
      'shop',
      'store',
      'boutique',
      'clothing',
      'fashion',
      'retail'
    ];

    // Check if URL contains e-commerce indicators
    return ecommercePatterns.some(pattern => 
      hostname.includes(pattern) || 
      url.toLowerCase().includes(pattern)
    );
  }

  /**
   * Get additional hostname-specific rules
   * @param {string} hostname - The hostname being processed
   * @returns {Array} Additional selectors for specific platforms
   */
  getHostnameSpecificSelectors(hostname) {
    if (hostname.includes('shopify') || hostname.includes('myshopify.com')) {
      return [
        '.shopify-section',
        '[id^="shopify-section-"]',
        'ticker-bar',
        'announcement-bar'
      ];
    }
    
    if (hostname.includes('bigcommerce')) {
      return [
        '.bigcommerce-sidebar',
        '.bc-product-meta',
        '.product-options'
      ];
    }
    
    if (hostname.includes('woocommerce')) {
      return [
        '.woocommerce-info',
        '.woocommerce-message',
        '.wc-tabs-wrapper'
      ];
    }
    
    return [];
  }

  /**
   * Get human-readable description of this rule set
   */
  getDescription() {
    return 'E-commerce specific rules for shopping carts, product widgets, and promotional content';
  }
}

module.exports = EcommerceRules;