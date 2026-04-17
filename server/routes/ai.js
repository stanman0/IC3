const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk').default;
const OpenAI = require('openai');

const client = new Anthropic();
const openai = new OpenAI({
  apiKey: "lm-studio", // LM Studio doesn't require a real token
  baseURL: "http://127.0.0.1:1234/v1",
});

// POST /analyze — SSE streaming endpoint
router.post('/analyze', async (req, res) => {
  const { messages, system, modelType } = req.body;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const useLMStudio = process.env.LLM_PROVIDER === 'lmstudio';
  const lmsModel = process.env.LMS_MODEL || 'google/gemma-4-26b-a4b';

  try {
    if (useLMStudio) {
      const gptMessages = [];
      if (system) {
        gptMessages.push({ role: 'system', content: system });
      }
      if (messages) {
        gptMessages.push(...messages);
      }

      const stream = await openai.chat.completions.create({
        model: lmsModel,
        messages: gptMessages,
        stream: true,
        max_tokens: 4096,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || chunk.choices[0]?.delta?.reasoning_content || "";
        if (content) {
          // Wrap in Anthropic-like format so React parsing doesn't break
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } else {
      // Anthropic fallback (unused if useLMStudio is forced true)
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta &&
          event.delta.text
        ) {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    console.error('AI streaming error:', err);
    res.write(`data: ${JSON.stringify({ error: `AI Error: ${err.message}` })}\n\n`);
    res.end();
  }
});

module.exports = router;
