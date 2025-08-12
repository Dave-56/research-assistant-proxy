// Conversation Context Classification using LLM
// Determines whether a follow-up question is about current page or should search saved content

/**
 * Classifies conversation context using Claude Haiku to determine routing strategy
 * @param {string} userMessage - The user's current message
 * @param {Array} conversationHistory - Recent conversation history
 * @param {Object} currentPageContext - Current page title and content preview
 * @returns {Promise<Object>} Classification result with routing decision
 */
async function classifyConversationContext(userMessage, conversationHistory = [], currentPageContext = null, openTabs = [], referencedTabs = null) {
  try {
    // Ensure arrays are always arrays (handle null/undefined)
    referencedTabs = referencedTabs || [];
    openTabs = openTabs || [];
    conversationHistory = conversationHistory || [];
    
    console.log(`\n🧠 === CONVERSATION CLASSIFICATION START ===`);
    console.log(`Message: "${userMessage}"`);
    console.log(`Conversation history: ${conversationHistory.length} messages`);
    console.log(`Current page: ${currentPageContext?.title || 'None'}`);
    console.log(`Open tabs: ${openTabs.length} tabs`);
    console.log(`Referenced tabs: ${referencedTabs.length} tabs`);
    
    // Build conversation context for LLM with page context
    const recentHistory = conversationHistory
      .slice(-4) // Last 4 messages for context
      .map(msg => {
        // Include page title and content snippet for better context
        let pageInfo = '';
        if (msg.pageContext) {
          const pageSnippet = msg.pageContext.content ? 
            `\n  [Page snippet: ${msg.pageContext.content.substring(0, 500).replace(/\n/g, ' ')}...]` : '';
          pageInfo = ` [on page: "${msg.pageContext.title}"]${pageSnippet}`;
        }
        // Increase message content from 150 to 300 chars for better context
        return `${msg.sender}${pageInfo}: ${msg.content.substring(0, 300)}`;
      })
      .join('\n\n'); // Double newline for better readability
    
    const currentPageInfo = currentPageContext ? 
      `Current Page: "${currentPageContext.title}"
Preview: ${(currentPageContext.content || '').substring(0, 500)}...` : 
      'Current Page: None';
      
    // Build open tabs context
    const openTabsInfo = openTabs.length > 0 ? 
      `Open Tabs: ${openTabs.map(tab => `"${tab.title}"${tab.isCurrent ? ' (current)' : ''}`).join(', ')}` :
      'Open Tabs: None';
      
    // Build referenced tabs context
    const referencedTabsInfo = referencedTabs.length > 0 ?
      `Referenced Tabs: ${referencedTabs.map(tab => `"${tab.title}"`).join(', ')}` :
      'Referenced Tabs: None';

    const prompt = `You are a tab-aware conversation classifier. Analyze this conversation to determine which tab/page the user is asking about.

${currentPageInfo}

${openTabsInfo}

${referencedTabsInfo}

Recent Conversation (with page context):
${recentHistory}

Current User Message: "${userMessage}"

Task: Determine the user's intent and which content they want:
1. CURRENT_PAGE - About the current active tab/page
2. PREVIOUS_PAGE - About a different tab they discussed earlier
3. LIBRARY_SEARCH - Search through their saved content library  
4. GENERAL_CHAT - General conversation

CRITICAL TAB CONTEXT ANALYSIS:
- EXAMINE PAGE SNIPPETS: Look at the actual content in [Page snippet:...] to understand what each page is about
- If user asks about a topic that matches content from a PREVIOUS page snippet → PREVIOUS_PAGE
- If user says "tell me more" or asks follow-up about content in conversation history → check which page that content came from
- If conversation history shows discussion about Page A, but current page is Page B → follow-ups likely about Page A (PREVIOUS_PAGE)
- Only classify as CURRENT_PAGE if the question clearly relates to the current page's content/title

CONTENT MATCHING LOGIC:
- Does the current page content contain information about what the user is asking? 
- Does a previous page snippet contain that information?
- Match the user's question to the actual page content, not just page titles

Examples:
User on "Glance" page (about AI web tools), previously discussed "OpenAI Models" (contains model performance data):
- "Tell me more about model performance" → PREVIOUS_PAGE (OpenAI page has performance data, Glance page doesn't)
- "How does this AI tool work?" → CURRENT_PAGE (Glance page is about AI tools)
- "What were the MMLU scores?" → PREVIOUS_PAGE (performance metrics are on OpenAI page)

Other examples:
- "Summarize the YouTube video" (YouTube tab open) → identify target tab
- "What did that article say?" → PREVIOUS_PAGE (from conversation history)
- "Find my notes on AI" → LIBRARY_SEARCH
- "How's the weather?" → GENERAL_CHAT

You must respond with ONLY a valid JSON object:
{
  "classification": "CURRENT_PAGE|PREVIOUS_PAGE|LIBRARY_SEARCH|GENERAL_CHAT",
  "confidence": 0.0-1.0,
  "reason": "brief explanation (max 15 words)",
  "targetTab": "exact tab title if PREVIOUS_PAGE, null otherwise",
  "isMetaConversation": true/false,
  "metaContext": "if asking about AI's previous response"
}`;

    console.log(`📝 Sending classification request to Claude Haiku...`);
    console.log(`🔍 DEBUG: Full prompt being sent to LLM:\n${prompt.substring(0, 1500)}...`);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        temperature: 0, // Deterministic for consistency
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ LLM classification failed:', error);
      return fallbackClassification(userMessage, conversationHistory, currentPageContext);
    }

    const data = await response.json();
    let responseText = data.content?.[0]?.text?.trim();
    
    console.log(`📥 LLM classification response: ${responseText}`);
    
    try {
      // Try to extract JSON if there's extra text
      // Look for the first { and last } to extract just the JSON part
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        responseText = responseText.substring(jsonStart, jsonEnd + 1);
      }
      
      const result = JSON.parse(responseText);
      
      // Validate the response
      if (!result.classification || !['CURRENT_PAGE', 'PREVIOUS_PAGE', 'LIBRARY_SEARCH', 'GENERAL_CHAT'].includes(result.classification)) {
        throw new Error('Invalid classification response');
      }
      
      const targetTabInfo = result.targetTab ? ` → ${result.targetTab}` : '';
      const metaInfo = result.isMetaConversation ? ` [META: ${result.metaContext}]` : '';
      console.log(`✅ Classified as: ${result.classification}${targetTabInfo} (confidence: ${result.confidence}, reason: ${result.reason})${metaInfo}`);
      console.log(`🧠 === CONVERSATION CLASSIFICATION END ===\n`);
      
      return {
        classification: result.classification,
        confidence: result.confidence || 0.5,
        reason: result.reason || 'LLM classification',
        targetTab: result.targetTab || null,
        isMetaConversation: result.isMetaConversation || false,
        metaContext: result.metaContext || null,
        method: 'llm'
      };
      
    } catch (parseError) {
      console.error('❌ Failed to parse LLM classification response:', parseError.message);
      return fallbackClassification(userMessage, conversationHistory, currentPageContext);
    }
    
  } catch (error) {
    console.error('❌ Classification error:', error.message);
    console.log(`🧠 === CONVERSATION CLASSIFICATION ERROR END ===\n`);
    
    return fallbackClassification(userMessage, conversationHistory, currentPageContext);
  }
}

