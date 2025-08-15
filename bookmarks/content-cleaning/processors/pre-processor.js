/**
 * Pre-Processor
 * Cleans HTML before Readability processing
 * This is where the magic happens - removing UI cruft before content extraction
 */

const { JSDOM } = require('jsdom');

class PreProcessor {
  constructor(rules = []) {
    this.rules = rules;
  }

  /**
   * Process HTML by applying all cleaning rules
   * @param {string} html - Raw HTML content
   * @param {string} url - Source URL for context
   * @returns {Object} Processing result with cleaned HTML and stats
   */
  async process(html, url) {
    try {
      // Create DOM environment
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const stats = {
        originalElementCount: document.querySelectorAll('*').length,
        removedElements: [],
        appliedRules: [],
        errors: []
      };

      // Apply each rule set
      for (const rule of this.rules) {
        if (rule.shouldApply(url)) {
          try {
            await this._applyRule(rule, document, url, stats);
          } catch (error) {
            console.error(`❌ Error applying rule ${rule.name}:`, error);
            stats.errors.push(`${rule.name}: ${error.message}`);
          }
        }
      }

      // Additional content-specific cleaning
      this._performContentCleaning(document, stats);

      const cleanedHtml = dom.serialize();
      
      return {
        html: cleanedHtml,
        stats: {
          ...stats,
          finalElementCount: document.querySelectorAll('*').length,
          reductionPercent: Math.round(
            ((stats.originalElementCount - document.querySelectorAll('*').length) / 
             stats.originalElementCount) * 100
          )
        },
        removedElements: stats.removedElements,
        appliedRules: stats.appliedRules
      };

    } catch (error) {
      console.error('❌ Pre-processing failed:', error);
      throw error;
    }
  }

