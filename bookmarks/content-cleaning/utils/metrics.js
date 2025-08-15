/**
 * Content Cleaning Metrics
 * Tracks cleaning performance and effectiveness
 * Helps identify problematic sites and improve rules
 */

class CleaningMetrics {
  constructor() {
    this.metrics = {
      totalCleaned: 0,
      totalErrors: 0,
      siteStats: new Map(), // hostname -> stats
      ruleEffectiveness: new Map(), // rule name -> effectiveness stats
      cleaningTimes: [],
      averageReduction: 0
    };
  }

  /**
   * Track a cleaning operation
   * @param {string} hostname - The hostname that was cleaned
   * @param {Object} cleaningStats - Stats from the cleaning operation
   * @param {number} cleaningTime - Time taken in milliseconds
   */
  trackCleaning(hostname, cleaningStats, cleaningTime) {
    this.metrics.totalCleaned++;
    this.metrics.cleaningTimes.push(cleaningTime);
    
    // Update site-specific stats
    if (!this.metrics.siteStats.has(hostname)) {
      this.metrics.siteStats.set(hostname, {
        cleanings: 0,
        totalReduction: 0,
        averageReduction: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 0
      });
    }
    
    const siteStats = this.metrics.siteStats.get(hostname);
    siteStats.cleanings++;
    siteStats.totalReduction += cleaningStats.reductionPercent;
    siteStats.averageReduction = siteStats.totalReduction / siteStats.cleanings;
    siteStats.totalTime += cleaningTime;
    siteStats.averageTime = siteStats.totalTime / siteStats.cleanings;
    
    // Update rule effectiveness
    if (cleaningStats.appliedRules) {
      cleaningStats.appliedRules.forEach(ruleName => {
        if (!this.metrics.ruleEffectiveness.has(ruleName)) {
          this.metrics.ruleEffectiveness.set(ruleName, {
            applications: 0,
            totalReduction: 0,
            averageReduction: 0
          });
        }
        
        const ruleStats = this.metrics.ruleEffectiveness.get(ruleName);
        ruleStats.applications++;
        ruleStats.totalReduction += cleaningStats.reductionPercent;
        ruleStats.averageReduction = ruleStats.totalReduction / ruleStats.applications;
      });
    }
    
    // Update average reduction
    this.metrics.averageReduction = 
      (this.metrics.averageReduction * (this.metrics.totalCleaned - 1) + cleaningStats.reductionPercent) / 
      this.metrics.totalCleaned;
  }

  /**
   * Track a cleaning error
   * @param {string} hostname - The hostname where error occurred
   * @param {string} error - The error message
   */
  trackError(hostname, error) {
    this.metrics.totalErrors++;
    
    if (this.metrics.siteStats.has(hostname)) {
      this.metrics.siteStats.get(hostname).errors++;
    } else {
      this.metrics.siteStats.set(hostname, {
        cleanings: 0,
        totalReduction: 0,
        averageReduction: 0,
        totalTime: 0,
        averageTime: 0,
        errors: 1
      });
    }
  }

  /**
   * Get overall metrics summary
   * @returns {Object} Summary of all metrics
   */
  getSummary() {
    const totalTime = this.metrics.cleaningTimes.reduce((sum, time) => sum + time, 0);
    const averageTime = this.metrics.cleaningTimes.length > 0 ? 
      totalTime / this.metrics.cleaningTimes.length : 0;
    
    return {
      totalOperations: this.metrics.totalCleaned + this.metrics.totalErrors,
      successfulCleanings: this.metrics.totalCleaned,
      errors: this.metrics.totalErrors,
      successRate: this.metrics.totalCleaned / (this.metrics.totalCleaned + this.metrics.totalErrors) * 100,
      averageReduction: Math.round(this.metrics.averageReduction * 100) / 100,
      averageCleaningTime: Math.round(averageTime),
      uniqueSites: this.metrics.siteStats.size,
      activeRules: this.metrics.ruleEffectiveness.size
    };
  }

  /**
   * Get top problematic sites (high error rate or low reduction)
   * @param {number} limit - Number of sites to return
   * @returns {Array} Array of site stats sorted by problems
   */
  getProblematicSites(limit = 10) {
    const sites = Array.from(this.metrics.siteStats.entries()).map(([hostname, stats]) => ({
      hostname,
      errorRate: stats.errors / (stats.cleanings + stats.errors) * 100,
      averageReduction: stats.averageReduction,
      totalOperations: stats.cleanings + stats.errors,
      ...stats
    }));
    
    // Sort by error rate (desc) then by low reduction (asc)
    sites.sort((a, b) => {
      if (a.errorRate !== b.errorRate) {
        return b.errorRate - a.errorRate;
      }
      return a.averageReduction - b.averageReduction;
    });
    
    return sites.slice(0, limit);
  }

