/**
 * Content Quality Scorer
 * Evaluates the quality of extracted content
 * Helps identify when cleaning needs improvement
 */

class ContentScorer {
  constructor() {
    this.weights = {
      length: 0.2,           // Content length indicates substance
      structure: 0.25,       // Proper heading hierarchy
      readability: 0.25,     // Sentence structure and flow
      uniqueness: 0.15,      // Unique vs repeated content
      formatting: 0.15       // Proper formatting elements
    };
  }

  /**
   * Score content quality on a scale of 0-100
   * @param {string} content - The content to score
   * @returns {Object} Score breakdown and overall score
   */
  scoreContent(content) {
    try {
      const scores = {
        length: this._scoreLengthQuality(content),
        structure: this._scoreStructuralQuality(content),
        readability: this._scoreReadabilityQuality(content),
        uniqueness: this._scoreUniqueness(content),
        formatting: this._scoreFormattingQuality(content)
      };

      // Calculate weighted overall score
      const overallScore = Object.entries(scores).reduce((total, [key, score]) => {
        return total + (score * this.weights[key]);
      }, 0);

      return {
        overall: Math.round(overallScore),
        breakdown: scores,
        indicators: this._getQualityIndicators(content, scores),
        recommendations: this._getRecommendations(scores)
      };

    } catch (error) {
      console.error('❌ Error scoring content:', error);
      return {
        overall: 50, // Default middle score on error
        breakdown: {},
        indicators: {},
        recommendations: ['Error occurred during scoring'],
        error: error.message
      };
    }
  }

  /**
   * Score content length and substance
   * @private
   */
  _scoreLengthQuality(content) {
    const length = content.length;
    const wordCount = content.split(/\s+/).length;
    
    // Too short content is usually not valuable
    if (wordCount < 50) return 10;
    if (wordCount < 100) return 30;
    if (wordCount < 200) return 50;
    if (wordCount < 500) return 70;
    if (wordCount < 1000) return 85;
    if (wordCount < 2000) return 95;
    
    // Very long content might be poorly cleaned
    if (wordCount > 5000) return 80;
    if (wordCount > 10000) return 60;
    
    return 100;
  }

