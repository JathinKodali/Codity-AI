import OpenAI from 'openai';

export async function summarizeFailure({ error, logs }) {
  if (!process.env.OPENAI_API_KEY) return `No OpenAI key configured; final error: ${String(error).slice(0, 180)}`;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Summarize job failure logs in one concise operator-facing sentence.' },
        { role: 'user', content: `Error: ${error}\nLogs:\n${logs.map((l) => `[${l.level}] ${l.message}`).join('\n')}` }
      ],
      max_tokens: 60
    });
    return response.choices[0]?.message?.content || `Final error: ${error}`;
  } catch (summaryError) {
    return `AI summary failed: ${summaryError.message}; final error: ${String(error).slice(0, 140)}`;
  }
}
