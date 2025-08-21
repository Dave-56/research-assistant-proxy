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
        // pdf-parse options - simple text extraction
        pagerender: (pageData) => {
          const render_options = {
            normalizeWhitespace: true,
            disableCombineTextItems: false
          };
          
          return pageData.getTextContent(render_options)
            .then(textContent => {
              let text = '';
              
              // Simple text extraction - let LLM handle formatting
              for (let item of textContent.items) {
                text += item.str + ' ';
                
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
      
      // Clean up extracted text using Claude AI
      const cleanedText = await this.cleanText(data.text);
      
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
   * Clean extracted PDF text using Claude AI for intelligent formatting
   * @private
   */
  async cleanText(text) {
    if (!text) return '';
    
    // Basic cleanup first
    const basicCleaned = text
      .replace(/(\w+)-\n(\w+)/g, '$1$2')  // Fix hyphenation
      .replace(/^\s*\d+\s*$/gm, '')       // Remove page numbers
      .replace(/^Page \d+.*$/gm, '')      // Remove page headers
      .replace(/[ \t]{2,}/g, ' ')         // Clean extra spaces
      .trim();

    console.log('🧹 Basic cleanup complete, sending to Claude for formatting...');
    console.log('📊 Input text stats:', {
      length: basicCleaned.length,
      lines: basicCleaned.split('\n').length,
      preview: basicCleaned.substring(0, 200) + '...',
      lastPart: '...' + basicCleaned.substring(basicCleaned.length - 200)
    });

    // Use Claude for intelligent formatting with new approach
    try {
      const prompt = `You are a text formatter. Your job is to add paragraph breaks to this text that was extracted from a PDF. The text is currently all run together but should have proper paragraph breaks.

RULES:
1. Output EVERY SINGLE WORD from the input - do not remove, summarize, or skip anything
2. Only add paragraph breaks (\\n\\n) where natural breaks should occur
3. Do not change any words or content
4. Do not add any commentary like "Text continues..." or similar
5. If you see repetitive content, output ALL of it - do not summarize

INPUT TEXT:
${basicCleaned}

FORMATTED OUTPUT:`;

      // Smart token calculation based on input size
      const inputTokens = Math.ceil(basicCleaned.length / 4); // Rough estimate: 4 chars = 1 token
      const maxTokens = Math.min(
        100000, // Claude Haiku's max context
        Math.max(8000, inputTokens * 1.3) // Input size + 30% buffer for formatting
      );

      console.log(`🧮 Token calculation: input ~${inputTokens} tokens, setting max_tokens to ${maxTokens}`);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const cleanedText = data.content[0].text.trim();
      
      console.log(`🤖 Claude formatting complete: ${basicCleaned.length} → ${cleanedText.length} characters`);
      console.log(`📄 Claude output preview: "${cleanedText.substring(0, 200)}..."`);
      console.log(`📄 Claude output ending: "...${cleanedText.substring(cleanedText.length - 200)}"`);
      console.log('📊 Output stats:', {
        inputLength: basicCleaned.length,
        outputLength: cleanedText.length,
        compressionRatio: (cleanedText.length / basicCleaned.length * 100).toFixed(1) + '%',
        linesAdded: cleanedText.split('\n').length - basicCleaned.split('\n').length
      });
      
      return cleanedText;

    } catch (error) {
      console.error('❌ Claude formatting failed:', error.message);
      console.log('🔄 Falling back to basic cleanup');
      
      // Fallback to basic cleanup if Claude fails
      const fallback = basicCleaned
        .replace(/\n{3,}/g, '\n\n')
        .split('\n\n')
        .map(para => para.trim().replace(/\s+/g, ' '))
        .filter(para => para.length > 10)
        .join('\n\n');
      
      console.log(`🧹 Fallback cleanup complete: ${text.length} → ${fallback.length} characters`);
      return fallback;
    }
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