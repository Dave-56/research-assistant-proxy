/**
 * Post-Processor
 * Cleans content AFTER Readability extraction
 * Final polish and markdown conversion
 */

class PostProcessor {
  constructor() {
    // Configuration for post-processing
    this.options = {
      convertToMarkdown: true,
      preserveTables: true,
      minParagraphLength: 20,
      removeShortParagraphs: false
    };
  }

  /**
   * Process content after Readability extraction
   * @param {string} content - HTML content from Readability
   * @param {string} url - Source URL for context
   * @returns {Object} Post-processing result
   */
  async process(content, url) {
    try {
      let processedContent = content;
      const stats = {
        originalLength: content.length,
        steps: []
      };

      // Step 1: Remove any remaining cruft that Readability missed
      processedContent = this._removeRemainingCruft(processedContent, stats);

      // Step 2: Clean up formatting and structure
      processedContent = this._cleanFormatting(processedContent, stats);

      // Step 3: Convert to markdown if requested
      if (this.options.convertToMarkdown) {
        processedContent = this._convertToMarkdown(processedContent, stats);
      }

      // Step 4: Final cleanup
      processedContent = this._finalCleanup(processedContent, stats);

      return {
        success: true,
        content: processedContent,
        stats: {
          ...stats,
          finalLength: processedContent.length,
          compressionRatio: Math.round((1 - processedContent.length / content.length) * 100)
        }
      };

    } catch (error) {
      console.error('❌ Post-processing failed:', error);
      return {
        success: false,
        content: content, // Return original on failure
        error: error.message
      };
    }
  }

  /**
   * Remove cruft that Readability might have missed
   * @private
   */
  _removeRemainingCruft(content, stats) {
    let cleaned = content;
    
    // Remove any lingering tracking pixels or analytics
    cleaned = cleaned.replace(/<img[^>]*(?:analytics|tracking|pixel)[^>]*>/gi, '');
    
    // Remove empty links
    cleaned = cleaned.replace(/<a[^>]*><\/a>/gi, '');
    
    // Remove links that only contain whitespace
    cleaned = cleaned.replace(/<a[^>]*>\s*<\/a>/gi, '');
    
    // Remove figure captions that are just "Advertisement" or similar
    cleaned = cleaned.replace(/<figcaption[^>]*>(?:Advertisement|Sponsored|Ad)<\/figcaption>/gi, '');
    
    // Remove any divs with only whitespace or punctuation
    cleaned = cleaned.replace(/<div[^>]*>[\s\|\.]*<\/div>/gi, '');
    
    stats.steps.push('Removed remaining cruft');
    return cleaned;
  }

  /**
   * Clean up formatting and structure
   * @private
   */
  _cleanFormatting(content, stats) {
    let cleaned = content;
    
    // Normalize heading structure (ensure h1 is main title, h2 for sections, etc.)
    cleaned = this._normalizeHeadings(cleaned);
    
    // Remove excessive line breaks in paragraphs
    cleaned = cleaned.replace(/<p[^>]*>(\s*<br[^>]*>\s*)+<\/p>/gi, '');
    
    // Clean up nested formatting (like <strong><strong>text</strong></strong>)
    cleaned = cleaned.replace(/<(strong|b)([^>]*)><(strong|b)([^>]*)>/gi, '<$1$2>');
    cleaned = cleaned.replace(/<\/(strong|b)><\/(strong|b)>/gi, '</$1>');
    
    // Same for emphasis
    cleaned = cleaned.replace(/<(em|i)([^>]*)><(em|i)([^>]*)>/gi, '<$1$2>');
    cleaned = cleaned.replace(/<\/(em|i)><\/(em|i)>/gi, '</$1>');
    
    // Remove empty formatting tags
    cleaned = cleaned.replace(/<(strong|b|em|i)[^>]*>\s*<\/\1>/gi, '');
    
    stats.steps.push('Cleaned formatting');
    return cleaned;
  }

  /**
   * Normalize heading hierarchy
   * @private
   */
  _normalizeHeadings(content) {
    // If there's no h1, promote the first h2 to h1
    if (!content.includes('<h1') && content.includes('<h2')) {
      content = content.replace(/<h2([^>]*)>/, '<h1$1>');
      content = content.replace(/<\/h2>/, '</h1>');
    }
    
    return content;
  }

  /**
   * Convert HTML to clean markdown
   * @private
   */
  _convertToMarkdown(content, stats) {
    let markdown = content;
    
    // Convert headings
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
    
    // Convert formatting
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    
    // Convert links
    markdown = markdown.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    
    // Convert lists
    markdown = this._convertLists(markdown);
    
    // Convert tables if preservation is enabled
    if (this.options.preserveTables) {
      markdown = this._convertTables(markdown);
    }
    
    // Convert blockquotes
    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, (match, content) => {
      const lines = content.split('\n');
      return lines.map(line => line.trim() ? `> ${line.trim()}` : '>').join('\n') + '\n\n';
    });
    