  /**
   * Get most effective rules
   * @param {number} limit - Number of rules to return
   * @returns {Array} Array of rule effectiveness stats
   */
  getMostEffectiveRules(limit = 10) {
    const rules = Array.from(this.metrics.ruleEffectiveness.entries()).map(([ruleName, stats]) => ({
      ruleName,
      ...stats
    }));
    
    // Sort by average reduction (desc) then by applications (desc)
    rules.sort((a, b) => {
      if (a.averageReduction !== b.averageReduction) {
        return b.averageReduction - a.averageReduction;
      }
      return b.applications - a.applications;
    });
    
    return rules.slice(0, limit);
  }

  /**
   * Get detailed stats for a specific site
   * @param {string} hostname - The hostname to get stats for
   * @returns {Object|null} Detailed stats or null if not found
   */
  getSiteStats(hostname) {
    if (!this.metrics.siteStats.has(hostname)) {
      return null;
    }
    
    const stats = this.metrics.siteStats.get(hostname);
    return {
      hostname,
      ...stats,
      errorRate: stats.errors / (stats.cleanings + stats.errors) * 100,
      totalOperations: stats.cleanings + stats.errors
    };
  }

  /**
   * Export metrics for analysis
   * @returns {Object} All metrics data
   */
  exportMetrics() {
    return {
      summary: this.getSummary(),
      siteStats: Array.from(this.metrics.siteStats.entries()).map(([hostname, stats]) => ({
        hostname,
        ...stats
      })),
      ruleEffectiveness: Array.from(this.metrics.ruleEffectiveness.entries()).map(([ruleName, stats]) => ({
        ruleName,
        ...stats
      })),
      cleaningTimes: [...this.metrics.cleaningTimes]
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      totalCleaned: 0,
      totalErrors: 0,
      siteStats: new Map(),
      ruleEffectiveness: new Map(),
      cleaningTimes: [],
      averageReduction: 0
    };
  }

  /**
   * Log metrics summary to console
   */
  logSummary() {
    const summary = this.getSummary();
    console.log('📊 Content Cleaning Metrics Summary:');
    console.log(`   Total Operations: ${summary.totalOperations}`);
    console.log(`   Success Rate: ${Math.round(summary.successRate)}%`);
    console.log(`   Average Size Reduction: ${summary.averageReduction}%`);
    console.log(`   Average Cleaning Time: ${summary.averageCleaningTime}ms`);
    console.log(`   Unique Sites Processed: ${summary.uniqueSites}`);
    console.log(`   Active Rules: ${summary.activeRules}`);
    
    if (summary.totalOperations > 0) {
      console.log('\n🎯 Most Effective Rules:');
      this.getMostEffectiveRules(3).forEach((rule, index) => {
        console.log(`   ${index + 1}. ${rule.ruleName}: ${Math.round(rule.averageReduction)}% avg reduction (${rule.applications} uses)`);
      });
      
      const problemSites = this.getProblematicSites(3);
      if (problemSites.length > 0) {
        console.log('\n⚠️ Sites Needing Attention:');
        problemSites.forEach((site, index) => {
          console.log(`   ${index + 1}. ${site.hostname}: ${Math.round(site.errorRate)}% error rate, ${Math.round(site.averageReduction)}% reduction`);
        });
      }
    }
  }
}

// Create singleton instance
const metricsInstance = new CleaningMetrics();

// Export functions for easy use
module.exports = {
  trackCleaning: (hostname, stats, time) => metricsInstance.trackCleaning(hostname, stats, time),
  trackError: (hostname, error) => metricsInstance.trackError(hostname, error),
  getSummary: () => metricsInstance.getSummary(),
  getProblematicSites: (limit) => metricsInstance.getProblematicSites(limit),
  getMostEffectiveRules: (limit) => metricsInstance.getMostEffectiveRules(limit),
  getSiteStats: (hostname) => metricsInstance.getSiteStats(hostname),
  exportMetrics: () => metricsInstance.exportMetrics(),
  logSummary: () => metricsInstance.logSummary(),
  reset: () => metricsInstance.reset(),
  
  // Access to the instance for advanced usage
  instance: metricsInstance
};