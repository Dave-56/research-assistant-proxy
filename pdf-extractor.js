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
        // pdf-parse options
        pagerender: (pageData) => {
          // Custom page text extraction
          const render_options = {
            normalizeWhitespace: true,
            disableCombineTextItems: false
          };
          
          return pageData.getTextContent(render_options)
            .then(textContent => {
              let text = '';
              
              // Build text from items
              for (let item of textContent.items) {
                text += item.str + ' ';
                
                // Add line break for vertical position changes
                if (item.hasEOL) {
                  text += '\n';
                }
              }
              
              return text;
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
   * Clean extracted PDF text and preserve readable formatting
   * @private
   */
  cleanText(text) {
    if (!text) return '';
    
    console.log('🧹 Cleaning PDF text for better readability...');
    
    let cleaned = text
      // Fix broken words (e.g., "sam e" → "same", "optimis tic" → "optimistic")
      .replace(/\b([a-z]+)\s+([a-z]{1,3})\b/g, (match, word1, word2) => {
        // Only merge if second part is very short (likely a broken word)
        if (word2.length <= 3) {
          return word1 + word2;
        }
        return match;
      })
      
      // Fix punctuation spacing (e.g., "other?I" → "other? I", "minutes," → "minutes, ")
      .replace(/([.!?,:;])([A-Z])/g, '$1 $2')
      .replace(/([.!?])([a-z])/g, '$1 $2')
      
      // Add paragraph breaks before likely new paragraphs (capital after period + space)
      .replace(/(\. )([A-Z][a-z]{3,})/g, '$1\n\n$2')
      
      // Fix missing spaces after periods/commas
      .replace(/([.!?])([a-zA-Z])/g, '$1 $2')
      .replace(/,([a-zA-Z])/g, ', $1')
      
      // Remove excessive whitespace but preserve intentional line breaks
      .replace(/[ \t]+/g, ' ')
      
      // Clean up multiple line breaks
      .replace(/\n{3,}/g, '\n\n')
      
      // Remove page numbers (common patterns)
      .replace(/^\s*\d+\s*$/gm, '')
      .replace(/^Page \d+.*$/gm, '')
      
      // Remove common headers/footers
      .replace(/^.{0,100}©.*$/gm, '') // Copyright lines
      
      // Clean up hyphenation at line breaks
      .replace(/(\w+)-\n(\w+)/g, '$1$2')
      
      // Add space after sentence-ending punctuation if missing
      .replace(/([.!?])([A-Z])/g, '$1 $2')
      
      // Fix common OCR artifacts
      .replace(/\bl\b/g, 'I') // Standalone 'l' is usually 'I'
      .replace(/\b0\b/g, 'O') // Standalone '0' is usually 'O' in text
      
      // Trim and clean up
      .trim();
    
    // Split into paragraphs and clean each one
    const paragraphs = cleaned.split('\n\n').map(para => 
      para.trim().replace(/\s+/g, ' ')
    ).filter(para => para.length > 10); // Remove very short paragraphs
    
    const result = paragraphs.join('\n\n');
    
    console.log(`🧹 Text cleaning complete: ${text.length} → ${result.length} characters`);
    console.log(`📄 Cleaned preview: "${result.substring(0, 200)}..."`);
    
    return result;
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