    // Convert paragraphs
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    
    // Convert line breaks
    markdown = markdown.replace(/<br[^>]*>/gi, '\n');
    
    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]*>/g, '');
    
    stats.steps.push('Converted to markdown');
    return markdown;
  }

  /**
   * Convert HTML lists to markdown
   * @private
   */
  _convertLists(content) {
    // Convert unordered lists
    content = content.replace(/<ul[^>]*>(.*?)<\/ul>/gi, (match, listContent) => {
      const items = listContent.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
      const markdownItems = items.map(item => {
        const text = item.replace(/<li[^>]*>|<\/li>/gi, '').replace(/<[^>]*>/g, '').trim();
        return `- ${text}`;
      });
      return '\n' + markdownItems.join('\n') + '\n\n';
    });
    
    // Convert ordered lists
    content = content.replace(/<ol[^>]*>(.*?)<\/ol>/gi, (match, listContent) => {
      const items = listContent.match(/<li[^>]*>(.*?)<\/li>/gi) || [];
      const markdownItems = items.map((item, index) => {
        const text = item.replace(/<li[^>]*>|<\/li>/gi, '').replace(/<[^>]*>/g, '').trim();
        return `${index + 1}. ${text}`;
      });
      return '\n' + markdownItems.join('\n') + '\n\n';
    });
    
    return content;
  }

  /**
   * Convert HTML tables to markdown
   * @private
   */
  _convertTables(content) {
    return content.replace(/<table[^>]*>(.*?)<\/table>/gi, (match, tableContent) => {
      const rows = tableContent.match(/<tr[^>]*>(.*?)<\/tr>/gi) || [];
      if (rows.length === 0) return '';
      
      let markdown = '\n\n';
      let maxColumns = 0;
      
      // Process each row
      const processedRows = rows.map(row => {
        const cells = row.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/gi) || [];
        maxColumns = Math.max(maxColumns, cells.length);
        
        return cells.map(cell => {
          return cell.replace(/<t[hd][^>]*>|<\/t[hd]>/gi, '')
                    .replace(/<[^>]*>/g, '')
                    .replace(/\|/g, '\\|')
                    .replace(/\n/g, ' ')
                    .trim();
        });
      });
      
      // Build markdown table
      if (processedRows.length > 0) {
        // Header row
        const headerRow = processedRows[0];
        while (headerRow.length < maxColumns) headerRow.push('');
        markdown += '| ' + headerRow.join(' | ') + ' |\n';
        
        // Separator
        markdown += '|';
        for (let i = 0; i < maxColumns; i++) {
          markdown += ' --- |';
        }
        markdown += '\n';
        
        // Data rows
        for (let i = 1; i < processedRows.length; i++) {
          const row = processedRows[i];
          while (row.length < maxColumns) row.push('');
          markdown += '| ' + row.join(' | ') + ' |\n';
        }
      }
      
      markdown += '\n\n';
      return markdown;
    });
  }

  /**
   * Final cleanup of the processed content
   * @private
   */
  _finalCleanup(content, stats) {
    let cleaned = content;
    
    // Clean up HTML entities
    cleaned = cleaned.replace(/&nbsp;/g, ' ');
    cleaned = cleaned.replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&#39;/g, "'");
    cleaned = cleaned.replace(/&mdash;/g, '—');
    cleaned = cleaned.replace(/&ndash;/g, '–');
    cleaned = cleaned.replace(/&hellip;/g, '...');
    
    // Normalize whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive line breaks
    cleaned = cleaned.replace(/\s+$/gm, ''); // Remove trailing spaces
    cleaned = cleaned.trim();
    
    // Remove very short paragraphs if option is enabled
    if (this.options.removeShortParagraphs) {
      const paragraphs = cleaned.split('\n\n');
      const filteredParagraphs = paragraphs.filter(para => 
        para.trim().length >= this.options.minParagraphLength || 
        para.includes('|') || // Keep tables
        para.match(/^#+\s/) || // Keep headings
        para.match(/^[-\d]+\.?\s/) // Keep lists
      );
      cleaned = filteredParagraphs.join('\n\n');
    }
    
    stats.steps.push('Final cleanup');
    return cleaned;
  }

  /**
   * Update processing options
   * @param {Object} newOptions - New options to merge
   */
  setOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Get current options
   * @returns {Object} Current options
   */
  getOptions() {
    return { ...this.options };
  }
}

module.exports = PostProcessor;