  /**
   * Score structural quality (headings, paragraphs, etc.)
   * @private
   */
  _scoreStructuralQuality(content) {
    let score = 0;
    
    // Check for proper heading structure
    const headings = content.match(/^#+\s+.+$/gm) || [];
    if (headings.length > 0) {
      score += 30;
      
      // Bonus for hierarchical heading structure
      const h1Count = (content.match(/^#\s+/gm) || []).length;
      const h2Count = (content.match(/^##\s+/gm) || []).length;
      const h3Count = (content.match(/^###\s+/gm) || []).length;
      
      if (h1Count === 1 && h2Count > 0) score += 20; // Good hierarchy
      if (h3Count > 0 && h2Count > 0) score += 10; // Deep structure
    }
    
    // Check for proper paragraph structure
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 20);
    if (paragraphs.length >= 3) {
      score += 25;
      
      // Bonus for varied paragraph lengths (indicates natural writing)
      const lengths = paragraphs.map(p => p.length);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
      
      if (variance > 1000) score += 15; // Good variety in paragraph lengths
    }
    
    // Check for lists (indicates structured content)
    const lists = content.match(/^[-\*\+]\s+/gm) || content.match(/^\d+\.\s+/gm) || [];
    if (lists.length > 0) score += 10;
    
    return Math.min(score, 100);
  }

  /**
   * Score readability and natural language flow
   * @private
   */
  _scoreReadabilityQuality(content) {
    let score = 0;
    
    // Remove markdown formatting for analysis
    const plainText = content.replace(/[#\*\[\]`]/g, '').replace(/\n+/g, ' ').trim();
    
    if (!plainText) return 0;
    
    // Check sentence structure
    const sentences = plainText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= 5) {
      score += 30;
      
      // Average sentence length (sweet spot is 15-25 words)
      const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
      if (avgSentenceLength >= 10 && avgSentenceLength <= 30) score += 20;
      if (avgSentenceLength >= 15 && avgSentenceLength <= 25) score += 10; // Bonus for ideal range
    }
    
    // Check for proper punctuation distribution
    const punctuationCount = (plainText.match(/[.!?;:,]/g) || []).length;
    const wordCount = plainText.split(/\s+/).length;
    const punctuationRatio = punctuationCount / wordCount;
    
    if (punctuationRatio >= 0.05 && punctuationRatio <= 0.2) score += 20; // Good punctuation density
    
    // Check for variety in sentence starters (indicates natural writing)
    const sentenceStarters = sentences.map(s => s.trim().split(' ')[0].toLowerCase());
    const uniqueStarters = new Set(sentenceStarters);
    const starterVariety = uniqueStarters.size / sentences.length;
    
    if (starterVariety > 0.7) score += 15; // Good variety
    if (starterVariety > 0.8) score += 10; // Excellent variety
    
    // Penalize repetitive content patterns
    const words = plainText.toLowerCase().split(/\s+/);
    const wordFreq = {};
    words.forEach(word => {
      if (word.length > 3) { // Only check meaningful words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    
    const repeatedWords = Object.values(wordFreq).filter(count => count > 5);
    if (repeatedWords.length > 3) score -= 10; // Penalize repetitive content
    
    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Score content uniqueness (detect repeated sections)
   * @private
   */
  _scoreUniqueness(content) {
    let score = 100;
    
    // Split into chunks and look for repetition
    const chunks = content.split('\n\n').filter(chunk => chunk.trim().length > 30);
    
    if (chunks.length < 2) return score;
    
    const chunkSet = new Set();
    let duplicates = 0;
    
    chunks.forEach(chunk => {
      const normalized = chunk.toLowerCase().replace(/\s+/g, ' ').trim();
      if (chunkSet.has(normalized)) {
        duplicates++;
      } else {
        chunkSet.add(normalized);
      }
    });
    
    // Penalize duplicates
    const duplicateRatio = duplicates / chunks.length;
    score -= duplicateRatio * 50;
    
    // Look for repeated phrases (like navigation items that slipped through)
    const sentences = content.split(/[.!?]+/);
    const shortSentences = sentences.filter(s => s.trim().length < 50 && s.trim().length > 5);
    const shortSentenceSet = new Set();
    let shortDuplicates = 0;
    
    shortSentences.forEach(sentence => {
      const normalized = sentence.toLowerCase().trim();
      if (shortSentenceSet.has(normalized)) {
        shortDuplicates++;
      } else {
        shortSentenceSet.add(normalized);
      }
    });
    
    if (shortDuplicates > 2) score -= 20; // Penalty for repeated short phrases
    
    return Math.max(0, score);
  }

  /**
   * Score formatting quality
   * @private
   */
  _scoreFormattingQuality(content) {
    let score = 0;
    
    // Check for proper markdown formatting
    const hasHeadings = /^#+\s+/m.test(content);
    const hasBold = /\*\*[^*]+\*\*/.test(content);
    const hasItalic = /\*[^*]+\*/.test(content);
    const hasLinks = /\[[^\]]+\]\([^)]+\)/.test(content);
    const hasLists = /^[-*+]\s+/m.test(content) || /^\d+\.\s+/m.test(content);
    const hasTables = /\|.*\|/.test(content);
    
    if (hasHeadings) score += 25;
    if (hasBold) score += 15;
    if (hasItalic) score += 10;
    if (hasLinks) score += 20;
    if (hasLists) score += 15;
    if (hasTables) score += 15;
    
    // Check for proper spacing and line breaks
    const properParagraphs = content.split('\n\n').length > 1;
    if (properParagraphs) score += 10;
    
    // Penalize excessive formatting (might indicate poor cleaning)
    const formattingDensity = (content.match(/[*#`\[\]]/g) || []).length / content.length;
    if (formattingDensity > 0.1) score -= 20; // Too much formatting
    
    return Math.min(score, 100);
  }

  /**
   * Get quality indicators for debugging
   * @private
   */
  _getQualityIndicators(content, scores) {
    const wordCount = content.split(/\s+/).length;
    const paragraphCount = content.split('\n\n').filter(p => p.trim().length > 20).length;
    const headingCount = (content.match(/^#+\s+/gm) || []).length;
    const linkCount = (content.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    const listItemCount = (content.match(/^[-*+\d]+\.?\s+/gm) || []).length;
    
    return {
      wordCount,
      paragraphCount,
      headingCount,
      linkCount,
      listItemCount,
      averageParagraphLength: paragraphCount > 0 ? Math.round(wordCount / paragraphCount) : 0,
      formattingRatio: Math.round((content.match(/[*#`\[\]]/g) || []).length / content.length * 1000) / 10
    };
  }

  /**
   * Get recommendations based on scores
   * @private
   */
  _getRecommendations(scores) {
    const recommendations = [];
    
    if (scores.length < 50) {
      recommendations.push('Content may be too short or poorly extracted');
    }
    
    if (scores.structure < 50) {
      recommendations.push('Improve heading structure and paragraph organization');
    }
    
    if (scores.readability < 50) {
      recommendations.push('Content may contain navigation elements or poor sentence structure');
    }
    
    if (scores.uniqueness < 50) {
      recommendations.push('Detected repeated content - cleaning rules may need improvement');
    }
    
    if (scores.formatting < 50) {
      recommendations.push('Formatting could be improved or contains residual HTML');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Content quality looks good!');
    }
    
    return recommendations;
  }

  /**
   * Update scoring weights
   * @param {Object} newWeights - New weight values
   */
  setWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * Get current weights
   * @returns {Object} Current weight configuration
   */
  getWeights() {
    return { ...this.weights };
  }
}

module.exports = ContentScorer;