  /**
   * Apply a single rule to the document
   * @private
   */
  async _applyRule(rule, document, url, stats) {
    const ruleName = rule.name || 'unknown';
    stats.appliedRules.push(ruleName);

    // Apply removal selectors with content preservation
    const removalSelectors = rule.getRemovalSelectors ? rule.getRemovalSelectors(url) : [];
    for (const selector of removalSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        // Content preservation logic - don't remove if element has substantial content
        if (this._shouldPreserveElement(element)) {
          stats.removedElements.push(`${selector} (${rule.name}) - PRESERVED due to content`);
          return; // Skip removal
        }
        
        stats.removedElements.push(`${selector} (${rule.name})`);
        element.remove();
      });
    }

    // Apply cleaning selectors (modify but don't remove)
    const cleaningSelectors = rule.getCleaningSelectors ? rule.getCleaningSelectors(url) : [];
    for (const cleaningRule of cleaningSelectors) {
      this._applyCleaningAction(document, cleaningRule, stats);
    }

    // Apply text pattern cleaning
    const textPatterns = rule.getTextPatterns ? rule.getTextPatterns(url) : [];
    if (textPatterns.length > 0) {
      this._cleanTextPatterns(document, textPatterns, stats);
    }

    // Apply hostname-specific selectors if available
    if (rule.getHostnameSpecificSelectors) {
      const hostname = new URL(url).hostname;
      const specificSelectors = rule.getHostnameSpecificSelectors(hostname);
      for (const selector of specificSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          // Apply same content preservation logic
          if (this._shouldPreserveElement(element)) {
            stats.removedElements.push(`${selector} (${rule.name}-specific) - PRESERVED due to content`);
            return;
          }
          
          stats.removedElements.push(`${selector} (${rule.name}-specific)`);
          element.remove();
        });
      }
    }
  }

  /**
   * Apply cleaning actions that modify but don't remove elements
   * @private
   */
  _applyCleaningAction(document, cleaningRule, stats) {
    const elements = document.querySelectorAll(cleaningRule.selector);
    
    elements.forEach(element => {
      switch (cleaningRule.action) {
        case 'removeAttribute':
          if (element.hasAttribute(cleaningRule.attribute)) {
            element.removeAttribute(cleaningRule.attribute);
          }
          break;
          
        case 'removeIfEmpty':
          if (!element.textContent.trim()) {
            stats.removedElements.push(`${cleaningRule.selector} (empty)`);
            element.remove();
          }
          break;
          
        case 'removeIfOnlyWhitespace':
          if (!element.textContent.trim() && !element.querySelector('img, video, iframe')) {
            stats.removedElements.push(`${cleaningRule.selector} (whitespace only)`);
            element.remove();
          }
          break;
          
        case 'removeClass':
          if (cleaningRule.className && element.classList.contains(cleaningRule.className)) {
            element.classList.remove(cleaningRule.className);
          }
          break;
      }
    });
  }

  /**
   * Clean text content based on patterns
   * @private
   */
  _cleanTextPatterns(document, patterns, stats) {
    const walker = document.createTreeWalker(
      document.body,
      document.defaultView.NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      let content = textNode.textContent;
      let modified = false;

      patterns.forEach(pattern => {
        if (pattern.test(content)) {
          content = content.replace(pattern, '');
          modified = true;
        }
      });

      if (modified) {
        textNode.textContent = content;
        if (!content.trim()) {
          // Remove parent if it becomes empty
          const parent = textNode.parentElement;
          if (parent && !parent.textContent.trim() && !parent.querySelector('img, video, iframe')) {
            stats.removedElements.push(`text pattern cleanup`);
            parent.remove();
          }
        }
      }
    });
  }

  /**
   * Perform additional content-specific cleaning
   * @private
   */
  _performContentCleaning(document, stats) {
    // Remove empty paragraphs and divs
    const emptyElements = document.querySelectorAll('p:empty, div:empty, span:empty');
    emptyElements.forEach(element => {
      stats.removedElements.push(`empty ${element.tagName.toLowerCase()}`);
      element.remove();
    });

    // Remove elements with only non-breaking spaces
    const nbspOnlyElements = document.querySelectorAll('p, div, span');
    nbspOnlyElements.forEach(element => {
      if (element.textContent.trim() === '' || /^[\s\u00A0]*$/.test(element.textContent)) {
        if (!element.querySelector('img, video, iframe, svg')) {
          stats.removedElements.push(`nbsp-only ${element.tagName.toLowerCase()}`);
          element.remove();
        }
      }
    });

    // Remove script and style tags that might have been missed
    const scriptElements = document.querySelectorAll('script, style, noscript');
    scriptElements.forEach(element => {
      stats.removedElements.push(`${element.tagName.toLowerCase()} tag`);
      element.remove();
    });

    // Clean up data attributes that are likely tracking-related
    const trackingAttributes = [
      'data-gtm', 'data-ga', 'data-analytics', 'data-track',
      'data-event', 'data-pixel', 'data-fb', 'data-facebook'
    ];
    
    trackingAttributes.forEach(attr => {
      const elements = document.querySelectorAll(`[${attr}]`);
      elements.forEach(element => {
        element.removeAttribute(attr);
      });
    });
  }

  /**
   * Determine if an element should be preserved despite matching removal rules
   * @private
   * @param {Element} element - The element to check
   * @returns {boolean} True if element should be preserved
   */
  _shouldPreserveElement(element) {
    // Always preserve main content areas
    if (element.matches('[role="main"], main, #MainContent, .main-content, .content, article')) {
      return true;
    }
    
    // Preserve elements with substantial text content (likely main content)
    const textContent = element.textContent.trim();
    if (textContent.length > 300) {
      // Check if it's not just repeated navigation/menu items
      const words = textContent.split(/\s+/);
      const uniqueWords = new Set(words.map(w => w.toLowerCase()));
      const uniqueRatio = uniqueWords.size / words.length;
      
      // If text has good word variety (not repetitive nav), preserve it
      if (uniqueRatio > 0.5 && words.length > 50) {
        return true;
      }
    }
    
    // Preserve elements containing important structural content
    const importantTags = element.querySelectorAll('h1, h2, h3, p, article, table');
    if (importantTags.length >= 3) {
      return true;
    }
    
    // Preserve if element contains tables (likely data content)
    if (element.querySelector('table')) {
      const tableText = element.querySelector('table').textContent.trim();
      if (tableText.length > 100) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Add a new rule to the processor
   * @param {Object} rule - Rule object to add
   */
  addRule(rule) {
    this.rules.push(rule);
  }

  /**
   * Get current rules
   * @returns {Array} Current rules array
   */
  getRules() {
    return [...this.rules];
  }
}

module.exports = PreProcessor;