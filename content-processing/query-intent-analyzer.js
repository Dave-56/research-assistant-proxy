// Query Intent Analysis using LLM
// Intelligently determines which articles to include based on user query intent

/**
 * Analyzes user query intent using Claude Haiku to determine which articles to include
 * @param {string} query - The user's search query
 * @param {Array} topMatches - Array of top matching articles with similarity scores
 * @returns {Promise<Array>} Array of articles to include based on intent
 */
async function analyzeQueryIntent(query, topMatches) {
  try {
    console.log(`\n🤖 === LLM INTENT ANALYSIS START ===`);
    console.log(`Query: "${query}"`);
    console.log(`Analyzing ${topMatches.length} potential matches`);
    
    // If only one match or very low scores, skip LLM analysis
    if (topMatches.length === 1 || topMatches[0].similarity < 0.2) {
      console.log(`⚡ Fast path: Only one match or low relevance scores`);
      return [topMatches[0]];
    }
    
    // Build context for LLM with top 5 matches
    const matchContext = topMatches.slice(0, 5).map((match, index) => 
      `${index + 1}. "${match.title}" (relevance: ${(match.similarity * 100).toFixed(1)}%)`
    ).join('\n');
    
    const prompt = `You are a search intent analyzer. You must respond with ONLY valid JSON, no explanations.

Query: "${query}"

Articles:
${matchContext}

Context: User library has bookmarks (saved web pages) and insights (AI analysis).

Rules:
- Broad queries ("my library", "what have I been reading") -> include all numbers
- Specific topics -> include most relevant only
- Library overview requests -> include all numbers

Respond with ONLY this JSON format:
{"include": [1,2,3], "reason": "brief reason"}

JSON:`;

    console.log(`📝 Sending intent analysis request to Claude Haiku...`);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 150,
        temperature: 0, // Deterministic for consistency
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ LLM intent analysis failed:', error);
      
      // Fallback to similarity-based selection
      console.log('⚠️ Falling back to similarity-based selection');
      return fallbackToSimilaritySelection(topMatches);
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text?.trim();
    
    console.log(`📥 LLM response: ${responseText}`);
    
    try {
      // Extract JSON from response text (handle cases where LLM adds extra text)
      let jsonString = responseText;
      
      // Look for JSON object in the response
      const jsonMatch = responseText.match(/\{[^}]*"include"[^}]*\}/);
      if (jsonMatch) {
        jsonString = jsonMatch[0];
        console.log(`🔧 Extracted JSON from response: ${jsonString}`);
      }
      
      const result = JSON.parse(jsonString);
      
      // Validate the response
      if (!result.include || !Array.isArray(result.include)) {
        throw new Error('Invalid response format');
      }
      
      // Map article numbers to actual articles
      const selectedArticles = result.include
        .filter(num => num >= 1 && num <= topMatches.length)
        .map(num => topMatches[num - 1]);
      
      console.log(`✅ LLM selected ${selectedArticles.length} articles: ${result.reason}`);
      console.log(`📌 Selected articles:`, selectedArticles.map(a => a.title));
      console.log(`🤖 === LLM INTENT ANALYSIS END ===\n`);
      
      return selectedArticles.length > 0 ? selectedArticles : [topMatches[0]];
      
    } catch (parseError) {
      console.error('❌ Failed to parse LLM response:', parseError.message);
      return fallbackToSimilaritySelection(topMatches);
    }
    
  } catch (error) {
    console.error('❌ Intent analysis error:', error.message);
    console.log(`🤖 === LLM INTENT ANALYSIS ERROR END ===\n`);
    
    // Fallback to similarity-based selection
    return fallbackToSimilaritySelection(topMatches);
  }
}

/**
 * Fallback to similarity-based selection when LLM analysis fails
 * @param {Array} matches - Array of matches with similarity scores
 * @returns {Array} Selected articles based on similarity threshold
 */
function fallbackToSimilaritySelection(matches) {
  console.log(`⚡ Using similarity-based selection (fallback)`);
  
  const selected = [matches[0]]; // Always include top match
  const topScore = matches[0].similarity;
  
  // Include other articles if they're within 10% of top score
  for (let i = 1; i < matches.length && i < 3; i++) {
    const scoreDiff = topScore - matches[i].similarity;
    if (scoreDiff < 0.1) {
      selected.push(matches[i]);
    } else {
      break;
    }
  }
  
  console.log(`📎 Fallback selected ${selected.length} articles`);
  return selected;
}

/**
 * Quick intent detection for common patterns (can be used for optimization)
 * @param {string} query - The user's query
 * @returns {string} Intent type: 'specific', 'comparison', 'multiple', or 'general'
 */
function quickIntentDetection(query) {
  const queryLower = query.toLowerCase();
  
  // Comparison patterns
  if (/\b(compare|versus|vs\.?|difference|similar|between)\b/.test(queryLower)) {
    return 'comparison';
  }
  
  // Multiple topics patterns
  if (/\b(and|both|as well as|along with|plus)\b/.test(queryLower)) {
    // But not if it's part of a single concept like "research and development"
    const multipleTopics = queryLower.match(/\b(\w+)\s+(and|as well as|along with)\s+(\w+)\b/);
    if (multipleTopics) {
      return 'multiple';
    }
  }
  
  // Specific article patterns
  if (/\b(this|that|the article|specifically about|just|only)\b/.test(queryLower)) {
    return 'specific';
  }
  
  return 'general';
}

module.exports = {
  analyzeQueryIntent,
  quickIntentDetection,
  fallbackToSimilaritySelection
};