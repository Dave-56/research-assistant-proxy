/**
 * PDF Content Extractor
 * Handles downloading and extracting text from PDF files
 */

const pdf = require('pdf-parse');

class PDFExtractor {
  constructor() {
    this.maxFileSize = 10 * 1024 * 1024; // 10MB limit
    this.maxPages = 100; // Limit pages for performance
  }

  /**
   * Extract content from a PDF URL
   * @param {string} url - The PDF URL
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extracted content and metadata
   */
  async extractFromURL(url, options = {}) {
    console.log(`📄 Starting PDF extraction from: ${url}`);
    
    try {
      // Step 1: Download PDF
      const pdfBuffer = await this.downloadPDF(url);
      
      // Step 2: Extract content
      const extractedData = await this.extractContent(pdfBuffer, options);
      
      // Step 3: Format response
      return {
        success: true,
        text: extractedData.text,
        preview: this.generatePreview(extractedData.text),
        metadata: {
          pages: extractedData.numpages,
          info: extractedData.info,
          metadata: extractedData.metadata,
          fileSize: pdfBuffer.length,
          extractionMethod: options.partial ? 'partial' : 'full'
        }
      };
      
    } catch (error) {
      console.error(`❌ PDF extraction failed for ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        fallbackText: `PDF Document: ${this.getFilenameFromURL(url)}. Content extraction failed.`
      };
    }
  }

  /**
   * Download PDF from URL
   * @private
   */
  async downloadPDF(url) {
    try {
      console.log(`⬇️ Downloading PDF from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Glance/1.0)'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('pdf')) {
        console.warn(`⚠️ Content-Type is ${contentType}, not PDF`);
      }

      // Check file size
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.maxFileSize) {
        throw new Error(`PDF too large: ${Math.round(contentLength / 1024 / 1024)}MB exceeds ${Math.round(this.maxFileSize / 1024 / 1024)}MB limit`);
      }

      const buffer = await response.arrayBuffer();
      console.log(`✅ Downloaded PDF: ${buffer.byteLength} bytes`);
      
      return Buffer.from(buffer);
      
    } catch (error) {
      console.error(`❌ Failed to download PDF:`, error.message);
      throw error;
    }
  }

  /**
   * Extract text content from PDF buffer
   * @private
   */
  async extractContent(pdfBuffer, options = {}) {
    try {
      console.log(`📋 Extracting content from PDF (${pdfBuffer.length} bytes)`);
      
      // Configure extraction options
      const extractOptions = {
        max: options.maxPages || this.maxPages,
        // pdf-parse options with position-based formatting
        pagerender: (pageData) => {
          const render_options = {
            normalizeWhitespace: false,  // Keep original spacing
            disableCombineTextItems: true  // Get individual items with positioning
          };
          
          return pageData.getTextContent(render_options)
            .then(textContent => {
              // Extract items with positioning data
              const items = textContent.items.map(item => ({
                text: item.str.trim(),
                x: item.transform[4],
                y: item.transform[5],
                width: item.width,
                height: item.height
              })).filter(item => item.text.length > 0);
              
              if (items.length === 0) return '';
              
              // Sort by y-coordinate (top to bottom)
              items.sort((a, b) => b.y - a.y);
              
              let result = '';
              let lastY = null;
              let baselineX = Math.min(...items.map(item => item.x));
              
              for (const item of items) {
                // Detect breaks based on y-coordinate gaps
                if (lastY !== null) {
                  const yGap = lastY - item.y;
                  
                  if (yGap > 25) {  // Large gap = new paragraph
                    result += '\n\n';
                  } else if (yGap > 12) {  // Medium gap = new line
                    result += '\n';
                  } else if (result.length > 0 && !result.endsWith(' ')) {
                    result += ' ';  // Same line, add space if needed
                  }
                }
                
                // Add indentation based on x-coordinate
                if (result.endsWith('\n\n') || result.endsWith('\n')) {
                  const indent = Math.max(0, Math.floor((item.x - baselineX) / 20));
                  result += '  '.repeat(indent);
                }
                
                result += item.text;
                lastY = item.y;
              }
              
              return result;
            });
        }
      };

      // Extract content using pdf-parse
      const data = await pdf(pdfBuffer, extractOptions);
      
      // Clean up extracted text
      const cleanedText = this.cleanText(data.text);
      
      console.log(`✅ Extracted ${cleanedText.length} characters from ${data.numpages} pages`);
      
      // Log preview
      if (cleanedText.length > 0) {
        console.log(`📄 Preview: "${cleanedText.substring(0, 150)}..."`);
      }
      
      return {
        text: cleanedText,
        numpages: data.numpages,
        info: data.info,
        metadata: data.metadata
      };
      
    } catch (error) {
      console.error(`❌ Content extraction error:`, error.message);
      
      // Check if it's a password-protected PDF
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new Error('PDF is password-protected or encrypted');
      }
      
      throw error;
    }
  }

  /**
   * Light cleanup of position-based extracted text
   * @private
   */
  cleanText(text) {
    if (!text) return '';
    
    console.log('🧹 Light cleanup of position-formatted text...');
    
    const cleaned = text
      // Remove excessive line breaks (but preserve paragraph structure)
      .replace(/\n{4,}/g, '\n\n\n')
      
      // Clean up hyphenation at line breaks
      .replace(/(\w+)-\n(\w+)/g, '$1$2')
      
      // Remove standalone page numbers
      .replace(/^\s*\d+\s*$/gm, '')
      .replace(/^Page \d+.*$/gm, '')
      
      // Remove common headers/footers
      .replace(/^.{0,100}©.*$/gm, '')
      
      // Clean up extra spaces within lines
      .replace(/[ \t]{2,}/g, ' ')
      
      // Trim each line
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      
      // Final cleanup
      .trim();
    
    console.log(`🧹 Cleanup complete: ${text.length} → ${cleaned.length} characters`);
    console.log(`📄 Formatted preview: "${cleaned.substring(0, 200)}..."`);
    
    return cleaned;
  }

  /**
   * Generate preview text
   * @private
   */
  generatePreview(text, maxLength = 300) {
    if (!text) return '';
    
    // Get first meaningful paragraph
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 50);
    
    if (paragraphs.length > 0) {
      const preview = paragraphs[0].substring(0, maxLength);
      return preview + (preview.length < paragraphs[0].length ? '...' : '');
    }
    
    // Fallback to simple truncation
    return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
  }

  /**
   * Extract filename from URL
   * @private
   */
  getFilenameFromURL(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return decodeURIComponent(filename) || 'document.pdf';
    } catch {
      return 'document.pdf';
    }
  }

  /**
   * Quick extraction for preview (first few pages only)
   * @param {string} url - The PDF URL
   * @returns {Promise<Object>} Quick preview extraction
   */
  async extractPreview(url) {
    return this.extractFromURL(url, { 
      maxPages: 3,
      partial: true 
    });
  }

  /**
   * Check if URL is a PDF
   * @param {string} url - URL to check
   * @returns {boolean}
   */
  static isPDFURL(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('.pdf') || 
           urlLower.includes('/pdf/') ||
           urlLower.includes('type=pdf') ||
           urlLower.includes('format=pdf');
  }
}

module.exports = PDFExtractor;