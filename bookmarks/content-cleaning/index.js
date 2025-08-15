/**
 * Content Cleaning Pipeline
 * Orchestrates HTML cleaning before and after Readability processing
 * Designed to be modular, extensible, and data-driven
 */

const { JSDOM } = require('jsdom');
const BaseRules = require('./rules/base-rules');
const EcommerceRules = require('./rules/ecommerce-rules');
const SiteSpecificRules = require('./rules/site-specific');
const PreProcessor = require('./processors/pre-processor');
const PostProcessor = require('./processors/post-processor');
const ContentScorer = require('./processors/content-scorer');
const { trackCleaning } = require('./utils/metrics');

class ContentCleaner {
  constructor(options = {}) {
    this.options = {
      enableMetrics: options.enableMetrics ?? true,
      enableContentScoring: options.enableContentScoring ?? true,
      debugMode: options.debugMode ?? false,
      ...options
    };

    // Initialize rule sets
    this.rules = [
      new BaseRules(),
      new EcommerceRules(),
      new SiteSpecificRules()
    ];

    // Initialize processors
    this.preProcessor = new PreProcessor(this.rules);
    this.postProcessor = new PostProcessor();
    this.contentScorer = new ContentScorer();

    this.stats = {
      cleaned: 0,
      errors: 0,
      avgCleaningTime: 0
    };
  }

  /**
   * Main cleaning pipeline - processes HTML before and after Readability
   * @param {string} html - Raw HTML content
   * @param {string} url - Source URL for context
   * @returns {Object} Cleaning result with processed HTML and metadata
   */
  async cleanContent(html, url) {
    const startTime = Date.now();
    const hostname = this._getHostname(url);
    
    try {
      if (this.options.debugMode) {
        console.log(`🧹 Starting content cleaning for: ${hostname}`);
        console.log(`📊 Original HTML size: ${html.length} chars`);
      }

      // Step 1: Pre-process HTML (remove UI cruft before Readability)
      const preCleanResult = await this.preProcessor.process(html, url);
      
      if (this.options.debugMode) {
        console.log(`📊 After pre-processing: ${preCleanResult.html.length} chars`);
        console.log(`🗑️  Removed elements: ${preCleanResult.removedElements.join(', ')}`);
      }

      // Step 2: Return processed HTML for Readability
      // (Readability processing happens in content-fetcher.js)
      const result = {
        success: true,
        html: preCleanResult.html,
        preCleaningStats: {
          originalSize: html.length,
          cleanedSize: preCleanResult.html.length,
          reductionPercent: Math.round(((html.length - preCleanResult.html.length) / html.length) * 100),
          removedElements: preCleanResult.removedElements,
          appliedRules: preCleanResult.appliedRules
        },
        hostname,
        url
      };

      // Track metrics
      if (this.options.enableMetrics) {
        const cleaningTime = Date.now() - startTime;
        this._updateStats(cleaningTime, true);
        trackCleaning(hostname, result.preCleaningStats, cleaningTime);
      }

      return result;

    } catch (error) {
      console.error('❌ Content cleaning failed:', error);
      this._updateStats(Date.now() - startTime, false);
      
      return {
        success: false,
        html: html, // Return original on failure
        error: error.message,
        hostname,
        url
      };
    }
  }

  /**
   * Post-process content after Readability extraction
   * @param {string} readabilityContent - Content from Readability.parse()
   * @param {string} url - Source URL
   * @returns {Object} Final cleaned content
   */
  async postProcessContent(readabilityContent, url) {
    try {
      const result = await this.postProcessor.process(readabilityContent, url);
      
      // Score content quality if enabled
      if (this.options.enableContentScoring) {
        result.qualityScore = this.contentScorer.scoreContent(result.content);
      }

      return result;
      
    } catch (error) {
      console.error('❌ Post-processing failed:', error);
      return {
        success: false,
        content: readabilityContent,
        error: error.message
      };
    }
  }

  /**
   * Get cleaning statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Add custom cleaning rule
   * @param {Object} rule - Custom rule object
   */
  addRule(rule) {
    this.rules.push(rule);
  }

  /**
   * Update internal statistics
   * @private
   */
  _updateStats(cleaningTime, success) {
    if (success) {
      this.stats.cleaned++;
      this.stats.avgCleaningTime = 
        (this.stats.avgCleaningTime * (this.stats.cleaned - 1) + cleaningTime) / this.stats.cleaned;
    } else {
      this.stats.errors++;
    }
  }

  /**
   * Extract hostname from URL
   * @private
   */
  _getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }
}

module.exports = ContentCleaner;