/**
 * Fallback classification using heuristics when LLM fails
 * @param {string} userMessage - The user's message
 * @param {Array} conversationHistory - Conversation history
 * @param {Object} currentPageContext - Current page context
 * @returns {Object} Fallback classification result
 */
function fallbackClassification(userMessage, conversationHistory, currentPageContext) {
  console.log(`⚡ Using heuristic-based classification (fallback)`);
  
  const messageLower = userMessage.toLowerCase();
  
  // Strong library search signals
  const librarySignals = [
    'find in my', 'search my', 'look up', 'what did i save',
    'from my notes', 'in my library', 'my saved content',
    'find something about', 'search for', 'look for'
  ];
  
  // Strong current page signals  
  const currentPageSignals = [
    'this page', 'this article', 'this content', 'what you just',
    'the summary', 'you mentioned', 'you said', 'tell me more',
    'elaborate', 'explain this', 'about this'
  ];
  
  // Check for explicit library search intent
  if (librarySignals.some(signal => messageLower.includes(signal))) {
    return {
      classification: 'LIBRARY_SEARCH',
      confidence: 0.8,
      reason: 'explicit search language detected',
      method: 'fallback'
    };
  }
  
  // Check for explicit current page references
  if (currentPageSignals.some(signal => messageLower.includes(signal))) {
    return {
      classification: 'CURRENT_PAGE',
      confidence: 0.8,
      reason: 'direct page reference detected',
      method: 'fallback'
    };
  }
  
  // Context-based classification
  if (conversationHistory.length > 0 && currentPageContext) {
    // If we have ongoing conversation and current page, likely continuing discussion
    return {
      classification: 'CURRENT_PAGE',
      confidence: 0.6,
      reason: 'ongoing conversation with page context',
      method: 'fallback'
    };
  }
  
  if (conversationHistory.length === 0) {
    // First message without current page context - likely general chat
    return {
      classification: 'GENERAL_CHAT',
      confidence: 0.7,
      reason: 'first message without page context',
      method: 'fallback'
    };
  }
  
  // Default to current page if we have context, otherwise general chat
  return {
    classification: currentPageContext ? 'CURRENT_PAGE' : 'GENERAL_CHAT',
    confidence: 0.5,
    reason: 'default based on page context availability',
    method: 'fallback'
  };
}

/**
 * Quick classification check for obvious cases (optimization)
 * @param {string} userMessage - The user's message
 * @returns {Object|null} Quick classification result or null if needs full analysis
 */
function quickClassificationCheck(userMessage) {
  const messageLower = userMessage.toLowerCase();
  
  // Very obvious library search
  if (messageLower.includes('search my') || messageLower.includes('find in my')) {
    return {
      classification: 'LIBRARY_SEARCH',
      confidence: 0.9,
      reason: 'explicit search command',
      method: 'quick'
    };
  }
  
  // Very obvious current page reference
  if (messageLower.includes('this page') || messageLower.includes('this article')) {
    return {
      classification: 'CURRENT_PAGE',
      confidence: 0.9,
      reason: 'explicit page reference',
      method: 'quick'
    };
  }
  
  return null; // Needs full LLM analysis
}

module.exports = {
  classifyConversationContext,
  quickClassificationCheck,
  fallbackClassification
};